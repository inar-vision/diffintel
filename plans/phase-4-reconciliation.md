# Phase 4 — Reliable Autonomous Loop

> **Status**: Next — depends on Phase 3 (complete).

## Goal

Make the check → apply → verify cycle trustworthy enough to run unattended in CI. Today the loop works end-to-end but it's fragile: the LLM can invent code when it lacks context, there's no retry on failure, and there's no way to gate on the project's test suite.

## Context

Phase 3 gave us propose/apply for all three issue types (missing features, constraint violations, contract violations). The barebones CI workflow in `.github/workflows/intent-check.yml` already runs check → apply → PR. Phase 4 hardens this into something you'd trust on a real project.

## Milestones

### M1: Invention Detection

Before sending issues to the LLM, analyze whether the codebase has the building blocks needed to fix them.

- For constraint violations referencing middleware (e.g., `authenticate`): scan source files for a definition or import of that middleware. If not found, classify the issue as "needs human input".
- For contract violations: check if the required pattern exists elsewhere in the codebase (e.g., another route already uses auth middleware).
- Separate issues into two buckets: **auto-fixable** (LLM has patterns to follow) and **unfixable** (LLM would have to invent).
- Only send auto-fixable issues to the LLM.
- Report unfixable issues clearly in apply-result.json with a `reason` field.
- CLI output: "Applied fixes for 3 issues. 1 issue requires manual implementation: no 'authenticate' middleware found in codebase."

### M2: Retry with Feedback

When post-apply check still shows drift, retry with the failure context.

- After apply, run check. If issues remain that were targeted, construct a retry prompt that includes: the previous attempt's code, the specific check failures, and guidance on what went wrong.
- Hard limit: 2 retries (3 total attempts). Configurable via `.intentrc.json`.
- Each retry narrows scope to only the still-failing issues.
- Track retry count and per-attempt results in apply-result.json.
- If all retries exhausted, report partial success: "Fixed 4/5 issues. 1 issue failed after 3 attempts."

### M3: Test Suite Gate

After writing files, run the project's test suite before declaring success.

- New option: `--test-command <cmd>` (also configurable in `.intentrc.json` as `testCommand`).
- After apply writes files: run the test command. If it fails, revert all written files to their pre-apply state and report failure.
- In retry mode: test suite failure counts as a failed attempt, triggers retry with test output in the feedback prompt.
- When no test command is configured, behave as today (skip test gate).
- apply-result.json includes `testsPassed: true|false|null` (null = no test command configured).

### M4: Enriched apply-result.json

Make the result file a complete machine-readable record of what happened.

```json
{
  "applied": true,
  "attempts": 1,
  "maxAttempts": 3,
  "changedFiles": ["index.js"],
  "issues": {
    "targeted": 5,
    "resolved": 4,
    "unfixable": 1,
    "remaining": 0
  },
  "resolvedFeatures": ["get-users"],
  "resolvedConstraints": ["api-auth"],
  "resolvedContracts": ["admin-page"],
  "unfixableIssues": [
    { "type": "constraint", "id": "api-auth-check", "reason": "no 'verifyToken' middleware found in codebase" }
  ],
  "remainingIssues": [],
  "testsPassed": true,
  "complianceBefore": 80,
  "complianceAfter": 100,
  "tokenUsage": { "input": 2400, "output": 1200 }
}
```

## Files Likely Affected

| File | Change |
|---|---|
| `src/reconcile/reconciler.ts` | Invention detection, retry loop, test gate |
| `src/reconcile/prompt-builder.ts` | Retry prompt with failure feedback |
| `src/commands/apply.ts` | Test command option, enriched result |
| `src/config.ts` | `testCommand` and `maxRetries` config fields |
| `src/types.ts` | Updated Config interface |

## Verification

1. Type checks and all tests pass
2. `apply` with a fixture where middleware doesn't exist → reports unfixable, doesn't generate stub
3. `apply` with `--test-command "npm test"` → reverts if tests fail
4. `apply` with a fixture that fails first attempt → retries and succeeds on second attempt
5. apply-result.json contains all fields for CI consumption

## Dependencies

- Phase 3 complete (all issue types in propose/apply)

## Estimated Scope

Medium. Invention detection is the most nuanced part. Retry and test gate are mechanical.
