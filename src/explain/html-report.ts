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

  // --- Blast radius (split: summary-only for overview, full for details) ---
  const blastRadiusSummaryHtml = buildBlastRadiusSummaryOnly(report.dependencyGraph, explanation.blastRadiusSummary);
  const blastRadiusFullHtml = buildBlastRadiusHtml(report.dependencyGraph, explanation.blastRadiusSummary);

  // --- Assemble the full report ---
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(explanation.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    max-width: 680px; margin: 0 auto; padding: 48px 20px;
    color: #0f1419; background: #fff; line-height: 1.6;
    font-size: 15px;
  }

  /* Article header */
  .article-header {
    margin-bottom: 40px;
  }
  h1 {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 28px; font-weight: 700; line-height: 1.3;
    margin-bottom: 12px; color: #0f1419;
  }
  .meta { color: #536471; font-size: 14px; font-weight: 400; }
  .meta span { margin-right: 6px; }
  .meta span + span::before { content: "\\00B7"; margin-right: 6px; }

  /* Stats */
  .stats {
    display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;
  }
  .stat {
    font-size: 14px; color: #536471; font-weight: 500;
    background: #f7f9f9; border-radius: 9999px; padding: 4px 14px;
  }
  .stat b { font-size: 17px; color: #0f1419; margin-right: 3px; }
  .stat.additions b { color: #00ba7c; }
  .stat.deletions b { color: #f4212e; }

  /* Structural summary */
  .structural-summary {
    font-size: 14px; color: #536471; margin-bottom: 12px;
    padding: 12px 16px; background: #f7f9f9; border-radius: 12px;
  }

  /* Impact */
  .impact-section {
    display: flex; flex-wrap: wrap; gap: 6px;
    margin-bottom: 28px;
  }
  .impact-section span {
    display: inline-block; font-size: 13px; color: #536471;
    background: #f7f9f9; border-radius: 9999px; padding: 4px 14px;
    line-height: 1.4;
  }

  /* Description — article lede */
  .description {
    font-size: 17px; line-height: 1.75; margin-bottom: 36px;
    color: #0f1419; font-weight: 400;
  }

  /* Section headings */
  h2 {
    font-size: 15px; font-weight: 600;
    color: #536471; margin: 36px 0 14px;
  }

  /* Fixes */
  .fix-item {
    padding: 12px 16px; margin-bottom: 8px;
    background: #f0fdf4; border-radius: 12px;
    font-size: 15px; color: #15803d;
  }
  .fix-icon { margin-right: 6px; font-weight: bold; }

  /* Risks */
  .risk-item {
    padding: 12px 16px; margin-bottom: 8px;
    border-radius: 12px; font-size: 15px;
  }
  .risk-label {
    display: inline-block; padding: 2px 10px; border-radius: 9999px;
    font-size: 12px; font-weight: 600; text-transform: capitalize;
    margin-right: 8px; color: white;
  }
  .risk-low { background: #fefce8; color: #854d0e; }
  .risk-low .risk-label { background: #eab308; }
  .risk-medium { background: #fff7ed; color: #9a3412; }
  .risk-medium .risk-label { background: #f97316; }
  .risk-high { background: #fef2f2; color: #991b1b; }
  .risk-high .risk-label { background: #ef4444; }

  /* AST-only notice */
  .ast-only-notice {
    padding: 14px 16px; margin-bottom: 32px;
    background: #f7f9f9; border: 1px dashed #cfd9de; border-radius: 12px;
    font-size: 15px; color: #536471;
  }

  /* Common changes */
  .common-changes { margin-bottom: 24px; }
  .common-change-item {
    padding: 8px 16px; font-size: 14px; color: #0f1419;
    background: #f7f9f9; border-radius: 12px; margin-bottom: 6px;
  }
  .common-change-item code { font-size: 13px; }
  .common-change-files { font-size: 13px; color: #536471; margin-left: 4px; }

  /* Blast radius */
  .blast-radius {
    margin-bottom: 24px;
  }
  .blast-radius-summary {
    padding: 14px 16px; border-radius: 12px;
    font-size: 15px; line-height: 1.6; margin-bottom: 12px;
    background: #f7f9f9; color: #0f1419;
  }
  .blast-radius-reach {
    display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;
  }
  .reach-stat {
    font-size: 14px; color: #536471; font-weight: 500;
    background: #f7f9f9; border-radius: 9999px; padding: 4px 14px;
  }
  .reach-stat b { font-size: 16px; margin-right: 3px; }
  .blast-radius-details summary {
    font-size: 15px; font-weight: 600; color: #536471;
    cursor: pointer; user-select: none;
    padding: 10px 0; list-style: none;
    display: flex; align-items: center; gap: 6px;
  }
  .blast-radius-details summary::-webkit-details-marker { display: none; }
  .blast-radius-details summary::before {
    content: "\\25B6"; font-size: 10px; transition: transform 0.15s;
  }
  .blast-radius-details[open] summary::before { transform: rotate(90deg); }
  .blast-radius-details summary .details-hint {
    font-size: 13px; font-weight: 400; color: #1d9bf0;
  }
  .blast-radius-details summary:hover { color: #0f1419; }
  .blast-radius-details summary:hover .details-hint { color: #0a7ccc; }
  .blast-radius-group {
    margin-bottom: 12px;
  }
  .blast-radius-group .group-label {
    font-size: 13px; font-weight: 600; color: #536471;
    margin-bottom: 6px;
  }
  .blast-radius-label {
    display: inline-block; padding: 2px 10px; border-radius: 9999px;
    font-size: 12px; font-weight: 600; margin-right: 6px; color: white;
  }
  .blast-radius-label-contained { background: #536471; }
  .blast-radius-label-moderate { background: #ffad1f; }
  .blast-radius-label-wide { background: #f4212e; }
  .blast-radius-item {
    padding: 6px 16px; font-size: 14px; color: #0f1419;
    background: #f7f9f9; border-radius: 8px; margin-bottom: 4px;
  }
  .blast-radius-item code { font-size: 13px; }
  .blast-radius-item .dep-relation { font-size: 13px; color: #536471; }
  .blast-radius-item .dep-symbols { font-size: 13px; color: #536471; display: block; padding-left: 4px; margin-top: 2px; }

  /* File cards */
  .file-card {
    border-radius: 12px; margin-bottom: 16px; overflow: hidden;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06);
    background: #fff;
  }
  .file-header {
    padding: 12px 16px;
    border-bottom: 1px solid #eff3f4;
    display: flex; align-items: center; gap: 10px;
  }
  .file-path { font-family: "SF Mono", Menlo, monospace; font-size: 13px; color: #0f1419; }
  .file-status {
    display: inline-block; padding: 2px 10px; border-radius: 9999px;
    font-size: 11px; font-weight: 600; text-transform: uppercase; color: white;
  }
  .status-added { background: #00ba7c; }
  .status-modified { background: #1d9bf0; }
  .status-deleted { background: #f4212e; }
  .status-renamed { background: #7856ff; }

  .file-summary {
    padding: 12px 16px; font-size: 15px; color: #0f1419;
    border-bottom: 1px solid #eff3f4; font-weight: 600;
  }
  .file-notes {
    padding: 12px 16px;
    border-bottom: 1px solid #eff3f4;
  }
  .file-notes-label {
    font-size: 13px; font-weight: 600;
    color: #536471; margin-bottom: 6px;
  }
  .file-notes ul {
    margin: 0; padding-left: 18px;
  }
  .file-notes li {
    font-size: 14px; color: #0f1419; line-height: 1.6; margin-bottom: 2px;
  }

  .changes-list {
    padding: 12px 16px; font-size: 14px; line-height: 2;
  }
  .change-badge {
    display: inline-block; padding: 2px 8px; border-radius: 9999px;
    font-size: 11px; font-weight: 600; color: white; margin-right: 4px;
  }
  .action-added { background: #00ba7c; }
  .action-removed { background: #f4212e; }
  .action-modified { background: #ffad1f; }
  .change-type { color: #536471; font-size: 13px; }
  code { font-family: "SF Mono", Menlo, monospace; font-size: 13px; }

  /* Diff */
  .diff-toggle { margin: 0; }
  .diff-toggle summary {
    padding: 10px 16px; cursor: pointer; font-size: 13px;
    color: #1d9bf0; user-select: none; border-top: 1px solid #eff3f4;
  }
  .diff-toggle summary:hover { color: #0a7ccc; }
  .diff-block {
    background: #1e1e1e; color: #d4d4d4; padding: 16px;
    overflow-x: auto; font-size: 13px; line-height: 1.6;
    font-family: "SF Mono", Menlo, monospace;
    margin: 0; border-radius: 0 0 8px 8px;
  }
  .diff-truncation {
    padding: 8px 16px; font-size: 13px; color: #888;
    border-top: 1px solid #333; background: #252525;
  }
  .diff-show-full { cursor: pointer; color: #1d9bf0; text-decoration: underline; background: none; border: none; font-size: 13px; }

  /* View navigation */
  .view-nav {
    display: flex; gap: 8px; margin-bottom: 28px;
    position: sticky; top: 0; background: #fff;
    padding: 12px 0; z-index: 10;
    border-bottom: 1px solid #eff3f4;
  }
  .view-btn {
    padding: 6px 18px; border-radius: 9999px; border: 1px solid #cfd9de;
    background: #fff; color: #536471; font-size: 14px; font-weight: 500;
    cursor: pointer; font-family: inherit; transition: all 0.15s;
  }
  .view-btn:hover { border-color: #1d9bf0; color: #1d9bf0; }
  .view-btn.active { background: #0f1419; color: #fff; border-color: #0f1419; }
  .view { display: none; }
  .view.active { display: block; }

  /* Footer */
  .footer {
    margin-top: 40px;
    color: #536471; font-size: 13px;
  }
</style>
</head>
<body>
  <div class="article-header">
    <h1>${escapeHtml(explanation.title)}</h1>
    <div class="meta">
      <span>${escapeHtml(report.baseRef)} &rarr; ${escapeHtml(report.headRef)}</span>
      <span>${new Date(report.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
    </div>
  </div>

  <div class="view-nav">
    <button class="view-btn active" data-target="overview">Overview</button>
    <button class="view-btn" data-target="details">Details</button>
  </div>

  <div class="view active" data-view="overview">
    ${explanation.description
      ? `<div class="description">${escapeHtml(explanation.description)}</div>`
      : `<div class="ast-only-notice">Structural analysis only — set ANTHROPIC_API_KEY or OPENAI_API_KEY for AI-powered explanations.</div>`}

    ${impactHtml}

    ${fixesHtml ? `<h2>What was fixed</h2>\n${fixesHtml}` : ""}

    ${risksHtml ? `<h2>Things to watch</h2>\n${risksHtml}` : ""}

    ${blastRadiusSummaryHtml}
  </div>

  <div class="view" data-view="details">
    <div class="stats">
      <div class="stat"><b>${summary.filesChanged}</b> files</div>
      <div class="stat additions"><b>+${summary.additions}</b> added</div>
      <div class="stat deletions"><b>-${summary.deletions}</b> removed</div>
    </div>

    ${structuralSummaryHtml}

    ${commonChangesHtml}

    ${blastRadiusFullHtml}

    <h2>Changed files</h2>
    ${fileCards}

    <div class="footer">
      Generated by diffintel${explanation.tokenUsage.input + explanation.tokenUsage.output > 0 ? ` &middot; ${explanation.tokenUsage.input + explanation.tokenUsage.output} tokens used` : ""}
    </div>
  </div>

  <script>
    (function() {
      var views = document.querySelectorAll('.view');
      var btns = document.querySelectorAll('.view-btn');
      var viewNames = ['overview', 'details'];

      function showView(name) {
        views.forEach(function(v) { v.classList.toggle('active', v.dataset.view === name); });
        btns.forEach(function(b) { b.classList.toggle('active', b.dataset.target === name); });
      }

      btns.forEach(function(b) {
        b.addEventListener('click', function() { showView(b.dataset.target); });
      });

      document.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        var current = viewNames.indexOf(document.querySelector('.view.active').dataset.view);
        if (e.key === 'ArrowRight' && current < viewNames.length - 1) showView(viewNames[current + 1]);
        if (e.key === 'ArrowLeft' && current > 0) showView(viewNames[current - 1]);
      });
    })();
  </script>
</body>
</html>`;
}

function buildBlastRadiusHtml(graph?: DependencyGraph, summary?: string): string {
  if (!graph) return "";

  const hasReverse = graph.reverseDeps.length > 0;
  const hasSecondRing = graph.secondRingDeps.length > 0;
  const totalAffected = graph.reverseDeps.length + graph.secondRingDeps.length;

  // Determine severity level
  const severityLevel = !hasReverse
    ? "contained"
    : totalAffected > 10
      ? "wide"
      : "moderate";

  const parts: string[] = [];
  parts.push(`<h2>Blast radius</h2>`);
  parts.push(`<div class="blast-radius">`);

  // Plain-language summary (from LLM or fallback)
  const summaryText = summary
    || (!hasReverse
      ? "No other files import the changed files — changes are self-contained."
      : `${graph.reverseDeps.length} file(s) directly depend on the changed code${hasSecondRing ? `, with ${[...new Set(graph.secondRingDeps.map((e) => e.from))].length} more indirectly affected` : ""}.`);
  parts.push(`<div class="blast-radius-summary"><span class="blast-radius-label blast-radius-label-${severityLevel}">${severityLevel}</span> ${escapeHtml(summaryText)}</div>`);

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
    parts.push(`<details class="blast-radius-details"><summary>Dependency details <span class="details-hint">(show details)</span></summary>`);

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
            ? ` <span class="dep-symbols">imports ${imp.symbols.map((s) => `<code>${escapeHtml(s)}</code>`).join(", ")}</span>`
            : "";
          parts.push(
            `<div class="blast-radius-item"><code>${escapeHtml(imp.from)}</code> <span class="dep-relation">depends on</span> <code>${escapeHtml(target)}</code>${symInfo}</div>`,
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

function buildBlastRadiusSummaryOnly(graph?: DependencyGraph, summary?: string): string {
  if (!graph) return "";

  const hasReverse = graph.reverseDeps.length > 0;
  const hasSecondRing = graph.secondRingDeps.length > 0;
  const totalAffected = graph.reverseDeps.length + graph.secondRingDeps.length;

  const severityLevel = !hasReverse
    ? "contained"
    : totalAffected > 10
      ? "wide"
      : "moderate";

  const summaryText = summary
    || (!hasReverse
      ? "No other files import the changed files — changes are self-contained."
      : `${graph.reverseDeps.length} file(s) directly depend on the changed code${hasSecondRing ? `, with ${[...new Set(graph.secondRingDeps.map((e) => e.from))].length} more indirectly affected` : ""}.`);

  return `<h2>Blast radius</h2>
<div class="blast-radius">
<div class="blast-radius-summary"><span class="blast-radius-label blast-radius-label-${severityLevel}">${severityLevel}</span> ${escapeHtml(summaryText)}</div>
</div>`;
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
        if (!group.filePaths.includes(f.path)) {
          group.filePaths.push(f.path);
        }
      } else {
        groups.set(sig, { change: c, filePaths: [f.path] });
      }
    }
  }

  // Filter to changes appearing in 2+ distinct files
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
