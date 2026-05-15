import { expect, type Page, test } from "@playwright/test";

const ADD_DRAW_LABEL = /Add draw/i;
const ADD_MILESTONE_LABEL = /Add milestone/i;
const ACTIVE_CONNECTOR_CLASS = /to-rose-500/;
const COMPLETED_NODE_BORDER_CLASS = /border-emerald-400/;
const COMPLETED_NODE_TEXT_CLASS = /text-emerald-600/;
const DAY_LABEL = /^Day \d+$/;
const COPIED_LABEL = /Copied/i;
const COPY_LINK_LABEL = /Copy link/i;
const MAILTO_HREF = /^mailto:/;
const REMOVE_DRAW_LABEL = /Remove draw/i;
const REMOVE_MILESTONE_LABEL = /Remove milestone/i;
const SHARE_QUERY = /share=/;
const X_SHARE_HREF = /twitter\.com\/intent\/tweet/;

test("animated curved timeline demo selects progress and inserts spaced nodes", async ({
  page,
}) => {
  await page.goto("/demo/timeline");

  await expect(page.getByTestId("animated-curved-timeline")).toBeVisible();
  await expect(page.getByTestId("demo-timeline-node-rough-in")).toBeVisible();
  await expect(page.getByTestId("timeline-cashflow-ending-cash")).toHaveText(
    "$400,000"
  );
  await expect(
    page.getByTestId("timeline-cashflow-risk-summary")
  ).toContainText("Clear");
  await expect(page.getByTestId("timeline-cash-shortfall-point")).toHaveCount(
    0
  );
  await expect(page.getByTestId("timeline-draw-total-available")).toHaveText(
    "$1,250,000"
  );
  await expect(page.getByTestId("timeline-draw-interest-bearing")).toHaveText(
    "$1,250,000"
  );
  await expect(
    page.getByTestId("timeline-draw-additional-available")
  ).toHaveText("$0");

  const viewport = page.getByTestId("timeline-scroll-viewport");
  await expect
    .poll(async () =>
      viewport.evaluate((element) => element.scrollWidth > element.clientWidth)
    )
    .toBe(true);

  await page.getByTestId("demo-timeline-node-closeout").click();
  await expect(page.getByRole("heading", { name: "Draw 7" })).toBeVisible();

  await page.getByTestId("timeline-track-hit-area").click({
    button: "right",
    position: { x: 520, y: 48 },
  });
  await expect(page.getByTestId("timeline-insert-menu")).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: ADD_DRAW_LABEL })
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: REMOVE_DRAW_LABEL })
  ).toBeHidden();
  await expect(
    page.getByRole("menuitem", { name: REMOVE_MILESTONE_LABEL })
  ).toBeHidden();
  await page.getByRole("menuitem", { name: ADD_MILESTONE_LABEL }).click();

  await expect(page.getByRole("heading", { name: "Inserted 1" })).toBeVisible();
  await expect(
    page.locator('[data-testid^="demo-timeline-node-inserted-"]')
  ).toHaveCount(1);
  await expect(
    page.locator('[data-testid^="timeline-card-connector-inserted-"]')
  ).toHaveCount(1);

  await page.getByTestId("timeline-track-hit-area").click({
    button: "right",
    position: { x: 620, y: 48 },
  });
  await page.getByRole("menuitem", { name: ADD_DRAW_LABEL }).click();
  const manualDrawMarker = page
    .locator('[data-testid^="timeline-draw-marker-manual-draw-"]')
    .first();
  await expect(manualDrawMarker).toBeVisible();
  await expect(page.getByTestId("timeline-cashflow-ending-cash")).toHaveText(
    "$500,000"
  );
  await expect(page.getByTestId("timeline-draw-interest-bearing")).toHaveText(
    "$1,457,500"
  );

  await manualDrawMarker.click();
  const manualDrawEditor = page
    .locator('[data-testid^="timeline-draw-editor-manual-draw-"]')
    .first();
  await manualDrawEditor.getByLabel("Draw amount").fill("150000");
  await manualDrawEditor.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("timeline-cashflow-ending-cash")).toHaveText(
    "$550,000"
  );
  await expect(page.getByTestId("timeline-draw-interest-bearing")).toHaveText(
    "$1,507,500"
  );
  await expect(page.getByTestId("timeline-draw-total-available")).toHaveText(
    "$1,507,500"
  );
  await expect(
    page.getByTestId("timeline-draw-additional-available")
  ).toHaveText("$0");
  await expect(page.getByTestId("timeline-final-financial-card")).toBeVisible();
  await expect(page.getByTestId("timeline-final-draw-fees")).toHaveText(
    "$4,500"
  );
  await expect(
    page.getByTestId("timeline-final-card-connector")
  ).toBeAttached();
});

