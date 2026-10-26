import { NextResponse } from "next/server";
import { logEvent } from "@/lib/event-log";
import { objectKey, parseParts, partCount } from "@/lib/files/model";
import { completeMultipart, objectSize } from "@/lib/files/r2";
import { backends, fail } from "@/lib/files/server";
import { saveFile } from "@/lib/files/store";
import { uploadInProgress } from "@/lib/files/upload-auth";
import { publicFile } from "@/lib/files/view";

/** `{ parts: [{ part, etag }] }` with every part's ETag from R2 finishes the upload. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const b = backends();
  if (b instanceof NextResponse) return b;
  const file = await uploadInProgress(req, b.redis, (await params).id);
  if (file instanceof NextResponse) return file;
  const body = (await req.json().catch(() => null)) as { parts?: unknown } | null;
  const parts = parseParts(body?.parts, partCount(file.size, file.partSize));
  if (!parts) return fail(400, "parts must list every part once, as { part, etag }.");

  const key = objectKey(file.collectionId, file.id);
  await completeMultipart(b.r2, key, file.uploadId!, parts);
  const size = await objectSize(b.r2, key);
  if (size !== file.size) return fail(422, `Stored ${size ?? 0} bytes, expected ${file.size}. Delete it and upload again.`);
  const { uploadId: _, ...rest } = file;
  const ready = { ...rest, status: "ready" as const, readyAt: new Date().toISOString() };
  await saveFile(b.redis, ready);
  await logEvent("files.uploaded", `${file.name} by ${file.uploader}`);
  return NextResponse.json({ file: publicFile(ready) });
}
