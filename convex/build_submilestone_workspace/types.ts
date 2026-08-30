import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import type { BuildCollaborationRole } from "../build_collaboration_model";
import type { Doc, Id, QueryCtx } from "../types";

export const MAX_BOOTSTRAP_ROWS = 100;
export const MAX_COMPANION_CANDIDATES = 32;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 50;

export type WorkspaceArgs = {
  buildId: Id<"activeBuilds">;
  buildSubmilestoneId: Id<"buildSubmilestones">;
  companionActionItemId?: Id<"buildActionItems">;
  organizationId: string;
  viewerCapacity?: BuildCollaborationRole;
};

export type WorkspaceCollectionArgs = WorkspaceArgs & {
  collection: WorkspaceCollection;
  cursor?: string;
  limit?: number;
};

export type CollaborationState = {
  code?: string;
  message?: string;
  state: "available" | "degraded";
};

export type WorkspaceCollection =
  | "evidence_requirements"
  | "evidence_assets"
  | "people_assignments"
  | "people_history"
  | "materials"
  | "collaboration_comments"
  | "collaboration_activity"
  | "collaboration_revisions"
  | "collaboration_checklist"
  | "collaboration_children"
  | "collaboration_relations"
  | "review_decisions";

export type WorkspaceCollectionRow = {
  amountCents?: number;
  budgetSubmilestoneKey?: string;
  budgetTreatment?: string;
  completed?: boolean;
  costCents?: number;
  createdAt?: number;
  detail?: string;
  description?: string;
  id: string;
  itemKey?: string;
  itemType?: string;
  kind: string;
  displayName?: string;
  email?: string;
  contractorId?: Id<"contractorProfiles">;
  assignmentId?: Id<"milestoneContractorAssignments">;
  historyType?: string;
  actorWorkosUserId?: string;
  locationRequired?: boolean;
  locationVerified?: boolean;
  milestoneKey?: string;
  sourceDiscussionAssetId?: Id<"buildCollaborationAssets">;
  sourceDiscussionPostId?: Id<"buildCollaborationPosts">;
  sourceKind?: string;
  quantity?: number;
  relevantSubmilestoneKeys?: string[];
  required?: boolean;
  requirementKey?: string;
  status?: string;
  supplier?: string;
  title: string;
  totalCents?: number;
  unit?: string;
  updatedAt?: number;
};

export type WorkspaceContext = {
  authorization: ActiveBuildAuthorization;
  companion?: Doc<"buildActionItems">;
  collaboration: CollaborationState;
  post?: Doc<"buildCollaborationPosts">;
  milestone: Doc<"buildMilestones">;
  submilestone: Doc<"buildSubmilestones">;
};

export type StrictWorkspaceContext = Omit<WorkspaceContext, "companion" | "post"> & {
  companion: Doc<"buildActionItems">;
  post: Doc<"buildCollaborationPosts">;
};

export type WorkspaceQueryContext = QueryCtx & {
  viewer: import("../authz").AuthorizedViewer;
};

export type WorkspaceCursorValue =
  | { mode: "indexed"; cursor: string }
  | { mode: "offset"; offset: number }
  | { mode: "history"; createdAt: number; id: string };

export type WorkspaceCursorDecode =
  | WorkspaceCursorValue
  | { state: "integrity_error"; code: string; message: string }
  | null;
