# Architectural Constraints

Constraints are cross-cutting rules that validate properties across multiple routes and files. Unlike **contracts** (which check a single route's properties), constraints enforce architectural patterns across your entire application.

## Constraints vs. Contracts

| | Contracts | Constraints |
|---|---|---|
| **Scope** | Single route | Multiple routes/files |
| **Defined on** | `contract` field on an `http-route` feature | Separate `constraint` feature |
| **Example** | "GET /admin requires auth" | "All /api/* routes require auth" |
| **Validation** | During feature matching | After feature matching |

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

## Drift Detection

Constraint failures contribute to drift (`drift.hasDrift` will be `true`), but they do **not** affect the compliance score (which measures declared features being present in code).

The report includes:
- `summary.constraintsChecked` / `constraintsPassed` / `constraintsFailed`
- `constraints.results[]` — detailed results per constraint
- `drift.constraintFailedCount`
