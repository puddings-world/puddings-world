"use client";

import { useCallback, useEffect, useState } from "react";
import { type AppToken, type Collection, type FileRecord, formatBytes } from "@/lib/files/model";
import { fetchPut, httpFilesApi, uploadFile, type UploadState } from "@/lib/files/upload-client";

type AdminFile = FileRecord & { downloads: number };
type AdminCollection = Collection & { files: AdminFile[] };
type Progress = { name: string; sent: number; total: number; error?: string };

const api = httpFilesApi("");

/** Resume key: the same file picked again continues where it stopped. */
const resumeKey = (collectionId: string, f: File) => `pw-upload:${collectionId}:${f.name}:${f.size}:${f.lastModified}`;

function loadResume(key: string): UploadState | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as UploadState) : undefined;
  } catch {
    return undefined;
  }
}

function saveResume(key: string, state: UploadState | null) {
  try {
    if (state) localStorage.setItem(key, JSON.stringify(state));
    else localStorage.removeItem(key);
  } catch {
    // Without storage the upload still works; it just can't resume.
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json" } });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export function FilesAdmin() {
  const [collections, setCollections] = useState<AdminCollection[] | null>(null);
  const [tokens, setTokens] = useState<AppToken[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([
        call<{ collections: AdminCollection[] }>("/api/files/collections"),
        call<{ tokens: AppToken[] }>("/api/files/tokens"),
      ]);
      setCollections(c.collections);
      setTokens(t.tokens);
      setError(null);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="mt-8 space-y-10">
      {error && <p className="font-mono text-sm text-accent-red">{error}</p>}
      <NewCollection onCreated={reload} />
      {collections === null ? (
        <p className="font-mono text-xs text-ink-muted">loading…</p>
      ) : collections.length === 0 ? (
        <p className="font-mono text-xs text-ink-muted">No collections yet.</p>
      ) : (
        collections.map((c) => <CollectionPanel key={c.id} collection={c} onChange={reload} />)
      )}
      <Tokens tokens={tokens} collections={collections ?? []} onChange={reload} />
    </div>
  );
}

function NewCollection({ onCreated }: { onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      await call("/api/files/collections", {
        method: "POST",
        body: JSON.stringify({ title: data.get("title"), note: data.get("note") }),
      });
      form.reset();
      setError(null);
      onCreated();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-bg-border bg-bg-panel p-4">
      <h2 className="font-mono text-xs uppercase tracking-wider text-ink-muted">New collection</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
        <input
          name="title"
          required
          maxLength={120}
          placeholder="Title, e.g. Cataract dataset v2"
          className="rounded border border-bg-border bg-bg-base px-3 py-2 text-sm"
        />
        <input
          name="note"
          maxLength={1000}
          placeholder="Note shown to people with the link (optional)"
          className="rounded border border-bg-border bg-bg-base px-3 py-2 text-sm"
        />
        <button
          disabled={busy}
          className="rounded border border-accent/40 bg-accent/10 px-4 py-2 font-mono text-xs text-accent hover:bg-accent/20 disabled:opacity-50"
        >
          create
        </button>
      </div>
      {error && <p className="mt-2 font-mono text-xs text-accent-red">{error}</p>}
    </form>
  );
}

function CollectionPanel({ collection, onChange }: { collection: AdminCollection; onChange: () => void }) {
  const [uploads, setUploads] = useState<Progress[]>([]);
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const link = typeof window === "undefined" ? "" : `${location.origin}/downloads/${collection.id}`;

  async function upload(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const key = resumeKey(collection.id, file);
      const update = (p: Partial<Progress>) =>
        setUploads((prev) => prev.map((u) => (u.name === file.name ? { ...u, ...p } : u)));
      setUploads((prev) => [...prev.filter((u) => u.name !== file.name), { name: file.name, sent: 0, total: file.size }]);
      try {
        await uploadFile(
          { collectionId: collection.id, name: file.name, size: file.size, type: file.type || undefined },
          {
            api,
            resume: loadResume(key),
            read: async (start, end) => file.slice(start, end),
            put: fetchPut,
            onState: (state) => saveResume(key, state),
            onProgress: (sent, total) => update({ sent, total }),
          },
        );
        saveResume(key, null);
        setUploads((prev) => prev.filter((u) => u.name !== file.name));
      } catch (err) {
        update({ error: `${err instanceof Error ? err.message : String(err)} — pick the file again to resume.` });
      }
    }
    onChange();
  }

  async function remove(path: string, what: string) {
    if (!confirm(`Delete ${what}? This removes it from storage.`)) return;
    await call(path, { method: "DELETE" }).catch((err) => alert(String(err)));
    onChange();
  }

  return (
    <section
      className={`rounded-lg border bg-bg-panel p-4 transition-colors ${dragging ? "border-accent" : "border-bg-border"}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void upload(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold">{collection.title}</h2>
          {collection.note && <p className="mt-1 text-sm text-ink-secondary">{collection.note}</p>}
          <p className="mt-1 font-mono text-[11px] text-ink-muted">id {collection.id}</p>
        </div>
        <div className="flex flex-wrap gap-2 font-mono text-xs">
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(link).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="rounded border border-accent/40 px-2 py-1 text-accent hover:bg-accent/10"
          >
            {copied ? "copied ✓" : "copy share link"}
          </button>
          <a href={`/downloads/${collection.id}`} target="_blank" rel="noreferrer" className="rounded border border-bg-border px-2 py-1 text-ink-muted hover:text-ink-primary">
            open ↗
          </a>
          <label className="cursor-pointer rounded border border-bg-border px-2 py-1 text-ink-secondary hover:text-ink-primary">
            upload…
            <input type="file" multiple className="hidden" onChange={(e) => e.target.files && void upload(e.target.files)} />
          </label>
          <button
            type="button"
            onClick={() => remove(`/api/files/collections/${collection.id}`, `"${collection.title}" and all ${collection.files.length} files`)}
            className="rounded border border-bg-border px-2 py-1 text-ink-muted hover:border-accent-red/50 hover:text-accent-red"
          >
            delete
          </button>
        </div>
      </div>

      {uploads.map((u) => (
        <div key={u.name} className="mt-3 font-mono text-xs">
          <div className="flex justify-between gap-3 text-ink-secondary">
            <span className="truncate">{u.name}</span>
            <span>{u.total ? Math.floor((u.sent / u.total) * 100) : 100}%</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded bg-bg-border">
            <div className="h-full bg-accent" style={{ width: `${u.total ? (u.sent / u.total) * 100 : 100}%` }} />
          </div>
          {u.error && <p className="mt-1 text-accent-red">{u.error}</p>}
        </div>
      ))}

      {collection.files.length > 0 ? (
        <table className="mt-4 w-full table-fixed text-left text-sm">
          <thead className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="pb-2">file</th>
              <th className="w-20 pb-2 text-right">size</th>
              <th className="hidden w-24 pb-2 text-right sm:table-cell">by</th>
              <th className="w-14 pb-2 text-right">dl</th>
              <th className="w-14 pb-2" />
            </tr>
          </thead>
          <tbody>
            {collection.files.map((f) => (
              <tr key={f.id} className="border-t border-bg-border">
                <td className="truncate py-2 pr-2">
                  {f.name}
                  {f.status === "uploading" && <span className="ml-2 font-mono text-[10px] text-accent-amber">unfinished</span>}
                </td>
                <td className="py-2 text-right font-mono text-xs text-ink-muted">{formatBytes(f.size)}</td>
                <td className="hidden truncate py-2 text-right font-mono text-xs text-ink-muted sm:table-cell">{f.uploader}</td>
                <td className="py-2 text-right font-mono text-xs">{f.downloads}</td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => remove(`/api/files/files/${f.id}`, f.name)}
                    className="font-mono text-xs text-ink-muted hover:text-accent-red"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-4 font-mono text-xs text-ink-muted">Drop files here or use upload….</p>
      )}
    </section>
  );
}

function Tokens({
  tokens,
  collections,
  onChange,
}: {
  tokens: AppToken[];
  collections: Collection[];
  onChange: () => void;
}) {
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleOf = (id: string) => collections.find((c) => c.id === id)?.title ?? id;

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const scope = data.getAll("scope").map(String);
    try {
      const res = await call<{ secret: string }>("/api/files/tokens", {
        method: "POST",
        body: JSON.stringify({ name: data.get("name"), collections: scope.includes("*") ? "*" : scope }),
      });
      setSecret(res.secret);
      setError(null);
      form.reset();
      onChange();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    }
  }

  async function revoke(t: AppToken) {
    if (!confirm(`Revoke "${t.name}"? Apps using it stop working at once.`)) return;
    await call(`/api/files/tokens/${t.id}`, { method: "DELETE" }).catch((err) => alert(String(err)));
    onChange();
  }

  return (
    <section className="rounded-lg border border-bg-border bg-bg-panel p-4">
      <h2 className="font-mono text-xs uppercase tracking-wider text-ink-muted">App tokens</h2>
      <p className="mt-2 text-sm text-ink-secondary">
        Apps and scripts upload with <code>Authorization: Bearer &lt;token&gt;</code>, e.g.{" "}
        <code>PW_FILES_TOKEN=… npx tsx scripts/upload.ts --collection &lt;id&gt; file.zip</code>.
      </p>
      {secret && (
        <div className="mt-3 rounded border border-accent-amber/40 bg-accent-amber/5 p-3">
          <p className="font-mono text-xs text-accent-amber">Copy it now: it is shown only once.</p>
          <code className="mt-2 block break-all font-mono text-xs text-ink-primary">{secret}</code>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(secret).catch(() => {})}
            className="mt-2 rounded border border-bg-border px-2 py-1 font-mono text-xs text-ink-secondary"
          >
            copy
          </button>
        </div>
      )}
      <form onSubmit={create} className="mt-4 space-y-2">
        <input
          name="name"
          required
          maxLength={60}
          placeholder="App name, e.g. paperfact-ci"
          className="w-full rounded border border-bg-border bg-bg-base px-3 py-2 text-sm sm:w-80"
        />
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-ink-secondary">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="scope" value="*" /> all collections
          </label>
          {collections.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5">
              <input type="checkbox" name="scope" value={c.id} /> {c.title}
            </label>
          ))}
        </div>
        <button className="rounded border border-accent/40 bg-accent/10 px-4 py-1.5 font-mono text-xs text-accent hover:bg-accent/20">
          create token
        </button>
        {error && <p className="font-mono text-xs text-accent-red">{error}</p>}
      </form>
      {tokens.length > 0 && (
        <ul className="mt-4 divide-y divide-bg-border text-sm">
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {t.name}{" "}
                <span className="font-mono text-xs text-ink-muted">
                  → {t.collections === "*" ? "all collections" : t.collections.map(titleOf).join(", ")}
                </span>
              </span>
              <button type="button" onClick={() => revoke(t)} className="font-mono text-xs text-ink-muted hover:text-accent-red">
                revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
