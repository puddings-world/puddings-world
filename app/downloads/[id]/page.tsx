import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DownloadList } from "@/components/DownloadList";
import { isId } from "@/lib/files/model";
import { getCollection, listFiles } from "@/lib/files/store";
import { publicFile } from "@/lib/files/view";
import { getRedis } from "@/lib/ktv/kv";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Downloads",
  robots: { index: false, follow: false },
};

/** A shared collection: reachable only by its link, never listed or indexed. */
export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const redis = getRedis();
  const collection = redis && isId(id) ? await getCollection(redis, id) : null;
  if (!redis || !collection) notFound();
  const files = (await listFiles(redis, id)).filter((f) => f.status === "ready").map(publicFile);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-accent">shared files</p>
      <h1 className="mt-4 break-words text-3xl font-semibold tracking-tight sm:text-4xl">{collection.title}</h1>
      {collection.note && (
        <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-ink-secondary">{collection.note}</p>
      )}
      <div className="mt-10">
        <DownloadList files={files} />
      </div>
      <p className="mt-10 font-mono text-[11px] leading-relaxed text-ink-muted">
        Only people with this link can see these files. Download links are made fresh on each click and
        expire after a few minutes, so share this page rather than a file&apos;s address.
      </p>
    </main>
  );
}
