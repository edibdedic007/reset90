#!/usr/bin/env bash
set -euo pipefail

OUT="${1:-ALL_FILES_READY_TO_SAVE.md}"
OUT_REL="${OUT#./}"

echo "Generating $OUT"

list_files() {
  find . -maxdepth 5 -type f \
    ! -path './.git/*' \
    ! -path './node_modules/*' \
    ! -path './.next/*' \
    ! -path './backups/*' \
    ! -path './exports/*' \
    ! -path './coverage/*' \
    ! -path './.codex/generated/*' \
    ! -name '*.log' \
    ! -name 'codex-*.jsonl' \
    ! -path "./$OUT_REL" \
    | sort
}

{
  echo "# Reset90 All Files Ready To Save"
  echo
  echo "> Human backup/export only. Do not commit or load this file into normal Codex sessions."
  echo
  echo '```text'
  list_files | sed 's#^./##'
  echo '```'
  echo
  while IFS= read -r file; do
    echo
    echo "---"
    echo
    echo "## ${file#./}"
    echo
    echo '```'
    cat "$file"
    echo
    echo '```'
  done < <(list_files)
} > "$OUT"

echo "Generated $OUT"
