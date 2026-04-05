"use client";

import { actionImportAssetsExcel } from "@/app/actions/assets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DEFAULT_CENTRO } from "@/lib/config/app-config";
import { getClientIdToken, useAuthUser, useUserProfile } from "@/modules/users/hooks";
import { FileSpreadsheet } from "lucide-react";
import { useCallback, useState } from "react";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function AssetExcelImportPanel() {
  const { user, loading: authLoading } = useAuthUser();
  const { profile, loading: profileLoading } = useUserProfile(user?.uid);
  const [sector, setSector] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const loading = authLoading || profileLoading;
  const canImport = profile?.rol === "admin";

  const applyDefaultSector = useCallback(() => {
    setSector((prev) => (prev.trim() ? prev : profile?.centro ?? DEFAULT_CENTRO));
  }, [profile?.centro]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setMessage(null);
    setWarnings([]);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!canImport) {
      setMessage("Solo administradores pueden importar equipos.");
      return;
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      setMessage("Usá un archivo Excel (.xlsx o .xls).");
      return;
    }
    const sec = sector.trim() || profile?.centro || DEFAULT_CENTRO;
    if (!sec.trim()) {
      setMessage("Completá el centro o planta (sector).");
      return;
    }

    setBusy(true);
    try {
      const fileBase64 = arrayBufferToBase64(await file.arrayBuffer());
      const token = await getClientIdToken();
      if (!token) {
        setMessage("Sesión expirada; volvé a iniciar sesión.");
        return;
      }
      const res = await actionImportAssetsExcel(token, {
        fileBase64,
        sectorCentro: sec.trim(),
      });
      if (!res.ok) {
        setMessage(res.error.message);
        return;
      }
      setWarnings(res.data.warnings);
      setMessage(
        res.data.imported === 0
          ? "No se importó ninguna fila. Revisá el formato del Excel y las advertencias."
          : `Importación lista: ${res.data.imported} equipos.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error al importar");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) {
    return null;
  }

  if (!canImport) {
    return null;
  }

  return (
    <Card className="border-amber-200/80 dark:border-amber-900/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="h-4 w-4 opacity-90" aria-hidden />
          Carga masiva desde Excel
        </CardTitle>
        <CardDescription>
          Subí el listado (.xlsx) e indicá la planta o centro (sector). Mismo formato que el script de
          importación: hojas de aires y grupos generadores. Si el Excel trae columna «Centro» o «Planta»,
          ese valor manda fila a fila.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1.5">
            <label htmlFor="asset-sector" className="text-xs font-medium text-muted">
              Centro / planta (sector)
            </label>
            <Input
              id="asset-sector"
              placeholder={profile?.centro ?? DEFAULT_CENTRO}
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              disabled={busy}
              autoComplete="off"
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={applyDefaultSector} disabled={busy}>
            Usar mi centro del perfil
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
            <span className="rounded-lg border border-border bg-foreground/[0.03] px-3 py-2 dark:bg-white/[0.04]">
              {busy ? "Importando…" : "Elegir Excel"}
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={busy}
              onChange={onFileChange}
            />
          </label>
        </div>
        {message ? (
          <p className="text-sm font-medium text-foreground" role="status">
            {message}
          </p>
        ) : null}
        {warnings.length ? (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-border/80 bg-muted/30 p-3 text-xs text-muted">
            <p className="mb-2 font-medium text-foreground">Advertencias</p>
            <ul className="list-inside list-disc space-y-0.5">
              {warnings.slice(0, 80).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            {warnings.length > 80 ? (
              <p className="mt-2 text-[11px]">… y {warnings.length - 80} más</p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
