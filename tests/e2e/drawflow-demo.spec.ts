import { expect, type Page, test } from "@playwright/test";

async function waitForWorkspace(page: Page) {
  if (
    page.url().includes("/demo/drawflow/active") ||
    page.url().includes("/demo/drawflow/builder-dashboard")
  ) {
    const ganttTab = page.getByTestId("borrower-dashboard-tab-gantt");
    await expect(ganttTab).toBeVisible();
    if ((await ganttTab.getAttribute("aria-pressed")) !== "true") {
      await ganttTab.click();
    }
  }
  await expect(page.getByTestId("build-workspace-shell")).toBeVisible();
  await expect(page.getByTestId("milestone-rail-row-foundation")).toBeVisible();
}

async function waitForBorrowerDashboard(page: Page) {
  await expect(page.getByTestId("borrower-dashboard-shell")).toBeVisible();
  await expect(page.getByTestId("borrower-dashboard-overview")).toBeVisible();
}

async function resetBorrowerDashboardDemo(page: Page) {
  await page.goto("/demo/drawflow/active");
  await waitForBorrowerDashboard(page);
  await page.getByTestId("borrower-dashboard-tab-gantt").click();
  await expect(page.getByTestId("build-workspace-shell")).toBeVisible();
  await resetDemo(page);
  await page.getByTestId("borrower-dashboard-tab-overview").click();
  await waitForBorrowerDashboard(page);
}

async function expandGanttSidebar(page: Page) {
  const expandButton = page.getByRole("button", {
    name: "Expand Gantt sidebar",
  });
  if (await expandButton.isVisible().catch(() => false)) {
    await expandButton.click();
  }
}

async function resetDemo(page: Page) {
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("drawflow:shared:reset-demo").click();
  await waitForWorkspace(page);
  if (page.url().includes("/proposal")) {
    await expect(page.getByTestId("proposal-analyze-plan")).toHaveCount(0);
    await expect(page.getByTestId("proposal-compilation-status")).toBeVisible();
    await expect(page.getByTestId("workspace-validation-count")).toBeVisible();
    await openValidation(page);
    await expect(page.getByTestId("workspace-validation-panel")).toContainText(
      /must finish|exceeds/i
    );
    await page.keyboard.press("Escape");
  } else {
    await expect(
      page.getByTestId("milestone-rail-row-foundation")
    ).toContainText("In progress");
  }
}

async function selectRole(
  page: Page,
  role: "builderLead" | "lenderAdmin" | "siteVisitor"
) {
  await page.getByTestId("workspace-role-select").selectOption(role);
}

async function selectMilestone(page: Page, milestoneId: string) {
  await closeDetail(page);
  await page.getByTestId(`milestone-rail-row-${milestoneId}`).click();
}

async function closeDetail(page: Page) {
  const sheet = page.getByTestId("milestone-detail-sheet");
  if (await sheet.isVisible().catch(() => false)) {
    await page.getByTestId("milestone-detail-close").click();
    await expect(sheet).toBeHidden();
  }
}

async function openDetail(page: Page, milestoneId: string) {
  await closeDetail(page);
  await page.getByTestId(`milestone-rail-detail-${milestoneId}`).click();
  await expect(page.getByTestId("milestone-detail-sheet")).toBeVisible();
}

async function submitBuilderClaim(
  page: Page,
  milestoneId: string,
  requestedAmount: string
) {
  await selectRole(page, "builderLead");
  await selectMilestone(page, milestoneId);
  await page.getByTestId(`active-primary-mark-complete-${milestoneId}`).click();
  await openDetail(page, milestoneId);
  await page.getByTestId("add-sample-evidence").click();
  await expect(page.getByTestId("milestone-detail-sheet")).toContainText(
    "Draft"
  );
  await page.getByTestId("milestone-actual-cost-input").fill(requestedAmount);
  await page.getByTestId("submit-completion-report").click();
  await expect(
    page.getByTestId(`milestone-rail-row-${milestoneId}`)
  ).toContainText(/Under review|Evidence submitted/i);
}

async function approveClaim(
  page: Page,
  milestoneId: string,
  needsSiteVisit: boolean
) {
  await selectRole(page, "lenderAdmin");
  await openDetail(page, milestoneId);
  await page.getByTestId("accept-evidence").click();
  await expect(page.getByTestId("milestone-detail-sheet")).toContainText(
    "EvidenceApproved"
  );
  if (needsSiteVisit) {
    await page.getByTestId("request-site-visit").click();
    await expect(page.getByTestId("milestone-detail-sheet")).toContainText(
      "SiteVisitRequested"
    );
    await selectRole(page, "siteVisitor");
    await page.getByTestId("claim-site-visit").click();
    await expect(page.getByTestId("milestone-detail-sheet")).toContainText(
      "SiteVisitClaimed"
    );
    await page.getByTestId("submit-site-visit-report").click();
    await expect(page.getByTestId("milestone-detail-sheet")).toContainText(
      "SiteVisitReportSubmitted"
    );
    await selectRole(page, "lenderAdmin");
  }
  await page.getByTestId("approve-milestone").click();
  await expect(
    page.getByTestId(`milestone-rail-row-${milestoneId}`)
  ).toContainText("Approved");
}

async function openDrawer(page: Page, drawer: "audit" | "outbox") {
  await closeDetail(page);
  await page.getByTestId(`workspace-${drawer}-open`).click();
  await expect(page.getByTestId(`workspace-${drawer}-drawer`)).toBeVisible();
}

async function openValidation(page: Page) {
  await closeDetail(page);
  await page.getByTestId("workspace-validation-open").click();
  await expect(page.getByTestId("workspace-validation-panel")).toBeVisible();
}

async function milestoneDates(page: Page, milestoneId: string) {
  const item = page.getByTestId(`timeline-milestone-${milestoneId}`);
  await expect(item).toBeVisible();
  return {
    end: await item.getAttribute("data-end-date"),
    start: await item.getAttribute("data-start-date"),
  };
}

async function dragTimelineMilestone(
  page: Page,
  milestoneId: string,
  deltaX: number
) {
  const item = page.locator(`[data-gantt-feature-id="${milestoneId}"]`);
  await item.scrollIntoViewIfNeeded();
  const box = await item.boundingBox();
  if (!box) {
    throw new Error(`Milestone ${milestoneId} is not visible for dragging.`);
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY, { steps: 8 });
  await page.mouse.up();
}

