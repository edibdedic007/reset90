#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3000}"
PATH_TO_CHECK="${HEALTH_PATH:-/api/health}"

echo "Checking ${APP_URL}${PATH_TO_CHECK}"
curl -fsS "${APP_URL}${PATH_TO_CHECK}"
echo
