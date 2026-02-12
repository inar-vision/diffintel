import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import createAnalyzer from "../../src/analyzers/express-route";
import { Implementation } from "../../src/types";

function withTempFile(content: string, fn: (file: string) => void, ext: string = ".js"): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-test-"));
  const file = path.join(dir, `test${ext}`);
  fs.writeFileSync(file, content);
  try {
    fn(file);
  } finally {
    fs.unlinkSync(file);
    fs.rmdirSync(dir);
  }
}

describe("Middleware extraction", () => {
  const analyzer = createAnalyzer({ authMiddleware: ["auth", "authenticate"] });

  it("extracts single middleware", () => {
    withTempFile('app.get("/x", auth, handler);', (file) => {
      const routes = analyzer.analyze([file]);
      assert.equal(routes.length, 1);
      assert.deepEqual(routes[0].middleware, ["auth"]);
    });
  });

  it("returns empty array when no middleware", () => {
    withTempFile('app.get("/x", handler);', (file) => {
      const routes = analyzer.analyze([file]);
      assert.equal(routes.length, 1);
      assert.deepEqual(routes[0].middleware, []);
    });
  });

  it("extracts multiple middleware", () => {
    withTempFile('app.get("/x", auth, authorize, handler);', (file) => {
      const routes = analyzer.analyze([file]);
      assert.equal(routes.length, 1);
      assert.deepEqual(routes[0].middleware, ["auth", "authorize"]);
    });
  });

  it("extracts middleware with arrow function handler", () => {
    withTempFile('app.get("/x", auth, (req, res) => res.json({}));', (file) => {
      const routes = analyzer.analyze([file]);
      assert.equal(routes.length, 1);
      assert.deepEqual(routes[0].middleware, ["auth"]);
    });
  });
});

describe("Contract matching — auth", () => {
  const analyzer = createAnalyzer({ authMiddleware: ["auth", "authenticate"] });

  function makeImpls(middleware: string[] = []): Implementation[] {
    return [{
      type: "http-route",
      method: "GET",
      path: "/test",
      file: "a.js",
      line: 1,
      middleware,
    }];
  }

  it("auth required + has auth → no violation", () => {
    const result = analyzer.match(
      { id: "t", type: "http-route", method: "GET", path: "/test", contract: { auth: "required" } },
      makeImpls(["auth"])
    );
    assert.equal(result.found, true);
    assert.equal(result.contractViolations, undefined);
  });

  it("auth required + no auth → violation reported", () => {
    const result = analyzer.match(
      { id: "t", type: "http-route", method: "GET", path: "/test", contract: { auth: "required" } },
      makeImpls([])
    );
    assert.equal(result.found, true);
    assert.ok(result.contractViolations);
    assert.equal(result.contractViolations!.length, 1);
    assert.equal(result.contractViolations![0].contract, "auth");
    assert.equal(result.contractViolations![0].expected, "required");
    assert.equal(result.contractViolations![0].actual, "missing");
  });

  it("auth none + has auth → violation reported", () => {
    const result = analyzer.match(
      { id: "t", type: "http-route", method: "GET", path: "/test", contract: { auth: "none" } },
      makeImpls(["authenticate"])
    );
    assert.equal(result.found, true);
    assert.ok(result.contractViolations);
    assert.equal(result.contractViolations!.length, 1);
    assert.equal(result.contractViolations![0].expected, "none");
    assert.equal(result.contractViolations![0].actual, "present");
  });

  it("auth none + no auth → no violation", () => {
    const result = analyzer.match(
      { id: "t", type: "http-route", method: "GET", path: "/test", contract: { auth: "none" } },
      makeImpls([])
    );
    assert.equal(result.found, true);
    assert.equal(result.contractViolations, undefined);
  });

  it("no contract field → no violation regardless", () => {
    const result = analyzer.match(
      { id: "t", type: "http-route", method: "GET", path: "/test" },
      makeImpls(["auth"])
    );
    assert.equal(result.found, true);
    assert.equal(result.contractViolations, undefined);
  });

  it("custom auth middleware list is respected", () => {
    const customAnalyzer = createAnalyzer({ authMiddleware: ["myCustomAuth"] });
    const result = customAnalyzer.match(
      { id: "t", type: "http-route", method: "GET", path: "/test", contract: { auth: "required" } },
      makeImpls(["myCustomAuth"])
    );
    assert.equal(result.found, true);
    assert.equal(result.contractViolations, undefined);

    // Standard name not in custom list → violation
    const result2 = customAnalyzer.match(
      { id: "t", type: "http-route", method: "GET", path: "/test", contract: { auth: "required" } },
      makeImpls(["auth"])
    );
    assert.ok(result2.contractViolations);
    assert.equal(result2.contractViolations!.length, 1);
  });
});
