import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { parseFile, parseSource } from "../../src/parsing";

describe("Tree-sitter parser — JavaScript", () => {
  it("parses source string and returns program root", () => {
    const { tree } = parseSource('const x = 1;');
    assert.equal(tree.rootNode.type, "program");
  });

  it("provides access to child nodes", () => {
    const { tree } = parseSource('const x = 1;\nconst y = 2;');
    assert.equal(tree.rootNode.namedChildCount, 2);
    assert.equal(tree.rootNode.namedChildren[0].type, "lexical_declaration");
    assert.equal(tree.rootNode.namedChildren[1].type, "lexical_declaration");
  });

  it("reports correct 0-indexed line numbers (row)", () => {
    const { tree } = parseSource('// line 0\n// line 1\nconst x = 1;');
    const decl = tree.rootNode.namedChildren.find(
      (c) => c.type === "lexical_declaration"
    )!;
    // tree-sitter is 0-indexed, so line 3 in 1-indexed is row 2
    assert.equal(decl.startPosition.row, 2);
  });

  it("parseFile reads and parses a file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "parser-test-"));
    const file = path.join(dir, "test.js");
    fs.writeFileSync(file, 'function hello() { return 1; }');
    try {
      const { tree, source } = parseFile(file);
      assert.equal(tree.rootNode.type, "program");
      assert.ok(source.includes("function hello"));
    } finally {
      fs.unlinkSync(file);
      fs.rmdirSync(dir);
    }
  });
});

describe("Tree-sitter parser — TypeScript", () => {
  it("parses TypeScript source with type annotations", () => {
    const { tree } = parseSource('const x: number = 1;', ".ts");
    assert.equal(tree.rootNode.type, "program");
    assert.equal(tree.rootNode.hasError, false);
  });

  it("parses TypeScript function with generics", () => {
    const { tree } = parseSource('function identity<T>(arg: T): T { return arg; }', ".ts");
    assert.equal(tree.rootNode.type, "program");
    assert.equal(tree.rootNode.hasError, false);
  });

  it("parseFile picks TypeScript grammar from .ts extension", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "parser-test-"));
    const file = path.join(dir, "test.ts");
    fs.writeFileSync(file, 'const x: string = "hello";');
    try {
      const { tree } = parseFile(file);
      assert.equal(tree.rootNode.type, "program");
      assert.equal(tree.rootNode.hasError, false);
    } finally {
      fs.unlinkSync(file);
      fs.rmdirSync(dir);
    }
  });
});

describe("Tree-sitter parser — TSX", () => {
  it("parses TSX source with JSX elements", () => {
    const { tree } = parseSource('const el = <div className="test">hello</div>;', ".tsx");
    assert.equal(tree.rootNode.type, "program");
    assert.equal(tree.rootNode.hasError, false);
  });

  it("parses TSX with type annotations and JSX", () => {
    const code = 'const App: React.FC = () => <h1>Hello</h1>;';
    const { tree } = parseSource(code, ".tsx");
    assert.equal(tree.rootNode.type, "program");
    assert.equal(tree.rootNode.hasError, false);
  });
});
