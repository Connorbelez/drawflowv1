# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: drawflow-demo.spec.ts >> Builder borrower dashboard defaults to Overview with evidence and draw gating
- Location: tests/e2e/drawflow-demo.spec.ts:301:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByTestId('borrower-draw-status-panel')
Expected substring: "Borrower working capital limit"
Received string:    "Draw StatusDraw 2CollapseReimbursement eligible$232,000Working capital limit$260,000Draw policy limit$260,000"
Timeout: 30000ms

Call log:
  - Expect "toContainText" with timeout 30000ms
  - waiting for getByTestId('borrower-draw-status-panel')
    34 × locator resolved to <section data-testid="borrower-draw-status-panel" class="rounded-md border border-border bg-card p-4" data-tsd-source="/src/features/build-workspace-demo/BorrowerDashboardRoute.tsx:2067:5">…</section>
       - unexpected value "Draw StatusDraw 2CollapseReimbursement eligible$232,000Working capital limit$260,000Draw policy limit$260,000"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - navigation [ref=e3]:
      - link "drawFlow" [ref=e4] [cursor=pointer]:
        - /url: /
        - generic [ref=e5]: drawFlow
      - generic [ref=e7]:
        - link "Home" [ref=e8] [cursor=pointer]:
          - /url: /
        - link "Roadmap" [ref=e9] [cursor=pointer]:
          - /url: /roadmap
        - link "About" [ref=e10] [cursor=pointer]:
          - /url: /about
        - button "Demos" [ref=e12] [cursor=pointer]
      - generic [ref=e13]:
        - link "Sign in" [ref=e14] [cursor=pointer]:
          - /url: /api/auth/sign-in?returnPathname=%2Fdemo%2Fdrawflow%2Factive
        - 'button "Theme mode: auto. Click to switch mode." [ref=e15] [cursor=pointer]':
          - img
  - main [ref=e16]:
    - generic [ref=e17]:
      - complementary [ref=e18]:
        - generic [ref=e19]:
          - generic [ref=e20]: D
          - generic [ref=e21]:
            - text: DrawFlow
            - generic [ref=e22]: Lending
        - navigation "Project nav" [ref=e23]:
          - button "Dashboard" [ref=e24] [cursor=pointer]:
            - img [ref=e25]
            - generic [ref=e30]: Dashboard
          - button "Projects" [ref=e31] [cursor=pointer]:
            - img [ref=e32]
            - generic [ref=e36]: Projects
          - button "Draw Proposals" [ref=e37] [cursor=pointer]:
            - img [ref=e38]
            - generic [ref=e41]: Draw Proposals
          - button "Estimates" [ref=e42] [cursor=pointer]:
            - img [ref=e43]
            - generic [ref=e46]: Estimates
          - button "Documents" [ref=e47] [cursor=pointer]:
            - img [ref=e48]
            - generic [ref=e51]: Documents
          - button "Conditions" [ref=e52] [cursor=pointer]:
            - img [ref=e53]
            - generic [ref=e56]: Conditions
          - button "Reports" [ref=e57] [cursor=pointer]:
            - img [ref=e58]
            - generic [ref=e60]: Reports
          - button "Settings" [ref=e61] [cursor=pointer]:
            - img [ref=e62]
            - generic [ref=e65]: Settings
        - generic [ref=e66]:
          - generic [ref=e67]:
            - img [ref=e68]
            - text: Need help?
          - paragraph [ref=e71]: Help center access stays available without interrupting draw work.
          - button "New proposal" [ref=e72] [cursor=pointer]:
            - img
            - text: New proposal
        - generic [ref=e73]:
          - generic [ref=e74]: HP
          - generic [ref=e75]:
            - generic [ref=e76]: Harbor & Pine Builders
            - generic [ref=e77]: Builder Lead
      - generic [ref=e78]:
        - generic [ref=e79]:
          - button "Collapse sidebar" [ref=e80] [cursor=pointer]:
            - img
          - generic [ref=e81]:
            - heading "Day-to-Day Build Tracker" [level=1] [ref=e82]
            - paragraph [ref=e83]: Harbor & Pine Builders / Hamilton, ON / organization scoped as org_fairlend_demo
        - navigation "Build workspace tabs" [ref=e84]:
          - generic [ref=e85]:
            - button "Overview" [pressed] [ref=e86] [cursor=pointer]
            - button "Gantt View" [ref=e87] [cursor=pointer]
            - button "Chat" [ref=e88] [cursor=pointer]
            - button "Documents" [ref=e89] [cursor=pointer]
        - generic [ref=e91]:
          - generic [ref=e93]:
            - generic [ref=e94]:
              - heading "Milestones" [level=2] [ref=e95]
              - generic [ref=e96]:
                - generic [ref=e97]: 16 total
                - button "Collapse milestone rail" [ref=e98] [cursor=pointer]:
                  - img
            - generic [ref=e100]:
              - generic [ref=e101]:
                - button "Draw 1 8 milestones" [expanded] [ref=e102] [cursor=pointer]:
                  - generic [ref=e103]:
                    - img [ref=e104]
                    - generic [ref=e106]: Draw 1
                  - generic [ref=e107]: 8 milestones
                - generic [ref=e108]:
                  - button "1 Permits D1 Approved 100% 100% $10,000 budget 5 days" [ref=e109] [cursor=pointer]:
                    - generic [ref=e110]:
                      - generic [ref=e111]:
                        - generic [ref=e112]: "1"
                        - text: Permits
                      - generic [ref=e113]: D1
                    - generic [ref=e114]:
                      - generic [ref=e115]: Approved
                      - generic [ref=e116]: 100%
                    - progressbar [ref=e117]: x
                    - generic [ref=e120]:
                      - generic [ref=e121]: $10,000 budget
                      - generic [ref=e122]: 5 days
                  - button "2 Drawings / Insurance D1 Approved 100% 100% $20,000 budget 10 days" [ref=e123] [cursor=pointer]:
                    - generic [ref=e124]:
                      - generic [ref=e125]:
                        - generic [ref=e126]: "2"
                        - text: Drawings / Insurance
                      - generic [ref=e127]: D1
                    - generic [ref=e128]:
                      - generic [ref=e129]: Approved
                      - generic [ref=e130]: 100%
                    - progressbar [ref=e131]: x
                    - generic [ref=e134]:
                      - generic [ref=e135]: $20,000 budget
                      - generic [ref=e136]: 10 days
                  - button "3 DC / ED D1 Approved 100% 100% $15,000 budget 9 days" [ref=e137] [cursor=pointer]:
                    - generic [ref=e138]:
                      - generic [ref=e139]:
                        - generic [ref=e140]: "3"
                        - text: DC / ED
                      - generic [ref=e141]: D1
                    - generic [ref=e142]:
                      - generic [ref=e143]: Approved
                      - generic [ref=e144]: 100%
                    - progressbar [ref=e145]: x
                    - generic [ref=e148]:
                      - generic [ref=e149]: $15,000 budget
                      - generic [ref=e150]: 9 days
                  - button "4 Utilities Disconnect D1 Approved 100% 100% $7,500 budget 4 days" [ref=e151] [cursor=pointer]:
                    - generic [ref=e152]:
                      - generic [ref=e153]:
                        - generic [ref=e154]: "4"
                        - text: Utilities Disconnect
                      - generic [ref=e155]: D1
                    - generic [ref=e156]:
                      - generic [ref=e157]: Approved
                      - generic [ref=e158]: 100%
                    - progressbar [ref=e159]: x
                    - generic [ref=e162]:
                      - generic [ref=e163]: $7,500 budget
                      - generic [ref=e164]: 4 days
                  - button "5 Temp Fencing D1 Approved 100% 100% $4,000 budget 6 days" [ref=e165] [cursor=pointer]:
                    - generic [ref=e166]:
                      - generic [ref=e167]:
                        - generic [ref=e168]: "5"
                        - text: Temp Fencing
                      - generic [ref=e169]: D1
                    - generic [ref=e170]:
                      - generic [ref=e171]: Approved
                      - generic [ref=e172]: 100%
                    - progressbar [ref=e173]: x
                    - generic [ref=e176]:
                      - generic [ref=e177]: $4,000 budget
                      - generic [ref=e178]: 6 days
                  - button "6 Tree Removal D1 Approved 100% 100% $10,000 budget 7 days" [ref=e179] [cursor=pointer]:
                    - generic [ref=e180]:
                      - generic [ref=e181]:
                        - generic [ref=e182]: "6"
                        - text: Tree Removal
                      - generic [ref=e183]: D1
                    - generic [ref=e184]:
                      - generic [ref=e185]: Approved
                      - generic [ref=e186]: 100%
                    - progressbar [ref=e187]: x
                    - generic [ref=e190]:
                      - generic [ref=e191]: $10,000 budget
                      - generic [ref=e192]: 7 days
                  - button "7 Demo / Excavation D1 Approved 100% 100% $65,000 budget 17 days" [ref=e193] [cursor=pointer]:
                    - generic [ref=e194]:
                      - generic [ref=e195]:
                        - generic [ref=e196]: "7"
                        - text: Demo / Excavation
                      - generic [ref=e197]: D1
                    - generic [ref=e198]:
                      - generic [ref=e199]: Approved
                      - generic [ref=e200]: 100%
                    - progressbar [ref=e201]: x
                    - generic [ref=e204]:
                      - generic [ref=e205]: $65,000 budget
                      - generic [ref=e206]: 17 days
                  - button "8 Shoring D1 Approved 100% 100% $85,000 budget 16 days" [ref=e207] [cursor=pointer]:
                    - generic [ref=e208]:
                      - generic [ref=e209]:
                        - generic [ref=e210]: "8"
                        - text: Shoring
                      - generic [ref=e211]: D1
                    - generic [ref=e212]:
                      - generic [ref=e213]: Approved
                      - generic [ref=e214]: 100%
                    - progressbar [ref=e215]: x
                    - generic [ref=e218]:
                      - generic [ref=e219]: $85,000 budget
                      - generic [ref=e220]: 16 days
              - generic [ref=e221]:
                - button "Draw 2 Active 4 milestones" [expanded] [ref=e222] [cursor=pointer]:
                  - generic [ref=e223]:
                    - img [ref=e224]
                    - generic [ref=e226]: Draw 2
                    - generic [ref=e227]: Active
                  - generic [ref=e228]: 4 milestones
                - generic [ref=e229]:
                  - button "9 Foundation D2 In Progress 80% 80% $84,000 budget 68 days" [ref=e230] [cursor=pointer]:
                    - generic [ref=e231]:
                      - generic [ref=e232]:
                        - generic [ref=e233]: "9"
                        - text: Foundation
                      - generic [ref=e234]: D2
                    - generic [ref=e235]:
                      - generic [ref=e236]: In Progress
                      - generic [ref=e237]: 80%
                    - progressbar [ref=e238]: x
                    - generic [ref=e241]:
                      - generic [ref=e242]: $84,000 budget
                      - generic [ref=e243]: 68 days
                  - button "10 Underground Plumbing D2 Blocked 0% 0% $20,000 budget 13 days" [ref=e244] [cursor=pointer]:
                    - generic [ref=e245]:
                      - generic [ref=e246]:
                        - generic [ref=e247]: "10"
                        - text: Underground Plumbing
                      - generic [ref=e248]: D2
                    - generic [ref=e249]:
                      - generic [ref=e250]: Blocked
                      - generic [ref=e251]: 0%
                    - progressbar [ref=e252]: x
                    - generic [ref=e254]:
                      - generic [ref=e255]: $20,000 budget
                      - generic [ref=e256]: 13 days
                  - button "11 Water / Sewer D2 In Progress 60% 60% $45,000 budget 38 days" [ref=e257] [cursor=pointer]:
                    - generic [ref=e258]:
                      - generic [ref=e259]:
                        - generic [ref=e260]: "11"
                        - text: Water / Sewer
                      - generic [ref=e261]: D2
                    - generic [ref=e262]:
                      - generic [ref=e263]: In Progress
                      - generic [ref=e264]: 60%
                    - progressbar [ref=e265]: x
                    - generic [ref=e268]:
                      - generic [ref=e269]: $45,000 budget
                      - generic [ref=e270]: 38 days
                  - button "12 Lumber D2 Approved 100% 100% $83,000 budget 29 days" [ref=e271] [cursor=pointer]:
                    - generic [ref=e272]:
                      - generic [ref=e273]:
                        - generic [ref=e274]: "12"
                        - text: Lumber
                      - generic [ref=e275]: D2
                    - generic [ref=e276]:
                      - generic [ref=e277]: Approved
                      - generic [ref=e278]: 100%
                    - progressbar [ref=e279]: x
                    - generic [ref=e282]:
                      - generic [ref=e283]: $83,000 budget
                      - generic [ref=e284]: 29 days
              - button "Draw 3 4 milestones" [ref=e286] [cursor=pointer]:
                - generic [ref=e287]:
                  - img [ref=e288]
                  - generic [ref=e290]: Draw 3
                - generic [ref=e291]: 4 milestones
          - generic [ref=e292]:
            - generic [ref=e293]:
              - generic [ref=e294]:
                - generic [ref=e297]:
                  - heading "Foundation" [level=2] [ref=e298]
                  - generic [ref=e299]:
                    - generic [ref=e300]: In Progress
                    - generic [ref=e301]: ·
                    - generic [ref=e302]: Draw 2
                - generic [ref=e303]:
                  - generic [ref=e304]: Target
                  - generic [ref=e305]: May 15, 2026
              - generic [ref=e307]:
                - generic [ref=e308]:
                  - generic [ref=e309]: Cost
                  - generic [ref=e310]: $84,000
                - button "Complete milestone" [ref=e311] [cursor=pointer]:
                  - img
                  - text: Complete milestone
            - generic [ref=e312]:
              - generic [ref=e313]:
                - heading "Evidence Manager" [level=2] [ref=e314]
                - generic [ref=e315]:
                  - button "Upload" [ref=e316] [cursor=pointer]:
                    - img [ref=e317]
                    - text: Upload
                  - button "Camera" [ref=e320] [cursor=pointer]:
                    - img [ref=e321]
                    - text: Camera
              - button "Choose File" [ref=e324]
              - button "Choose File" [ref=e325]
              - button "📁 Drag & drop files here, or browse (PNG, JPG, PDF, etc. up to 5MB each)" [ref=e327] [cursor=pointer]:
                - generic [ref=e328]:
                  - generic [ref=e329]: 📁
                  - generic [ref=e330]: Drag & drop files here, or browse
                  - generic [ref=e331]: (PNG, JPG, PDF, etc. up to 5MB each)
              - generic [ref=e333]: No files yet
              - generic [ref=e335]:
                - img [ref=e337]
                - generic [ref=e340]:
                  - generic [ref=e341]: No evidence for Foundation
                  - generic [ref=e342]: Upload or capture evidence for this milestone.
            - generic [ref=e343]:
              - generic [ref=e344]:
                - heading "Financial Controls" [level=2] [ref=e345]
                - button "Add Expense" [ref=e346] [cursor=pointer]:
                  - img
                  - text: Add Expense
              - generic [ref=e347]:
                - generic [ref=e348]:
                  - heading "Budget" [level=3] [ref=e349]
                  - generic [ref=e350]:
                    - generic [ref=e351]:
                      - generic [ref=e352]: Original
                      - generic [ref=e353]: $689,500
                    - generic [ref=e354]:
                      - generic [ref=e355]: Spent
                      - generic [ref=e356]: $299,500
                    - generic [ref=e357]:
                      - generic [ref=e358]: Remaining
                      - generic [ref=e359]: $390,000
                - generic [ref=e360]:
                  - generic [ref=e361]:
                    - heading "Expenses" [level=3] [ref=e362]
                    - generic [ref=e363]: Foundation
                  - table [ref=e366]:
                    - rowgroup [ref=e367]:
                      - row "Phase Milestone Amount Status" [ref=e368]:
                        - columnheader "Phase" [ref=e369]
                        - columnheader "Milestone" [ref=e370]
                        - columnheader "Amount" [ref=e371]
                        - columnheader "Status" [ref=e372]
                    - rowgroup [ref=e373]:
                      - row "No reimbursable expenses have been submitted for Foundation." [ref=e374]:
                        - cell "No reimbursable expenses have been submitted for Foundation." [ref=e375]
          - generic [ref=e377]:
            - generic [ref=e378]:
              - generic [ref=e379]:
                - heading "Draw Status" [level=2] [ref=e380]
                - generic [ref=e381]:
                  - generic [ref=e382]: Draw 2
                  - button "Collapse draw controls" [ref=e383] [cursor=pointer]:
                    - img
                    - text: Collapse
              - generic [ref=e384]:
                - generic [ref=e385]:
                  - generic [ref=e386]: Reimbursement eligible
                  - generic [ref=e387]: $232,000
                - generic [ref=e388]:
                  - generic [ref=e389]: Working capital limit
                  - generic [ref=e390]: $260,000
                - generic [ref=e391]:
                  - generic [ref=e392]: Draw policy limit
                  - generic [ref=e393]: $260,000
            - generic [ref=e394]:
              - generic [ref=e395]:
                - heading "Draw Group Status" [level=2] [ref=e396]
                - generic [ref=e397]: Incomplete
              - generic [ref=e398]:
                - generic [ref=e400]:
                  - img [ref=e402]
                  - generic [ref=e404]:
                    - generic [ref=e405]: Draw not ready
                    - paragraph [ref=e406]: Resolve 3 milestone approvals before requesting reimbursement.
                    - generic [ref=e407]: Draw 2 is on hold
                - generic [ref=e408]:
                  - generic [ref=e409]:
                    - heading "Milestones to Complete" [level=3] [ref=e410]
                    - generic [ref=e411]: "3"
                  - generic [ref=e412]:
                    - button "Foundation 80% complete In Progress 80% Open milestone details" [ref=e413] [cursor=pointer]:
                      - generic [ref=e414]:
                        - generic [ref=e415]:
                          - img [ref=e416]
                          - generic [ref=e418]:
                            - generic [ref=e419]: Foundation
                            - generic [ref=e420]: 80% complete
                        - generic [ref=e421]: In Progress
                      - progressbar [ref=e422]: x
                      - generic [ref=e425]:
                        - text: Open milestone details
                        - img [ref=e426]
                    - button "Underground Plumbing 0% complete Blocked 0% Open milestone details" [ref=e430] [cursor=pointer]:
                      - generic [ref=e431]:
                        - generic [ref=e432]:
                          - img [ref=e433]
                          - generic [ref=e435]:
                            - generic [ref=e436]: Underground Plumbing
                            - generic [ref=e437]: 0% complete
                        - generic [ref=e438]: Blocked
                      - progressbar [ref=e439]: x
                      - generic [ref=e441]:
                        - text: Open milestone details
                        - img [ref=e442]
                    - button "Water / Sewer 60% complete In Progress 60% Open milestone details" [ref=e446] [cursor=pointer]:
                      - generic [ref=e447]:
                        - generic [ref=e448]:
                          - img [ref=e449]
                          - generic [ref=e451]:
                            - generic [ref=e452]: Water / Sewer
                            - generic [ref=e453]: 60% complete
                        - generic [ref=e454]: In Progress
                      - progressbar [ref=e455]: x
                      - generic [ref=e458]:
                        - text: Open milestone details
                        - img [ref=e459]
                - generic [ref=e463]:
                  - generic [ref=e464]:
                    - heading "Evidence Still Needed" [level=3] [ref=e465]
                    - generic [ref=e466]: Clear
                  - generic [ref=e468]:
                    - img [ref=e469]
                    - text: No completed milestones in Draw 2 are waiting on evidence.
              - generic [ref=e472]:
                - generic [ref=e473]:
                  - generic [ref=e474]: Request amount
                  - generic [ref=e475]: $232,000
                - button "Submit Draw Request" [disabled]
  - region "Notifications alt+T"
