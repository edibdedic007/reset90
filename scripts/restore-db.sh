#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
ENVIRONMENT="test"
ENV_FILE=""
COMPOSE_FILE=""
COMPOSE_PROJECT=""
BACKUP_ROOT=""
BACKUP_FILE=""
SERVICE="db"
LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/reset90-production-deploy.lock}"
LOCK_FD=9
LOCK_HELD=0
VALIDATION_TEMP=""
STAGING_DATABASE=""
OLD_DATABASE=""
STAGING_EXISTS=0
OLD_RENAMED=0
TARGET_RENAMED=0

source "$SCRIPT_DIR/lib/backup-restore.sh"
source "$SCRIPT_DIR/lib/production-env.sh"

fail() {
  printf 'restore:failed:%s\n' "$1" >&2
  exit 1
}

usage() {
  printf '%s\n' \
    "Usage: restore-db.sh --environment test|production --env-file FILE" \
    "  --backup-root ABSOLUTE_PATH --file BACKUP.sql.gz" \
    "  [--compose-file FILE] [--project NAME]"
}

compose() {
  if [[ "$ENVIRONMENT" == "production" ]]; then
    RESET90_ENV_FILE="$ENV_FILE" \
      RESET90_COMPOSE_FILE="$COMPOSE_FILE" \
      "$SCRIPT_DIR/production-compose.sh" "$@"
  elif [[ -n "$COMPOSE_PROJECT" ]]; then
    docker compose -p "$COMPOSE_PROJECT" --env-file "$ENV_FILE" \
      -f "$COMPOSE_FILE" "$@"
  else
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
  fi
}

database_exists() {
  local database_name="$1"
  local database_user="$2"

  [[ "$(
    compose exec -T "$SERVICE" psql -X -A -t \
      -U "$database_user" \
      -d postgres \
      -v database_name="$database_name" \
      -c "SELECT CASE WHEN EXISTS (
        SELECT 1 FROM pg_database WHERE datname = :'database_name'
      ) THEN 'yes' ELSE 'no' END;"
  )" == "yes" ]]
}

release_lock() {
  if [[ "$LOCK_HELD" -eq 1 ]]; then
    flock -u "$LOCK_FD" || true
    LOCK_HELD=0
  fi
}

cleanup() {
  rm -f -- "${VALIDATION_TEMP:-}"
  if [[ "$ENVIRONMENT" == "production" && "$LOCK_HELD" -eq 1 ]]; then
    if [[ "$OLD_RENAMED" -eq 1 && "$TARGET_RENAMED" -eq 0 ]]; then
      compose exec -T "$SERVICE" psql -X -v ON_ERROR_STOP=1 \
        -U "$TARGET_USER" \
        -d postgres \
        -c "ALTER DATABASE \"$OLD_DATABASE\" RENAME TO \"$TARGET_DATABASE\";" \
        >/dev/null 2>&1 || true
    fi
    if [[ "$STAGING_EXISTS" -eq 1 && "$TARGET_RENAMED" -eq 0 ]]; then
      compose exec -T "$SERVICE" dropdb -U "$TARGET_USER" --force \
        "$STAGING_DATABASE" >/dev/null 2>&1 || true
    fi
  fi
  release_lock
}

verify_restored_database() {
  local database_name="$1"
  local database_user="$2"
  local migration_state

  compose exec -T "$SERVICE" psql -X -A -t \
    -U "$database_user" \
    -d "$database_name" \
    -c "SELECT 1;" >/dev/null ||
    return 1
  migration_state="$(
    compose exec -T "$SERVICE" psql -X -A -t \
      -U "$database_user" \
      -d "$database_name" \
      -c 'SELECT CASE
        WHEN to_regclass('"'public._prisma_migrations'"') IS NULL THEN '"'missing'"'
        WHEN EXISTS (
          SELECT 1 FROM "_prisma_migrations"
          WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
        ) THEN '"'failed'"'
        ELSE '"'valid'"'
      END;'
  )" || return 1
  [[ "$migration_state" == "valid" ]]
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment)
      ENVIRONMENT="${2:-}"
      shift 2
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --backup-root)
      BACKUP_ROOT="${2:-}"
      shift 2
      ;;
    --file)
      BACKUP_FILE="${2:-}"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="${2:-}"
      shift 2
      ;;
    --project)
      COMPOSE_PROJECT="${2:-}"
      shift 2
      ;;
    --service)
      SERVICE="${2:-}"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      fail "unsupported-argument"
      ;;
  esac
