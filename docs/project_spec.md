Budujemy akademicką aplikację webową inspirowaną Galaxy do podstawowej analizy danych NGS z plików FASTQ.

Cel:
Aplikacja ma umożliwiać wielu użytkownikom rejestrację, logowanie, tworzenie własnych projektów i uruchamianie pipeline’u bioinformatycznego z poziomu przeglądarki. Każdy użytkownik ma widzieć tylko swoje projekty, analizy i pliki.

Stack:

- Frontend: Next.js z App Router i TypeScript
- Backend: FastAPI (Python)
- Baza danych: SQLite na start
- Auth: JWT
- Pipeline execution: Python subprocess
- File storage: lokalne katalogi na dysku
- Narzędzia bioinformatyczne: FastQC, MultiQC, Trimmomatic, BWA, samtools, bcftools

Główne funkcje:

1. Rejestracja i logowanie użytkownika
2. Tworzenie projektów
3. Upload plików FASTQ / FASTQ.GZ
4. Obsługa single-end i paired-end
5. Konfiguracja pipeline’u przez zaznaczanie kroków
6. Uruchamianie analizy
7. Śledzenie statusu joba: queued / running / completed / failed
8. Wyświetlanie logów dla każdego kroku
9. Wyświetlanie wyników:
    - raporty FastQC
    - raport MultiQC
    - pliki trimmed FASTQ
    - BAM / BAI
    - VCF
10. Historia analiz w obrębie projektu

Pipeline:

- upload FASTQ
- FastQC
- opcjonalnie Trimmomatic
- FastQC po trimowaniu
- MultiQC
- BWA alignment
- samtools sort/index
- bcftools variant calling

Zakres MVP:

- auth użytkowników
- projekty
- upload FASTQ
- uruchamianie pipeline’u
- statusy jobów
- logi
- lista plików wynikowych
- podstawowy dashboard

Architektura:
Frontend:

- /login
- /register
- /dashboard
- /projects
- /projects/[id]
- /jobs/[id]

Backend:

- POST /auth/register
- POST /auth/login
- GET /me
- POST /projects
- GET /projects
- GET /projects/{id}
- POST /projects/{id}/upload
- POST /projects/{id}/jobs
- GET /jobs/{id}
- GET /jobs/{id}/steps
- GET /jobs/{id}/logs
- GET /jobs/{id}/files

Modele danych:
User:

- id
- email
- password_hash
- created_at

Project:

- id
- user_id
- name
- description
- created_at

Job:

- id
- project_id
- sample_name
- status
- selected_steps
- created_at
- started_at
- finished_at
- working_dir

JobStep:

- id
- job_id
- step_name
- status
- command
- stdout_path
- stderr_path
- started_at
- finished_at

UploadFile:

- id
- project_id
- original_name
- stored_path
- file_type
- created_at

Wymagania techniczne:

- kod ma być czytelny i modularny
- frontend ma mieć prosty nowoczesny UI
- backend ma być podzielony na routers, models, schemas, services
- pipeline runner ma być oddzielony od endpointów API
- nie używać shell=True
- każda analiza ma mieć własny katalog roboczy
- przygotować przykładowe seed/demo dane i instrukcję uruchomienia

Najpierw wygeneruj strukturę repozytorium i MVP, a potem implementuj moduł po module.
