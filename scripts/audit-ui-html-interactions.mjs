import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const htmlDir = path.join(root, "src/components/ui/html");
const previewsDir = path.join(htmlDir, "previews");
const mockupsDir = path.join(htmlDir, "mockups");
const reportDir = path.join(root, "tmp/ui-html-visual-audit");
const screenshotDir = path.join(reportDir, "screenshots");

mkdirSync(screenshotDir, { recursive: true });

const components = readdirSync(previewsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const interactionAudits = {
  accordion: async (page, record) => {
    await expectVisible(page, ".df-accordion-item[data-open] > div", record);
    await page.locator(".df-accordion-item").nth(1).locator("button").click();
    await expectVisible(
      page,
      ".df-accordion-item:nth-child(2)[data-open] > div",
      record
    );
  },
  "alert-dialog": async (page, record) =>
    dialogAudit(page, record, "alert-dialog"),
  button: async (page, record) => buttonAudit(page, record),
  "button-group": async (page, record) =>
    segmentedAudit(page, record, ".df-button-group button"),
  carousel: async (page, record) => {
    const before = await transformOf(page, ".df-carousel-track");
    await page.locator("[data-carousel-next]").click();
    const after = await transformOf(page, ".df-carousel-track");
    if (before === after) {
      record.fail("carousel next control did not move the track");
    }
    await page.locator("[data-carousel-prev]").click();
  },
  checkbox: async (page, record) =>
    inputToggleAudit(page, record, "input[type='checkbox']"),
  collapsible: async (page, record) => collapseAudit(page, record, "permit"),
  "context-menu": async (page, record) => {
    await page
      .locator("[data-context-target]")
      .click({ button: "right", position: { x: 80, y: 70 } });
    await expectVisible(page, "[data-context-menu]", record);
  },
  dialog: async (page, record) => dialogAudit(page, record, "dialog"),
  drawer: async (page, record) => {
    const before = await transformOf(page, "[data-drawer]");
    await page.locator("[data-drawer-open]").click();
    await expectClass(page, "[data-drawer]", "open", record);
    await page.waitForTimeout(260);
    const after = await transformOf(page, "[data-drawer]");
    if (before === after) {
      record.fail("drawer open control did not change transform");
    }
  },
  "dropdown-menu": async (page, record) => menuAudit(page, record, "dropdown"),
  "file-uploader": async (page, record) => {
    await expectVisible(page, "[data-file-upload]", record);
    const input = page.locator("[data-file-upload] input[type='file']");
    if ((await input.count()) !== 1) {
      record.fail("file uploader is missing its file input");
    }
  },
  "hover-card": async (page, record) => {
    await page.locator("[data-hover-card]").hover();
    await expectVisible(page, ".df-hover-card", record);
  },
  "input-otp": async (page, record) => {
    await page.locator("[data-otp] input").nth(3).fill("8");
    const focused = await page.evaluate(() =>
      document.activeElement?.matches("[data-otp] input:nth-child(5)")
    );
    if (!focused) {
      record.fail("OTP input did not advance focus after entry");
    }
  },
  "intro-disclosure": async (page, record) =>
    collapseAudit(page, record, "intro"),
  popover: async (page, record) =>
    menuAudit(
      page,
      record,
      "popover",
      "[data-popover-trigger]",
      "[data-popover]"
    ),
  "radio-group": async (page, record) => {
    await page.locator("input[type='radio']").nth(1).check();
    const checked = await page
      .locator("input[type='radio']")
      .nth(1)
      .isChecked();
    if (!checked) {
      record.fail("radio option did not become checked");
    }
  },
  resizable: async (page, record) => {
    const handle = page.locator(".df-resizable > button");
    await expectVisible(page, ".df-resizable", record);
    if ((await handle.count()) !== 1) {
      record.fail("resizable panel is missing its handle");
    }
  },
  select: async (page, record) => menuAudit(page, record, "select"),
  sheet: async (page, record) => {
    const before = await transformOf(page, "[data-sheet]");
    await page.locator("[data-sheet-open]").click();
    await expectClass(page, "[data-sheet]", "open", record);
    await page.waitForTimeout(260);
    const after = await transformOf(page, "[data-sheet]");
    if (before === after) {
      record.fail("sheet open control did not change transform");
    }
  },
  slider: async (page, record) => {
    await page.locator("input[type='range']").evaluate((node) => {
      node.value = "82";
      node.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const value = await page.locator("input[type='range']").inputValue();
    if (value !== "82") {
      record.fail("slider value did not update");
    }
  },
  "sortable-list": async (page, record) => sortableAudit(page, record),
  sortableMileStoneList: async (page, record) => sortableAudit(page, record),
  switch: async (page, record) =>
    inputToggleAudit(page, record, "input[type='checkbox']"),
  tabs: async (page, record) => tabsAudit(page, record),
  "direction-aware-tabs": async (page, record) => tabsAudit(page, record),
  toggle: async (page, record) => {
    await page.locator("[data-toggle]").click();
    await expectVisible(page, "[data-toggle]", record);
  },
  "toggle-group": async (page, record) =>
    segmentedAudit(page, record, ".df-toggle-group button"),
  tooltip: async (page, record) => {
    await page.locator("[data-tooltip]").hover();
    await expectVisible(page, ".df-tooltip", record);
  },
};

class Record {
  constructor(component) {
    this.component = component;
    this.failures = [];
    this.notes = [];
    this.screenshots = [];
  }

  fail(message) {
    this.failures.push(message);
  }

  note(message) {
    this.notes.push(message);
  }
}

async function main() {
  const browser = await chromium.launch();
  const desktop = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  const records = [];

  for (const component of components) {
    const record = new Record(component);
    records.push(record);
    await inspectPage(desktop, component, record, "desktop");
    await inspectMobile(mobile, component, record);
  }
  const mockupRecord = new Record("mockups/admin-dashboard");
  records.push(mockupRecord);
  await inspectMockup(desktop, mockupRecord);

  await browser.close();

  const failures = records.filter((record) => record.failures.length > 0);
  const report = {
    checked: records.length,
    failures: failures.map(({ component, failures }) => ({
      component,
      failures,
    })),
    records,
  };

  writeFileSync(
    path.join(reportDir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`
  );
  writeFileSync(path.join(reportDir, "report.md"), markdownReport(report));
  console.log(`Audited ${records.length} HTML snippets.`);
  console.log(`Screenshots: ${path.relative(root, screenshotDir)}`);
  console.log(
    `Report: ${path.relative(root, path.join(reportDir, "report.md"))}`
  );

  if (failures.length) {
    console.error(
      `${failures.length} snippets failed visual/interaction audit.`
    );
    process.exit(1);
  }
}

async function inspectPage(page, component, record, viewportName) {
  const url = `file://${path.join(previewsDir, component, "index.html")}`;
  const pageErrors = [];
  const consoleErrors = [];
  page.removeAllListeners("pageerror");
  page.removeAllListeners("console");
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(80);

  if (pageErrors.length) {
    record.fail(`page errors: ${pageErrors.join("; ")}`);
  }
  if (consoleErrors.length) {
    record.fail(`console errors: ${consoleErrors.join("; ")}`);
  }

  await baseVisualAudit(page, component, record, viewportName);
  await capture(page, component, record, `${viewportName}-initial`);

  const audit = interactionAudits[component];
  if (audit) {
    try {
      await audit(page, record);
    } catch (error) {
      record.fail(`interaction audit crashed: ${error.message}`);
    }
    await page.waitForTimeout(80);
    await capture(page, component, record, `${viewportName}-interacted`);
  } else {
    await genericControlAudit(page, record);
    record.note(
      "No component-specific behavior required; generic controls were inspected."
    );
  }
}

async function inspectMobile(page, component, record) {
  const url = `file://${path.join(previewsDir, component, "index.html")}`;
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(80);
  await baseVisualAudit(page, component, record, "mobile");
  if (["drawer", "sheet", "sonner"].includes(component)) {
    await capture(page, component, record, "mobile-initial");
  }
}

async function inspectMockup(page, record) {
  const url = `file://${path.join(mockupsDir, "admin-dashboard.html")}`;
  const pageErrors = [];
  const consoleErrors = [];
  page.removeAllListeners("pageerror");
  page.removeAllListeners("console");
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(120);
  if (pageErrors.length) {
    record.fail(`page errors: ${pageErrors.join("; ")}`);
  }
  if (consoleErrors.length) {
    record.fail(`console errors: ${consoleErrors.join("; ")}`);
  }
  await baseMockupAudit(page, record);
  await page.locator("[data-menu-trigger='admin-actions']").click();
  await expectVisible(page, "[data-menu='admin-actions']", record);
  await page.locator("[data-popover-trigger]").click();
  await expectVisible(page, "[data-popover]", record);
  await page.locator("[data-sheet-open]").click();
  await expectClass(page, "[data-sheet]", "open", record);
  await page.locator("[data-dialog-open='release-confirm']").click();
  await expectVisible(page, "[data-dialog='release-confirm']", record);
  await page.screenshot({
    path: path.join(screenshotDir, "mockups-admin-dashboard-interacted.png"),
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });
}

async function baseMockupAudit(page, record) {
  const metrics = await page.evaluate(() => ({
    h1: document.querySelector("h1")?.textContent?.trim() ?? "",
    panels: document.querySelectorAll(".mockup-panel").length,
    metrics: document.querySelectorAll(".mockup-metric").length,
    tasks: document.querySelectorAll(".mockup-task").length,
    horizontalOverflow:
      document.documentElement.scrollWidth > window.innerWidth + 1,
    controls: document.querySelectorAll("button, input, textarea, select, a")
      .length,
  }));
  if (metrics.h1 !== "Lender admin control plane") {
    record.fail("admin dashboard mockup did not render expected h1");
  }
  if (
    metrics.panels < 4 ||
    metrics.metrics < 4 ||
    metrics.tasks < 5 ||
    metrics.controls < 12
  ) {
    record.fail(
      "admin dashboard mockup rendered with missing composed UI sections"
    );
  }
  if (metrics.horizontalOverflow) {
    record.fail("admin dashboard mockup has horizontal overflow");
  }
}

async function baseVisualAudit(page, _component, record, viewportName) {
  const metrics = await page.evaluate(() => {
    const stage = document.querySelector(".snippet-stage");
    const h1 = document.querySelector("h1");
    const body = document.body.getBoundingClientRect();
    const controls = [
      ...document.querySelectorAll(
        "button, a, input, textarea, select, [role='button'], [tabindex]"
      ),
    ].map((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        tag: node.tagName.toLowerCase(),
        text: node.textContent?.trim().slice(0, 48) ?? "",
        width: rect.width,
        height: rect.height,
        hidden:
          node.hidden ||
          node.closest(".df-drawer:not(.open), .df-sheet:not(.open)") !==
            null ||
          style.display === "none" ||
          style.visibility === "hidden" ||
          (typeof node.checkVisibility === "function"
            ? !node.checkVisibility({
                checkOpacity: false,
                checkVisibilityCSS: true,
              })
            : rect.width <= 0 || rect.height <= 0),
        disabled: node.disabled === true,
        pointerEvents: style.pointerEvents,
        cursor: style.cursor,
        opacity: Number.parseFloat(style.opacity),
        type: node.getAttribute("type") ?? "",
      };
    });
    return {
      title: h1?.textContent?.trim() ?? "",
      stageCount: document.querySelectorAll(".snippet-stage").length,
      stageWidth: stage?.getBoundingClientRect().width ?? 0,
      stageHeight: stage?.getBoundingClientRect().height ?? 0,
      bodyHeight: body.height,
      horizontalOverflow:
        document.documentElement.scrollWidth > window.innerWidth + 1,
      controls,
    };
  });

  if (!metrics.title) {
    record.fail(`${viewportName}: missing h1`);
  }
  if (
    metrics.stageCount !== 1 ||
    metrics.stageWidth < 240 ||
    metrics.stageHeight < 240
  ) {
    record.fail(`${viewportName}: preview stage is missing or too small`);
  }
  if (metrics.bodyHeight < 300) {
    record.fail(`${viewportName}: page rendered suspiciously short`);
  }
  if (metrics.horizontalOverflow) {
    record.fail(`${viewportName}: horizontal overflow detected`);
  }

  for (const control of metrics.controls) {
    if (control.hidden || control.disabled || control.type === "file") {
      continue;
    }
    if (control.width <= 0 || control.height <= 0) {
      record.fail(
        `${viewportName}: interactable ${control.tag} "${control.text}" has no visible box`
      );
    }
    if (control.pointerEvents === "none") {
      record.fail(
        `${viewportName}: interactable ${control.tag} "${control.text}" blocks pointer events`
      );
    }
    if (
      control.opacity === 0 &&
      !["checkbox", "radio"].includes(control.type)
    ) {
      record.fail(
        `${viewportName}: interactable ${control.tag} "${control.text}" is fully transparent`
      );
    }
  }
}

async function genericControlAudit(page, _record) {
  const firstButton = page.locator("button").first();
  if ((await firstButton.count()) > 0) {
    await firstButton.click({ trial: true });
  }
  const firstInput = page
    .locator(
      "input:not([type='file']):not([type='range']):not([type='checkbox']):not([type='radio']):not([type='number'])"
    )
    .first();
  if ((await firstInput.count()) > 0) {
    await firstInput.fill("Verified");
  }
  const numberInput = page.locator("input[type='number']").first();
  if ((await numberInput.count()) > 0) {
    await numberInput.fill("512");
  }
  const textarea = page.locator("textarea").first();
  if ((await textarea.count()) > 0) {
    await textarea.fill("Verified visual audit note");
  }
  const select = page.locator("select").first();
  if ((await select.count()) > 0) {
    const options = await select.locator("option").count();
    if (options > 1) {
      await select.selectOption({ index: 1 });
    }
  }
}

async function buttonAudit(page, record) {
  const buttons = page.locator(".df-button");
  const count = await buttons.count();
  if (count < 6) {
    record.fail("button preview does not expose all expected variants");
  }
  for (let index = 0; index < count; index += 1) {
    await buttons.nth(index).click({ trial: true });
  }
}

async function capture(page, component, record, state) {
  const file = path.join(
    screenshotDir,
    `${component.replaceAll("/", "-")}-${state}.png`
  );
  await page
    .locator(".snippet-stage")
    .screenshot({ path: file, animations: "disabled", caret: "hide" });
  const size = statSync(file).size;
  record.screenshots.push(path.relative(root, file));
  if (size < 1500) {
    record.fail(`${state}: screenshot is suspiciously small (${size} bytes)`);
  }
}

async function dialogAudit(page, record, id) {
  await page.locator(`[data-dialog-open="${id}"]`).click();
  await expectVisible(page, `[data-dialog="${id}"]`, record);
  await page.locator(`[data-dialog-close="${id}"]`).first().click();
  const hidden = await page
    .locator(`[data-dialog="${id}"]`)
    .evaluate((node) => node.hidden);
  if (!hidden) {
    record.fail(`${id} close control did not hide dialog`);
  }
  await page.locator(`[data-dialog-open="${id}"]`).click();
  await expectVisible(page, `[data-dialog="${id}"]`, record);
}

async function menuAudit(
  page,
  record,
  id,
  triggerSelector = `[data-menu-trigger="${id}"]`,
  menuSelector = `[data-menu="${id}"]`
) {
  await page.locator(triggerSelector).click();
  await expectVisible(page, menuSelector, record);
}

async function collapseAudit(page, record, id) {
  const selector = `[data-collapse-panel="${id}"]`;
  const before = await page.locator(selector).evaluate((node) => node.hidden);
  await page.locator(`[data-collapse="${id}"]`).click();
  const after = await page.locator(selector).evaluate((node) => node.hidden);
  if (before === after) {
    record.fail(`${id} collapse trigger did not toggle panel hidden state`);
  }
}

async function tabsAudit(page, record) {
  await page.locator("[data-tab]").nth(1).click();
  const active = await page
    .locator("[data-tab-panel='evidence']")
    .evaluate((node) => node.classList.contains("active"));
  if (!active) {
    record.fail("tab trigger did not activate matching panel");
  }
}

async function segmentedAudit(page, record, selector) {
  const buttons = page.locator(selector);
  const count = await buttons.count();
  if (count < 2) {
    record.fail(`segmented control ${selector} has fewer than two options`);
    return;
  }
  await buttons.nth(1).click({ trial: true });
}

async function inputToggleAudit(page, record, selector) {
  const input = page.locator(selector).first();
  const before = await input.isChecked();
  await input.click({ force: true });
  const after = await input.isChecked();
  if (before === after) {
    record.fail(`${selector} did not toggle checked state`);
  }
}

async function sortableAudit(page, record) {
  const firstText = await page.locator(".df-sort-item").first().innerText();
  const source = page.locator(".df-sort-item").first();
  const target = page.locator(".df-sort-item").nth(2);
  await source.dragTo(target);
  const newFirstText = await page.locator(".df-sort-item").first().innerText();
  if (firstText === newFirstText) {
    record.fail("sortable drag did not reorder items");
  }
}

async function expectVisible(page, selector, record) {
  const visible = await page
    .locator(selector)
    .first()
    .isVisible()
    .catch(() => false);
  if (!visible) {
    record.fail(`${selector} was not visible after interaction`);
  }
}

async function expectClass(page, selector, className, record) {
  const hasClass = await page
    .locator(selector)
    .evaluate((node, name) => node.classList.contains(name), className);
  if (!hasClass) {
    record.fail(`${selector} did not receive .${className}`);
  }
}

async function transformOf(page, selector) {
  return await page
    .locator(selector)
    .evaluate((node) => getComputedStyle(node).transform);
}

function markdownReport(report) {
  const lines = [
    "# UI HTML Visual and Interaction Audit",
    "",
    `Checked ${report.checked} snippets.`,
    "",
    report.failures.length
      ? `Failures: ${report.failures.length}`
      : "Failures: 0",
    "",
  ];

  for (const record of report.records) {
    lines.push(`## ${record.component}`);
    lines.push(
      record.failures.length
        ? `- Failures: ${record.failures.join("; ")}`
        : "- Failures: none"
    );
    if (record.notes.length) {
      lines.push(`- Notes: ${record.notes.join("; ")}`);
    }
    lines.push(`- Screenshots: ${record.screenshots.join(", ")}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

await main();
