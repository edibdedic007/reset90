#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
ENV_FILE="$REPO_ROOT/.env.production"
COMPOSE_FILE="$REPO_ROOT/docker-compose.production.yml"
STATE_DIR="${DEPLOY_STATE_DIR:-$REPO_ROOT/.runtime/production-deploy}"
LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/reset90-production-deploy.lock}"
ATTEMPTED_FILE="$STATE_DIR/attempted.sha"
SUCCESSFUL_FILE="$STATE_DIR/successful.sha"
PREVIOUS_FILE="$STATE_DIR/previous-successful.sha"
REVISION=""
DEPLOY_LOCK_FD=9
DEPLOY_LOCK_HELD=0

source "$SCRIPT_DIR/lib/production-env.sh"

log() {
  printf '%s service=reset90 revision=%s step=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${REVISION:-unresolved}" "$1"
}

fail() {
  log "failed:$1" >&2
  exit 1
}

release_deployment_lock() {
  if [[ "$DEPLOY_LOCK_HELD" -eq 1 ]]; then
    flock -u "$DEPLOY_LOCK_FD" || true
    DEPLOY_LOCK_HELD=0
  fi
}

compose() {
  RESET90_ENV_FILE="$ENV_FILE" \
    RESET90_COMPOSE_FILE="$COMPOSE_FILE" \
    "$SCRIPT_DIR/production-compose.sh" "$@"
}

wait_for_health() {
  local service="$1"
  local attempts="$2"
  local container_id status

  container_id="$(compose ps -q "$service")"
  [[ -n "$container_id" ]] || return 1

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    status="$(
      docker inspect \
        --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
        "$container_id" 2>/dev/null || true
    )"
    case "$status" in
      healthy)
        return 0
        ;;
      unhealthy | exited | dead)
        return 1
        ;;
    esac
    sleep 2
  done

  return 1
}

diagnostics() {
  compose ps || true
  compose logs --no-color --tail=25 app || true
}

record_success() {
  local current="" successful_temp

  if [[ -s "$SUCCESSFUL_FILE" ]]; then
    IFS= read -r current < "$SUCCESSFUL_FILE" || true
  fi
  if [[ -n "$current" && "$current" != "$REVISION" ]]; then
    printf '%s\n' "$current" > "$PREVIOUS_FILE"
  fi
  successful_temp="${SUCCESSFUL_FILE}.$$"
  printf '%s\n' "$REVISION" > "$successful_temp"
  mv "$successful_temp" "$SUCCESSFUL_FILE"
}

command -v flock >/dev/null 2>&1 || fail "missing-command-flock"
exec 9>>"$LOCK_FILE" || fail "deployment-lock-unavailable"
flock -n "$DEPLOY_LOCK_FD" || fail "deployment-lock-held"
DEPLOY_LOCK_HELD=1
trap release_deployment_lock EXIT
log "deployment-lock:acquired"

log "preflight:commands-and-files"
for command in awk curl date docker git grep gzip mkdir mv sleep; do
  command -v "$command" >/dev/null 2>&1 ||
    fail "missing-command-$command"
done
docker compose version >/dev/null 2>&1 || fail "missing-docker-compose"

for required_file in \
  "$ENV_FILE" \
  "$COMPOSE_FILE" \
  "$REPO_ROOT/Dockerfile" \
  "$SCRIPT_DIR/healthcheck.sh" \
  "$SCRIPT_DIR/backup-db.sh" \
  "$SCRIPT_DIR/backup-retention.sh" \
  "$SCRIPT_DIR/production-check.sh" \
  "$SCRIPT_DIR/production-compose.sh" \
  "$SCRIPT_DIR/lib/backup-restore.sh"; do
  [[ -f "$required_file" ]] || fail "missing-required-file"
done

example_file="$REPO_ROOT/.env.production.example"
[[ "$ENV_FILE" != "$example_file" ]] || fail "example-env-not-allowed"
if git -C "$REPO_ROOT" ls-files --error-unmatch ".env.production" \
  >/dev/null 2>&1; then
  fail "production-env-is-tracked"
fi

log "preflight:environment"
"$SCRIPT_DIR/production-check.sh" "$ENV_FILE"

log "preflight:clean-revision"
[[ -z "$(git -C "$REPO_ROOT" status --porcelain)" ]] ||
  fail "working-tree-not-clean"
REVISION="$(git -C "$REPO_ROOT" rev-parse --verify HEAD)"
[[ "$REVISION" =~ ^[0-9a-f]{40}$ ]] || fail "invalid-git-revision"
current_branch="$(
  git -C "$REPO_ROOT" symbolic-ref --quiet --short HEAD
)" || fail "production-revision-not-main"
[[ "$current_branch" == "main" ]] || fail "production-revision-not-main"
main_revision="$(
  git -C "$REPO_ROOT" rev-parse --verify refs/heads/main
)" || fail "production-revision-not-main"
[[ "$main_revision" == "$REVISION" ]] || fail "production-revision-not-main"
configured_revision="$(production_env_value "$ENV_FILE" GIT_COMMIT)"
[[ "$configured_revision" == "$REVISION" ]] ||
  fail "configured-revision-mismatch"

mkdir -p "$STATE_DIR"
printf '%s\n' "$REVISION" > "$ATTEMPTED_FILE"

log "preflight:compose-config"
compose config --quiet || fail "compose-config"

traefik_network="$(production_env_value "$ENV_FILE" TRAEFIK_NETWORK)"
log "preflight:traefik-network"
docker network inspect "$traefik_network" >/dev/null 2>&1 ||
  fail "traefik-network-missing"

log "backup:start-database"
compose up -d --no-build db || fail "database-start"
wait_for_health db 30 || fail "database-health-before-backup"

log "backup:create"
database_user="$(production_env_value "$ENV_FILE" POSTGRES_USER)"
database_name="$(production_env_value "$ENV_FILE" POSTGRES_DB)"
"$SCRIPT_DIR/backup-db.sh" \
  --environment production \
  --env-file "$ENV_FILE" \
  --compose-file "$COMPOSE_FILE" \
  --backup-root /backups \
  --purpose predeploy \
  --git-sha "$REVISION" \
  --user "$database_user" \
  --database "$database_name" ||
  fail "backup"

log "image:build"
compose build app || fail "image-build"

log "database:migrate"
compose run --rm --no-deps app \
  node node_modules/prisma/build/index.js migrate deploy ||
  fail "migration"

log "services:promote"
compose up -d --no-build db app || fail "service-start"

log "health:database"
wait_for_health db 30 || fail "database-health"

log "health:application"
if ! wait_for_health app 60; then
  diagnostics
  compose stop app || true
  fail "application-health"
fi

log "health:public-route"
if ! "$SCRIPT_DIR/healthcheck.sh" "$ENV_FILE"; then
  diagnostics
  compose stop app || true
  fail "public-route"
fi

log "status:bounded"
compose ps
compose logs --no-color --tail=25 app

record_success
log "deployment:successful"
