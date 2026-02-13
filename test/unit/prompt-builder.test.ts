import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildProposalPrompt, buildApplyPrompt, buildIssueSections } from "../../src/reconcile/prompt-builder";

describe("buildIssueSections", () => {
  it("includes only missing section when no constraint/contract sections", () => {
    const result = buildIssueSections("- f1: GET /users");
    assert.ok(result.includes("## Missing features"));
    assert.ok(!result.includes("## Constraint violations"));
    assert.ok(!result.includes("## Contract violations"));
  });

  it("includes constraint section when provided", () => {
    const result = buildIssueSections("", "- [routes-require-middleware] missing auth (app.js:10)");
    assert.ok(result.includes("## Constraint violations"));
    assert.ok(result.includes("missing auth"));
  });

  it("includes contract section when provided", () => {
    const result = buildIssueSections("", "", "- admin-page (GET /admin): contract.auth expected required, actual none");
    assert.ok(result.includes("## Contract violations"));
    assert.ok(result.includes("admin-page"));
  });

  it("includes all three sections", () => {
    const result = buildIssueSections(
      "- f1: GET /users",
      "- [rule] violation",
      "- f2 (GET /admin): contract issue",
    );
    assert.ok(result.includes("## Missing features"));
    assert.ok(result.includes("## Constraint violations"));
    assert.ok(result.includes("## Contract violations"));
  });

  it("excludes empty sections", () => {
    const result = buildIssueSections("", "", "");
    assert.equal(result, "");
  });
});

describe("buildProposalPrompt", () => {
  it("includes missing features in proposal", () => {
    const prompt = buildProposalPrompt("- f1: GET /users", "### app.js\n```js\ncode\n```");
    assert.ok(prompt.includes("Missing features"));
    assert.ok(prompt.includes("f1: GET /users"));
    assert.ok(!prompt.includes("Constraint violations"));
    assert.ok(!prompt.includes("Contract violations"));
  });

  it("includes constraint section when provided", () => {
    const prompt = buildProposalPrompt(
      "",
      "### app.js\n```js\ncode\n```",
      undefined,
      "- [routes-require-middleware] missing auth middleware",
    );
    assert.ok(prompt.includes("## Constraint violations"));
    assert.ok(prompt.includes("missing auth middleware"));
  });

  it("includes contract section when provided", () => {
    const prompt = buildProposalPrompt(
      "",
      "### app.js\n```js\ncode\n```",
      undefined,
      "",
      "- admin-page (GET /admin): contract.auth expected required, actual none",
    );
    assert.ok(prompt.includes("## Contract violations"));
    assert.ok(prompt.includes("admin-page"));
  });

  it("includes all sections when all provided", () => {
    const prompt = buildProposalPrompt(
      "- f1: GET /users",
      "### app.js\n```js\ncode\n```",
      undefined,
      "- [rule] constraint issue",
      "- f2 (GET /admin): contract issue",
    );
    assert.ok(prompt.includes("## Missing features"));
    assert.ok(prompt.includes("## Constraint violations"));
    assert.ok(prompt.includes("## Contract violations"));
  });

  it("mentions correct fix approaches in instructions", () => {
    const prompt = buildProposalPrompt("- f1: GET /users", "source");
    assert.ok(prompt.includes("add route"));
    assert.ok(prompt.includes("add middleware"));
  });
});

describe("buildApplyPrompt", () => {
  it("includes missing features", () => {
    const prompt = buildApplyPrompt("- f1: GET /users", "### app.js\n```js\ncode\n```", ["app.js"]);
    assert.ok(prompt.includes("Missing features"));
    assert.ok(prompt.includes("f1: GET /users"));
  });

  it("includes all three sections", () => {
    const prompt = buildApplyPrompt(
      "- f1: GET /users",
      "### app.js\n```js\ncode\n```",
      ["app.js"],
      undefined,
      "- [rule] constraint issue",
      "- f2 (GET /admin): contract issue",
    );
    assert.ok(prompt.includes("## Missing features"));
    assert.ok(prompt.includes("## Constraint violations"));
    assert.ok(prompt.includes("## Contract violations"));
  });

  it("lists allowed files", () => {
    const prompt = buildApplyPrompt("- f1: GET /x", "source", ["app.js", "routes/api.js"]);
    assert.ok(prompt.includes("app.js, routes/api.js"));
  });

  it("includes rules for all fix types", () => {
    const prompt = buildApplyPrompt("- f1: GET /x", "source", ["app.js"]);
    assert.ok(prompt.includes("missing features"));
    assert.ok(prompt.includes("constraint violations"));
    assert.ok(prompt.includes("contract violations"));
  });

  it("behaves like before with only missing features (no empty sections)", () => {
    const prompt = buildApplyPrompt("- f1: GET /users", "source", ["app.js"]);
    assert.ok(prompt.includes("## Missing features"));
    // Should not have empty constraint/contract headings
    assert.ok(!prompt.includes("## Constraint violations"));
    assert.ok(!prompt.includes("## Contract violations"));
  });
});
