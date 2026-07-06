#!/usr/bin/env bash
set -euo pipefail

run_if_script_exists() {
  local script="$1"
  if [[ ! -f package.json ]]; then
    return 0
  fi
  node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts['$script'] ? 0 : 1)" >/dev/null 2>&1 || return 0
  echo "== package script: $script =="
  $PKG_RUN "$script"
}

if [[ -f pnpm-lock.yaml ]]; then
  PKG_INSTALL="pnpm install --frozen-lockfile"
  PKG_RUN="pnpm run"
elif [[ -f yarn.lock ]]; then
  PKG_INSTALL="yarn install --frozen-lockfile"
  PKG_RUN="yarn"
elif [[ -f bun.lockb || -f bun.lock ]]; then
  PKG_INSTALL="bun install --frozen-lockfile"
  PKG_RUN="bun run"
else
  PKG_INSTALL="npm ci"
  PKG_RUN="npm run"
fi

if [[ -f package.json ]]; then
  echo "== install/check dependencies =="
  if [[ -f package-lock.json || -f pnpm-lock.yaml || -f yarn.lock || -f bun.lockb || -f bun.lock ]]; then
    $PKG_INSTALL
  else
    echo "No lockfile yet; skipping frozen install. Codex should create a lockfile during scaffold."
  fi

  run_if_script_exists format:check
  run_if_script_exists lint
  run_if_script_exists typecheck
  run_if_script_exists test
  run_if_script_exists validate:payloads
  run_if_script_exists build
else
  echo "No package.json yet. Skipping app checks."
fi

if [[ -f prisma/schema.prisma ]]; then
  echo "== prisma validate =="
  if command -v npx >/dev/null 2>&1; then
    npx prisma validate
  else
    echo "npx not found; skipping prisma validate"
  fi
fi

echo "== shell syntax checks =="
find scripts -type f -name '*.sh' -print0 2>/dev/null | while IFS= read -r -d '' f; do
  bash -n "$f"
done

echo "== git diff whitespace check =="
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --check || true
else
  echo "Not inside a git repository yet; skipping git diff check."
fi

echo "Quality check complete."
