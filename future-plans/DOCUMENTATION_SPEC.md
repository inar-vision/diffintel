# Machine-Readable Documentation Specification

Version: v0.1 (Draft)

## 1. Purpose

This document defines how structured, machine-readable documentation must be built and maintained for the Intent Governance System.

The documentation system exists to:

* Provide a single source of truth for schemas and system behavior
* Enable deterministic validation via JSON Schema
* Allow AI agents to correctly interpret system rules
* Prevent drift between prose documentation and enforcement logic
* Support long-term versioned governance

This documentation layer is part of the product architecture — not marketing material.

---

## 2. Documentation Architecture

The documentation system must consist of three synchronized layers:

### 2.1 Authoritative Schema Layer (Primary Source of Truth)

Location: `/spec/`

Contains:

* `intent.schema.json`
* `intent.extensions.schema.json`
* `validation.schema.json` (if applicable)

Requirements:

* Must follow JSON Schema standard
* Must be fully machine-readable
* Must be versioned using semantic versioning
* Must define:

  * Field types
  * Required properties
  * Allowed values (enums)
  * Structural constraints
* Must not contain descriptive prose beyond schema metadata

This layer is authoritative.
All tooling must validate against this schema.

---

### 2.2 Generated Human Documentation Layer

Location: `/docs/`

Contains:

* `intent-spec.md`
* `enforcement-model.md`
* `versioning-policy.md`

Requirements:

* Must reference schema fields directly
* Must not redefine constraints manually
* Should include:

  * Field explanations
  * Minimal examples
  * Full examples
  * Edge cases
* Must clearly state schema version compatibility

This layer explains the schema but does not override it.

---

### 2.3 AI-Optimized Reference Section

The documentation must include a structured section explicitly designed for AI agents.

This section should:

* Summarize key rules in deterministic language
* Avoid ambiguity
* Explicitly state:

  * Required behavior
  * Forbidden behavior
  * Validation expectations
* Provide minimal, canonical examples

Purpose:
To reduce hallucination and misinterpretation when agents consume the spec.

---

## 3. Versioning Requirements

* All schemas must use semantic versioning (MAJOR.MINOR.PATCH).
* Breaking changes require MAJOR version increment.
* Deprecated fields must remain supported for at least one MINOR cycle.
* Documentation must clearly indicate compatible schema versions.

---

## 4. Synchronization Rules

To prevent drift:

1. JSON Schema is the single source of truth.
2. Markdown documentation must reference schema definitions.
3. Validation logic must be derived from schema definitions.
4. No enforcement rule may exist without a corresponding schema field.
5. No schema field may exist without documentation.

---

## 5. Public Accessibility

The documentation system should:

* Be publicly accessible via web
* Provide downloadable raw schema files
* Provide version history
* Clearly distinguish:

  * Stable versions
  * Experimental versions

This enables:

* Third-party integrations
* External agent compatibility
* Long-term protocol credibility

---

## 6. Non-Goals

The documentation system is NOT:

* A blog
* A conceptual essay
* A tutorial-first documentation system

It is:

* Deterministic
* Structured
* Protocol-oriented
* Governance-grade

---

## 7. Long-Term Vision

If adopted widely, the structured documentation system enables:

* Vendor-neutral intent compatibility
* Third-party agent compliance
* “Compatible with Intent Spec vX.X” ecosystem labeling
* Governance as infrastructure

This documentation layer defines the protocol surface of the system.
