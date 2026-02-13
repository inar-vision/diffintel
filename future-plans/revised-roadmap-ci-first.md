# Revised Roadmap: CI-First / Autonomous-First

## The Realization

The original phase plan was designed around a developer watching output. But the core value proposition of intent-spec is different: **intent.json is the contract between humans and AI coders, enforced automatically**. The human writes the intent, the AI writes the code, and CI ensures they stay aligned — without human intervention in the loop.

The CLI isn't a developer tool that happens to run in CI. It's a CI engine that happens to also work locally for debugging.

## Where We Are Now

After Phase 3:
- `check` produces structured reports with route presence, contract violations, constraint violations
- `apply` can fix all three issue types via LLM
- A barebones GitHub Actions workflow exists (`.github/workflows/intent-check.yml`) that runs check → apply → create PR
- Exit codes, JSON output, and `apply-result.json` are already machine-readable

What's missing for a reliable autonomous loop:
- The workflow only handles missing features in its PR description (not constraints/contracts)
- No retry logic when apply fails
- No "invention detection" — apply will generate stubs when it should refuse
- No way to run the user's test suite as a gate before creating the PR
- Single-shot LLM call — no structured pipeline

## Revised Phase Plan

### Phase 3 (current) — Wrap Up
Finish M5 (done). The CLI now handles all three issue types end-to-end.

### Phase 4 — Reliable Autonomous Loop
**Focus: Make check → apply → verify trustworthy enough to run unattended.**

This is the critical phase. Everything after it depends on the loop being reliable.

Key work:
1. **Invention detection** — before calling the LLM, scan source context for the building blocks needed (middleware, imports, patterns). Separate issues into "can auto-fix" and "needs human input". Only send fixable issues to the LLM. Report unfixable issues clearly in apply-result.json.
2. **Retry with feedback** — if post-apply check still shows drift, feed the failure back to the LLM and retry (hard limit: 2 retries). Each retry includes the previous attempt's error.
3. **Test suite gate** — `apply` gets a `--test-command` option (or reads from `.intentrc.json`). After writing files, run the test suite. If tests fail, revert and report failure. In CI, this prevents broken PRs.
4. **Structured apply-result.json** — enrich with per-issue resolution status, unfixable issues, retry count, and enough detail for CI to make decisions without parsing text.

The CLI does all of this. CI just calls it.

### Phase 5 — CI Integration (Focused)
**Focus: Ship a proper GitHub Action and make the workflow production-grade.**

The barebones workflow exists but it's a raw shell script in a YAML file. This phase turns it into something other projects can adopt.

Key work:
1. **GitHub Action** — `intent-spec/action@v1` that wraps check + apply + PR creation. Inputs: intent file, scan dir, test command, API key, auto-apply (bool), max retries. Outputs: compliance score, drift detected, PR URL.
2. **Updated workflow** — the action handles constraints/contracts in PR descriptions, labels by issue type, includes apply-result.json as PR comment or artifact.
3. **Autonomous mode** — when all checks pass (intent check + test suite), auto-merge the PR. This is the endgame: intent changes trigger code changes with zero human intervention. Gated behind explicit opt-in (`auto-merge: true`).
4. **Failure reporting** — when apply can't fix everything, the action creates an issue (not a PR) listing what needs human attention. This is the "invention needed" case from Phase 4.
5. **CI templates** — GitLab CI and Bitbucket Pipelines equivalents (stretch goal).

### Phase 6 — Dashboard & Observability
**Focus: Compliance history and debugging, not daily interaction.**

Moved after CI because in the autonomous model, the dashboard is for *monitoring*, not for driving actions. It answers: "is intent enforcement working across my repos?" and "what went wrong when it didn't?"

Key work:
- Compliance score over time (per repo, per branch)
- Apply success/failure rate
- "Invention needed" frequency — how often does the loop punt to humans?
- Per-feature history: declared → implemented → regressed → auto-fixed

### Phase 7 — Hosted Platform
Same as before but reframed: the hosted offering manages the autonomous loop at scale across many repos, with policy controls, cost budgets, and multi-repo orchestration.

### Phase 8 — Open Standard
Publish the spec, GitHub Action on marketplace, Schema Store entry. This makes more sense after the CI story is solid, because CI integration is the primary adoption vector.

## Where the CLI Fits

The CLI is the engine for everything:

| Context | What runs | Who's watching |
|---------|-----------|----------------|
| Local dev | `intent-spec check` | Developer debugging |
| CI gate | `intent-spec check --out report.json` | Nobody — exit code decides pass/fail |
| CI auto-fix | `intent-spec apply report.json --test-command "npm test"` | Nobody — apply-result.json drives next step |
| GitHub Action | Wraps the CLI calls above | Nobody — action creates PR or issue |

The CLI doesn't need separate "human" and "CI" modes. It already works for both because:
- Exit codes are meaningful (0 = ok, 1 = drift, 2 = apply failed)
- All output is structured JSON when needed (`--format json`, `--out`, `apply-result.json`)
- Human-readable text goes to stderr, machine-readable data to stdout/files

The only new CLI feature needed is `--test-command` for the post-apply validation gate.

## What Changes From the Original Plan

| Original | Revised | Reason |
|----------|---------|--------|
| Phase 4: Human-in-the-loop modes | Phase 4: Reliable autonomous loop | Autonomous is the default, not the exception |
| Phase 5: Dashboard | Phase 5: CI integration (focused) | CI is the primary interface, not a web UI |
| Phase 6: Hosted platform | Phase 6: Dashboard (monitoring) | Dashboard serves the autonomous loop, not replaces it |
| Dashboard drives actions | Dashboard monitors actions | Actions are driven by CI, not humans clicking buttons |
| "Supervised" as default mode | "Autonomous" as default mode | The whole point is removing humans from the loop |
