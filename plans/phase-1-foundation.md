# Phase 1 — Solid Foundation

## Goal

Transform the current proof-of-concept into a reliable, installable tool with an expressive intent schema and a pluggable compliance engine. After this phase, the tool should be usable on real projects — not just the sample Express app.

---

## Guiding Principles for Phase 1

- **Ship incrementally**: Each milestone below should leave the system in a working state.
- **Real-world validation**: Test against actual projects, not just the sample `app.js`. If the tool can't handle a real Express app with middleware, router files, and dynamic imports, it's not ready.
- **Don't over-design**: Later phases will change. Build the schema and analyzer interfaces to be extensible, but don't add every conceivable feature type now. Start with what we can validate deterministically.
- **CLI-first**: Everything must work from the command line. The board/UI is a viewer, not the primary interface.
- **Private for now**: We are not publishing to npm or making the tool public. The CLI is for local development use via `npm link`. Publishing comes later when the tool is proven and stable.

---

## Milestone 1: Project Structure & Packaging

### What
Restructure from loose scripts into a proper npm package that can be installed and run as a CLI tool.

### Tasks

1. **Create package structure**
   ```
   src/
     cli.js              — CLI entry point (argument parsing, command dispatch)
     commands/
       init.js            — scaffold intent.json in a repo
       check.js           — run compliance validation (current check-intent.js logic)
       validate.js        — validate intent.json against the schema
       report.js          — format and display reports
       propose.js         — AI proposal (current propose-fix.js logic, text mode)
       apply.js           — AI auto-fix (current propose-fix.js logic, apply mode)
     schema/
       intent-schema.json — JSON Schema for intent.json
       validate.js        — schema validation logic
     analyzers/
       index.js           — analyzer registry and runner
       express-route.js   — current regex-based Express route analyzer (extracted)
     report/
       format.js          — report generation and formatting
     utils/
       files.js           — file scanning utilities (current findSourceFiles)
   ```

2. **Add `bin` field to package.json**
   - Command name: `intent-spec`
   - For local use only: run `npm link` in the repo to make `intent-spec` available on your machine
   - Also works with `node src/cli.js <command>` without linking
   - **Do not publish to npm** — the package stays private (`"private": true` in package.json)

3. **Migrate existing logic**
   - Move `check-intent.js` logic into `src/commands/check.js` and `src/analyzers/express-route.js`
   - Move `propose-fix.js` logic into `src/commands/propose.js` and `src/commands/apply.js`
   - Keep the old scripts temporarily as thin wrappers that call the new code (avoid breaking CI)

4. **Add configuration file support**
   - `.intentrc.json` or `intent.config.json` in repo root
   - Config options: intent file path, scan directories, excluded files/dirs, analyzer selection
   - CLI flags override config file values
   - Sensible defaults (intent file: `intent.json`, scan: `.`, exclude: `node_modules`, `.git`)

5. **Dependency management**
   - Move `dotenv` and `@anthropic-ai/sdk` to optional/peer dependencies (only needed for propose/apply commands)
   - Add `ajv` or similar for JSON Schema validation
   - Add a CLI argument parser (e.g., `commander` or `yargs`, or keep it minimal with manual parsing)

### Done when
- `intent-spec check` (via `npm link`) or `node src/cli.js check` works and produces the same output as current `node check-intent.js`
- `intent-spec init` creates a starter `intent.json`
- `intent-spec validate` validates `intent.json` against the schema
- Package remains private (`"private": true`) — nothing is published
- Existing CI workflow still works (update to use `node src/cli.js` commands)

---

## Milestone 2: Intent Schema v0.2

### What
Expand the intent schema to support richer feature declarations while remaining backwards-compatible with v0.1.

### Schema Changes

