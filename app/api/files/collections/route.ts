import { NextResponse } from "next/server";
import { logEvent } from "@/lib/event-log";
import type { Collection } from "@/lib/files/model";
import { newId } from "@/lib/files/secrets";
import { backends, fail, isAdmin } from "@/lib/files/server";
import { downloadCounts, listCollections, listFiles, saveCollection } from "@/lib/files/store";

export const dynamic = "force-dynamic";

/** Admin: every collection with all its files, uploads in progress included. */
export async function GET() {
  if (!(await isAdmin())) return fail(401, "Sign in at /admin first.");
  const b = backends();
  if (b instanceof NextResponse) return b;
  const [collections, counts] = await Promise.all([listCollections(b.redis), downloadCounts(b.redis)]);
  const withFiles = await Promise.all(
    collections.map(async (c) => ({
      ...c,
      files: (await listFiles(b.redis, c.id)).map((f) => ({ ...f, downloads: counts[f.id] ?? 0 })),
    })),
  );
  return NextResponse.json({ collections: withFiles });
}

/** Admin: `{ title, note? }` creates a collection reachable only by its link. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return fail(401, "Sign in at /admin first.");
  const b = backends();
  if (b instanceof NextResponse) return b;
  const body = (await req.json().catch(() => null)) as { title?: unknown; note?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "";
  if (!title) return fail(400, "title is required.");
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 1000) : undefined;
  const collection: Collection = { id: newId(), title, ...(note ? { note } : {}), createdAt: new Date().toISOString() };
  await saveCollection(b.redis, collection);
  await logEvent("files.collection_created", title);
  return NextResponse.json({ collection }, { status: 201 });
}
