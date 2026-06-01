# Impeccable Material Planning Audit

Date: 2026-06-01

## Scope

- `MaterialPlanningTab`
- Builder proposal Materials tab
- Backoffice proposal Materials tab
- Backoffice build Materials tab
- Builder build Materials tab

## Health Score

| Dimension | Score | Evidence |
| --- | ---: | --- |
| Accessibility | 4/4 | Visible material controls are labeled in all captured routes. Focusable tabs and form controls use semantic primitives. |
| Performance | 4/4 | Decorative GSAP/ScrollTrigger code and unused dependencies were removed. No layout choreography remains in the material-planning surface. |
| Theming | 4/4 | The surface uses existing `Frame`, `Card`, `Button`, `Input`, `NativeSelect`, `Badge`, and token classes. |
| Responsive | 4/4 | Mobile captures show no horizontal overflow and no sub-44px material controls. |
| Anti-patterns | 4/4 | No decorative gradients, prompt-based deletion, cents-facing cost copy, nested cards, or page-load animation remain in the material surface. |

Total: 20/20

## Fixes Applied

- Hid inactive Base UI tab panels during exit state so the previous Timeline panel no longer pushes the Materials panel down.
- Removed decorative GSAP/ScrollTrigger motion and the `gsap` / `@gsap/react` dependencies from the material-planning feature.
- Replaced decorative summary cards with a compact summary strip.
- Changed the cost editor to accept dollar input while keeping Convex payloads in cents.
- Added inline delete confirmation with a removal reason instead of `window.prompt`.
- Raised mobile tab and material form touch targets to 44px while keeping desktop density.

## Screenshots

Desktop:

- `after/desktop-builder-proposal-materials.png`
- `after/desktop-backoffice-proposal-materials.png`
- `after/desktop-backoffice-build-materials.png`
- `after/desktop-builder-build-materials.png`

Mobile:

- `after/mobile-builder-proposal-materials.png`
- `after/mobile-backoffice-proposal-materials.png`
- `after/mobile-backoffice-build-materials.png`
- `after/mobile-builder-build-materials.png`

Metrics:

- `after/audit-metrics.json`

## Verification

- `bun run test src/features/material-planning/MaterialPlanningTab.test.tsx src/features/production-proposals/ProductionProposalSurfaces.test.tsx src/features/backoffice-build-detail/ProductionBuildDetailSurface.test.tsx convex/production_proposals.test.ts`
- `bun run build`

