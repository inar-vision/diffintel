import path from "path";
import Parser from "tree-sitter";
import { Analyzer, Implementation, IntentFeature, MatchResult } from "../types";
import { parseFile, Query, SyntaxNode, getLanguageForExt } from "../parsing";

const HTTP_METHODS = new Set([
  "get", "post", "put", "patch", "delete", "options", "head",
]);

const RECEIVER_NAMES = new Set(["app", "router"]);

const STANDARD_ROUTE_QUERY_SRC = `(call_expression
    function: (member_expression
      object: (identifier) @obj
      property: (property_identifier) @method)
    arguments: (arguments
      [(string) (template_string)] @path))`;

const ROUTE_CALL_QUERY_SRC = `(call_expression
    function: (member_expression
      object: (identifier) @obj
      property: (property_identifier) @route_prop)
    arguments: (arguments
      [(string) (template_string)] @path))`;

interface CompiledQueries {
  standardQuery: Parser.Query;
  routeCallQuery: Parser.Query;
}

const queryCache = new Map<Parser.Language, CompiledQueries>();

function getQueries(lang: Parser.Language): CompiledQueries {
  let cached = queryCache.get(lang);
  if (!cached) {
    cached = {
      standardQuery: new Query(lang, STANDARD_ROUTE_QUERY_SRC),
      routeCallQuery: new Query(lang, ROUTE_CALL_QUERY_SRC),
    };
    queryCache.set(lang, cached);
  }
  return cached;
}

function extractStringValue(node: SyntaxNode): string | null {
  if (node.type === "string") {
    // String node contains quotes; get the string_fragment child
    const fragment = node.namedChildren.find((c) => c.type === "string_fragment");
    return fragment ? fragment.text : "";
  }
  if (node.type === "template_string") {
    // Simple template string with no interpolation: `text`
    if (node.namedChildren.length === 0) {
      // Empty template string
      return node.text.slice(1, -1);
    }
    // Only handle template strings with a single string fragment (no interpolation)
    if (
      node.namedChildren.length === 1 &&
      node.namedChildren[0].type === "string_fragment"
    ) {
      return node.namedChildren[0].text;
    }
    return null; // Has interpolation — skip
  }
  return null;
}

function collectChainedMethods(node: SyntaxNode): string[] {
  // Given a call_expression node like `router.route("/path")`,
  // walk UP the tree collecting HTTP method calls chained on it.
  // Structure: outerCall.function.object points to the inner call.
  const methods: string[] = [];
  let current: SyntaxNode | null = node;

  while (current && current.parent) {
    // Check if current is used as the object of a member_expression
    // which is the function of a call_expression
    const memberExpr: SyntaxNode = current.parent;
    if (memberExpr.type !== "member_expression") break;
    if (memberExpr.childForFieldName("object")?.id !== current.id) break;

    const prop = memberExpr.childForFieldName("property");
    if (!prop) break;

    const methodName = prop.text.toLowerCase();
    if (!HTTP_METHODS.has(methodName)) break;

    const callExpr: SyntaxNode | null = memberExpr.parent;
    if (!callExpr || callExpr.type !== "call_expression") break;
    if (callExpr.childForFieldName("function")?.id !== memberExpr.id) break;

    methods.push(methodName);
    current = callExpr;
  }

  return methods;
}

function normalizePath(p: string): string {
  return p.replace(/:[^/]+/g, ":param");
}

const expressRouteAnalyzer: Analyzer = {
  name: "express-route",
  supportedTypes: ["http-route"],
  fileExtensions: [".js", ".ts", ".tsx"],

  analyze(files: string[]): Implementation[] {
    const routes: Implementation[] = [];

    for (const file of files) {
      const ext = path.extname(file);
      const lang = getLanguageForExt(ext);
      const { standardQuery, routeCallQuery } = getQueries(lang);
      const { tree } = parseFile(file);
      const rootNode = tree.rootNode;

      // 1. Standard routes: app.get("/path", handler)
      const standardMatches = standardQuery.matches(rootNode);
      for (const match of standardMatches) {
        const captures = Object.fromEntries(
          match.captures.map((c) => [c.name, c.node])
        );
        const obj = captures.obj;
        const method = captures.method;
        const pathNode = captures.path;

        if (!RECEIVER_NAMES.has(obj.text)) continue;

        const methodName = method.text.toLowerCase();
        if (!HTTP_METHODS.has(methodName)) continue;

        // Skip if this is actually a .route() call (handled separately)
        if (methodName === "route") continue;

        const pathValue = extractStringValue(pathNode);
        if (pathValue === null || !pathValue.startsWith("/")) continue;

        routes.push({
          type: "http-route",
          method: methodName.toUpperCase(),
          path: pathValue,
          file,
          line: obj.startPosition.row + 1,
        });
      }

      // 2. Chained routes: router.route("/path").get(handler).post(handler)
      const routeCallMatches = routeCallQuery.matches(rootNode);
      for (const match of routeCallMatches) {
        const captures = Object.fromEntries(
          match.captures.map((c) => [c.name, c.node])
        );
        const obj = captures.obj;
        const routeProp = captures.route_prop;
        const pathNode = captures.path;

        if (!RECEIVER_NAMES.has(obj.text)) continue;
        if (routeProp.text !== "route") continue;

        const pathValue = extractStringValue(pathNode);
        if (pathValue === null || !pathValue.startsWith("/")) continue;

        // The call_expression containing .route(path)
        const routeCallNode = routeProp.parent!.parent!;
        const chainedMethods = collectChainedMethods(routeCallNode);
        const line = obj.startPosition.row + 1;

        for (const methodName of chainedMethods) {
          routes.push({
            type: "http-route",
            method: methodName.toUpperCase(),
            path: pathValue,
            file,
            line,
          });
        }
      }
    }

    return routes;
  },

  match(feature: IntentFeature, implementations: Implementation[]): MatchResult {
    const normalizedExpected = normalizePath(feature.path!);
    const impl = implementations.find(
      (r) =>
        r.method === feature.method!.toUpperCase() &&
        normalizePath(r.path) === normalizedExpected
    );

    if (impl) {
      return {
        found: true,
        implementedIn: impl.file,
        line: impl.line || null,
      };
    }

    return { found: false, implementedIn: null, line: null };
  },
};

export = expressRouteAnalyzer;
