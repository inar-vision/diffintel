import { execFileSync, execFile as execFileCb } from "child_process";
import { promisify } from "util";
import { FileDiff, FileHistoryEntry, FileStatus } from "./types";

const execFileAsync = promisify(execFileCb);

/**
 * Run up to `limit` async tasks concurrently from `items`.
 */
export async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Async version of getDiff — parallelizes git calls for speed on large PRs.
 */
export async function getDiffAsync(
  baseRef: string,
  headRef?: string,
  concurrency: number = 20,
): Promise<{ files: FileDiff[]; rawDiff: string }> {
  const rangeArgs = headRef ? [`${baseRef}...${headRef}`] : [baseRef];

  // Run the two upfront calls in parallel
  const [nameStatusResult, rawDiffResult] = await Promise.all([
    execFileAsync("git", ["diff", "--name-status", ...rangeArgs], { encoding: "utf-8" }),
    execFileAsync("git", ["diff", ...rangeArgs], { encoding: "utf-8" }),
  ]);

  const nameStatus = nameStatusResult.stdout;
  const rawDiff = rawDiffResult.stdout;

  const fileStatuses = parseNameStatus(nameStatus);
  const fileDiffs = parseDiffText(rawDiff);

  // Per-file calls in parallel with concurrency limit
  const merged = await parallelLimit(fileStatuses, concurrency, async (fs) => {
    const diff = fileDiffs.find((d) => d.path === fs.path) || {
      path: fs.path,
      hunks: "",
      additions: 0,
      deletions: 0,
    };

    // Per-file git calls in parallel
    const [oldContent, newContent, recentHistory] = await Promise.all([
      fs.status !== "added"
        ? getFileContentAsync(baseRef, fs.oldPath || fs.path)
        : Promise.resolve(undefined),
      fs.status !== "deleted"
        ? getFileContentAsync(headRef || "HEAD", fs.path)
        : Promise.resolve(undefined),
      getFileHistoryAsync(fs.oldPath || fs.path, baseRef),
    ]);

    return {
      path: fs.path,
      oldPath: fs.oldPath,
      status: fs.status,
      hunks: diff.hunks,
      oldContent,
      newContent,
      additions: diff.additions,
      deletions: diff.deletions,
      recentHistory,
    } as FileDiff;
  });

  return { files: merged, rawDiff };
}

async function getFileContentAsync(ref: string, filePath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["show", `${ref}:${filePath}`], { encoding: "utf-8" });
    return stdout;
  } catch {
    return undefined;
  }
}

async function getFileHistoryAsync(filePath: string, upToRef: string, count: number = 5): Promise<FileHistoryEntry[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["log", `--format=%h|%s|%cr`, `-${count}`, upToRef, "--", filePath],
      { encoding: "utf-8" },
    );
    const entries = stdout.trim().split("\n").filter(Boolean).map((line) => {
      const [hash, message, age] = line.split("|");
      return { hash, message, age } as FileHistoryEntry;
    });

    if (entries.length > 0) {
      entries[0].diff = await getCommitFileDiffAsync(entries[0].hash, filePath);
    }

    return entries;
  } catch {
    return [];
  }
}

async function getCommitFileDiffAsync(hash: string, filePath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", `${hash}~1..${hash}`, "--", filePath],
      { encoding: "utf-8" },
    );
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Get the unified diff between two refs.
 * If headRef is omitted, diffs against the working tree.
 */
