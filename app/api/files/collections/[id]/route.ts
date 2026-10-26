import { NextResponse } from "next/server";
import { logEvent } from "@/lib/event-log";
import { isId, objectKey } from "@/lib/files/model";
import { abortMultipart, deleteObject } from "@/lib/files/r2";
import { backends, fail, isAdmin } from "@/lib/files/server";
import { deleteCollection, getCollection, listFiles } from "@/lib/files/store";
import { publicFile } from "@/lib/files/view";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Anyone holding the link: the collection and its finished files. */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  if (!isId(id)) return fail(404, "No such collection.");
  const b = backends();
  if (b instanceof NextResponse) return b;
  const collection = await getCollection(b.redis, id);
  if (!collection) return fail(404, "No such collection.");
  const files = (await listFiles(b.redis, id)).filter((f) => f.status === "ready").map(publicFile);
  return NextResponse.json({ collection, files });
}

/** Admin: deletes the collection, its files in R2, and any unfinished uploads. */
export async function DELETE(_req: Request, { params }: Params) {
  if (!(await isAdmin())) return fail(401, "Sign in at /admin first.");
  const { id } = await params;
  const b = backends();
  if (b instanceof NextResponse) return b;
  const collection = isId(id) ? await getCollection(b.redis, id) : null;
  if (!collection) return fail(404, "No such collection.");
  const files = await listFiles(b.redis, id);
  await Promise.all(
    files.map((f) =>
      f.status === "uploading" && f.uploadId
        ? abortMultipart(b.r2, objectKey(id, f.id), f.uploadId)
        : deleteObject(b.r2, objectKey(id, f.id)),
    ),
  );
  await deleteCollection(b.redis, id, files.map((f) => f.id));
  await logEvent("files.collection_deleted", `${collection.title} (${files.length} files)`);
  return NextResponse.json({ ok: true });
}
