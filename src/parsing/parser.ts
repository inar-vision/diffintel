import fs from "fs";
import path from "path";
import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import TypeScriptLanguages from "tree-sitter-typescript";
import { languageConfigs } from "../explain/language-configs";

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

// ---------------------------------------------------------------------------
// Dynamic language registry
// ---------------------------------------------------------------------------

// Static mappings for bundled grammars (always available)
const staticLanguages: Record<string, Parser.Language> = {
  ".js": jsLanguage,
  ".jsx": jsLanguage,
  ".ts": tsLanguage,
  ".tsx": tsxLanguage,
};

// Cache for dynamically loaded grammars
const dynamicLanguageCache = new Map<string, Parser.Language | false>();

function tryLoadGrammar(packageName: string, subProperty?: string): Parser.Language | null {
  const cacheKey = subProperty ? `${packageName}.${subProperty}` : packageName;
  if (dynamicLanguageCache.has(cacheKey)) {
    const cached = dynamicLanguageCache.get(cacheKey);
    return cached === false ? null : cached!;
  }

  try {
    const mod = require(packageName);
    const target = subProperty ? mod[subProperty] : (mod.default || mod);
    const lang = target as unknown as Parser.Language;
    dynamicLanguageCache.set(cacheKey, lang);
    return lang;
  } catch {
    dynamicLanguageCache.set(cacheKey, false);
    return null;
  }
}

function getLanguageForExtDynamic(ext: string): Parser.Language | null {
  // Check static mappings first
  if (ext in staticLanguages) {
    return staticLanguages[ext];
  }

  // Find config for this extension
  const config = languageConfigs.find((c) => c.extensions.includes(ext));
  if (!config) return null;

  // Special handling for typescript package (has .typescript and .tsx sub-grammars)
  if (config.treeSitterPackage === "tree-sitter-typescript") {
    if (ext === ".tsx") return tsxLanguage;
    return tsLanguage;
  }

  return tryLoadGrammar(config.treeSitterPackage, config.treeSitterSubProperty);
}

/** Check if a language grammar is available for the given extension */
export function hasLanguageForExt(ext: string): boolean {
  return getLanguageForExtDynamic(ext) !== null;
}

export function getLanguageForExt(ext: string): Parser.Language {
  return getLanguageForExtDynamic(ext) || jsLanguage;
}

/** Get list of extensions with available grammars */
export function getAvailableLanguages(): string[] {
  const available: string[] = Object.keys(staticLanguages);

  for (const config of languageConfigs) {
    // Skip configs already covered by static mappings
    if (config.extensions.every((e) => e in staticLanguages)) continue;

    const lang = tryLoadGrammar(config.treeSitterPackage, config.treeSitterSubProperty);
    if (lang) {
      for (const ext of config.extensions) {
        if (!available.includes(ext)) {
          available.push(ext);
        }
      }
    }
  }

  return available;
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
