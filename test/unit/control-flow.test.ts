import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseChangedLines, extractControlFlow } from "../../src/explain/control-flow";

describe("parseChangedLines", () => {
  it("should extract added line numbers from a hunk", () => {
    const hunks = `@@ -0,0 +1,5 @@
+line one
+line two
+line three
+line four
+line five`;
    const lines = parseChangedLines(hunks);
    assert.deepEqual([...lines].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  });

  it("should handle mixed additions, deletions, and context lines", () => {
    const hunks = `@@ -10,6 +10,7 @@
 context line
-deleted line
+added line
+another added line
 context line
 more context`;
    const lines = parseChangedLines(hunks);
    // Line 10 = context (no change), deleted doesn't advance,
    // line 11 = added, line 12 = added, line 13 = context, line 14 = context
    assert.deepEqual([...lines].sort((a, b) => a - b), [11, 12]);
  });

  it("should handle multiple hunks", () => {
    const hunks = `@@ -1,3 +1,4 @@
 context
+added at line 2
 context
@@ -10,3 +11,4 @@
 context
+added at line 12
 context`;
    const lines = parseChangedLines(hunks);
    assert.ok(lines.has(2));
    assert.ok(lines.has(12));
    assert.equal(lines.size, 2);
  });

  it("should return empty set for empty hunks", () => {
    const lines = parseChangedLines("");
    assert.equal(lines.size, 0);
  });
});

describe("extractControlFlow", () => {
  it("should detect if-return guard in a function", () => {
    const source = `
function run() {
  if (fs.existsSync(path)) {
    console.error("already exists");
    return 1;
  }
  fs.writeFileSync(path, data);
  return 0;
}`;
    // All lines are "changed"
    const changedLines = new Set([2, 3, 4, 5, 6, 7, 8, 9]);
    const annotations = extractControlFlow(source, ".ts", changedLines);
    assert.equal(annotations.length, 1);
    assert.equal(annotations[0].kind, "guard");
    assert.equal(annotations[0].functionName, "run");
    assert.ok(annotations[0].description.includes("existsSync"));
  });

  it("should detect if-throw guard", () => {
    const source = `
function validate(input: string) {
  if (!input) {
    throw new Error("missing input");
  }
  return process(input);
}`;
    const changedLines = new Set([2, 3, 4, 5, 6]);
    const annotations = extractControlFlow(source, ".ts", changedLines);
    assert.equal(annotations.length, 1);
    assert.equal(annotations[0].kind, "guard");
    assert.ok(annotations[0].description.includes("!input"));
  });

  it("should detect try-catch around changed lines", () => {
    const source = `
function doWork() {
  try {
    riskyOperation();
  } catch (err) {
    console.error(err);
  }
}`;
    const changedLines = new Set([3, 4]);
    const annotations = extractControlFlow(source, ".ts", changedLines);
    assert.equal(annotations.length, 1);
    assert.equal(annotations[0].kind, "try-catch");
    assert.equal(annotations[0].functionName, "doWork");
  });

  it("should not produce annotations when no changed lines are in the function", () => {
    const source = `
function guarded() {
  if (exists) {
    return;
  }
  doStuff();
}`;
    // Changed lines are outside this function
    const changedLines = new Set([20, 21, 22]);
    const annotations = extractControlFlow(source, ".ts", changedLines);
    assert.equal(annotations.length, 0);
  });

  it("should not flag if-statements without early exit as guards", () => {
    const source = `
function example() {
  if (condition) {
    console.log("hello");
  }
  doStuff();
}`;
    const changedLines = new Set([2, 3, 4, 5, 6]);
    const annotations = extractControlFlow(source, ".ts", changedLines);
    assert.equal(annotations.length, 0);
  });

  it("should return empty for non-parseable extensions", () => {
    const source = "some random content";
    const changedLines = new Set([1]);
    const annotations = extractControlFlow(source, ".xyz", changedLines);
    assert.equal(annotations.length, 0);
  });

  it("should return empty for empty source", () => {
    const annotations = extractControlFlow("", ".ts", new Set([1]));
    assert.equal(annotations.length, 0);
  });

  it("should return empty for empty changed lines", () => {
    const source = `function foo() { return 1; }`;
    const annotations = extractControlFlow(source, ".ts", new Set());
    assert.equal(annotations.length, 0);
  });

  it("should detect guard with process.exit", () => {
    const source = `
function main() {
  if (!config) {
    console.error("no config");
    process.exit(1);
  }
  startServer(config);
}`;
    const changedLines = new Set([2, 3, 4, 5, 6, 7]);
    const annotations = extractControlFlow(source, ".ts", changedLines);
    assert.equal(annotations.length, 1);
    assert.equal(annotations[0].kind, "guard");
    assert.ok(annotations[0].description.includes("!config"));
  });

  it("should detect multiple guards in a single function", () => {
    const source = `
function init() {
  if (fs.existsSync(file)) {
    return 1;
  }
  if (!isValid(input)) {
    throw new Error("invalid");
  }
  doWork();
}`;
    const changedLines = new Set([2, 3, 4, 5, 6, 7, 8, 9]);
    const annotations = extractControlFlow(source, ".ts", changedLines);
    const guards = annotations.filter((a) => a.kind === "guard");
    assert.equal(guards.length, 2);
  });
});
