import { execFileSync } from "child_process";
import path from "path";
import { DependencyEdge, DependencyGraph } from "./types";
import { getConfigForExtension, getAllSupportedExtensions } from "./language-configs";
import { parseSource, hasLanguageForExt } from "../parsing/parser";
import type { SyntaxNode } from "../parsing/parser";

const MAX_REPO_FILES = 5000;
const MAX_REVERSE_DEPS = 100;

interface ImportInfo {
  specifier: string;
  symbols: string[];
}

/**
 * Build a dependency graph centered on the changed files.
 *
 * 1. Forward deps: parse changed files' imports, resolve to repo paths
 * 2. Reverse deps: scan repo files to find which ones import changed files
 * 3. Second ring: scan repo files to find which ones import the reverse deps
 */
export function buildDependencyGraph(
  changedFiles: string[],
  headRef?: string,
): DependencyGraph {
  const start = Date.now();
  const ref = headRef || "HEAD";

  const changedSet = new Set(changedFiles);

  // Step 1: Forward deps — what do changed files import?
  const forwardDeps: DependencyEdge[] = [];
  for (const filePath of changedFiles) {
    const content = getFileContentSafe(ref, filePath);
    if (!content) continue;

    const imports = extractImports(content, filePath);
    for (const imp of imports) {
      const resolved = resolveImportPath(imp.specifier, filePath);
      if (resolved && !changedSet.has(resolved)) {
        forwardDeps.push({
          from: filePath,
          to: resolved,
          specifier: imp.specifier,
          symbols: imp.symbols,
        });
      }
    }
  }

  // Step 2: Get all repo files for reverse dep scan
  const repoFiles = getRepoFiles();
  const supportedExts = getAllSupportedExtensions();
  const scanCandidates = repoFiles.filter((f) => {
    if (changedSet.has(f)) return false;
    const ext = path.extname(f);
    return supportedExts.has(ext);
  });

  // Step 3: Reverse deps — which repo files import changed files?
  const reverseDeps: DependencyEdge[] = [];
  const reverseDepFiles = new Set<string>();

  for (const candidate of scanCandidates) {
    if (reverseDeps.length >= MAX_REVERSE_DEPS) break;

    const content = getFileContentSafe(ref, candidate);
    if (!content) continue;

    const imports = extractImportsLightweight(content, candidate);
    for (const imp of imports) {
      const resolved = resolveImportPath(imp.specifier, candidate);
      if (resolved && changedSet.has(resolved)) {
        reverseDeps.push({
          from: candidate,
          to: resolved,
          specifier: imp.specifier,
          symbols: imp.symbols,
        });
        reverseDepFiles.add(candidate);
      }
    }
  }

  // Step 4: Second ring — which repo files import the reverse dep files?
  const secondRingDeps: DependencyEdge[] = [];

  if (reverseDepFiles.size > 0 && reverseDepFiles.size <= 50) {
    for (const candidate of scanCandidates) {
      if (reverseDepFiles.has(candidate)) continue;
      if (secondRingDeps.length >= MAX_REVERSE_DEPS) break;

      const content = getFileContentSafe(ref, candidate);
      if (!content) continue;

      const imports = extractImportsLightweight(content, candidate);
      for (const imp of imports) {
        const resolved = resolveImportPath(imp.specifier, candidate);
        if (resolved && reverseDepFiles.has(resolved)) {
          secondRingDeps.push({
            from: candidate,
            to: resolved,
            specifier: imp.specifier,
            symbols: imp.symbols,
          });
        }
      }
    }
  }

  return {
    forwardDeps,
    reverseDeps,
    secondRingDeps,
    repoFilesScanned: scanCandidates.length,
    scanTimeMs: Date.now() - start,
  };
}

/**
 * Extract imports using tree-sitter AST (accurate, used for changed files).
 */
function extractImports(source: string, filePath: string): ImportInfo[] {
  const ext = path.extname(filePath);
  if (!hasLanguageForExt(ext)) return extractImportsLightweight(source, filePath);

  const config = getConfigForExtension(ext);
  if (!config) return extractImportsLightweight(source, filePath);

  try {
    const { tree } = parseSource(source, ext);
    const root = tree.rootNode;
    const imports: ImportInfo[] = [];

    for (let i = 0; i < root.childCount; i++) {
      const node = root.child(i)!;
      const result = extractImportFromNode(node, config.id);
      if (result) imports.push(result);
    }

    return imports;
  } catch {
    return extractImportsLightweight(source, filePath);
  }
}

