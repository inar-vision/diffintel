import Anthropic from "@anthropic-ai/sdk";
import { FileAnalysis, LLMExplanation, Fix, Risk, FileExplanation } from "./types";

const SYSTEM_PROMPT = `You explain code changes for both developers and non-developers. Respond ONLY with valid JSON. Be concise but clear.

Context rules:
- You are given BASE STATE, RECENT GIT HISTORY (with diffs), and the current changes.
- Use history to understand INTENT: if a recent commit broke something and this diff fixes it, categorize it as a FIX.
- Clearly separate what was FIXED from what are genuine RISKS.
- Write the description in plain language that a non-developer can understand.
- For file explanations, describe what each file does and what changed in simple terms.

Precision rules:
- When describing changes, state what BEHAVIOR changed, not just what code moved.
- Be specific: "product listings now require a valid token" not "authentication was added".
- Name the affected endpoints, functions, or data flows.
- If an assumption or invariant changed (e.g., "IDs were sequential, now they're computed"), say so.
- Stick to what the diff shows. Do not speculate about intent beyond what the code and history demonstrate.
- Use CONTROL FLOW CONTEXT to understand guards and safety checks. If an operation is guarded (e.g., a file write protected by an existence check that returns early), do not flag it as a risk.`;

const ACTION_ICON: Record<string, string> = {
  added: "+",
  removed: "-",
  modified: "~",
};

interface LLMResponse {
  title: string;
  description: string;
  impact: string[];
  fixes: Array<{ description: string }>;
  risks: Array<{ level: "low" | "medium" | "high"; description: string }>;
  fileExplanations: Array<{ path: string; summary: string; notes?: string[] }>;
}

export interface ExplainOptions {
  singleCall?: boolean;
  maxBatches?: number;
}

// ── Metadata budget helpers ──────────────────────────────────────────

const BUDGET_HISTORY = 15_000;
const BUDGET_BASE = 10_000;
const BUDGET_STRUCTURAL = 10_000;
const BUDGET_CONTROL_FLOW = 5_000;

export function capHistorySummary(sortedFiles: FileAnalysis[], budget: number = BUDGET_HISTORY): string {
  const raw = sortedFiles
    .filter((f) => f.recentHistory.length > 0)
    .map((f) => {
      const entries = f.recentHistory
        .map((h) => `  - ${h.hash} ${h.message} (${h.age})`)
        .join("\n");
      const latestDiff = f.recentHistory[0]?.diff;
      const trimmedDiff = latestDiff && latestDiff.length > 1500
        ? latestDiff.slice(0, 1500) + "\n... (truncated)"
        : latestDiff;
      const diffSection = trimmedDiff
        ? `\n  Most recent commit diff:\n${trimmedDiff.split("\n").map((l) => `    ${l}`).join("\n")}`
        : "";
      return `- ${f.path}:\n${entries}${diffSection}`;
    })
    .join("\n");

  if (raw.length <= budget) return raw;

  // Over budget — drop per-file diffs from history entries, starting with smallest
  const filesWithHistory = sortedFiles
    .filter((f) => f.recentHistory.length > 0)
    .map((f) => ({
      file: f,
      diffSize: f.recentHistory[0]?.diff?.length || 0,
    }))
    .sort((a, b) => a.diffSize - b.diffSize);

  const droppedPaths = new Set<string>();
  let currentSize = raw.length;

  for (const { file, diffSize } of filesWithHistory) {
    if (currentSize <= budget) break;
    droppedPaths.add(file.path);
    currentSize -= diffSize;
  }

  return sortedFiles
    .filter((f) => f.recentHistory.length > 0)
    .map((f) => {
      const entries = f.recentHistory
        .map((h) => `  - ${h.hash} ${h.message} (${h.age})`)
        .join("\n");
      if (droppedPaths.has(f.path)) {
        return `- ${f.path}:\n${entries}`;
      }
      const latestDiff = f.recentHistory[0]?.diff;
      const trimmedDiff = latestDiff && latestDiff.length > 1500
        ? latestDiff.slice(0, 1500) + "\n... (truncated)"
        : latestDiff;
      const diffSection = trimmedDiff
        ? `\n  Most recent commit diff:\n${trimmedDiff.split("\n").map((l) => `    ${l}`).join("\n")}`
        : "";
      return `- ${f.path}:\n${entries}${diffSection}`;
    })
    .join("\n");
}

