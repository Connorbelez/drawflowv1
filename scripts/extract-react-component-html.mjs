import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = process.cwd();
const htmlDir = path.join(root, "src/components/ui/html");
const defaultOutDir = path.join(htmlDir, "composed");

const args = parseArgs(process.argv.slice(2));

if (!args.component) {
  printUsage();
  process.exit(1);
}

const componentPath = path.resolve(root, args.component);
if (!existsSync(componentPath)) {
  console.error(
    `Component file does not exist: ${path.relative(root, componentPath)}`
  );
  process.exit(1);
}

const exportName = args.export ?? "default";
const outName =
  args.out ??
  slugify(path.basename(componentPath).replace(/\.[cm]?[tj]sx?$/, ""));
const outDir = path.resolve(root, args.outDir ?? defaultOutDir);
const styleImport = args.styles
  ? normalizeImport(args.styles)
  : "/src/styles.css";
const width = Number(args.width ?? 1440);
const height = Number(args.height ?? 1000);
const props = await readProps(args.props);
const wrapperClass = args.wrapperClass ?? "component-extract-root";
const includePreview = args.preview !== "false";
const fitContent = args.fit !== "false";

const tempBaseDir = path.join(root, "tmp");
await mkdir(tempBaseDir, { recursive: true });
const tempDir = await mkdtemp(path.join(tempBaseDir, "shadcn-html-extract-"));