async function dragMarqueeAcrossMilestones(
  page: Page,
  milestoneIds: [string, string],
  options: { release?: boolean } = {}
) {
  const [firstId, secondId] = milestoneIds;
  const first = page.getByTestId(`timeline-milestone-${firstId}`);
  const second = page.getByTestId(`timeline-milestone-${secondId}`);
  await first.scrollIntoViewIfNeeded();
  await second.scrollIntoViewIfNeeded();
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  const layerBox = await page
    .getByTestId("gantt-selection-layer")
    .boundingBox();
  if (!(firstBox && secondBox && layerBox)) {
    throw new Error(
      "Cannot locate visible Gantt milestones and selection layer."
    );
  }

  const left = Math.min(firstBox.x, secondBox.x);
  const right = Math.max(
    firstBox.x + firstBox.width,
    secondBox.x + secondBox.width
  );
  const top = Math.min(firstBox.y, secondBox.y);
  const bottom = Math.max(
    firstBox.y + firstBox.height,
    secondBox.y + secondBox.height
  );
  const start = await page.evaluate(
    ({ layer, targetLeft, targetTop, targetBottom }) => {
      const layerLeft = Math.max(0, layer.x);
      const layerRight = Math.min(window.innerWidth - 1, layer.x + layer.width);
      const layerTop = Math.max(0, layer.y);
      const layerBottom = Math.min(
        window.innerHeight - 1,
        layer.y + layer.height
      );
      const searchLeft = Math.max(layerLeft + 8, targetLeft - 320);
      const searchRight = Math.min(layerRight - 8, targetLeft - 8);
      const searchTop = Math.max(layerTop + 8, targetTop - 80);
      const searchBottom = Math.min(layerBottom - 8, targetBottom + 12);

      for (let y = searchTop; y <= searchBottom; y += 6) {
        for (let x = searchLeft; x <= searchRight; x += 6) {
          const element = document.elementFromPoint(x, y);
          if (
            element?.getAttribute("data-testid") === "gantt-selection-layer" &&
            !element.closest('[data-gantt-interactive="true"]')
          ) {
            return { x, y };
          }
        }
      }
      return null;
    },
    { layer: layerBox, targetBottom: bottom, targetLeft: left, targetTop: top }
  );
  if (!start) {
    throw new Error(
      "Cannot find an empty Gantt background point for marquee drag."
    );
  }
  const endX = Math.min(layerBox.x + layerBox.width - 12, right + 28);
  const endY = Math.min(layerBox.y + layerBox.height - 12, bottom + 10);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12, start.y + 8, { steps: 2 });
  await expect(page.getByTestId("gantt-selection-marquee")).toBeVisible();
  await page.mouse.move(endX, endY, { steps: 8 });
  if (options.release !== false) {
    await page.mouse.up();
  }
}

async function findEmptyGanttBackgroundPoint(page: Page) {
  const point = await page.evaluate(() => {
    const layer = document.querySelector<HTMLElement>(
      '[data-testid="gantt-selection-layer"]'
    );
    const rect = layer?.getBoundingClientRect();
    if (!rect) {
      return null;
    }
    const left = Math.max(0, rect.left + 8);
    const right = Math.min(window.innerWidth - 1, rect.right - 8);
    const top = Math.max(0, rect.top + 8);
    const bottom = Math.min(window.innerHeight - 1, rect.bottom - 8);

    for (let y = top; y <= bottom; y += 8) {
      for (let x = left; x <= right; x += 8) {
        const element = document.elementFromPoint(x, y);
        if (
          element?.getAttribute("data-testid") === "gantt-selection-layer" &&
          !element.closest('[data-gantt-interactive="true"]')
        ) {
          return { x, y };
        }
      }
    }
    return null;
  });
  if (!point) {
    throw new Error("Cannot find an empty Gantt background point.");
  }
  return point;
}

