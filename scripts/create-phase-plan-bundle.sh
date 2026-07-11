#!/usr/bin/env bash
set -euo pipefail

PHASE="${1:-}"
EXTRA_FILES="${2:-}"

usage() {
  echo "Usage: make phase-bundle PHASE=12 [EXTRA_FILES='docs/file.md docs/adr/0011-example.md']" >&2
}

if [[ ! "$PHASE" =~ ^[0-9]+$ ]]; then
  usage
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "Error: phase bundle must run inside a Git repository." >&2
  exit 1
}
cd "$repo_root"

if [[ "$(basename "$repo_root")" != "reset90" ]] ||
  [[ ! -f AGENTS.md ]] ||
  [[ ! -f PROJECT_CONTEXT_SHORT.md ]] ||
  ! grep -q 'Reset90' AGENTS.md ||
  ! grep -q '^# Project Context Short$' PROJECT_CONTEXT_SHORT.md; then
  echo "Error: phase bundle must run from the Reset90 repository." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo "Error: phase bundle requires a clean working tree." >&2
  exit 1
fi

downloads_dir="$HOME/Downloads"
archive_name="reset90-phase${PHASE}-plan.tar.gz"
archive_path="$downloads_dir/$archive_name"

mkdir -p "$downloads_dir"
if [[ -e "$archive_path" ]]; then
  echo "Error: archive already exists: $archive_path" >&2
  exit 1
fi

temp_parent="$(mktemp -d "${TMPDIR:-/tmp}/reset90-phase-plan.XXXXXX")"
bundle_name="reset90-phase${PHASE}-plan"
bundle_dir="$temp_parent/$bundle_name"
archive_created=false
cleanup() {
  rm -rf -- "$temp_parent"
  if [[ "$archive_created" != true ]]; then
    rm -f -- "$archive_path"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
mkdir -p "$bundle_dir"

excluded_path() {
  local path="$1"
  local name="${path##*/}"
  local lower_path="${path,,}"
  local lower_name="${name,,}"

  case "/$lower_path/" in
    */.git/*|*/node_modules/*|*/.next/*|*/dist/*|*/build/*|*/coverage/*|*/playwright-report/*|*/test-results/*|*/blob-report/*)
      return 0
      ;;
  esac

  case "$lower_path" in
    all_files_ready_to_save.md|docs/16_best_implementation_order.md)
      return 0
      ;;
  esac

  case "$lower_name" in
    .env|.env.*|credentials|credentials.*|*credential*|tokens|tokens.*|*token*|*secret*|*certificate*|private*|*journal*|*.pem|*.key|*.crt|*.cer|*.p12|*.pfx|id_rsa*|id_ed25519*|*.db|*.sqlite|*.sqlite3|*.dump|*.sql|*.sql.gz|*.jsonl|*.patch|*.diff|*.zip|*.tar|*.tar.gz|*.tgz)
      return 0
      ;;
  esac

  return 1
}

validate_file() {
  local relative_path="$1"
  local source_path="$repo_root/$relative_path"
  local resolved_path
  local current="$repo_root"
  local component

  if [[ "$relative_path" == /* ]]; then
    echo "Error: absolute paths are not allowed: $relative_path" >&2
    exit 1
  fi
  case "$relative_path" in
    ..|../*|*/..|*/../*)
      echo "Error: parent traversal is not allowed: $relative_path" >&2
      exit 1
      ;;
  esac
  if excluded_path "$relative_path"; then
    echo "Error: excluded or sensitive file is not allowed: $relative_path" >&2
    exit 1
  fi
  if [[ ! -e "$source_path" ]]; then
    echo "Error: requested file does not exist: $relative_path" >&2
    exit 1
  fi

  IFS='/' read -r -a components <<< "$relative_path"
  for component in "${components[@]}"; do
    [[ -z "$component" || "$component" == "." ]] && continue
    current="$current/$component"
    if [[ -L "$current" ]]; then
      echo "Error: symbolic links are not allowed: $relative_path" >&2
      exit 1
    fi
  done

  if [[ ! -f "$source_path" ]]; then
    echo "Error: only regular files are allowed: $relative_path" >&2
    exit 1
  fi
  resolved_path="$(realpath -e -- "$source_path")"
  if [[ "$resolved_path" != "$repo_root"/* ]]; then
    echo "Error: file resolves outside repository: $relative_path" >&2
    exit 1
  fi
}

copy_file() {
  local relative_path="$1"
  validate_file "$relative_path"
  mkdir -p "$bundle_dir/$(dirname "$relative_path")"
  cp -p -- "$repo_root/$relative_path" "$bundle_dir/$relative_path"
}

declare -A seen=()
extra_paths=()
read -r -a requested_extra_paths <<< "$EXTRA_FILES"
for relative_path in "${requested_extra_paths[@]}"; do
  [[ -n "${seen[$relative_path]:-}" ]] && continue
  seen["$relative_path"]=1
  validate_file "$relative_path"
  extra_paths+=("$relative_path")
done

make session
make phase PHASE="$PHASE" > "$bundle_dir/PHASE_${PHASE}.md"

default_files=(
  AGENTS.md
  PROJECT_CONTEXT_SHORT.md
  .codex/generated/session_context.md
  docs/state/TASK_STATE.md
  docs/01_PRODUCT_REQUIREMENTS.md
  docs/03_SYSTEM_DESIGN_DATA_MODEL.md
  docs/06_UX_FLOWS.md
)

for relative_path in "${default_files[@]}"; do
  copy_file "$relative_path"
done
if [[ -e CODEX_START_HERE.md ]]; then
  copy_file CODEX_START_HERE.md
fi

for relative_path in "${extra_paths[@]}"; do
  copy_file "$relative_path"
done

tar -C "$temp_parent" -czf "$archive_path" "$bundle_name"
archive_created=true

echo
echo "Phase planning bundle created:"
echo "$archive_path"
echo
echo "Inspect: tar -tzf ~/Downloads/$archive_name"
echo "Size: ls -lh ~/Downloads/$archive_name"
