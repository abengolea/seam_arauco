"use server";

import { failure, success, type ActionResult } from "@/lib/actions/action-result";
import { AppError, isAppError } from "@/lib/errors/app-error";
import { requireRole, verifyIdTokenOrThrow } from "@/lib/auth/verify-id-token";
import { assertUserCanAct } from "@/modules/users/service";
import type { FirmaDigital } from "@/modules/work-orders/types";
import {
  addMaterialOtField,
  addMaterialToWorkOrder,
  applyWorkOrderVistaStatus,
  assignTechnician,
  closeWorkOrder as closeWorkOrderListaParaCierre,
  closeWorkOrderWithPadSignatures,
  createWorkOrderFromAviso,
  createWorkOrderFromForm,
  registerEvidenceAfterUpload,
  signTechnician,
  signUsuarioPlanta,
  startExecution,
  updateChecklistItemService,
  updateWorkOrderInformeText,
} from "@/modules/work-orders/service";
import type { WorkOrderVistaStatus } from "@/modules/work-orders/types";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";

const rolesWrite = ["tecnico", "supervisor", "admin"] as const;
const rolesClose = ["supervisor", "admin"] as const;

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

const materialLineSchema = z.object({
  material_id: z.string(),
  codigo_material: z.string(),
  descripcion_snapshot: z.string(),
  unidad_medida: z.string(),
  cantidad_solicitada: z.number(),
  cantidad_consumida: z.number(),
  lote: z.string().optional(),
  observacion: z.string().optional(),
  registrado_por_uid: z.string(),
});

const evidenciaSchema = z.object({
  storage_path: z.string(),
  download_url: z.string().url(),
  content_type: z.string(),
  tamano_bytes: z.number(),
  descripcion: z.string().optional(),
  subido_por_uid: z.string(),
});

const firmaSchema = z.object({
  signer_user_id: z.string(),
  signer_display_name: z.string(),
  signer_capacity: z.enum(["TECNICO", "USUARIO_PLANTA", "SUPERVISOR"]),
  image_data_url_base64: z.string().min(100),
});

export async function actionCreateWorkOrderFromAviso(
  idToken: string,
  input: { avisoId: string },
): Promise<ActionResult<string>> {
  return wrap(async () => {
    const session = await verifyIdTokenOrThrow(idToken);
    requireRole(session, ["supervisor", "admin"]);
    await assertUserCanAct(session.uid, ["supervisor", "admin"]);
    return createWorkOrderFromAviso({ avisoId: input.avisoId, actorUid: session.uid });
  });
}

export async function actionAssignTechnician(
  idToken: string,
  input: { workOrderId: string; tecnicoUid: string; tecnicoNombre: string },
): Promise<ActionResult<void>> {
  return wrap(async () => {
    const session = await verifyIdTokenOrThrow(idToken);
    requireRole(session, ["supervisor", "admin"]);
    await assertUserCanAct(session.uid, ["supervisor", "admin"]);
    await assignTechnician({
      workOrderId: input.workOrderId,
      tecnicoUid: input.tecnicoUid,
      tecnicoNombre: input.tecnicoNombre,
      actorUid: session.uid,
    });
  });
}

export async function actionStartExecution(
  idToken: string,
  input: { workOrderId: string },
): Promise<ActionResult<void>> {
  return wrap(async () => {
    const session = await verifyIdTokenOrThrow(idToken);
    requireRole(session, rolesWrite);
    await assertUserCanAct(session.uid, [...rolesWrite]);
    await startExecution({ workOrderId: input.workOrderId, actorUid: session.uid });
  });
}

export async function actionAddMaterial(
  idToken: string,
  input: { workOrderId: string; line: z.infer<typeof materialLineSchema> },
): Promise<ActionResult<string>> {
  return wrap(async () => {
    const session = await verifyIdTokenOrThrow(idToken);
    requireRole(session, rolesWrite);
    await assertUserCanAct(session.uid, [...rolesWrite]);
    const line = materialLineSchema.parse(input.line);
    if (line.registrado_por_uid !== session.uid) {
      throw new AppError("FORBIDDEN", "registrado_por_uid debe coincidir con la sesión");
    }
    return addMaterialToWorkOrder({
      workOrderId: input.workOrderId,
      line,
      actorUid: session.uid,
    });
  });
}

