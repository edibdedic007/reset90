#!/usr/bin/env bash
set -euo pipefail

TYPE="${1:-}"
SLUG="${2:-}"

if [[ -z "$TYPE" || -z "$SLUG" ]]; then
  echo "Usage: ./scripts/create-branch.sh <type> <slug>"
  echo "Types: feature fix cleanup refactor chore docs test security release hotfix experiment"
  exit 1
fi

case "$TYPE" in
  feature|fix|cleanup|refactor|chore|docs|test|security|release|hotfix|experiment) ;;
  *) echo "Invalid branch type: $TYPE"; exit 1 ;;
esac

SAFE_SLUG="$(echo "$SLUG" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g; s/^-+|-+$//g')"
if [[ -z "$SAFE_SLUG" ]]; then
  echo "Slug became empty after normalization."
  exit 1
fi

BRANCH="$TYPE/$SAFE_SLUG"
CURRENT="$(git branch --show-current 2>/dev/null || true)"

if [[ -n "$(git status --porcelain 2>/dev/null || true)" ]]; then
  echo "Working tree is not clean. Commit or stash before creating a new branch."
  exit 1
fi

# User-preferred model: main is production, local is developer-only integration.
# Normal work branches come from local. Hotfix/release branches may come from main.
git fetch origin >/dev/null 2>&1 || true

if [[ "$TYPE" == "hotfix" || "$TYPE" == "release" ]]; then
  BASE="main"
else
  BASE="local"
fi

if ! git rev-parse --verify "$BASE" >/dev/null 2>&1; then
  if [[ "$BASE" == "local" ]]; then
    if git rev-parse --verify main >/dev/null 2>&1; then
      git switch main
      git pull --ff-only origin main >/dev/null 2>&1 || true
      git switch -c local
    else
      echo "Neither local nor main exists yet. Initialize repo first."
      exit 1
    fi
  else
    echo "Base branch $BASE does not exist."
    exit 1
  fi
else
  git switch "$BASE"
  git pull --ff-only origin "$BASE" >/dev/null 2>&1 || true
fi

git switch -c "$BRANCH"
echo "Created branch $BRANCH from $BASE"
