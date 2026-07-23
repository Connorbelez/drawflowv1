/**
 * Central FairLendBrokerage configuration.
 *
 * Contractor Workspace (and all other brokerage-scoped product surfaces) are
 * pinned to FairLendBrokerage for this phase. The WorkOS organization id is the
 * single source of truth so magic strings do not spread across routes and
 * Convex functions. `DRAWFLOW_FAIRLEND_ORG_ID` / `DRAWFLOW_FAIRLEND_PRINCIPAL`
 * override the defaults for non-production environments.
 *
 * PRD: contractor-workspace-prd.md §3.2, §3.3, §71 ("centralize org id").
 */

export const FAIRLEND_BROKERAGE_NAME = "FairLendBrokerage";

/**
 * Canonical default broker for every automatic FairLendBrokerage assignment.
 * The WorkOS id below identifies this user; the email is also verified when an
 * assignment is made so a stale or misconfigured id cannot silently route work
 * to the wrong broker.
 */
export const FAIRLEND_DEFAULT_BROKER_EMAIL = "elie@fairlend.ca";

export const FAIRLEND_WORKOS_ORGANIZATION_ID: string =
  process.env.DRAWFLOW_FAIRLEND_ORG_ID?.trim() ||
  "org_01KSNW6JHW9P9YS41DZX1YHHGS";

export const FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID: string =
  process.env.DRAWFLOW_FAIRLEND_PRINCIPAL?.trim() ||
  "user_01KR207FRFHQT46EV9N538XBF3";

/**
 * Deterministic provisional WorkOS user id for a contractor invited before the
 * real WorkOS user id arrives by webhook. Stable for a given normalized email
 * so profile linking resolves idempotently. Mirrors the builder-staff pattern.
 */
export function provisionalContractorWorkosUserId(
  normalizedEmail: string,
): string {
  const slug = normalizedEmail
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `provisioned_contractor_${slug}`;
}
