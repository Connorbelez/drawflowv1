import { expect, test } from "@playwright/test";

const NEW_PROPOSAL_URL = /\/demo\/drawflow\/new-proposal\?draftId=/;
const MILESTONE_ROW_TEST_ID = /^builder-milestone-row-/;
const CUSTOM_MILESTONE_ROW_TEST_ID = /^builder-milestone-row-custom_/;
const ROADMAP_DAY_TEXT = /D\d+/;
const ROADMAP_MONEY_TEXT = /\$\d+(?:\.\d)?[KM]/;
const WORKSPACE_ROUTE_URL = /\/demo\/drawflow\/(proposal|active)/;

test("Builder new proposal route handles a stale draft id without a Convex query crash", async ({
  page,
}) => {
  await page.goto(
    "/demo/drawflow/new-proposal?draftId=rn7djn5t9m71njwpdhyk5dkeh986ckvm"
  );
  await expect(
    page.getByText("Builder proposal draft not found")
  ).toBeVisible();
  await expect(page.getByText("Start a fresh draft to continue")).toBeVisible();
});

test("Builder new proposal route does not emit invalid hook errors in the sidebar tooltip path", async ({
  page,
}) => {
  const clientErrors: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      clientErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    clientErrors.push(error.message);
  });

  await page.goto(
    "/demo/drawflow/new-proposal?draftId=rn7079f761c12yt7h3j8x37ga986jzk8"
  );
  await expect(page.locator("body")).toBeVisible();

  expect(clientErrors.join("\n")).not.toMatch(
    /Invalid hook call|TooltipRoot|Cannot read properties of null \(reading 'useRef'\)/
  );
});

test("Main demo dropdown includes every demo route", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demos" }).click();

  await expect(
    page.getByRole("menuitem", { name: "TanStack Query" })
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "WorkOS" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Convex" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Timeline" })).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "DrawFlow Workspace" })
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "DrawFlow Proposal" })
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Builder Dashboard" })
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "New Proposal" })
  ).toBeVisible();
});

test("Milestone editor stays usable without horizontal overflow on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo/drawflow/new-proposal");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByTestId("builder-template-screen")).toBeVisible();
  await page.getByTestId("builder-total-budget").fill("$1,850,000");
  await page
    .getByTestId("builder-template-card-single-family-full-build")
    .click();
  await page.getByTestId("builder-generate-milestones").click();

  await expect(page.getByTestId("builder-milestone-editor")).toBeVisible();
  await expect(
    page.getByTestId("builder-milestone-row-permits_mobilization")
  ).toBeVisible();
  await expect(page.getByTestId("builder-readiness-blockers")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Milestones" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(page.locator(".pb-split > .pb-scroll")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".pb-split > .pb-scroll")
        .evaluate((element) => element.scrollHeight > element.clientHeight)
    )
    .toBe(true);

  await page.getByRole("tab", { name: "Gantt" }).click();
  await expect(page.getByRole("tab", { name: "Gantt" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(page.getByTestId("builder-roadmap-draw-group-1")).toBeVisible();
  await page.getByRole("tab", { name: "Milestones" }).click();
  await expect(
    page.getByTestId("builder-milestone-row-permits_mobilization")
  ).toBeVisible();

  const overflow = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>(
      '[data-testid="builder-milestone-editor"]'
    );
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(".pb-milestone-row")
    );
    return {
      documentOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      editorOverflow: editor ? editor.scrollWidth - editor.clientWidth : 0,
      rowOverflow: rows.map((row) => row.scrollWidth - row.clientWidth),
    };
  });

  expect(overflow.documentOverflow).toBeLessThanOrEqual(1);
  expect(overflow.editorOverflow).toBeLessThanOrEqual(1);
  expect(Math.max(...overflow.rowOverflow)).toBeLessThanOrEqual(1);
});

