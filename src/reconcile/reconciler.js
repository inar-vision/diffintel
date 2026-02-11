const fs = require("fs");
const Anthropic = require("@anthropic-ai/sdk");
const { buildProposalPrompt, buildApplyPrompt } = require("./prompt-builder");
const { stripMarkdownFences, validateApplyResult } = require("./validator");

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

function buildSections(report, sourceContext) {
  const sourceSection = Object.entries(sourceContext)
    .map(([file, content]) => `### ${file}\n\`\`\`js\n${content}\n\`\`\``)
    .join("\n\n");

  const missingSection = report.missingFeatures
    .map((f) => `- ${f.id}: ${f.method} ${f.path}`)
    .join("\n");

  return { sourceSection, missingSection };
}

async function propose(report) {
  const sourceContext = collectSourceContext(report.presentFeatures || []);
  const { sourceSection, missingSection } = buildSections(report, sourceContext);
  const prompt = buildProposalPrompt(missingSection, sourceSection);

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

async function apply(report) {
  const sourceContext = collectSourceContext(report.presentFeatures || []);
  const { sourceSection, missingSection } = buildSections(report, sourceContext);
  const allowedFiles = Object.keys(sourceContext);
  const prompt = buildApplyPrompt(missingSection, sourceSection, allowedFiles);

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  let parsed;
  try {
    parsed = JSON.parse(stripMarkdownFences(rawText));
  } catch (err) {
    throw new Error(`Failed to parse LLM response as JSON: ${err.message}`);
  }

  const validation = validateApplyResult(parsed, sourceContext, report);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.error}`);
  }

  const changedFiles = [];
  for (const [filePath, content] of Object.entries(parsed)) {
    fs.writeFileSync(filePath, content, "utf-8");
    changedFiles.push(filePath);
  }

  const summary = {
    applied: true,
    changedFiles,
    missingFeatures: report.missingFeatures.map((f) => f.id),
  };

  fs.writeFileSync(
    "apply-result.json",
    JSON.stringify(summary, null, 2),
    "utf-8"
  );

  return summary;
}

module.exports = { collectSourceContext, propose, apply };
