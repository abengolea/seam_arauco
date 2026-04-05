"use server";

import { failure, success, type ActionResult } from "@/lib/actions/action-result";
import { AppError, isAppError } from "@/lib/errors/app-error";
import { requireRole, verifyIdTokenOrThrow } from "@/lib/auth/verify-id-token";
import { assertUserCanAct } from "@/modules/users/service";
import { runGenerateWorkReport } from "@/lib/ai/flows/generate-work-report";
import { z } from "zod";

const rolesWrite = ["tecnico", "supervisor", "admin"] as const;

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

const draftSchema = z.object({
  keywords: z.string().min(1).max(8_000),
  fieldType: z.enum(["trabajo_realizado", "observaciones"]),
  assetLabel: z.string().min(1).max(500),
  otN: z.string().min(1).max(64),
});

/** Borrador de texto con Genkit (requiere API key de Google GenAI en el servidor). */
export async function actionGenerateWorkReportDraft(
  idToken: string,
  input: z.infer<typeof draftSchema>,
): Promise<ActionResult<{ text: string }>> {
  return wrap(async () => {
    const session = await verifyIdTokenOrThrow(idToken);
    requireRole(session, rolesWrite);
    await assertUserCanAct(session.uid, [...rolesWrite]);
    const parsed = draftSchema.parse(input);
    const out = await runGenerateWorkReport(parsed);
    return { text: out.generatedText };
  });
}
