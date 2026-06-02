import { expect, type Locator, type Page, test } from "@playwright/test";

const ADD_DRAW_LABEL = /Add draw/i;
const ADD_CAPITAL_SPIKE_LABEL = /Add capital spike/i;
const ADD_MILESTONE_LABEL = /Add milestone/i;
const ACTIVE_CONNECTOR_CLASS = /to-rose-500/;
const COMPLETED_NODE_BORDER_CLASS = /border-emerald-400/;
const COMPLETED_NODE_TEXT_CLASS = /text-emerald-600/;
const CASH_TEXT = /^\$\d/;
const DAY_LABEL = /^Day \d+$/;
const COPIED_LABEL = /Copied/i;
const COPY_LINK_LABEL = /Copy link/i;
const MAILTO_HREF = /^mailto:/;
const REMOVE_DRAW_LABEL = /Remove draw/i;
const REMOVE_CAPITAL_SPIKE_LABEL = /Remove capital spike/i;
const REMOVE_MILESTONE_LABEL = /Remove milestone/i;
const SHARE_QUERY = /share=/;
const X_SHARE_HREF = /twitter\.com\/intent\/tweet/;

async function openGeneratedTimeline(page: Page) {
  await page.goto("/demo/timeline");
  await expect(
    page.getByTestId("timeline-setup-template-screen"),
  ).toBeVisible();
  await page.getByTestId("timeline-setup-continue-budget").click();
  await expect(page.getByTestId("timeline-setup-budget-screen")).toBeVisible();
  await expect(page.getByTestId("timeline-setup-budget-table")).toBeVisible();
  await page.getByTestId("timeline-setup-complete").click();
  await expect(page.getByTestId("animated-curved-timeline")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await waitForTimelineGeometryStable(page, [
    "site-prep",
    "framing",
    "rough-in",
  ]);
}

async function openDurableGeneratedTimeline(page: Page) {
  await page.goto("/demo/timeline");
  await expect(
    page.getByTestId("timeline-setup-template-screen"),
  ).toBeVisible();
  await page.getByTestId("timeline-setup-continue-budget").click();
  await expect(page.getByTestId("timeline-setup-budget-screen")).toBeVisible();
  await page.getByTestId("timeline-setup-durable-route-toggle").click();
  await expect(
    page.getByTestId("timeline-setup-durable-route-toggle"),
  ).toBeChecked();
  await page.getByTestId("timeline-setup-complete").click();
  await expect(page).toHaveURL(/\/demo\/timeline\/[^/?#]+(?:\?.*)?$/);
  await expect(page.getByTestId("animated-curved-timeline")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
}

test("timeline setup selects a template, edits the blueprint budget table, and generates the roadmap", async ({
  page,
}) => {
  await page.goto("/demo/timeline");

  await expect(
    page.getByTestId("timeline-setup-template-screen"),
  ).toBeVisible();
  await expect(
    page.getByTestId("timeline-setup-template-card-single_family_full_build"),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Proposal Summary")).toBeVisible();
  await expect(page.getByText("What happens next")).toBeVisible();
  await expect(page.getByText("Compliance Note")).toBeVisible();
  await expect(page.getByLabel("Co-pay")).toBeVisible();
  await expect(
    page.getByRole("complementary").getByText("Reimbursement Scope"),
  ).toBeVisible();
  await expect(page.getByLabel("Project address")).toBeVisible();
  await page.getByTestId("timeline-setup-budget-input").fill("$1,320,000");
  await page.getByTestId("timeline-setup-cash-input").fill("$425,000");
  await page.getByTestId("timeline-setup-co-pay-input").fill("$25,000");
  await page.getByTestId("timeline-setup-address-input").fill("Toronto, ON");
  await expect(page.getByText("$1,295,000")).toBeVisible();
  await expect(page.getByText("Toronto, ON")).toBeVisible();
  await page
    .getByTestId("timeline-setup-permit-input")
    .setInputFiles("package.json");
  await expect(page.getByText("package.json")).toBeVisible();
  await page.getByTestId("timeline-setup-skip-permits").click();
  await expect(page.getByTestId("timeline-setup-skip-permits")).toHaveText(
    "Skipped",
  );
  await page.getByTestId("timeline-setup-continue-budget").click();

  await expect(page.getByTestId("timeline-setup-budget-screen")).toBeVisible();
  await expect(
    page.getByTestId("timeline-setup-budget-screen").getByText("Toronto, ON"),
  ).toBeVisible();
  await expect(
    page.getByTestId("timeline-setup-budget-row-site-prep"),
  ).toBeVisible();
  await expect(
    page.getByTestId("timeline-setup-row-name-site-prep"),
  ).toContainText("Site prep & foundation");
  await expect(
    page.getByTestId("timeline-setup-row-name-edit-site-prep-display"),
  ).toHaveCount(0);
  await expect(
    page.getByTestId("timeline-setup-row-expand-site-prep"),
  ).toBeVisible();
  await expect(
    page.getByTestId("timeline-setup-budget-table").getByRole("columnheader", {
      name: "Name",
    }),
  ).toBeVisible();
  for (const position of [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ]) {
    await expect(
      page.getByTestId(`timeline-setup-budget-table-corner-${position}`),
    ).toBeVisible();
  }
  await page
    .getByTestId("timeline-setup-custom-milestone-name")
    .fill("Solar readiness");
  await page.getByTestId("timeline-setup-add-custom-milestone").click();
  await expect(
    page.getByTestId("timeline-setup-budget-row-custom-solar-readiness"),
  ).toBeVisible();
  await expect(
    page.getByTestId("timeline-setup-row-name-custom-solar-readiness"),
  ).toContainText("Solar readiness");
  await expect(
    page.getByTestId(
      "timeline-setup-submilestone-card-custom-solar-readiness-scope-definition-0",
    ),
  ).toBeVisible();
  await page
    .getByTestId("timeline-setup-row-budget-custom-solar-readiness")
    .fill("$50,000");
  await page
    .getByTestId("timeline-setup-row-duration-custom-solar-readiness")
    .fill("7");
  await expect(
    page.getByTestId(
      "timeline-setup-submilestone-card-site-prep-permit-mobilization-0",
    ),
  ).toBeVisible();
  const expectedIconMap = {
    closeout: "closeout",
    drywall: "drywall",
    exterior: "exterior",
    finishes: "finishes",
    framing: "framing",
    "rough-in": "roughIn",
    "site-prep": "foundation",
    "custom-solar-readiness": "change",
  } as const;

  for (const [rowKey, iconKey] of Object.entries(expectedIconMap)) {
    await expect(
      page.getByTestId(`timeline-setup-row-icon-${rowKey}`),
    ).toHaveAttribute("data-icon", iconKey);
    await expect(
      page.getByTestId(`timeline-setup-row-icon-${rowKey}`),
    ).toHaveAttribute("src", /drawflow-milestone-blueprint-icons/);
    await expect(
      page.getByTestId(`timeline-setup-row-drag-${rowKey}`),
    ).toBeAttached();
  }

  await expect(
    page.getByTestId(
      "timeline-setup-submilestone-card-site-prep-permit-mobilization-0",
    ),
  ).toBeVisible();
  await expect(
    page.getByTestId(
      "timeline-setup-submilestone-name-site-prep-permit-mobilization-0",
    ),
  ).toHaveValue("Permit mobilization");
  await page
    .getByTestId("timeline-setup-submilestone-card-site-prep-excavation-1")
    .click();
  await expect(
    page.getByTestId("timeline-setup-submilestone-name-site-prep-excavation-1"),
  ).toHaveValue("Excavation");
  await page
    .getByTestId("timeline-setup-submilestone-budget-site-prep-excavation-1")
    .fill("$44,000");
  await page
    .getByTestId("timeline-setup-submilestone-duration-site-prep-excavation-1")
    .fill("T6");
  await expect(
    page.getByTestId("timeline-setup-submilestone-card-site-prep-excavation-1"),
  ).toContainText("$44,000");
  await expect(
    page.getByTestId("timeline-setup-submilestone-card-site-prep-excavation-1"),
  ).toContainText("T6");
  await page
    .getByTestId("timeline-setup-submilestone-bank-input-site-prep")
    .fill("Final grading");
  await page
    .getByTestId(
      "timeline-setup-submilestone-bank-item-final-grading-and-landscaping",
    )
    .click();
  await expect(
    page
      .locator(
        '[data-testid^="timeline-setup-submilestone-card-site-prep-custom-"]',
      )
      .filter({ hasText: "Final grading and landscaping" }),
  ).toBeVisible();
  for (const [query, itemTestId] of [
    ["Survey staking", "timeline-setup-submilestone-bank-item-survey-staking"],
    [
      "Temporary utilities",
      "timeline-setup-submilestone-bank-item-temporary-utilities",
    ],
    [
      "Topsoil stripping",
      "timeline-setup-submilestone-bank-item-topsoil-stripping",
    ],
  ]) {
    await page
      .getByTestId("timeline-setup-submilestone-bank-input-site-prep")
      .fill(query);
    await page.getByTestId(itemTestId).click();
  }
  await expect(
    page
      .locator(
        '[data-testid^="timeline-setup-submilestone-card-site-prep-custom-"]',
      )
      .filter({ hasText: "Topsoil stripping" }),
  ).toBeVisible();
  const subMilestoneListGeometry = await page
    .getByTestId(
      "timeline-setup-submilestone-card-site-prep-permit-mobilization-0",
    )
    .evaluate((card) => {
      const list = card.closest(".timeline-submilestone-card-list");
      const cards = Array.from(
        list?.querySelectorAll(".timeline-submilestone-card") ?? [],
      );

      return {
        canScroll: list ? list.scrollHeight > list.clientHeight : false,
        minCardHeight: Math.min(
          ...cards.map((candidate) => candidate.getBoundingClientRect().height),
        ),
        overflowY: list ? getComputedStyle(list).overflowY : "",
      };
    });

  expect(subMilestoneListGeometry).toMatchObject({
    canScroll: true,
    overflowY: "auto",
  });
  expect(subMilestoneListGeometry.minCardHeight).toBeGreaterThanOrEqual(66);
  await page
    .getByTestId("timeline-setup-submilestone-bank-input-site-prep")
    .fill("Survey closeout");
  await page
    .getByTestId("timeline-setup-submilestone-bank-create-site-prep")
    .click();
  await expect(
    page
      .locator(
        '[data-testid^="timeline-setup-submilestone-card-site-prep-custom-"]',
      )
      .filter({ hasText: "Survey closeout" }),
  ).toBeVisible();
  await page
    .locator(
      '[data-testid^="timeline-setup-submilestone-card-site-prep-custom-"]',
    )
    .filter({ hasText: "Survey closeout" })
    .click();
  await expect(
    page.locator(
      '[data-testid^="timeline-setup-submilestone-name-site-prep-custom-"]',
    ),
  ).toHaveValue("Survey closeout");
  await page
    .getByTestId("timeline-setup-submilestone-remove-site-prep-excavation-1")
    .click();
  await expect(
    page.getByTestId("timeline-setup-submilestone-card-site-prep-excavation-1"),
  ).toHaveCount(0);
  await page.getByTestId("timeline-setup-row-expand-site-prep").click();

  await dragBudgetRow(page, "framing", "site-prep");
  await expect
    .poll(() => getBudgetRowOrder(page))
    .toEqual([
      "framing",
      "site-prep",
      "rough-in",
      "exterior",
      "drywall",
      "finishes",
      "closeout",
      "custom-solar-readiness",
    ]);
  await page.getByTestId("timeline-setup-row-expand-site-prep").click();
  await expectExpandedSubMilestonesAttached(page, {
    rowKey: "site-prep",
    text: "Survey closeout",
  });

  await page.getByTestId("timeline-setup-row-budget-framing").fill("$180,000");
  await page.getByTestId("timeline-setup-row-duration-framing").fill("20");
  await page.getByTestId("timeline-setup-complete").click();

  await expect(page.getByTestId("animated-curved-timeline")).toBeVisible();
  await expect(page.getByTestId("timeline-card-framing")).toContainText(
    /Milestone 1/i,
  );
  await expect(page.getByTestId("timeline-card-site-prep")).toContainText(
    /Milestone 2/i,
  );
  await expect(page.getByTestId("timeline-draw-marker-framing")).toContainText(
    /Draw 1/i,
  );
  await expect(
    page.getByTestId("timeline-card-custom-solar-readiness"),
  ).toContainText("Solar readiness");
  await page.getByTestId("timeline-card-framing").click();
  await expect(page.getByTestId("timeline-card-cost-framing")).toHaveText(
    "$180,000",
  );
  await expect(page.getByTestId("timeline-card-duration-framing")).toHaveText(
    "20 days",
  );
});

test("settings reuses the timeline worksheet table and compound chart", async ({
  page,
}) => {
  await page.setViewportSize({ height: 1150, width: 1801 });
  await page.goto("/backoffice/settings");

  const emptyState = page.getByText("Configuration needed");
  if (await emptyState.isVisible({ timeout: 5000 }).catch(() => false)) {
    await page.getByRole("button", { name: "Seed defaults" }).last().click();
  }

  await expect(
    page.getByRole("tablist", { name: "Settings sections" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /Demos/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByTestId("timeline-settings-template-blueprint-table"),
  ).toBeVisible();
  await expect(
    page.getByTestId("timeline-setup-budget-table").getByRole("columnheader", {
      name: "Name",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Draw scenarios" }).click();
  await expect(page.getByText("CC-02", { exact: false })).toBeVisible();
  await expect(
    page.getByTestId("timeline-settings-scenario-header"),
  ).toContainText("Set active");
  await expect(
    page.getByTestId("timeline-settings-cashflow-compound-chart"),
  ).toBeVisible();
  const amountInput = page.getByLabel("Draw 03 amount");
  await amountInput.click();
  await amountInput.press(
    process.platform === "darwin" ? "Meta+A" : "Control+A",
  );
  await amountInput.press("Backspace");
  await expect(amountInput).toHaveValue("");
  await amountInput.pressSequentially("15");
  await expect(amountInput).toHaveValue("15");
  await amountInput.pressSequentially("abc%");
  await expect(amountInput).toHaveValue("15");
  await amountInput.blur();
  await expect(amountInput).toHaveValue("15.00%");
  await expect(page.getByText("NaN", { exact: false })).toHaveCount(0);
  const cashflowChart = page.getByTestId(
    "timeline-settings-cashflow-compound-chart",
  );
  await expect
    .poll(() => cashflowChart.locator(".recharts-reference-line").count())
    .toBeGreaterThan(1);
  const cashflowBox = await cashflowChart.boundingBox();
  expect(cashflowBox).not.toBeNull();
  if (cashflowBox) {
    await page.mouse.move(
      cashflowBox.x + cashflowBox.width * 0.5,
      cashflowBox.y + cashflowBox.height * 0.5,
    );
  }
  const cashflowTooltip = page
    .locator(".recharts-tooltip-wrapper")
    .filter({ hasText: /Day \d+/ })
    .last();
  await expect(cashflowTooltip).toContainText(/Day \d+/);
  await expect(cashflowTooltip).not.toContainText("Capital spike");
  await expect(
    page.locator('svg[aria-label="Cashflow preview chart"]'),
  ).toHaveCount(0);

  const templateCard = page
    .locator("aside")
    .filter({ hasText: "Full Build" })
    .getByRole("button")
    .first();
  const activeBadge = templateCard.locator('[data-slot="badge"]').filter({
    hasText: /Active:/,
  });
  await expect(activeBadge).toBeVisible();

  const cardBox = await templateCard.boundingBox();
  const badgeBox = await activeBadge.boundingBox();
  expect(cardBox).not.toBeNull();
  expect(badgeBox).not.toBeNull();
  expect((badgeBox?.x ?? 0) + (badgeBox?.width ?? 0)).toBeLessThanOrEqual(
    (cardBox?.x ?? 0) + (cardBox?.width ?? 0) + 1,
  );
});

test("timeline setup lands generated roadmap at T0", async ({ page }) => {
  await openGeneratedTimeline(page);

  await expect(
    page.getByTestId("selected-draw-details").getByRole("heading", {
      name: "Site prep & foundation",
    }),
  ).toBeVisible();
  await expect(page.getByText("Proposal start")).toBeVisible();
  await page.getByTestId("timeline-card-site-prep").click();
  await expect(
    page.getByTestId("timeline-card-start-date-site-prep"),
  ).toHaveText("Day 0");

  const todayAndStartX = await page.evaluate(() => {
    const today = document.querySelector(
      "[data-testid=timeline-marker-connector-today]",
    );
    const startNode = document.querySelector(
      "[data-testid=demo-timeline-node-site-prep]",
    );

    if (!(today instanceof HTMLElement && startNode instanceof HTMLElement)) {
      return null;
    }

    const todayRect = today.getBoundingClientRect();
    const startRect = startNode.getBoundingClientRect();
    return {
      startNodeCenterX: startRect.left + startRect.width / 2,
      todayX: todayRect.left + todayRect.width / 2,
    };
  });

  expect(todayAndStartX).not.toBeNull();
  expect(
    Math.abs(
      (todayAndStartX?.todayX ?? 0) -
        (todayAndStartX?.startNodeCenterX ?? Number.POSITIVE_INFINITY),
    ),
  ).toBeLessThan(4);
});

test("animated curved timeline demo selects progress and inserts spaced nodes", async ({
  page,
}) => {
  await openGeneratedTimeline(page);

  await expect(page.getByTestId("animated-curved-timeline")).toBeVisible();
  await expect(page.getByTestId("demo-timeline-node-rough-in")).toBeVisible();
  await expect(page.getByTestId("timeline-cashflow-ending-cash")).toHaveText(
    "$400,000",
  );
  await expect(
    page.getByTestId("timeline-cashflow-risk-summary"),
  ).toContainText("Clear");
  await expect(page.getByTestId("timeline-cash-shortfall-point")).toHaveCount(
    0,
  );
  await expect(page.getByTestId("timeline-draw-total-available")).toHaveText(
    "$1,250,000",
  );
  await expect(page.getByTestId("timeline-draw-interest-bearing")).toHaveText(
    "$1,250,000",
  );
  await expect(
    page.getByTestId("timeline-draw-additional-available"),
  ).toHaveText("$0");

  const viewport = page.getByTestId("timeline-scroll-viewport");
  await expect
    .poll(async () =>
      viewport.evaluate((element) => element.scrollWidth > element.clientWidth),
    )
    .toBe(true);

  await page.getByTestId("demo-timeline-node-closeout").click();
  await expect(
    page.getByTestId("selected-draw-details").getByRole("heading", {
      name: "Final inspection & closeout",
    }),
  ).toBeVisible();

  await openTimelineInsertMenu(page, { x: 520, y: 48 });
  await expect(page.getByTestId("timeline-insert-menu")).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: ADD_DRAW_LABEL }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: ADD_CAPITAL_SPIKE_LABEL }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: REMOVE_DRAW_LABEL }),
  ).toBeHidden();
  await expect(
    page.getByRole("menuitem", { name: REMOVE_MILESTONE_LABEL }),
  ).toBeHidden();
  await page.getByRole("menuitem", { name: ADD_MILESTONE_LABEL }).click();

  await expect(
    page.getByTestId("selected-draw-details").getByRole("heading", {
      name: "Field change 1",
    }),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid^="demo-timeline-node-inserted-"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-testid^="timeline-card-connector-inserted-"]'),
  ).toHaveCount(1);

  await openTimelineInsertMenu(page, { x: 620, y: 48 });
  await page.getByRole("menuitem", { name: ADD_DRAW_LABEL }).click();
  const manualDrawMarker = page
    .locator('[data-testid^="timeline-draw-marker-manual-draw-"]')
    .first();
  await expect(manualDrawMarker).toBeVisible();
  await expect(page.getByTestId("timeline-cashflow-ending-cash")).toHaveText(
    "$500,000",
  );
  await expect(page.getByTestId("timeline-draw-interest-bearing")).toHaveText(
    "$1,457,500",
  );

  await manualDrawMarker.click();
  const manualDrawEditor = page
    .locator('[data-testid^="timeline-draw-editor-manual-draw-"]')
    .first();
  await manualDrawEditor.getByLabel("Draw amount").fill("150000");
  await manualDrawEditor.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("timeline-cashflow-ending-cash")).toHaveText(
    "$550,000",
  );
  await expect(page.getByTestId("timeline-draw-interest-bearing")).toHaveText(
    "$1,507,500",
  );
  await expect(page.getByTestId("timeline-draw-total-available")).toHaveText(
    "$1,507,500",
  );
  await expect(
    page.getByTestId("timeline-draw-additional-available"),
  ).toHaveText("$0");
  await expect(page.getByTestId("timeline-final-financial-card")).toBeVisible();
  await expect(page.getByTestId("timeline-final-draw-fees")).toHaveText(
    "$4,500",
  );
});

test("timeline renders milestone completion nodes and phase-aware cards", async ({
  page,
}) => {
  await openGeneratedTimeline(page);

  await expect(page.getByTestId("animated-curved-timeline")).toBeVisible();
  await expect(page.getByTestId("demo-timeline-node-rough-in")).toBeVisible();
  await expect(
    page.getByTestId("demo-timeline-end-node-rough-in"),
  ).toBeVisible();
  await expect(
    page.getByTestId("timeline-card-connector-rough-in"),
  ).toHaveCount(1);
  await expect(
    page.getByTestId("timeline-card-connector-rough-in-end"),
  ).toHaveCount(0);

  await page.getByTestId("demo-timeline-node-rough-in").click();
  await expect(page.getByTestId("timeline-card-status-rough-in")).toHaveText(
    "In progress",
  );

  await page.getByTestId("demo-timeline-end-node-rough-in").click();
  await expect(page.getByTestId("timeline-card-status-rough-in")).toHaveText(
    "In progress",
  );
  await expect(
    page.getByTestId("demo-timeline-end-node-rough-in"),
  ).not.toHaveClass(COMPLETED_NODE_BORDER_CLASS);
  await page.getByTestId("timeline-card-rough-in").click();
  await expect(
    page.getByTestId("timeline-card-start-date-rough-in"),
  ).toHaveText("Day 52");
  await expect(page.getByTestId("timeline-card-duration-rough-in")).toHaveText(
    "20 days",
  );
});

test("timeline milestone cards expand in place without collapsing the card layout", async ({
  page,
}) => {
  await openGeneratedTimeline(page);

  const card = page.getByTestId("timeline-card-site-prep");
  await expect(card).toBeVisible();

  const collapsedBox = await card.boundingBox();
  expect(collapsedBox).not.toBeNull();
  expect(collapsedBox?.height).toBeGreaterThanOrEqual(250);
  expect(collapsedBox?.height).toBeLessThanOrEqual(300);

  await card.click();

  await expect(
    page.getByTestId("timeline-card-start-date-site-prep"),
  ).toBeVisible();
  await expect(page.getByTestId("timeline-card-close-site-prep")).toBeVisible();
  await expect
    .poll(async () => {
      const box = await card.boundingBox();
      return Boolean(
        box &&
        box.width > 360 &&
        box.width < 390 &&
        box.height > 370 &&
        box.height < 430,
      );
    })
    .toBe(true);

  const expandedBox = await card.boundingBox();
  expect(expandedBox).not.toBeNull();
  expect(expandedBox?.width).toBeGreaterThan(360);
  expect(expandedBox?.width).toBeLessThan(390);
  expect(expandedBox?.height).toBeGreaterThan(370);
  expect(expandedBox?.height).toBeLessThan(430);
  const wrapperGeometry = await card.evaluate((element) => {
    const wrapper = element.firstElementChild;
    const content = wrapper?.firstElementChild;
    const toGeometry = (node: Element | null | undefined) => {
      if (!node) {
        return null;
      }
      const rect = node.getBoundingClientRect();
      const styles = getComputedStyle(node);

      return {
        height: rect.height,
        overflowY: styles.overflowY,
      };
    };

    return {
      content: toGeometry(content),
      wrapper: toGeometry(wrapper),
    };
  });
  expect(wrapperGeometry.wrapper?.height).toBeGreaterThan(370);
  expect(wrapperGeometry.content?.height).toBeGreaterThan(370);
  expect(wrapperGeometry.wrapper?.overflowY).toBe("visible");
  expect(wrapperGeometry.content?.overflowY).toBe("visible");

  await card.click({ position: { x: 16, y: 16 } });
  await expect(
    page.getByTestId("timeline-card-start-date-site-prep"),
  ).toBeVisible();

  await card.getByText("Excavation").scrollIntoViewIfNeeded();
  const lowerWhitespace = await card.evaluate((element) => {
    const cardRect = element.getBoundingClientRect();
    const chips = Array.from(
      element.querySelectorAll("span.rounded-md"),
    ).filter((chip) => chip.textContent?.trim());
    const lowestChipBottom = Math.max(
      ...chips.map((chip) => chip.getBoundingClientRect().bottom),
    );

    return cardRect.bottom - lowestChipBottom;
  });
  expect(lowerWhitespace).toBeGreaterThan(20);
  expect(lowerWhitespace).toBeLessThan(130);
  const chipHitTest = await card.evaluate((element) => {
    const chip = Array.from(element.querySelectorAll("span.rounded-md")).find(
      (candidate) => candidate.textContent?.trim() === "Excavation",
    );

    if (!chip) {
      return null;
    }

    const rect = chip.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.bottom - 2,
    );
    const hitChip = hit?.closest("span.rounded-md");

    return {
      chipHeight: rect.height,
      hitText: hitChip?.textContent?.trim() ?? "",
    };
  });
  expect(chipHitTest?.chipHeight).toBeGreaterThan(20);
  expect(chipHitTest?.hitText).toContain("Excavation");
  await expect(card).toContainText("Sub-milestones");
  await expect(card).toContainText("Excavation");

  const headingBox = await card
    .getByRole("heading", {
      name: "Site prep & foundation",
    })
    .boundingBox();
  expect(headingBox).not.toBeNull();
  expect(headingBox?.width).toBeGreaterThan(80);
  expect(headingBox?.height).toBeLessThanOrEqual(56);

  await page.getByTestId("timeline-card-close-site-prep").click();
  await expect(
    page.getByTestId("timeline-card-start-date-site-prep"),
  ).toBeHidden();
  await expect
    .poll(async () => {
      const box = await card.boundingBox();
      return Boolean(
        box &&
        box.width > 220 &&
        box.width < 245 &&
        box.height > 250 &&
        box.height < 310,
      );
    })
    .toBe(true);
});

test("expanded milestone cards edit schedule and cost fields", async ({
  page,
}) => {
  await openGeneratedTimeline(page);

  const card = page.getByTestId("timeline-card-framing");
  await card.click();

  const startDate = page.getByTestId("timeline-card-start-date-framing");
  const duration = page.getByTestId("timeline-card-duration-framing");
  const plannedCost = page.getByTestId("timeline-card-cost-framing");
  const initialPayment = page.getByTestId(
    "timeline-card-initial-payment-framing",
  );
  const completionPayment = page.getByTestId(
    "timeline-card-completion-payment-framing",
  );

  await expect(startDate).toHaveText("Day 24");
  await expect(duration).toHaveText("18 days");
  await expect(plannedCost).toHaveText("$160,000");
  await expect(initialPayment).toHaveText("$0");
  await expect(completionPayment).toHaveText("$0");

  await expect
    .poll(async () => {
      const expandedMetricBoxes = await Promise.all(
        [startDate, duration, initialPayment, completionPayment].map((metric) =>
          requiredRelativeBox(metric, card),
        ),
      );
      const metricValueY = expandedMetricBoxes[0]?.y ?? 0;

      return Math.max(
        ...expandedMetricBoxes.map((metricBox) =>
          Math.abs(metricBox.y - metricValueY),
        ),
      );
    })
    .toBeLessThanOrEqual(1);

  await startDate.click();
  await page.getByTestId("timeline-card-start-date-framing-input").fill("42");
  await page
    .getByTestId("timeline-card-start-date-framing-input")
    .press("Enter");
  await expect(startDate).toHaveText("Day 42");

  const durationBoxBeforeEdit = await requiredRelativeBox(duration, card);
  const initialPaymentBoxBeforeEdit = await requiredRelativeBox(
    initialPayment,
    card,
  );

  await duration.click();
  const durationInput = page.getByTestId(
    "timeline-card-duration-framing-input",
  );
  await expect(durationInput).toBeFocused();

  const durationBoxEditing = await requiredRelativeBox(duration, card);
  const initialPaymentBoxEditing = await requiredRelativeBox(
    initialPayment,
    card,
  );
  const durationSuffixBox = await requiredRelativeBox(
    page.getByTestId("timeline-card-duration-framing-suffix"),
    card,
  );

  expect(
    Math.abs(durationBoxEditing.width - durationBoxBeforeEdit.width),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(initialPaymentBoxEditing.x - initialPaymentBoxBeforeEdit.x),
  ).toBeLessThanOrEqual(2);
  expect(durationSuffixBox.x).toBeGreaterThanOrEqual(durationBoxEditing.x - 1);
  expect(durationSuffixBox.x + durationSuffixBox.width).toBeLessThanOrEqual(
    durationBoxEditing.x + durationBoxEditing.width + 1,
  );

  await durationInput.fill("21");
  await durationInput.press("Enter");
  await expect(duration).toHaveText("21 days");

  const plannedCostBoxBeforeEdit = await requiredBox(plannedCost);
  await plannedCost.click();
  const plannedCostInput = page.getByTestId("timeline-card-cost-framing-input");
  await expect(plannedCostInput).toBeFocused();
  const plannedCostBoxEditing = await requiredBox(plannedCost);

  expect(
    Math.abs(plannedCostBoxEditing.width - plannedCostBoxBeforeEdit.width),
  ).toBeLessThanOrEqual(1);

  await plannedCostInput.fill("175000");
  await plannedCostInput.press("Enter");
  await expect(plannedCost).toHaveText("$175,000");

  await initialPayment.click();
  await page
    .getByTestId("timeline-card-initial-payment-framing-input")
    .fill("25000");
  await page
    .getByTestId("timeline-card-initial-payment-framing-input")
    .press("Enter");
  await expect(initialPayment).toHaveText("$25,000");
  await expect(completionPayment).toHaveText("$0");
  await expect(card).not.toContainText("Daily spend");

  await duration.click();
  await page.getByTestId("timeline-card-duration-framing-input").fill("9");
  await page
    .getByTestId("timeline-card-duration-framing-input")
    .press("Escape");
  await expect(duration).toHaveText("21 days");
  await expect(card).toContainText("Sub-milestones");
});

test("timeline keeps handoff spacing between completion and next milestone start", async ({
  page,
}) => {
  await openGeneratedTimeline(page);

  await expect(page.getByTestId("animated-curved-timeline")).toBeVisible();
  await expect(
    page.getByTestId("demo-timeline-end-node-rough-in"),
  ).toBeVisible();
  await expect(page.getByTestId("demo-timeline-node-exterior")).toBeVisible();

  const handoffGap = await getTimelineHandoffGap(page, {
    endNodeId: "rough-in",
    nextStartNodeId: "exterior",
  });

  expect(handoffGap).not.toBeNull();
  expect(handoffGap).toBeGreaterThanOrEqual(24);
});

test("timeline snapshot share links hydrate editable forks", async ({
  context,
  page,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://localhost:3000",
  });
  await openGeneratedTimeline(page);

  await page.getByTestId("demo-timeline-node-closeout").click();
  await expect(
    page.getByTestId("selected-draw-details").getByRole("heading", {
      name: "Final inspection & closeout",
    }),
  ).toBeVisible();
  await page.getByRole("switch").click();
  await expect(page.getByRole("switch")).toBeChecked();

  const drawMarker = page.getByTestId("timeline-draw-marker-rough-in");
  await drawMarker.click();
  const editor = page.getByTestId("timeline-draw-editor-rough-in");
  await editor.getByLabel("Draw date").fill("108");
  await editor.getByLabel("Draw amount").fill("255000");
  await editor.getByRole("button", { name: "Apply" }).click();
  await expect(drawMarker).toContainText("$255,000");
  await expect(drawMarker).toContainText("Day 108");

  await page.getByTestId("timeline-share-button").click();
  await expect(page.getByTestId("timeline-share-menu")).toBeVisible();
  await expect(page.getByTestId("timeline-share-qr")).toBeVisible();
  await expect(page.getByTestId("timeline-share-disclaimer")).toHaveText(
    "live collaboration session under construction",
  );
  await expect(page.getByTestId("timeline-share-url")).toHaveValue(SHARE_QUERY);

  const shareUrl = await page.getByTestId("timeline-share-url").inputValue();
  expect(shareUrl).toContain("/demo/timeline?share=");
  await expect(page.getByTestId("timeline-share-x")).toHaveAttribute(
    "href",
    X_SHARE_HREF,
  );
  await expect(page.getByTestId("timeline-share-email")).toHaveAttribute(
    "href",
    MAILTO_HREF,
  );

  await page.getByRole("button", { name: COPY_LINK_LABEL }).click();
  await expect(page.getByRole("button", { name: COPIED_LABEL })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(shareUrl);

  const sharedPage = await context.newPage();
  await sharedPage.goto(shareUrl);
  await expect(
    sharedPage.getByTestId("animated-curved-timeline"),
  ).toBeVisible();
  await expect(
    sharedPage.getByTestId("selected-draw-details").getByRole("heading", {
      name: "Final inspection & closeout",
    }),
  ).toBeVisible();
  await expect(sharedPage.getByRole("switch")).toBeChecked();
  await expect(
    sharedPage.getByTestId("timeline-draw-marker-rough-in"),
  ).toContainText("$255,000");
  await expect(
    sharedPage.getByTestId("timeline-draw-marker-rough-in"),
  ).toContainText("Day 108");
  await expect(
    sharedPage.getByTestId("timeline-cashflow-ending-cash"),
  ).toHaveText("$410,000");

  await sharedPage.getByTestId("timeline-draw-marker-rough-in").click();
  const forkEditor = sharedPage.getByTestId("timeline-draw-editor-rough-in");
  await forkEditor.getByLabel("Draw amount").fill("260000");
  await forkEditor.getByRole("button", { name: "Apply" }).click();
  await expect(
    sharedPage.getByTestId("timeline-draw-marker-rough-in"),
  ).toContainText("$260,000");

  const pristineSharedPage = await context.newPage();
  await pristineSharedPage.goto(shareUrl);
  await expect(
    pristineSharedPage.getByTestId("timeline-draw-marker-rough-in"),
  ).toContainText("$255,000");
});

test("durable generated timeline persists draw edits and deletes across reload", async ({
  page,
}) => {
  await openDurableGeneratedTimeline(page);

  const drawMarkers = page.locator('[data-testid^="timeline-draw-marker-"]');
  await expect.poll(() => drawMarkers.count()).toBeGreaterThanOrEqual(2);

  const removedDrawTestId = await drawMarkers
    .first()
    .getAttribute("data-testid");
  const editedDrawTestId = await drawMarkers.nth(1).getAttribute("data-testid");
  expect(removedDrawTestId).not.toBeNull();
  expect(editedDrawTestId).not.toBeNull();

  const editedDraw = page.getByTestId(editedDrawTestId ?? "");
  await editedDraw.scrollIntoViewIfNeeded();
  await editedDraw.click();
  const editedDrawDomId = (editedDrawTestId ?? "").replace(
    "timeline-draw-marker-",
    "",
  );
  const editor = page.getByTestId(`timeline-draw-editor-${editedDrawDomId}`);
  await expect(editor).toBeVisible();
  await editor.getByLabel("Draw date").fill("111");
  await editor.getByLabel("Draw amount").fill("123000");
  await editor.getByRole("button", { name: "Apply" }).click();
  await expect(editedDraw).toContainText("Day 111");
  await expect(editedDraw).toContainText("$123,000");

  const removedDraw = page.getByTestId(removedDrawTestId ?? "");
  await removedDraw.scrollIntoViewIfNeeded();
  const removedBox = await removedDraw.boundingBox();
  expect(removedBox).not.toBeNull();
  if (!removedBox) {
    return;
  }
  await page.mouse.click(
    removedBox.x + removedBox.width / 2,
    removedBox.y + removedBox.height / 2,
    { button: "right" },
  );
  await expect(page.getByTestId("timeline-item-context-menu")).toBeVisible();
  await page.getByRole("menuitem", { name: REMOVE_DRAW_LABEL }).click();
  await expect(removedDraw).toHaveCount(0);
  await expect(page.getByTestId("timeline-durable-save-status")).toHaveText(
    "Saved",
  );

  await page.reload();
  await expect(page.getByTestId("animated-curved-timeline")).toBeVisible();
  await expect(page.getByTestId(removedDrawTestId ?? "")).toHaveCount(0);
  await expect(page.getByTestId(editedDrawTestId ?? "")).toContainText(
    "Draw 01",
  );
  await expect(page.getByTestId(editedDrawTestId ?? "")).toContainText(
    "Day 111",
  );
  await expect(page.getByTestId(editedDrawTestId ?? "")).toContainText(
    "$123,000",
  );
});

test("durable generated timeline persists draw approval and locks deletion", async ({
  page,
}) => {
  await openDurableGeneratedTimeline(page);

  const firstDraw = page
    .locator('[data-testid^="timeline-draw-marker-"]')
    .first();
  await expect(firstDraw).toBeVisible();
  const drawTestId = await firstDraw.getAttribute("data-testid");
  expect(drawTestId).not.toBeNull();
  const drawDomId = (drawTestId ?? "").replace("timeline-draw-marker-", "");

  await firstDraw.scrollIntoViewIfNeeded();
  await firstDraw.click();
  await expect(
    page.getByTestId(`selected-draw-request-form-${drawDomId}`),
  ).toBeVisible();
  await page
    .getByTestId(`selected-draw-request-amount-input-${drawDomId}`)
    .fill("1000");
  await page
    .getByTestId(`selected-draw-request-note-${drawDomId}`)
    .fill("Persisted reimbursement request.");
  await page.getByTestId(`selected-draw-submit-request-${drawDomId}`).click();

  await page.getByTestId("timeline-role-lender").click();
  await expect(
    page.getByTestId(`lender-draw-review-panel-${drawDomId}`),
  ).toBeVisible();
  await page
    .getByTestId(`lender-draw-review-note-${drawDomId}`)
    .fill("Admin approval persisted.");
  await page.getByTestId(`lender-draw-approve-${drawDomId}`).click();
  await expect(
    page.getByTestId(`lender-draw-review-panel-${drawDomId}`),
  ).toContainText("Draw approved");
  await expect(page.getByTestId("timeline-durable-save-status")).toHaveText(
    "Saved",
  );

  await page.reload();
  await expect(page.getByTestId("animated-curved-timeline")).toBeVisible();
  await page.getByTestId(drawTestId ?? "").click();
  await expect(page.getByTestId("selected-draw-details")).toContainText(
    "Draw approved",
  );

  const approvedDraw = page.getByTestId(drawTestId ?? "");
  const approvedBox = await approvedDraw.boundingBox();
  expect(approvedBox).not.toBeNull();
  if (!approvedBox) {
    return;
  }
  await page.mouse.click(
    approvedBox.x + approvedBox.width / 2,
    approvedBox.y + approvedBox.height / 2,
    { button: "right" },
  );
  await expect(page.getByTestId("timeline-item-context-menu")).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: REMOVE_DRAW_LABEL }),
  ).toBeDisabled();
  await expect(page.getByTestId("timeline-item-context-menu")).toContainText(
    "Approved reimbursement draws cannot be deleted.",
  );
});

