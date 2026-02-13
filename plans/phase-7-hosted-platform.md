# Phase 7 — Hosted Platform

> **Status**: Future — do not start until Phases 4-6 are validated with real usage.

## Goal

Managed platform that orchestrates the autonomous intent enforcement loop at scale: multi-repo, team policies, cost management, and operational convenience beyond what the open-source CLI + GitHub Action provides.

## Potential Areas

- **Multi-repo orchestration** — single view of compliance across all projects
- **Agent execution runtime** — managed reconciliation runs (no need to configure API keys per repo)
- **Policy management** — org-level intent constraints that apply to all repos (e.g., "all APIs require auth")
- **Cost & token accounting** — LLM usage tracking, budgets, alerts
- **Merge confidence scoring** — historical success rate for similar fixes
- **Team management** — roles, permissions, notification routing

## What We Need to Learn First

1. Is anyone using the GitHub Action in production?
2. What do teams need that the self-hosted CI flow doesn't provide?
3. What's the right pricing model?
4. Can some of this be done by integrating with existing tools rather than building from scratch?

## Dependencies

- Phases 4-6 stable and adopted
- Real user feedback

## Estimated Scope

Large. This is a full product.
