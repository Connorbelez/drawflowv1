/**
 * Tiny visual-parity constants for route guards.
 * Fat fixture builders live in visualParityFixtures.ts and must only be
 * loaded dynamically when the fixture flag is on.
 */

export const VISUAL_PARITY_ORGANIZATION_ID = "org_visual_parity_workos";
export const VISUAL_PARITY_PROPOSAL_ID = "proposal_visual_parity";
export const VISUAL_PARITY_SUBMITTED_PROPOSAL_ID = "proposal_visual_submitted";
export const VISUAL_PARITY_APPROVED_PROPOSAL_ID = "proposal_visual_approved";
export const VISUAL_PARITY_CLOSED_PROPOSAL_ID = "proposal_visual_closed";
export const VISUAL_PARITY_ACTIVE_BUILD_ID = "build_visual_hamilton";

export function isProductionVisualParityFixtureEnabled(): boolean {
  return (
    !import.meta.env.PROD &&
    import.meta.env.VITE_DRAWFLOW_VISUAL_PARITY_FIXTURE === "1"
  );
}
