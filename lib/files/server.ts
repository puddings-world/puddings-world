import type { Redis } from "@upstash/redis";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin-auth";
import { getRedis } from "@/lib/ktv/kv";
import { bearerSecret, type Requester } from "./model";
import { getR2 } from "./r2";
import { hashToken } from "./secrets";
import { tokenByHash } from "./store";

type R2 = NonNullable<ReturnType<typeof getR2>>;

export function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** Redis and R2, or the 503 that explains which one is missing. */
export function backends(): { redis: Redis; r2: R2 } | NextResponse {
  const redis = getRedis();
  if (!redis) return fail(503, "Storage is not configured: Redis env vars are missing.");
  const r2 = getR2();
  if (!r2) {
    return fail(503, "File storage is not configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.");
  }
  return { redis, r2 };
}

export async function isAdmin(): Promise<boolean> {
  const session = (await cookies()).get(ADMIN_COOKIE)?.value;
  return verifySession(session, process.env.ADMIN_PASSWORD, new Date());
}

/** The signed-in admin, or the app whose `Authorization: Bearer pwf_…` token matches. */
export async function requester(req: Request, redis: Redis): Promise<Requester | null> {
  if (await isAdmin()) return { kind: "admin" };
  const secret = bearerSecret(req.headers.get("authorization"));
  if (!secret) return null;
  const token = await tokenByHash(redis, hashToken(secret));
  return token ? { kind: "app", token } : null;
}
