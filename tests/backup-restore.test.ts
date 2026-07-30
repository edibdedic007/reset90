import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

const repository = resolve(import.meta.dirname, "..");
const revision = "a".repeat(40);
const previousRevision = "b".repeat(40);
const databaseCompatibleRevision = "c".repeat(40);
const fixedTimestamp = "20260726T120000Z";
const privateSentinel = "PRIVATE_JOURNAL_SENTINEL_DO_NOT_PRINT";
const temporaryDirectories: string[] = [];
type EnvironmentOverrides = Record<string, string | undefined>;
const checkedInMigrations = readdirSync(join(repository, "prisma/migrations"), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const completedMigrationRows = checkedInMigrations
  .map((name) => `${name}\tcompleted`)
  .join("\n");
const completedMigrationDigest = createHash("sha256")
  .update(`${checkedInMigrations.join("\n")}\n`)
  .digest("hex");

function temporaryDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string } = {},
) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? repository,
    encoding: "utf8",
    env: options.env ?? process.env,
    input: options.input,
  });
}

function collectProcess(child: ReturnType<typeof spawn>) {
  let stdout = "";
  let stderr = "";

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });

  return new Promise<{ status: number | null; stderr: string; stdout: string }>(
    (resolvePromise, rejectPromise) => {
      child.on("error", rejectPromise);
      child.on("close", (status) => {
        resolvePromise({ status, stderr, stdout });
      });
    },
  );
}

