import { Header } from "@/components/Header";
import { ProjectCard } from "@/components/ProjectCard";
import { TrackSection } from "@/components/TrackSection";
import { WorldMap } from "@/components/WorldMap";
import { now } from "@/content/now";
import { groupByTrack, loadProjects, spotlight } from "@/lib/projects";
import { layoutWorld } from "@/lib/world";

export const metadata = {
  title: "Projects",
  description: "A live dashboard of research code, tools, and side projects.",
};

export default async function ProjectsPage() {
  const { fetchedAt, projects } = await loadProjects();
  const tracks = groupByTrack(projects);
  const upFront = spotlight(projects);
  const liveCount = projects.filter((p) => p.status === "active").length;
  const shippedCount = projects.filter((p) => p.status === "shipped").length;
  const world = layoutWorld(projects, now.items, Date.now());

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <Header
        totalProjects={projects.length}
        live={liveCount}
        shipped={shippedCount}
        lastFetched={fetchedAt}
      />

      <section aria-labelledby="world" className="reveal mt-14">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2 border-b border-bg-border pb-3">
          <h2 id="world" className="text-xl font-semibold tracking-tight">
            The world so far
          </h2>
          <span className="text-xs text-ink-muted">
            lines are real integrations ·{" "}
            <span className="text-accent-amber">rings</span> are moving this week
          </span>
        </div>
        <WorldMap world={world} items={now.items} updated={now.updated} />
      </section>

      {upFront.length > 0 && (
        <section aria-labelledby="spotlight" className="mt-16">
          <div className="mb-6 flex items-baseline justify-between border-b border-bg-border pb-3">
            <h2 id="spotlight" className="text-xl font-semibold tracking-tight">
              Pinned &amp; recently active
            </h2>
            <span className="font-mono text-xs text-ink-muted">from GitHub</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {upFront.map((project) => (
              <ProjectCard key={project.slug} project={project} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-16 space-y-16">
        {tracks.map((track) => (
          <TrackSection key={track.slug} track={track} />
        ))}
      </div>

      <footer className="mt-24 border-t border-bg-border pt-6 text-xs text-ink-muted">
        Last refresh: <span className="font-mono">{fetchedAt ?? "never"}</span>
        {" · "}
        Weekly via GitHub Actions.
      </footer>
    </main>
  );
}
