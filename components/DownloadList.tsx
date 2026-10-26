"use client";

import { useState } from "react";
import { formatBytes } from "@/lib/files/model";
import type { PublicFile } from "@/lib/files/view";

/** Browsers drop downloads fired in the same instant; space them out. */
const DOWNLOAD_GAP_MS = 700;

export function DownloadList({ files }: { files: PublicFile[] }) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(files.map((f) => f.id)));
  const [copied, setCopied] = useState<string | null>(null);

  if (!files.length) {
    return <p className="font-mono text-sm text-ink-muted">Nothing here yet — files are still on their way.</p>;
  }

  const chosen = files.filter((f) => picked.has(f.id));
  const total = chosen.reduce((n, f) => n + f.size, 0);
  const allPicked = chosen.length === files.length;

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function downloadChosen() {
    chosen.forEach((f, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = f.url;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * DOWNLOAD_GAP_MS);
    });
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied("copy failed");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bg-border pb-3">
        <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-ink-secondary">
          <input
            type="checkbox"
            checked={allPicked}
            onChange={() => setPicked(allPicked ? new Set() : new Set(files.map((f) => f.id)))}
            className="accent-[var(--color-accent)]"
          />
          {chosen.length}/{files.length} selected · {formatBytes(total)}
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!chosen.length}
            onClick={() => copy(chosen.map((f) => new URL(f.url, location.origin).toString()).join("\n"), "links")}
            className="rounded-md border border-bg-border px-3 py-1.5 font-mono text-xs text-ink-secondary transition-colors hover:text-ink-primary disabled:opacity-40"
          >
            {copied === "links" ? "copied ✓" : "copy links"}
          </button>
          <button
            type="button"
            disabled={!chosen.length}
            onClick={downloadChosen}
            className="rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 font-mono text-xs text-accent transition-colors hover:bg-accent/20 disabled:opacity-40"
          >
            download {chosen.length > 1 ? `${chosen.length} files` : "selected"} ↓
          </button>
        </div>
      </div>

      <ul className="divide-y divide-bg-border">
        {files.map((f) => (
          <li key={f.id} className="flex items-start gap-3 py-4">
            <input
              type="checkbox"
              checked={picked.has(f.id)}
              onChange={() => toggle(f.id)}
              aria-label={`Select ${f.name}`}
              className="mt-1.5 accent-[var(--color-accent)]"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <a href={f.url} className="min-w-0 break-all font-medium text-ink-primary hover:text-accent">
                  {f.name}
                </a>
                <span className="font-mono text-xs text-ink-muted">{formatBytes(f.size)}</span>
              </div>
              {f.note && <p className="mt-1 text-sm text-ink-secondary">{f.note}</p>}
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink-muted">
                {f.readyAt && <span>{f.readyAt.slice(0, 10)}</span>}
                {f.sha256 && (
                  <button
                    type="button"
                    onClick={() => copy(f.sha256!, f.id)}
                    title="Copy SHA-256 to verify the download"
                    className="max-w-full truncate hover:text-ink-primary"
                  >
                    {copied === f.id ? "sha256 copied ✓" : `sha256 ${f.sha256.slice(0, 16)}…`}
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {copied === "copy failed" && <p className="font-mono text-xs text-accent-red">Couldn&apos;t reach the clipboard.</p>}
    </div>
  );
}
