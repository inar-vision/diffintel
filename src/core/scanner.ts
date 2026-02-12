import fs from "fs";
import path from "path";

interface ScanOptions {
  exclude?: string[];
  extensions?: string[];
  excludeFiles?: string[];
}

function findSourceFiles(dir: string, options: ScanOptions = {}): string[] {
  const exclude = options.exclude || ["node_modules", ".git"];
  const extensions = options.extensions || [".js", ".ts"];
  const excludeFiles = options.excludeFiles || [];

  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (exclude.includes(entry.name)) continue;
      results.push(...findSourceFiles(full, options));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      if (!excludeFiles.includes(entry.name)) {
        results.push(full);
      }
    }
  }
  return results;
}

export { findSourceFiles };
