#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3000}"
EXPORT_DIR="${EXPORT_DIR:-./exports}"
OUT="$EXPORT_DIR/reset90_export_$(date -u +%Y%m%dT%H%M%SZ).json"
mkdir -p "$EXPORT_DIR"

echo "Exporting data to $OUT"
# Replace with authenticated export once app auth is implemented.
curl -fsS "$APP_URL/api/export/full" -o "$OUT"
echo "Export complete: $OUT"
