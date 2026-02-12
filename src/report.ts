import { IntentDocument, CheckResult, Report, ReportFeature, ExtraFeature, DiffResult } from "./types";

const supportsColor =
  process.stderr.isTTY && process.env.NO_COLOR === undefined;

const colors = supportsColor
  ? {
      green: (s: string) => `\x1b[32m${s}\x1b[0m`,
      red: (s: string) => `\x1b[31m${s}\x1b[0m`,
      yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
      dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
      bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
    }
  : {
      green: (s: string) => s,
      red: (s: string) => s,
      yellow: (s: string) => s,
      dim: (s: string) => s,
      bold: (s: string) => s,
    };

function computeComplianceScore(present: number, totalAnalyzed: number): number {
  if (totalAnalyzed === 0) return 100;
  return Math.round((present / totalAnalyzed) * 1000) / 10;
}

function buildReport(intent: IntentDocument, checkResult: CheckResult, meta: { intentFile?: string; totalImplemented?: number; analyzers?: string[] } = {}): Report {
  const {
    presentFeatures,
    missingFeatures,
    extraFeatures,
    draftFeatures = [],
    deprecatedFeatures = [],
    unannotatedFeatures = [],
  } = checkResult;

  const totalAnalyzed = presentFeatures.length + missingFeatures.length;
  const complianceScore = computeComplianceScore(
    presentFeatures.length,
    totalAnalyzed
  );

  // Build unified features array with result field
  const features: ReportFeature[] = [];

  // Count contracts: features in intent that have a contract field and are present
  const presentIds = new Set(presentFeatures.map(f => f.id));
  const contractsChecked = intent.features.filter(
    f => f.contract && Object.keys(f.contract).length > 0 && presentIds.has(f.id)
  ).length;
  let contractViolationCount = 0;

  for (const f of presentFeatures) {
    if (f.contractViolations) {
      contractViolationCount += f.contractViolations.length;
    }

    features.push({
      id: f.id,
      type: f.type || "http-route",
      status: f.status || "approved",
      result: "present",
      ...(f.implementedIn && { implementedIn: f.implementedIn }),
      ...(f.line && { line: f.line }),
      ...(f.analyzer && { analyzer: f.analyzer }),
      ...(f.method && { method: f.method }),
      ...(f.path && { path: f.path }),
      ...(f.contractViolations && { contractViolations: f.contractViolations }),
    });
  }

  for (const f of missingFeatures) {
    features.push({
      id: f.id,
      type: "http-route",
      status: f.status || "approved",
      result: "missing",
      ...(f.method && { method: f.method }),
      ...(f.path && { path: f.path }),
    });
  }

  for (const f of draftFeatures) {
    features.push({
      id: f.id,
      type: f.type || "http-route",
      status: "draft",
      result: "skipped",
      ...(f.method && { method: f.method }),
      ...(f.path && { path: f.path }),
    });
  }

  for (const f of unannotatedFeatures) {
    features.push({
      id: f.id,
      type: f.type,
      status: f.status || "approved",
      result: "unanalyzable",
      reason: f.reason,
    });
  }

  return {
    version: "0.2",
    meta: {
      intentFile: meta.intentFile || "intent.json",
      intentVersion: intent.version || "0.1",
      timestamp: new Date().toISOString(),
      analyzers: meta.analyzers || [],
    },
    summary: {
      totalDeclared:
        presentFeatures.length +
        missingFeatures.length +
        draftFeatures.length +
        unannotatedFeatures.length,
      analyzed: totalAnalyzed,
      unanalyzable: unannotatedFeatures.length,
      present: presentFeatures.length,
      missing: missingFeatures.length,
      extra: extraFeatures.length,
      draft: draftFeatures.length,
      deprecated: deprecatedFeatures.length,
      complianceScore,
      contractsChecked,
      contractViolations: contractViolationCount,
    },
    features,
    extraFeatures,
    drift: {
      hasDrift: missingFeatures.length > 0 || extraFeatures.length > 0 || contractViolationCount > 0,
      missingCount: missingFeatures.length,
      extraCount: extraFeatures.length,
      contractViolationCount,
    },
  };
}

