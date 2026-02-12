# Development Notes

Known issues, workarounds, and things to keep in mind.

---

## Self-scanning false positives (resolved)

**Status:** Resolved in Phase 2 (M2)

The Express route analyzer originally used regex patterns to detect route
registrations. This caused false positives when the analyzer's own source
code or comments contained route-like patterns (e.g. `app.get('/path')`).

This was resolved by replacing the regex-based analyzer with AST-based
analysis using tree-sitter. The AST parser only matches actual code
constructs — strings and comments in source files are never matched as
route registrations.

The legacy regex analyzer is still present at
`src/analyzers/express-route-regex.ts` for reference but is no longer
registered or used.

---

## Default exclude directories

The default scan excludes `node_modules`, `.git`, and `test`. The `test`
exclusion was added in M5/M6 because test fixtures and unit tests contain
route-like patterns (e.g. `app.get("/users")` in test strings) that
produce false positives. This is a reasonable default — test code is not
production routes. Users can override via `.intentrc.json` if needed.

---
