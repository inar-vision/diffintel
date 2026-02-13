import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "child_process";
import path from "path";

const CLI = path.join(__dirname, "../../dist/cli.js");

function runCheck(args: string[] = [], cwd?: string) {
  const result = spawnSync("node", [CLI, "check", ...args], {
    cwd: cwd || path.join(__dirname, "../../"),
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return { stdout: result.stdout || "", stderr: result.stderr || "", exitCode: result.status };
}

describe("check command — constraint-pass fixture", () => {
  const fixtureDir = path.join(__dirname, "../fixtures/constraint-pass");

  it("all constraints pass, exit code 0", () => {
    const { stdout, exitCode } = runCheck(["--format", "json", "--intent", "intent.json", "--dir", "."], fixtureDir);
    const report = JSON.parse(stdout);
    assert.equal(exitCode, 0);
    assert.equal(report.summary.present, 3);
    assert.equal(report.summary.missing, 0);
    assert.equal(report.summary.constraintsChecked, 1);
    assert.equal(report.summary.constraintsPassed, 1);
    assert.equal(report.summary.constraintsFailed, 0);
    assert.equal(report.drift.hasDrift, false);
    assert.equal(report.drift.constraintFailedCount, 0);
    assert.ok(report.constraints);
    assert.equal(report.constraints.results.length, 1);
    assert.equal(report.constraints.results[0].status, "passed");
  });

  it("text output includes Constraints line", () => {
    const { stderr } = runCheck(["--intent", "intent.json", "--dir", "."], fixtureDir);
    assert.ok(stderr.includes("Constraints:"));
    assert.ok(stderr.includes("1/1 passing"));
  });
});

describe("check command — constraint-fail fixture", () => {
  const fixtureDir = path.join(__dirname, "../fixtures/constraint-fail");

  it("constraint violations cause exit code 1", () => {
    const { stdout, exitCode } = runCheck(["--format", "json", "--intent", "intent.json", "--dir", "."], fixtureDir);
    const report = JSON.parse(stdout);
    assert.equal(exitCode, 1);
    assert.equal(report.summary.present, 3);
    assert.equal(report.summary.missing, 0);
    assert.equal(report.summary.constraintsChecked, 1);
    assert.equal(report.summary.constraintsPassed, 0);
    assert.equal(report.summary.constraintsFailed, 1);
    assert.equal(report.drift.hasDrift, true);
    assert.equal(report.drift.constraintFailedCount, 1);
    assert.ok(report.constraints);
    assert.equal(report.constraints.results[0].status, "failed");
    assert.ok(report.constraints.results[0].violations.length > 0);
    assert.ok(report.constraints.results[0].violations[0].route.includes("/api/users"));
  });

  it("text output shows constraint violation details", () => {
    const { stderr } = runCheck(["--intent", "intent.json", "--dir", "."], fixtureDir);
    assert.ok(stderr.includes("Constraint violations:"));
    assert.ok(stderr.includes("routes-require-middleware"));
    assert.ok(stderr.includes("/api/users"));
  });

  it("summary format includes constraints", () => {
    const { stdout } = runCheck(["--format", "summary", "--intent", "intent.json", "--dir", "."], fixtureDir);
    assert.ok(stdout.includes("DRIFT"));
    assert.ok(stdout.includes("constraints: 0/1"));
  });
});

describe("check command — constraint with draft status", () => {
  it("draft constraints are skipped and do not cause drift", () => {
    // Use the constraint-fail fixture but with draft status in intent
    const fs = require("fs");
    const os = require("os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-draft-constraint-"));

    // Copy app.js from constraint-fail
    const appContent = fs.readFileSync(
      path.join(__dirname, "../fixtures/constraint-fail/app.js"), "utf-8"
    );
    fs.writeFileSync(path.join(dir, "app.js"), appContent);

    // Write intent with draft constraint
    const intent = {
      version: "0.2",
      meta: { name: "draft-test" },
      features: [
        { id: "get-api-users", type: "http-route", method: "GET", path: "/api/users" },
        { id: "get-api-orders", type: "http-route", method: "GET", path: "/api/orders" },
        { id: "get-health", type: "http-route", method: "GET", path: "/health" },
        {
          id: "api-auth-required",
          type: "constraint",
          status: "draft",
          rule: "routes-require-middleware",
          scope: "/api/*",
          middleware: "authenticate",
        },
      ],
    };
    fs.writeFileSync(path.join(dir, "intent.json"), JSON.stringify(intent, null, 2));

    try {
      const { stdout, exitCode } = runCheck(["--format", "json", "--intent", "intent.json", "--dir", "."], dir);
      const report = JSON.parse(stdout);
      assert.equal(exitCode, 0);
      assert.equal(report.summary.constraintsChecked, 0);
      assert.equal(report.drift.hasDrift, false);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});
