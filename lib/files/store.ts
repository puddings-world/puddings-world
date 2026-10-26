// Redis records for shared files. Keys:
//   files:collections        hash  collectionId -> Collection
//   files:col:<collectionId> hash  fileId -> FileRecord
//   files:owner              hash  fileId -> collectionId
//   files:downloads          hash  fileId -> download count
//   files:tokens             hash  sha256(secret) -> AppToken

import type { Redis } from "@upstash/redis";
import type { AppToken, Collection, FileRecord } from "./model";

const COLLECTIONS = "files:collections";
const OWNER = "files:owner";
const DOWNLOADS = "files:downloads";
const TOKENS = "files:tokens";
const colKey = (id: string) => `files:col:${id}`;

/** Upstash returns hash values parsed when they are JSON; accept both forms. */
function parse<T>(value: unknown): T | null {
  if (value && typeof value === "object") return value as T;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function values<T>(hash: Record<string, unknown> | null): T[] {
  return Object.values(hash ?? {})
    .map((v) => parse<T>(v))
    .filter((v): v is T => v !== null);
}

export async function listCollections(redis: Redis): Promise<Collection[]> {
  const all = values<Collection>(await redis.hgetall(COLLECTIONS));
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getCollection(redis: Redis, id: string): Promise<Collection | null> {
  return parse<Collection>(await redis.hget(COLLECTIONS, id));
}

export async function saveCollection(redis: Redis, c: Collection): Promise<void> {
  await redis.hset(COLLECTIONS, { [c.id]: JSON.stringify(c) });
}

export async function deleteCollection(redis: Redis, id: string, fileIds: string[]): Promise<void> {
  const tx = redis.multi();
  tx.hdel(COLLECTIONS, id);
  tx.del(colKey(id));
  if (fileIds.length) {
    tx.hdel(OWNER, ...fileIds);
    tx.hdel(DOWNLOADS, ...fileIds);
  }
  await tx.exec();
}

export async function listFiles(redis: Redis, collectionId: string): Promise<FileRecord[]> {
  const all = values<FileRecord>(await redis.hgetall(colKey(collectionId)));
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getFile(redis: Redis, fileId: string): Promise<FileRecord | null> {
  const collectionId = await redis.hget<string>(OWNER, fileId);
  if (!collectionId) return null;
  return parse<FileRecord>(await redis.hget(colKey(collectionId), fileId));
}

export async function saveFile(redis: Redis, f: FileRecord): Promise<void> {
  const tx = redis.multi();
  tx.hset(colKey(f.collectionId), { [f.id]: JSON.stringify(f) });
  tx.hset(OWNER, { [f.id]: f.collectionId });
  await tx.exec();
}

export async function deleteFile(redis: Redis, f: FileRecord): Promise<void> {
  const tx = redis.multi();
  tx.hdel(colKey(f.collectionId), f.id);
  tx.hdel(OWNER, f.id);
  tx.hdel(DOWNLOADS, f.id);
  await tx.exec();
}

export async function countDownload(redis: Redis, fileId: string): Promise<void> {
  await redis.hincrby(DOWNLOADS, fileId, 1);
}

export async function downloadCounts(redis: Redis): Promise<Record<string, number>> {
  const raw = (await redis.hgetall<Record<string, number | string>>(DOWNLOADS)) ?? {};
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number(v)]));
}

export async function tokenByHash(redis: Redis, hash: string): Promise<AppToken | null> {
  return parse<AppToken>(await redis.hget(TOKENS, hash));
}

export async function listTokens(redis: Redis): Promise<{ hash: string; token: AppToken }[]> {
  const raw = (await redis.hgetall<Record<string, unknown>>(TOKENS)) ?? {};
  return Object.entries(raw)
    .map(([hash, v]) => ({ hash, token: parse<AppToken>(v) }))
    .filter((t): t is { hash: string; token: AppToken } => t.token !== null)
    .sort((a, b) => b.token.createdAt.localeCompare(a.token.createdAt));
}

export async function saveToken(redis: Redis, hash: string, token: AppToken): Promise<void> {
  await redis.hset(TOKENS, { [hash]: JSON.stringify(token) });
}

export async function deleteTokenById(redis: Redis, id: string): Promise<boolean> {
  const match = (await listTokens(redis)).find((t) => t.token.id === id);
  if (!match) return false;
  await redis.hdel(TOKENS, match.hash);
  return true;
}