test("timeline route stays responsive across mobile and tablet widths", async ({
  page,
}) => {
  for (const viewport of [
    { height: 844, name: "phone", width: 390 },
    { height: 1024, name: "tablet", width: 768 },
  ]) {
    await page.setViewportSize({
      height: viewport.height,
      width: viewport.width,
    });
    await openGeneratedTimeline(page);

    await expect(page.getByTestId("timeline-cashflow-chart")).toBeVisible();
    await expect(page.getByTestId("animated-curved-timeline")).toBeVisible();
    await expect(
      page.getByTestId("timeline-draw-availability-chart"),
    ).toBeVisible();
    await expectNoPageHorizontalOverflow(page);

    for (const testId of [
      "timeline-cashflow-chart",
      "timeline-roadmap-grid",
      "animated-curved-timeline",
      "timeline-draw-availability-chart",
    ]) {
      await expectBoxWithinViewport(page, testId, viewport.width);
    }

    const timelineBox = await page
      .getByTestId("animated-curved-timeline")
      .boundingBox();
    expect(timelineBox).not.toBeNull();
    if (!timelineBox) {
      return;
    }
    await expect(page.getByTestId("selected-draw-panel")).toBeHidden();
    await expect(page.getByTestId("selected-draw-mobile-drawer")).toBeVisible();
    await expectOverlayWithinViewport(
      page,
      "selected-draw-mobile-drawer",
      viewport,
    );
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("selected-draw-mobile-drawer")).toBeHidden();

    await expect
      .poll(() =>
        page
          .getByTestId("timeline-scroll-viewport")
          .evaluate((element) => element.scrollWidth > element.clientWidth),
      )
      .toBe(true);

    await page.getByTestId("timeline-share-button").click();
    await expect(page.getByTestId("timeline-share-menu")).toBeVisible();
    await expectOverlayWithinViewport(page, "timeline-share-menu", viewport);
    await expectNoPageHorizontalOverflow(page);
    await page.keyboard.press("Escape");

    await openTimelineInsertMenu(page, {
      x: Math.min(260, viewport.width - 80),
      y: 48,
    });
    await expect(page.getByTestId("timeline-insert-menu")).toBeVisible();
    await expectOverlayWithinViewport(page, "timeline-insert-menu", viewport);
    await expectNoPageHorizontalOverflow(page);
    await page.keyboard.press("Escape");
  }
});

