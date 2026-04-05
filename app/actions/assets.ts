"use server";

import { failure, success, type ActionResult } from "@/lib/actions/action-result";
import { AppError, isAppError } from "@/lib/errors/app-error";
import { requireRole, verifyIdTokenOrThrow } from "@/lib/auth/verify-id-token";
import {
  commitAssetsImportRows,
  parseAssetsWorkbook,
  readAssetsWorkbookFromBuffer,
} from "@/modules/assets/excel-import";
import { assertUserCanAct } from "@/modules/users/service";
import { z } from "zod";

const rolesImport = ["admin"] as const;

const MAX_BYTES = 6 * 1024 * 1024;

const importExcelSchema = z.object({
  fileBase64: z.string().min(32, "Archivo vacío o inválido"),
  /** Centro / planta por defecto (sector); columnas Centro o Planta en el Excel lo sobrescriben por fila. */
  sectorCentro: z.string().trim().min(1, "Indicá el centro o planta").max(120),
});

function wrap<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  return fn()
    .then((data) => success(data))
    .catch((e: unknown) => {
      if (isAppError(e)) return Promise.resolve(failure(e));
      const err = new AppError("INTERNAL", e instanceof Error ? e.message : "Error interno", {
        cause: e,
      });
      return Promise.resolve(failure(err));
    });
}

export type ImportAssetsExcelResult = {
  imported: number;
  warnings: string[];
};

/**
 * Importación masiva de activos desde .xlsx (mismo formato que el script CLI).
 * Solo rol `admin` (superadmin bootstrap en esta app).
 */
export async function actionImportAssetsExcel(
  idToken: string,
  raw: z.infer<typeof importExcelSchema>,
): Promise<ActionResult<ImportAssetsExcelResult>> {
  return wrap(async () => {
    const session = await verifyIdTokenOrThrow(idToken);
    requireRole(session, rolesImport);
    await assertUserCanAct(session.uid, rolesImport);

    const input = importExcelSchema.parse(raw);

    let buffer: Buffer;
    try {
      buffer = Buffer.from(input.fileBase64, "base64");
    } catch {
      throw new AppError("VALIDATION", "No se pudo leer el archivo (Base64 inválido)");
    }

    if (buffer.length > MAX_BYTES) {
      throw new AppError("VALIDATION", `El archivo supera el máximo de ${MAX_BYTES / 1024 / 1024} MB`, {
        details: { maxMb: MAX_BYTES / 1024 / 1024 },
      });
    }

    const workbook = readAssetsWorkbookFromBuffer(buffer);
    const { rows, warnings } = parseAssetsWorkbook(workbook, input.sectorCentro.trim());

    if (!rows.length) {
      return { imported: 0, warnings };
    }

    await commitAssetsImportRows(rows);
    return { imported: rows.length, warnings };
  });
}
