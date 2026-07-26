#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.test.yml"
WORK_DIR="$(mktemp -d /tmp/reset90-phase22-restore-drill.XXXXXX)"
ENV_FILE="$WORK_DIR/test.env"
BACKUP_ROOT="$WORK_DIR/backups"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)_$$"
PROJECT="reset90_phase22_drill_${RUN_ID,,}"
SOURCE_DATABASE="reset90_source_test_${RUN_ID,,}"
TARGET_DATABASE="reset90_target_test_${RUN_ID,,}"
DATABASE_USER="reset90_test"
DATABASE_PASSWORD="reset90_test_password"
STARTED=0
DRILL_PASSED=0
BACKUP_FILE=""

fail() {
  printf 'restore-drill:failed:%s\n' "$1" >&2
  exit 1
}

compose() {
  TEST_DATABASE_PORT=0 docker compose \
    -p "$PROJECT" \
    --env-file "$ENV_FILE" \
    -f "$COMPOSE_FILE" \
    "$@"
}

cleanup() {
  local exit_status=$?
  local cleanup_result="not-started"

  if [[ "$STARTED" -eq 1 ]]; then
    if compose down --volumes --remove-orphans >/dev/null 2>&1; then
      cleanup_result="passed"
    else
      cleanup_result="failed"
    fi
  fi

  if [[ "$DRILL_PASSED" -eq 1 && "$cleanup_result" != "failed" ]]; then
    rm -rf -- "$WORK_DIR"
  else
    printf 'restore-drill:diagnostics-retained path=%s\n' "$WORK_DIR" >&2
  fi
  printf 'restore-drill:evidence cleanup=%s\n' "$cleanup_result"
  return "$exit_status"
}
trap cleanup EXIT INT TERM

for required_command in date docker find git gzip mktemp pnpm sha256sum; do
  command -v "$required_command" >/dev/null 2>&1 ||
    fail "missing-command-$required_command"
done
docker compose version >/dev/null 2>&1 || fail "missing-docker-compose"
[[ -f "$COMPOSE_FILE" ]] || fail "test-compose-file-missing"

printf 'TEST_DATABASE_PORT=0\n' > "$ENV_FILE"
chmod 600 "$ENV_FILE"
mkdir -m 700 -- "$BACKUP_ROOT"

printf 'restore-drill:start source=%s target=%s\n' \
  "$SOURCE_DATABASE" "$TARGET_DATABASE"
compose up -d --wait db
STARTED=1
mapped_port="$(compose port db 5432)"
host_port="${mapped_port##*:}"
[[ "$host_port" =~ ^[0-9]+$ ]] || fail "database-port-unavailable"

SOURCE_URL="postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@127.0.0.1:${host_port}/${SOURCE_DATABASE}"
TARGET_URL="postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@127.0.0.1:${host_port}/${TARGET_DATABASE}"

compose exec -T db createdb -U "$DATABASE_USER" -T template0 \
  "$SOURCE_DATABASE"
DATABASE_URL="$SOURCE_URL" TEST_DATABASE_URL="$SOURCE_URL" \
  pnpm exec tsx scripts/test-database-url.ts --require-empty
DATABASE_URL="$SOURCE_URL" pnpm run db:migrate

compose exec -T db psql -X -v ON_ERROR_STOP=1 \
  -U "$DATABASE_USER" \
  -d "$SOURCE_DATABASE" <<'SQL'
INSERT INTO users (id, authentik_subject, email, display_name, updated_at)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'phase22-drill-owner-a',
   'owner-a@example.invalid', 'Owner A', '2026-07-26T10:00:00.123Z'),
  ('10000000-0000-0000-0000-000000000002', 'phase22-drill-owner-b',
   'owner-b@example.invalid', 'Owner B', '2026-07-26T10:00:00.123Z');

INSERT INTO reset_cycles
  (id, user_id, name, start_date, end_date, status, updated_at)
VALUES
  ('20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'Phase 22 Source A', '2026-07-01', '2026-09-28', 'ACTIVE',
   '2026-07-26T10:01:00.456Z'),
  ('20000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000002',
   'Phase 22 Source B', '2026-07-01', '2026-09-28', 'ACTIVE',
   '2026-07-26T10:01:00.456Z');

