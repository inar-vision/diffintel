const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const analyzer = require("../../src/analyzers/express-route");

function withTempFile(content, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-test-"));
  const file = path.join(dir, "test.js");
  fs.writeFileSync(file, content);
  try {
    return fn(file);
  } finally {
    fs.unlinkSync(file);
    fs.rmdirSync(dir);
  }
}

describe("Express route analyzer", () => {
  it("detects app.get", () => {
    withTempFile('app.get("/users", handler);', (file) => {
      const routes = analyzer.analyze([file]);
      assert.equal(routes.length, 1);
      assert.equal(routes[0].method, "GET");
      assert.equal(routes[0].path, "/users");
    });
  });

  it("detects router.post", () => {
    withTempFile('router.post("/items", handler);', (file) => {
      const routes = analyzer.analyze([file]);
      assert.equal(routes.length, 1);
      assert.equal(routes[0].method, "POST");
      assert.equal(routes[0].path, "/items");
    });
  });

  it("detects parameterized routes", () => {
    withTempFile('app.get("/users/:id", handler);', (file) => {
      const routes = analyzer.analyze([file]);
      assert.equal(routes.length, 1);
      assert.equal(routes[0].path, "/users/:id");
    });
  });

  it("detects multiple routes in one file", () => {
    const content = [
      'app.get("/a", h);',
      'app.post("/b", h);',
      'app.delete("/c", h);',
    ].join("\n");
    withTempFile(content, (file) => {
      const routes = analyzer.analyze([file]);
      assert.equal(routes.length, 3);
      assert.deepEqual(
        routes.map((r) => r.method),
        ["GET", "POST", "DELETE"]
      );
    });
  });

  it("detects routes across multiple files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-test-"));
    const f1 = path.join(dir, "a.js");
    const f2 = path.join(dir, "b.js");
    fs.writeFileSync(f1, 'app.get("/x", h);');
    fs.writeFileSync(f2, 'router.post("/y", h);');
    try {
      const routes = analyzer.analyze([f1, f2]);
      assert.equal(routes.length, 2);
      assert.equal(routes[0].file, f1);
      assert.equal(routes[1].file, f2);
    } finally {
      fs.unlinkSync(f1);
      fs.unlinkSync(f2);
      fs.rmdirSync(dir);
    }
  });

  it("tracks line numbers", () => {
    const content = '// line 1\n// line 2\napp.get("/test", h);';
    withTempFile(content, (file) => {
      const routes = analyzer.analyze([file]);
      assert.equal(routes[0].line, 3);
    });
  });

  it("does not match routes inside plain strings", () => {
    // A string that contains a route-like pattern but is not a route registration
    const content = 'const msg = "use app.get to define routes";';
    withTempFile(content, (file) => {
      const routes = analyzer.analyze([file]);
      assert.equal(routes.length, 0);
    });
  });

  it("matches features correctly via match()", () => {
    const impls = [
      { method: "GET", path: "/users", file: "a.js", line: 1 },
      { method: "POST", path: "/users", file: "a.js", line: 2 },
    ];
    const result = analyzer.match(
      { method: "GET", path: "/users" },
      impls
    );
    assert.equal(result.found, true);
    assert.equal(result.implementedIn, "a.js");
  });

  it("matches parameterized paths via match()", () => {
    const impls = [
      { method: "GET", path: "/users/:userId", file: "a.js", line: 5 },
    ];
    const result = analyzer.match(
      { method: "GET", path: "/users/:id" },
      impls
    );
    assert.equal(result.found, true);
  });

  it("returns not found for missing route", () => {
    const impls = [
      { method: "GET", path: "/users", file: "a.js", line: 1 },
    ];
    const result = analyzer.match(
      { method: "DELETE", path: "/users/:id" },
      impls
    );
    assert.equal(result.found, false);
    assert.equal(result.implementedIn, null);
  });
});