test("Builder borrower dashboard defaults to Overview with evidence and draw gating", async ({
  page,
}) => {
  await resetBorrowerDashboardDemo(page);

  await expect(
    page.getByTestId("borrower-dashboard-tab-overview")
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("borrower-milestone-rail")).toBeVisible();
  await expect(
    page.getByTestId("borrower-selected-milestone-summary")
  ).toBeVisible();
  await expect(page.getByTestId("borrower-evidence-manager")).toContainText(
    "Evidence Manager"
  );
  await expect(
    page.getByTestId("borrower-mark-complete-permits")
  ).toBeVisible();
  await expect(
    page.getByTestId("borrower-mark-complete-permits")
  ).toContainText("Completed");
  await expect(
    page.getByTestId("borrower-selected-milestone-summary")
  ).toContainText("$10,000");
  await expect(page.getByTestId("borrower-evidence-empty")).toContainText(
    "No evidence yet for Permits"
  );
  await expect(page.getByTestId("borrower-evidence-upload")).toContainText(
    "Upload"
  );
  await expect(page.getByTestId("borrower-evidence-camera")).toContainText(
    "Camera"
  );
  await expect(
    page.getByTestId("borrower-evidence-camera-input")
  ).toHaveAttribute("accept", "image/*");
  await expect(
    page.getByTestId("borrower-evidence-camera-input")
  ).toHaveAttribute("capture", "environment");
  await expect(page.getByTestId("borrower-draw-group-d1")).toBeVisible();
  await expect(page.getByTestId("borrower-draw-group-d2")).toBeVisible();
  await expect(page.getByTestId("borrower-draw-group-d1")).not.toContainText(
    "Active"
  );
  await expect(page.getByTestId("borrower-draw-group-d2")).toContainText(
    "Active"
  );
  await expect(
    page.getByTestId("borrower-draw-group-d1").getByRole("button", {
      name: /Draw 1/,
    })
  ).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("borrower-draw-state-callout")).toContainText(
    "Draw already released"
  );
  await expect(page.getByTestId("borrower-draw-state-callout")).toContainText(
    "Released amount $216,500"
  );
  await expect(page.getByTestId("borrower-submit-draw-request")).toBeDisabled();
  await expect(page.getByTestId("borrower-submit-draw-request")).toContainText(
    "Draw Released"
  );
  expect(
    await page.locator('[data-testid^="borrower-milestone-card-"]').count()
  ).toBe(8);
  await page.getByTestId("borrower-collapse-milestone-rail").click();
  await expect(
    page.getByTestId("borrower-expand-milestone-rail")
  ).toBeVisible();
  await expect(
    page.locator('[data-testid^="borrower-milestone-card-"]')
  ).toHaveCount(0);
  await page.getByTestId("borrower-milestone-preview-foundation").click();
  await expect(
    page.getByTestId("borrower-selected-milestone-summary")
  ).toContainText("Foundation");
  await page.getByTestId("borrower-expand-milestone-rail").click();
  await expect(
    page.getByTestId("borrower-draw-group-d2").getByRole("button", {
      name: /Draw 2/,
    })
  ).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("borrower-draw-group-d2")).toContainText(
    "Active"
  );
  expect(
    await page.locator('[data-testid^="borrower-milestone-card-"]').count()
  ).toBeGreaterThan(8);
  await page.getByTestId("borrower-milestone-card-drawings_insurance").click();
  await expect(
    page.getByTestId("borrower-selected-milestone-summary")
  ).toContainText("Drawings / Insurance");
  await expect(
    page.getByTestId("borrower-mark-complete-drawings_insurance")
  ).toContainText("Completed");
  await expect(
    page.getByTestId("borrower-selected-milestone-summary")
  ).toContainText("$20,000");
  await page.getByTestId("borrower-milestone-card-foundation").click();
  await expect(
    page.getByTestId("borrower-selected-milestone-summary")
  ).toContainText("Foundation");
  await expect(
    page.getByTestId("borrower-mark-complete-foundation")
  ).toBeEnabled();
  await expect(
    page.getByTestId("borrower-selected-milestone-summary")
  ).toContainText("Complete milestone");
  await expect(
    page.getByTestId("borrower-milestone-progress-input")
  ).toHaveCount(0);
  await expect(
    page.getByTestId("borrower-selected-milestone-summary")
  ).not.toContainText("Evidence is optional");
  await expect(page.getByTestId("borrower-draw-group-status")).toContainText(
    "Milestones to Complete"
  );
  await expect(page.getByTestId("borrower-draw-state-callout")).toContainText(
    "Draw not ready"
  );
  await expect(
    page.getByTestId("borrower-draw-outstanding-milestones")
  ).toContainText("Foundation");
  await expect(
    page.getByTestId("borrower-draw-outstanding-evidence")
  ).toContainText("No completed milestones in Draw 2 are waiting on evidence");
  await expect(page.getByTestId("borrower-draw-request-box")).toContainText(
    /Draw 2 reimbursement is blocked by/i
  );
  await expect(page.getByTestId("borrower-draw-request-box")).not.toContainText(
    /evidence requirement/i
  );
  await page.getByTestId("borrower-collapse-status-column").click();
  await expect(page.getByTestId("borrower-expand-status-column")).toBeVisible();
  await expect(page.getByTestId("borrower-draw-status-panel")).toHaveCount(0);
  await page.getByTestId("borrower-expand-status-column").click();
  await expect(page.getByTestId("borrower-draw-status-panel")).toBeVisible();
  await expect(page.getByTestId("borrower-evidence-checklist")).toHaveCount(0);
  await expect(page.getByTestId("borrower-draw-status-panel")).toContainText(
    "Borrower working capital limit"
  );
  await expect(page.getByTestId("borrower-draw-status-panel")).toContainText(
    "Lender draw policy limit"
  );
  await expect(page.getByTestId("borrower-draw-request-box")).toContainText(
    /reimbursement/i
  );
  await expect(page.getByTestId("borrower-submit-draw-request")).toBeDisabled();
});

test("Builder borrower dashboard can update selected milestone completion", async ({
  page,
}) => {
  await resetBorrowerDashboardDemo(page);
  await page
    .getByTestId("borrower-draw-group-d2")
    .getByRole("button", { name: /Draw 2/ })
    .click();
  await page.getByTestId("borrower-milestone-card-foundation").click();

  await page.getByTestId("borrower-mark-complete-foundation").click();
  await expect(page.getByTestId("borrower-completion-dialog")).toBeVisible();
  await expect(page.getByTestId("borrower-completion-dialog")).toContainText(
    "No files attached"
  );
  await page.getByTestId("borrower-confirm-completion-foundation").click();
  await expect(
    page.getByTestId("borrower-selected-milestone-summary")
  ).toContainText("Under Review");
  await expect(
    page.getByTestId("borrower-mark-complete-foundation")
  ).toBeDisabled();
  await expect(
    page.getByTestId("borrower-draw-outstanding-evidence")
  ).toContainText("No completed milestones in Draw 2 are waiting on evidence");
  await expect(page.getByTestId("borrower-submit-draw-request")).toBeDisabled();
});

test("Builder borrower dashboard camera evidence capture opens device camera", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async (constraints: MediaStreamConstraints) => {
          window.localStorage.setItem(
            "drawflow-camera-constraints",
            JSON.stringify(constraints)
          );
          return new MediaStream();
        },
      },
    });
    HTMLMediaElement.prototype.play = async () => {};
  });
  await page.goto("/demo/drawflow/active");
  await waitForBorrowerDashboard(page);

  await page.getByTestId("borrower-evidence-camera").click();
  await expect(
    page.getByTestId("borrower-evidence-camera-panel")
  ).toBeVisible();
  await expect(page.getByLabel("Camera preview")).toBeVisible();
  await expect(
    page.getByTestId("borrower-evidence-camera-capture")
  ).toContainText("Capture photo");
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem("drawflow-camera-constraints")
      )
    )
    .toContain('"environment"');
});

