import path from "path";
import { FileDiff, FileAnalysis, StructuralChange } from "./types";
import { extractDeclarationsGeneric } from "./generic-extractor";
import { getConfigForExtension } from "./language-configs";
import { hasLanguageForExt } from "../parsing/parser";
import { extractControlFlow, parseChangedLines } from "./control-flow";

export function analyzeFile(diff: FileDiff): FileAnalysis {
  const ext = path.extname(diff.path);
  const config = getConfigForExtension(ext);
  const parseable = hasLanguageForExt(ext);

  // If no config and not parseable, return without structural analysis
  if (!config && !parseable) {
    return {
      path: diff.path,
      status: diff.status,
      language: null,
      structuralChanges: [],
      controlFlowAnnotations: [],
      baseDeclarations: [],
      recentHistory: [],
      rawDiff: diff.hunks,
    };
  }

  const language = config?.id || ext.replace(".", "");
  const structuralChanges: StructuralChange[] = [];

  // Extract base declarations for context (what existed before this change)
  const baseDecls = diff.oldContent ? extractDeclarations(diff.oldContent, ext) : [];
  const baseDeclarations = baseDecls.map((d) => `${d.name} (${d.type})`);

  if (diff.status === "added" && diff.newContent) {
    const decls = extractDeclarations(diff.newContent, ext);
    for (const d of decls) {
      structuralChanges.push({
        file: diff.path,
        type: d.type,
        action: "added",
        name: d.name,
        startLine: d.startLine,
      });
    }
  } else if (diff.status === "deleted" && diff.oldContent) {
    for (const d of baseDecls) {
      structuralChanges.push({
        file: diff.path,
        type: d.type,
        action: "removed",
        name: d.name,
        startLine: d.startLine,
      });
    }
  } else if ((diff.status === "modified" || diff.status === "renamed") && diff.oldContent && diff.newContent) {
    const newDecls = extractDeclarations(diff.newContent, ext);

    const oldMap = new Map(baseDecls.map((d) => [d.name, d]));
    const newMap = new Map(newDecls.map((d) => [d.name, d]));

    // Removed declarations
    for (const [name, decl] of oldMap) {
      if (!newMap.has(name)) {
        structuralChanges.push({
          file: diff.path,
          type: decl.type,
          action: "removed",
          name,
          startLine: decl.startLine,
        });
      }
    }

    // Added or modified declarations
    for (const [name, decl] of newMap) {
      const old = oldMap.get(name);
      if (!old) {
        const related = findRelatedBaseDecls(name, baseDecls);
        structuralChanges.push({
          file: diff.path,
          type: decl.type,
          action: "added",
          name,
          startLine: decl.startLine,
          detail: related.length > 0
            ? `related existing: ${related.join(", ")}`
            : undefined,
        });
      } else if (old.text !== decl.text) {
        structuralChanges.push({
          file: diff.path,
          type: decl.type,
          action: "modified",
          name,
          startLine: decl.startLine,
        });
      }
    }
  }

  const changedLines = parseChangedLines(diff.hunks);
  const controlFlowAnnotations = diff.newContent
    ? extractControlFlow(diff.newContent, ext, changedLines)
    : [];

  return {
    path: diff.path,
    status: diff.status,
    language,
    structuralChanges,
    controlFlowAnnotations,
    baseDeclarations,
    recentHistory: [],
    rawDiff: diff.hunks,
  };
}

/**
 * Split a camelCase/PascalCase/snake_case name into lowercase stems,
 * filtering to length >= 3.
 */
export function extractStems(name: string): string[] {
  // Split on underscores, then on camelCase boundaries
  const parts = name
    .split("_")
    .flatMap((part) => part.replace(/([a-z])([A-Z])/g, "$1\0$2").split("\0"));
  return [...new Set(parts.map((p) => p.toLowerCase()).filter((p) => p.length >= 3))];
}

/**
 * Find base declaration names related to an added declaration by stem prefix matching.
 * A match occurs when any stem of the added name is a prefix of a base stem or vice versa.
 */
export function findRelatedBaseDecls(
  addedName: string,
  baseDecls: Array<{ name: string; type: string }>,
): string[] {
  const addedStems = extractStems(addedName);
  if (addedStems.length === 0) return [];

  const related: string[] = [];
  for (const decl of baseDecls) {
    if (decl.name === addedName) continue;
    const baseStems = extractStems(decl.name);
    const matches = addedStems.some((as) =>
      baseStems.some((bs) => bs.startsWith(as) || as.startsWith(bs)),
    );
    if (matches) {
      related.push(decl.name);
    }
  }
  return related;
}

export function extractDeclarations(source: string, ext: string) {
  return extractDeclarationsGeneric(source, ext);
}