export async function actionRegisterEvidence(
  idToken: string,
  input: { workOrderId: string; meta: z.infer<typeof evidenciaSchema> },
): Promise<ActionResult<string>> {
  return wrap(async () => {
    const session = await verifyIdTokenOrThrow(idToken);
    requireRole(session, rolesWrite);
    await assertUserCanAct(session.uid, [...rolesWrite]);
    const meta = evidenciaSchema.parse(input.meta);
    if (meta.subido_por_uid !== session.uid) {
      throw new AppError("FORBIDDEN", "subido_por_uid debe coincidir con la sesión");
    }
    return registerEvidenceAfterUpload({
      workOrderId: input.workOrderId,
      meta,
      actorUid: session.uid,
    });
  });
}

function toFirmaDigital(parsed: z.infer<typeof firmaSchema>): FirmaDigital {
  return {
    ...parsed,
    signed_at: Timestamp.now() as unknown as FirmaDigital["signed_at"],
  };
}

export async function actionSignTechnician(
  idToken: string,
  input: { workOrderId: string; firma: z.infer<typeof firmaSchema> },
): Promise<ActionResult<void>> {
  return wrap(async () => {
    const session = await verifyIdTokenOrThrow(idToken);
    requireRole(session, rolesWrite);
    await assertUserCanAct(session.uid, [...rolesWrite]);
    const firma = toFirmaDigital(firmaSchema.parse(input.firma));
    await signTechnician({ workOrderId: input.workOrderId, firma, actorUid: session.uid });
  });
}

export async function actionSignUsuario(
  idToken: string,
  input: { workOrderId: string; firma: z.infer<typeof firmaSchema> },
): Promise<ActionResult<void>> {
  return wrap(async () => {
    const session = await verifyIdTokenOrThrow(idToken);
    requireRole(session, rolesWrite);
    await assertUserCanAct(session.uid, [...rolesWrite]);
    const firma = toFirmaDigital(firmaSchema.parse(input.firma));
    await signUsuarioPlanta({ workOrderId: input.workOrderId, firma, actorUid: session.uid });
  });
}

export async function actionCloseWorkOrder(
  idToken: string,
  input: { workOrderId: string; motivo?: string },
): Promise<ActionResult<void>> {
  return wrap(async () => {
    const session = await verifyIdTokenOrThrow(idToken);
    requireRole(session, rolesClose);
    await assertUserCanAct(session.uid, [...rolesClose]);
    await closeWorkOrderListaParaCierre({
      workOrderId: input.workOrderId,
      actorUid: session.uid,
      motivo: input.motivo,
    });
  });
}

const createWorkOrderSchema = z.object({
  centro: z.string().min(1),
  asset_id: z.string().min(1),
  especialidad: z.enum(["AA", "ELECTRICO", "GG", "HG"]),
  sub_tipo: z.enum(["preventivo", "correctivo", "checklist"]),
  texto_trabajo: z.string().min(1).max(24_000),
  aviso_id: z.string().optional(),
  aviso_numero: z.string().optional(),
  fecha_inicio_programada: z.string().optional().nullable(),
  tecnico_asignado_uid: z.string().optional(),
  tecnico_asignado_nombre: z.string().optional(),
  frecuencia_plan_mtsa: z.enum(["M", "T", "S", "A"]).optional(),
  ubicacion_tecnica: z.string().optional(),
  denom_ubic_tecnica: z.string().optional(),
});

export async function createWorkOrder(
  idToken: string,
  input: z.infer<typeof createWorkOrderSchema>,
): Promise<ActionResult<{ id: string }>> {
  return wrap(async () => {
    const session = await verifyIdTokenOrThrow(idToken);
    requireRole(session, ["supervisor", "admin"]);
    await assertUserCanAct(session.uid, ["supervisor", "admin"]);
    const parsed = createWorkOrderSchema.parse(input);
    const fechaStr =
      parsed.fecha_inicio_programada != null && String(parsed.fecha_inicio_programada).trim().length
        ? String(parsed.fecha_inicio_programada).trim()
        : "";
    const fecha = fechaStr.length ? Timestamp.fromDate(new Date(fechaStr)) : undefined;
    const id = await createWorkOrderFromForm({
      actorUid: session.uid,
      centro: parsed.centro,
      asset_id: parsed.asset_id,
      especialidad: parsed.especialidad,
      sub_tipo: parsed.sub_tipo,
      texto_trabajo: parsed.texto_trabajo,
      aviso_id: parsed.aviso_id,
      aviso_numero: parsed.aviso_numero,
      fecha_inicio_programada: fecha,
      tecnico_asignado_uid: parsed.tecnico_asignado_uid,
      tecnico_asignado_nombre: parsed.tecnico_asignado_nombre,
      frecuencia_plan_mtsa: parsed.frecuencia_plan_mtsa,
      ubicacion_tecnica: parsed.ubicacion_tecnica,
      denom_ubic_tecnica: parsed.denom_ubic_tecnica,
    });
    return { id };
  });
}

