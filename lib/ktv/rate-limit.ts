import { createHash, createHmac } from "node:crypto";

/**
 * The IP hashed to 16 hex chars, so anti-spam quotas, login lockouts and
 * the unique-visitor count can recognise a repeat visitor without the
 * server keeping the real IP. Keyed with `IP_HASH_SALT` (HMAC-SHA256) when
 * set: a plain SHA-256 of an IPv4 address can be reversed by trying all
 * 2³² of them, a keyed one cannot without the key.
 */
export function hashIp(ip: string, salt: string | undefined = process.env.IP_HASH_SALT): string {
  const digest = salt ? createHmac("sha256", salt).update(ip) : createHash("sha256").update(ip);
  return digest.digest("hex").slice(0, 16);
}

/** Pull the best-effort client IP from common Vercel / proxy headers. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
