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
DEGRADED_RECOVERY=0
STATE_DIR="${DEPLOY_STATE_DIR:-$REPO_ROOT/.runtime/production-deploy}"
DATABASE_COMPATIBLE_FILE="$STATE_DIR/database-compatible.sha"
VALIDATION_TEMP=""
COMPATIBLE_STATE_TEMP=""
PRE_RESTORE_LOG=""
STAGING_DATABASE=""
OLD_DATABASE=""

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
    "  [--compose-file FILE] [--project NAME] [--degraded-recovery]"
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

database_presence() {
  local database_name="$1"
  local database_user="$2"
  local result

  result="$(
    compose exec -T "$SERVICE" psql -X -A -t \
      -U "$database_user" \
      -d postgres \
      -v database_name="$database_name" \
      -c "SELECT CASE WHEN EXISTS (
        SELECT 1 FROM pg_database WHERE datname = :'database_name'
      ) THEN 'yes' ELSE 'no' END;"
  )" || return 1
  case "$result" in
    yes)
      printf 'exists'
      ;;
    no)
      printf 'missing'
      ;;
    *)
      return 1
      ;;
  esac
}

release_lock() {
  if [[ "$LOCK_HELD" -eq 1 ]]; then
    flock -u "$LOCK_FD" || true
    LOCK_HELD=0
  fi
}

cleanup_production_databases() {
  local target_state old_state staging_state

  [[ -n "${TARGET_DATABASE:-}" && -n "${TARGET_USER:-}" ]] || return 0
  [[ -n "$STAGING_DATABASE" && -n "$OLD_DATABASE" ]] || return 0

  target_state="$(database_presence "$TARGET_DATABASE" "$TARGET_USER")" ||
    target_state="unknown"
  old_state="$(database_presence "$OLD_DATABASE" "$TARGET_USER")" ||
    old_state="unknown"
  staging_state="$(database_presence "$STAGING_DATABASE" "$TARGET_USER")" ||
    staging_state="unknown"

  if [[ "$target_state" == "missing" && "$old_state" == "exists" ]]; then
    compose exec -T "$SERVICE" psql -X -v ON_ERROR_STOP=1 \
      -U "$TARGET_USER" \
      -d postgres \
      -c "ALTER DATABASE \"$OLD_DATABASE\" RENAME TO \"$TARGET_DATABASE\";" \
      >/dev/null 2>&1 || return 0
    target_state="$(database_presence "$TARGET_DATABASE" "$TARGET_USER")" ||
      target_state="unknown"
    old_state="$(database_presence "$OLD_DATABASE" "$TARGET_USER")" ||
      old_state="unknown"
  fi

  if [[ "$target_state" == "exists" &&
    "$old_state" == "missing" &&
    "$staging_state" == "exists" ]]; then
    compose exec -T "$SERVICE" dropdb -U "$TARGET_USER" --force \
      "$STAGING_DATABASE" >/dev/null 2>&1 || true
  elif [[ "$target_state" == "missing" &&
    "$old_state" == "missing" &&
    "$staging_state" == "exists" ]]; then
    compose exec -T "$SERVICE" dropdb -U "$TARGET_USER" --force \
      "$STAGING_DATABASE" >/dev/null 2>&1 || true
  fi
}

cleanup() {
  local exit_status=$?

  set +e
  [[ -z "${VALIDATION_TEMP:-}" ]] || rm -f -- "$VALIDATION_TEMP"
  [[ -z "${COMPATIBLE_STATE_TEMP:-}" ]] ||
    rm -f -- "$COMPATIBLE_STATE_TEMP"
  [[ -z "${PRE_RESTORE_LOG:-}" ]] || rm -f -- "$PRE_RESTORE_LOG"
  if [[ "$ENVIRONMENT" == "production" && "$LOCK_HELD" -eq 1 ]]; then
    cleanup_production_databases
  fi
  release_lock
  return "$exit_status"
}

handle_signal() {
  local status="$1"

  trap - EXIT HUP INT TERM
  cleanup
  exit "$status"
}

