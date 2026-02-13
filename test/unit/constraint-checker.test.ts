import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { matchesScope, resolveFiles } from "../../src/constraints/scope";
import { validateConstraints } from "../../src/constraints";
import { routesRequireMiddleware } from "../../src/constraints/rules/routes-require-middleware";
import { noDirectImport } from "../../src/constraints/rules/no-direct-import";
import { asyncErrorHandling } from "../../src/constraints/rules/async-error-handling";
import { Implementation, IntentFeature } from "../../src/types";

// ── Scope matcher ──

describe("matchesScope", () => {
  it("matches wildcard '*'", () => {
    assert.equal(matchesScope("/anything", "*"), true);
    assert.equal(matchesScope("/api/users", "*"), true);
  });

  it("matches prefix '/api/*'", () => {
    assert.equal(matchesScope("/api/users", "/api/*"), true);
    assert.equal(matchesScope("/api/orders/1", "/api/*"), true);
    assert.equal(matchesScope("/api", "/api/*"), true);
  });

  it("does not match prefix when path differs", () => {
    assert.equal(matchesScope("/public/page", "/api/*"), false);
    assert.equal(matchesScope("/health", "/api/*"), false);
  });

  it("exact match fallback", () => {
    assert.equal(matchesScope("/health", "/health"), true);
    assert.equal(matchesScope("/other", "/health"), false);
  });
});

describe("resolveFiles", () => {
  const impls: Implementation[] = [
    { type: "http-route", method: "GET", path: "/api/users", file: "routes/api.js", line: 1 },
    { type: "http-route", method: "GET", path: "/health", file: "app.js", line: 2 },
    { type: "http-route", method: "POST", path: "/api/orders", file: "routes/api.js", line: 5 },
  ];

  it("'route-handlers' returns unique files from http-route implementations", () => {
    const files = resolveFiles("route-handlers", impls);
    assert.deepEqual(files.sort(), ["app.js", "routes/api.js"]);
  });

  it("path pattern returns matching files", () => {
    const files = resolveFiles("/api/*", impls);
    assert.deepEqual(files, ["routes/api.js"]);
  });
});

// ── routes-require-middleware ──

describe("routes-require-middleware", () => {
  const feature: IntentFeature = {
    id: "api-auth",
    type: "constraint",
    rule: "routes-require-middleware",
    scope: "/api/*",
    middleware: "auth",
  };

  it("no violations when all routes have middleware", () => {
    const impls: Implementation[] = [
      { type: "http-route", method: "GET", path: "/api/users", file: "a.js", line: 1, middleware: ["auth"] },
      { type: "http-route", method: "POST", path: "/api/orders", file: "a.js", line: 3, middleware: ["auth", "validate"] },
    ];
    const violations = routesRequireMiddleware(feature, impls, []);
    assert.equal(violations.length, 0);
  });

  it("reports violation when route missing middleware", () => {
    const impls: Implementation[] = [
      { type: "http-route", method: "GET", path: "/api/users", file: "a.js", line: 1, middleware: [] },
      { type: "http-route", method: "POST", path: "/api/orders", file: "a.js", line: 3, middleware: ["auth"] },
    ];
    const violations = routesRequireMiddleware(feature, impls, []);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].route, "GET /api/users");
    assert.equal(violations[0].expected, "auth");
  });

  it("ignores routes out of scope", () => {
    const impls: Implementation[] = [
      { type: "http-route", method: "GET", path: "/health", file: "a.js", line: 1, middleware: [] },
      { type: "http-route", method: "GET", path: "/api/data", file: "a.js", line: 2, middleware: ["auth"] },
    ];
    const violations = routesRequireMiddleware(feature, impls, []);
    assert.equal(violations.length, 0);
  });

  it("supports array of required middleware", () => {
    const multiFeature: IntentFeature = {
      id: "api-security",
      type: "constraint",
      rule: "routes-require-middleware",
      scope: "/api/*",
      middleware: ["auth", "rateLimit"],
    };
    const impls: Implementation[] = [
      { type: "http-route", method: "GET", path: "/api/x", file: "a.js", line: 1, middleware: ["auth"] },
    ];
    const violations = routesRequireMiddleware(multiFeature, impls, []);
    assert.equal(violations.length, 1);
    assert.ok(violations[0].message.includes("rateLimit"));
  });
});

// ── no-direct-import ──

