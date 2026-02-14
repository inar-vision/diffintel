import fs from "fs";
import { propose, extractFeatures, hasIssues } from "../reconcile/reconciler";
import { loadConfig } from "../config";

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

  const config = loadConfig();
  const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  const issues = extractFeatures(report);

  if (!hasIssues(issues)) {
    console.log("All features implemented, no violations found.");
    return 0;
  }

  const result = await propose(report, { config });

  if (result.text) {
    console.log(result.text);
  }

  if (result.unfixableIssues.length > 0) {
    console.error(`\n${result.unfixableIssues.length} unfixable issue(s) (require manual intervention):`);
    for (const issue of result.unfixableIssues) {
      console.error(`  [${issue.type}] ${issue.id}: ${issue.reason}`);
    }
  }

  if (result.tokenUsage.input > 0 || result.tokenUsage.output > 0) {
    console.error(
      `Token usage: ${result.tokenUsage.input} input, ${result.tokenUsage.output} output`
    );
  }

  return 0;
}

export { run };
