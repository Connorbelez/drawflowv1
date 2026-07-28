import { expect, test, type Locator, type Page } from "@playwright/test";

type Box = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

const MORE_FILTERS_NAME = /more filters/i;

async function requireBox(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box as Box;
}

async function proposalControlBoxes(page: Page) {
  return {
    assignment: await requireBox(page.getByRole("combobox", { name: "Assignment" })),
    more: await requireBox(
      page.getByRole("button", { name: MORE_FILTERS_NAME })
    ),
    review: await requireBox(page.getByRole("combobox", { name: "Review outcome" })),
    search: await requireBox(page.getByRole("searchbox", { name: "Search proposals" })),
    stage: await requireBox(page.getByRole("combobox", { name: "Stage" })),
  };
}

function expectHorizontalSeparation(left: Box, right: Box) {
  expect(right.x).toBeGreaterThanOrEqual(left.x + left.width + 7);
}

test("proposal directory controls remain separated in the wide toolbar", async ({
  page,
}) => {
  await page.setViewportSize({ height: 500, width: 2048 });
  await page.goto("/tests/fixtures/proposal-directory-controls.html");

  const boxes = await proposalControlBoxes(page);

  expectHorizontalSeparation(boxes.search, boxes.stage);
  expectHorizontalSeparation(boxes.stage, boxes.assignment);
  expectHorizontalSeparation(boxes.assignment, boxes.review);
  expectHorizontalSeparation(boxes.review, boxes.more);
  expect(boxes.more.width).toBeLessThan(240);
  expect(boxes.more.x + boxes.more.width).toBeLessThanOrEqual(2048 - 16);
});

test("proposal directory controls stay inside the compact grid", async ({
  page,
}) => {
  await page.setViewportSize({ height: 700, width: 1024 });
  await page.goto("/tests/fixtures/proposal-directory-controls.html");

  const boxes = await proposalControlBoxes(page);

  expect(boxes.stage.y).toBeGreaterThan(boxes.search.y + boxes.search.height);
  expectHorizontalSeparation(boxes.stage, boxes.assignment);
  expectHorizontalSeparation(boxes.assignment, boxes.review);
  expectHorizontalSeparation(boxes.review, boxes.more);
  expect(boxes.more.x + boxes.more.width).toBeLessThanOrEqual(1024 - 16);
});
