import type { Project, ProjectsSnapshot, ProjectStatus } from "./types";

/** The repo topic that puts a repo on the site (mirrors scripts/fetch-projects.ts). */
export const MARKER_TOPIC = "puddings-world";
/** A repo counts as newly active when it was pushed within this many days. */
export const CANDIDATE_WINDOW_DAYS = 30;

export type Progress = { project: Project; message: string; branch?: string; weeklyCommits: number };

export type SnapshotDiff = {
  added: Project[];
  removed: Project[];
  progressed: Progress[];
  statusChanged: { project: Project; from: ProjectStatus; to: ProjectStatus }[];
};

/** A repo the owner can see, as read from GitHub. */
export type OwnedRepo = {
  owner: string;
  name: string;
  description: string | null;
  pushedAt: string;
  topics: string[];
  archived: boolean;
  fork: boolean;
  private: boolean;
};

const repoKey = (owner: string, name: string) => `${owner}/${name}`.toLowerCase();

/** What changed on /projects between two weekly snapshots. */
export function diffSnapshots(prev: ProjectsSnapshot, cur: ProjectsSnapshot): SnapshotDiff {
  const before = new Map(prev.projects.map((p) => [p.slug, p]));
  const after = new Map(cur.projects.map((p) => [p.slug, p]));
  const diff: SnapshotDiff = { added: [], removed: [], progressed: [], statusChanged: [] };
  for (const p of cur.projects) {
    const old = before.get(p.slug);
    if (!old) {
      diff.added.push(p);
      continue;
    }
    const head = p.activity?.latestCommit;
    if (head && head.sha !== old.activity?.latestCommit?.sha) {
      diff.progressed.push({
        project: p,
        message: head.message,
        branch: head.branch,
        weeklyCommits: p.activity?.weeklyCommits ?? 0,
      });
    }
    if (p.status !== old.status) diff.statusChanged.push({ project: p, from: old.status, to: p.status });
  }
  for (const p of prev.projects) if (!after.has(p.slug)) diff.removed.push(p);
  diff.progressed.sort((a, b) => b.weeklyCommits - a.weeklyCommits);
  return diff;
}

/**
 * Repos that recently saw work but are neither on the site nor deliberately
 * left off it: the owner's chance to say whether a new project should be shown.
 * `ignore` holds `owner/name` or bare names, case-insensitive.
 */
export function untaggedCandidates(
  repos: OwnedRepo[],
  listed: ProjectsSnapshot,
  ignore: string[],
  now: Date,
  windowDays = CANDIDATE_WINDOW_DAYS,
): OwnedRepo[] {
  const skip = new Set(ignore.map((s) => s.toLowerCase()));
  const shown = new Set(listed.projects.map((p) => repoKey(p.repo.owner, p.repo.name)));
  const cutoff = now.getTime() - windowDays * 24 * 3600 * 1000;
  return repos
    .filter(
      (r) =>
        !r.archived &&
        !r.fork &&
        !r.name.startsWith(".") &&
        !r.topics.includes(MARKER_TOPIC) &&
        !shown.has(repoKey(r.owner, r.name)) &&
        !skip.has(r.name.toLowerCase()) &&
        !skip.has(repoKey(r.owner, r.name)) &&
        Date.parse(r.pushedAt) >= cutoff,
    )
    .sort((a, b) => b.pushedAt.localeCompare(a.pushedAt));
}

const md = (iso: string | null) => {
  if (!iso) return "?";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export type Digest = { title: string; report: string; instructions: string };

/**
 * The hub report, in the owner's language. Candidates come last as a numbered
 * question so the hub renders them as checkboxes. Nothing to say → null, so
 * a quiet week posts nothing.
 */
export function renderDigest(
  diff: SnapshotDiff,
  candidates: OwnedRepo[],
  range: { from: string | null; to: string | null },
  ignoreFile: string,
): Digest | null {
  const quiet =
    !diff.added.length &&
    !diff.removed.length &&
    !diff.progressed.length &&
    !diff.statusChanged.length &&
    !candidates.length;
  if (quiet) return null;

  const lines = [`網站 /projects 更新（${md(range.from)} → ${md(range.to)}）`];
  if (diff.added.length) {
    lines.push("", "新上網站：");
    for (const p of diff.added) lines.push(`- ${p.title}（${p.track}）`);
  }
  if (diff.progressed.length) {
    lines.push("", "有進度：");
    for (const g of diff.progressed) {
      const where = g.branch ? `${g.branch} · ` : "";
      const count = g.weeklyCommits ? `（本週 ${g.weeklyCommits} 次提交）` : "";
      lines.push(`- ${g.project.title}：${where}「${g.message}」${count}`);
    }
  }
  if (diff.statusChanged.length) {
    lines.push("", "狀態變化：");
    for (const s of diff.statusChanged) lines.push(`- ${s.project.title}：${s.from} → ${s.to}`);
  }
  if (diff.removed.length) {
    lines.push("", "從網站消失（topic 被拿掉或 repo 讀不到）：");
    for (const p of diff.removed) lines.push(`- ${p.title}`);
  }
  if (candidates.length) {
    lines.push("", "最近有在動、還沒上網站的 repo，哪幾個要放上網站？");
    candidates.forEach((r, i) => {
      const about = r.description ? ` — ${r.description}` : "";
      lines.push(`${i + 1}. ${r.owner}/${r.name}${about}（${md(r.pushedAt)} 更新${r.private ? "，私有" : ""}）`);
    });
    lines.push(`${candidates.length + 1}. 以上都不對 → 回覆助理`);
  }

  return {
    title: `網站每週專案摘要（${md(range.to)}）`,
    report: lines.join("\n"),
    instructions: [
      "勾選的 repo：加上 puddings-world 和分類 topic（research / tool / side-project），需要時補 .puddings.json（公開文案，私有 repo 也會顯示），然後手動觸發 Fetch GitHub projects workflow。",
      `沒勾的 repo：把 owner/name 加進 ${ignoreFile}，之後的摘要不再列出。`,
      "改 topic 和文案前照本人的勾選與回覆，不自行擴大範圍。",
    ].join("\n"),
  };
}
