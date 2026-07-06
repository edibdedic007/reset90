#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
POSTGRES_USER="${POSTGRES_USER:-reset90}"
POSTGRES_DB="${POSTGRES_DB:-reset90}"
DB_CONTAINER="${DB_CONTAINER:-reset90-db}"

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y-%m-%d_%H-%M-%S)"
OUT="$BACKUP_DIR/reset90_${TS}.sql.gz"

echo "Creating database backup: $OUT"
docker exec "$DB_CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT"

echo "Backup created: $OUT"
