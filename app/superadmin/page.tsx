"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useAuthUser, useUserProfile } from "@/modules/users/hooks";

export default function SuperAdminPage() {
  const { user, loading: authLoading } = useAuthUser();
  const { profile, loading: profileLoading, error } = useUserProfile(user?.uid);

  const loading = authLoading || profileLoading;

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-600 dark:text-zinc-400">
        Cargando perfil…
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-600">
        No se pudo leer el perfil: {error.message}
      </p>
    );
  }

  if (!user) {
    return null;
  }

  if (profile?.rol !== "admin") {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-8">
        <Card className="border-amber-200 dark:border-amber-900">
          <CardHeader>
            <CardTitle>Acceso restringido</CardTitle>
            <CardDescription>
              Esta área es solo para usuarios con <span className="font-mono">rol: admin</span> en Firestore
              (<code className="text-xs">users/{'{uid}'}</code>).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            <p>
              Tu rol actual:{" "}
              <span className="font-mono">{profile?.rol ?? "sin documento users"}</span>
            </p>
            <p>
              Configurá <span className="font-mono">SUPERADMIN_EMAIL</span> en{" "}
              <span className="font-mono">.env.local</span> con tu correo, reiniciá el servidor y volvé a entrar
              para que el bootstrap promueva a administrador.
            </p>
            <Button asChild variant="outline">
              <Link href="/dashboard">Volver al panel</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 py-2">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-amber-900 dark:text-amber-100">
          Superadmin
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {profile.display_name} · <span className="font-mono">{user.email}</span> · centro{" "}
          <span className="font-mono">{profile.centro}</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Estado</CardTitle>
            <CardDescription>Base para herramientas de gobierno</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            <p>
              Rol: <span className="font-mono">admin</span>
            </p>
            <p>
              UID: <span className="font-mono text-xs">{user.uid}</span>
            </p>
            <p className="text-xs">
              No guardamos contraseñas en el código: la cuenta vive solo en Firebase Auth.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Próximos pasos</CardTitle>
            <CardDescription>Extender desde aquí</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-zinc-600 dark:text-zinc-400">
            <ul className="list-inside list-disc space-y-1">
              <li>Gestión de usuarios y roles (Firestore + actions)</li>
              <li>Auditoría y export de `historial` OT</li>
              <li>Feature flags por planta / centro</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
