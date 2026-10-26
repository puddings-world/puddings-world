import { NextResponse } from "next/server";
import { logEvent } from "@/lib/event-log";
import { type AppToken, isId } from "@/lib/files/model";
import { hashToken, newId, newTokenSecret } from "@/lib/files/secrets";
import { fail, isAdmin } from "@/lib/files/server";
import { listTokens, saveToken } from "@/lib/files/store";
import { getRedis } from "@/lib/ktv/kv";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return fail(401, "Sign in at /admin first.");
  const redis = getRedis();
  if (!redis) return fail(503, "Storage is not configured.");
  return NextResponse.json({ tokens: (await listTokens(redis)).map((t) => t.token) });
}

/**
 * Admin: `{ name, collections: [ids] | "*" }` issues an app token. The secret
 * is returned once and only its hash is kept.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return fail(401, "Sign in at /admin first.");
  const redis = getRedis();
  if (!redis) return fail(503, "Storage is not configured.");
  const body = (await req.json().catch(() => null)) as { name?: unknown; collections?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
  if (!name) return fail(400, "name is required.");
  const collections =
    body?.collections === "*"
      ? "*"
      : Array.isArray(body?.collections) && body.collections.length && body.collections.every(isId)
        ? (body.collections as string[])
        : null;
  if (!collections) return fail(400, 'collections must be "*" or a list of collection ids.');
  const secret = newTokenSecret();
  const token: AppToken = { id: newId(), name, collections, createdAt: new Date().toISOString() };
  await saveToken(redis, hashToken(secret), token);
  await logEvent("files.token_created", name);
  return NextResponse.json({ token, secret }, { status: 201 });
}
