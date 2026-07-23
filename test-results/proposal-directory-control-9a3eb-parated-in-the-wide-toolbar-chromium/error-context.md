# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: proposal-directory-controls-layout.spec.ts >> proposal directory controls remain separated in the wide toolbar
- Location: tests/e2e/proposal-directory-controls-layout.spec.ts:29:1

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.boundingBox: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByRole('combobox', { name: 'Assignment' })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - paragraph [ref=e4]: "404"
      - heading "Page not found" [level=1] [ref=e5]
      - paragraph [ref=e6]: This DrawFlow route does not exist or is no longer available.
      - link "Back to backoffice" [ref=e7] [cursor=pointer]:
        - /url: /backoffice
  - region "Notifications alt+T"
  - button "Open TanStack Devtools" [ref=e8] [cursor=pointer]:
    - img "TanStack Devtools" [ref=e9]
```

# Test source

```ts
  1  | import { expect, test, type Locator, type Page } from "@playwright/test";
  2  | 
  3  | type Box = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;
  4  | 
  5  | const MORE_FILTERS_NAME = /more filters/i;
  6  | 
  7  | async function requireBox(locator: Locator): Promise<Box> {
> 8  |   const box = await locator.boundingBox();
     |                             ^ Error: locator.boundingBox: Test timeout of 60000ms exceeded.
  9  |   expect(box).not.toBeNull();
  10 |   return box as Box;
  11 | }
  12 | 
  13 | async function proposalControlBoxes(page: Page) {
  14 |   return {
  15 |     assignment: await requireBox(page.getByRole("combobox", { name: "Assignment" })),
  16 |     more: await requireBox(
  17 |       page.getByRole("button", { name: MORE_FILTERS_NAME })
  18 |     ),
  19 |     review: await requireBox(page.getByRole("combobox", { name: "Review outcome" })),
  20 |     search: await requireBox(page.getByRole("searchbox", { name: "Search proposals" })),
  21 |     stage: await requireBox(page.getByRole("combobox", { name: "Stage" })),
  22 |   };
  23 | }
  24 | 
  25 | function expectHorizontalSeparation(left: Box, right: Box) {
  26 |   expect(right.x).toBeGreaterThanOrEqual(left.x + left.width + 7);
  27 | }
  28 | 
  29 | test("proposal directory controls remain separated in the wide toolbar", async ({
  30 |   page,
  31 | }) => {
  32 |   await page.setViewportSize({ height: 500, width: 2048 });
  33 |   await page.goto("/tests/fixtures/proposal-directory-controls.html");
  34 | 
  35 |   const boxes = await proposalControlBoxes(page);
  36 | 
  37 |   expectHorizontalSeparation(boxes.search, boxes.stage);
  38 |   expectHorizontalSeparation(boxes.stage, boxes.assignment);
  39 |   expectHorizontalSeparation(boxes.assignment, boxes.review);
  40 |   expectHorizontalSeparation(boxes.review, boxes.more);
  41 |   expect(boxes.more.width).toBeLessThan(240);
  42 |   expect(boxes.more.x + boxes.more.width).toBeLessThanOrEqual(2048 - 16);
  43 | });
  44 | 
  45 | test("proposal directory controls stay inside the compact grid", async ({
  46 |   page,
  47 | }) => {
  48 |   await page.setViewportSize({ height: 700, width: 1024 });
  49 |   await page.goto("/tests/fixtures/proposal-directory-controls.html");
  50 | 
  51 |   const boxes = await proposalControlBoxes(page);
  52 | 
  53 |   expect(boxes.stage.y).toBeGreaterThan(boxes.search.y + boxes.search.height);
  54 |   expectHorizontalSeparation(boxes.stage, boxes.assignment);
  55 |   expectHorizontalSeparation(boxes.assignment, boxes.review);
  56 |   expectHorizontalSeparation(boxes.review, boxes.more);
  57 |   expect(boxes.more.x + boxes.more.width).toBeLessThanOrEqual(1024 - 16);
  58 | });
  59 | 
```