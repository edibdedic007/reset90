#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
ENV_FILE="${RESET90_ENV_FILE:-$REPO_ROOT/.env.production}"
COMPOSE_FILE="${RESET90_COMPOSE_FILE:-$REPO_ROOT/docker-compose.production.yml}"

source "$SCRIPT_DIR/lib/production-env.sh"

if [[ "$ENV_FILE" != /* ]]; then
  ENV_FILE="$PWD/$ENV_FILE"
fi
if [[ "$COMPOSE_FILE" != /* ]]; then
  COMPOSE_FILE="$PWD/$COMPOSE_FILE"
fi

# Prevent ambient shell values from overriding explicit production env-file values.
for key in "${PRODUCTION_ENV_KEYS[@]}"; do
  unset "$key"
done

export RESET90_ENV_FILE="$ENV_FILE"
exec docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
