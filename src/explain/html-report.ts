import { ExplainReport, StructuralChange, DependencyGraph } from "./types";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const MAX_DIFF_LINES = 80;

export function renderReport(report: ExplainReport): string {
  const { explanation, summary, files } = report;

  // --- Structural summary ---
  const structuralSummaryHtml = buildStructuralSummary(files);

  // --- Impact section ---
  const impactHtml = explanation.impact.length > 0
    ? `<div class="impact-section">${explanation.impact.map((item) =>
        `<span>${escapeHtml(item)}</span>`
      ).join("")}</div>`
    : "";

  // --- Fixes section ---
  const fixesHtml = explanation.fixes.length > 0
    ? explanation.fixes.map((f) =>
        `<div class="fix-item"><span class="fix-icon">&#10003;</span> ${escapeHtml(f.description)}</div>`
      ).join("\n")
    : "";

  // --- Risks section ---
  const risksHtml = explanation.risks.length > 0
    ? explanation.risks.map((r) => {
        const cls = `risk-${r.level}`;
        return `<div class="risk-item ${cls}"><span class="risk-label">${r.level}</span> ${escapeHtml(r.description)}</div>`;
      }).join("\n")
    : "";

  // --- Common changes ---
  const commonChangesHtml = buildCommonChanges(files);

  // --- Per-file detail cards ---
  // Build a map for both summary and notes
  const fileExplanationData = new Map(
    explanation.fileExplanations.map((fe) => [fe.path, fe]),
  );

  const fileCards = files.map((f) => {
    const feData = fileExplanationData.get(f.path);

    const changesHtml = f.structuralChanges.length > 0
      ? `<div class="changes-list">${f.structuralChanges.map((c) => {
          const cls = `action-${c.action}`;
          return `<span class="change-badge ${cls}">${c.action}</span> <code>${escapeHtml(c.name)}</code> <span class="change-type">${c.type}</span>`;
        }).join('<br>')}</div>`
      : "";

    const notesHtml = feData?.notes && feData.notes.length > 0
      ? `<div class="file-notes"><div class="file-notes-label">Things to note</div><ul>${feData.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul></div>`
      : "";

    const diffHtml = f.rawDiff ? renderDiff(f.rawDiff) : "";

    return `<div class="file-card">
      <div class="file-header">
        <span class="file-status status-${f.status}">${f.status}</span>
        <span class="file-path">${escapeHtml(f.path)}</span>
      </div>
      ${feData?.summary ? `<p class="file-summary">${escapeHtml(feData.summary)}</p>` : ""}
      ${notesHtml}
      ${changesHtml}
      ${diffHtml}
    </div>`;
  }).join("\n");

  // --- Assemble the full report ---
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(explanation.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    max-width: 740px; margin: 0 auto; padding: 48px 20px;
    color: #1a1a1a; background: #fff; line-height: 1.7;
  }

  /* Article header */
  .article-header {
    margin-bottom: 36px;
    padding-bottom: 28px;
    border-bottom: 1px solid #eee;
  }
  .article-header .label {
    display: inline-block; font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 1.5px; color: #3b82f6;
    margin-bottom: 12px;
  }
  h1 {
    font-family: "Playfair Display", Georgia, "Times New Roman", serif;
    font-size: 34px; font-weight: 800; line-height: 1.2;
    margin-bottom: 16px; letter-spacing: -0.5px; color: #111;
  }
  .meta { color: #999; font-size: 13px; font-weight: 400; }
  .meta span { margin-right: 16px; }

  /* Stats */
  .stats {
    display: flex; gap: 20px; margin-bottom: 16px;
  }
  .stat {
    font-size: 13px; color: #777; font-weight: 500;
  }
  .stat b { font-size: 18px; color: #1a1a1a; margin-right: 3px; }
  .stat.additions b { color: #16a34a; }
  .stat.deletions b { color: #dc2626; }

  /* Structural summary */
  .structural-summary {
    font-size: 14px; color: #555; margin-bottom: 8px;
    padding: 10px 14px; background: #f8fafc; border-radius: 6px;
  }

  /* Impact */
  .impact-section {
    font-size: 14px; color: #555; margin-bottom: 28px;
    padding: 10px 14px; background: #f8fafc; border-radius: 6px;
  }
  .impact-section span {
    display: inline-block; margin-right: 12px;
  }
  .impact-section span::before {
    content: "\\2022"; margin-right: 5px; color: #94a3b8;
  }

  /* Description — article lede */
  .description {
    font-size: 18px; line-height: 1.85; margin-bottom: 36px;
    color: #333; font-weight: 400;
  }

  /* Section headings */
  h2 {
    font-size: 12px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 1.2px; color: #999; margin: 36px 0 14px;
  }

  /* Fixes */
  .fix-item {
    padding: 10px 14px; margin-bottom: 8px;
    background: #f0fdf4; border-left: 3px solid #22c55e;
    border-radius: 0 6px 6px 0; font-size: 14px; color: #15803d;
  }
  .fix-icon { margin-right: 6px; font-weight: bold; }

  /* Risks */
  .risk-item {
    padding: 10px 14px; margin-bottom: 8px;
    border-radius: 0 6px 6px 0; font-size: 14px;
  }
  .risk-label {
    display: inline-block; padding: 1px 8px; border-radius: 3px;
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    margin-right: 8px; color: white;
  }
  .risk-low { background: #fefce8; border-left: 3px solid #eab308; color: #854d0e; }
  .risk-low .risk-label { background: #eab308; }
  .risk-medium { background: #fff7ed; border-left: 3px solid #f97316; color: #9a3412; }
  .risk-medium .risk-label { background: #f97316; }
  .risk-high { background: #fef2f2; border-left: 3px solid #ef4444; color: #991b1b; }
  .risk-high .risk-label { background: #ef4444; }

  /* AST-only notice */
  .ast-only-notice {
    padding: 12px 16px; margin-bottom: 32px;
    background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px;
    font-size: 14px; color: #64748b;
  }

  /* Common changes */
  .common-changes { margin-bottom: 24px; }
  .common-change-item {
    padding: 6px 14px; font-size: 13px; color: #555;
    border-left: 2px solid #cbd5e1; margin-bottom: 4px;
  }
  .common-change-item code { font-size: 12px; }
  .common-change-files { font-size: 12px; color: #888; margin-left: 4px; }

  /* Blast radius */
  .blast-radius {
    margin-bottom: 24px;
  }
  .blast-radius-summary {
    padding: 14px 16px; border-radius: 6px;
    font-size: 15px; line-height: 1.7; margin-bottom: 12px;
  }
  .blast-radius-contained {
    background: #f0fdf4; color: #15803d;
  }
  .blast-radius-moderate {
    background: #fffbeb; color: #92400e;
  }
  .blast-radius-wide {
    background: #fef2f2; color: #991b1b;
  }
  .blast-radius-reach {
    display: flex; gap: 16px; margin-bottom: 12px;
  }
  .reach-stat {
    font-size: 13px; color: #777; font-weight: 500;
  }
  .reach-stat b { font-size: 16px; margin-right: 3px; }
  .blast-radius-details summary {
    font-size: 12px; color: #888; cursor: pointer; user-select: none;
    padding: 6px 0;
  }
  .blast-radius-details summary:hover { color: #555; }
  .blast-radius-group {
    margin-bottom: 12px;
  }
  .blast-radius-group .group-label {
    font-size: 12px; font-weight: 600; color: #666;
    margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;
  }
  .blast-radius-item {
    padding: 4px 14px; font-size: 13px; color: #555;
    border-left: 2px solid #f59e0b; margin-bottom: 2px;
  }
  .blast-radius-item code { font-size: 12px; }
  .blast-radius-item .dep-symbols { font-size: 12px; color: #888; }
  .blast-radius-second-ring .blast-radius-item {
    border-left-color: #cbd5e1;
  }

  /* File cards */
  .file-card {
    border: 1px solid #e5e7eb; border-radius: 8px;
    margin-bottom: 16px; overflow: hidden;
  }
  .file-header {
    padding: 10px 14px; background: #fafafa;
    border-bottom: 1px solid #f0f0f0;
    display: flex; align-items: center; gap: 10px;
  }
  .file-path { font-family: "SF Mono", Menlo, monospace; font-size: 13px; }
  .file-status {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    font-size: 11px; font-weight: 600; text-transform: uppercase; color: white;
  }
  .status-added { background: #22c55e; }
  .status-modified { background: #3b82f6; }
  .status-deleted { background: #ef4444; }
  .status-renamed { background: #8b5cf6; }

  .file-summary {
    padding: 12px 14px; font-size: 14px; color: #444;
    border-bottom: 1px solid #f5f5f5; font-weight: bold
  }
  .file-notes {
    padding: 10px 14px; background: #fafbff;
    border-bottom: 1px solid #f0f0f0;
  }
  .file-notes-label {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.8px; color: #7c8db0; margin-bottom: 6px;
  }
  .file-notes ul {
    margin: 0; padding-left: 18px;
  }
  .file-notes li {
    font-size: 13px; color: #555; line-height: 1.6; margin-bottom: 2px;
  }

  .changes-list {
    padding: 10px 14px; font-size: 13px; line-height: 2;
  }
  .change-badge {
    display: inline-block; padding: 1px 6px; border-radius: 3px;
    font-size: 11px; font-weight: 600; color: white; margin-right: 4px;
  }
  .action-added { background: #22c55e; }
  .action-removed { background: #ef4444; }
  .action-modified { background: #f59e0b; }
  .change-type { color: #999; font-size: 12px; }
  code { font-family: "SF Mono", Menlo, monospace; font-size: 12px; }

  /* Diff */
  .diff-toggle { margin: 0; }
  .diff-toggle summary {
    padding: 8px 14px; cursor: pointer; font-size: 12px;
    color: #888; user-select: none; border-top: 1px solid #f0f0f0;
  }
  .diff-toggle summary:hover { color: #555; }
  .diff-block {
    background: #1e1e1e; color: #d4d4d4; padding: 14px;
    overflow-x: auto; font-size: 12px; line-height: 1.6;
    font-family: "SF Mono", Menlo, monospace;
    margin: 0; border-radius: 0;
  }
  .diff-truncation {
    padding: 6px 14px; font-size: 12px; color: #888;
    border-top: 1px solid #333; background: #252525;
  }
  .diff-show-full { cursor: pointer; color: #60a5fa; text-decoration: underline; background: none; border: none; font-size: 12px; }

  /* Footer */
  .footer {
    margin-top: 36px; padding-top: 14px; border-top: 1px solid #eee;
    color: #bbb; font-size: 11px;
  }
</style>
</head>
<body>
  <div class="article-header">
    <div class="label">Change Report</div>
    <h1>${escapeHtml(explanation.title)}</h1>
    <div class="meta">
      <span>${escapeHtml(report.baseRef)} &rarr; ${escapeHtml(report.headRef)}</span>
      <span>${new Date(report.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
    </div>
  </div>

  <div class="stats">
    <div class="stat"><b>${summary.filesChanged}</b> files</div>
    <div class="stat additions"><b>+${summary.additions}</b> added</div>
    <div class="stat deletions"><b>-${summary.deletions}</b> removed</div>
  </div>

  ${structuralSummaryHtml}

  ${impactHtml}

  ${explanation.description
    ? `<div class="description">${escapeHtml(explanation.description)}</div>`
    : `<div class="ast-only-notice">Structural analysis only — set ANTHROPIC_API_KEY or OPENAI_API_KEY for AI-powered explanations.</div>`}

  ${fixesHtml ? `<h2>What was fixed</h2>\n${fixesHtml}` : ""}

  ${risksHtml ? `<h2>Things to watch</h2>\n${risksHtml}` : ""}

  ${commonChangesHtml}

  ${buildBlastRadiusHtml(report.dependencyGraph, explanation.blastRadiusSummary)}

  <h2>Changed files</h2>
  ${fileCards}

  <div class="footer">
    Generated by diffintel${explanation.tokenUsage.input + explanation.tokenUsage.output > 0 ? ` &middot; ${explanation.tokenUsage.input + explanation.tokenUsage.output} tokens used` : ""}
  </div>
</body>
</html>`;
}

function buildBlastRadiusHtml(graph?: DependencyGraph, summary?: string): string {
  if (!graph) return "";

  const hasReverse = graph.reverseDeps.length > 0;
  const hasSecondRing = graph.secondRingDeps.length > 0;
  const totalAffected = graph.reverseDeps.length + graph.secondRingDeps.length;

  // Determine severity class
  const severityClass = !hasReverse
    ? "blast-radius-contained"
    : totalAffected > 10
      ? "blast-radius-wide"
      : "blast-radius-moderate";

  const parts: string[] = [];
  parts.push(`<h2>Blast radius</h2>`);
  parts.push(`<div class="blast-radius">`);

  // Plain-language summary (from LLM or fallback)
  const summaryText = summary
    || (!hasReverse
      ? "No other files import the changed files — changes are self-contained."
      : `${graph.reverseDeps.length} file(s) directly depend on the changed code${hasSecondRing ? `, with ${[...new Set(graph.secondRingDeps.map((e) => e.from))].length} more indirectly affected` : ""}.`);
  parts.push(`<div class="blast-radius-summary ${severityClass}">${escapeHtml(summaryText)}</div>`);

  // Reach stats
  if (hasReverse) {
    const uniqueReverse = [...new Set(graph.reverseDeps.map((e) => e.from))].length;
    const uniqueSecondRing = [...new Set(graph.secondRingDeps.map((e) => e.from))].length;
    parts.push(`<div class="blast-radius-reach">`);
    parts.push(`<div class="reach-stat"><b>${uniqueReverse}</b> direct dependent${uniqueReverse !== 1 ? "s" : ""}</div>`);
    if (uniqueSecondRing > 0) {
      parts.push(`<div class="reach-stat"><b>${uniqueSecondRing}</b> indirect</div>`);
    }
    parts.push(`<div class="reach-stat"><b>${graph.repoFilesScanned}</b> files scanned</div>`);
    parts.push(`</div>`);
  }

  // Technical detail in collapsible
  if (hasReverse || hasSecondRing) {
    parts.push(`<details class="blast-radius-details"><summary>View dependency details</summary>`);

    if (hasReverse) {
      const byTarget = new Map<string, Array<{ from: string; symbols: string[] }>>();
      for (const edge of graph.reverseDeps) {
        const list = byTarget.get(edge.to) || [];
        list.push({ from: edge.from, symbols: edge.symbols });
        byTarget.set(edge.to, list);
      }

      parts.push(`<div class="blast-radius-group">`);
      parts.push(`<div class="group-label">Direct dependents</div>`);
      for (const [target, importers] of byTarget) {
        for (const imp of importers) {
          const symInfo = imp.symbols.length > 0
            ? ` <span class="dep-symbols">uses: ${imp.symbols.map((s) => escapeHtml(s)).join(", ")}</span>`
            : "";
          parts.push(
            `<div class="blast-radius-item"><code>${escapeHtml(imp.from)}</code> &rarr; <code>${escapeHtml(target)}</code>${symInfo}</div>`,
          );
        }
      }
      parts.push(`</div>`);
    }

    if (hasSecondRing) {
      const files = [...new Set(graph.secondRingDeps.map((e) => e.from))];
      parts.push(`<div class="blast-radius-group blast-radius-second-ring">`);
      parts.push(`<div class="group-label">Indirect dependents (${files.length})</div>`);
      const shown = files.slice(0, 15);
      for (const f of shown) {
        parts.push(`<div class="blast-radius-item"><code>${escapeHtml(f)}</code></div>`);
      }
      if (files.length > 15) {
        parts.push(`<div class="blast-radius-item">... and ${files.length - 15} more</div>`);
      }
      parts.push(`</div>`);
    }

    parts.push(`</details>`);
  }

  parts.push(`</div>`);
  return parts.join("\n");
}

function renderDiff(rawDiff: string): string {
  const lines = rawDiff.split("\n");
  const totalLines = lines.length;

  if (totalLines <= MAX_DIFF_LINES) {
    return `<details class="diff-toggle"><summary>View diff</summary><pre class="diff-block">${colorDiff(rawDiff)}</pre></details>`;
  }

  const truncated = lines.slice(0, MAX_DIFF_LINES).join("\n");
  const id = `diff-${Math.random().toString(36).slice(2, 8)}`;

  return `<details class="diff-toggle"><summary>View diff</summary><pre class="diff-block" id="${id}-short">${colorDiff(truncated)}</pre><div class="diff-truncation" id="${id}-notice">Showing ${MAX_DIFF_LINES} of ${totalLines} lines <button class="diff-show-full" onclick="document.getElementById('${id}-short').style.display='none';document.getElementById('${id}-full').style.display='block';this.parentElement.style.display='none';">Show all</button></div><pre class="diff-block" id="${id}-full" style="display:none">${colorDiff(rawDiff)}</pre></details>`;
}

function buildStructuralSummary(files: ExplainReport["files"]): string {
  const counts = new Map<string, number>();

  for (const f of files) {
    for (const c of f.structuralChanges) {
      const key = `${c.action}:${c.type}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  if (counts.size === 0) return "";

  const actionOrder = ["added", "modified", "removed"];
  const parts: string[] = [];

  for (const action of actionOrder) {
    const items: string[] = [];
    for (const [key, count] of counts) {
      if (key.startsWith(action + ":")) {
        const type = key.split(":")[1];
        items.push(`${count} ${type}${count !== 1 ? "s" : ""}`);
      }
    }
    if (items.length > 0) {
      parts.push(`${items.join(", ")} ${action}`);
    }
  }

  if (parts.length === 0) return "";

  const filesWithChanges = files.filter((f) => f.structuralChanges.length > 0).length;
  return `<div class="structural-summary">${parts.join(" &middot; ")} across ${filesWithChanges} file${filesWithChanges !== 1 ? "s" : ""}</div>`;
}

function buildCommonChanges(files: ExplainReport["files"]): string {
  // Group changes by signature
  const groups = new Map<string, { change: StructuralChange; filePaths: string[] }>();

  for (const f of files) {
    for (const c of f.structuralChanges) {
      const sig = `${c.action}:${c.type}:${c.name}`;
      const group = groups.get(sig);
      if (group) {
        group.filePaths.push(f.path);
      } else {
        groups.set(sig, { change: c, filePaths: [f.path] });
      }
    }
  }

  // Filter to changes appearing in 2+ files
  const common = [...groups.values()].filter((g) => g.filePaths.length >= 2);
  if (common.length === 0) return "";

  const items = common.map((g) => {
    const { change, filePaths } = g;
    const actionSymbol = change.action === "added" ? "+" : change.action === "removed" ? "-" : "~";
    const fileList = filePaths.map((p) => `<code>${escapeHtml(p)}</code>`).join(", ");
    return `<div class="common-change-item">${actionSymbol} <code>${escapeHtml(change.name)}</code> (${change.type})<span class="common-change-files"> in ${fileList}</span></div>`;
  }).join("\n");

  return `<h2>Common changes</h2>\n${items}`;
}

function colorDiff(diff: string): string {
  return escapeHtml(diff)
    .split("\n")
    .map((line) => {
      if (line.startsWith("+")) return `<span style="color:#4ade80;">${line}</span>`;
      if (line.startsWith("-")) return `<span style="color:#f87171;">${line}</span>`;
      if (line.startsWith("@@")) return `<span style="color:#60a5fa;">${line}</span>`;
      return line;
    })
    .join("\n");
}
