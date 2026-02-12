# Phase 4 — Intelligent Reconciliation

> **Status**: Future — depends on Phases 1-3.
> This plan is intentionally high-level. The reconciliation approach will evolve based on what we learn about AI reliability in Phase 1's apply command.

## Goal

Make the AI reconciliation engine reliable enough to trust in CI pipelines, and auditable enough to satisfy governance requirements.

## Key Areas

### Structured Pipeline
- Replace single-shot LLM call with a multi-step process: analyze → plan → generate → validate → report
- Each step produces a structured artifact that can be inspected independently
- Support multiple LLM providers (Anthropic, OpenAI, local models via config)
- Allow swapping models per step (e.g., cheaper model for planning, better model for code generation)

### Validation Loop
- Phase 1 introduces re-running `check` after apply — Phase 4 makes this robust
- Run existing test suites against proposed changes before creating PR
- Semantic validation: does the generated code actually do what the intent describes, or just match the route signature?
- Retry with adjusted prompt if first attempt fails validation (with a hard limit on retries)

### Audit Trail
- Every reconciliation run produces a log: input report, prompts sent, responses received, validation results, files changed
- Structured JSON format, stored alongside the repo or in a configurable location
- Include token usage, cost, timing, and model information
- Browsable from the dashboard (Phase 5 integration)

### Human-in-the-Loop Modes
- Text proposal (current `propose` — no code changes)
- Draft PR (current CI flow — code changes, human reviews before merge)
- Supervised (show diff, wait for approval before writing)
- Autonomous (auto-merge if all checks pass — Phase 6 feature, requires policy framework)

## Questions to Answer Before Starting
- How often does the current single-shot approach fail to resolve drift? What are the failure modes?
- Is multi-step prompting actually more reliable, or does it just increase cost/latency?
- What audit trail format do enterprise users expect?
- How much does model choice matter for code generation quality?

## Dependencies
- Phase 1 apply command must work reliably enough to have baseline metrics
- Phase 1 report format must support compliance scoring for before/after comparison

## Estimated Scope
Medium. The pipeline restructuring is significant, but much of the audit trail and validation logic builds on Phase 1's foundation.
