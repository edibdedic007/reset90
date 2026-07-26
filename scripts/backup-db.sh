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
GIT_SHA=""
DATABASE_NAME=""
DATABASE_USER=""
SERVICE="db"
PUBLISHED=0
RAW_TEMP=""
COMPRESSED_TEMP=""
CHECKSUM_TEMP=""
METADATA_TEMP=""
FINAL_FILE=""
FINAL_CHECKSUM=""
FINAL_METADATA=""

source "$SCRIPT_DIR/lib/backup-restore.sh"

fail() {
  printf 'backup:failed:%s\n' "$1" >&2
  exit 1
}

usage() {
  printf '%s\n' \
    "Usage: backup-db.sh --environment local|test|production --env-file FILE" \
    "  --backup-root ABSOLUTE_PATH --purpose PURPOSE [--git-sha SHA]" \
    "  [--compose-file FILE] [--project NAME] [--database NAME] [--user NAME]"
}

cleanup_temporary_backup() {
  rm -f -- \
    "${RAW_TEMP:-}" \
    "${COMPRESSED_TEMP:-}" \
    "${CHECKSUM_TEMP:-}" \
    "${METADATA_TEMP:-}"
  if [[ "$PUBLISHED" -ne 1 ]]; then
    rm -f -- "${FINAL_CHECKSUM:-}" "${FINAL_METADATA:-}"
  fi
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
    --git-sha)
      GIT_SHA="${2:-}"
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

for required_command in awk chmod date docker grep gzip mkdir mv realpath rm sha256sum stat; do
  command -v "$required_command" >/dev/null 2>&1 ||
    fail "missing-command-$required_command"
done
docker compose version >/dev/null 2>&1 || fail "missing-docker-compose"

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
postgres_major="$(
  compose exec -T "$SERVICE" pg_dump --version |
    awk '{ for (field = 1; field <= NF; field += 1) if ($field ~ /^[0-9]+(\.[0-9]+)*$/) { split($field, version, "."); print version[1]; exit } }'
)"
[[ "$postgres_major" == "$RESET90_POSTGRES_MAJOR" ]] ||
  fail "postgres-major-version-unsupported"

if [[ -z "$DATABASE_NAME" || -z "$DATABASE_USER" ]]; then
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

if [[ -z "$GIT_SHA" ]] && command -v git >/dev/null 2>&1; then
  GIT_SHA="$(
    git -C "$REPO_ROOT" rev-parse --verify HEAD 2>/dev/null || true
  )"
fi
if [[ ! "$GIT_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  if [[ "$ENVIRONMENT" == "production" ]]; then
    fail "production-git-sha-required"
  fi
  GIT_SHA="unknown-revision"
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
filename="reset90_${timestamp}_${PURPOSE}_${GIT_SHA}.sql.gz"

if [[ "$ENVIRONMENT" == "production" ]]; then
  compose exec -T "$SERVICE" sh -eu -c '
    root="$1"
    filename="$2"
    timestamp="$3"
    purpose="$4"
    revision="$5"
    database_name="$6"
    database_user="$7"
    expected_major="$8"
    marker_name="$9"
    marker_value="${10}"
    metadata_version="${11}"

    case "$root" in
      /*backup*) ;;
      *) exit 30 ;;
    esac
    [ "$root" != "/" ] || exit 30
    command -v pg_dump >/dev/null 2>&1 || exit 31
    command -v gzip >/dev/null 2>&1 || exit 32
    command -v sha256sum >/dev/null 2>&1 || exit 33

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
        rm -f -- "$final_checksum" "$final_metadata"
      fi
    }
    trap cleanup EXIT HUP INT TERM

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
    printf "%s  %s\n" "$digest" "$filename" > "$checksum"
    printf "%s\n" \
      "metadata_version=$metadata_version" \
      "filename=$filename" \
      "created_utc=$timestamp" \
      "purpose=$purpose" \
      "git_sha=$revision" \
      "postgres_major=$detected_major" \
      "source_database=$database_name" > "$metadata"
    chmod 600 -- "$compressed" "$checksum" "$metadata"
    mv -- "$checksum" "$final_checksum"
    mv -- "$metadata" "$final_metadata"
    mv -- "$compressed" "$final"
    published=1
    if ! (
      cd -- "$root"
      gzip -t -- "$filename"
      sha256sum -c -- "$filename.sha256" >/dev/null
    ); then
      mv -- "$final" "$final.$$.failed" 2>/dev/null || rm -f -- "$final"
      mv -- "$final_checksum" "$final_checksum.$$.failed" 2>/dev/null ||
        rm -f -- "$final_checksum"
      mv -- "$final_metadata" "$final_metadata.$$.failed" 2>/dev/null ||
        rm -f -- "$final_metadata"
      exit 40
    fi
    cleanup
    trap - EXIT HUP INT TERM
  ' sh \
    "$BACKUP_ROOT" \
    "$filename" \
    "$timestamp" \
    "$PURPOSE" \
    "$GIT_SHA" \
    "$DATABASE_NAME" \
    "$DATABASE_USER" \
    "$RESET90_POSTGRES_MAJOR" \
    "$RESET90_BACKUP_ROOT_MARKER" \
    "$RESET90_BACKUP_ROOT_MARKER_VALUE" \
    "$RESET90_BACKUP_METADATA_VERSION" ||
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
  trap cleanup_temporary_backup EXIT HUP INT TERM

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
  printf '%s  %s\n' "$digest" "$filename" > "$CHECKSUM_TEMP" ||
    fail "checksum"
  printf '%s\n' \
    "metadata_version=$RESET90_BACKUP_METADATA_VERSION" \
    "filename=$filename" \
    "created_utc=$timestamp" \
    "purpose=$PURPOSE" \
    "git_sha=$GIT_SHA" \
    "postgres_major=$postgres_major" \
    "source_database=$DATABASE_NAME" > "$METADATA_TEMP" ||
    fail "metadata"
  chmod 600 -- "$COMPRESSED_TEMP" "$CHECKSUM_TEMP" "$METADATA_TEMP" ||
    fail "permissions"
  mv -- "$CHECKSUM_TEMP" "$FINAL_CHECKSUM" || fail "publish-checksum"
  mv -- "$METADATA_TEMP" "$FINAL_METADATA" || fail "publish-metadata"
  mv -- "$COMPRESSED_TEMP" "$FINAL_FILE" || fail "publish-backup"
  PUBLISHED=1
  cleanup_temporary_backup
  if ! validate_backup_artifact "$FINAL_FILE" "$BACKUP_ROOT"; then
    mv -- "$FINAL_FILE" "$FINAL_FILE.$$.failed" 2>/dev/null ||
      rm -f -- "$FINAL_FILE"
    mv -- "$FINAL_CHECKSUM" "$FINAL_CHECKSUM.$$.failed" 2>/dev/null ||
      rm -f -- "$FINAL_CHECKSUM"
    mv -- "$FINAL_METADATA" "$FINAL_METADATA.$$.failed" 2>/dev/null ||
      rm -f -- "$FINAL_METADATA"
    fail "published-artifact-invalid"
  fi
  trap - EXIT HUP INT TERM
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
"$SCRIPT_DIR/backup-retention.sh" "${retention_arguments[@]}" ||
  fail "retention"
