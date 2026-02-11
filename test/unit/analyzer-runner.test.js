const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { createRunner } = require("../../src/analyzers");

describe("Analyzer runner", () => {
  it("loads built-in express-route analyzer", () => {
    const runner = createRunner();
    const names = runner.analyzers.map((a) => a.name);
    assert.ok(names.includes("express-route"));
  });

  it("returns file extensions from all analyzers", () => {
    const runner = createRunner();
    const exts = runner.getFileExtensions();
    assert.ok(exts.includes(".js"));
    assert.ok(exts.includes(".ts"));
  });

  it("dispatches features to correct analyzer", () => {
    const runner = createRunner();
    const fixtureDir = path.join(__dirname, "../fixtures/simple-express");
    const files = [path.join(fixtureDir, "app.js")];

    const impls = runner.analyzeFiles(files);
    assert.ok(impls.length > 0);
    assert.ok(impls.every((i) => i.analyzer === "express-route"));
  });

  it("reports unanalyzable features for unknown types", () => {
    const runner = createRunner();
    const intent = {
      features: [
        { id: "f1", type: "unknown-type", status: "approved" },
      ],
    };
    const result = runner.checkFeatures(intent, []);
    assert.equal(result.unannotatedFeatures.length, 1);
    assert.ok(result.unannotatedFeatures[0].reason.includes("unknown-type"));
  });

  it("skips draft features", () => {
    const runner = createRunner();
    const intent = {
      features: [
        { id: "f1", type: "http-route", status: "draft", method: "GET", path: "/test" },
      ],
    };
    const result = runner.checkFeatures(intent, []);
    assert.equal(result.draftFeatures.length, 1);
    assert.equal(result.missingFeatures.length, 0);
  });

  it("classifies present, missing, and extra correctly", () => {
    const runner = createRunner();
    const fixtureDir = path.join(__dirname, "../fixtures/missing-routes");
    const files = [path.join(fixtureDir, "app.js")];
    const impls = runner.analyzeFiles(files);

    const intent = {
      features: [
        { id: "list-users", type: "http-route", status: "approved", method: "GET", path: "/users" },
        { id: "create-user", type: "http-route", status: "approved", method: "POST", path: "/users" },
      ],
    };

    const result = runner.checkFeatures(intent, impls);
    assert.equal(result.presentFeatures.length, 1);
    assert.equal(result.presentFeatures[0].id, "list-users");
    assert.equal(result.missingFeatures.length, 1);
    assert.equal(result.missingFeatures[0].id, "create-user");
    // /health is in code but not in intent
    assert.ok(result.extraFeatures.length >= 1);
  });

  it("filters analyzers by include list", () => {
    const runner = createRunner({ analyzers: { include: [] } });
    assert.equal(runner.analyzers.length, 0);
  });
});
