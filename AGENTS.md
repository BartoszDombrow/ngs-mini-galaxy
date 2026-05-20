# Repository Guidelines

## Project Structure & Module Organization
The repository is split into `frontend/` and `backend/`. The frontend is a Next.js 16 app using the App Router; pages live in `frontend/app/`, shared UI in `frontend/app/_components/`, API helpers in `frontend/lib/`, and shared types in `frontend/types/`. The backend is a FastAPI app under `backend/app/`, organized into `routers/`, `services/`, `models/`, `schemas/`, `db/`, and `core/`. Design notes belong in `docs/`. Utility scripts live in `scripts/`. Runtime SQLite data and uploaded/generated files are stored under backend-managed storage paths and should not be committed.

## Build, Test, and Development Commands
- `./run-dev.sh`: starts backend on `127.0.0.1:8000` and frontend on `127.0.0.1:3000`.
- `cd frontend && npm install`: installs frontend dependencies.
- `cd frontend && npm run dev`: runs the Next.js dev server.
- `cd frontend && npm run build`: creates a production build and catches route/type issues.
- `cd frontend && npm run lint`: runs ESLint for the frontend codebase.
- `cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`: prepares the backend environment.
- `cd backend && uvicorn app.main:app --reload`: runs the FastAPI API locally.
- `docker compose up --build`: runs the full stack in containers.

## Coding Style & Naming Conventions
Use TypeScript with strict typing in the frontend and Python type hints in the backend. Prefer functional React components, PascalCase for component names, camelCase for variables/functions, and snake_case for Python modules. Follow existing formatting: 2-space indentation in CSS/Markdown, typical Prettier-style formatting in `.tsx`, and clear service-oriented backend modules. Lint with `frontend/eslint.config.mjs` before submitting frontend changes.

## Testing Guidelines
There is no committed automated test suite yet. Treat `cd frontend && npm run lint` and `cd frontend && npm run build` as the minimum verification gate. For backend changes, at least start the API locally and exercise affected endpoints. When adding tests, place frontend tests beside features or under `frontend/__tests__/` using `*.test.ts` or `*.test.tsx`.

## Commit & Pull Request Guidelines
The visible history starts with `Initial commit from Create Next App`, so keep commit messages short, imperative, and specific, for example `Add job detail polling` or `Validate project file types`. PRs should include a concise summary, affected areas (`frontend`, `backend`, `docs`, `scripts`), verification steps, and screenshots for UI changes.

## Security & Configuration Tips
Do not commit `.env.local`, virtual environments, database files, uploaded data, or build output. Keep secrets in untracked env files. If running outside Docker, verify tool availability with `GET /system/tools` before testing pipeline steps.
