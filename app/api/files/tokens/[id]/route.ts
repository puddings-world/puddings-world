import { NextResponse } from "next/server";
import { logEvent } from "@/lib/event-log";
import { fail, isAdmin } from "@/lib/files/server";
import { deleteTokenById } from "@/lib/files/store";
import { getRedis } from "@/lib/ktv/kv";

/** Admin: revokes an app token at once. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return fail(401, "Sign in at /admin first.");
  const redis = getRedis();
  if (!redis) return fail(503, "Storage is not configured.");
  const { id } = await params;
  if (!(await deleteTokenById(redis, id))) return fail(404, "No such token.");
  await logEvent("files.token_revoked", id);
  return NextResponse.json({ ok: true });
}
