#!/usr/bin/env bash

PRODUCTION_ENV_KEYS=(
  NODE_ENV
  AUTH_MODE
  APP_URL
  PORT
  POSTGRES_USER
  POSTGRES_PASSWORD
  POSTGRES_DB
  DATABASE_URL
  AUTH_SECRET
  AUTH_TRUST_HOST
  AUTH_AUTHENTIK_ID
  AUTH_AUTHENTIK_SECRET
  AUTH_AUTHENTIK_ISSUER
  GPT_INGEST_TOKEN
  GPT_INGEST_OWNER_SUBJECT
  EXPORT_DIR
  BACKUP_DIR
  APP_VERSION
  GIT_COMMIT
  RESET90_HOST
  TRAEFIK_NETWORK
  TRAEFIK_ENTRYPOINT
  TRAEFIK_CERT_RESOLVER
)

production_env_value() {
  local env_file="${1:?environment file is required}"
  local key="${2:?environment key is required}"
  local value

  value="$(
    awk -v target="$key" '
      /^[[:space:]]*#/ { next }
      {
        line = $0
        sub(/\r$/, "", line)
        if (index(line, target "=") == 1) {
          count += 1
          value = substr(line, length(target) + 2)
        }
      }
      END {
        if (count != 1) {
          exit 1
        }
        printf "%s", value
      }
    ' "$env_file"
  )" || return 1

  if [[ ${#value} -ge 2 ]]; then
    if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi

  printf '%s' "$value"
}
