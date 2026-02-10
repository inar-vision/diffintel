#!/usr/bin/env node

require("dotenv").config();
const fs = require("fs");
const Anthropic = require("@anthropic-ai/sdk");

function loadReport(arg) {
  if (arg) {
    return JSON.parse(fs.readFileSync(arg, "utf-8"));
  }
  // Read from stdin
  const input = fs.readFileSync(0, "utf-8");
  return JSON.parse(input);
}

function collectSourceContext(presentFeatures) {
  const files = new Set();
  for (const f of presentFeatures) {
    if (f.implementedIn) files.add(f.implementedIn);
  }
  const context = {};
  for (const filePath of files) {
    try {
      context[filePath] = fs.readFileSync(filePath, "utf-8");
    } catch {
      // File may not exist; skip
    }
  }
  return context;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      "Error: ANTHROPIC_API_KEY environment variable is required.\n" +
        "Set it with: export ANTHROPIC_API_KEY=your-key-here"
    );
    process.exit(1);
  }

  const reportPath = process.argv[2] || null;
  const report = loadReport(reportPath);

  if (!report.missingFeatures || report.missingFeatures.length === 0) {
    console.log("All features implemented.");
    process.exit(0);
  }

  const sourceContext = collectSourceContext(report.presentFeatures || []);

  const sourceSection = Object.entries(sourceContext)
    .map(([file, content]) => `### ${file}\n\`\`\`js\n${content}\n\`\`\``)
    .join("\n\n");

  const missingSection = report.missingFeatures
    .map((f) => `- ${f.id}: ${f.method} ${f.path}`)
    .join("\n");

  const prompt = `You are reviewing an Express.js application. The following features are declared in the intent specification but have NOT been implemented yet:

${missingSection}

Here are the existing source files for context on patterns and style:

${sourceSection}

Please write a plain-text proposal (not code) describing what changes are needed to implement each missing feature. For each feature, describe:
1. Which file should be modified
2. What the route handler should do (based on patterns in existing code)
3. Any middleware or validation that might be needed

Keep the proposal concise and actionable.`;

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  console.log(text);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
