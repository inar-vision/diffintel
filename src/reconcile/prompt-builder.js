const SYSTEM_PROMPT = `You are an expert Express.js developer assisting with code generation.
You must ONLY modify files explicitly listed as allowed.
You must NOT modify intent.json or any configuration files.
You must preserve ALL existing functionality — do not remove or break existing routes.
Follow the patterns and conventions already present in the codebase.`;

function buildIntentContext(report) {
  const lines = [];
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

function buildProposalPrompt(missingSection, sourceSection, report) {
  const intentContext = report ? buildIntentContext(report) : "";

  return `You are reviewing an Express.js application. The following features are declared in the intent specification but have NOT been implemented yet:

${missingSection}

${intentContext ? intentContext + "\n\n" : ""}Here are the existing source files for context on patterns and style:

${sourceSection}

Please write a plain-text proposal (not code) describing what changes are needed to implement each missing feature. For each feature, describe:
1. Which file should be modified
2. What the route handler should do (based on patterns in existing code)
3. Any middleware or validation that might be needed

Keep the proposal concise and actionable.`;
}

function buildApplyPrompt(missingSection, sourceSection, allowedFiles, report) {
  const intentContext = report ? buildIntentContext(report) : "";

  return `You are modifying an Express.js application. The following features are declared in the intent specification but have NOT been implemented yet:

${missingSection}

${intentContext ? intentContext + "\n\n" : ""}Here are the existing source files:

${sourceSection}

You MUST return a JSON object mapping file paths to their complete new file contents. The JSON must include the ENTIRE file content for each modified file, not just the changes.

Rules:
- You may ONLY modify these files: ${allowedFiles.join(", ")}
- You must NOT modify intent.json
- You must preserve ALL existing routes and functionality
- Add the missing routes following the patterns in the existing code
- Return ONLY the JSON object, no other text

Example format:
{
  "app.js": "const express = require('express');\\n..."
}`;
}

module.exports = { buildProposalPrompt, buildApplyPrompt, SYSTEM_PROMPT };
