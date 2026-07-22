# Backoffice performance check

`bun run perf:backoffice` is the repeatable, red-capable browser check for the
authenticated `/backoffice` dashboard. It records navigation and asset metrics,
waits for `backoffice-dashboard-grid`, and exits non-zero when the route errors,
redirects to authentication, times out, or exceeds a timing budget.

## Capture an authenticated session

Start the app on its configured WorkOS callback origin (normally
`http://localhost:3000`):

```bash
bun run dev
```

In another terminal, open Playwright's browser and save its authenticated
storage state:

```bash
bun x playwright codegen \
  --save-storage=/tmp/drawflow-backoffice-auth.json \
  http://localhost:3000/backoffice
```

Complete WorkOS sign-in, wait for the dashboard, and close the browser. The
storage-state file contains session credentials: keep it outside the repository,
never commit it, and delete it when the measurement is finished. Recapture it if
the script reports `auth-redirect`.

## Run the check

```bash
BACKOFFICE_STORAGE_STATE=/tmp/drawflow-backoffice-auth.json \
  bun run perf:backoffice
```

The command prints one JSON document. Its core metrics are:

- `ttfbMs`: browser navigation time to first response byte.
- `domContentLoadedMs`: wall time until the initial document is parsed.
- `dashboardReadyMs`: wall time until the production dashboard is visible.
- `resourceCount`, `scriptCount`, `transferBytes`, and `decodedBytes`: the cold
  browser asset footprint.
- `consoleErrors` and `failedRequests`: diagnostics; they are reported but are
  not timing-budget failures by themselves. Their matching `*Count` fields are
  complete; the diagnostic arrays are capped at 20 entries to keep output
  readable.

The defaults are a 750 ms TTFB budget and a 2,500 ms dashboard-ready budget.
Override either threshold explicitly when measuring a known slower environment:

```bash
BACKOFFICE_BASE_URL=https://staging.example.com \
BACKOFFICE_STORAGE_STATE=/tmp/drawflow-backoffice-auth.json \
BACKOFFICE_TTFB_BUDGET_MS=1000 \
BACKOFFICE_READY_BUDGET_MS=3500 \
  bun run perf:backoffice
```

The harness uses the locally installed Google Chrome channel by default, which
keeps the check runnable without downloading a second browser. Set
`BACKOFFICE_BROWSER_CHANNEL=chromium` in an environment where Playwright's
Chromium browser has been installed with `bun x playwright install chromium`.

Use the same origin, account, organization, data set, and budgets for before/after
comparisons. The script creates a fresh headless browser context, so its asset
metrics represent a cold browser load rather than a warm tab reload.

## Fixture limitation

Do not run this check with `DRAWFLOW_VISUAL_PARITY_FIXTURE=1`. That fixture gives
the TanStack route a deterministic user and organization but intentionally does
not provide a Convex auth token. The production
`production_proposals.getBackofficeDashboard` query correctly rejects that
session as unauthorized, so the fixture can measure cold Vite/SSR compilation
but cannot produce a valid dashboard-ready measurement.

On 2026-07-15, the fixture was still useful for isolating cold development
startup: the first `/backoffice` navigation measured 9,571 ms TTFB versus 221 ms
on an immediate warm reload. The production TanStack manifest declared 93
initial assets for the route (about 2,140 KiB raw / 609 KiB gzip), which should
also be tracked while reducing the route's dependency and preload closure.
