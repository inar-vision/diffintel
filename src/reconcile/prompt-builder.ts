import { Report } from "../types";

const SYSTEM_PROMPT = `You are an expert Express.js developer assisting with code generation.
You must ONLY modify files explicitly listed as allowed.
You must NOT modify intent.json or any configuration files.
You must preserve ALL existing functionality — do not remove or break existing routes.
Follow the patterns and conventions already present in the codebase.`;

function buildIntentContext(report: Report): string {
  const lines: string[] = [];
  lines.push("## Intent specification context");
  lines.push(`Intent version: ${report.meta?.intentVersion || report.version || "unknown"}`);

  const features = report.features || [];
  if (features.length > 0) {
    lines.push("\nAll declared features:");
    for (const f of features) {
      const parts = [`- ${f.id} (${f.type})`, `status: ${f.status || "approved"}`];
      if (f.method) parts.push(`${f.method} ${f.path}`);
      if (f.result) parts.push(`result: ${f.result}`);
      lines.push(parts.join(" | "));
    }
  }

  return lines.join("\n");
}

function buildIssueSections(
  missingSection: string,
  constraintSection?: string,
  contractSection?: string,
): string {
  const parts: string[] = [];

  if (missingSection) {
    parts.push(`## Missing features\nThe following features are declared but not implemented:\n\n${missingSection}`);
  }

  if (constraintSection) {
    parts.push(`## Constraint violations\nThe following cross-cutting constraints are violated:\n\n${constraintSection}`);
  }

  if (contractSection) {
    parts.push(`## Contract violations\nThe following routes violate their behavioral contracts:\n\n${contractSection}`);
  }

  return parts.join("\n\n");
}

function buildProposalPrompt(
  missingSection: string,
  sourceSection: string,
  report?: Report,
  constraintSection?: string,
  contractSection?: string,
): string {
  const intentContext = report ? buildIntentContext(report) : "";
  const issueContent = buildIssueSections(missingSection, constraintSection, contractSection);

  return `You are reviewing an Express.js application. The following issues need to be resolved:

${issueContent}

${intentContext ? intentContext + "\n\n" : ""}Here are the existing source files for context on patterns and style:

${sourceSection}

Please write a plain-text proposal (not code) describing what changes are needed to resolve each issue. For each issue, describe:
1. Which file should be modified
2. What changes are needed (add route, add middleware, remove import, wrap handler, etc.)
3. Any middleware or validation that might be needed

Keep the proposal concise and actionable.`;
}

function buildApplyPrompt(
  missingSection: string,
  sourceSection: string,
  allowedFiles: string[],
  report?: Report,
  constraintSection?: string,
  contractSection?: string,
): string {
  const intentContext = report ? buildIntentContext(report) : "";
  const issueContent = buildIssueSections(missingSection, constraintSection, contractSection);

  return `You are modifying an Express.js application. The following issues need to be resolved:

${issueContent}

${intentContext ? intentContext + "\n\n" : ""}Here are the existing source files:

${sourceSection}

You MUST return a JSON object mapping file paths to their complete new file contents. The JSON must include the ENTIRE file content for each modified file, not just the changes.

Rules:
- You may ONLY modify these files: ${allowedFiles.join(", ")}
- You must NOT modify intent.json
- You must preserve ALL existing routes and functionality
- For missing features: add the routes following the patterns in the existing code
- For constraint violations: add required middleware, remove forbidden imports, or wrap handlers as specified
- For contract violations: add or fix middleware on the specific routes to satisfy their contracts
- Return ONLY the JSON object, no other text

Example format:
{
  "app.js": "const express = require('express');\\n..."
}`;
}

export { buildProposalPrompt, buildApplyPrompt, buildIssueSections, SYSTEM_PROMPT };
