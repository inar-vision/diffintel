import { execSync } from "child_process";
import { FileDiff, FileHistoryEntry, FileStatus } from "./types";

/**
 * Get the unified diff between two refs.
 * If headRef is omitted, diffs against the working tree.
 */
export function getDiff(baseRef: string, headRef?: string): { files: FileDiff[]; rawDiff: string } {
  const range = headRef ? `${baseRef}...${headRef}` : baseRef;

  const nameStatus = execSync(`git diff --name-status ${range}`, { encoding: "utf-8" });
  const rawDiff = execSync(`git diff ${range}`, { encoding: "utf-8" });

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
    return execSync(`git show ${ref}:${filePath}`, { encoding: "utf-8" });
  } catch {
    return undefined;
  }
}

function getFileHistory(filePath: string, upToRef: string, count: number = 5): FileHistoryEntry[] {
  try {
    const log = execSync(
      `git log --format="%h|%s|%cr" -${count} ${upToRef} -- ${filePath}`,
      { encoding: "utf-8" },
    );
    return log.trim().split("\n").filter(Boolean).map((line) => {
      const [hash, message, age] = line.split("|");
      return { hash, message, age };
    });
  } catch {
    return [];
  }
}
