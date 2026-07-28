/**
 * Central FairLendBrokerage configuration (frontend mirror of
 * convex/fairLendConfig.ts). PRD §3.2, §3.3, §71 — the org id is the single
 * source of truth so magic strings do not spread across routes. Override via
 * Vite env for non-production environments.
 */
export const FAIRLEND_BROKERAGE_NAME = "FairLendBrokerage";

export const FAIRLEND_WORKOS_ORGANIZATION_ID: string =
  import.meta.env.VITE_DRAWFLOW_FAIRLEND_ORG_ID?.trim() ||
  "org_01KSNW6JHW9P9YS41DZX1YHHGS";
