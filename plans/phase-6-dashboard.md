# Phase 6 — Dashboard & Observability

> **Status**: Future — depends on Phase 5 (CI integration shipping and generating data).

## Goal

Provide visibility into how the autonomous intent enforcement loop is performing across repos and over time. The dashboard is a monitoring tool, not a control surface — actions are driven by CI, the dashboard shows whether it's working.

## Key Questions It Answers

- Is intent enforcement working across my repos?
- How often does the loop fix drift autonomously vs. punt to humans?
- Which constraints/contracts cause the most violations?
- What's the compliance trend over time?

## Key Areas

### Compliance History
- Score over time per repo, per branch
- Triggered by CI runs pushing report artifacts
- Visual: timeline chart showing compliance score per commit/PR

### Apply Success Rate
- How often does apply fully resolve drift?
- Retry rate: how many attempts does it typically need?
- Invention-needed rate: how often does it create issues instead of PRs?
- Breakdown by issue type (missing features vs constraints vs contracts)

### Per-Feature Tracking
- Feature lifecycle: declared → implemented → regressed → auto-fixed
- Which features regress most often?
- Mean time to reconciliation (from drift detected to PR merged)

### Architecture
- Lightweight frontend reading from stored report artifacts
- Data source: GitHub Actions artifacts, gh-pages JSON, or a simple store
- No backend needed initially — static site reading JSON reports
- Can evolve into a hosted service in Phase 7

## Dependencies

- Phase 5 CI integration producing consistent apply-result.json artifacts
- Enough real usage to have meaningful data

## Estimated Scope

Medium. The frontend is moderate. The value depends on having real CI data flowing in.
