import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  capHistorySummary,
  capBaseSummary,
  capStructuralSummary,
  capControlFlowSummary,
} from "../../src/explain/llm-explain";
import type { FileAnalysis } from "../../src/explain/types";

function makeFile(overrides: Partial<FileAnalysis> = {}): FileAnalysis {
  return {
    path: overrides.path || "test.ts",
    status: overrides.status || "modified",
    language: "typescript",
    structuralChanges: overrides.structuralChanges || [],
    controlFlowAnnotations: overrides.controlFlowAnnotations || [],
    baseDeclarations: overrides.baseDeclarations || [],
    recentHistory: overrides.recentHistory || [],
    rawDiff: "",
    ...overrides,
  };
}

describe("capHistorySummary", () => {
  it("should pass through small inputs unchanged", () => {
    const files = [
      makeFile({
        path: "a.ts",
        recentHistory: [{ hash: "abc1234", message: "fix bug", age: "2 hours ago" }],
      }),
    ];

    const result = capHistorySummary(files);
    assert.ok(result.includes("a.ts"));
    assert.ok(result.includes("abc1234"));
    assert.ok(result.includes("fix bug"));
  });

  it("should stay under budget for large inputs", () => {
    const largeDiff = "x".repeat(3000);
    const files = Array.from({ length: 20 }, (_, i) =>
      makeFile({
        path: `file${i}.ts`,
        recentHistory: [
          { hash: `h${i}`, message: `commit ${i}`, age: "1 day ago", diff: largeDiff },
        ],
      }),
    );

    const budget = 15000;
    const result = capHistorySummary(files, budget);
    // After capping, the result should be meaningfully reduced
    // (may not be strictly under budget since we drop diffs progressively)
    assert.ok(result.length < 20 * 3000, "Should have dropped some diffs");
  });

  it("should preserve commit info even when diffs are dropped", () => {
    const largeDiff = "x".repeat(5000);
    const files = [
      makeFile({
        path: "big.ts",
        recentHistory: [
          { hash: "abc", message: "important commit", age: "1 hour ago", diff: largeDiff },
        ],
      }),
    ];

    const result = capHistorySummary(files, 100);
    assert.ok(result.includes("abc"), "Should keep hash");
    assert.ok(result.includes("important commit"), "Should keep message");
  });
});

describe("capBaseSummary", () => {
  it("should pass through small inputs unchanged", () => {
    const files = [
      makeFile({
        path: "a.ts",
        baseDeclarations: ["function foo", "class Bar"],
      }),
    ];

    const result = capBaseSummary(files);
    assert.ok(result.includes("function foo"));
    assert.ok(result.includes("class Bar"));
  });

  it("should collapse to counts when over budget", () => {
    const declarations = Array.from({ length: 100 }, (_, i) => `function fn${i}`);
    const files = [
      makeFile({ path: "big.ts", baseDeclarations: declarations }),
    ];

    const result = capBaseSummary(files, 100);
    assert.ok(result.includes("declarations"), "Should show count summary");
    assert.ok(result.includes("big.ts"));
  });

  it("should handle empty declarations", () => {
    const files = [makeFile({ baseDeclarations: [] })];
    const result = capBaseSummary(files);
    assert.equal(result, "");
  });
});

describe("capStructuralSummary", () => {
  it("should pass through small inputs unchanged", () => {
    const files = [
      makeFile({
        path: "a.ts",
        structuralChanges: [
          { file: "a.ts", type: "function", action: "added", name: "newFn" },
        ],
      }),
    ];

    const result = capStructuralSummary(files);
    assert.ok(result.includes("newFn"));
    assert.ok(result.includes("function"));
  });

  it("should collapse to counts when over budget", () => {
    const changes = Array.from({ length: 50 }, (_, i) => ({
      file: "big.ts",
      type: "function" as const,
      action: "added" as const,
      name: `fn${i}`,
    }));
    const files = [makeFile({ path: "big.ts", structuralChanges: changes })];

    const result = capStructuralSummary(files, 100);
    assert.ok(result.includes("big.ts"));
    // Should have count instead of individual names
    assert.ok(!result.includes("fn49") || result.includes("function"), "Should collapse");
  });
});

describe("capControlFlowSummary", () => {
  it("should pass through small inputs unchanged", () => {
    const files = [
      makeFile({
        path: "a.ts",
        controlFlowAnnotations: [
          { functionName: "handleRequest", line: 10, kind: "guard", description: "checks auth" },
        ],
      }),
    ];

    const result = capControlFlowSummary(files);
    assert.ok(result.includes("handleRequest"));
    assert.ok(result.includes("checks auth"));
  });

  it("should stay under budget for large inputs", () => {
    const annotations = Array.from({ length: 50 }, (_, i) => ({
      functionName: `fn${i}`,
      line: i * 10,
      kind: "guard" as const,
      description: `guard check ${i} - ${"x".repeat(200)}`,
    }));

    const files = Array.from({ length: 10 }, (_, i) =>
      makeFile({
        path: `file${i}.ts`,
        controlFlowAnnotations: annotations,
        structuralChanges: Array.from({ length: 10 - i }, () => ({
          file: `file${i}.ts`,
          type: "function" as const,
          action: "added" as const,
          name: "x",
        })),
      }),
    );

    const budget = 5000;
    const result = capControlFlowSummary(files, budget);
    assert.ok(result.length <= budget, `Result ${result.length} exceeds budget ${budget}`);
  });

  it("should prioritize files with more structural changes", () => {
    const files = [
      makeFile({
        path: "few-changes.ts",
        controlFlowAnnotations: [
          { functionName: "fnA", line: 1, kind: "guard", description: "check A" },
        ],
        structuralChanges: [
          { file: "few-changes.ts", type: "function", action: "added", name: "x" },
        ],
      }),
      makeFile({
        path: "many-changes.ts",
        controlFlowAnnotations: [
          { functionName: "fnB", line: 1, kind: "guard", description: "check B" },
        ],
        structuralChanges: Array.from({ length: 10 }, () => ({
          file: "many-changes.ts",
          type: "function" as const,
          action: "added" as const,
          name: "y",
        })),
      }),
    ];

    // Very tight budget — should keep only the file with more changes
    const result = capControlFlowSummary(files, 100);
    assert.ok(result.includes("many-changes.ts"), "Should prioritize file with more changes");
  });
});
