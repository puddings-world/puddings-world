import { NextResponse } from "next/server";
import { isBot } from "@/lib/analytics";
import { isId, objectKey } from "@/lib/files/model";
import { downloadUrl } from "@/lib/files/r2";
import { backends, fail } from "@/lib/files/server";
import { countDownload, getFile } from "@/lib/files/store";

export const dynamic = "force-dynamic";

/** Counts the download and redirects to a signed R2 URL valid for a few minutes. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id)) return fail(404, "No such file.");
  const b = backends();
  if (b instanceof NextResponse) return b;
  const file = await getFile(b.redis, id);
  if (!file || file.status !== "ready") return fail(404, "No such file.");
  if (!isBot(req.headers.get("user-agent"))) await countDownload(b.redis, id);
  const url = await downloadUrl(b.r2, objectKey(file.collectionId, file.id), file.name);
  return NextResponse.redirect(url, { status: 302, headers: { "cache-control": "no-store" } });
}
