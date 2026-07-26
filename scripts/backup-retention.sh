#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
ENVIRONMENT=""
ENV_FILE=""
COMPOSE_FILE=""
COMPOSE_PROJECT=""
BACKUP_ROOT=""
MODE=""
PROTECTED_FILE=""
LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/reset90-production-deploy.lock}"
DEPLOYMENT_LOCK_FD=""
RETENTION_LOCK_FD=8
RETENTION_LOCK_HELD=0
RETENTION_DAYS=30
MINIMUM_KEEP=7
MANIFEST=""
SORTED_MANIFEST=""

source "$SCRIPT_DIR/lib/backup-restore.sh"

fail() {
  printf 'retention:failed:%s\n' "$1" >&2
  exit 1
}

usage() {
  printf '%s\n' \
    "Usage: backup-retention.sh --environment local|test|production" \
    "  --env-file FILE --backup-root ABSOLUTE_PATH --dry-run|--apply" \
    "  [--compose-file FILE] [--project NAME] [--protect-file BACKUP.sql.gz]"
}

cleanup() {
  [[ -z "${MANIFEST:-}" ]] || rm -f -- "$MANIFEST"
  [[ -z "${SORTED_MANIFEST:-}" ]] || rm -f -- "$SORTED_MANIFEST"
  if [[ "$RETENTION_LOCK_HELD" -eq 1 ]]; then
    flock -u "$RETENTION_LOCK_FD" || true
    RETENTION_LOCK_HELD=0
  fi
}

handle_signal() {
  local status="$1"

  trap - EXIT HUP INT TERM
  cleanup
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
    --compose-file)
      COMPOSE_FILE="${2:-}"
      shift 2
      ;;
    --project)
      COMPOSE_PROJECT="${2:-}"
      shift 2
      ;;
    --dry-run)
      MODE="dry-run"
      shift
      ;;
    --apply)
      MODE="apply"
      shift
      ;;
    --protect-file)
      PROTECTED_FILE="${2:-}"
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
[[ "$MODE" =~ ^(dry-run|apply)$ ]] || fail "retention-mode-required"
if [[ -n "$DEPLOYMENT_LOCK_FD" ]]; then
  [[ "$DEPLOYMENT_LOCK_FD" =~ ^[0-9]+$ ]] ||
    fail "invalid-deployment-lock-fd"
