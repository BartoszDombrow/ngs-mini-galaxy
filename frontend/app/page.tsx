import Link from "next/link";

import { AppShell } from "./_components/app-shell";

const featureCards = [
  "Uwierzytelnianie użytkowników przez JWT",
  "Pliki FASTQ izolowane per projekt",
  "Statusy jobów i logi wykonywania",
  "Raporty i pliki wynikowe dostępne z poziomu UI",
];

export default function HomePage() {
  return (
    <AppShell>
      <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="card rounded-[2rem] p-8">
          <p className="text-sm uppercase tracking-[0.24em] text-muted">Przestrzeń MVP</p>
          <h1 className="mt-3 max-w-2xl text-5xl font-semibold tracking-tight">
            Panel webowy do uruchamiania lekkiego pipeline’u analizy NGS.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted">
            Repozytorium rozwija akademickie MVP inspirowane Galaxy: rejestracja, projekty, upload FASTQ, uruchamianie pipeline’u oraz podgląd logów i wyników.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="rounded-full bg-accent px-5 py-3 font-medium text-white">
              Załóż konto
            </Link>
            <Link href="/dashboard" className="pill rounded-full px-5 py-3 font-medium">
              Otwórz panel
            </Link>
          </div>
        </div>
        <div className="card rounded-[2rem] p-8">
          <p className="text-sm uppercase tracking-[0.24em] text-muted">Zakres MVP</p>
          <div className="mt-5 space-y-3">
            {featureCards.map((item) => (
              <div key={item} className="pill rounded-2xl px-4 py-3 text-sm">
                {item}
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
            Domyślny adres backendu: <code>http://127.0.0.1:8000</code>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