test("timeline snapshot share links hydrate editable forks", async ({
  context,
  page,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://localhost:3000",
  });
  await page.goto("/demo/timeline");

  await page.getByTestId("demo-timeline-node-closeout").click();
  await expect(page.getByRole("heading", { name: "Draw 7" })).toBeVisible();
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
    "live collaboration session under construction"
  );
  await expect(page.getByTestId("timeline-share-url")).toHaveValue(SHARE_QUERY);

  const shareUrl = await page.getByTestId("timeline-share-url").inputValue();
  expect(shareUrl).toContain("/demo/timeline?share=");
  await expect(page.getByTestId("timeline-share-x")).toHaveAttribute(
    "href",
    X_SHARE_HREF
  );
  await expect(page.getByTestId("timeline-share-email")).toHaveAttribute(
    "href",
    MAILTO_HREF
  );

  await page.getByRole("button", { name: COPY_LINK_LABEL }).click();
  await expect(page.getByRole("button", { name: COPIED_LABEL })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(shareUrl);

  const sharedPage = await context.newPage();
  await sharedPage.goto(shareUrl);
  await expect(
    sharedPage.getByTestId("animated-curved-timeline")
  ).toBeVisible();
  await expect(
    sharedPage.getByRole("heading", { name: "Draw 7" })
  ).toBeVisible();
  await expect(sharedPage.getByRole("switch")).toBeChecked();
  await expect(
    sharedPage.getByTestId("timeline-draw-marker-rough-in")
  ).toContainText("$255,000");
  await expect(
    sharedPage.getByTestId("timeline-draw-marker-rough-in")
  ).toContainText("Day 108");
  await expect(
    sharedPage.getByTestId("timeline-cashflow-ending-cash")
  ).toHaveText("$410,000");

  await sharedPage.getByTestId("timeline-draw-marker-rough-in").click();
  const forkEditor = sharedPage.getByTestId("timeline-draw-editor-rough-in");
  await forkEditor.getByLabel("Draw amount").fill("260000");
  await forkEditor.getByRole("button", { name: "Apply" }).click();
  await expect(
    sharedPage.getByTestId("timeline-draw-marker-rough-in")
  ).toContainText("$260,000");

  const pristineSharedPage = await context.newPage();
  await pristineSharedPage.goto(shareUrl);
  await expect(
    pristineSharedPage.getByTestId("timeline-draw-marker-rough-in")
  ).toContainText("$255,000");
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
    await page.goto("/demo/timeline");

    await expect(page.getByTestId("timeline-cashflow-chart")).toBeVisible();
    await expect(page.getByTestId("animated-curved-timeline")).toBeVisible();
    await expect(
      page.getByTestId("timeline-draw-availability-chart")
    ).toBeVisible();
    await expectNoPageHorizontalOverflow(page);

    for (const testId of [
      "timeline-cashflow-chart",
      "timeline-roadmap-grid",
      "animated-curved-timeline",
      "selected-draw-panel",
      "timeline-draw-availability-chart",
    ]) {
      await expectBoxWithinViewport(page, testId, viewport.width);
    }

    const timelineBox = await page
      .getByTestId("animated-curved-timeline")
      .boundingBox();
    const panelBox = await page
      .getByTestId("selected-draw-panel")
      .boundingBox();
    expect(timelineBox).not.toBeNull();
    expect(panelBox).not.toBeNull();
    if (!(timelineBox && panelBox)) {
      return;
    }
    expect(panelBox.y).toBeGreaterThan(timelineBox.y + timelineBox.height - 4);

    await expect
      .poll(() =>
        page
          .getByTestId("timeline-scroll-viewport")
          .evaluate((element) => element.scrollWidth > element.clientWidth)
      )
      .toBe(true);

    await page.getByTestId("timeline-share-button").click();
    await expect(page.getByTestId("timeline-share-menu")).toBeVisible();
    await expectOverlayWithinViewport(page, "timeline-share-menu", viewport);
    await expectNoPageHorizontalOverflow(page);
    await page.keyboard.press("Escape");

    await page.getByTestId("timeline-track-hit-area").click({
      button: "right",
      position: { x: Math.min(260, viewport.width - 80), y: 48 },
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
  await page.goto("/demo/timeline");

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

  const drawBox = await framingDraw.boundingBox();
  expect(drawBox).not.toBeNull();
  if (!drawBox) {
    return;
  }

  await framingDraw.click({ button: "right" });
  await expect(page.getByTestId("timeline-item-context-menu")).toBeVisible();
  await expectContextMenuNearBox(page, drawBox);
  await page.getByRole("menuitem", { name: REMOVE_DRAW_LABEL }).click();

  await expect(framingDraw).toBeHidden();
  await expect(page.getByTestId("timeline-final-draw-fees")).toHaveText(
    "$3,000"
  );
  await expect(
    page.getByTestId("timeline-cashflow-risk-summary")
  ).toContainText("1 flagged");
  await expect(page.getByTestId("timeline-cash-shortfall-point")).toContainText(
    "needs $5,000 before Rough-in mechanical"
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
  await page.goto("/demo/timeline");

  const hitArea = page.getByTestId("timeline-track-hit-area");

  await hitArea.click({
    button: "right",
    position: { x: 620, y: 48 },
  });
  await expect(page.getByTestId("timeline-insert-menu")).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: ADD_DRAW_LABEL })
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: REMOVE_DRAW_LABEL })
  ).toBeHidden();
  await expect(
    page.getByRole("menuitem", { name: REMOVE_MILESTONE_LABEL })
  ).toBeHidden();
  await page.getByRole("menuitem", { name: ADD_DRAW_LABEL }).click();

  const manualDrawMarker = page
    .locator('[data-testid^="timeline-draw-marker-manual-draw-"]')
    .first();
  await expect(manualDrawMarker).toBeVisible();
  await expect(page.getByTestId("timeline-final-draw-fees")).toHaveText(
    "$4,000"
  );
});

