// Weekly /projects digest for the owner's Assistant Hub. Runs on the owner's
// PC (not in CI): the candidate list names private repos, which must not land
// in this public repo's Actions logs. Compares the site's last two weekly
// snapshots, lists recently active repos that are not on the site yet, and
// files one hub task per week whose candidates the owner ticks.
//
//   npx tsx scripts/weekly-digest.ts            # report to the hub
//   npx tsx scripts/weekly-digest.ts --dry-run  # print only, change nothing

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
  diffSnapshots,
  renderDigest,
  untaggedCandidates,
  type OwnedRepo,
} from "../lib/digest";
import type { ProjectsSnapshot } from "../lib/types";

const ROOT = path.resolve(import.meta.dirname, "..");
const SNAPSHOT = "data/projects.json";
const BASELINE_DAYS = 6;
const HUB_PROJECT = "puddings-world";
const SITE_PROJECTS = "https://puddings-world.com/projects";

function stateDir(): string {
  if (process.env.PW_DIGEST_HOME) return process.env.PW_DIGEST_HOME;
  if (process.platform === "win32" && process.env.LOCALAPPDATA)
    return path.join(process.env.LOCALAPPDATA, "puddings-world");
  return path.join(process.env.XDG_STATE_HOME ?? path.join(homedir(), ".local", "state"), "puddings-world");
}

function hubClient(): string {
  return (
    process.env.ASSISTANT_HUB_CLIENT ??
    path.join(homedir(), ".claude", "skills", "assistant", "scripts", "hub_client.py")
  );
}

function run(cmd: string, args: string[], input?: string): string {
  return execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    input,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
}

function readJson<T>(file: string, fallback: T): T {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback;
}

function snapshotAt(ref: string): ProjectsSnapshot {
  return JSON.parse(run("git", ["show", `${ref}:${SNAPSHOT}`])) as ProjectsSnapshot;
}

/** The snapshot last reported, else the newest one at least BASELINE_DAYS old. */
function baselineRef(lastReported: string | undefined): string {
  if (lastReported) return lastReported;
  const before = new Date(Date.now() - BASELINE_DAYS * 24 * 3600 * 1000).toISOString();
  const sha = run("git", ["log", "origin/main", "-1", "--format=%H", `--before=${before}`, "--", SNAPSHOT]).trim();
  if (!sha) throw new Error(`No ${SNAPSHOT} older than ${BASELINE_DAYS} days on origin/main.`);
  return sha;
}

type RepoResponse = {
  name: string;
  owner: { login: string };
  description: string | null;
  pushed_at: string;
  topics?: string[];
  archived: boolean;
  fork: boolean;
  private: boolean;
};

function ownedRepos(): OwnedRepo[] {
  const pages = JSON.parse(
    run("gh", ["api", "--paginate", "--slurp", "user/repos?affiliation=owner,organization_member&per_page=100"]),
  ) as RepoResponse[][];
  return pages.flat().map((r) => ({
    owner: r.owner.login,
    name: r.name,
    description: r.description,
    pushedAt: r.pushed_at,
    topics: r.topics ?? [],
    archived: r.archived,
    fork: r.fork,
    private: r.private,
  }));
}

function hubPost(route: string, body: unknown): { id: string } {
  const python = process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");
  const out = run(python, ["-X", "utf8", hubClient(), "post", route, "--json-file", "-"], JSON.stringify(body));
  return JSON.parse(out) as { id: string };
}

function weekKey(d: Date): string {
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const dir = stateDir();
  const stateFile = path.join(dir, "digest-state.json");
  const ignoreFile = path.join(dir, "digest-ignore.json");
  const state = readJson<{ lastReported?: string }>(stateFile, {});
  const ignore = readJson<string[]>(ignoreFile, []);

  run("git", ["fetch", "--quiet", "origin", "main"]);
  const head = run("git", ["rev-parse", "origin/main"]).trim();
  const from = baselineRef(state.lastReported);
  const prev = snapshotAt(from);
  const cur = snapshotAt(head);
  const now = new Date();

  const digest = renderDigest(
    diffSnapshots(prev, cur),
    untaggedCandidates(ownedRepos(), cur, ignore, now),
    { from: prev.fetchedAt, to: cur.fetchedAt },
    ignoreFile,
  );

  if (!digest) {
    console.log("Nothing new on /projects and no new repos: nothing to report.");
  } else if (dryRun) {
    console.log(`${digest.title}\n\n${digest.report}\n\n---\n${digest.instructions}`);
  } else {
    const task = hubPost("/api/tasks", {
      title: digest.title,
      domain: "work",
      project_id: HUB_PROJECT,
      idempotency_key: `${HUB_PROJECT}:weekly-digest:${weekKey(now)}`,
      resources: [
        { label: "/projects", kind: "url", target: SITE_PROJECTS },
        { label: "處理方式", kind: "note", target: digest.instructions },
      ],
    });
    hubPost(`/api/tasks/${task.id}/report`, { note: digest.report });
    console.log(`Reported to Assistant Hub as ${task.id}.`);
  }

  if (!dryRun) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(stateFile, `${JSON.stringify({ lastReported: head }, null, 2)}\n`, "utf8");
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
