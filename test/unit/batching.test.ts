import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { splitDiffByFile, createBatches } from "../../src/explain/llm-explain";
import type { LLMExplanation } from "../../src/explain/types";

const makeDiff = (path: string, lines: number = 5): string => {
  const content = Array.from({ length: lines }, (_, i) => `+line${i + 1}`).join("\n");
  return `diff --git a/${path} b/${path}
index abc..def 100644
--- a/${path}
+++ b/${path}
@@ -1,0 +1,${lines} @@
${content}
`;
};

describe("splitDiffByFile", () => {
  it("should split a multi-file diff into a map", () => {
    const raw = makeDiff("a.ts") + makeDiff("b.ts") + makeDiff("c.ts");
    const result = splitDiffByFile(raw);

    assert.equal(result.size, 3);
    assert.ok(result.has("a.ts"));
    assert.ok(result.has("b.ts"));
    assert.ok(result.has("c.ts"));
  });

  it("should handle empty diff", () => {
    const result = splitDiffByFile("");
    assert.equal(result.size, 0);
  });

  it("should handle single-file diff", () => {
    const result = splitDiffByFile(makeDiff("only.ts"));
    assert.equal(result.size, 1);
    assert.ok(result.has("only.ts"));
  });

  it("should preserve diff content per file", () => {
    const result = splitDiffByFile(makeDiff("x.ts", 3));
    const content = result.get("x.ts")!;
    assert.ok(content.includes("+line1"));
    assert.ok(content.includes("+line3"));
  });
});

describe("createBatches", () => {
  it("should create a single batch for small diffs", () => {
    const diffMap = new Map([
      ["a.ts", makeDiff("a.ts", 2)],
      ["b.ts", makeDiff("b.ts", 2)],
    ]);
    const batches = createBatches(diffMap, 5000);

    assert.equal(batches.length, 1);
    assert.deepEqual(batches[0].files, ["a.ts", "b.ts"]);
    assert.equal(batches[0].batchIndex, 0);
    assert.equal(batches[0].totalBatches, 1);
  });

  it("should split into multiple batches when diff exceeds maxBatchSize", () => {
    // Each file diff is ~150 chars, set batch size to 200 to force splitting
    const diffMap = new Map([
      ["a.ts", makeDiff("a.ts", 10)],
      ["b.ts", makeDiff("b.ts", 10)],
      ["c.ts", makeDiff("c.ts", 10)],
    ]);
    const batches = createBatches(diffMap, 200);

    assert.ok(batches.length > 1, `Expected multiple batches, got ${batches.length}`);

    // All files should be covered
    const allFiles = batches.flatMap((b) => b.files);
    assert.ok(allFiles.includes("a.ts"));
    assert.ok(allFiles.includes("b.ts"));
    assert.ok(allFiles.includes("c.ts"));
  });

  it("should respect maxBatches cap", () => {
    const diffMap = new Map(
      Array.from({ length: 20 }, (_, i) => [`file${i}.ts`, makeDiff(`file${i}.ts`, 10)]),
    );
    const batches = createBatches(diffMap, 100, 3);

    assert.ok(batches.length <= 3, `Expected <= 3 batches, got ${batches.length}`);
    // All files should still be present
    const allFiles = batches.flatMap((b) => b.files);
    assert.equal(allFiles.length, 20);
  });

  it("should handle empty diff map", () => {
    const batches = createBatches(new Map());
    assert.equal(batches.length, 0);
  });

  it("should truncate a single large file diff to fit in a batch", () => {
    const largeDiff = "x".repeat(5000);
    const diffMap = new Map([["large.ts", largeDiff]]);
    const batches = createBatches(diffMap, 3500);

    assert.equal(batches.length, 1);
    assert.ok(
      batches[0].diffText.length <= 3500 + 50, // allow for truncation suffix
      `Batch text too large: ${batches[0].diffText.length}`,
    );
  });

  it("should set correct batchIndex and totalBatches", () => {
    const diffMap = new Map(
      Array.from({ length: 10 }, (_, i) => [`f${i}.ts`, makeDiff(`f${i}.ts`, 20)]),
    );
    const batches = createBatches(diffMap, 200, 10);

    for (let i = 0; i < batches.length; i++) {
      assert.equal(batches[i].batchIndex, i);
      assert.equal(batches[i].totalBatches, batches.length);
    }
  });
});
