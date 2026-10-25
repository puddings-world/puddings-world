import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { hashIp } from "../lib/ktv/rate-limit";

const plain = (ip: string) => createHash("sha256").update(ip).digest("hex").slice(0, 16);

test("without a salt the hash is the plain SHA-256 prefix used so far", () => {
  assert.equal(hashIp("203.0.113.7", undefined), plain("203.0.113.7"));
  assert.equal(hashIp("203.0.113.7", ""), plain("203.0.113.7"));
});

test("a salt keys the hash so it no longer matches the plain one", () => {
  const keyed = hashIp("203.0.113.7", "s3cret");
  assert.notEqual(keyed, plain("203.0.113.7"));
  assert.match(keyed, /^[0-9a-f]{16}$/);
});

test("the same IP and salt always give the same hash; other salts or IPs do not", () => {
  assert.equal(hashIp("203.0.113.7", "a"), hashIp("203.0.113.7", "a"));
  assert.notEqual(hashIp("203.0.113.7", "a"), hashIp("203.0.113.7", "b"));
  assert.notEqual(hashIp("203.0.113.7", "a"), hashIp("203.0.113.8", "a"));
});