test("Builder borrower dashboard can intake an expense from financial controls", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/active");
  await waitForBorrowerDashboard(page);

  await page.getByTestId("borrower-add-expense").click();
  await expect(page.getByRole("heading", { name: "Add expense" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Expense details" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Receipt / invoice" })).toBeVisible();
  await page.getByTestId("borrower-expense-vendor").fill("Harbor Concrete");
  await page.getByTestId("borrower-expense-amount").fill("1250");
  await page
    .getByTestId("borrower-expense-description")
    .fill("Permit revision fee");
  await page.getByRole("tab", { name: "Receipt / invoice" }).click();
  await page.getByTestId("borrower-expense-receipt-upload").setInputFiles({
    buffer: Buffer.from("receipt"),
    mimeType: "application/pdf",
    name: "permit-receipt.pdf",
  });
  await expect(page.getByTestId("borrower-expense-receipt-files")).toContainText(
    "permit-receipt.pdf"
  );
  await expect(page.getByTestId("borrower-expense-camera-input")).toHaveAttribute(
    "capture",
    "environment"
  );
  await page.getByTestId("borrower-expense-submit").click();

  await expect(page.getByRole("heading", { name: "Add expense" })).toHaveCount(0);
  await expect(page.getByTestId("borrower-financial-controls")).toContainText(
    "Permit revision fee"
  );
  await expect(page.getByTestId("borrower-financial-controls")).toContainText(
    "$1,250"
  );
});

test("Builder borrower dashboard keeps the active workspace in Gantt View", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/active");
  await waitForBorrowerDashboard(page);

  await page.getByTestId("borrower-dashboard-tab-gantt").click();
  await expect(page.getByTestId("build-workspace-shell")).toBeVisible();
  await expect(page.getByTestId("milestone-rail-row-foundation")).toBeVisible();
  await page.getByTestId("milestone-rail-row-water_sewer").click();
  await expect(
    page.getByTestId("milestone-rail-row-water_sewer")
  ).toBeVisible();
});

test("Builder dashboard route is merged into borrower dashboard tabs", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/builder-dashboard");
  await waitForBorrowerDashboard(page);

  await page.getByTestId("borrower-dashboard-tab-chat").click();
  await expect(page.getByTestId("borrower-chat-tab")).toContainText(
    "Project Chat"
  );
  await expect(page.getByTestId("borrower-chat-tab")).toContainText(
    /evidence|draw|milestone|validation|released/i
  );
  await page.getByTestId("borrower-dashboard-tab-documents").click();
  await expect(page.getByTestId("borrower-documents-tab")).toContainText(
    "Project Documents"
  );
  await expect(page.getByTestId("borrower-documents-tab")).toContainText(
    "approved budget"
  );
  await page.getByTestId("borrower-dashboard-tab-gantt").click();
  await expect(page.getByTestId("build-workspace-shell")).toBeVisible();
});

async function dragDrawGroup(page: Page, drawGroupId: string, deltaX: number) {
  const handle = page.getByTestId(`draw-drag-handle-${drawGroupId}`);
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error(`Draw group ${drawGroupId} is not visible for dragging.`);
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY, { steps: 8 });
  await page.mouse.up();
}

test("IC-ACT-DRAW-GROUP-AUTO-RELEASE release-approves Draw 2 and unblocks Draw 3 capital after final milestone approval", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/active");
  await waitForWorkspace(page);
  await resetDemo(page);

  await submitBuilderClaim(page, "foundation", "70000");
  await approveClaim(page, "foundation", true);
  await expect(
    page.getByTestId("milestone-rail-row-underground_plumbing")
  ).not.toContainText("Blocked");

  await submitBuilderClaim(page, "underground_plumbing", "20000");
  await approveClaim(page, "underground_plumbing", false);

  await submitBuilderClaim(page, "water_sewer", "45000");
  await approveClaim(page, "water_sewer", false);

  await expect(page.getByTestId("draw-label-d2")).toContainText("Released");
  await expect(
    page.getByTestId("milestone-rail-row-framing")
  ).not.toContainText("Blocked");
  await openDrawer(page, "outbox");
  await expect(page.getByText("demo.drawGroup.releaseApproved")).toBeVisible();
});

test("IC-PROP-GANTT-MULTI-SELECT-BATCH-DRAG shifts selected unlocked proposal milestones", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/proposal");
  await waitForWorkspace(page);
  await resetDemo(page);
  await expect(
    page.getByTestId("timeline-milestone-foundation")
  ).toHaveAttribute("data-start-date", "2026-02-04");

  const foundationBefore = await milestoneDates(page, "foundation");
  const plumbingBefore = await milestoneDates(page, "underground_plumbing");

  await page
    .getByTestId("timeline-milestone-foundation")
    .click({ modifiers: ["Shift"] });
  await page
    .getByTestId("timeline-milestone-underground_plumbing")
    .click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("gantt-selection-count")).toContainText(
    "2 selected"
  );
  const toggleModifier = process.platform === "darwin" ? "Meta" : "Control";
  await page.getByTestId("timeline-milestone-underground_plumbing").click({
    modifiers: [toggleModifier],
  });
  await expect(
    page.getByTestId("timeline-milestone-underground_plumbing")
  ).toHaveAttribute("data-selected", "false");
  await page.getByTestId("timeline-milestone-underground_plumbing").click({
    modifiers: [toggleModifier],
  });
  await expect(page.getByTestId("gantt-selection-count")).toContainText(
    "2 selected"
  );

  await dragTimelineMilestone(page, "foundation", 140);

  await expect(
    page.getByTestId("timeline-milestone-foundation")
  ).not.toHaveAttribute("data-start-date", foundationBefore.start ?? "");
  await expect(
    page.getByTestId("timeline-milestone-underground_plumbing")
  ).not.toHaveAttribute("data-start-date", plumbingBefore.start ?? "");
  await openDrawer(page, "audit");
  await expect(page.getByText("demo_batchMoveMilestoneDates")).toBeVisible();
  await page.getByText("Close").click();
  await expect(page.getByTestId("proposal-analyze-plan")).toHaveCount(0);
  await openValidation(page);
  await expect(page.getByTestId("workspace-validation-panel")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("IC-PROP-GANTT-DRAW-ELIGIBLE-HOVER shows eligible marker details", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/proposal");
  await waitForWorkspace(page);
  await resetDemo(page);

  const marker = page.getByTestId("draw-eligible-d7");
  await marker.scrollIntoViewIfNeeded();
  await expect(marker).toContainText("Draw 7 eligible");
  const before = await marker.boundingBox();
  await marker.hover();
  await expect(page.getByTestId("draw-eligible-d7-detail")).toBeVisible();
  await expect(page.getByTestId("draw-eligible-d7-detail")).toContainText(
    /Draw value|Total exposure/i
  );
  const after = await marker.boundingBox();
  expect((after?.height ?? 0) >= (before?.height ?? 0)).toBe(true);
});

