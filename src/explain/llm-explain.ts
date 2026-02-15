import Anthropic from "@anthropic-ai/sdk";
import { FileAnalysis, LLMExplanation, Risk } from "./types";

const SYSTEM_PROMPT = "You analyze code changes. Respond ONLY with valid JSON. Be extremely concise.";

const ACTION_ICON: Record<string, string> = {
  added: "+",
  removed: "-",
  modified: "~",
};

export async function explainChanges(
  files: FileAnalysis[],
  rawDiff: string,
): Promise<LLMExplanation> {
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

  const prompt = `## Structural changes
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
