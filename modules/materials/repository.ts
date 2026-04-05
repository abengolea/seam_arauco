import { getAdminDb } from "@/firebase/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { COLLECTIONS, WORK_ORDER_SUB } from "@/lib/firestore/collections";
import type { MaterialLineWorkOrder, MaterialOtListRow } from "@/modules/materials/types";
import type { MaterialOT } from "@/modules/work-orders/types";

export const MATERIALS_COLLECTION = COLLECTIONS.materials;

export async function addMaterialLineAdmin(
  workOrderId: string,
  line: Omit<MaterialLineWorkOrder, "id" | "created_at">,
): Promise<string> {
  const ref = await getAdminDb()
    .collection(COLLECTIONS.work_orders)
    .doc(workOrderId)
    .collection(WORK_ORDER_SUB.materiales_ot)
    .add({
      ...line,
      created_at: FieldValue.serverTimestamp(),
    });
  return ref.id;
}

export async function addMaterialOtFieldAdmin(
  workOrderId: string,
  row: Omit<MaterialOT, "id" | "creado_at">,
): Promise<string> {
  const ref = await getAdminDb()
    .collection(COLLECTIONS.work_orders)
    .doc(workOrderId)
    .collection(WORK_ORDER_SUB.materiales_ot)
    .add({
      ...row,
      creado_at: FieldValue.serverTimestamp(),
    });
  return ref.id;
}

function docToMaterialRow(id: string, data: Record<string, unknown>): MaterialOtListRow {
  if (data.schema_version === 1) {
    return { _kind: "field", id, ...(data as Omit<MaterialOT, "id">) };
  }
  return { _kind: "catalog", id, ...(data as Omit<MaterialLineWorkOrder, "id">) };
}

export async function listMaterialesOtAdmin(workOrderId: string): Promise<MaterialOtListRow[]> {
  const snap = await getAdminDb()
    .collection(COLLECTIONS.work_orders)
    .doc(workOrderId)
    .collection(WORK_ORDER_SUB.materiales_ot)
    .get();
  const rows = snap.docs.map((d) => docToMaterialRow(d.id, d.data() as Record<string, unknown>));
  rows.sort((a, b) => {
    const ta =
      a._kind === "field"
        ? (a.creado_at?.toMillis?.() ?? 0)
        : (a.created_at?.toMillis?.() ?? 0);
    const tb =
      b._kind === "field"
        ? (b.creado_at?.toMillis?.() ?? 0)
        : (b.created_at?.toMillis?.() ?? 0);
    return ta - tb;
  });
  return rows;
}
