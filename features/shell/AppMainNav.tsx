"use client";

import { cn } from "@/lib/utils";
import { useAuthUser, useUserProfile } from "@/modules/users/hooks";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Panel" },
  { href: "/programa", label: "Programa" },
  { href: "/tareas", label: "Tareas" },
  { href: "/materiales", label: "Materiales" },
  { href: "/activos", label: "Activos" },
] as const;

function pathMatches(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppMainNav() {
  const pathname = usePathname();
  const { user } = useAuthUser();
  const profileUid =
    pathname === "/login" || pathname?.startsWith("/login/") ? undefined : user?.uid;
  const { profile } = useUserProfile(profileUid);

  const linkClass = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150",
      active
        ? "bg-white/12 text-header-fg shadow-sm ring-1 ring-brand/40"
        : "text-header-muted hover:bg-white/8 hover:text-header-fg",
    );

  return (
    <nav className="order-3 flex w-full flex-wrap items-center justify-center gap-0.5 sm:order-none sm:flex-1">
      {links.map((l) => {
        const active = pathMatches(l.href, pathname);
        return (
          <Link key={l.href} href={l.href} className={linkClass(active)}>
            {l.label}
          </Link>
        );
      })}
      {profile?.rol === "admin" ? (
        <Link
          href="/superadmin"
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
            pathname?.startsWith("/superadmin")
              ? "bg-brand text-brand-foreground shadow-sm"
              : "text-header-muted ring-1 ring-white/15 hover:bg-white/10 hover:text-header-fg",
          )}
        >
          Superadmin
        </Link>
      ) : null}
    </nav>
  );
}
