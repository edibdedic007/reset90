import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const repository = resolve(import.meta.dirname, "..");
const fullRevision = "a".repeat(40);
const previousRevision = "b".repeat(40);
const secretSentinels = {
  auth: "AUTH_SECRET_SENTINEL_12345678901234567890",
  database: "DATABASE_PASSWORD_SENTINEL_12345",
  gpt: "GPT_TOKEN_SENTINEL_123456789012345678901",
  oidc: "OIDC_SECRET_SENTINEL_1234567890",
};
const temporaryDirectories: string[] = [];
type EnvironmentOverrides = Record<string, string | undefined>;

function productionEnvironment(revision = fullRevision) {
  return [
    "NODE_ENV=production",
    "AUTH_MODE=oidc",
    "APP_URL=https://reset90.test.invalid",
    "PORT=3000",
    "POSTGRES_USER=reset90",
    `POSTGRES_PASSWORD=${secretSentinels.database}`,
    "POSTGRES_DB=reset90",
    `DATABASE_URL=postgresql://reset90:${secretSentinels.database}@db:5432/reset90`,
    `AUTH_SECRET=${secretSentinels.auth}`,
    "AUTH_TRUST_HOST=true",
    "AUTH_AUTHENTIK_ID=reset90-production",
    `AUTH_AUTHENTIK_SECRET=${secretSentinels.oidc}`,
    "AUTH_AUTHENTIK_ISSUER=https://auth.test.invalid/application/o/reset90",
    `GPT_INGEST_TOKEN=${secretSentinels.gpt}`,
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

function temporaryDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function run(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? repository,
    encoding: "utf8",
    env: options.env ?? process.env,
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

function writeEnvironment(contents = productionEnvironment()) {
  const directory = temporaryDirectory("reset90-production-env-");
  const path = join(directory, ".env.production");
  writeFileSync(path, contents);
  return path;
}

function replaceEnvironmentValue(
  environment: string,
  key: string,
  value: string,
) {
  return environment.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
}

function copyExecutable(source: string, destination: string) {
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  chmodSync(destination, 0o755);
}

function deploymentHarness() {
  const root = temporaryDirectory("reset90 production deploy ");
  const scripts = join(root, "scripts");
  const binaries = join(root, "fake bin");
  const commandLog = join(root, "command.log");
  const stateDirectory = join(root, "deployment state");

  mkdirSync(binaries, { recursive: true });
  for (const script of [
    "backup-db.sh",
    "backup-retention.sh",
    "deploy-production.sh",
    "healthcheck.sh",
    "production-check.sh",
    "production-compose.sh",
  ]) {
    copyExecutable(join(repository, "scripts", script), join(scripts, script));
  }
  copyExecutable(
    join(repository, "scripts/lib/backup-restore.sh"),
    join(scripts, "lib/backup-restore.sh"),
  );
  copyExecutable(
    join(repository, "scripts/lib/production-env.sh"),
    join(scripts, "lib/production-env.sh"),
  );
  copyFileSync(join(repository, "Dockerfile"), join(root, "Dockerfile"));
  copyFileSync(
    join(repository, "docker-compose.production.yml"),
    join(root, "docker-compose.production.yml"),
  );
  writeFileSync(join(root, ".env.production"), productionEnvironment());

  writeFileSync(
    join(binaries, "git"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'printf "git %s\\n" "$*" >> "$FAKE_COMMAND_LOG"',
      'joined="$*"',
      'if [[ "$joined" == *"ls-files --error-unmatch .env.production"* ]]; then',
      "  exit 1",
      "fi",
      'if [[ "$joined" == *"status --porcelain"* ]]; then',
      '  if [[ "${FAKE_GIT_DIRTY:-0}" == "1" ]]; then',
      '    printf " M tracked-file\\n"',
      "  fi",
      "  exit 0",
      "fi",
      'if [[ "$joined" == *"rev-parse --verify HEAD"* ]]; then',
      '  printf "%s\\n" "$FAKE_GIT_SHA"',
      "  exit 0",
      "fi",
      'if [[ "$joined" == *"symbolic-ref --quiet --short HEAD"* ]]; then',
      '  printf "%s\\n" "$FAKE_GIT_BRANCH"',
      "  exit 0",
      "fi",
      'if [[ "$joined" == *"rev-parse --verify refs/heads/main"* ]]; then',
      '  printf "%s\\n" "$FAKE_MAIN_SHA"',
      "  exit 0",
      "fi",
      "exit 0",
      "",
    ].join("\n"),
  );

  writeFileSync(
    join(binaries, "docker"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'printf "docker %s\\n" "$*" >> "$FAKE_COMMAND_LOG"',
      'joined="$*"',
      'if [[ -n "${FAKE_DOCKER_BLOCK_MATCH:-}" && "$joined" == *"$FAKE_DOCKER_BLOCK_MATCH"* ]]; then',
      '  : > "$FAKE_DOCKER_BLOCKED_FILE"',
      '  while [[ ! -f "$FAKE_DOCKER_RELEASE_FILE" ]]; do',
      "    /bin/sleep 0.01",
      "  done",
      "fi",
      'if [[ -n "${FAKE_DOCKER_FAIL_MATCH:-}" && "$joined" == *"$FAKE_DOCKER_FAIL_MATCH"* ]]; then',
      "  exit 1",
      "fi",
      'if [[ "$joined" == "inspect "* ]]; then',
      '  container_id="${!#}"',
      '  if [[ "$container_id" == "${FAKE_UNHEALTHY_CONTAINER:-}" ]]; then',
      '    printf "unhealthy\\n"',
      "  else",
      '    printf "healthy\\n"',
      "  fi",
      "  exit 0",
      "fi",
      'if [[ "$joined" == *"pg_dump --version"* ]]; then',
      '  printf "pg_dump (PostgreSQL) 16.9\\n"',
      "  exit 0",
      "fi",
      'if [[ "$joined" == *" ps -q db" ]]; then',
      '  printf "db-container\\n"',
      "  exit 0",
      "fi",
      'if [[ "$joined" == *" ps -q app" ]]; then',
      '  printf "app-container\\n"',
      "  exit 0",
      "fi",
      "exit 0",
      "",
    ].join("\n"),
  );

  writeFileSync(
    join(binaries, "curl"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'printf "curl %s\\n" "$*" >> "$FAKE_COMMAND_LOG"',
      'if [[ "${FAKE_CURL_FAIL:-0}" == "1" ]]; then',
      "  exit 22",
      "fi",
      'target="${!#}"',
      'printf "%s" "${FAKE_CURL_EFFECTIVE:-$target}"',
      "",
    ].join("\n"),
  );

  chmodSync(join(binaries, "git"), 0o755);
  chmodSync(join(binaries, "docker"), 0o755);
  chmodSync(join(binaries, "curl"), 0o755);

  const environment = {
    ...process.env,
    DEPLOY_STATE_DIR: stateDirectory,
    DEPLOY_LOCK_FILE: join(root, "deployment.lock"),
    FAKE_COMMAND_LOG: commandLog,
    FAKE_GIT_BRANCH: "main",
    FAKE_GIT_SHA: fullRevision,
    FAKE_MAIN_SHA: fullRevision,
    PATH: `${binaries}:${process.env.PATH}`,
  };

  return {
    commandLog,
    environment,
    root,
    run: (extraEnvironment: EnvironmentOverrides = {}) =>
      run(join(scripts, "deploy-production.sh"), [], {
        cwd: root,
        env: { ...environment, ...extraEnvironment },
      }),
    spawn: (extraEnvironment: EnvironmentOverrides = {}) =>
      spawn(join(scripts, "deploy-production.sh"), [], {
        cwd: root,
        env: { ...environment, ...extraEnvironment },
        stdio: ["ignore", "pipe", "pipe"],
      }),
    stateDirectory,
  };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe("production environment contract", () => {
  const script = join(repository, "scripts/production-check.sh");

  it("accepts matching database URL, user, and database values", () => {
    const result = run(script, [writeEnvironment()]);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it.each([
    [
      "username",
      "DATABASE_URL username must match POSTGRES_USER.",
      "postgresql://other_user:DATABASE_PASSWORD_SENTINEL_12345@db:5432/reset90",
    ],
    [
      "database name",
      "DATABASE_URL database name must match POSTGRES_DB.",
      "postgresql://reset90:DATABASE_PASSWORD_SENTINEL_12345@db:5432/other_db",
    ],
  ])(
    "rejects a database URL %s mismatch without credentials",
    (_name, error, url) => {
      const environment = replaceEnvironmentValue(
        productionEnvironment(),
        "DATABASE_URL",
        url,
      );
      const result = run(script, [writeEnvironment(environment)]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(error);
      expect(`${result.stdout}${result.stderr}`).not.toContain(url);
      expect(`${result.stdout}${result.stderr}`).not.toContain(
        secretSentinels.database,
      );
    },
  );

  it.each([
    ["development auth", "AUTH_MODE", "dev"],
    ["non-production runtime", "NODE_ENV", "development"],
    ["plain HTTP application URL", "APP_URL", "http://reset90.test.invalid"],
    ["mismatched route host", "RESET90_HOST", "other.test.invalid"],
    [
      "localhost database URL",
      "DATABASE_URL",
      "postgresql://reset90:encoded@localhost:5432/reset90",
    ],
    ["placeholder secret", "AUTH_SECRET", "replace-with-production-secret"],
    ["non-immutable revision", "GIT_COMMIT", "latest"],
  ])("rejects %s", (_name, key, value) => {
    const environment = replaceEnvironmentValue(
      productionEnvironment(),
      key,
      value,
    );
    expect(run(script, [writeEnvironment(environment)]).status).toBe(1);
  });

  it("keeps browser, OIDC, and GPT secrets separate", () => {
    const environment = replaceEnvironmentValue(
      productionEnvironment(),
      "GPT_INGEST_TOKEN",
      secretSentinels.auth,
    );
    const result = run(script, [writeEnvironment(environment)]);
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain(secretSentinels.auth);
  });

  it("keeps obsolete configurable GPT body limits out of production examples", () => {
    const example = readFileSync(
      join(repository, ".env.production.example"),
      "utf8",
    );
    expect(example).not.toContain("GPT_INGEST_MAX_BODY_BYTES");
    expect(example).not.toContain("1048576");
    expect(example).not.toContain("BACKUP_DIR");
    expect(
      run(script, [join(repository, ".env.production.example")]).status,
    ).toBe(1);
  });
});

describe("production image and Compose policy", () => {
  it("uses a frozen multi-stage non-root production image", () => {
    const dockerfile = readFileSync(join(repository, "Dockerfile"), "utf8");
    const runner = dockerfile.slice(dockerfile.indexOf("AS runner"));
    const packageJson = JSON.parse(
      readFileSync(join(repository, "package.json"), "utf8"),
    ) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(dockerfile.match(/^FROM /gm)).toHaveLength(4);
    expect(dockerfile).toContain("pnpm install --frozen-lockfile");
    expect(dockerfile).toContain("pnpm build");
    expect(dockerfile).toContain("pnpm prune --prod");
    expect(runner).toContain("USER reset90");
    expect(runner).toContain("EXPOSE 3000");
    expect(runner).toContain("/api/ready");
    expect(runner).toContain("chown reset90:reset90 /app/exports");
    expect(runner).not.toContain("/app/backups");
    expect(runner).toContain(
      'CMD ["node", "node_modules/next/dist/bin/next", "start"]',
    );
    expect(runner).not.toContain("COPY . .");
    expect(runner).not.toContain(".env.production");
    expect(runner).not.toContain("next dev");
    expect(packageJson.dependencies.prisma).toBe("7.8.0");
    expect(packageJson.devDependencies.prisma).toBeUndefined();
  });

  it("renders a private, persistent, Traefik-only production topology", () => {
    const environmentPath = writeEnvironment();
    const result = run(
      join(repository, "scripts/production-compose.sh"),
      ["config", "--format", "json"],
      {
        env: {
          ...process.env,
          RESET90_ENV_FILE: environmentPath,
        },
      },
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);

    const config = JSON.parse(result.stdout) as {
      services: Record<string, Record<string, unknown>>;
      volumes: Record<string, unknown>;
    };
    const app = config.services.app as {
      depends_on: Record<string, { condition: string }>;
      expose?: string[];
      image: string;
      labels?: Record<string, string>;
      networks: Record<string, unknown>;
      network_mode?: string;
      ports?: unknown[];
      privileged?: boolean;
      volumes: Array<{ source: string; target: string; type: string }>;
    };
    const db = config.services.db as typeof app;

    expect(Object.keys(config.services)).toEqual(["app", "db"]);
    expect(app.image).toBe(`reset90:${fullRevision}`);
    expect(app.ports).toBeUndefined();
    expect(app.expose).toContain("3000");
    expect(Object.keys(app.networks).sort()).toEqual([
      "reset90_internal",
      "traefik",
    ]);
    expect(app.depends_on.db.condition).toBe("service_healthy");
    expect(app.labels).toMatchObject({
      "traefik.enable": "true",
      "traefik.docker.network": "traefik_proxy",
      "traefik.http.routers.reset90.entrypoints": "websecure",
      "traefik.http.routers.reset90.tls": "true",
      "traefik.http.routers.reset90.tls.certresolver": "letsencrypt",
      "traefik.http.services.reset90.loadbalancer.server.port": "3000",
    });
    expect(db.ports).toBeUndefined();
    expect(Object.keys(db.networks)).toEqual(["reset90_internal"]);
    expect(db.labels).toBeUndefined();
    expect(app.privileged).not.toBe(true);
    expect(db.privileged).not.toBe(true);
    expect(app.network_mode).not.toBe("host");
    expect(db.network_mode).not.toBe("host");
    expect(
      [...app.volumes, ...db.volumes].every(
        (volume) => volume.type === "volume",
      ),
    ).toBe(true);
    expect(app.volumes).toEqual([
      {
        source: "reset90_exports",
        target: "/app/exports",
        type: "volume",
        volume: {},
      },
    ]);
    expect(
      app.volumes.some((volume) => volume.source === "reset90_backups"),
    ).toBe(false);
    expect(db.volumes).toContainEqual({
      source: "reset90_backups",
      target: "/backups",
      type: "volume",
      volume: {},
    });
    expect(
      Object.entries(config.services)
        .filter(([, service]) =>
          (
            service as {
              volumes?: Array<{ source: string }>;
            }
          ).volumes?.some((volume) => volume.source === "reset90_backups"),
        )
        .map(([serviceName]) => serviceName),
    ).toEqual(["db"]);
    const legacyExample = readFileSync(
      join(repository, "examples/docker-compose.production.yml"),
      "utf8",
    );
    expect(legacyExample).not.toContain("reset90_backups:/app/backups");
    expect(legacyExample).toContain("reset90_backups:/backups");
    expect(Object.keys(config.volumes).sort()).toEqual([
      "reset90_backups",
      "reset90_exports",
      "reset90_postgres",
    ]);
  });

  it("fails Compose interpolation when a required value is missing", () => {
    const environment = productionEnvironment()
      .split("\n")
      .filter((line) => !line.startsWith("POSTGRES_PASSWORD="))
      .join("\n");
    const result = run(
      join(repository, "scripts/production-compose.sh"),
      ["config", "--quiet"],
      {
        env: {
          ...process.env,
          RESET90_ENV_FILE: writeEnvironment(environment),
        },
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("POSTGRES_PASSWORD");
  });
});

describe("production deployment workflow", () => {
  it("accepts checked-out main, orders gates, and records immutable revisions", () => {
    const harness = deploymentHarness();
    mkdirSync(harness.stateDirectory, { recursive: true });
    writeFileSync(
      join(harness.stateDirectory, "successful.sha"),
      `${previousRevision}\n`,
    );

    const first = harness.run();
    expect(first.stderr).toBe("");
    expect(first.status).toBe(0);
    const second = harness.run();
    expect(second.status).toBe(0);

    const commandLog = readFileSync(harness.commandLog, "utf8");
    expect(commandLog).toContain("symbolic-ref --quiet --short HEAD");
    expect(commandLog).toContain("rev-parse --verify refs/heads/main");
    const config = commandLog.indexOf("config --quiet");
    const network = commandLog.indexOf("network inspect traefik_proxy");
    const backup = commandLog.indexOf("exec -T db");
    const build = commandLog.indexOf("build app");
    const migrate = commandLog.indexOf(
      "run --rm --no-deps app node node_modules/prisma/build/index.js migrate deploy",
    );
    const promote = commandLog.indexOf("up -d --no-build db app");

    expect(config).toBeGreaterThanOrEqual(0);
    expect(network).toBeGreaterThan(config);
    expect(backup).toBeGreaterThan(network);
    expect(build).toBeGreaterThan(backup);
    expect(migrate).toBeGreaterThan(build);
    expect(promote).toBeGreaterThan(migrate);
    expect(commandLog).not.toContain("down -v");
    expect(commandLog).not.toContain("db:seed");
    expect(commandLog).not.toContain("latest");
    for (const secret of Object.values(secretSentinels)) {
      expect(`${first.stdout}${first.stderr}${commandLog}`).not.toContain(
        secret,
      );
    }
    expect(
      readFileSync(join(harness.stateDirectory, "attempted.sha"), "utf8"),
    ).toBe(`${fullRevision}\n`);
    expect(
      readFileSync(join(harness.stateDirectory, "successful.sha"), "utf8"),
    ).toBe(`${fullRevision}\n`);
    expect(
      readFileSync(
        join(harness.stateDirectory, "previous-successful.sha"),
        "utf8",
      ),
    ).toBe(`${previousRevision}\n`);
  });

  it.each([
    ["feature branch", "feature/phase-21-review"],
    ["local-only revision", "local"],
  ])("rejects a %s before Docker mutation", (_name, branch) => {
    const harness = deploymentHarness();
    const result = harness.run({
      FAKE_GIT_BRANCH: branch,
      FAKE_MAIN_SHA: previousRevision,
    });
    const commandLog = readFileSync(harness.commandLog, "utf8");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("failed:production-revision-not-main");
    expect(commandLog).not.toContain("up -d");
    expect(commandLog).not.toContain("build app");
    expect(commandLog).not.toContain("run --rm");
    expect(commandLog).not.toContain("exec -T");
  });

  it("keeps a second invocation out while the owner holds the lock", async () => {
    const harness = deploymentHarness();
    const blockedFile = join(harness.root, "deployment-blocked");
    const releaseFile = join(harness.root, "deployment-release");
    const first = harness.spawn({
      FAKE_DOCKER_BLOCK_MATCH: "build app",
      FAKE_DOCKER_BLOCKED_FILE: blockedFile,
      FAKE_DOCKER_RELEASE_FILE: releaseFile,
    });
    const firstResultPromise = collectProcess(first);

    try {
      await waitForFile(blockedFile);
      const commandLogBeforeSecond = readFileSync(harness.commandLog, "utf8");
      const second = harness.run();

      expect(second.status).not.toBe(0);
      expect(second.stderr).toContain("failed:deployment-lock-held");
      expect(readFileSync(harness.commandLog, "utf8")).toBe(
        commandLogBeforeSecond,
      );
    } finally {
      writeFileSync(releaseFile, "release\n");
    }

    const firstResult = await firstResultPromise;
    expect(firstResult.stderr).toBe("");
    expect(firstResult.status).toBe(0);
  });

  it("releases the lock after the owning deployment fails", () => {
    const harness = deploymentHarness();
    const failedOwner = harness.run({
      FAKE_DOCKER_FAIL_MATCH: "build app",
    });
    const nextOwner = harness.run();

    expect(failedOwner.status).not.toBe(0);
    expect(failedOwner.stderr).toContain("failed:image-build");
    expect(nextOwner.stderr).toBe("");
    expect(nextOwner.status).toBe(0);
  });

  it.each([
    ["Compose validation", "config --quiet", "network inspect"],
    [
      "external network",
      "network inspect traefik_proxy",
      "up -d --no-build db",
    ],
    ["backup", "exec -T db", "build app"],
    ["image build", "build app", "run --rm --no-deps app"],
    [
      "migration",
      "run --rm --no-deps app node node_modules/prisma/build/index.js migrate deploy",
      "up -d --no-build db app",
    ],
  ])("stops after failed %s gate", (_name, failure, forbiddenNextStep) => {
    const harness = deploymentHarness();
    const result = harness.run({ FAKE_DOCKER_FAIL_MATCH: failure });
    const commandLog = readFileSync(harness.commandLog, "utf8");

    expect(result.status).not.toBe(0);
    expect(commandLog).not.toContain(forbiddenNextStep);
    expect(() =>
      readFileSync(join(harness.stateDirectory, "successful.sha"), "utf8"),
    ).toThrow();
  });

  it.each([
    [
      "internal application health",
      { FAKE_UNHEALTHY_CONTAINER: "app-container" },
    ],
    ["public HTTPS readiness", { FAKE_CURL_FAIL: "1" }],
  ])("stops failed application after %s failure", (_name, environment) => {
    const harness = deploymentHarness();
    const result = harness.run(environment);
    const commandLog = readFileSync(harness.commandLog, "utf8");

    expect(result.status).not.toBe(0);
    expect(commandLog).toContain("stop app");
    expect(() =>
      readFileSync(join(harness.stateDirectory, "successful.sha"), "utf8"),
    ).toThrow();
  });

  it("fails before Docker mutation for missing, placeholder, dirty, or mismatched input", () => {
    for (const scenario of [
      "missing",
      "placeholder",
      "dirty",
      "revision",
    ] as const) {
      const harness = deploymentHarness();
      if (scenario === "missing") {
        rmSync(join(harness.root, ".env.production"));
      } else if (scenario === "placeholder") {
        writeFileSync(
          join(harness.root, ".env.production"),
          replaceEnvironmentValue(
            productionEnvironment(),
            "GPT_INGEST_TOKEN",
            "replace-with-production-token",
          ),
        );
      }

      const result = harness.run(
        scenario === "dirty"
          ? { FAKE_GIT_DIRTY: "1" }
          : scenario === "revision"
            ? {
                FAKE_GIT_SHA: previousRevision,
                FAKE_MAIN_SHA: previousRevision,
              }
            : {},
      );
      const commandLog = readFileSync(harness.commandLog, "utf8");
      expect(result.status).not.toBe(0);
      expect(commandLog).not.toContain("up -d");
      expect(commandLog).not.toContain("build app");
      expect(commandLog).not.toContain("run --rm");
    }
  });
});
