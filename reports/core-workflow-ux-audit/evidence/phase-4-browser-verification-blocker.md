# Phase 4 Browser Verification Status

<!-- markdownlint-disable MD013 -->

**Original attempt:** 2026-07-19  
**Re-triage and completion:** 2026-07-22  
**Current disposition:** **RESOLVED**

## Original blocker

The 2026-07-19 run could start Vite but could not load the fixture routes because eager route evaluation required a configured Convex deployment address. Protected configuration was not copied or exposed, and no synthetic backend endpoint was used. That run produced no valid browser evidence.

## Resolution

The current environment can run the repository's visual-parity fixtures without reading or copying protected credentials:

```text
VITE_DRAWFLOW_VISUAL_PARITY_FIXTURE=1
DRAWFLOW_VISUAL_PARITY_FIXTURE=1
bun run dev --host 127.0.0.1
```

Chromium successfully loaded the proposal and active-Build fixture routes. The pass also found and fixed three real residual issues:

1. `SidebarInset` used `w-full` beside the desktop sidebar, producing a 1,280 px document inside a 1,024 px viewport. It now uses `min-w-0 flex-1`; document width is 1,024/1,024.
2. Mobile header icon controls measured 28–32 px. Sidebar, theme, and notification controls now measure 44×44 px below the desktop breakpoint.
3. The visual fixture exposed an empty Builder Staff tab. The staff panel now accepts an explicit fixture directory while production continues to read Convex.

## Verified surfaces

- Builder proposal workspace at a 512 px CSS viewport (equivalent reflow width for 200% zoom on a 1,024 px viewport).
- Active Build Details at 1,440×900, 1,024×768, 512×768, and 390×844.
- Active Build Contractors, Materials, Timeline, Evidence, Staff, and Calendar at 1,024×768.
- Document overflow checks at 1,024, 512, and 390 CSS pixels.
- Mobile header target measurements.
- Browser console, page-error, and network diagnostics on the final Staff route: clean.

A subsequent production-backed authenticated pass used the supplied Builder and Lender Admin accounts at 1,280×900 and 390×844. It found and repaired additional authorization, responsive containment, Contractor detail, Site Visit semantics/coss composition, view-toggle, and placeholder-route defects. See `../authenticated-browser-qa-report.md` and `authenticated-qa/`.

## Fresh evidence

All files below are post-remediation captures from 2026-07-22:

- `reports/core-workflow-ux-audit/evidence/final-qa/active-build-1440x900.png`
- `reports/core-workflow-ux-audit/evidence/final-qa/active-build-1024x768.png`
- `reports/core-workflow-ux-audit/evidence/final-qa/active-build-390x844.png`
- `reports/core-workflow-ux-audit/evidence/final-qa/active-build-1024x768-200pct-equivalent.png`
- `reports/core-workflow-ux-audit/evidence/final-qa/proposal-workspace-512x768.png`
- `reports/core-workflow-ux-audit/evidence/final-qa/calendar-1024x768.png`
- `reports/core-workflow-ux-audit/evidence/final-qa/staff-1024x768.png`
- `reports/core-workflow-ux-audit/evidence/authenticated-qa/` (authenticated snapshots, measurements, and screenshots)

## Scope note

The 512 px capture is a CSS-viewport reflow equivalent for browser 200% zoom on a 1,024 px device viewport; it is not a claim that CSS `zoom` was used. Existing 2026-07-17 evidence remains historical defect evidence and is not relabelled as post-remediation proof.
