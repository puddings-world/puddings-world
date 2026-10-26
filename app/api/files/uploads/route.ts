import { NextResponse } from "next/server";
import {
  canUpload,
  type FileRecord,
  objectKey,
  parseUploadRequest,
  partCount,
  partSizeFor,
  uploaderName,
} from "@/lib/files/model";
import { startMultipart } from "@/lib/files/r2";
import { newId } from "@/lib/files/secrets";
import { backends, fail, requester } from "@/lib/files/server";
import { getCollection, saveFile } from "@/lib/files/store";

/**
 * Starts an upload: `{ collectionId, name, size, type?, sha256?, note? }` →
 * `{ fileId, partSize, partCount }`. Then ask /parts for signed URLs, PUT
 * each part straight to R2, and finish with /complete.
 */
export async function POST(req: Request) {
  const b = backends();
  if (b instanceof NextResponse) return b;
  const who = await requester(req, b.redis);
  if (!who) return fail(401, "Sign in at /admin, or send Authorization: Bearer <app token>.");
  const parsed = parseUploadRequest(await req.json().catch(() => null));
  if ("error" in parsed) return fail(400, parsed.error);
  if (!(await getCollection(b.redis, parsed.collectionId))) return fail(404, "No such collection.");
  if (!canUpload(who, parsed.collectionId)) return fail(403, "This token may not upload to that collection.");

  const id = newId();
  const partSize = partSizeFor(parsed.size);
  const uploadId = await startMultipart(b.r2, objectKey(parsed.collectionId, id), parsed.type);
  const file: FileRecord = {
    id,
    ...parsed,
    status: "uploading",
    uploadId,
    partSize,
    createdAt: new Date().toISOString(),
    uploader: uploaderName(who),
  };
  await saveFile(b.redis, file);
  return NextResponse.json({ fileId: id, partSize, partCount: partCount(parsed.size, partSize) }, { status: 201 });
}
