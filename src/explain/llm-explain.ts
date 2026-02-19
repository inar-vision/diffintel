import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { FileAnalysis, LLMExplanation, Fix, Risk, FileExplanation } from "./types";

type Provider = "anthropic" | "openai";

function detectProvider(): Provider | null {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  if (hasAnthropic && hasOpenAI) {
    const forced = process.env.DIFFINTEL_PROVIDER?.toLowerCase();
    if (forced === "openai") return "openai";
    return "anthropic"; // default when both present
  }
  if (hasAnthropic) return "anthropic";
  if (hasOpenAI) return "openai";
  return null;
}

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ text: string; tokenUsage: { input: number; output: number } }> {
  const provider = detectProvider();

  if (provider === "openai") {
    const openai = new OpenAI();
    const completion = await openai.chat.completions.create({
      model: process.env.DIFFINTEL_MODEL || "gpt-4o",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const text = completion.choices[0]?.message?.content || "";
    const tokenUsage = {
      input: completion.usage?.prompt_tokens || 0,
      output: completion.usage?.completion_tokens || 0,
    };
    return { text, tokenUsage };
  }

  // Default: Anthropic
  const client = new Anthropic();
  const message = await client.messages.create({
    model: process.env.DIFFINTEL_MODEL || "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  const tokenUsage = {
    input: message.usage?.input_tokens || 0,
    output: message.usage?.output_tokens || 0,
  };

  return { text, tokenUsage };
}

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
- Use CONTROL FLOW CONTEXT to understand guards and safety checks. If an operation is guarded (e.g., a file write protected by an existence check that returns early), do not flag it as a risk.

Structural change annotations:
- When a "+" entry has a "[related existing: ...]" annotation, the added declaration is related to existing code. Treat this as an improvement or refactor — not a new feature.
- Never say "adds the ability to...", "adds support for...", or "introduces..." for functionality that already existed in any form. Use "improves", "changes how", "refactors", or "fixes" instead.`;

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
    .map((f) => {
      const MAX_BASE_DECLS = 20;
      if (f.baseDeclarations.length <= MAX_BASE_DECLS) {
        return `- ${f.path} — existing declarations: ${f.baseDeclarations.join(", ")}`;
      }
      const shown = f.baseDeclarations.slice(0, MAX_BASE_DECLS).join(", ");
      const remaining = f.baseDeclarations.length - MAX_BASE_DECLS;
      return `- ${f.path} — existing declarations: ${shown}, ... and ${remaining} more`;
    })
    .join("\n");

  const structuralSummary = sortedFiles
    .filter((f) => f.structuralChanges.length > 0)
    .map((f) => {
      const changes = f.structuralChanges
        .map((c) => {
          const base = `${ACTION_ICON[c.action]}${c.name} (${c.type})`;
          return c.detail ? `${base} [${c.detail}]` : base;
        })
        .join(", ");
      return `- ${f.path} (${f.status}): ${changes}`;
    })
    .join("\n");

  const controlFlowSummary = sortedFiles
    .filter((f) => f.controlFlowAnnotations.length > 0)
    .map((f) => {
      const annotations = f.controlFlowAnnotations
        .map((a) => `  - ${a.functionName}() line ${a.line}: ${a.kind} — ${a.description}`)
        .join("\n");
      return `- ${f.path}:\n${annotations}`;
    })
    .join("\n");

  const fileList = sortedFiles.map((f) => `- ${f.path} (${f.status})`).join("\n");

  const truncatedDiff = truncateDiff(rawDiff, 4000);

  if (process.env.DIFFINTEL_DEBUG) {
    console.error("\n--- DEBUG: LLM prompt context ---");
    console.error("Base state:\n" + (baseSummary || "(none)"));
    console.error("Structural changes:\n" + (structuralSummary || "(none)"));
    console.error("--- END DEBUG ---\n");
  }

  const prompt = `## Recent git history for changed files
${historySummary || "(no prior history)"}

## Base state (declarations that existed BEFORE this diff — anything listed here is NOT new)
${baseSummary || "(new files only, no prior state)"}

## Structural changes (this diff)
${structuralSummary || "(no structural changes detected)"}

## Control flow context
${controlFlowSummary || "(no notable control flow patterns detected)"}

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

  let text: string;
  let tokenUsage: { input: number; output: number };
  try {
    const result = await callLLM(SYSTEM_PROMPT, prompt);
    text = result.text;
    tokenUsage = result.tokenUsage;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`LLM API call failed: ${detail}`);
    throw err;
  }

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