/**
 * Extract import info from a single AST node, language-aware.
 */
function extractImportFromNode(node: SyntaxNode, languageId: string): ImportInfo | null {
  if (languageId === "javascript" || languageId === "typescript") {
    return extractJsTsImport(node);
  }
  if (languageId === "python") {
    return extractPythonImport(node);
  }
  if (languageId === "go") {
    return extractGoImport(node);
  }
  // For other languages, fall through to null — lightweight regex handles them
  return null;
}

function extractJsTsImport(node: SyntaxNode): ImportInfo | null {
  // import ... from "specifier"
  if (node.type === "import_statement") {
    const source = node.childForFieldName("source")?.text;
    if (!source) return null;
    const specifier = source.replace(/^['"]|['"]$/g, "");
    const symbols = extractJsImportSymbols(node);
    return { specifier, symbols };
  }

  // const x = require("specifier")
  if (node.type === "lexical_declaration" || node.type === "variable_declaration") {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)!;
      if (child.type === "variable_declarator") {
        const value = child.childForFieldName("value");
        if (value?.type === "call_expression") {
          const fn = value.childForFieldName("function");
          if (fn?.text === "require") {
            const args = value.childForFieldName("arguments");
            if (args && args.childCount >= 2) {
              const arg = args.child(1);
              if (arg) {
                const specifier = arg.text.replace(/^['"]|['"]$/g, "");
                const name = child.childForFieldName("name")?.text;
                return { specifier, symbols: name ? [name] : [] };
              }
            }
          }
        }
      }
    }
  }

  // export ... from "specifier" (re-exports)
  if (node.type === "export_statement") {
    const source = node.childForFieldName("source")?.text;
    if (source) {
      const specifier = source.replace(/^['"]|['"]$/g, "");
      return { specifier, symbols: [] };
    }
  }

  return null;
}

function extractJsImportSymbols(node: SyntaxNode): string[] {
  const symbols: string[] = [];

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)!;

    // import defaultExport from ...
    if (child.type === "identifier") {
      symbols.push(child.text);
    }

    // import { a, b } from ...
    if (child.type === "import_clause") {
      for (let j = 0; j < child.childCount; j++) {
        const clauseChild = child.child(j)!;
        if (clauseChild.type === "identifier") {
          symbols.push(clauseChild.text);
        }
        if (clauseChild.type === "named_imports") {
          for (let k = 0; k < clauseChild.childCount; k++) {
            const specifier = clauseChild.child(k)!;
            if (specifier.type === "import_specifier") {
              const name = specifier.childForFieldName("name")?.text;
              if (name) symbols.push(name);
            }
          }
        }
        if (clauseChild.type === "namespace_import") {
          const name = clauseChild.childForFieldName("name")?.text;
          if (name) symbols.push(`* as ${name}`);
        }
      }
    }
  }

  return symbols;
}

function extractPythonImport(node: SyntaxNode): ImportInfo | null {
  // from module import name1, name2
  if (node.type === "import_from_statement") {
    const moduleName = node.childForFieldName("module_name")?.text;
    if (!moduleName) return null;
    const symbols: string[] = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)!;
      if (child.type === "dotted_name" && child !== node.childForFieldName("module_name")) {
        symbols.push(child.text);
      }
      if (child.type === "aliased_import") {
        const name = child.childForFieldName("name")?.text;
        if (name) symbols.push(name);
      }
    }
    return { specifier: moduleName, symbols };
  }

  // import module
  if (node.type === "import_statement") {
    const name = node.childForFieldName("name")?.text;
    if (!name) return null;
    return { specifier: name, symbols: [] };
  }

  return null;
}

function extractGoImport(node: SyntaxNode): ImportInfo | null {
  if (node.type !== "import_declaration") return null;

  // Go imports are package paths, not relative — skip for dependency graph
  // They point to external packages, not local files
  // TODO: support local module imports if go.mod is present
  return null;
}

/**
 * Lightweight regex-based import extraction.
 * Fast fallback for scanning large numbers of files.
 */