export function getDiff(baseRef: string, headRef?: string): { files: FileDiff[]; rawDiff: string } {
  const rangeArgs = headRef ? [`${baseRef}...${headRef}`] : [baseRef];

  const nameStatus = execFileSync("git", ["diff", "--name-status", ...rangeArgs], { encoding: "utf-8" });
  const rawDiff = execFileSync("git", ["diff", ...rangeArgs], { encoding: "utf-8" });

  const fileStatuses = parseNameStatus(nameStatus);
  const fileDiffs = parseDiffText(rawDiff);

  // Merge name-status info with parsed diffs
  const merged: FileDiff[] = [];
  for (const fs of fileStatuses) {
    const diff = fileDiffs.find((d) => d.path === fs.path) || {
      path: fs.path,
      hunks: "",
      additions: 0,
      deletions: 0,
    };

    const oldContent = fs.status !== "added"
      ? getFileContent(baseRef, fs.oldPath || fs.path)
      : undefined;

    const newContent = fs.status !== "deleted"
      ? getFileContent(headRef || "HEAD", fs.path)
      : undefined;

    const recentHistory = getFileHistory(fs.oldPath || fs.path, baseRef);

    merged.push({
      path: fs.path,
      oldPath: fs.oldPath,
      status: fs.status,
      hunks: diff.hunks,
      oldContent,
      newContent,
      additions: diff.additions,
      deletions: diff.deletions,
      recentHistory,
    });
  }

  return { files: merged, rawDiff };
}

function parseNameStatus(text: string): Array<{ path: string; oldPath?: string; status: FileStatus }> {
  const results: Array<{ path: string; oldPath?: string; status: FileStatus }> = [];

  for (const line of text.trim().split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const code = parts[0].charAt(0);

    if (code === "R") {
      results.push({ path: parts[2], oldPath: parts[1], status: "renamed" });
    } else if (code === "A") {
      results.push({ path: parts[1], status: "added" });
    } else if (code === "D") {
      results.push({ path: parts[1], status: "deleted" });
    } else {
      results.push({ path: parts[1], status: "modified" });
    }
  }

  return results;
}

/**
 * Parse unified diff text into per-file FileDiff objects.
 */
export function parseDiffText(text: string): Array<Pick<FileDiff, "path" | "hunks" | "additions" | "deletions">> {
  if (!text.trim()) return [];

  const files: Array<Pick<FileDiff, "path" | "hunks" | "additions" | "deletions">> = [];
  // Split on diff headers
  const parts = text.split(/^diff --git /m).filter(Boolean);

  for (const part of parts) {
    const lines = part.split("\n");
    // First line: a/path b/path
    const headerMatch = lines[0].match(/a\/(.+?) b\/(.+)/);
    if (!headerMatch) continue;

    const path = headerMatch[2];

    // Find the start of hunks (@@)
    let hunkStart = 0;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].startsWith("@@")) {
        hunkStart = i;
        break;
      }
    }

    const hunkLines = hunkStart > 0 ? lines.slice(hunkStart) : [];
    const hunks = hunkLines.join("\n");

    let additions = 0;
    let deletions = 0;
    for (const line of hunkLines) {
      if (line.startsWith("+") && !line.startsWith("+++")) additions++;
      if (line.startsWith("-") && !line.startsWith("---")) deletions++;
    }

    files.push({ path, hunks, additions, deletions });
  }

  return files;
}

function getFileContent(ref: string, filePath: string): string | undefined {
  try {
    return execFileSync("git", ["show", `${ref}:${filePath}`], { encoding: "utf-8" });
  } catch {
    return undefined;
  }
}

function getFileHistory(filePath: string, upToRef: string, count: number = 5): FileHistoryEntry[] {
  try {
    const log = execFileSync(
      "git",
      ["log", `--format=%h|%s|%cr`, `-${count}`, upToRef, "--", filePath],
      { encoding: "utf-8" },
    );
    const entries = log.trim().split("\n").filter(Boolean).map((line) => {
      const [hash, message, age] = line.split("|");
      return { hash, message, age } as FileHistoryEntry;
    });

    // Attach the diff from the most recent commit so the LLM can see what just changed
    if (entries.length > 0) {
      entries[0].diff = getCommitFileDiff(entries[0].hash, filePath);
    }

    return entries;
  } catch {
    return [];
  }
}

function getCommitFileDiff(hash: string, filePath: string): string | undefined {
  try {
    const diff = execFileSync(
      "git",
      ["diff", `${hash}~1..${hash}`, "--", filePath],
      { encoding: "utf-8" },
    );
    return diff.trim() || undefined;
  } catch {
    return undefined;
  }
}
