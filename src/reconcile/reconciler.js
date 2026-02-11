const fs = require("fs");
const Anthropic = require("@anthropic-ai/sdk");
const { buildProposalPrompt, buildApplyPrompt, SYSTEM_PROMPT } = require("./prompt-builder");
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

/**
 * Extract missing and present features from either v0.1 or v0.2 report format.
 */
function extractFeatures(report) {
  // v0.2 format: unified features array
  if (report.features && Array.isArray(report.features)) {
    const missing = report.features.filter((f) => f.result === "missing");
    const present = report.features.filter((f) => f.result === "present");
    return { missing, present };
  }
  // v0.1 format: separate arrays
  return {
    missing: report.missingFeatures || [],
    present: report.presentFeatures || [],
  };
}

function buildSections(missing, sourceContext) {
  const sourceSection = Object.entries(sourceContext)
    .map(([file, content]) => `### ${file}\n\`\`\`js\n${content}\n\`\`\``)
    .join("\n\n");

  const missingSection = missing
    .map((f) => `- ${f.id}: ${f.method} ${f.path}`)
    .join("\n");

  return { sourceSection, missingSection };
}

function extractTokenUsage(message) {
  return {
    input: message.usage?.input_tokens || 0,
    output: message.usage?.output_tokens || 0,
  };
}

async function propose(report) {
  const { missing, present } = extractFeatures(report);
  const sourceContext = collectSourceContext(present);
  const { sourceSection, missingSection } = buildSections(missing, sourceContext);
  const prompt = buildProposalPrompt(missingSection, sourceSection, report);

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return { text, tokenUsage: extractTokenUsage(message) };
}

async function apply(report, options = {}) {
  const dryRun = options.dryRun || false;
  const { missing, present } = extractFeatures(report);
  const sourceContext = collectSourceContext(present);
  const { sourceSection, missingSection } = buildSections(missing, sourceContext);
  const allowedFiles = Object.keys(sourceContext);
  const prompt = buildApplyPrompt(missingSection, sourceSection, allowedFiles, report);

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const tokenUsage = extractTokenUsage(message);

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

  if (dryRun) {
    return {
      applied: false,
      dryRun: true,
      changedFiles: Object.keys(parsed),
      proposedChanges: parsed,
      missingFeatures: missing.map((f) => f.id),
      tokenUsage,
    };
  }

  // Write files
  const changedFiles = [];
  for (const [filePath, content] of Object.entries(parsed)) {
    fs.writeFileSync(filePath, content, "utf-8");
    changedFiles.push(filePath);
  }

  return {
    applied: true,
    changedFiles,
    missingFeatures: missing.map((f) => f.id),
    tokenUsage,
  };
}

module.exports = { collectSourceContext, extractFeatures, propose, apply };
