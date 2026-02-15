import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parallelLimit } from "../../src/explain/git-diff";

describe("parallelLimit", () => {
  it("should process all items and return results in order", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await parallelLimit(items, 3, async (n) => n * 2);
    assert.deepEqual(results, [2, 4, 6, 8, 10]);
  });

  it("should handle empty input", async () => {
    const results = await parallelLimit([], 5, async (n: number) => n);
    assert.deepEqual(results, []);
  });

  it("should respect concurrency limit", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const limit = 3;

    const items = Array.from({ length: 10 }, (_, i) => i);
    await parallelLimit(items, limit, async (n) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      // Simulate async work
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrent--;
      return n;
    });

    assert.ok(
      maxConcurrent <= limit,
      `Max concurrent was ${maxConcurrent}, expected <= ${limit}`,
    );
    assert.ok(maxConcurrent > 1, `Expected some parallelism, got ${maxConcurrent}`);
  });

  it("should propagate errors", async () => {
    const items = [1, 2, 3];
    await assert.rejects(
      parallelLimit(items, 2, async (n) => {
        if (n === 2) throw new Error("fail");
        return n;
      }),
      { message: "fail" },
    );
  });

  it("should handle limit larger than items", async () => {
    const items = [1, 2];
    const results = await parallelLimit(items, 100, async (n) => n + 1);
    assert.deepEqual(results, [2, 3]);
  });
});
