const path = require("path");

function stripMarkdownFences(text) {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "");
  cleaned = cleaned.replace(/\n?```\s*$/, "");
  return cleaned.trim();
}

function validateApplyResult(parsed, sourceContext, report) {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { valid: false, error: "LLM response is not a JSON object" };
  }

  const allowedFiles = Object.keys(sourceContext);

  for (const [filePath, content] of Object.entries(parsed)) {
    if (!allowedFiles.includes(filePath)) {
      return {
        valid: false,
        error: `"${filePath}" is not in the allowed file list`,
      };
    }

    if (path.basename(filePath) === "intent.json") {
      return { valid: false, error: "cannot modify intent.json" };
    }

    if (typeof content !== "string" || content.trim().length === 0) {
      return {
        valid: false,
        error: `content for "${filePath}" must be a non-empty string`,
      };
    }
  }

  for (const feature of report.presentFeatures || []) {
    if (!feature.implementedIn) continue;
    const newContent = parsed[feature.implementedIn];
    if (!newContent) continue;

    const routePattern = feature.path.replace(/:[^/]+/g, "[^)\"'`]+");
    const regex = new RegExp(routePattern);
    if (!regex.test(newContent)) {
      return {
        valid: false,
        error: `existing route "${feature.method} ${feature.path}" not found in modified "${feature.implementedIn}"`,
      };
    }
  }

  return { valid: true };
}

module.exports = { stripMarkdownFences, validateApplyResult };
