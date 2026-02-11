const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  intentFile: "intent.json",
  scanDir: ".",
  exclude: ["node_modules", ".git", "test"],
};

function loadConfig(overrides = {}) {
  const rcPath = path.resolve(process.cwd(), ".intentrc.json");
  let fileConfig = {};

  if (fs.existsSync(rcPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(rcPath, "utf-8"));
    } catch (err) {
      throw new Error(`Failed to parse .intentrc.json: ${err.message}`);
    }
  }

  // Filter out undefined values so they don't clobber defaults
  const cleaned = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) cleaned[key] = value;
  }

  return { ...DEFAULTS, ...fileConfig, ...cleaned };
}

module.exports = { loadConfig, DEFAULTS };
