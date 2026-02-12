import fs from "fs";
import { loadConfig } from "../config";
import { loadIntent } from "../core/intent";
import { findSourceFiles } from "../core/scanner";
import { createRunner } from "../analyzers";
import { buildReport, formatReport, diffReports, formatDiff } from "../report";
import { validateIntent } from "../schema/validate";

// Exit codes
const EXIT_OK = 0;
const EXIT_DRIFT = 1;
const EXIT_VALIDATION_ERROR = 2;
const EXIT_RUNTIME_ERROR = 3;

interface CheckOptions {
  intent?: string;
  dir?: string;
  out?: string;
  format?: string;
  diff?: string;
}

function run(options: CheckOptions = {}): number {
  const config = loadConfig({
    intentFile: options.intent,
    scanDir: options.dir,
  });

  const intentFile = config.intentFile;
  const scanDir = config.scanDir;
  const outFile = options.out || null;
  const format = options.format || "text";
  const diffFile = options.diff || null;

  // Load and validate intent
  let intent;
  try {
    intent = loadIntent(intentFile);
  } catch (err: any) {
    console.error(`Error: Failed to load ${intentFile}: ${err.message}`);
    return EXIT_RUNTIME_ERROR;
  }

  const validation = validateIntent(intent);
  if (!validation.valid) {
    console.error(`Validation errors in ${intentFile}:`);
    for (const err of validation.errors) {
      console.error(`  - ${err}`);
    }
    return EXIT_VALIDATION_ERROR;
  }

  // Create analyzer runner from config
  const runner = createRunner(config);

  // Scan files using extensions from all active analyzers
  const extensions = runner.getFileExtensions();
  let files;
  try {
    files = findSourceFiles(scanDir, {
      exclude: config.exclude,
      extensions,
    });
  } catch (err: any) {
    console.error(`Error: Failed to scan ${scanDir}: ${err.message}`);
    return EXIT_RUNTIME_ERROR;
  }

  // Run analyzers
  const implementations = runner.analyzeFiles(files);

  // Check features against implementations
  const checkResult = runner.checkFeatures(intent, implementations);

  const report = buildReport(intent, checkResult, {
    intentFile,
    totalImplemented: implementations.length,
    analyzers: runner.analyzers.map((a) => a.name),
  });

  // Human-readable summary to stderr (unless format is json-only)
  if (format !== "json") {
    console.error(formatReport(report, "text"));
  }

  // Diff mode
  if (diffFile) {
    try {
      const previousReport = JSON.parse(fs.readFileSync(diffFile, "utf-8"));
      const diff = diffReports(report, previousReport);
      console.error(formatDiff(diff));
    } catch (err: any) {
      console.error(`Warning: Could not load diff file ${diffFile}: ${err.message}`);
    }
  }

  // Write to file if --out specified
  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + "\n");
    console.error(`Report written to ${outFile}`);
  }

  // Primary output to stdout
  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else if (format === "summary") {
    console.log(formatReport(report, "summary"));
  }
  // text format already printed to stderr above

  // Exit code
  return report.drift.hasDrift ? EXIT_DRIFT : EXIT_OK;
}

export { run, EXIT_OK, EXIT_DRIFT, EXIT_VALIDATION_ERROR, EXIT_RUNTIME_ERROR };
