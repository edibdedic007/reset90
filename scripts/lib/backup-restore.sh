#!/usr/bin/env bash

RESET90_BACKUP_METADATA_VERSION=2
RESET90_POSTGRES_MAJOR=16
RESET90_BACKUP_ROOT_MARKER=".reset90-backup-root"
RESET90_BACKUP_ROOT_MARKER_VALUE="reset90-backup-root-v1"
RESET90_BACKUP_NAME_REGEX='^reset90_([0-9]{8}T[0-9]{6}Z)_([a-z][a-z0-9-]{0,31})_([0-9a-f]{40}|unknown-revision)\.sql\.gz$'
RESET90_SAFE_DATABASE_REGEX='^[A-Za-z_][A-Za-z0-9_]{0,62}$'

backup_root_is_expected() {
  local root="${1:-}"
  local root_name

  [[ -n "$root" && "$root" == /* && "$root" != "/" && ! -L "$root" ]] ||
    return 1
  root_name="${root##*/}"
  [[ "$root_name" == *backup* ]]
}

prepare_backup_root() {
  local root="${1:?backup root is required}"
  local marker

  backup_root_is_expected "$root" || return 1
  mkdir -p -- "$root" || return 1
  [[ -d "$root" && ! -L "$root" ]] || return 1
  chmod 700 -- "$root" || return 1

  marker="$root/$RESET90_BACKUP_ROOT_MARKER"
  if [[ -e "$marker" ]]; then
    [[ -f "$marker" && ! -L "$marker" ]] || return 1
    [[ "$(<"$marker")" == "$RESET90_BACKUP_ROOT_MARKER_VALUE" ]] || return 1
  else
    printf '%s\n' "$RESET90_BACKUP_ROOT_MARKER_VALUE" > "$marker" ||
      return 1
  fi
  chmod 600 -- "$marker" || return 1
}

require_existing_backup_root() {
  local root="${1:?backup root is required}"
  local marker="$root/$RESET90_BACKUP_ROOT_MARKER"

  backup_root_is_expected "$root" || return 1
  [[ -d "$root" && ! -L "$root" && -f "$marker" && ! -L "$marker" ]] ||
    return 1
  [[ "$(<"$marker")" == "$RESET90_BACKUP_ROOT_MARKER_VALUE" ]]
}

backup_metadata_value() {
  local metadata_file="${1:?metadata file is required}"
  local key="${2:?metadata key is required}"

  awk -F= -v target="$key" '
    index($0, target "=") == 1 {
      count += 1
      value = substr($0, length(target) + 2)
    }
    END {
      if (count != 1) {
        exit 1
      }
      printf "%s", value
    }
  ' "$metadata_file"
}

migration_contract_from_rows() {
  local migration_rows="${1:-}"
  local migration_name migration_state sorted_names
  declare -A successful=()
  declare -A rolled_back=()

  while IFS=$'\t' read -r migration_name migration_state; do
    [[ -n "$migration_name" || -n "$migration_state" ]] || continue
    [[ "$migration_name" =~ ^[0-9][0-9A-Za-z_]*$ ]] || return 1
    case "$migration_state" in
      completed)
        successful["$migration_name"]=$((
          ${successful["$migration_name"]:-0} + 1
        ))
        ;;
      rolled-back)
        rolled_back["$migration_name"]=$((
          ${rolled_back["$migration_name"]:-0} + 1
        ))
        ;;
      unfinished | failed | inconsistent)
        return 1
        ;;
      *)
        return 1
        ;;
    esac
  done <<< "$migration_rows"

  [[ "${#successful[@]}" -gt 0 ]] || return 1
  for migration_name in "${!successful[@]}"; do
    [[ "${successful[$migration_name]}" -eq 1 ]] || return 1
  done
  for migration_name in "${!rolled_back[@]}"; do
    [[ "${rolled_back[$migration_name]}" -eq 1 ]] || return 1
    [[ "${successful[$migration_name]:-0}" -eq 1 ]] || return 1
  done

  sorted_names="$(
    printf '%s\n' "${!successful[@]}" | sort
  )" || return 1
  MIGRATION_CONTRACT_COUNT="${#successful[@]}"
  MIGRATION_CONTRACT_SHA256="$(
    printf '%s\n' "$sorted_names" | sha256sum | awk '{ print $1 }'
  )" || return 1
  [[ "$MIGRATION_CONTRACT_SHA256" =~ ^[0-9a-f]{64}$ ]]
}

