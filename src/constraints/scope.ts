import { Implementation } from "../types";

/**
 * Matches a route path against a scope pattern.
 * - "/api/*" → prefix match (route starts with /api/)
 * - "*" → matches everything
 * - Exact match fallback
 */
export function matchesScope(routePath: string, scopePattern: string): boolean {
  if (scopePattern === "*") return true;

  if (scopePattern.endsWith("/*")) {
    const prefix = scopePattern.slice(0, -1); // "/api/*" → "/api/"
    return routePath.startsWith(prefix) || routePath === scopePattern.slice(0, -2);
  }

  return routePath === scopePattern;
}

/**
 * Resolves a scope to a set of file paths.
 * - "route-handlers" → unique files from route implementations
 * - Path pattern → filter implementations by route path pattern
 */
export function resolveFiles(
  scope: string,
  implementations: Implementation[]
): string[] {
  if (scope === "route-handlers") {
    const files = new Set<string>();
    for (const impl of implementations) {
      if (impl.type === "http-route") {
        files.add(impl.file);
      }
    }
    return [...files];
  }

  // Path pattern scope — return files of matching routes
  const files = new Set<string>();
  for (const impl of implementations) {
    if (impl.type === "http-route" && matchesScope(impl.path, scope)) {
      files.add(impl.file);
    }
  }
  return [...files];
}
