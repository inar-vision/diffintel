import { ExplainReport } from "./types";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STATUS_ICON: Record<string, string> = {
  added: "&#43;",      // +
  modified: "&#9998;",  // pencil
  deleted: "&#10005;",  // x
  renamed: "&#8594;",   // arrow
};

const ACTION_BADGE: Record<string, { label: string; color: string }> = {
  added: { label: "added", color: "#22c55e" },
  removed: { label: "removed", color: "#ef4444" },
  modified: { label: "modified", color: "#f59e0b" },
};

const RISK_COLORS: Record<string, { bg: string; text: string }> = {
  low: { bg: "#dcfce7", text: "#166534" },
  medium: { bg: "#fef3c7", text: "#92400e" },
  high: { bg: "#fee2e2", text: "#991b1b" },
};

export function renderReport(report: ExplainReport): string {
  const { explanation, summary, files } = report;

  const riskBadges = explanation.risks.length > 0
    ? explanation.risks.map((r) => {
        const c = RISK_COLORS[r.level] || RISK_COLORS.low;
        return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:13px;background:${c.bg};color:${c.text};margin-right:6px;">${r.level.toUpperCase()}: ${escapeHtml(r.description)}</span>`;
      }).join("\n")
    : '<span style="color:#166534;">No risks identified</span>';

  const filesTable = files.map((f) => {
    const icon = STATUS_ICON[f.status] || "";
    const changeCount = f.structuralChanges.length;
    return `<tr>
      <td>${icon}</td>
      <td style="font-family:monospace;font-size:13px;">${escapeHtml(f.path)}</td>
      <td>${f.status}</td>
      <td>${f.language || "—"}</td>
      <td>${changeCount}</td>
    </tr>`;
  }).join("\n");

  const fileDetails = files.map((f) => {
    const changesList = f.structuralChanges.length > 0
      ? "<ul style=\"margin:8px 0;padding-left:20px;\">" +
        f.structuralChanges.map((c) => {
          const badge = ACTION_BADGE[c.action] || ACTION_BADGE.modified;
          return `<li><span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:11px;background:${badge.color};color:white;margin-right:4px;">${badge.label}</span> <code>${escapeHtml(c.name)}</code> <span style="color:#666;">(${c.type})</span></li>`;
        }).join("\n") +
        "</ul>"
      : "<p style=\"color:#888;margin:8px 0;\">No structural changes detected</p>";

    const diffBlock = f.rawDiff
      ? `<pre style="background:#1e1e1e;color:#d4d4d4;padding:12px;border-radius:6px;overflow-x:auto;font-size:12px;line-height:1.5;margin:8px 0;">${colorDiff(f.rawDiff)}</pre>`
      : "<p style=\"color:#888;\">No diff available</p>";

    return `<details style="margin-bottom:12px;border:1px solid #e5e7eb;border-radius:8px;padding:0;">
      <summary style="padding:10px 14px;cursor:pointer;font-family:monospace;font-size:14px;background:#f9fafb;border-radius:8px;">${STATUS_ICON[f.status] || ""} ${escapeHtml(f.path)} <span style="color:#888;">(${f.structuralChanges.length} changes)</span></summary>
      <div style="padding:10px 14px;">
        ${changesList}
        ${diffBlock}
      </div>
    </details>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(explanation.title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 24px; color: #1f2937; background: #fff; line-height: 1.6; }
  h1 { font-size: 22px; margin-bottom: 6px; }
  h2 { font-size: 16px; margin: 24px 0 10px; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
  th { background: #f9fafb; font-weight: 600; }
  .stats { display: flex; gap: 16px; margin: 12px 0; }
  .stat { padding: 8px 14px; border-radius: 6px; background: #f3f4f6; font-size: 14px; }
  .stat b { font-size: 18px; }
  .meta { color: #6b7280; font-size: 12px; margin-bottom: 16px; }
</style>
</head>
<body>
  <h1>${escapeHtml(explanation.title)}</h1>
  <div class="meta">${escapeHtml(report.baseRef)} &rarr; ${escapeHtml(report.headRef)} &middot; ${escapeHtml(report.generatedAt)}</div>

  <div class="stats">
    <div class="stat"><b>${summary.filesChanged}</b> files changed</div>
    <div class="stat" style="color:#166534;"><b>+${summary.additions}</b> additions</div>
    <div class="stat" style="color:#991b1b;"><b>-${summary.deletions}</b> deletions</div>
  </div>

  <h2>Description</h2>
  <p style="margin:8px 0;">${escapeHtml(explanation.description)}</p>

  <h2>Risk Assessment</h2>
  <div style="margin:8px 0;">${riskBadges}</div>

  <h2>Files Overview</h2>
  <table>
    <thead><tr><th></th><th>File</th><th>Status</th><th>Language</th><th>Changes</th></tr></thead>
    <tbody>${filesTable}</tbody>
  </table>

  <h2>File Details</h2>
  ${fileDetails}

  <div style="margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:11px;">
    Generated by intent-spec explain &middot; Tokens: ${explanation.tokenUsage.input} in / ${explanation.tokenUsage.output} out
  </div>
</body>
</html>`;
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
