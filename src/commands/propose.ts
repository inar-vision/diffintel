import fs from "fs";
import { propose, extractFeatures, hasIssues } from "../reconcile/reconciler";

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
  const issues = extractFeatures(report);

  if (!hasIssues(issues)) {
    console.log("All features implemented, no violations found.");
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