const updateStatusSchema = z.object({
  workOrderId: z.string(),
  status: z.enum(["PENDIENTE", "EN_CURSO", "COMPLETADA", "CANCELADA"]),
});

export async function updateWorkOrderStatus(
  idToken: string,
  input: z.infer<typeof updateStatusSchema>,
): Promise<ActionResult<void>> {
  return wrap(async () => {
    const session = await verifyIdTokenOrThrow(idToken);
    const parsed = updateStatusSchema.parse(input);
    if (parsed.status === "EN_CURSO") {
      requireRole(session, rolesWrite);
      await assertUserCanAct(session.uid, [...rolesWrite]);
      await applyWorkOrderVistaStatus({
        workOrderId: parsed.workOrderId,
        status: parsed.status as WorkOrderVistaStatus,
        actorUid: session.uid,
      });
      return;
    }
    if (parsed.status === "CANCELADA") {
      requireRole(session, ["supervisor", "admin"]);
      await assertUserCanAct(session.uid, ["supervisor", "admin"]);
      await applyWorkOrderVistaStatus({
        workOrderId: parsed.workOrderId,
        status: "CANCELADA",
        actorUid: session.uid,
      });
      return;
    }
    throw new AppError("VALIDATION", "Usá las acciones específicas para este estado");
  });
}

const materialOtSchema = z.object({
  descripcion: z.string().min(1),
  cantidad: z.number().positive(),
  unidad: z.string().min(1),
  origen: z.enum(["ARAUCO", "EXTERNO"]),
  observaciones: z.string().optional(),
});

export async function addMaterialToOT(
  idToken: string,
  input: { workOrderId: string; material: z.infer<typeof materialOtSchema> },
): Promise<ActionResult<{ id: string }>> {
  return wrap(async () => {
    const session = await verifyIdTokenOrThrow(idToken);
    requireRole(session, rolesWrite);
    await assertUserCanAct(session.uid, [...rolesWrite]);
    const material = materialOtSchema.parse(input.material);
    const id = await addMaterialOtField({
      workOrderId: input.workOrderId,
      actorUid: session.uid,
      ...material,
    });
    return { id };
  });
}

const closePadSchema = z.object({
  workOrderId: z.string(),
  firmaUsuario: z.string().min(100),
  firmaTecnico: z.string().min(100),
  firmaUsuarioNombre: z.string().min(1).max(200),
  firmaTecnicoNombre: z.string().min(1).max(200),
});

export async function closeWorkOrder(
  idToken: string,
  input: z.infer<typeof closePadSchema>,
): Promise<ActionResult<void>> {
  return wrap(async () => {
    const session = await verifyIdTokenOrThrow(idToken);
    requireRole(session, rolesWrite);
    await assertUserCanAct(session.uid, [...rolesWrite]);
    const parsed = closePadSchema.parse(input);
    await closeWorkOrderWithPadSignatures({
      workOrderId: parsed.workOrderId,
      actorUid: session.uid,
      firma_usuario_pad: parsed.firmaUsuario,
      firma_tecnico_pad: parsed.firmaTecnico,
      firma_usuario_nombre: parsed.firmaUsuarioNombre,
      firma_tecnico_nombre: parsed.firmaTecnicoNombre,
    });
  });
}

const checklistSchema = z.object({
  workOrderId: z.string(),
  itemId: z.string(),
  completed: z.boolean(),
});

export async function updateChecklistItem(
  idToken: string,
  input: z.infer<typeof checklistSchema>,
): Promise<ActionResult<void>> {
  return wrap(async () => {
    const session = await verifyIdTokenOrThrow(idToken);
    requireRole(session, rolesWrite);
    await assertUserCanAct(session.uid, [...rolesWrite]);
    const parsed = checklistSchema.parse(input);
    await updateChecklistItemService({
      workOrderId: parsed.workOrderId,
      itemId: parsed.itemId,
      completed: parsed.completed,
      actorUid: session.uid,
    });
  });
}

const informeTextoSchema = z.object({
  workOrderId: z.string(),
  texto_trabajo: z.string().min(1).max(24_000),
});

export async function actionUpdateWorkOrderInforme(
  idToken: string,
  input: z.infer<typeof informeTextoSchema>,
): Promise<ActionResult<void>> {
  return wrap(async () => {
    const session = await verifyIdTokenOrThrow(idToken);
    requireRole(session, rolesWrite);
    await assertUserCanAct(session.uid, [...rolesWrite]);
    const parsed = informeTextoSchema.parse(input);
    await updateWorkOrderInformeText({
      workOrderId: parsed.workOrderId,
      texto_trabajo: parsed.texto_trabajo,
      actorUid: session.uid,
    });
  });
}
