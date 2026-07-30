#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
ENVIRONMENT=""
ENV_FILE=""
COMPOSE_FILE=""
COMPOSE_PROJECT=""
BACKUP_ROOT=""
PURPOSE=""
COMPATIBLE_APP_REVISION=""
DEPLOYMENT_TARGET_REVISION="none"
DATABASE_NAME=""
DATABASE_USER=""
SERVICE="db"
RETENTION_PROTECT_FILE=""
DEPLOYMENT_LOCK_FD=""
STATE_DIR="${DEPLOY_STATE_DIR:-$REPO_ROOT/.runtime/production-deploy}"
DATABASE_COMPATIBLE_FILE="$STATE_DIR/database-compatible.sha"
PUBLISHED=0
RAW_TEMP=""
COMPRESSED_TEMP=""
CHECKSUM_TEMP=""
METADATA_TEMP=""
FINAL_FILE=""
FINAL_CHECKSUM=""
FINAL_METADATA=""

source "$SCRIPT_DIR/lib/backup-restore.sh"
source "$SCRIPT_DIR/lib/production-env.sh"

fail() {
  printf 'backup:failed:%s\n' "$1" >&2
  exit 1
}

usage() {
  printf '%s\n' \
    "Usage: backup-db.sh --environment local|test|production --env-file FILE" \
    "  --backup-root ABSOLUTE_PATH --purpose PURPOSE" \
    "  [--compatible-app-revision SHA] [--deployment-target-revision SHA]" \
    "  [--compose-file FILE] [--project NAME] [--database NAME] [--user NAME]" \
    "  [--retention-protect-file BACKUP.sql.gz]"
}

cleanup_temporary_backup() {
  rm -f -- \
    "${RAW_TEMP:-}" \
    "${COMPRESSED_TEMP:-}" \
    "${CHECKSUM_TEMP:-}" \
    "${METADATA_TEMP:-}"
  if [[ "$PUBLISHED" -ne 1 ]]; then
    rm -f -- \
      "${FINAL_FILE:-}" \
      "${FINAL_CHECKSUM:-}" \
      "${FINAL_METADATA:-}"
  fi
}

handle_signal() {
  local status="$1"

  trap - EXIT HUP INT TERM
  cleanup_temporary_backup
  exit "$status"
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
    --purpose)
      PURPOSE="${2:-}"
      shift 2
      ;;
    --compatible-app-revision)
      COMPATIBLE_APP_REVISION="${2:-}"
      shift 2
      ;;
    --deployment-target-revision)
      DEPLOYMENT_TARGET_REVISION="${2:-}"
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
    --database)
      DATABASE_NAME="${2:-}"
      shift 2
      ;;
    --user)
      DATABASE_USER="${2:-}"
      shift 2
      ;;
    --service)
      SERVICE="${2:-}"
      shift 2
      ;;
    --retention-protect-file)
      RETENTION_PROTECT_FILE="${2:-}"
      shift 2
      ;;
    --deployment-lock-fd)
      DEPLOYMENT_LOCK_FD="${2:-}"
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

[[ "$ENVIRONMENT" =~ ^(local|test|production)$ ]] ||
  fail "environment-selection-required"