export function capBaseSummary(sortedFiles: FileAnalysis[], budget: number = BUDGET_BASE): string {
  const raw = sortedFiles
    .filter((f) => f.baseDeclarations.length > 0)
    .map((f) => `- ${f.path}: ${f.baseDeclarations.join(", ")}`)
    .join("\n");

  if (raw.length <= budget) return raw;

  // Collapse to counts
  return sortedFiles
    .filter((f) => f.baseDeclarations.length > 0)
    .map((f) => {
      const counts: Record<string, number> = {};
      for (const decl of f.baseDeclarations) {
        // Declarations look like "function foo", "class Bar", "variable baz"
        const type = decl.split(" ")[0] || "other";
        counts[type] = (counts[type] || 0) + 1;
      }
      const countStr = Object.entries(counts)
        .map(([t, n]) => `${n} ${t}${n > 1 ? "s" : ""}`)
        .join(", ");
      return `- ${f.path}: ${f.baseDeclarations.length} declarations (${countStr})`;
    })
    .join("\n");
}

export function capStructuralSummary(sortedFiles: FileAnalysis[], budget: number = BUDGET_STRUCTURAL): string {
  const raw = sortedFiles
    .filter((f) => f.structuralChanges.length > 0)
    .map((f) => {
      const changes = f.structuralChanges
        .map((c) => `${ACTION_ICON[c.action]}${c.name} (${c.type})`)
        .join(", ");
      return `- ${f.path} (${f.status}): ${changes}`;
    })
    .join("\n");

  if (raw.length <= budget) return raw;

  // Collapse to counts per file
  return sortedFiles
    .filter((f) => f.structuralChanges.length > 0)
    .map((f) => {
      const counts: Record<string, Record<string, number>> = {};
      for (const c of f.structuralChanges) {
        if (!counts[c.action]) counts[c.action] = {};
        counts[c.action][c.type] = (counts[c.action][c.type] || 0) + 1;
      }
      const parts = Object.entries(counts).map(([action, types]) => {
        const typeStr = Object.entries(types)
          .map(([t, n]) => `${n} ${t}${n > 1 ? "s" : ""}`)
          .join(", ");
        return `${ACTION_ICON[action] || ""}${typeStr}`;
      });
      return `- ${f.path} (${f.status}): ${parts.join(", ")}`;
    })
    .join("\n");
}

export function capControlFlowSummary(
  sortedFiles: FileAnalysis[],
  budget: number = BUDGET_CONTROL_FLOW,
): string {
  const raw = sortedFiles
    .filter((f) => f.controlFlowAnnotations.length > 0)
    .map((f) => {
      const annotations = f.controlFlowAnnotations
        .map((a) => `  - ${a.functionName}() line ${a.line}: ${a.kind} — ${a.description}`)
        .join("\n");
      return `- ${f.path}:\n${annotations}`;
    })
    .join("\n");

  if (raw.length <= budget) return raw;

  // Keep only annotations for files with the most structural changes
  const filesByChanges = sortedFiles
    .filter((f) => f.controlFlowAnnotations.length > 0)
    .sort((a, b) => b.structuralChanges.length - a.structuralChanges.length);

  let result = "";
  for (const f of filesByChanges) {
    const annotations = f.controlFlowAnnotations
      .map((a) => `  - ${a.functionName}() line ${a.line}: ${a.kind} — ${a.description}`)
      .join("\n");
    const entry = `- ${f.path}:\n${annotations}\n`;
    if (result.length + entry.length > budget) break;
    result += entry;
  }
  return result.trimEnd();
}

// ── Diff splitting + batching ────────────────────────────────────────

export function splitDiffByFile(rawDiff: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!rawDiff.trim()) return result;

  const parts = rawDiff.split(/^(?=diff --git )/m).filter(Boolean);
  for (const part of parts) {
    const headerMatch = part.match(/^diff --git a\/(.+?) b\/(.+)/);
    if (!headerMatch) continue;
    const path = headerMatch[2];
    result.set(path, part);
  }
  return result;
}

export interface DiffBatch {
  files: string[];
  diffText: string;
  batchIndex: number;
  totalBatches: number;
}

