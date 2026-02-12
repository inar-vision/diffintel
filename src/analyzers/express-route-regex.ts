import fs from "fs";
import { Analyzer, Implementation, IntentFeature, MatchResult } from "../types";

// CAUTION: Comments in this file must NOT contain patterns that look like
// Express route registrations. The regex patterns below will match them
// when this file is scanned as part of the project source tree.
// See NOTES.md — "Self-scanning false positives".

// Matches standard Express route registrations
const ROUTE_PATTERN =
  /\b(?:app|router)\.(get|post|put|patch|delete|options|head)\(\s*["'`](\/[^"'`]*)["'`]/gi;

// Chained routes via .route(path).method() chains
const CHAINED_ROUTE_PATTERN =
  /\b(?:app|router)\.route\(\s*["'`](\/[^"'`]*)["'`]\s*\)/gi;
const CHAINED_METHOD_PATTERN =
  /\.(get|post|put|patch|delete|options|head)\s*\(/gi;

function normalizePath(p: string): string {
  return p.replace(/:[^/]+/g, ":param");
}

const expressRouteAnalyzer: Analyzer = {
  name: "express-route",
  supportedTypes: ["http-route"],
  fileExtensions: [".js", ".ts"],

  analyze(files: string[]): Implementation[] {
    const routes: Implementation[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");

      // Standard route patterns
      ROUTE_PATTERN.lastIndex = 0;
      let match;
      while ((match = ROUTE_PATTERN.exec(content)) !== null) {
        const line = content.substring(0, match.index).split("\n").length;
        routes.push({
          type: "http-route",
          method: match[1].toUpperCase(),
          path: match[2],
          file,
          line,
        });
      }

      // Chained routes via .route(path).method() chains
      CHAINED_ROUTE_PATTERN.lastIndex = 0;
      while ((match = CHAINED_ROUTE_PATTERN.exec(content)) !== null) {
        const routePath = match[1];
        const routeLine = content.substring(0, match.index).split("\n").length;
        // Scan the rest of the line/chain for methods
        const chainStart = match.index + match[0].length;
        // Find the chain — look for consecutive .method( calls
        const remaining = content.substring(chainStart);
        // Find chained methods until we hit something that's not a method chain
        const chainEnd = remaining.search(/;\s*$|^\s*\n\s*(?!\.)/m);
        const chain = chainEnd === -1 ? remaining : remaining.substring(0, chainEnd);

        CHAINED_METHOD_PATTERN.lastIndex = 0;
        let methodMatch;
        while ((methodMatch = CHAINED_METHOD_PATTERN.exec(chain)) !== null) {
          routes.push({
            type: "http-route",
            method: methodMatch[1].toUpperCase(),
            path: routePath,
            file,
            line: routeLine,
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
