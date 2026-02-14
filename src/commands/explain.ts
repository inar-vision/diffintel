import fs from "fs";
import { getDiff } from "../explain/git-diff";
import { analyzeFile } from "../explain/ast-diff";
import { explainChanges } from "../explain/llm-explain";
import { renderReport } from "../explain/html-report";
import { ExplainReport } from "../explain/types";

interface ExplainOptions {
  base?: string;
  head?: string;
  out?: string;
}

export async function run(opts: ExplainOptions): Promise<number> {
  const baseRef = opts.base || "origin/main";
  const headRef = opts.head || "HEAD";
  const outFile = opts.out || "explain-report.html";

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is required.");
    return 1;
  }

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
    console.error(`Detected ${totalChanges} structural change(s). Calling LLM...`);

    const explanation = await explainChanges(fileAnalyses, rawDiff);

    const totalAdditions = fileDiffs.reduce((sum, f) => sum + f.additions, 0);
    const totalDeletions = fileDiffs.reduce((sum, f) => sum + f.deletions, 0);

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

    const html = renderReport(report);
    fs.writeFileSync(outFile, html, "utf-8");

    console.error(`\nTitle: ${explanation.title}`);
    console.error(`Files: ${fileDiffs.length} | +${totalAdditions} -${totalDeletions}`);
    console.error(`Risks: ${explanation.risks.length > 0 ? explanation.risks.map((r) => `${r.level}: ${r.description}`).join("; ") : "none"}`);
    console.error(`Tokens: ${explanation.tokenUsage.input} in / ${explanation.tokenUsage.output} out`);
    console.error(`\nReport written to: ${outFile}`);

    return 0;
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    return 1;
  }
}