export function createBatches(
  diffByFile: Map<string, string>,
  maxBatchSize: number = 3500,
  maxBatches: number = 5,
): DiffBatch[] {
  const entries = Array.from(diffByFile.entries());
  if (entries.length === 0) return [];

  const batches: Array<{ files: string[]; diffText: string }> = [];
  let currentFiles: string[] = [];
  let currentDiff = "";

  for (const [path, diff] of entries) {
    const fileDiff = diff.length > maxBatchSize
      ? diff.slice(0, maxBatchSize) + "\n... (file diff truncated)"
      : diff;

    if (currentDiff.length > 0 && currentDiff.length + fileDiff.length > maxBatchSize) {
      batches.push({ files: [...currentFiles], diffText: currentDiff });
      currentFiles = [];
      currentDiff = "";
    }

    currentFiles.push(path);
    currentDiff += fileDiff;
  }

  if (currentFiles.length > 0) {
    batches.push({ files: currentFiles, diffText: currentDiff });
  }

  // Cap to maxBatches — merge overflow into the last batch
  while (batches.length > maxBatches) {
    const overflow = batches.pop()!;
    const last = batches[batches.length - 1];
    last.files.push(...overflow.files);
    last.diffText += "\n" + overflow.diffText;
  }

  return batches.map((b, i) => ({
    ...b,
    batchIndex: i,
    totalBatches: batches.length,
  }));
}

// ── Main entry point ─────────────────────────────────────────────────

export async function explainChanges(
  files: FileAnalysis[],
  rawDiff: string,
  options: ExplainOptions = {},
): Promise<LLMExplanation> {
  const maxBatches = options.maxBatches
    ?? (parseInt(process.env.DIFFINTEL_MAX_BATCHES || "5", 10) || 5);

  // Sort files by path for stable, deterministic prompt ordering
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  // Build metadata with budget caps
  const historySummary = capHistorySummary(sortedFiles);
  const baseSummary = capBaseSummary(sortedFiles);
  const structuralSummary = capStructuralSummary(sortedFiles);
  const controlFlowSummary = capControlFlowSummary(sortedFiles);
  const fileList = sortedFiles.map((f) => `- ${f.path} (${f.status})`).join("\n");

  const sharedContext = buildSharedContext(
    historySummary, baseSummary, structuralSummary, controlFlowSummary, fileList,
  );

  // Decide: single call or batched
  const diffByFile = splitDiffByFile(rawDiff);
  const batches = createBatches(diffByFile, 3500, maxBatches);
  const useSingleCall = options.singleCall || batches.length <= 1;

  if (useSingleCall) {
    return singleCallExplain(sharedContext, rawDiff, sortedFiles);
  }

  return batchedExplain(sharedContext, batches, sortedFiles);
}

function buildSharedContext(
  historySummary: string,
  baseSummary: string,
  structuralSummary: string,
  controlFlowSummary: string,
  fileList: string,
): string {
  return `## Recent git history for changed files
${historySummary || "(no prior history)"}

## Base state (what existed BEFORE this diff)
${baseSummary || "(new files only, no prior state)"}

## Structural changes (this diff)
${structuralSummary || "(no structural changes detected)"}

## Control flow context
${controlFlowSummary || "(no notable control flow patterns detected)"}

## Files changed
${fileList}`;
}

const JSON_SCHEMA = `{
  "title": "<60 char title for these changes>",
  "description": "<2-4 sentences in plain language explaining what changed and why, suitable for non-developers>",
  "impact": ["<business/organizational impact statement>"],
  "fixes": [{"description": "<what was fixed or restored, one sentence>"}],
  "risks": [{"level": "low|medium|high", "description": "<genuine new risk, one sentence>"}],
  "fileExplanations": [{"path": "<file path>", "summary": "<1-2 sentences explaining what this file does and what changed>", "notes": ["<thing to consider about this specific change>"]}]
}`;

const RESPONSE_RULES = `Rules:
- "impact": short, stakeholder-level statements about what this change means for the product/team. Think about what matters to engineers, product, security, legal, and leadership. Examples: "Security protections restored", "Reduced risk of unauthorized access", "Improved reliability of product creation". 1-4 items. Can be empty for trivial changes.
- "fixes": things this change REPAIRS or RESTORES (e.g., re-adding security that was removed). Can be empty.
- "risks": only GENUINE new concerns, NOT things being fixed. If a change restores previous behavior, that is a fix, not a risk. Can be empty.
- "fileExplanations": one entry per changed file, plain language. "notes" are file-specific things to consider — edge cases, testing suggestions, behavioral changes. Can be empty array if nothing notable.`;

// ── Single-call mode (original behavior) ─────────────────────────────

async function singleCallExplain(
  sharedContext: string,
  rawDiff: string,
  sortedFiles: FileAnalysis[],
): Promise<LLMExplanation> {
  const truncatedDiff = truncateDiff(rawDiff, 4000);

  const prompt = `${sharedContext}

## Diff (truncated)
${truncatedDiff || "(empty diff)"}

Respond with JSON:
${JSON_SCHEMA}

${RESPONSE_RULES}`;

  const result = await callLLM(prompt);
  return result;
}

// ── Batched mode ─────────────────────────────────────────────────────

