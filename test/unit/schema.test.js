const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { validateIntent, checkDuplicateIds } = require("../../src/schema/validate");

describe("Schema validation", () => {
  it("accepts a valid v0.1 file", () => {
    const result = validateIntent({
      version: "0.1",
      features: [
        { id: "f1", type: "http-route", method: "GET", path: "/users" },
      ],
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it("accepts a valid v0.2 file", () => {
    const result = validateIntent({
      version: "0.2",
      meta: { name: "test", description: "A test" },
      features: [
        {
          id: "f1",
          type: "http-route",
          status: "approved",
          method: "GET",
          path: "/users",
          description: "List users",
          response: { status: 200, contentType: "application/json" },
        },
        {
          id: "f2",
          type: "middleware",
          status: "approved",
          description: "Auth",
          pattern: "/api/*",
        },
        {
          id: "f3",
          type: "constraint",
          status: "draft",
          description: "Rate limiting",
        },
      ],
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it("rejects missing version", () => {
    const result = validateIntent({
      features: [{ id: "f1", type: "http-route", method: "GET", path: "/" }],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("version")));
  });

  it("rejects missing features array", () => {
    const result = validateIntent({ version: "0.1" });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("features")));
  });

  it("rejects feature missing id", () => {
    const result = validateIntent({
      version: "0.2",
      features: [{ type: "http-route", method: "GET", path: "/" }],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("id")));
  });

  it("rejects feature missing type", () => {
    const result = validateIntent({
      version: "0.2",
      features: [{ id: "f1", method: "GET", path: "/" }],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("type")));
  });

  it("rejects http-route missing method", () => {
    const result = validateIntent({
      version: "0.2",
      features: [{ id: "f1", type: "http-route", path: "/" }],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("method")));
  });

  it("rejects http-route missing path", () => {
    const result = validateIntent({
      version: "0.2",
      features: [{ id: "f1", type: "http-route", method: "GET" }],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("path")));
  });

  it("rejects invalid status value", () => {
    const result = validateIntent({
      version: "0.2",
      features: [
        { id: "f1", type: "http-route", status: "invalid", method: "GET", path: "/" },
      ],
    });
    assert.equal(result.valid, false);
  });

  it("accepts unknown feature types", () => {
    const result = validateIntent({
      version: "0.2",
      features: [{ id: "f1", type: "custom-thing" }],
    });
    assert.equal(result.valid, true);
  });

  it("detects duplicate feature IDs", () => {
    const dupes = checkDuplicateIds({
      features: [
        { id: "f1", type: "http-route" },
        { id: "f2", type: "http-route" },
        { id: "f1", type: "http-route" },
      ],
    });
    assert.deepEqual(dupes, ["f1"]);
  });

  it("returns empty for unique IDs", () => {
    const dupes = checkDuplicateIds({
      features: [
        { id: "f1", type: "http-route" },
        { id: "f2", type: "http-route" },
      ],
    });
    assert.deepEqual(dupes, []);
  });
});