test("IC-PROP-GANTT-MARQUEE-SELECT selects intersecting milestones", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/proposal");
  await waitForWorkspace(page);
  await resetDemo(page);

  await dragMarqueeAcrossMilestones(page, [
    "foundation",
    "underground_plumbing",
  ]);

  await expect(page.getByTestId("gantt-selection-marquee")).toHaveCount(0);
  await expect(
    page.getByTestId("timeline-milestone-foundation")
  ).toHaveAttribute("data-selected", "true");
  await expect(
    page.getByTestId("timeline-milestone-underground_plumbing")
  ).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("gantt-selection-count")).toContainText(
    /selected/
  );
  const selectedCount = Number(
    (await page.getByTestId("gantt-selection-count").textContent())?.match(
      /\d+/
    )?.[0] ?? 0
  );
  expect(selectedCount).toBeGreaterThanOrEqual(2);

  const emptyPoint = await findEmptyGanttBackgroundPoint(page);
  await page.mouse.click(emptyPoint.x, emptyPoint.y);
  await expect(page.getByTestId("gantt-selection-count")).toHaveCount(0);
  await expect(
    page.getByTestId("timeline-milestone-foundation")
  ).toHaveAttribute("data-selected", "false");
});

test("IC-PROP-GANTT-MARQUEE-BATCH-DRAG shifts selected milestones", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/proposal");
  await waitForWorkspace(page);
  await resetDemo(page);

  const foundationBefore = await milestoneDates(page, "foundation");
  const plumbingBefore = await milestoneDates(page, "underground_plumbing");
  await dragMarqueeAcrossMilestones(page, [
    "foundation",
    "underground_plumbing",
  ]);
  await expect(page.getByTestId("gantt-selection-count")).toContainText(
    /selected/
  );

  await dragTimelineMilestone(page, "foundation", 140);

  await expect(
    page.getByTestId("timeline-milestone-foundation")
  ).not.toHaveAttribute("data-start-date", foundationBefore.start ?? "");
  await expect(
    page.getByTestId("timeline-milestone-underground_plumbing")
  ).not.toHaveAttribute("data-start-date", plumbingBefore.start ?? "");
  const foundationAfter = await milestoneDates(page, "foundation");
  const plumbingAfter = await milestoneDates(page, "underground_plumbing");
  expect(foundationAfter.start).not.toBe(foundationBefore.start);
  expect(plumbingAfter.start).not.toBe(plumbingBefore.start);
});

test("IC-PROP-GANTT-MARQUEE does not start from marker labels or milestone bars", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/proposal");
  await waitForWorkspace(page);
  await resetDemo(page);

  const marker = page.getByTestId("draw-eligible-d7");
  await marker.scrollIntoViewIfNeeded();
  const markerBox = await marker.boundingBox();
  if (!markerBox) {
    throw new Error("Cannot locate Draw Eligible marker.");
  }
  await page.mouse.move(
    markerBox.x + markerBox.width / 2,
    markerBox.y + markerBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    markerBox.x + markerBox.width / 2 + 80,
    markerBox.y + markerBox.height / 2 + 40,
    {
      steps: 6,
    }
  );
  await expect(page.getByTestId("gantt-selection-marquee")).toHaveCount(0);
  await page.mouse.up();

  const foundationBefore = await milestoneDates(page, "foundation");
  await dragTimelineMilestone(page, "foundation", 80);
  await expect(page.getByTestId("gantt-selection-marquee")).toHaveCount(0);
  await expect(
    page.getByTestId("timeline-milestone-foundation")
  ).not.toHaveAttribute("data-start-date", foundationBefore.start ?? "");
});

test("IC-PROP-GANTT-LOCK prevents individual and batch milestone drag", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/proposal");
  await waitForWorkspace(page);
  await resetDemo(page);
  await expect(
    page.getByTestId("timeline-milestone-foundation")
  ).toHaveAttribute("data-start-date", "2026-02-04");

  const foundationBefore = await milestoneDates(page, "foundation");
  await expandGanttSidebar(page);
  await page.getByTestId("gantt-sidebar-lock-foundation").click();
  await expect(
    page.getByTestId("gantt-sidebar-lock-foundation")
  ).toHaveAttribute("aria-pressed", "true");

  await dragTimelineMilestone(page, "underground_plumbing", 140);
  await expect(
    page.getByTestId("timeline-milestone-foundation")
  ).toHaveAttribute("data-start-date", foundationBefore.start ?? "");

  const plumbingBefore = await milestoneDates(page, "underground_plumbing");
  await page
    .getByTestId("timeline-milestone-foundation")
    .click({ modifiers: ["Shift"], force: true });
  await page
    .getByTestId("timeline-milestone-underground_plumbing")
    .click({ modifiers: ["Shift"] });
  await dragTimelineMilestone(page, "underground_plumbing", 140);

  await expect(
    page.getByTestId("timeline-milestone-foundation")
  ).toHaveAttribute("data-start-date", foundationBefore.start ?? "");
  await expect(
    page.getByTestId("timeline-milestone-underground_plumbing")
  ).not.toHaveAttribute("data-start-date", plumbingBefore.start ?? "");

  await page.reload();
  await waitForWorkspace(page);
  await expandGanttSidebar(page);
  await expect(
    page.getByTestId("gantt-sidebar-lock-foundation")
  ).toHaveAttribute("aria-pressed", "true");
});

test("IC-PROP-DRAW-GROUP-DRAG shifts unlocked milestones and skips locked", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/proposal");
  await waitForWorkspace(page);
  await resetDemo(page);
  await expect(
    page.getByTestId("timeline-milestone-underground_plumbing")
  ).toHaveAttribute("data-start-date", "2026-02-19");

  await expandGanttSidebar(page);
  await page.getByTestId("gantt-sidebar-lock-underground_plumbing").click();
  const plumbingBefore = await milestoneDates(page, "underground_plumbing");
  const framingBefore = await milestoneDates(page, "framing");
  const eligibleBefore = await page
    .getByTestId("draw-eligible-d2")
    .boundingBox();

  await dragDrawGroup(page, "d2", 220);

  await expect(
    page.getByTestId("timeline-milestone-underground_plumbing")
  ).toHaveAttribute("data-start-date", plumbingBefore.start ?? "");
  await expect(
    page.getByTestId("timeline-milestone-framing")
  ).not.toHaveAttribute("data-start-date", framingBefore.start ?? "");
  await expect
    .poll(async () => {
      const eligibleAfter = await page
        .getByTestId("draw-eligible-d2")
        .boundingBox();
      return Math.round((eligibleAfter?.x ?? 0) - (eligibleBefore?.x ?? 0));
    })
    .not.toBe(0);
});

