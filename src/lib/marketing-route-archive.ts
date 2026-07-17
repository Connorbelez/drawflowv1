/**
 * Preserved marketing route sources that are intentionally excluded from
 * TanStack Router discovery. The files remain in `src/routes` so the archive
 * can be restored without reconstructing page implementations or assets.
 */
export const ARCHIVED_MARKETING_ROUTE_ENTRIES = [
  "marketing.tsx",
  "about.tsx",
  "press.tsx",
  "investors.tsx",
  "contact.tsx",
  "roadmap.tsx",
  "affordable-sustainable-rental-housing.tsx",
  "construction-draw-financing.tsx",
  "cmhc-mli-select-multiplex-financing.tsx",
  "garden-suite-financing-gta.tsx",
  "multiplex-financing-gta.tsx",
  "resources",
  "start",
  "intake",
  "leadership",
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const MARKETING_ROUTE_ARCHIVE_PATTERN = `^(?:${ARCHIVED_MARKETING_ROUTE_ENTRIES.map(
  escapeRegExp
).join("|")})$`;
