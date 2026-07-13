export const CONTEXT_KINDS = [
  "CONVERSATION_SUMMARY",
  "TASK_SUMMARY",
  "DECISION",
  "PREFERENCE",
  "DAILY_SUMMARY",
  "WEEKLY_SNAPSHOT",
  "CYCLE_REPORT",
  "CONTEXT_SNAPSHOT",
] as const;

export const CONTEXT_DOMAINS = [
  "BODY",
  "MOOD",
  "DIGITAL",
  "LEARNING",
  "WORK",
  "SYSTEM",
  "ENVIRONMENT",
  "SOCIAL",
  "OTHER",
] as const;

export type ContextKind = (typeof CONTEXT_KINDS)[number];
export type ContextDomain = (typeof CONTEXT_DOMAINS)[number];
export type ContextSourceType = "MANUAL" | "IMPORT";

export type ContextItemDto = {
  id: string;
  title: string;
  summary: string;
  kind: ContextKind;
  domain: ContextDomain;
  tags: string[];
  sourceType: ContextSourceType;
  sourceRef: string | null;
  pinnedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContextFilterValues = {
  q?: string;
  domain?: ContextDomain;
  kind?: ContextKind;
  tag?: string;
  pinned?: "pinned" | "unpinned";
  createdFrom?: string;
  createdTo?: string;
  cursor?: string;
};

export type ContextLibrary =
  | {
      status: "no_cycle";
      filters: ContextFilterValues;
    }
  | {
      status: "ready";
      cycleName: string;
      filters: ContextFilterValues;
      hasStoredItems: boolean;
      items: ContextItemDto[];
      nextCursor: string | null;
    };

export function normalizeContextTags(tags: readonly string[]): string[] {
  const displayByNormalized = new Map<string, string>();

  for (const value of tags) {
    const display = value.trim();
    const normalized = display.toLowerCase();
    if (!displayByNormalized.has(normalized)) {
      displayByNormalized.set(normalized, display);
    }
  }

  return [...displayByNormalized.values()];
}

export function normalizeContextTag(value: string): string {
  return value.trim().toLowerCase();
}
