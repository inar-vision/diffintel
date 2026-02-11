# Phase 2 — Robust Compliance Engine

> **Status**: Future — do not start until Phase 1 is complete and validated on real projects.
> This plan is intentionally high-level. Specifics will be defined based on lessons learned in Phase 1.

## Goal

Make the compliance engine accurate enough to trust on production codebases, and expressive enough to validate more than just route existence.

## Key Areas

### Multi-Language / Multi-Framework Analyzers
- TypeScript-aware scanning (decorators, type-only imports, `.ts`/`.tsx`)
- At least one non-Express analyzer (Fastify, Hono, or Koa — pick based on what real users need)
- Consider tree-sitter for cross-language AST parsing instead of per-language regex
- Python (FastAPI/Flask) and Go analyzers are stretch goals — only if there's demand

### Behavioral Contract Validation
- Extend `http-route` features to declare expected response shapes (status codes, JSON structure)
- Lightweight runtime validation: start the app, hit the route, check the response matches the contract
- Alternatively: static analysis of handler return values (harder but no runtime dependency)
- Keep it deterministic — no AI in the validation loop

### Architectural Constraint Checking
- Implement analyzers for the `constraint` feature type declared in Phase 1's schema
- Example constraints: "all routes under /api require auth middleware", "no direct database calls in route handlers"
- This likely requires AST analysis, not regex
- Start with 2-3 concrete constraint types that are common and useful

### Analyzer Quality
- False positive/negative tracking — if users report wrong results, we need to fix them fast
- Per-analyzer test suites with real-world code samples
- Analyzer performance benchmarks (scanning a 1000-file project should take seconds, not minutes)

## Questions to Answer Before Starting
- Which non-Express framework is most requested?
- Is tree-sitter worth the complexity, or are per-framework regex analyzers good enough?
- Do users want behavioral contracts validated at build time or runtime?
- What are the most common architectural constraints teams actually enforce?

## Dependencies
- Phase 1 analyzer interface must be stable
- Phase 1 schema v0.2 must support the feature types we want to analyze here

## Estimated Scope
Medium-large. Each new analyzer is a self-contained piece of work. Behavioral contracts and architectural constraints are more exploratory and may require schema changes.
