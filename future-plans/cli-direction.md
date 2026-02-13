# CLI Direction: Authoring Tool vs CI Engine

## The Question

The CLI currently exposes the same commands that CI runs: `check`, `apply`, `propose`. Locally, these have been useful for developing and testing intent-spec itself. But for actual users of the system, what's the point of running them manually? The whole value proposition is that enforcement happens automatically in CI.

## Two Roles for the CLI

### 1. CI Plumbing (keep, don't grow)

Commands that CI calls: `check`, `apply`. These stay in the CLI because the GitHub Action wraps them. They're plumbing — like `git hash-object` or `git update-index`. They work, they're stable, they don't need to be the primary user experience.

No reason to remove them (they're useful for debugging and CI calls them), but also no reason to invest heavily in their local UX.

### 2. Intent Authoring & Inspection (the real CLI direction)

The human's job in this system is **declaring intent**. The AI writes code, CI enforces compliance, but someone has to write and maintain intent.json. That's where the CLI should help.

Potential commands:

#### `intent-spec add`
Add a feature from natural language or shorthand.
```
intent-spec add "GET /users — list all users"
intent-spec add "POST /auth/login — authenticate user, return JWT"
intent-spec add --constraint "all /api/* routes require auth middleware"
```
Parses the description, generates the intent.json entry, appends it with status `draft`.

#### `intent-spec status`
Quick compliance summary, like `git status`. Shows what's in sync, what's drifting, what's draft.
```
$ intent-spec status
5 features declared, 4 in sync
1 constraint failing: api-routes-require-auth (5 violations)
2 draft features not yet enforced
```
This is essentially `check` but with output designed for a human glancing at it, not for CI parsing.

#### `intent-spec why <feature-id>`
Explain why a specific feature or constraint is failing. Useful when CI reports drift and the developer wants to understand it before fixing intent.json or the code.
```
$ intent-spec why api-routes-require-auth
Constraint: routes-require-middleware
Rule: all /api/* routes must use 'authenticate' middleware
5 routes missing middleware:
  GET /api/products (index.js:12)
  POST /api/products (index.js:16)
  ...
```

#### `intent-spec diff`
What changed since the last CI report. Helps the developer understand what their current changes will trigger in CI.
```
$ intent-spec diff
Compliance: 100% -> 80%
Newly missing: get-admin-panel (GET /admin)
New constraint violation: api-auth (2 routes)
```

#### `intent-spec edit <feature-id>`
Modify an existing feature interactively or via flags.
```
intent-spec edit get-users --add-contract "auth: required"
intent-spec edit get-users --status deprecated
```

## What This Means for Development

- Phase 4 (autonomous loop) focuses on the CI plumbing: making `check` → `apply` reliable.
- After Phase 5 (CI integration), the CLI investment shifts to authoring commands.
- Authoring commands don't need to be a dedicated phase — they can be added incrementally as the system matures and we understand what users actually need.
- `init` already exists as a basic authoring command. The new commands extend that direction.

## The Mental Model

```
Human writes intent  ──>  CI enforces intent  ──>  AI fixes code
    (CLI helps here)         (GitHub Action)         (apply command)
```

The CLI serves the left side. CI serves the middle. The LLM serves the right side. Each has its own interface and UX needs.