test("timeline item context menus delete draws and milestones", async ({
  page,
}) => {
  await openGeneratedTimeline(page);

  const timeline = page.getByTestId("animated-curved-timeline");
  await timeline.scrollIntoViewIfNeeded();

  const beforeDrawDelete = await getTimelineGeometry(page, [
    "site-prep",
    "framing",
    "rough-in",
  ]);
  expectTimelineItemCentered(beforeDrawDelete, "site-prep");
  expectTimelineItemCentered(beforeDrawDelete, "framing");
  expectTimelineItemCentered(beforeDrawDelete, "rough-in");

  const framingDraw = page.getByTestId("timeline-draw-marker-framing");
  await expect(framingDraw).toBeVisible();
  await framingDraw.scrollIntoViewIfNeeded();

  const drawBox = await framingDraw.boundingBox();
  expect(drawBox).not.toBeNull();
  if (!drawBox) {
    return;
  }

  await page.mouse.click(
    drawBox.x + drawBox.width / 2,
    drawBox.y + drawBox.height / 2,
    { button: "right" },
  );
  await expect(page.getByTestId("timeline-item-context-menu")).toBeVisible();
  await expectContextMenuNearBox(page, drawBox);
  await page.getByRole("menuitem", { name: REMOVE_DRAW_LABEL }).click();

  await expect(framingDraw).toBeHidden();
  await expect(page.getByTestId("timeline-final-draw-fees")).toHaveText(
    "$3,000",
  );
  await expect(
    page.getByTestId("timeline-cashflow-risk-summary"),
  ).toContainText("1 flagged");
  await expect(page.getByTestId("timeline-cash-shortfall-point")).toContainText(
    "needs $5,000 before Rough-in mechanical",
  );

  const afterDrawDelete = await getTimelineGeometry(page, [
    "site-prep",
    "framing",
    "rough-in",
  ]);
  expect(afterDrawDelete.pathD).toBe(beforeDrawDelete.pathD);
  expectTimelineGeometryStable(beforeDrawDelete, afterDrawDelete, [
    "site-prep",
    "framing",
    "rough-in",
  ]);
  expectTimelineItemCentered(afterDrawDelete, "site-prep");
  expectTimelineItemCentered(afterDrawDelete, "framing");
  expectTimelineItemCentered(afterDrawDelete, "rough-in");

  const framingNode = page.getByTestId("demo-timeline-node-framing");
  await expect(framingNode).toBeVisible();

  const framingCard = page.getByTestId("timeline-card-framing");

  await framingCard.click({ button: "right" });
  await expect(page.getByTestId("timeline-item-context-menu")).toBeVisible();
  const cardBox = await framingCard.boundingBox();
  expect(cardBox).not.toBeNull();
  if (!cardBox) {
    return;
  }
  await expectContextMenuNearBox(page, cardBox);
  await page.getByRole("menuitem", { name: REMOVE_MILESTONE_LABEL }).click();

  await expect(framingNode).toBeHidden();
  await expect(framingDraw).toBeHidden();

  const afterMilestoneDelete = await getTimelineGeometry(page, [
    "site-prep",
    "rough-in",
  ]);
  expectTimelineItemCentered(afterMilestoneDelete, "site-prep");
  expectTimelineItemCentered(afterMilestoneDelete, "rough-in");
  await expectTimelineConnectorsAligned(page);
});

