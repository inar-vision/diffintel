# Intent-Spec Platform — Roadmap

## Current State Assessment

The project is a **working proof-of-concept** that demonstrates the core idea — declaring intent in a machine-readable file and validating implementation against it. However, it is far from the vision described in VISION.md.

### What Exists Today

| Component | Status | Description |
|-----------|--------|-------------|
| `intent.json` | Minimal | Declares HTTP routes only (id, type, method, path). No behavioral contracts, architectural constraints, or policies. |
| `check-intent.js` | Basic | Regex-based Express route scanner. Detects missing/extra routes. Outputs JSON report. CLI-usable. |
| `propose-fix.js` | Basic | Calls Anthropic API to propose or auto-apply missing route implementations. Single-shot LLM call with basic validation. |
| `intent-board.html` | Functional | Static HTML dashboard. Shows sync status, filters, stats. GitHub API integration for live data and workflow triggering. |
| `.github/workflows/intent-check.yml` | Functional | CI pipeline: runs check, publishes report to gh-pages, auto-generates fix PRs via AI. |
| `app.js` | Sample app | Simple Express CRUD app used as the test target. |

### Gap Analysis vs. Vision

**Layer 1 — Intent as Code**: ~15% complete
- Only supports `http-route` feature type
- No behavioral contracts, architectural constraints, or policies
- No schema versioning or validation
- No open specification documentation
- Not language/framework agnostic

**Layer 2 — Compliance Engine**: ~20% complete
- Only detects Express.js routes via regex
- No support for other frameworks, languages, or feature types
- No pluggable analyzer architecture
- Works as CLI script but not as a proper installable CLI tool
- CI integration exists but is tightly coupled to the sample app

**Layer 3 — Reconciliation Engine**: ~15% complete
- Single LLM call with basic prompt
- No structured reasoning or audit logs
- Validation is shallow (checks route paths exist in output, no semantic validation)
- No multi-step reconciliation or human-in-the-loop approval flow
- No cost/token tracking

**Layer 4 — Hosted Control Plane**: ~5% complete
- Static dashboard exists but is not a hosted platform
- No drift history tracking
- No intent evolution visualization
- No compliance metrics over time
- No policy management
- No merge confidence scoring
- No audit trails
- No multi-repo support

---

## Phase 1 — Solid Foundation (Intent Schema & CLI)

**Goal**: Make the intent specification expressive enough to be useful beyond toy demos, and package the tooling as a proper CLI.

### 1.1 Expand the Intent Schema
- Add `description` field to features (human-readable purpose)
- Add `status` field (`draft` | `approved` | `deprecated`)
- Add `behavioral-contract` feature type (pre/post conditions, expected status codes, response shapes)
- Add `architectural-constraint` type (e.g., "no direct DB access from route handlers", "all routes must use auth middleware")
- Add `policy` type (e.g., "no new dependencies without approval", "all endpoints require authentication")
- Add schema version field with migration support
- Write a JSON Schema for `intent.json` so it can be validated by any tool

### 1.2 Build a Proper CLI
- Package as an installable npm tool (`npx intent-spec check`, `npx intent-spec init`, etc.)
- Commands:
  - `init` — scaffold an `intent.json` in a repo
  - `check` — run compliance validation
  - `report` — generate human-readable or JSON report
  - `propose` — AI-assisted fix proposals (text)
  - `apply` — AI-assisted auto-fix with validation
  - `validate` — validate `intent.json` against the schema
- Configurable via `.intentrc` or `intent.config.json`
- Clean exit codes for CI integration

### 1.3 Make the Compliance Engine Pluggable
- Extract route detection into an "analyzer" abstraction
- Create analyzer interface: `{ name, supports(feature), analyze(files, feature) → result }`
- Built-in analyzers:
  - `express-route` (current regex-based approach, refined)
  - `generic-route` (detect common patterns: Fastify, Koa, Hono, etc.)
- Allow user-defined analyzers via config

### 1.4 Test Suite
- Unit tests for the compliance engine
- Integration tests with sample projects
- Test fixtures for each feature type
- CI runs tests on every push

