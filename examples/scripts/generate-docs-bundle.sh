#!/usr/bin/env bash
set -euo pipefail

OUT="${1:-ALL_FILES_READY_TO_SAVE.md}"

echo "Generating $OUT"
{
  echo "# Reset90 All Files Ready To Save"
  echo
  echo '```text'
  find . -maxdepth 4 -type f | sort | sed 's#^./##'
  echo '```'
  echo
  find . -maxdepth 4 -type f     ! -path './.git/*'     ! -name 'ALL_FILES_READY_TO_SAVE.md'     | sort     | while read -r file; do
        echo
        echo "---"
        echo
        echo "## $file"
        echo
        echo '```'
        cat "$file"
        echo
        echo '```'
      done
} > "$OUT"

echo "Generated $OUT"