async function waitForFile(path: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (existsSync(path)) {
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  throw new Error(`Timed out waiting for ${path}`);
}

function spawnSharedLockOwner(root: string, lockFile: string, label: string) {
  const acquiredFile = join(root, `${label}-lock-acquired`);
  const releaseFile = join(root, `${label}-lock-release`);
  const owner = join(root, `${label}-lock-owner.sh`);
  writeExecutable(owner, [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `exec 9>>${shellQuote(lockFile)}`,
    "/usr/bin/flock -n 9",
    `: > ${shellQuote(acquiredFile)}`,
    `while [[ ! -f ${shellQuote(releaseFile)} ]]; do /bin/sleep 0.01; done`,
  ]);
  const child = spawn(owner, [], {
    cwd: repository,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { acquiredFile, child, releaseFile };
}

function writeExecutable(path: string, lines: string[]) {
  writeFileSync(path, `${lines.join("\n")}\n`);
  chmodSync(path, 0o755);
}

function shellHarness() {
  const root = temporaryDirectory("reset90 backup restore ");
  const binaries = join(root, "fake bin");
  const backupRoot = join(root, "approved backups");
  const environmentFile = join(root, "test.env");
  const composeFile = join(root, "compose test.yml");
  const commandLog = join(root, "commands.log");
  const databaseStateFile = join(root, "database-state");
  const artifactValidationCountFile = join(root, "artifact-validations");
  const databaseVerificationCountFile = join(root, "database-verifications");
  const migrationQueryCountFile = join(root, "migration-queries");
  mkdirSync(binaries, { recursive: true });
  writeFileSync(databaseStateFile, "postgres\nreset90\n");
  writeFileSync(artifactValidationCountFile, "0\n");
  writeFileSync(databaseVerificationCountFile, "0\n");
  writeFileSync(migrationQueryCountFile, "0\n");
  writeFileSync(environmentFile, "TEST_DATABASE_PORT=55432\n");
  writeFileSync(
    composeFile,
    "services:\n  db:\n    image: postgres:16-alpine\n",
  );

  writeExecutable(join(binaries, "docker"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'printf "docker %s\\n" "$*" >> "$FAKE_COMMAND_LOG"',
    'joined="$*"',
    "state_contains() {",
    '  /usr/bin/grep -Fxq -- "$1" "$FAKE_DATABASE_STATE_FILE"',
    "}",
    "state_add() {",
    '  state_contains "$1" || printf "%s\\n" "$1" >> "$FAKE_DATABASE_STATE_FILE"',
    "}",
    "state_remove() {",
    '  /usr/bin/grep -Fxv -- "$1" "$FAKE_DATABASE_STATE_FILE" > "$FAKE_DATABASE_STATE_FILE.tmp" || true',
    '  /bin/mv "$FAKE_DATABASE_STATE_FILE.tmp" "$FAKE_DATABASE_STATE_FILE"',
    "}",
    "finish_injected_command() {",
    '  if [[ -n "${FAKE_DOCKER_FAIL_AFTER_MATCH:-}" && "$joined" == *"$FAKE_DOCKER_FAIL_AFTER_MATCH"* ]]; then',
    "    exit 1",
    "  fi",
    '  if [[ -n "${FAKE_DOCKER_SIGNAL_AFTER_MATCH:-}" && "$joined" == *"$FAKE_DOCKER_SIGNAL_AFTER_MATCH"* ]]; then',
    '    /bin/kill -TERM "$(/bin/cat "$FAKE_RESTORE_PID_FILE")"',
    "    /bin/sleep 0.05",
    "    exit 143",
    "  fi",
    "}",
    'if [[ -n "${FAKE_DOCKER_BLOCK_MATCH:-}" && "$joined" == *"$FAKE_DOCKER_BLOCK_MATCH"* ]]; then',
    '  : > "$FAKE_DOCKER_BLOCKED_FILE"',
    '  while [[ ! -f "$FAKE_DOCKER_RELEASE_FILE" ]]; do /bin/sleep 0.01; done',
    "fi",
    'if [[ -n "${FAKE_DOCKER_FAIL_MATCH:-}" && "$joined" == *"$FAKE_DOCKER_FAIL_MATCH"* ]]; then',
    "  exit 1",
    "fi",
    'if [[ "$joined" == "compose version" ]]; then exit 0; fi',
    'if [[ "$joined" == "inspect "* ]]; then',
    '  printf "%s\\n" "${FAKE_CONTAINER_HEALTH:-healthy}"',
    "  exit 0",
    "fi",
    'if [[ "$joined" == *" ps -q db" ]]; then',
    '  [[ "${FAKE_SERVICE_MISSING:-0}" == "1" ]] || printf "db-container\\n"',
    "  exit 0",
    "fi",
    'if [[ "$joined" == *" port db 5432" ]]; then',
    '  printf "127.0.0.1:55432\\n"',
    "  exit 0",
    "fi",
    'if [[ "$joined" == *"ps --status running -q app"* ]]; then',
    '  [[ "${FAKE_APP_RUNNING:-0}" == "1" ]] && printf "app-container\\n"',
    "  exit 0",
    "fi",
    'if [[ "$joined" == *"pg_dump --version"* ]]; then',
    '  printf "%s\\n" "${FAKE_PG_DUMP_VERSION:-pg_dump (PostgreSQL) 16.9}"',
    "  exit 0",
    "fi",
    'if [[ "$joined" == *"printf \\"%s\\\\t%s\\" \\"\\$POSTGRES_USER\\" \\"\\$POSTGRES_DB\\""* ]]; then',
    '  printf "reset90_test\\treset90_source_test"',
    "  exit 0",
    "fi",
    'if [[ "$joined" == *"pg_dump --no-owner"* ]]; then',
    '  if [[ "${FAKE_PG_DUMP_EMPTY:-0}" != "1" ]]; then',
    '    printf "%s\\n" "-- PostgreSQL database dump" "CREATE TABLE restored_test(id integer);"',
    `    printf "%s\\n" "-- ${privateSentinel}"`,
    "  fi",
    "  exit 0",
    "fi",
    'if [[ "$joined" == *"psql --version"* ]]; then',
    '  printf "psql (PostgreSQL) 16.9\\n"',
    "  exit 0",
    "fi",
    'if [[ "$joined" == *"SHOW server_version_num"* ]]; then',
    '  printf "%s\\n" "${FAKE_SERVER_VERSION:-160009}"',
    "  exit 0",
    "fi",
    'if [[ "$joined" == *"AS existing_objects"* ]]; then',
    '  if [[ -n "${FAKE_TARGET_STATE:-}" ]]; then printf "%s\\n" "$FAKE_TARGET_STATE"; exit 0; fi',
    '  target_object="${FAKE_TARGET_OBJECT:-empty}"',
    '  case "$target_object" in',
    '    empty) printf "empty\\n" ;;',
    '    function) [[ "$joined" == *"pg_catalog.pg_proc"* && "$joined" == *"routine.prokind IN"* ]] && printf "not-empty\\n" ;;',
    '    procedure) [[ "$joined" == *"pg_catalog.pg_proc"* && "$joined" == *"routine.prokind IN"* ]] && printf "not-empty\\n" ;;',
    '    schema) [[ "$joined" == *"pg_catalog.pg_namespace"* ]] && printf "not-empty\\n" ;;',
    '    enum) [[ "$joined" == *"database_type.typtype IN"* ]] && printf "not-empty\\n" ;;',
    '    operator) [[ "$joined" == *"pg_catalog.pg_operator"* ]] && printf "not-empty\\n" ;;',
    "    *) exit 1 ;;",
    "  esac",
    "  exit 0",
    "fi",
    'if [[ "$joined" == *"to_regclass"* ]]; then',
    '  migration_query_count="$(/bin/cat "$FAKE_MIGRATION_QUERY_COUNT_FILE")"',
    "  migration_query_count=$((migration_query_count + 1))",
    '  printf "%s\\n" "$migration_query_count" > "$FAKE_MIGRATION_QUERY_COUNT_FILE"',
    '  if [[ "${FAKE_FIRST_MIGRATION_TABLE_STATE_MISSING:-0}" == "1" && "$migration_query_count" -eq 1 ]]; then',
    '    printf "missing\\n"',
    '  elif [[ "$joined" == *"-d reset90 -c"* && -n "${FAKE_SOURCE_MIGRATION_TABLE_STATE:-}" ]]; then',
    '    printf "%s\\n" "$FAKE_SOURCE_MIGRATION_TABLE_STATE"',
    "  else",
    '    printf "%s\\n" "${FAKE_MIGRATION_TABLE_STATE:-present}"',
    "  fi",
    "  exit 0",
    "fi",
    'if [[ "$joined" == *"SELECT migration_name, CASE"* ]]; then',
    '  if [[ "$joined" == *"-d reset90 -c"* && -n "${FAKE_SOURCE_MIGRATION_ROWS:-}" ]]; then',
    '    printf "%s\\n" "$FAKE_SOURCE_MIGRATION_ROWS"',
    "  else",
    '    printf "%s\\n" "$FAKE_MIGRATION_ROWS"',
    "  fi",
    "  exit 0",
    "fi",
    'if [[ "$joined" == *"SELECT 1;"* ]]; then',
    '  verification_count="$(/bin/cat "$FAKE_DATABASE_VERIFICATION_COUNT_FILE")"',
    "  verification_count=$((verification_count + 1))",
    '  printf "%s\\n" "$verification_count" > "$FAKE_DATABASE_VERIFICATION_COUNT_FILE"',
    '  if [[ "${FAKE_FINAL_VERIFY_FAIL:-0}" == "1" && "$verification_count" -ge 2 ]]; then exit 1; fi',
    '  printf "1\\n"',
    "  exit 0",
    "fi",
    'if [[ "$joined" == *"FROM pg_database WHERE datname"* ]]; then',
    '  database_name=""',
    '  for argument in "$@"; do',
    '    if [[ "$argument" == database_name=* ]]; then database_name="${argument#database_name=}"; fi',
    "  done",
    '  [[ -n "$database_name" ]] || exit 1',
    '  if state_contains "$database_name"; then printf "yes\\n"; else printf "no\\n"; fi',
    "  exit 0",
    "fi",
    'if [[ "$joined" == *"source_database"* && "$joined" == *"PostgreSQL database dump"* ]]; then',
    '  validation_count="$(/bin/cat "$FAKE_ARTIFACT_VALIDATION_COUNT_FILE")"',
    "  validation_count=$((validation_count + 1))",
    '  printf "%s\\n" "$validation_count" > "$FAKE_ARTIFACT_VALIDATION_COUNT_FILE"',
    '  if [[ -n "${FAKE_ARTIFACT_VALIDATIONS_BEFORE_FAILURE:-}" && "$validation_count" -gt "$FAKE_ARTIFACT_VALIDATIONS_BEFORE_FAILURE" ]]; then',
    "    exit 1",
    "  fi",
    `  artifact_result="\${FAKE_ARTIFACT_RESULT:-reset90\\t${previousRevision}\\t16\\t${"c".repeat(64)}\\t123\\t${checkedInMigrations.length}\\t${completedMigrationDigest}\\tnone}"`,
    '  if [[ "$validation_count" -gt 1 && -n "${FAKE_ARTIFACT_SECOND_RESULT:-}" ]]; then',
    '    artifact_result="$FAKE_ARTIFACT_SECOND_RESULT"',
    "  fi",
    '  printf "%b" "$artifact_result"',
    "  exit 0",
    "fi",
    'if [[ "$joined" == *" createdb "* ]]; then',
    '  database_name="${!#}"',
    '  state_add "$database_name"',
    "  finish_injected_command",
    "  exit 0",
    "fi",
    'if [[ "$joined" =~ ALTER\\ DATABASE\\ \\\"([A-Za-z_][A-Za-z0-9_]*)\\\"\\ RENAME\\ TO\\ \\\"([A-Za-z_][A-Za-z0-9_]*)\\\" ]]; then',
    '  old_name="${BASH_REMATCH[1]}"',
    '  new_name="${BASH_REMATCH[2]}"',
    '  state_contains "$old_name" || exit 1',
    '  state_contains "$new_name" && exit 1',
    '  state_remove "$old_name"',
    '  state_add "$new_name"',
    "  finish_injected_command",
    "  exit 0",
    "fi",
    'if [[ "$joined" == *" dropdb "* ]]; then',
    '  database_name="${!#}"',
    '  state_remove "$database_name"',
    "  finish_injected_command",
    "  exit 0",
    "fi",
    'if [[ "$joined" == *"single-transaction"* ]]; then',
    '  if [[ "$joined" == *"exec -T db psql"* ]]; then /bin/cat >/dev/null; fi',
    '  if [[ -n "${FAKE_RESTORE_DECOMPRESS_FAIL:-}" || "${FAKE_RESTORE_PSQL_FAIL:-0}" == "1" ]]; then exit 1; fi',
    "  finish_injected_command",
    "  exit 0",
    "fi",
    'if [[ "$joined" == *"psql "* ]]; then',
    "  exit 0",
    "fi",
    "exit 0",
  ]);

  writeExecutable(join(binaries, "date"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'if [[ "$*" == "-u +%Y%m%dT%H%M%SZ" ]]; then',
    `  printf "%s\\n" "${fixedTimestamp}"`,
    'elif [[ "$*" == "-u +%s" && -n "${FAKE_NOW_EPOCH:-}" ]]; then',
    '  printf "%s\\n" "$FAKE_NOW_EPOCH"',
    "else",
    '  /bin/date "$@"',
    "fi",
  ]);

  writeExecutable(join(binaries, "gzip"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'if [[ "${FAKE_GZIP_FAIL:-0}" == "1" && "${1:-}" == "-c" ]]; then exit 1; fi',
    'if [[ "${FAKE_GZIP_MALFORMED:-0}" == "1" && "${1:-}" == "-c" ]]; then',
    '  printf "not gzip"',
    "  exit 0",
    "fi",
    'exec /bin/gzip "$@"',
  ]);

  writeExecutable(join(binaries, "sha256sum"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'if [[ "${FAKE_CHECKSUM_FAIL:-0}" == "1" && "$#" -gt 0 ]]; then exit 1; fi',
    'if [[ "${FAKE_CHECKSUM_VERIFY_FAIL:-0}" == "1" && "$*" == *"-c"* ]]; then exit 1; fi',
    'if [[ "${FAKE_CHECKSUM_BLOCK:-0}" == "1" && "$*" == *"-c"* ]]; then',
    '  : > "$FAKE_PUBLICATION_BLOCKED_FILE"',
    '  while [[ ! -f "$FAKE_PUBLICATION_RELEASE_FILE" ]]; do /bin/sleep 0.01; done',
    "fi",
    'exec /usr/bin/sha256sum "$@"',
  ]);

  writeExecutable(join(binaries, "mv"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'destination="${!#}"',
    'if [[ -n "${FAKE_MV_FAIL_SUFFIX:-}" && "$destination" == *"$FAKE_MV_FAIL_SUFFIX" ]]; then exit 1; fi',
    'if [[ -n "${FAKE_MV_BLOCK_SUFFIX:-}" && "$destination" == *"$FAKE_MV_BLOCK_SUFFIX" ]]; then',
    '  if [[ "${FAKE_MV_BLOCK_MODE:-after}" == "before" ]]; then',
    '    : > "$FAKE_PUBLICATION_BLOCKED_FILE"',
    '    while [[ ! -f "$FAKE_PUBLICATION_RELEASE_FILE" ]]; do /bin/sleep 0.01; done',
    "  fi",
    '  /bin/mv "$@"',
    '  if [[ "${FAKE_MV_BLOCK_MODE:-after}" == "after" ]]; then',
    '    : > "$FAKE_PUBLICATION_BLOCKED_FILE"',
    '    while [[ ! -f "$FAKE_PUBLICATION_RELEASE_FILE" ]]; do /bin/sleep 0.01; done',
    "  fi",
    "  exit 0",
    "fi",
    'exec /bin/mv "$@"',
  ]);

  writeExecutable(join(binaries, "rm"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'if [[ -n "${FAKE_RM_LOG:-}" ]]; then printf "rm %s\\n" "$*" >> "$FAKE_RM_LOG"; fi',
    'if [[ -n "${FAKE_RM_BLOCK_MATCH:-}" && "$*" == *"$FAKE_RM_BLOCK_MATCH"* ]]; then',
    '  /bin/rm "$@"',
    '  : > "$FAKE_RM_BLOCKED_FILE"',
    '  while [[ ! -f "$FAKE_RM_RELEASE_FILE" ]]; do /bin/sleep 0.01; done',
    "  exit 0",
    "fi",
    'exec /bin/rm "$@"',
  ]);

  writeExecutable(join(binaries, "flock"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'if [[ "${FAKE_FLOCK_FAIL:-0}" == "1" && "${1:-}" == "-n" ]]; then exit 1; fi',
    'exec /usr/bin/flock "$@"',
  ]);

  writeExecutable(join(binaries, "git"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'if [[ "${FAKE_GIT_UNAVAILABLE:-0}" == "1" ]]; then exit 1; fi',
    'exec /usr/bin/git "$@"',
  ]);

  const environment = {
    ...process.env,
    FAKE_ARTIFACT_VALIDATION_COUNT_FILE: artifactValidationCountFile,
    FAKE_COMMAND_LOG: commandLog,
    FAKE_DATABASE_STATE_FILE: databaseStateFile,
    FAKE_DATABASE_VERIFICATION_COUNT_FILE: databaseVerificationCountFile,
    FAKE_MIGRATION_ROWS: completedMigrationRows,
    FAKE_MIGRATION_QUERY_COUNT_FILE: migrationQueryCountFile,
    PATH: `${binaries}:/usr/bin:/bin`,
  };
  const backupArgs = [
    "--environment",
    "test",
    "--env-file",
    environmentFile,
    "--compose-file",
    composeFile,
    "--project",
    "phase22_test",
    "--backup-root",
    backupRoot,
    "--purpose",
    "manual",
    "--compatible-app-revision",
    revision,
    "--database",
    "reset90_source_test",
    "--user",
    "reset90_test",
  ];
  const restoreArgs = (file: string) => [
    "--environment",
    "test",
    "--env-file",
    environmentFile,
    "--compose-file",
    composeFile,
    "--project",
    "phase22_test",
    "--backup-root",
    backupRoot,
    "--file",
    file,
  ];

  return {
    backupArgs,
    backupRoot,
    artifactValidationCountFile,
    binaries,
    commandLog,
    composeFile,
    databaseStateFile,
    databaseVerificationCountFile,
    environment,
    environmentFile,
    migrationQueryCountFile,
    restoreArgs,
    root,
  };
}

function createArtifact(
  backupRoot: string,
  options: {
    timestamp?: string;
    purpose?: string;
    revision?: string;
    deploymentTargetRevision?: string;
    sourceDatabase?: string;
    metadataVersion?: string;
    postgresMajor?: string;
    migrationNames?: string[];
    sql?: string;
  } = {},
) {
  mkdirSync(backupRoot, { recursive: true });
  writeFileSync(
    join(backupRoot, ".reset90-backup-root"),
    "reset90-backup-root-v1\n",
  );
  chmodSync(join(backupRoot, ".reset90-backup-root"), 0o600);
  chmodSync(backupRoot, 0o700);

  const timestamp = options.timestamp ?? fixedTimestamp;
  const purpose = options.purpose ?? "manual";
  const gitRevision = options.revision ?? revision;
  const filename = `reset90_${timestamp}_${purpose}_${gitRevision}.sql.gz`;
  const file = join(backupRoot, filename);
  const compressed = gzipSync(
    options.sql ??
      "-- PostgreSQL database dump\nCREATE TABLE restored_test(id integer);\n",
  );
  const digest = createHash("sha256").update(compressed).digest("hex");
  const migrationNames = [
    ...(options.migrationNames ?? checkedInMigrations),
  ].sort();
  const migrationDigest = createHash("sha256")
    .update(`${migrationNames.join("\n")}\n`)
    .digest("hex");
  writeFileSync(file, compressed);
  writeFileSync(`${file}.sha256`, `${digest}  ${filename}\n`);
  writeFileSync(
    `${file}.meta`,
    [
      `metadata_version=${options.metadataVersion ?? "2"}`,
      `filename=${filename}`,
      `created_utc=${timestamp}`,
      `purpose=${purpose}`,
      `compatible_app_revision=${gitRevision}`,
      `deployment_target_revision=${options.deploymentTargetRevision ?? "none"}`,
      `postgres_major=${options.postgresMajor ?? "16"}`,
      `source_database=${options.sourceDatabase ?? "reset90_source_test"}`,
      `artifact_size_bytes=${compressed.byteLength}`,
      `artifact_sha256=${digest}`,
      `migration_count=${migrationNames.length}`,
      `migration_names_sha256=${migrationDigest}`,
      "",
    ].join("\n"),
  );
  for (const protectedFile of [file, `${file}.sha256`, `${file}.meta`]) {
    chmodSync(protectedFile, 0o600);
  }
  return file;
}

function replaceMetadataValue(file: string, key: string, value?: string) {
  const metadataFile = `${file}.meta`;
  const lines = readFileSync(metadataFile, "utf8").trimEnd().split("\n");
  const rewritten = lines.filter((line) => !line.startsWith(`${key}=`));
  if (value !== undefined) {
    rewritten.push(`${key}=${value}`);
  }
  writeFileSync(metadataFile, `${rewritten.join("\n")}\n`);
  chmodSync(metadataFile, 0o600);
}

function productionEnvironment() {
  return [
    "NODE_ENV=production",
    "AUTH_MODE=oidc",
    "APP_URL=https://reset90.test.invalid",
    "PORT=3000",
    "POSTGRES_USER=reset90",
    "POSTGRES_PASSWORD=DATABASE_PASSWORD_SENTINEL_12345",
    "POSTGRES_DB=reset90",
    "DATABASE_URL=postgresql://reset90:DATABASE_PASSWORD_SENTINEL_12345@db:5432/reset90",
    "AUTH_SECRET=AUTH_SECRET_SENTINEL_12345678901234567890",
    "AUTH_TRUST_HOST=true",
    "AUTH_AUTHENTIK_ID=reset90-production",
    "AUTH_AUTHENTIK_SECRET=OIDC_SECRET_SENTINEL_1234567890",
    "AUTH_AUTHENTIK_ISSUER=https://auth.test.invalid/application/o/reset90",
    "GPT_INGEST_TOKEN=GPT_TOKEN_SENTINEL_123456789012345678901",
    "GPT_INGEST_OWNER_SUBJECT=stable-owner-subject",
    "EXPORT_DIR=/app/exports",
    "APP_VERSION=0.1.0",
    `GIT_COMMIT=${revision}`,
    "RESET90_HOST=reset90.test.invalid",
    "TRAEFIK_NETWORK=traefik_proxy",
    "TRAEFIK_ENTRYPOINT=websecure",
    "TRAEFIK_CERT_RESOLVER=letsencrypt",
    "",
  ].join("\n");
}

function productionBackupArgs(
  invocation: ReturnType<typeof productionRestoreInvocation>,
) {
  return [
    "--environment",
    "production",
    "--env-file",
    invocation.productionEnv,
    "--compose-file",
    join(repository, "docker-compose.production.yml"),
    "--backup-root",
    "/backups",
    "--purpose",
    "manual",
  ];
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function productionRestoreInvocation(
  harness: ReturnType<typeof shellHarness>,
  backupRevision = previousRevision,
  currentCompatibleRevision = revision,
  degradedRecovery = false,
) {
  const productionEnv = join(harness.root, ".env.production");
  const lockFile = join(harness.root, "production.lock");
  const stateDirectory = join(harness.root, "production state");
  const restorePidFile = join(harness.root, "restore.pid");
  const backupFile = `/backups/reset90_${fixedTimestamp}_manual_${backupRevision}.sql.gz`;
  const wrapper = join(harness.root, "run production restore.sh");
  writeFileSync(productionEnv, productionEnvironment());
  mkdirSync(stateDirectory, { recursive: true });
  writeFileSync(
    join(stateDirectory, "database-compatible.sha"),
    `${currentCompatibleRevision}\n`,
  );
  writeFileSync(
    join(stateDirectory, "successful.sha"),
    `${databaseCompatibleRevision}\n`,
  );
  writeFileSync(harness.databaseStateFile, "postgres\nreset90\n");
  writeFileSync(harness.artifactValidationCountFile, "0\n");
  writeFileSync(harness.databaseVerificationCountFile, "0\n");
  writeFileSync(harness.migrationQueryCountFile, "0\n");
  const restoreArguments = [
    "  --environment production \\",
    `  --env-file ${shellQuote(productionEnv)} \\`,
    `  --compose-file ${shellQuote(join(repository, "docker-compose.production.yml"))} \\`,
    "  --backup-root /backups \\",
    `  --file ${shellQuote(backupFile)}${degradedRecovery ? " \\" : ""}`,
  ];
  if (degradedRecovery) {
    restoreArguments.push("  --degraded-recovery");
  }
  writeExecutable(wrapper, [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `printf '%s\\n' "$$" > ${shellQuote(restorePidFile)}`,
    `exec ${shellQuote(join(repository, "scripts/restore-db.sh"))} \\`,
    ...restoreArguments,
  ]);

  return {
    backupFile,
    lockFile,
    productionEnv,
    restorePidFile,
    stateDirectory,
    wrapper,
  };
}

function runInteractiveProductionRestore(
  harness: ReturnType<typeof shellHarness>,
  confirmation: string,
  environment: EnvironmentOverrides = {},
  backupRevision = previousRevision,
  currentCompatibleRevision = revision,
  degradedRecovery = false,
) {
  const invocation = productionRestoreInvocation(
    harness,
    backupRevision,
    currentCompatibleRevision,
    degradedRecovery,
  );

  return {
    ...invocation,
    result: run(
      "script",
      ["-q", "-e", "-c", shellQuote(invocation.wrapper), "/dev/null"],
      {
        env: {
          ...harness.environment,
          DEPLOY_LOCK_FILE: invocation.lockFile,
          DEPLOY_STATE_DIR: invocation.stateDirectory,
          FAKE_RESTORE_PID_FILE: invocation.restorePidFile,
          ...environment,
        },
        input: `${confirmation}\n`,
      },
    ),
  };
}

function runPreparedInteractiveProductionRestore(
  harness: ReturnType<typeof shellHarness>,
  invocation: ReturnType<typeof productionRestoreInvocation>,
  confirmation: string,
  environment: EnvironmentOverrides = {},
) {
  return run(
    "script",
    ["-q", "-e", "-c", shellQuote(invocation.wrapper), "/dev/null"],
    {
      env: {
        ...harness.environment,
        DEPLOY_LOCK_FILE: invocation.lockFile,
        DEPLOY_STATE_DIR: invocation.stateDirectory,
        FAKE_RESTORE_PID_FILE: invocation.restorePidFile,
        ...environment,
      },
      input: `${confirmation}\n`,
    },
  );
}

function spawnInteractiveProductionRestore(
  harness: ReturnType<typeof shellHarness>,
  confirmation: string,
  environment: EnvironmentOverrides = {},
) {
  const invocation = productionRestoreInvocation(harness);
  const child = spawn(
    "script",
    ["-q", "-e", "-c", shellQuote(invocation.wrapper), "/dev/null"],
    {
      cwd: repository,
      env: {
        ...harness.environment,
        DEPLOY_LOCK_FILE: invocation.lockFile,
        DEPLOY_STATE_DIR: invocation.stateDirectory,
        FAKE_RESTORE_PID_FILE: invocation.restorePidFile,
        ...environment,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stdin.write(`${confirmation}\n`);
  return { ...invocation, child };
}

function databaseNames(harness: ReturnType<typeof shellHarness>) {
  return readFileSync(harness.databaseStateFile, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .sort();
}

function restoreDrillHarness() {
  const root = temporaryDirectory("reset90 restore drill harness ");
  const binaries = join(root, "fake bin");
  const commandLog = join(root, "docker.log");
  const resourceState = join(root, "drill-resource");
  const unrelatedState = join(root, "unrelated-resource");
  mkdirSync(binaries, { recursive: true });
  writeFileSync(unrelatedState, "keep\n");
  writeExecutable(join(binaries, "docker"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'printf "docker %s\\n" "$*" >> "$FAKE_DRILL_COMMAND_LOG"',
    'joined="$*"',
    'if [[ "$joined" == "compose version" ]]; then exit 0; fi',
    'if [[ "$joined" == *" up -d --wait db"* ]]; then',
    '  : > "$FAKE_DRILL_RESOURCE_STATE"',
    '  if [[ "${FAKE_DRILL_BLOCK_UP:-0}" == "1" ]]; then',
    '    : > "$FAKE_DRILL_BLOCKED_FILE"',
    '    while [[ ! -f "$FAKE_DRILL_RELEASE_FILE" ]]; do /bin/sleep 0.01; done',
    "  fi",
    '  [[ "${FAKE_DRILL_FAIL_UP:-0}" != "1" ]]',
    "  exit",
    "fi",
    'if [[ "$joined" == *" down --volumes --remove-orphans"* ]]; then',
    '  if [[ "${FAKE_DRILL_FAIL_DOWN:-0}" == "1" ]]; then exit 1; fi',
    '  /bin/rm -f "$FAKE_DRILL_RESOURCE_STATE"',
    "  exit 0",
    "fi",
    'if [[ "$joined" == *" port db 5432"* ]]; then printf "127.0.0.1:55432\\n"; exit 0; fi',
    'if [[ "$joined" == *" ps -q db"* ]]; then printf "drill-db\\n"; exit 0; fi',
    'if [[ "$joined" == "inspect "* ]]; then printf "healthy\\n"; exit 0; fi',
    'if [[ "$joined" == *"pg_dump --version"* ]]; then printf "pg_dump (PostgreSQL) 16.9\\n"; exit 0; fi',
    'if [[ "$joined" == *"psql --version"* ]]; then printf "psql (PostgreSQL) 16.9\\n"; exit 0; fi',
    'if [[ "$joined" == *"SHOW server_version_num"* ]]; then printf "160009\\n"; exit 0; fi',
    'if [[ "$joined" == *"AS existing_objects"* ]]; then printf "empty\\n"; exit 0; fi',
    'if [[ "$joined" == *"to_regclass"* ]]; then printf "present\\n"; exit 0; fi',
    'if [[ "$joined" == *"SELECT migration_name, CASE"* ]]; then',
    `  printf "%s\\n" ${shellQuote(completedMigrationRows)}`,
    "  exit 0",
    "fi",
    'if [[ "$joined" == *"pg_dump --no-owner"* ]]; then',
    '  printf "%s\\n" "-- PostgreSQL database dump" "CREATE TABLE restored_test(id integer);"',
    "  exit 0",
    "fi",
    'if [[ "$joined" == *"single-transaction"* ]]; then /bin/cat >/dev/null; exit 0; fi',
    'if [[ "$joined" == *"SELECT count(*) FROM \\"_prisma_migrations\\""* ]]; then',
    `  printf "%s\\n" "${checkedInMigrations.length}"`,
    "  exit 0",
    "fi",
    'if [[ "$joined" == *"(SELECT count(*) FROM users) = 2"* ]]; then printf "valid\\n"; exit 0; fi',
    'if [[ "$joined" == *"INSERT INTO users"* || "$joined" == *"Invalid foreign key"* ]]; then exit 1; fi',
    'if [[ "$joined" == *"SELECT 1;"* ]]; then printf "1\\n"; exit 0; fi',
    'if [[ "$joined" == *" createdb "* ]]; then exit 0; fi',
    'if [[ "$joined" == *" psql "* ]]; then /bin/cat >/dev/null || true; exit 0; fi',
    "exit 1",
  ]);
  writeExecutable(join(binaries, "pnpm"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'printf "pnpm %s\\n" "$*" >> "$FAKE_DRILL_COMMAND_LOG"',
    "exit 0",
  ]);

  return {
    commandLog,
    environment: {
      ...process.env,
      FAKE_DRILL_COMMAND_LOG: commandLog,
      FAKE_DRILL_RESOURCE_STATE: resourceState,
      PATH: `${binaries}:/usr/bin:/bin:${process.env.PATH}`,
    },
    resourceState,
    root,
    unrelatedState,
  };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe("canonical database backup", () => {
  it("publishes one verified, restrictive artifact bundle from an explicit test environment", () => {
    const harness = shellHarness();
    const result = run("scripts/backup-db.sh", harness.backupArgs, {
      env: harness.environment,
    });
    const filename = `reset90_${fixedTimestamp}_manual_${revision}.sql.gz`;
    const file = join(harness.backupRoot, filename);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(`backup:verified filename=${filename}`);
    expect(result.stdout).toContain("retention:complete verified=1");
    expect(result.stdout).not.toContain(privateSentinel);
    expect(existsSync(file)).toBe(true);
    expect(existsSync(`${file}.sha256`)).toBe(true);
    expect(existsSync(`${file}.meta`)).toBe(true);
    expect(readFileSync(`${file}.meta`, "utf8")).toContain(
      "source_database=reset90_source_test",
    );
    expect(readFileSync(`${file}.meta`, "utf8")).toContain(
      `compatible_app_revision=${revision}`,
    );
    expect(readFileSync(`${file}.meta`, "utf8")).toContain(
      `artifact_size_bytes=${statSync(file).size}`,
    );
    const artifactDigest = createHash("sha256")
      .update(readFileSync(file))
      .digest("hex");
    expect(readFileSync(`${file}.meta`, "utf8")).toContain(
      `artifact_sha256=${artifactDigest}`,
    );
    for (const protectedFile of [file, `${file}.sha256`, `${file}.meta`]) {
      expect(lstatSync(protectedFile).mode & 0o777).toBe(0o600);
    }
    expect(
      readdirSync(harness.backupRoot).some((name) => name.endsWith(".partial")),
    ).toBe(false);
  });

  it("rejects implicit selection, missing files, example production env, and unsupported PostgreSQL tooling", () => {
    const harness = shellHarness();
    const noEnvironment = run(
      "scripts/backup-db.sh",
      harness.backupArgs.slice(2),
      { env: harness.environment },
    );
    const missingEnvironment = run(
      "scripts/backup-db.sh",
      harness.backupArgs.map((value) =>
        value === harness.environmentFile
          ? join(harness.root, "missing.env")
          : value,
      ),
      { env: harness.environment },
    );
    const productionExample = run(
      "scripts/backup-db.sh",
      [
        "--environment",
        "production",
        "--env-file",
        join(repository, ".env.production.example"),
        "--backup-root",
        "/backups",
        "--purpose",
        "manual",
        "--compatible-app-revision",
        revision,
      ],
      { env: harness.environment },
    );
    const wrongMajor = run("scripts/backup-db.sh", harness.backupArgs, {
      env: {
        ...harness.environment,
        FAKE_PG_DUMP_VERSION: "pg_dump (PostgreSQL) 15.7",
      },
    });

    expect(noEnvironment.stderr).toContain(
      "backup:failed:environment-selection-required",
    );
    expect(missingEnvironment.stderr).toContain(
      "backup:failed:environment-file-missing",
    );
    expect(productionExample.stderr).toContain(
      "backup:failed:example-env-not-allowed",
    );
    expect(wrongMajor.stderr).toContain(
      "backup:failed:postgres-major-version-unsupported",
    );
  });

  it.each([
    [
      "missing service",
      { FAKE_SERVICE_MISSING: "1" },
      "postgres-service-missing",
    ],
    [
      "unhealthy service",
      { FAKE_CONTAINER_HEALTH: "unhealthy" },
      "postgres-service-unhealthy",
    ],
    [
      "pg_dump failure",
      { FAKE_DOCKER_FAIL_MATCH: "pg_dump --no-owner" },
      "pg-dump",
    ],
    ["zero-byte dump", { FAKE_PG_DUMP_EMPTY: "1" }, "zero-byte-dump"],
    ["compression failure", { FAKE_GZIP_FAIL: "1" }, "compression"],
    ["malformed gzip", { FAKE_GZIP_MALFORMED: "1" }, "gzip-integrity"],
    ["checksum failure", { FAKE_CHECKSUM_FAIL: "1" }, "checksum"],
    [
      "final publication validation failure",
      { FAKE_CHECKSUM_VERIFY_FAIL: "1" },
      "final-publication-validation",
    ],
  ])("leaves no completed artifact after %s", (_name, override, failure) => {
    const harness = shellHarness();
    const result = run("scripts/backup-db.sh", harness.backupArgs, {
      env: { ...harness.environment, ...override },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`backup:failed:${failure}`);
    if (existsSync(harness.backupRoot)) {
      expect(
        readdirSync(harness.backupRoot).filter((name) =>
          name.endsWith(".sql.gz"),
        ),
      ).toEqual([]);
    }
  });

  it("refuses a final filename collision without overwriting the first backup", () => {
    const harness = shellHarness();
    const first = run("scripts/backup-db.sh", harness.backupArgs, {
      env: harness.environment,
    });
    const file = join(
      harness.backupRoot,
      `reset90_${fixedTimestamp}_manual_${revision}.sql.gz`,
    );
    const before = readFileSync(file);
    const second = run("scripts/backup-db.sh", harness.backupArgs, {
      env: harness.environment,
    });

    expect(first.status).toBe(0);
    expect(second.status).not.toBe(0);
    expect(second.stderr).toContain("backup:failed:filename-collision");
    expect(readFileSync(file)).toEqual(before);
  });

  it("uses explicit unknown compatible revision when optional Git metadata is unavailable", () => {
    const harness = shellHarness();
    const revisionIndex = harness.backupArgs.indexOf(
      "--compatible-app-revision",
    );
    const args = [...harness.backupArgs];
    args.splice(revisionIndex, 2);
    const result = run("scripts/backup-db.sh", args, {
      env: { ...harness.environment, FAKE_GIT_UNAVAILABLE: "1" },
    });
    const filename = `reset90_${fixedTimestamp}_manual_unknown-revision.sql.gz`;

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`backup:verified filename=${filename}`);
    expect(
      readFileSync(join(harness.backupRoot, `${filename}.meta`), "utf8"),
    ).toContain("compatible_app_revision=unknown-revision");
  });

  it("uses checkout HEAD only when database and checkout migration contracts match", () => {
    const harness = shellHarness();
    const revisionIndex = harness.backupArgs.indexOf(
      "--compatible-app-revision",
    );
    const args = [...harness.backupArgs];
    args.splice(revisionIndex, 2);
    const checkoutRevision = run("git", [
      "rev-parse",
      "--verify",
      "HEAD",
    ]).stdout.trim();
    const result = run("scripts/backup-db.sh", args, {
      env: harness.environment,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`_${checkoutRevision}.sql.gz`);
  });

  it("uses unknown-revision when database migration contract is one behind checkout", () => {
    const harness = shellHarness();
    const revisionIndex = harness.backupArgs.indexOf(
      "--compatible-app-revision",
    );
    const args = [...harness.backupArgs];
    args.splice(revisionIndex, 2);
    const olderRows = checkedInMigrations
      .slice(0, -1)
      .map((name) => `${name}\tcompleted`)
      .join("\n");
    const result = run("scripts/backup-db.sh", args, {
      env: {
        ...harness.environment,
        FAKE_MIGRATION_ROWS: olderRows,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("_unknown-revision.sql.gz");
  });

  it("accepts an explicit full compatible revision despite checkout contract mismatch", () => {
    const harness = shellHarness();
    const olderRows = checkedInMigrations
      .slice(0, -1)
      .map((name) => `${name}\tcompleted`)
      .join("\n");
    const result = run("scripts/backup-db.sh", harness.backupArgs, {
      env: {
        ...harness.environment,
        FAKE_MIGRATION_ROWS: olderRows,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`_${revision}.sql.gz`);
  });

  it("rejects a malformed explicit compatible revision", () => {
    const harness = shellHarness();
    const args = harness.backupArgs.map((value) =>
      value === revision ? "abc123" : value,
    );
    const result = run("scripts/backup-db.sh", args, {
      env: harness.environment,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "backup:failed:invalid-compatible-app-revision",
    );
    expect(readFileSync(harness.commandLog, "utf8")).not.toContain("pg_dump");
  });

  it("cleans partial files and exits non-zero when backup is interrupted", async () => {
    const harness = shellHarness();
    const blockedFile = join(harness.root, "backup-blocked");
    const releaseFile = join(harness.root, "backup-release");
    const child = spawn("scripts/backup-db.sh", harness.backupArgs, {
      cwd: repository,
      env: {
        ...harness.environment,
        FAKE_DOCKER_BLOCK_MATCH: "pg_dump --no-owner",
        FAKE_DOCKER_BLOCKED_FILE: blockedFile,
        FAKE_DOCKER_RELEASE_FILE: releaseFile,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const resultPromise = collectProcess(child);

    await waitForFile(blockedFile);
    child.kill("SIGTERM");
    writeFileSync(releaseFile, "release\n");
    const result = await resultPromise;

    expect(result.status).not.toBe(0);
    expect(
      readdirSync(harness.backupRoot).filter((name) =>
        name.endsWith(".partial"),
      ),
    ).toEqual([]);
    expect(
      readdirSync(harness.backupRoot).filter((name) =>
        name.endsWith(".sql.gz"),
      ),
    ).toEqual([]);
  });

  it.each([
    [
      "before artifact publication",
      { FAKE_MV_BLOCK_MODE: "before", FAKE_MV_BLOCK_SUFFIX: ".sql.gz" },
    ],
    [
      "after artifact publication before checksum publication",
      { FAKE_MV_BLOCK_MODE: "after", FAKE_MV_BLOCK_SUFFIX: ".sql.gz" },
    ],
    [
      "after checksum publication before metadata publication",
      {
        FAKE_MV_BLOCK_MODE: "after",
        FAKE_MV_BLOCK_SUFFIX: ".sql.gz.sha256",
      },
    ],
    ["during final validation", { FAKE_CHECKSUM_BLOCK: "1" }],
  ])(
    "leaves no accepted bundle when interrupted %s",
    async (_name, stageEnvironment) => {
      const harness = shellHarness();
      const blockedFile = join(harness.root, "publication-blocked");
      const releaseFile = join(harness.root, "publication-release");
      const child = spawn("scripts/backup-db.sh", harness.backupArgs, {
        cwd: repository,
        env: {
          ...harness.environment,
          ...stageEnvironment,
          FAKE_PUBLICATION_BLOCKED_FILE: blockedFile,
          FAKE_PUBLICATION_RELEASE_FILE: releaseFile,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const resultPromise = collectProcess(child);

      await waitForFile(blockedFile);
      child.kill("SIGTERM");
      writeFileSync(releaseFile, "release\n");
      const result = await resultPromise;
      const publishedNames = readdirSync(harness.backupRoot).filter((name) =>
        name.startsWith("reset90_"),
      );
      const partialNames = readdirSync(harness.backupRoot).filter((name) =>
        name.endsWith(".partial"),
      );

      expect(result.status).not.toBe(0);
      expect(publishedNames).toEqual([]);
      expect(partialNames).toEqual([]);
      const retention = run(
        "scripts/backup-retention.sh",
        [
          "--environment",
          "test",
          "--env-file",
          harness.environmentFile,
          "--compose-file",
          harness.composeFile,
          "--backup-root",
          harness.backupRoot,
          "--dry-run",
        ],
        { env: harness.environment },
      );
      expect(retention.status).toBe(0);
      expect(retention.stdout).toContain("verified=0 candidates=0");
    },
  );

  it.each([
    [
      "database",
      ["--database", "other_reset90"],
      "production-database-override-mismatch",
    ],
    ["user", ["--user", "other_user"], "production-user-override-mismatch"],
  ])(
    "rejects a mismatched production %s override before backup mutation",
    (_name, override, failure) => {
      const harness = shellHarness();
      const invocation = productionRestoreInvocation(harness);
      const result = run(
        "scripts/backup-db.sh",
        [
          "--environment",
          "production",
          "--env-file",
          invocation.productionEnv,
          "--compose-file",
          join(repository, "docker-compose.production.yml"),
          "--backup-root",
          "/backups",
          "--purpose",
          "manual",
          ...override,
        ],
        {
          env: {
            ...harness.environment,
            DEPLOY_STATE_DIR: invocation.stateDirectory,
          },
        },
      );
      const commandLog = readFileSync(harness.commandLog, "utf8");

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`backup:failed:${failure}`);
      expect(commandLog).not.toContain("pg_dump");
      expect(commandLog).not.toContain("ps -q db");
    },
  );

  it("acquires and releases the shared lock for standalone production backup", () => {
    const harness = shellHarness();
    const invocation = productionRestoreInvocation(harness);
    const result = run(
      "scripts/backup-db.sh",
      productionBackupArgs(invocation),
      {
        env: {
          ...harness.environment,
          DEPLOY_LOCK_FILE: invocation.lockFile,
          DEPLOY_STATE_DIR: invocation.stateDirectory,
        },
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "backup:production-lock-acquired ownership=backup",
    );
    expect(existsSync(invocation.lockFile)).toBe(true);
    expect(
      run("/usr/bin/flock", ["-n", invocation.lockFile, "-c", "true"]).status,
    ).toBe(0);
  });

  it.each(["deployment", "restore"])(
    "fails standalone production backup while %s owns the shared lock",
    async (ownerLabel) => {
      const harness = shellHarness();
      const invocation = productionRestoreInvocation(harness);
      const owner = spawnSharedLockOwner(
        harness.root,
        invocation.lockFile,
        ownerLabel,
      );
      const ownerResultPromise = collectProcess(owner.child);

      await waitForFile(owner.acquiredFile);
      const result = run(
        "scripts/backup-db.sh",
        productionBackupArgs(invocation),
        {
          env: {
            ...harness.environment,
            DEPLOY_LOCK_FILE: invocation.lockFile,
            DEPLOY_STATE_DIR: invocation.stateDirectory,
          },
        },
      );
      writeFileSync(owner.releaseFile, "release\n");
      const ownerResult = await ownerResultPromise;

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("backup:failed:production-lock-held");
      expect(ownerResult.status).toBe(0);
      expect(readFileSync(harness.commandLog, "utf8")).not.toContain(
        "pg_dump --version",
      );
    },
  );

  it("holds the shared lock through production retention", async () => {
    const harness = shellHarness();
    const invocation = productionRestoreInvocation(harness);
    const blockedFile = join(harness.root, "production-backup-blocked");
    const releaseFile = join(harness.root, "production-backup-release");
    const child = spawn(
      "scripts/backup-db.sh",
      productionBackupArgs(invocation),
      {
        cwd: repository,
        env: {
          ...harness.environment,
          DEPLOY_LOCK_FILE: invocation.lockFile,
          DEPLOY_STATE_DIR: invocation.stateDirectory,
          FAKE_DOCKER_BLOCK_MATCH: "pg_dump --version",
          FAKE_DOCKER_BLOCKED_FILE: blockedFile,
          FAKE_DOCKER_RELEASE_FILE: releaseFile,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const backupResultPromise = collectProcess(child);

    await waitForFile(blockedFile);
    const retention = run(
      "scripts/backup-retention.sh",
      [
        "--environment",
        "production",
        "--env-file",
        invocation.productionEnv,
        "--compose-file",
        join(repository, "docker-compose.production.yml"),
        "--backup-root",
        "/backups",
        "--apply",
      ],
      {
        env: {
          ...harness.environment,
          DEPLOY_LOCK_FILE: invocation.lockFile,
        },
      },
    );
    writeFileSync(releaseFile, "release\n");
    const backupResult = await backupResultPromise;

    expect(retention.status).not.toBe(0);
    expect(retention.stderr).toContain("retention:failed:production-lock-held");
    expect(backupResult.status).toBe(0);
  });

  it("releases only its acquired production lock after signal interruption", async () => {
    const harness = shellHarness();
    const invocation = productionRestoreInvocation(harness);
    const blockedFile = join(harness.root, "signalled-backup-blocked");
    const releaseFile = join(harness.root, "signalled-backup-release");
    const child = spawn(
      "scripts/backup-db.sh",
      productionBackupArgs(invocation),
      {
        cwd: repository,
        env: {
          ...harness.environment,
          DEPLOY_LOCK_FILE: invocation.lockFile,
          DEPLOY_STATE_DIR: invocation.stateDirectory,
          FAKE_DOCKER_BLOCK_MATCH: "pg_dump --version",
          FAKE_DOCKER_BLOCKED_FILE: blockedFile,
          FAKE_DOCKER_RELEASE_FILE: releaseFile,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const resultPromise = collectProcess(child);

    await waitForFile(blockedFile);
    child.kill("SIGTERM");
    writeFileSync(releaseFile, "release\n");
    const result = await resultPromise;

    expect(result.status).not.toBe(0);
    expect(
      run("/usr/bin/flock", ["-n", invocation.lockFile, "-c", "true"]).status,
    ).toBe(0);
  });

  it("does not release an inherited production lock owned by its caller", async () => {
    const harness = shellHarness();
    const invocation = productionRestoreInvocation(harness);
    const callerReady = join(harness.root, "caller-still-holds-lock");
    const callerRelease = join(harness.root, "caller-lock-release");
    const wrapper = join(harness.root, "inherited-backup-owner.sh");
    writeExecutable(wrapper, [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `exec 9>>${shellQuote(invocation.lockFile)}`,
      "/usr/bin/flock -n 9",
      `${shellQuote(join(repository, "scripts/backup-db.sh"))} \\`,
      ...[...productionBackupArgs(invocation), "--deployment-lock-fd", "9"].map(
        (argument, index, argumentsList) =>
          `  ${shellQuote(argument)}${index < argumentsList.length - 1 ? " \\" : ""}`,
      ),
      `: > ${shellQuote(callerReady)}`,
      `while [[ ! -f ${shellQuote(callerRelease)} ]]; do /bin/sleep 0.01; done`,
    ]);
    const child = spawn(wrapper, [], {
      cwd: repository,
      env: {
        ...harness.environment,
        DEPLOY_LOCK_FILE: invocation.lockFile,
        DEPLOY_STATE_DIR: invocation.stateDirectory,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const resultPromise = collectProcess(child);

    await waitForFile(callerReady);
    expect(
      run("/usr/bin/flock", ["-n", invocation.lockFile, "-c", "true"]).status,
    ).not.toBe(0);
    writeFileSync(callerRelease, "release\n");
    const result = await resultPromise;

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "backup:production-lock-acquired ownership=inherited",
    );
  });

  it("rejects an inherited descriptor that does not own the shared lock", () => {
    const harness = shellHarness();
    const invocation = productionRestoreInvocation(harness);
    const wrapper = join(harness.root, "unlocked-inherited-fd.sh");
    writeExecutable(wrapper, [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `exec 9>>${shellQuote(invocation.lockFile)}`,
      `${shellQuote(join(repository, "scripts/backup-db.sh"))} \\`,
      ...[...productionBackupArgs(invocation), "--deployment-lock-fd", "9"].map(
        (argument, index, argumentsList) =>
          `  ${shellQuote(argument)}${index < argumentsList.length - 1 ? " \\" : ""}`,
      ),
    ]);
    const result = run(wrapper, [], {
      env: {
        ...harness.environment,
        DEPLOY_LOCK_FILE: invocation.lockFile,
        DEPLOY_STATE_DIR: invocation.stateDirectory,
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "backup:failed:inherited-production-lock-invalid",
    );
    expect(readFileSync(harness.commandLog, "utf8")).not.toContain(
      "pg_dump --version",
    );
  });

  it("keeps local backup and disposable restore independent from production lock", async () => {
    const harness = shellHarness();
    const lockFile = join(harness.root, "production.lock");
    const owner = spawnSharedLockOwner(harness.root, lockFile, "production");
    const ownerResultPromise = collectProcess(owner.child);
    await waitForFile(owner.acquiredFile);

    const backup = run("scripts/backup-db.sh", harness.backupArgs, {
      env: {
        ...harness.environment,
        DEPLOY_LOCK_FILE: lockFile,
      },
    });
    const artifact = join(
      harness.backupRoot,
      `reset90_${fixedTimestamp}_manual_${revision}.sql.gz`,
    );
    const restore = run(
      "scripts/restore-db.sh",
      harness.restoreArgs(artifact),
      {
        env: {
          ...harness.environment,
          DATABASE_URL: undefined,
          DEPLOY_LOCK_FILE: lockFile,
          TEST_DATABASE_URL:
            "postgresql://reset90_test:password@127.0.0.1:55432/reset90_target_test",
        },
      },
    );
    writeFileSync(owner.releaseFile, "release\n");
    const ownerResult = await ownerResultPromise;

    expect(backup.status).toBe(0);
    expect(restore.status).toBe(0);
    expect(ownerResult.status).toBe(0);
  });
});

describe("verified backup retention", () => {
  it("uses terminating signal handlers in production retention subprocess", () => {
    const retentionScript = readFileSync(
      join(repository, "scripts/backup-retention.sh"),
      "utf8",
    );

    expect(retentionScript).not.toContain("trap cleanup EXIT HUP INT TERM");
    expect(retentionScript).toContain('trap "handle_signal 129" HUP');
    expect(retentionScript).toContain('trap "handle_signal 130" INT');
    expect(retentionScript).toContain('trap "handle_signal 143" TERM');
    expect(retentionScript).toContain("trap - EXIT HUP INT TERM");
    expect(retentionScript).toContain(
      'date -u -D "%Y%m%dT%H%M%SZ" -d "$timestamp" +%s',
    );
  });

  it("ignores an in-progress backup while concurrent retention runs", async () => {
    const harness = shellHarness();
    const blockedFile = join(harness.root, "backup-blocked");
    const releaseFile = join(harness.root, "backup-release");
    const child = spawn("scripts/backup-db.sh", harness.backupArgs, {
      cwd: repository,
      env: {
        ...harness.environment,
        FAKE_DOCKER_BLOCK_MATCH: "pg_dump --no-owner",
        FAKE_DOCKER_BLOCKED_FILE: blockedFile,
        FAKE_DOCKER_RELEASE_FILE: releaseFile,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const backupResultPromise = collectProcess(child);

    await waitForFile(blockedFile);
    const retention = run(
      "scripts/backup-retention.sh",
      [
        "--environment",
        "test",
        "--env-file",
        harness.environmentFile,
        "--compose-file",
        harness.composeFile,
        "--backup-root",
        harness.backupRoot,
        "--apply",
      ],
      { env: harness.environment },
    );
    writeFileSync(releaseFile, "release\n");
    const backup = await backupResultPromise;

    expect(retention.status).toBe(0);
    expect(retention.stdout).toContain("verified=0 candidates=0");
    expect(backup.status).toBe(0);
    expect(
      readdirSync(harness.backupRoot).filter((name) =>
        name.endsWith(".sql.gz"),
      ),
    ).toHaveLength(1);
  });

  it("dry-runs exact old bundles, keeps newest seven, and ignores unknown or temporary files", () => {
    const harness = shellHarness();
    const now = Date.now();
    const artifacts: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      const timestamp = new Date(now - (40 + index) * 86_400_000)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
      artifacts.push(createArtifact(harness.backupRoot, { timestamp }));
    }
    writeFileSync(join(harness.backupRoot, "unknown.txt"), "keep\n");
    writeFileSync(
      join(harness.backupRoot, ".creating.sql.gz.partial"),
      "keep\n",
    );
    const before = readdirSync(harness.backupRoot).sort();

    const result = run(
      "scripts/backup-retention.sh",
      [
        "--environment",
        "test",
        "--env-file",
        harness.environmentFile,
        "--compose-file",
        harness.composeFile,
        "--project",
        "phase22_test",
        "--backup-root",
        harness.backupRoot,
        "--dry-run",
      ],
      { env: harness.environment },
    );

    expect(result.status).toBe(0);
    expect(result.stdout.match(/retention:would-remove path=/g)).toHaveLength(
      9,
    );
    expect(result.stdout).toContain(
      "retention:complete verified=10 candidates=3",
    );
    expect(readdirSync(harness.backupRoot).sort()).toEqual(before);
    expect(existsSync(join(harness.backupRoot, "unknown.txt"))).toBe(true);
    expect(
      existsSync(join(harness.backupRoot, ".creating.sql.gz.partial")),
    ).toBe(true);
    expect(artifacts.every((file) => existsSync(file))).toBe(true);
  });

  it("deletes only exact verified bundles and preserves recent, unknown, and symlink entries", () => {
    const harness = shellHarness();
    const now = Date.now();
    for (let index = 0; index < 8; index += 1) {
      const timestamp = new Date(
        now - (index === 7 ? 45 : index + 1) * 86_400_000,
      )
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
      createArtifact(harness.backupRoot, { timestamp });
    }
    const outside = createArtifact(join(harness.root, "outside backups"), {
      timestamp: "20250101T000000Z",
    });
    const symlink = join(
      harness.backupRoot,
      `reset90_20250101T000000Z_manual_${revision}.sql.gz`,
    );
    symlinkSync(outside, symlink);
    writeFileSync(join(harness.backupRoot, "unknown.keep"), "keep\n");

    const result = run(
      "scripts/backup-retention.sh",
      [
        "--environment",
        "test",
        "--env-file",
        harness.environmentFile,
        "--compose-file",
        harness.composeFile,
        "--backup-root",
        harness.backupRoot,
        "--apply",
      ],
      { env: harness.environment },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("candidates=1");
    expect(existsSync(join(harness.backupRoot, "unknown.keep"))).toBe(true);
    expect(lstatSync(symlink).isSymbolicLink()).toBe(true);
  });

  it("ignores a bundle whose size metadata conflicts with its artifact", () => {
    const harness = shellHarness();
    const now = Date.now();
    let invalidArtifact = "";
    for (let index = 0; index < 8; index += 1) {
      const artifact = createArtifact(harness.backupRoot, {
        timestamp: new Date(now - (40 + index) * 86_400_000)
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d{3}Z$/, "Z"),
      });
      if (index === 7) {
        invalidArtifact = artifact;
      }
    }
    replaceMetadataValue(invalidArtifact, "artifact_size_bytes", "1");

    const result = run(
      "scripts/backup-retention.sh",
      [
        "--environment",
        "test",
        "--env-file",
        harness.environmentFile,
        "--compose-file",
        harness.composeFile,
        "--backup-root",
        harness.backupRoot,
        "--apply",
      ],
      { env: harness.environment },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("verified=7 candidates=0");
    expect(existsSync(invalidArtifact)).toBe(true);
  });

  it("keeps an artifact exactly at the 30-day boundary", () => {
    const harness = shellHarness();
    const now = Date.parse("2026-07-26T12:00:00Z");
    for (let index = 1; index <= 7; index += 1) {
      createArtifact(harness.backupRoot, {
        timestamp: new Date(now - index * 86_400_000)
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d{3}Z$/, "Z"),
      });
    }
    const boundary = createArtifact(harness.backupRoot, {
      timestamp: new Date(now - 30 * 86_400_000)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z"),
    });
    const expired = createArtifact(harness.backupRoot, {
      timestamp: new Date(now - 30 * 86_400_000 - 1000)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z"),
    });

    const result = run(
      "scripts/backup-retention.sh",
      [
        "--environment",
        "test",
        "--env-file",
        harness.environmentFile,
        "--compose-file",
        harness.composeFile,
        "--backup-root",
        harness.backupRoot,
        "--apply",
      ],
      {
        env: {
          ...harness.environment,
          FAKE_NOW_EPOCH: String(now / 1000),
        },
      },
    );

    expect(result.status).toBe(0);
    expect(existsSync(boundary)).toBe(true);
    expect(existsSync(expired)).toBe(false);
    expect(result.stdout).toContain("candidates=1");
  });

  it("reports a calendar-invalid timestamp as an invalid bundle", () => {
    const harness = shellHarness();
    const invalid = createArtifact(harness.backupRoot, {
      timestamp: "20260230T120000Z",
    });
    const result = run(
      "scripts/backup-retention.sh",
      [
        "--environment",
        "test",
        "--env-file",
        harness.environmentFile,
        "--compose-file",
        harness.composeFile,
        "--backup-root",
        harness.backupRoot,
        "--dry-run",
      ],
      { env: harness.environment },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toContain(
      `retention:invalid path=${invalid} reason=timestamp`,
    );
    expect(result.stdout).toContain("verified=0 candidates=0");
    expect(existsSync(invalid)).toBe(true);
  });

  it("stops after an interrupt without deleting a later retention candidate", async () => {
    const harness = shellHarness();
    const now = Date.parse("2026-07-26T12:00:00Z");
    const artifacts: string[] = [];
    for (let index = 0; index < 9; index += 1) {
      artifacts.push(
        createArtifact(harness.backupRoot, {
          timestamp: new Date(now - (40 + index) * 86_400_000)
            .toISOString()
            .replace(/[-:]/g, "")
            .replace(/\.\d{3}Z$/, "Z"),
        }),
      );
    }
    const blockedFile = join(harness.root, "retention-blocked");
    const releaseFile = join(harness.root, "retention-release");
    const rmLog = join(harness.root, "rm.log");
    const child = spawn(
      "scripts/backup-retention.sh",
      [
        "--environment",
        "test",
        "--env-file",
        harness.environmentFile,
        "--compose-file",
        harness.composeFile,
        "--backup-root",
        harness.backupRoot,
        "--apply",
      ],
      {
        cwd: repository,
        env: {
          ...harness.environment,
          FAKE_NOW_EPOCH: String(now / 1000),
          FAKE_RM_BLOCKED_FILE: blockedFile,
          FAKE_RM_BLOCK_MATCH: basename(artifacts[7]),
          FAKE_RM_LOG: rmLog,
          FAKE_RM_RELEASE_FILE: releaseFile,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const resultPromise = collectProcess(child);

    await waitForFile(blockedFile);
    child.kill("SIGINT");
    writeFileSync(releaseFile, "release\n");
    const result = await resultPromise;
    const rmCalls = readFileSync(rmLog, "utf8").split("\n").filter(Boolean);

    expect(result.status).not.toBe(0);
    expect(existsSync(artifacts[7])).toBe(false);
    expect(existsSync(artifacts[8])).toBe(true);
    expect(result.stdout).not.toContain(artifacts[8]);
    expect(
      rmCalls.filter((line) => line.includes("reset90-retention-")),
    ).toHaveLength(2);
  });

  it("protects an old selected restore bundle from automatic backup retention", () => {
    const harness = shellHarness();
    const now = Date.parse("2026-07-26T12:00:00Z");
    const selected = createArtifact(harness.backupRoot, {
      timestamp: "20260501T120000Z",
      sourceDatabase: "reset90",
    });
    for (let index = 1; index <= 7; index += 1) {
      createArtifact(harness.backupRoot, {
        timestamp: new Date(now - index * 86_400_000)
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d{3}Z$/, "Z"),
      });
    }

    const result = run(
      "scripts/backup-db.sh",
      [...harness.backupArgs, "--retention-protect-file", selected],
      {
        env: {
          ...harness.environment,
          FAKE_NOW_EPOCH: String(now / 1000),
        },
      },
    );

    expect(result.status).toBe(0);
    expect(existsSync(selected)).toBe(true);
    expect(existsSync(`${selected}.sha256`)).toBe(true);
    expect(existsSync(`${selected}.meta`)).toBe(true);
    expect(result.stdout).toContain("candidates=0");
  });

  it("accepts an empty marked root and rejects empty, relative, root, or unexpected roots", () => {
    const harness = shellHarness();
    const absentBackupRoot = join(harness.root, "absent backups");
    mkdirSync(harness.backupRoot, { recursive: true });
    writeFileSync(
      join(harness.backupRoot, ".reset90-backup-root"),
      "reset90-backup-root-v1\n",
    );
    chmodSync(join(harness.backupRoot, ".reset90-backup-root"), 0o600);
    chmodSync(harness.backupRoot, 0o700);
    const baseArgs = [
      "--environment",
      "test",
      "--env-file",
      harness.environmentFile,
      "--compose-file",
      harness.composeFile,
      "--dry-run",
    ];

    const empty = run(
      "scripts/backup-retention.sh",
      [...baseArgs, "--backup-root", harness.backupRoot],
      { env: harness.environment },
    );
    const absent = run(
      "scripts/backup-retention.sh",
      [...baseArgs, "--backup-root", absentBackupRoot],
      { env: harness.environment },
    );
    const relative = run(
      "scripts/backup-retention.sh",
      [...baseArgs, "--backup-root", "backups"],
      { env: harness.environment },
    );
    const root = run(
      "scripts/backup-retention.sh",
      [...baseArgs, "--backup-root", "/"],
      { env: harness.environment },
    );
    const unexpected = join(harness.root, "data");
    mkdirSync(unexpected);
    const wrong = run(
      "scripts/backup-retention.sh",
      [...baseArgs, "--backup-root", unexpected],
      { env: harness.environment },
    );

    expect(empty.status).toBe(0);
    expect(empty.stdout).toContain("verified=0 candidates=0");
    expect(absent.status).toBe(0);
    expect(absent.stdout).toContain("verified=0 candidates=0");
    expect(existsSync(absentBackupRoot)).toBe(false);
    expect(relative.stderr).toContain("backup-root-must-be-absolute");
    expect(root.stderr).toContain("backup-root-invalid");
    expect(wrong.stderr).toContain("backup-root-invalid");
  });
});

describe("guarded database restore", () => {
  const testDatabaseUrl =
    "postgresql://reset90_test:password@127.0.0.1:55432/reset90_target_test";

  it("restores one validated artifact only into an empty, distinct test database", () => {
    const harness = shellHarness();
    const artifact = createArtifact(harness.backupRoot);
    const result = run("scripts/restore-db.sh", harness.restoreArgs(artifact), {
      env: {
        ...harness.environment,
        DATABASE_URL: undefined,
        TEST_DATABASE_URL: testDatabaseUrl,
      },
    });
    const commandLog = readFileSync(harness.commandLog, "utf8");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(
      `restore:complete mode=test target=reset90_target_test backup=${basename(artifact)}`,
    );
    expect(commandLog).toContain("--single-transaction");
    expect(commandLog).not.toContain("migrate");
    expect(commandLog).not.toContain("seed");
    expect(commandLog).not.toContain("down -v");
  });

  it("keeps non-production restore compatible with unknown-revision backups", () => {
    const harness = shellHarness();
    const artifact = createArtifact(harness.backupRoot, {
      revision: "unknown-revision",
    });
    const result = run("scripts/restore-db.sh", harness.restoreArgs(artifact), {
      env: {
        ...harness.environment,
        DATABASE_URL: undefined,
        TEST_DATABASE_URL: testDatabaseUrl,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("restore:complete mode=test");
  });

  it.each([
    ["missing migration table", "missing", completedMigrationRows, false],
    [
      "unfinished migration",
      "present",
      completedMigrationRows.replace(
        `${checkedInMigrations[0]}\tcompleted`,
        `${checkedInMigrations[0]}\tunfinished`,
      ),
      false,
    ],
    [
      "unresolved failed migration",
      "present",
      completedMigrationRows.replace(
        `${checkedInMigrations[0]}\tcompleted`,
        `${checkedInMigrations[0]}\tfailed`,
      ),
      false,
    ],
    [
      "resolved historical rolled-back migration",
      "present",
      `${completedMigrationRows}\n${checkedInMigrations[0]}\trolled-back`,
      true,
    ],
    [
      "inconsistent expected migration history",
      "present",
      completedMigrationRows.split("\n").slice(1).join("\n"),
      false,
    ],
    [
      "duplicate completed migration",
      "present",
      `${completedMigrationRows}\n${checkedInMigrations[0]}\tcompleted`,
      false,
    ],
    [
      "unexpected migration",
      "present",
      `${completedMigrationRows}\n99999999999999_unexpected\tcompleted`,
      false,
    ],
    [
      "normal completed migration history",
      "present",
      completedMigrationRows,
      true,
    ],
  ])(
    "validates %s against backup migration contract",
    (_name, tableState, migrationRows, accepted) => {
      const harness = shellHarness();
      const artifact = createArtifact(harness.backupRoot);
      const result = run(
        "scripts/restore-db.sh",
        harness.restoreArgs(artifact),
        {
          env: {
            ...harness.environment,
            DATABASE_URL: undefined,
            FAKE_MIGRATION_ROWS: migrationRows,
            FAKE_MIGRATION_TABLE_STATE: tableState,
            TEST_DATABASE_URL: testDatabaseUrl,
          },
        },
      );

      if (accepted) {
        expect(result.status).toBe(0);
      } else {
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain(
          "restore:failed:restored-database-verification",
        );
      }
    },
  );

  it("accepts a complete N-1 migration contract and reports its compatible revision", () => {
    const harness = shellHarness();
    const olderMigrations = checkedInMigrations.slice(0, -1);
    const olderRows = olderMigrations
      .map((name) => `${name}\tcompleted`)
      .join("\n");
    const artifact = createArtifact(harness.backupRoot, {
      migrationNames: olderMigrations,
      revision: previousRevision,
    });
    const result = run("scripts/restore-db.sh", harness.restoreArgs(artifact), {
      env: {
        ...harness.environment,
        DATABASE_URL: undefined,
        FAKE_MIGRATION_ROWS: olderRows,
        TEST_DATABASE_URL: testDatabaseUrl,
      },
    });

    expect(checkedInMigrations).toHaveLength(olderMigrations.length + 1);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `restore:compatible-app-revision=${previousRevision}`,
    );
    expect(result.stdout).not.toContain(`compatible-app-revision=${revision}`);
  });

  it.each([
    ["nonexistent file", "missing"],
    ["directory", "directory"],
    ["empty file", "empty"],
    ["malformed gzip", "malformed"],
    ["valid gzip with invalid SQL", "invalid-sql"],
    ["unsupported extension", "extension"],
    ["unsupported metadata", "metadata"],
    ["missing checksum", "missing-checksum"],
    ["checksum mismatch", "checksum"],
    ["temporary artifact", "temporary"],
    ["symlink outside root", "symlink"],
    ["unsupported PostgreSQL major", "major"],
  ])("rejects %s before target mutation", (_name, scenario) => {
    const harness = shellHarness();
    let artifact = createArtifact(harness.backupRoot);
    if (scenario === "missing") {
      artifact = join(harness.backupRoot, "missing.sql.gz");
    } else if (scenario === "directory") {
      artifact = join(harness.backupRoot, "directory.sql.gz");
      mkdirSync(artifact);
    } else if (scenario === "empty") {
      writeFileSync(artifact, "");
    } else if (scenario === "malformed") {
      writeFileSync(artifact, "not gzip");
    } else if (scenario === "invalid-sql") {
      artifact = createArtifact(harness.backupRoot, {
        sql: "SELECT this is not valid SQL;\n",
      });
    } else if (scenario === "extension") {
      const unsupported = `${artifact}.dump`;
      writeFileSync(unsupported, readFileSync(artifact));
      chmodSync(unsupported, 0o600);
      artifact = unsupported;
    } else if (scenario === "metadata") {
      artifact = createArtifact(harness.backupRoot, { metadataVersion: "3" });
    } else if (scenario === "missing-checksum") {
      rmSync(`${artifact}.sha256`);
    } else if (scenario === "checksum") {
      writeFileSync(
        `${artifact}.sha256`,
        `${"0".repeat(64)}  ${basename(artifact)}\n`,
      );
    } else if (scenario === "temporary") {
      artifact = `${artifact}.partial`;
      writeFileSync(artifact, gzipSync("-- PostgreSQL database dump\n"));
      chmodSync(artifact, 0o600);
    } else if (scenario === "symlink") {
      const outside = createArtifact(join(harness.root, "outside backups"));
      artifact = join(
        harness.backupRoot,
        `reset90_20260726T120001Z_manual_${revision}.sql.gz`,
      );
      symlinkSync(outside, artifact);
    } else if (scenario === "major") {
      artifact = createArtifact(harness.backupRoot, { postgresMajor: "15" });
    }

    const result = run("scripts/restore-db.sh", harness.restoreArgs(artifact), {
      env: {
        ...harness.environment,
        DATABASE_URL: undefined,
        TEST_DATABASE_URL: testDatabaseUrl,
      },
    });
    const commandLog = existsSync(harness.commandLog)
      ? readFileSync(harness.commandLog, "utf8")
      : "";

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(
      /restore:failed:(backup-artifact-invalid|backup-sql-invalid)/,
    );
    expect(commandLog).not.toContain("--single-transaction");
  });

  it.each([
    ["wrong metadata size", "artifact_size_bytes", "999999", false],
    ["missing metadata size", "artifact_size_bytes", undefined, false],
    ["wrong metadata digest", "artifact_sha256", "d".repeat(64), false],
    ["missing metadata digest", "artifact_sha256", undefined, false],
    ["duplicate metadata size", "artifact_size_bytes", "duplicate", true],
    ["duplicate metadata digest", "artifact_sha256", "duplicate", true],
  ])("rejects %s before target mutation", (_name, key, value, duplicate) => {
    const harness = shellHarness();
    const artifact = createArtifact(harness.backupRoot);
    if (duplicate) {
      writeFileSync(
        `${artifact}.meta`,
        `${readFileSync(`${artifact}.meta`, "utf8")}${key}=${
          key === "artifact_size_bytes"
            ? statSync(artifact).size
            : "c".repeat(64)
        }\n`,
      );
      chmodSync(`${artifact}.meta`, 0o600);
    } else {
      replaceMetadataValue(artifact, key, value);
    }

    const result = run("scripts/restore-db.sh", harness.restoreArgs(artifact), {
      env: {
        ...harness.environment,
        DATABASE_URL: undefined,
        TEST_DATABASE_URL: testDatabaseUrl,
      },
    });
    const commandLog = readFileSync(harness.commandLog, "utf8");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("restore:failed:backup-artifact-invalid");
    expect(commandLog).not.toContain("--single-transaction");
  });

  it("rejects checksum disagreement with metadata and artifact", () => {
    const harness = shellHarness();
    const artifact = createArtifact(harness.backupRoot);
    writeFileSync(
      `${artifact}.sha256`,
      `${"e".repeat(64)}  ${basename(artifact)}\n`,
    );
    chmodSync(`${artifact}.sha256`, 0o600);

    const result = run("scripts/restore-db.sh", harness.restoreArgs(artifact), {
      env: {
        ...harness.environment,
        DATABASE_URL: undefined,
        TEST_DATABASE_URL: testDatabaseUrl,
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("restore:failed:backup-artifact-invalid");
  });

  it.each([
    [
      "same source and target",
      "postgresql://reset90_test:password@127.0.0.1:55432/reset90_source_test",
      undefined,
      "source-target-database-equality",
    ],
    [
      "unsafe host",
      "postgresql://reset90_test:password@db:5432/reset90_target_test",
      undefined,
      "unsafe-test-database-url",
    ],
    [
      "unsafe name",
      "postgresql://reset90_test:password@127.0.0.1:55432/reset90",
      undefined,
      "unsafe-test-database-url",
    ],
    [
      "inherited development URL",
      testDatabaseUrl,
      "postgresql://reset90:password@127.0.0.1:5432/reset90",
      "inherited-database-url-not-allowed",
    ],
  ])("rejects %s", (_name, targetUrl, inheritedUrl, failure) => {
    const harness = shellHarness();
    const artifact = createArtifact(harness.backupRoot);
    const result = run("scripts/restore-db.sh", harness.restoreArgs(artifact), {
      env: {
        ...harness.environment,
        DATABASE_URL: inheritedUrl,
        TEST_DATABASE_URL: targetUrl,
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`restore:failed:${failure}`);
  });

  it("rejects a populated target and PostgreSQL major mismatch", () => {
    const harness = shellHarness();
    const artifact = createArtifact(harness.backupRoot);
    const populated = run(
      "scripts/restore-db.sh",
      harness.restoreArgs(artifact),
      {
        env: {
          ...harness.environment,
          DATABASE_URL: undefined,
          TEST_DATABASE_URL: testDatabaseUrl,
          FAKE_TARGET_STATE: "not-empty",
        },
      },
    );
    const wrongMajor = run(
      "scripts/restore-db.sh",
      harness.restoreArgs(artifact),
      {
        env: {
          ...harness.environment,
          DATABASE_URL: undefined,
          TEST_DATABASE_URL: testDatabaseUrl,
          FAKE_SERVER_VERSION: "150007",
        },
      },
    );

    expect(populated.stderr).toContain(
      "restore:failed:target-database-not-empty",
    );
    expect(wrongMajor.stderr).toContain(
      "restore:failed:postgres-major-version-mismatch",
    );
  });

  it.each(["function", "procedure", "schema", "enum", "operator"])(
    "rejects a disposable target containing only a user-created %s",
    (kind) => {
      const harness = shellHarness();
      const artifact = createArtifact(harness.backupRoot);
      const result = run(
        "scripts/restore-db.sh",
        harness.restoreArgs(artifact),
        {
          env: {
            ...harness.environment,
            DATABASE_URL: undefined,
            FAKE_TARGET_OBJECT: kind,
            TEST_DATABASE_URL: testDatabaseUrl,
          },
        },
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "restore:failed:target-database-not-empty",
      );
      expect(readFileSync(harness.commandLog, "utf8")).not.toContain(
        "--single-transaction",
      );
    },
  );

  it("rolls back a header-valid dump when PostgreSQL rejects its SQL", () => {
    const harness = shellHarness();
    const artifact = createArtifact(harness.backupRoot, {
      sql: "-- PostgreSQL database dump\nSELECT invalid phase22 SQL;\n",
    });
    const result = run("scripts/restore-db.sh", harness.restoreArgs(artifact), {
      env: {
        ...harness.environment,
        DATABASE_URL: undefined,
        TEST_DATABASE_URL: testDatabaseUrl,
        FAKE_DOCKER_FAIL_MATCH: "single-transaction",
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("restore:failed:restore");
  });

  it("fails closed for a non-interactive production restore and keeps destructive extras absent", () => {
    const harness = shellHarness();
    const productionEnv = join(harness.root, ".env.production");
    writeFileSync(productionEnv, productionEnvironment());
    const result = run(
      "scripts/restore-db.sh",
      [
        "--environment",
        "production",
        "--env-file",
        productionEnv,
        "--compose-file",
        join(repository, "docker-compose.production.yml"),
        "--backup-root",
        "/backups",
        "--file",
        `/backups/reset90_${fixedTimestamp}_manual_${previousRevision}.sql.gz`,
      ],
      { env: harness.environment },
    );
    const restoreScript = readFileSync(
      join(repository, "scripts/restore-db.sh"),
      "utf8",
    );
    const deployScript = readFileSync(
      join(repository, "scripts/deploy-production.sh"),
      "utf8",
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "restore:failed:production-restore-requires-interactive-tty",
    );
    expect(restoreScript).not.toContain("prisma migrate");
    expect(restoreScript).not.toContain("db:seed");
    expect(restoreScript).not.toContain("migrate dev");
    expect(restoreScript).not.toContain("db push");
    expect(restoreScript).not.toContain("down -v");
    expect(restoreScript).not.toContain("compose up");
    expect(restoreScript).toContain(
      'LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/reset90-production-deploy.lock}"',
    );
    expect(deployScript).toContain(
      'LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/reset90-production-deploy.lock}"',
    );
  });

  it.each([
    ["unknown-revision", "production-backup-revision-invalid"],
    ["abc123", "backup-filename-invalid"],
  ])(
    "rejects production backup revision %s before lock or mutation",
    (backupRevision, failure) => {
      const harness = shellHarness();
      const backupName = `reset90_${fixedTimestamp}_manual_${backupRevision}.sql.gz`;
      const attempt = runInteractiveProductionRestore(
        harness,
        `RESTORE reset90 FROM ${backupName}`,
        {},
        backupRevision,
      );
      const combined = `${attempt.result.stdout}${attempt.result.stderr}`;

      expect(attempt.result.status).not.toBe(0);
      expect(combined).toContain(`restore:failed:${failure}`);
      expect(existsSync(attempt.lockFile)).toBe(false);
      expect(readFileSync(harness.commandLog, "utf8")).not.toContain(
        "ALTER DATABASE",
      );
    },
  );

  it("requires the exact production confirmation before lock or backup mutation", () => {
    const harness = shellHarness();
    const attempt = runInteractiveProductionRestore(
      harness,
      "RESTORE wrong FROM wrong.sql.gz",
    );
    const commandLog = readFileSync(harness.commandLog, "utf8");

    expect(attempt.result.status).not.toBe(0);
    expect(attempt.result.stdout).toContain(
      "restore:failed:production-confirmation-mismatch",
    );
    expect(commandLog).not.toContain("pg_dump --version");
    expect(existsSync(attempt.lockFile)).toBe(false);
  });

  it("requires distinct exact confirmation for degraded recovery", () => {
    const harness = shellHarness();
    const invocation = productionRestoreInvocation(
      harness,
      previousRevision,
      revision,
      true,
    );
    const backupName = basename(invocation.backupFile);
    const result = runPreparedInteractiveProductionRestore(
      harness,
      invocation,
      `RESTORE reset90 FROM ${backupName}`,
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(
      "restore:failed:production-confirmation-mismatch",
    );
    expect(existsSync(invocation.lockFile)).toBe(false);
  });

  it.each(["missing", "malformed", "unknown"])(
    "restores from selected verified metadata when compatible state is %s",
    (stateScenario) => {
      const harness = shellHarness();
      const invocation = productionRestoreInvocation(
        harness,
        previousRevision,
        revision,
        true,
      );
      const compatibleState = join(
        invocation.stateDirectory,
        "database-compatible.sha",
      );
      if (stateScenario === "missing") {
        rmSync(compatibleState);
      } else {
        writeFileSync(
          compatibleState,
          stateScenario === "unknown" ? "unknown\n" : "not-a-revision\n",
        );
      }
      const backupName = basename(invocation.backupFile);
      const result = runPreparedInteractiveProductionRestore(
        harness,
        invocation,
        `DEGRADED RESTORE reset90 FROM ${backupName}`,
      );
      const combined = `${result.stdout}${result.stderr}`;

      expect(result.status).toBe(0);
      expect(combined).toContain("restore:pre-restore-backup=completed");
      expect(combined).toContain(
        `restore:application-remains-stopped select-revision=${previousRevision}`,
      );
      expect(combined).not.toContain(`select-revision=${revision}`);
      expect(readFileSync(compatibleState, "utf8")).toBe(
        `${previousRevision}\n`,
      );
      expect(
        readFileSync(join(invocation.stateDirectory, "successful.sha"), "utf8"),
      ).toBe(`${databaseCompatibleRevision}\n`);
      expect(readFileSync(harness.commandLog, "utf8")).toContain(
        "unknown-revision",
      );
    },
  );

  it("restores a missing production database only through degraded recovery", () => {
    const harness = shellHarness();
    const invocation = productionRestoreInvocation(
      harness,
      previousRevision,
      revision,
      true,
    );
    writeFileSync(harness.databaseStateFile, "postgres\n");
    rmSync(join(invocation.stateDirectory, "database-compatible.sha"));
    const backupName = basename(invocation.backupFile);
    const result = runPreparedInteractiveProductionRestore(
      harness,
      invocation,
      `DEGRADED RESTORE reset90 FROM ${backupName}`,
    );
    const combined = `${result.stdout}${result.stderr}`;

    expect(result.status).toBe(0);
    expect(combined).toContain(
      "restore:pre-restore-backup=skipped reason=database-missing",
    );
    expect(databaseNames(harness)).toEqual(["postgres", "reset90"]);
    expect(
      readFileSync(
        join(invocation.stateDirectory, "database-compatible.sha"),
        "utf8",
      ),
    ).toBe(`${previousRevision}\n`);
  });

  it.each([
    [
      "fresh empty target with no migration contract",
      { FAKE_FIRST_MIGRATION_TABLE_STATE_MISSING: "1" },
    ],
    [
      "existing target whose backup tooling is unavailable",
      { FAKE_DOCKER_FAIL_MATCH: "pg_dump --version" },
    ],
  ])(
    "reports skipped unavailable pre-restore backup for %s",
    (_name, environment: EnvironmentOverrides) => {
      const harness = shellHarness();
      const invocation = productionRestoreInvocation(
        harness,
        previousRevision,
        revision,
        true,
      );
      writeFileSync(
        join(invocation.stateDirectory, "database-compatible.sha"),
        "unknown\n",
      );
      const backupName = basename(invocation.backupFile);
      const result = runPreparedInteractiveProductionRestore(
        harness,
        invocation,
        `DEGRADED RESTORE reset90 FROM ${backupName}`,
        environment,
      );
      const combined = `${result.stdout}${result.stderr}`;

      expect(result.status).toBe(0);
      expect(combined).toContain(
        "restore:pre-restore-backup=skipped reason=database-unavailable",
      );
      expect(combined).toContain("restore:complete mode=production");
      expect(databaseNames(harness)).toEqual(["postgres", "reset90"]);
    },
  );

  it.each(["missing", "malformed", "unknown"])(
    "normal production recovery fails when compatible state is %s",
    (stateScenario) => {
      const harness = shellHarness();
      const invocation = productionRestoreInvocation(harness);
      const compatibleState = join(
        invocation.stateDirectory,
        "database-compatible.sha",
      );
      if (stateScenario === "missing") {
        rmSync(compatibleState);
      } else {
        writeFileSync(
          compatibleState,
          stateScenario === "unknown" ? "unknown\n" : "not-a-revision\n",
        );
      }
      const backupName = basename(invocation.backupFile);
      const result = runPreparedInteractiveProductionRestore(
        harness,
        invocation,
        `RESTORE reset90 FROM ${backupName}`,
      );

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain(
        "restore:failed:production-compatible-revision-unavailable",
      );
      expect(readFileSync(harness.commandLog, "utf8")).not.toContain(
        "createdb",
      );
    },
  );

  it("normal production recovery refuses a missing target database", () => {
    const harness = shellHarness();
    const invocation = productionRestoreInvocation(harness);
    writeFileSync(harness.databaseStateFile, "postgres\n");
    const backupName = basename(invocation.backupFile);
    const result = runPreparedInteractiveProductionRestore(
      harness,
      invocation,
      `RESTORE reset90 FROM ${backupName}`,
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(
      "restore:failed:target-database-missing",
    );
    expect(databaseNames(harness)).toEqual(["postgres"]);
  });

  it("creates a verified pre-restore backup, replaces through staging, and retains the shared lock file", () => {
    const harness = shellHarness();
    const backupName = `reset90_${fixedTimestamp}_manual_${previousRevision}.sql.gz`;
    const confirmation = `RESTORE reset90 FROM ${backupName}`;
    const first = runInteractiveProductionRestore(
      harness,
      confirmation,
      {},
      previousRevision,
      databaseCompatibleRevision,
    );
    const second = runInteractiveProductionRestore(harness, confirmation);
    const commandLog = readFileSync(harness.commandLog, "utf8");

    expect(first.result.status).toBe(0);
    expect(second.result.status).toBe(0);
    expect(first.result.stdout).toContain("restore:production-lock-acquired");
    expect(first.result.stdout).toContain(
      "restore:pre-restore-backup=completed",
    );
    expect(first.result.stdout).toContain(
      `restore:complete mode=production target=reset90 backup=${backupName}`,
    );
    expect(first.result.stdout).toContain(
      `restore:application-remains-stopped select-revision=${previousRevision}`,
    );
    expect(first.result.stdout).not.toContain(
      `select-revision=${databaseCompatibleRevision}`,
    );
    expect(first.result.stdout).not.toContain(`select-revision=${revision}`);
    expect(commandLog).toContain(databaseCompatibleRevision);
    expect(commandLog).toContain("pg_dump --version");
    expect(commandLog).toContain("createdb");
    expect(commandLog).toContain("ALTER DATABASE");
    expect(commandLog).toContain("dropdb");
    expect(existsSync(first.lockFile)).toBe(true);
    expect(commandLog).not.toContain("migrate");
    expect(commandLog).not.toContain("seed");
    expect(commandLog).not.toContain("down -v");
    expect(commandLog).not.toContain("up -d");
    expect(
      readFileSync(
        join(first.stateDirectory, "database-compatible.sha"),
        "utf8",
      ),
    ).toBe(`${previousRevision}\n`);
    expect(
      readFileSync(join(first.stateDirectory, "successful.sha"), "utf8"),
    ).toBe(`${databaseCompatibleRevision}\n`);
  });

  it("rejects a wrong-source production backup before pre-restore backup or target mutation", () => {
    const harness = shellHarness();
    const backupName = `reset90_${fixedTimestamp}_manual_${previousRevision}.sql.gz`;
    const attempt = runInteractiveProductionRestore(
      harness,
      `RESTORE reset90 FROM ${backupName}`,
      {
        FAKE_ARTIFACT_RESULT: `other_reset90\t${previousRevision}\t16\t${"c".repeat(64)}\t123\t${checkedInMigrations.length}\t${completedMigrationDigest}\tnone`,
      },
    );
    const combined = `${attempt.result.stdout}${attempt.result.stderr}`;
    const commandLog = readFileSync(harness.commandLog, "utf8");

    expect(attempt.result.status).not.toBe(0);
    expect(combined).toContain(
      "restore:failed:backup-source-database-mismatch",
    );
    expect(commandLog).not.toContain("pg_dump --version");
    expect(commandLog).not.toContain("createdb");
    expect(commandLog).not.toContain("ALTER DATABASE");
    expect(databaseNames(harness)).toEqual(["postgres", "reset90"]);
  });

  it.each([
    [
      "disappears or stops validating",
      { FAKE_ARTIFACT_VALIDATIONS_BEFORE_FAILURE: "1" },
      "backup-artifact-invalid",
    ],
    [
      "changes after locked validation",
      {
        FAKE_ARTIFACT_SECOND_RESULT: `reset90\t${previousRevision}\t16\t${"d".repeat(64)}\t123\t${checkedInMigrations.length}\t${completedMigrationDigest}\tnone`,
      },
      "backup-artifact-changed",
    ],
  ])(
    "leaves target untouched when selected artifact %s before staging restore",
    (_name, environment, failure) => {
      const harness = shellHarness();
      const backupName = `reset90_${fixedTimestamp}_manual_${previousRevision}.sql.gz`;
      const attempt = runInteractiveProductionRestore(
        harness,
        `RESTORE reset90 FROM ${backupName}`,
        environment,
      );
      const combined = `${attempt.result.stdout}${attempt.result.stderr}`;
      const commandLog = readFileSync(harness.commandLog, "utf8");

      expect(attempt.result.status).not.toBe(0);
      expect(combined).toContain(`restore:failed:${failure}`);
      expect(commandLog).not.toContain('ALTER DATABASE "reset90"');
      expect(databaseNames(harness)).toEqual(["postgres", "reset90"]);
      expect(existsSync(attempt.lockFile)).toBe(true);
      expect(
        run("/usr/bin/flock", ["-n", attempt.lockFile, "-c", "true"]).status,
      ).toBe(0);
      expect(
        readFileSync(
          join(attempt.stateDirectory, "database-compatible.sha"),
          "utf8",
        ),
      ).toBe(`${revision}\n`);
    },
  );

  it("keeps concurrent production retention out for complete restore lifetime", async () => {
    const harness = shellHarness();
    const backupName = `reset90_${fixedTimestamp}_manual_${previousRevision}.sql.gz`;
    const blockedFile = join(harness.root, "restore-blocked");
    const releaseFile = join(harness.root, "restore-release");
    const attempt = spawnInteractiveProductionRestore(
      harness,
      `RESTORE reset90 FROM ${backupName}`,
      {
        FAKE_DOCKER_BLOCK_MATCH: "pg_dump --version",
        FAKE_DOCKER_BLOCKED_FILE: blockedFile,
        FAKE_DOCKER_RELEASE_FILE: releaseFile,
      },
    );
    const restoreResultPromise = collectProcess(attempt.child);

    await waitForFile(blockedFile);
    const retention = run(
      "scripts/backup-retention.sh",
      [
        "--environment",
        "production",
        "--env-file",
        attempt.productionEnv,
        "--compose-file",
        join(repository, "docker-compose.production.yml"),
        "--backup-root",
        "/backups",
        "--apply",
      ],
      {
        env: {
          ...harness.environment,
          DEPLOY_LOCK_FILE: attempt.lockFile,
        },
      },
    );
    writeFileSync(releaseFile, "release\n");
    const restoreResult = await restoreResultPromise;

    expect(retention.status).not.toBe(0);
    expect(retention.stderr).toContain("retention:failed:production-lock-held");
    expect(restoreResult.status).toBe(0);
    expect(restoreResult.stdout).toContain("restore:complete mode=production");
  });

  it.each([
    [
      "decompression fails before SQL",
      { FAKE_RESTORE_DECOMPRESS_FAIL: "before" },
    ],
    [
      "decompression emits valid initial SQL then fails while psql would succeed",
      { FAKE_RESTORE_DECOMPRESS_FAIL: "partial" },
    ],
    [
      "psql fails after successful decompression",
      { FAKE_RESTORE_PSQL_FAIL: "1" },
    ],
    [
      "decompression and psql both fail",
      {
        FAKE_RESTORE_DECOMPRESS_FAIL: "partial",
        FAKE_RESTORE_PSQL_FAIL: "1",
      },
    ],
  ])(
    "does not promote staging when %s",
    (_name, environment: EnvironmentOverrides) => {
      const harness = shellHarness();
      const backupName = `reset90_${fixedTimestamp}_manual_${previousRevision}.sql.gz`;
      const attempt = runInteractiveProductionRestore(
        harness,
        `RESTORE reset90 FROM ${backupName}`,
        environment,
      );
      const combined = `${attempt.result.stdout}${attempt.result.stderr}`;
      const restoreScript = readFileSync(
        join(repository, "scripts/restore-db.sh"),
        "utf8",
      );

      expect(attempt.result.status).not.toBe(0);
      expect(combined).toContain("restore:failed:restore");
      expect(combined).not.toContain("restore:complete mode=production");
      expect(databaseNames(harness)).toEqual(["postgres", "reset90"]);
      expect(restoreScript).toContain('gzip -cd "$file" > "$restore_sql"');
      expect(restoreScript).toContain('-d "$database" -f "$restore_sql"');
      expect(restoreScript).not.toContain('gzip -cd "$file" |\n    psql');
      expect(
        readFileSync(
          join(attempt.stateDirectory, "database-compatible.sha"),
          "utf8",
        ),
      ).toBe(`${revision}\n`);
    },
  );

  it.each([
    [
      "target rename failure",
      { FAKE_DOCKER_FAIL_MATCH: 'ALTER DATABASE "reset90" RENAME' },
      false,
    ],
    [
      "failure after original database rename",
      { FAKE_DOCKER_FAIL_AFTER_MATCH: 'ALTER DATABASE "reset90" RENAME' },
      false,
    ],
    [
      "staging promotion failure",
      {
        FAKE_DOCKER_FAIL_MATCH: 'ALTER DATABASE "reset90_restore_test_',
      },
      false,
    ],
    [
      "failure after staging promotion",
      {
        FAKE_DOCKER_FAIL_AFTER_MATCH: 'ALTER DATABASE "reset90_restore_test_',
      },
      true,
    ],
    [
      "interruption between rename completion and shell-state assignment",
      { FAKE_DOCKER_SIGNAL_AFTER_MATCH: 'ALTER DATABASE "reset90" RENAME' },
      false,
    ],
    [
      "failure while removing old database",
      { FAKE_DOCKER_FAIL_MATCH: " dropdb " },
      true,
    ],
    [
      "signal interruption during staging restore",
      { FAKE_DOCKER_SIGNAL_AFTER_MATCH: "single-transaction" },
      false,
    ],
  ])(
    "reconciles actual database names after %s",
    (_name, environment, preservesOldDatabase) => {
      const harness = shellHarness();
      const backupName = `reset90_${fixedTimestamp}_manual_${previousRevision}.sql.gz`;
      const attempt = runInteractiveProductionRestore(
        harness,
        `RESTORE reset90 FROM ${backupName}`,
        environment,
      );
      const names = databaseNames(harness);

      expect(attempt.result.status).not.toBe(0);
      expect(names).toContain("reset90");
      expect(names.some((name) => name.includes("_restore_test_"))).toBe(false);
      expect(names.some((name) => name.includes("_prerestore_"))).toBe(
        preservesOldDatabase,
      );
      expect(existsSync(attempt.lockFile)).toBe(true);
      expect(
        run("/usr/bin/flock", ["-n", attempt.lockFile, "-c", "true"]).status,
      ).toBe(0);
      expect(
        readFileSync(
          join(attempt.stateDirectory, "database-compatible.sha"),
          "utf8",
        ),
      ).toBe(`${revision}\n`);
    },
  );

  it("keeps compatibility state unchanged after failed final database verification", () => {
    const harness = shellHarness();
    const backupName = `reset90_${fixedTimestamp}_manual_${previousRevision}.sql.gz`;
    const attempt = runInteractiveProductionRestore(
      harness,
      `RESTORE reset90 FROM ${backupName}`,
      { FAKE_FINAL_VERIFY_FAIL: "1" },
    );
    const names = databaseNames(harness);

    expect(attempt.result.status).not.toBe(0);
    expect(`${attempt.result.stdout}${attempt.result.stderr}`).toContain(
      "restore:failed:final-database-verification",
    );
    expect(
      readFileSync(
        join(attempt.stateDirectory, "database-compatible.sha"),
        "utf8",
      ),
    ).toBe(`${revision}\n`);
    expect(names).toContain("reset90");
    expect(names.some((name) => name.includes("_prerestore_"))).toBe(true);
  });

  it("fails after preserving restored database when compatible-state publication fails", () => {
    const harness = shellHarness();
    const backupName = `reset90_${fixedTimestamp}_manual_${previousRevision}.sql.gz`;
    const attempt = runInteractiveProductionRestore(
      harness,
      `RESTORE reset90 FROM ${backupName}`,
      { FAKE_MV_FAIL_SUFFIX: "database-compatible.sha" },
    );
    const combined = `${attempt.result.stdout}${attempt.result.stderr}`;

    expect(attempt.result.status).not.toBe(0);
    expect(combined).toContain(
      "restore:database-restored compatibility-state=operator-repair-required",
    );
    expect(combined).toContain("restore:failed:compatible-state-persistence");
    expect(databaseNames(harness)).toEqual(["postgres", "reset90"]);
    expect(
      readFileSync(
        join(attempt.stateDirectory, "database-compatible.sha"),
        "utf8",
      ),
    ).toBe(`${revision}\n`);
    expect(
      readFileSync(join(attempt.stateDirectory, "successful.sha"), "utf8"),
    ).toBe(`${databaseCompatibleRevision}\n`);
    expect(combined).not.toContain("restore:complete mode=production");
  });

  it.each([
    [
      "application writes remain active",
      { FAKE_APP_RUNNING: "1" },
      "application-writes-not-stopped",
    ],
    [
      "shared deployment lock is unavailable",
      { FAKE_FLOCK_FAIL: "1" },
      "production-lock-held",
    ],
    [
      "pre-restore backup fails",
      { FAKE_DOCKER_FAIL_MATCH: "pg_dump --version" },
      "pre-restore-backup",
    ],
    [
      "staging restore fails",
      { FAKE_DOCKER_FAIL_MATCH: "single-transaction" },
      "restore",
    ],
  ])("fails production restore when %s", (_name, environment, failure) => {
    const harness = shellHarness();
    const backupName = `reset90_${fixedTimestamp}_manual_${previousRevision}.sql.gz`;
    const attempt = runInteractiveProductionRestore(
      harness,
      `RESTORE reset90 FROM ${backupName}`,
      environment,
    );
    const combined = `${attempt.result.stdout}${attempt.result.stderr}`;

    expect(attempt.result.status).not.toBe(0);
    expect(combined).toContain(`restore:failed:${failure}`);
    expect(combined).not.toContain("restore:complete mode=production");
    expect(
      readFileSync(
        join(attempt.stateDirectory, "database-compatible.sha"),
        "utf8",
      ),
    ).toBe(`${revision}\n`);
  });
});

describe("disposable restore drill cleanup", () => {
  it("reports successful verification and cleanup separately", () => {
    const harness = restoreDrillHarness();
    const result = run("scripts/restore-drill.sh", [], {
      env: harness.environment,
    });
    const commandLog = readFileSync(harness.commandLog, "utf8");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "restore-drill:evidence verification=passed",
    );
    expect(result.stdout).toContain("restore-drill:evidence cleanup=passed");
    expect(result.stderr).not.toContain("diagnostics-retained");
    expect(existsSync(harness.resourceState)).toBe(false);
    expect(existsSync(harness.unrelatedState)).toBe(true);
    expect(
      commandLog
        .split("\n")
        .filter((line) => line.includes(" down --volumes --remove-orphans")),
    ).toHaveLength(1);
  });

  it("returns non-zero and retains diagnostics when cleanup fails after verification", () => {
    const harness = restoreDrillHarness();
    const result = run("scripts/restore-drill.sh", [], {
      env: {
        ...harness.environment,
        FAKE_DRILL_FAIL_DOWN: "1",
      },
    });
    const commandLog = readFileSync(harness.commandLog, "utf8");
    const upLine = commandLog
      .split("\n")
      .find((line) => line.includes(" up -d --wait db"));
    const downLines = commandLog
      .split("\n")
      .filter((line) => line.includes(" down --volumes --remove-orphans"));
    const diagnosticsMatch = result.stderr.match(
      /restore-drill:diagnostics-retained path=(.+)/,
    );

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain(
      "restore-drill:evidence verification=passed",
    );
    expect(result.stdout).toContain("restore-drill:evidence cleanup=failed");
    expect(existsSync(harness.resourceState)).toBe(true);
    expect(existsSync(harness.unrelatedState)).toBe(true);
    expect(downLines).toHaveLength(1);
    expect(downLines[0].match(/-p ([^ ]+)/)?.[1]).toBe(
      upLine?.match(/-p ([^ ]+)/)?.[1],
    );
    expect(diagnosticsMatch?.[1]).toBeDefined();
    expect(existsSync(diagnosticsMatch![1])).toBe(true);
    temporaryDirectories.push(diagnosticsMatch![1]);
  });

  it("removes partial project resources after Compose readiness fails", () => {
    const harness = restoreDrillHarness();
    const result = run("scripts/restore-drill.sh", [], {
      env: {
        ...harness.environment,
        FAKE_DRILL_FAIL_UP: "1",
      },
    });
    const commandLog = readFileSync(harness.commandLog, "utf8");
    const upLine = commandLog
      .split("\n")
      .find((line) => line.includes(" up -d --wait db"));
    const downLines = commandLog
      .split("\n")
      .filter((line) => line.includes(" down --volumes --remove-orphans"));
    const diagnosticsMatch = result.stderr.match(
      /restore-drill:diagnostics-retained path=(.+)/,
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("restore-drill:failed:database-start");
    expect(existsSync(harness.resourceState)).toBe(false);
    expect(existsSync(harness.unrelatedState)).toBe(true);
    expect(downLines).toHaveLength(1);
    expect(upLine).toBeDefined();
    expect(downLines[0].match(/-p ([^ ]+)/)?.[1]).toBe(
      upLine?.match(/-p ([^ ]+)/)?.[1],
    );
    expect(diagnosticsMatch?.[1]).toBeDefined();
    expect(existsSync(diagnosticsMatch![1])).toBe(true);
    temporaryDirectories.push(diagnosticsMatch![1]);
  });

  it("cleans once and exits non-zero when interrupted during startup", async () => {
    const harness = restoreDrillHarness();
    const blockedFile = join(harness.root, "drill-blocked");
    const releaseFile = join(harness.root, "drill-release");
    const child = spawn("scripts/restore-drill.sh", [], {
      cwd: repository,
      env: {
        ...harness.environment,
        FAKE_DRILL_BLOCKED_FILE: blockedFile,
        FAKE_DRILL_BLOCK_UP: "1",
        FAKE_DRILL_RELEASE_FILE: releaseFile,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const resultPromise = collectProcess(child);

    await waitForFile(blockedFile);
    child.kill("SIGTERM");
    writeFileSync(releaseFile, "release\n");
    const result = await resultPromise;
    const commandLog = readFileSync(harness.commandLog, "utf8");
    const downLines = commandLog
      .split("\n")
      .filter((line) => line.includes(" down --volumes --remove-orphans"));
    const diagnosticsMatch = result.stderr.match(
      /restore-drill:diagnostics-retained path=(.+)/,
    );

    expect(result.status).not.toBe(0);
    expect(existsSync(harness.resourceState)).toBe(false);
    expect(existsSync(harness.unrelatedState)).toBe(true);
    expect(downLines).toHaveLength(1);
    expect(
      result.stdout.match(/restore-drill:evidence cleanup=passed/g),
    ).toHaveLength(1);
    expect(diagnosticsMatch?.[1]).toBeDefined();
    temporaryDirectories.push(diagnosticsMatch![1]);
  });
});
