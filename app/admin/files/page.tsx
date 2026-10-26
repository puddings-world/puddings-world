import type { Metadata } from "next";
import Link from "next/link";
import { AdminLogin } from "@/components/AdminLogin";
import { FilesAdmin } from "@/components/FilesAdmin";
import { getR2 } from "@/lib/files/r2";
import { isAdmin } from "@/lib/files/server";
import { getRedis } from "@/lib/ktv/kv";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "files · admin",
  robots: { index: false, follow: false },
};

export default async function AdminFilesPage() {
  if (!(await isAdmin())) {
    return (
      <main className="px-4">
        <AdminLogin />
      </main>
    );
  }
  const ready = !!getRedis() && !!getR2();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-mono text-lg text-ink-primary">admin · files</h1>
        <Link href="/admin" className="font-mono text-xs text-ink-muted hover:text-ink-primary">
          ← stats
        </Link>
      </header>
      {ready ? (
        <FilesAdmin />
      ) : (
        <section className="mt-8 rounded-lg border border-accent-amber/40 bg-accent-amber/5 p-5 text-sm leading-relaxed text-ink-secondary">
          <p className="font-mono text-xs uppercase tracking-wider text-accent-amber">storage not set up</p>
          <p className="mt-3">
            Set <code>R2_ACCOUNT_ID</code>, <code>R2_ACCESS_KEY_ID</code> and <code>R2_SECRET_ACCESS_KEY</code>{" "}
            (optionally <code>R2_BUCKET</code>, default <code>puddings-files</code>) in Vercel, add the bucket CORS
            rule from the README, and redeploy.
          </p>
        </section>
      )}
    </main>
  );
}
