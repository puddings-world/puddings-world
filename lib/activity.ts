/** A commit as the fetcher sees it, whichever branch it came from. */
export type BranchCommit = { sha: string; url: string; message: string; date: string };

export type BranchLog = { branch: string; commits: BranchCommit[] };

/** Branches read per repo; the default branch is always among them. */
export const MAX_BRANCHES = 30;

export type BranchActivity = {
  weeklyCommits: number;
  latestCommit?: BranchCommit & { branch?: string };
};

/**
 * Activity across every branch: work on a feature or develop branch counts
 * as progress even before it reaches the default branch. A commit reachable
 * from several branches counts once, and the latest one names its branch
 * only when that is not the default branch (preferring the default on ties).
 */
export function branchActivity(
  logs: BranchLog[],
  defaultBranch: string,
  since: string,
): BranchActivity {
  const ordered = [...logs].sort(
    (a, b) => Number(b.branch === defaultBranch) - Number(a.branch === defaultBranch),
  );
  const weekly = new Set<string>();
  let latest: (BranchCommit & { branch: string }) | undefined;
  for (const { branch, commits } of ordered) {
    for (const c of commits) {
      if (c.date >= since) weekly.add(c.sha);
      if (!latest || c.date > latest.date) latest = { ...c, branch };
    }
  }
  if (!latest) return { weeklyCommits: weekly.size };
  const { branch, ...commit } = latest;
  return {
    weeklyCommits: weekly.size,
    latestCommit: branch === defaultBranch ? commit : { ...commit, branch },
  };
}

/** Which branches to read: the default first, then the rest in listed order. */
export function branchesToRead(names: string[], defaultBranch: string): string[] {
  const rest = names.filter((n) => n !== defaultBranch);
  return [defaultBranch, ...rest].slice(0, MAX_BRANCHES);
}