test("timeline insertion rail context menu adds draws without delete actions", async ({
  page,
}) => {
  await openGeneratedTimeline(page);

  await openTimelineInsertMenu(page, { x: 620, y: 48 });
  await expect(page.getByTestId("timeline-insert-menu")).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: ADD_DRAW_LABEL }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: ADD_CAPITAL_SPIKE_LABEL }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: REMOVE_DRAW_LABEL }),
  ).toBeHidden();
  await expect(
    page.getByRole("menuitem", { name: REMOVE_MILESTONE_LABEL }),
  ).toBeHidden();
  await page.getByRole("menuitem", { name: ADD_DRAW_LABEL }).click();

  const manualDrawMarker = page
    .locator('[data-testid^="timeline-draw-marker-manual-draw-"]')
    .first();
  await expect(manualDrawMarker).toBeVisible();
  await expect(page.getByTestId("timeline-final-draw-fees")).toHaveText(
    "$4,000",
  );
});

test("timeline planning controls edit starting cash and capital spikes", async ({
  page,
}) => {
  await openGeneratedTimeline(page);

  const sitePrepCard = page.getByTestId("timeline-card-site-prep");
  await sitePrepCard.click();
  await expect(sitePrepCard).toContainText("Sub-milestones");
  await expect(sitePrepCard).toContainText("Start date");
  await expect(sitePrepCard).toContainText("Duration");
  await expect(
    page.getByTestId("timeline-card-start-date-site-prep"),
  ).toHaveText("Day 0");
  await expect(page.getByTestId("timeline-card-duration-site-prep")).toHaveText(
    "14 days",
  );
  await expect(sitePrepCard).not.toContainText("Policy");
  await expect(sitePrepCard).not.toContainText("Evidence");
  await expect(sitePrepCard).not.toContainText("Completed");

  await page.getByTestId("timeline-starting-cash-input").fill("450000");
  await expect(page.getByTestId("timeline-cashflow-ending-cash")).toHaveText(
    "$450,000",
  );

  await openTimelineInsertMenu(page, { x: 520, y: 48 });
  await page.getByRole("menuitem", { name: ADD_CAPITAL_SPIKE_LABEL }).click();

  const capitalSpikeMarker = page
    .locator('[data-testid^="timeline-capital-spike-marker-capital-spike-"]')
    .first();
  await expect(capitalSpikeMarker).toBeVisible();
  await expect(page.getByTestId("timeline-cashflow-ending-cash")).toHaveText(
    "$415,000",
  );

  await capitalSpikeMarker.click();
  const capitalSpikeEditor = page
    .locator('[data-testid^="timeline-capital-spike-editor-capital-spike-"]')
    .first();
  await capitalSpikeEditor
    .getByLabel("Capital spike title")
    .fill("Permit surprise");
  await capitalSpikeEditor.getByLabel("Capital spike date").fill("40");
  await capitalSpikeEditor.getByLabel("Capital spike amount").fill("25000");
  await capitalSpikeEditor.getByRole("button", { name: "Apply" }).click();

  await expect(capitalSpikeMarker).toContainText("Permit surprise");
  await expect(capitalSpikeMarker).toContainText("$25,000");
  await expect(capitalSpikeMarker).toContainText("Day 40");
  await expect(page.getByTestId("timeline-cashflow-ending-cash")).toHaveText(
    "$425,000",
  );

  await capitalSpikeMarker.click({ button: "right" });
  await expect(page.getByTestId("timeline-item-context-menu")).toBeVisible();
  const spikeBox = await capitalSpikeMarker.boundingBox();
  expect(spikeBox).not.toBeNull();
  if (!spikeBox) {
    return;
  }
  await expectContextMenuNearBox(page, spikeBox);
  await page
    .getByRole("menuitem", { name: REMOVE_CAPITAL_SPIKE_LABEL })
    .click();

  await expect(capitalSpikeMarker).toBeHidden();
  await expect(page.getByTestId("timeline-cashflow-ending-cash")).toHaveText(
    "$450,000",
  );
});

