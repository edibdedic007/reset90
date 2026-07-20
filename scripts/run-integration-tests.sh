#!/usr/bin/env bash
set -euo pipefail

compose_project="reset90_phase19_test"
compose_file="docker-compose.test.yml"
started_local_database=0

cleanup() {
  if [[ "$started_local_database" == "1" ]]; then
    docker compose -p "$compose_project" -f "$compose_file" down --volumes
  fi
}
trap cleanup EXIT INT TERM

if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
  if [[ "${CI:-}" == "true" ]]; then
    echo "TEST_DATABASE_URL is required in CI" >&2
    exit 1
  fi
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is required to create the disposable local test database" >&2
    exit 1
  fi

  export TEST_DATABASE_URL="postgresql://reset90_test:reset90_test_password@127.0.0.1:55432/reset90_test"
  export DATABASE_URL="$TEST_DATABASE_URL"
  pnpm exec tsx scripts/test-database-url.ts
  docker compose -p "$compose_project" -f "$compose_file" up -d --wait
  started_local_database=1
else
  export DATABASE_URL="$TEST_DATABASE_URL"
  pnpm exec tsx scripts/test-database-url.ts
fi

pnpm run db:migrate
pnpm run test:integration
