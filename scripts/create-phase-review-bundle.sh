#!/usr/bin/env bash
set -euo pipefail

PHASE="${1:-}"
BASE_REF="${2:-local}"

usage() {
  echo "Usage: make review-bundle PHASE=11 [BASE_REF=local]" >&2
}

if [[ ! "$PHASE" =~ ^[0-9]+$ ]]; then
  usage
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "Error: review bundle must run inside a Git repository." >&2
  exit 1
}
cd "$repo_root"

base_commit="$(git rev-parse --verify "${BASE_REF}^{commit}" 2>/dev/null)" || {
  echo "Error: base reference '$BASE_REF' was not found." >&2
  exit 1
}

absolute_path() {
  local path="$1"
  local directory
  directory="$(cd -P "$(dirname "$path")" && pwd)"
  printf '%s/%s\n' "$directory" "$(basename "$path")"
}

project_name="$(basename "$repo_root")"
timestamp="$(date +%Y%m%d-%H%M%S)"
output_path="$(absolute_path "${repo_root}/../${project_name}-phase-${PHASE}-review-${timestamp}.zip")"

if [[ "$output_path" == "$repo_root"/* ]]; then
  echo "Error: review archive must be outside repository: $output_path" >&2
  exit 1
fi
if [[ -e "$output_path" ]]; then
  echo "Error: review archive already exists: $output_path" >&2
  exit 1
fi

stage="$(mktemp -d "${TMPDIR:-/tmp}/reset90-phase-review.XXXXXX")"
metadata_dir="$(mktemp -d "${TMPDIR:-/tmp}/reset90-phase-review-metadata.XXXXXX")"
trap 'rm -rf "$stage" "$metadata_dir"' EXIT
mkdir -p "$stage/manifest" "$stage/codex" "$stage/git" "$stage/context" "$stage/files"

included_list="$metadata_dir/included-files.txt"
excluded_list="$metadata_dir/excluded-files.txt"
touch "$included_list" "$excluded_list"

record_included() {
  printf '%s\n' "$1" >> "$included_list"
}

record_excluded() {
  printf '%s — %s\n' "$1" "$2" >> "$excluded_list"
  printf 'Warning: excluded %q (%s)\n' "$1" "$2" >&2
}

exclude_reason() {
  local relative_path="$1"
  local name="${relative_path##*/}"
  local lower_name="${name,,}"

  case "/$relative_path/" in
    */.git/*) printf '%s\n' '.git content is never packaged'; return 0 ;;
    */node_modules/*) printf '%s\n' 'dependency directory is never packaged'; return 0 ;;
    */.next/*|*/dist/*|*/build/*|*/coverage/*)
      printf '%s\n' 'generated build output is never packaged'; return 0 ;;
  esac

  case "$lower_name" in
    .env|.env.*) printf '%s\n' 'environment file is never packaged'; return 0 ;;
    *.pem|*.key|*.p12|id_rsa*|id_ed25519*)
      printf '%s\n' 'private key or certificate is never packaged'; return 0 ;;
    credentials*|*credential*|secrets*|*secret*)
      printf '%s\n' 'credential or secret file is never packaged'; return 0 ;;
    *.db|*.sqlite|*.sqlite3|*.dump)
      printf '%s\n' 'database file or dump is never packaged'; return 0 ;;
    auth.json|auth.yaml|auth.yml|authentication.json|authentication.yaml|authentication.yml)
      printf '%s\n' 'authentication file is never packaged'; return 0 ;;
    "${project_name}"-phase-*-review-*.zip)
      printf '%s\n' 'existing review archive is never packaged'; return 0 ;;
  esac
  return 1
}

copy_snapshot() {
  local relative_path="$1"
  local source_kind="$2"
  local source_path="$repo_root/$relative_path"
  local reason

  if reason="$(exclude_reason "$relative_path")"; then
    record_excluded "$relative_path" "$reason"
    return
  fi
  if [[ -L "$source_path" ]]; then
    record_excluded "$relative_path" 'symbolic links are not copied into review bundles'
    return
  fi
  if [[ ! -f "$source_path" ]]; then
    record_excluded "$relative_path" "$source_kind is deleted or no longer a regular file"
    return
  fi

  mkdir -p "$stage/files/$(dirname "$relative_path")"
  cp -p -- "$source_path" "$stage/files/$relative_path"
  record_included "files/$relative_path"
}

select_session() {
  local sessions_root="${CODEX_HOME:-$HOME/.codex}/sessions"

  if [[ -n "${SESSION_FILE:-}" ]]; then
    if [[ ! -f "$SESSION_FILE" ]]; then
      echo "Error: SESSION_FILE does not exist or is not a regular file: $SESSION_FILE" >&2
      exit 1
    fi
    absolute_path "$SESSION_FILE"
    return
  fi

  if [[ ! -d "$sessions_root" ]]; then
    echo "Error: Codex sessions directory not found: $sessions_root" >&2
    echo "Set SESSION_FILE=/path/to/session.jsonl and rerun make review-bundle." >&2
    exit 1
  fi

  local selected
  selected="$(python3 - "$sessions_root" "$repo_root" <<'PY'
import json
import os
import sys
from pathlib import Path

sessions_root = Path(sys.argv[1])
repository_root = os.path.realpath(sys.argv[2])
candidates = []

for path in sessions_root.rglob("*.jsonl"):
    try:
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            for _ in range(50):
                line = handle.readline()
                if not line:
                    break
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if entry.get("type") != "session_meta":
                    continue
                payload = entry.get("payload")
                if not isinstance(payload, dict):
                    break
                cwd = payload.get("cwd")
                if isinstance(cwd, str) and os.path.realpath(cwd) == repository_root:
                    candidates.append((path.stat().st_mtime, str(path.resolve())))
                break
    except OSError:
        continue

if candidates:
    print(max(candidates)[1])
PY
)"

  if [[ -z "$selected" ]]; then
    echo "Error: no Codex JSONL session with session metadata for $repo_root was found under $sessions_root." >&2
    echo "Set SESSION_FILE=/path/to/session.jsonl and rerun make review-bundle." >&2
    exit 1
  fi
  printf '%s\n' "$selected"
}

session_file="$(select_session)"
branch="$(git branch --show-current || true)"
head_commit="$(git rev-parse HEAD)"

if [[ -f ".codex/generated/phase-${PHASE}.md" ]]; then
  cp -p -- ".codex/generated/phase-${PHASE}.md" "$stage/context/phase-${PHASE}.md"
  phase_source=".codex/generated/phase-${PHASE}.md"
else
  if ! ./scripts/codex-phase.sh "$PHASE" > "$stage/context/phase-${PHASE}.md"; then
    echo "Error: phase ${PHASE} extract is missing and phase extraction failed." >&2
    echo "Run: make phase PHASE=${PHASE}" >&2
    exit 1
  fi
  phase_source="scripts/codex-phase.sh ${PHASE}"
fi

cp -p -- "$session_file" "$stage/codex/latest-session.jsonl"
cp -p -- PROJECT_CONTEXT_SHORT.md "$stage/context/PROJECT_CONTEXT_SHORT.md"
cp -p -- docs/state/TASK_STATE.md "$stage/context/TASK_STATE.md"
cp -p -- docs/state/SESSION_LOG.md "$stage/context/SESSION_LOG.md"

git status --short --branch > "$stage/git/status.txt"
git log --oneline "${base_commit}..HEAD" > "$stage/git/log.txt"
git diff --name-status -M "$base_commit" > "$stage/git/changed-files.txt"
git diff --stat "$base_commit" > "$stage/git/diff-stat.txt"
git diff --binary "$base_commit" > "$stage/git/changes.patch"
git diff --cached --binary > "$stage/git/staged.patch"
git diff --binary > "$stage/git/unstaged.patch"

while IFS= read -r -d '' relative_path; do
  printf '%q\n' "$relative_path" >> "$stage/git/untracked-files.txt"
done < <(git ls-files --others --exclude-standard -z)

for entry in \
  codex/latest-session.jsonl \
  git/status.txt git/log.txt git/changed-files.txt git/untracked-files.txt \
  git/diff-stat.txt git/changes.patch git/staged.patch git/unstaged.patch \
  "context/phase-${PHASE}.md" context/PROJECT_CONTEXT_SHORT.md \
  context/TASK_STATE.md context/SESSION_LOG.md; do
  record_included "$entry"
done

changed_count=0
while IFS= read -r -d '' relative_path; do
  ((changed_count += 1))
  copy_snapshot "$relative_path" 'tracked change'
done < <(git diff --name-only -z "$base_commit")

untracked_included=0
while IFS= read -r -d '' relative_path; do
  before_count="$(wc -l < "$included_list")"
  copy_snapshot "$relative_path" 'untracked file'
  after_count="$(wc -l < "$included_list")"
  if [[ "$after_count" -gt "$before_count" ]]; then
    ((untracked_included += 1))
  fi
done < <(git ls-files --others --exclude-standard -z)

record_included 'manifest/README.md'
{
  echo '# Reset90 phase review bundle'
  echo
  echo "- Project name: $project_name"
  echo "- Phase number: $PHASE"
  echo "- Creation timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "- Repository root: $repo_root"
  echo "- Current branch: ${branch:-detached}"
  echo "- Current HEAD: $head_commit"
  echo "- Base reference: $BASE_REF"
  echo "- Base commit: $base_commit"
  echo "- Selected Codex session path: $session_file"
  echo "- Phase extract source: $phase_source"
  echo
  echo '## Git status'
  echo
  echo '```text'
  cat "$stage/git/status.txt"
  echo '```'
  echo
  echo '## Included files'
  echo
  while IFS= read -r entry; do
    printf -- '- `%s`\n' "$entry"
  done < "$included_list"
  echo
  echo '## Excluded files'
  echo
  if [[ -s "$excluded_list" ]]; then
    while IFS= read -r entry; do
      printf -- '- %s\n' "$entry"
    done < "$excluded_list"
  else
    echo '- None'
  fi
  echo
  echo '## Review instructions'
  echo
  echo '1. Inspect `git/changes.patch`, file snapshots, and this manifest before sharing.'
  echo '2. Confirm excluded-file warnings are expected.'
  echo '3. Upload the inspected ZIP to the Reset90 ChatGPT Project for completed-phase review.'
  echo
  echo '## Security warning'
  echo
  echo 'Codex transcripts may contain prompts, commands, terminal output, or sensitive values. Review this archive before uploading or sharing it.'
} > "$stage/manifest/README.md"

python3 - "$stage" "$output_path" <<'PY'
import os
import sys
import zipfile

stage, output_path = sys.argv[1:]
with zipfile.ZipFile(output_path, "x", compression=zipfile.ZIP_DEFLATED) as archive:
    for directory, _, names in os.walk(stage):
        for name in sorted(names):
            source = os.path.join(directory, name)
            relative = os.path.relpath(source, stage)
            archive.write(source, relative)
PY

echo
echo 'Phase review bundle created:'
echo "$output_path"
echo
echo "Branch: ${branch:-detached}"
echo "Base: $BASE_REF"
echo "Changed files: $changed_count"
echo "Untracked files included: $untracked_included"
echo "Codex session: $session_file"
echo
echo 'Review this archive before uploading because the Codex transcript may contain sensitive terminal output.'
