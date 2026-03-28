const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const files = [
  "src/greeting.js",
  "hello0.js",
  "hello1.js",
  "hello2.js",
  "hello3.js",
  "test/greeting.test.js"
];

let hasError = false;

for (const relativePath of files) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`Missing file: ${relativePath}`);
    hasError = true;
    continue;
  }

  const content = fs.readFileSync(fullPath, "utf8");
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    if (/\s+$/.test(line)) {
      console.error(`${relativePath}:${index + 1} has trailing whitespace`);
      hasError = true;
    }
  });
}

if (hasError) {
  process.exit(1);
}

console.log("Lint passed");
