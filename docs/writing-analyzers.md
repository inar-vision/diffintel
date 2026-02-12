# Writing Analyzers

This guide explains how to add a new analyzer to intent-spec. An analyzer detects implemented features in source code (e.g. HTTP routes) and matches them against declared intent features.

## The Analyzer Interface

Every analyzer implements the `Analyzer` interface from `src/types.ts`:

```ts
interface Analyzer {
  name: string;              // Unique identifier, e.g. "express-route"
  supportedTypes: string[];  // Intent feature types this handles, e.g. ["http-route"]
  fileExtensions?: string[]; // File extensions to scan, e.g. [".js", ".ts", ".tsx"]

  analyze(files: string[]): Implementation[];
  match(feature: IntentFeature, implementations: Implementation[]): MatchResult;
}
```

### `analyze(files)`

Receives an array of file paths (already filtered to matching extensions by the runner). Returns all implementations found:

```ts
interface Implementation {
  type: string;    // Must match a supportedTypes entry
  method: string;  // e.g. "GET"
  path: string;    // e.g. "/users/:id"
  file: string;    // Absolute file path where found
  line?: number;   // 1-indexed line number
}
```

### `match(feature, implementations)`

Given a single intent feature and all implementations found by this analyzer, returns whether the feature is implemented:

```ts
interface MatchResult {
  found: boolean;
  implementedIn: string | null;  // File path if found
  line: number | null;           // Line number if found
}
```

The runner calls `match()` with only the implementations from this analyzer (filtered by `analyzer` field).

## Using the Parsing Module

The `src/parsing/` module provides tree-sitter parsing with multi-language support.

### Core exports

```ts
import { parseFile, parseSource, Query, getLanguageForExt } from "../parsing";
```

- **`parseFile(filePath)`** — Reads the file, picks the grammar from the extension, returns `{ tree, source }`.
- **`parseSource(source, ext?)`** — Parses a string. The `ext` parameter (default `".js"`) selects the grammar.
- **`getLanguageForExt(ext)`** — Returns the `Parser.Language` for an extension. Used to compile queries.
- **`Query`** — The tree-sitter `Query` constructor. Takes a language and an S-expression pattern.

### Supported extensions

| Extension | Grammar |
|-----------|---------|
| `.js`     | JavaScript |
| `.ts`     | TypeScript |
| `.tsx`    | TSX |

Unknown extensions fall back to JavaScript.

## Per-Language Query Caching

Tree-sitter `Query` objects are tied to a specific grammar — a query compiled for JavaScript can't run on a TypeScript AST. When your analyzer handles multiple languages, compile and cache queries per language:

```ts
import Parser from "tree-sitter";
import { Query, getLanguageForExt } from "../parsing";

const MY_QUERY_SRC = `(call_expression
    function: (member_expression
      object: (identifier) @obj
      property: (property_identifier) @method)
    arguments: (arguments
      (string) @path))`;

interface CompiledQueries {
  myQuery: Parser.Query;
}

const queryCache = new Map<Parser.Language, CompiledQueries>();

function getQueries(lang: Parser.Language): CompiledQueries {
  let cached = queryCache.get(lang);
  if (!cached) {
    cached = {
      myQuery: new Query(lang, MY_QUERY_SRC),
    };
    queryCache.set(lang, cached);
  }
  return cached;
}
```

Then in `analyze()`:

```ts
for (const file of files) {
  const ext = path.extname(file);
  const lang = getLanguageForExt(ext);
  const { myQuery } = getQueries(lang);
  const { tree } = parseFile(file);

  const matches = myQuery.matches(tree.rootNode);
  // process matches...
}
```

The same S-expression query source works across JS/TS/TSX because they share node types like `call_expression`, `member_expression`, `string`, etc.

## Writing Tree-sitter Queries

Tree-sitter queries use S-expression patterns. Use `@name` to capture nodes:

```scheme
(call_expression
  function: (member_expression
    object: (identifier) @receiver
    property: (property_identifier) @method)
  arguments: (arguments
    (string) @path))
```

This matches `app.get("/users", handler)` and captures:
- `@receiver` → `app`
- `@method` → `get`
- `@path` → `"/users"`

To explore node types for a language, parse a sample and inspect the tree:

```ts
import { parseSource } from "../parsing";
const { tree } = parseSource('fastify.get("/test", handler);');
console.log(tree.rootNode.toString()); // Shows the full AST structure
```

Useful resources:
- [Tree-sitter query syntax](https://tree-sitter.github.io/tree-sitter/using-parsers/queries)
- [Tree-sitter playground](https://tree-sitter.github.io/tree-sitter/playground) — paste code, see the AST

## Registering a Built-in Analyzer

Add your analyzer to `src/analyzers/index.ts`:

```ts
import myAnalyzer from "./my-analyzer";

// In createRunner():
const builtinAnalyzers: Analyzer[] = [expressRouteAnalyzer, myAnalyzer];
```

That's it — the runner handles file filtering, dispatching, and report generation.

## Custom Analyzers via Config

Users can load analyzers from external files without modifying intent-spec. In `.intentrc.json`:

```json
{
  "analyzers": {
    "custom": ["./my-custom-analyzer.js"]
  }
}
```

The file must export an object conforming to the `Analyzer` interface. The runner validates that `name`, `supportedTypes`, `analyze`, and `match` are all present.

Users can also limit which built-in analyzers run:

```json
{
  "analyzers": {
    "include": ["express-route"]
  }
}
```

## Complete Example Skeleton

```ts
// src/analyzers/fastify-route.ts
import path from "path";
import Parser from "tree-sitter";
import { Analyzer, Implementation, IntentFeature, MatchResult } from "../types";
import { parseFile, Query, getLanguageForExt } from "../parsing";

const ROUTE_QUERY_SRC = `...`;  // tree-sitter S-expression

const queryCache = new Map<Parser.Language, Parser.Query>();

function getQuery(lang: Parser.Language): Parser.Query {
  let cached = queryCache.get(lang);
  if (!cached) {
    cached = new Query(lang, ROUTE_QUERY_SRC);
    queryCache.set(lang, cached);
  }
  return cached;
}

const fastifyRouteAnalyzer: Analyzer = {
  name: "fastify-route",
  supportedTypes: ["http-route"],
  fileExtensions: [".js", ".ts", ".tsx"],

  analyze(files: string[]): Implementation[] {
    const routes: Implementation[] = [];

    for (const file of files) {
      const ext = path.extname(file);
      const lang = getLanguageForExt(ext);
      const query = getQuery(lang);
      const { tree } = parseFile(file);

      for (const match of query.matches(tree.rootNode)) {
        // Extract captures, validate, push to routes
      }
    }

    return routes;
  },

  match(feature: IntentFeature, implementations: Implementation[]): MatchResult {
    const impl = implementations.find(
      (r) => r.method === feature.method?.toUpperCase() && r.path === feature.path
    );
    return impl
      ? { found: true, implementedIn: impl.file, line: impl.line || null }
      : { found: false, implementedIn: null, line: null };
  },
};

export = fastifyRouteAnalyzer;
```

## Reference

The Express analyzer at `src/analyzers/express-route.ts` is the canonical reference implementation. It demonstrates:
- Multiple query patterns (standard routes + chained `.route()` calls)
- Per-language query caching
- String value extraction from AST nodes (quoted strings and template literals)
- Path parameter normalization for matching
- Walking the AST to find chained method calls
