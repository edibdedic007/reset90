#!/usr/bin/env bash
set -euo pipefail

echo "Setting up Reset90 local developer-only environment"

command -v docker >/dev/null || { echo "docker not found"; exit 1; }
if ! command -v node >/dev/null; then
  echo "node not found. Install Node before scaffolding/running the app."
fi

if [[ ! -f .env.local && -f .env.local.example ]]; then
  cp .env.local.example .env.local
  echo "Created .env.local from .env.local.example. Review it before running the app."
fi

if [[ -f package.json ]]; then
  if [[ -f pnpm-lock.yaml ]]; then pnpm install
  elif [[ -f yarn.lock ]]; then yarn install
  elif [[ -f bun.lockb || -f bun.lock ]]; then bun install
  elif [[ -f package-lock.json ]]; then npm ci
  else npm install
  fi
else
  echo "No package.json yet. Codex should scaffold the app in Phase 1."
fi

if [[ -f docker-compose.local.yml ]]; then
  docker compose -f docker-compose.local.yml up -d db || docker compose -f docker-compose.local.yml up -d postgres || docker compose -f docker-compose.local.yml up -d
elif [[ -f compose.local.yml ]]; then
  docker compose -f compose.local.yml up -d
else
  echo "No local compose file found yet. Codex should add/adapt one in the environment phase."
fi

if [[ -f package.json ]]; then
  npm run db:migrate --if-present || true
  npm run db:seed --if-present || true
fi

echo "Local setup complete."
