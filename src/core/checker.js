const fs = require("fs");

// Patterns that register Express routes: app.get(...), router.post(...), etc.
const ROUTE_PATTERN =
  /\b(?:app|router)\.(get|post|put|patch|delete|options|head)\(\s*["'`](\/[^"'`]*)["'`]/gi;

function extractRoutes(files) {
  const routes = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    let match;
    ROUTE_PATTERN.lastIndex = 0;
    while ((match = ROUTE_PATTERN.exec(content)) !== null) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file,
      });
    }
  }
  return routes;
}

function normalizePath(p) {
  return p.replace(/:[^/]+/g, ":param");
}

function checkIntent(intent, implementedRoutes) {
  const presentFeatures = [];
  const missingFeatures = [];
  const draftFeatures = [];
  const deprecatedFeatures = [];
  const unannotatedFeatures = [];
  const matchedRoutes = new Set();

  for (const feature of intent.features) {
    const status = feature.status || "approved";

    // Non-http-route types have no analyzer yet — track them separately
    if (feature.type !== "http-route") {
      unannotatedFeatures.push({
        id: feature.id,
        type: feature.type,
        status,
        reason: `No analyzer available for type '${feature.type}'`,
      });
      continue;
    }

    // Draft features are informational only — not enforced
    if (status === "draft") {
      draftFeatures.push({
        id: feature.id,
        method: feature.method.toUpperCase(),
        path: feature.path,
        status,
      });
      continue;
    }

    const normalizedExpected = normalizePath(feature.path);
    const foundIndex = implementedRoutes.findIndex(
      (r) =>
        r.method === feature.method.toUpperCase() &&
        normalizePath(r.path) === normalizedExpected
    );

    if (foundIndex !== -1) {
      matchedRoutes.add(foundIndex);
      const entry = {
        id: feature.id,
        method: feature.method.toUpperCase(),
        path: feature.path,
        implementedIn: implementedRoutes[foundIndex].file,
        status,
      };

      if (status === "deprecated") {
        deprecatedFeatures.push(entry);
      }
      presentFeatures.push(entry);
    } else {
      missingFeatures.push({
        id: feature.id,
        method: feature.method.toUpperCase(),
        path: feature.path,
        status,
      });
    }
  }

  const extraFeatures = [];
  for (let i = 0; i < implementedRoutes.length; i++) {
    if (!matchedRoutes.has(i)) {
      extraFeatures.push({
        method: implementedRoutes[i].method,
        path: implementedRoutes[i].path,
        implementedIn: implementedRoutes[i].file,
      });
    }
  }

  return {
    presentFeatures,
    missingFeatures,
    extraFeatures,
    draftFeatures,
    deprecatedFeatures,
    unannotatedFeatures,
  };
}

module.exports = { ROUTE_PATTERN, extractRoutes, normalizePath, checkIntent };
