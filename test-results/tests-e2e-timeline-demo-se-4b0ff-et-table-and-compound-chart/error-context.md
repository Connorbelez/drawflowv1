# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/e2e/timeline-demo.spec.ts >> settings reuses the timeline worksheet table and compound chart
- Location: tests/e2e/timeline-demo.spec.ts:337:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('tablist', { name: 'Settings sections' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('tablist', { name: 'Settings sections' })

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e5]:
    - heading "Sign in" [level=1] [ref=e7]
    - generic [ref=e8]:
      - generic [ref=e10]:
        - generic [ref=e11]:
          - generic [ref=e12]:
            - generic [ref=e14]: Email
            - textbox "Email" [active] [ref=e16]:
              - /placeholder: Your email address
          - button "Continue" [ref=e17] [cursor=pointer]:
            - generic [ref=e18]: Continue
        - generic [ref=e19]: OR
        - generic [ref=e21]:
          - link [ref=e23] [cursor=pointer]:
            - /url: api/login?provider=GoogleOAuth&state=Fe26.2%2A1%2Af2f5b3f5c9d835b09e81b7bf237c97f5dbe9bcd51308e9d38db59e39408c3f9a%2AznK1c1LqP5G-yXlKTch93Q%2AHVhYCTkPnXHen4_uj_mVvEE-Fi60cRfPeSSt6jVmASOQb_PgZ6cAOp3uai0Js7gqSvJ4AbdbH2dIJcciDnX6JSG-Qxcp-Aj755AdN-nuFgkGkZ9LlCjyAE3AJQxZ13qIhqVp6VBoRjxw4RmZnHK0OO7CiOTPuNxw47T-YWEypzj2Bd0eaduElDWXDX6V99Jmw4YSSRTowcf5IshCRjgLha3tO2AEFRbp0z1cKvzrjsIj7lMFSO3b7IcTVXfpKn897C4zDPo2aOtk87W39wBzqx7sonMeU6IGkLuriJbm-Xk%2A1782484109204%2A87dfbf9a1b524fdc157a1d76602c5ec244e84a9c8a283ffa8bce3354f946b57f%2AI5m8cm2kBjrFmv3UstUS0xlhPOo2Y44qYH0fGcYHXM4~2&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback&client_id=client_01KR1Z2DEGZWSDBQR4B6RNX3VV&source=signin&authorization_session_id=01KW24QR6RC9XY1EQ6FHSJRFWQ
            - img [ref=e24]
          - link [ref=e31] [cursor=pointer]:
            - /url: api/login?provider=MicrosoftOAuth&state=Fe26.2%2A1%2Af2f5b3f5c9d835b09e81b7bf237c97f5dbe9bcd51308e9d38db59e39408c3f9a%2AznK1c1LqP5G-yXlKTch93Q%2AHVhYCTkPnXHen4_uj_mVvEE-Fi60cRfPeSSt6jVmASOQb_PgZ6cAOp3uai0Js7gqSvJ4AbdbH2dIJcciDnX6JSG-Qxcp-Aj755AdN-nuFgkGkZ9LlCjyAE3AJQxZ13qIhqVp6VBoRjxw4RmZnHK0OO7CiOTPuNxw47T-YWEypzj2Bd0eaduElDWXDX6V99Jmw4YSSRTowcf5IshCRjgLha3tO2AEFRbp0z1cKvzrjsIj7lMFSO3b7IcTVXfpKn897C4zDPo2aOtk87W39wBzqx7sonMeU6IGkLuriJbm-Xk%2A1782484109204%2A87dfbf9a1b524fdc157a1d76602c5ec244e84a9c8a283ffa8bce3354f946b57f%2AI5m8cm2kBjrFmv3UstUS0xlhPOo2Y44qYH0fGcYHXM4~2&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback&client_id=client_01KR1Z2DEGZWSDBQR4B6RNX3VV&source=signin&authorization_session_id=01KW24QR6RC9XY1EQ6FHSJRFWQ
            - img [ref=e32]
          - link [ref=e39] [cursor=pointer]:
            - /url: api/login?provider=GitHubOAuth&state=Fe26.2%2A1%2Af2f5b3f5c9d835b09e81b7bf237c97f5dbe9bcd51308e9d38db59e39408c3f9a%2AznK1c1LqP5G-yXlKTch93Q%2AHVhYCTkPnXHen4_uj_mVvEE-Fi60cRfPeSSt6jVmASOQb_PgZ6cAOp3uai0Js7gqSvJ4AbdbH2dIJcciDnX6JSG-Qxcp-Aj755AdN-nuFgkGkZ9LlCjyAE3AJQxZ13qIhqVp6VBoRjxw4RmZnHK0OO7CiOTPuNxw47T-YWEypzj2Bd0eaduElDWXDX6V99Jmw4YSSRTowcf5IshCRjgLha3tO2AEFRbp0z1cKvzrjsIj7lMFSO3b7IcTVXfpKn897C4zDPo2aOtk87W39wBzqx7sonMeU6IGkLuriJbm-Xk%2A1782484109204%2A87dfbf9a1b524fdc157a1d76602c5ec244e84a9c8a283ffa8bce3354f946b57f%2AI5m8cm2kBjrFmv3UstUS0xlhPOo2Y44qYH0fGcYHXM4~2&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback&client_id=client_01KR1Z2DEGZWSDBQR4B6RNX3VV&source=signin&authorization_session_id=01KW24QR6RC9XY1EQ6FHSJRFWQ
            - img [ref=e40]
          - link [ref=e43] [cursor=pointer]:
            - /url: api/login?provider=AppleOAuth&state=Fe26.2%2A1%2Af2f5b3f5c9d835b09e81b7bf237c97f5dbe9bcd51308e9d38db59e39408c3f9a%2AznK1c1LqP5G-yXlKTch93Q%2AHVhYCTkPnXHen4_uj_mVvEE-Fi60cRfPeSSt6jVmASOQb_PgZ6cAOp3uai0Js7gqSvJ4AbdbH2dIJcciDnX6JSG-Qxcp-Aj755AdN-nuFgkGkZ9LlCjyAE3AJQxZ13qIhqVp6VBoRjxw4RmZnHK0OO7CiOTPuNxw47T-YWEypzj2Bd0eaduElDWXDX6V99Jmw4YSSRTowcf5IshCRjgLha3tO2AEFRbp0z1cKvzrjsIj7lMFSO3b7IcTVXfpKn897C4zDPo2aOtk87W39wBzqx7sonMeU6IGkLuriJbm-Xk%2A1782484109204%2A87dfbf9a1b524fdc157a1d76602c5ec244e84a9c8a283ffa8bce3354f946b57f%2AI5m8cm2kBjrFmv3UstUS0xlhPOo2Y44qYH0fGcYHXM4~2&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback&client_id=client_01KR1Z2DEGZWSDBQR4B6RNX3VV&source=signin&authorization_session_id=01KW24QR6RC9XY1EQ6FHSJRFWQ
            - img [ref=e44]
      - paragraph [ref=e46]:
        - text: Don't have an account?
        - link "Sign up" [ref=e47] [cursor=pointer]:
          - /url: /sign-up?state=Fe26.2%2A1%2Af2f5b3f5c9d835b09e81b7bf237c97f5dbe9bcd51308e9d38db59e39408c3f9a%2AznK1c1LqP5G-yXlKTch93Q%2AHVhYCTkPnXHen4_uj_mVvEE-Fi60cRfPeSSt6jVmASOQb_PgZ6cAOp3uai0Js7gqSvJ4AbdbH2dIJcciDnX6JSG-Qxcp-Aj755AdN-nuFgkGkZ9LlCjyAE3AJQxZ13qIhqVp6VBoRjxw4RmZnHK0OO7CiOTPuNxw47T-YWEypzj2Bd0eaduElDWXDX6V99Jmw4YSSRTowcf5IshCRjgLha3tO2AEFRbp0z1cKvzrjsIj7lMFSO3b7IcTVXfpKn897C4zDPo2aOtk87W39wBzqx7sonMeU6IGkLuriJbm-Xk%2A1782484109204%2A87dfbf9a1b524fdc157a1d76602c5ec244e84a9c8a283ffa8bce3354f946b57f%2AI5m8cm2kBjrFmv3UstUS0xlhPOo2Y44qYH0fGcYHXM4~2&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback&authorization_session_id=01KW24QR6RC9XY1EQ6FHSJRFWQ
  - alert [ref=e48]
```

# Test source

```ts
  250 |         ),
  251 |         overflowY: list ? getComputedStyle(list).overflowY : "",
  252 |       };
  253 |     });
  254 | 
  255 |   expect(subMilestoneListGeometry).toMatchObject({
  256 |     canScroll: true,
  257 |     overflowY: "auto",
  258 |   });
  259 |   expect(subMilestoneListGeometry.minCardHeight).toBeGreaterThanOrEqual(66);
  260 |   await page
  261 |     .getByTestId("timeline-setup-submilestone-bank-input-site-prep")
  262 |     .fill("Survey closeout");
  263 |   await page
  264 |     .getByTestId("timeline-setup-submilestone-bank-create-site-prep")
  265 |     .click();
  266 |   await expect(
  267 |     page
  268 |       .locator(
  269 |         '[data-testid^="timeline-setup-submilestone-card-site-prep-custom-"]'
  270 |       )
  271 |       .filter({ hasText: "Survey closeout" })
  272 |   ).toBeVisible();
  273 |   await page
  274 |     .locator(
  275 |       '[data-testid^="timeline-setup-submilestone-card-site-prep-custom-"]'
  276 |     )
  277 |     .filter({ hasText: "Survey closeout" })
  278 |     .click();
  279 |   await expect(
  280 |     page.locator(
  281 |       '[data-testid^="timeline-setup-submilestone-name-site-prep-custom-"]'
  282 |     )
  283 |   ).toHaveValue("Survey closeout");
  284 |   await page
  285 |     .getByTestId("timeline-setup-submilestone-remove-site-prep-excavation-1")
  286 |     .click();
  287 |   await expect(
  288 |     page.getByTestId("timeline-setup-submilestone-card-site-prep-excavation-1")
  289 |   ).toHaveCount(0);
  290 |   await page.getByTestId("timeline-setup-row-expand-site-prep").click();
  291 | 
  292 |   await dragBudgetRow(page, "framing", "site-prep");
  293 |   await expect
  294 |     .poll(() => getBudgetRowOrder(page))
  295 |     .toEqual([
  296 |       "framing",
  297 |       "site-prep",
  298 |       "rough-in",
  299 |       "exterior",
  300 |       "drywall",
  301 |       "finishes",
  302 |       "closeout",
  303 |       "custom-solar-readiness",
  304 |     ]);
  305 |   await page.getByTestId("timeline-setup-row-expand-site-prep").click();
  306 |   await expectExpandedSubMilestonesAttached(page, {
  307 |     rowKey: "site-prep",
  308 |     text: "Survey closeout",
  309 |   });
  310 | 
  311 |   await page.getByTestId("timeline-setup-row-budget-framing").fill("$180,000");
  312 |   await page.getByTestId("timeline-setup-row-duration-framing").fill("20");
  313 |   await page.getByTestId("timeline-setup-complete").click();
  314 | 
  315 |   await expect(page.getByTestId("animated-curved-timeline")).toBeVisible();
  316 |   await expect(page.getByTestId("timeline-card-framing")).toContainText(
  317 |     /Milestone 1/i
  318 |   );
  319 |   await expect(page.getByTestId("timeline-card-site-prep")).toContainText(
  320 |     /Milestone 2/i
  321 |   );
  322 |   await expect(page.getByTestId("timeline-draw-marker-framing")).toContainText(
  323 |     /Draw 1/i
  324 |   );
  325 |   await expect(
  326 |     page.getByTestId("timeline-card-custom-solar-readiness")
  327 |   ).toContainText("Solar readiness");
  328 |   await page.getByTestId("timeline-card-framing").click();
  329 |   await expect(page.getByTestId("timeline-card-cost-framing")).toHaveText(
  330 |     "$180,000"
  331 |   );
  332 |   await expect(page.getByTestId("timeline-card-duration-framing")).toHaveText(
  333 |     "20 days"
  334 |   );
  335 | });
  336 | 
  337 | test("settings reuses the timeline worksheet table and compound chart", async ({
  338 |   page,
  339 | }) => {
  340 |   await page.setViewportSize({ height: 1150, width: 1801 });
  341 |   await page.goto("/backoffice/settings");
  342 | 
  343 |   const emptyState = page.getByText("Configuration needed");
  344 |   if (await emptyState.isVisible({ timeout: 5000 }).catch(() => false)) {
  345 |     await page.getByRole("button", { name: "Seed defaults" }).last().click();
  346 |   }
  347 | 
  348 |   await expect(
  349 |     page.getByRole("tablist", { name: "Settings sections" })
> 350 |   ).toBeVisible();
      |     ^ Error: expect(locator).toBeVisible() failed
  351 |   await expect(page.getByRole("tab", { name: /Demos/ })).toHaveAttribute(
  352 |     "aria-selected",
  353 |     "true"
  354 |   );
  355 |   await expect(
  356 |     page.getByTestId("timeline-settings-template-blueprint-table")
  357 |   ).toBeVisible();
  358 |   await expect(
  359 |     page.getByTestId("timeline-setup-budget-table").getByRole("columnheader", {
  360 |       name: "Name",
  361 |     })
  362 |   ).toBeVisible();
  363 | 
  364 |   await page.getByRole("button", { name: "Draw scenarios" }).click();
  365 |   await expect(page.getByText("CC-02", { exact: false })).toBeVisible();
  366 |   await expect(
  367 |     page.getByTestId("timeline-settings-scenario-header")
  368 |   ).toContainText("Set active");
  369 |   await expect(
  370 |     page.getByTestId("timeline-settings-cashflow-compound-chart")
  371 |   ).toBeVisible();
  372 |   const amountInput = page.getByLabel("Draw 03 amount");
  373 |   await amountInput.click();
  374 |   await amountInput.press(
  375 |     process.platform === "darwin" ? "Meta+A" : "Control+A"
  376 |   );
  377 |   await amountInput.press("Backspace");
  378 |   await expect(amountInput).toHaveValue("");
  379 |   await amountInput.pressSequentially("15");
  380 |   await expect(amountInput).toHaveValue("15");
  381 |   await amountInput.pressSequentially("abc%");
  382 |   await expect(amountInput).toHaveValue("15");
  383 |   await amountInput.blur();
  384 |   await expect(amountInput).toHaveValue("15.00%");
  385 |   await expect(page.getByText("NaN", { exact: false })).toHaveCount(0);
  386 |   const cashflowChart = page.getByTestId(
  387 |     "timeline-settings-cashflow-compound-chart"
  388 |   );
  389 |   await expect
  390 |     .poll(() => cashflowChart.locator(".recharts-reference-line").count())
  391 |     .toBeGreaterThan(1);
  392 |   const cashflowBox = await cashflowChart.boundingBox();
  393 |   expect(cashflowBox).not.toBeNull();
  394 |   if (cashflowBox) {
  395 |     await page.mouse.move(
  396 |       cashflowBox.x + cashflowBox.width * 0.5,
  397 |       cashflowBox.y + cashflowBox.height * 0.5
  398 |     );
  399 |   }
  400 |   const cashflowTooltip = page
  401 |     .locator(".recharts-tooltip-wrapper")
  402 |     .filter({ hasText: /Day \d+/ })
  403 |     .last();
  404 |   await expect(cashflowTooltip).toContainText(/Day \d+/);
  405 |   await expect(cashflowTooltip).not.toContainText("Capital spike");
  406 |   await expect(
  407 |     page.locator('svg[aria-label="Cashflow preview chart"]')
  408 |   ).toHaveCount(0);
  409 | 
  410 |   const templateCard = page
  411 |     .locator("aside")
  412 |     .filter({ hasText: "Full Build" })
  413 |     .getByRole("button")
  414 |     .first();
  415 |   const activeBadge = templateCard.locator('[data-slot="badge"]').filter({
  416 |     hasText: /Active:/,
  417 |   });
  418 |   await expect(activeBadge).toBeVisible();
  419 | 
  420 |   const cardBox = await templateCard.boundingBox();
  421 |   const badgeBox = await activeBadge.boundingBox();
  422 |   expect(cardBox).not.toBeNull();
  423 |   expect(badgeBox).not.toBeNull();
  424 |   expect((badgeBox?.x ?? 0) + (badgeBox?.width ?? 0)).toBeLessThanOrEqual(
  425 |     (cardBox?.x ?? 0) + (cardBox?.width ?? 0) + 1
  426 |   );
  427 | });
  428 | 
  429 | test("timeline setup lands generated roadmap at T0", async ({ page }) => {
  430 |   await openGeneratedTimeline(page);
  431 | 
  432 |   await expect(
  433 |     page.getByTestId("selected-draw-details").getByRole("heading", {
  434 |       name: "Site prep & foundation",
  435 |     })
  436 |   ).toBeVisible();
  437 |   await expect(page.getByText("Proposal start")).toBeVisible();
  438 |   await page.getByTestId("timeline-card-site-prep").click();
  439 |   await expect(
  440 |     page.getByTestId("timeline-card-start-date-site-prep")
  441 |   ).toHaveText("Day 0");
  442 | 
  443 |   const todayAndStartX = await page.evaluate(() => {
  444 |     const today = document.querySelector(
  445 |       "[data-testid=timeline-marker-connector-today]"
  446 |     );
  447 |     const startNode = document.querySelector(
  448 |       "[data-testid=demo-timeline-node-site-prep]"
  449 |     );
  450 | 
```