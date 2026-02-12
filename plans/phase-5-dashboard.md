# Phase 5 — Dashboard & Observability

> **Status**: Future — depends on Phases 1-3 for meaningful data to display.
> This plan is intentionally high-level. UI direction will depend on how the tool is actually used.

## Goal

Make intent compliance status visible and actionable through a proper web interface, replacing the current single-file HTML board.

## Key Areas

### Board Architecture Migration
- Move from monolithic `intent-board.html` to a lightweight frontend (Vite + vanilla JS, or a minimal framework)
- Implement thin backend (Option 2 from `future-plans/board-architecture.md`) when token-in-browser becomes a problem
- Webhook-driven updates instead of manual refresh/polling

### Intent Editing from UI
- Based on `future-plans/intent-editing-from-ui.md` Option A
- Add/edit/delete features via forms, commits to repo via GitHub API
- SHA-based conflict detection
- Respect the `status` field: new features start as `draft`

### Drift History & Metrics
- Store compliance reports over time
- Timeline view: compliance score per commit
- Per-feature history: when it was declared, when it was implemented, when it regressed
- Alerting: notify when compliance drops below a threshold

### Data Visualization
- Compliance trend line
- Feature status breakdown (pie/bar chart)
- Drift frequency over time
- Mean time to reconciliation

## Questions to Answer Before Starting
- Is the thin backend worth the infrastructure cost, or is GitHub API from the browser sufficient for most users?
- What metrics do teams actually look at? Don't build dashboards nobody reads.
- Is intent editing from the UI actually needed, or do developers prefer editing JSON in their IDE?
- Should the dashboard be a standalone app or embedded in GitHub (as a GitHub App)?

## Dependencies
- Phase 1 report format (v0.2) for structured data
- Phase 3 for richer feature types to display
- Phase 4 audit trails for reconciliation history

## Estimated Scope
Medium-large. The frontend migration is moderate work. The backend and history tracking are the heavier parts.
