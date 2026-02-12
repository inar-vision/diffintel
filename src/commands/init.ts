import fs from "fs";
import path from "path";
import { loadConfig } from "../config";
import { findSourceFiles } from "../core/scanner";
import { createRunner } from "../analyzers";

function generateId(method: string, routePath: string): string {
  // /users/:id → users-id, /health → health
  const cleaned = routePath
    .replace(/^\//, "")
    .replace(/:[^/]+/g, (match) => match.slice(1))
    .replace(/\//g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "");

  const prefix = method.toLowerCase();
  if (!cleaned) return prefix + "-root";
  return prefix + "-" + cleaned;
}

interface InitOptions {
  force?: boolean;
  dir?: string;
}

function run(options: InitOptions = {}): number {
  const targetPath = path.resolve(process.cwd(), "intent.json");

  if (fs.existsSync(targetPath) && !options.force) {
    console.error(
      `intent.json already exists. Use --force to overwrite.`
    );
    return 1;
  }

  // Try to auto-discover routes from the codebase
  const config = loadConfig({ scanDir: options.dir });
  const runner = createRunner(config);
  const extensions = runner.getFileExtensions();

  let discovered: ReturnType<typeof runner.analyzeFiles> = [];
  try {
    const files = findSourceFiles(config.scanDir, {
      exclude: config.exclude,
      extensions,
    });
    discovered = runner.analyzeFiles(files);
  } catch {
    // Scan failed — fall back to empty
  }

  const projectName = path.basename(process.cwd());

  const intent = {
    version: "0.2",
    meta: {
      name: projectName,
    },
    features: [] as Array<{
      id: string;
      type: string;
      status: string;
      method: string;
      path: string;
      description?: string;
    }>,
  };

  if (discovered.length > 0) {
    // Deduplicate by method+path (keep first occurrence)
    const seen = new Set<string>();
    for (const impl of discovered) {
      const key = `${impl.method} ${impl.path}`;
      if (seen.has(key)) continue;
      seen.add(key);

      intent.features.push({
        id: generateId(impl.method, impl.path),
        type: impl.type || "http-route",
        status: "approved",
        method: impl.method,
        path: impl.path,
      });
    }
    console.error(`Discovered ${intent.features.length} route(s) from source code.`);
  } else {
    intent.features.push({
      id: "example-feature",
      type: "http-route",
      description: "Example route - replace with your own",
      status: "approved",
      method: "GET",
      path: "/example",
    });
    console.error("No routes discovered. Created template with example feature.");
  }

  fs.writeFileSync(
    targetPath,
    JSON.stringify(intent, null, 2) + "\n"
  );
  console.log(`Created ${targetPath}`);
  return 0;
}

export { run };
