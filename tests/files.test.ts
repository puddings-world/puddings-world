import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bearerSecret,
  canUpload,
  cleanFileName,
  completeUploadXml,
  contentDisposition,
  isId,
  MAX_PARTS,
  MIB,
  MIN_PART_BYTES,
  objectKey,
  parseParts,
  parseUploadRequest,
  partCount,
  partRange,
  partSizeFor,
  uploadIdFromXml,
  formatBytes,
} from "../lib/files/model";
import { hashToken, newId, newTokenSecret } from "../lib/files/secrets";
import { type FilesApi, uploadFile } from "../lib/files/upload-client";
import { publicFile } from "../lib/files/view";

const COL = "AbCdEfGh12345678";

test("ids are 16 base62 characters and checked strictly", () => {
  const id = newId();
  assert.ok(isId(id));
  assert.equal(isId("short"), false);
  assert.equal(isId("../../etc/passwd!"), false);
  assert.equal(objectKey(COL, id), `c/${COL}/${id}`);
});

test("file names lose paths and characters Windows refuses", () => {
  assert.equal(cleanFileName("C:\\Users\\me\\資料集 v2.zip"), "資料集 v2.zip");
  assert.equal(cleanFileName("../../evil?.bin"), "evil_.bin");
  assert.equal(cleanFileName("  .hidden. "), "hidden");
  assert.equal(cleanFileName("..."), null);
  assert.equal(cleanFileName(42), null);
});

test("downloads keep a non-ASCII name with an ASCII fallback", () => {
  assert.equal(
    contentDisposition("白內障 data.zip"),
    `attachment; filename="___ data.zip"; filename*=UTF-8''%E7%99%BD%E5%85%A7%E9%9A%9C%20data.zip`,
  );
  assert.match(contentDisposition(`a"b.txt`), /filename="a_b.txt"/);
});

test("part sizes stay at least 16 MiB and under the part limit", () => {
  assert.equal(partSizeFor(0), MIN_PART_BYTES);
  assert.equal(partSizeFor(1024 * 1024 * MIB), Math.ceil(1024 * 1024 / MAX_PARTS) * MIB);
  const huge = 200 * 1024 * MIB;
  assert.ok(partCount(huge, partSizeFor(huge)) <= MAX_PARTS);
  assert.equal(partCount(0, MIN_PART_BYTES), 1);
  assert.deepEqual(partRange(2, 40 * MIB, 16 * MIB), [16 * MIB, 32 * MIB]);
  assert.deepEqual(partRange(3, 40 * MIB, 16 * MIB), [32 * MIB, 40 * MIB]);
});

test("upload requests are validated with errors that say what to fix", () => {
  assert.deepEqual(parseUploadRequest({ collectionId: COL, name: "a.zip", size: 10, sha256: "AB".repeat(32) }), {
    collectionId: COL,
    name: "a.zip",
    size: 10,
    type: "application/octet-stream",
    sha256: "ab".repeat(32),
  });
  assert.deepEqual(parseUploadRequest({ collectionId: "x", name: "a", size: 1 }), {
    error: "collectionId must be a collection id.",
  });
  assert.deepEqual(parseUploadRequest({ collectionId: COL, name: "a", size: -1 }), {
    error: "size must be the file size in bytes.",
  });
  assert.match((parseUploadRequest({ collectionId: COL, name: "a", size: 2 ** 50 }) as { error: string }).error, /limited/);
});

test("completion needs every part once, each with an ETag", () => {
  assert.deepEqual(
    parseParts([{ part: 2, etag: "b" }, { part: 1, etag: "a" }], 2),
    [{ part: 1, etag: "a" }, { part: 2, etag: "b" }],
  );
  assert.equal(parseParts([{ part: 1, etag: "a" }], 2), null);
  assert.equal(parseParts([{ part: 1, etag: "a" }, { part: 1, etag: "b" }], 2), null);
  assert.equal(parseParts([{ part: 1, etag: "" }], 1), null);
  assert.equal(parseParts([{ part: 3, etag: "a" }], 1), null);
});

test("S3 multipart XML: upload id out, part list in", () => {
  assert.equal(uploadIdFromXml("<x><UploadId>abc-1</UploadId></x>"), "abc-1");
  assert.equal(uploadIdFromXml("<x/>"), null);
  assert.equal(
    completeUploadXml([{ part: 1, etag: "e1" }, { part: 2, etag: '"e2"' }]),
    '<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>"e1"</ETag></Part><Part><PartNumber>2</PartNumber><ETag>"e2"</ETag></Part></CompleteMultipartUpload>',
  );
});