function extractImportsLightweight(source: string, filePath: string): ImportInfo[] {
  const ext = path.extname(filePath);
  const imports: ImportInfo[] = [];

  if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(ext)) {
    // ES imports: import ... from "specifier"
    const esImportRe = /(?:import\s+(?:{([^}]+)}\s+from\s+|(\w+)\s+from\s+|(?:\*\s+as\s+\w+)\s+from\s+)?)['"]([^'"]+)['"]/g;
    let match;
    while ((match = esImportRe.exec(source)) !== null) {
      const symbols: string[] = [];
      if (match[1]) {
        symbols.push(...match[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean));
      } else if (match[2]) {
        symbols.push(match[2]);
      }
      imports.push({ specifier: match[3], symbols });
    }

    // require() calls
    const requireRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRe.exec(source)) !== null) {
      imports.push({ specifier: match[1], symbols: [] });
    }

    return imports;
  }

  if (ext === ".py") {
    // from X import Y
    const fromImportRe = /^from\s+(\S+)\s+import\s+(.+)$/gm;
    let match;
    while ((match = fromImportRe.exec(source)) !== null) {
      const symbols = match[2].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      imports.push({ specifier: match[1], symbols });
    }

    // import X
    const importRe = /^import\s+(\S+)/gm;
    while ((match = importRe.exec(source)) !== null) {
      if (!match[1].startsWith("(")) {
        imports.push({ specifier: match[1], symbols: [] });
      }
    }

    return imports;
  }

  // For other languages, skip — the coverage isn't worth the complexity
  return imports;
}

/**
 * Resolve a relative import specifier to a repo-relative file path.
 * Returns null for external/package imports.
 */
function resolveImportPath(specifier: string, fromFile: string): string | null {
  // Skip external/package imports
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
    // Python relative imports use dots
    if (path.extname(fromFile) === ".py" && specifier.startsWith(".")) {
      // handled below
    } else {
      return null;
    }
  }

  const dir = path.dirname(fromFile);
  let resolved = path.normalize(path.join(dir, specifier));

  // Remove leading ./ if present
  if (resolved.startsWith("./")) resolved = resolved.slice(2);

  // Try exact path first, then common extensions
  const ext = path.extname(fromFile);
  const candidates = buildResolutionCandidates(resolved, ext);

  // Check which candidate exists in the repo
  for (const candidate of candidates) {
    if (repoFileExists(candidate)) return candidate;
  }

  return null;
}

/**
 * Build a list of candidate paths for import resolution.
 */
function buildResolutionCandidates(resolved: string, sourceExt: string): string[] {
  // If already has an extension, try as-is
  if (path.extname(resolved)) return [resolved];

  const candidates: string[] = [];

  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(sourceExt)) {
    // TypeScript/JavaScript resolution order
    candidates.push(
      `${resolved}.ts`,
      `${resolved}.tsx`,
      `${resolved}.js`,
      `${resolved}.jsx`,
      `${resolved}/index.ts`,
      `${resolved}/index.tsx`,
      `${resolved}/index.js`,
      `${resolved}/index.jsx`,
    );
  } else if (sourceExt === ".py") {
    candidates.push(
      `${resolved}.py`,
      `${resolved}/__init__.py`,
    );
  } else {
    // Generic: try with same extension
    candidates.push(`${resolved}${sourceExt}`);
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Git / filesystem helpers
// ---------------------------------------------------------------------------

let _repoFilesCache: string[] | null = null;
let _repoFileSet: Set<string> | null = null;

function getRepoFiles(): string[] {
  if (_repoFilesCache) return _repoFilesCache;

  try {
    const output = execFileSync("git", ["ls-files"], { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    _repoFilesCache = output.trim().split("\n").filter(Boolean);
    if (_repoFilesCache.length > MAX_REPO_FILES) {
      if (process.env.DIFFINTEL_DEBUG) {
        console.error(`Repo has ${_repoFilesCache.length} files, capping scan at ${MAX_REPO_FILES}`);
      }
      _repoFilesCache = _repoFilesCache.slice(0, MAX_REPO_FILES);
    }
    _repoFileSet = new Set(_repoFilesCache);
    return _repoFilesCache;
  } catch {
    _repoFilesCache = [];
    _repoFileSet = new Set();
    return _repoFilesCache;
  }
}

function repoFileExists(filePath: string): boolean {
  if (!_repoFileSet) getRepoFiles();
  return _repoFileSet!.has(filePath);
}

function getFileContentSafe(ref: string, filePath: string): string | undefined {
  try {
    return execFileSync("git", ["show", `${ref}:${filePath}`], { encoding: "utf-8" });
  } catch {
    return undefined;
  }
}

/**
 * Reset cached repo file list (for testing).
 */
export function resetRepoFilesCache(): void {
  _repoFilesCache = null;
  _repoFileSet = null;
}
