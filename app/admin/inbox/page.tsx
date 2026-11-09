import type { Metadata } from "next";
import Link from "next/link";
import { AdminLogin } from "@/components/AdminLogin";
import { isAdmin } from "@/lib/files/server";
import { getInbox, listKeys, readRecord } from "@/lib/inbox/gcs";
import { type AppSummary, bodyText, type InboxKey, type InboxRecord, summarize } from "@/lib/inbox/model";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "inbox · admin",
  robots: { index: false, follow: false },
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });

type Shown = { key: InboxKey; record: InboxRecord | null };

export default async function AdminInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string }>;
}) {
  if (!(await isAdmin())) {
    return (
      <main className="px-4">
        <AdminLogin />
      </main>
    );
  }
  const inbox = getInbox();
  const wanted = (await searchParams).app;

  let apps: AppSummary[] = [];
  let shown: Shown[] = [];
  let error: string | null = null;
  if (inbox) {
    try {
      apps = summarize(await listKeys(inbox), new Date());
      const selected = apps.find((a) => a.app === wanted) ?? apps[0];
      shown = selected
        ? await Promise.all(
            selected.latest.map(async (key) => ({ key, record: await readRecord(inbox, key.key) })),
          )
        : [];
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  const current = apps.find((a) => a.app === wanted) ?? apps[0];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-mono text-lg text-ink-primary">admin · inbox</h1>
        <Link href="/admin" className="font-mono text-xs text-ink-muted hover:text-ink-primary">
          ← stats
        </Link>
      </header>

      {!inbox && (
        <section className="mt-8 rounded-lg border border-accent-amber/40 bg-accent-amber/5 p-5 text-sm leading-relaxed text-ink-secondary">
          <p className="font-mono text-xs uppercase tracking-wider text-accent-amber">inbox not set up</p>
          <p className="mt-3">
            In the pudding-backend repo run <code>python -m pudding_backend reader --project …</code>, then set{" "}
            <code>PUDDING_INBOX_BUCKET</code>, <code>PUDDING_INBOX_ACCESS_KEY</code> and{" "}
            <code>PUDDING_INBOX_SECRET</code> from <code>data/keys/inbox-reader.env</code> in Vercel and redeploy.
          </p>
        </section>
      )}

      {error && <p className="mt-6 text-sm text-accent-red">Could not read the bucket: {error}</p>}

      {inbox && !error && apps.length === 0 && (
        <p className="mt-8 text-sm text-ink-muted">Nothing in the inbox (cloud copies expire after 90 days).</p>
      )}

      {apps.length > 0 && (
        <>
          <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((a) => (
              <Link
                key={a.app}
                href={`/admin/inbox?app=${encodeURIComponent(a.app)}`}
                className={`rounded-lg border p-4 ${
                  a.app === current?.app
                    ? "border-accent/50 bg-bg-panel"
                    : "border-bg-border bg-bg-panel hover:border-ink-muted"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-sm text-ink-primary">{a.app}</span>
                  <span className="font-mono text-xs text-ink-muted">
                    {a.last7} / 7d · {a.total} / 90d
                  </span>
                </div>
                <ul className="mt-2 space-y-0.5 text-xs text-ink-secondary">
                  {a.kinds.map((k) => (
                    <li key={k.kind} className="flex justify-between gap-3">
                      <span>{k.kind}</span>
                      <span className="font-mono">
                        {k.last7} · {k.total}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 font-mono text-[10px] text-ink-muted">latest {fmt(a.latest[0].receivedAt)}</p>
              </Link>
            ))}
          </section>

          {current && (
            <section className="mt-10">
              <h2 className="font-mono text-xs uppercase tracking-wider text-ink-muted">
                {current.app} · latest {shown.length}
              </h2>
              <ul className="mt-3 space-y-3">
                {shown.map(({ key, record }) => (
                  <li key={key.key} className="rounded-lg border border-bg-border bg-bg-panel p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 font-mono text-xs">
                      <span className="text-accent">{key.kind}</span>
                      <span className="text-ink-muted">
                        {fmt(key.receivedAt)}
                        {record?.user && <span className="ml-2">{record.user}</span>}
                      </span>
                    </div>
                    {record ? (
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-ink-secondary">
                        {bodyText(record)}
                      </pre>
                    ) : (
                      <p className="mt-2 text-xs text-accent-red">malformed record {key.id}</p>
                    )}
                    {record?.user_agent && (
                      <p className="mt-2 truncate font-mono text-[10px] text-ink-muted" title={record.user_agent}>
                        {record.user_agent}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
