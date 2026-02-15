#!/usr/bin/env node

import { program } from "commander";
import pkg from "../package.json";

program
  .name("diffintel")
  .description("AI-powered structural diff explainer for pull requests")
  .version(pkg.version);

program
  .command("explain")
  .description("Generate an HTML report explaining code changes between refs")
  .option("--base <ref>", "Base ref to diff from (default: origin/main)")
  .option("--head <ref>", "Head ref to diff to (default: HEAD)")
  .option("--out <file>", "Output HTML file path (default: explain-report.html)")
  .option("--summary <file>", "Output markdown summary file path (default: <out>.md)")
  .option("--single-call", "Force single LLM call mode (no batching)")
  .option("--max-batches <n>", "Maximum number of LLM batches (default: 5)")
  .action(async (opts) => {
    require("dotenv").config();
    const { run } = require("./commands/explain");
    const code = await run(opts);
    process.exit(code);
  });

program
  .command("init")
  .description("Set up GitHub Action workflow for PR analysis")
  .action(() => {
    const { run } = require("./commands/init");
    const code = run();
    process.exit(code);
  });

program.parse();
