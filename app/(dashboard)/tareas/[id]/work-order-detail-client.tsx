"use client";

import {
  addMaterialToOT,
  closeWorkOrder,
  updateChecklistItem,
  updateWorkOrderStatus,
} from "@/app/actions/work-orders";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { useOnlineStatus } from "@/hooks/use-online";
import { enqueueOutbox } from "@/lib/offline/ot-db";
import { cn } from "@/lib/utils";
import type { MaterialOtListRow } from "@/modules/materials/types";
import { WorkOrderInformeForm } from "@/modules/work-orders/components/WorkOrderInformeForm";
import {
  useWorkOrderChecklist,
  useWorkOrderLive,
  useWorkOrderMaterials,
} from "@/modules/work-orders/hooks";
import {
  workOrderSubtipo,
  workOrderVistaStatus,
  type WorkOrderVistaStatus,
} from "@/modules/work-orders/types";
import { SignaturePad } from "@/modules/signatures/components/SignaturePad";
import { getClientIdToken } from "@/modules/users/hooks";
import { Download } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function vistaLabel(s: WorkOrderVistaStatus): string {
  switch (s) {
    case "EN_CURSO":
      return "EN CURSO";
    default:
      return s;
  }
}

function statusBadgeClass(s: WorkOrderVistaStatus): string {
  switch (s) {
    case "PENDIENTE":
      return "border-zinc-400/40 bg-zinc-500/15 text-zinc-800 dark:text-zinc-200";
    case "EN_CURSO":
      return "border-blue-600/40 bg-blue-600/15 text-blue-950 dark:text-blue-100";
    case "COMPLETADA":
      return "border-emerald-600/40 bg-emerald-600/15 text-emerald-950 dark:text-emerald-100";
    case "CANCELADA":
      return "border-red-600/45 bg-red-600/15 text-red-950 dark:text-red-100";
    default:
      return "";
  }
}

function materialLabel(m: MaterialOtListRow): string {
  if (m._kind === "field") {
    return `${m.descripcion} · ${m.cantidad} ${m.unidad} (${m.origen})`;
  }
  return `${m.descripcion_snapshot} · ${m.cantidad_consumida} ${m.unidad_medida}`;
}

