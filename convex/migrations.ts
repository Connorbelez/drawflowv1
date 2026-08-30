export { migrations } from "./migrations/context";

export {
  backfillActiveBuildBorrowerStartingCash,
  backfillBrokeragePrincipalBrokerEmail,
  backfillBuildCostItemBudgetTreatment,
  backfillCapitalPlanBorrowerStartingCash,
  backfillProposalBorrowerStartingCash,
  backfillProposalCostItemBudgetTreatment,
  backfillWorkosUserNormalizedEmail,
  runBorrowerStartingCashCutover,
  runBrokeragePrincipalBrokerEmailBackfill,
  runCostItemBudgetTreatmentBackfill,
  runWorkosUserNormalizedEmailBackfill,
} from "./migrations/legacy";
export {
  backfillLenderMemberDecisionPermissions,
  runLenderMemberDecisionPermissionsBackfill,
} from "./migrations/lender_member_permissions";
export {
  backfillLegacyProposalLenderApprovalOrganizations,
  backfillLegacyProposalLenderAssignmentOrganizations,
  runLegacyLenderOrganizationCutover,
} from "./migrations/lender_organization";

export {
  backfillProposalPhase3ApprovalRevision,
  backfillProposalPhase3PolicyAndRevision,
  backfillProposalPhase3PolicyLock,
  runProposalPhase3LifecycleBackfill,
} from "./migrations/phase3";

export {
  rebuildLenderPortalProposalKanbanProjection,
  reconcileLenderPortalPhase9ApprovalFacts,
  reconcileLenderPortalPhase9PolicyAssignmentFacts,
  reconcileLenderPortalPhase9PolicyLocks,
  reconcileLenderPortalProposalLifecycle,
  runLenderPortalPhase9Migration,
  validateLenderPortalPhase9ApplyManifest,
} from "./migrations/phase9";
