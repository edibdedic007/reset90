#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
POSTGRES_USER="${POSTGRES_USER:-reset90}"
POSTGRES_DB="${POSTGRES_DB:-reset90}"
SERVICE="${POSTGRES_SERVICE:-db}"
CONTAINER="${DB_CONTAINER:-}"

mkdir -p "$BACKUP_DIR"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/reset90_${TS}.sql.gz"

if [[ -n "$CONTAINER" ]] && docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker exec "$CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT"
elif docker compose ps "$SERVICE" >/dev/null 2>&1; then
  docker compose exec -T "$SERVICE" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT"
elif docker compose ps postgres >/dev/null 2>&1; then
  docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT"
else
  echo "Postgres service/container not found. Set POSTGRES_SERVICE or DB_CONTAINER."
  exit 1
fi

echo "Backup written: $OUT"