```jsonc
{
  "$schema": "./node_modules/intent-spec/schema/intent-schema.json",
  "version": "0.2",
  "meta": {
    "name": "my-api",                    // project name
    "description": "User management API" // optional
  },
  "features": [
    {
      "id": "list-users",
      "type": "http-route",
      "description": "Returns all users with optional pagination",
      "status": "approved",              // draft | approved | deprecated
      "method": "GET",
      "path": "/users",
      "response": {                      // optional: expected response shape
        "status": 200,
        "contentType": "application/json"
      }
    },
    {
      "id": "auth-middleware",
      "type": "middleware",
      "description": "All /api/* routes require Bearer token authentication",
      "status": "approved",
      "pattern": "/api/*"
    },
    {
      "id": "rate-limiting",
      "type": "constraint",
      "description": "API routes must use rate limiting middleware",
      "status": "draft"
    }
  ]
}
```

### Tasks

1. **Define JSON Schema for intent.json v0.2**
   - Required fields: `version`, `features` array
   - Feature required fields: `id` (unique), `type`
   - Feature optional fields: `description`, `status` (default: `approved`)
   - Type-specific fields validated per type (e.g., `http-route` requires `method` + `path`)
   - `meta` object is optional

2. **Add `status` field semantics**
   - `draft` — declared but not enforced by compliance checks (informational only)
   - `approved` — actively enforced, missing = compliance failure
   - `deprecated` — still tracked but removal is expected, extra warning if still present
   - Default: `approved` (backwards-compatible with v0.1 which has no status field)

3. **Support new feature types (declarations only for now)**
   - `http-route` — current behavior, fully enforced
   - `middleware` — declared, shown on board, but no analyzer yet (Phase 2)
   - `constraint` — declared, shown on board, but no analyzer yet (Phase 2)
   - Unknown types are accepted by the schema but produce a warning ("no analyzer available for type X")

4. **Version migration**
   - `npx intent-spec check` accepts both v0.1 and v0.2 intent files
   - v0.1 files are internally normalized to v0.2 (missing `status` defaults to `approved`, missing `meta` is fine)
   - `npx intent-spec migrate` command: upgrades a v0.1 file to v0.2 format in-place

5. **Update `npx intent-spec init` to generate v0.2 format**

### Done when
- JSON Schema exists and correctly validates v0.2 intent files
- `npx intent-spec validate` catches malformed intent files with clear error messages
- Existing v0.1 intent files still work with `check` command
- New feature types are accepted but only `http-route` is analyzed

---

## Milestone 3: Pluggable Analyzer Architecture

### What
Extract the route detection logic into a pluggable analyzer system so new languages and feature types can be added without touching core code.

### Analyzer Interface

```js
// Every analyzer exports this shape:
module.exports = {
  name: "express-route",

  // Which feature types this analyzer handles
  supportedTypes: ["http-route"],

  // Which file extensions this analyzer can scan
  fileExtensions: [".js", ".ts"],

  // Analyze a set of files and return discovered implementations
  analyze(files) {
    // Returns: [{ type, method, path, file, line }]
  },

  // Match a declared feature against discovered implementations
  match(feature, implementations) {
    // Returns: { found: boolean, implementedIn: string|null, line: number|null }
  }
};
```

### Tasks

1. **Define the analyzer interface**
   - `analyze(files)` — scans source files, returns array of discovered implementations
   - `match(feature, implementations)` — checks if a specific declared feature is implemented
   - `supportedTypes` — array of feature type strings this analyzer handles
   - `fileExtensions` — which files to pass to this analyzer

2. **Extract current logic into `express-route` analyzer**
   - Move regex pattern and route extraction from `check-intent.js`
   - Improve the regex to handle more patterns:
     - `Router()` usage (`const router = express.Router()`)
     - Route files imported via `app.use('/prefix', router)`
     - Chained routes (`router.route('/users').get(...).post(...)`)
   - Add line number tracking (which line the route is defined on)

3. **Build the analyzer runner**
   - Loads analyzers from built-in directory + user-configured paths
   - Groups features by type → dispatches to matching analyzer
   - Features with no matching analyzer get reported as "unanalyzable" (warning, not error)
   - Merges results into unified compliance report

4. **Update check command to use the analyzer runner**
   - Same report format as before, but now powered by the pluggable system
   - Report includes which analyzer detected each feature