test("IC-ACT-GANTT-BATCH-FORECAST-SHIFT requires one reason and audits", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/active");
  await waitForWorkspace(page);
  await resetDemo(page);
  await expect(
    page.getByTestId("timeline-milestone-foundation")
  ).toHaveAttribute("data-start-date", "2026-03-09");

  const foundationBefore = await milestoneDates(page, "foundation");
  const plumbingBefore = await milestoneDates(page, "underground_plumbing");
  await page.evaluate(() => {
    window.prompt = () => "Coordinated weather recovery shift.";
  });
  await page
    .getByTestId("timeline-milestone-foundation")
    .click({ modifiers: ["Shift"] });
  await page
    .getByTestId("timeline-milestone-underground_plumbing")
    .click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("gantt-selection-count")).toContainText(
    "2 selected"
  );
  await expect(
    page.getByTestId("timeline-milestone-underground_plumbing")
  ).toHaveAttribute("data-selected", "true");
  await dragTimelineMilestone(page, "underground_plumbing", 140);

  await expect(
    page.getByTestId("timeline-milestone-foundation")
  ).not.toHaveAttribute("data-start-date", foundationBefore.start ?? "");
  await expect(
    page.getByTestId("timeline-milestone-underground_plumbing")
  ).not.toHaveAttribute("data-start-date", plumbingBefore.start ?? "");
  await openDrawer(page, "audit");
  await expect(page.getByText("demo_batchMoveMilestoneDates")).toBeVisible();
  await expect(
    page.getByText("Coordinated weather recovery shift.")
  ).toBeVisible();
});

test("IC-ACT-GANTT-FORECAST-RESIZE-END persists forecast shift and exposes audit entry", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/active");
  await waitForWorkspace(page);
  await resetDemo(page);
  await selectMilestone(page, "foundation");

  await expect(
    page.getByTestId("timeline-foundation-right-resize-handle")
  ).toBeVisible();
  await openDetail(page, "foundation");
  await page
    .getByTestId("audit-reason-input")
    .fill("Weather delay moved the pour window.");
  await page.getByTestId("milestone-start-date-input").fill("2026-03-16");
  await page.getByTestId("save-milestone").click();

  await openDrawer(page, "audit");
  await expect(
    page.getByText("demo_updateForecastDatesWithReason")
  ).toBeVisible();
});

test("IC-ACT-EVIDENCE-UPLOAD-METADATA supports upload metadata and completion outbox flow", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/active");
  await waitForWorkspace(page);
  await resetDemo(page);

  await selectRole(page, "builderLead");
  await selectMilestone(page, "water_sewer");
  await page.getByTestId("active-primary-mark-complete-water_sewer").click();
  await openDetail(page, "water_sewer");
  await page.getByTestId("upload-evidence").setInputFiles({
    buffer: Buffer.from("demo invoice metadata"),
    mimeType: "application/pdf",
    name: "water-sewer-invoice.pdf",
  });
  await page.getByTestId("milestone-actual-cost-input").fill("43000");
  await page.getByTestId("submit-completion-report").click();
  await expect(
    page.getByTestId("milestone-rail-row-water_sewer")
  ).toContainText(/Under review|Evidence submitted/i);
  await openDrawer(page, "outbox");
  await expect(page.getByTestId("workspace-outbox-drawer")).toContainText(
    "demo.milestone.completionClaimSubmitted"
  );
});

test("IC-PROP-APPLY-RECOMMENDED-PLAN clears hard errors and IC-PROP-SUBMIT-SUCCESS freezes proposal", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/proposal");
  await waitForWorkspace(page);
  await resetDemo(page);

  await openValidation(page);
  await expect(page.getByTestId("workspace-validation-panel")).toContainText(
    /exceeds|must finish/i
  );
  await page.keyboard.press("Escape");
  await page.getByTestId("proposal-apply-plan").click();
  await openValidation(page);
  await expect(page.getByTestId("workspace-validation-panel")).toContainText(
    "No blocking errors"
  );
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("proposal-submit")).toBeEnabled();
  await page.getByTestId("proposal-submit").click();

  await expect(
    page.getByText(
      "Proposal submitted for review. Approval workflow is out of scope for this demo."
    )
  ).toBeVisible();
  await expect(page.getByTestId("proposal-submit")).toBeDisabled();
  await expect(page.getByTestId("proposal-analyze-plan")).toHaveCount(0);
  await openDrawer(page, "outbox");
  await expect(page.getByText("demo.proposal.submitted")).toBeVisible();
});

test("IC-PROP-EDIT-VALUE updates validation and dependency controls enforce system rules", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/proposal");
  await waitForWorkspace(page);
  await resetDemo(page);

  await openDetail(page, "foundation");
  await page.getByTestId("milestone-estimated-cost-input").fill("900000");
  await page.getByTestId("milestone-estimated-cost-input").blur();
  await page.getByTestId("save-milestone").click();
  await expect(page.getByTestId("milestone-rail-row-foundation")).toContainText(
    "$900K"
  );
  await openValidation(page);
  await expect(page.getByTestId("workspace-validation-panel")).toContainText(
    /exceeds/i
  );
  await page.keyboard.press("Escape");

  await openDetail(page, "foundation");
  await page.getByTestId("milestone-duration-input").fill("18");
  await page.getByTestId("milestone-start-date-input").fill("2026-03-16");
  await page.getByTestId("save-milestone").click();

  await openDetail(page, "underground_plumbing");
  await page.locator('[data-testid^="dependency-remove-"]').first().click();
  await expect(page.getByTestId("dependency-error")).toContainText(
    "System hard dependencies cannot be removed."
  );

  await openDetail(page, "foundation");
  await page.getByTestId("dependency-target-select").selectOption("lumber");
  await page.getByTestId("dependency-hardness-select").selectOption("soft");
  await page.getByTestId("add-dependency").click();
  await openDrawer(page, "audit");
  await expect(page.getByText("demo_addProposalDependency")).toBeVisible();
});