[[ -n "$ENV_FILE" ]] || fail "environment-file-required"
[[ "$ENV_FILE" == /* ]] || ENV_FILE="$PWD/$ENV_FILE"
[[ -f "$ENV_FILE" ]] || fail "environment-file-missing"
[[ -n "$BACKUP_ROOT" ]] || fail "backup-root-required"
[[ "$BACKUP_ROOT" == /* ]] || fail "backup-root-must-be-absolute"
[[ "$PURPOSE" =~ ^[a-z][a-z0-9-]{0,31}$ ]] || fail "invalid-purpose"
[[ "$SERVICE" =~ ^[a-zA-Z0-9_-]+$ ]] || fail "invalid-service"
if [[ -n "$DEPLOYMENT_LOCK_FD" ]]; then
  [[ "$DEPLOYMENT_LOCK_FD" =~ ^[0-9]+$ ]] ||
    fail "invalid-deployment-lock-fd"
fi
if [[ -n "$RETENTION_PROTECT_FILE" ]]; then
  protected_basename="${RETENTION_PROTECT_FILE##*/}"
  [[ "$RETENTION_PROTECT_FILE" == "$BACKUP_ROOT/$protected_basename" ]] ||
    fail "retention-protect-file-outside-root"
  [[ "$protected_basename" =~ $RESET90_BACKUP_NAME_REGEX ]] ||
    fail "retention-protect-file-invalid"
fi

if [[ -z "$COMPOSE_FILE" ]]; then
  case "$ENVIRONMENT" in
    production)
      COMPOSE_FILE="$REPO_ROOT/docker-compose.production.yml"
      ;;
    local)
      COMPOSE_FILE="$REPO_ROOT/docker-compose.local.yml"
      ;;
    test)
      fail "test-compose-file-required"
      ;;
  esac
