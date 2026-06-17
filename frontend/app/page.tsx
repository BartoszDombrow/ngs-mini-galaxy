import Link from "next/link";

import { AppShell } from "./_components/app-shell";


export default function HomePage() {
  return (
    <AppShell>
      <section className="flex flex-col items-center justify-center pt-20">
        <div className="card rounded-[2rem] p-10 max-w-3xl text-center">
          <p className="text-sm uppercase tracking-[0.24em] text-muted">Platforma Bioinformatyczna</p>
          <h1 className="mt-4 mx-auto max-w-2xl text-5xl font-semibold tracking-tight">
            Narzędzie do uruchamiania i śledzenia analiz NGS w chmurze
          </h1>
          <p className="mt-6 mx-auto max-w-2xl text-lg leading-8 text-muted">
            Kompleksowe rozwiązanie do zarządzania projektami sekwencjonowania. Pozwala na bezproblemowy upload plików FASTQ, konfigurację przepływów pracy (potoków analitycznych) i błyskawiczny podgląd wariantów w locie.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link href="/register" className="rounded-full bg-accent px-6 py-3 font-medium text-white shadow-lg shadow-accent/25 hover:shadow-accent/40 transition-shadow">
              Załóż konto
            </Link>
            <Link href="/dashboard" className="pill rounded-full px-6 py-3 font-medium hover:bg-line transition-colors">
              Otwórz panel zarządzania
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
