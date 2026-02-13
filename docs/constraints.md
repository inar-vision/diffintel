# Architectural Constraints

Constraints are cross-cutting rules that validate properties across multiple routes and files. Unlike **contracts** (which check a single route's properties), constraints enforce architectural patterns across your entire application.

## Constraints vs. Contracts

| | Contracts | Constraints |
|---|---|---|
| **Scope** | Single route | Multiple routes/files |
| **Defined on** | `contract` field on an `http-route` feature | Separate `constraint` feature |
| **Example** | "GET /admin requires auth" | "All /api/* routes require auth" |
| **Validation** | During feature matching | After feature matching |
| **Report location** | `feature.contractViolations[]` | `constraints.results[]` |
| **Affects compliance score** | No (only drift) | No (only drift) |

## How Constraints Fit the Architecture

The check pipeline runs in this order:

1. **Analyzers** scan source files and find implementations (routes, middleware, etc.)
2. **Feature matching** compares intent features against implementations (present/missing)
3. **Contract checking** validates per-route behavioral properties (auth middleware, etc.)
4. **Constraint validation** runs cross-cutting rules against ALL implementations and source files
5. **Report building** aggregates everything into the final report

Constraints run in step 4 as a separate validation pass. They receive the full list of implementations and source files, not individual features. This is why they have their own engine (`src/constraints/`) rather than being another analyzer — the `Analyzer` interface operates on individual features, while constraints need the global view.

## Defining Constraints

Add constraint features to your `intent.json`:

```json
{
  "id": "api-auth-required",
  "type": "constraint",
  "description": "All API routes require authentication",
  "rule": "routes-require-middleware",
  "scope": "/api/*",
  "middleware": "authenticate"
}
```

Required fields:
- `id` — unique identifier
- `type` — must be `"constraint"`
- `rule` — name of the built-in rule to apply
- `scope` — which routes/files the rule applies to

Optional:
- `status` — `"draft"` (skipped during checks), `"approved"` (default), `"deprecated"`
- `description` — human-readable explanation
- Additional fields depending on the rule (e.g., `middleware`, `forbidden`)

## Scope Syntax

| Pattern | Meaning |
|---|---|
| `*` | All routes |
| `/api/*` | Routes starting with `/api/` |
| `/health` | Exact match |
| `route-handlers` | All files containing route handlers |

## Built-in Rules

### `routes-require-middleware`

Checks that all HTTP routes matching the scope have specific middleware applied.

**Parameters:**
- `scope` — route path pattern
- `middleware` — string or array of middleware names that must be present

```json
{
  "id": "api-auth",
  "type": "constraint",
  "rule": "routes-require-middleware",
  "scope": "/api/*",
  "middleware": ["authenticate", "rateLimit"]
}
```

### `no-direct-import`

Checks that files in scope do not import forbidden modules directly. Useful for enforcing layered architecture (e.g., route handlers should not import database drivers directly).

**Parameters:**
- `scope` — `"route-handlers"` or path pattern
- `forbidden` — array of module names that must not be imported

```json
{
  "id": "no-db-in-routes",
  "type": "constraint",
  "rule": "no-direct-import",
  "scope": "route-handlers",
  "forbidden": ["pg", "mysql", "mongodb"]
}
```

### `async-error-handling`

Checks that async route handler functions contain try/catch error handling.

**Parameters:**
- `scope` — `"route-handlers"` or path pattern

```json
{
  "id": "async-handlers-guarded",
  "type": "constraint",
  "rule": "async-error-handling",
  "scope": "route-handlers"
}
```

## Draft Constraints

Set `"status": "draft"` to define a constraint without enforcing it. Draft constraints are skipped during checks and don't affect drift detection. The `init` command suggests common constraints as drafts.

## Middleware Name Matching

The `routes-require-middleware` rule matches middleware by **exact variable name** as it appears in source code. For example, if your constraint declares `"middleware": "authenticate"`, the code must use a variable literally named `authenticate`:

```js
// Matches — variable name is "authenticate"
app.get("/api/users", authenticate, handler);

// Does NOT match — different variable name
const auth = require("./authenticate");
app.get("/api/users", auth, handler);
```

This is a deliberate design choice for determinism. The analyzer extracts middleware identifiers from the AST call arguments between the path string and the final handler function.

To configure which variable names count as auth middleware for **contract** checking (the per-route `contract.auth` field), use `.intentrc.json`:

```json
{
  "contracts": {
    "authMiddleware": ["auth", "authenticate", "requireAuth"]
  }
}
```

Note: This config applies to contracts only. Constraints use the `middleware` field from the constraint definition itself.

## Drift Detection

Constraint failures contribute to drift (`drift.hasDrift` will be `true`), but they do **not** affect the compliance score (which measures declared features being present in code). This means a project can be 100% compliant on features but still have drift due to constraint violations.

## Report Structure

When constraints are checked, the JSON report includes:

```json
{
  "summary": {
    "constraintsChecked": 2,
    "constraintsPassed": 1,
    "constraintsFailed": 1
  },
  "constraints": {
    "results": [
      {
        "featureId": "api-auth-required",
        "rule": "routes-require-middleware",
        "status": "passed",
        "violations": []
      },
      {
        "featureId": "async-handlers-guarded",
        "rule": "async-error-handling",
        "status": "failed",
        "violations": [
          {
            "constraint": "async-handlers-guarded",
            "rule": "async-error-handling",
            "message": "Async route handler at routes/api.js:15 lacks try/catch error handling",
            "file": "routes/api.js",
            "line": 15,
            "expected": "try/catch wrapper",
            "actual": "unguarded async handler"
          }
        ]
      }
    ]
  },
  "drift": {
    "hasDrift": true,
    "constraintFailedCount": 1
  }
}
```

The `constraints` field is only present when at least one constraint is checked.

## Init Command Suggestions

When `intent-spec init` discovers routes, it now suggests common constraints as drafts:

- If `/api/*` routes are found → suggests `routes-require-middleware` for API auth
- Always suggests `async-error-handling` for route handlers

These are added with `"status": "draft"` so they don't fail checks until you review and approve them.

## Known Limitations

- **`no-direct-import`** matches module names literally — `"pg"` catches `require("pg")` and `require("pg/native")` but not `require("./db")` where `./db` internally imports `pg`.
- **`async-error-handling`** only checks for a top-level `try` statement in the handler body. It doesn't detect error-handling middleware patterns (like `express-async-errors`) or wrapper functions that provide implicit error catching.
- **Scope matching** is prefix-based, not full glob — `/api/*` matches any route starting with `/api/` but more complex patterns like `/api/v*/users` are not supported.
- **`propose` and `apply` commands** do not yet handle constraint violations. They currently only fix missing features. Constraint-aware reconciliation is planned for Phase 3 M5.

## Implementation Files

| File | Purpose |
|---|---|
| `src/constraints/index.ts` | Constraint engine — rule registry and `validateConstraints()` |
| `src/constraints/scope.ts` | Scope pattern matching (`matchesScope`, `resolveFiles`) |
| `src/constraints/rules/routes-require-middleware.ts` | Middleware presence rule |
| `src/constraints/rules/no-direct-import.ts` | Forbidden import rule (AST-based) |
| `src/constraints/rules/async-error-handling.ts` | Async handler try/catch rule (AST-based) |
