"use client";

import { useRef, useState } from "react";

export const USER_EXPORT_ACTIONS = [
  {
    kind: "full-json",
    label: "Download full JSON archive",
    description:
      "Canonical versioned archive of all owned cycles, normalized records, and linked owned raw imports.",
    fallbackFilename: "reset90-full-export.json",
  },
  {
    kind: "day-logs-csv",
    label: "Download day logs CSV",
    description: "Spreadsheet-ready day logs from every owned reset cycle.",
    fallbackFilename: "reset90-day-logs.csv",
  },
  {
    kind: "tasks-csv",
    label: "Download tasks CSV",
    description:
      "Spreadsheet-ready current tasks with plan, day, and cycle identifiers.",
    fallbackFilename: "reset90-tasks.csv",
  },
  {
    kind: "checkins-csv",
    label: "Download check-ins CSV",
    description:
      "Spreadsheet-ready append-only check-ins from every owned day log.",
    fallbackFilename: "reset90-checkins.csv",
  },
  {
    kind: "summaries-markdown",
    label: "Download weekly and cycle summaries Markdown",
    description:
      "Stored normalized weekly reviews and existing cycle-report summaries; no generated analysis.",
    fallbackFilename: "reset90-summaries.md",
  },
] as const;

export type UserExportKind = (typeof USER_EXPORT_ACTIONS)[number]["kind"];

export type UserExportDownloadDependencies = {
  fetcher?: typeof fetch;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  triggerDownload?: (url: string, filename: string) => void;
};

export class UserExportDownloadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "UserExportDownloadError";
  }
}

function browserDownload(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function responseFilename(
  response: Response,
  fallbackFilename: string,
): string {
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([a-z0-9.-]+)"/i);
  return match?.[1] ?? fallbackFilename;
}

export async function downloadUserExport(
  kind: UserExportKind,
  dependencies: UserExportDownloadDependencies = {},
) {
  const action = USER_EXPORT_ACTIONS.find((item) => item.kind === kind);
  if (!action) throw new Error("Unsupported export action.");

  const response = await (dependencies.fetcher ?? fetch)(
    `/api/export/${kind}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: unknown;
    } | null;
    const message =
      typeof payload?.message === "string" && payload.message.length <= 200
        ? payload.message
        : "Export could not be downloaded. Try again.";
    throw new UserExportDownloadError(message, response.status);
  }

  const blob = await response.blob();
  const createObjectUrl =
    dependencies.createObjectUrl ?? URL.createObjectURL.bind(URL);
  const revokeObjectUrl =
    dependencies.revokeObjectUrl ?? URL.revokeObjectURL.bind(URL);
  const url = createObjectUrl(blob);
  try {
    (dependencies.triggerDownload ?? browserDownload)(
      url,
      responseFilename(response, action.fallbackFilename),
    );
  } finally {
    setTimeout(() => revokeObjectUrl(url), 0);
  }
}

export function createUserExportGuard() {
  let running = false;
  return async (download: () => Promise<void>): Promise<boolean> => {
    if (running) return false;
    running = true;
    try {
      await download();
      return true;
    } finally {
      running = false;
    }
  };
}

export function SettingsExportActions({
  runningKind,
  notice,
  onExport,
}: {
  runningKind: UserExportKind | null;
  notice: string | null;
  onExport: (kind: UserExportKind) => void;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Export your data</h2>
      <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
        Downloads stay private, include all owned cycles, and are generated only
        for this browser session.
      </p>
      <div className="mt-5 grid min-w-0 gap-4">
        {USER_EXPORT_ACTIONS.map((action) => {
          const loading = runningKind === action.kind;
          return (
            <div
              className="min-w-0 rounded-lg border border-[var(--border)] p-4 sm:flex sm:items-center sm:justify-between sm:gap-4"
              key={action.kind}
            >
              <div className="min-w-0">
                <h3 className="font-semibold">{action.label}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {action.description}
                </p>
              </div>
              <button
                className="mt-3 w-full shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:mt-0 sm:w-auto"
                disabled={runningKind !== null}
                onClick={() => onExport(action.kind)}
                type="button"
              >
                {loading ? "Downloading…" : action.label}
              </button>
            </div>
          );
        })}
      </div>
      <p aria-live="polite" className="mt-4 text-sm text-[var(--muted)]">
        {notice}
      </p>
    </section>
  );
}

export function SettingsExportPanel() {
  const guard = useRef<ReturnType<typeof createUserExportGuard> | null>(null);
  guard.current ??= createUserExportGuard();
  const [runningKind, setRunningKind] = useState<UserExportKind | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function exportData(kind: UserExportKind) {
    await guard.current?.(async () => {
      setRunningKind(kind);
      setNotice(null);
      try {
        await downloadUserExport(kind);
        setNotice("Download started.");
      } catch (error) {
        setNotice(
          error instanceof UserExportDownloadError
            ? error.message
            : "Export could not be downloaded. Try again.",
        );
      } finally {
        setRunningKind(null);
      }
    });
  }

  return (
    <SettingsExportActions
      notice={notice}
      onExport={(kind) => void exportData(kind)}
      runningKind={runningKind}
    />
  );
}
