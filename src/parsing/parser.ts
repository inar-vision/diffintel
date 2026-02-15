import fs from "fs";
import path from "path";
import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import TypeScriptLanguages from "tree-sitter-typescript";

export type { Parser };
export type Tree = Parser.Tree;
export type SyntaxNode = Parser.SyntaxNode;
export type QueryMatch = Parser.QueryMatch;
export type QueryCapture = Parser.QueryCapture;
export const Query = Parser.Query;

const jsLanguage = JavaScript as unknown as Parser.Language;
const tsLanguage = TypeScriptLanguages.typescript as unknown as Parser.Language;
const tsxLanguage = TypeScriptLanguages.tsx as unknown as Parser.Language;

/** Backward-compat export: the JavaScript language */
export const language = jsLanguage;

const parsers = new Map<Parser.Language, Parser>();

function getParser(lang: Parser.Language): Parser {
  let p = parsers.get(lang);
  if (!p) {
    p = new Parser();
    p.setLanguage(lang);
    parsers.set(lang, p);
  }
  return p;
}

const extToLanguage: Record<string, Parser.Language> = {
  ".js": jsLanguage,
  ".ts": tsLanguage,
  ".tsx": tsxLanguage,
};

export function getLanguageForExt(ext: string): Parser.Language {
  return extToLanguage[ext] || jsLanguage;
}

export function parseSource(
  source: string,
  ext: string = ".js"
): { tree: Tree; source: string } {
  const lang = getLanguageForExt(ext);
  const tree = getParser(lang).parse(source);
  return { tree, source };
}

export function parseFile(filePath: string): { tree: Tree; source: string } {
  const source = fs.readFileSync(filePath, "utf-8");
  const ext = path.extname(filePath);
  return parseSource(source, ext);
}
