const fs = require("fs");
const { loadConfig } = require("../config");
const { loadIntent } = require("../core/intent");
const { findSourceFiles } = require("../core/scanner");
const { createRunner } = require("../analyzers");
const { buildReport, formatReport } = require("../report");

function run(options = {}) {
  const config = loadConfig({
    intentFile: options.intent,
    scanDir: options.dir,
  });

  const intentFile = config.intentFile;
  const scanDir = config.scanDir;
  const outFile = options.out || null;

  const intent = loadIntent(intentFile);

  // Create analyzer runner from config
  const runner = createRunner(config);

  // Scan files using extensions from all active analyzers
  const extensions = runner.getFileExtensions();
  const files = findSourceFiles(scanDir, {
    exclude: config.exclude,
    extensions,
    excludeFiles: ["check-intent.js", "propose-fix.js"],
  });

  // Run analyzers
  const implementations = runner.analyzeFiles(files);

  // Check features against implementations
  const checkResult = runner.checkFeatures(intent, implementations);

  const report = buildReport(intent, checkResult, {
    intentFile,
    totalImplemented: implementations.length,
    analyzers: runner.analyzers.map((a) => a.name),
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
