"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import {
  CONTEXT_DOMAINS,
  CONTEXT_KINDS,
  type ContextFilterValues,
  type ContextItemDto,
  type ContextLibrary,
} from "@/lib/context";
import type { ContextValidationIssue } from "@/server/context";

function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTimestamp(value: string) {
  return `${value.slice(0, 10)} ${value.slice(11, 16)} UTC`;
}

function nextPageHref(filters: ContextFilterValues, cursor: string) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.domain) params.set("domain", filters.domain);
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.pinned) params.set("pinned", filters.pinned);
  if (filters.createdFrom) params.set("created_from", filters.createdFrom);
  if (filters.createdTo) params.set("created_to", filters.createdTo);
  params.set("cursor", cursor);
  return `/context?${params.toString()}`;
}

export type ContextPacketDownloadDependencies = {
  fetcher?: typeof fetch;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  triggerDownload?: (url: string, filename: string) => void;
  now?: () => Date;
};

export class ContextPacketDownloadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ContextPacketDownloadError";
  }
}

function responseFilename(response: Response, now: Date) {
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(
    /filename="(reset90-gpt-context-\d{4}-\d{2}-\d{2}\.json)"/,
  );
  return (
    match?.[1] ?? `reset90-gpt-context-${now.toISOString().slice(0, 10)}.json`
  );
}

function browserDownload(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export async function downloadGptContextPacket(
  dependencies: ContextPacketDownloadDependencies = {},
) {
  const response = await (dependencies.fetcher ?? fetch)(
    "/api/context/export",
    { method: "GET", cache: "no-store" },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: unknown;
    } | null;
    const message =
      typeof payload?.message === "string" && payload.message.length <= 200
        ? payload.message
        : "GPT context packet could not be downloaded. Try again.";
    throw new ContextPacketDownloadError(message, response.status);
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
      responseFilename(response, dependencies.now?.() ?? new Date()),
    );
  } finally {
    revokeObjectUrl(url);
  }
}

export function ContextPacketExportControl({
  disabled,
  loading,
  notice,
  onExport,
}: {
  disabled: boolean;
  loading: boolean;
  notice: string | null;
  onExport: () => void;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <h2 className="text-xl font-semibold">GPT context packet</h2>
      <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
        Download compact, normalized context from this active reset cycle.
      </p>
      <div className="mt-4 flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center">
        <button
          className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
          disabled={disabled || loading}
          onClick={onExport}
          type="button"
        >
          {loading ? "Exporting…" : "Export GPT context packet"}
        </button>
        {disabled ? (
          <span className="text-sm text-[var(--muted)]">
            An active reset cycle is required before exporting GPT context.
          </span>
        ) : null}
        <span aria-live="polite" className="text-sm text-[var(--muted)]">
          {notice}
        </span>
      </div>
    </section>
  );
}

