export { presence, proposalTimeline } from "./proposal_collaboration/context";

export {
  COLLABORATION_ROLES,
  proposalTimelineScope,
  proposalCollaborationRoomId,
  defaultCollaborationPermission,
  isCollaborationRole,
  isBrokerSideRole,
  shareTokenHash,
  generateShareToken,
} from "./proposal_collaboration/contracts";
export type {
  CollaborationPermission,
  CollaborationCtx,
  CollaborationAuth,
  ProposalPlanningSnapshot,
} from "./proposal_collaboration/contracts";

export {
  resolveCollaborationAuth,
  resolveWorkosScope,
  getActiveMembership,
  getActiveSessionForProposal,
  getSessionOrThrow,
  getSessionByShareToken,
  upsertSessionParticipant,
  getParticipantForUser,
  assertParticipantCanEdit,
  assertCanManageSession,
  assertProposalCollaborationEditAllowed,
  hasActiveCollaborationParticipant,
  canReadProposalForCollaboration,
} from "./proposal_collaboration/authorization";

export {
  pushProposalPlanningSnapshot,
  getProposalTimelineStatus,
  undoProposalPlanningSnapshot,
  redoProposalPlanningSnapshot,
  captureProposalPlanningSnapshot,
  restoreProposalPlanningSnapshot,
} from "./proposal_collaboration/snapshots";

export {
  writeCollaborationAuditEvent,
  upsertProposalKanbanCard,
} from "./proposal_collaboration/audit";

export {
  listPresenceForRoom,
  heartbeatPresence,
  updatePresenceData,
  disconnectPresence,
} from "./proposal_collaboration/presence";

export {
  eligibleBuilderProfileForUser,
  displayNameForWorkosUser,
} from "./proposal_collaboration/identity";