test("app tokens: only well-formed bearer secrets, stored as hashes, scoped to collections", () => {
  const secret = newTokenSecret();
  assert.equal(bearerSecret(`Bearer ${secret}`), secret);
  assert.equal(bearerSecret("Bearer nope"), null);
  assert.equal(bearerSecret(null), null);
  assert.match(hashToken(secret), /^[0-9a-f]{64}$/);
  assert.notEqual(hashToken(secret), secret);
  const token = { id: newId(), name: "paperfact", collections: [COL], createdAt: "" };
  assert.equal(canUpload({ kind: "app", token }, COL), true);
  assert.equal(canUpload({ kind: "app", token }, newId()), false);
  assert.equal(canUpload({ kind: "app", token: { ...token, collections: "*" } }, newId()), true);
  assert.equal(canUpload({ kind: "admin" }, newId()), true);
});

test("link holders see no upload ids, uploaders or keys", () => {
  const view = publicFile({
    id: "F".repeat(16),
    collectionId: COL,
    name: "a.zip",
    size: 3,
    type: "application/zip",
    status: "ready",
    uploadId: "secret-upload",
    partSize: MIN_PART_BYTES,
    createdAt: "2026-10-26",
    readyAt: "2026-10-26",
    uploader: "paperfact",
  });
  assert.deepEqual(view, {
    id: "F".repeat(16),
    name: "a.zip",
    size: 3,
    type: "application/zip",
    readyAt: "2026-10-26",
    url: `/dl/${"F".repeat(16)}`,
  });
});

test("byte sizes read like a file manager", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(3 * 1024 * MIB), "3.0 GB");
});

function fakeApi(partSize: number, count: number) {
  const calls = { start: 0, signed: [] as number[][], completed: null as null | { part: number; etag: string }[] };
  const api: FilesApi = {
    async start() {
      calls.start++;
      return { fileId: "F".repeat(16), partSize, partCount: count };
    },
    async urls(_id, parts) {
      calls.signed.push(parts);
      return Object.fromEntries(parts.map((p) => [String(p), `https://r2/${p}?try=${calls.signed.length}`]));
    },
    async complete(_id, parts) {
      calls.completed = parts;
    },
  };
  return { api, calls };
}

test("an upload sends every part and completes with their ETags in order", async () => {
  const { api, calls } = fakeApi(4, 3);
  const bodies: number[] = [];
  const progress: number[] = [];
  await uploadFile(
    { collectionId: COL, name: "a", size: 10 },
    {
      api,
      read: async (s, e) => new Uint8Array(e - s),
      put: async (url, body) => {
        bodies.push((body as Uint8Array).length);
        return `etag-${url.split("/")[3].split("?")[0]}`;
      },
      onProgress: (sent) => progress.push(sent),
      concurrency: 1,
    },
  );
  assert.equal(calls.start, 1);
  assert.deepEqual(bodies, [4, 4, 2]);
  assert.deepEqual(calls.signed, [[1, 2, 3]]);
  assert.deepEqual(calls.completed, [
    { part: 1, etag: "etag-1" },
    { part: 2, etag: "etag-2" },
    { part: 3, etag: "etag-3" },
  ]);
  assert.deepEqual(progress, [0, 4, 8, 10]);
});

test("a failed part retries with a fresh URL", async () => {
  const { api, calls } = fakeApi(4, 1);
  let tries = 0;
  await uploadFile(
    { collectionId: COL, name: "a", size: 4 },
    {
      api,
      read: async () => new Uint8Array(4),
      put: async (url) => {
        tries++;
        if (tries === 1) throw new Error("network");
        assert.match(url, /try=2/);
        return "e";
      },
    },
  );
  assert.equal(tries, 2);
  assert.deepEqual(calls.signed, [[1], [1]]);
});

test("a part that keeps failing stops the upload without completing it", async () => {
  const { api, calls } = fakeApi(4, 1);
  await assert.rejects(
    uploadFile(
      { collectionId: COL, name: "a", size: 4 },
      { api, read: async () => new Uint8Array(4), put: async () => "", retries: 1 },
    ),
    /Part 1 failed after 2 tries: .*ETag/,
  );
  assert.equal(calls.completed, null);
});

test("a resumed upload skips the parts R2 already has", async () => {
  const { api, calls } = fakeApi(4, 3);
  const sent: number[] = [];
  await uploadFile(
    { collectionId: COL, name: "a", size: 10 },
    {
      api,
      resume: { fileId: "F".repeat(16), partSize: 4, partCount: 3, done: { "1": "old-1", "3": "old-3" } },
      read: async (s, e) => new Uint8Array(e - s),
      put: async (url) => {
        sent.push(Number(url.split("/")[3].split("?")[0]));
        return "new-2";
      },
    },
  );
  assert.equal(calls.start, 0);
  assert.deepEqual(sent, [2]);
  assert.deepEqual(calls.completed, [
    { part: 1, etag: "old-1" },
    { part: 2, etag: "new-2" },
    { part: 3, etag: "old-3" },
  ]);
});
