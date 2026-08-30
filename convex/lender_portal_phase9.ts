/**
 * Stable Phase 9 migration/release-readiness facade.
 *
 * Public Convex handlers remain exported from this module so generated API
 * names and the migration runner contract do not change while capabilities
 * live in coarse bounded-context modules.
 */
export {
  inventoryLenderPortalPhase9MigrationCandidates,
} from "./lender_portal_phase9/inventory.js";
export {
  readLenderPortalPhase9MigrationAudit,
  prepareLenderPortalPhase9MigrationRun,
  authorizeLenderPortalPhase9MigrationRun,
  verifyLenderPortalPhase9MigrationRun,
  getLenderPortalPhase9MigrationRun,
  listLenderPortalPhase9MigrationIssues,
  requireAuthorizedLenderPortalPhase9Migration,
  beginLenderPortalPhase9MigrationApply,
} from "./lender_portal_phase9/runs.js";
export { collectMigrationSnapshot } from "./lender_portal_phase9/snapshot.js";