5. **Configuration for analyzers**
   - `.intentrc.json` can specify:
     ```json
     {
       "analyzers": {
         "include": ["express-route"],
         "custom": ["./my-analyzer.js"]
       }
     }
     ```
   - By default, all built-in analyzers are active

### Done when
- `check` command produces identical results to current implementation
- A custom analyzer can be loaded from a local file via config
- Features of type `middleware` or `constraint` produce a "no analyzer" warning, not a crash
- Adding a new built-in analyzer requires only creating a file in `src/analyzers/` — no changes to core code

---

## Milestone 4: Improved Report & Output

### What
Make compliance reports more useful for both humans (CLI output) and machines (structured JSON).

### Tasks

1. **Report format v0.2**
   ```json
   {
     "version": "0.2",
     "meta": {
       "intentFile": "intent.json",
       "intentVersion": "0.2",
       "timestamp": "...",
       "analyzers": ["express-route"]
     },
     "summary": {
       "totalDeclared": 9,
       "analyzed": 7,
       "unanalyzable": 2,
       "present": 6,
       "missing": 1,
       "extra": 2,
       "complianceScore": 85.7
     },
     "features": [
       {
         "id": "list-users",
         "type": "http-route",
         "status": "approved",
         "result": "present",
         "implementedIn": "app.js",
         "line": 7,
         "analyzer": "express-route"
       },
       {
         "id": "auth-middleware",
         "type": "middleware",
         "status": "approved",
         "result": "unanalyzable",
         "reason": "No analyzer available for type 'middleware'"
       }
     ],
     "extraFeatures": [...],
     "drift": {
       "hasDrift": true,
       "missingCount": 1,
       "extraCount": 2
     }
   }
   ```

2. **CLI output formatting**
   - Default: human-readable summary (similar to current stderr output, but cleaner)
   - `--format json` — structured JSON to stdout
   - `--format summary` — one-line summary (for CI badge/status)
   - Color-coded output (green/red/yellow) when terminal supports it
   - Show compliance score prominently

3. **Exit codes**
   - `0` — full compliance
   - `1` — drift detected (missing or extra features)
   - `2` — intent.json validation error
   - `3` — runtime error (file not found, etc.)

4. **Report diff**
   - `npx intent-spec check --diff <previous-report.json>`
   - Shows what changed since last check: newly implemented, newly missing, newly extra
   - Useful in CI to show PR impact on compliance

### Done when
- Report includes compliance score and analyzer attribution
- All three output formats work
- Exit codes are consistent and documented
- Diff mode shows meaningful changes between two reports

---

## Milestone 5: Test Suite

### What
Comprehensive tests so that refactoring and new features don't silently break things.

### Tasks

1. **Test infrastructure**
   - Choose test runner (consider `node:test` built-in to avoid dependencies, or `vitest` for DX)
   - Set up test scripts in package.json
   - CI runs tests on every push

2. **Unit tests — Schema validation**
   - Valid v0.1 file passes
   - Valid v0.2 file passes
   - Missing required fields rejected
   - Unknown feature types accepted with warning
   - Duplicate feature IDs rejected

3. **Unit tests — Express route analyzer**
   - Simple `app.get('/path')` detected
   - `router.post('/path')` detected
   - Parameterized routes (`/users/:id`) matched correctly
   - Multiple routes in one file
   - Routes across multiple files
   - No false positives on comments or string literals containing route-like patterns

4. **Unit tests — Analyzer runner**
   - Features dispatched to correct analyzer
   - Unanalyzable features reported correctly
   - Custom analyzer loaded and executed
   - Missing/present/extra classification correct

5. **Unit tests — Report generation**
   - Compliance score calculated correctly
   - Report format matches schema
   - Diff mode produces correct output

6. **Integration tests**
   - Full `check` command against sample Express apps (multiple fixture projects)
   - `init` command creates valid intent.json
   - `validate` command catches known-bad files
   - Test fixture: app with routes split across multiple files using `express.Router()`
   - Test fixture: app with all routes implemented (0 drift)
   - Test fixture: app with missing routes
   - Test fixture: app with extra undeclared routes