function ContextPacketExport({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const running = useRef(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function exportPacket() {
    if (disabled || running.current) return;
    running.current = true;
    setLoading(true);
    setNotice(null);
    try {
      await downloadGptContextPacket();
      setNotice("GPT context packet downloaded.");
    } catch (error) {
      if (error instanceof ContextPacketDownloadError && error.status === 401) {
        router.refresh();
      }
      setNotice(
        error instanceof ContextPacketDownloadError
          ? error.message
          : "GPT context packet could not be downloaded. Try again.",
      );
    } finally {
      running.current = false;
      setLoading(false);
    }
  }

  return (
    <ContextPacketExportControl
      disabled={disabled}
      loading={loading}
      notice={notice}
      onExport={() => void exportPacket()}
    />
  );
}

function ManualContextForm({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    setSaving(true);
    setNotice(null);

    const form = new FormData(event.currentTarget);
    const tags = String(form.get("tags") ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const sourceRef = String(form.get("source_ref") ?? "").trim();

    try {
      const response = await fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          summary: form.get("summary"),
          kind: form.get("kind"),
          domain: form.get("domain"),
          tags,
          ...(sourceRef ? { source_ref: sourceRef } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        details?: ContextValidationIssue[];
      } | null;
      if (!response.ok) {
        setNotice(
          payload?.details?.[0]?.message ??
            (payload?.error === "no_active_cycle"
              ? "No active reset cycle. Context was not created."
              : "Context did not save. Check the fields and try again."),
        );
        return;
      }

      formRef.current?.reset();
      setNotice("Context saved to this reset cycle.");
      router.refresh();
    } catch {
      setNotice("Context did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Add context</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Save one concise summary, decision, preference, snapshot, or report.
      </p>
      <form className="mt-5 grid min-w-0 gap-4" onSubmit={submit} ref={formRef}>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="min-w-0 space-y-2 text-sm">
            <span className="font-medium">Kind</span>
            <select
              className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2"
              disabled={disabled || saving}
              name="kind"
            >
              {CONTEXT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {formatEnum(kind)}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 space-y-2 text-sm">
            <span className="font-medium">Domain</span>
            <select
              className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2"
              disabled={disabled || saving}
              name="domain"
            >
              {CONTEXT_DOMAINS.map((domain) => (
                <option key={domain} value={domain}>
                  {formatEnum(domain)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="min-w-0 space-y-2 text-sm">
          <span className="font-medium">Title</span>
          <input
            className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2"
            disabled={disabled || saving}
            maxLength={160}
            name="title"
            required
          />
        </label>
        <label className="min-w-0 space-y-2 text-sm">
          <span className="font-medium">Summary</span>
          <textarea
            className="min-h-32 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2"
            disabled={disabled || saving}
            maxLength={4000}
            name="summary"
            required
          />
        </label>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="min-w-0 space-y-2 text-sm">
            <span className="font-medium">Tags</span>
            <input
              className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2"
              disabled={disabled || saving}
              name="tags"
              placeholder="work, continuity"
            />
            <span className="block text-xs text-[var(--muted)]">
              Comma-separated; up to 10, 40 characters each.
            </span>
          </label>
          <label className="min-w-0 space-y-2 text-sm">
            <span className="font-medium">Safe source reference</span>
            <input
              className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2"
              disabled={disabled || saving}
              maxLength={500}
              name="source_ref"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={disabled || saving}
            type="submit"
          >
            {saving ? "Saving…" : "Save context"}
          </button>
          {disabled ? (
            <span className="text-sm text-[var(--muted)]">
              Start an active reset cycle before adding context.
            </span>
          ) : null}
          <span aria-live="polite" className="text-sm text-[var(--muted)]">
            {notice}
          </span>
        </div>
      </form>
    </section>
  );
}

function ContextFilters({ filters }: { filters: ContextFilterValues }) {
  return (
    <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Search and filter</h2>
        <Link className="text-sm underline" href="/context">
          Clear filters
        </Link>
      </div>
      <form action="/context" className="mt-5 grid min-w-0 gap-4" method="get">
        <label className="min-w-0 space-y-2 text-sm">
          <span className="font-medium">Title or summary</span>
          <input
            className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2"
            defaultValue={filters.q}
            maxLength={200}
            name="q"
            type="search"
          />
        </label>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="min-w-0 space-y-2 text-sm">
            <span className="font-medium">Domain</span>
            <select
              className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2"
              defaultValue={filters.domain ?? ""}
              name="domain"
            >
              <option value="">All domains</option>
              {CONTEXT_DOMAINS.map((domain) => (
                <option key={domain} value={domain}>
                  {formatEnum(domain)}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 space-y-2 text-sm">
            <span className="font-medium">Kind</span>
            <select
              className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2"
              defaultValue={filters.kind ?? ""}
              name="kind"
            >
              <option value="">All kinds</option>
              {CONTEXT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {formatEnum(kind)}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 space-y-2 text-sm">
            <span className="font-medium">Tag</span>
            <input
              className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2"
              defaultValue={filters.tag}
              maxLength={40}
              name="tag"
            />
          </label>
          <label className="min-w-0 space-y-2 text-sm">
            <span className="font-medium">Pin state</span>
            <select
              className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2"
              defaultValue={filters.pinned ?? ""}
              name="pinned"
            >
              <option value="">All items</option>
              <option value="pinned">Pinned</option>
              <option value="unpinned">Unpinned</option>
            </select>
          </label>
        </div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="min-w-0 space-y-2 text-sm">
            <span className="font-medium">Created on or after (UTC)</span>
            <input
              className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2"
              defaultValue={filters.createdFrom}
              name="created_from"
              type="date"
            />
          </label>
          <label className="min-w-0 space-y-2 text-sm">
            <span className="font-medium">Created on or before (UTC)</span>
            <input
              className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2"
              defaultValue={filters.createdTo}
              name="created_to"
              type="date"
            />
          </label>
        </div>
        <button
          className="w-fit rounded-lg border border-[var(--accent)] px-4 py-2 text-sm font-semibold"
          type="submit"
        >
          Apply filters
        </button>
      </form>
    </section>
  );
}

function ContextCard({ item }: { item: ContextItemDto }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const pinned = item.pinnedAt !== null;

  async function setPinned() {
    setSaving(true);
    try {
      const response = await fetch(`/api/context/${item.id}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !pinned }),
      });
      if (response.ok) router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="min-w-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap gap-2 text-xs text-[var(--muted)]">
            <span>{formatEnum(item.kind)}</span>
            <span>·</span>
            <span>{formatEnum(item.domain)}</span>
            <span>·</span>
            <span>{item.sourceType === "MANUAL" ? "Manual" : "Imported"}</span>
          </div>
          <h2 className="mt-2 break-words text-xl font-semibold">
            {item.title}
          </h2>
        </div>
        <button
          aria-label={`${pinned ? "Unpin" : "Pin"} ${item.title}`}
          className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-60"
          disabled={saving}
          onClick={setPinned}
          type="button"
        >
          {saving ? "Saving…" : pinned ? "Unpin" : "Pin"}
        </button>
      </div>
      <p className="mt-4 break-words whitespace-pre-wrap text-[var(--muted)]">
        {item.summary}
      </p>
      {item.tags.length ? (
        <ul aria-label="Tags" className="mt-4 flex min-w-0 flex-wrap gap-2">
          {item.tags.map((tag) => (
            <li
              className="max-w-full break-words rounded-lg bg-[var(--surface-alt)] px-2 py-1 text-xs"
              key={tag.toLowerCase()}
            >
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 min-w-0 space-y-1 text-xs text-[var(--muted)]">
        <p>Created {formatTimestamp(item.createdAt)}</p>
        {item.sourceRef ? (
          <p className="break-words">Source: {item.sourceRef}</p>
        ) : null}
      </div>
    </article>
  );
}

export function ContextLibraryPage({
  library,
  queryIssues,
}: {
  library: ContextLibrary | null;
  queryIssues: ContextValidationIssue[];
}) {
  if (!library) {
    return (
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <h1 className="text-2xl font-semibold">
          Context filters are not valid.
        </h1>
        <p className="mt-3 break-words text-[var(--muted)]">
          {queryIssues[0]?.message ?? "Clear the filters and try again."}
        </p>
        <Link className="mt-4 inline-block underline" href="/context">
          Clear filters
        </Link>
      </section>
    );
  }

  const noCycle = library.status === "no_cycle";
  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <section className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        {library.status === "ready" ? (
          <p className="break-words text-sm text-[var(--muted)]">
            {library.cycleName}
          </p>
        ) : null}
        <h1 className="mt-2 break-words text-3xl font-semibold sm:text-4xl">
          Context library
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Curated, user-visible memory for this active reset cycle.
        </p>
      </section>

      <ContextPacketExport disabled={noCycle} />

      {noCycle ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="text-xl font-semibold">No active reset cycle.</h2>
          <p className="mt-3 text-[var(--muted)]">
            Context stays cycle-specific. Start an active cycle before adding or
            viewing context.
          </p>
        </section>
      ) : null}

      <ManualContextForm disabled={noCycle} />

      {library.status === "ready" ? (
        <>
          <ContextFilters filters={library.filters} />
          {library.items.length ? (
            <section aria-label="Context results" className="min-w-0 space-y-4">
              {library.items.map((item) => (
                <ContextCard item={item} key={item.id} />
              ))}
              {library.nextCursor ? (
                <Link
                  className="inline-block rounded-lg border border-[var(--accent)] px-4 py-2 text-sm font-semibold"
                  href={nextPageHref(library.filters, library.nextCursor)}
                >
                  Next page
                </Link>
              ) : null}
            </section>
          ) : library.hasStoredItems ? (
            <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
              <h2 className="text-xl font-semibold">No context matches.</h2>
              <p className="mt-3 text-[var(--muted)]">
                Stored context is unchanged. Clear or adjust filters to see it.
              </p>
              <Link className="mt-4 inline-block underline" href="/context">
                Clear filters
              </Link>
            </section>
          ) : (
            <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
              <h2 className="text-xl font-semibold">No context saved yet.</h2>
              <p className="mt-3 text-[var(--muted)]">
                Add a concise item above or explicitly import one through the
                GPT import boundary.
              </p>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
