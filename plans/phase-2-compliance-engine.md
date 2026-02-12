# Phase 2 — AST-Based Analyzer Foundation

> **Status**: Ready to start — Phase 1 complete.

## Goal

Replace the regex-based code analysis with proper AST (Abstract Syntax Tree) parsing using tree-sitter, and add built-in support for the most popular Node.js frameworks. This makes the compliance engine robust enough to trust on production codebases.

## Why AST Over Regex

Phase 1's Express analyzer uses regex pattern matching on raw source text. This approach has known problems:

- **False positives from comments and strings** — regex can't distinguish real code from route-like patterns in comments (we hit this with self-scanning in Phase 1; see NOTES.md)
- **Fragile multi-line matching** — chained routes, split across lines, or using variables for paths break easily
- **No structural understanding** — regex doesn't know if `app` is actually an Express instance or something unrelated
- **Doesn't scale** — each new framework needs its own set of fragile patterns

AST parsing solves all of these. Tree-sitter parses source code into a structural tree where each node represents a real code construct (function call, string literal, decorator, etc.). Queries against the AST are precise and can't accidentally match comments or strings.

### What Is Tree-sitter

Tree-sitter is an incremental parsing library that supports ~150 programming languages with a unified API. Key properties:

- **One API, many languages** — `tree-sitter-javascript`, `tree-sitter-typescript`, `tree-sitter-python`, etc. are grammar packages; the query/traversal API is the same
- **Fast** — designed for real-time use in editors; parsing a large file takes milliseconds
- **Incremental** — can re-parse only changed regions (useful for future watch mode)
- **Query language** — S-expression pattern matching against the AST (similar to CSS selectors for code)
- **Node.js bindings available** — `tree-sitter` npm package with per-language grammar packages

Example: finding Express route registrations becomes a tree-sitter query like:
```scheme
(call_expression
  function: (member_expression
    object: (identifier) @app
    property: (identifier) @method)
  arguments: (arguments
    (string) @path))
```

This matches `app.get('/users', handler)` but will never match the same text inside a comment or string.

## Milestones

### M1: Tree-sitter Infrastructure

**Goal**: Set up tree-sitter parsing pipeline and establish the pattern for AST-based analyzers.

- Install `tree-sitter` and `tree-sitter-javascript` packages
- Create `src/parsing/` module:
  - `parser.js` — initializes tree-sitter, parses source files into ASTs, caches parsed trees
  - `query.js` — helper utilities for running tree-sitter queries and extracting matches
- Define the analyzer interface extension: analyzers can declare whether they need raw source (regex) or parsed AST
- Update `src/analyzers/index.js` to provide parsed ASTs to analyzers that request them
- Add tests for parsing infrastructure

### M2: Upgrade Express Analyzer to AST

**Goal**: Replace the regex-based Express analyzer with an AST-based version. Identical behavior, zero false positives.

- Rewrite `src/analyzers/express-route.js` to use tree-sitter queries instead of regex
- Cover all Express routing patterns:
  - `app.get('/path', handler)` — standard route registration
  - `router.get('/path', handler)` — Router-based routes
  - `router.route('/path').get(handler).post(handler)` — chained routes
  - `app.use('/prefix', router)` — mounted sub-routers (stretch: resolve full paths)
- Remove the self-scanning workarounds (comments no longer need to avoid route-like patterns)
- Ensure all existing Express analyzer tests still pass
- Add new test cases for edge cases that regex couldn't handle:
  - Routes in comments (should NOT match)
  - Routes in string literals (should NOT match)
  - Multi-line route registrations
  - Variable-based paths (document as known limitation)
- Performance benchmark: parsing + analysis should be no slower than regex for typical projects

### M3: TypeScript Support

**Goal**: Handle TypeScript codebases, including decorator-based frameworks.

- Install `tree-sitter-typescript` grammar
- Extend parser to detect `.ts`/`.tsx` files and use the TypeScript grammar
- Verify Express analyzer works on TypeScript code (most patterns are the same)
- Handle TypeScript-specific patterns:
  - Type assertions on route handlers
  - Generic type parameters on request/response
  - Decorator syntax (groundwork for NestJS in M4)
- Add TypeScript test fixtures

### M4: Fastify Analyzer

**Goal**: Add first non-Express framework support using the AST infrastructure.

- Create `src/analyzers/fastify-route.js`
- Detect Fastify route patterns:
  - `fastify.get('/path', handler)` — standard routes
  - `fastify.route({ method: 'GET', url: '/path', handler })` — route options object
  - Plugin-based routes with `fastify.register()`
- Follow the same analyzer interface (analyze + match functions)
- Test with real-world Fastify code patterns
- Update `init` command to auto-detect Fastify projects (check package.json dependencies)

### M5: NestJS Analyzer

**Goal**: Add decorator-based framework support, demonstrating AST's advantage over regex.

- Create `src/analyzers/nestjs-route.js`
- Detect NestJS patterns using AST decorator queries:
  - `@Controller('/prefix')` on classes
  - `@Get('/path')`, `@Post('/path')`, etc. on methods
  - `@UseGuards()`, `@UseInterceptors()` (for future constraint checking)
  - Resolve full paths from controller prefix + method decorator
- This is where AST really shines — parsing decorators with regex is extremely fragile
- Test with representative NestJS controller code

### M6: Analyzer Quality & Polish

**Goal**: Ensure all analyzers are production-ready.

- Per-analyzer test suites with real-world code samples (not just synthetic fixtures)
- False positive/negative tracking mechanism:
  - `intent-spec check --debug` mode that shows what each analyzer matched and why
  - Structured debug output for troubleshooting
- Performance benchmarks: scan a 500+ file project in under 3 seconds
- Documentation: which frameworks are supported, what patterns are detected, known limitations
- Update NOTES.md with any new gotchas discovered

## Technical Decisions

### tree-sitter vs other parsers

| Option | Pros | Cons |
|--------|------|------|
| **tree-sitter** | Multi-language, fast, battle-tested (used in editors), query language | Native dependency (needs compilation), grammar packages are large |
| **@babel/parser** | Pure JS, excellent JS/TS support | JavaScript/TypeScript only, no path to other languages |
| **acorn** | Pure JS, lightweight, fast | JavaScript only, no TypeScript, limited plugin system |
| **swc** | Very fast, Rust-based, JS/TS support | Rust dependency, less mature query API |

**Decision**: tree-sitter. The multi-language support is essential for Phase 3 (Python, Go analyzers) and the query language is a natural fit for pattern matching. The native dependency is acceptable since this is a CLI tool, not a browser library.

### Backward compatibility

- The analyzer interface (`analyze()` + `match()` functions) stays the same
- Analyzers that use regex continue to work (the runner supports both)
- Reports, intent.json format, and CLI commands are unchanged
- Existing tests must continue to pass

## Dependencies

- Phase 1 analyzer interface (stable)
- `tree-sitter` npm package + language grammars
- No changes to intent.json schema

## Estimated Scope

Medium. M1-M2 are the core work (infrastructure + Express upgrade). M3-M5 are incremental — each new analyzer is self-contained once the infrastructure exists. M6 is polish.

## Questions to Resolve During Implementation

- Does tree-sitter's native compilation cause issues in any common CI environments?
- How large are the grammar packages? Do they meaningfully affect install time?
- Should mounted sub-router path resolution be in scope, or deferred?
- Is Fastify or NestJS the better second framework? (Currently planned: Fastify first due to simpler API surface, then NestJS for decorator pattern)
