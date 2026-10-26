import { NextResponse } from "next/server";
import { logEvent } from "@/lib/event-log";
import { isId, objectKey } from "@/lib/files/model";
import { abortMultipart, deleteObject } from "@/lib/files/r2";
import { backends, fail, isAdmin } from "@/lib/files/server";
import { deleteFile, getFile } from "@/lib/files/store";

/** Admin: removes one file (or abandons its unfinished upload). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return fail(401, "Sign in at /admin first.");
  const { id } = await params;
  const b = backends();
  if (b instanceof NextResponse) return b;
  const file = isId(id) ? await getFile(b.redis, id) : null;
  if (!file) return fail(404, "No such file.");
  const key = objectKey(file.collectionId, file.id);
  if (file.status === "uploading" && file.uploadId) await abortMultipart(b.r2, key, file.uploadId);
  else await deleteObject(b.r2, key);
  await deleteFile(b.redis, file);
  await logEvent("files.deleted", file.name);
  return NextResponse.json({ ok: true });
}