function formatReport(report: Report, format: string = "text"): string {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }

  if (format === "summary") {
    const { summary, drift } = report;
    const status = drift.hasDrift ? "DRIFT" : "OK";
    let line = `${status} | score: ${summary.complianceScore}% | present: ${summary.present} | missing: ${summary.missing} | extra: ${summary.extra}`;
    if (summary.contractsChecked > 0) {
      const passing = summary.contractsChecked - summary.contractViolations;
      line += ` | contracts: ${passing}/${summary.contractsChecked}`;
    }
    return line;
  }

  // Default: human-readable text
  const { summary, drift } = report;
  const lines: string[] = [];

  const scoreStr = `${summary.complianceScore}%`;
  const coloredScore =
    summary.complianceScore === 100
      ? colors.green(scoreStr)
      : summary.complianceScore >= 80
        ? colors.yellow(scoreStr)
        : colors.red(scoreStr);

  lines.push("");
  lines.push(
    colors.bold(`Intent check: ${report.meta.intentFile}`) +
      `  ${colors.dim(`(v${report.meta.intentVersion})`)}`
  );
  lines.push(`Compliance score:  ${coloredScore}`);
  lines.push(`Declared features: ${summary.totalDeclared}`);
  lines.push(
    `Present:           ${summary.present > 0 ? colors.green(String(summary.present)) : "0"}`
  );
  lines.push(
    `Missing:           ${summary.missing > 0 ? colors.red(String(summary.missing)) : "0"}`
  );
  lines.push(
    `Extra:             ${summary.extra > 0 ? colors.yellow(String(summary.extra)) : "0"}`
  );

  if (summary.draft > 0) {
    lines.push(`Draft (skipped):   ${colors.dim(String(summary.draft))}`);
  }
  if (summary.unanalyzable > 0) {
    lines.push(
      `No analyzer:       ${colors.yellow(String(summary.unanalyzable))}`
    );
  }
  if (summary.deprecated > 0) {
    lines.push(
      `Deprecated:        ${colors.yellow(String(summary.deprecated))}`
    );
  }
  if (summary.contractsChecked > 0) {
    const passing = summary.contractsChecked - summary.contractViolations;
    const contractStr = `${passing}/${summary.contractsChecked} passing`;
    lines.push(
      `Contracts:         ${summary.contractViolations > 0 ? colors.red(contractStr) : colors.green(contractStr)}`
    );
  }

  const missing = report.features.filter((f) => f.result === "missing");
  if (missing.length > 0) {
    lines.push(colors.red(`\nMissing features:`));
    for (const m of missing) {
      lines.push(`  - ${m.id} (${m.method} ${m.path})`);
    }
  }

  const violations = report.features.filter(
    (f) => f.contractViolations && f.contractViolations.length > 0
  );
  if (violations.length > 0) {
    lines.push(colors.red(`\nContract violations:`));
    for (const f of violations) {
      for (const v of f.contractViolations!) {
        lines.push(`  - ${f.id} (${f.method} ${f.path}) — ${v.contract}: expected ${v.expected}, actual ${v.actual}`);
      }
    }
  }

  if (report.extraFeatures.length > 0) {
    lines.push(colors.yellow(`\nExtra features (not in intent):`));
    for (const e of report.extraFeatures) {
      const loc = e.line ? `${e.implementedIn}:${e.line}` : e.implementedIn;
      lines.push(`  - ${e.method} ${e.path} ${colors.dim(`(${loc})`)}`);
    }
  }

  const deprecated = report.features.filter(
    (f) => f.status === "deprecated" && f.result === "present"
  );
  if (deprecated.length > 0) {
    lines.push(colors.yellow(`\nDeprecated features (still present):`));
    for (const d of deprecated) {
      lines.push(`  - ${d.id} (${d.method} ${d.path}) in ${d.implementedIn}`);
    }
  }

  const unanalyzable = report.features.filter(
    (f) => f.result === "unanalyzable"
  );
  if (unanalyzable.length > 0) {
    lines.push(colors.yellow(`\nFeatures with no analyzer:`));
    for (const u of unanalyzable) {
      lines.push(`  - ${u.id} ${colors.dim(`(type: ${u.type})`)}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function diffReports(current: Report, previous: Partial<Report>): DiffResult {
  const prevFeatureMap = new Map<string, ReportFeature>();
  for (const f of previous.features || []) {
    prevFeatureMap.set(f.id, f);
  }
  const currFeatureMap = new Map<string, ReportFeature>();
  for (const f of current.features || []) {
    currFeatureMap.set(f.id, f);
  }

  const newlyPresent: ReportFeature[] = [];
  const newlyMissing: ReportFeature[] = [];
  const stillMissing: ReportFeature[] = [];
  const newFeatures: ReportFeature[] = [];
  const removedFeatures: ReportFeature[] = [];

  for (const f of current.features) {
    const prev = prevFeatureMap.get(f.id);
    if (!prev) {
      newFeatures.push(f);
    } else if (f.result === "present" && prev.result !== "present") {
      newlyPresent.push(f);
    } else if (f.result === "missing" && prev.result !== "missing") {
      newlyMissing.push(f);
    } else if (f.result === "missing" && prev.result === "missing") {
      stillMissing.push(f);
    }
  }

  for (const f of previous.features || []) {
    if (!currFeatureMap.has(f.id)) {
      removedFeatures.push(f);
    }
  }

  // Extra features diff
  const prevExtras = new Set(
    (previous.extraFeatures || []).map((e) => `${e.method} ${e.path}`)
  );
  const currExtras = new Set(
    (current.extraFeatures || []).map((e) => `${e.method} ${e.path}`)
  );
  const newExtras = current.extraFeatures.filter(
    (e) => !prevExtras.has(`${e.method} ${e.path}`)
  );
  const resolvedExtras = (previous.extraFeatures || []).filter(
    (e) => !currExtras.has(`${e.method} ${e.path}`)
  );

  return {
    scoreBefore: previous.summary?.complianceScore ?? null,
    scoreAfter: current.summary.complianceScore,
    newlyPresent,
    newlyMissing,
    stillMissing,
    newFeatures,
    removedFeatures,
    newExtras,
    resolvedExtras,
  };
}

function formatDiff(diff: DiffResult): string {
  const lines: string[] = [];

  lines.push("");
  if (diff.scoreBefore !== null) {
    const arrow =
      diff.scoreAfter > diff.scoreBefore
        ? colors.green("\u2191")
        : diff.scoreAfter < diff.scoreBefore
          ? colors.red("\u2193")
          : "=";
    lines.push(
      colors.bold(`Compliance: ${diff.scoreBefore}% ${arrow} ${diff.scoreAfter}%`)
    );
  } else {
    lines.push(colors.bold(`Compliance: ${diff.scoreAfter}%`));
  }

  if (diff.newlyPresent.length > 0) {
    lines.push(colors.green(`\nNewly implemented:`));
    for (const f of diff.newlyPresent) {
      lines.push(`  + ${f.id} (${f.method} ${f.path})`);
    }
  }

  if (diff.newlyMissing.length > 0) {
    lines.push(colors.red(`\nNewly missing:`));
    for (const f of diff.newlyMissing) {
      lines.push(`  - ${f.id} (${f.method} ${f.path})`);
    }
  }

  if (diff.stillMissing.length > 0) {
    lines.push(colors.dim(`\nStill missing:`));
    for (const f of diff.stillMissing) {
      lines.push(`  - ${f.id} (${f.method} ${f.path})`);
    }
  }

  if (diff.newFeatures.length > 0) {
    lines.push(`\nNew in intent:`);
    for (const f of diff.newFeatures) {
      lines.push(`  + ${f.id} (${f.result})`);
    }
  }

  if (diff.removedFeatures.length > 0) {
    lines.push(`\nRemoved from intent:`);
    for (const f of diff.removedFeatures) {
      lines.push(`  - ${f.id}`);
    }
  }

  if (diff.newExtras.length > 0) {
    lines.push(colors.yellow(`\nNew extra routes:`));
    for (const e of diff.newExtras) {
      lines.push(`  + ${e.method} ${e.path} (${e.implementedIn})`);
    }
  }

  if (diff.resolvedExtras.length > 0) {
    lines.push(colors.green(`\nResolved extras:`));
    for (const e of diff.resolvedExtras) {
      lines.push(`  - ${e.method} ${e.path}`);
    }
  }

  if (
    diff.newlyPresent.length === 0 &&
    diff.newlyMissing.length === 0 &&
    diff.newFeatures.length === 0 &&
    diff.removedFeatures.length === 0 &&
    diff.newExtras.length === 0 &&
    diff.resolvedExtras.length === 0
  ) {
    lines.push(colors.dim("\nNo changes since previous report."));
  }

  lines.push("");
  return lines.join("\n");
}

export {
  buildReport,
  formatReport,
  diffReports,
  formatDiff,
  computeComplianceScore,
};
