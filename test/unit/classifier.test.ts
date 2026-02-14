import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyIssues, identifierExistsInSource } from "../../src/reconcile/classifier";

describe("identifierExistsInSource", () => {
  it("returns true when identifier exists as whole word", () => {
    const source = { "app.js": "const authenticate = require('./auth');" };
    assert.equal(identifierExistsInSource("authenticate", source), true);
  });

  it("returns false when identifier is only a substring", () => {
    const source = { "app.js": "const authenticated = true;" };
    assert.equal(identifierExistsInSource("authenticate", source), false);
  });

  it("returns false for empty source context", () => {
    assert.equal(identifierExistsInSource("authenticate", {}), false);
  });

  it("matches identifier in any file", () => {
    const source = {
      "a.js": "const x = 1;",
      "b.js": "function authenticate() {}",
    };
    assert.equal(identifierExistsInSource("authenticate", source), true);
  });
});

describe("classifyIssues", () => {
  it("classifies missing features as fixable when source context exists", () => {
    const missing = [{ id: "f1", result: "missing" as const, method: "GET", path: "/users" }];
    const source = { "app.js": "const express = require('express');" };
    const result = classifyIssues(missing, [], [], source);
    assert.equal(result.fixable.missing.length, 1);
    assert.equal(result.unfixable.length, 0);
  });

  it("classifies missing features as unfixable when source context is empty", () => {
    const missing = [{ id: "f1", result: "missing" as const, method: "GET", path: "/users" }];
    const result = classifyIssues(missing, [], [], {});
    assert.equal(result.fixable.missing.length, 0);
    assert.equal(result.unfixable.length, 1);
    assert.equal(result.unfixable[0].type, "missing");
    assert.equal(result.unfixable[0].id, "f1");
  });

  it("classifies routes-require-middleware as fixable when middleware exists in source", () => {
    const constraints = [{
      featureId: "c1",
      rule: "routes-require-middleware",
      status: "failed" as const,
      violations: [{
        constraint: "c1",
        rule: "routes-require-middleware",
        message: "missing authenticate",
        expected: "authenticate",
      }],
    }];
    const source = { "middleware.js": "function authenticate(req, res, next) { next(); }" };
    const result = classifyIssues([], constraints, [], source);
    assert.equal(result.fixable.failedConstraints.length, 1);
    assert.equal(result.unfixable.length, 0);
  });

  it("classifies routes-require-middleware as unfixable when middleware NOT in source", () => {
    const constraints = [{
      featureId: "c1",
      rule: "routes-require-middleware",
      status: "failed" as const,
      violations: [{
        constraint: "c1",
        rule: "routes-require-middleware",
        message: "missing authenticate",
        expected: "authenticate",
      }],
    }];
    const source = { "app.js": "const express = require('express');" };
    const result = classifyIssues([], constraints, [], source);
    assert.equal(result.fixable.failedConstraints.length, 0);
    assert.equal(result.unfixable.length, 1);
    assert.equal(result.unfixable[0].type, "constraint");
    assert.ok(result.unfixable[0].reason.includes("authenticate"));
  });

  it("classifies no-direct-import as always fixable", () => {
    const constraints = [{
      featureId: "c1",
      rule: "no-direct-import",
      status: "failed" as const,
      violations: [{
        constraint: "c1",
        rule: "no-direct-import",
        message: "forbidden import found",
      }],
    }];
    const result = classifyIssues([], constraints, [], {});
    assert.equal(result.fixable.failedConstraints.length, 1);
    assert.equal(result.unfixable.length, 0);
  });

  it("classifies async-error-handling as always fixable", () => {
    const constraints = [{
      featureId: "c1",
      rule: "async-error-handling",
      status: "failed" as const,
      violations: [{
        constraint: "c1",
        rule: "async-error-handling",
        message: "missing try/catch",
      }],
    }];
    const result = classifyIssues([], constraints, [], {});
    assert.equal(result.fixable.failedConstraints.length, 1);
    assert.equal(result.unfixable.length, 0);
  });

  it("classifies contract auth violation as fixable when auth middleware in source", () => {
    const contractViolations = [{
      id: "admin-page",
      result: "present" as const,
      method: "GET",
      path: "/admin",
      implementedIn: "routes/admin.js",
      contractViolations: [{ contract: "auth", expected: "required", actual: "none" }],
    }];
    const source = { "middleware.js": "function authenticate(req, res, next) {}" };
    const result = classifyIssues([], [], contractViolations, source);
    assert.equal(result.fixable.contractViolations.length, 1);
    assert.equal(result.unfixable.length, 0);
  });

  it("classifies contract auth violation as unfixable when no auth middleware in source", () => {
    const contractViolations = [{
      id: "admin-page",
      result: "present" as const,
      method: "GET",
      path: "/admin",
      implementedIn: "routes/admin.js",
      contractViolations: [{ contract: "auth", expected: "required", actual: "none" }],
    }];
    const source = { "app.js": "const express = require('express');" };
    const result = classifyIssues([], [], contractViolations, source);
    assert.equal(result.fixable.contractViolations.length, 0);
    assert.equal(result.unfixable.length, 1);
    assert.equal(result.unfixable[0].type, "contract");
    assert.equal(result.unfixable[0].id, "admin-page");
  });

  it("correctly splits mixed fixable and unfixable issues", () => {
    const missing = [{ id: "f1", result: "missing" as const, method: "GET", path: "/users" }];
    const constraints = [{
      featureId: "c1",
      rule: "routes-require-middleware",
      status: "failed" as const,
      violations: [{
        constraint: "c1",
        rule: "routes-require-middleware",
        message: "missing customGuard",
        expected: "customGuard",
      }],
    }, {
      featureId: "c2",
      rule: "no-direct-import",
      status: "failed" as const,
      violations: [{
        constraint: "c2",
        rule: "no-direct-import",
        message: "forbidden import",
      }],
    }];
    const source = { "app.js": "const express = require('express');" };
    const result = classifyIssues(missing, constraints, [], source);

    // missing f1 is fixable (has source), c1 is unfixable (customGuard not in source), c2 is fixable
    assert.equal(result.fixable.missing.length, 1);
    assert.equal(result.fixable.failedConstraints.length, 1);
    assert.equal(result.fixable.failedConstraints[0].featureId, "c2");
    assert.equal(result.unfixable.length, 1);
    assert.equal(result.unfixable[0].id, "c1");
  });

  it("word boundary: authenticated does NOT match authenticate", () => {
    const constraints = [{
      featureId: "c1",
      rule: "routes-require-middleware",
      status: "failed" as const,
      violations: [{
        constraint: "c1",
        rule: "routes-require-middleware",
        message: "missing authenticate",
        expected: "authenticate",
      }],
    }];
    const source = { "app.js": "const isAuthenticated = user.authenticated;" };
    const result = classifyIssues([], constraints, [], source);
    assert.equal(result.fixable.failedConstraints.length, 0);
    assert.equal(result.unfixable.length, 1);
  });

  it("falls back to default auth middleware list when no config provided", () => {
    const contractViolations = [{
      id: "admin-page",
      result: "present" as const,
      method: "GET",
      path: "/admin",
      contractViolations: [{ contract: "auth", expected: "required", actual: "none" }],
    }];
    // "requireAuth" is in the default list
    const source = { "middleware.js": "function requireAuth(req, res, next) {}" };
    const result = classifyIssues([], [], contractViolations, source);
    assert.equal(result.fixable.contractViolations.length, 1);
    assert.equal(result.unfixable.length, 0);
  });

  it("uses config auth middleware list when provided", () => {
    const contractViolations = [{
      id: "admin-page",
      result: "present" as const,
      method: "GET",
      path: "/admin",
      contractViolations: [{ contract: "auth", expected: "required", actual: "none" }],
    }];
    const source = { "middleware.js": "function customAuth(req, res, next) {}" };
    const config = {
      intentFile: "intent.json",
      scanDir: ".",
      exclude: [],
      contracts: { authMiddleware: ["customAuth"] },
    };
    const result = classifyIssues([], [], contractViolations, source, config);
    assert.equal(result.fixable.contractViolations.length, 1);
    assert.equal(result.unfixable.length, 0);
  });
});
