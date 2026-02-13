# Phase 5 — CI Integration

> **Status**: Future — depends on Phase 4 (reliable autonomous loop).

## Goal

Package the autonomous check → apply → verify loop as a proper GitHub Action that any project can install in minutes. Make the CI workflow production-grade: handles all issue types, creates meaningful PRs, and supports fully autonomous mode.

## Context

A barebones workflow exists in `.github/workflows/intent-check.yml`. It works but it's a raw shell script — not reusable by other projects, only handles missing features in PR descriptions, and has no autonomous merge capability. Phase 5 turns this into a polished, distributable CI integration.

## Key Areas

### GitHub Action (`intent-spec/action@v1`)

A composite or JavaScript action wrapping the CLI.

**Inputs:**
- `intent-file` — path to intent.json (default: from `.intentrc.json`)
- `scan-dir` — directory to scan (default: from `.intentrc.json`)
- `api-key` — Anthropic API key (from secrets)
- `auto-apply` — run apply on drift detection (default: `true`)
- `auto-merge` — merge the PR if all checks pass (default: `false`)
- `test-command` — test suite to run after apply (default: from `.intentrc.json`)
- `max-retries` — retry limit for apply (default: `2`)

**Outputs:**
- `compliance-score` — current score
- `drift-detected` — boolean
- `pr-url` — URL of created PR (if any)
- `issues-url` — URL of created issue (if unfixable issues found)
- `result-json` — path to apply-result.json artifact

### PR Creation

When apply succeeds:
- PR title includes issue type summary: "fix: resolve 2 constraint violations and 1 missing route"
- PR body includes per-issue breakdown (features, constraints, contracts)
- PR body includes compliance score change
- Labels by issue type: `intent-missing`, `intent-constraint`, `intent-contract`
- PR is draft by default unless `auto-merge` is enabled

### Issue Creation (Unfixable)

When apply detects unfixable issues (invention needed):
- Create a GitHub issue listing what needs human attention
- Include context: what the constraint requires, what's missing from the codebase
- Label: `intent-needs-human`
- Don't create duplicate issues if one already exists for the same violations

### Autonomous Mode

When `auto-merge: true` and all conditions met:
- Intent check passes after apply
- Test suite passes
- No unfixable issues remain
- → Auto-merge the PR (squash merge)
- This is the endgame: intent.json change triggers code change with zero human intervention

### CI Templates

Stretch goal — equivalents for other CI systems:
- GitLab CI (`.gitlab-ci.yml` template)
- Bitbucket Pipelines

## Files / Artifacts

| Artifact | Purpose |
|---|---|
| `action.yml` | GitHub Action definition |
| `action/index.js` | Action entry point (wraps CLI calls) |
| `action/README.md` | Marketplace documentation |
| `.github/workflows/intent-check.yml` | Updated to use the action itself |

## Verification

1. Action installs and runs on a test repo with constraint violations
2. PR is created with correct labels and description
3. Unfixable issues create GitHub issues
4. `auto-merge: true` merges when all checks pass
5. Action works on a fresh repo with only `.intentrc.json` and `intent.json`

## Dependencies

- Phase 4 (invention detection, retry, test gate) — the action wraps these capabilities
- npm package published (or action bundles the CLI)

## Estimated Scope

Medium. Most logic already exists in the CLI. The work is packaging, PR/issue formatting, and the auto-merge flow.
