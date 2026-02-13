# Phase 3 — AI Universal Analyzer & Advanced Compliance

> **Status**: Complete — M3 (Behavioral Contracts), M4 (Architectural Constraints), and M5 (Propose/Apply for Constraints & Contracts) done.
>
> **Decision (Phase 2 retrospective):** M1-M2 are deferred indefinitely. Adding a non-deterministic AI analyzer at this stage risks undermining the core value proposition — deterministic, reproducible compliance checking that runs in CI without network access or API costs. AI already lives in the reconciliation layer (propose/apply) where non-determinism is acceptable. The priority is deepening what the deterministic AST engine can check (contracts, constraints) rather than broadening framework coverage via AI. M1-M2 may be revisited later as an opt-in Tier 2 fallback.

## Goal

Cover the long tail of frameworks and languages with an AI-powered universal analyzer, and extend compliance checking beyond route existence to behavioral contracts and architectural constraints.

## Architecture: The Three-Tier Model

After Phase 2 and 3, the analyzer system works in three tiers:

| Tier | Method | Speed | Cost | Offline | Deterministic | Coverage |
|------|--------|-------|------|---------|--------------|----------|
| **1. Built-in AST** | Tree-sitter queries | Fast (~ms) | Free | Yes | Yes | Express, Fastify, NestJS, (more from Phase 2) |
| **2. AI Universal** | LLM analysis | Slow (~sec) | API cost | No | No | Any framework, any language |
| **3. Custom plugins** | User-written | Varies | Free | Yes | Yes | Anything the user defines |

The system automatically selects the right tier:
1. If a built-in analyzer matches the project (detected from package.json, imports, or file patterns) → use Tier 1
2. If no built-in analyzer matches and an API key is configured → offer Tier 2
3. Users can always add custom analyzers via `.intentrc.json` → Tier 3

## Key Areas

### AI Universal Analyzer

The core idea: send source files to an LLM and ask it to extract implemented features, using the same output format as built-in analyzers.

#### How It Works

1. **Discovery**: Scan project files to identify the tech stack (framework, language, patterns)
2. **Context building**: Select relevant source files (route handlers, controllers, middleware config)
3. **Extraction prompt**: Ask the LLM to identify all implemented features with structured output:
   ```json
   [
     { "type": "http-route", "method": "GET", "path": "/users", "file": "src/routes.py", "line": 42 },
     { "type": "http-route", "method": "POST", "path": "/users", "file": "src/routes.py", "line": 58 }
   ]
   ```
4. **Matching**: Use the standard `match()` logic against the extracted features
5. **Caching**: Cache extraction results per file hash to avoid re-analyzing unchanged files

#### Design Constraints

- **Structured output required** — the LLM must return parseable JSON matching the analyzer output format, not free-form text
- **File-by-file processing** — send files individually or in small batches to stay within context limits and enable caching
- **Validation** — verify the LLM's output matches expected schema before using it
- **Fallback** — if the LLM returns unparseable output, report the file as unanalyzable rather than guessing
- **Cost awareness** — show estimated token usage before running, support `--dry-run` to preview what would be analyzed

#### Configuration

In `.intentrc.json`:
```json
{
  "analyzers": {
    "ai": {
      "enabled": true,
      "provider": "anthropic",
      "model": "claude-sonnet-4-5-20250929",
      "maxFilesPerBatch": 5,
      "cacheDir": ".intent-cache"
    }
  }
}
```

Or via CLI: `intent-spec check --ai` to enable AI analysis for the current run.

### Behavioral Contract Validation

Extend `http-route` features in intent.json to declare expected behavior, not just existence.

#### Schema Extension

```json
{
  "id": "get-users",
  "type": "http-route",
  "method": "GET",
  "path": "/users",
  "status": "approved",
  "contract": {
    "response": {
      "status": 200,
      "contentType": "application/json",
      "shape": {
        "type": "array",
        "items": { "type": "object", "required": ["id", "name"] }
      }
    },
    "auth": "required"
  }
}
```

#### Validation Approaches

**Static analysis (preferred for Phase 3)**:
- Use AST to analyze handler return values and response calls
- Detect `res.status(200).json(...)` patterns and verify they match declared contracts
- Check for auth middleware attachment on routes that declare `auth: required`
- Deterministic, offline, fast

**Runtime validation (stretch goal)**:
- Start the application, send test requests, validate responses against contracts
- More accurate but requires the app to be runnable in a test environment
- Non-trivial setup (database seeding, env vars, etc.)
- May be better suited for Phase 4 or later

### Architectural Constraint Checking

Implement analyzers for the `constraint` feature type already in the Phase 1 schema.

#### Initial Constraint Types

Start with 2-3 constraints that are common, useful, and feasible with AST analysis:

1. **Auth middleware requirement**
   ```json
   {
     "id": "api-auth-required",
     "type": "constraint",
     "description": "All routes under /api require auth middleware",
     "rule": "routes-require-middleware",
     "scope": "/api/*",
     "middleware": "authenticate"
   }
   ```
   AST check: for every route matching the scope, verify the middleware appears in the handler chain.

