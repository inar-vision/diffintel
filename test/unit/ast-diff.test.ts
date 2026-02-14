import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeFile, extractDeclarations } from "../../src/explain/ast-diff";
import { extractDeclarationsGeneric } from "../../src/explain/generic-extractor";
import { hasLanguageForExt } from "../../src/parsing/parser";
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
    assert.deepEqual(analysis.baseDeclarations, []);
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
    assert.deepEqual(analysis.baseDeclarations, ["existing (function)"]);
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

  it("should analyze Python files when grammar is available", () => {
    if (!hasLanguageForExt(".py")) return;
    const diff: FileDiff = {
      path: "app.py",
      status: "added",
      hunks: "",
      additions: 5,
      deletions: 0,
      newContent: `import os\n\ndef hello():\n    return "world"\n\nclass UserService:\n    pass`,
      recentHistory: [],
    };
    const analysis = analyzeFile(diff);
    assert.equal(analysis.language, "python");
    assert.ok(analysis.structuralChanges.length >= 3);
    const types = analysis.structuralChanges.map((c) => c.type);
    assert.ok(types.includes("import"));
    assert.ok(types.includes("function"));
    assert.ok(types.includes("class"));
  });

  it("should analyze Go files when grammar is available", () => {
    if (!hasLanguageForExt(".go")) return;
    const diff: FileDiff = {
      path: "main.go",
      status: "added",
      hunks: "",
      additions: 5,
      deletions: 0,
      newContent: `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello")\n}\n\ntype Config struct {\n\tName string\n}`,
      recentHistory: [],
    };
    const analysis = analyzeFile(diff);
    assert.equal(analysis.language, "go");
    assert.ok(analysis.structuralChanges.length >= 2);
    const names = analysis.structuralChanges.map((c) => c.name);
    assert.ok(names.includes("main"));
    assert.ok(names.includes("Config"));
  });

  it("should return empty structural changes for unsupported extension", () => {
    const diff: FileDiff = {
      path: "data.yaml",
      status: "modified",
      hunks: "some diff",
      additions: 1,
      deletions: 1,
      oldContent: "key: old",
      newContent: "key: new",
      recentHistory: [],
    };
    const analysis = analyzeFile(diff);
    assert.equal(analysis.structuralChanges.length, 0);
    assert.equal(analysis.language, null);
  });
});

describe("multi-language extractDeclarations", () => {
  it("should extract Python declarations", () => {
    if (!hasLanguageForExt(".py")) return;
    const decls = extractDeclarationsGeneric(
      `import os\nfrom pathlib import Path\n\ndef greet(name):\n    return f"Hello {name}"\n\nclass Greeter:\n    pass\n\nMAX = 100`,
      ".py",
    );
    const types = decls.map((d) => d.type);
    assert.ok(types.includes("import"), "should find imports");
    assert.ok(types.includes("function"), "should find functions");
    assert.ok(types.includes("class"), "should find classes");
    assert.ok(types.includes("variable"), "should find variables");
  });

  it("should extract Go declarations", () => {
    if (!hasLanguageForExt(".go")) return;
    const decls = extractDeclarationsGeneric(
      `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello")\n}\n\ntype Config struct {\n\tName string\n}\n\nvar Version = "1.0"\n\nconst MaxRetries = 3`,
      ".go",
    );
    const names = decls.map((d) => d.name);
    assert.ok(names.includes("main"), "should find main function");
    assert.ok(names.includes("Config"), "should find Config type");
    assert.ok(names.includes("Version"), "should find var");
    assert.ok(names.includes("MaxRetries"), "should find const");
  });

  it("should extract Rust declarations", () => {
    if (!hasLanguageForExt(".rs")) return;
    const decls = extractDeclarationsGeneric(
      `use std::io;\n\nfn main() {\n    println!("Hello");\n}\n\nstruct Config {\n    name: String,\n}\n\nconst MAX: u32 = 100;`,
      ".rs",
    );
    const types = decls.map((d) => d.type);
    assert.ok(types.includes("import"), "should find use declarations");
    assert.ok(types.includes("function"), "should find functions");
    assert.ok(types.includes("class"), "should find structs as class");
    assert.ok(types.includes("variable"), "should find consts");
  });

  it("should extract C declarations", () => {
    if (!hasLanguageForExt(".c")) return;
    const decls = extractDeclarationsGeneric(
      `#include <stdio.h>\n\nint counter = 0;\n\nvoid hello() {\n    printf("Hello\\n");\n}\n\nstruct Point {\n    int x;\n    int y;\n};`,
      ".c",
    );
    const names = decls.map((d) => d.name);
    assert.ok(names.includes("hello"), "should find function");
    assert.ok(names.includes("Point"), "should find struct");
  });

  it("should extract Java declarations", () => {
    if (!hasLanguageForExt(".java")) return;
    const decls = extractDeclarationsGeneric(
      `import java.util.List;\n\npublic class Main {\n    public void run() {}\n}`,
      ".java",
    );
    const types = decls.map((d) => d.type);
    assert.ok(types.includes("import"), "should find imports");
    assert.ok(types.includes("class"), "should find classes");
  });

  it("should handle fallback for unconfigured but parseable extensions", () => {
    // .jsx is configured, so this tests the normal path
    const decls = extractDeclarationsGeneric(
      `function App() { return null; }`,
      ".jsx",
    );
    assert.ok(decls.length > 0);
  });
});
