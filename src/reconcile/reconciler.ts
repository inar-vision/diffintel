import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { buildProposalPrompt, buildApplyPrompt, SYSTEM_PROMPT } from "./prompt-builder";
import { stripMarkdownFences, validateApplyResult } from "./validator";
import { Report, ReportFeature, ConstraintResult } from "../types";

interface ExtractedIssues {
  missing: ReportFeature[];
  present: ReportFeature[];
  failedConstraints: ConstraintResult[];
  contractViolations: ReportFeature[];
}

function collectSourceContext(presentFeatures: ReportFeature[], additionalFiles?: string[]): Record<string, string> {
  const files = new Set<string>();
  for (const f of presentFeatures) {
    if (f.implementedIn) files.add(f.implementedIn);
  }
  if (additionalFiles) {
    for (const f of additionalFiles) {
      files.add(f);
    }
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
 * Extract missing features, present features, failed constraints, and contract violations
 * from either v0.1 or v0.2 report format.
 */
function extractFeatures(report: any): ExtractedIssues {
  // v0.2 format: unified features array
  if (report.features && Array.isArray(report.features)) {
    const missing = report.features.filter((f: ReportFeature) => f.result === "missing");
    const present = report.features.filter((f: ReportFeature) => f.result === "present");

    const failedConstraints: ConstraintResult[] = (report.constraints?.results || [])
      .filter((cr: ConstraintResult) => cr.status === "failed");

    const contractViolations: ReportFeature[] = present
      .filter((f: ReportFeature) => f.contractViolations && f.contractViolations.length > 0);

    return { missing, present, failedConstraints, contractViolations };
  }
  // v0.1 format: separate arrays
  return {
    missing: report.missingFeatures || [],
    present: report.presentFeatures || [],
    failedConstraints: [],
    contractViolations: [],
  };
}

function hasIssues(issues: ExtractedIssues): boolean {
  return issues.missing.length > 0
    || issues.failedConstraints.length > 0
    || issues.contractViolations.length > 0;
}

interface IssueSections {
  sourceSection: string;
  missingSection: string;
  constraintSection: string;
  contractSection: string;
}

function buildSections(
  missing: ReportFeature[],
  sourceContext: Record<string, string>,
  failedConstraints: ConstraintResult[],
  contractViolations: ReportFeature[],
): IssueSections {
  const sourceSection = Object.entries(sourceContext)
    .map(([file, content]) => `### ${file}\n\`\`\`js\n${content}\n\`\`\``)
    .join("\n\n");

  const missingSection = missing
    .map((f) => `- ${f.id}: ${f.method} ${f.path}`)
    .join("\n");

  const constraintSection = failedConstraints
    .flatMap((cr) =>
      cr.violations.map((v) => {
        const loc = v.file ? (v.line ? `${v.file}:${v.line}` : v.file) : "";
        return `- [${cr.rule}] ${v.message}${loc ? ` (${loc})` : ""}`;
      })
    )
    .join("\n");

  const contractSection = contractViolations
    .flatMap((f) =>
      (f.contractViolations || []).map((v) =>
        `- ${f.id} (${f.method} ${f.path}): contract.${v.contract} expected ${v.expected}, actual ${v.actual}${f.implementedIn ? ` (${f.implementedIn})` : ""}`
      )
    )
    .join("\n");

  return { sourceSection, missingSection, constraintSection, contractSection };
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
  const { missing, present, failedConstraints, contractViolations } = extractFeatures(report);
  const constraintFiles = failedConstraints.flatMap(
    (cr) => cr.violations.filter((v) => v.file).map((v) => v.file!)
  );
  const sourceContext = collectSourceContext(present, constraintFiles);
  const { sourceSection, missingSection, constraintSection, contractSection } =
    buildSections(missing, sourceContext, failedConstraints, contractViolations);
  const prompt = buildProposalPrompt(missingSection, sourceSection, report, constraintSection, contractSection);

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
  fixedConstraints: string[];
  fixedContracts: string[];
  tokenUsage: TokenUsage;
}

async function apply(report: Report, options: { dryRun?: boolean } = {}): Promise<ApplyResult> {
  const dryRun = options.dryRun || false;
  const { missing, present, failedConstraints, contractViolations } = extractFeatures(report);
  const constraintFiles = failedConstraints.flatMap(
    (cr) => cr.violations.filter((v) => v.file).map((v) => v.file!)
  );
  const sourceContext = collectSourceContext(present, constraintFiles);
  const { sourceSection, missingSection, constraintSection, contractSection } =
    buildSections(missing, sourceContext, failedConstraints, contractViolations);
  const allowedFiles = Object.keys(sourceContext);
  const prompt = buildApplyPrompt(missingSection, sourceSection, allowedFiles, report, constraintSection, contractSection);

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

  const targetedConstraints = failedConstraints.map((cr) => cr.featureId);
  const targetedContracts = contractViolations.map((f) => f.id);

  if (dryRun) {
    return {
      applied: false,
      dryRun: true,
      changedFiles: Object.keys(parsed),
      proposedChanges: parsed,
      missingFeatures: missing.map((f) => f.id),
      fixedConstraints: targetedConstraints,
      fixedContracts: targetedContracts,
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
    fixedConstraints: targetedConstraints,
    fixedContracts: targetedContracts,
    tokenUsage,
  };
}

export { collectSourceContext, extractFeatures, hasIssues, buildSections, propose, apply };
