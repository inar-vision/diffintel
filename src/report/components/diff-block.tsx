import { MAX_DIFF_LINES } from "../constants";
import { colorDiffHtml } from "../utils";

export function DiffBlock({ rawDiff }: { rawDiff: string }) {
  if (!rawDiff) return null;

  const lines = rawDiff.split("\n");
  const totalLines = lines.length;

  if (totalLines <= MAX_DIFF_LINES) {
    return (
      <details className="diff-toggle">
        <summary>View diff</summary>
        <pre
          className="diff-block"
          dangerouslySetInnerHTML={{ __html: colorDiffHtml(rawDiff) }}
        />
      </details>
    );
  }

  const truncated = lines.slice(0, MAX_DIFF_LINES).join("\n");
  const id = `diff-${Math.random().toString(36).slice(2, 8)}`;

  // Use dangerouslySetInnerHTML for the entire details content so that the
  // inline onclick handler survives renderToStaticMarkup (React strips event props).
  const innerHtml = [
    `<summary>View diff</summary>`,
    `<pre class="diff-block" id="${id}-short">${colorDiffHtml(truncated)}</pre>`,
    `<div class="diff-truncation" id="${id}-notice">Showing ${MAX_DIFF_LINES} of ${totalLines} lines `,
    `<button class="diff-show-full" onclick="document.getElementById('${id}-short').style.display='none';document.getElementById('${id}-full').style.display='block';this.parentElement.style.display='none';">Show all</button></div>`,
    `<pre class="diff-block" id="${id}-full" style="display:none">${colorDiffHtml(rawDiff)}</pre>`,
  ].join("");

  return (
    <details
      className="diff-toggle"
      dangerouslySetInnerHTML={{ __html: innerHtml }}
    />
  );
}
