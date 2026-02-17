import fs from "fs";
import { getDiff } from "../explain/git-diff";
import { analyzeFile } from "../explain/ast-diff";
import { explainChanges } from "../explain/llm-explain";
import { renderReportHtml } from "../report/render-html";
import { renderMarkdownSummary } from "../explain/markdown-summary";
import { ExplainReport, LLMExplanation } from "../explain/types";

interface ExplainOptions {
  base?: string;
  head?: string;
  out?: string;
  summary?: string;
  json?: string;
}

export async function run(opts: ExplainOptions): Promise<number> {
  const baseRef = opts.base || "origin/main";
  const headRef = opts.head || "HEAD";
  const outFile = opts.out || "explain-report.html";
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  try {
    console.error(`Analyzing diff: ${baseRef}...${headRef}`);

    const { files: fileDiffs, rawDiff } = getDiff(baseRef, headRef);

    if (fileDiffs.length === 0) {
      console.error("No changes found between refs.");
      return 0;
    }

    console.error(`Found ${fileDiffs.length} changed file(s). Analyzing...`);

    const fileAnalyses = fileDiffs.map((fd) => {
      const analysis = analyzeFile(fd);
      analysis.recentHistory = fd.recentHistory;
      return analysis;
    });

    const totalChanges = fileAnalyses.reduce((sum, f) => sum + f.structuralChanges.length, 0);
    const totalAdditions = fileDiffs.reduce((sum, f) => sum + f.additions, 0);
    const totalDeletions = fileDiffs.reduce((sum, f) => sum + f.deletions, 0);

    let explanation: LLMExplanation;

    if (hasApiKey) {
      console.error(`Detected ${totalChanges} structural change(s). Calling LLM...`);
      explanation = await explainChanges(fileAnalyses, rawDiff);
    } else {
      console.error(`Detected ${totalChanges} structural change(s). No API key — generating AST-only report.`);
      explanation = {
        title: buildAutoTitle(fileDiffs.length, totalAdditions, totalDeletions),
        description: "",
        impact: [],
        fixes: [],
        risks: [],
        fileExplanations: [],
        tokenUsage: { input: 0, output: 0 },
      };
    }

    const report: ExplainReport = {
      generatedAt: new Date().toISOString(),
      baseRef,
      headRef,
      summary: {
        filesChanged: fileDiffs.length,
        additions: totalAdditions,
        deletions: totalDeletions,
      },
      explanation,
      files: fileAnalyses,
    };

    const html = renderReportHtml(report);
    fs.writeFileSync(outFile, html, "utf-8");

    // Generate markdown summary alongside HTML
    const summaryFile = opts.summary || outFile.replace(/\.html$/, ".md");
    const markdown = renderMarkdownSummary(report);
    fs.writeFileSync(summaryFile, markdown, "utf-8");

    // Generate JSON export alongside HTML
    const jsonFile = opts.json || outFile.replace(/\.html$/, ".json");
    fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf-8");

    console.error(`\n${explanation.title}`);
    console.error(`${fileDiffs.length} files | +${totalAdditions} -${totalDeletions}`);
    if (explanation.fixes.length > 0) {
      console.error(`Fixes: ${explanation.fixes.map((f) => f.description).join("; ")}`);
    }
    if (explanation.risks.length > 0) {
      console.error(`Risks: ${explanation.risks.map((r) => `[${r.level}] ${r.description}`).join("; ")}`);
    }
    console.error(`\nReport: ${outFile}`);
    console.error(`Summary: ${summaryFile}`);
    console.error(`JSON:    ${jsonFile}`);

    return 0;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    return 1;
  }
}

function buildAutoTitle(fileCount: number, additions: number, deletions: number): string {
  const parts: string[] = [];
  if (additions > 0 && deletions > 0) parts.push("Modified");
  else if (additions > 0) parts.push("Added");
  else if (deletions > 0) parts.push("Removed");
  else parts.push("Changed");
  parts.push(`${fileCount} file${fileCount !== 1 ? "s" : ""}`);
  return `${parts.join(" ")} (+${additions} -${deletions})`;
}