verify_prisma_migration_state() {
  local database_name="$1"
  local database_user="$2"
  local expected_count="$3"
  local expected_sha256="$4"
  local table_state migration_rows

  [[ "$expected_count" =~ ^[1-9][0-9]*$ ]] || return 1
  [[ "$expected_sha256" =~ ^[0-9a-f]{64}$ ]] || return 1

  table_state="$(
    compose exec -T "$SERVICE" psql -X -A -t \
      -U "$database_user" \
      -d "$database_name" \
      -c "SELECT CASE
        WHEN to_regclass('public._prisma_migrations') IS NULL
          THEN 'missing'
        ELSE 'present'
      END;"
  )" || return 1
  [[ "$table_state" == "present" ]] || return 1

  migration_rows="$(
    compose exec -T "$SERVICE" psql -X -A -t -F $'\t' \
      -U "$database_user" \
      -d "$database_name" \
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
  )" || return 1

  migration_contract_from_rows "$migration_rows" || return 1
  [[ "$MIGRATION_CONTRACT_COUNT" == "$expected_count" ]] || return 1
  [[ "$MIGRATION_CONTRACT_SHA256" == "$expected_sha256" ]]
}

verify_restored_database() {
  local database_name="$1"
  local database_user="$2"
  local expected_migration_count="$3"
  local expected_migration_sha256="$4"

  compose exec -T "$SERVICE" psql -X -A -t \
    -U "$database_user" \
      -d "$database_name" \
      -c "SELECT 1;" >/dev/null ||
    return 1
  verify_prisma_migration_state \
    "$database_name" \
    "$database_user" \
    "$expected_migration_count" \
    "$expected_migration_sha256"
}

persist_database_compatible_revision() {
  local revision="$1"

  [[ "$revision" =~ ^[0-9a-f]{40}$ ]] || return 1
  mkdir -p -- "$STATE_DIR" || return 1
  COMPATIBLE_STATE_TEMP="$(
    mktemp "$STATE_DIR/.database-compatible.sha.XXXXXX"
  )" || return 1
  chmod 600 -- "$COMPATIBLE_STATE_TEMP" || return 1
  printf '%s\n' "$revision" > "$COMPATIBLE_STATE_TEMP" || return 1
  mv -- "$COMPATIBLE_STATE_TEMP" "$DATABASE_COMPATIBLE_FILE" || return 1
  COMPATIBLE_STATE_TEMP=""
}

fail_compatibility_state_persistence() {
  printf '%s\n' \
    "restore:database-restored compatibility-state=operator-repair-required" \
    "restore:operator-repair file=$DATABASE_COMPATIBLE_FILE revision=$BACKUP_COMPATIBLE_REVISION" \
    "restore:failed:compatible-state-persistence" >&2
  exit 1
}

attempt_pre_restore_backup() {
  local status failure_line failure_reason line

  PRE_RESTORE_LOG="$(mktemp /tmp/reset90-pre-restore-backup.XXXXXX.log)" ||
    return 1
  chmod 600 -- "$PRE_RESTORE_LOG" || return 1
  if "$SCRIPT_DIR/backup-db.sh" "$@" > "$PRE_RESTORE_LOG" 2>&1; then
    status=0
  else
    status=$?
  fi
  while IFS= read -r line; do
    printf '%s\n' "$line"
  done < "$PRE_RESTORE_LOG"

  if [[ "$status" -eq 0 ]]; then
    rm -f -- "$PRE_RESTORE_LOG"
    PRE_RESTORE_LOG=""
    return 0
  fi
  if grep -Fq "backup:verified filename=" "$PRE_RESTORE_LOG"; then
    printf '%s\n' \
      "restore:pre-restore-backup-retention=failed bundle=preserved" >&2
    rm -f -- "$PRE_RESTORE_LOG"
    PRE_RESTORE_LOG=""
    return 0
  fi

  failure_line="$(
    awk '/^backup:failed:/ { value = $0 } END { print value }' \
      "$PRE_RESTORE_LOG"
  )"
  failure_reason="${failure_line#backup:failed:}"
  rm -f -- "$PRE_RESTORE_LOG"
  PRE_RESTORE_LOG=""
  case "$failure_reason" in
    postgres-service-missing | postgres-service-unhealthy | \
      postgres-tooling-missing | postgres-major-version-unsupported | \
      migration-contract-unavailable | migration-contract-invalid | \
      creation-or-validation | pg-dump | zero-byte-dump | compression | \
      zero-byte-compressed-output | gzip-integrity | checksum | metadata | \
      permissions | publish-backup | publish-checksum | publish-metadata | \
      final-publication-validation | published-artifact-invalid | \
      filename-collision)
      return 2
      ;;
    *)
      return 1
      ;;
  esac
}

