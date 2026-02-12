import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import path from "path";

const CLI = path.join(__dirname, "../../dist/cli.js");

function runCheck(args: string[] = [], cwd?: string) {
  try {
    const stdout = execFileSync("node", [CLI, "check", ...args], {
      cwd: cwd || path.join(__dirname, "../../"),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, exitCode: 0 };
  } catch (err: any) {
    return { stdout: err.stdout || "", stderr: err.stderr || "", exitCode: err.status };
  }
}

describe("check command — simple-express fixture", () => {
  const fixtureDir = path.join(__dirname, "../fixtures/simple-express");

  it("finds all routes present, exit code 0", () => {
    const { stdout, exitCode } = runCheck(["--format", "json", "--intent", "intent.json", "--dir", "."], fixtureDir);
    const report = JSON.parse(stdout);
    assert.equal(exitCode, 0);
    assert.equal(report.summary.present, 4);
    assert.equal(report.summary.missing, 0);
    assert.equal(report.summary.extra, 0);
    assert.equal(report.summary.complianceScore, 100);
    assert.equal(report.drift.hasDrift, false);
  });
});

describe("check command — multi-file-express fixture", () => {
  const fixtureDir = path.join(__dirname, "../fixtures/multi-file-express");

  it("detects routes across multiple files", () => {
    const { stdout, exitCode } = runCheck(["--format", "json", "--intent", "intent.json", "--dir", "."], fixtureDir);
    const report = JSON.parse(stdout);
    // Router routes use sub-paths like "/", "/:id" — these should match
    assert.ok(report.summary.present >= 4);
    // /health is in app.js
    assert.ok(
      report.features.some(
        (f: any) => f.id === "health" && f.result === "present"
      )
    );
  });
});

describe("check command — missing-routes fixture", () => {
  const fixtureDir = path.join(__dirname, "../fixtures/missing-routes");

  it("reports missing routes, exit code 1", () => {
    const { stdout, exitCode } = runCheck(["--format", "json", "--intent", "intent.json", "--dir", "."], fixtureDir);
    const report = JSON.parse(stdout);
    assert.equal(exitCode, 1);
    assert.ok(report.summary.missing > 0);
    assert.ok(report.drift.hasDrift);
    const missing = report.features.filter((f: any) => f.result === "missing");
    assert.ok(missing.some((f: any) => f.id === "create-user"));
    assert.ok(missing.some((f: any) => f.id === "get-user"));
  });
});

describe("check command — extra-routes fixture", () => {
  const fixtureDir = path.join(__dirname, "../fixtures/extra-routes");

  it("reports extra routes, exit code 1", () => {
    const { stdout, exitCode } = runCheck(["--format", "json", "--intent", "intent.json", "--dir", "."], fixtureDir);
    const report = JSON.parse(stdout);
    assert.equal(exitCode, 1);
    assert.equal(report.summary.present, 3);
    assert.equal(report.summary.missing, 0);
    assert.ok(report.summary.extra >= 2);
    assert.ok(report.drift.hasDrift);
    assert.ok(report.extraFeatures.some((e: any) => e.path === "/debug"));
    assert.ok(report.extraFeatures.some((e: any) => e.path === "/metrics"));
  });
});

describe("check command — v0.1 backward compatibility", () => {
  const fixtureDir = path.join(__dirname, "../fixtures/v01-intent");

  it("works with v0.1 intent files", () => {
    const { stdout, exitCode } = runCheck(["--format", "json", "--intent", "intent.json", "--dir", "."], fixtureDir);
    const report = JSON.parse(stdout);
    assert.equal(exitCode, 0);
    assert.equal(report.summary.present, 2);
    assert.equal(report.summary.missing, 0);
    assert.equal(report.meta.intentVersion, "0.1");
  });
});

describe("check command — exit codes", () => {
  it("exit code 3 for missing intent file", () => {
    const { exitCode } = runCheck(["--intent", "nonexistent.json", "--format", "json"]);
    assert.equal(exitCode, 3);
  });

  it("exit code 2 for invalid intent file", () => {
    const fs = require("fs");
    const os = require("os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-test-"));
    const intentPath = path.join(dir, "intent.json");
    fs.writeFileSync(intentPath, JSON.stringify({ version: "bad", features: [] }));
    try {
      const { exitCode } = runCheck(["--intent", intentPath, "--format", "json"]);
      assert.equal(exitCode, 2);
    } finally {
      fs.unlinkSync(intentPath);
      fs.rmdirSync(dir);
    }
  });

  it("summary format outputs one-liner", () => {
    const fixtureDir = path.join(__dirname, "../fixtures/simple-express");
    const { stdout } = runCheck(["--format", "summary", "--intent", "intent.json", "--dir", "."], fixtureDir);
    assert.ok(stdout.trim().startsWith("OK"));
    assert.ok(stdout.includes("100%"));
  });
});