test("IC-PROP-ADD-MILESTONE creates editable custom milestone and supports rail reorder", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/proposal");
  await waitForWorkspace(page);
  await resetDemo(page);

  await page.getByTestId("workspace-add-milestone-open").click();
  await page.getByTestId("add-milestone-name-input").fill("Custom scope gap");
  await page.getByTestId("add-milestone-cost-input").fill("42000");
  await page.getByTestId("add-milestone-days-input").fill("9");
  await page.getByTestId("add-milestone-draw-select").selectOption("d2");
  await page.getByTestId("add-milestone-submit").click();
  await expect(page.getByTestId("milestone-rail-row-custom_45")).toBeVisible();
  await expect(page.getByTestId("timeline-milestone-custom_45")).toBeVisible();

  await page.getByTestId("milestone-move-up-custom_45").click();
  await page.getByTestId("milestone-move-down-custom_45").click();
  await openDetail(page, "custom_45");
  await page.getByTestId("milestone-start-date-input").fill("2026-08-20");
  await page.getByTestId("save-milestone").click();
  await page.reload();
  await waitForWorkspace(page);
  await expect(page.getByTestId("milestone-rail-row-custom_45")).toBeVisible();
});

test("workspace issue chips open popouts, quick fixes audit, and dismissals are condition-aware", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/proposal");
  await waitForWorkspace(page);
  await resetDemo(page);

  await page.getByTestId("milestone-issue-chip-foundation").click();
  await expect(
    page.getByTestId("milestone-issue-chip-foundation-popover")
  ).toContainText(/Why it matters|Recommended fix/i);
  await page.locator('[data-testid^="issue-focus-"]').first().click();
  await expect(page.getByTestId("milestone-detail-sheet")).toBeVisible();

  await openValidation(page);
  await page.getByTestId("validation-issue-draw-overlap-d1-d2").click();
  await expect(
    page.getByTestId("validation-issue-draw-overlap-d1-d2-popover")
  ).toContainText("Draw groups overlap");
  await page.getByTestId("issue-dismiss-draw-overlap-d1-d2").click();
  await expect(
    page.getByTestId("validation-issue-draw-overlap-d1-d2")
  ).toHaveCount(0);
  await page
    .getByTestId("workspace-validation-dialog")
    .getByRole("button", { name: "Close" })
    .click();
  await openDrawer(page, "audit");
  await expect(page.getByText("WorkspaceIssueDismissed")).toBeVisible();
  await page.getByText("Close").click();
  await page.reload();
  await waitForWorkspace(page);
  await openValidation(page);
  await expect(
    page.getByTestId("validation-issue-draw-overlap-d1-d2")
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  await openDetail(page, "foundation");
  await page.getByTestId("milestone-start-date-input").fill("2026-04-15");
  await page.getByTestId("save-milestone").click();
  await openValidation(page);
  await expect(
    page.getByTestId("validation-issue-draw-overlap-d1-d2")
  ).toBeVisible();

  await page
    .locator('[data-testid^="validation-issue-dependency-order-"]')
    .first()
    .click();
  await page
    .locator('[data-testid^="issue-quickfix-dependency-order-"]')
    .first()
    .click({ force: true });
  await page.keyboard.press("Escape");
  await openDrawer(page, "audit");
  await expect(page.getByText("WorkspaceIssueQuickFixApplied")).toBeVisible();
});

test("proposal rail collapses and drag handle reorders milestones persistently", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/proposal");
  await waitForWorkspace(page);
  await resetDemo(page);

  await page.getByTestId("milestone-rail-collapse-toggle").click();
  await expect(page.getByTestId("milestone-rail")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Expand Gantt sidebar" })
  ).toBeVisible();
  await page.getByTestId("milestone-rail-collapse-toggle").click();
  await expect(page.getByTestId("milestone-rail")).toHaveCSS("width", "420px");

  const beforeIds = await page
    .locator('[data-testid^="milestone-rail-row-"]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-testid")));
  const beforeIndex = beforeIds.indexOf("milestone-rail-row-foundation");
  await expect(
    page.getByTestId("milestone-drag-handle-foundation")
  ).toBeEnabled();
  await expect(page.getByTestId("milestone-move-up-foundation")).toBeEnabled();
  await page.getByTestId("milestone-move-up-foundation").click();
  await openDrawer(page, "audit");
  await expect(page.getByText("demo_reorderProposalMilestones")).toBeVisible();
  await page.getByText("Close").click();
  await page.reload();
  await waitForWorkspace(page);
  const afterIds = await page
    .locator('[data-testid^="milestone-rail-row-"]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-testid")));
  expect(afterIds.indexOf("milestone-rail-row-foundation")).not.toBe(
    beforeIndex
  );
});

test("thin Gantt bars expose preview, detail sheet, and anchored issue popouts", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/proposal");
  await waitForWorkspace(page);
  await resetDemo(page);

  await expect(page.getByTestId("timeline-milestone-foundation")).toContainText(
    /M-050|Foundation/
  );
  await expect(
    page.getByTestId("timeline-milestone-foundation")
  ).not.toContainText("$");
  await page.getByTestId("timeline-milestone-foundation").hover();
  await expect(page.getByTestId("gantt-preview-foundation")).toBeVisible();
  await page.getByTestId("gantt-issue-chip-foundation").click();
  await expect(
    page.getByTestId("gantt-issue-chip-foundation-popover")
  ).toContainText(/Recommended fix/i);
  await page.getByTestId("timeline-milestone-foundation").click();
  await expect(page.getByTestId("milestone-detail-sheet")).toBeVisible();
});

test("JIT compilation updates validation and draw eligibility without Analyze", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/proposal");
  await waitForWorkspace(page);
  await resetDemo(page);

  await expect(page.getByTestId("proposal-analyze-plan")).toHaveCount(0);
  await page.getByTestId("timeline-resolution-daily").click();
  const initialEligibleText = await page
    .getByTestId("draw-eligible-d1")
    .textContent();
  await openDetail(page, "foundation");
  await page.getByTestId("milestone-duration-input").fill("80");
  await page.getByTestId("milestone-duration-input").blur();
  await page.getByTestId("save-milestone").click();
  await expect(page.getByTestId("milestone-rail-row-foundation")).toContainText(
    "80d"
  );
  await openValidation(page);
  await expect(page.getByTestId("workspace-validation-panel")).toContainText(
    /overlap|must finish|exceeds/i
  );
  await page.keyboard.press("Escape");
  const shiftedEligibleText = await page
    .getByTestId("draw-eligible-d1")
    .textContent();
  expect(shiftedEligibleText).not.toBe(initialEligibleText);
});

