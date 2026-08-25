export { migrations } from "./migrations/context";

export {
  backfillProposalBorrowerStartingCash,
  backfillActiveBuildBorrowerStartingCash,
  backfillCapitalPlanBorrowerStartingCash,
  runBorrowerStartingCashCutover,
  backfillBrokeragePrincipalBrokerEmail,
  runBrokeragePrincipalBrokerEmailBackfill,
  backfillWorkosUserNormalizedEmail,
  runWorkosUserNormalizedEmailBackfill,
  backfillProposalCostItemBudgetTreatment,
  backfillBuildCostItemBudgetTreatment,
  runCostItemBudgetTreatmentBackfill,
} from "./migrations/legacy";

export {
  backfillLegacyProposalLenderAssignmentOrganizations,
  backfillLegacyProposalLenderApprovalOrganizations,
  runLegacyLenderOrganizationCutover,
} from "./migrations/lender_organization";

export {
  backfillProposalPhase3PolicyAndRevision,
  backfillProposalPhase3ApprovalRevision,
  backfillProposalPhase3PolicyLock,
  runProposalPhase3LifecycleBackfill,
} from "./migrations/phase3";

export {
  validateLenderPortalPhase9ApplyManifest,
  reconcileLenderPortalPhase9PolicyAssignmentFacts,
  reconcileLenderPortalPhase9ApprovalFacts,
  reconcileLenderPortalPhase9PolicyLocks,
  reconcileLenderPortalProposalLifecycle,
  rebuildLenderPortalProposalKanbanProjection,
  runLenderPortalPhase9Migration,
} from "./migrations/phase9";
