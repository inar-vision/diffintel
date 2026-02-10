#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const EXCLUDED_FILES = ["check-intent.js", "propose-fix.js"];

// Parse CLI arguments
let intentFile = "intent.json";
let scanDir = ".";
let outFile = null;

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out" && args[i + 1]) {
    outFile = args[++i];
  } else if (!intentFile || i === 0) {
    intentFile = args[i];
  } else {
    scanDir = args[i];
  }
}

// Patterns that register Express routes: app.get(...), router.post(...), etc.
const ROUTE_PATTERN =
  /\b(?:app|router)\.(get|post|put|patch|delete|options|head)\(\s*["'`](\/[^"'`]*)["'`]/gi;

function loadIntent(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const intent = JSON.parse(raw);
  if (!intent.features || !Array.isArray(intent.features)) {
    throw new Error("intent.json must contain a 'features' array");
  }
  return intent;
}

function findSourceFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      results.push(...findSourceFiles(full));
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".ts")) {
      if (!EXCLUDED_FILES.includes(entry.name)) {
        results.push(full);
      }
    }
  }
  return results;
}

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
  const matchedRoutes = new Set();

  for (const feature of intent.features) {
    if (feature.type !== "http-route") continue;

    const normalizedExpected = normalizePath(feature.path);
    const foundIndex = implementedRoutes.findIndex(
      (r) =>
        r.method === feature.method.toUpperCase() &&
        normalizePath(r.path) === normalizedExpected
    );

    if (foundIndex !== -1) {
      matchedRoutes.add(foundIndex);
      presentFeatures.push({
        id: feature.id,
        method: feature.method.toUpperCase(),
        path: feature.path,
        implementedIn: implementedRoutes[foundIndex].file,
      });
    } else {
      missingFeatures.push({
        id: feature.id,
        method: feature.method.toUpperCase(),
        path: feature.path,
      });
    }
  }

  // Extra features: routes in code not matching any declared feature
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

  return { presentFeatures, missingFeatures, extraFeatures };
}

// --- Main ---

const intent = loadIntent(intentFile);
const files = findSourceFiles(scanDir);
const implementedRoutes = extractRoutes(files);
const { presentFeatures, missingFeatures, extraFeatures } = checkIntent(
  intent,
  implementedRoutes
);

const report = {
  version: "0.1",
  intentFile,
  timestamp: new Date().toISOString(),
  summary: {
    totalDeclared: presentFeatures.length + missingFeatures.length,
    totalImplemented: implementedRoutes.length,
    present: presentFeatures.length,
    missing: missingFeatures.length,
    extra: extraFeatures.length,
  },
  presentFeatures,
  missingFeatures,
  extraFeatures,
};

// Human-readable summary to stderr
console.error(`\nIntent check: ${intentFile}`);
console.error(`Declared features: ${report.summary.totalDeclared}`);
console.error(`Present:           ${report.summary.present}`);
console.error(`Missing:           ${report.summary.missing}`);
console.error(`Extra:             ${report.summary.extra}`);
if (missingFeatures.length > 0) {
  console.error(`\nMissing features:`);
  for (const m of missingFeatures) {
    console.error(`  - ${m.id} (${m.method} ${m.path})`);
  }
}
if (extraFeatures.length > 0) {
  console.error(`\nExtra features (not in intent):`);
  for (const e of extraFeatures) {
    console.error(`  - ${e.method} ${e.path} (${e.implementedIn})`);
  }
}
console.error("");

// Write to file if --out specified
if (outFile) {
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + "\n");
  console.error(`Report written to ${outFile}`);
}

// Structured JSON to stdout
console.log(JSON.stringify(report, null, 2));

// Exit with non-zero if anything is missing or extra
process.exit(missingFeatures.length > 0 || extraFeatures.length > 0 ? 1 : 0);
