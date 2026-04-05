import { getAdminDb } from "@/firebase/firebaseAdmin";
import { COLLECTIONS, WORK_ORDER_SUB } from "@/lib/firestore/collections";
import type {
  ChecklistItem,
  EvidenciaOT,
  WorkOrder,
  WorkOrderHistorialEvent,
} from "@/modules/work-orders/types";
import { FieldValue } from "firebase-admin/firestore";

export const WORK_ORDERS_COLLECTION = COLLECTIONS.work_orders;

function woRef(workOrderId: string) {
  return getAdminDb().collection(WORK_ORDERS_COLLECTION).doc(workOrderId);
}

export async function createWorkOrderDoc(
  data: Omit<WorkOrder, "id" | "created_at" | "updated_at">,
): Promise<string> {
  const ref = await getAdminDb().collection(WORK_ORDERS_COLLECTION).add({
    ...data,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function getWorkOrderById(workOrderId: string): Promise<WorkOrder | null> {
  const snap = await woRef(workOrderId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<WorkOrder, "id">) };
}

export async function updateWorkOrderDoc(
  workOrderId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await woRef(workOrderId).update({
    ...patch,
    updated_at: FieldValue.serverTimestamp(),
  });
}

export async function appendHistorialAdmin(
  workOrderId: string,
  event: Omit<WorkOrderHistorialEvent, "id" | "created_at">,
): Promise<string> {
  const ref = await woRef(workOrderId).collection(WORK_ORDER_SUB.historial).add({
    ...event,
    created_at: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function addChecklistItemsBatch(
  workOrderId: string,
  items: Array<Omit<ChecklistItem, "id">>,
): Promise<void> {
  const batch = getAdminDb().batch();
  const col = woRef(workOrderId).collection(WORK_ORDER_SUB.checklist);
  for (const item of items) {
    const docRef = col.doc();
    batch.set(docRef, item);
  }
  await batch.commit();
}

export async function addEvidenciaDoc(
  workOrderId: string,
  row: Omit<EvidenciaOT, "id" | "created_at">,
): Promise<string> {
  const ref = await woRef(workOrderId).collection(WORK_ORDER_SUB.evidencias).add({
    ...row,
    created_at: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function updateChecklistItemDoc(
  workOrderId: string,
  itemId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await woRef(workOrderId).collection(WORK_ORDER_SUB.checklist).doc(itemId).update(patch);
}

export async function getChecklistItemDoc(
  workOrderId: string,
  itemId: string,
): Promise<ChecklistItem | null> {
  const snap = await woRef(workOrderId).collection(WORK_ORDER_SUB.checklist).doc(itemId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<ChecklistItem, "id">) };
}