test("Builder proposal setup and milestone editor expose co-pay, reorder, draw grouping, and clear actions", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/new-proposal");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByTestId("builder-template-screen")).toBeVisible();

  await page.getByTestId("builder-total-budget").fill("$1,850,000");
  await page.getByTestId("builder-max-cash").fill("$260,000");
  await page.getByTestId("builder-co-pay").fill("$50,000");
  const summary = page.locator(".pb-template-aside");
  await expect(summary.getByText("Co-pay")).toBeVisible();
  await expect(summary.getByText("$50,000")).toBeVisible();
  await expect(summary.getByText("Reimbursement Scope")).toBeVisible();
  await expect(summary.getByText("$1,800,000")).toBeVisible();

  await page
    .getByTestId("builder-template-card-single-family-full-build")
    .click();
  await page.getByTestId("builder-generate-milestones").click();
  await expect(page.getByTestId("builder-milestone-editor")).toBeVisible();
  await expect(
    page.getByTestId("builder-milestone-drag-handle-permits_mobilization")
  ).toBeVisible();
  await expect(
    page.getByTestId("builder-milestone-draw-group-permits_mobilization")
  ).toBeVisible();

  const firstHandle = page.getByTestId(
    "builder-milestone-drag-handle-permits_mobilization"
  );
  const targetRow = page.getByTestId("builder-milestone-row-foundation_slab");
  const handleBox = await firstHandle.boundingBox();
  const targetBox = await targetRow.boundingBox();
  if (!(handleBox && targetBox)) {
    throw new Error("Expected draggable milestone controls to be visible.");
  }
  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 8 }
  );
  await page.mouse.up();
  await expect(page.locator(".pb-milestone-row").first()).not.toContainText(
    "Permits and mobilization"
  );

  await page
    .getByTestId("builder-milestone-draw-group-permits_mobilization")
    .selectOption("1");
  await expect(
    page.getByTestId("builder-milestone-draw-group-permits_mobilization")
  ).not.toHaveValue("");

  await page.getByTestId("builder-clear-recommendations").click();
  await expect(
    page.getByTestId("builder-milestone-budget-permits_mobilization")
  ).toHaveValue("$0");
});

