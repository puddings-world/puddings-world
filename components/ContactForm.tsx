"use client";

import { useState } from "react";
import {
  CV_MIN_MESSAGE_LEN,
  MAX_AFFILIATION_LEN,
  MAX_MESSAGE_LEN,
  type ContactKind,
} from "@/lib/contact";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

const FIELD =
  "w-full rounded-md border border-bg-border bg-bg-raised px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:border-accent/60 focus:outline-none";

const KINDS: { value: ContactKind; label: string }[] = [
  { value: "message", label: "Message" },
  { value: "cv", label: "Request my CV" },
];

export function ContactForm({ initialKind = "message" }: { initialKind?: ContactKind }) {
  const [kind, setKind] = useState<ContactKind>(initialKind);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [length, setLength] = useState(0);
  const cv = kind === "cv";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setStatus({ kind: "error", message: body.error ?? "Something went wrong." });
        return;
      }
      form.reset();
      setLength(0);
      setStatus({ kind: "sent" });
    } catch {
      setStatus({ kind: "error", message: "Network error. Please try again." });
    }
  }

  if (status.kind === "sent") {
    return (
      <div className="rounded-lg border border-accent-green/40 bg-accent-green/10 px-5 py-4 text-sm text-accent-green">
        {cv
          ? "Thanks, your request is in. If it fits, I'll reply with the link to my CV."
          : "Thanks, your message is on its way to my inbox."}{" "}
        <button
          type="button"
          onClick={() => setStatus({ kind: "idle" })}
          className="underline underline-offset-4 hover:text-ink-primary"
        >
          Write another
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="relative space-y-3 rounded-lg border border-bg-border bg-bg-panel p-5"
    >
      <div role="radiogroup" aria-label="What are you sending?" className="flex gap-1 rounded-md border border-bg-border bg-bg-raised p-1">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            role="radio"
            aria-checked={kind === k.value}
            onClick={() => {
              setKind(k.value);
              setStatus({ kind: "idle" });
            }}
            className={`flex-1 rounded px-3 py-1.5 font-mono text-xs transition-colors ${
              kind === k.value
                ? "bg-accent/15 text-accent"
                : "text-ink-muted hover:text-ink-primary"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>
      {cv && <input type="hidden" name="kind" value="cv" />}
      {cv && (
        <p className="text-xs leading-relaxed text-ink-secondary">
          My CV lives on a separate page that isn&apos;t linked from this site. Tell me who you are
          and why you&apos;d like it; if it fits, I&apos;ll reply with the link.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="mb-1 block font-mono text-xs uppercase tracking-wider text-ink-muted">
            Name
          </span>
          <input
            name="name"
            maxLength={60}
            autoComplete="name"
            required={cv}
            placeholder={cv ? "required" : "optional"}
            className={FIELD}
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block font-mono text-xs uppercase tracking-wider text-ink-muted">
            Email
          </span>
          <input
            name="email"
            type="email"
            maxLength={120}
            autoComplete="email"
            required={cv}
            placeholder={cv ? "required, for the reply" : "optional, if you want a reply"}
            className={FIELD}
          />
        </label>
      </div>
      {cv && (
        <label className="block">
          <span className="mb-1 block font-mono text-xs uppercase tracking-wider text-ink-muted">
            Affiliation
          </span>
          <input
            name="affiliation"
            required
            maxLength={MAX_AFFILIATION_LEN}
            autoComplete="organization"
            placeholder="lab, company or school, and your role"
            className={FIELD}
          />
        </label>
      )}
      <label className="block">
        <span className="mb-1 flex justify-between font-mono text-xs uppercase tracking-wider text-ink-muted">
          <span>{cv ? "Who you are and why" : "Message"}</span>
          <span className="normal-case tracking-normal">
            {length}/{MAX_MESSAGE_LEN}
          </span>
        </span>
        <textarea
          name="message"
          required
          rows={cv ? 6 : 5}
          minLength={cv ? CV_MIN_MESSAGE_LEN : undefined}
          maxLength={MAX_MESSAGE_LEN}
          onChange={(e) => setLength(e.target.value.length)}
          placeholder={
            cv
              ? "A short self-introduction and what you'd like to work on together…"
              : "Say hi, ask something, leave a note…"
          }
          className={`${FIELD} resize-y leading-relaxed`}
        />
      </label>
      <input
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="absolute left-0 top-0 h-px w-px opacity-0"
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-ink-muted" role="status">
          {status.kind === "error" ? (
            <span className="text-accent-red">{status.message}</span>
          ) : (
            "Goes straight to my inbox."
          )}
        </p>
        <button
          type="submit"
          disabled={status.kind === "sending"}
          className="rounded-md border border-accent/40 bg-accent/10 px-4 py-2 font-mono text-sm text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
        >
          {status.kind === "sending" ? "sending…" : cv ? "request →" : "send →"}
        </button>
      </div>
    </form>
  );
}
