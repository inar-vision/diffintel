import fs from "fs";
import { propose } from "../reconcile/reconciler";
import { ReportFeature } from "../types";

interface ProposeOptions {
  report?: string;
}

async function run(options: ProposeOptions = {}): Promise<number> {
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

  // Check for missing features in both v0.1 and v0.2 report formats
  const missing = report.features
    ? report.features.filter((f: ReportFeature) => f.result === "missing")
    : report.missingFeatures || [];

  if (missing.length === 0) {
    console.log("All features implemented.");
    return 0;
  }

  const result = await propose(report);
  console.log(result.text);
  console.error(
    `Token usage: ${result.tokenUsage.input} input, ${result.tokenUsage.output} output`
  );
  return 0;
}

export { run };
