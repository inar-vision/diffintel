# Development Notes

Known issues, workarounds, and things to keep in mind.

---

## Self-scanning false positives

**Status:** Workaround in place
**Affected file:** `src/analyzers/express-route.js`

The Express route analyzer uses regex patterns to detect route registrations
in source files. Because this tool lives in the same repo as the sample app
it analyzes, the analyzer's own source code gets scanned too.

If comments or string literals in the analyzer file contain code-like
examples (e.g. `app.get('/path')` or `router.route('/users').get()`), the
regex will match them and report false "extra" routes from the analyzer
file itself.

**Current workaround:** Comments in `express-route.js` are written to
avoid patterns that look like actual route registrations. There is a
caution comment at the top of the file as a reminder. This includes
"helpful" examples in comments — even something like
`e.g. app.get(…)` will be matched by the regex. Yes, this has
already bitten us twice in the same session.

**Proper fix options (for later):**
- Exclude the tool's own `src/` directory when scanning the host project.
  This is tricky because users' projects may also have a `src/` directory.
- Use a marker comment (e.g. `// @intent-ignore-file`) to opt files out
  of scanning.
- Move the sample app into a separate `example/` directory so the tool
  source and the scanned source don't overlap.

---

## Deprecated checker.js

**File:** `src/core/checker.js`

The original monolithic intent checker was replaced by the pluggable
analyzer system in Milestone 3 (`src/analyzers/`). The old code is
commented out but kept as a reference for the matching algorithm.
`normalizePath()` is still exported as it may be useful elsewhere.

---
