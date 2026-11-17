import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CV_MIN_MESSAGE_LEN,
  kindFromQuery,
  MAX_AFFILIATION_LEN,
  MAX_MESSAGE_LEN,
  parseContact,
  renderEmail,
} from "../lib/contact";

test("a message with name and email is accepted and trimmed", () => {
  assert.deepEqual(parseContact({ name: " Ann ", email: "a@b.co", message: " hi \n" }), {
    ok: true,
    value: { name: "Ann", email: "a@b.co", message: "hi" },
  });
});

test("name and email are optional", () => {
  assert.deepEqual(parseContact({ message: "hello" }), {
    ok: true,
    value: { name: "Anonymous", message: "hello" },
  });
});

test("an empty or whitespace-only message is rejected", () => {
  assert.equal(parseContact({ message: "  ​ " }).ok, false);
});

test("an overlong message is rejected, the limit itself is fine", () => {
  assert.equal(parseContact({ message: "x".repeat(MAX_MESSAGE_LEN + 1) }).ok, false);
  assert.equal(parseContact({ message: "x".repeat(MAX_MESSAGE_LEN) }).ok, true);
});

test("a malformed email is rejected", () => {
  assert.equal(parseContact({ email: "not-an-email", message: "hi" }).ok, false);
});

test("a filled honeypot is reported as spam, not as an error", () => {
  assert.deepEqual(parseContact({ website: "http://spam", message: "buy" }), {
    ok: true,
    spam: true,
  });
});

test("non-object bodies are rejected", () => {
  assert.equal(parseContact(null).ok, false);
  assert.equal(parseContact("hi").ok, false);
});

test("line breaks in the message survive cleaning", () => {
  const r = parseContact({ message: "line one\nline two" });
  assert.ok(r.ok && "value" in r && r.value.message === "line one\nline two");
});

test("the email subject previews the first line and carries the sender", () => {
  const { subject, text } = renderEmail(
    { name: "Ann", email: "a@b.co", message: "first line\nsecond" },
    new Date("2026-10-19T00:00:00Z"),
  );
  assert.equal(subject, "[puddingsworld] Ann: first line");
  assert.match(text, /From: Ann <a@b\.co>/);
  assert.match(text, /first line\nsecond$/);
});

const PURPOSE =
  "I lead a signal-processing group at a hospital lab and would like to discuss a possible collaboration.";

test("a complete CV request is accepted with its affiliation", () => {
  assert.deepEqual(
    parseContact({ kind: "cv", name: "Ann", email: "a@b.co", affiliation: " Lab X ", message: PURPOSE }),
    { ok: true, value: { kind: "cv", name: "Ann", email: "a@b.co", affiliation: "Lab X", message: PURPOSE } },
  );
});

test("a CV request needs a name, an email and an affiliation", () => {
  const base = { kind: "cv", name: "Ann", email: "a@b.co", affiliation: "Lab X", message: PURPOSE };
  assert.equal(parseContact({ ...base, name: "" }).ok, false);
  assert.equal(parseContact({ ...base, email: "" }).ok, false);
  assert.equal(parseContact({ ...base, affiliation: " " }).ok, false);
  assert.equal(parseContact({ ...base, affiliation: "x".repeat(MAX_AFFILIATION_LEN + 1) }).ok, false);
});

test("a CV request must explain itself; the minimum length itself is fine", () => {
  const base = { kind: "cv", name: "Ann", email: "a@b.co", affiliation: "Lab X" };
  assert.equal(parseContact({ ...base, message: "send cv pls" }).ok, false);
  assert.equal(parseContact({ ...base, message: "x".repeat(CV_MIN_MESSAGE_LEN) }).ok, true);
});

test("an ordinary message ignores a stray affiliation and stays a message", () => {
  const r = parseContact({ message: "hello", affiliation: "Lab X" });
  assert.deepEqual(r, { ok: true, value: { name: "Anonymous", message: "hello" } });
});

test("a CV request email is flagged in the subject and carries the affiliation", () => {
  const { subject, text } = renderEmail(
    { kind: "cv", name: "Ann", email: "a@b.co", affiliation: "Lab X", message: PURPOSE },
    new Date("2026-11-17T00:00:00Z"),
  );
  assert.equal(subject, "[puddingsworld] CV request: Ann (Lab X)");
  assert.match(text, /Affiliation: Lab X/);
  assert.ok(text.endsWith(PURPOSE));
});

test("only ?for=cv opens the form on a CV request", () => {
  assert.equal(kindFromQuery("cv"), "cv");
  assert.equal(kindFromQuery(undefined), "message");
  assert.equal(kindFromQuery("CV2"), "message");
  assert.equal(kindFromQuery(["cv", "x"]), "message");
});