verified_database_compatible_revision() {
  local state_file="${1:?database-compatible state file is required}"
  local revision

  [[ -f "$state_file" && ! -L "$state_file" ]] || return 1
  revision="$(<"$state_file")"
  [[ "$revision" =~ ^[0-9a-f]{40}$ ]] || return 1
  docker image inspect "reset90:$revision" >/dev/null 2>&1 || return 1
  printf '%s' "$revision"
}

validate_backup_artifact() {
  local requested_file="${1:?backup file is required}"
  local requested_root="${2:?backup root is required}"
  local root file base checksum_file metadata_file checksum_line mode
  local checksum_digest actual_digest actual_size
  local metadata_version metadata_filename metadata_timestamp metadata_purpose
  local metadata_compatible_revision metadata_target_revision metadata_major
  local metadata_source metadata_size metadata_digest metadata_migration_count
  local metadata_migration_sha256

  require_existing_backup_root "$requested_root" || return 1
  root="$(realpath -e -- "$requested_root")" || return 1
  file="$(realpath -e -- "$requested_file")" || return 1
  [[ ! -L "$requested_file" && "$(dirname -- "$file")" == "$root" ]] ||
    return 1

  base="${file##*/}"
  [[ "$base" =~ $RESET90_BACKUP_NAME_REGEX ]] || return 1
  VALIDATED_BACKUP_TIMESTAMP="${BASH_REMATCH[1]}"
  VALIDATED_BACKUP_PURPOSE="${BASH_REMATCH[2]}"
  VALIDATED_BACKUP_REVISION="${BASH_REMATCH[3]}"

  checksum_file="$file.sha256"
  metadata_file="$file.meta"
  [[ -f "$file" && -s "$file" && ! -L "$file" ]] || return 1
  [[ -f "$checksum_file" && -s "$checksum_file" && ! -L "$checksum_file" ]] ||
    return 1
  [[ -f "$metadata_file" && -s "$metadata_file" && ! -L "$metadata_file" ]] ||
    return 1

  for protected_file in "$file" "$checksum_file" "$metadata_file"; do
    mode="$(stat -c '%a' -- "$protected_file")" || return 1
    [[ "$mode" == "600" ]] || return 1
  done

  gzip -t -- "$file" >/dev/null 2>&1 || return 1
  awk 'END { exit(NR == 1 ? 0 : 1) }' "$checksum_file" || return 1
  IFS= read -r checksum_line < "$checksum_file" || return 1
  [[ "$checksum_line" =~ ^[0-9a-f]{64}"  "$base$ ]] || return 1
  checksum_digest="${checksum_line%%  *}"
  (
    cd -- "$root"
    sha256sum -c -- "$base.sha256" >/dev/null 2>&1
  ) || return 1
  actual_digest="$(sha256sum -- "$file" | awk '{ print $1 }')" || return 1
  actual_size="$(stat -c '%s' -- "$file")" || return 1
  [[ "$actual_digest" =~ ^[0-9a-f]{64}$ ]] || return 1
  [[ "$actual_size" =~ ^[1-9][0-9]*$ ]] || return 1

  metadata_version="$(backup_metadata_value "$metadata_file" metadata_version)" ||
    return 1
  metadata_filename="$(backup_metadata_value "$metadata_file" filename)" ||
    return 1
  metadata_timestamp="$(backup_metadata_value "$metadata_file" created_utc)" ||
    return 1
  metadata_purpose="$(backup_metadata_value "$metadata_file" purpose)" ||
    return 1
  metadata_compatible_revision="$(
    backup_metadata_value "$metadata_file" compatible_app_revision
  )" || return 1
  metadata_target_revision="$(
    backup_metadata_value "$metadata_file" deployment_target_revision
  )" || return 1
  metadata_major="$(backup_metadata_value "$metadata_file" postgres_major)" ||
    return 1
  metadata_source="$(backup_metadata_value "$metadata_file" source_database)" ||
    return 1
  metadata_size="$(
    backup_metadata_value "$metadata_file" artifact_size_bytes
  )" || return 1
  metadata_digest="$(
    backup_metadata_value "$metadata_file" artifact_sha256
  )" || return 1
  metadata_migration_count="$(
    backup_metadata_value "$metadata_file" migration_count
  )" || return 1
  metadata_migration_sha256="$(
    backup_metadata_value "$metadata_file" migration_names_sha256
  )" || return 1

  [[ "$metadata_version" == "$RESET90_BACKUP_METADATA_VERSION" ]] || return 1
  [[ "$metadata_filename" == "$base" ]] || return 1
  [[ "$metadata_timestamp" == "$VALIDATED_BACKUP_TIMESTAMP" ]] || return 1
  [[ "$metadata_purpose" == "$VALIDATED_BACKUP_PURPOSE" ]] || return 1
  [[ "$metadata_compatible_revision" == "$VALIDATED_BACKUP_REVISION" ]] ||
    return 1
  [[ "$metadata_target_revision" == "none" ||
    "$metadata_target_revision" =~ ^[0-9a-f]{40}$ ]] || return 1
  [[ "$metadata_major" == "$RESET90_POSTGRES_MAJOR" ]] || return 1
  [[ "$metadata_source" =~ $RESET90_SAFE_DATABASE_REGEX ]] || return 1
  [[ "$metadata_size" =~ ^[1-9][0-9]*$ ]] || return 1
  [[ "$metadata_digest" =~ ^[0-9a-f]{64}$ ]] || return 1
  [[ "$metadata_migration_count" =~ ^[1-9][0-9]*$ ]] || return 1
  [[ "$metadata_migration_sha256" =~ ^[0-9a-f]{64}$ ]] || return 1
  [[ "$metadata_size" == "$actual_size" ]] || return 1
  [[ "$metadata_digest" == "$checksum_digest" ]] || return 1
  [[ "$metadata_digest" == "$actual_digest" ]] || return 1

  VALIDATED_BACKUP_FILE="$file"
  VALIDATED_BACKUP_BASENAME="$base"
  VALIDATED_BACKUP_SOURCE_DATABASE="$metadata_source"
  VALIDATED_BACKUP_POSTGRES_MAJOR="$metadata_major"
  VALIDATED_BACKUP_COMPATIBLE_REVISION="$metadata_compatible_revision"
  VALIDATED_BACKUP_DEPLOYMENT_TARGET_REVISION="$metadata_target_revision"
  VALIDATED_BACKUP_SIZE_BYTES="$metadata_size"
  VALIDATED_BACKUP_SHA256="$metadata_digest"
  VALIDATED_BACKUP_MIGRATION_COUNT="$metadata_migration_count"
  VALIDATED_BACKUP_MIGRATION_SHA256="$metadata_migration_sha256"
}

parse_test_database_url() {
  local raw_url="${1:-}"

  [[ -n "$raw_url" ]] || return 1
  TEST_DATABASE_PARTS="$(
    node - "$raw_url" <<'NODE'
const raw = process.argv[2];
let parsed;
try {
  parsed = new URL(raw);
} catch {
  process.exit(1);
}
if (!["postgres:", "postgresql:"].includes(parsed.protocol)) process.exit(1);
if (!new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(parsed.hostname)) {
  process.exit(1);
}
const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
const username = decodeURIComponent(parsed.username);
if (!/(^|[-_])test(?:ing)?($|[-_])/i.test(database)) process.exit(1);
if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(database)) process.exit(1);
if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(username)) process.exit(1);
process.stdout.write(`${username}\t${parsed.hostname}\t${parsed.port || "5432"}\t${database}`);
NODE
  )" || return 1
}