7. **Add test fixtures directory**
   ```
   test/
     fixtures/
       simple-express/        — single file, all routes match
       multi-file-express/    — routes split across files with Router
       missing-routes/        — intent declares routes not in code
       extra-routes/          — code has routes not in intent
       v01-intent/            — v0.1 format backward compatibility
     unit/
       schema.test.js
       express-analyzer.test.js
       analyzer-runner.test.js
       report.test.js
     integration/
       check-command.test.js
       init-command.test.js
       validate-command.test.js
   ```

### Done when
- All unit and integration tests pass
- CI runs tests on every push and blocks on failure
- Test coverage gives confidence to refactor safely
- At least 3 different Express app structures tested as fixtures

---

## Milestone 6: Reconciliation Improvements

### What
Make the AI-assisted propose/apply commands more reliable and safe. This is not the full Phase 3 reconciliation engine — just the improvements needed for Phase 1 to be production-usable.

### Tasks

1. **Close the validation loop**
   - After `apply` writes files, re-run `check` automatically
   - Report whether the applied changes actually resolved the drift
   - If not, report which features are still missing (don't retry automatically — surface the failure)

2. **Structured apply output**
   - `apply` command produces a structured result:
     ```json
     {
       "applied": true,
       "changedFiles": ["app.js"],
       "resolvedFeatures": ["search-users"],
       "remainingDrift": [],
       "complianceBefore": 85.7,
       "complianceAfter": 100.0,
       "tokenUsage": { "input": 1200, "output": 800 }
     }
     ```

3. **Better prompts**
   - Include intent schema context in the prompt (not just missing features)
   - Include the project's config/conventions if available
   - Add system prompt that constrains the AI to only modify allowed files

4. **Dry-run mode**
   - `npx intent-spec apply --dry-run` — shows what would change without writing files
   - Outputs the diff that would be applied

5. **Update CI workflow**
   - Update `.github/workflows/intent-check.yml` to use the new CLI commands
   - Maintain existing behavior (check → apply → PR) but using the new structure

### Done when
- `apply` re-runs `check` after writing files and reports whether drift was resolved
- `--dry-run` flag works
- Token usage is reported
- CI workflow works with the new CLI

---

## Open Questions (To Resolve During Phase 1)

1. **Scope of "http-route" matching**: Should the analyzer try to match response shapes (status codes, content types) or just method+path? Starting with method+path is pragmatic, but response shape matching could catch more drift. **Decision**: Start with method+path only. Response shape validation belongs in Phase 2 behavioral contracts.

2. **Monorepo support**: Should one `intent.json` cover the whole repo, or can there be multiple per subdirectory? **Decision**: Start with single file at repo root. Monorepo support can be added later via config pointing to multiple intent files.

3. **What counts as "extra"**: If a utility route like `GET /debug` exists only in development, should it be flagged? **Decision**: Yes, flag it. Users can either declare it in intent.json with status `draft`, or exclude files via config. The tool should surface everything and let users decide.

4. **Analyzer confidence**: Should analyzers report confidence levels? (e.g., "found a route that looks like it matches but the path is computed dynamically") **Decision**: Not in Phase 1. Binary present/absent is sufficient. Confidence scoring is a Phase 2 concern.

---

## Success Criteria for Phase 1

Phase 1 is complete when:

- [ ] `npx intent-spec check` works on a real Express project with routes across multiple files
- [ ] `npx intent-spec init` scaffolds a valid v0.2 intent file
- [ ] `npx intent-spec validate` catches schema errors with clear messages
- [ ] `npx intent-spec apply` generates code and verifies it resolved the drift
- [ ] Intent schema v0.2 supports `status`, `description`, and forward-declares `middleware`/`constraint` types
- [ ] Custom analyzers can be loaded from user config
- [ ] Test suite covers core logic and runs in CI
- [ ] CI workflow updated to use the new CLI
- [ ] The tool handles edge cases without crashing (empty intent, no source files, invalid JSON, etc.)
