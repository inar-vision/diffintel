const fs = require("fs");
const path = require("path");

// Auto-discover built-in analyzers from this directory
function loadBuiltinAnalyzers() {
  const dir = __dirname;
  const analyzers = [];

  for (const file of fs.readdirSync(dir)) {
    if (file === "index.js") continue;
    if (!file.endsWith(".js")) continue;
    const analyzer = require(path.join(dir, file));
    if (analyzer.name && analyzer.supportedTypes && analyzer.analyze && analyzer.match) {
      analyzers.push(analyzer);
    }
  }

  return analyzers;
}

function loadCustomAnalyzers(customPaths = []) {
  const analyzers = [];

  for (const p of customPaths) {
    const resolved = path.resolve(process.cwd(), p);
    try {
      const analyzer = require(resolved);
      if (!analyzer.name || !analyzer.supportedTypes || !analyzer.analyze || !analyzer.match) {
        console.error(`Warning: Custom analyzer at ${p} is missing required fields, skipping.`);
        continue;
      }
      analyzers.push(analyzer);
    } catch (err) {
      console.error(`Warning: Failed to load custom analyzer at ${p}: ${err.message}`);
    }
  }

  return analyzers;
}

function createRunner(config = {}) {
  const analyzerConfig = config.analyzers || {};
  const includeList = analyzerConfig.include || null; // null = all
  const customPaths = analyzerConfig.custom || [];

  let analyzers = loadBuiltinAnalyzers();

  // Filter by include list if specified
  if (includeList) {
    analyzers = analyzers.filter((a) => includeList.includes(a.name));
  }

  // Add custom analyzers
  analyzers.push(...loadCustomAnalyzers(customPaths));

  // Build type→analyzer mapping
  const typeMap = new Map();
  for (const analyzer of analyzers) {
    for (const type of analyzer.supportedTypes) {
      if (!typeMap.has(type)) {
        typeMap.set(type, []);
      }
      typeMap.get(type).push(analyzer);
    }
  }

  return {
    analyzers,

    // Get all file extensions needed across all analyzers
    getFileExtensions() {
      const exts = new Set();
      for (const a of analyzers) {
        for (const ext of a.fileExtensions || []) {
          exts.add(ext);
        }
      }
      return [...exts];
    },

    // Run all analyzers on the given files, return implementations grouped by type
    analyzeFiles(files) {
      const allImplementations = [];

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
    checkFeatures(intent, implementations) {
      const presentFeatures = [];
      const missingFeatures = [];
      const draftFeatures = [];
      const deprecatedFeatures = [];
      const unannotatedFeatures = [];
      const matchedImpls = new Set();

      for (const feature of intent.features) {
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
            // Track which implementation was matched
            const implKey = `${result.implementedIn}:${result.line}:${feature.type}`;
            matchedImpls.add(implKey);

            const entry = {
              id: feature.id,
              status,
              implementedIn: result.implementedIn,
              analyzer: analyzer.name,
              ...(result.line && { line: result.line }),
              ...(feature.method && { method: feature.method.toUpperCase() }),
              ...(feature.path && { path: feature.path }),
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
      const extraFeatures = [];
      for (const impl of implementations) {
        const implKey = `${impl.file}:${impl.line}:${impl.type}`;
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

module.exports = { createRunner, loadBuiltinAnalyzers, loadCustomAnalyzers };
