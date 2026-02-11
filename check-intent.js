#!/usr/bin/env node

// Thin wrapper — delegates to src/commands/check.js
// Preserved for backward compatibility with existing CI and scripts.

const args = process.argv.slice(2);
const options = { format: "json" };

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out" && args[i + 1]) {
    options.out = args[++i];
  }
}

const { run } = require("./src/commands/check");
const code = run(options);
process.exit(code);