done

[[ "$ENVIRONMENT" =~ ^(test|production)$ ]] ||
  fail "explicit-test-or-production-mode-required"
[[ -n "$ENV_FILE" ]] || fail "environment-file-required"
[[ "$ENV_FILE" == /* ]] || ENV_FILE="$PWD/$ENV_FILE"
[[ -f "$ENV_FILE" ]] || fail "environment-file-missing"
[[ -n "$BACKUP_ROOT" ]] || fail "backup-root-required"
[[ "$BACKUP_ROOT" == /* ]] || fail "backup-root-must-be-absolute"
[[ -n "$BACKUP_FILE" ]] || fail "backup-file-required"
[[ "$SERVICE" =~ ^[a-zA-Z0-9_-]+$ ]] || fail "invalid-service"

if [[ -z "$COMPOSE_FILE" ]]; then
  if [[ "$ENVIRONMENT" == "production" ]]; then
    COMPOSE_FILE="$REPO_ROOT/docker-compose.production.yml"
  else
    fail "test-compose-file-required"
  fi
fi
[[ "$COMPOSE_FILE" == /* ]] || COMPOSE_FILE="$PWD/$COMPOSE_FILE"
[[ -f "$COMPOSE_FILE" ]] || fail "compose-file-missing"

for required_command in awk dirname docker flock grep gunzip gzip node realpath rm sha256sum stat; do
  command -v "$required_command" >/dev/null 2>&1 ||
    fail "missing-command-$required_command"
done
docker compose version >/dev/null 2>&1 || fail "missing-docker-compose"

if [[ "$ENVIRONMENT" == "test" ]]; then
  [[ -z "${DATABASE_URL:-}" ]] || fail "inherited-database-url-not-allowed"
  [[ -n "${TEST_DATABASE_URL:-}" ]] || fail "test-database-url-required"
  parse_test_database_url "$TEST_DATABASE_URL" ||
    fail "unsafe-test-database-url"
  IFS=$'\t' read -r TARGET_USER TARGET_HOST TARGET_PORT TARGET_DATABASE \
    <<< "$TEST_DATABASE_PARTS"
  [[ "$TARGET_DATABASE" =~ $RESET90_SAFE_DATABASE_REGEX ]] ||
    fail "unsafe-target-database"

  validate_backup_artifact "$BACKUP_FILE" "$BACKUP_ROOT" ||
    fail "backup-artifact-invalid"
  [[ "$VALIDATED_BACKUP_SOURCE_DATABASE" != "$TARGET_DATABASE" ]] ||
    fail "source-target-database-equality"

  VALIDATION_TEMP="$(mktemp /tmp/reset90-restore-validation.XXXXXX.sql)"
  chmod 600 -- "$VALIDATION_TEMP"
  trap cleanup EXIT HUP INT TERM
  gunzip -c -- "$VALIDATED_BACKUP_FILE" > "$VALIDATION_TEMP" ||
    fail "backup-decompression"
  grep -Fq "PostgreSQL database dump" "$VALIDATION_TEMP" ||
    fail "backup-sql-invalid"

  container_id="$(compose ps -q "$SERVICE")"
  [[ -n "$container_id" ]] || fail "postgres-service-missing"
  container_health="$(
    docker inspect \
      --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
      "$container_id" 2>/dev/null || true
  )"
  [[ "$container_health" == "healthy" || "$container_health" == "running" ]] ||
    fail "postgres-service-unhealthy"
  mapped_database_address="$(compose port "$SERVICE" 5432)" ||
    fail "test-database-port-unavailable"
  mapped_database_port="${mapped_database_address##*:}"
  [[ "$mapped_database_port" == "$TARGET_PORT" ]] ||
    fail "test-database-url-compose-mismatch"
  compose exec -T "$SERVICE" psql --version >/dev/null 2>&1 ||
    fail "postgres-tooling-missing"
  target_major="$(
    compose exec -T "$SERVICE" psql -X -A -t \
      -U "$TARGET_USER" \
      -d "$TARGET_DATABASE" \
      -c "SHOW server_version_num;" |
      awk '{ print int($1 / 10000) }'
  )" || fail "target-postgres-version"
  [[ "$target_major" == "$VALIDATED_BACKUP_POSTGRES_MAJOR" ]] ||
    fail "postgres-major-version-mismatch"

  target_state="$(
    compose exec -T "$SERVICE" psql -X -A -t \
      -U "$TARGET_USER" \
      -d "$TARGET_DATABASE" \
      -c "SELECT CASE WHEN EXISTS (
        SELECT evidence
        FROM (
          SELECT 1 AS evidence
          FROM pg_catalog.pg_class AS relation
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname <> 'information_schema'
            AND namespace.nspname !~ '^pg_'
            AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')

          UNION ALL

          SELECT 1 AS evidence
          FROM pg_catalog.pg_type AS database_type
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = database_type.typnamespace
          WHERE namespace.nspname <> 'information_schema'
            AND namespace.nspname !~ '^pg_'
            AND database_type.typtype IN ('d', 'e')

          UNION ALL

          SELECT 1 AS evidence
          FROM pg_catalog.pg_namespace AS namespace
          WHERE namespace.nspname <> 'public'
            AND namespace.nspname <> 'information_schema'
            AND namespace.nspname !~ '^pg_'
        ) AS existing_objects
      ) THEN 'not-empty' ELSE 'empty' END;"
  )" || fail "target-emptiness-check"
  [[ "$target_state" == "empty" ]] || fail "target-database-not-empty"

  gunzip -c -- "$VALIDATED_BACKUP_FILE" |
    compose exec -T "$SERVICE" psql -X -v ON_ERROR_STOP=1 \
      --single-transaction \
      -U "$TARGET_USER" \
      -d "$TARGET_DATABASE" ||
    fail "restore"
  verify_restored_database "$TARGET_DATABASE" "$TARGET_USER" ||
    fail "restored-database-verification"
  printf 'restore:complete mode=test target=%s backup=%s\n' \
    "$TARGET_DATABASE" "$VALIDATED_BACKUP_BASENAME"
  exit 0
fi

[[ "$ENV_FILE" != "$REPO_ROOT/.env.production.example" ]] ||
  fail "example-env-not-allowed"
[[ "$BACKUP_ROOT" == "/backups" ]] || fail "production-backup-root-invalid"
[[ "$BACKUP_FILE" == "$BACKUP_ROOT/"* ]] || fail "backup-path-outside-root"
[[ "$BACKUP_FILE" != *"/../"* && "$BACKUP_FILE" != *"/./"* ]] ||
  fail "backup-path-outside-root"
BACKUP_BASENAME="${BACKUP_FILE##*/}"
[[ "$BACKUP_FILE" == "$BACKUP_ROOT/$BACKUP_BASENAME" ]] ||
  fail "backup-path-outside-root"
[[ "$BACKUP_BASENAME" =~ $RESET90_BACKUP_NAME_REGEX ]] ||
  fail "backup-filename-invalid"

"$SCRIPT_DIR/production-check.sh" "$ENV_FILE"
TARGET_DATABASE="$(production_env_value "$ENV_FILE" POSTGRES_DB)" ||
  fail "production-database-unavailable"
TARGET_USER="$(production_env_value "$ENV_FILE" POSTGRES_USER)" ||
  fail "production-user-unavailable"
CURRENT_REVISION="$(production_env_value "$ENV_FILE" GIT_COMMIT)" ||
  fail "production-revision-unavailable"
[[ "$TARGET_DATABASE" =~ $RESET90_SAFE_DATABASE_REGEX ]] ||
  fail "unsafe-target-database"
[[ "$TARGET_USER" =~ $RESET90_SAFE_DATABASE_REGEX ]] ||
  fail "unsafe-target-user"
[[ "$CURRENT_REVISION" =~ ^[0-9a-f]{40}$ ]] ||
  fail "production-revision-invalid"

metadata_result="$(
  compose exec -T "$SERVICE" sh -eu -c '
    root="$1"
    file="$2"
    base="$3"
    marker_name="$4"
    marker_value="$5"
    metadata_version="$6"
    expected_major="$7"

    [ -d "$root" ] && [ ! -L "$root" ] || exit 50
    [ -f "$root/$marker_name" ] && [ ! -L "$root/$marker_name" ] || exit 50
    [ "$(cat "$root/$marker_name")" = "$marker_value" ] || exit 50
    [ -s "$file" ] && [ ! -L "$file" ] || exit 51
    [ -s "$file.sha256" ] && [ ! -L "$file.sha256" ] || exit 51
    [ -s "$file.meta" ] && [ ! -L "$file.meta" ] || exit 51
    [ "$(stat -c "%a" "$file")" = "600" ] || exit 51
    [ "$(stat -c "%a" "$file.sha256")" = "600" ] || exit 51
    [ "$(stat -c "%a" "$file.meta")" = "600" ] || exit 51
    gzip -t "$file" >/dev/null 2>&1 || exit 52
    (
      cd "$root"
      sha256sum -c "$base.sha256" >/dev/null 2>&1
    ) || exit 53

    timestamp="$(printf "%s" "$base" | cut -d_ -f2)"
    purpose="$(printf "%s" "$base" | cut -d_ -f3)"
    revision="${base#reset90_${timestamp}_${purpose}_}"
    revision="${revision%.sql.gz}"
    metadata="$file.meta"
    grep -qx "metadata_version=$metadata_version" "$metadata" || exit 54
    grep -qx "filename=$base" "$metadata" || exit 54
    grep -qx "created_utc=$timestamp" "$metadata" || exit 54
    grep -qx "purpose=$purpose" "$metadata" || exit 54
    grep -qx "git_sha=$revision" "$metadata" || exit 54
    grep -qx "postgres_major=$expected_major" "$metadata" || exit 55
    source_database="$(
      awk -F= '"'"'$1 == "source_database" { count += 1; value = substr($0, 17) }
        END { if (count != 1) exit 1; printf "%s", value }'"'"' "$metadata"
    )" || exit 54
    printf "%s\n" "$source_database" |
      grep -Eq "^[A-Za-z_][A-Za-z0-9_]{0,62}$" || exit 54
    gzip -cd "$file" |
      awk '"'"'index($0, "PostgreSQL database dump") { found = 1 }
        END { exit(found ? 0 : 1) }'"'"' || exit 56
    printf "%s\t%s\t%s" "$source_database" "$revision" "$expected_major"
  ' sh \
    "$BACKUP_ROOT" \
    "$BACKUP_FILE" \
    "$BACKUP_BASENAME" \
    "$RESET90_BACKUP_ROOT_MARKER" \
    "$RESET90_BACKUP_ROOT_MARKER_VALUE" \
    "$RESET90_BACKUP_METADATA_VERSION" \
    "$RESET90_POSTGRES_MAJOR"
)" || fail "backup-artifact-invalid"
IFS=$'\t' read -r SOURCE_DATABASE BACKUP_REVISION BACKUP_MAJOR \
  <<< "$metadata_result"

