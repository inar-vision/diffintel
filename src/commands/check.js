const fs = require("fs");
const path = require("path");
const { loadConfig } = require("../config");
const { loadIntent } = require("../core/intent");
const { findSourceFiles } = require("../core/scanner");
const { extractRoutes, checkIntent } = require("../core/checker");
const { buildReport, formatReport } = require("../report");

function run(options = {}) {
  const config = loadConfig({
    intentFile: options.intent,
    scanDir: options.dir,
  });

  const intentFile = config.intentFile;
  const scanDir = config.scanDir;
  const outFile = options.out || null;
  const format = options.format || "json";

  const intent = loadIntent(intentFile);
  const files = findSourceFiles(scanDir, {
    exclude: config.exclude,
    excludeFiles: ["check-intent.js", "propose-fix.js"],
  });
  const implementedRoutes = extractRoutes(files);
  const checkResult = checkIntent(intent, implementedRoutes);

  const report = buildReport(intent, checkResult, {
    intentFile,
    totalImplemented: implementedRoutes.length,
  });

  // Human-readable summary to stderr
  console.error(formatReport(report, "text"));

  // Write to file if --out specified
  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + "\n");
    console.error(`Report written to ${outFile}`);
  }

  // Structured JSON to stdout
  console.log(JSON.stringify(report, null, 2));

  // Return exit code
  return checkResult.missingFeatures.length > 0 ||
    checkResult.extraFeatures.length > 0
    ? 1
    : 0;
}

module.exports = { run };
