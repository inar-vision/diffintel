const fs = require("fs");
const { propose } = require("../reconcile/reconciler");

async function run(options = {}) {
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

  if (!report.missingFeatures || report.missingFeatures.length === 0) {
    console.log("All features implemented.");
    return 0;
  }

  const text = await propose(report);
  console.log(text);
  return 0;
}

module.exports = { run };
