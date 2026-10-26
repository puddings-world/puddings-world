import type { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { canUpload, type FileRecord, isId } from "./model";
import { fail, requester } from "./server";
import { getFile } from "./store";

/** The unfinished upload `id`, if the caller may continue it. */
export async function uploadInProgress(req: Request, redis: Redis, id: string): Promise<FileRecord | NextResponse> {
  const who = await requester(req, redis);
  if (!who) return fail(401, "Sign in at /admin, or send Authorization: Bearer <app token>.");
  const file = isId(id) ? await getFile(redis, id) : null;
  if (!file) return fail(404, "No such upload.");
  if (!canUpload(who, file.collectionId)) return fail(403, "This token may not upload to that collection.");
  if (file.status !== "uploading" || !file.uploadId) return fail(409, "This upload is already finished.");
  return file;
}
