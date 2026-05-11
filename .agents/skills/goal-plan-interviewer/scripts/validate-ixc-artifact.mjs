#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [filePath] = process.argv.slice(2);

const interactiveTags = new Set(["a", "button", "input", "select", "textarea"]);

function fail(message) {
  console.error(`IXC artifact validation failed: ${message}`);
  process.exitCode = 1;
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attrMap(tag) {
  const attrs = new Map();
  const attrPattern =
    /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = attrPattern.exec(tag))) {
    const [, name, doubleQuoted, singleQuoted, bare] = match;
    if (!name || name.startsWith("<")) {
      continue;
    }
    attrs.set(name.toLowerCase(), doubleQuoted ?? singleQuoted ?? bare ?? "");
  }
  return attrs;
}

function tagName(tag) {
  return tag.match(/^<\s*([a-zA-Z0-9-]+)/)?.[1]?.toLowerCase() ?? "";
}

function collectTags(html, attrName) {
  const pattern = new RegExp(
    `<([a-zA-Z0-9-]+)\\b(?=[^>]*\\s${attrName}(?:\\s*=|\\s|>))[^>]*>`,
    "gi"
  );
  return [...html.matchAll(pattern)].map((match) => match[0]);
}

function elementInnerHtml(html, openTag) {
  const name = tagName(openTag);
  const start = html.indexOf(openTag);
  if (
    start < 0 ||
    ["input", "img", "br", "hr", "meta", "link"].includes(name)
  ) {
    return "";
  }
  const afterOpen = start + openTag.length;
  const closePattern = new RegExp(`</${name}\\s*>`, "i");
  const closeMatch = closePattern.exec(html.slice(afterOpen));
  return closeMatch ? html.slice(afterOpen, afterOpen + closeMatch.index) : "";
}

if (!filePath) {
  fail("provide a path to an HTML artifact");
  process.exit();
}

const resolvedPath = path.resolve(
  filePath.replace(/^~(?=$|\/)/, process.env.HOME ?? "~")
);

if (!fs.existsSync(resolvedPath)) {
  fail(`file does not exist: ${resolvedPath}`);
  process.exit();
}

const html = fs.readFileSync(resolvedPath, "utf8");
const ids = new Set(
  [...html.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1])
);
let errors = 0;

function check(condition, message) {
  if (!condition) {
    errors += 1;
    console.error(`- ${message}`);
  }
}

check(
  /<section\b[^>]*\bid\s*=\s*["']goal-plan["'][^>]*\bdata-ixc-contract\s*=\s*["']GOAL-PLAN["'][^>]*>/i.test(
    html
  ) ||
    /<section\b[^>]*\bdata-ixc-contract\s*=\s*["']GOAL-PLAN["'][^>]*\bid\s*=\s*["']goal-plan["'][^>]*>/i.test(
      html
    ),
  'missing <section id="goal-plan" data-ixc-contract="GOAL-PLAN">'
);

for (const tag of collectTags(html, "data-ixc-contract")) {
  const attrs = attrMap(tag);
  check(
    Boolean(attrs.get("id")),
    `${tagName(tag)} with data-ixc-contract="${attrs.get("data-ixc-contract")}" is missing id`
  );
}

for (const tag of collectTags(html, "data-ixc-step")) {
  const attrs = attrMap(tag);
  const id = attrs.get("id");
  check(
    Boolean(id),
    `${tagName(tag)} with data-ixc-step="${attrs.get("data-ixc-step")}" is missing id`
  );
  check(
    tagName(tag) === "article",
    `data-ixc-step="${attrs.get("data-ixc-step")}" must be on an article`
  );
  const inner = elementInnerHtml(html, tag);
  check(
    /href\s*=\s*["']#[^"']+["']/i.test(inner),
    `flow step ${id ?? attrs.get("data-ixc-step")} must link to a local target`
  );
}

for (const tag of collectTags(html, "data-ixc-ref")) {
  const attrs = attrMap(tag);
  const name = tagName(tag);
  const id = attrs.get("id");
  check(
    Boolean(id),
    `${name} with data-ixc-ref="${attrs.get("data-ixc-ref")}" is missing id`
  );

  const role = attrs.get("role")?.toLowerCase();
  const isInteractive =
    interactiveTags.has(name) ||
    role === "button" ||
    role === "link" ||
    attrs.has("tabindex") ||
    attrs.has("onclick");

  if (isInteractive) {
    const innerText = stripTags(elementInnerHtml(html, tag));
    const ariaLabel = attrs.get("aria-label")?.trim();
    const title = attrs.get("title")?.trim();
    check(
      Boolean(innerText || ariaLabel || title),
      `interactive data-ixc-ref="${attrs.get("data-ixc-ref")}" needs visible text, aria-label, or title`
    );
  }
}

for (const match of html.matchAll(/href\s*=\s*["']#([^"']+)["']/gi)) {
  check(
    ids.has(match[1]),
    `local href="#${match[1]}" does not resolve to an element id`
  );
}

