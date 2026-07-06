#!/usr/bin/env bash
set -euo pipefail

echo "Setting up Reset90 local developer-only environment"

command -v docker >/dev/null || { echo "docker not found"; exit 1; }
docker compose version >/dev/null || { echo "docker compose not found"; exit 1; }
command -v node >/dev/null || { echo "node not found"; exit 1; }
command -v pnpm >/dev/null || { echo "pnpm not found"; exit 1; }

if [[ ! -f .env.local && -f .env.local.example ]]; then
  cp .env.local.example .env.local
  echo "Created .env.local from .env.local.example. Review it before running the app."
fi

pnpm install --frozen-lockfile

compose=(docker compose --env-file .env.local -f docker-compose.local.yml)
"${compose[@]}" up -d db

echo "Waiting for PostgreSQL..."
for _ in {1..30}; do
  if "${compose[@]}" exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
    echo "PostgreSQL is ready."
    echo "Local setup complete. Run: make dev"
    exit 0
  fi
  sleep 1
done

echo "PostgreSQL did not become ready within 30 seconds."
"${compose[@]}" logs --tail=50 db
exit 1
