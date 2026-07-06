#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.production}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.production.example and fill real values."
  exit 1
fi

./scripts/env-check.sh "$ENV_FILE"

if grep -qiE "change-me|replace-with|example\.com|local-dev|dev_password" "$ENV_FILE"; then
  echo "Production env still contains placeholder/example values."
  exit 1
fi

if ! grep -qE '^NODE_ENV=production$' "$ENV_FILE"; then
  echo "NODE_ENV must be production."
  exit 1
fi

if ! grep -qE '^AUTH_MODE=oidc$' "$ENV_FILE"; then
  echo "AUTH_MODE must be oidc in production."
  exit 1
fi

echo "Production preflight passed at env-file level. Add app-specific checks after scaffold."
