import { NextResponse } from "next/server";
import { objectKey, partCount } from "@/lib/files/model";
import { partUploadUrl } from "@/lib/files/r2";
import { backends, fail } from "@/lib/files/server";
import { uploadInProgress } from "@/lib/files/upload-auth";

const MAX_URLS_PER_CALL = 100;

/** `{ parts: [1, 2, …] }` → `{ urls: { "1": "https://…" } }`, each valid for an hour. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const b = backends();
  if (b instanceof NextResponse) return b;
  const file = await uploadInProgress(req, b.redis, (await params).id);
  if (file instanceof NextResponse) return file;
  const body = (await req.json().catch(() => null)) as { parts?: unknown } | null;
  const total = partCount(file.size, file.partSize);
  const parts = Array.isArray(body?.parts) ? body.parts.map(Number) : [];
  if (!parts.length || parts.length > MAX_URLS_PER_CALL || parts.some((p) => !Number.isInteger(p) || p < 1 || p > total)) {
    return fail(400, `parts must list 1–${MAX_URLS_PER_CALL} part numbers between 1 and ${total}.`);
  }
  const key = objectKey(file.collectionId, file.id);
  const urls = Object.fromEntries(
    await Promise.all(parts.map(async (p) => [String(p), await partUploadUrl(b.r2, key, file.uploadId!, p)] as const)),
  );
  return NextResponse.json({ urls });
}
