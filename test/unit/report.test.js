const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildReport,
  formatReport,
  diffReports,
  computeComplianceScore,
} = require("../../src/report");

describe("Compliance score", () => {
  it("returns 100 when all analyzed features are present", () => {
    assert.equal(computeComplianceScore(5, 5), 100);
  });

  it("returns 0 when no features are present", () => {
    assert.equal(computeComplianceScore(0, 5), 0);
  });

  it("returns 100 when no features are analyzed", () => {
    assert.equal(computeComplianceScore(0, 0), 100);
  });

  it("calculates partial score correctly", () => {
    assert.equal(computeComplianceScore(3, 4), 75);
  });

  it("rounds to one decimal place", () => {
    assert.equal(computeComplianceScore(1, 3), 33.3);
  });
});

describe("buildReport", () => {
  it("produces v0.2 format with unified features array", () => {
    const intent = { version: "0.2" };
    const checkResult = {
      presentFeatures: [
        { id: "f1", method: "GET", path: "/a", implementedIn: "a.js", status: "approved", analyzer: "test" },
      ],
      missingFeatures: [
        { id: "f2", method: "POST", path: "/b", status: "approved" },
      ],
      extraFeatures: [
        { method: "DELETE", path: "/c", implementedIn: "a.js" },
      ],
      draftFeatures: [],
      deprecatedFeatures: [],
      unannotatedFeatures: [],
    };

    const report = buildReport(intent, checkResult, {
      intentFile: "test.json",
      analyzers: ["test"],
    });

    assert.equal(report.version, "0.2");
    assert.equal(report.meta.intentFile, "test.json");
    assert.deepEqual(report.meta.analyzers, ["test"]);
    assert.equal(report.summary.present, 1);
    assert.equal(report.summary.missing, 1);
    assert.equal(report.summary.extra, 1);
    assert.equal(report.summary.complianceScore, 50);
    assert.equal(report.drift.hasDrift, true);
    assert.equal(report.features.length, 2);
    assert.equal(report.features[0].result, "present");
    assert.equal(report.features[1].result, "missing");
  });

  it("includes unanalyzable features", () => {
    const report = buildReport(
      { version: "0.2" },
      {
        presentFeatures: [],
        missingFeatures: [],
        extraFeatures: [],
        draftFeatures: [],
        deprecatedFeatures: [],
        unannotatedFeatures: [
          { id: "u1", type: "middleware", status: "approved", reason: "No analyzer" },
        ],
      },
      {}
    );
    assert.equal(report.summary.unanalyzable, 1);
    const u = report.features.find((f) => f.id === "u1");
    assert.equal(u.result, "unanalyzable");
  });
});

describe("formatReport", () => {
  const report = buildReport(
    { version: "0.2" },
    {
      presentFeatures: [
        { id: "f1", method: "GET", path: "/a", implementedIn: "a.js", status: "approved" },
      ],
      missingFeatures: [],
      extraFeatures: [],
      draftFeatures: [],
      deprecatedFeatures: [],
      unannotatedFeatures: [],
    },
    { intentFile: "test.json", analyzers: [] }
  );

  it("json format produces parseable JSON", () => {
    const json = formatReport(report, "json");
    const parsed = JSON.parse(json);
    assert.equal(parsed.version, "0.2");
  });

  it("summary format produces one-line output", () => {
    const summary = formatReport(report, "summary");
    assert.ok(summary.includes("OK"));
    assert.ok(summary.includes("100%"));
    assert.ok(!summary.includes("\n"));
  });

  it("text format includes compliance score", () => {
    const text = formatReport(report, "text");
    assert.ok(text.includes("100%"));
    assert.ok(text.includes("Intent check"));
  });
});

describe("diffReports", () => {
  it("detects newly implemented features", () => {
    const previous = {
      features: [{ id: "f1", result: "missing", method: "GET", path: "/a" }],
      extraFeatures: [],
      summary: { complianceScore: 0 },
    };
    const current = {
      features: [{ id: "f1", result: "present", method: "GET", path: "/a" }],
      extraFeatures: [],
      summary: { complianceScore: 100 },
    };
    const diff = diffReports(current, previous);
    assert.equal(diff.newlyPresent.length, 1);
    assert.equal(diff.newlyPresent[0].id, "f1");
    assert.equal(diff.scoreBefore, 0);
    assert.equal(diff.scoreAfter, 100);
  });

  it("detects newly missing features", () => {
    const previous = {
      features: [{ id: "f1", result: "present" }],
      extraFeatures: [],
      summary: { complianceScore: 100 },
    };
    const current = {
      features: [{ id: "f1", result: "missing", method: "GET", path: "/a" }],
      extraFeatures: [],
      summary: { complianceScore: 0 },
    };
    const diff = diffReports(current, previous);
    assert.equal(diff.newlyMissing.length, 1);
  });

  it("detects new features added to intent", () => {
    const previous = {
      features: [],
      extraFeatures: [],
      summary: { complianceScore: 100 },
    };
    const current = {
      features: [{ id: "f1", result: "missing" }],
      extraFeatures: [],
      summary: { complianceScore: 0 },
    };
    const diff = diffReports(current, previous);
    assert.equal(diff.newFeatures.length, 1);
  });

  it("detects new extra routes", () => {
    const previous = {
      features: [],
      extraFeatures: [],
      summary: { complianceScore: 100 },
    };
    const current = {
      features: [],
      extraFeatures: [{ method: "GET", path: "/debug", implementedIn: "a.js" }],
      summary: { complianceScore: 100 },
    };
    const diff = diffReports(current, previous);
    assert.equal(diff.newExtras.length, 1);
  });
});