try {
  await writeFile(
    path.join(tempDir, "props.json"),
    JSON.stringify(props, null, 2)
  );
  await writeFile(
    path.join(tempDir, "index.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Component extract</title>
    <script type="module" src="/${path.relative(root, path.join(tempDir, "src/extract-entry.jsx"))}"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`
  );
  await mkdir(path.join(tempDir, "src"), { recursive: true });
  await writeFile(
    path.join(tempDir, "src/extract-entry.jsx"),
    `import React from "react";
import { createRoot } from "react-dom/client";
import ${exportName === "default" ? "Component" : `{ ${exportName} as Component }`} from ${JSON.stringify(pathToFileURL(componentPath).href)};
import props from "../props.json";
import ${JSON.stringify(styleImport)};

function ExtractHarness() {
  return (
    <main className=${JSON.stringify(wrapperClass)} data-extract-root style={${fitContent ? '{ display: "inline-block" }' : "{}"}}>
      <Component {...props} />
    </main>
  );
}

const mountNode = document.getElementById("root");
window.__shadcnHtmlExtractRoot ??= createRoot(mountNode);
window.__shadcnHtmlExtractRoot.render(<ExtractHarness />);
`
  );

  const server = await createServer({
    root,
    configFile: false,
    server: {
      host: "127.0.0.1",
      port: 0,
      fs: {
        allow: [root],
      },
    },
    resolve: {
      alias: [
        { find: "#", replacement: path.join(root, "src") },
        { find: "@", replacement: path.join(root, "src") },
        {
          find: /^react$/,
          replacement: path.join(root, "node_modules/react/index.js"),
        },
        {
          find: /^react-dom$/,
          replacement: path.join(root, "node_modules/react-dom/index.js"),
        },
        {
          find: /^react-dom\/client$/,
          replacement: path.join(root, "node_modules/react-dom/client.js"),
        },
        {
          find: /^react\/jsx-dev-runtime$/,
          replacement: path.join(root, "node_modules/react/jsx-dev-runtime.js"),
        },
        {
          find: /^react\/jsx-runtime$/,
          replacement: path.join(root, "node_modules/react/jsx-runtime.js"),
        },
      ],
      dedupe: ["react", "react-dom"],
    },
    plugins: [tailwindcss(), (await import("@vitejs/plugin-react")).default()],
    optimizeDeps: {
      entries: [path.join(tempDir, "src/extract-entry.jsx")],
    },
  });
  await server.listen();
  const address = server.httpServer.address();
  const url = `http://127.0.0.1:${address.port}/${path.relative(root, path.join(tempDir, "index.html"))}`;

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      const text = message.text();
      if (!text.includes("Outdated Optimize Dep")) {
        consoleErrors.push(text);
      }
    }
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-extract-root]");
  await page.waitForTimeout(120);

  if (pageErrors.length || consoleErrors.length) {
    console.error("Component render produced browser errors.");
    for (const error of pageErrors) {
      console.error(`pageerror: ${error}`);
    }
    for (const error of consoleErrors) {
      console.error(`console: ${error}`);
    }
    await browser.close();
    await server.close();
    process.exit(1);
  }

  const fragment = await page.evaluate(
    ({ selector, inlineMode }) => {
      const root = document.querySelector(selector);
      if (!root) {
        throw new Error(`Missing extract root ${selector}`);
      }

      const clone = root.cloneNode(true);
      clone.setAttribute("data-extracted-component", "true");

      if (inlineMode) {
        const originalNodes = [root, ...root.querySelectorAll("*")];
        const clonedNodes = [clone, ...clone.querySelectorAll("*")];
        const properties = [
          "align-items",
          "background",
          "border",
          "border-radius",
          "box-shadow",
          "color",
          "display",
          "flex-direction",
          "font-family",
          "font-size",
          "font-weight",
          "gap",
          "grid-template-columns",
          "height",
          "justify-content",
          "line-height",
          "margin",
          "max-height",
          "max-width",
          "min-height",
          "min-width",
          "opacity",
          "overflow",
          "padding",
          "position",
          "text-align",
          "text-decoration",
          "text-transform",
          "transform",
          "transition",
          "width",
          "white-space",
        ];
        for (let index = 0; index < originalNodes.length; index += 1) {
          const source = originalNodes[index];
          const target = clonedNodes[index];
          const computed = getComputedStyle(source);
          const styles = [];
          for (const property of properties) {
            const value = computed.getPropertyValue(property);
            if (value) {
              styles.push(`${property}:${value}`);
            }
          }
          target.setAttribute("style", styles.join(";"));
        }
      }

      for (const node of clone.querySelectorAll("script")) {
        node.remove();
      }
      return clone.outerHTML;
    },
    { selector: "[data-extract-root]", inlineMode: args.inline !== "false" }
  );

  await mkdir(outDir, { recursive: true });
  const fragmentPath = path.join(outDir, `${outName}.html`);
  await writeFile(fragmentPath, `${fragment}\n`);

  let previewPath = null;
  if (includePreview) {
    const previewDir = path.join(outDir, `${outName}.preview`);
    await mkdir(previewDir, { recursive: true });
    previewPath = path.join(previewDir, "index.html");
    await writeFile(
      previewPath,
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${titleize(outName)} Extract Preview</title>
    <link rel="stylesheet" href="../../assets/ui.css" />
    <script defer src="../../assets/ui.js"></script>
  </head>
  <body>
    <main class="snippet-shell" data-component="${outName}">
      <header class="snippet-header">
        <span class="snippet-eyebrow">Extracted React Component</span>
        <h1>${titleize(outName)}</h1>
        <p>Generated from ${path.relative(root, componentPath)}.</p>
      </header>
      <section class="snippet-stage" aria-label="${titleize(outName)} preview">
${indent(fragment, 8)}
      </section>
    </main>
  </body>
</html>
`
    );
  }

  const screenshotPath = path.join(outDir, `${outName}.png`);
  await page.locator("[data-extract-root]").screenshot({
    path: screenshotPath,
    animations: "disabled",
    caret: "hide",
  });

  await browser.close();
  await server.close();

  console.log(
    `Extracted ${exportName} from ${path.relative(root, componentPath)}`
  );
  console.log(`Fragment: ${path.relative(root, fragmentPath)}`);
  if (previewPath) {
    console.log(`Preview: ${path.relative(root, previewPath)}`);
  }
  console.log(`Screenshot: ${path.relative(root, screenshotPath)}`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        parsed[key] = "true";
      } else {
        parsed[key] = next;
        index += 1;
      }
    } else if (!parsed.component) {
      parsed.component = arg;
    }
  }
  return parsed;
}

async function readProps(propsPath) {
  if (!propsPath) {
    return {};
  }
  const resolved = path.resolve(root, propsPath);
  return JSON.parse(await readFile(resolved, "utf8"));
}

function slugify(value) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function titleize(value) {
  return value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeImport(value) {
  if (value.startsWith(".") || value.startsWith("/")) {
    return pathToFileURL(path.resolve(root, value)).href;
  }
  return value;
}

function indent(value, spaces) {
  const pad = " ".repeat(spaces);
  return value
    .trim()
    .split("\n")
    .map((line) => (line ? `${pad}${line}` : line))
    .join("\n");
}

function printUsage() {
  console.log(`Usage:
  bun scripts/extract-react-component-html.mjs <component-file> [options]

Options:
  --export <name>          Export to render. Defaults to default.
  --props <file.json>      Props JSON file. Defaults to {}.
  --out <name>             Output basename. Defaults to component filename.
  --outDir <dir>           Output directory. Defaults to src/components/ui/html/composed.
  --styles <import-path>   CSS import for render pass. Defaults to /src/styles.css.
  --inline false           Keep class-based markup instead of inlining computed styles.
  --preview false          Skip preview wrapper generation.
  --fit false              Keep the extraction root full-width. Defaults to fit-content.
  --width <px>             Browser viewport width. Defaults to 1440.
  --height <px>            Browser viewport height. Defaults to 1000.

Example:
  bun scripts/extract-react-component-html.mjs src/features/foo/AdminCard.tsx --export AdminCard --props tmp/admin-card-props.json --out admin-card
`);
}
