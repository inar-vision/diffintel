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
- Stick to what the diff shows. Do not speculate about intent beyond what the code and history demonstrate.`;

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

export async function explainChanges(
  files: FileAnalysis[],
  rawDiff: string,
): Promise<LLMExplanation> {
  // Sort files by path for stable, deterministic prompt ordering
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  const historySummary = sortedFiles
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

  const baseSummary = sortedFiles
    .filter((f) => f.baseDeclarations.length > 0)
    .map((f) => `- ${f.path}: ${f.baseDeclarations.join(", ")}`)
    .join("\n");

  const structuralSummary = sortedFiles
    .filter((f) => f.structuralChanges.length > 0)
    .map((f) => {
      const changes = f.structuralChanges
        .map((c) => `${ACTION_ICON[c.action]}${c.name} (${c.type})`)
        .join(", ");
      return `- ${f.path} (${f.status}): ${changes}`;
    })
    .join("\n");

  const fileList = sortedFiles.map((f) => `- ${f.path} (${f.status})`).join("\n");

  const truncatedDiff = truncateDiff(rawDiff, 4000);

  const prompt = `## Recent git history for changed files
${historySummary || "(no prior history)"}

## Base state (what existed BEFORE this diff)
${baseSummary || "(new files only, no prior state)"}

## Structural changes (this diff)
${structuralSummary || "(no structural changes detected)"}

## Files changed
${fileList}

## Diff (truncated)
${truncatedDiff || "(empty diff)"}

Respond with JSON:
{
  "title": "<60 char title for these changes>",
  "description": "<2-4 sentences in plain language explaining what changed and why, suitable for non-developers>",
  "impact": ["<business/organizational impact statement>"],
  "fixes": [{"description": "<what was fixed or restored, one sentence>"}],
  "risks": [{"level": "low|medium|high", "description": "<genuine new risk, one sentence>"}],
  "fileExplanations": [{"path": "<file path>", "summary": "<1-2 sentences explaining what this file does and what changed>", "notes": ["<thing to consider about this specific change>"]}]
}

Rules:
- "impact": short, stakeholder-level statements about what this change means for the product/team. Think about what matters to engineers, product, security, legal, and leadership. Examples: "Security protections restored", "Reduced risk of unauthorized access", "Improved reliability of product creation". 1-4 items. Can be empty for trivial changes.
- "fixes": things this change REPAIRS or RESTORES (e.g., re-adding security that was removed). Can be empty.
- "risks": only GENUINE new concerns, NOT things being fixed. If a change restores previous behavior, that is a fix, not a risk. Can be empty.
- "fileExplanations": one entry per changed file, plain language. "notes" are file-specific things to consider — edge cases, testing suggestions, behavioral changes. Can be empty array if nothing notable.`;

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

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
    title: parsed.title || "Code changes",
    description: parsed.description || "",
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
