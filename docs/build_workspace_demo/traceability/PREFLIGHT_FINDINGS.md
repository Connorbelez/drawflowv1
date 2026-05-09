# Build Workspace Traceability Preflight Findings

Generated from local repo inspection. This file records implementation-relevant facts only; source specs remain authoritative.

## Source Inputs

| Source | Path | Lines / dimensions | SHA-256 |
| --- | --- | --- | --- |
| Interaction Spec | docs/build_workspace_demo/Drawflow Demo Interaction Spec.md | 4806 | adfda238b1b1577f31877fc9733cd248410ee2ea2221027c5772f73a852006ab |
| Implementation Companion | docs/build_workspace_demo/Drawflow Demo Implementation Companion.md | 1843 | a7e24fd283b6289aba9959a3df42aeadfefab9a11ddb56aa93317f490155b701 |
| DrawFlow PRD | docs/draw_flow_prd.md | 2381 | 6e8109b917f7a368e6d496cf52b637f116b0eb82500354260de92afc4ddb7046 |
| Build Workspace Mockup | docs/build_workspace_demo/build_workspace_mockup.png | 1995x1106 | df8e118c1a33ceb4c20adca9c54ef8d080fc8024804f78a971db78a9c67653b8 |

## Repo Facts To Carry Forward

- Package manager/runtime: Bun. Use `bun install`, `bun add`, `bun run <script>`, and `bun x <binary>`.
- Current app shell is still mostly starter/demo routes, not an implemented Build Workspace.
- Existing route files include: `src/routes/__root.tsx`, `src/routes/about.tsx`, `src/routes/api/auth/sign-in.tsx`, `src/routes/api/auth/sign-up.tsx`, `src/routes/callback.tsx`, `src/routes/demo/convex.tsx`, `src/routes/demo/tanstack-query.tsx`, `src/routes/demo/workos.tsx`, `src/routes/index.tsx`.
- Existing top-level Convex files include: `convex/auth.ts`, `convex/convex.config.ts`, `convex/fluent.ts`, `convex/http.ts`, `convex/schema.ts`, `convex/todos.ts`, `convex/tsconfig.json`.
- `convex/_generated/ai/guidelines.md` exists: no. Later Convex implementation must check this again after codegen/dev setup.
- Playwright config files found: none.
- `@playwright/test` dependency present: no.
- Current `package.json` scripts: `dev: vite dev --port 3000`, `build: vite build`, `preview: vite preview`, `test: vitest run`, `check: biome check --write .`, `fix: ultracite fix`.

## Required Later Commands

- `bun install` if dependencies are missing.
- `bun run build` for app build verification.
- `bun run test` for Vitest, if unit tests are added.
- `bun x convex codegen` after Convex schema/functions are added.
- `bun x tsc -p convex/tsconfig.json` after Convex implementation.
- Add and run Playwright through Bun once the implementation creates a Playwright setup.

## Drift Notes

- Interaction Spec section 6 contains an early table manifest with `demo_buildScenarios`.
- Round 6 section 20.6 is the final schema contract and omits `demo_buildScenarios`.
- Treat `demo_buildScenarios` as superseded and do not create it as a final required table.
