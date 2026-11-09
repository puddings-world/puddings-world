import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BODY_PREVIEW_CHARS,
  bodyText,
  parseKey,
  parseListXml,
  parseRecord,
  summarize,
} from "../lib/inbox/model";

const key = (app: string, kind: string, stamp: string, id = "0123456789ab") => {
  const [day, time] = stamp.split("T");
  return `${app}/raw/${kind}/${day.replaceAll("-", "/")}/${time.replaceAll(":", "")}-${id}.json`;
};

test("record keys yield app, kind and the UTC instant; anything else is ignored", () => {
  const k = parseKey("mapkit/raw/feedback/2026/10/26/135138-e022d78ad3b8.json", 328);
  assert.deepEqual(k, {
    key: "mapkit/raw/feedback/2026/10/26/135138-e022d78ad3b8.json",
    app: "mapkit",
    kind: "feedback",
    receivedAt: "2026-10-26T13:51:38Z",
    id: "e022d78ad3b8",
    size: 328,
  });
  assert.equal(parseKey("mapkit/raw/feedback/notes.txt"), null);
  assert.equal(parseKey("_sync/log.jsonl"), null);
});

test("a ListObjectsV2 page gives keys, sizes and the continuation token only when truncated", () => {
  const xml = `<?xml version="1.0"?><ListBucketResult>
    <IsTruncated>true</IsTruncated><NextContinuationToken>tok&amp;1</NextContinuationToken>
    <Contents><Key>a/raw/x/2026/10/26/000000-0123456789ab.json</Key><Size>12</Size></Contents>
    <Contents><Key>b/raw/y/2026/10/26/000001-0123456789ab.json</Key><Size>7</Size></Contents>
  </ListBucketResult>`;
  assert.deepEqual(parseListXml(xml), {
    objects: [
      { key: "a/raw/x/2026/10/26/000000-0123456789ab.json", size: 12 },
      { key: "b/raw/y/2026/10/26/000001-0123456789ab.json", size: 7 },
    ],
    next: "tok&1",
  });
  const last = `<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>k</Key><Size>1</Size></Contents></ListBucketResult>`;
  assert.equal(parseListXml(last).next, null);
});

test("apps are summarised with 7-day counts per kind, newest arrival first", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  const keys = [
    key("mapkit", "feedback", "2026-11-08T10:00:00"),
    key("mapkit", "feedback", "2026-10-20T10:00:00"),
    key("mapkit", "error", "2026-11-09T01:00:00"),
    key("paperfact", "feedback", "2026-11-09T05:00:00"),
  ]
    .map((k) => parseKey(k))
    .filter((k) => k !== null);
  const [first, second] = summarize(keys, now, 2);
  assert.equal(first.app, "paperfact");
  assert.equal(second.app, "mapkit");
  assert.deepEqual(
    { total: second.total, last7: second.last7 },
    { total: 3, last7: 2 },
  );
  assert.deepEqual(second.kinds, [
    { kind: "feedback", total: 2, last7: 1 },
    { kind: "error", total: 1, last7: 1 },
  ]);
  assert.deepEqual(
    second.latest.map((k) => k.receivedAt),
    ["2026-11-09T01:00:00Z", "2026-11-08T10:00:00Z"],
  );
});

test("records are parsed defensively and long bodies are cut for display", () => {
  assert.equal(parseRecord("not json"), null);
  assert.equal(parseRecord(JSON.stringify({ body: {} })), null);
  const rec = parseRecord(
    JSON.stringify({ id: "x", app: "mapkit", kind: "feedback", received_at: "2026-11-09T01:00:00Z", body: { rating: 4 } }),
  );
  assert.ok(rec);
  assert.equal(bodyText(rec), '{\n  "rating": 4\n}');
  const long = { ...rec, body: "y".repeat(BODY_PREVIEW_CHARS + 5) };
  assert.ok(bodyText(long).endsWith(`… (${BODY_PREVIEW_CHARS + 5} chars)`));
});
