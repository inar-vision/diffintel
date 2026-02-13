import { ConstraintRule, ConstraintViolation } from "../../types";
import { resolveFiles } from "../scope";
import { parseFile, Query, getLanguageForExt } from "../../parsing";
import path from "path";
import Parser from "tree-sitter";
import type { SyntaxNode } from "../../parsing";

// Find async arrow functions and async function expressions used as arguments
// We look for call_expression arguments that are async functions
const ASYNC_ARROW_QUERY_SRC = `(call_expression
  arguments: (arguments
    (arrow_function) @fn))`;

const ASYNC_FUNCTION_QUERY_SRC = `(call_expression
  arguments: (arguments
    (function_expression) @fn))`;

const queryCache = new Map<Parser.Language, { arrowQuery: Parser.Query; funcQuery: Parser.Query }>();

function getQueries(lang: Parser.Language) {
  let cached = queryCache.get(lang);
  if (!cached) {
    cached = {
      arrowQuery: new Query(lang, ASYNC_ARROW_QUERY_SRC),
      funcQuery: new Query(lang, ASYNC_FUNCTION_QUERY_SRC),
    };
    queryCache.set(lang, cached);
  }
  return cached;
}

function isRouteHandlerCall(node: SyntaxNode): boolean {
  // Check if the parent call_expression looks like app.get/post/etc or router.get/post/etc
  const callExpr = node.parent?.parent;
  if (!callExpr || callExpr.type !== "call_expression") return false;
  const fn = callExpr.childForFieldName("function");
  if (!fn || fn.type !== "member_expression") return false;
  const prop = fn.childForFieldName("property");
  if (!prop) return false;
  const methods = new Set(["get", "post", "put", "patch", "delete", "options", "head", "use"]);
  return methods.has(prop.text.toLowerCase());
}

function hasAsyncKeyword(node: SyntaxNode): boolean {
  // Check if the function node has the "async" keyword
  return node.text.trimStart().startsWith("async");
}

function bodyContainsTryStatement(node: SyntaxNode): boolean {
  const body = node.childForFieldName("body");
  if (!body) return false;

  // If body is a statement_block, check its children
  if (body.type === "statement_block") {
    for (const child of body.namedChildren) {
      if (child.type === "try_statement") return true;
    }
  }
  return false;
}

export const asyncErrorHandling: ConstraintRule = (feature, implementations) => {
  const violations: ConstraintViolation[] = [];
  const targetFiles = resolveFiles(feature.scope!, implementations);

  for (const file of targetFiles) {
    const ext = path.extname(file);
    const lang = getLanguageForExt(ext);
    const { arrowQuery, funcQuery } = getQueries(lang);

    let tree;
    try {
      ({ tree } = parseFile(file));
    } catch {
      continue;
    }

    const rootNode = tree.rootNode;
    const handlers: SyntaxNode[] = [];

    // Collect async arrow functions used as route handler arguments
    for (const match of arrowQuery.matches(rootNode)) {
      const fnNode = match.captures.find((c) => c.name === "fn")?.node;
      if (fnNode && hasAsyncKeyword(fnNode) && isRouteHandlerCall(fnNode)) {
        handlers.push(fnNode);
      }
    }

    // Collect async function expressions used as route handler arguments
    for (const match of funcQuery.matches(rootNode)) {
      const fnNode = match.captures.find((c) => c.name === "fn")?.node;
      if (fnNode && hasAsyncKeyword(fnNode) && isRouteHandlerCall(fnNode)) {
        handlers.push(fnNode);
      }
    }

    for (const handler of handlers) {
      if (!bodyContainsTryStatement(handler)) {
        violations.push({
          constraint: feature.id,
          rule: "async-error-handling",
          message: `Async route handler at ${file}:${handler.startPosition.row + 1} lacks try/catch error handling`,
          file,
          line: handler.startPosition.row + 1,
          expected: "try/catch wrapper",
          actual: "unguarded async handler",
        });
      }
    }
  }

  return violations;
};