[[ -t 0 && -t 1 ]] || fail "production-restore-requires-interactive-tty"
EXPECTED_CONFIRMATION="RESTORE $TARGET_DATABASE FROM $BACKUP_BASENAME"
read -r -p "Type '$EXPECTED_CONFIRMATION' to continue: " CONFIRMATION
[[ "$CONFIRMATION" == "$EXPECTED_CONFIRMATION" ]] ||
  fail "production-confirmation-mismatch"

command -v flock >/dev/null 2>&1 || fail "missing-command-flock"
exec 9>>"$LOCK_FILE" || fail "production-lock-unavailable"
flock -n "$LOCK_FD" || fail "production-lock-held"
LOCK_HELD=1
trap cleanup EXIT HUP INT TERM
printf 'restore:production-lock-acquired\n'

[[ -z "$(compose ps --status running -q app)" ]] ||
  fail "application-writes-not-stopped"

"$SCRIPT_DIR/backup-db.sh" \
  --environment production \
  --env-file "$ENV_FILE" \
  --compose-file "$COMPOSE_FILE" \
  --backup-root "$BACKUP_ROOT" \
  --purpose prerestore \
  --git-sha "$CURRENT_REVISION" ||
  fail "pre-restore-backup"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
STAGING_DATABASE="${TARGET_DATABASE}_restore_test_${timestamp}_$$"
OLD_DATABASE="${TARGET_DATABASE}_prerestore_${timestamp}_$$"
[[ "$STAGING_DATABASE" =~ $RESET90_SAFE_DATABASE_REGEX ]] ||
  fail "unsafe-staging-database"
