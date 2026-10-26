// Uploads one file through the /api/files endpoints: the site signs, the
// bytes go straight to R2 part by part. Runs in the browser and in Node.

import { type DonePart, partCount, partRange } from "./model";

export type FileMeta = {
  collectionId: string;
  name: string;
  size: number;
  type?: string;
  sha256?: string;
  note?: string;
};

export type StartedUpload = { fileId: string; partSize: number; partCount: number };

/** Enough to pick an upload back up: which parts R2 already holds. */
export type UploadState = StartedUpload & { done: Record<string, string> };

export type FilesApi = {
  start(meta: FileMeta): Promise<StartedUpload>;
  urls(fileId: string, parts: number[]): Promise<Record<string, string>>;
  complete(fileId: string, parts: DonePart[]): Promise<unknown>;
};

export type UploadOptions = {
  api: FilesApi;
  /** Bytes [start, end) of the file. */
  read(start: number, end: number): Promise<Blob | Uint8Array>;
  /** PUTs a part to a signed URL and returns R2's ETag. */
  put(url: string, body: Blob | Uint8Array): Promise<string>;
  resume?: UploadState;
  onState?(state: UploadState): void;
  onProgress?(sentBytes: number, totalBytes: number): void;
  concurrency?: number;
  retries?: number;
  /** URLs fetched per signing call. */
  batch?: number;
};

export const DEFAULT_CONCURRENCY = 4;
export const DEFAULT_RETRIES = 4;

/**
 * Sends every part not yet in `resume.done`, retrying each a few times
 * (with a fresh URL), then asks the site to stitch them together.
 */
export async function uploadFile(meta: FileMeta, opts: UploadOptions): Promise<UploadState> {
  const { api } = opts;
  const started = opts.resume ?? { ...(await api.start(meta)), done: {} };
  const state: UploadState = { ...started, done: { ...started.done } };
  const total = partCount(meta.size, state.partSize);
  const pending = Array.from({ length: total }, (_, i) => i + 1).filter((p) => !state.done[p]);
  const batch = opts.batch ?? 20;
  const retries = opts.retries ?? DEFAULT_RETRIES;

  const bytesOf = (p: number) => {
    const [start, end] = partRange(p, meta.size, state.partSize);
    return end - start;
  };
  let sent = Object.keys(state.done).reduce((n, p) => n + bytesOf(Number(p)), 0);
  opts.onState?.(state);
  opts.onProgress?.(sent, meta.size);

  const urls = new Map<number, string>();
  async function urlFor(part: number, fresh: boolean): Promise<string> {
    if (fresh || !urls.has(part)) {
      const wanted = fresh ? [part] : pending.filter((p) => p >= part && !urls.has(p)).slice(0, batch);
      const got = await api.urls(state.fileId, wanted.length ? wanted : [part]);
      for (const [p, u] of Object.entries(got)) urls.set(Number(p), u);
    }
    const url = urls.get(part);
    if (!url) throw new Error(`No upload URL for part ${part}.`);
    return url;
  }

  async function send(part: number) {
    const [start, end] = partRange(part, meta.size, state.partSize);
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const etag = await opts.put(await urlFor(part, attempt > 0), await opts.read(start, end));
        if (!etag) throw new Error("R2 returned no ETag (is ETag exposed in the bucket's CORS rule?)");
        state.done[part] = etag;
        sent += end - start;
        opts.onState?.(state);
        opts.onProgress?.(sent, meta.size);
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(`Part ${part} failed after ${retries + 1} tries: ${String(lastError)}`);
  }

  const queue = [...pending];
  const workers = Array.from({ length: Math.min(opts.concurrency ?? DEFAULT_CONCURRENCY, queue.length) }, async () => {
    for (let part = queue.shift(); part !== undefined; part = queue.shift()) await send(part);
  });
  await Promise.all(workers);

  const parts = Object.entries(state.done).map(([part, etag]) => ({ part: Number(part), etag }));
  await api.complete(state.fileId, parts.sort((a, b) => a.part - b.part));
  return state;
}

/** FilesApi over HTTP; `headers` carries the app token when not signed in. */
export function httpFilesApi(base: string, headers: Record<string, string> = {}): FilesApi {
  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(json.error ?? `${path}: HTTP ${res.status}`);
    return json;
  }
  return {
    start: (meta) => post<StartedUpload>("/api/files/uploads", meta),
    urls: async (fileId, parts) =>
      (await post<{ urls: Record<string, string> }>(`/api/files/uploads/${fileId}/parts`, { parts })).urls,
    complete: (fileId, parts) => post(`/api/files/uploads/${fileId}/complete`, { parts }),
  };
}

/** PUT with fetch; the ETag header must be exposed by the bucket's CORS rule in browsers. */
export async function fetchPut(url: string, body: Blob | Uint8Array): Promise<string> {
  const res = await fetch(url, { method: "PUT", body: body as BodyInit });
  if (!res.ok) throw new Error(`PUT part: HTTP ${res.status}`);
  return res.headers.get("etag") ?? "";
}