export function WorkOrderDetailClient({ workOrderId }: { workOrderId: string }) {
  const { workOrder, loading, error } = useWorkOrderLive(workOrderId);
  const { materials, loading: matLoading } = useWorkOrderMaterials(workOrderId);
  const { items: checklistItems, loading: clLoading } = useWorkOrderChecklist(workOrderId);
  const online = useOnlineStatus();

  const [msg, setMsg] = useState<string | null>(null);
  const [cerrarOpen, setCerrarOpen] = useState(false);
  const [sigW, setSigW] = useState(320);
  const sigWrapRef = useRef<HTMLDivElement | null>(null);

  const [matOpen, setMatOpen] = useState(false);
  const [matDesc, setMatDesc] = useState("");
  const [matCant, setMatCant] = useState("1");
  const [matUd, setMatUd] = useState("u");
  const [matOrigen, setMatOrigen] = useState<"ARAUCO" | "EXTERNO">("ARAUCO");

  const [fUserName, setFUserName] = useState("");
  const [fTechName, setFTechName] = useState("");
  const [fUserPad, setFUserPad] = useState<string | null>(null);
  const [fTechPad, setFTechPad] = useState<string | null>(null);

  const [localCheck, setLocalCheck] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const el = sigWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = Math.min(480, Math.max(280, Math.floor(el.getBoundingClientRect().width)));
      setSigW(w);
    });
    ro.observe(el);
    const w0 = Math.min(480, Math.max(280, Math.floor(el.getBoundingClientRect().width)));
    setSigW(w0);
    return () => ro.disconnect();
  }, [cerrarOpen]);

  const flushOutbox = useCallback(
    async ({ type, payload }: { type: string; payload: unknown }) => {
      const t = await getClientIdToken();
      if (!t) throw new Error("Sin sesión");
      if (type === "wo_checklist") {
        const p = payload as { workOrderId: string; itemId: string; completed: boolean };
        const res = await updateChecklistItem(t, p);
        if (!res.ok) throw new Error(res.error.message);
        return;
      }
      if (type === "wo_add_material") {
        const p = payload as {
          workOrderId: string;
          material: {
            descripcion: string;
            cantidad: number;
            unidad: string;
            origen: "ARAUCO" | "EXTERNO";
            observaciones?: string;
          };
        };
        const res = await addMaterialToOT(t, p);
        if (!res.ok) throw new Error(res.error.message);
      }
    },
    [],
  );

  useOfflineSync(true, flushOutbox);

  const vista = workOrder ? workOrderVistaStatus(workOrder) : ("PENDIENTE" as const);
  const showChecklist =
    workOrder &&
    (workOrder.especialidad === "GG" || workOrderSubtipo(workOrder) === "checklist" || checklistItems.length > 0);

  const checklistDone = useMemo(() => {
    return checklistItems.filter((it) => {
      const local = localCheck[it.id];
      if (local !== undefined) return local;
      return it.respuesta_boolean === true;
    }).length;
  }, [checklistItems, localCheck]);

  async function token(): Promise<string> {
    const t = await getClientIdToken();
    if (!t) throw new Error("Sin sesión");
    return t;
  }

  async function onIniciar() {
    setMsg(null);
    try {
      const res = await updateWorkOrderStatus(await token(), {
        workOrderId,
        status: "EN_CURSO",
      });
      setMsg(res.ok ? "Ejecución iniciada" : res.error.message);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
    }
  }

  async function toggleCheck(itemId: string, completed: boolean, serverVal: boolean) {
    setMsg(null);
    setLocalCheck((m) => ({ ...m, [itemId]: completed }));
    try {
      if (online) {
        const res = await updateChecklistItem(await token(), {
          workOrderId,
          itemId,
          completed,
        });
        if (!res.ok) throw new Error(res.error.message);
      } else {
        await enqueueOutbox("wo_checklist", { workOrderId, itemId, completed });
        setMsg("Sin conexión: cambio de checklist en cola.");
      }
    } catch (e) {
      setLocalCheck((m) => {
        const n = { ...m };
        n[itemId] = serverVal;
        return n;
      });
      setMsg(e instanceof Error ? e.message : "Error checklist");
    }
  }

  async function submitMaterial(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const cant = Number(matCant.replace(",", "."));
    if (!matDesc.trim() || !Number.isFinite(cant) || cant <= 0) {
      setMsg("Completá descripción y cantidad válida");
      return;
    }
    const material = {
      descripcion: matDesc.trim(),
      cantidad: cant,
      unidad: matUd.trim() || "u",
      origen: matOrigen,
    };
    try {
      if (online) {
        const res = await addMaterialToOT(await token(), { workOrderId, material });
        if (!res.ok) {
          setMsg(res.error.message);
          return;
        }
        setMatDesc("");
        setMatCant("1");
        setMatOpen(false);
        setMsg("Material agregado");
      } else {
        await enqueueOutbox("wo_add_material", { workOrderId, material });
        setMatOpen(false);
        setMsg("Sin conexión: material en cola de sincronización.");
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Error");
    }
  }

  async function confirmarCierre() {
    setMsg(null);
    if (!fUserPad || !fTechPad || !fUserName.trim() || !fTechName.trim()) {
      setMsg("Completá nombres y ambas firmas");
      return;
    }
    try {
      const res = await closeWorkOrder(await token(), {
        workOrderId,
        firmaUsuario: fUserPad,
        firmaTecnico: fTechPad,
        firmaUsuarioNombre: fUserName.trim(),
        firmaTecnicoNombre: fTechName.trim(),
      });
      if (!res.ok) {
        setMsg(res.error.message);
        return;
      }
      setCerrarOpen(false);
      setMsg("OT completada");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error al cerrar");
    }
  }

  async function downloadPdf() {
    setMsg(null);
    try {
      const t = await getClientIdToken();
      if (!t) {
        setMsg("Sin sesión");
        return;
      }
      const res = await fetch(`/api/work-orders/${workOrderId}/pdf`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) {
        setMsg("No se pudo generar el PDF");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Arauco-Seam-OT-${workOrder?.n_ot ?? workOrderId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg("PDF descargado");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error al descargar PDF");
    }
  }

  if (loading) return <p className="text-sm text-zinc-600">Cargando OT…</p>;
  if (error) return <p className="text-sm text-red-600">{error.message}</p>;
  if (!workOrder) return <p className="text-sm text-zinc-600">OT no encontrada.</p>;

  const puedeIniciar = vista === "PENDIENTE";
  const puedeCompletar = vista === "EN_CURSO";
  const cerrada = vista === "COMPLETADA";

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">OT {workOrder.n_ot}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span
            className={cn(
              "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase",
              statusBadgeClass(vista),
            )}
          >
            {vistaLabel(vista)}
          </span>
          <span>
            {workOrder.equipo_codigo ?? workOrder.codigo_activo_snapshot} · {workOrder.especialidad} ·{" "}
            {workOrderSubtipo(workOrder)}
          </span>
        </div>
      </div>

      {msg ? (
        <p className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950">
          {msg}
        </p>
      ) : null}

      {cerrada ? (
        <Button type="button" variant="outline" onClick={() => void downloadPdf()}>
          <Download className="mr-2 h-4 w-4" />
          Descargar PDF
        </Button>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Información</CardTitle>
          <CardDescription>Aviso, equipo y ubicación</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-zinc-500">Aviso</p>
              <p className="font-mono font-semibold">
                {workOrder.aviso_numero || workOrder.aviso_id || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500">Centro</p>
              <p>{workOrder.centro}</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500">Equipo</p>
            <Link
              href={`/activos/${workOrder.asset_id}`}
              className="font-mono text-blue-600 underline dark:text-blue-400"
            >
              {workOrder.equipo_codigo ?? workOrder.codigo_activo_snapshot}
            </Link>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500">Ubicación técnica</p>
            <p>
              {workOrder.ubicacion_tecnica}
              {workOrder.denom_ubic_tecnica ? ` · ${workOrder.denom_ubic_tecnica}` : null}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            {puedeIniciar ? (
              <Button type="button" onClick={() => void onIniciar()}>
                Iniciar
              </Button>
            ) : null}
            {puedeCompletar ? (
              <Button type="button" variant="default" onClick={() => setCerrarOpen(true)}>
                Completar
              </Button>
            ) : null}
          </div>

          <div className="pt-4">
            <WorkOrderInformeForm
              key={`${workOrder.id}-${workOrder.updated_at?.toMillis?.() ?? 0}`}
              workOrder={workOrder}
              onMessage={setMsg}
            />
          </div>
        </CardContent>
      </Card>

      {showChecklist ? (
        <Card>
          <CardHeader>
            <CardTitle>Checklist</CardTitle>
            <CardDescription>
              {clLoading ? "Cargando…" : `${checklistDone} / ${checklistItems.length} ítems`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {!checklistItems.length ? (
              <p className="text-sm text-zinc-500">Sin ítems de checklist.</p>
            ) : (
              checklistItems.map((it) => {
                if (it.tipo !== "BOOLEANO") {
                  return (
                    <div key={it.id} className="rounded-md border border-zinc-200 p-2 text-sm dark:border-zinc-800">
                      <p className="font-medium">{it.descripcion}</p>
                      <p className="text-xs text-zinc-500">Tipo {it.tipo} (no editable aquí)</p>
                    </div>
                  );
                }
                const serverVal = it.respuesta_boolean === true;
                const checked = localCheck[it.id] ?? serverVal;
                return (
                  <label
                    key={it.id}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-200 p-2 dark:border-zinc-800"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={checked}
                      disabled={cerrada || vista === "CANCELADA"}
                      onChange={(e) => void toggleCheck(it.id, e.target.checked, serverVal)}
                    />
                    <span className="text-sm leading-snug">{it.descripcion}</span>
                  </label>
                );
              })
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Materiales</CardTitle>
          <CardDescription>{matLoading ? "Cargando…" : `${materials.length} registros`}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2 text-sm">
            {materials.map((m) => (
              <li key={m.id} className="rounded-md border border-zinc-100 px-2 py-1 dark:border-zinc-800">
                {materialLabel(m)}
              </li>
            ))}
          </ul>
          {!cerrada && vista !== "CANCELADA" ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setMatOpen((o) => !o)}>
                + Agregar material
              </Button>
              {matOpen ? (
                <form onSubmit={(e) => void submitMaterial(e)} className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                  <Input value={matDesc} onChange={(e) => setMatDesc(e.target.value)} placeholder="Descripción" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={matCant} onChange={(e) => setMatCant(e.target.value)} placeholder="Cantidad" />
                    <Input value={matUd} onChange={(e) => setMatUd(e.target.value)} placeholder="Unidad" />
                  </div>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={matOrigen}
                    onChange={(e) => setMatOrigen(e.target.value as "ARAUCO" | "EXTERNO")}
                  >
                    <option value="ARAUCO">ARAUCO</option>
                    <option value="EXTERNO">EXTERNO</option>
                  </select>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm">
                      Guardar
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setMatOpen(false)}>
                      Cerrar
                    </Button>
                  </div>
                </form>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      {cerrarOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center">
          <div
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cerrar-ot-title"
          >
            <h2 id="cerrar-ot-title" className="text-lg font-semibold">
              Cerrar orden de trabajo
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Checklist: {checklistDone}/{checklistItems.length || 0} · Materiales: {materials.length}
            </p>

            <div className="mt-4 space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Nombre usuario firmante (conformidad)</label>
                <Input value={fUserName} onChange={(e) => setFUserName(e.target.value)} autoComplete="name" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Nombre del técnico</label>
                <Input value={fTechName} onChange={(e) => setFTechName(e.target.value)} />
              </div>

              <div ref={sigWrapRef} className="space-y-4">
                <div>
                  <p className="mb-1 text-sm font-medium">Firma del usuario (conformidad)</p>
                  <SignaturePad width={sigW} height={160} onChange={setFUserPad} className="max-w-full" />
                </div>
                <div>
                  <p className="mb-1 text-sm font-medium">Firma del técnico</p>
                  <SignaturePad width={sigW} height={160} onChange={setFTechPad} className="max-w-full" />
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" onClick={() => void confirmarCierre()}>
                Confirmar cierre
              </Button>
              <Button type="button" variant="outline" onClick={() => setCerrarOpen(false)}>
                Volver
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Button variant="outline" asChild>
        <Link href="/tareas">Volver a tareas</Link>
      </Button>
    </div>
  );
}
