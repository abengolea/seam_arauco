export const COLLECTIONS = {
  users: "users",
  assets: "assets",
  avisos: "avisos",
  work_orders: "work_orders",
  materials: "materials",
  weekly_schedule: "weekly_schedule",
  programa_semanal: "programa_semanal",
} as const;

/** Alias explícitos para scripts / repositorios (misma colección que `COLLECTIONS`). */
export const ASSETS_COLLECTION = COLLECTIONS.assets;
export const AVISOS_COLLECTION = COLLECTIONS.avisos;

export const WORK_ORDER_SUB = {
  checklist: "checklist",
  materiales_ot: "materiales_ot",
  evidencias: "evidencias",
  historial: "historial",
} as const;
