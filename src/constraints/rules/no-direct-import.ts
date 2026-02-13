import { ConstraintRule, ConstraintViolation } from "../../types";
import { resolveFiles } from "../scope";
import { parseFile, Query, getLanguageForExt } from "../../parsing";
import path from "path";
import Parser from "tree-sitter";

// Tree-sitter query for ES import: import ... from "source"
const IMPORT_QUERY_SRC = `(import_statement
  source: (string) @source)`;

// Tree-sitter query for require: require("source")
const REQUIRE_QUERY_SRC = `(call_expression
  function: (identifier) @fn
  arguments: (arguments (string) @source))`;

const queryCache = new Map<Parser.Language, { importQuery: Parser.Query; requireQuery: Parser.Query }>();

function getQueries(lang: Parser.Language) {
  let cached = queryCache.get(lang);
  if (!cached) {
    cached = {
      importQuery: new Query(lang, IMPORT_QUERY_SRC),
      requireQuery: new Query(lang, REQUIRE_QUERY_SRC),
    };
    queryCache.set(lang, cached);
  }
  return cached;
}

function extractStringContent(node: Parser.SyntaxNode): string {
  const fragment = node.namedChildren.find((c) => c.type === "string_fragment");
  return fragment ? fragment.text : node.text.slice(1, -1);
}

export const noDirectImport: ConstraintRule = (feature, implementations, files) => {
  const violations: ConstraintViolation[] = [];
  const forbidden = feature.forbidden || [];
  if (forbidden.length === 0) return violations;

  const targetFiles = resolveFiles(feature.scope!, implementations);

  for (const file of targetFiles) {
    const ext = path.extname(file);
    const lang = getLanguageForExt(ext);
    const { importQuery, requireQuery } = getQueries(lang);

    let tree;
    try {
      ({ tree } = parseFile(file));
    } catch {
      continue;
    }

    const rootNode = tree.rootNode;

    // Check ES imports
    const importMatches = importQuery.matches(rootNode);
    for (const match of importMatches) {
      const sourceNode = match.captures.find((c) => c.name === "source")?.node;
      if (!sourceNode) continue;
      const source = extractStringContent(sourceNode);
      for (const fb of forbidden) {
        if (source === fb || source.startsWith(fb + "/")) {
          violations.push({
            constraint: feature.id,
            rule: "no-direct-import",
            message: `File ${file} imports forbidden module '${source}'`,
            file,
            line: sourceNode.startPosition.row + 1,
            expected: `no import of '${fb}'`,
            actual: source,
          });
        }
      }
    }

    // Check require calls
    const requireMatches = requireQuery.matches(rootNode);
    for (const match of requireMatches) {
      const fnNode = match.captures.find((c) => c.name === "fn")?.node;
      const sourceNode = match.captures.find((c) => c.name === "source")?.node;
      if (!fnNode || fnNode.text !== "require" || !sourceNode) continue;
      const source = extractStringContent(sourceNode);
      for (const fb of forbidden) {
        if (source === fb || source.startsWith(fb + "/")) {
          violations.push({
            constraint: feature.id,
            rule: "no-direct-import",
            message: `File ${file} requires forbidden module '${source}'`,
            file,
            line: sourceNode.startPosition.row + 1,
            expected: `no import of '${fb}'`,
            actual: source,
          });
        }
      }
    }
  }

  return violations;
};
