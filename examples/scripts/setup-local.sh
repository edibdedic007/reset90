#!/usr/bin/env bash
set -euo pipefail

echo "Setting up Reset90 local developer environment"

command -v node >/dev/null || { echo "node not found"; exit 1; }
command -v npm >/dev/null || { echo "npm not found"; exit 1; }
command -v docker >/dev/null || { echo "docker not found"; exit 1; }

test -f .env.local || cp .env.local.example .env.local
npm install

docker compose -f docker-compose.local.yml up -d db

echo "Waiting for database..."
sleep 5
npm run db:migrate --if-present
npm run db:seed --if-present

echo "Local setup complete. Run: make dev"
