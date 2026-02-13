import { ConstraintRule, ConstraintViolation } from "../../types";
import { matchesScope } from "../scope";

export const routesRequireMiddleware: ConstraintRule = (feature, implementations) => {
  const violations: ConstraintViolation[] = [];
  const scope = feature.scope!;

  // Normalize middleware to array
  const required = Array.isArray(feature.middleware)
    ? feature.middleware
    : feature.middleware
      ? [feature.middleware]
      : [];

  if (required.length === 0) return violations;

  const httpRoutes = implementations.filter(
    (impl) => impl.type === "http-route" && matchesScope(impl.path, scope)
  );

  for (const route of httpRoutes) {
    const routeMiddleware = route.middleware || [];
    for (const mw of required) {
      if (!routeMiddleware.includes(mw)) {
        violations.push({
          constraint: feature.id,
          rule: "routes-require-middleware",
          message: `Route ${route.method} ${route.path} is missing required middleware '${mw}'`,
          file: route.file,
          line: route.line,
          route: `${route.method} ${route.path}`,
          expected: mw,
          actual: routeMiddleware.length > 0 ? routeMiddleware.join(", ") : "none",
        });
      }
    }
  }

  return violations;
};
