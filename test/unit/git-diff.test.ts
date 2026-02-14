import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseDiffText } from "../../src/explain/git-diff";

describe("parseDiffText", () => {
  it("should parse a unified diff with an added file", () => {
    const diff = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+export function hello() {
+  return "world";
+}
`;
    const files = parseDiffText(diff);
    assert.equal(files.length, 1);
    assert.equal(files[0].path, "src/new.ts");
    assert.equal(files[0].additions, 3);
    assert.equal(files[0].deletions, 0);
  });

  it("should parse a unified diff with a deleted file", () => {
    const diff = `diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index abc1234..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const x = 1;
-export const y = 2;
`;
    const files = parseDiffText(diff);
    assert.equal(files.length, 1);
    assert.equal(files[0].path, "src/old.ts");
    assert.equal(files[0].additions, 0);
    assert.equal(files[0].deletions, 2);
  });

  it("should parse a unified diff with a modified file", () => {
    const diff = `diff --git a/src/app.ts b/src/app.ts
index abc1234..def5678 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
 import express from "express";
+import cors from "cors";
 const app = express();
-app.listen(3000);
+app.listen(8080);
`;
    const files = parseDiffText(diff);
    assert.equal(files.length, 1);
    assert.equal(files[0].path, "src/app.ts");
    assert.equal(files[0].additions, 2);
    assert.equal(files[0].deletions, 1);
  });

  it("should parse multiple files in one diff", () => {
    const diff = `diff --git a/a.ts b/a.ts
index 1111..2222 100644
--- a/a.ts
+++ b/a.ts
@@ -1 +1,2 @@
 const a = 1;
+const b = 2;
diff --git a/c.ts b/c.ts
new file mode 100644
--- /dev/null
+++ b/c.ts
@@ -0,0 +1 @@
+const c = 3;
`;
    const files = parseDiffText(diff);
    assert.equal(files.length, 2);
    assert.equal(files[0].path, "a.ts");
    assert.equal(files[1].path, "c.ts");
  });

  it("should handle a rename", () => {
    const diff = `diff --git a/old-name.ts b/new-name.ts
similarity index 90%
rename from old-name.ts
rename to new-name.ts
index abc..def 100644
--- a/old-name.ts
+++ b/new-name.ts
@@ -1,2 +1,2 @@
-export const name = "old";
+export const name = "new";
`;
    const files = parseDiffText(diff);
    assert.equal(files.length, 1);
    assert.equal(files[0].path, "new-name.ts");
    assert.equal(files[0].additions, 1);
    assert.equal(files[0].deletions, 1);
  });

  it("should handle empty diff", () => {
    const files = parseDiffText("");
    assert.equal(files.length, 0);
  });

  it("should count additions and deletions correctly", () => {
    const diff = `diff --git a/src/test.ts b/src/test.ts
index aaa..bbb 100644
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,5 +1,7 @@
 line1
-removed1
-removed2
+added1
+added2
+added3
+added4
 line5
`;
    const files = parseDiffText(diff);
    assert.equal(files[0].additions, 4);
    assert.equal(files[0].deletions, 2);
  });
});
