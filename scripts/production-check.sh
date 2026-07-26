#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ENV_FILE="${1:-.env.production}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Production environment file is missing." >&2
  exit 1
fi

source "$SCRIPT_DIR/lib/production-env.sh"

declare -A values=()
errors=0

fail() {
  echo "$1" >&2
  errors=1
}

for key in "${PRODUCTION_ENV_KEYS[@]}"; do
  if ! value="$(production_env_value "$ENV_FILE" "$key")" || [[ -z "$value" ]]; then
    fail "Missing, empty, or duplicate production variable: $key"
    continue
  fi
  values["$key"]="$value"
done

if [[ "$errors" -ne 0 ]]; then
  exit 1
fi

[[ "${values[NODE_ENV]}" == "production" ]] ||
  fail "NODE_ENV must be production."
[[ "${values[AUTH_MODE]}" == "oidc" ]] ||
  fail "AUTH_MODE must be oidc in production."
[[ "${values[PORT]}" == "3000" ]] ||
  fail "PORT must be 3000 in production."
[[ "${values[AUTH_TRUST_HOST]}" == "true" ]] ||
  fail "AUTH_TRUST_HOST must be true behind the controlled Traefik route."

if [[ "${values[APP_URL]}" =~ ^https://([A-Za-z0-9.-]+)(:[0-9]{1,5})?$ ]]; then
  app_host="${BASH_REMATCH[1]}"
  [[ "$app_host" == "${values[RESET90_HOST]}" ]] ||
    fail "APP_URL hostname and RESET90_HOST must match exactly."
else
  fail "APP_URL must be one absolute HTTPS origin with no path."
fi

[[ "${values[RESET90_HOST]}" =~ ^[A-Za-z0-9.-]+$ ]] ||
  fail "RESET90_HOST must contain only a hostname."
[[ "${values[AUTH_AUTHENTIK_ISSUER]}" =~ ^https://[^/?#]+/[^?#]+/?$ ]] ||
  fail "AUTH_AUTHENTIK_ISSUER must be an absolute HTTPS issuer URL."
if [[ "${values[DATABASE_URL]}" =~ ^postgres(ql)?://([^:/?#@]+):[^@/?#]+@db(:[0-9]+)?/([^/?#]+)(\?.*)?$ ]]; then
  database_url_user="${BASH_REMATCH[2]}"
  database_url_database="${BASH_REMATCH[4]}"
  [[ "$database_url_user" == "${values[POSTGRES_USER]}" ]] ||
    fail "DATABASE_URL username must match POSTGRES_USER."
  [[ "$database_url_database" == "${values[POSTGRES_DB]}" ]] ||
    fail "DATABASE_URL database name must match POSTGRES_DB."
else
  fail "DATABASE_URL must use Compose service hostname db."
fi
[[ "${values[POSTGRES_USER]}" =~ ^[A-Za-z0-9_]+$ ]] ||
  fail "POSTGRES_USER contains unsupported characters."
[[ "${values[POSTGRES_DB]}" =~ ^[A-Za-z0-9_]+$ ]] ||
  fail "POSTGRES_DB contains unsupported characters."
[[ "${values[EXPORT_DIR]}" == "/app/exports" ]] ||
  fail "EXPORT_DIR must be /app/exports."
[[ "${values[BACKUP_DIR]}" == "/app/backups" ]] ||
  fail "BACKUP_DIR must be /app/backups."

for key in TRAEFIK_NETWORK TRAEFIK_ENTRYPOINT TRAEFIK_CERT_RESOLVER; do
  [[ "${values[$key]}" =~ ^[A-Za-z0-9_.-]+$ ]] ||
    fail "$key contains unsupported characters."
done

is_placeholder() {
  local lowered="${1,,}"
  [[ "$lowered" == *change-me* ||
    "$lowered" == *replace-with* ||
    "$lowered" == *placeholder* ||
    "$lowered" == *example.com* ||
    "$lowered" == *local-dev* ||
    "$lowered" == *dev_password* ]]
}

for key in \
  APP_URL POSTGRES_PASSWORD DATABASE_URL AUTH_SECRET AUTH_AUTHENTIK_ID \
  AUTH_AUTHENTIK_SECRET AUTH_AUTHENTIK_ISSUER GPT_INGEST_TOKEN \
  GPT_INGEST_OWNER_SUBJECT APP_VERSION TRAEFIK_NETWORK TRAEFIK_ENTRYPOINT \
  TRAEFIK_CERT_RESOLVER; do
  if is_placeholder "${values[$key]}"; then
    fail "Production variable still uses a known placeholder: $key"
  fi
done

[[ ${#values[POSTGRES_PASSWORD]} -ge 16 ]] ||
  fail "POSTGRES_PASSWORD must contain at least 16 characters."
[[ ${#values[AUTH_SECRET]} -ge 32 ]] ||
  fail "AUTH_SECRET must contain at least 32 characters."
[[ ${#values[AUTH_AUTHENTIK_SECRET]} -ge 16 ]] ||
  fail "AUTH_AUTHENTIK_SECRET must contain at least 16 characters."
[[ ${#values[GPT_INGEST_TOKEN]} -ge 32 ]] ||
  fail "GPT_INGEST_TOKEN must contain at least 32 characters."

[[ "${values[AUTH_SECRET]}" != "${values[GPT_INGEST_TOKEN]}" ]] ||
  fail "AUTH_SECRET and GPT_INGEST_TOKEN must be separate secrets."
[[ "${values[AUTH_AUTHENTIK_SECRET]}" != "${values[GPT_INGEST_TOKEN]}" ]] ||
  fail "OIDC and GPT secrets must be separate."
[[ "${values[GIT_COMMIT]}" =~ ^[0-9a-f]{40}$ &&
  "${values[GIT_COMMIT]}" != "0000000000000000000000000000000000000000" ]] ||
  fail "GIT_COMMIT must be the intended full lowercase Git commit SHA."

if [[ "$errors" -ne 0 ]]; then
  exit 1
fi

echo "Production environment contract passed."
