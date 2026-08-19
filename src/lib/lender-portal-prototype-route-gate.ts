import { notFound } from "@tanstack/react-router";

/**
 * Lender Portal prototype routes remain available in development as frozen
 * promotion evidence, but must never serve their representative fixture data
 * from a production build.
 */
export const LENDER_PORTAL_PROTOTYPE_ROUTE_PATHS = [
  "/backoffice/proposals/lender-assignment-prototype",
  "/backoffice/proposals/review-requirements-prototype",
  "/builder/correction-resubmission-prototype",
  "/builder/milestone-revision-detail-prototype",
  "/lender/build-detail-overview-prototype",
  "/lender/draw-review-prototype",
  "/lender/draw-review-sheet-prototype",
  "/lender/draws-prototype",
  "/lender/milestone-review-prototype",
  "/lender/milestones-prototype",
  "/lender/organization-management-prototype",
  "/lender/proposal-confirmation-prototype",
  "/lender/prototype",
] as const;

const PROTOTYPE_ROUTE_PATHS = new Set<string>(
  LENDER_PORTAL_PROTOTYPE_ROUTE_PATHS
);
const TRAILING_SLASH_PATTERN = /\/+$/;

function normalizePathname(pathname: string): string {
  if (pathname === "/") {
    return pathname;
  }
  return pathname.replace(TRAILING_SLASH_PATTERN, "");
}

export function isLenderPortalPrototypeRoute(pathname: string): boolean {
  return PROTOTYPE_ROUTE_PATHS.has(normalizePathname(pathname));
}

export function enforceLenderPortalPrototypeRouteGate(
  pathname: string,
  isProduction = import.meta.env.PROD
): void {
  if (isProduction && isLenderPortalPrototypeRoute(pathname)) {
    throw notFound();
  }
}
