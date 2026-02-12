# Phase 7 — Open Standard & Ecosystem

> **Status**: Future — can start partially alongside Phase 3 (publishing the spec), but ecosystem work depends on adoption.
> This plan is deliberately open-ended. An ecosystem only works if people want it.

## Goal

Establish the intent specification as a recognized standard that others adopt and build tooling around, independent of this platform.

## Potential Areas

- Formal specification document (versioned, with changelog and rationale)
- JSON Schema published to Schema Store (IDE autocompletion for intent.json)
- VS Code extension (inline intent status, undeclared route warnings)
- Community analyzer plugin registry
- Published GitHub Action on the marketplace
- CI templates for GitLab, Bitbucket, etc.
- Example intent files for common patterns (REST, GraphQL, microservices)

## What We Need to Learn First

1. **Is the schema stable enough to standardize?** Don't publish a v1.0 spec if we're still changing it every week.
2. **Do people want to write analyzers?** If nobody contributes plugins, a registry is wasted effort.
3. **Which IDE integration matters most?** VS Code is likely first, but maybe the value is in the CI integration, not the editor.

## Dependencies
- Phase 1 schema must be stable
- Phase 2-3 analyzer interfaces must be proven
- Meaningful adoption of the open-source tool

## Estimated Scope
Varies widely. Publishing a spec is small. Building an IDE extension is medium. Growing an ecosystem is ongoing.