---

## Phase 2 — Robust Compliance Engine

**Goal**: Make drift detection deterministic, reliable, and useful for real projects.

### 2.1 Multi-Language Support
- Add TypeScript-aware scanning (handle `.ts`, `.tsx`, decorators, type annotations)
- Add Python/FastAPI analyzer
- Add Go/net-http analyzer
- Design analyzer plugin system (community can contribute analyzers)

### 2.2 Behavioral Contract Validation
- For `behavioral-contract` features: generate and run test assertions
- Validate response shapes against declared contracts (status codes, JSON structure)
- Support contract-as-test: generate lightweight test cases from intent declarations
- This remains deterministic — no AI involved

### 2.3 Architectural Constraint Checking
- Static analysis for constraint types (e.g., "all routes in `/api/*` use auth middleware")
- AST-based analysis where regex is insufficient
- Pluggable rules engine for custom constraints

### 2.4 Richer Compliance Reports
- Compliance score (percentage of intent satisfied)
- Per-feature detail: declared vs. actual implementation
- Structured diff format for "what changed since last check"
- Machine-readable report format versioned alongside the schema

---

## Phase 3 — Intelligent Reconciliation

**Goal**: Make the AI reconciliation engine reliable, auditable, and safe.

### 3.1 Structured Reconciliation Pipeline
- Multi-step process: analyze report → plan changes → generate code → validate → present
- Each step produces a structured artifact (not just raw LLM text)
- Support for different LLM providers (Anthropic, OpenAI, local models)
- Configurable model selection and temperature

### 3.2 Validation and Safety
- Re-run compliance check after applying AI-generated changes (close the loop)
- Run existing test suite against proposed changes before creating PR
- Semantic diff: compare before/after compliance reports
- Rollback support: if validation fails, discard changes cleanly

### 3.3 Audit Trail
- Log every reconciliation run: input report, LLM prompt, LLM response, validation result, files changed
- Store as structured JSON (not just console output)
- Include token usage, cost, and model information
- Persist audit logs alongside the repo or in a configurable location

### 3.4 Human-in-the-Loop Modes
- `propose` mode: text explanation only (current)
- `draft` mode: generate code, create draft PR, require human review (current CI flow)
- `supervised` mode: generate code, run validation, present diff for human approval before committing
- `autonomous` mode (future): auto-merge if compliance check passes and tests pass — only within declared policy boundaries

---

## Phase 4 — Dashboard & Observability

**Goal**: Make intent status visible and actionable through a proper web interface.

### 4.1 Board Architecture Migration
- Migrate from single HTML file to a lightweight frontend app (Vite + vanilla JS or lightweight framework)
- Implement the "thin backend" architecture from `future-plans/board-architecture.md` (Option 2)
- Webhook-driven updates instead of polling
- Remove GitHub token from browser (backend holds credentials)

### 4.2 Intent Editing from UI
- Implement the "Edit intent.json via Board UI" flow from `future-plans/intent-editing-from-ui.md` (Option A)
- Add Feature / Edit Feature / Delete Feature forms
- Commit changes to repo via GitHub API
- SHA-based conflict detection

### 4.3 Drift History
- Store compliance reports over time (database or file-based)
- Timeline view: when did each feature become implemented/missing
- Trend line: compliance score over commits

### 4.4 Compliance Metrics
- Dashboard widgets: compliance percentage, drift frequency, mean time to reconciliation
- Per-feature status history
- Alert when compliance drops below threshold

---

## Phase 5 — Hosted Control Plane (Monetization)

**Goal**: Build the commercial layer described in VISION.md Layer 4.

### 5.1 Multi-Repo Support
- Connect multiple repositories to a single dashboard
- Cross-repo intent overview
- Organization-level compliance metrics

### 5.2 Agent Execution Runtime
- Managed environment for running reconciliation agents
- Queue and schedule reconciliation runs
- Resource limits and cost controls
- Sandboxed execution (agent cannot access arbitrary resources)

