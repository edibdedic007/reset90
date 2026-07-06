#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/reset90}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
APP_URL="${APP_URL:-http://localhost:3000}"

echo "Deploying Reset90 production from $APP_DIR"
cd "$APP_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash changes before deploy."
  exit 1
fi

git fetch origin
git switch main
git pull --ff-only origin main

echo "Creating pre-deploy backup..."
./scripts/backup-db.sh

echo "Building image..."
docker compose -f "$COMPOSE_FILE" build

echo "Running migrations..."
docker compose -f "$COMPOSE_FILE" run --rm app npm run db:migrate

echo "Starting services..."
docker compose -f "$COMPOSE_FILE" up -d

echo "Running healthcheck..."
APP_URL="$APP_URL" ./scripts/healthcheck.sh

echo "Deploy successful."
