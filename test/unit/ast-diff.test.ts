import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeFile, extractDeclarations } from "../../src/explain/ast-diff";
import { FileDiff } from "../../src/explain/types";

describe("extractDeclarations", () => {
  it("should extract function declarations", () => {
    const source = `function hello() { return "world"; }`;
    const decls = extractDeclarations(source, ".ts");
    assert.equal(decls.length, 1);
    assert.equal(decls[0].name, "hello");
    assert.equal(decls[0].type, "function");
  });

  it("should extract arrow functions as functions", () => {
    const source = `const greet = (name: string) => \`hello \${name}\`;`;
    const decls = extractDeclarations(source, ".ts");
    assert.equal(decls.length, 1);
    assert.equal(decls[0].name, "greet");
    assert.equal(decls[0].type, "function");
  });

  it("should extract class declarations", () => {
    const source = `class UserService { getUser() { return null; } }`;
    const decls = extractDeclarations(source, ".ts");
    assert.equal(decls.length, 1);
    assert.equal(decls[0].name, "UserService");
    assert.equal(decls[0].type, "class");
  });

  it("should extract import statements", () => {
    const source = `import express from "express";\nimport { Router } from "express";`;
    const decls = extractDeclarations(source, ".ts");
    const imports = decls.filter((d) => d.type === "import");
    assert.equal(imports.length, 2);
  });

  it("should extract variable declarations", () => {
    const source = `const PORT = 3000;`;
    const decls = extractDeclarations(source, ".ts");
    assert.equal(decls.length, 1);
    assert.equal(decls[0].name, "PORT");
    assert.equal(decls[0].type, "variable");
  });

  it("should handle empty source", () => {
    const decls = extractDeclarations("", ".ts");
    assert.equal(decls.length, 0);
  });

  it("should handle whitespace-only source", () => {
    const decls = extractDeclarations("   \n\n  ", ".ts");
    assert.equal(decls.length, 0);
  });
});

describe("analyzeFile", () => {
  it("should mark all declarations as added for new files", () => {
    const diff: FileDiff = {
      path: "src/new.ts",
      status: "added",
      hunks: "",
      additions: 3,
      deletions: 0,
      newContent: `function hello() { return "world"; }\nconst x = 42;`,
    };
    const analysis = analyzeFile(diff);
    assert.equal(analysis.structuralChanges.length, 2);
    assert.ok(analysis.structuralChanges.every((c) => c.action === "added"));
  });

  it("should mark all declarations as removed for deleted files", () => {
    const diff: FileDiff = {
      path: "src/old.ts",
      status: "deleted",
      hunks: "",
      additions: 0,
      deletions: 2,
      oldContent: `function goodbye() {}\nclass OldService {}`,
    };
    const analysis = analyzeFile(diff);
    assert.equal(analysis.structuralChanges.length, 2);
    assert.ok(analysis.structuralChanges.every((c) => c.action === "removed"));
  });

  it("should detect added function in modified file", () => {
    const diff: FileDiff = {
      path: "src/app.ts",
      status: "modified",
      hunks: "",
      additions: 1,
      deletions: 0,
      oldContent: `function existing() { return 1; }`,
      newContent: `function existing() { return 1; }\nfunction newFn() { return 2; }`,
    };
    const analysis = analyzeFile(diff);
    const added = analysis.structuralChanges.filter((c) => c.action === "added");
    assert.equal(added.length, 1);
    assert.equal(added[0].name, "newFn");
  });

  it("should detect removed function in modified file", () => {
    const diff: FileDiff = {
      path: "src/app.ts",
      status: "modified",
      hunks: "",
      additions: 0,
      deletions: 1,
      oldContent: `function a() {}\nfunction b() {}`,
      newContent: `function a() {}`,
    };
    const analysis = analyzeFile(diff);
    const removed = analysis.structuralChanges.filter((c) => c.action === "removed");
    assert.equal(removed.length, 1);
    assert.equal(removed[0].name, "b");
  });

  it("should detect modified function (same name, different body)", () => {
    const diff: FileDiff = {
      path: "src/app.ts",
      status: "modified",
      hunks: "",
      additions: 1,
      deletions: 1,
      oldContent: `function greet() { return "hello"; }`,
      newContent: `function greet() { return "goodbye"; }`,
    };
    const analysis = analyzeFile(diff);
    assert.equal(analysis.structuralChanges.length, 1);
    assert.equal(analysis.structuralChanges[0].action, "modified");
    assert.equal(analysis.structuralChanges[0].name, "greet");
  });

  it("should detect new import", () => {
    const diff: FileDiff = {
      path: "src/app.ts",
      status: "modified",
      hunks: "",
      additions: 1,
      deletions: 0,
      oldContent: `import a from "a";`,
      newContent: `import a from "a";\nimport b from "b";`,
    };
    const analysis = analyzeFile(diff);
    const added = analysis.structuralChanges.filter((c) => c.action === "added");
    assert.equal(added.length, 1);
    assert.equal(added[0].type, "import");
  });

  it("should return empty structuralChanges for non-JS file", () => {
    const diff: FileDiff = {
      path: "README.md",
      status: "modified",
      hunks: "@@ some diff @@",
      additions: 5,
      deletions: 2,
      oldContent: "# Old",
      newContent: "# New",
    };
    const analysis = analyzeFile(diff);
    assert.equal(analysis.structuralChanges.length, 0);
    assert.equal(analysis.language, null);
    assert.equal(analysis.rawDiff, "@@ some diff @@");
  });

  it("should handle empty file content gracefully", () => {
    const diff: FileDiff = {
      path: "src/empty.ts",
      status: "added",
      hunks: "",
      additions: 0,
      deletions: 0,
      newContent: "",
    };
    const analysis = analyzeFile(diff);
    assert.equal(analysis.structuralChanges.length, 0);
  });
});