[[ "$OLD_DATABASE" =~ $RESET90_SAFE_DATABASE_REGEX ]] ||
  fail "unsafe-old-database"
[[ "$SOURCE_DATABASE" != "$STAGING_DATABASE" ]] ||
  fail "source-target-database-equality"
database_exists "$STAGING_DATABASE" "$TARGET_USER" &&
  fail "staging-database-collision"
database_exists "$OLD_DATABASE" "$TARGET_USER" &&
  fail "old-database-collision"

compose exec -T "$SERVICE" createdb -U "$TARGET_USER" -T template0 \
  "$STAGING_DATABASE" ||
  fail "staging-database-create"
STAGING_EXISTS=1
compose exec -T "$SERVICE" sh -eu -c '
  file="$1"
  user="$2"
  database="$3"
  gzip -cd "$file" |
    psql -X -v ON_ERROR_STOP=1 --single-transaction -U "$user" -d "$database"
' sh "$BACKUP_FILE" "$TARGET_USER" "$STAGING_DATABASE" ||
  fail "restore"
verify_restored_database "$STAGING_DATABASE" "$TARGET_USER" ||
  fail "restored-database-verification"

compose exec -T "$SERVICE" psql -X -v ON_ERROR_STOP=1 \
  -U "$TARGET_USER" \
  -d postgres \
  -v target_database="$TARGET_DATABASE" \
  -c "SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = :'target_database' AND pid <> pg_backend_pid();" \
  >/dev/null ||
  fail "target-connection-stop"
compose exec -T "$SERVICE" psql -X -v ON_ERROR_STOP=1 \
  -U "$TARGET_USER" \
  -d postgres \
  -c "ALTER DATABASE \"$TARGET_DATABASE\" RENAME TO \"$OLD_DATABASE\";" ||
  fail "target-rename"
OLD_RENAMED=1
compose exec -T "$SERVICE" psql -X -v ON_ERROR_STOP=1 \
  -U "$TARGET_USER" \
  -d postgres \
  -c "ALTER DATABASE \"$STAGING_DATABASE\" RENAME TO \"$TARGET_DATABASE\";" ||
  fail "staging-promote"
TARGET_RENAMED=1
STAGING_EXISTS=0
compose exec -T "$SERVICE" dropdb -U "$TARGET_USER" --force "$OLD_DATABASE" ||
  fail "old-database-remove"
OLD_RENAMED=0

printf 'restore:complete mode=production target=%s backup=%s\n' \
  "$TARGET_DATABASE" "$BACKUP_BASENAME"
printf 'restore:application-remains-stopped select-revision=%s\n' \
  "$BACKUP_REVISION"
