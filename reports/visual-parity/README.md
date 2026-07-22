# Production Foundation Proposal Flow Visual Parity

Captured: 2026-05-27

## Captured Baselines

- VP-001 builder proposal list: `reports/visual-parity/vp-001/baseline-1440x1000.png`, `baseline-1024x768.png`, `baseline-390x844.png`
- VP-002 proposal setup/package baseline: `reports/visual-parity/vp-002/baseline-1440x1000.png`, `baseline-1024x768.png`, `baseline-390x844.png`
- VP-003 milestone and budget worksheet baseline: `reports/visual-parity/vp-003/baseline-1440x1000.png`, `baseline-1024x768.png`, `baseline-390x844.png`
- VP-004 roadmap baseline: `reports/visual-parity/vp-004/baseline-1440x1000.png`, `baseline-1024x768.png`, `baseline-390x844.png`

## Production Captures

- VP-001 builder proposal list: `reports/visual-parity/vp-001/production-1440x1000.png`, `production-1024x768.png`, `production-390x844.png`
- VP-002 proposal setup/package: `reports/visual-parity/vp-002/production-1440x1000.png`, `production-1024x768.png`, `production-390x844.png`
- VP-003 milestone and budget worksheet: `reports/visual-parity/vp-003/production-1440x1000.png`, `production-1024x768.png`, `production-390x844.png`
- VP-004 roadmap: `reports/visual-parity/vp-004/production-1440x1000.png`, `production-1024x768.png`, `production-390x844.png`

Production screenshots were captured from canonical production URLs with:

```sh
bun run visual:production
```

The capture script starts Vite with `DRAWFLOW_VISUAL_PARITY_FIXTURE=1` and
`VITE_DRAWFLOW_VISUAL_PARITY_FIXTURE=1`. That fixture mode is disabled in
production builds and exists only to render deterministic production-shaped data
for screenshots at canonical routes when a real WorkOS browser session is not
available.

Normal route behavior still fails closed when `organizationId` is missing;
opening `http://localhost:3000/backoffice` without a WorkOS session redirects to
WorkOS sign-in or `/protected-access` instead of falling back to a synthetic
organization.
