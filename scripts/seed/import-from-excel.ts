/**
 * Seed / import masivo desde Excel en `scripts/seed/data/` hacia Firestore.
 *
 * La app usa la colección `assets` (no `equipos`). Los avisos siguen `modules/notices/types`.
 *
 *   npm run seed:import
 *
 * Colocá los .xlsx en scripts/seed/data/ con los nombres esperados (ver DATA_FILES abajo).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getAdminDb } from "@/firebase/firebaseAdmin";
import { deriveCentroPlantCodeFromUbicacionTecnica } from "@/lib/firestore/derive-centro";
import { ASSETS_COLLECTION, AVISOS_COLLECTION } from "@/lib/firestore/collections";
import {
  commitAssetsImportRows,
  parseAssetsWorkbook,
  type ParsedAssetImportRow,
} from "@/modules/assets/excel-import";
import type { Especialidad, EstadoAviso, FrecuenciaMantenimiento, TipoAviso } from "@/modules/notices/types";
import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import * as XLSX from "xlsx";
import { findHeaderRowByKeys, headerIndexMap, normHeader, sheetMatrix, str } from "./excel-utils";

const DATA_DIR = path.join(process.cwd(), "scripts", "seed", "data");

const DATA_FILES = {
  equipos: "Codigos_de_Equipos_AA.xlsx",
  preventivos: "AVISOS_PREVENTIVOS_MODIFICACIÓN.xlsx",
  correctivos: "CORRECTIVOS-MARZO_26.xlsx",
  mensuales: "MENSUALES_MARZO_2026.xlsx",
} as const;

function resolveDataPath(name: string): string | null {
  const p = path.join(DATA_DIR, name);
  if (fs.existsSync(p)) return p;
  const noAccent = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const p2 = path.join(DATA_DIR, noAccent);
  if (fs.existsSync(p2)) return p2;
  const files = fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR) : [];
  const hit = files.find((f) => normHeader(f) === normHeader(name));
  return hit ? path.join(DATA_DIR, hit) : null;
}

function logStep(msg: string) {
  console.log(`\n▶ ${msg}`);
}

function mapEspecialidad(raw: string): Especialidad {
  const x = normHeader(raw);
  if (x.includes("gg") || x === "g") return "GG";
  if (x.includes("elec") || x === "e" || x.includes("hidr") || x.includes("hg")) return "ELECTRICO";
  return "AA";
}

function mapFrecuenciaFromSheet(sheetName: string): FrecuenciaMantenimiento | null {
  const n = normHeader(sheetName);
  if (n.includes("anual") && !n.includes("semest")) return "ANUAL";
  if (n.includes("semestral")) return "SEMESTRAL";
  if (n.includes("trim")) return "TRIMESTRAL";
  if (n.startsWith("men") || n.includes("mensual")) return "MENSUAL";
  return null;
}

function parseLooseDate(value: string): Date | null {
  const t = value.trim();
  if (!t) return null;
  const ts = Date.parse(t);
  if (!Number.isNaN(ts)) return new Date(ts);
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const d = +m[1];
    const mo = +m[2];
    let y = +m[3];
    if (y < 100) y += 2000;
    const dt = new Date(y, mo - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

function mapEstadoUsuario(statusRaw: string): EstadoAviso | null {
  const u = normHeader(statusRaw);
  if (!u) return null;
  if (u.includes("pdte") || u.includes("pend") || u.includes("abiert")) return "ABIERTO";
  if (u.includes("ot") && u.includes("gener")) return "OT_GENERADA";
  if (u.includes("curso") || u.includes("proce")) return "OT_GENERADA";
  if (u.includes("compl") || u.includes("cerr") || u.includes("realiz")) return "CERRADO";
  if (u.includes("cancel") || u.includes("anul")) return "ANULADO";
  return null;
}

function avisoDocId(numeroRaw: string): string {
  return str(numeroRaw)
    .replace(/\//g, "-")
    .replace(/\s+/g, "")
    .trim();
}

async function loadUbicacionToAssetId(): Promise<Map<string, string>> {
  const db = getAdminDb();
  const map = new Map<string, string>();
  const snap = await db.collection(ASSETS_COLLECTION).get();
  for (const d of snap.docs) {
    const ut = str(d.get("ubicacion_tecnica"));
    if (ut && !map.has(ut)) map.set(ut, d.id);
  }
  return map;
}

function col(h: Map<string, number>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const nk = normHeader(k);
    if (h.has(nk)) return h.get(nk);
  }
  for (const [key, idx] of h) {
    for (const k of keys) {
      if (key.includes(normHeader(k))) return idx;
    }
  }
  return undefined;
}

async function commitAvisoBatchMerge(
  payloads: Array<{ id: string; data: Record<string, unknown> }>,
  label: string,
) {
  const db = getAdminDb();
  const collection = db.collection(AVISOS_COLLECTION);
  const chunkSize = 450;
  const getChunk = 10;
  let done = 0;

  for (let i = 0; i < payloads.length; i += chunkSize) {
    const chunk = payloads.slice(i, i + chunkSize);
    const refs = chunk.map((p) => collection.doc(p.id));
    const snapsMap = new Map<string, DocumentSnapshot>();
    for (let j = 0; j < refs.length; j += getChunk) {
      const slice = refs.slice(j, j + getChunk);
      const snaps = await db.getAll(...slice);
      for (const s of snaps) snapsMap.set(s.ref.id, s);
    }
    const batch = db.batch();
    for (let k = 0; k < chunk.length; k++) {
      const { id, data } = chunk[k];
      const snap = snapsMap.get(id)!;
      const base = {
        ...data,
        updated_at: FieldValue.serverTimestamp(),
      };
      if (!snap.exists) {
        (base as Record<string, unknown>).created_at = FieldValue.serverTimestamp();
      }
      batch.set(refs[k], base, { merge: true });
    }
    await batch.commit();
    done += chunk.length;
    process.stdout.write(`\r   ${label} ${done}/${payloads.length} ✓`);
  }
  console.log("");
}

async function importEquipos(): Promise<number> {
  const file = resolveDataPath(DATA_FILES.equipos);
  if (!file) {
    console.warn(`   Omitido: no está ${DATA_FILES.equipos} en scripts/seed/data/`);
    return 0;
  }
  logStep(`Importando equipos → ${ASSETS_COLLECTION} (${path.basename(file)})`);
  const wb = XLSX.readFile(file);
  const { rows, warnings } = parseAssetsWorkbook(wb, "PC01");
  for (const w of warnings) console.warn(`   ⚠ ${w}`);
  const derived: ParsedAssetImportRow[] = rows.map((r) => ({
    ...r,
    centro: deriveCentroPlantCodeFromUbicacionTecnica(r.ubicacion_tecnica),
  }));
  if (!derived.length) {
    console.log("   Sin filas de equipos.");
    return 0;
  }
  await commitAssetsImportRows(derived);
  console.log(`   Equipos importados (merge): ${derived.length}`);
  return derived.length;
}

type AvisoPayload = {
  n_aviso: string;
  asset_id: string;
  ubicacion_tecnica: string;
  centro: string;
  frecuencia: FrecuenciaMantenimiento;
  tipo: TipoAviso;
  especialidad: Especialidad;
  texto_corto: string;
  texto_largo?: string;
  estado: EstadoAviso;
  fecha_programada?: Timestamp | null;
};

async function importPreventivos(utToAsset: Map<string, string>): Promise<number> {
  const file = resolveDataPath(DATA_FILES.preventivos);
  if (!file) {
    console.warn(`   Omitido: no está ${DATA_FILES.preventivos}`);
    return 0;
  }
  logStep(`Importando avisos preventivos (${path.basename(file)})`);
  const wb = XLSX.readFile(file);
  const out: Array<{ id: string; data: Record<string, unknown> }> = [];
  let skipped = 0;
  let skipNoAsset = 0;

  for (const sheetName of wb.SheetNames) {
    const freq = mapFrecuenciaFromSheet(sheetName);
    if (!freq) continue;
    const sh = wb.Sheets[sheetName]!;
    const matrix = sheetMatrix(sh);
    const hr = findHeaderRowByKeys(matrix, ["descripcion", "ubic"], 40);
    if (hr < 0) {
      console.warn(`   ⚠ Hoja «${sheetName}»: sin encabezados esperados`);
      continue;
    }
    const h = headerIndexMap(matrix[hr]!);
    const iAviso =
      col(h, "aviso", "n aviso", "n° de aviso", "numero") ??
      h.get(normHeader("Aviso")) ??
      [...h.entries()].find(([k]) => k.includes("aviso"))?.[1];
    const iDesc = col(h, "descripcion", "descripción");
    const iUt = col(h, "ubicacion tecnica", "ubicación técnica", "ubicacion");
    const iDenom = col(h, "denom", "denominacion", "denominación");
    const iEsp = col(h, "especialidad");
    if (iAviso === undefined || iDesc === undefined || iUt === undefined) {
      console.warn(`   ⚠ Hoja «${sheetName}»: columnas incompletas`);
      continue;
    }

    for (let r = hr + 1; r < matrix.length; r++) {
      const line = matrix[r] ?? [];
      const numero = str(line[iAviso]);
      const descripcion = str(line[iDesc]);
      const ut = str(line[iUt]);
      const denom = iDenom !== undefined ? str(line[iDenom]) : "";
      const espRaw = iEsp !== undefined ? str(line[iEsp]) : "";
      if (!numero && !descripcion && !ut) continue;
      if (!numero) {
        skipped++;
        continue;
      }
      const assetId = utToAsset.get(ut) ?? "";
      if (!assetId) {
        skipNoAsset++;
        continue;
      }
      const id = avisoDocId(numero);
      const payload: AvisoPayload = {
        n_aviso: numero,
        asset_id: assetId,
        ubicacion_tecnica: ut,
        centro: deriveCentroPlantCodeFromUbicacionTecnica(ut),
        frecuencia: freq,
        tipo: "PREVENTIVO",
        especialidad: mapEspecialidad(espRaw),
        texto_corto: descripcion.slice(0, 500) || numero,
        texto_largo: descripcion.length > 500 ? descripcion : undefined,
        estado: "ABIERTO",
        fecha_programada: null,
      };
      if (denom) {
        payload.texto_largo = [denom, payload.texto_largo].filter(Boolean).join(" — ") || undefined;
      }
      out.push({ id, data: { ...payload } });
    }
  }

  if (out.length) await commitAvisoBatchMerge(out, "Preventivos");
  if (skipped) console.log(`   Sin número de aviso: ${skipped}`);
  if (skipNoAsset) console.log(`   Sin activo para la UT (importá equipos o revisá UT): ${skipNoAsset}`);
  return out.length;
}

async function importCorrectivos(utToAsset: Map<string, string>): Promise<number> {
  const file = resolveDataPath(DATA_FILES.correctivos);
  if (!file) {
    console.warn(`   Omitido: no está ${DATA_FILES.correctivos}`);
    return 0;
  }
  logStep(`Importando avisos correctivos (${path.basename(file)})`);
  const wb = XLSX.readFile(file);
  const sh = wb.Sheets[wb.SheetNames[0]!] ?? wb.Sheets["Hoja1"];
  if (!sh) {
    console.warn("   Sin hoja en correctivos");
    return 0;
  }
  const matrix = sheetMatrix(sh);
  const hr = findHeaderRowByKeys(matrix, ["ubicacion", "descripcion"], 40);
  if (hr < 0) {
    console.warn("   ⚠ Correctivos: sin fila de encabezados");
    return 0;
  }
  const h = headerIndexMap(matrix[hr]!);
  const iAviso =
    col(h, "n de aviso", "n° de aviso", "aviso", "numero") ??
    [...h.entries()].find(([k]) => k.includes("aviso"))?.[1];
  const iUt = col(h, "ubicacion tecnica", "ubicación técnica", "ubicacion");
  const iDesc = col(h, "descripcion", "descripción");
  const iEsp = col(h, "especialidad");
  const iFecha = col(h, "fecha realizacion", "fecha realización", "fecha");
  if (iAviso === undefined || iUt === undefined || iDesc === undefined) {
    console.warn("   ⚠ Correctivos: faltan columnas");
    return 0;
  }

  const out: Array<{ id: string; data: Record<string, unknown> }> = [];
  let skipped = 0;
  for (let r = hr + 1; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    const numero = str(line[iAviso]);
    const ut = str(line[iUt]);
    const descripcion = str(line[iDesc]);
    const espRaw = iEsp !== undefined ? str(line[iEsp]) : "";
    const fechaStr = iFecha !== undefined ? str(line[iFecha]) : "";
    if (!numero && !ut) continue;
    if (!numero) {
      skipped++;
      continue;
    }
    const assetId = utToAsset.get(ut) ?? "";
    if (!assetId) {
      skipped++;
      console.warn(`   ⚠ Correctivo ${numero}: sin activo para UT «${ut}»`);
      continue;
    }
    const fecha = parseLooseDate(fechaStr);
    const cerrado = fecha !== null;
    const id = avisoDocId(numero);
    const payload: AvisoPayload = {
      n_aviso: numero,
      asset_id: assetId,
      ubicacion_tecnica: ut,
      centro: deriveCentroPlantCodeFromUbicacionTecnica(ut),
      frecuencia: "UNICA",
      tipo: "CORRECTIVO",
      especialidad: mapEspecialidad(espRaw),
      texto_corto: descripcion.slice(0, 500) || numero,
      texto_largo: descripcion.length > 500 ? descripcion : undefined,
      estado: cerrado ? "CERRADO" : "ABIERTO",
      fecha_programada: fecha ? Timestamp.fromDate(fecha) : null,
    };
    out.push({ id, data: { ...payload } });
  }
  if (out.length) await commitAvisoBatchMerge(out, "Correctivos");
  if (skipped) console.log(`   Omitidos: ${skipped}`);
  return out.length;
}

async function commitPatchesOnlyExisting(
  patches: Array<{ id: string; data: Record<string, unknown> }>,
  label: string,
) {
  const db = getAdminDb();
  const collection = db.collection(AVISOS_COLLECTION);
  const chunkSize = 450;
  const getChunk = 10;
  let done = 0;
  let skipped = 0;

  for (let i = 0; i < patches.length; i += chunkSize) {
    const chunk = patches.slice(i, i + chunkSize);
    const refs = chunk.map((p) => collection.doc(p.id));
    const snapsMap = new Map<string, DocumentSnapshot>();
    for (let j = 0; j < refs.length; j += getChunk) {
      const slice = refs.slice(j, j + getChunk);
      const snaps = await db.getAll(...slice);
      for (const s of snaps) snapsMap.set(s.ref.id, s);
    }
    const batch = db.batch();
    let ops = 0;
    for (let k = 0; k < chunk.length; k++) {
      const { id, data } = chunk[k];
      const snap = snapsMap.get(id)!;
      if (!snap.exists) {
        skipped++;
        continue;
      }
      batch.set(
        refs[k],
        {
          ...data,
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      ops++;
    }
    if (ops) await batch.commit();
    done += chunk.length;
    process.stdout.write(`\r   ${label} revisados ${done}/${patches.length}`);
  }
  if (skipped) console.log(`   · Sin documento previo (no se crea parche): ${skipped}`);
}

async function importMensualesMerge(): Promise<number> {
  const file = resolveDataPath(DATA_FILES.mensuales);
  if (!file) {
    console.warn(`   Omitido: no está ${DATA_FILES.mensuales}`);
    return 0;
  }
  logStep(`Enriqueciendo avisos desde mensuales (${path.basename(file)})`);
  const wb = XLSX.readFile(file);
  const sh = wb.Sheets[wb.SheetNames[0]!] ?? wb.Sheets["Hoja1"];
  if (!sh) return 0;
  const matrix = sheetMatrix(sh);
  const hr = findHeaderRowByKeys(matrix, ["aviso", "descripcion"], 40);
  if (hr < 0) {
    console.warn("   ⚠ Mensuales: sin encabezados");
    return 0;
  }
  const h = headerIndexMap(matrix[hr]!);
  const iAviso = col(h, "aviso") ?? [...h.entries()].find(([k]) => k.includes("aviso"))?.[1];
  const iStatus = col(h, "status", "status usuario", "estado");
  const iCePl = col(h, "cepl", "ce pl");
  const iFecha = col(h, "fecha");
  if (iAviso === undefined) {
    console.warn("   ⚠ Mensuales: sin columna aviso");
    return 0;
  }

  const out: Array<{ id: string; data: Record<string, unknown> }> = [];
  for (let r = hr + 1; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    const numero = str(line[iAviso]);
    if (!numero) continue;
    const id = avisoDocId(numero);
    const patch: Record<string, unknown> = {};
    if (iStatus !== undefined) {
      const st = mapEstadoUsuario(str(line[iStatus]));
      if (st) patch.estado = st;
    }
    if (iCePl !== undefined) {
      const ce = str(line[iCePl]);
      if (ce) patch.centro = ce;
    }
    if (iFecha !== undefined) {
      const fd = parseLooseDate(str(line[iFecha]));
      if (fd) patch.fecha_programada = Timestamp.fromDate(fd);
    }
    if (Object.keys(patch).length) out.push({ id, data: patch });
  }

  if (out.length) await commitPatchesOnlyExisting(out, "Mensuales merge");
  return out.length;
}

async function main() {
  console.log("Seed import Firestore — industrial-cmms");
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const nEq = await importEquipos();
  logStep("Construyendo mapa UT → asset_id");
  const utToAsset = await loadUbicacionToAssetId();
  console.log(`   Ubicaciones únicas con activo: ${utToAsset.size}`);

  const nP = await importPreventivos(utToAsset);
  const nC = await importCorrectivos(utToAsset);
  const nM = await importMensualesMerge();

  console.log("\n── Resumen ──");
  console.log(`   Equipos (assets):     ${nEq}`);
  console.log(`   Avisos preventivos:   ${nP}`);
  console.log(`   Avisos correctivos:   ${nC}`);
  console.log(`   Parches mensuales:    ${nM}`);
  console.log("\nListo.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
