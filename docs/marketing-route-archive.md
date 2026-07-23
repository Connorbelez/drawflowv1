# Marketing route archive

DrawFlow's public marketing route implementations remain in `src/routes`, but
they are intentionally excluded from TanStack Router generation. The root route
is now the organization access portal rather than a marketing landing page.

## How the archive works

- `src/lib/marketing-route-archive.ts` is the canonical manifest of archived
  route files and directories.
- `vite.config.ts` passes the generated ignore pattern to TanStack Start's
  router configuration.
- `src/routeTree.gen.ts` therefore contains only active product and access
  routes. Archived source files are preserved and can still be edited or tested.
- `/` renders the persona-aware access portal and uses `noindex, nofollow`
  metadata because it is an authentication surface.

## Restoring a marketing route

1. Remove the file or directory from `ARCHIVED_MARKETING_ROUTE_PATHS`.
2. Regenerate the TanStack route tree.
3. Run the marketing archive and routing tests.
4. Review the restored route's navigation, canonical metadata, and search-index
   policy before release.

Do not delete archived source files unless the marketing surface is being
permanently retired in a separately reviewed change.
