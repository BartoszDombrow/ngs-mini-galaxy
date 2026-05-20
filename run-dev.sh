#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

if [[ ! -d "$BACKEND_DIR/.venv" ]]; then
  echo "Missing backend virtualenv: $BACKEND_DIR/.venv"
  echo "Run:"
  echo "  cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi

if [[ ! -f "$FRONTEND_DIR/.env.local" ]]; then
  cp "$FRONTEND_DIR/.env.example" "$FRONTEND_DIR/.env.local"
fi

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "Starting backend on http://127.0.0.1:8000"
(
  cd "$BACKEND_DIR"
  source .venv/bin/activate
  exec uvicorn app.main:app --reload
) &
BACKEND_PID=$!

echo "Starting frontend on http://127.0.0.1:3000"
(
  cd "$FRONTEND_DIR"
  exec npm run dev
) &
FRONTEND_PID=$!

wait "$BACKEND_PID" "$FRONTEND_PID"
