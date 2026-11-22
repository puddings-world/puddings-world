import { test } from "node:test";
import assert from "node:assert/strict";
import { branchActivity, branchesToRead, MAX_BRANCHES, type BranchCommit } from "../lib/activity";

const SINCE = "2026-11-15T00:00:00Z";

function commit(sha: string, date: string, message = sha): BranchCommit {
  return { sha, date, message, url: `https://github.com/o/r/commit/${sha}` };
}

test("work on a feature branch is the latest commit and names its branch", () => {
  const r = branchActivity(
    [
      { branch: "master", commits: [commit("a1", "2026-10-31T09:00:00Z")] },
      { branch: "develop/0.5", commits: [commit("b2", "2026-11-20T09:00:00Z", "Stabilize workspace")] },
    ],
    "master",
    SINCE,
  );
  assert.equal(r.latestCommit?.sha, "b2");
  assert.equal(r.latestCommit?.branch, "develop/0.5");
  assert.equal(r.latestCommit?.message, "Stabilize workspace");
});

test("when the default branch holds the latest commit, no branch is named", () => {
  const r = branchActivity(
    [
      { branch: "dev", commits: [commit("x", "2026-11-01T00:00:00Z")] },
      { branch: "main", commits: [commit("y", "2026-11-18T00:00:00Z")] },
    ],
    "main",
    SINCE,
  );
  assert.equal(r.latestCommit?.sha, "y");
  assert.equal(r.latestCommit?.branch, undefined);
});

test("a commit on several branches counts once and prefers the default branch", () => {
  const shared = commit("s", "2026-11-19T00:00:00Z");
  const r = branchActivity(
    [
      { branch: "feature", commits: [shared, commit("f", "2026-11-16T00:00:00Z")] },
      { branch: "main", commits: [shared] },
    ],
    "main",
    SINCE,
  );
  assert.equal(r.weeklyCommits, 2);
  assert.equal(r.latestCommit?.sha, "s");
  assert.equal(r.latestCommit?.branch, undefined);
});

test("only commits since the window start count as weekly", () => {
  const r = branchActivity(
    [{ branch: "main", commits: [commit("new", "2026-11-16T00:00:00Z"), commit("old", "2026-11-01T00:00:00Z")] }],
    "main",
    SINCE,
  );
  assert.equal(r.weeklyCommits, 1);
});

test("a repo with no readable commits has no latest commit", () => {
  assert.deepEqual(branchActivity([{ branch: "main", commits: [] }], "main", SINCE), { weeklyCommits: 0 });
});

test("the default branch is always read first, and the list is capped", () => {
  assert.deepEqual(branchesToRead(["a", "main", "b"], "main"), ["main", "a", "b"]);
  assert.deepEqual(branchesToRead([], "main"), ["main"]);
  const many = Array.from({ length: 50 }, (_, i) => `b${i}`);
  const read = branchesToRead(many, "main");
  assert.equal(read.length, MAX_BRANCHES);
  assert.equal(read[0], "main");
});
