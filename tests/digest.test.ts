import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diffSnapshots,
  renderDigest,
  untaggedCandidates,
  type OwnedRepo,
} from "../lib/digest";
import type { Project, ProjectsSnapshot } from "../lib/types";

function project(slug: string, over: Partial<Project> = {}, sha = `${slug}-1`, weekly = 0): Project {
  return {
    slug,
    title: slug.toUpperCase(),
    tagline: "",
    track: "tool",
    status: "active",
    repo: { owner: "me", name: slug, private: false },
    topics: [],
    links: [],
    featured: false,
    activity: {
      stars: 0,
      openIssues: 0,
      defaultBranch: "main",
      pushedAt: "2026-11-20T12:00:00Z",
      weeklyCommits: weekly,
      latestCommit: { sha, message: `work on ${slug}`, date: "2026-11-20T12:00:00Z", url: "" },
    },
    ...over,
  };
}

const snap = (projects: Project[], fetchedAt = "2026-11-16T12:00:00Z"): ProjectsSnapshot => ({
  fetchedAt,
  projects,
});

function repo(name: string, over: Partial<OwnedRepo> = {}): OwnedRepo {
  return {
    owner: "me",
    name,
    description: `about ${name}`,
    pushedAt: "2026-11-20T12:00:00Z",
    topics: [],
    archived: false,
    fork: false,
    private: true,
    ...over,
  };
}

const NOW = new Date("2026-11-22T12:00:00Z");

test("added, removed, progressed and status changes are each reported", () => {
  const prev = snap([project("a"), project("b", { status: "paused" }), project("gone")]);
  const cur = snap([
    project("a", {}, "a-2", 5),
    project("b", { status: "active" }),
    project("new"),
  ]);
  const d = diffSnapshots(prev, cur);
  assert.deepEqual(d.added.map((p) => p.slug), ["new"]);
  assert.deepEqual(d.removed.map((p) => p.slug), ["gone"]);
  assert.deepEqual(d.progressed.map((g) => [g.project.slug, g.weeklyCommits]), [["a", 5]]);
  assert.deepEqual(d.statusChanged.map((s) => [s.project.slug, s.from, s.to]), [["b", "paused", "active"]]);
});

test("progress is busiest first and keeps the branch the work is on", () => {
  const prev = snap([project("x"), project("y")]);
  const cur = snap([project("x", {}, "x-2", 2), project("y", {}, "y-2", 40)]);
  cur.projects[1].activity!.latestCommit!.branch = "develop/0.5";
  const d = diffSnapshots(prev, cur);
  assert.deepEqual(d.progressed.map((g) => g.project.slug), ["y", "x"]);
  assert.equal(d.progressed[0].branch, "develop/0.5");
});

test("candidates are recent, untagged, unlisted and not ignored; newest first", () => {
  const listed = snap([project("onsite")]);
  const repos = [
    repo("older", { pushedAt: "2026-11-18T12:00:00Z" }),
    repo("fresh", { pushedAt: "2026-11-21T12:00:00Z" }),
    repo("onsite"),
    repo("tagged", { topics: ["puddings-world"] }),
    repo("stale", { pushedAt: "2026-09-01T12:00:00Z" }),
    repo("archived", { archived: true }),
    repo("forked", { fork: true }),
    repo(".github"),
    repo("Skipped"),
    repo("byowner"),
  ];
  const got = untaggedCandidates(repos, listed, ["skipped", "ME/ByOwner"], NOW);
  assert.deepEqual(got.map((r) => r.name), ["fresh", "older"]);
});

test("a quiet week renders nothing", () => {
  const same = snap([project("a")]);
  assert.equal(renderDigest(diffSnapshots(same, same), [], { from: same.fetchedAt, to: same.fetchedAt }, "x.json"), null);
});

test("candidates become the last numbered question with an opt-out", () => {
  const prev = snap([project("a")]);
  const cur = snap([project("a", {}, "a-2", 3)], "2026-11-23T12:00:00Z");
  const d = renderDigest(
    diffSnapshots(prev, cur),
    [repo("fresh"), repo("pub", { private: false, description: null })],
    { from: prev.fetchedAt, to: cur.fetchedAt },
    "C:/state/digest-ignore.json",
  );
  assert.ok(d);
  assert.equal(d.title, "網站每週專案摘要（11/23）");
  const lines = d.report.split("\n");
  const ask = lines.findIndex((l) => l.includes("哪幾個要放上網站"));
  assert.ok(ask > 0, "the question precedes the numbered list");
  assert.match(lines[ask + 1], /^1\. me\/fresh — about fresh（.*私有）$/);
  assert.match(lines[ask + 2], /^2\. me\/pub（[^私]*）$/);
  assert.equal(lines[ask + 3], "3. 以上都不對 → 回覆助理");
  assert.match(d.report, /A：「work on a」（本週 3 次提交）/);
  assert.match(d.instructions, /C:\/state\/digest-ignore\.json/);
});

test("only progress and no candidates still reports, without a question", () => {
  const prev = snap([project("a")]);
  const cur = snap([project("a", {}, "a-2")]);
  const d = renderDigest(diffSnapshots(prev, cur), [], { from: prev.fetchedAt, to: cur.fetchedAt }, "x.json");
  assert.ok(d);
  assert.doesNotMatch(d.report, /哪幾個/);
  assert.doesNotMatch(d.report, /本週 0 次/);
});