test("timeline path affordances stay aligned with rendered geometry", async ({
  page,
}) => {
  await openGeneratedTimeline(page);

  await expect(page.getByTestId("animated-curved-timeline")).toBeVisible();

  await expect
    .poll(() => selectedProgressDeltaX(page, "site-prep"))
    .toBeLessThan(2);

  const maxConnectorDelta = await page.evaluate(() => {
    const timeline = document.querySelector(
      "[data-testid=animated-curved-timeline]",
    );
    const viewport = timeline?.querySelector(
      "[data-testid=timeline-scroll-viewport]",
    );
    const content = viewport?.firstElementChild;
    const path = timeline?.querySelector("svg path.text-zinc-300\\/80");
    const connectorLines = [
      ...(timeline?.querySelectorAll(
        "[data-testid^=timeline-marker-connector-]",
      ) ?? []),
    ];

    if (!(content && path instanceof SVGPathElement)) {
      return Number.POSITIVE_INFINITY;
    }

    const contentRect = content.getBoundingClientRect();
    const totalLength = path.getTotalLength();

    return connectorLines.reduce((maxDelta, line) => {
      const rect = line.getBoundingClientRect();
      const x = rect.left - contentRect.left;
      const y = rect.bottom - contentRect.top;
      let low = 0;
      let high = totalLength;

      for (let index = 0; index < 24; index += 1) {
        const midpoint = (low + high) / 2;
        const point = path.getPointAtLength(midpoint);

        if (point.x < x) {
          low = midpoint;
        } else {
          high = midpoint;
        }
      }

      const pathPoint = path.getPointAtLength((low + high) / 2);

      return Math.max(maxDelta, Math.abs(pathPoint.y - y));
    }, 0);
  });

  expect(maxConnectorDelta).toBeLessThan(2);

  const nodeBox = await getNodeBox(page, "framing");
  const timelineBox = await page
    .getByTestId("animated-curved-timeline")
    .boundingBox();
  expect(nodeBox).not.toBeNull();
  expect(timelineBox).not.toBeNull();
  if (!(nodeBox && timelineBox)) {
    return;
  }

  const nodeCenterX = nodeBox.x + nodeBox.width / 2;
  const nodeCenterY = nodeBox.y + nodeBox.height / 2;

  await page.mouse.move(nodeCenterX, nodeCenterY);
  await expect(page.getByTestId("timeline-hover-marker")).toBeVisible();
  await expect.poll(() => hoverDotOpacity(page)).toBeLessThan(0.05);

  await page.mouse.move(nodeCenterX + nodeBox.width * 0.55, nodeCenterY);
  await expect.poll(() => hoverDotOpacity(page)).toBeLessThan(0.35);

  const roughInEndNode = page.getByTestId("demo-timeline-end-node-rough-in");
  await roughInEndNode.scrollIntoViewIfNeeded();
  await roughInEndNode.click();

  await page.getByTestId("timeline-scroll-viewport").evaluate((viewport) => {
    const connector = document.querySelector(
      "[data-testid=timeline-marker-connector-today]",
    );

    if (!(connector instanceof HTMLElement)) {
      return;
    }

    const connectorRect = connector.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    viewport.scrollLeft +=
      connectorRect.left -
      viewportRect.left -
      viewportRect.width / 2 +
      connectorRect.width / 2;
  });

  const todayPathPoint = await page.evaluate(() => {
    const timeline = document.querySelector(
      "[data-testid=animated-curved-timeline]",
    );
    const content = timeline?.querySelector(
      "[data-testid=timeline-scroll-viewport]",
    )?.firstElementChild;
    const path = timeline?.querySelector("svg path.text-zinc-300\\/80");
    const connector = timeline?.querySelector(
      "[data-testid=timeline-marker-connector-today]",
    );

    if (
      !(
        content instanceof HTMLElement &&
        path instanceof SVGPathElement &&
        connector instanceof HTMLElement
      )
    ) {
      return null;
    }

    const contentRect = content.getBoundingClientRect();
    const connectorRect = connector.getBoundingClientRect();
    const connectorX =
      connectorRect.left + connectorRect.width / 2 - contentRect.left;
    const totalLength = path.getTotalLength();
    let low = 0;
    let high = totalLength;

    for (let index = 0; index < 24; index += 1) {
      const midpoint = (low + high) / 2;
      const point = path.getPointAtLength(midpoint);

      if (point.x < connectorX) {
        low = midpoint;
      } else {
        high = midpoint;
      }
    }

    const point = path.getPointAtLength((low + high) / 2);

    return {
      x: contentRect.left + point.x,
      y: contentRect.top + point.y,
    };
  });
  expect(todayPathPoint).not.toBeNull();
  if (!todayPathPoint) {
    return;
  }

  await page.mouse.move(todayPathPoint.x, todayPathPoint.y);
  await expect.poll(() => hoverDotOpacity(page)).toBeGreaterThan(0.8);

  await expect(page.getByTestId("timeline-marker-connector-today")).toHaveClass(
    ACTIVE_CONNECTOR_CLASS,
  );
  await expect(
    page.getByTestId("timeline-marker-connector-policy-limit"),
  ).not.toHaveClass(ACTIVE_CONNECTOR_CLASS);
});

test("timeline milestone spacing follows day deltas without overlapping cards", async ({
  page,
}) => {
  await openGeneratedTimeline(page);

  await expect(page.getByTestId("animated-curved-timeline")).toBeVisible();
  await expect(page.getByTestId("demo-timeline-node-closeout")).toBeAttached();

  const spacing = await getTimelineSpacing(page, [
    "drywall",
    "finishes",
    "closeout",
  ]);

  expect(spacing).not.toBeNull();
  if (!spacing) {
    return;
  }

  const drywall = spacing.drywall;
  const finishes = spacing.finishes;
  const closeout = spacing.closeout;

  expect(drywall).toBeDefined();
  expect(finishes).toBeDefined();
  expect(closeout).toBeDefined();
  if (!(drywall && finishes && closeout)) {
    return;
  }

  const drywallToFinishes = finishes.nodeCenterX - drywall.nodeCenterX;
  const finishesToCloseout = closeout.nodeCenterX - finishes.nodeCenterX;

  expect(drywallToFinishes / finishesToCloseout).toBeGreaterThan(1.1);
  expect(drywallToFinishes / finishesToCloseout).toBeLessThan(1.25);
  expect(finishes.cardLeft).toBeGreaterThanOrEqual(drywall.cardRight - 1);
  expect(closeout.cardLeft).toBeGreaterThanOrEqual(finishes.cardRight - 1);
});