```

# Test source

```ts
  339 |   ).toHaveAttribute("capture", "environment");
  340 |   await expect(page.getByTestId("borrower-draw-group-d1")).toBeVisible();
  341 |   await expect(page.getByTestId("borrower-draw-group-d2")).toBeVisible();
  342 |   await expect(page.getByTestId("borrower-draw-group-d1")).not.toContainText(
  343 |     "Active"
  344 |   );
  345 |   await expect(page.getByTestId("borrower-draw-group-d2")).toContainText(
  346 |     "Active"
  347 |   );
  348 |   await expect(
  349 |     page.getByTestId("borrower-draw-group-d1").getByRole("button", {
  350 |       name: /Draw 1/,
  351 |     })
  352 |   ).toHaveAttribute("aria-expanded", "true");
  353 |   await expect(page.getByTestId("borrower-draw-state-callout")).toContainText(
  354 |     "Draw already released"
  355 |   );
  356 |   await expect(page.getByTestId("borrower-draw-state-callout")).toContainText(
  357 |     "Released amount $216,500"
  358 |   );
  359 |   await expect(page.getByTestId("borrower-submit-draw-request")).toBeDisabled();
  360 |   await expect(page.getByTestId("borrower-submit-draw-request")).toContainText(
  361 |     "Draw Released"
  362 |   );
  363 |   expect(
  364 |     await page.locator('[data-testid^="borrower-milestone-card-"]').count()
  365 |   ).toBe(8);
  366 |   await page.getByTestId("borrower-collapse-milestone-rail").click();
  367 |   await expect(
  368 |     page.getByTestId("borrower-expand-milestone-rail")
  369 |   ).toBeVisible();
  370 |   await expect(
  371 |     page.locator('[data-testid^="borrower-milestone-card-"]')
  372 |   ).toHaveCount(0);
  373 |   await page.getByTestId("borrower-milestone-preview-foundation").click();
  374 |   await expect(
  375 |     page.getByTestId("borrower-selected-milestone-summary")
  376 |   ).toContainText("Foundation");
  377 |   await page.getByTestId("borrower-expand-milestone-rail").click();
  378 |   await expect(
  379 |     page.getByTestId("borrower-draw-group-d2").getByRole("button", {
  380 |       name: /Draw 2/,
  381 |     })
  382 |   ).toHaveAttribute("aria-expanded", "true");
  383 |   await expect(page.getByTestId("borrower-draw-group-d2")).toContainText(
  384 |     "Active"
  385 |   );
  386 |   expect(
  387 |     await page.locator('[data-testid^="borrower-milestone-card-"]').count()
  388 |   ).toBeGreaterThan(8);
  389 |   await page.getByTestId("borrower-milestone-card-drawings_insurance").click();
  390 |   await expect(
  391 |     page.getByTestId("borrower-selected-milestone-summary")
  392 |   ).toContainText("Drawings / Insurance");
  393 |   await expect(
  394 |     page.getByTestId("borrower-mark-complete-drawings_insurance")
  395 |   ).toContainText("Completed");
  396 |   await expect(
  397 |     page.getByTestId("borrower-selected-milestone-summary")
  398 |   ).toContainText("$20,000");
  399 |   await page.getByTestId("borrower-milestone-card-foundation").click();
  400 |   await expect(
  401 |     page.getByTestId("borrower-selected-milestone-summary")
  402 |   ).toContainText("Foundation");
  403 |   await expect(
  404 |     page.getByTestId("borrower-mark-complete-foundation")
  405 |   ).toBeEnabled();
  406 |   await expect(
  407 |     page.getByTestId("borrower-selected-milestone-summary")
  408 |   ).toContainText("Complete milestone");
  409 |   await expect(
  410 |     page.getByTestId("borrower-milestone-progress-input")
  411 |   ).toHaveCount(0);
  412 |   await expect(
  413 |     page.getByTestId("borrower-selected-milestone-summary")
  414 |   ).not.toContainText("Evidence is optional");
  415 |   await expect(page.getByTestId("borrower-draw-group-status")).toContainText(
  416 |     "Milestones to Complete"
  417 |   );
  418 |   await expect(page.getByTestId("borrower-draw-state-callout")).toContainText(
  419 |     "Draw not ready"
  420 |   );
  421 |   await expect(
  422 |     page.getByTestId("borrower-draw-outstanding-milestones")
  423 |   ).toContainText("Foundation");
  424 |   await expect(
  425 |     page.getByTestId("borrower-draw-outstanding-evidence")
  426 |   ).toContainText("No completed milestones in Draw 2 are waiting on evidence");
  427 |   await expect(page.getByTestId("borrower-draw-state-callout")).toContainText(
  428 |     /Resolve \d+ milestone approvals? before requesting reimbursement\./i
  429 |   );
  430 |   await expect(page.getByTestId("borrower-draw-state-callout")).not.toContainText(
  431 |     /evidence requirement/i
  432 |   );
  433 |   await page.getByTestId("borrower-collapse-status-column").click();
  434 |   await expect(page.getByTestId("borrower-expand-status-column")).toBeVisible();
  435 |   await expect(page.getByTestId("borrower-draw-status-panel")).toHaveCount(0);
  436 |   await page.getByTestId("borrower-expand-status-column").click();
  437 |   await expect(page.getByTestId("borrower-draw-status-panel")).toBeVisible();
  438 |   await expect(page.getByTestId("borrower-evidence-checklist")).toHaveCount(0);
