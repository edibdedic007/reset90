#!/usr/bin/env bash
set -euo pipefail

FILE="${1:-}"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Usage: ./scripts/restore-db.sh <backup.sql.gz>"
  exit 1
fi

POSTGRES_USER="${POSTGRES_USER:-reset90}"
POSTGRES_DB="${POSTGRES_DB:-reset90}"
SERVICE="${POSTGRES_SERVICE:-db}"
CONTAINER="${DB_CONTAINER:-}"

read -r -p "This will restore into $POSTGRES_DB. Type RESTORE to continue: " CONFIRM
if [[ "$CONFIRM" != "RESTORE" ]]; then
  echo "Restore cancelled."
  exit 1
fi

echo "Creating safety backup before restore..."
./scripts/backup-db.sh || true

if [[ -n "$CONTAINER" ]] && docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  gunzip -c "$FILE" | docker exec -i "$CONTAINER" psql -U "$POSTGRES_USER" "$POSTGRES_DB"
elif docker compose ps "$SERVICE" >/dev/null 2>&1; then
  gunzip -c "$FILE" | docker compose exec -T "$SERVICE" psql -U "$POSTGRES_USER" "$POSTGRES_DB"
elif docker compose ps postgres >/dev/null 2>&1; then
  gunzip -c "$FILE" | docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB"
else
  echo "Postgres service/container not found. Set POSTGRES_SERVICE or DB_CONTAINER."
  exit 1
fi

echo "Restore complete."
