export const MAX_NAME_LEN = 60;
export const MAX_EMAIL_LEN = 120;
export const MAX_MESSAGE_LEN = 2000;
export const MAX_AFFILIATION_LEN = 120;
/** A CV request has to say who is asking and why; a one-liner is not enough. */
export const CV_MIN_MESSAGE_LEN = 80;
/** Submissions allowed per IP inside RATE_WINDOW_SEC. */
export const RATE_LIMIT = 3;
export const RATE_WINDOW_SEC = 600;

export type ContactKind = "message" | "cv";

export type ContactMessage = {
  kind?: "cv";
  name: string;
  email?: string;
  affiliation?: string;
  message: string;
};

export type ParseResult =
  | { ok: true; value: ContactMessage }
  | { ok: true; spam: true }
  | { ok: false; error: string };

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‍⁠﻿]/g;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(v: unknown): string {
  return typeof v === "string" ? v.replace(CONTROL, "").trim() : "";
}

/**
 * Validates a form submission. A filled `website` field is the honeypot:
 * bots get a success response and the message is dropped.
 */
export function parseContact(input: unknown): ParseResult {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid request." };
  const raw = input as Record<string, unknown>;
  if (clean(raw.website)) return { ok: true, spam: true };

  const name = clean(raw.name);
  const email = clean(raw.email);
  const message = clean(raw.message);

  if (!message) return { ok: false, error: "Please write a message." };
  if (message.length > MAX_MESSAGE_LEN)
    return { ok: false, error: `Messages are limited to ${MAX_MESSAGE_LEN} characters.` };
  if (name.length > MAX_NAME_LEN)
    return { ok: false, error: `Names are limited to ${MAX_NAME_LEN} characters.` };
  if (email && (email.length > MAX_EMAIL_LEN || !EMAIL.test(email)))
    return { ok: false, error: "That email address doesn't look right." };

  if (raw.kind === "cv") {
    const affiliation = clean(raw.affiliation);
    if (!name) return { ok: false, error: "A CV request needs your name." };
    if (!email) return { ok: false, error: "A CV request needs an email so I can reply." };
    if (!affiliation) return { ok: false, error: "Please say where you're writing from." };
    if (affiliation.length > MAX_AFFILIATION_LEN)
      return { ok: false, error: `Affiliations are limited to ${MAX_AFFILIATION_LEN} characters.` };
    if (message.length < CV_MIN_MESSAGE_LEN)
      return {
        ok: false,
        error: `Tell me a bit more about yourself and why you'd like the CV (at least ${CV_MIN_MESSAGE_LEN} characters).`,
      };
    return { ok: true, value: { kind: "cv", name, email, affiliation, message } };
  }

  return {
    ok: true,
    value: { name: name || "Anonymous", ...(email ? { email } : {}), message },
  };
}

export function renderEmail(
  msg: ContactMessage,
  receivedAt: Date,
): { subject: string; text: string } {
  const firstLine = msg.message.split("\n")[0];
  const preview = firstLine.length > 50 ? `${firstLine.slice(0, 50)}…` : firstLine;
  if (msg.kind === "cv") {
    return {
      subject: `[puddingsworld] CV request: ${msg.name} (${msg.affiliation})`,
      text: [
        `From: ${msg.name} <${msg.email}>`,
        `Affiliation: ${msg.affiliation}`,
        `Received: ${receivedAt.toISOString()}`,
        "",
        msg.message,
      ].join("\n"),
    };
  }
  return {
    subject: `[puddingsworld] ${msg.name}: ${preview}`,
    text: [
      `From: ${msg.name}${msg.email ? ` <${msg.email}>` : " (no email given)"}`,
      `Received: ${receivedAt.toISOString()}`,
      "",
      msg.message,
    ].join("\n"),
  };
}

/** `/contact?for=cv` opens the form on the CV request; anything else is a message. */
export function kindFromQuery(value: string | string[] | undefined): ContactKind {
  return value === "cv" ? "cv" : "message";
}
