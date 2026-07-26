#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ENV_FILE="${1:-}"

if [[ -n "$ENV_FILE" ]]; then
  source "$SCRIPT_DIR/lib/production-env.sh"
  APP_URL="$(production_env_value "$ENV_FILE" APP_URL)"
else
  APP_URL="${APP_URL:-http://localhost:3000}"
fi

PATH_TO_CHECK="${HEALTH_PATH:-/api/ready}"
TARGET="${APP_URL}${PATH_TO_CHECK}"

effective_url="$(
  curl \
    --fail \
    --silent \
    --show-error \
    --location \
    --output /dev/null \
    --write-out '%{url_effective}' \
    --connect-timeout 5 \
    --max-time 15 \
    "$TARGET"
)"

if [[ "$effective_url" != "$TARGET" ]]; then
  echo "Public readiness check reached an unexpected origin." >&2
  exit 1
fi

echo "Public readiness check passed."
