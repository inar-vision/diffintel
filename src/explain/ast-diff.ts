import path from "path";
import { FileDiff, FileAnalysis, StructuralChange } from "./types";
import { extractDeclarationsGeneric } from "./generic-extractor";
import { getConfigForExtension } from "./language-configs";
import { hasLanguageForExt } from "../parsing/parser";

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
        structuralChanges.push({
          file: diff.path,
          type: decl.type,
          action: "added",
          name,
          startLine: decl.startLine,
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

  return {
    path: diff.path,
    status: diff.status,
    language,
    structuralChanges,
    baseDeclarations,
    recentHistory: [],
    rawDiff: diff.hunks,
  };
}

export function extractDeclarations(source: string, ext: string) {
  return extractDeclarationsGeneric(source, ext);
}
