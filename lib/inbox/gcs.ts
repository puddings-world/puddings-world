// Read-only view of the pudding-backend inbox bucket through GCS's S3-compatible
// XML API, signed with an HMAC key that belongs to a view-only service account
// (`python -m pudding_backend reader` in the pudding-backend repo issues it).

import { AwsClient } from "aws4fetch";
import { type InboxKey, type InboxRecord, parseKey, parseListXml, parseRecord } from "./model";

export type Inbox = { client: AwsClient; base: string; bucket: string };

let cached: Inbox | null = null;

/** Null until PUDDING_INBOX_BUCKET, PUDDING_INBOX_ACCESS_KEY and PUDDING_INBOX_SECRET are set. */
export function getInbox(): Inbox | null {
  if (cached) return cached;
  const bucket = process.env.PUDDING_INBOX_BUCKET;
  const accessKeyId = process.env.PUDDING_INBOX_ACCESS_KEY;
  const secretAccessKey = process.env.PUDDING_INBOX_SECRET;
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  cached = {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" }),
    base: `https://storage.googleapis.com/${bucket}`,
    bucket,
  };
  return cached;
}

async function call(inbox: Inbox, url: URL): Promise<Response> {
  const res = await inbox.client.fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error(`inbox GET ${url.pathname}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

/** Every record key under `prefix` (all apps when empty), following list pages. */
export async function listKeys(inbox: Inbox, prefix = ""): Promise<InboxKey[]> {
  const keys: InboxKey[] = [];
  let token: string | null = null;
  do {
    const url = new URL(inbox.base);
    url.searchParams.set("list-type", "2");
    url.searchParams.set("max-keys", "1000");
    if (prefix) url.searchParams.set("prefix", prefix);
    if (token) url.searchParams.set("continuation-token", token);
    const page = parseListXml(await (await call(inbox, url)).text());
    for (const o of page.objects) {
      const parsed = parseKey(o.key, o.size);
      if (parsed) keys.push(parsed);
    }
    token = page.next;
  } while (token);
  return keys;
}

export async function readRecord(inbox: Inbox, key: string): Promise<InboxRecord | null> {
  const res = await call(inbox, new URL(`${inbox.base}/${key}`));
  return parseRecord(await res.text());
}