> 439 |   await expect(page.getByTestId("borrower-draw-status-panel")).toContainText(
      |                                                                ^ Error: expect(locator).toContainText(expected) failed
  440 |     "Borrower working capital limit"
  441 |   );
  442 |   await expect(page.getByTestId("borrower-draw-status-panel")).toContainText(
  443 |     "Lender draw policy limit"
  444 |   );
  445 |   await expect(page.getByTestId("borrower-draw-state-callout")).toContainText(
  446 |     /requesting reimbursement/i
  447 |   );
  448 |   await expect(page.getByTestId("borrower-submit-draw-request")).toBeDisabled();
  449 | });
  450 | 
  451 | test("Builder borrower dashboard can update selected milestone completion", async ({
  452 |   page,
  453 | }) => {
  454 |   await resetBorrowerDashboardDemo(page);
  455 |   await page
  456 |     .getByTestId("borrower-draw-group-d2")
  457 |     .getByRole("button", { name: /Draw 2/ })
  458 |     .click();
  459 |   await page.getByTestId("borrower-milestone-card-foundation").click();
  460 | 
  461 |   await page.getByTestId("borrower-mark-complete-foundation").click();
  462 |   await expect(page.getByTestId("borrower-completion-dialog")).toBeVisible();
  463 |   await expect(page.getByTestId("borrower-completion-dialog")).toContainText(
  464 |     "No files attached"
  465 |   );
  466 |   await page.getByTestId("borrower-confirm-completion-foundation").click();
  467 |   await expect(
  468 |     page.getByTestId("borrower-selected-milestone-summary")
  469 |   ).toContainText("Under Review");
  470 |   await expect(
  471 |     page.getByTestId("borrower-mark-complete-foundation")
  472 |   ).toBeDisabled();
  473 |   await expect(
  474 |     page.getByTestId("borrower-draw-outstanding-evidence")
  475 |   ).toContainText("No completed milestones in Draw 2 are waiting on evidence");
  476 |   await expect(page.getByTestId("borrower-submit-draw-request")).toBeDisabled();
  477 | });
  478 | 
  479 | test("Builder borrower dashboard camera evidence capture opens device camera", async ({
  480 |   page,
  481 | }) => {
  482 |   await page.setViewportSize({ height: 844, width: 390 });
  483 |   await page.addInitScript(() => {
  484 |     Object.defineProperty(navigator, "mediaDevices", {
  485 |       configurable: true,
  486 |       value: {
  487 |         getUserMedia: async (constraints: MediaStreamConstraints) => {
  488 |           window.localStorage.setItem(
  489 |             "drawflow-camera-constraints",
  490 |             JSON.stringify(constraints)
  491 |           );
  492 |           return new MediaStream();
  493 |         },
  494 |       },
  495 |     });
  496 |     HTMLMediaElement.prototype.play = async () => {};
  497 |   });
  498 |   await page.goto("/demo/drawflow/active");
  499 |   await waitForBorrowerDashboard(page);
  500 | 
  501 |   await page.getByTestId("borrower-evidence-camera").click();
  502 |   await page
  503 |     .getByTestId("borrower-evidence-manager")
  504 |     .getByRole("button", { name: "Camera capture" })
  505 |     .click();
  506 |   await expect(
  507 |     page.getByTestId("borrower-evidence-camera-panel")
  508 |   ).toBeVisible();
  509 |   await expect(page.getByLabel("Camera preview")).toBeVisible();
  510 |   await expect(
  511 |     page.getByTestId("borrower-evidence-camera-capture")
  512 |   ).toContainText("Capture photo");
  513 |   await expect
  514 |     .poll(() =>
  515 |       page.evaluate(() =>
  516 |         window.localStorage.getItem("drawflow-camera-constraints")
  517 |       )
  518 |     )
  519 |     .toContain('"environment"');
  520 | });
  521 | 
  522 | test("Builder borrower dashboard can intake an expense from financial controls", async ({
  523 |   page,
  524 | }) => {
  525 |   await page.goto("/demo/drawflow/active");
  526 |   await waitForBorrowerDashboard(page);
  527 | 
  528 |   await page.getByTestId("borrower-add-expense").click();
  529 |   await expect(
  530 |     page.getByRole("heading", { name: "Add expense" })
  531 |   ).toBeVisible();
  532 |   await expect(
  533 |     page.getByRole("tab", { name: "Expense details" })
  534 |   ).toBeVisible();
  535 |   await expect(
  536 |     page.getByRole("tab", { name: "Receipt / invoice" })
  537 |   ).toBeVisible();
  538 |   await page.getByTestId("borrower-expense-vendor").fill("Harbor Concrete");
  539 |   await page.getByTestId("borrower-expense-amount").fill("1250");
```