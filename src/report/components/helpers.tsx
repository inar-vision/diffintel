import { FileAnalysis, StructuralChange } from "../../explain/types";
import { escapeHtml } from "../utils";

export function StructuralSummary({ files }: { files: FileAnalysis[] }) {
  const counts = new Map<string, number>();

  for (const f of files) {
    for (const c of f.structuralChanges) {
      const key = `${c.action}:${c.type}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  if (counts.size === 0) return null;

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

  if (parts.length === 0) return null;

  const filesWithChanges = files.filter((f) => f.structuralChanges.length > 0).length;
  const text = `${parts.join(" \u00B7 ")} across ${filesWithChanges} file${filesWithChanges !== 1 ? "s" : ""}`;

  return <div className="structural-summary">{text}</div>;
}

export function CommonChanges({ files }: { files: FileAnalysis[] }) {
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

  const common = [...groups.values()].filter((g) => g.filePaths.length >= 2);
  if (common.length === 0) return null;

  return (
    <>
      <h2>Common changes</h2>
      {common.map((g, i) => {
        const { change, filePaths } = g;
        const actionSymbol = change.action === "added" ? "+" : change.action === "removed" ? "-" : "~";
        const fileListHtml = filePaths
          .map((p) => `<code>${escapeHtml(p)}</code>`)
          .join(", ");

        return (
          <div key={i} className="common-change-item">
            {actionSymbol} <code>{change.name}</code> ({change.type})
            <span
              className="common-change-files"
              dangerouslySetInnerHTML={{ __html: ` in ${fileListHtml}` }}
            />
          </div>
        );
      })}
    </>
  );
}
