# AI Invention Guardrails & Interactive Clarification

## Problem

When `apply` encounters a constraint or contract violation that references something not present in the codebase (e.g., "add `authenticate` middleware" when no auth middleware exists), the LLM invents placeholder code. This is unpredictable and often wrong — a stub `next()` middleware isn't a real fix.

The root issue: intent-spec says **what** should exist, not **how** to implement it. When the codebase has patterns to follow, apply works well. When it doesn't, the LLM guesses.

## Approach 1: Detect and Refuse (Near-term)

Before calling the LLM, analyze whether the codebase has the necessary building blocks. If not, refuse to apply and tell the user what's missing.

**Example:**
```
$ intent-spec apply report.json

Cannot apply 2 issues automatically:

  - Constraint 'api-routes-require-auth': no 'authenticate' middleware found
    in codebase. Define it first, then re-run.
  - Contract violation on GET /admin: auth required but no auth pattern exists.

1 issue applied successfully:
  - Added missing route POST /users (followed pattern from GET /users)
```

**Pros:** Simple, honest, predictable. Apply stays a "follow existing patterns" tool.
**Cons:** User has to do more manual work upfront.

**Implementation idea:** Before calling the LLM, scan source context for references to the middleware/patterns mentioned in constraints. If not found, separate those issues into a "cannot auto-fix" bucket and report them. Only send fixable issues to the LLM.

## Approach 2: Interactive Clarification (Medium-term)

Two-phase apply: the LLM first returns structured questions, the CLI presents choices, then generates code based on answers.

**Example:**
```
$ intent-spec apply report.json

Clarification needed before applying:

  1. No 'authenticate' middleware found. How should auth work?
     a) JWT bearer token (express-jwt)
     b) Session-based (express-session)
     c) API key in header
     d) Custom (describe)

  Select [a-d]: b

Applying with your choices...
Changed files: middleware/auth.js, index.js
```

**Pros:** Handles greenfield cases. User stays in control of design decisions.
**Cons:** More complex UX. Requires structured LLM output (question schema), conversation loop, and good prompt engineering to generate relevant options.

**Implementation idea:**
- New `--interactive` flag on apply (or make it default when invention is detected)
- First LLM call with a "clarification prompt" that returns JSON questions
- CLI renders questions, collects answers
- Second LLM call with answers included in context
- Could also support `--answers answers.json` for CI/non-interactive use

## Approach 3: Richer Intent Specs (Complementary)

Let the intent spec carry implementation hints — not code, but guidance:

```json
{
  "id": "api-auth-required",
  "type": "constraint",
  "rule": "routes-require-middleware",
  "middleware": "authenticate",
  "hints": {
    "package": "express-jwt",
    "strategy": "Bearer token from Authorization header",
    "reference": "See middleware/auth.js for pattern"
  }
}
```

**Pros:** Shifts invention to intent-authoring time where the human is thinking about design. Works with both approach 1 and 2.
**Cons:** Makes intent files more verbose. Need to decide what's "intent" vs "implementation detail."

## Recommended Progression

1. **Now:** Approach 1 — detect missing building blocks, refuse gracefully, report what the user needs to implement manually. This keeps apply predictable and trustworthy.

2. **Next:** Approach 3 — add optional `hints` field to intent features. This gives the LLM better context without requiring interaction.

3. **Later:** Approach 2 — interactive clarification for cases where the user wants AI help with design decisions, not just pattern-following.

## Open Questions

- Should `propose` also detect invention-needed cases and flag them differently from pattern-following fixes?
- Could we use the LLM to *suggest* intent spec improvements (e.g., "your constraint references middleware X but it doesn't exist — consider adding a hint")?
- How does this interact with the universal analyzer goal? Non-Express codebases will have even less pattern context.
