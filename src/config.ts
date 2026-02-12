import fs from "fs";
import path from "path";
import { Config } from "./types";

const DEFAULTS: Config = {
  intentFile: "intent.json",
  scanDir: ".",
  exclude: ["node_modules", ".git", "test"],
};

function loadConfig(overrides: Partial<Config> = {}): Config {
  const rcPath = path.resolve(process.cwd(), ".intentrc.json");
  let fileConfig: Partial<Config> = {};

  if (fs.existsSync(rcPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(rcPath, "utf-8"));
    } catch (err: any) {
      throw new Error(`Failed to parse .intentrc.json: ${err.message}`);
    }
  }

  // Filter out undefined values so they don't clobber defaults
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) cleaned[key] = value;
  }

  return { ...DEFAULTS, ...fileConfig, ...cleaned } as Config;
}

export { loadConfig, DEFAULTS };