test("cashflow chart stays controlled by the shared timeline probe", async ({
  page,
}) => {
  await openGeneratedTimeline(page);

  const chart = page.getByTestId("timeline-cashflow-chart");
  const drawAvailabilityChart = page.getByTestId(
    "timeline-draw-availability-chart",
  );
  const timeline = page.getByTestId("animated-curved-timeline");

  await expect(chart).toBeVisible();
  await expect(
    chart.getByTestId("timeline-cashflow-series-milestone-cost"),
  ).toBeVisible();
  await expect(
    chart.getByTestId("timeline-cashflow-series-cash-on-hand"),
  ).toBeVisible();
  await expect
    .poll(() =>
      chart.evaluate((element) => ({
        bars: element.querySelectorAll(".recharts-bar").length,
        referenceAreas: element.querySelectorAll(".recharts-reference-area")
          .length,
      })),
    )
    .toEqual({ bars: 2, referenceAreas: 0 });
  await expect(
    drawAvailabilityChart.getByTestId("timeline-draw-series-interest-bearing"),
  ).toBeVisible();
  await expect(
    drawAvailabilityChart.getByTestId(
      "timeline-draw-series-additional-available",
    ),
  ).toBeVisible();

  const chartBox = await chart.boundingBox();
  const drawAvailabilityChartBox = await drawAvailabilityChart.boundingBox();
  const timelineBox = await timeline.boundingBox();
  expect(chartBox).not.toBeNull();
  expect(drawAvailabilityChartBox).not.toBeNull();
  expect(timelineBox).not.toBeNull();
  if (!(chartBox && drawAvailabilityChartBox && timelineBox)) {
    return;
  }
  expect(chartBox.y).toBeLessThan(timelineBox.y);
  expect(drawAvailabilityChartBox.y).toBeGreaterThan(timelineBox.y);

  await timeline.scrollIntoViewIfNeeded();
  const visibleTimelineBox = await timeline.boundingBox();
  expect(visibleTimelineBox).not.toBeNull();
  if (!visibleTimelineBox) {
    return;
  }
  const trackHitAreaBox = await page
    .getByTestId("timeline-track-hit-area")
    .boundingBox();
  expect(trackHitAreaBox).not.toBeNull();
  if (!trackHitAreaBox) {
    return;
  }

  const railHoverPoint = {
    x: visibleTimelineBox.x + visibleTimelineBox.width * 0.42,
    y: trackHitAreaBox.y + trackHitAreaBox.height / 2,
  };
  await expect
    .poll(() =>
      page.evaluate(({ x, y }) => {
        const element = document.elementFromPoint(x, y);

        return {
          capturedByTrack: Boolean(
            element?.closest?.("[data-testid=timeline-track-hit-area]"),
          ),
          capturedByViewport: Boolean(
            element?.closest?.("[data-testid=timeline-scroll-viewport]"),
          ),
          testId:
            element instanceof HTMLElement
              ? element.getAttribute("data-testid")
              : null,
        };
      }, railHoverPoint),
    )
    .toMatchObject({
      capturedByTrack: true,
      capturedByViewport: true,
      testId: "timeline-track-hit-area",
    });

  await page.mouse.move(railHoverPoint.x, railHoverPoint.y);
  await expect(page.getByTestId("timeline-hover-marker")).toBeVisible();
  await expect(chart.getByTestId("timeline-cashflow-probe-day")).toHaveText(
    DAY_LABEL,
  );
  await expect(chart.getByTestId("timeline-cashflow-probe-day")).not.toHaveText(
    "Hover chart",
  );
  await expect(chart.getByTestId("timeline-cashflow-probe-cash")).toHaveText(
    CASH_TEXT,
  );

  const sitePrepCard = page.getByTestId("timeline-card-site-prep");
  const sitePrepCardBox = await sitePrepCard.boundingBox();
  expect(sitePrepCardBox).not.toBeNull();
  if (!sitePrepCardBox) {
    return;
  }
  await page.mouse.move(
    sitePrepCardBox.x + sitePrepCardBox.width / 2,
    sitePrepCardBox.y + sitePrepCardBox.height / 2,
  );
  await expect(chart.getByTestId("timeline-cashflow-probe-day")).toHaveText(
    DAY_LABEL,
  );
  await expect(page.getByTestId("timeline-hover-marker")).toBeVisible();

  const overflowHitTarget = await page.evaluate(() => {
    const timelineElement = document.querySelector(
      "[data-testid=animated-curved-timeline]",
    );
    const viewportElement = document.querySelector(
      "[data-testid=timeline-scroll-viewport]",
    );

    if (!(timelineElement && viewportElement)) {
      return null;
    }

    const timelineRect = timelineElement.getBoundingClientRect();
    const viewportRect = viewportElement.getBoundingClientRect();
    const x = timelineRect.left + Math.min(24, timelineRect.width / 2);
    const y = Math.min(
      viewportRect.bottom - 8,
      timelineRect.bottom +
        Math.max(8, (viewportRect.bottom - timelineRect.bottom) / 2),
    );
    const element = document.elementFromPoint(x, y);

    return {
      capturedByRoadmap: Boolean(
        element?.closest?.("[data-testid=animated-curved-timeline]"),
      ),
      capturedByViewport: Boolean(
        element?.closest?.("[data-testid=timeline-scroll-viewport]"),
      ),
      className:
        element instanceof HTMLElement ? String(element.className) : null,
      tagName: element?.tagName ?? null,
      testId:
        element instanceof HTMLElement
          ? element.getAttribute("data-testid")
          : null,
    };
  });

  expect(overflowHitTarget).toMatchObject({
    capturedByRoadmap: false,
    capturedByViewport: false,
  });

  const framingBox = await getNodeBox(page, "framing");
  expect(framingBox).not.toBeNull();
  if (!framingBox) {
    return;
  }

  await page.mouse.move(
    framingBox.x + framingBox.width / 2,
    framingBox.y + framingBox.height / 2,
  );
  await expect(chart.getByTestId("timeline-cashflow-probe-day")).toHaveText(
    "Day 24",
  );
  await expect(page.getByTestId("timeline-draw-delta-readout")).toContainText(
    "$0",
  );
  await expect(
    chart.locator("text").filter({ hasText: "Day 24" }).first(),
  ).toBeVisible();
  const probeCashOnHand = await chart
    .getByTestId("timeline-cashflow-probe-cash")
    .textContent();
  expect(probeCashOnHand).toMatch(CASH_TEXT);
  await expect(
    chart
      .locator("text")
      .filter({ hasText: `Cash on hand ${probeCashOnHand}` })
      .first(),
  ).toBeVisible();

  const framingCard = page.getByTestId("timeline-card-framing");
  await framingCard.click();
  await expect(page.getByTestId("timeline-card-close-framing")).toBeVisible();

  await chart.scrollIntoViewIfNeeded();
  const chartSurfaceBox = await chart
    .locator(".recharts-surface")
    .first()
    .boundingBox();
  expect(chartSurfaceBox).not.toBeNull();
  if (!chartSurfaceBox) {
    return;
  }

  await page.mouse.move(
    chartSurfaceBox.x + chartSurfaceBox.width * 0.45,
    chartSurfaceBox.y + chartSurfaceBox.height * 0.48,
  );
  await expect(chart.getByTestId("timeline-cashflow-probe-day")).toHaveText(
    DAY_LABEL,
  );

  const chartProbeDay = await chart
    .getByTestId("timeline-cashflow-probe-day")
    .textContent();
  expect(chartProbeDay).toMatch(DAY_LABEL);
  await expect(page.getByTestId("timeline-hover-marker")).toContainText(
    chartProbeDay ?? "",
  );

  await drawAvailabilityChart.scrollIntoViewIfNeeded();
  const drawAvailabilitySurfaceBox = await drawAvailabilityChart
    .locator(".recharts-surface")
    .first()
    .boundingBox();
  expect(drawAvailabilitySurfaceBox).not.toBeNull();
  if (!drawAvailabilitySurfaceBox) {
    return;
  }

  await page.mouse.move(
    drawAvailabilitySurfaceBox.x + drawAvailabilitySurfaceBox.width * 0.56,
    drawAvailabilitySurfaceBox.y + drawAvailabilitySurfaceBox.height * 0.42,
  );
  await expect
    .poll(() =>
      page
        .locator(".shadow-xl")
        .last()
        .getByText("Interest-bearing draw", { exact: true })
        .count(),
    )
    .toBeLessThanOrEqual(2);
});

test("draw markers display editable dates and amounts", async ({ page }) => {
  await openGeneratedTimeline(page);

  const drawMarker = page.getByTestId("timeline-draw-marker-rough-in");

  await expect(drawMarker).toBeVisible();
  await expect(drawMarker).toContainText("Draw 3");
  await expect(drawMarker).toContainText("$245,000");
  await expect(drawMarker).toContainText("Day 80");

  await drawMarker.click();
  await expect(page.getByRole("heading", { name: "Draw 3" })).toBeVisible();
  await expect(
    page.getByTestId("selected-draw-request-form-rough-in"),
  ).toBeVisible();
  await expect(
    page.getByTestId("selected-draw-available-limit-rough-in"),
  ).toHaveText("$245,000");
  await page
    .getByTestId("selected-draw-request-amount-input-rough-in")
    .fill("200000");
  await page.getByTestId("selected-draw-submit-request-rough-in").click();
  await expect(drawMarker).toContainText("$200,000");
  await expect(
    page.getByTestId("selected-draw-remaining-limit-rough-in"),
  ).toHaveText("$45,000");
  const editor = page.getByTestId("timeline-draw-editor-rough-in");
  await expect(editor).toBeVisible();

  await editor.getByLabel("Draw date").fill("108");
  await editor.getByLabel("Draw amount").fill("255000");
  await editor.getByRole("button", { name: "Apply" }).click();

  await expect(drawMarker).toContainText("Day 108");
  await expect(drawMarker).toContainText("$255,000");
  await expect(page.getByTestId("timeline-cashflow-ending-cash")).toHaveText(
    "$410,000",
  );
  await expect(page.getByTestId("timeline-draw-interest-bearing")).toHaveText(
    "$1,260,000",
  );
  await expect(page.getByTestId("timeline-draw-total-available")).toHaveText(
    "$1,260,000",
  );
});