test("timeline path affordances stay aligned with rendered geometry", async ({
  page,
}) => {
  await page.goto("/demo/timeline");

  await expect(page.getByTestId("animated-curved-timeline")).toBeVisible();

  await expect
    .poll(() => selectedProgressDeltaX(page, "rough-in"))
    .toBeLessThan(2);

  const maxConnectorDelta = await page.evaluate(() => {
    const timeline = document.querySelector(
      "[data-testid=animated-curved-timeline]"
    );
    const viewport = timeline?.querySelector(
      "[data-testid=timeline-scroll-viewport]"
    );
    const content = viewport?.firstElementChild;
    const path = timeline?.querySelector("svg path.text-zinc-300\\/80");
    const connectorLines = [
      ...(timeline?.querySelectorAll(
        "[data-testid^=timeline-marker-connector-]"
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
  expect(nodeBox).not.toBeNull();
  if (!nodeBox) {
    return;
  }

  await page.mouse.move(
    nodeBox.x + nodeBox.width / 2,
    nodeBox.y + nodeBox.height / 2
  );
  await expect(page.getByTestId("timeline-hover-marker")).toBeVisible();
  await expect.poll(() => hoverDotOpacity(page)).toBeLessThan(0.05);

  await page.mouse.move(
    nodeBox.x + nodeBox.width / 2 + nodeBox.width * 0.55,
    nodeBox.y + nodeBox.height / 2
  );
  await expect.poll(() => hoverDotOpacity(page)).toBeLessThan(0.35);

  await page.mouse.move(nodeBox.x + nodeBox.width + 96, nodeBox.y);
  await expect.poll(() => hoverDotOpacity(page)).toBeGreaterThan(0.8);

  await expect(page.getByTestId("timeline-marker-connector-today")).toHaveClass(
    ACTIVE_CONNECTOR_CLASS
  );
  await expect(
    page.getByTestId("timeline-marker-connector-policy-limit")
  ).not.toHaveClass(ACTIVE_CONNECTOR_CLASS);
});

test("cashflow chart stays controlled by the shared timeline probe", async ({
  page,
}) => {
  await page.goto("/demo/timeline");

  const chart = page.getByTestId("timeline-cashflow-chart");
  const drawAvailabilityChart = page.getByTestId(
    "timeline-draw-availability-chart"
  );
  const timeline = page.getByTestId("animated-curved-timeline");

  await expect(chart).toBeVisible();
  await expect(
    chart.getByTestId("timeline-cashflow-series-milestone-cost")
  ).toBeVisible();
  await expect(
    chart.getByTestId("timeline-cashflow-series-cash-on-hand")
  ).toBeVisible();
  await expect(
    drawAvailabilityChart.getByTestId("timeline-draw-series-interest-bearing")
  ).toBeVisible();
  await expect(
    drawAvailabilityChart.getByTestId(
      "timeline-draw-series-additional-available"
    )
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

  const framingBox = await getNodeBox(page, "framing");
  expect(framingBox).not.toBeNull();
  if (!framingBox) {
    return;
  }

  await page.mouse.move(
    framingBox.x + framingBox.width / 2,
    framingBox.y + framingBox.height / 2
  );
  await expect(chart.getByTestId("timeline-cashflow-probe-day")).toHaveText(
    "Day 58"
  );
  await expect(page.getByTestId("timeline-draw-delta-readout")).toContainText(
    "$160,000"
  );
  await expect(
    chart.locator("text").filter({ hasText: "Day 58" }).first()
  ).toBeVisible();

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
    chartSurfaceBox.y + chartSurfaceBox.height * 0.48
  );
  await expect(chart.getByTestId("timeline-cashflow-probe-day")).toHaveText(
    DAY_LABEL
  );

  const chartProbeDay = await chart
    .getByTestId("timeline-cashflow-probe-day")
    .textContent();
  expect(chartProbeDay).toMatch(DAY_LABEL);
  await expect(page.getByTestId("timeline-hover-marker")).toContainText(
    chartProbeDay ?? ""
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
    drawAvailabilitySurfaceBox.y + drawAvailabilitySurfaceBox.height * 0.42
  );
  await expect
    .poll(() =>
      page
        .locator(".shadow-xl")
        .last()
        .getByText("Interest-bearing draw", { exact: true })
        .count()
    )
    .toBeLessThanOrEqual(2);
});

test("draw markers display editable dates and amounts", async ({ page }) => {
  await page.goto("/demo/timeline");

  const drawMarker = page.getByTestId("timeline-draw-marker-rough-in");

  await expect(drawMarker).toBeVisible();
  await expect(drawMarker).toContainText("Draw 3");
  await expect(drawMarker).toContainText("$245,000");
  await expect(drawMarker).toContainText("Day 100");

  await drawMarker.click();
  const editor = page.getByTestId("timeline-draw-editor-rough-in");
  await expect(editor).toBeVisible();

  await editor.getByLabel("Draw date").fill("108");
  await editor.getByLabel("Draw amount").fill("255000");
  await editor.getByRole("button", { name: "Apply" }).click();

  await expect(drawMarker).toContainText("Day 108");
  await expect(drawMarker).toContainText("$255,000");
  await expect(page.locator("aside")).toContainText("Milestone cost");
  await expect(page.locator("aside")).toContainText("$245,000");
  await expect(page.getByTestId("timeline-cashflow-ending-cash")).toHaveText(
    "$410,000"
  );
  await expect(page.getByTestId("timeline-draw-interest-bearing")).toHaveText(
    "$1,260,000"
  );
  await expect(page.getByTestId("timeline-draw-total-available")).toHaveText(
    "$1,260,000"
  );
});

test("selected draw panel collapses on milestone double click", async ({
  page,
}) => {
  await page.goto("/demo/timeline");

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
  await expect(page.getByRole("heading", { name: "Draw 2" })).toBeVisible();
  await expect
    .poll(async () => {
      const box = await timeline.boundingBox();
      return box?.width ?? Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(initialTimelineBox.width + 40);
});

test("completed demo nodes keep the draw icon with completed styling", async ({
  page,
}) => {
  await page.goto("/demo/timeline");

  const completedNode = page.getByTestId("demo-timeline-node-framing");

  await expect(completedNode).toHaveClass(COMPLETED_NODE_TEXT_CLASS);
  await expect(completedNode).toHaveClass(COMPLETED_NODE_BORDER_CLASS);
  await expect(
    page.getByTestId("demo-timeline-node-icon-framing")
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

async function expectContextMenuNearBox(
  page: Page,
  targetBox: { height: number; width: number; x: number; y: number }
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
  expect(Math.abs(menuBox.y - targetCenterY)).toBeLessThan(96);
}

async function expectNoPageHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      )
    )
    .toBeLessThanOrEqual(2);
}

async function expectBoxWithinViewport(
  page: Page,
  testId: string,
  viewportWidth: number
) {
  const box = await page.getByTestId(testId).boundingBox();

  expect(box, `${testId} should have a bounding box`).not.toBeNull();
  if (!box) {
    return;
  }

  expect(
    box.x,
    `${testId} should not overflow left on mobile`
  ).toBeGreaterThanOrEqual(-1);
  expect(
    box.x + box.width,
    `${testId} should not overflow right on mobile`
  ).toBeLessThanOrEqual(viewportWidth + 1);
}

async function expectOverlayWithinViewport(
  page: Page,
  testId: string,
  viewport: { height: number; width: number }
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
    `${testId} should not overflow bottom`
  ).toBeLessThanOrEqual(viewport.height + 1);
}

function getTimelineGeometry(
  page: Page,
  itemIds: string[]
): Promise<TimelineGeometrySnapshot> {
  return page.evaluate((ids) => {
    const timeline = document.querySelector(
      "[data-testid=animated-curved-timeline]"
    );
    const viewport = timeline?.querySelector(
      "[data-testid=timeline-scroll-viewport]"
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
        `[data-testid="demo-timeline-node-${id}"]`
      );
      const card = timeline.querySelector(
        `[data-testid="timeline-card-${id}"]`
      );
      const connector = timeline.querySelector(
        `[data-testid="timeline-card-connector-${id}"]`
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

function expectTimelineGeometryStable(
  before: TimelineGeometrySnapshot,
  after: TimelineGeometrySnapshot,
  itemIds: string[]
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
      Math.abs(afterItem.nodeCenterX - beforeItem.nodeCenterX)
    ).toBeLessThan(2);
    expect(
      Math.abs(afterItem.nodeCenterY - beforeItem.nodeCenterY)
    ).toBeLessThan(2);
    expect(
      Math.abs(afterItem.cardCenterX - beforeItem.cardCenterX)
    ).toBeLessThan(2);
    expect(
      Math.abs(afterItem.connectorCenterX - beforeItem.connectorCenterX)
    ).toBeLessThan(2);
  }
}

function expectTimelineItemCentered(
  snapshot: TimelineGeometrySnapshot,
  itemId: string
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
      "[data-testid=animated-curved-timeline]"
    );
    const viewport = timeline?.querySelector(
      "[data-testid=timeline-scroll-viewport]"
    );
    const content = viewport?.firstElementChild;
    const path = timeline?.querySelector("svg path");
    const connectorLines = [
      ...(timeline?.querySelectorAll(
        "[data-testid^=timeline-marker-connector-]"
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
      "[data-testid=animated-curved-timeline]"
    );
    const viewport = timeline?.querySelector(
      "[data-testid=timeline-scroll-viewport]"
    );
    const content = viewport?.firstElementChild;
    const progressPath = timeline?.querySelector("svg path.text-rose-500");
    const node = timeline?.querySelector(
      `[data-testid=demo-timeline-node-${id}]`
    );

    if (!(content && progressPath instanceof SVGPathElement && node)) {
      return Number.POSITIVE_INFINITY;
    }

    const contentRect = content.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const nodeCenterX = nodeRect.left + nodeRect.width / 2 - contentRect.left;
    const totalLength = progressPath.getTotalLength();
    const dashOffset = Number.parseFloat(
      getComputedStyle(progressPath).strokeDashoffset
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

function hoverDotOpacity(page: Page) {
  return page
    .getByTestId("timeline-hover-dot")
    .evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).opacity)
    );
}
