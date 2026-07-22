#!/usr/bin/env bash
set -euo pipefail

repo="${1:-.}"

if ! git -C "$repo" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Tracked-sensitive-file check requires a Git worktree: $repo" >&2
  exit 1
fi

forbidden=0
while IFS= read -r -d '' path; do
  case "$path" in
    .env.example|.env.local.example|.env.production.example|*.env.example|*/.env.example|*/.env.local.example|*/.env.production.example|*/*.env.example)
      continue
      ;;
    prisma/migrations/*.sql|prisma/migrations/**/*.sql)
      continue
      ;;
    .env|.env.*|*/.env|*/.env.*|*.env|\
    *.sql|*.sql.gz|*.dump|*.dump.gz|*.bak|*.backup|\
    backups/*|*/backups/*|exports/*|*/exports/*|logs/*|*/logs/*|coverage/*|*/coverage/*|\
    *.log|codex-*.jsonl|*/codex-*.jsonl|.codex/sessions/*|.codex/*.jsonl|.codex/**/*.jsonl|\
    journal-dump*|*/journal-dump*|reflection-dump*|*/reflection-dump*|\
    private-journal*|*/private-journal*|private-reflection*|*/private-reflection*|\
    private-export*|*/private-export*|production-db-export*|*/production-db-export*|\
    backup-*.tar|*/backup-*.tar|backup-*.tar.gz|*/backup-*.tar.gz|export-*.zip|*/export-*.zip)
      echo "Forbidden sensitive path is tracked: $path" >&2
      forbidden=1
      ;;
  esac
done < <(git -C "$repo" ls-files -z)

if [[ "$forbidden" -ne 0 ]]; then
  exit 1
fi

echo "Tracked-sensitive-file check passed."
