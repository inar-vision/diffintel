#!/usr/bin/env node

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");

const applyMode = process.argv.includes("--apply");
const positionalArgs = process.argv.slice(2).filter((a) => a !== "--apply");

function loadReport(arg) {
  if (arg) {
    return JSON.parse(fs.readFileSync(arg, "utf-8"));
  }
  // Read from stdin
  const input = fs.readFileSync(0, "utf-8");
  return JSON.parse(input);
}

function collectSourceContext(presentFeatures) {
  const files = new Set();
  for (const f of presentFeatures) {
    if (f.implementedIn) files.add(f.implementedIn);
  }
  const context = {};
  for (const filePath of files) {
    try {
      context[filePath] = fs.readFileSync(filePath, "utf-8");
    } catch {
      // File may not exist; skip
    }
  }
  return context;
}

function buildProposalPrompt(missingSection, sourceSection) {
  return `You are reviewing an Express.js application. The following features are declared in the intent specification but have NOT been implemented yet:

${missingSection}

Here are the existing source files for context on patterns and style:

${sourceSection}

Please write a plain-text proposal (not code) describing what changes are needed to implement each missing feature. For each feature, describe:
1. Which file should be modified
2. What the route handler should do (based on patterns in existing code)
3. Any middleware or validation that might be needed

Keep the proposal concise and actionable.`;
}

function buildApplyPrompt(missingSection, sourceSection, allowedFiles) {
  return `You are modifying an Express.js application. The following features are declared in the intent specification but have NOT been implemented yet:

${missingSection}

Here are the existing source files:

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

function stripMarkdownFences(text) {
  let cleaned = text.trim();
  // Remove ```json ... ``` or ``` ... ```
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "");
  cleaned = cleaned.replace(/\n?```\s*$/, "");
  return cleaned.trim();
}

function validateApplyResult(parsed, sourceContext, report) {
  // Must be a plain object
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    console.error("Validation failed: LLM response is not a JSON object");
    return false;
  }

  const allowedFiles = Object.keys(sourceContext);

  for (const [filePath, content] of Object.entries(parsed)) {
    // File allowlist check
    if (!allowedFiles.includes(filePath)) {
      console.error(
        `Validation failed: "${filePath}" is not in the allowed file list`
      );
      return false;
    }

    // intent.json guard
    if (path.basename(filePath) === "intent.json") {
      console.error("Validation failed: cannot modify intent.json");
      return false;
    }

    // Value type check
    if (typeof content !== "string" || content.trim().length === 0) {
      console.error(
        `Validation failed: content for "${filePath}" must be a non-empty string`
      );
      return false;
    }
  }

  // Route preservation check — all existing routes must still appear
  for (const feature of report.presentFeatures || []) {
    if (!feature.implementedIn) continue;
    const newContent = parsed[feature.implementedIn];
    if (!newContent) continue; // File not being modified, routes preserved

    // Check that the route path still appears in modified content
    const routePattern = feature.path.replace(
      /:[^/]+/g,
      "[^)\"'`]+"
    );
    const regex = new RegExp(routePattern);
    if (!regex.test(newContent)) {
      console.error(
        `Validation failed: existing route "${feature.method} ${feature.path}" not found in modified "${feature.implementedIn}"`
      );
      return false;
    }
  }

  return true;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      "Error: ANTHROPIC_API_KEY environment variable is required.\n" +
        "Set it with: export ANTHROPIC_API_KEY=your-key-here"
    );
    process.exit(1);
  }

  const reportPath = positionalArgs[0] || null;
  const report = loadReport(reportPath);

  if (!report.missingFeatures || report.missingFeatures.length === 0) {
    console.log("All features implemented.");
    process.exit(0);
  }

  const sourceContext = collectSourceContext(report.presentFeatures || []);

  const sourceSection = Object.entries(sourceContext)
    .map(([file, content]) => `### ${file}\n\`\`\`js\n${content}\n\`\`\``)
    .join("\n\n");

  const missingSection = report.missingFeatures
    .map((f) => `- ${f.id}: ${f.method} ${f.path}`)
    .join("\n");

  if (!applyMode) {
    // Original text-proposal mode
    const prompt = buildProposalPrompt(missingSection, sourceSection);

    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    console.log(text);
    return;
  }

  // --apply mode: generate code and write files
  const allowedFiles = Object.keys(sourceContext);
  const prompt = buildApplyPrompt(missingSection, sourceSection, allowedFiles);

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  // Parse JSON from LLM response
  let parsed;
  try {
    parsed = JSON.parse(stripMarkdownFences(rawText));
  } catch (err) {
    console.error("Failed to parse LLM response as JSON:", err.message);
    process.exit(2);
  }

  // Validate
  if (!validateApplyResult(parsed, sourceContext, report)) {
    process.exit(2);
  }

  // Write files to disk
  const changedFiles = [];
  for (const [filePath, content] of Object.entries(parsed)) {
    fs.writeFileSync(filePath, content, "utf-8");
    changedFiles.push(filePath);
  }

  const summary = {
    applied: true,
    changedFiles,
    missingFeatures: report.missingFeatures.map((f) => f.id),
  };

  // Write summary to apply-result.json for CI consumption
  fs.writeFileSync("apply-result.json", JSON.stringify(summary, null, 2), "utf-8");
  console.error("Apply result written to apply-result.json");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
