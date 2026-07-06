#!/usr/bin/env bash
set -euo pipefail

TYPE="${1:-}"
SLUG="${2:-}"

if [[ -z "$TYPE" || -z "$SLUG" ]]; then
  echo "Usage: ./scripts/create-branch.sh <feature|cleanup|fix|refactor|chore|docs> <slug>"
  exit 1
fi

case "$TYPE" in
  feature|cleanup|fix|refactor|chore|docs) ;;
  *) echo "Invalid branch type: $TYPE"; exit 1 ;;
esac

git switch local
BRANCH="$TYPE/$SLUG"
git switch -c "$BRANCH"
echo "Created branch $BRANCH from local"
