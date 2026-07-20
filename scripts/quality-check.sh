#!/usr/bin/env bash
set -euo pipefail

required_files=(
  package.json
  pnpm-lock.yaml
  prisma/schema.prisma
  scripts/run-integration-tests.sh
)
for required_file in "${required_files[@]}"; do
  if [[ ! -f "$required_file" ]]; then
    echo "Required quality infrastructure missing: $required_file" >&2
    exit 1
  fi
done

node -e '
  const scripts = require("./package.json").scripts ?? {};
  const required = ["format:check", "lint", "typecheck", "test", "test:integration", "validate:payloads", "db:validate", "db:migrate", "build"];
  const missing = required.filter((name) => !scripts[name]);
  if (missing.length) {
    console.error(`Required package scripts missing: ${missing.join(", ")}`);
    process.exit(1);
  }
'

echo "== frozen dependency install =="
make install

echo "== formatting =="
make format-check

echo "== lint =="
make lint

echo "== typecheck =="
make typecheck

echo "== unit and component tests =="
make test

echo "== payload examples and schema drift =="
make validate-payloads

echo "== prisma schema =="
make db-validate

echo "== migrations and PostgreSQL integration tests =="
make test-integration

echo "== production build =="
make build

echo "== shell syntax checks =="
find scripts -type f -name '*.sh' -print0 2>/dev/null | while IFS= read -r -d '' f; do
  bash -n "$f"
done

echo "== git diff whitespace check =="
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --check
  git diff --cached --check
else
  echo "Git worktree is required for whitespace checks" >&2
  exit 1
fi

echo "Quality check complete."
