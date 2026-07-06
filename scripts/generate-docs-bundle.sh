#!/usr/bin/env bash
set -euo pipefail

OUT="${1:-ALL_FILES_READY_TO_SAVE.md}"

echo "Generating $OUT"
{
  echo "# Reset90 All Files Ready To Save"
  echo
  echo "> This file is for human backup/export. Codex should not read it during normal implementation."
  echo
  echo '```text'
  find . -maxdepth 5 -type f \
    ! -path './.git/*' \
    ! -path './node_modules/*' \
    ! -path './.next/*' \
    ! -path './backups/*' \
    ! -path './exports/*' \
    ! -name 'ALL_FILES_READY_TO_SAVE.md' \
    | sort | sed 's#^./##'
  echo '```'
  echo
  find . -maxdepth 5 -type f \
    ! -path './.git/*' \
    ! -path './node_modules/*' \
    ! -path './.next/*' \
    ! -path './backups/*' \
    ! -path './exports/*' \
    ! -name 'ALL_FILES_READY_TO_SAVE.md' \
    | sort | while read -r file; do
        echo
        echo "---"
        echo
        echo "## ${file#./}"
        echo
        echo '```'
        cat "$file"
        echo
        echo '```'
      done
} > "$OUT"

echo "Generated $OUT"
