#!/usr/bin/env bash
set -euo pipefail

FILE="${1:-}"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Usage: ./scripts/restore-db.sh <backup.sql.gz>"
  exit 1
fi

POSTGRES_USER="${POSTGRES_USER:-reset90}"
POSTGRES_DB="${POSTGRES_DB:-reset90}"
DB_CONTAINER="${DB_CONTAINER:-reset90-db}"

echo "About to restore $FILE into $POSTGRES_DB on $DB_CONTAINER"
read -r -p "Type RESTORE to continue: " CONFIRM
if [[ "$CONFIRM" != "RESTORE" ]]; then
  echo "Restore cancelled."
  exit 1
fi

echo "Creating safety backup before restore..."
./scripts/backup-db.sh

echo "Dropping and recreating database..."
docker exec "$DB_CONTAINER" psql -U "$POSTGRES_USER" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB';"
docker exec "$DB_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB"
docker exec "$DB_CONTAINER" createdb -U "$POSTGRES_USER" "$POSTGRES_DB"

echo "Restoring..."
gunzip -c "$FILE" | docker exec -i "$DB_CONTAINER" psql -U "$POSTGRES_USER" "$POSTGRES_DB"

echo "Restore complete."