test("selected draw panel collapses on milestone double click", async ({
  page,
}) => {
  await openGeneratedTimeline(page);

  const panel = page.getByTestId("selected-draw-panel");
  const timeline = page.getByTestId("animated-curved-timeline");

  await expect(panel).toBeVisible();
  const initialTimelineBox = await timeline.boundingBox();
  expect(initialTimelineBox).not.toBeNull();
  if (!initialTimelineBox) {
    return;
  }

  await page.getByTestId("demo-timeline-node-rough-in").dblclick();
  await expect(panel).toBeHidden();
  await expect
    .poll(async () => {
      const box = await timeline.boundingBox();
      return box?.width ?? 0;
    })
    .toBeGreaterThan(initialTimelineBox.width + 180);

  await page.getByTestId("demo-timeline-node-framing").click();
  await expect(page.getByTestId("selected-draw-panel")).toBeVisible();
  await expect(
    page.getByTestId("selected-draw-details").getByRole("heading", {
      name: "Framing & structure",
    }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const box = await timeline.boundingBox();
      return box?.width ?? Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(initialTimelineBox.width + 40);
});

test("selected draw rail supports builder completion claims and evidence packages", async ({
  context,
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGeneratedTimeline(page);

  const panel = page.getByTestId("selected-draw-panel");
  const chart = page.getByTestId("timeline-cashflow-chart");
  const timeline = page.getByTestId("animated-curved-timeline");
  const drawAvailabilityChart = page.getByTestId(
    "timeline-draw-availability-chart",
  );

  await expect(panel).toBeVisible();
  const panelGeometry = await panel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);

    return {
      height: rect.height,
      position: style.position,
      viewportHeight: window.innerHeight,
    };
  });
  expect(panelGeometry.position).toBe("sticky");
  expect(panelGeometry.height).toBeGreaterThan(
    panelGeometry.viewportHeight - 80,
  );

  const openChartBox = await chart.boundingBox();
  const openTimelineBox = await timeline.boundingBox();
  const openAvailabilityBox = await drawAvailabilityChart.boundingBox();
  expect(openChartBox).not.toBeNull();
  expect(openTimelineBox).not.toBeNull();
  expect(openAvailabilityBox).not.toBeNull();
  if (!(openChartBox && openTimelineBox && openAvailabilityBox)) {
    return;
  }
  expect(openChartBox.width).toBeLessThan(1100);
  expect(openAvailabilityBox.width).toBeLessThan(1100);

  await page.getByTestId("demo-timeline-node-rough-in").dblclick();
  await expect(panel).toBeHidden();
  await expect
    .poll(async () => {
      const nextChartBox = await chart.boundingBox();
      return (nextChartBox?.width ?? 0) - openChartBox.width;
    })
    .toBeGreaterThan(250);
  const expandedTimelineBox = await timeline.boundingBox();
  const expandedAvailabilityBox = await drawAvailabilityChart.boundingBox();
  expect(
    (expandedTimelineBox?.width ?? 0) - openTimelineBox.width,
  ).toBeGreaterThan(250);
  expect(
    (expandedAvailabilityBox?.width ?? 0) - openAvailabilityBox.width,
  ).toBeGreaterThan(250);

  await page.getByTestId("demo-timeline-end-node-rough-in").click();
  await expect(page.getByTestId("selected-draw-panel")).toBeVisible();
  await expect(
    page.getByTestId("demo-timeline-end-node-rough-in"),
  ).not.toHaveClass(COMPLETED_NODE_BORDER_CLASS);
  await expect(
    page.getByTestId("selected-draw-completion-warning-rough-in"),
  ).toBeVisible();

  await page
    .getByTestId("selected-draw-completion-day-input-rough-in")
    .fill("62");
  await page
    .getByTestId("selected-draw-actual-cost-input-rough-in")
    .fill("238000");
  await page
    .getByTestId("selected-draw-completion-note-rough-in")
    .fill("Rough-in completed before the site visit.");
  await page.getByTestId("selected-draw-submit-completion-rough-in").click();
  await expect(page.getByTestId("demo-timeline-end-node-rough-in")).toHaveClass(
    COMPLETED_NODE_BORDER_CLASS,
  );
  await expect(page.getByTestId("timeline-card-status-rough-in")).toHaveText(
    "Complete",
  );
  await expect(
    page.getByTestId("selected-draw-completed-day-rough-in"),
  ).toHaveText("Day 62");
  await expect(
    page.getByTestId("selected-draw-actual-cost-rough-in"),
  ).toHaveText("$238,000");

  await page
    .getByTestId("selected-draw-evidence-input-rough-in")
    .setInputFiles([
      "public/logo192.png",
      "public/milestone-icons/roughIn.png",
    ]);
  await expect(
    page.getByTestId("selected-draw-evidence-count-rough-in"),
  ).toHaveText("2 images");
  const firstEvidenceAsset = page
    .locator('[data-testid^="selected-draw-evidence-asset-"]')
    .first();
  const firstEvidenceLabel = firstEvidenceAsset.locator(
    '[data-testid^="selected-draw-evidence-label-"]',
  );
  await firstEvidenceLabel.fill("Mechanical rough-in photo");
  await firstEvidenceAsset
    .locator('[data-testid^="selected-draw-evidence-tag-"]')
    .selectOption("HVAC ducts");
  await expect(firstEvidenceLabel).toHaveValue("Mechanical rough-in photo");
  await expect(firstEvidenceAsset).toContainText("logo192.png");
  await page
    .locator('[data-testid^="selected-draw-evidence-remove-"]')
    .last()
    .click();
  await expect(
    page.getByTestId("selected-draw-evidence-count-rough-in"),
  ).toHaveText("1 images");

  await page.getByTestId("timeline-share-button").click();
  await expect(page.getByTestId("timeline-share-menu")).toBeVisible();
  await expect
    .poll(() => page.getByTestId("timeline-share-url").inputValue())
    .toContain("/demo/timeline?share=");
  const shareUrl = await page.getByTestId("timeline-share-url").inputValue();
  const sharedPage = await context.newPage();

  await sharedPage.goto(shareUrl);
  await expect(
    sharedPage.getByTestId("animated-curved-timeline"),
  ).toBeVisible();
  await expect(
    sharedPage.getByTestId("selected-draw-completed-day-rough-in"),
  ).toHaveText("Day 62");
  await expect(
    sharedPage.getByTestId("selected-draw-actual-cost-rough-in"),
  ).toHaveText("$238,000");
  await expect(
    sharedPage.getByTestId("selected-draw-evidence-count-rough-in"),
  ).toHaveText("1 images");
  await expect(
    sharedPage
      .locator('[data-testid^="selected-draw-evidence-label-"]')
      .first(),
  ).toHaveValue("Mechanical rough-in photo");
});

test("timeline role switcher swaps milestone and draw aside workflows", async ({
  page,
}) => {
  await openGeneratedTimeline(page);
  await page.getByTestId("demo-timeline-node-rough-in").click();

  await expect(page.getByTestId("timeline-role-builder")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByTestId("selected-draw-completion-form-rough-in"),
  ).toBeVisible();
  await expect(
    page.getByTestId("lender-milestone-review-panel-rough-in"),
  ).toHaveCount(0);

  await page.getByTestId("timeline-role-lender").click();
  await expect(page.getByTestId("timeline-role-lender")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByTestId("lender-milestone-review-panel-rough-in"),
  ).toBeVisible();
  await expect(
    page.getByTestId("selected-draw-completion-form-rough-in"),
  ).toHaveCount(0);
  await page.getByTestId("lender-site-visit-day-rough-in").fill("72");
  await page
    .getByTestId("lender-site-visit-note-rough-in")
    .fill("Verify MEP rough-in before approval.");
  await page.getByTestId("lender-site-visit-submit-rough-in").click();
  await expect(
    page.getByTestId("lender-milestone-review-panel-rough-in"),
  ).toContainText("Shareable site visit link");

  await page.getByTestId("timeline-role-builder").click();
  await page.getByTestId("timeline-draw-marker-rough-in").click();
  await expect(
    page.getByTestId("selected-draw-request-form-rough-in"),
  ).toBeVisible();
  await page
    .getByTestId("selected-draw-request-amount-input-rough-in")
    .fill("200000");
  await page
    .getByTestId("selected-draw-request-note-rough-in")
    .fill("MEP rough-in reimbursement request.");
  await page.getByTestId("selected-draw-submit-request-rough-in").click();
  await expect(page.getByTestId("timeline-draw-marker-rough-in")).toContainText(
    "$200,000",
  );

  await page.getByTestId("timeline-role-lender").click();
  await expect(
    page.getByTestId("lender-draw-review-panel-rough-in"),
  ).toBeVisible();
  await expect(
    page.getByTestId("selected-draw-request-form-rough-in"),
  ).toHaveCount(0);
  await expect(
    page.getByTestId("lender-draw-available-limit-rough-in"),
  ).toHaveText("$245,000");
  await page
    .getByTestId("lender-draw-review-note-rough-in")
    .fill("Capacity verified, release approved.");
  await page.getByTestId("lender-draw-approve-rough-in").click();
  await expect(
    page.getByTestId("lender-draw-review-panel-rough-in"),
  ).toContainText("Draw approved");
});

test("completed demo nodes keep the draw icon with completed styling", async ({
  page,
}) => {
  await openGeneratedTimeline(page);

  const completedNode = page.getByTestId("demo-timeline-node-framing");
  await page.getByTestId("demo-timeline-end-node-framing").click();
  await page
    .getByTestId("selected-draw-completion-day-input-framing")
    .fill("42");
  await page.getByTestId("selected-draw-submit-completion-framing").click();

  await expect(completedNode).toHaveClass(COMPLETED_NODE_TEXT_CLASS);
  await expect(completedNode).toHaveClass(COMPLETED_NODE_BORDER_CLASS);
  await expect(
    page.getByTestId("demo-timeline-node-icon-framing"),
  ).toBeVisible();
});

interface TimelineGeometryItem {
  cardCenterX: number;
  cardLeft: number;
  connectorBottomY: number;
  connectorCenterX: number;
  nodeCenterX: number;
  nodeCenterY: number;
}

interface TimelineGeometrySnapshot {
  items: Record<string, TimelineGeometryItem | null>;
  pathD: string | null;
}

interface TimelineSpacingItem {
  cardLeft: number;
  cardRight: number;
  nodeCenterX: number;
}

async function expectContextMenuNearBox(
  page: Page,
  targetBox: { height: number; width: number; x: number; y: number },
) {
  const menuBox = await page
    .getByTestId("timeline-item-context-menu")
    .boundingBox();

  expect(menuBox).not.toBeNull();
  if (!menuBox) {
    return;
  }

  const targetCenterX = targetBox.x + targetBox.width / 2;
  const targetCenterY = targetBox.y + targetBox.height / 2;

  expect(Math.abs(menuBox.x - targetCenterX)).toBeLessThan(160);
  expect(Math.abs(menuBox.y - targetCenterY)).toBeLessThan(120);
}

async function openTimelineInsertMenu(
  page: Page,
  position: { x: number; y: number },
) {
  await page
    .getByTestId("timeline-track-hit-area")
    .evaluate((element, offset) => {
      const rect = element.getBoundingClientRect();

      element.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          button: 2,
          cancelable: true,
          clientX: rect.left + offset.x,
          clientY: rect.top + offset.y,
        }),
      );
    }, position);
}

async function dragBudgetRow(page: Page, sourceKey: string, targetKey: string) {
  const handle = page.getByTestId(`timeline-setup-row-drag-${sourceKey}`);
  const beforeOrder = await getBudgetRowOrder(page);
  const sourceIndex = beforeOrder.indexOf(sourceKey);
  const targetIndex = beforeOrder.indexOf(targetKey);

  await handle.scrollIntoViewIfNeeded();
  await handle.focus();

  if (sourceIndex < 0 || targetIndex < 0) {
    return;
  }

  const key = sourceIndex > targetIndex ? "ArrowUp" : "ArrowDown";
  for (let index = 0; index < Math.abs(sourceIndex - targetIndex); index += 1) {
    await handle.press(key);
  }
}

function getBudgetRowOrder(page: Page) {
  return page
    .locator('[data-testid^="timeline-setup-budget-row-"]')
    .evaluateAll((rows) =>
      rows.map((row) =>
        (row.getAttribute("data-testid") ?? "").replace(
          "timeline-setup-budget-row-",
          "",
        ),
      ),
    );
}

async function expectExpandedSubMilestonesAttached(
  page: Page,
  options: { rowKey: string; text: string },
) {
  const attachment = await page.evaluate(({ rowKey }) => {
    const row = document.querySelector(
      `[data-testid="timeline-setup-budget-row-${rowKey}"]`,
    );
    const nextRow = row?.nextElementSibling;

    return {
      isExpandedRow:
        nextRow?.classList.contains("timeline-blueprint-expanded-row") ?? false,
      text: nextRow?.textContent ?? "",
    };
  }, options);

  expect(attachment.isExpandedRow).toBe(true);
  expect(attachment.text).toContain(options.text);
}

async function expectNoPageHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(2);
}