test("IC-PROP-DRAW-GROUP-SPLIT-MERGE recomputes draw overlays and fee summary", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/proposal");
  await waitForWorkspace(page);
  await resetDemo(page);

  await openDetail(page, "temp_fencing");
  const initialOverlayCount = await page
    .locator('[data-testid^="draw-label-"]')
    .count();
  await page.getByTestId("split-draw").click();
  await expect(page.locator('[data-testid^="draw-label-"]')).toHaveCount(
    initialOverlayCount + 1
  );
  await expect(page.getByText(/fees/i).first()).toBeVisible();
  await openDetail(page, "foundation");
  await page.getByTestId("merge-prev-draw").click();
  await expect(page.locator('[data-testid^="draw-label-"]')).toHaveCount(
    initialOverlayCount
  );
});

test("IC-SHARED-DRAWER-AUDIT-OUTBOX exposes append-only records", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/active");
  await waitForWorkspace(page);
  await resetDemo(page);

  await selectRole(page, "builderLead");
  await selectMilestone(page, "foundation");
  await page.getByTestId("active-primary-mark-complete-foundation").click();
  await openDrawer(page, "audit");
  await expect(page.getByText("demo_updateMilestoneProgress")).toBeVisible();
  await page.getByText("Close").click();

  await openDetail(page, "foundation");
  await page.getByTestId("add-sample-evidence").click();
  await page.getByTestId("milestone-actual-cost-input").fill("70000");
  await page.getByTestId("submit-completion-report").click();
  await openDrawer(page, "outbox");
  await expect(
    page.getByText("demo.milestone.completionClaimSubmitted")
  ).toBeVisible();
});

test("DrawFlow borrower dashboard screenshot QA across responsive breakpoints", async ({
  page,
}) => {
  async function expectNoDocumentOverflow() {
    const documentOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    );
    expect(documentOverflow).toBeLessThanOrEqual(1);
  }

  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["medium", { width: 1024, height: 900 }],
    ["mobile", { width: 390, height: 844 }],
  ] as const) {
    await page.setViewportSize(viewport);
    await resetBorrowerDashboardDemo(page);
    if (name === "desktop") {
      await expect(page.getByTestId("borrower-milestone-rail")).toBeVisible();
      await expect(
        page.getByTestId("borrower-draw-status-panel")
      ).toBeVisible();
      await expect(
        page.getByTestId("borrower-mobile-open-panels")
      ).toBeHidden();
    } else {
      await expect(
        page.getByTestId("borrower-mark-complete-permits")
      ).toBeVisible();
      await expect(
        page.getByTestId("borrower-mobile-open-panels")
      ).toBeVisible();
      await expect(
        page.getByTestId("borrower-mobile-open-panels")
      ).toContainText("Milestones");
      await page.getByTestId("borrower-mobile-open-panels").click();
      await expect(
        page.getByTestId("intro-disclosure-tab-milestones")
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page
          .getByTestId("borrower-draw-group-d1")
          .getByRole("button", { name: /Draw 1/ })
      ).toHaveAttribute("aria-expanded", "true");
      await expect(
        page
          .getByTestId("borrower-draw-group-d2")
          .getByRole("button", { name: /Draw 2/ })
      ).toHaveAttribute("aria-expanded", "false");
      await page
        .getByTestId("borrower-draw-group-d2")
        .getByRole("button", { name: /Draw 2/ })
        .click();
      await page.getByTestId("borrower-milestone-card-foundation").click();
      await expect(
        page
          .getByTestId("borrower-draw-group-d1")
          .getByRole("button", { name: /Draw 1/ })
      ).toHaveAttribute("aria-expanded", "false");
      await expect(
        page
          .getByTestId("borrower-draw-group-d2")
          .getByRole("button", { name: /Draw 2/ })
      ).toHaveAttribute("aria-expanded", "true");
      await page.getByTestId("intro-disclosure-tab-draw-status").click();
      await expect(
        page.getByTestId("intro-disclosure-panel-draw-status")
      ).toContainText("Draw Group Status");
      await expect(
        page
          .getByTestId("intro-disclosure-panel-draw-status")
          .getByTestId("borrower-submit-draw-request")
      ).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(
        page.getByTestId("intro-disclosure-panel-draw-status")
      ).toHaveCount(0);
    }
    const viewportFit = await page.evaluate(() => ({
      documentOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      shellBottom: Math.round(
        document
          .querySelector('[data-testid="borrower-dashboard-shell"]')
          ?.getBoundingClientRect().bottom ?? 0
      ),
      viewportBottom: window.innerHeight,
    }));
    expect(viewportFit.documentOverflow).toBeLessThanOrEqual(1);
    expect(
      Math.abs(viewportFit.shellBottom - viewportFit.viewportBottom)
    ).toBeLessThanOrEqual(2);
    await page.screenshot({
      fullPage: true,
      path: `test-results/borrower-dashboard-${name}.png`,
    });
    await page.getByTestId("borrower-dashboard-tab-chat").click();
    await expect(page.getByTestId("borrower-chat-tab")).toBeVisible();
    await expectNoDocumentOverflow();
    await page.getByTestId("borrower-dashboard-tab-documents").click();
    await expect(page.getByTestId("borrower-documents-tab")).toBeVisible();
    await expectNoDocumentOverflow();
    await page.getByTestId("borrower-dashboard-tab-gantt").click();
    await expect(page.getByTestId("build-workspace-shell")).toBeVisible();
    await expectNoDocumentOverflow();
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/demo/drawflow/active");
  await waitForBorrowerDashboard(page);
  await page.getByTestId("borrower-dashboard-tab-chat").click();
  await page.screenshot({
    fullPage: true,
    path: "test-results/borrower-dashboard-chat.png",
  });
  await page.getByTestId("borrower-dashboard-tab-documents").click();
  await page.screenshot({
    fullPage: true,
    path: "test-results/borrower-dashboard-documents.png",
  });
});
