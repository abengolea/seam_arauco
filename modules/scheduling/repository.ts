import { getAdminDb } from "@/firebase/firebaseAdmin";
import { COLLECTIONS } from "@/lib/firestore/collections";
import type { ProgramaSemana, WeeklyPlanRow, WeeklyScheduleSlot } from "@/modules/scheduling/types";
import { FieldValue } from "firebase-admin/firestore";

const SLOTS_SUB = "slots";
const PLAN_ROWS_SUB = "plan_rows";

export async function ensureWeeklyBucketAdmin(weekId: string, centro: string, semanaIso: string): Promise<void> {
  const ref = getAdminDb().collection(COLLECTIONS.weekly_schedule).doc(weekId);
  const snap = await ref.get();
  const patch = {
    semana_iso: semanaIso,
    centro,
    updated_at: FieldValue.serverTimestamp(),
  };
  if (!snap.exists) {
    await ref.set({
      ...patch,
      created_at: FieldValue.serverTimestamp(),
    });
  } else {
    await ref.set(patch, { merge: true });
  }
}

export async function createWeeklySlotAdmin(
  weekId: string,
  data: Omit<WeeklyScheduleSlot, "id" | "created_at">,
): Promise<string> {
  const colRef = getAdminDb()
    .collection(COLLECTIONS.weekly_schedule)
    .doc(weekId)
    .collection(SLOTS_SUB);
  const docRef = await colRef.add({
    ...data,
    created_at: FieldValue.serverTimestamp(),
  });
  await getAdminDb().collection(COLLECTIONS.weekly_schedule).doc(weekId).set(
    { updated_at: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return docRef.id;
}

export async function deleteWeeklySlotAdmin(weekId: string, slotId: string): Promise<void> {
  await getAdminDb()
    .collection(COLLECTIONS.weekly_schedule)
    .doc(weekId)
    .collection(SLOTS_SUB)
    .doc(slotId)
    .delete();
  await getAdminDb().collection(COLLECTIONS.weekly_schedule).doc(weekId).set(
    { updated_at: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

export async function replaceWeeklyPlanRowsAdmin(
  weekId: string,
  centro: string,
  rows: Array<Omit<WeeklyPlanRow, "id" | "created_at" | "updated_at">>,
): Promise<void> {
  const db = getAdminDb();
  const docRef = db.collection(COLLECTIONS.weekly_schedule).doc(weekId);
  const colRef = docRef.collection(PLAN_ROWS_SUB);
  const existing = await colRef.get();

  let batch = db.batch();
  let ops = 0;
  const commitIfNeeded = async () => {
    if (ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };

  for (const d of existing.docs) {
    batch.delete(d.ref);
    ops++;
    await commitIfNeeded();
  }

  const now = FieldValue.serverTimestamp();
  for (const r of rows) {
    const ref = colRef.doc();
    batch.set(ref, {
      ...r,
      centro,
      created_at: now,
      updated_at: now,
    });
    ops++;
    await commitIfNeeded();
  }

  if (ops > 0) await batch.commit();

  await ensureWeeklyBucketAdmin(weekId, centro, weekId);
}

async function nextPlanRowOrden(weekId: string, dia: number): Promise<number> {
  const snap = await getAdminDb()
    .collection(COLLECTIONS.weekly_schedule)
    .doc(weekId)
    .collection(PLAN_ROWS_SUB)
    .get();
  let max = -1;
  for (const d of snap.docs) {
    const row = d.data() as { dia_semana?: number; orden?: number };
    if (row.dia_semana === dia && typeof row.orden === "number") {
      max = Math.max(max, row.orden);
    }
  }
  return max + 1;
}

export async function createWeeklyPlanRowAdmin(
  weekId: string,
  data: Omit<WeeklyPlanRow, "id" | "created_at" | "updated_at" | "orden">,
): Promise<string> {
  const orden = await nextPlanRowOrden(weekId, data.dia_semana);
  const colRef = getAdminDb()
    .collection(COLLECTIONS.weekly_schedule)
    .doc(weekId)
    .collection(PLAN_ROWS_SUB);
  const docRef = await colRef.add({
    ...data,
    orden,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
  await ensureWeeklyBucketAdmin(weekId, data.centro, weekId);
  return docRef.id;
}

async function touchWeeklyBucketDoc(weekId: string): Promise<void> {
  await getAdminDb().collection(COLLECTIONS.weekly_schedule).doc(weekId).set(
    { updated_at: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

export async function updateWeeklyPlanRowAdmin(
  weekId: string,
  rowId: string,
  patch: Partial<Pick<WeeklyPlanRow, "localidad" | "especialidad" | "texto" | "dia_semana">>,
): Promise<void> {
  await getAdminDb()
    .collection(COLLECTIONS.weekly_schedule)
    .doc(weekId)
    .collection(PLAN_ROWS_SUB)
    .doc(rowId)
    .set(
      {
        ...patch,
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  await touchWeeklyBucketDoc(weekId);
}

export async function deleteWeeklyPlanRowAdmin(weekId: string, rowId: string): Promise<void> {
  await getAdminDb()
    .collection(COLLECTIONS.weekly_schedule)
    .doc(weekId)
    .collection(PLAN_ROWS_SUB)
    .doc(rowId)
    .delete();
  await touchWeeklyBucketDoc(weekId);
}

export async function getWeeklyPlanRowAdmin(
  weekId: string,
  rowId: string,
): Promise<WeeklyPlanRow | null> {
  const snap = await getAdminDb()
    .collection(COLLECTIONS.weekly_schedule)
    .doc(weekId)
    .collection(PLAN_ROWS_SUB)
    .doc(rowId)
    .get();
  if (!snap.exists) return null;
  const data = snap.data() as Omit<WeeklyPlanRow, "id">;
  return { id: snap.id, ...data } as WeeklyPlanRow;
}

export async function getProgramaSemana(semanaId: string): Promise<ProgramaSemana | null> {
  const ref = getAdminDb().collection(COLLECTIONS.programa_semanal).doc(semanaId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const d = snap.data() as Omit<ProgramaSemana, "id">;
  return { id: snap.id, ...d, slots: d.slots ?? [] };
}

export async function upsertProgramaSemana(data: ProgramaSemana): Promise<void> {
  const ref = getAdminDb().collection(COLLECTIONS.programa_semanal).doc(data.id);
  const snap = await ref.get();
  const { id: _docId, createdAt: _createdAtIgnored, ...fields } = data;
  void _docId;
  void _createdAtIgnored;
  if (!snap.exists) {
    await ref.set({
      ...fields,
      createdAt: FieldValue.serverTimestamp(),
    });
  } else {
    await ref.set(fields, { merge: true });
  }
}
