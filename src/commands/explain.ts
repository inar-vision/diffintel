import fs from "fs";
import { getDiffAsync } from "../explain/git-diff";
import { analyzeFile } from "../explain/ast-diff";
import { explainChanges } from "../explain/llm-explain";
import { renderReport } from "../explain/html-report";
import { renderMarkdownSummary } from "../explain/markdown-summary";
import { ExplainReport, LLMExplanation } from "../explain/types";

interface ExplainOptions {
  base?: string;
  head?: string;
  out?: string;
  summary?: string;
  singleCall?: boolean;
  maxBatches?: string;
}

export async function run(opts: ExplainOptions): Promise<number> {
  const baseRef = opts.base || "origin/main";
  const headRef = opts.head || "HEAD";
  const outFile = opts.out || "explain-report.html";
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  const totalStart = Date.now();

  const concurrency = parseInt(process.env.DIFFINTEL_GIT_CONCURRENCY || "20", 10) || 20;
  const maxBatches = opts.maxBatches
    ? parseInt(opts.maxBatches, 10)
    : parseInt(process.env.DIFFINTEL_MAX_BATCHES || "5", 10) || 5;

  try {
    console.error(`Analyzing diff: ${baseRef}...${headRef}`);

    const gitStart = Date.now();
    const { files: fileDiffs, rawDiff } = await getDiffAsync(baseRef, headRef, concurrency);
    const gitFetchMs = Date.now() - gitStart;

    if (fileDiffs.length === 0) {
      console.error("No changes found between refs.");
      return 0;
    }

    console.error(`Fetching git data for ${fileDiffs.length} file(s)... (${gitFetchMs}ms)`);

    const astStart = Date.now();
    const fileAnalyses = fileDiffs.map((fd) => {
      const analysis = analyzeFile(fd);
      analysis.recentHistory = fd.recentHistory;
      return analysis;
    });
    const astAnalysisMs = Date.now() - astStart;

    const totalChanges = fileAnalyses.reduce((sum, f) => sum + f.structuralChanges.length, 0);
    const totalAdditions = fileDiffs.reduce((sum, f) => sum + f.additions, 0);
    const totalDeletions = fileDiffs.reduce((sum, f) => sum + f.deletions, 0);

    console.error(`Analyzing AST... ${totalChanges} structural changes detected.`);

    let explanation: LLMExplanation;
    let llmCallMs = 0;
    let batchCount = 0;

    if (hasApiKey) {
      const llmStart = Date.now();
      explanation = await explainChanges(fileAnalyses, rawDiff, {
        singleCall: opts.singleCall,
        maxBatches,
      });
      llmCallMs = Date.now() - llmStart;

      // Estimate batch count from token usage pattern
      // Single call = 1, otherwise estimate from file count vs batch size
      batchCount = opts.singleCall ? 1 : Math.min(
        Math.ceil(fileDiffs.length / 5),
        maxBatches,
      );

      console.error(`Calling LLM${batchCount > 1 ? ` (${batchCount} batches)` : ""}... done (${(llmCallMs / 1000).toFixed(1)}s)`);
      console.error(`Tokens: ${explanation.tokenUsage.input.toLocaleString()} in / ${explanation.tokenUsage.output.toLocaleString()} out`);
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
      batchCount = 0;
    }

    const totalMs = Date.now() - totalStart;

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
      performance: {
        gitFetchMs,
        astAnalysisMs,
        llmCallMs,
        totalMs,
        batchCount,
      },
    };

    const html = renderReport(report);
    fs.writeFileSync(outFile, html, "utf-8");

    // Generate markdown summary alongside HTML
    const summaryFile = opts.summary || outFile.replace(/\.html$/, ".md");
    const markdown = renderMarkdownSummary(report);
    fs.writeFileSync(summaryFile, markdown, "utf-8");

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