check(
  /\sid\s*=\s*["']completion-contract["']/i.test(html),
  'completion contract block with id="completion-contract" is missing'
);
check(
  /data-ixc-contract-item\s*=\s*["']CC-/i.test(html),
  'completion contract item with data-ixc-contract-item="CC-*" is missing'
);
const goalCommandMatch = html.match(
  /<[^>]+\bdata-ixc-goal-command\b[^>]*>([\s\S]*?)<\/[^>]+>/i
);
check(
  Boolean(goalCommandMatch),
  "recommended /goal command with data-ixc-goal-command is missing"
);
if (goalCommandMatch) {
  const goalCommandText = stripTags(goalCommandMatch[1]);
  check(
    /\/goal\b/i.test(goalCommandText),
    "recommended goal command must include /goal"
  );
  check(
    /(\bfile:\/\/\/|\/Users\/|~\/|\.html\b)/i.test(goalCommandText),
    "recommended goal command must include the HTML artifact path or file URL"
  );
  check(
    /authoritative/i.test(goalCommandText),
    "recommended goal command must tell the agent the HTML artifact is authoritative"
  );
  check(
    /completion contract/i.test(goalCommandText),
    "recommended goal command must mention the completion contract"
  );
  check(
    /traceability|mocked UI|flow steps/i.test(goalCommandText),
    "recommended goal command must mention traceability, mocked UI, or flow steps"
  );
  check(
    /progress/i.test(goalCommandText),
    "recommended goal command must instruct the agent to track progress"
  );
}
check(
  /class\s*=\s*["'][^"']*\bmock-screen\b[^"']*["'][^>]*\bdata-ixc-ref\s*=/i.test(
    html
  ) ||
    /data-ixc-ref\s*=\s*["']SCREEN-[^"']+["'][^>]*class\s*=\s*["'][^"']*\bmock-screen\b/i.test(
      html
    ),
  'at least one mocked app screen must use class="mock-screen" and data-ixc-ref'
);
check(
  /mock-screen[\s\S]*?(100vw|100dvw|100%)[\s\S]*?(100vh|100dvh|min-height:\s*100vh|min-height:\s*100dvh)/i.test(
    html
  ) ||
    /100vh[\s\S]*?mock-screen/i.test(html) ||
    /100dvh[\s\S]*?mock-screen/i.test(html),
  "mock-screen CSS must make mocked app screens full viewport height/width"
);
if (/\bmock-flow\b/i.test(html)) {
  check(
    /<h1\b[^>]*>[\s\S]*?flow start/i.test(html),
    'mock-flow groups need a visible h1 containing "Flow start"'
  );
  check(
    /<h1\b[^>]*>[\s\S]*?flow end/i.test(html),
    'mock-flow groups need a visible h1 containing "Flow end"'
  );
}

const contractItems = [
  ...html.matchAll(
    /<li\b[^>]*\bdata-ixc-contract-item\s*=\s*["'](CC-[^"']+)["'][^>]*>/gi
  ),
];
for (const match of contractItems) {
  const openTag = match[0];
  const itemId = match[1];
  const inner = elementInnerHtml(html, openTag);
  check(
    /Interactions<\/dt>\s*<dd>[\s\S]*?INT-/i.test(inner),
    `${itemId} is missing interaction mapping`
  );
  check(
    /Constraints<\/dt>\s*<dd>[\s\S]*?CON-/i.test(inner),
    `${itemId} is missing constraint mapping`
  );
  check(
    /Requirements<\/dt>\s*<dd>[\s\S]*?REQ-/i.test(inner),
    `${itemId} is missing requirement mapping`
  );
  check(
    /Success Criteria<\/dt>\s*<dd>[\s\S]*?SC-/i.test(inner),
    `${itemId} is missing success criteria mapping`
  );
  check(
    /Validation<\/dt>\s*<dd>[\s\S]*?VAL-/i.test(inner),
    `${itemId} is missing validation mapping`
  );
  check(
    /Evidence Required<\/dt>\s*<dd>[\s\S]*?\S/i.test(inner),
    `${itemId} is missing evidence required mapping`
  );
  check(
    /(Mocked Elements|Flow Steps)<\/dt>\s*<dd>[\s\S]*?(data-ixc-ref|UI-|FLOW-|href="#)/i.test(
      inner
    ),
    `${itemId} is missing mocked UI or flow mapping`
  );
}

const goalPlanIndex = html.search(
  /<section\b[^>]*(?:\bid\s*=\s*["']goal-plan["'][^>]*\bdata-ixc-contract\s*=\s*["']GOAL-PLAN["']|\bdata-ixc-contract\s*=\s*["']GOAL-PLAN["'][^>]*\bid\s*=\s*["']goal-plan["'])/i
);
const laterSection =
  goalPlanIndex >= 0 ? html.slice(goalPlanIndex + 1).search(/<section\b/i) : -1;
check(
  laterSection < 0,
  "goal-plan section must be the last section in the document"
);

if (errors > 0) {
  fail(`${errors} issue(s) found in ${resolvedPath}`);
  process.exit();
}

console.log(`IXC artifact validation passed: ${resolvedPath}`);
