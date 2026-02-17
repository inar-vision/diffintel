import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ReportStatic } from "./components/report-static";
import { reportCSS } from "./styles";
import { ExplainReport } from "../explain/types";
import { escapeHtml } from "./utils";

export function renderReportHtml(report: ExplainReport): string {
  const body = renderToStaticMarkup(createElement(ReportStatic, { report }));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(report.explanation.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
${reportCSS}
</style>
</head>
<body>
${body}
</body>
</html>`;
}
