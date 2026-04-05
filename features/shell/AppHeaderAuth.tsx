"use client";

import { Button } from "@/components/ui/button";
import { getFirebaseAuth } from "@/firebase/firebaseClient";
import { useAuthUser } from "@/modules/users/hooks";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { LogOut } from "lucide-react";

export function AppHeaderAuth() {
  const pathname = usePathname();
  const { user, loading } = useAuthUser();
  const hideAuth = pathname === "/login";

  async function signOut() {
    await getFirebaseAuth().signOut();
    window.location.href = "/login";
  }

  if (hideAuth) {
    return null;
  }

  if (loading) {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-header-muted" aria-live="polite">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-brand" />
        Sesión…
      </span>
    );
  }

  if (!user) {
    return (
      <Button
        asChild
        size="sm"
        variant="outline"
        className="border-white/35 bg-transparent text-header-fg hover:bg-white/10 hover:text-header-fg"
      >
        <Link href="/login">Entrar</Link>
      </Button>
    );
  }

  return (
    <div className="flex max-w-[16rem] flex-col items-end gap-2 sm:max-w-none sm:flex-row sm:items-center sm:gap-3">
      <span
        className="max-w-[14rem] truncate rounded-md border border-white/15 bg-white/8 px-2.5 py-1 text-xs font-medium text-header-fg"
        title={user.email ?? undefined}
      >
        {user.email ?? user.uid}
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="gap-1.5 text-header-muted hover:bg-white/8 hover:text-header-fg"
        onClick={() => void signOut()}
      >
        <LogOut className="h-3.5 w-3.5 opacity-80" aria-hidden />
        Salir
      </Button>
    </div>
  );
}