validate_production_backup() {
  local metadata_result

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
      digest="$(sha256sum "$file" | awk "{ print \$1 }")"
      printf "%s\n" "$digest" | grep -Eq "^[0-9a-f]{64}$" || exit 53
      size_bytes="$(stat -c "%s" "$file")"
      printf "%s\n" "$size_bytes" | grep -Eq "^[1-9][0-9]*$" || exit 53
      [ "$(awk "END { print NR }" "$file.sha256")" -eq 1 ] || exit 53
      checksum_digest="$(
        awk -v expected="$base" '"'"'
          NF == 2 && length($1) == 64 && $1 ~ /^[0-9a-f]+$/ &&
            $2 == expected { print $1; found = 1 }
          END { if (!found) exit 1 }
        '"'"' "$file.sha256"
      )" || exit 53
      (
        cd "$root"
        sha256sum -c "$base.sha256" >/dev/null 2>&1
      ) || exit 53
      [ "$checksum_digest" = "$digest" ] || exit 53

      timestamp="$(printf "%s" "$base" | cut -d_ -f2)"
      purpose="$(printf "%s" "$base" | cut -d_ -f3)"
      revision="${base#reset90_${timestamp}_${purpose}_}"
      revision="${revision%.sql.gz}"
      printf "%s\n" "$revision" | grep -Eq "^[0-9a-f]{40}$" || exit 54
      metadata="$file.meta"
      metadata_value() {
        key="$1"
        awk -F= -v target="$key" '"'"'
          index($0, target "=") == 1 {
            count += 1
            value = substr($0, length(target) + 2)
          }
          END {
            if (count != 1) exit 1
            printf "%s", value
          }
        '"'"' "$metadata"
      }
      [ "$(metadata_value metadata_version)" = "$metadata_version" ] ||
        exit 54
      [ "$(metadata_value filename)" = "$base" ] || exit 54
      [ "$(metadata_value created_utc)" = "$timestamp" ] || exit 54
      [ "$(metadata_value purpose)" = "$purpose" ] || exit 54
      compatible_revision="$(metadata_value compatible_app_revision)" ||
        exit 54
      [ "$compatible_revision" = "$revision" ] || exit 54
      target_revision="$(metadata_value deployment_target_revision)" ||
        exit 54
      printf "%s\n" "$target_revision" |
        grep -Eq "^(none|[0-9a-f]{40})$" || exit 54
      [ "$(metadata_value postgres_major)" = "$expected_major" ] || exit 55
      source_database="$(metadata_value source_database)" || exit 54
      printf "%s\n" "$source_database" |
        grep -Eq "^[A-Za-z_][A-Za-z0-9_]{0,62}$" || exit 54
      [ "$(metadata_value artifact_size_bytes)" = "$size_bytes" ] || exit 53
      [ "$(metadata_value artifact_sha256)" = "$digest" ] || exit 53
      migration_count="$(metadata_value migration_count)" || exit 54
      migration_sha256="$(metadata_value migration_names_sha256)" || exit 54
      printf "%s\n" "$migration_count" |
        grep -Eq "^[1-9][0-9]*$" || exit 54
      printf "%s\n" "$migration_sha256" |
        grep -Eq "^[0-9a-f]{64}$" || exit 54
      gzip -cd "$file" |
        awk '"'"'index($0, "PostgreSQL database dump") { found = 1 }
          END { exit(found ? 0 : 1) }'"'"' || exit 56
      printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s" \
        "$source_database" \
        "$compatible_revision" \
        "$expected_major" \
        "$digest" \
        "$size_bytes" \
        "$migration_count" \
        "$migration_sha256" \
        "$target_revision"
    ' sh \
      "$BACKUP_ROOT" \
      "$BACKUP_FILE" \
      "$BACKUP_BASENAME" \
      "$RESET90_BACKUP_ROOT_MARKER" \
      "$RESET90_BACKUP_ROOT_MARKER_VALUE" \
      "$RESET90_BACKUP_METADATA_VERSION" \
      "$RESET90_POSTGRES_MAJOR"
  )" || return 1
  IFS=$'\t' read -r SOURCE_DATABASE BACKUP_COMPATIBLE_REVISION BACKUP_MAJOR \
    BACKUP_DIGEST BACKUP_SIZE_BYTES BACKUP_MIGRATION_COUNT \
    BACKUP_MIGRATION_SHA256 BACKUP_DEPLOYMENT_TARGET_REVISION \
    <<< "$metadata_result"
  [[ "$BACKUP_COMPATIBLE_REVISION" =~ ^[0-9a-f]{40}$ ]] || return 1
  [[ "$BACKUP_DIGEST" =~ ^[0-9a-f]{64}$ ]] || return 1
  [[ "$BACKUP_SIZE_BYTES" =~ ^[1-9][0-9]*$ ]] || return 1
  [[ "$BACKUP_MIGRATION_COUNT" =~ ^[1-9][0-9]*$ ]] || return 1
  [[ "$BACKUP_MIGRATION_SHA256" =~ ^[0-9a-f]{64}$ ]] || return 1
  BACKUP_FINGERPRINT="$SOURCE_DATABASE"$'\t'"$BACKUP_COMPATIBLE_REVISION"$'\t'"$BACKUP_MAJOR"$'\t'"$BACKUP_DIGEST"$'\t'"$BACKUP_SIZE_BYTES"$'\t'"$BACKUP_MIGRATION_COUNT"$'\t'"$BACKUP_MIGRATION_SHA256"$'\t'"$BACKUP_DEPLOYMENT_TARGET_REVISION"
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
    --degraded-recovery)
      DEGRADED_RECOVERY=1
      shift
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
if [[ "$DEGRADED_RECOVERY" -eq 1 && "$ENVIRONMENT" != "production" ]]; then
  fail "degraded-recovery-production-only"