async function batchedExplain(
  sharedContext: string,
  batches: DiffBatch[],
  sortedFiles: FileAnalysis[],
): Promise<LLMExplanation> {
  const batchPromises = batches.map((batch) => {
    const batchNote = batches.length > 1
      ? `\n\n**Batch ${batch.batchIndex + 1} of ${batch.totalBatches}** — focus on these ${batch.files.length} file(s): ${batch.files.join(", ")}\n`
      : "";

    const prompt = `${sharedContext}${batchNote}

## Diff
${batch.diffText}

Respond with JSON:
${JSON_SCHEMA}

${RESPONSE_RULES}`;

    return callLLM(prompt);
  });

  const results = await Promise.all(batchPromises);
  return mergeResults(results);
}

function mergeResults(results: LLMExplanation[]): LLMExplanation {
  if (results.length === 0) {
    return {
      title: "Code changes",
      description: "",
      impact: [],
      fixes: [],
      risks: [],
      fileExplanations: [],
      tokenUsage: { input: 0, output: 0 },
    };
  }

  if (results.length === 1) return results[0];

  // Title and description from batch 1
  const title = results[0].title;

  // Concatenate batch descriptions
  const descriptions = results.map((r) => r.description).filter(Boolean);
  const description = descriptions.length <= 1
    ? descriptions[0] || ""
    : descriptions.join(" ");

  // Deduplicate impact
  const impactSet = new Set<string>();
  for (const r of results) {
    for (const i of r.impact) impactSet.add(i);
  }

  // Concatenate fixes, deduplicate by description similarity
  const fixDescriptions = new Set<string>();
  const fixes: Fix[] = [];
  for (const r of results) {
    for (const f of r.fixes) {
      const key = f.description.toLowerCase().trim();
      if (!fixDescriptions.has(key)) {
        fixDescriptions.add(key);
        fixes.push(f);
      }
    }
  }

  // Concatenate risks, deduplicate by description similarity
  const riskDescriptions = new Set<string>();
  const risks: Risk[] = [];
  for (const r of results) {
    for (const risk of r.risks) {
      const key = risk.description.toLowerCase().trim();
      if (!riskDescriptions.has(key)) {
        riskDescriptions.add(key);
        risks.push(risk);
      }
    }
  }

  // Concatenate fileExplanations (each batch covers different files)
  const fileExplanations: FileExplanation[] = [];
  for (const r of results) {
    fileExplanations.push(...r.fileExplanations);
  }

  // Sum token usage
  const tokenUsage = {
    input: results.reduce((sum, r) => sum + r.tokenUsage.input, 0),
    output: results.reduce((sum, r) => sum + r.tokenUsage.output, 0),
  };

  return {
    title,
    description,
    impact: Array.from(impactSet),
    fixes,
    risks,
    fileExplanations,
    tokenUsage,
  };
}

// ── LLM call helper ─────────────────────────────────────────────────

async function callLLM(prompt: string): Promise<LLMExplanation> {
  const client = new Anthropic();
  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: process.env.DIFFINTEL_MODEL || "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`LLM API call failed: ${detail}`);
    throw err;
  }

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  const tokenUsage = {
    input: message.usage?.input_tokens || 0,
    output: message.usage?.output_tokens || 0,
  };

  let parsed: LLMResponse;
  try {
    const cleaned = text.replace(/^```json\s*/m, "").replace(/```\s*$/m, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {
      title: "Code changes",
      description: text.slice(0, 200),
      impact: [],
      fixes: [],
      risks: [{ level: "low", description: "LLM response was not valid JSON; showing raw text." }],
      fileExplanations: [],
    };
  }

  return {
    title: typeof parsed.title === "string" ? parsed.title : "Code changes",
    description: typeof parsed.description === "string" ? parsed.description : "",
    impact: Array.isArray(parsed.impact) ? parsed.impact : [],
    fixes: Array.isArray(parsed.fixes) ? parsed.fixes : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks : [],
    fileExplanations: Array.isArray(parsed.fileExplanations)
      ? parsed.fileExplanations.map((fe) => ({ ...fe, notes: Array.isArray(fe.notes) ? fe.notes : [] }))
      : [],
    tokenUsage,
  };
}

function truncateDiff(diff: string, maxLen: number): string {
  if (diff.length <= maxLen) return diff;

  const sections = diff.split(/^diff --git /m).filter(Boolean);
  let result = "";
  for (const section of sections) {
    const chunk = `diff --git ${section}`;
    if (result.length + chunk.length > maxLen) {
      result += "\n... (diff truncated)";
      break;
    }
    result += chunk;
  }
  return result || diff.slice(0, maxLen) + "\n... (truncated)";
}
