#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3000}"

echo "Checking $APP_URL/api/health"
curl -fsS "$APP_URL/api/health"
echo
