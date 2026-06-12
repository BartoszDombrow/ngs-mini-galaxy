"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PropsWithChildren, useSyncExternalStore } from "react";

import { clearToken, getToken, subscribeToToken } from "@/lib/auth";

const navItems = [
  { href: "/dashboard", label: "Panel" },
  { href: "/projects", label: "Projekty" },
  { href: "/login", label: "Logowanie" },
];

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();
  const hasToken = useSyncExternalStore(
    subscribeToToken,
    () => Boolean(getToken()),
    () => false,
  );
  const visibleNavItems = navItems.filter((item) => item.href !== "/login" || !hasToken);

  return (
    <div className="min-h-screen">
      <header className="border-b border-line/80 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <Link href="/" className="text-lg font-semibold tracking-tight">
              NGS Mini Galaxy
            </Link>
            <p className="text-sm text-muted">Przesyłanie FASTQ, pipeline, logi i wyniki analiz</p>
          </div>
          <nav className="flex items-center gap-3">
            {visibleNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  pathname === item.href ? "bg-accent text-white" : "pill"
                }`}
              >
                {item.label}
              </Link>
            ))}
            {hasToken ? (
              <button
                type="button"
                className="rounded-full bg-accent-strong px-4 py-2 text-sm text-white"
                onClick={() => {
                  clearToken();
                  router.push("/login");
                }}
              >
                Wyloguj
              </button>
            ) : null}
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10">{children}</main>
    </div>
  );
}
