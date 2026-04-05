import Link from "next/link";

/** Placeholder admin: la carga de Excel/API se implementa aparte. */
export default function CargarProgramaPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4 px-1 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Cargar programa semanal</h1>
      <p className="text-sm text-muted-foreground">
        Esta pantalla es solo para administradores. El flujo de importación o edición masiva se conectará aquí.
      </p>
      <Link href="/programa" className="text-sm font-medium text-brand underline-offset-4 hover:underline">
        Volver al programa
      </Link>
    </div>
  );
}
