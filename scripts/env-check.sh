#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.local}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

required=(NODE_ENV APP_URL DATABASE_URL GPT_INGEST_TOKEN)
missing=0
for key in "${required[@]}"; do
  if ! grep -qE "^${key}=" "$ENV_FILE"; then
    echo "Missing $key in $ENV_FILE"
    missing=1
  fi
done

if [[ "$ENV_FILE" == *production* ]]; then
  prod_required=(AUTH_MODE AUTH_SECRET AUTH_AUTHENTIK_ID AUTH_AUTHENTIK_SECRET AUTH_AUTHENTIK_ISSUER AUTH_TRUST_HOST)
  for key in "${prod_required[@]}"; do
    if ! grep -qE "^${key}=" "$ENV_FILE"; then
      echo "Missing production key $key in $ENV_FILE"
      missing=1
    fi
  done
fi

if [[ "$missing" -eq 1 ]]; then
  exit 1
fi

echo "$ENV_FILE contains required baseline variables."
