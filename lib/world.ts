import type { Project, ProjectStatus, TrackSlug } from "./types";

/** The world map's SVG coordinate space. */
export const WORLD_W = 1200;
export const WORLD_H = 1000;
const CX = WORLD_W / 2;
const CY = WORLD_H / 2;
/** Inner and outer ring; neighbours in a region alternate so labels clear each other. */
export const RING_INNER = 235;
export const RING_OUTER = 335;
const REGION_LABEL_R = 455;
const REGION_GAP = 0.16;
/** Labels longer than this are cut; the side panel shows the full title. */
export const LABEL_MAX = 18;
const WEEK_MS = 7 * 24 * 3600 * 1000;
/** Label metrics in SVG units (font-size 22): rough glyph width, line height, gap to the dot. */
export const LABEL_CHAR_W = 11.5;
export const LABEL_LINE = 28;
const LABEL_GAP = 18;
const MAX_CONNECTS = 20;

export const WORLD_REGIONS: { track: TrackSlug; title: string }[] = [
  { track: "tool", title: "Tools & agents" },
  { track: "research", title: "Research" },
  { track: "side", title: "Side worlds" },
];

/** One item of the weekly summary (content/now.ts), as far as the map cares. */
export type WeekItem = { title: string; note: string; href?: string; projects?: string[] };

export type WorldNode = {
  slug: string;
  title: string;
  label: string;
  tagline: string;
  track: TrackSlug;
  status: ProjectStatus;
  core: boolean;
  activeThisWeek: boolean;
  /** Indices into the week items that mention this project. */
  week: number[];
  x: number;
  y: number;
  anchor: "start" | "end" | "middle";
  /** Where the label's baseline starts, after labels are pushed apart. */
  labelX: number;
  labelY: number;
};

export type WorldEdge = { from: string; to: string; d: string };
export type WorldRegion = { track: TrackSlug; title: string; x: number; y: number; d: string };
export type World = { nodes: WorldNode[]; edges: WorldEdge[]; regions: WorldRegion[] };

/** `connects` from a manifest: lowercase slugs, deduplicated, junk dropped. */
export function normalizeConnects(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const slugs = [
    ...new Set(
      value
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().toLowerCase())
        .filter((v) => /^[a-z0-9][a-z0-9._-]*$/.test(v)),
    ),
  ].slice(0, MAX_CONNECTS);
  return slugs.length ? slugs : undefined;
}

export function activeThisWeek(p: Project, now: number): boolean {
  if ((p.activity?.weeklyCommits ?? 0) > 0) return true;
  const pushed = p.activity?.pushedAt ?? p.activity?.latestCommit?.date;
  return pushed ? now - Date.parse(pushed) <= WEEK_MS : false;
}

/**
 * Which projects each weekly item talks about: its `projects` slugs, else a
 * `/projects/<slug>` href, else a title that names the project.
 */
