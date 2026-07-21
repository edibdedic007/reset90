import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const repository = resolve(import.meta.dirname, "..");
const script = join(repository, "scripts/check-tracked-sensitive-files.sh");
const temporaryDirectories: string[] = [];

function run(command: string, args: string[], cwd = repository) {
  return spawnSync(command, args, { cwd, encoding: "utf8" });
}

function temporaryGitRepository() {
  const directory = mkdtempSync(join(tmpdir(), "reset90-sensitive-test-"));
  temporaryDirectories.push(directory);
  expect(run("git", ["init", "--quiet"], directory).status).toBe(0);
  return directory;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe("repository hygiene", () => {
  it("passes against the real tracked repository", () => {
    const result = run(script, [repository]);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("fails closed for a synthetic tracked production environment file", () => {
    const directory = temporaryGitRepository();
    writeFileSync(join(directory, ".env.production"), "TOKEN=private\n");
    expect(run("git", ["add", "-f", ".env.production"], directory).status).toBe(
      0,
    );

    const result = run(script, [directory]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Forbidden sensitive path is tracked: .env.production",
    );
  });

  it("permits approved tracked placeholder examples", () => {
    const directory = temporaryGitRepository();
    writeFileSync(join(directory, ".env.local.example"), "TOKEN=placeholder\n");
    expect(run("git", ["add", ".env.local.example"], directory).status).toBe(0);
    expect(run(script, [directory]).status).toBe(0);
  });

  it("ignores sensitive categories while keeping approved examples visible", () => {
    for (const path of [
      ".env.production",
      "backups/private.sql.gz",
      "exports/private.zip",
      "logs/app.log",
      "coverage/index.html",
      "codex-private.jsonl",
      "reflection-dump.txt",
    ]) {
      expect(run("git", ["check-ignore", "--no-index", path]).status).toBe(0);
    }
    expect(
      run("git", ["check-ignore", "--no-index", ".env.local.example"]).status,
    ).toBe(1);
    expect(
      run("git", ["check-ignore", "--no-index", ".env.production.example"])
        .status,
    ).toBe(1);
  });

  it("excludes matching sensitive categories from Docker build context", () => {
    const dockerIgnore = readFileSync(
      join(repository, ".dockerignore"),
      "utf8",
    );
    for (const pattern of [
      ".env.*",
      "backups",
      "exports",
      "logs",
      "coverage",
      "*.sql",
      "codex-*.jsonl",
      "private-journal*",
      "reflection-dump*",
    ]) {
      expect(dockerIgnore).toContain(pattern);
    }
    expect(dockerIgnore).toContain("!.env.local.example");
    expect(dockerIgnore).toContain("!.env.production.example");
    expect(dockerIgnore).toContain("!prisma/migrations/**/*.sql");
  });
});
