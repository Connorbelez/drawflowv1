# Public asset deploy notes (CWV)

Inventory as of CWV hygiene pass. Large binaries stay in git for design/archive
workflows; production Nitro publicAsset copy excludes the heaviest unused tree.

## `public/designConcepts/` (~75 MB)

Referenced from archived marketing sources only:

- `src/features/fairlend-public/fairlend-public-pages.tsx` (brandKit paths)
- `src/routes/press.tsx`, `src/routes/garden-suite-financing-gta.tsx`
- Tests under `src/routes/-press.test.tsx` and fairlend-public tests
- Manifests/READMEs under `public/assets/*` that document mockup provenance

Those marketing routes are excluded from the production route tree via
`MARKETING_ROUTE_ARCHIVE_PATTERN` in `vite.config.ts`.

**Production:** Nitro `ignore: ["public/designConcepts/**"]` in `vite.config.ts`
skips this directory when copying public assets into the build output. Restore
the folder to the deploy output if marketing routes are un-archived.

## `public/houseIcon.png` (~1.9 MB)

No references under `src/`. Kept on disk (do not delete without a product
decision); not excluded from Nitro copy yet — consider adding to `nitro.ignore`
or replacing with a compressed WebP if a surface needs it.

## Milestone PNGs

- `public/milestone-icons/` (~14 MB) — used by demo timeline
  (`src/routes/demo/timeline/-MilestoneCard.tsx`, worksheet table).
- `public/drawflow-milestone-blueprint-icons/` (~1.9 MB) — same demo surfaces.

Keep in production public assets while demo timeline routes remain live.