fi
if [[ -n "$PROTECTED_FILE" ]]; then
  protected_basename="${PROTECTED_FILE##*/}"
  [[ "$PROTECTED_FILE" == "$BACKUP_ROOT/$protected_basename" ]] ||
    fail "protect-file-outside-root"
  [[ "$protected_basename" =~ $RESET90_BACKUP_NAME_REGEX ]] ||
    fail "protect-file-invalid"
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
  for required_command in docker flock; do
    command -v "$required_command" >/dev/null 2>&1 ||
      fail "missing-command-$required_command"
  done
  if [[ -n "$DEPLOYMENT_LOCK_FD" ]]; then
    [[ -e "/proc/$$/fd/$DEPLOYMENT_LOCK_FD" ]] ||
      fail "deployment-lock-fd-unavailable"
    flock -n "$DEPLOYMENT_LOCK_FD" ||
      fail "production-lock-held"
  else
    exec 8>>"$LOCK_FILE" || fail "production-lock-unavailable"
    flock -n "$RETENTION_LOCK_FD" || fail "production-lock-held"
    RETENTION_LOCK_HELD=1
  fi
  trap cleanup EXIT
  trap 'handle_signal 129' HUP
  trap 'handle_signal 130' INT
  trap 'handle_signal 143' TERM
  docker compose version >/dev/null 2>&1 || fail "missing-docker-compose"

  compose exec -T db sh -eu -c '
    root="$1"
    mode="$2"
    retention_days="$3"
    minimum_keep="$4"
    marker_name="$5"
    marker_value="$6"
    expected_major="$7"
    metadata_version="$8"
    protected_file="$9"

    case "$root" in
      /*backup*) ;;
      *) exit 40 ;;
    esac
    [ "$root" != "/" ] || exit 40
    marker="$root/$marker_name"
    if [ ! -e "$root" ]; then
      printf "retention:complete verified=0 candidates=0 mode=%s\n" "$mode"
      exit 0
    fi
    [ -d "$root" ] && [ ! -L "$root" ] || exit 40
    if [ ! -e "$marker" ]; then
      printf "retention:complete verified=0 candidates=0 mode=%s\n" "$mode"
      exit 0
    fi
    [ -f "$marker" ] && [ ! -L "$marker" ] || exit 40
    [ "$(cat "$marker")" = "$marker_value" ] || exit 40

    manifest="$root/.retention.$$.manifest.partial"
    sorted="$root/.retention.$$.sorted.partial"
    cleanup() {
      rm -f -- "$manifest" "$sorted"
    }
    trap cleanup EXIT HUP INT TERM
    : > "$manifest"
    chmod 600 -- "$manifest"
    verified=0

    find "$root" -maxdepth 1 -type f -name "reset90_*.sql.gz" -print |
      while IFS= read -r file; do
        base="${file##*/}"
        printf "%s\n" "$base" |
          grep -Eq "^reset90_[0-9]{8}T[0-9]{6}Z_[a-z][a-z0-9-]{0,31}_([0-9a-f]{40}|unknown-revision)\\.sql\\.gz$" ||
          continue
        checksum="$file.sha256"
        metadata="$file.meta"
        [ -s "$file" ] && [ ! -L "$file" ] &&
          [ -s "$checksum" ] && [ ! -L "$checksum" ] &&
          [ -s "$metadata" ] && [ ! -L "$metadata" ] || continue
        [ "$(stat -c "%a" "$file")" = "600" ] &&
          [ "$(stat -c "%a" "$checksum")" = "600" ] &&
          [ "$(stat -c "%a" "$metadata")" = "600" ] || continue
        gzip -t "$file" >/dev/null 2>&1 || continue
        (
          cd "$root"
          sha256sum -c "$base.sha256" >/dev/null 2>&1
        ) || continue

        timestamp="$(printf "%s" "$base" | cut -d_ -f2)"
        purpose="$(printf "%s" "$base" | cut -d_ -f3)"
        revision="${base#reset90_${timestamp}_${purpose}_}"
        revision="${revision%.sql.gz}"
        grep -qx "metadata_version=$metadata_version" "$metadata" || continue
        grep -qx "filename=$base" "$metadata" || continue
        grep -qx "created_utc=$timestamp" "$metadata" || continue
        grep -qx "purpose=$purpose" "$metadata" || continue
        grep -qx "git_sha=$revision" "$metadata" || continue
        grep -qx "postgres_major=$expected_major" "$metadata" || continue
        grep -Eq "^source_database=[A-Za-z_][A-Za-z0-9_]{0,62}$" "$metadata" ||
          continue

        created="$(
          date -u -d \
            "${timestamp:0:4}-${timestamp:4:2}-${timestamp:6:2} ${timestamp:9:2}:${timestamp:11:2}:${timestamp:13:2} UTC" \
            +%s 2>/dev/null
        )" || continue
        printf "%s\t%s\n" "$created" "$file" >> "$manifest"
      done

    sort -rn "$manifest" > "$sorted"
    now="$(date -u +%s)"
    cutoff=$((now - retention_days * 86400))
    rank=0
    candidates=0
    while IFS="$(printf "\t")" read -r created file; do
      [ -n "$file" ] || continue
      rank=$((rank + 1))
      verified=$((verified + 1))
      if [ "$rank" -le "$minimum_keep" ] || [ "$created" -ge "$cutoff" ]; then
        continue
      fi
      if [ -n "$protected_file" ] && [ "$file" = "$protected_file" ]; then
        continue
      fi
      candidates=$((candidates + 1))
      for exact in "$file" "$file.sha256" "$file.meta"; do
        if [ "$mode" = "dry-run" ]; then
          printf "retention:would-remove path=%s\n" "$exact"
        else
          printf "retention:remove path=%s\n" "$exact"
        fi
      done
      if [ "$mode" = "apply" ]; then
        rm -f -- "$file" "$file.sha256" "$file.meta"
      fi
    done < "$sorted"
    printf "retention:complete verified=%s candidates=%s mode=%s\n" \
      "$verified" "$candidates" "$mode"
    cleanup
    trap - EXIT HUP INT TERM
  ' sh \
    "$BACKUP_ROOT" \
    "$MODE" \
    "$RETENTION_DAYS" \
    "$MINIMUM_KEEP" \
    "$RESET90_BACKUP_ROOT_MARKER" \
    "$RESET90_BACKUP_ROOT_MARKER_VALUE" \
    "$RESET90_POSTGRES_MAJOR" \
    "$RESET90_BACKUP_METADATA_VERSION" \
    "$PROTECTED_FILE" ||
    fail "production-retention"
  exit 0
