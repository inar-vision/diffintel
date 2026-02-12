import fs from "fs";
import { apply } from "../reconcile/reconciler";
import { loadConfig } from "../config";
import { loadIntent } from "../core/intent";
import { findSourceFiles } from "../core/scanner";
import { createRunner } from "../analyzers";
import { buildReport } from "../report";
import { ReportFeature } from "../types";

function runCheck(intentFile: string, scanDir: string, config: ReturnType<typeof loadConfig>) {
  const intent = loadIntent(intentFile);
  const runner = createRunner(config);
  const extensions = runner.getFileExtensions();
  const files = findSourceFiles(scanDir, {
    exclude: config.exclude,
    extensions,
  });
  const implementations = runner.analyzeFiles(files);
  const checkResult = runner.checkFeatures(intent, implementations);
  return buildReport(intent, checkResult, {
    intentFile,
    totalImplemented: implementations.length,
    analyzers: runner.analyzers.map((a) => a.name),
  });
}

interface ApplyOptions {
  report?: string;
  dryRun?: boolean;
}

async function run(options: ApplyOptions = {}): Promise<number> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Error: ANTHROPIC_API_KEY environment variable is required.\n" +
        "Set it with: export ANTHROPIC_API_KEY=your-key-here"
    );
    return 1;
  }

  const reportPath = options.report;
  if (!reportPath) {
    console.error("Error: report file path is required.");
    return 1;
  }

  const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  const dryRun = options.dryRun || false;

  // Check for missing features in both v0.1 and v0.2 report formats
  const missing = report.features
    ? report.features.filter((f: ReportFeature) => f.result === "missing")
    : report.missingFeatures || [];

  if (missing.length === 0) {
    console.log("All features implemented.");
    return 0;
  }

  const complianceBefore = report.summary?.complianceScore ?? null;

  console.error(`Applying fixes for ${missing.length} missing feature(s)...`);
  if (dryRun) {
    console.error("(dry-run mode — no files will be written)");
  }

  let result;
  try {
    result = await apply(report, { dryRun });
  } catch (err: any) {
    console.error(`Apply failed: ${err.message}`);
    return 2;
  }

  console.error(
    `Token usage: ${result.tokenUsage.input} input, ${result.tokenUsage.output} output`
  );

  if (dryRun) {
    // Show proposed changes as diffs
    console.error(`\nProposed changes to ${result.changedFiles.length} file(s):`);
    for (const filePath of result.changedFiles) {
      console.error(`  - ${filePath}`);
    }
    console.error("\nProposed file contents:");
    for (const [filePath, content] of Object.entries(result.proposedChanges || {})) {
      console.log(`\n--- ${filePath} ---`);
      console.log(content);
    }
    return 0;
  }

  console.error(`Changed files: ${result.changedFiles.join(", ")}`);

  // Validation loop: re-run check to verify drift was resolved
  const config = loadConfig();
  const intentFile = report.meta?.intentFile || config.intentFile;
  const scanDir = config.scanDir;

  let afterReport;
  try {
    afterReport = runCheck(intentFile, scanDir, config);
  } catch (err: any) {
    console.error(`Warning: Post-apply check failed: ${err.message}`);
    afterReport = null;
  }

  const complianceAfter = afterReport?.summary?.complianceScore ?? null;
  const remainingMissing = afterReport
    ? afterReport.features.filter((f) => f.result === "missing")
    : [];
  const resolvedFeatures = result.missingFeatures.filter(
    (id) => !remainingMissing.some((f) => f.id === id)
  );

  const summary = {
    applied: true,
    changedFiles: result.changedFiles,
    resolvedFeatures,
    remainingDrift: remainingMissing.map((f) => f.id),
    complianceBefore,
    complianceAfter,
    tokenUsage: result.tokenUsage,
  };

  fs.writeFileSync(
    "apply-result.json",
    JSON.stringify(summary, null, 2),
    "utf-8"
  );
  console.error("Apply result written to apply-result.json");

  if (remainingMissing.length > 0) {
    console.error(
      `\nWarning: ${remainingMissing.length} feature(s) still missing after apply:`
    );
    for (const f of remainingMissing) {
      console.error(`  - ${f.id} (${f.method} ${f.path})`);
    }
  } else if (afterReport) {
    console.error("\nAll targeted features resolved.");
  }

  if (complianceBefore !== null && complianceAfter !== null) {
    console.error(`Compliance: ${complianceBefore}% -> ${complianceAfter}%`);
  }

  return 0;
}

export { run };
