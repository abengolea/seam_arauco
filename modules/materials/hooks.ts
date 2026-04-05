"use client";

import { getFirebaseDb } from "@/firebase/firebaseClient";
import type {
  MaterialCatalogItem,
  MaterialOTConsumoRow,
  MaterialesOTFilters,
  MaterialesOTTotales,
} from "@/modules/materials/types";
import {
  collection,
  collectionGroup,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { endOfDay, endOfMonth, startOfDay, startOfMonth } from "date-fns";
import { useEffect, useMemo, useState } from "react";

/** Nombre real de la subcolección en Firestore (`work_orders/{id}/materiales_ot`). Equivale al "materials_ot" del diseño. */
const MATERIALES_OT_GROUP = "materiales_ot";
const SNAPSHOT_LIMIT = 4000;

function materialesFiltersKey(f: MaterialesOTFilters): string {
  return JSON.stringify({
    tipo: f.tipo ?? "todos",
    esp: f.especialidad ?? "todos",
    origen: f.origen ?? "todos",
    centro: f.centro?.trim() ?? "",
    desde: f.desde?.getTime() ?? "",
    hasta: f.hasta?.getTime() ?? "",
  });
}

function workOrderIdFromPath(doc: QueryDocumentSnapshot): string {
  const parts = doc.ref.path.split("/");
  return parts[1] ?? "";
}

function docToConsumoRow(doc: QueryDocumentSnapshot): MaterialOTConsumoRow | null {
  const data = doc.data() as Record<string, unknown>;
  if (data.schema_version !== 1) return null;
  const creado = data.creado_at as Timestamp | undefined;
  if (!creado?.toMillis) return null;
  const origen = data.origen;
  if (origen !== "ARAUCO" && origen !== "EXTERNO") return null;

  return {
    id: doc.id,
    otId: (typeof data.ot_id === "string" && data.ot_id) ? data.ot_id : workOrderIdFromPath(doc),
    descripcion: String(data.descripcion ?? ""),
    cantidad: Number(data.cantidad ?? 0),
    unidad: String(data.unidad ?? ""),
    origen,
    observaciones: typeof data.observaciones === "string" ? data.observaciones : undefined,
    otTipo: (data.ot_tipo === "preventivo" || data.ot_tipo === "correctivo" ? data.ot_tipo : null) as
      | "preventivo"
      | "correctivo"
      | null,
    otEspecialidad:
      data.ot_especialidad === "AA" ||
      data.ot_especialidad === "ELECTRICO" ||
      data.ot_especialidad === "GG" ||
      data.ot_especialidad === "HG"
        ? data.ot_especialidad
        : null,
    otNumeroAviso: String(data.ot_numero_aviso ?? ""),
    otDescripcion: String(data.ot_descripcion ?? ""),
    otFechaCompletada:
      data.ot_fecha_completada &&
      typeof (data.ot_fecha_completada as Timestamp).toMillis === "function"
        ? (data.ot_fecha_completada as Timestamp)
        : null,
    otCentro: String(data.ot_centro ?? ""),
    creadoAt: creado,
    creadoPor: String(data.creado_por ?? ""),
  };
}

function applyMaterialesFilters(rows: MaterialOTConsumoRow[], f: MaterialesOTFilters): MaterialOTConsumoRow[] {
  let out = rows;
  const centro = f.centro?.trim();
  if (centro) {
    out = out.filter((r) => r.otCentro === centro);
  }
  if (f.tipo && f.tipo !== "todos") {
    out = out.filter((r) => r.otTipo === f.tipo);
  }
  if (f.especialidad && f.especialidad !== "todos") {
    const want =
      f.especialidad === "A" ? "AA" : f.especialidad === "E" ? "ELECTRICO" : "GG";
    out = out.filter((r) => r.otEspecialidad === want);
  }
  if (f.origen && f.origen !== "todos") {
    out = out.filter((r) => r.origen === f.origen);
  }
  return out;
}

function emptyTotales(): MaterialesOTTotales {
  return {
    total: 0,
    porOrigen: { ARAUCO: 0, EXTERNO: 0 },
    porTipo: { preventivo: 0, correctivo: 0 },
    porEspecialidad: { A: 0, E: 0, GG: 0, HG: 0 },
  };
}

function computeTotales(rows: MaterialOTConsumoRow[]): MaterialesOTTotales {
  const t = emptyTotales();
  for (const r of rows) {
    const q = r.cantidad;
    if (!Number.isFinite(q) || q < 0) continue;
    t.total += q;
    t.porOrigen[r.origen] += q;
    if (r.otTipo === "preventivo") t.porTipo.preventivo += q;
    else if (r.otTipo === "correctivo") t.porTipo.correctivo += q;
    switch (r.otEspecialidad) {
      case "AA":
        t.porEspecialidad.A += q;
        break;
      case "ELECTRICO":
        t.porEspecialidad.E += q;
        break;
      case "GG":
        t.porEspecialidad.GG += q;
        break;
      case "HG":
        t.porEspecialidad.HG += q;
        break;
      default:
        break;
    }
  }
  return t;
}

/**
 * Materiales consumidos en OTs (collectionGroup `materiales_ot`, ítems schema v1).
 * Consulta por rango de `creado_at`; el resto de filtros se aplica en cliente.
 */
export function useMaterialesOT(filters: MaterialesOTFilters): {
  materiales: MaterialOTConsumoRow[];
  totales: MaterialesOTTotales;
  loading: boolean;
  error: Error | null;
  /** True si el snapshot alcanzó el límite interno (convendría acotar fechas o paginar en servidor). */
  hitLimit: boolean;
} {
  const [raw, setRaw] = useState<MaterialOTConsumoRow[]>([]);
  const [hitLimit, setHitLimit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const desdeTs = (filters.desde ?? startOfMonth(new Date())).getTime();
  const hastaTs = (filters.hasta ?? endOfMonth(new Date())).getTime();
  const fKey = materialesFiltersKey(filters);

  useEffect(() => {
    const db = getFirebaseDb();
    const desde = startOfDay(filters.desde ?? startOfMonth(new Date()));
    const hasta = endOfDay(filters.hasta ?? endOfMonth(new Date()));
    setLoading(true);
    setError(null);

    const qRef = query(
      collectionGroup(db, MATERIALES_OT_GROUP),
      where("schema_version", "==", 1),
      where("creado_at", ">=", Timestamp.fromDate(desde)),
      where("creado_at", "<=", Timestamp.fromDate(hasta)),
      orderBy("creado_at", "desc"),
      limit(SNAPSHOT_LIMIT),
    );

    const unsub: Unsubscribe = onSnapshot(
      qRef,
      (snap) => {
        const rows: MaterialOTConsumoRow[] = [];
        for (const d of snap.docs) {
          const row = docToConsumoRow(d);
          if (row) rows.push(row);
        }
        setHitLimit(snap.docs.length >= SNAPSHOT_LIMIT);
        setRaw(rows);
        setLoading(false);
      },
      (err) => {
        setHitLimit(false);
        setError(err);
        setLoading(false);
      },
    );

    return () => unsub();
    // Solo el mismo rango de fechas debe reabrir la suscripción; el resto se filtra en cliente.
  }, [desdeTs, hastaTs]);

  const materiales = useMemo(() => applyMaterialesFilters(raw, filters), [raw, fKey]);
  const totales = useMemo(() => computeTotales(materiales), [materiales]);

  return { materiales, totales, loading, error, hitLimit };
}

export function useMaterialsCatalogLive(max: number = 500): {
  items: MaterialCatalogItem[];
  loading: boolean;
  error: Error | null;
} {
  const [items, setItems] = useState<MaterialCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const db = getFirebaseDb();
    const q = query(collection(db, "materials"), limit(max));
    const unsub: Unsubscribe = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<MaterialCatalogItem, "id">) }),
        );
        setItems(rows);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [max]);

  return { items, loading, error };
}
