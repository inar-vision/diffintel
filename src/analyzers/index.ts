import path from "path";
import { Analyzer, Config, IntentDocument, Implementation, CheckResult } from "../types";
import createExpressAnalyzer from "./express-route";

function loadCustomAnalyzers(customPaths: string[] = []): Analyzer[] {
  const analyzers: Analyzer[] = [];

  for (const p of customPaths) {
    const resolved = path.resolve(process.cwd(), p);
    try {
      const analyzer = require(resolved) as Analyzer;
      if (!analyzer.name || !analyzer.supportedTypes || !analyzer.analyze || !analyzer.match) {
        console.error(`Warning: Custom analyzer at ${p} is missing required fields, skipping.`);
        continue;
      }
      analyzers.push(analyzer);
    } catch (err: any) {
      console.error(`Warning: Failed to load custom analyzer at ${p}: ${err.message}`);
    }
  }

  return analyzers;
}

interface AnalyzerRunner {
  analyzers: Analyzer[];
  getFileExtensions(): string[];
  analyzeFiles(files: string[]): Implementation[];
  checkFeatures(intent: IntentDocument, implementations: Implementation[]): CheckResult;
}

function createRunner(config: Partial<Config> = {}): AnalyzerRunner {
  const analyzerConfig = config.analyzers || {};
  const includeList = analyzerConfig.include || null; // null = all
  const customPaths = analyzerConfig.custom || [];

  const builtinAnalyzers: Analyzer[] = [
    createExpressAnalyzer({ authMiddleware: config.contracts?.authMiddleware }),
  ];

  let analyzers = [...builtinAnalyzers];

  // Filter by include list if specified
  if (includeList) {
    analyzers = analyzers.filter((a) => includeList.includes(a.name));
  }

  // Add custom analyzers
  analyzers.push(...loadCustomAnalyzers(customPaths));

  // Build type→analyzer mapping
  const typeMap = new Map<string, Analyzer[]>();
  for (const analyzer of analyzers) {
    for (const type of analyzer.supportedTypes) {
      if (!typeMap.has(type)) {
        typeMap.set(type, []);
      }
      typeMap.get(type)!.push(analyzer);
    }
  }

  return {
    analyzers,

    // Get all file extensions needed across all analyzers
    getFileExtensions(): string[] {
      const exts = new Set<string>();
      for (const a of analyzers) {
        for (const ext of a.fileExtensions || []) {
          exts.add(ext);
        }
      }
      return [...exts];
    },

    // Run all analyzers on the given files, return implementations grouped by type
    analyzeFiles(files: string[]): Implementation[] {
      const allImplementations: Implementation[] = [];

      for (const analyzer of analyzers) {
        // Filter files to only those with matching extensions
        const relevantFiles = files.filter((f) =>
          (analyzer.fileExtensions || []).some((ext) => f.endsWith(ext))
        );

        if (relevantFiles.length === 0) continue;

        const results = analyzer.analyze(relevantFiles);
        for (const r of results) {
          allImplementations.push({ ...r, analyzer: analyzer.name });
        }
      }

      return allImplementations;
    },

    // Check all features against implementations
    checkFeatures(intent: IntentDocument, implementations: Implementation[]): CheckResult {
      const presentFeatures: CheckResult["presentFeatures"] = [];
      const missingFeatures: CheckResult["missingFeatures"] = [];
      const draftFeatures: CheckResult["draftFeatures"] = [];
      const deprecatedFeatures: CheckResult["deprecatedFeatures"] = [];
      const unannotatedFeatures: CheckResult["unannotatedFeatures"] = [];

      for (const feature of intent.features) {
        // Constraints are handled separately by the constraint engine
        if (feature.type === "constraint") continue;

        const status = feature.status || "approved";

        // Check if any analyzer handles this type
        const featureAnalyzers = typeMap.get(feature.type);
        if (!featureAnalyzers || featureAnalyzers.length === 0) {
          unannotatedFeatures.push({
            id: feature.id,
            type: feature.type,
            status,
            reason: `No analyzer available for type '${feature.type}'`,
          });
          continue;
        }

        // Draft features are informational only
        if (status === "draft") {
          draftFeatures.push({
            id: feature.id,
            type: feature.type,
            status,
            ...(feature.method && { method: feature.method.toUpperCase() }),
            ...(feature.path && { path: feature.path }),
          });
          continue;
        }

        // Try each analyzer that handles this type
        let matched = false;
        for (const analyzer of featureAnalyzers) {
          const typeImpls = implementations.filter(
            (impl) => impl.analyzer === analyzer.name
          );
          const result = analyzer.match(feature, typeImpls);

          if (result.found) {
            matched = true;

            const entry = {
              id: feature.id,
              status,
              implementedIn: result.implementedIn!,
              analyzer: analyzer.name,
              ...(result.line && { line: result.line }),
              ...(feature.method && { method: feature.method.toUpperCase() }),
              ...(feature.path && { path: feature.path }),
              ...(result.contractViolations && { contractViolations: result.contractViolations }),
            };

            if (status === "deprecated") {
              deprecatedFeatures.push(entry);
            }
            presentFeatures.push(entry);
            break;
          }
        }

        if (!matched) {
          missingFeatures.push({
            id: feature.id,
            status,
            ...(feature.method && { method: feature.method.toUpperCase() }),
            ...(feature.path && { path: feature.path }),
          });
        }
      }

      // Extra: implementations not matched to any feature
      const extraFeatures: CheckResult["extraFeatures"] = [];
      for (const impl of implementations) {
        // Check if any present feature matches this impl
        const isMatched = presentFeatures.some(
          (pf) =>
            pf.implementedIn === impl.file &&
            pf.method === impl.method &&
            pf.path === impl.path
        );
        if (!isMatched) {
          extraFeatures.push({
            method: impl.method,
            path: impl.path,
            implementedIn: impl.file,
            ...(impl.line && { line: impl.line }),
            analyzer: impl.analyzer,
          });
        }
      }

      return {
        presentFeatures,
        missingFeatures,
        extraFeatures,
        draftFeatures,
        deprecatedFeatures,
        unannotatedFeatures,
      };
    },
  };
}

export { createRunner, loadCustomAnalyzers };
