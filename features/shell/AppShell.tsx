import { AppHeaderAuth } from "@/features/shell/AppHeaderAuth";
import { AppMainNav } from "@/features/shell/AppMainNav";
import Link from "next/link";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-backdrop flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 bg-header text-header-fg shadow-md">
        <div className="h-0.5 w-full bg-brand" aria-hidden />
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3 sm:gap-x-5">
          <Link
            href="/dashboard"
            className="group flex shrink-0 items-center gap-3 rounded-lg outline-none ring-0 transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--header-bg)]"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand font-mono text-sm font-bold text-brand-foreground shadow-sm"
              aria-hidden
            >
              AS
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-header-muted">
                Mantenimiento industrial
              </span>
              <span className="truncate text-sm font-bold tracking-tight text-header-fg">Arauco-Seam</span>
            </span>
          </Link>

          <AppMainNav />

          <div className="ml-auto flex shrink-0 items-center">
            <AppHeaderAuth />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
