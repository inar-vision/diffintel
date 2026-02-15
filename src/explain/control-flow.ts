import type { SyntaxNode } from "../parsing/parser";
import { parseSource, hasLanguageForExt } from "../parsing/parser";
import { ControlFlowAnnotation } from "./types";

/**
 * Parse unified diff hunks to extract the set of changed line numbers
 * on the new side of the diff.
 */
export function parseChangedLines(hunks: string): Set<number> {
  const lines = new Set<number>();
  let currentLine = 0;

  for (const line of hunks.split("\n")) {
    const hunkHeader = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkHeader) {
      currentLine = parseInt(hunkHeader[1], 10);
      continue;
    }

    if (currentLine === 0) continue;

    if (line.startsWith("+")) {
      lines.add(currentLine);
      currentLine++;
    } else if (line.startsWith("-")) {
      // Deleted lines don't advance the new-side line counter
    } else {
      // Context line
      currentLine++;
    }
  }

  return lines;
}

/**
 * Extract control-flow annotations for functions that contain changed lines.
 * Detects guard patterns (if-return/throw before operations) and try-catch blocks.
 */
export function extractControlFlow(
  source: string,
  ext: string,
  changedLines: Set<number>,
): ControlFlowAnnotation[] {
  if (!source.trim() || changedLines.size === 0) return [];
  if (!hasLanguageForExt(ext)) return [];

  let tree;
  try {
    const result = parseSource(source, ext);
    tree = result.tree;
  } catch {
    return [];
  }

  const annotations: ControlFlowAnnotation[] = [];
  findFunctionsWithChanges(tree.rootNode, changedLines, annotations);
  return annotations;
}

/** Recursively find function-like nodes that contain changed lines */
function findFunctionsWithChanges(
  node: SyntaxNode,
  changedLines: Set<number>,
  annotations: ControlFlowAnnotation[],
): void {
  const funcName = getFunctionName(node);
  if (funcName !== null) {
    // This is a function-like node — check if it contains changed lines
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    let hasChanges = false;
    for (const line of changedLines) {
      if (line >= startLine && line <= endLine) {
        hasChanges = true;
        break;
      }
    }

    if (hasChanges) {
      analyzeFunction(node, funcName, changedLines, annotations);
    }
    // Don't recurse into nested functions — analyze them separately
  }

  // Recurse into children to find nested functions and top-level functions
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)!;
    if (getFunctionName(child) !== null) {
      findFunctionsWithChanges(child, changedLines, annotations);
    } else {
      findFunctionsWithChanges(child, changedLines, annotations);
    }
  }
}

/** Get the name of a function-like node, or null if not a function */
function getFunctionName(node: SyntaxNode): string | null {
  const funcTypes = new Set([
    "function_declaration",
    "function_definition",
    "method_definition",
    "method_declaration",
    "function_item",       // Rust
    "arrow_function",
  ]);

  if (!funcTypes.has(node.type)) return null;

  // Direct name field
  const name = node.childForFieldName("name")?.text;
  if (name) return name;

  // Arrow functions assigned to a variable: const foo = () => ...
  if (node.type === "arrow_function" && node.parent?.type === "variable_declarator") {
    return node.parent.childForFieldName("name")?.text || null;
  }

  return "<anonymous>";
}

/** Analyze a single function for guard patterns and try-catch blocks */
function analyzeFunction(
  funcNode: SyntaxNode,
  funcName: string,
  changedLines: Set<number>,
  annotations: ControlFlowAnnotation[],
): void {
  const body = funcNode.childForFieldName("body");
  if (!body) return;

  // Walk direct children of the function body for guards and try-catch
  for (let i = 0; i < body.childCount; i++) {
    const stmt = body.child(i)!;

    if (stmt.type === "if_statement") {
      const guard = detectGuard(stmt);
      if (guard) {
        annotations.push({
          functionName: funcName,
          line: stmt.startPosition.row + 1,
          kind: "guard",
          description: guard,
        });
      }
    }

    if (stmt.type === "try_statement") {
      const tryLine = stmt.startPosition.row + 1;
      const tryEnd = stmt.endPosition.row + 1;
      let coversChanges = false;
      for (const line of changedLines) {
        if (line >= tryLine && line <= tryEnd) {
          coversChanges = true;
          break;
        }
      }
      if (coversChanges) {
        annotations.push({
          functionName: funcName,
          line: tryLine,
          kind: "try-catch",
          description: "operations wrapped in try-catch",
        });
      }
    }
  }
}

/**
 * Detect if an if-statement is a guard pattern.
 * A guard is: if (condition) { return/throw/process.exit }
 * Returns a human-readable description, or null if not a guard.
 */
function detectGuard(ifNode: SyntaxNode): string | null {
  const consequence = ifNode.childForFieldName("consequence");
  if (!consequence) return null;

  // Check if the consequence contains a return, throw, or process.exit
  if (!containsEarlyExit(consequence)) return null;

  // Extract a readable condition description
  const condition = ifNode.childForFieldName("condition");
  if (!condition) return null;

  const condText = condition.text;

  // Keep it short — truncate long conditions
  const shortCond = condText.length > 80
    ? condText.slice(0, 77) + "..."
    : condText;

  return `returns/exits early if ${shortCond}`;
}

/** Check if a block contains a return, throw, or process.exit statement */
function containsEarlyExit(node: SyntaxNode): boolean {
  if (node.type === "return_statement" || node.type === "throw_statement") {
    return true;
  }

  // process.exit(...)
  if (node.type === "expression_statement") {
    const expr = node.child(0);
    if (expr?.type === "call_expression") {
      const callee = expr.childForFieldName("function")?.text;
      if (callee === "process.exit") return true;
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    if (containsEarlyExit(node.child(i)!)) return true;
  }

  return false;
}