INSERT INTO reset_phases
  (id, cycle_id, name, day_start, day_end, description)
VALUES
  ('30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001',
   'Foundation', 1, 30, 'Disposable restore drill');

INSERT INTO day_logs
  (id, cycle_id, phase_id, date, day_number, energy_level, status,
   mission, supportive_message, notes, updated_at)
VALUES
  ('40000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001',
   '2026-07-26', 26, 'NORMAL', 'GREEN',
   'Restore safely', 'Test data only', E'Unicode: Život ☕\nSecond line',
   '2026-07-26T10:02:00.789Z');

INSERT INTO imported_payloads
  (id, kind, schema_version, idempotency_key, source, raw_json,
   validation_status, processing_status, processed_at)
VALUES
  ('50000000-0000-0000-0000-000000000001',
   'DAILY_PLAN', '1.0', 'phase22-drill-plan', 'restore-drill',
   '{"unicode":"Život ☕","multiline":"line1\nline2","nested":{"ok":true}}',
   'VALID', 'PROCESSED', '2026-07-26T10:03:00.321Z');

INSERT INTO daily_plans
  (id, day_log_id, imported_payload_id, source, schema_version, mission,
   supportive_message, warnings, downshift_rule, context_summary, updated_at)
VALUES
  ('60000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001',
   'restore-drill', '1.0', 'Restore safely', 'Test data only',
   '["unicode",{"nested":true}]', 'Keep target disposable',
   E'Line one\nLine two', '2026-07-26T10:04:00.654Z');

INSERT INTO tasks
  (id, daily_plan_id, title, description, domain, tier, estimate_minutes,
   trigger, why, notes, sort_order, updated_at)
VALUES
  ('70000000-0000-0000-0000-000000000001',
   '60000000-0000-0000-0000-000000000001',
   'Verify ☕ backup', E'First line\nSecond line', 'SYSTEM', 'MINIMUM', 15,
   'After dump', 'Prove restore', 'Test-only record', 0,
   '2026-07-26T10:05:00.987Z');

INSERT INTO checkins
  (id, day_log_id, kind, timestamp, energy_level, mood_score, fog_score,
   loneliness_score, self_criticism_score, digital_control_score,
   learning_resistance_score, body_relationship_score, work_confidence_score,
   note)
VALUES
  ('80000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000001',
   'MANUAL', '2026-07-26T12:34:56.789Z', 'NORMAL',
   7, 3, 2, 2, 8, 4, 6, 7, E'Drill\ncheck-in');
SQL

revision="$(git -C "$REPO_ROOT" rev-parse --verify HEAD)"
"$SCRIPT_DIR/backup-db.sh" \
  --environment test \
  --env-file "$ENV_FILE" \
  --compose-file "$COMPOSE_FILE" \
  --project "$PROJECT" \
  --backup-root "$BACKUP_ROOT" \
  --purpose drill \
  --git-sha "$revision" \
  --database "$SOURCE_DATABASE" \
  --user "$DATABASE_USER"

mapfile -d '' backup_files < <(
  find "$BACKUP_ROOT" -maxdepth 1 -type f \
    -name 'reset90_*_drill_*.sql.gz' -print0
)
[[ "${#backup_files[@]}" -eq 1 ]] || fail "verified-backup-selection"
BACKUP_FILE="${backup_files[0]}"
[[ -s "$BACKUP_FILE" ]] || fail "backup-empty"
gzip -t "$BACKUP_FILE"
(
  cd "$BACKUP_ROOT"
  sha256sum -c "$(basename "$BACKUP_FILE").sha256" >/dev/null
)

compose exec -T db createdb -U "$DATABASE_USER" -T template0 \
  "$TARGET_DATABASE"
DATABASE_URL= TEST_DATABASE_URL="$TARGET_URL" \
  "$SCRIPT_DIR/restore-db.sh" \
  --environment test \
  --env-file "$ENV_FILE" \
  --compose-file "$COMPOSE_FILE" \
  --project "$PROJECT" \
  --backup-root "$BACKUP_ROOT" \
  --file "$BACKUP_FILE"

