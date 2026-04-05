"use client";

import { AssetQrCard } from "@/components/assets/AssetQrCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAssetLive } from "@/modules/assets/hooks";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function ActivoDetallePage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : undefined;
  const { asset, loading, error } = useAssetLive(id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activo</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Ficha y QR para campo.</p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm font-medium">
          <Link href="/activos" className="text-zinc-700 underline dark:text-zinc-300">
            Lista
          </Link>
          <Link href="/activos/escaner" className="text-zinc-700 underline dark:text-zinc-300">
            Escaner
          </Link>
        </div>
      </div>

      {loading ? <p className="text-sm text-zinc-600">Cargando…</p> : null}
      {error ? <p className="text-sm text-red-600">{error.message}</p> : null}
      {!loading && !error && !asset ? (
        <p className="text-sm text-zinc-600">No se encontró el activo.</p>
      ) : null}

      {asset ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-mono text-lg">{asset.codigo_nuevo}</CardTitle>
              <CardDescription>{asset.denominacion}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="text-zinc-500">Ubicación técnica: </span>
                {asset.ubicacion_tecnica}
              </div>
              <div>
                <span className="text-zinc-500">Centro: </span>
                {asset.centro}
              </div>
              <div>
                <span className="text-zinc-500">Operativo: </span>
                {asset.activo_operativo ? "Sí" : "No"}
              </div>
              {asset.codigo_legacy ? (
                <div>
                  <span className="text-zinc-500">Código legacy: </span>
                  {asset.codigo_legacy}
                </div>
              ) : null}
            </CardContent>
          </Card>
          <AssetQrCard asset={asset} />
        </div>
      ) : null}
    </div>
  );
}
