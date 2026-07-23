import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const uiDir = path.join(root, "src/components/ui");
const htmlDir = path.join(uiDir, "html");
const requiredSharedFiles = [
  "assets/ui.css",
  "assets/ui.js",
  "index.html",
  "README.md",
  "manifest.json",
  "mockups/admin-dashboard.html",
];

const components = readdirSync(uiDir)
  .filter((file) => file.endsWith(".tsx"))
  .map((file) => path.basename(file, ".tsx"))
  .sort();

const missing = [];
const unexpectedCss = [];

for (const file of requiredSharedFiles) {
  const target = path.join(htmlDir, file);
  if (!existsSync(target)) {
    missing.push(path.relative(root, target));
  }
}

for (const component of components) {
  const preview = path.join(htmlDir, "previews", component, "index.html");
  const snippet = path.join(htmlDir, "snippets", `${component}.html`);
  if (!existsSync(preview)) {
    missing.push(path.relative(root, preview));
  }
  if (!existsSync(snippet)) {
    missing.push(path.relative(root, snippet));
  }
}

if (existsSync(htmlDir)) {
  const stack = [htmlDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(target);
      } else if (
        entry.name.endsWith(".css") &&
        path.relative(htmlDir, target) !== "assets/ui.css"
      ) {
        unexpectedCss.push(path.relative(root, target));
      }
    }
  }
}

if (missing.length || unexpectedCss.length) {
  console.error("UI HTML snippet validation failed.");
  if (missing.length) {
    console.error("\nMissing files:");
    for (const file of missing) {
      console.error(`- ${file}`);
    }
  }
  if (unexpectedCss.length) {
    console.error("\nUnexpected CSS files outside assets/ui.css:");
    for (const file of unexpectedCss) {
      console.error(`- ${file}`);
    }
  }
  process.exit(1);
}

console.log(
  `Validated ${components.length} composable UI HTML snippets in ${path.relative(root, htmlDir)}`
);