expected_migrations="$(
  find "$REPO_ROOT/prisma/migrations" -mindepth 1 -maxdepth 1 -type d |
    wc -l
)"
restored_migrations="$(
  compose exec -T db psql -X -A -t \
    -U "$DATABASE_USER" \
    -d "$TARGET_DATABASE" \
    -c 'SELECT count(*) FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;'
)"
[[ "$restored_migrations" == "$expected_migrations" ]] ||
  fail "migration-history-mismatch"

representative_result="$(
  compose exec -T db psql -X -A -t \
    -U "$DATABASE_USER" \
    -d "$TARGET_DATABASE" \
    -c "SELECT CASE WHEN
      (SELECT count(*) FROM users) = 2
      AND (SELECT count(*) FROM reset_cycles) = 2
      AND (SELECT count(*) FROM imported_payloads) = 1
      AND (SELECT count(*) FROM daily_plans) = 1
      AND (SELECT count(*) FROM tasks) = 1
      AND (SELECT count(*) FROM checkins) = 1
      AND (SELECT raw_json->>'unicode' FROM imported_payloads
           WHERE id = '50000000-0000-0000-0000-000000000001') = 'Život ☕'
      AND (SELECT notes LIKE E'%\n%' FROM day_logs
           WHERE id = '40000000-0000-0000-0000-000000000001')
      AND (SELECT timestamp = '2026-07-26T12:34:56.789Z'::timestamp
           FROM checkins
           WHERE id = '80000000-0000-0000-0000-000000000001')
      AND EXISTS (
        SELECT 1
        FROM users u
        JOIN reset_cycles c ON c.user_id = u.id
        JOIN day_logs d ON d.cycle_id = c.id
        JOIN daily_plans p ON p.day_log_id = d.id
        JOIN tasks t ON t.daily_plan_id = p.id
        WHERE u.authentik_subject = 'phase22-drill-owner-a'
          AND t.id = '70000000-0000-0000-0000-000000000001'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM reset_cycles c
        JOIN day_logs d ON d.cycle_id = c.id
        WHERE c.user_id = '10000000-0000-0000-0000-000000000002'
      )
      THEN 'valid' ELSE 'invalid' END;"
)"
[[ "$representative_result" == "valid" ]] ||
  fail "representative-data-verification"

if compose exec -T db psql -X -v ON_ERROR_STOP=1 \
  -U "$DATABASE_USER" \
  -d "$TARGET_DATABASE" \
  -c "INSERT INTO users
      (id, authentik_subject, updated_at)
      VALUES
      ('90000000-0000-0000-0000-000000000001',
       'phase22-drill-owner-a', CURRENT_TIMESTAMP);" \
  >/dev/null 2>&1; then
  fail "uniqueness-constraint-not-enforced"
fi

DATABASE_URL="$TARGET_URL" pnpm exec tsx -e '
  import { createPrismaClient } from "./src/server/db/client.ts";
  void (async () => {
    const database = createPrismaClient(process.env.DATABASE_URL);
    const restored = await database.user.findUnique({
      where: { authentikSubject: "phase22-drill-owner-a" },
      select: {
        resetCycles: {
          select: {
            dayLogs: {
              select: {
                dailyPlan: { select: { tasks: { select: { id: true } } } },
              },
            },
          },
        },
      },
    });
    if (restored?.resetCycles[0]?.dayLogs[0]?.dailyPlan?.tasks.length !== 1) {
      throw new Error("Application-level restored query failed");
    }
    await database.$disconnect();
  })();
'

printf 'restore-drill:evidence backup=%s checksum=passed source=%s target=%s\n' \
  "$(basename "$BACKUP_FILE")" "$SOURCE_DATABASE" "$TARGET_DATABASE"
printf 'restore-drill:evidence migrations=passed representative-data=passed relationships=passed application-query=passed\n'
printf 'restore-drill:evidence completed=%s\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DRILL_PASSED=1