2. **No direct database calls in handlers**
   ```json
   {
     "id": "no-db-in-handlers",
     "type": "constraint",
     "description": "Route handlers must not call database directly",
     "rule": "no-direct-import",
     "scope": "route-handlers",
     "forbidden": ["knex", "prisma.client", "mongoose.model"]
   }
   ```
   AST check: in files identified as route handlers, verify none of the forbidden imports/calls appear.

3. **Required error handling**
   ```json
   {
     "id": "routes-handle-errors",
     "type": "constraint",
     "description": "All async route handlers must have error handling",
     "rule": "async-error-handling",
     "scope": "route-handlers"
   }
   ```
   AST check: verify async handlers are wrapped in try/catch or use an error-handling middleware pattern.

#### Constraint Analyzer Architecture

- `src/analyzers/constraint-checker.js` — generic constraint analyzer
- Constraint rules are pluggable (each rule type is a function that receives AST + constraint config)
- Built-in rules for the common cases above
- Users can reference custom rule implementations in `.intentrc.json`

## Milestones

### M1: AI Universal Analyzer — Core

- Implement `src/analyzers/ai-analyzer.js` with the extraction prompt approach
- Structured output parsing and validation
- Integration with analyzer runner (Tier 2 fallback)
- `--ai` CLI flag to enable
- Basic caching by file content hash
- Test with a non-Express framework project (e.g., Flask, Hono)

### M2: AI Analyzer — Polish

- Cost estimation and `--dry-run` preview
- Batch processing with configurable batch sizes
- Provider configuration (model selection, API key management)
- Improved prompts based on testing with real projects
- Edge case handling: very large files, binary files, generated code
- Clear reporting when AI analysis is used vs built-in analyzers

### M3: Behavioral Contracts — Schema & Static Analysis ✅

- ✅ Extended intent.json schema with `contract` field on `http-route` features
- ✅ Auth middleware detection via AST (configurable middleware names via `.intentrc.json`)
- ✅ Contract violations reported per-feature (in `feature.contractViolations[]`)
- ✅ Contract violations contribute to drift but not compliance score
- ✅ Report format includes `contractsChecked`, `contractViolations`, `contractViolationCount`
- ✅ Unit tests (middleware extraction, contract matching) and integration tests (fixtures)

### M4: Architectural Constraints ✅

- ✅ Separate constraint engine (`src/constraints/`) with pluggable rule registry
- ✅ Scope matcher: prefix patterns (`/api/*`), wildcard (`*`), exact match, `route-handlers`
- ✅ Built-in rules:
  - `routes-require-middleware` — checks middleware presence on routes matching scope
  - `no-direct-import` — AST-based detection of forbidden require/import statements
  - `async-error-handling` — AST-based detection of unguarded async handlers
- ✅ Constraints skipped in normal analyzer loop (no "unanalyzable" noise)
- ✅ Draft constraints silently skipped
- ✅ Constraint results in report: `constraints.results[]`, summary counts, drift integration
- ✅ `init` command suggests common constraints as drafts
- ✅ 21 unit tests + 6 integration tests (all passing)
- ✅ Documentation: `docs/constraints.md`
- ⚠️ `propose` and `apply` commands do NOT yet handle constraint violations (M5 scope)

### M5: Integration & Polish

- Update `propose` and `apply` commands to handle constraint violations:
  - `propose`: include constraint violations in the proposal prompt (alongside missing features)
  - `apply`: generate code fixes for constraint violations (e.g., add missing middleware, wrap async handlers)
  - Both commands currently only act on `result === "missing"` features; need to also act when `constraintsFailed > 0`
  - The prompt builder needs a new section describing constraint violations, the rule that failed, and the specific routes/files involved
  - The apply validator should re-check constraints after applying changes
- Update `propose` and `apply` to handle contract violations (same gap — they ignore `contractViolationCount`)
- Performance optimization for large codebases
- Comprehensive test suite for reconciliation with contracts and constraints
- Update CI workflow examples

## Dependencies

- Phase 2 AST infrastructure (tree-sitter parsing, query utilities)
- Phase 2 multi-framework analyzers (validates the analyzer interface is extensible enough)
- Anthropic API access (for AI universal analyzer)
- Intent schema v0.2 (already supports `constraint` type)

## Schema Changes

- Add optional `contract` field to `http-route` features
- Add specific fields to `constraint` type: `rule`, `scope`, `middleware`, `forbidden`, etc.
- These are additive — existing intent.json files remain valid

## Estimated Scope

Large. The AI universal analyzer (M1-M2) is the highest-value work. Behavioral contracts (M3) and architectural constraints (M4) are exploratory and may require iteration on the schema and approach.

## Questions to Resolve Before Starting

- What's the right prompt engineering approach for reliable structured extraction?
- How well does caching by file hash work in practice? Do developers change files often enough that cache hit rates are low?
- For behavioral contracts, is static analysis accurate enough to be useful, or does it produce too many false positives?
- Which constraint types do real teams actually want to enforce?
- Should the AI analyzer support local models (Ollama, etc.) or start with cloud-only?
