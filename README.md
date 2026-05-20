# NGS Mini Galaxy

Academic MVP inspired by Galaxy for basic NGS analysis from FASTQ files.

## Stack

- Frontend: Next.js 16, App Router, TypeScript, Tailwind CSS
- Backend: FastAPI, SQLite, SQLAlchemy, JWT auth
- Pipeline: fake runner now, real subprocess-based bioinformatics tools later

## Repository Layout

- `frontend/` - web UI for auth, dashboard, projects, uploads, and job views
- `backend/` - FastAPI app split into `routers`, `models`, `schemas`, and `services`
- `docs/` - project plan and specification
- `scripts/install-bio-tools.sh` - helper installer for required CLI tools

## Run Locally

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Optional demo seed:

```bash
cd backend
python -m seeds.demo_seed
```

Demo credentials: `demo@example.com` / `demo12345`

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Frontend expects the API at `http://127.0.0.1:8000` by default.

## Run With Docker

This is the closest setup to the target deployment model: tools run on the application side, not on the user's machine.

```bash
docker compose up --build
```

Services:

- frontend: `http://localhost:3000`
- backend API: `http://localhost:8000`

Persistent data is stored in the Docker volume `backend-data`, including:

- SQLite database
- uploaded FASTQ files
- job work directories
- generated outputs

To stop the stack:

```bash
docker compose down
```

To remove persisted backend data as well:

```bash
docker compose down -v
```

## Bioinformatics Toolchain

If you want to run the backend outside Docker, install the bioinformatics tools locally:

```bash
chmod +x scripts/install-bio-tools.sh
./scripts/install-bio-tools.sh
```

The app exposes tool readiness at:

```bash
curl http://127.0.0.1:8000/system/tools
```

Expected tools:

- `fastqc`
- `multiqc`
- `fastq-dump`
- `fasterq-dump`
- `bwa`
- `samtools`
- `bcftools`

Notes:

- `FastQC` needs Java installed.
- `SRA Toolkit` provides `fastq-dump` and `fasterq-dump`.
- The current job runner is still a fake runner, but the environment check is now ready for the real subprocess implementation.
# ngs-mini-galaxy
