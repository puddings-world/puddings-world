// What pudding-backend stores: one JSON record per object at
// <app>/raw/<kind>/YYYY/MM/DD/HHMMSS-<id12>.json (UTC). The cloud copy expires
// after 90 days, so the bucket is "what arrived recently", per app and kind.

export type InboxKey = {
  key: string;
  app: string;
  kind: string;
  /** ISO instant parsed from the path, e.g. 2026-10-26T13:51:38Z. */
  receivedAt: string;
  id: string;
  size: number;
};

export type InboxRecord = {
  id: string;
  app: string;
  kind: string;
  received_at: string;
  user?: string;
  user_agent?: string;
  body: unknown;
};

export type ListedObject = { key: string; size: number };

export type KindSummary = { kind: string; total: number; last7: number };
export type AppSummary = {
  app: string;
  total: number;
  last7: number;
  kinds: KindSummary[];
  /** Newest first. */
  latest: InboxKey[];
};

const KEY =
  /^([a-z0-9-]+)\/raw\/([a-z0-9-]+)\/(\d{4})\/(\d{2})\/(\d{2})\/(\d{2})(\d{2})(\d{2})-([0-9a-f]+)\.json$/;

export function parseKey(key: string, size = 0): InboxKey | null {
  const m = KEY.exec(key);
  if (!m) return null;
  const [, app, kind, y, mo, d, hh, mm, ss, id] = m;
  return { key, app, kind, receivedAt: `${y}-${mo}-${d}T${hh}:${mm}:${ss}Z`, id, size };
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** One page of an S3-style ListObjectsV2 response. */
export function parseListXml(xml: string): { objects: ListedObject[]; next: string | null } {
  const objects: ListedObject[] = [];
  for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = /<Key>([\s\S]*?)<\/Key>/.exec(m[1])?.[1];
    if (!key) continue;
    const size = Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1] ?? 0);
    objects.push({ key: unescapeXml(key), size });
  }
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const token = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1];
  return { objects, next: truncated && token ? unescapeXml(token) : null };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Per-app counts and newest records, apps with the newest arrival first. */
export function summarize(keys: InboxKey[], now: Date, latestN = 20): AppSummary[] {
  const weekAgo = now.getTime() - 7 * DAY_MS;
  const byApp = new Map<string, InboxKey[]>();
  for (const k of keys) byApp.set(k.app, [...(byApp.get(k.app) ?? []), k]);
  const apps: AppSummary[] = [];
  for (const [app, items] of byApp) {
    items.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : a.receivedAt > b.receivedAt ? -1 : 0));
    const kinds = new Map<string, KindSummary>();
    let last7 = 0;
    for (const k of items) {
      const recent = Date.parse(k.receivedAt) >= weekAgo;
      if (recent) last7++;
      const row = kinds.get(k.kind) ?? { kind: k.kind, total: 0, last7: 0 };
      row.total++;
      if (recent) row.last7++;
      kinds.set(k.kind, row);
    }
    apps.push({
      app,
      total: items.length,
      last7,
      kinds: [...kinds.values()].sort((a, b) => b.total - a.total || a.kind.localeCompare(b.kind)),
      latest: items.slice(0, latestN),
    });
  }
  return apps.sort((a, b) => (a.latest[0].receivedAt < b.latest[0].receivedAt ? 1 : -1));
}

export const BODY_PREVIEW_CHARS = 2000;

/** The record body as readable JSON, cut off so one huge record cannot flood the page. */
export function bodyText(record: InboxRecord): string {
  const text = typeof record.body === "string" ? record.body : JSON.stringify(record.body, null, 2);
  return text.length > BODY_PREVIEW_CHARS ? `${text.slice(0, BODY_PREVIEW_CHARS)}\n… (${text.length} chars)` : text;
}

/** A record read back from the bucket; anything else is reported as malformed, not thrown. */
export function parseRecord(raw: string): InboxRecord | null {
  try {
    const v = JSON.parse(raw) as Partial<InboxRecord>;
    if (!v || typeof v !== "object" || typeof v.id !== "string" || typeof v.received_at !== "string") return null;
    return v as InboxRecord;
  } catch {
    return null;
  }
}
