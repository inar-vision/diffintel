import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const CLI = path.join(__dirname, "../../dist/cli.js");

describe("init command", () => {
  it("creates a valid v0.2 intent.json", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-init-"));
    try {
      execFileSync("node", [CLI, "init"], { cwd: dir, encoding: "utf-8" });
      const intentPath = path.join(dir, "intent.json");
      assert.ok(fs.existsSync(intentPath));
      const intent = JSON.parse(fs.readFileSync(intentPath, "utf-8"));
      assert.equal(intent.version, "0.2");
      assert.ok(Array.isArray(intent.features));
      assert.ok(intent.features.length > 0);
      assert.ok(intent.features[0].status);
    } finally {
      const intentPath = path.join(dir, "intent.json");
      if (fs.existsSync(intentPath)) fs.unlinkSync(intentPath);
      fs.rmdirSync(dir);
    }
  });

  it("refuses to overwrite without --force", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-init-"));
    const intentPath = path.join(dir, "intent.json");
    fs.writeFileSync(intentPath, "{}");
    try {
      execFileSync("node", [CLI, "init"], {
        cwd: dir,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      // Should not reach here
      assert.fail("Expected non-zero exit");
    } catch (err: any) {
      assert.equal(err.status, 1);
      // Original file should be untouched
      assert.equal(fs.readFileSync(intentPath, "utf-8"), "{}");
    } finally {
      fs.unlinkSync(intentPath);
      fs.rmdirSync(dir);
    }
  });

  it("overwrites with --force", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-init-"));
    const intentPath = path.join(dir, "intent.json");
    fs.writeFileSync(intentPath, "{}");
    try {
      execFileSync("node", [CLI, "init", "--force"], {
        cwd: dir,
        encoding: "utf-8",
      });
      const intent = JSON.parse(fs.readFileSync(intentPath, "utf-8"));
      assert.equal(intent.version, "0.2");
    } finally {
      fs.unlinkSync(intentPath);
      fs.rmdirSync(dir);
    }
  });
});