### 5.3 Policy Management
- Define organization-level policies (e.g., "all repos must have intent.json", "no autonomous merges")
- Policy inheritance: org → team → repo
- Policy enforcement at CI and dashboard level

### 5.4 Merge Confidence Scoring
- Score each AI-generated PR based on: compliance delta, test results, change complexity, historical success rate
- Surface score in dashboard and PR comments
- Configurable thresholds for auto-approval

### 5.5 Authentication & Access Control
- GitHub OAuth / SSO login
- Role-based access: viewer, editor, admin
- Team-based repo assignments
- No token management for end users

### 5.6 Cost & Token Accounting
- Track LLM usage per repo, per reconciliation run
- Budget limits and alerts
- Usage dashboards

---

## Phase 6 — Open Standard & Ecosystem

**Goal**: Establish `intent.json` as an open specification adopted beyond this platform.

### 6.1 Publish the Intent Specification
- Formal specification document (versioned, with changelog)
- JSON Schema published to Schema Store
- Examples for common patterns (REST API, GraphQL, microservices, monolith)
- Contribution guidelines

### 6.2 IDE Integration
- VS Code extension: show intent status inline, highlight undeclared routes
- Language server protocol support for intent-aware linting

### 6.3 Community Analyzers
- Plugin registry for community-contributed analyzers
- Standard analyzer interface and test harness
- Documentation and templates for building analyzers

### 6.4 CI/CD Integrations
- GitHub Action (published to marketplace)
- GitLab CI template
- Bitbucket Pipelines template
- Generic CI integration guide

---

## Priority & Sequencing Summary

| Phase | Focus | Estimated Effort | Dependency |
|-------|-------|-----------------|------------|
| **Phase 1** | Schema + CLI + Pluggable Engine | Foundation — do first | None |
| **Phase 2** | Multi-language, Contracts, Constraints | Core product value | Phase 1 |
| **Phase 3** | Reliable AI Reconciliation + Audit | Differentiator | Phase 1 |
| **Phase 4** | Dashboard + Observability | User experience | Phase 1-2 |
| **Phase 5** | Hosted Platform + Monetization | Business model | Phase 1-4 |
| **Phase 6** | Open Standard + Ecosystem | Market adoption | Phase 1-2 |

Phases 2 and 3 can be worked in parallel. Phase 4 can begin alongside Phase 2-3 for the frontend work. Phases 5 and 6 depend on the core being solid.

---

## Key Risks

1. **Schema design**: Getting the intent schema right is critical. If it's too rigid, adoption suffers. If it's too loose, enforcement is meaningless. Iterate on the schema with real projects before standardizing.

2. **Analyzer accuracy**: Regex-based route detection is fragile. False positives/negatives erode trust. AST-based analysis is more reliable but harder to make cross-language. Consider tree-sitter for multi-language parsing.

3. **AI reliability**: LLM-generated code is probabilistic. The validation layer (Phase 3.2) is essential — never trust AI output without re-running compliance checks and tests.

4. **Scope creep**: The vision is broad. Each phase should ship a usable increment. Resist adding Layer 4 features before Layer 1-2 are solid.

---

## Detailed Plans

Each phase has its own plan document in `plans/`:

- **[Phase 1 — Foundation](plans/phase-1-foundation.md)** — detailed milestones and tasks, ready to execute
- **[Phase 2 — Compliance Engine](plans/phase-2-compliance-engine.md)** — high-level direction, to be detailed after Phase 1
- **[Phase 3 — Reconciliation](plans/phase-3-reconciliation.md)** — high-level direction, to be detailed after Phase 1
- **[Phase 4 — Dashboard](plans/phase-4-dashboard.md)** — high-level direction, depends on Phase 1-2
- **[Phase 5 — Hosted Platform](plans/phase-5-hosted-platform.md)** — deliberately vague, shaped by user feedback
- **[Phase 6 — Open Standard](plans/phase-6-open-standard.md)** — deliberately open-ended, shaped by adoption

---

*This roadmap is a living document. Update it as priorities shift and lessons are learned.*
