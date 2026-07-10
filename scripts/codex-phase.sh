#!/usr/bin/env bash
set -euo pipefail

PHASE="${1:-}"
FILE="docs/16_BEST_IMPLEMENTATION_ORDER.md"

if [[ ! "$PHASE" =~ ^[0-9]+$ ]]; then
  echo "Usage: ./scripts/codex-phase.sh <phase-number>" >&2
  exit 1
fi

START="$(grep -n -m1 "^# Phase ${PHASE} " "$FILE" | cut -d: -f1 || true)"
if [[ -z "$START" ]]; then
  echo "Phase ${PHASE} was not found in $FILE" >&2
  exit 1
fi

END="$(awk -v start="$START" 'NR > start && /^# Phase [0-9]+ / { print NR - 1; exit }' "$FILE")"
if [[ -z "$END" ]]; then
  END="$(wc -l < "$FILE")"
fi

sed -n "${START},${END}p" "$FILE"
