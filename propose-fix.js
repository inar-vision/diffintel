#!/usr/bin/env node

// Thin wrapper — delegates to src/commands/propose.js or src/commands/apply.js
// Preserved for backward compatibility with existing CI and scripts.

require("dotenv").config();

const applyMode = process.argv.includes("--apply");
const positionalArgs = process.argv.slice(2).filter((a) => a !== "--apply");
const reportPath = positionalArgs[0] || null;

async function main() {
  if (applyMode) {
    const { run } = require("./src/commands/apply");
    const code = await run({ report: reportPath });
    process.exit(code);
  } else {
    const { run } = require("./src/commands/propose");
    const code = await run({ report: reportPath });
    process.exit(code);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
