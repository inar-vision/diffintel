#!/usr/bin/env node

const { program } = require("commander");
const pkg = require("../package.json");

program
  .name("intent-spec")
  .description("Intent specification checker and reconciler")
  .version(pkg.version);

program
  .command("check")
  .description("Check intent coverage against implemented code")
  .option("--out <file>", "Write report to file")
  .option("--format <format>", "Output format: text, json, or summary")
  .option("--intent <file>", "Path to intent file")
  .option("--dir <dir>", "Directory to scan")
  .option("--diff <file>", "Compare against a previous report")
  .action((opts) => {
    const { run } = require("./commands/check");
    const code = run(opts);
    process.exit(code);
  });

program
  .command("init")
  .description("Create a starter intent.json")
  .option("--force", "Overwrite existing intent.json")
  .action((opts) => {
    const { run } = require("./commands/init");
    const code = run(opts);
    process.exit(code);
  });

program
  .command("validate")
  .description("Validate intent.json structure")
  .option("--intent <file>", "Path to intent file")
  .action((opts) => {
    const { run } = require("./commands/validate");
    const code = run(opts);
    process.exit(code);
  });

program
  .command("migrate")
  .description("Migrate intent.json from v0.1 to v0.2 format")
  .option("--intent <file>", "Path to intent file")
  .action((opts) => {
    const { run } = require("./commands/migrate");
    const code = run(opts);
    process.exit(code);
  });

program
  .command("propose <report>")
  .description("Generate a text proposal for missing features")
  .action(async (report) => {
    require("dotenv").config();
    const { run } = require("./commands/propose");
    const code = await run({ report });
    process.exit(code);
  });

program
  .command("apply <report>")
  .description("Auto-fix missing features using AI")
  .action(async (report) => {
    require("dotenv").config();
    const { run } = require("./commands/apply");
    const code = await run({ report });
    process.exit(code);
  });

program.parse();
