import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { buildProposalPrompt, buildApplyPrompt, SYSTEM_PROMPT } from "./prompt-builder";
import { stripMarkdownFences, validateApplyResult } from "./validator";
import { Report, ReportFeature } from "../types";

function collectSourceContext(presentFeatures: ReportFeature[]): Record<string, string> {
  const files = new Set<string>();
  for (const f of presentFeatures) {
    if (f.implementedIn) files.add(f.implementedIn);
  }
  const context: Record<string, string> = {};
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
function extractFeatures(report: any): { missing: ReportFeature[]; present: ReportFeature[] } {
  // v0.2 format: unified features array
  if (report.features && Array.isArray(report.features)) {
    const missing = report.features.filter((f: ReportFeature) => f.result === "missing");
    const present = report.features.filter((f: ReportFeature) => f.result === "present");
    return { missing, present };
  }
  // v0.1 format: separate arrays
  return {
    missing: report.missingFeatures || [],
    present: report.presentFeatures || [],
  };
}

function buildSections(missing: ReportFeature[], sourceContext: Record<string, string>): { sourceSection: string; missingSection: string } {
  const sourceSection = Object.entries(sourceContext)
    .map(([file, content]) => `### ${file}\n\`\`\`js\n${content}\n\`\`\``)
    .join("\n\n");

  const missingSection = missing
    .map((f) => `- ${f.id}: ${f.method} ${f.path}`)
    .join("\n");

  return { sourceSection, missingSection };
}

interface TokenUsage {
  input: number;
  output: number;
}

function extractTokenUsage(message: Anthropic.Message): TokenUsage {
  return {
    input: message.usage?.input_tokens || 0,
    output: message.usage?.output_tokens || 0,
  };
}

async function propose(report: Report): Promise<{ text: string; tokenUsage: TokenUsage }> {
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
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return { text, tokenUsage: extractTokenUsage(message) };
}

interface ApplyResult {
  applied: boolean;
  dryRun?: boolean;
  changedFiles: string[];
  proposedChanges?: Record<string, string>;
  missingFeatures: string[];
  tokenUsage: TokenUsage;
}

async function apply(report: Report, options: { dryRun?: boolean } = {}): Promise<ApplyResult> {
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
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(stripMarkdownFences(rawText));
  } catch (err: any) {
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
  const changedFiles: string[] = [];
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

export { collectSourceContext, extractFeatures, propose, apply };
