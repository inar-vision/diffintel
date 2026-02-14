import type { SyntaxNode } from "../parsing/parser";
import { ChangeType } from "./types";
import { LanguageConfig, getConfigForExtension } from "./language-configs";
import { parseSource } from "../parsing/parser";

export interface Declaration {
  name: string;
  type: ChangeType;
  text: string;
  startLine: number;
}

/**
 * Extract declarations from source code using the config-driven system.
 * Falls back to extracting named top-level nodes as "other" when no config exists
 * but the language is parseable.
 */
export function extractDeclarationsGeneric(
  source: string,
  ext: string,
): Declaration[] {
  if (!source.trim()) return [];

  const config = getConfigForExtension(ext);

  // Try to parse — if we can't, return empty
  let tree;
  try {
    const result = parseSource(source, ext);
    tree = result.tree;
  } catch {
    return [];
  }

  const root = tree.rootNode;
  const decls: Declaration[] = [];

  for (let i = 0; i < root.childCount; i++) {
    const node = root.child(i)!;
    const extracted = config
      ? extractWithConfig(node, config)
      : extractFallback(node);
    if (extracted) {
      decls.push(...extracted);
    }
  }

  return decls;
}

function extractWithConfig(node: SyntaxNode, config: LanguageConfig): Declaration[] | null {
  // Check for wrapper types (e.g. Python decorated_definition)
  let targetNode = node;
  if (config.wrapperTypes && node.type in config.wrapperTypes) {
    const fieldName = config.wrapperTypes[node.type];
    const inner = node.childForFieldName(fieldName);
    if (inner) {
      targetNode = inner;
    }
  }

  const nodeConfig = config.nodeTypeMap[targetNode.type];
  if (!nodeConfig) return null;

  if (nodeConfig.extractor) {
    const results = nodeConfig.extractor(targetNode);
    if (!results) return null;
    return results.map((r) => ({
      name: r.name,
      type: r.changeType || nodeConfig.changeType,
      text: node.text,
      startLine: node.startPosition.row + 1,
    }));
  }

  // Default: extract name via childForFieldName("name")
  const name = targetNode.childForFieldName("name")?.text || "<anonymous>";
  return [{
    name,
    type: nodeConfig.changeType,
    text: node.text,
    startLine: node.startPosition.row + 1,
  }];
}

/**
 * Fallback for languages without a config.
 * Extracts any top-level node that has a "name" field.
 */
function extractFallback(node: SyntaxNode): Declaration[] | null {
  const name = node.childForFieldName("name")?.text;
  if (!name) return null;

  return [{
    name,
    type: "other",
    text: node.text,
    startLine: node.startPosition.row + 1,
  }];
}
