function buildReport(intent, checkResult, meta = {}) {
  const { presentFeatures, missingFeatures, extraFeatures } = checkResult;

  return {
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
  lines.push("");

  return lines.join("\n");
}

module.exports = { buildReport, formatReport };