describe("no-direct-import", () => {
  function withTempFile(content: string, fn: (file: string) => void, ext: string = ".js"): void {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-constraint-"));
    const file = path.join(dir, `handler${ext}`);
    fs.writeFileSync(file, content);
    try {
      fn(file);
    } finally {
      fs.unlinkSync(file);
      fs.rmdirSync(dir);
    }
  }

  it("no violations for clean file", () => {
    withTempFile(
      `const express = require("express");\nconst utils = require("./utils");`,
      (file) => {
        const feature: IntentFeature = {
          id: "no-db",
          type: "constraint",
          rule: "no-direct-import",
          scope: "route-handlers",
          forbidden: ["pg", "mysql"],
        };
        const impls: Implementation[] = [
          { type: "http-route", method: "GET", path: "/x", file, line: 1 },
        ];
        const violations = noDirectImport(feature, impls, [file]);
        assert.equal(violations.length, 0);
      }
    );
  });

  it("detects forbidden require()", () => {
    withTempFile(
      `const db = require("pg");\napp.get("/x", (req, res) => res.json({}));`,
      (file) => {
        const feature: IntentFeature = {
          id: "no-db",
          type: "constraint",
          rule: "no-direct-import",
          scope: "route-handlers",
          forbidden: ["pg"],
        };
        const impls: Implementation[] = [
          { type: "http-route", method: "GET", path: "/x", file, line: 2 },
        ];
        const violations = noDirectImport(feature, impls, [file]);
        assert.equal(violations.length, 1);
        assert.ok(violations[0].message.includes("pg"));
      }
    );
  });

  it("detects forbidden ES import", () => {
    withTempFile(
      `import { Pool } from "pg";\nexport default function handler() {}`,
      (file) => {
        const feature: IntentFeature = {
          id: "no-db",
          type: "constraint",
          rule: "no-direct-import",
          scope: "route-handlers",
          forbidden: ["pg"],
        };
        const impls: Implementation[] = [
          { type: "http-route", method: "GET", path: "/x", file, line: 2 },
        ];
        const violations = noDirectImport(feature, impls, [file]);
        assert.equal(violations.length, 1);
        assert.ok(violations[0].actual === "pg");
      }
    );
  });

  it("detects multiple forbidden imports", () => {
    withTempFile(
      `const pg = require("pg");\nconst mysql = require("mysql");`,
      (file) => {
        const feature: IntentFeature = {
          id: "no-db",
          type: "constraint",
          rule: "no-direct-import",
          scope: "route-handlers",
          forbidden: ["pg", "mysql"],
        };
        const impls: Implementation[] = [
          { type: "http-route", method: "GET", path: "/x", file, line: 1 },
        ];
        const violations = noDirectImport(feature, impls, [file]);
        assert.equal(violations.length, 2);
      }
    );
  });
});

// ── async-error-handling ──

describe("async-error-handling", () => {
  function withTempFile(content: string, fn: (file: string) => void): void {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-constraint-"));
    const file = path.join(dir, `handler.js`);
    fs.writeFileSync(file, content);
    try {
      fn(file);
    } finally {
      fs.unlinkSync(file);
      fs.rmdirSync(dir);
    }
  }

  const feature: IntentFeature = {
    id: "async-guard",
    type: "constraint",
    rule: "async-error-handling",
    scope: "route-handlers",
  };

  it("no violation for handler with try/catch", () => {
    withTempFile(
      `app.get("/x", async (req, res) => { try { await doStuff(); res.json({}); } catch(e) { res.status(500).json({}); } });`,
      (file) => {
        const impls: Implementation[] = [
          { type: "http-route", method: "GET", path: "/x", file, line: 1 },
        ];
        const violations = asyncErrorHandling(feature, impls, [file]);
        assert.equal(violations.length, 0);
      }
    );
  });

  it("violation for async handler without try/catch", () => {
    withTempFile(
      `app.get("/x", async (req, res) => { const data = await fetch("/api"); res.json(data); });`,
      (file) => {
        const impls: Implementation[] = [
          { type: "http-route", method: "GET", path: "/x", file, line: 1 },
        ];
        const violations = asyncErrorHandling(feature, impls, [file]);
        assert.equal(violations.length, 1);
        assert.ok(violations[0].message.includes("try/catch"));
      }
    );
  });

  it("ignores non-async handlers", () => {
    withTempFile(
      `app.get("/x", (req, res) => { res.json({}); });`,
      (file) => {
        const impls: Implementation[] = [
          { type: "http-route", method: "GET", path: "/x", file, line: 1 },
        ];
        const violations = asyncErrorHandling(feature, impls, [file]);
        assert.equal(violations.length, 0);
      }
    );
  });
});

// ── validateConstraints engine ──

describe("validateConstraints", () => {
  it("skips draft constraints", () => {
    const features: IntentFeature[] = [
      { id: "c1", type: "constraint", status: "draft", rule: "routes-require-middleware", scope: "/api/*", middleware: "auth" },
    ];
    const results = validateConstraints(features, [], []);
    assert.equal(results.length, 0);
  });

  it("fails unknown rules with error message", () => {
    const features: IntentFeature[] = [
      { id: "c1", type: "constraint", rule: "nonexistent-rule", scope: "*" },
    ];
    const results = validateConstraints(features, [], []);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "failed");
    assert.ok(results[0].violations[0].message.includes("Unknown"));
  });

  it("passes when no violations", () => {
    const features: IntentFeature[] = [
      { id: "c1", type: "constraint", rule: "routes-require-middleware", scope: "/api/*", middleware: "auth" },
    ];
    const impls: Implementation[] = [
      { type: "http-route", method: "GET", path: "/api/users", file: "a.js", line: 1, middleware: ["auth"] },
    ];
    const results = validateConstraints(features, impls, []);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "passed");
    assert.equal(results[0].violations.length, 0);
  });

  it("fails when violations exist", () => {
    const features: IntentFeature[] = [
      { id: "c1", type: "constraint", rule: "routes-require-middleware", scope: "/api/*", middleware: "auth" },
    ];
    const impls: Implementation[] = [
      { type: "http-route", method: "GET", path: "/api/users", file: "a.js", line: 1, middleware: [] },
    ];
    const results = validateConstraints(features, impls, []);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "failed");
    assert.ok(results[0].violations.length > 0);
  });
});
