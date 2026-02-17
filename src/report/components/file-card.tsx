import { FileAnalysis, FileExplanation } from "../../explain/types";
import { escapeHtml } from "../utils";
import { DiffBlock } from "./diff-block";

export function FileCard({
  file,
  explanation,
}: {
  file: FileAnalysis;
  explanation?: FileExplanation;
}) {
  const changesHtml =
    file.structuralChanges.length > 0
      ? file.structuralChanges
          .map((c) => {
            const cls = `action-${c.action}`;
            return `<span class="change-badge ${cls}">${c.action}</span> <code>${escapeHtml(c.name)}</code> <span class="change-type">${c.type}</span>`;
          })
          .join("<br>")
      : "";

  return (
    <div className="file-card">
      <div className="file-header">
        <span className={`file-status status-${file.status}`}>{file.status}</span>
        <span className="file-path">{file.path}</span>
      </div>

      {explanation?.summary && (
        <p className="file-summary">{explanation.summary}</p>
      )}

      {explanation?.notes && explanation.notes.length > 0 && (
        <div className="file-notes">
          <div className="file-notes-label">Things to note</div>
          <ul>
            {explanation.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {changesHtml && (
        <div
          className="changes-list"
          dangerouslySetInnerHTML={{ __html: changesHtml }}
        />
      )}

      {file.rawDiff && <DiffBlock rawDiff={file.rawDiff} />}
    </div>
  );
}
