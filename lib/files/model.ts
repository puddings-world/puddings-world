// Shared files: collections of large downloads kept in Cloudflare R2 and
// reachable only through their unguessable links. Everything here is pure
// and safe to import in the browser; ids and token hashing live in secrets.ts.

export type Collection = {
  id: string;
  title: string;
  note?: string;
  createdAt: string;
};

export type FileStatus = "uploading" | "ready";

export type FileRecord = {
  id: string;
  collectionId: string;
  name: string;
  size: number;
  type: string;
  sha256?: string;
  note?: string;
  status: FileStatus;
  uploadId?: string;
  partSize: number;
  createdAt: string;
  readyAt?: string;
  /** "admin" or the name of the app token that uploaded it. */
  uploader: string;
};

/** A key an app uses to upload; only its hash is stored. */
export type AppToken = {
  id: string;
  name: string;
  /** Collection ids it may upload to, or "*" for all. */
  collections: string[] | "*";
  createdAt: string;
};

export type Requester = { kind: "admin" } | { kind: "app"; token: AppToken };

export const TOKEN_PREFIX = "pwf_";
export const MIB = 1024 * 1024;
export const MIN_PART_BYTES = 16 * MIB;
/** R2 allows 10,000 parts; stay under it with room to spare. */
export const MAX_PARTS = 9000;
export const MAX_FILE_BYTES = 200 * 1024 * MIB;
export const MAX_NAME_LENGTH = 200;
export const DOWNLOAD_URL_TTL_SEC = 10 * 60;
export const UPLOAD_URL_TTL_SEC = 60 * 60;

export const ID_PATTERN = /^[0-9A-Za-z]{16}$/;

export function isId(raw: unknown): raw is string {
  return typeof raw === "string" && ID_PATTERN.test(raw);
}

/** Object keys never carry the file name, so no name can break the S3 path. */
export function objectKey(collectionId: string, fileId: string): string {
  return `c/${collectionId}/${fileId}`;
}

/**
 * A file name safe to show and to save: no path parts, control characters
 * or characters Windows refuses, trimmed of dots and spaces at the ends.
 */
export function cleanFileName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .slice(0, MAX_NAME_LENGTH);
  return cleaned || null;
}

/** `Content-Disposition` that saves under the original (possibly non-ASCII) name. */
export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const utf8 = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

/** Part size for a multipart upload: at least 16 MiB, whole MiB, under MAX_PARTS. */
export function partSizeFor(size: number): number {
  const needed = Math.ceil(size / MAX_PARTS);
  return Math.max(MIN_PART_BYTES, Math.ceil(needed / MIB) * MIB);
}

export function partCount(size: number, partSize: number): number {
  return Math.max(1, Math.ceil(size / partSize));
}

/** Byte range [start, end) of a 1-based part. */
export function partRange(part: number, size: number, partSize: number): [number, number] {
  const start = (part - 1) * partSize;
  return [start, Math.min(size, start + partSize)];
}

export type UploadRequest = {
  collectionId: string;
  name: string;
  size: number;
  type: string;
  sha256?: string;
  note?: string;
};

/** Validates an upload request body; the error says what to fix. */
export function parseUploadRequest(body: unknown): UploadRequest | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isId(b.collectionId)) return { error: "collectionId must be a collection id." };
  const name = cleanFileName(b.name);
  if (!name) return { error: "name is required." };
  const size = b.size;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0) {
    return { error: "size must be the file size in bytes." };
  }
  if (size > MAX_FILE_BYTES) return { error: `Files are limited to ${MAX_FILE_BYTES / 1024 / MIB} GiB.` };
  const type = typeof b.type === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(b.type) ? b.type : "application/octet-stream";
  const sha256 = typeof b.sha256 === "string" && /^[0-9a-f]{64}$/i.test(b.sha256) ? b.sha256.toLowerCase() : undefined;
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 500) : undefined;
  return { collectionId: b.collectionId, name, size, type, ...(sha256 ? { sha256 } : {}), ...(note ? { note } : {}) };
}

export type DonePart = { part: number; etag: string };

/** Checks the parts a client says it uploaded: every part once, in range, with an ETag. */
export function parseParts(raw: unknown, expected: number): DonePart[] | null {
  if (!Array.isArray(raw) || raw.length !== expected) return null;
  const parts = raw.map((p) => ({ part: Number(p?.part), etag: String(p?.etag ?? "") }));
  const seen = new Set<number>();
  for (const p of parts) {
    if (!Number.isInteger(p.part) || p.part < 1 || p.part > expected || seen.has(p.part) || !p.etag) return null;
    seen.add(p.part);
  }
  return parts.sort((a, b) => a.part - b.part);
}

export function completeUploadXml(parts: DonePart[]): string {
  const body = parts
    .map((p) => {
      const etag = p.etag.startsWith('"') ? p.etag : `"${p.etag}"`;
      return `<Part><PartNumber>${p.part}</PartNumber><ETag>${etag.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</ETag></Part>`;
    })
    .join("");
  return `<CompleteMultipartUpload>${body}</CompleteMultipartUpload>`;
}

export function uploadIdFromXml(xml: string): string | null {
  return xml.match(/<UploadId>([^<]+)<\/UploadId>/)?.[1] ?? null;
}

/** The bearer secret from an `Authorization` header, if it looks like ours. */
export function bearerSecret(header: string | null): string | null {
  const m = header?.match(/^Bearer\s+(pwf_[0-9A-Za-z]{40})\s*$/);
  return m ? m[1] : null;
}

export function canUpload(requester: Requester, collectionId: string): boolean {
  if (requester.kind === "admin") return true;
  const { collections } = requester.token;
  return collections === "*" || collections.includes(collectionId);
}

export function uploaderName(requester: Requester): string {
  return requester.kind === "admin" ? "admin" : requester.token.name;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}
