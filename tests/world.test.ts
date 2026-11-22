import { test } from "node:test";
import assert from "node:assert/strict";
import type { Project, TrackSlug } from "../lib/types";
import {
  activeThisWeek,
  LABEL_LINE,
  LABEL_MAX,
  labelSpan,
  layoutWorld,
  normalizeConnects,
  weekLinks,
  worldEdges,
  WORLD_H,
  WORLD_W,
} from "../lib/world";

const NOW = Date.parse("2026-11-22T12:00:00Z");

function project(slug: string, track: TrackSlug, over: Partial<Project> = {}): Project {
  return {
    slug,
    title: slug,
    tagline: `${slug} tagline`,
    track,
    status: "active",
    repo: { owner: "me", name: slug, private: false },
    topics: [],
    links: [],
    featured: false,
    activity: {
      stars: 0,
      openIssues: 0,
      defaultBranch: "main",
      pushedAt: "2026-10-01T00:00:00Z",
      weeklyCommits: 0,
    },
    ...over,
  };
}

test("connects keeps clean, unique, lowercase slugs and drops the rest", () => {
  assert.deepEqual(normalizeConnects(["Paperfact", "paperfact", " mapetite ", "", 3, "../x", "a b"]), [
    "paperfact",
    "mapetite",
  ]);
  assert.equal(normalizeConnects("paperfact"), undefined);
  assert.equal(normalizeConnects([]), undefined);
});

test("a project is moving this week with commits in the window or a push within 7 days", () => {
  const quiet = project("q", "tool");
  assert.equal(activeThisWeek(quiet, NOW), false);
  assert.equal(activeThisWeek({ ...quiet, activity: { ...quiet.activity!, weeklyCommits: 3 } }, NOW), true);
  assert.equal(
    activeThisWeek({ ...quiet, activity: { ...quiet.activity!, pushedAt: "2026-11-20T00:00:00Z" } }, NOW),
    true,
  );
});

test("weekly items find their projects by slug list, then href, then title", () => {
  const ps = [project("paperfact", "tool", { title: "Paperfact" }), project("kaikou-claude", "tool"), project("clip-claude", "tool")];
  const links = weekLinks(
    [
      { title: "Agent companions", note: "", projects: ["kaikou-claude", "clip-claude", "ghost"] },
      { title: "Something", note: "", href: "/projects/kaikou-claude" },
      { title: "paperfact", note: "" },
      { title: "A startup", note: "" },
    ],
    ps,
  );
  assert.deepEqual(links.get("kaikou-claude"), [0, 1]);
  assert.deepEqual(links.get("clip-claude"), [0]);
  assert.deepEqual(links.get("paperfact"), [2]);
  assert.equal(links.has("ghost"), false);
});

test("edges come from connects and internal project links, once per pair, only between shown projects", () => {
  const ps = [
    project("hub", "tool", { connects: ["a", "b", "missing", "hub"], links: [{ label: "a", href: "/projects/a" }] }),
    project("a", "tool", { connects: ["hub"] }),
    project("b", "research", { links: [{ label: "site", href: "https://example.com" }] }),
  ];
  assert.deepEqual(worldEdges(ps), [
    ["hub", "a"],
    ["hub", "b"],
  ]);
});

test("the core sits in the middle and every other shown project lands inside the canvas", () => {
  const ps = [
    project("hub", "tool", { core: true, connects: ["r1", "s1"] }),
    ...Array.from({ length: 9 }, (_, i) => project(`t${i}`, "tool")),
    project("r1", "research"),
    project("r2", "research"),
    project("s1", "side"),
    project("old", "side", { status: "archived" }),
  ];
  const world = layoutWorld(ps, [], NOW);
  const hub = world.nodes.find((n) => n.slug === "hub")!;
  assert.equal(hub.core, true);
  assert.deepEqual([hub.x, hub.y], [WORLD_W / 2, WORLD_H / 2]);
  assert.equal(world.nodes.length, 13, "archived projects stay off the map");
  for (const n of world.nodes) {
    assert.ok(n.x > 0 && n.x < WORLD_W && n.y > 0 && n.y < WORLD_H, `${n.slug} inside`);
  }
  assert.deepEqual(world.regions.map((r) => r.track), ["tool", "research", "side"]);
  assert.equal(world.edges.length, 2);
  assert.match(world.edges[0].d, /^M600 500 Q/);
});

test("active projects come first in their region and long titles are cut for the label", () => {
  const long = "A very long project title indeed";
  const ps = [
    project("quiet", "research"),
    project("busy", "research", { title: long, activity: { ...project("x", "tool").activity!, weeklyCommits: 4 } }),
  ];
  const world = layoutWorld(ps, [{ title: long, note: "this week" }], NOW);
  assert.deepEqual(world.nodes.map((n) => n.slug), ["busy", "quiet"]);
  const busy = world.nodes[0];
  assert.equal(busy.activeThisWeek, true);
  assert.equal(busy.label.length, LABEL_MAX);
  assert.ok(busy.label.endsWith("…"));
  assert.deepEqual(busy.week, [0]);
});

test("no projects, no map: nothing to place and nothing to draw", () => {
  assert.deepEqual(layoutWorld([], [], NOW), { nodes: [], edges: [], regions: [] });
});

test("labels never overlap, even in a crowded region with long titles", () => {
  const titles = [
    "StreetPerformerMaster",
    "mapetite",
    "reverse-turing-test",
    "InvisibleGo",
    "San11 Smart AI",
    "CatAR Homepage",
    "SofaTearing",
    "EPG-LatentFlow",
    "PPG-PulseFlowBP",
    "FlowFusionBP",
  ];
  const ps = [
    project("hub", "tool", { core: true }),
    ...titles.map((t, i) => project(`s${i}`, "side", { title: t })),
    ...Array.from({ length: 12 }, (_, i) => project(`t${i}`, "tool", { title: `visual-impression-${i}` })),
  ];
  const nodes = layoutWorld(ps, [], NOW).nodes.filter((n) => !n.core);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const [a0, a1] = labelSpan(nodes[i]);
      const [b0, b1] = labelSpan(nodes[j]);
      const apart = a1 <= b0 || b1 <= a0 || Math.abs(nodes[i].labelY - nodes[j].labelY) >= LABEL_LINE;
      assert.ok(apart, `${nodes[i].label} / ${nodes[j].label}`);
    }
  }
});