async function expectBoxWithinViewport(
  page: Page,
  testId: string,
  viewportWidth: number,
) {
  const box = await page.getByTestId(testId).boundingBox();

  expect(box, `${testId} should have a bounding box`).not.toBeNull();
  if (!box) {
    return;
  }

  expect(
    box.x,
    `${testId} should not overflow left on mobile`,
  ).toBeGreaterThanOrEqual(-1);
  expect(
    box.x + box.width,
    `${testId} should not overflow right on mobile`,
  ).toBeLessThanOrEqual(viewportWidth + 1);
}

async function expectOverlayWithinViewport(
  page: Page,
  testId: string,
  viewport: { height: number; width: number },
) {
  await expectBoxWithinViewport(page, testId, viewport.width);

  const box = await page.getByTestId(testId).boundingBox();
  expect(box, `${testId} should have a bounding box`).not.toBeNull();
  if (!box) {
    return;
  }

  expect(box.y, `${testId} should not overflow top`).toBeGreaterThanOrEqual(-1);
  expect(
    box.y + box.height,
    `${testId} should not overflow bottom`,
  ).toBeLessThanOrEqual(viewport.height + 1);
}

function getTimelineGeometry(
  page: Page,
  itemIds: string[],
): Promise<TimelineGeometrySnapshot> {
  return page.evaluate((ids) => {
    const timeline = document.querySelector(
      "[data-testid=animated-curved-timeline]",
    );
    const viewport = timeline?.querySelector(
      "[data-testid=timeline-scroll-viewport]",
    );
    const content = viewport?.firstElementChild;
    const path = timeline?.querySelector("svg path");

    if (!(content && timeline && path instanceof SVGPathElement)) {
      return {
        items: Object.fromEntries(ids.map((id) => [id, null])),
        pathD: null,
      };
    }

    const contentRect = content.getBoundingClientRect();
    const itemEntries = ids.map((id) => {
      const node = timeline.querySelector(
        `[data-testid="demo-timeline-node-${id}"]`,
      );
      const card = timeline.querySelector(
        `[data-testid="timeline-card-${id}"]`,
      );
      const connector = timeline.querySelector(
        `[data-testid="timeline-card-connector-${id}"]`,
      );

      if (!(node && card && connector)) {
        return [id, null];
      }

      const nodeRect = node.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const connectorRect = connector.getBoundingClientRect();

      return [
        id,
        {
          cardCenterX: cardRect.left + cardRect.width / 2 - contentRect.left,
          cardLeft: cardRect.left - contentRect.left,
          connectorBottomY: connectorRect.bottom - contentRect.top,
          connectorCenterX:
            connectorRect.left + connectorRect.width / 2 - contentRect.left,
          nodeCenterX: nodeRect.left + nodeRect.width / 2 - contentRect.left,
          nodeCenterY: nodeRect.top + nodeRect.height / 2 - contentRect.top,
        },
      ];
    });

    return {
      items: Object.fromEntries(itemEntries),
      pathD: path.getAttribute("d"),
    };
  }, itemIds);
}

async function waitForTimelineGeometryStable(page: Page, itemIds: string[]) {
  await expect
    .poll(
      async () => {
        const before = await getTimelineGeometry(page, itemIds);
        await page.waitForTimeout(90);
        const after = await getTimelineGeometry(page, itemIds);

        return getTimelineGeometryMaxDelta(before, after, itemIds);
      },
      { timeout: 5000 },
    )
    .toBeLessThan(0.75);
}

function getTimelineGeometryMaxDelta(
  before: TimelineGeometrySnapshot,
  after: TimelineGeometrySnapshot,
  itemIds: string[],
) {
  let maxDelta = 0;

  for (const id of itemIds) {
    const beforeItem = before.items[id];
    const afterItem = after.items[id];

    if (!(beforeItem && afterItem)) {
      return Number.POSITIVE_INFINITY;
    }

    maxDelta = Math.max(
      maxDelta,
      Math.abs(afterItem.nodeCenterX - beforeItem.nodeCenterX),
      Math.abs(afterItem.nodeCenterY - beforeItem.nodeCenterY),
      Math.abs(afterItem.cardCenterX - beforeItem.cardCenterX),
      Math.abs(afterItem.connectorCenterX - beforeItem.connectorCenterX),
    );
  }

  return maxDelta;
}

function getTimelineSpacing(
  page: Page,
  itemIds: string[],
): Promise<Record<string, TimelineSpacingItem> | null> {
  return page.evaluate((ids) => {
    const timeline = document.querySelector(
      "[data-testid=animated-curved-timeline]",
    );
    const viewport = timeline?.querySelector(
      "[data-testid=timeline-scroll-viewport]",
    );
    const content = viewport?.firstElementChild;

    if (!(timeline && content)) {
      return null;
    }

    const contentRect = content.getBoundingClientRect();
    const entries = ids.map((id) => {
      const node = timeline.querySelector(
        `[data-testid="demo-timeline-node-${id}"]`,
      );
      const card = timeline.querySelector(
        `[data-testid="timeline-card-${id}"]`,
      );

      if (!(node && card)) {
        return null;
      }

      const nodeRect = node.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();

      return [
        id,
        {
          cardLeft: cardRect.left - contentRect.left,
          cardRight: cardRect.right - contentRect.left,
          nodeCenterX: nodeRect.left + nodeRect.width / 2 - contentRect.left,
        },
      ] as const;
    });

    if (entries.some((entry) => entry === null)) {
      return null;
    }

    return Object.fromEntries(entries.filter((entry) => entry !== null));
  }, itemIds);
}

function expectTimelineGeometryStable(
  before: TimelineGeometrySnapshot,
  after: TimelineGeometrySnapshot,
  itemIds: string[],
) {
  for (const id of itemIds) {
    const beforeItem = before.items[id];
    const afterItem = after.items[id];

    expect(beforeItem).not.toBeNull();
    expect(afterItem).not.toBeNull();
    if (!(beforeItem && afterItem)) {
      continue;
    }

    expect(
      Math.abs(afterItem.nodeCenterX - beforeItem.nodeCenterX),
    ).toBeLessThan(2);
    expect(
      Math.abs(afterItem.nodeCenterY - beforeItem.nodeCenterY),
    ).toBeLessThan(3);
    expect(
      Math.abs(afterItem.cardCenterX - beforeItem.cardCenterX),
    ).toBeLessThan(2);
    expect(
      Math.abs(afterItem.connectorCenterX - beforeItem.connectorCenterX),
    ).toBeLessThan(2);
  }
}

function expectTimelineItemCentered(
  snapshot: TimelineGeometrySnapshot,
  itemId: string,
) {
  const item = snapshot.items[itemId];

  expect(item).not.toBeNull();
  if (!item) {
    return;
  }

  expect(Math.abs(item.nodeCenterX - item.connectorCenterX)).toBeLessThan(2);
  expect(Math.abs(item.cardCenterX - item.connectorCenterX)).toBeLessThan(2);
  expect(Math.abs(item.cardLeft - item.connectorCenterX)).toBeGreaterThan(40);
}

async function expectTimelineConnectorsAligned(page: Page) {
  const maxConnectorDelta = await page.evaluate(() => {
    const timeline = document.querySelector(
      "[data-testid=animated-curved-timeline]",
    );
    const viewport = timeline?.querySelector(
      "[data-testid=timeline-scroll-viewport]",
    );
    const content = viewport?.firstElementChild;
    const path = timeline?.querySelector("svg path");
    const connectorLines = [
      ...(timeline?.querySelectorAll(
        "[data-testid^=timeline-marker-connector-]",
      ) ?? []),
    ];

    if (!(content && path instanceof SVGPathElement)) {
      return Number.POSITIVE_INFINITY;
    }

    const contentRect = content.getBoundingClientRect();
    const totalLength = path.getTotalLength();

    return connectorLines.reduce((maxDelta, line) => {
      const rect = line.getBoundingClientRect();
      const x = rect.left - contentRect.left;
      const y = rect.bottom - contentRect.top;
      let low = 0;
      let high = totalLength;

      for (let index = 0; index < 24; index += 1) {
        const midpoint = (low + high) / 2;
        const point = path.getPointAtLength(midpoint);

        if (point.x < x) {
          low = midpoint;
        } else {
          high = midpoint;
        }
      }

      const pathPoint = path.getPointAtLength((low + high) / 2);

      return Math.max(maxDelta, Math.abs(pathPoint.y - y));
    }, 0);
  });

  expect(maxConnectorDelta).toBeLessThan(2);
}

function selectedProgressDeltaX(page: Page, nodeId: string) {
  return page.evaluate((id) => {
    const timeline = document.querySelector(
      "[data-testid=animated-curved-timeline]",
    );
    const viewport = timeline?.querySelector(
      "[data-testid=timeline-scroll-viewport]",
    );
    const content = viewport?.firstElementChild;
    const progressPath = timeline?.querySelector("svg path.text-rose-500");
    const node = timeline?.querySelector(
      `[data-testid=demo-timeline-node-${id}]`,
    );

    if (!(content && progressPath instanceof SVGPathElement && node)) {
      return Number.POSITIVE_INFINITY;
    }

    const contentRect = content.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const nodeCenterX = nodeRect.left + nodeRect.width / 2 - contentRect.left;
    const totalLength = progressPath.getTotalLength();
    const dashOffset = Number.parseFloat(
      getComputedStyle(progressPath).strokeDashoffset,
    );
    const progressLength = totalLength - dashOffset;
    const progressPoint = progressPath.getPointAtLength(progressLength);

    return Math.abs(progressPoint.x - nodeCenterX);
  }, nodeId);
}

async function getNodeBox(page: Page, nodeId: string) {
  const node = page.getByTestId(`demo-timeline-node-${nodeId}`);

  await node.scrollIntoViewIfNeeded();

  return node.boundingBox();
}

function getTimelineHandoffGap(
  page: Page,
  {
    endNodeId,
    nextStartNodeId,
  }: { endNodeId: string; nextStartNodeId: string },
): Promise<number | null> {
  return page.evaluate(
    ({ endId, startId }) => {
      const timeline = document.querySelector(
        "[data-testid=animated-curved-timeline]",
      );
      const viewport = timeline?.querySelector(
        "[data-testid=timeline-scroll-viewport]",
      );
      const content = viewport?.firstElementChild;
      const endNode = timeline?.querySelector(
        `[data-testid="demo-timeline-end-node-${endId}"]`,
      );
      const nextStartNode = timeline?.querySelector(
        `[data-testid="demo-timeline-node-${startId}"]`,
      );

      if (!(content && endNode && nextStartNode)) {
        return null;
      }

      const contentRect = content.getBoundingClientRect();
      const endRect = endNode.getBoundingClientRect();
      const startRect = nextStartNode.getBoundingClientRect();

      return (
        startRect.left - contentRect.left - (endRect.right - contentRect.left)
      );
    },
    { endId: endNodeId, startId: nextStartNodeId },
  );
}

async function requiredBox(locator: Locator) {
  const box = await locator.boundingBox();

  if (!box) {
    throw new Error("Expected locator to have a bounding box");
  }

  return box;
}

async function requiredRelativeBox(locator: Locator, root: Locator) {
  const [box, rootBox] = await Promise.all([
    requiredBox(locator),
    requiredBox(root),
  ]);

  return {
    ...box,
    x: box.x - rootBox.x,
    y: box.y - rootBox.y,
  };
}

function hoverDotOpacity(page: Page) {
  return page
    .getByTestId("timeline-hover-dot")
    .evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).opacity),
    );
}