fi
[[ "$COMPOSE_FILE" == /* ]] || COMPOSE_FILE="$PWD/$COMPOSE_FILE"
[[ -f "$COMPOSE_FILE" ]] || fail "compose-file-missing"

if [[ "$ENVIRONMENT" == "production" ]]; then
  [[ "$ENV_FILE" != "$REPO_ROOT/.env.production.example" ]] ||
    fail "example-env-not-allowed"
  [[ "$BACKUP_ROOT" == "/backups" ]] || fail "production-backup-root-invalid"
fi

for required_command in awk chmod date docker grep gzip mkdir mv realpath rm sha256sum sort stat; do
  command -v "$required_command" >/dev/null 2>&1 ||
    fail "missing-command-$required_command"
done
docker compose version >/dev/null 2>&1 || fail "missing-docker-compose"

if [[ "$ENVIRONMENT" == "production" ]]; then
  "$SCRIPT_DIR/production-check.sh" "$ENV_FILE"
  configured_database="$(production_env_value "$ENV_FILE" POSTGRES_DB)" ||
    fail "production-database-unavailable"
  configured_user="$(production_env_value "$ENV_FILE" POSTGRES_USER)" ||
    fail "production-user-unavailable"
  configured_target_revision="$(
    production_env_value "$ENV_FILE" GIT_COMMIT
  )" || fail "production-target-revision-unavailable"
  [[ "$configured_database" =~ $RESET90_SAFE_DATABASE_REGEX ]] ||
    fail "unsafe-database-name"
  [[ "$configured_user" =~ $RESET90_SAFE_DATABASE_REGEX ]] ||
    fail "unsafe-database-user"
  [[ "$configured_target_revision" =~ ^[0-9a-f]{40}$ ]] ||
    fail "production-target-revision-invalid"
  [[ -z "$DATABASE_NAME" || "$DATABASE_NAME" == "$configured_database" ]] ||
    fail "production-database-override-mismatch"
  [[ -z "$DATABASE_USER" || "$DATABASE_USER" == "$configured_user" ]] ||
    fail "production-user-override-mismatch"
  DATABASE_NAME="$configured_database"
  DATABASE_USER="$configured_user"

  verified_compatible_revision="$(
    verified_database_compatible_revision "$DATABASE_COMPATIBLE_FILE"
  )" || fail "production-compatible-revision-unavailable"
  [[ -z "$COMPATIBLE_APP_REVISION" ||
    "$COMPATIBLE_APP_REVISION" == "$verified_compatible_revision" ]] ||
    fail "production-compatible-revision-mismatch"
  COMPATIBLE_APP_REVISION="$verified_compatible_revision"
  if [[ "$PURPOSE" == "predeploy" ]]; then
    [[ "$DEPLOYMENT_TARGET_REVISION" == "none" ||
      "$DEPLOYMENT_TARGET_REVISION" == "$configured_target_revision" ]] ||
      fail "production-target-revision-mismatch"
    DEPLOYMENT_TARGET_REVISION="$configured_target_revision"
  elif [[ "$DEPLOYMENT_TARGET_REVISION" != "none" ]]; then
    fail "deployment-target-revision-not-applicable"
  fi
else
  if [[ -z "$COMPATIBLE_APP_REVISION" ]] &&
    command -v git >/dev/null 2>&1; then
    COMPATIBLE_APP_REVISION="$(
      git -C "$REPO_ROOT" rev-parse --verify HEAD 2>/dev/null || true
    )"
  fi
  if [[ ! "$COMPATIBLE_APP_REVISION" =~ ^[0-9a-f]{40}$ ]]; then
    COMPATIBLE_APP_REVISION="unknown-revision"
  fi
  if [[ "$PURPOSE" != "predeploy" &&
    "$DEPLOYMENT_TARGET_REVISION" != "none" ]]; then
    fail "deployment-target-revision-not-applicable"
  fi
  [[ "$DEPLOYMENT_TARGET_REVISION" == "none" ||
    "$DEPLOYMENT_TARGET_REVISION" =~ ^[0-9a-f]{40}$ ]] ||
    fail "invalid-deployment-target-revision"
fi

container_id="$(compose ps -q "$SERVICE")"
[[ -n "$container_id" ]] || fail "postgres-service-missing"
container_health="$(
  docker inspect \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "$container_id" 2>/dev/null || true
)"
[[ "$container_health" == "healthy" || "$container_health" == "running" ]] ||
  fail "postgres-service-unhealthy"

compose exec -T "$SERVICE" pg_dump --version >/dev/null 2>&1 ||
  fail "postgres-tooling-missing"
compose exec -T "$SERVICE" psql --version >/dev/null 2>&1 ||
  fail "postgres-tooling-missing"
postgres_major="$(
  compose exec -T "$SERVICE" pg_dump --version |
    awk '{ for (field = 1; field <= NF; field += 1) if ($field ~ /^[0-9]+(\.[0-9]+)*$/) { split($field, version, "."); print version[1]; exit } }'
)"
[[ "$postgres_major" == "$RESET90_POSTGRES_MAJOR" ]] ||
  fail "postgres-major-version-unsupported"

if [[ "$ENVIRONMENT" != "production" &&
  (-z "$DATABASE_NAME" || -z "$DATABASE_USER") ]]; then
  database_identity="$(
    compose exec -T "$SERVICE" sh -eu -c \
      'printf "%s\t%s" "$POSTGRES_USER" "$POSTGRES_DB"'
  )" || fail "database-identity-unavailable"
  IFS=$'\t' read -r detected_user detected_database <<< "$database_identity"
  DATABASE_USER="${DATABASE_USER:-$detected_user}"
  DATABASE_NAME="${DATABASE_NAME:-$detected_database}"
fi
[[ "$DATABASE_USER" =~ $RESET90_SAFE_DATABASE_REGEX ]] || fail "unsafe-database-user"
[[ "$DATABASE_NAME" =~ $RESET90_SAFE_DATABASE_REGEX ]] || fail "unsafe-database-name"

migration_table_state="$(
  compose exec -T "$SERVICE" psql -X -A -t \
    -U "$DATABASE_USER" \
    -d "$DATABASE_NAME" \
    -c "SELECT CASE
      WHEN to_regclass('public._prisma_migrations') IS NULL
        THEN 'missing'
      ELSE 'present'
    END;"
)" || fail "migration-contract-unavailable"
[[ "$migration_table_state" == "present" ]] ||
  fail "migration-contract-unavailable"
migration_rows="$(
  compose exec -T "$SERVICE" psql -X -A -t -F $'\t' \
    -U "$DATABASE_USER" \
    -d "$DATABASE_NAME" \
    -c 'SELECT migration_name, CASE
      WHEN finished_at IS NOT NULL AND rolled_back_at IS NULL
        THEN '"'completed'"'
      WHEN finished_at IS NULL AND rolled_back_at IS NULL
        AND COALESCE(logs, '"''"') = '"''"'
        THEN '"'unfinished'"'
      WHEN finished_at IS NULL AND rolled_back_at IS NULL
        THEN '"'failed'"'
      WHEN finished_at IS NULL AND rolled_back_at IS NOT NULL
        THEN '"'rolled-back'"'
      ELSE '"'inconsistent'"'
    END
    FROM "_prisma_migrations"
    ORDER BY migration_name, started_at, id;'
)" || fail "migration-contract-unavailable"
migration_contract_from_rows "$migration_rows" ||
  fail "migration-contract-invalid"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
filename="reset90_${timestamp}_${PURPOSE}_${COMPATIBLE_APP_REVISION}.sql.gz"

if [[ "$ENVIRONMENT" == "production" ]]; then
  compose exec -T "$SERVICE" sh -eu -c '
    root="$1"
    filename="$2"
    timestamp="$3"
    purpose="$4"
    compatible_revision="$5"
    target_revision="$6"
    database_name="$7"
    database_user="$8"
    expected_major="$9"
    marker_name="${10}"
    marker_value="${11}"
    metadata_version="${12}"
    migration_count="${13}"
    migration_sha256="${14}"

    case "$root" in
      /*backup*) ;;
      *) exit 30 ;;
    esac
    [ "$root" != "/" ] || exit 30
    command -v pg_dump >/dev/null 2>&1 || exit 31
    command -v gzip >/dev/null 2>&1 || exit 32
    command -v sha256sum >/dev/null 2>&1 || exit 33
    command -v stat >/dev/null 2>&1 || exit 33

    umask 077
    mkdir -p -- "$root"
    chmod 700 -- "$root"
    marker="$root/$marker_name"
    if [ -e "$marker" ]; then
      [ -f "$marker" ] && [ ! -L "$marker" ] || exit 34
      [ "$(cat "$marker")" = "$marker_value" ] || exit 34
    else
      printf "%s\n" "$marker_value" > "$marker"
      chmod 600 -- "$marker"
    fi

    final="$root/$filename"
    final_checksum="$final.sha256"
    final_metadata="$final.meta"
    [ ! -e "$final" ] && [ ! -e "$final_checksum" ] &&
      [ ! -e "$final_metadata" ] || exit 35

    raw="$root/.$filename.$$.sql.partial"
    compressed="$root/.$filename.$$.gz.partial"
    checksum="$root/.$filename.$$.sha256.partial"
    metadata="$root/.$filename.$$.meta.partial"
    published=0
    cleanup() {
      rm -f -- "$raw" "$compressed" "$checksum" "$metadata"
      if [ "$published" -ne 1 ]; then
        rm -f -- "$final" "$final_checksum" "$final_metadata"
      fi
    }
    handle_signal() {
      status="$1"
      trap - EXIT HUP INT TERM
      cleanup
      exit "$status"
    }
    trap cleanup EXIT
    trap "handle_signal 129" HUP
    trap "handle_signal 130" INT
    trap "handle_signal 143" TERM

    detected_major="$(
      pg_dump --version |
        awk "{ for (field = 1; field <= NF; field += 1) if (\$field ~ /^[0-9]+(\\.[0-9]+)*$/) { split(\$field, version, \".\"); print version[1]; exit } }"
    )"
    [ "$detected_major" = "$expected_major" ] || exit 36
    pg_dump --no-owner --no-privileges -U "$database_user" "$database_name" > "$raw"
    [ -s "$raw" ] || exit 37
    gzip -c -- "$raw" > "$compressed"
    [ -s "$compressed" ] || exit 38
    gzip -t -- "$compressed"
    digest="$(sha256sum "$compressed" | awk "{print \$1}")"
    [ "${#digest}" -eq 64 ] || exit 39
    size_bytes="$(stat -c "%s" "$compressed")"
    printf "%s\n" "$size_bytes" | grep -Eq "^[1-9][0-9]*$" || exit 39
    printf "%s  %s\n" "$digest" "$filename" > "$checksum"
    printf "%s\n" \
      "metadata_version=$metadata_version" \
      "filename=$filename" \
      "created_utc=$timestamp" \
      "purpose=$purpose" \
      "compatible_app_revision=$compatible_revision" \
      "deployment_target_revision=$target_revision" \
      "postgres_major=$detected_major" \
      "source_database=$database_name" \
      "artifact_size_bytes=$size_bytes" \
      "artifact_sha256=$digest" \
      "migration_count=$migration_count" \
      "migration_names_sha256=$migration_sha256" > "$metadata"
    chmod 600 -- "$compressed" "$checksum" "$metadata"
    mv -- "$compressed" "$final"
    mv -- "$checksum" "$final_checksum"
    if ! (
      cd -- "$root"
      gzip -t -- "$filename"
      sha256sum -c -- "$filename.sha256" >/dev/null
      [ "$(stat -c "%s" "$filename")" = "$size_bytes" ]
      [ "$(sha256sum "$filename" | awk "{ print \$1 }")" = "$digest" ]
    ); then
      exit 40
    fi
    mv -- "$metadata" "$final_metadata"
    published=1
    cleanup
    trap - EXIT HUP INT TERM
  ' sh \
    "$BACKUP_ROOT" \
    "$filename" \
    "$timestamp" \
    "$PURPOSE" \
    "$COMPATIBLE_APP_REVISION" \
    "$DEPLOYMENT_TARGET_REVISION" \
    "$DATABASE_NAME" \
    "$DATABASE_USER" \
    "$RESET90_POSTGRES_MAJOR" \
    "$RESET90_BACKUP_ROOT_MARKER" \
    "$RESET90_BACKUP_ROOT_MARKER_VALUE" \
    "$RESET90_BACKUP_METADATA_VERSION" \
    "$MIGRATION_CONTRACT_COUNT" \
    "$MIGRATION_CONTRACT_SHA256" ||
    fail "creation-or-validation"
else
  prepare_backup_root "$BACKUP_ROOT" || fail "backup-root-invalid"
  BACKUP_ROOT="$(realpath -e -- "$BACKUP_ROOT")"
  FINAL_FILE="$BACKUP_ROOT/$filename"
  FINAL_CHECKSUM="$FINAL_FILE.sha256"
  FINAL_METADATA="$FINAL_FILE.meta"
  [[ ! -e "$FINAL_FILE" && ! -e "$FINAL_CHECKSUM" && ! -e "$FINAL_METADATA" ]] ||
    fail "filename-collision"

  umask 077
  RAW_TEMP="$BACKUP_ROOT/.$filename.$$.sql.partial"
  COMPRESSED_TEMP="$BACKUP_ROOT/.$filename.$$.gz.partial"
  CHECKSUM_TEMP="$BACKUP_ROOT/.$filename.$$.sha256.partial"
  METADATA_TEMP="$BACKUP_ROOT/.$filename.$$.meta.partial"
  trap cleanup_temporary_backup EXIT
  trap 'handle_signal 129' HUP
  trap 'handle_signal 130' INT
  trap 'handle_signal 143' TERM

  compose exec -T "$SERVICE" pg_dump \
    --no-owner \
    --no-privileges \
    -U "$DATABASE_USER" \
    "$DATABASE_NAME" > "$RAW_TEMP" ||
    fail "pg-dump"
  [[ -s "$RAW_TEMP" ]] || fail "zero-byte-dump"
  gzip -c -- "$RAW_TEMP" > "$COMPRESSED_TEMP" || fail "compression"
  [[ -s "$COMPRESSED_TEMP" ]] || fail "zero-byte-compressed-output"
  gzip -t -- "$COMPRESSED_TEMP" >/dev/null 2>&1 || fail "gzip-integrity"
  digest="$(sha256sum "$COMPRESSED_TEMP" | awk '{print $1}')" ||
    fail "checksum"
  [[ "$digest" =~ ^[0-9a-f]{64}$ ]] || fail "checksum"
  size_bytes="$(stat -c '%s' -- "$COMPRESSED_TEMP")" || fail "metadata"
  [[ "$size_bytes" =~ ^[1-9][0-9]*$ ]] || fail "metadata"
  printf '%s  %s\n' "$digest" "$filename" > "$CHECKSUM_TEMP" ||
    fail "checksum"
  printf '%s\n' \
    "metadata_version=$RESET90_BACKUP_METADATA_VERSION" \
    "filename=$filename" \
    "created_utc=$timestamp" \
    "purpose=$PURPOSE" \
    "compatible_app_revision=$COMPATIBLE_APP_REVISION" \
    "deployment_target_revision=$DEPLOYMENT_TARGET_REVISION" \
    "postgres_major=$postgres_major" \
    "source_database=$DATABASE_NAME" \
    "artifact_size_bytes=$size_bytes" \
    "artifact_sha256=$digest" \
    "migration_count=$MIGRATION_CONTRACT_COUNT" \
    "migration_names_sha256=$MIGRATION_CONTRACT_SHA256" > "$METADATA_TEMP" ||
    fail "metadata"
  chmod 600 -- "$COMPRESSED_TEMP" "$CHECKSUM_TEMP" "$METADATA_TEMP" ||
    fail "permissions"
  mv -- "$COMPRESSED_TEMP" "$FINAL_FILE" || fail "publish-backup"
  mv -- "$CHECKSUM_TEMP" "$FINAL_CHECKSUM" || fail "publish-checksum"
  gzip -t -- "$FINAL_FILE" >/dev/null 2>&1 ||
    fail "final-publication-validation"
  (
    cd -- "$BACKUP_ROOT"
    sha256sum -c -- "$filename.sha256" >/dev/null 2>&1
  ) || fail "final-publication-validation"
  [[ "$(stat -c '%s' -- "$FINAL_FILE")" == "$size_bytes" ]] ||
    fail "final-publication-validation"
  [[ "$(sha256sum -- "$FINAL_FILE" | awk '{ print $1 }')" == "$digest" ]] ||
    fail "final-publication-validation"
  mv -- "$METADATA_TEMP" "$FINAL_METADATA" || fail "publish-metadata"
  validate_backup_artifact "$FINAL_FILE" "$BACKUP_ROOT" ||
    fail "published-artifact-invalid"
  PUBLISHED=1
  trap - EXIT HUP INT TERM
  cleanup_temporary_backup
fi

printf 'backup:verified filename=%s\n' "$filename"
retention_arguments=(
  --environment "$ENVIRONMENT"
  --env-file "$ENV_FILE"
  --compose-file "$COMPOSE_FILE"
  --backup-root "$BACKUP_ROOT"
  --apply
)
if [[ -n "$COMPOSE_PROJECT" ]]; then
  retention_arguments+=(--project "$COMPOSE_PROJECT")
fi
if [[ -n "$RETENTION_PROTECT_FILE" ]]; then
  retention_arguments+=(--protect-file "$RETENTION_PROTECT_FILE")
fi
if [[ -n "$DEPLOYMENT_LOCK_FD" ]]; then
  retention_arguments+=(--deployment-lock-fd "$DEPLOYMENT_LOCK_FD")
fi
"$SCRIPT_DIR/backup-retention.sh" "${retention_arguments[@]}" ||
  fail "retention"
