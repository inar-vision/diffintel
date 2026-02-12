import fs from "fs";
import path from "path";
import { loadConfig } from "../config";
import { loadIntent, normalizeIntent } from "../core/intent";

interface MigrateOptions {
  intent?: string;
}

function run(options: MigrateOptions = {}): number {
  const config = loadConfig({ intentFile: options.intent });
  const intentFile = config.intentFile;
  const filePath = path.resolve(process.cwd(), intentFile);

  let intent;
  try {
    intent = loadIntent(filePath);
  } catch (err: any) {
    console.error(`Failed to load ${intentFile}: ${err.message}`);
    return 1;
  }

  if (intent.version === "0.2") {
    console.log(`${intentFile} is already v0.2.`);
    return 0;
  }

  const migrated = normalizeIntent(intent);

  fs.writeFileSync(filePath, JSON.stringify(migrated, null, 2) + "\n");
  console.log(`Migrated ${intentFile} from v${intent.version || "0.1"} to v0.2.`);
  return 0;
}

export { run };
