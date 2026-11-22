"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { splitBold } from "@/lib/markup";
import type { TrackSlug } from "@/lib/types";
import {
  RING_INNER,
  RING_OUTER,
  WORLD_H,
  WORLD_REGIONS,
  WORLD_W,
  type WeekItem,
  type World,
  type WorldNode,
} from "@/lib/world";

const TRACK_COLOR: Record<TrackSlug, string> = {
  tool: "var(--color-accent)",
  research: "var(--color-accent-green)",
  side: "var(--color-accent-amber)",
};

function Rich({ text }: { text: string }) {
  return (
    <>
      {splitBold(text).map((seg, i) =>
        seg.bold ? (
          <strong key={i} className="font-semibold text-ink-primary">
            {seg.text}
          </strong>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

/** The first bolded phrase of a note, else its first sentence: the one-line gist. */
function gist(note: string): string {
  const bold = splitBold(note).find((s) => s.bold)?.text;
  if (bold) return bold;
  const sentence = note.split(/(?<=[.!?])\s/)[0];
  return sentence.length > 110 ? `${sentence.slice(0, 109)}…` : sentence;
}

export function WorldMap({
  world,
  items,
  updated,
}: {
  world: World;
  items: WeekItem[];
  updated: string;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const bySlug = useMemo(() => new Map(world.nodes.map((n) => [n.slug, n])), [world.nodes]);
  const neighbours = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of world.edges) {
      m.set(e.from, (m.get(e.from) ?? new Set()).add(e.to));
      m.set(e.to, (m.get(e.to) ?? new Set()).add(e.from));
    }
    return m;
  }, [world.edges]);

  const focused = focus ? bySlug.get(focus) : undefined;
  const lit = (slug: string) => !focus || slug === focus || neighbours.get(focus)?.has(slug);
  const firstNodeOf = (i: number) => world.nodes.find((n) => n.week.includes(i))?.slug ?? null;

  return (
    <figure className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="relative min-w-0" onMouseLeave={() => setFocus(null)}>
        <svg
          viewBox={`0 0 ${WORLD_W} ${WORLD_H}`}
          className="world h-auto w-full"
          role="group"
          aria-label="Map of the projects in this world: the hub in the middle, tools, research and side worlds around it"
        >
          <defs>
            <radialGradient id="world-core-glow">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
            </radialGradient>
          </defs>
          {[RING_INNER, RING_OUTER].map((r) => (
            <circle
              key={r}
              cx={WORLD_W / 2}
              cy={WORLD_H / 2}
              r={r}
              fill="none"
              stroke="var(--color-bg-border)"
              strokeDasharray="2 10"
            />
          ))}
          {world.regions.map((r) => (
            <g key={r.track} aria-hidden>
              <path d={r.d} fill="none" stroke={TRACK_COLOR[r.track]} strokeOpacity={0.35} strokeWidth={2} />
              <text
                x={r.x}
                y={r.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="world-region max-sm:hidden"
                fill={TRACK_COLOR[r.track]}
              >
                {r.title.toUpperCase()}
              </text>
            </g>
          ))}
          {world.edges.map((e) => {
            const on = focus === e.from || focus === e.to;
            return (
              <path
                key={`${e.from}-${e.to}`}
                d={e.d}
                pathLength={1}
                className="world-edge"
                fill="none"
                stroke="var(--color-accent)"
                strokeOpacity={on ? 0.9 : focus ? 0.12 : 0.4}
                strokeWidth={on ? 3 : 1.5}
              />
            );
          })}
          {world.nodes.map((n, i) => (
            <Node
              key={n.slug}
              node={n}
              index={i}
              dim={!lit(n.slug)}
              onFocus={() => setFocus(n.slug)}
            />
          ))}
        </svg>
      </div>

      <figcaption className="min-w-0 rounded-xl border border-bg-border bg-bg-panel p-5 text-sm" aria-live="polite">
        {focused ? (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: TRACK_COLOR[focused.track] }}>
              {focused.core ? "the hub" : WORLD_REGIONS.find((r) => r.track === focused.track)?.title}
              {focused.activeThisWeek && <span className="ml-2 text-accent-amber">· moving this week</span>}
            </p>
            <h3 className="mt-2 text-lg font-semibold tracking-tight">{focused.title}</h3>
            <p className="mt-2 leading-relaxed text-ink-secondary">{focused.tagline}</p>
            {focused.week.map((i) => (
              <p key={i} className="mt-3 border-l-2 border-accent-amber/60 pl-3 leading-relaxed text-ink-secondary">
                <Rich text={items[i].note} />
              </p>
            ))}
            {(neighbours.get(focused.slug)?.size ?? 0) > 0 && (
              <p className="mt-3 text-xs text-ink-muted">
                Linked with{" "}
                {[...neighbours.get(focused.slug)!].map((s) => bySlug.get(s)?.title ?? s).join(", ")}
              </p>
            )}
            <Link href={`/projects/${focused.slug}`} className="mt-4 inline-block font-mono text-xs text-accent hover:underline">
              open project →
            </Link>
          </div>
        ) : (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-amber">
              latest dispatch · {updated}
            </p>
            <ul className="mt-3 space-y-3">
              {items.map((item, i) => {
                const slug = firstNodeOf(i);
                return (
                  <li key={item.title}>
                    {slug ? (
                      <button
                        type="button"
                        className="text-left"
                        onMouseEnter={() => setFocus(slug)}
                        onFocus={() => setFocus(slug)}
                        onClick={() => setFocus(slug)}
                      >
                        <span className="font-medium text-ink-primary">{item.title}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{gist(item.note)}</span>
                      </button>
                    ) : (
                      <>
                        <span className="font-medium text-ink-primary">{item.title}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{gist(item.note)}</span>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-xs text-ink-muted">Point at a node to see what it is and how it connects.</p>
          </div>
        )}
      </figcaption>

      <nav aria-label="Projects by region" className="space-y-4 sm:hidden">
        {WORLD_REGIONS.map((r) => {
          const nodes = world.nodes.filter((n) => !n.core && n.track === r.track);
          if (!nodes.length) return null;
          return (
            <div key={r.track}>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: TRACK_COLOR[r.track] }}>
                {r.title}
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {nodes.map((n) => (
                  <li key={n.slug}>
                    <Link
                      href={`/projects/${n.slug}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-bg-border bg-bg-panel px-3 py-1 text-xs text-ink-secondary"
                    >
                      {n.activeThisWeek && <span className="h-1.5 w-1.5 rounded-full bg-accent-amber" aria-label="moving this week" />}
                      {n.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </figure>
  );
}

function Node({
  node,
  index,
  dim,
  onFocus,
}: {
  node: WorldNode;
  index: number;
  dim: boolean;
  onFocus: () => void;
}) {
  const color = node.core ? "var(--color-accent)" : TRACK_COLOR[node.track];
  const r = node.core ? 30 : 9;
  return (
    <a
      href={`/projects/${node.slug}`}
      aria-label={`${node.title}: ${node.tagline}`}
      onMouseEnter={onFocus}
      onFocus={onFocus}
      className="world-node-link"
    >
      <g
        className="world-node"
        style={{ ["--i" as string]: index, opacity: dim ? 0.3 : node.status === "paused" ? 0.55 : 1 }}
      >
        {node.core && <circle cx={node.x} cy={node.y} r={110} fill="url(#world-core-glow)" />}
        {node.activeThisWeek && (
          <circle
            cx={node.x}
            cy={node.y}
            r={r + 9}
            fill="none"
            stroke="var(--color-accent-amber)"
            strokeWidth={2}
            className="world-pulse"
          />
        )}
        <circle cx={node.x} cy={node.y} r={r + 14} fill="transparent" />
        <circle cx={node.x} cy={node.y} r={r} fill={color} />
        <text
          x={node.labelX}
          y={node.labelY}
          textAnchor={node.anchor}
          className={node.core ? "world-label world-label-core" : "world-label max-sm:hidden"}
        >
          {node.label}
        </text>
      </g>
    </a>
  );
}
