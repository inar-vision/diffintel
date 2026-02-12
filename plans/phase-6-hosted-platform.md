# Phase 6 — Hosted Control Plane

> **Status**: Future — this is the monetization layer. Do not start until Phases 1-4 are validated.
> This plan is deliberately vague. The commercial offering should be shaped by real user feedback, not speculation.

## Goal

Build a managed platform that provides value beyond what the open-source CLI offers: multi-repo orchestration, team management, policy governance, and operational convenience.

## Potential Areas

- Multi-repo support (single dashboard for all projects)
- Agent execution runtime (managed reconciliation runs)
- Policy management (org → team → repo inheritance)
- Merge confidence scoring (how trustworthy is this AI-generated PR?)
- Authentication & access control (GitHub OAuth, roles, teams)
- Cost & token accounting (LLM usage tracking and budgets)
- Audit trails (enterprise-grade logging and compliance)

## What We Need to Learn First

Before building any of this:

1. **Is anyone willing to pay for intent compliance?** Validate demand with Phase 1-3 open-source adoption.
2. **What do teams actually need hosted?** Maybe they just want the CI integration and a better dashboard. Maybe they want full agent orchestration. Talk to users.
3. **What's the right pricing model?** Per-repo? Per-seat? Per-reconciliation-run? Usage-based?
4. **Build vs. buy**: Can some of this be done by integrating with existing tools (GitHub, Linear, etc.) rather than building from scratch?

## Dependencies
- Phases 1-5 must be stable and adopted
- Real user feedback from open-source usage

## Estimated Scope
Large. This is a full product, not a feature.