fi

for required_command in date find gzip mktemp realpath rm sha256sum sort stat; do
  command -v "$required_command" >/dev/null 2>&1 ||
    fail "missing-command-$required_command"
done
backup_root_is_expected "$BACKUP_ROOT" || fail "backup-root-invalid"
if [[ ! -e "$BACKUP_ROOT" ]]; then
  printf 'retention:complete verified=0 candidates=0 mode=%s\n' "$MODE"
  exit 0
fi
[[ -d "$BACKUP_ROOT" && ! -L "$BACKUP_ROOT" ]] ||
  fail "backup-root-invalid"
if [[ ! -e "$BACKUP_ROOT/$RESET90_BACKUP_ROOT_MARKER" ]]; then
  printf 'retention:complete verified=0 candidates=0 mode=%s\n' "$MODE"
  exit 0
fi
require_existing_backup_root "$BACKUP_ROOT" || fail "backup-root-invalid"
BACKUP_ROOT="$(realpath -e -- "$BACKUP_ROOT")"
if [[ -n "$PROTECTED_FILE" ]]; then
  protected_parent="$(realpath -e -- "$(dirname -- "$PROTECTED_FILE")")" ||
    fail "protect-file-outside-root"
  [[ "$protected_parent" == "$BACKUP_ROOT" ]] ||
    fail "protect-file-outside-root"
  PROTECTED_FILE="$BACKUP_ROOT/${PROTECTED_FILE##*/}"
fi
MANIFEST="$(mktemp /tmp/reset90-retention-manifest.XXXXXX)"
SORTED_MANIFEST="$(mktemp /tmp/reset90-retention-sorted.XXXXXX)"
trap cleanup EXIT
trap 'handle_signal 129' HUP
trap 'handle_signal 130' INT
trap 'handle_signal 143' TERM

verified=0
while IFS= read -r -d '' file; do
  if ! validate_backup_artifact "$file" "$BACKUP_ROOT"; then
    continue
  fi
  timestamp="$VALIDATED_BACKUP_TIMESTAMP"
  created="$(
    date -u -d \
      "${timestamp:0:4}-${timestamp:4:2}-${timestamp:6:2} ${timestamp:9:2}:${timestamp:11:2}:${timestamp:13:2} UTC" \
      +%s 2>/dev/null
  )" || continue
  printf '%s\t%s\n' "$created" "$VALIDATED_BACKUP_FILE" >> "$MANIFEST"
done < <(
  find "$BACKUP_ROOT" -maxdepth 1 -type f -name 'reset90_*.sql.gz' -print0
)

sort -rn "$MANIFEST" > "$SORTED_MANIFEST"
now="$(date -u +%s)"
cutoff=$((now - RETENTION_DAYS * 86400))
rank=0
candidates=0
while IFS=$'\t' read -r created file; do
  [[ -n "$file" ]] || continue
  rank=$((rank + 1))
  verified=$((verified + 1))
  if [[ "$rank" -le "$MINIMUM_KEEP" || "$created" -ge "$cutoff" ]]; then
    continue
  fi
  if [[ -n "$PROTECTED_FILE" && "$file" == "$PROTECTED_FILE" ]]; then
    continue
  fi
  candidates=$((candidates + 1))
  for exact_file in "$file" "$file.sha256" "$file.meta"; do
    if [[ "$MODE" == "dry-run" ]]; then
      printf 'retention:would-remove path=%s\n' "$exact_file"
    else
      printf 'retention:remove path=%s\n' "$exact_file"
    fi
  done
  if [[ "$MODE" == "apply" ]]; then
    rm -f -- "$file" "$file.sha256" "$file.meta"
  fi
done < "$SORTED_MANIFEST"

printf 'retention:complete verified=%s candidates=%s mode=%s\n' \
  "$verified" "$candidates" "$MODE"
