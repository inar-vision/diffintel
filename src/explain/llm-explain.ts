import Anthropic from "@anthropic-ai/sdk";
import { FileAnalysis, LLMExplanation, Risk } from "./types";

const SYSTEM_PROMPT = `You analyze code changes. Respond ONLY with valid JSON. Be extremely concise.

IMPORTANT context rules for risk assessment:
- You are given the BASE STATE (declarations before this diff) and RECENT GIT HISTORY (what happened to each file recently).
- Use history to understand INTENT: if a recent commit removed something and this diff adds it back, that is a FIX/RESTORATION, not a breaking change.
- RESTORATION: re-adding something that was recently removed is safe — do NOT flag as high risk.
- NEW addition: only flag as breaking if it introduces behavior that never existed before.
- REMOVAL: flag as risky if it removes established functionality.
- When history shows a recent problematic change, frame this diff as fixing/reverting that change.`;

const ACTION_ICON: Record<string, string> = {
  added: "+",
  removed: "-",
  modified: "~",
};

export async function explainChanges(
  files: FileAnalysis[],
  rawDiff: string,
): Promise<LLMExplanation> {
  const historySummary = files
    .filter((f) => f.recentHistory.length > 0)
    .map((f) => {
      const entries = f.recentHistory
        .map((h) => `  - ${h.hash} ${h.message} (${h.age})`)
        .join("\n");
      return `- ${f.path}:\n${entries}`;
    })
    .join("\n");

  const baseSummary = files
    .filter((f) => f.baseDeclarations.length > 0)
    .map((f) => `- ${f.path}: ${f.baseDeclarations.join(", ")}`)
    .join("\n");

  const structuralSummary = files
    .filter((f) => f.structuralChanges.length > 0)
    .map((f) => {
      const changes = f.structuralChanges
        .map((c) => `${ACTION_ICON[c.action]}${c.name} (${c.type})`)
        .join(", ");
      return `- ${f.path} (${f.status}): ${changes}`;
    })
    .join("\n");

  // Truncate diff to ~4000 chars, prioritizing modified files
  const truncatedDiff = truncateDiff(rawDiff, 4000);

  const prompt = `## Recent git history for changed files
${historySummary || "(no prior history)"}

## Base state (what existed BEFORE this diff)
${baseSummary || "(new files only, no prior state)"}

## Structural changes (this diff)
${structuralSummary || "(no structural changes detected)"}

## Diff (truncated)
${truncatedDiff || "(empty diff)"}

Respond with JSON:
{ "title": "<60 char PR title>",
  "description": "<2-4 sentences summarizing the changes>",
  "risks": [{"level":"low|medium|high","description":"<one sentence>"}] }`;

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 512,
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

  let parsed: { title: string; description: string; risks: Risk[] };
  try {
    const cleaned = text.replace(/^```json\s*/m, "").replace(/```\s*$/m, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    // Fallback if LLM doesn't return valid JSON
    parsed = {
      title: "Code changes",
      description: text.slice(0, 200),
      risks: [{ level: "low", description: "LLM response was not valid JSON; showing raw text." }],
    };
  }

  return {
    title: parsed.title || "Code changes",
    description: parsed.description || "",
    risks: Array.isArray(parsed.risks) ? parsed.risks : [],
    tokenUsage,
  };
}

function truncateDiff(diff: string, maxLen: number): string {
  if (diff.length <= maxLen) return diff;

  // Split by file sections, keep as many as fit
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
