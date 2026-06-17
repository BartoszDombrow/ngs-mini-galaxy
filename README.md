# NGS Mini Galaxy

Projekt akademicki (MVP) inspirowany platformą Galaxy, przeznaczony do podstawowej analizy danych NGS (sekwencjonowania nowej generacji) z plików FASTQ.

## Technologie

- **Frontend:** Next.js 16 (App Router), TypeScript, Tailwind CSS
- **Backend:** FastAPI, SQLite, SQLAlchemy, uwierzytelnianie JWT
- **Narzędzia bioinformatyczne:** integracja z wierszem poleceń (np. FastQC, bwa, samtools).

## Struktura repozytorium

- `frontend/` - interfejs użytkownika (logowanie, kokpit, projekty, przesyłanie plików, widoki zadań)
- `backend/` - aplikacja API (podzielona logicznie na `routers`, `models`, `schemas` i `services`)
- `docs/` - plan projektu i specyfikacja
- `scripts/install-bio-tools.sh` - skrypt pomocniczy do instalacji wymaganych narzędzi konsolowych w systemie

## Uruchomienie za pomocą Dockera

Uruchomienie w środowisku Dockerowym izoluje narzędzia obliczeniowe od środowiska lokalnego i zapewnia spójność.

W głównym katalogu projektu uruchom komendę (flaga `--build` jest wymagana przy pierwszym uruchomieniu lub jeśli zmienisz pakiety w plikach `package.json` / `requirements.txt`):
```bash
docker compose up --build
```

Do standardowego uruchomienia bez przebudowywania wystarczy wpisać:
```bash
docker compose up
```

Usługi po uruchomieniu będą dostępne pod adresami:
- **Frontend:** `http://localhost:3000`
- **Backend API:** `http://localhost:8000`

Trwałe dane aplikacji przechowujemy w wolumenie `backend-data`. Zaliczają się do nich baza SQLite, wgrywane pliki FASTQ oraz pliki robocze i wyniki analiz.

Aby zatrzymać usługi, użyj:
```bash
docker compose down
```

Aby usunąć kontener wraz ze wszystkimi zapisanymi wynikami analiz i bazą danych:
```bash
docker compose down -v
```
