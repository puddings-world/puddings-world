// Thin Cloudflare R2 (S3 API) layer. The bucket stays private: browsers and
// apps only ever get short-lived signed URLs from here.

import { AwsClient } from "aws4fetch";
import {
  completeUploadXml,
  contentDisposition,
  type DonePart,
  DOWNLOAD_URL_TTL_SEC,
  UPLOAD_URL_TTL_SEC,
  uploadIdFromXml,
} from "./model";

type R2 = { client: AwsClient; base: string };

let cached: R2 | null = null;

export const DEFAULT_BUCKET = "puddings-files";

/** Null until R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are set. */
export function getR2(): R2 | null {
  if (cached) return cached;
  const account = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!account || !accessKeyId || !secretAccessKey) return null;
  const bucket = process.env.R2_BUCKET || DEFAULT_BUCKET;
  cached = {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" }),
    base: `https://${account}.r2.cloudflarestorage.com/${bucket}`,
  };
  return cached;
}

async function presign(r2: R2, method: string, url: URL, ttlSec: number): Promise<string> {
  url.searchParams.set("X-Amz-Expires", String(ttlSec));
  const signed = await r2.client.sign(new Request(url, { method }), { aws: { signQuery: true } });
  return signed.url;
}

async function call(r2: R2, method: string, url: URL, body?: string): Promise<Response> {
  const res = await r2.client.fetch(url.toString(), { method, body });
  if (!res.ok) throw new Error(`R2 ${method} ${url.pathname}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

export async function startMultipart(r2: R2, key: string, type: string): Promise<string> {
  const url = new URL(`${r2.base}/${key}`);
  url.searchParams.set("uploads", "");
  const res = await r2.client.fetch(url.toString(), { method: "POST", headers: { "content-type": type } });
  if (!res.ok) throw new Error(`R2 start upload: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const id = uploadIdFromXml(await res.text());
  if (!id) throw new Error("R2 start upload: no UploadId in response");
  return id;
}

export function partUploadUrl(r2: R2, key: string, uploadId: string, part: number): Promise<string> {
  const url = new URL(`${r2.base}/${key}`);
  url.searchParams.set("partNumber", String(part));
  url.searchParams.set("uploadId", uploadId);
  return presign(r2, "PUT", url, UPLOAD_URL_TTL_SEC);
}

export async function completeMultipart(r2: R2, key: string, uploadId: string, parts: DonePart[]): Promise<void> {
  const url = new URL(`${r2.base}/${key}`);
  url.searchParams.set("uploadId", uploadId);
  await call(r2, "POST", url, completeUploadXml(parts));
}

export async function abortMultipart(r2: R2, key: string, uploadId: string): Promise<void> {
  const url = new URL(`${r2.base}/${key}`);
  url.searchParams.set("uploadId", uploadId);
  await r2.client.fetch(url.toString(), { method: "DELETE" });
}

/** Stored size of an object, or null when it is missing. */
export async function objectSize(r2: R2, key: string): Promise<number | null> {
  const res = await r2.client.fetch(`${r2.base}/${key}`, { method: "HEAD" });
  if (!res.ok) return null;
  return Number(res.headers.get("content-length"));
}

export async function deleteObject(r2: R2, key: string): Promise<void> {
  await r2.client.fetch(`${r2.base}/${key}`, { method: "DELETE" });
}

/** A download URL that saves under the original name and expires in minutes. */
export function downloadUrl(r2: R2, key: string, name: string): Promise<string> {
  const url = new URL(`${r2.base}/${key}`);
  url.searchParams.set("response-content-disposition", contentDisposition(name));
  return presign(r2, "GET", url, DOWNLOAD_URL_TTL_SEC);
}
