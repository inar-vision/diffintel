import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractFeatures, hasIssues, buildSections } from "../../src/reconcile/reconciler";

describe("extractFeatures", () => {
  it("returns missing and present from v0.2 report", () => {
    const report = {
      features: [
        { id: "f1", result: "present", method: "GET", path: "/a" },
        { id: "f2", result: "missing", method: "POST", path: "/b" },
      ],
    };
    const result = extractFeatures(report);
    assert.equal(result.missing.length, 1);
    assert.equal(result.missing[0].id, "f2");
    assert.equal(result.present.length, 1);
    assert.equal(result.present[0].id, "f1");
    assert.deepEqual(result.failedConstraints, []);
    assert.deepEqual(result.contractViolations, []);
  });

  it("returns failedConstraints from v0.2 report", () => {
    const report = {
      features: [
        { id: "f1", result: "present", method: "GET", path: "/a" },
      ],
      constraints: {
        results: [
          { featureId: "c1", rule: "routes-require-middleware", status: "failed", violations: [{ constraint: "c1", rule: "routes-require-middleware", message: "missing auth" }] },
          { featureId: "c2", rule: "no-direct-import", status: "passed", violations: [] },
        ],
      },
    };
    const result = extractFeatures(report);
    assert.equal(result.failedConstraints.length, 1);
    assert.equal(result.failedConstraints[0].featureId, "c1");
  });

  it("returns contractViolations from present features", () => {
    const report = {
      features: [
        { id: "f1", result: "present", method: "GET", path: "/admin", contractViolations: [{ contract: "auth", expected: "required", actual: "none" }] },
        { id: "f2", result: "present", method: "GET", path: "/public" },
      ],
    };
    const result = extractFeatures(report);
    assert.equal(result.contractViolations.length, 1);
    assert.equal(result.contractViolations[0].id, "f1");
  });

  it("returns empty arrays for v0.1 report", () => {
    const report = {
      missingFeatures: [{ id: "f1", result: "missing" as const, method: "GET", path: "/a" }],
      presentFeatures: [],
    };
    const result = extractFeatures(report);
    assert.equal(result.missing.length, 1);
    assert.deepEqual(result.failedConstraints, []);
    assert.deepEqual(result.contractViolations, []);
  });

  it("returns empty arrays for constraint-free v0.2 report", () => {
    const report = {
      features: [
        { id: "f1", result: "present", method: "GET", path: "/a" },
      ],
    };
    const result = extractFeatures(report);
    assert.deepEqual(result.failedConstraints, []);
    assert.deepEqual(result.contractViolations, []);
  });
});

describe("hasIssues", () => {
  it("returns false when no issues", () => {
    assert.equal(
      hasIssues({ missing: [], present: [], failedConstraints: [], contractViolations: [] }),
      false,
    );
  });

  it("returns true for missing features", () => {
    assert.equal(
      hasIssues({
        missing: [{ id: "f1", result: "missing" as const, method: "GET", path: "/a" }],
        present: [],
        failedConstraints: [],
        contractViolations: [],
      }),
      true,
    );
  });

  it("returns true for failed constraints", () => {
    assert.equal(
      hasIssues({
        missing: [],
        present: [],
        failedConstraints: [{ featureId: "c1", rule: "r", status: "failed" as const, violations: [] }],
        contractViolations: [],
      }),
      true,
    );
  });

  it("returns true for contract violations", () => {
    assert.equal(
      hasIssues({
        missing: [],
        present: [],
        failedConstraints: [],
        contractViolations: [{ id: "f1", result: "present" as const, contractViolations: [{ contract: "auth", expected: "required", actual: "none" }] }],
      }),
      true,
    );
  });
});

describe("buildSections", () => {
  it("builds missing section from features", () => {
    const missing = [
      { id: "f1", result: "missing" as const, method: "GET", path: "/users" },
      { id: "f2", result: "missing" as const, method: "POST", path: "/items" },
    ];
    const result = buildSections(missing, {}, [], []);
    assert.equal(result.missingSection, "- f1: GET /users\n- f2: POST /items");
    assert.equal(result.constraintSection, "");
    assert.equal(result.contractSection, "");
  });

  it("builds constraint section from failed constraints", () => {
    const failedConstraints = [
      {
        featureId: "c1",
        rule: "routes-require-middleware",
        status: "failed" as const,
        violations: [
          { constraint: "c1", rule: "routes-require-middleware", message: "GET /api/users missing authenticate middleware", file: "app.js", line: 10 },
        ],
      },
    ];
    const result = buildSections([], {}, failedConstraints, []);
    assert.equal(
      result.constraintSection,
      "- [routes-require-middleware] GET /api/users missing authenticate middleware (app.js:10)",
    );
  });

  it("builds constraint section without file location", () => {
    const failedConstraints = [
      {
        featureId: "c1",
        rule: "no-direct-import",
        status: "failed" as const,
        violations: [
          { constraint: "c1", rule: "no-direct-import", message: "forbidden import found" },
        ],
      },
    ];
    const result = buildSections([], {}, failedConstraints, []);
    assert.equal(result.constraintSection, "- [no-direct-import] forbidden import found");
  });

  it("builds contract section from violations", () => {
    const contractViolations = [
      {
        id: "admin-page",
        result: "present" as const,
        method: "GET",
        path: "/admin",
        implementedIn: "routes/admin.js",
        contractViolations: [
          { contract: "auth", expected: "required", actual: "none" },
        ],
      },
    ];
    const result = buildSections([], {}, [], contractViolations);
    assert.equal(
      result.contractSection,
      "- admin-page (GET /admin): contract.auth expected required, actual none (routes/admin.js)",
    );
  });

  it("returns empty strings when no issues of any type", () => {
    const result = buildSections([], {}, [], []);
    assert.equal(result.missingSection, "");
    assert.equal(result.constraintSection, "");
    assert.equal(result.contractSection, "");
  });

  it("builds source section from context", () => {
    const sourceContext = { "app.js": "const x = 1;" };
    const result = buildSections([], sourceContext, [], []);
    assert.ok(result.sourceSection.includes("### app.js"));
    assert.ok(result.sourceSection.includes("const x = 1;"));
  });
});
