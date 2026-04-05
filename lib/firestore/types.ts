/**
 * Tipos de referencia para imports (seed) y documentación.
 * Los documentos reales en Firestore siguen los tipos canónicos:
 * - Activos: `modules/assets/types` → colección `assets` (no `equipos`)
 * - Avisos: `modules/notices/types` → colección `avisos`
 */

/** Fila lógica de Excel de equipos (antes de mapear a `Asset`). */
export type EquipoSeedRow = {
  codigo: string;
  codigoViejo: string;
  descripcion: string;
  ubicacionTecnica: string;
  especialidad: "AA" | "GG";
  centro: string;
};

/** Fila lógica de Excel de avisos preventivos. */
export type AvisoPreventivoSeedRow = {
  numero: string;
  descripcion: string;
  ubicacionTecnica: string;
  denomUbicTecnica: string;
  especialidadRaw: string;
  frecuencia: "M" | "T" | "S" | "A";
};

/** Subconjunto documental (ver `Aviso` en `modules/notices/types`). */
export type AvisoFirestoreShape = {
  id: string;
  n_aviso: string;
  asset_id: string;
  ubicacion_tecnica: string;
  centro: string;
  frecuencia: string;
  tipo: string;
  especialidad: string;
  texto_corto: string;
  texto_largo?: string;
  estado: string;
};
