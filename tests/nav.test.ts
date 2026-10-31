import { test } from "node:test";
import assert from "node:assert/strict";
import { isCurrent } from "../lib/nav";

test("a nav link is current on its page and every page under it", () => {
  assert.equal(isCurrent("/projects", "/projects"), true);
  assert.equal(isCurrent("/projects/paperfact", "/projects"), true);
  assert.equal(isCurrent("/projectsx", "/projects"), false);
  assert.equal(isCurrent("/musings/lab", "/projects"), false);
});

test("home is current only on the home page", () => {
  assert.equal(isCurrent("/", "/"), true);
  assert.equal(isCurrent("/about", "/"), false);
});
