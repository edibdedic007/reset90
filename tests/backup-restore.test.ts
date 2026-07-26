import { spawnSync } from "node:child_process";
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
const fixedTimestamp = "20260726T120000Z";
const privateSentinel = "PRIVATE_JOURNAL_SENTINEL_DO_NOT_PRINT";
const temporaryDirectories: string[] = [];
type EnvironmentOverrides = Record<string, string | undefined>;

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
  mkdirSync(binaries, { recursive: true });
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
    'if [[ "$joined" == *"relation.relkind IN"* ]]; then',
    '  printf "%s\\n" "${FAKE_TARGET_STATE:-empty}"',
    "  exit 0",
    "fi",
    'if [[ "$joined" == *"to_regclass"* ]]; then',
    '  printf "%s\\n" "${FAKE_MIGRATION_STATE:-valid}"',
    "  exit 0",
    "fi",
    'if [[ "$joined" == *"SELECT 1;"* ]]; then printf "1\\n"; exit 0; fi',
    'if [[ "$joined" == *"source_database"* && "$joined" == *"PostgreSQL database dump"* ]]; then',
    `  printf "reset90\\t${previousRevision}\\t16"`,
    "  exit 0",
    "fi",
    'if [[ "$joined" == *"exec -T db psql"* && "$joined" == *"single-transaction"* ]]; then',
    "  /bin/cat >/dev/null",
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
    'if [[ "${FAKE_CHECKSUM_FAIL:-0}" == "1" ]]; then exit 1; fi',
    'if [[ "${FAKE_CHECKSUM_VERIFY_FAIL:-0}" == "1" && "$*" == *"-c"* ]]; then exit 1; fi',
    'exec /usr/bin/sha256sum "$@"',
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
    FAKE_COMMAND_LOG: commandLog,
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
    "--git-sha",
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
    binaries,
    commandLog,
    composeFile,
    environment,
    environmentFile,
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
    sourceDatabase?: string;
    metadataVersion?: string;
    postgresMajor?: string;
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
  writeFileSync(file, compressed);
  writeFileSync(`${file}.sha256`, `${digest}  ${filename}\n`);
  writeFileSync(
    `${file}.meta`,
    [
      `metadata_version=${options.metadataVersion ?? "1"}`,
      `filename=${filename}`,
      `created_utc=${timestamp}`,
      `purpose=${purpose}`,
      `git_sha=${gitRevision}`,
      `postgres_major=${options.postgresMajor ?? "16"}`,
      `source_database=${options.sourceDatabase ?? "reset90_source_test"}`,
      "",
    ].join("\n"),
  );
  for (const protectedFile of [file, `${file}.sha256`, `${file}.meta`]) {
    chmodSync(protectedFile, 0o600);
  }
  return file;
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
    "BACKUP_DIR=/app/backups",
    "APP_VERSION=0.1.0",
    `GIT_COMMIT=${revision}`,
    "RESET90_HOST=reset90.test.invalid",
    "TRAEFIK_NETWORK=traefik_proxy",
    "TRAEFIK_ENTRYPOINT=websecure",
    "TRAEFIK_CERT_RESOLVER=letsencrypt",
    "",
  ].join("\n");
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function runInteractiveProductionRestore(
  harness: ReturnType<typeof shellHarness>,
  confirmation: string,
  environment: EnvironmentOverrides = {},
) {
  const productionEnv = join(harness.root, ".env.production");
  const lockFile = join(harness.root, "production.lock");
  const backupFile = `/backups/reset90_${fixedTimestamp}_manual_${previousRevision}.sql.gz`;
  const wrapper = join(harness.root, "run production restore.sh");
  writeFileSync(productionEnv, productionEnvironment());
  writeExecutable(wrapper, [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `exec ${shellQuote(join(repository, "scripts/restore-db.sh"))} \\`,
    "  --environment production \\",
    `  --env-file ${shellQuote(productionEnv)} \\`,
    `  --compose-file ${shellQuote(join(repository, "docker-compose.production.yml"))} \\`,
    "  --backup-root /backups \\",
    `  --file ${shellQuote(backupFile)}`,
  ]);

  return {
    backupFile,
    lockFile,
    result: run(
      "script",
      ["-q", "-e", "-c", shellQuote(wrapper), "/dev/null"],
      {
        env: {
          ...harness.environment,
          DEPLOY_LOCK_FILE: lockFile,
          ...environment,
        },
        input: `${confirmation}\n`,
      },
    ),
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
        "--git-sha",
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
      "post-publication validation failure",
      { FAKE_CHECKSUM_VERIFY_FAIL: "1" },
      "published-artifact-invalid",
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

  it("uses explicit unknown-revision metadata when optional Git metadata is unavailable", () => {
    const harness = shellHarness();
    const gitShaIndex = harness.backupArgs.indexOf("--git-sha");
    const args = [...harness.backupArgs];
    args.splice(gitShaIndex, 2);
    const result = run("scripts/backup-db.sh", args, {
      env: { ...harness.environment, FAKE_GIT_UNAVAILABLE: "1" },
    });
    const filename = `reset90_${fixedTimestamp}_manual_unknown-revision.sql.gz`;

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`backup:verified filename=${filename}`);
    expect(
      readFileSync(join(harness.backupRoot, `${filename}.meta`), "utf8"),
    ).toContain("git_sha=unknown-revision");
  });
});

describe("verified backup retention", () => {
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
      artifact = createArtifact(harness.backupRoot, { metadataVersion: "2" });
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

  it("creates a verified pre-restore backup, replaces through staging, and retains the shared lock file", () => {
    const harness = shellHarness();
    const backupName = `reset90_${fixedTimestamp}_manual_${previousRevision}.sql.gz`;
    const confirmation = `RESTORE reset90 FROM ${backupName}`;
    const first = runInteractiveProductionRestore(harness, confirmation);
    const second = runInteractiveProductionRestore(harness, confirmation);
    const commandLog = readFileSync(harness.commandLog, "utf8");

    expect(first.result.status).toBe(0);
    expect(second.result.status).toBe(0);
    expect(first.result.stdout).toContain("restore:production-lock-acquired");
    expect(first.result.stdout).toContain(
      `restore:complete mode=production target=reset90 backup=${backupName}`,
    );
    expect(first.result.stdout).toContain(
      `restore:application-remains-stopped select-revision=${previousRevision}`,
    );
    expect(commandLog).toContain("pg_dump --version");
    expect(commandLog).toContain("createdb");
    expect(commandLog).toContain("ALTER DATABASE");
    expect(commandLog).toContain("dropdb");
    expect(existsSync(first.lockFile)).toBe(true);
    expect(commandLog).not.toContain("migrate");
    expect(commandLog).not.toContain("seed");
    expect(commandLog).not.toContain("down -v");
    expect(commandLog).not.toContain("up -d");
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
  });
});
