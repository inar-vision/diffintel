function buildReport(intent, checkResult, meta = {}) {
  const {
    presentFeatures,
    missingFeatures,
    extraFeatures,
    draftFeatures = [],
    deprecatedFeatures = [],
    unannotatedFeatures = [],
  } = checkResult;

  const report = {
    version: "0.1",
    intentFile: meta.intentFile || "intent.json",
    timestamp: new Date().toISOString(),
    summary: {
      totalDeclared: presentFeatures.length + missingFeatures.length,
      totalImplemented: meta.totalImplemented || 0,
      present: presentFeatures.length,
      missing: missingFeatures.length,
      extra: extraFeatures.length,
    },
    presentFeatures,
    missingFeatures,
    extraFeatures,
  };

  if (draftFeatures.length > 0) {
    report.summary.draft = draftFeatures.length;
    report.draftFeatures = draftFeatures;
  }
  if (deprecatedFeatures.length > 0) {
    report.summary.deprecated = deprecatedFeatures.length;
    report.deprecatedFeatures = deprecatedFeatures;
  }
  if (unannotatedFeatures.length > 0) {
    report.summary.unannotated = unannotatedFeatures.length;
    report.unannotatedFeatures = unannotatedFeatures;
  }

  return report;
}

function formatReport(report, format = "text") {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }

  const lines = [];
  lines.push(`\nIntent check: ${report.intentFile}`);
  lines.push(`Declared features: ${report.summary.totalDeclared}`);
  lines.push(`Present:           ${report.summary.present}`);
  lines.push(`Missing:           ${report.summary.missing}`);
  lines.push(`Extra:             ${report.summary.extra}`);

  if (report.summary.draft) {
    lines.push(`Draft (skipped):   ${report.summary.draft}`);
  }
  if (report.summary.deprecated) {
    lines.push(`Deprecated:        ${report.summary.deprecated}`);
  }
  if (report.summary.unannotated) {
    lines.push(`No analyzer:       ${report.summary.unannotated}`);
  }

  if (report.missingFeatures.length > 0) {
    lines.push(`\nMissing features:`);
    for (const m of report.missingFeatures) {
      lines.push(`  - ${m.id} (${m.method} ${m.path})`);
    }
  }
  if (report.extraFeatures.length > 0) {
    lines.push(`\nExtra features (not in intent):`);
    for (const e of report.extraFeatures) {
      lines.push(`  - ${e.method} ${e.path} (${e.implementedIn})`);
    }
  }
  if (report.deprecatedFeatures && report.deprecatedFeatures.length > 0) {
    lines.push(`\nDeprecated features (still present):`);
    for (const d of report.deprecatedFeatures) {
      lines.push(`  - ${d.id} (${d.method} ${d.path}) in ${d.implementedIn}`);
    }
  }
  if (report.unannotatedFeatures && report.unannotatedFeatures.length > 0) {
    lines.push(`\nFeatures with no analyzer:`);
    for (const u of report.unannotatedFeatures) {
      lines.push(`  - ${u.id} (type: ${u.type})`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

module.exports = { buildReport, formatReport };
