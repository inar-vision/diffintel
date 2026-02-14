import path from "path";
import { parseSource, type SyntaxNode } from "../parsing/parser";
import { FileDiff, FileAnalysis, StructuralChange, ChangeType } from "./types";

interface Declaration {
  name: string;
  type: ChangeType;
  text: string;
  startLine: number;
}

const SUPPORTED_EXTS = new Set([".js", ".ts", ".tsx", ".jsx"]);

export function analyzeFile(diff: FileDiff): FileAnalysis {
  const ext = path.extname(diff.path);
  if (!SUPPORTED_EXTS.has(ext)) {
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

  const language = ext.replace(".", "");
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

export function extractDeclarations(source: string, ext: string): Declaration[] {
  if (!source.trim()) return [];

  const { tree } = parseSource(source, ext);
  const decls: Declaration[] = [];
  const root = tree.rootNode;

  for (let i = 0; i < root.childCount; i++) {
    const node = root.child(i)!;
    const extracted = extractFromNode(node);
    if (extracted) {
      decls.push(...extracted);
    }
  }

  return decls;
}

function extractFromNode(node: SyntaxNode): Declaration[] | null {
  const type = node.type;

  if (type === "function_declaration") {
    const name = node.childForFieldName("name")?.text || "<anonymous>";
    return [{ name, type: "function", text: node.text, startLine: node.startPosition.row + 1 }];
  }

  if (type === "class_declaration") {
    const name = node.childForFieldName("name")?.text || "<anonymous>";
    return [{ name, type: "class", text: node.text, startLine: node.startPosition.row + 1 }];
  }

  if (type === "import_statement") {
    const source = node.childForFieldName("source")?.text || node.text;
    return [{ name: source, type: "import", text: node.text, startLine: node.startPosition.row + 1 }];
  }

  if (type === "export_statement") {
    // Named export with declaration inside
    const decl = node.childForFieldName("declaration");
    if (decl) {
      const inner = extractFromNode(decl);
      if (inner) {
        return inner.map((d) => ({ ...d, type: "export" as ChangeType }));
      }
    }
    const name = node.text.slice(0, 60);
    return [{ name, type: "export", text: node.text, startLine: node.startPosition.row + 1 }];
  }

  if (type === "variable_declaration" || type === "lexical_declaration") {
    const results: Declaration[] = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)!;
      if (child.type === "variable_declarator") {
        const name = child.childForFieldName("name")?.text || "<unknown>";
        // Check if value is an arrow function or function expression
        const value = child.childForFieldName("value");
        const isFn = value && (value.type === "arrow_function" || value.type === "function");
        results.push({
          name,
          type: isFn ? "function" : "variable",
          text: node.text,
          startLine: node.startPosition.row + 1,
        });
      }
    }
    if (results.length) return results;
  }

  // Expression statements like module.exports = ...
  if (type === "expression_statement") {
    const expr = node.child(0);
    if (expr?.type === "assignment_expression") {
      const left = expr.childForFieldName("left");
      if (left?.text?.startsWith("module.exports")) {
        return [{ name: "module.exports", type: "export", text: node.text, startLine: node.startPosition.row + 1 }];
      }
    }
  }

  return null;
}