fi

if [[ -z "$COMPOSE_FILE" ]]; then
  if [[ "$ENVIRONMENT" == "production" ]]; then
    COMPOSE_FILE="$REPO_ROOT/docker-compose.production.yml"
  else
    fail "test-compose-file-required"
  fi
fi
[[ "$COMPOSE_FILE" == /* ]] || COMPOSE_FILE="$PWD/$COMPOSE_FILE"
[[ -f "$COMPOSE_FILE" ]] || fail "compose-file-missing"

for required_command in awk chmod dirname docker find flock grep gunzip gzip mkdir mktemp mv node realpath rm sha256sum sort stat; do
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
  trap cleanup EXIT
  trap 'handle_signal 129' HUP
  trap 'handle_signal 130' INT
  trap 'handle_signal 143' TERM
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
            AND NOT EXISTS (
              SELECT 1
              FROM pg_catalog.pg_depend AS dependency
              WHERE dependency.classid = 'pg_class'::regclass
                AND dependency.objid = relation.oid
                AND dependency.refclassid = 'pg_extension'::regclass
                AND dependency.deptype = 'e'
            )

          UNION ALL

          SELECT 1 AS evidence
          FROM pg_catalog.pg_type AS database_type
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = database_type.typnamespace
          WHERE namespace.nspname <> 'information_schema'
            AND namespace.nspname !~ '^pg_'
            AND database_type.typtype IN ('d', 'e')
            AND NOT EXISTS (
              SELECT 1
              FROM pg_catalog.pg_depend AS dependency
              WHERE dependency.classid = 'pg_type'::regclass
                AND dependency.objid = database_type.oid
                AND dependency.refclassid = 'pg_extension'::regclass
                AND dependency.deptype = 'e'
            )

          UNION ALL

          SELECT 1 AS evidence
          FROM pg_catalog.pg_proc AS routine
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = routine.pronamespace
          WHERE namespace.nspname <> 'information_schema'
            AND namespace.nspname !~ '^pg_'
            AND routine.prokind IN ('f', 'p', 'a', 'w')
            AND NOT EXISTS (
              SELECT 1
              FROM pg_catalog.pg_depend AS dependency
              WHERE dependency.classid = 'pg_proc'::regclass
                AND dependency.objid = routine.oid
                AND dependency.refclassid = 'pg_extension'::regclass
                AND dependency.deptype = 'e'
            )

          UNION ALL

          SELECT 1 AS evidence
          FROM pg_catalog.pg_operator AS database_operator
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = database_operator.oprnamespace
          WHERE namespace.nspname <> 'information_schema'
            AND namespace.nspname !~ '^pg_'
            AND NOT EXISTS (
              SELECT 1
              FROM pg_catalog.pg_depend AS dependency
              WHERE dependency.classid = 'pg_operator'::regclass
                AND dependency.objid = database_operator.oid
                AND dependency.refclassid = 'pg_extension'::regclass
                AND dependency.deptype = 'e'
            )

          UNION ALL

          SELECT 1 AS evidence
          FROM pg_catalog.pg_namespace AS namespace
          WHERE namespace.nspname <> 'public'
            AND namespace.nspname <> 'information_schema'
            AND namespace.nspname !~ '^pg_'
            AND NOT EXISTS (
              SELECT 1
              FROM pg_catalog.pg_depend AS dependency
              WHERE dependency.classid = 'pg_namespace'::regclass
                AND dependency.objid = namespace.oid
                AND dependency.refclassid = 'pg_extension'::regclass
                AND dependency.deptype = 'e'
            )
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
  verify_restored_database \
    "$TARGET_DATABASE" \
    "$TARGET_USER" \
    "$VALIDATED_BACKUP_MIGRATION_COUNT" \
    "$VALIDATED_BACKUP_MIGRATION_SHA256" ||
    fail "restored-database-verification"
  printf 'restore:complete mode=test target=%s backup=%s\n' \
    "$TARGET_DATABASE" "$VALIDATED_BACKUP_BASENAME"
  printf 'restore:compatible-app-revision=%s\n' \
    "$VALIDATED_BACKUP_COMPATIBLE_REVISION"
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
BACKUP_NAME_REVISION="${BASH_REMATCH[3]}"
[[ "$BACKUP_NAME_REVISION" =~ ^[0-9a-f]{40}$ ]] ||
  fail "production-backup-revision-invalid"

"$SCRIPT_DIR/production-check.sh" "$ENV_FILE"
TARGET_DATABASE="$(production_env_value "$ENV_FILE" POSTGRES_DB)" ||
  fail "production-database-unavailable"
TARGET_USER="$(production_env_value "$ENV_FILE" POSTGRES_USER)" ||
  fail "production-user-unavailable"
[[ "$TARGET_DATABASE" =~ $RESET90_SAFE_DATABASE_REGEX ]] ||
  fail "unsafe-target-database"
[[ "$TARGET_USER" =~ $RESET90_SAFE_DATABASE_REGEX ]] ||
  fail "unsafe-target-user"

[[ -t 0 && -t 1 ]] || fail "production-restore-requires-interactive-tty"
if [[ "$DEGRADED_RECOVERY" -eq 1 ]]; then
  EXPECTED_CONFIRMATION="DEGRADED RESTORE $TARGET_DATABASE FROM $BACKUP_BASENAME"
else
  EXPECTED_CONFIRMATION="RESTORE $TARGET_DATABASE FROM $BACKUP_BASENAME"
fi
read -r -p "Type '$EXPECTED_CONFIRMATION' to continue: " CONFIRMATION
[[ "$CONFIRMATION" == "$EXPECTED_CONFIRMATION" ]] ||
  fail "production-confirmation-mismatch"

command -v flock >/dev/null 2>&1 || fail "missing-command-flock"
exec 9>>"$LOCK_FILE" || fail "production-lock-unavailable"
flock -n "$LOCK_FD" || fail "production-lock-held"
LOCK_HELD=1
trap cleanup EXIT
trap 'handle_signal 129' HUP
trap 'handle_signal 130' INT
trap 'handle_signal 143' TERM
printf 'restore:production-lock-acquired\n'

validate_production_backup || fail "backup-artifact-invalid"
INITIAL_BACKUP_FINGERPRINT="$BACKUP_FINGERPRINT"
INITIAL_SOURCE_DATABASE="$SOURCE_DATABASE"
[[ "$INITIAL_SOURCE_DATABASE" == "$TARGET_DATABASE" ]] ||
  fail "backup-source-database-mismatch"

[[ -z "$(compose ps --status running -q app)" ]] ||
  fail "application-writes-not-stopped"
target_presence="$(database_presence "$TARGET_DATABASE" "$TARGET_USER")" ||
  fail "target-database-state-unavailable"
if CURRENT_COMPATIBLE_REVISION="$(
  verified_database_compatible_revision "$DATABASE_COMPATIBLE_FILE"
)"; then
  :
elif [[ "$DEGRADED_RECOVERY" -eq 0 ]]; then
  fail "production-compatible-revision-unavailable"
else
  CURRENT_COMPATIBLE_REVISION=""
fi

if [[ "$target_presence" == "missing" ]]; then
  [[ "$DEGRADED_RECOVERY" -eq 1 ]] || fail "target-database-missing"
  printf '%s\n' \
    "restore:pre-restore-backup=skipped reason=database-missing"
else
  pre_restore_backup_arguments=(
    --environment production
    --env-file "$ENV_FILE"
    --compose-file "$COMPOSE_FILE"
    --backup-root "$BACKUP_ROOT"
    --purpose prerestore
    --retention-protect-file "$BACKUP_FILE"
    --deployment-lock-fd "$LOCK_FD"
  )
  if [[ -n "$CURRENT_COMPATIBLE_REVISION" ]]; then
    pre_restore_backup_arguments+=(
      --compatible-app-revision "$CURRENT_COMPATIBLE_REVISION"
    )
  else
    pre_restore_backup_arguments+=(
      --compatible-app-revision unknown-revision
      --degraded-recovery
    )
  fi

  if attempt_pre_restore_backup "${pre_restore_backup_arguments[@]}"; then
    printf 'restore:pre-restore-backup=completed\n'
  else
    pre_restore_backup_status=$?
    if [[ "$DEGRADED_RECOVERY" -eq 1 &&
      "$pre_restore_backup_status" -eq 2 ]]; then
      printf '%s\n' \
        "restore:pre-restore-backup=skipped reason=database-unavailable"
    else
      fail "pre-restore-backup"
    fi
  fi
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
STAGING_DATABASE="${TARGET_DATABASE}_restore_test_${timestamp}_$$"
OLD_DATABASE="${TARGET_DATABASE}_prerestore_${timestamp}_$$"
[[ "$STAGING_DATABASE" =~ $RESET90_SAFE_DATABASE_REGEX ]] ||
  fail "unsafe-staging-database"
[[ "$OLD_DATABASE" =~ $RESET90_SAFE_DATABASE_REGEX ]] ||
  fail "unsafe-old-database"
[[ "$INITIAL_SOURCE_DATABASE" != "$STAGING_DATABASE" ]] ||
  fail "source-target-database-equality"
staging_presence="$(database_presence "$STAGING_DATABASE" "$TARGET_USER")" ||
  fail "staging-database-state-unavailable"
[[ "$staging_presence" == "missing" ]] ||
  fail "staging-database-collision"
old_presence="$(database_presence "$OLD_DATABASE" "$TARGET_USER")" ||
  fail "old-database-state-unavailable"
[[ "$old_presence" == "missing" ]] ||
  fail "old-database-collision"

compose exec -T "$SERVICE" createdb -U "$TARGET_USER" -T template0 \
  "$STAGING_DATABASE" ||
  fail "staging-database-create"
validate_production_backup || fail "backup-artifact-invalid"
[[ "$BACKUP_FINGERPRINT" == "$INITIAL_BACKUP_FINGERPRINT" ]] ||
  fail "backup-artifact-changed"
compose exec -T "$SERVICE" sh -eu -c '
  file="$1"
  user="$2"
  database="$3"
  for command in chmod gzip mktemp psql rm; do
    command -v "$command" >/dev/null 2>&1
  done
  restore_sql="$(mktemp /tmp/reset90-production-restore.XXXXXX.sql)"
  cleanup() {
    rm -f -- "$restore_sql"
  }
  trap cleanup EXIT
  trap "exit 129" HUP
  trap "exit 130" INT
  trap "exit 143" TERM
  chmod 600 "$restore_sql"
  gzip -cd "$file" > "$restore_sql"
  psql -X -v ON_ERROR_STOP=1 --single-transaction \
    -U "$user" -d "$database" -f "$restore_sql"
' sh "$BACKUP_FILE" "$TARGET_USER" "$STAGING_DATABASE" ||
  fail "restore"
verify_restored_database \
  "$STAGING_DATABASE" \
  "$TARGET_USER" \
  "$BACKUP_MIGRATION_COUNT" \
  "$BACKUP_MIGRATION_SHA256" ||
  fail "restored-database-verification"

if [[ "$target_presence" == "exists" ]]; then
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
fi
compose exec -T "$SERVICE" psql -X -v ON_ERROR_STOP=1 \
  -U "$TARGET_USER" \
  -d postgres \
  -c "ALTER DATABASE \"$STAGING_DATABASE\" RENAME TO \"$TARGET_DATABASE\";" ||
  fail "staging-promote"
verify_restored_database \
  "$TARGET_DATABASE" \
  "$TARGET_USER" \
  "$BACKUP_MIGRATION_COUNT" \
  "$BACKUP_MIGRATION_SHA256" ||
  fail "final-database-verification"
if [[ "$target_presence" == "exists" ]]; then
  compose exec -T "$SERVICE" dropdb -U "$TARGET_USER" --force "$OLD_DATABASE" ||
    fail "old-database-remove"
fi
persist_database_compatible_revision "$BACKUP_COMPATIBLE_REVISION" ||
  fail_compatibility_state_persistence

printf 'restore:complete mode=production target=%s backup=%s\n' \
  "$TARGET_DATABASE" "$BACKUP_BASENAME"
printf 'restore:application-remains-stopped select-revision=%s\n' \
  "$BACKUP_COMPATIBLE_REVISION"
