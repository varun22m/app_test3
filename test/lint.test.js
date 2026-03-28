const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const workspaceRoot = path.resolve(__dirname, "..");
const lintScriptPath = path.join(workspaceRoot, "scripts", "lint.js");

const requiredFiles = [
  "src/greeting.js",
  "hello0.js",
  "hello1.js",
  "hello2.js",
  "hello3.js",
  "test/greeting.test.js"
];

function createWorkspace(filesByPath) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lint-workspace-"));

  fs.mkdirSync(path.join(tempRoot, "scripts"), { recursive: true });
  fs.copyFileSync(lintScriptPath, path.join(tempRoot, "scripts", "lint.js"));

  for (const relativePath of requiredFiles) {
    const filePath = path.join(tempRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, filesByPath[relativePath] ?? 'console.log("ok");\r\n');
  }

  return tempRoot;
}

test("lint passes for files that use CRLF line endings without trailing spaces", () => {
  const tempRoot = createWorkspace({
    "src/greeting.js": "const value = 1;\r\n"
  });

  const result = spawnSync(process.execPath, ["scripts/lint.js"], {
    cwd: tempRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Lint passed/);
});

test("lint fails when a file contains actual trailing spaces", () => {
  const tempRoot = createWorkspace({
    "src/greeting.js": "const value = 1;  \r\n"
  });

  const result = spawnSync(process.execPath, ["scripts/lint.js"], {
    cwd: tempRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /src\/greeting\.js:1 has trailing whitespace/);
});
