const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CLI = path.join(__dirname, "../../src/cli.js");

function withIntentFile(content, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-validate-"));
  const intentPath = path.join(dir, "intent.json");
  fs.writeFileSync(intentPath, JSON.stringify(content, null, 2));
  try {
    return fn(dir, intentPath);
  } finally {
    fs.unlinkSync(intentPath);
    fs.rmdirSync(dir);
  }
}

describe("validate command", () => {
  it("validates a correct v0.2 file", () => {
    withIntentFile(
      {
        version: "0.2",
        features: [
          { id: "f1", type: "http-route", method: "GET", path: "/test" },
        ],
      },
      (dir) => {
        const stdout = execFileSync("node", [CLI, "validate"], {
          cwd: dir,
          encoding: "utf-8",
        });
        assert.ok(stdout.includes("valid"));
      }
    );
  });

  it("validates a correct v0.1 file", () => {
    withIntentFile(
      {
        version: "0.1",
        features: [
          { id: "f1", type: "http-route", method: "GET", path: "/test" },
        ],
      },
      (dir) => {
        const stdout = execFileSync("node", [CLI, "validate"], {
          cwd: dir,
          encoding: "utf-8",
        });
        assert.ok(stdout.includes("valid"));
      }
    );
  });

  it("rejects file with missing required fields", () => {
    withIntentFile(
      {
        version: "0.2",
        features: [{ type: "http-route", method: "GET", path: "/test" }],
      },
      (dir) => {
        try {
          execFileSync("node", [CLI, "validate"], {
            cwd: dir,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          });
          assert.fail("Expected non-zero exit");
        } catch (err) {
          assert.equal(err.status, 1);
          assert.ok(err.stderr.includes("id"));
        }
      }
    );
  });

  it("rejects file with invalid version", () => {
    withIntentFile(
      {
        version: "99.0",
        features: [],
      },
      (dir) => {
        try {
          execFileSync("node", [CLI, "validate"], {
            cwd: dir,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          });
          assert.fail("Expected non-zero exit");
        } catch (err) {
          assert.equal(err.status, 1);
        }
      }
    );
  });

  it("rejects file with duplicate IDs", () => {
    withIntentFile(
      {
        version: "0.2",
        features: [
          { id: "dup", type: "http-route", method: "GET", path: "/a" },
          { id: "dup", type: "http-route", method: "POST", path: "/b" },
        ],
      },
      (dir) => {
        try {
          execFileSync("node", [CLI, "validate"], {
            cwd: dir,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          });
          assert.fail("Expected non-zero exit");
        } catch (err) {
          assert.equal(err.status, 1);
          assert.ok(err.stderr.includes("Duplicate"));
        }
      }
    );
  });
});