export function weekLinks(items: WeekItem[], projects: Project[]): Map<string, number[]> {
  const bySlug = new Map(projects.map((p) => [p.slug, p]));
  const byTitle = new Map(projects.map((p) => [p.title.toLowerCase(), p.slug]));
  const links = new Map<string, number[]>();
  const add = (slug: string, i: number) => {
    if (!bySlug.has(slug)) return;
    const list = links.get(slug) ?? [];
    if (!list.includes(i)) list.push(i);
    links.set(slug, list);
  };
  items.forEach((item, i) => {
    if (item.projects?.length) {
      for (const s of item.projects) add(s.toLowerCase(), i);
      return;
    }
    const href = item.href?.match(/^\/projects\/([^/?#]+)/);
    if (href) return add(href[1].toLowerCase(), i);
    const slug = byTitle.get(item.title.toLowerCase()) ?? item.title.toLowerCase();
    add(slug, i);
  });
  return links;
}

/** Undirected links between projects on the map, from `connects` and internal project links. */
export function worldEdges(projects: Project[]): [string, string][] {
  const present = new Set(projects.map((p) => p.slug));
  const seen = new Set<string>();
  const edges: [string, string][] = [];
  for (const p of projects) {
    const targets = [
      ...(p.connects ?? []),
      ...p.links.flatMap((l) => l.href.match(/^\/projects\/([^/?#]+)$/)?.[1] ?? []),
    ];
    for (const t of targets) {
      if (t === p.slug || !present.has(t)) continue;
      const key = [p.slug, t].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([p.slug, t]);
    }
  }
  return edges;
}

function truncate(title: string): string {
  return title.length > LABEL_MAX ? `${title.slice(0, LABEL_MAX - 1).trimEnd()}…` : title;
}

const round = (n: number) => Math.round(n * 10) / 10;

function polar(r: number, angle: number): [number, number] {
  return [round(CX + r * Math.cos(angle)), round(CY + r * Math.sin(angle))];
}

function arc(r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
}

/**
 * Lays the projects out as a radial world: the `core` project in the middle,
 * one sector per track (sized by how many projects it holds), active projects
 * first inside each sector, alternating between two rings. Archived projects
 * stay off the map. Links curve through the middle so they read as routes.
 */
export function layoutWorld(projects: Project[], items: WeekItem[], now: number): World {
  const shown = projects.filter((p) => p.status !== "archived");
  const week = weekLinks(items, shown);
  const core = shown.find((p) => p.core);
  const node = (p: Project, x: number, y: number, anchor: WorldNode["anchor"]): WorldNode => ({
    slug: p.slug,
    title: p.title,
    label: truncate(p.title),
    tagline: p.tagline,
    track: p.track,
    status: p.status,
    core: p === core,
    activeThisWeek: activeThisWeek(p, now),
    week: week.get(p.slug) ?? [],
    x,
    y,
    anchor,
    labelX: p === core ? x : x + (anchor === "start" ? LABEL_GAP : anchor === "end" ? -LABEL_GAP : 0),
    labelY: p === core ? y + 62 : anchor === "middle" ? (y < CY ? y - 22 : y + 34) : y + 7,
  });

  const groups = WORLD_REGIONS.map((r) => ({
    ...r,
    projects: shown
      .filter((p) => p !== core && p.track === r.track)
      .sort(
        (a, b) =>
          Number(activeThisWeek(b, now)) - Number(activeThisWeek(a, now)) ||
          (b.activity?.pushedAt ?? "").localeCompare(a.activity?.pushedAt ?? ""),
      ),
  })).filter((g) => g.projects.length);

  const total = groups.reduce((n, g) => n + g.projects.length, 0);
  const span = 2 * Math.PI - REGION_GAP * groups.length;
  const nodes: WorldNode[] = core ? [node(core, CX, CY, "middle")] : [];
  const regions: WorldRegion[] = [];
  let angle = -Math.PI / 2 + REGION_GAP / 2;
  for (const g of groups) {
    const width = (span * g.projects.length) / total;
    const n = g.projects.length;
    g.projects.forEach((p, i) => {
      const a = angle + (width * (i + 0.5)) / n;
      const r = n <= 3 ? (RING_INNER + RING_OUTER) / 2 : i % 2 ? RING_OUTER : RING_INNER;
      const [x, y] = polar(r, a);
      const anchor = x > CX + 40 ? "start" : x < CX - 40 ? "end" : "middle";
      nodes.push(node(p, x, y, anchor));
    });
    const [lx, ly] = polar(REGION_LABEL_R, angle + width / 2);
    regions.push({ track: g.track, title: g.title, x: lx, y: ly, d: arc(REGION_LABEL_R - 30, angle, angle + width) });
    angle += width + REGION_GAP;
  }

  separateLabels(nodes.filter((n) => !n.core));
  const at = new Map(nodes.map((n) => [n.slug, n]));
  const edges = worldEdges(shown).map(([from, to]) => {
    const a = at.get(from)!;
    const b = at.get(to)!;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const [qx, qy] = [round(mx + (CX - mx) * 0.45), round(my + (CY - my) * 0.45)];
    return { from, to, d: `M${a.x} ${a.y} Q${qx} ${qy} ${b.x} ${b.y}` };
  });
  return { nodes, edges, regions };
}

/** Horizontal extent of a node's label, in SVG units. */
export function labelSpan(n: WorldNode): [number, number] {
  const w = n.label.length * LABEL_CHAR_W;
  if (n.anchor === "start") return [n.labelX, n.labelX + w];
  if (n.anchor === "end") return [n.labelX - w, n.labelX];
  return [n.labelX - w / 2, n.labelX + w / 2];
}

/** Pushes labels whose boxes would overlap apart vertically, a few units at a time. */
function separateLabels(nodes: WorldNode[]): void {
  for (let pass = 0; pass < 200; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const [a0, a1] = labelSpan(a);
        const [b0, b1] = labelSpan(b);
        const dy = b.labelY - a.labelY;
        if (a1 <= b0 || b1 <= a0 || Math.abs(dy) >= LABEL_LINE) continue;
        const push = (LABEL_LINE - Math.abs(dy)) / 2 + 0.5;
        const dir = dy >= 0 ? 1 : -1;
        a.labelY = round(a.labelY - dir * push);
        b.labelY = round(b.labelY + dir * push);
        moved = true;
      }
    }
    if (!moved) return;
  }
}