test("Builder dashboard to new proposal demo reaches the workspace boundary without opening the workspace demo", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/builder-dashboard");
  await expect(page.getByTestId("builder-dashboard-shell")).toBeVisible();

  await page.getByTestId("builder-dashboard-new-proposal").click();
  await expect(page).toHaveURL(NEW_PROPOSAL_URL);
  await expect(page.getByTestId("builder-template-screen")).toBeVisible();
  await expect(page.getByTestId("builder-proposal-sidebar")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Create New Proposal" })
  ).toBeVisible();
  await expect(page.getByText("Proposal Summary")).toBeVisible();
  await expect(page.getByText("What happens next")).toBeVisible();
  await expect(page.getByText("Compliance Note")).toBeVisible();

  await page.getByTestId("builder-total-budget").fill("0");
  await page.getByTestId("builder-generate-milestones").click();
  await expect(page.getByTestId("builder-template-error")).toContainText(
    "positive total project budget"
  );

  await page.getByTestId("builder-total-budget").fill("$1,850,000");
  await page
    .getByTestId("builder-template-card-single-family-full-build")
    .click();
  await page.getByTestId("builder-generate-milestones").click();
  await expect(page.getByTestId("builder-milestone-editor")).toBeVisible();
  await expect(page.getByTestId(MILESTONE_ROW_TEST_ID)).toHaveCount(10);
  await expect(page.getByTestId("builder-cost-breakdown")).toContainText(
    "Draw fees (8 x $500)"
  );
  await expect(page.getByTestId("builder-cost-breakdown")).toContainText(
    "Daily compounding interest"
  );
  await expect(page.getByTestId("builder-cost-breakdown")).toContainText(
    "Projected borrower cost"
  );
  await expect(page.getByTestId("builder-cost-breakdown")).toContainText(
    "Total duration"
  );
  await page
    .getByTestId("builder-milestone-draw-group-mep_rough_ins")
    .selectOption("3");
  await expect(
    page.getByTestId("builder-milestone-draw-group-mep_rough_ins")
  ).toHaveValue("3");
  await expect(
    page.getByTestId("builder-milestone-draw-group-framing_dried_in")
  ).toHaveValue("3");
  await expect(
    page.getByTestId("builder-milestone-draw-group-envelope_weatherproofing")
  ).toHaveValue("4");
  await page
    .getByTestId("builder-milestone-draw-group-mep_rough_ins")
    .selectOption("__new_draw_group__");
  await expect(
    page.getByTestId("builder-milestone-draw-group-mep_rough_ins")
  ).toHaveValue("4");
  await expect(
    page.getByTestId("builder-milestone-draw-group-framing_dried_in")
  ).toHaveValue("3");
  await expect(
    page.getByTestId("builder-milestone-draw-group-envelope_weatherproofing")
  ).toHaveValue("5");
  await expect(page.getByTestId("builder-roadmap-draw-date-1")).toContainText(
    ROADMAP_DAY_TEXT
  );
  await expect(page.getByTestId("builder-roadmap-draw-group-1")).toContainText(
    ROADMAP_MONEY_TEXT
  );
  await page
    .getByTestId("builder-milestone-budget-increment-permits_mobilization")
    .click();
  await expect(
    page.getByTestId("builder-milestone-budget-permits_mobilization")
  ).toHaveValue("$93,500");
  await page
    .getByTestId("builder-milestone-budget-decrement-permits_mobilization")
    .click();
  await expect(
    page.getByTestId("builder-milestone-budget-permits_mobilization")
  ).toHaveValue("$92,500");
  await page.getByTestId("builder-cash-availability").fill("$260,000");
  await page.keyboard.press("Tab");

  await page
    .getByTestId("builder-milestone-toggle-permits_mobilization")
    .click();
  await expect(page.getByTestId("builder-readiness-blockers")).toContainText(
    "differs from the original budget"
  );
  await page
    .getByTestId("builder-milestone-toggle-permits_mobilization")
    .click();

  await page.getByTestId("builder-insert-milestone-button").click();
  await expect(page.getByRole("dialog")).toContainText("Insert milestone");
  await page
    .getByTestId("builder-bank-option-landscape_exterior_punch")
    .click();
  await expect(
    page.getByTestId("builder-milestone-row-landscape_exterior_punch")
  ).toBeVisible();
  await page.getByTestId("builder-insert-milestone-button").click();
  await page.getByRole("tab", { name: "Custom" }).click();
  await page
    .getByTestId("builder-custom-milestone-name")
    .fill("Temp weather enclosure");
  await page.getByTestId("builder-custom-milestone-budget").fill("$18,000");
  await page.getByTestId("builder-custom-milestone-duration").fill("6");
  await page.getByTestId("builder-create-custom-from-dialog").click();
  await expect(page.getByTestId(CUSTOM_MILESTONE_ROW_TEST_ID)).toHaveCount(1);

  await page.getByTestId("builder-add-custom-milestone").click();
  await expect(page.getByTestId(CUSTOM_MILESTONE_ROW_TEST_ID)).toHaveCount(2);

  await page
    .getByTestId("builder-milestone-budget-permits_mobilization")
    .fill("$0");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("builder-readiness-blockers")).toContainText(
    "Permits and mobilization needs a positive budget"
  );
  await page.getByTestId("builder-continue-workspace").click();
  await expect(page.getByTestId("builder-action-error")).toContainText(
    "Permits and mobilization needs a positive budget"
  );

  await page
    .getByTestId("builder-milestone-budget-permits_mobilization")
    .fill("$95,000");
  await page.keyboard.press("Tab");
  await page
    .getByTestId("builder-milestone-duration-permits_mobilization")
    .fill("15");
  await page.keyboard.press("Tab");
  await page
    .getByTestId("builder-milestone-duration-increment-permits_mobilization")
    .click();
  await expect(
    page.getByTestId("builder-milestone-duration-permits_mobilization")
  ).toHaveValue("16");
  await page
    .getByTestId("builder-milestone-duration-decrement-permits_mobilization")
    .click();
  await expect(
    page.getByTestId("builder-milestone-duration-permits_mobilization")
  ).toHaveValue("15");
  await expect(page.getByTestId("builder-peak-exposure")).toContainText(
    "warning"
  );
  await expect(page.getByTestId("builder-readiness-blockers")).toContainText(
    "Completeness checks passed"
  );

  await page.getByTestId("builder-continue-workspace").click();
  await expect(page.getByTestId("builder-boundary-screen")).toBeVisible();
  await expect(
    page.getByTestId("builder-boundary-payload-summary")
  ).toContainText("demo_workspaceBoundaryPayload");
  await expect(page.getByText('"reimbursementOnly": true')).toBeVisible();
  await expect(page).toHaveURL(NEW_PROPOSAL_URL);
  await expect(page).not.toHaveURL(WORKSPACE_ROUTE_URL);
  await page.screenshot({
    fullPage: true,
    path: "test-results/builder-new-proposal-boundary.png",
  });
});
