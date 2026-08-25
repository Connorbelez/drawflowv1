import type { ReactNode } from "react";

import type { BuilderStaffAppPermissions } from "#/features/builder-staff/app-permissions.ts";
import type { ConvexTimelineWorkspace } from "#/features/timeline-workspace/-timeline-convex-adapter.ts";
import type {
  TimelineModificationRequestView,
  TimelineWorkspacePersistence,
} from "#/features/timeline-workspace/index.tsx";
import type { Id } from "../../../convex/_generated/dataModel";

export interface ProductionTimelineWorkspaceProps {
  appPermissions?: BuilderStaffAppPermissions | null;
  backofficeHref: string;
  /** Use inside tabbed proposal surfaces so layout width stays with the shell. */
  embedded?: boolean;
  headerActions?: ReactNode;
  initialRole?: "builder" | "lender";
  lockedBannerActions?: ReactNode;
  persistenceMode?: "convex" | "noop";
  prejoinedCollabToken?: string | null;
  proposalHref: string;
  proposalId: Id<"buildProposals">;
  workosOrganizationId: string;
  workspace: ConvexTimelineWorkspace & {
    contractorPlanning?: any;
    modificationRequests?: TimelineModificationRequestView[];
    proposal: {
      buildName: string;
      interestAnnualBps?: number;
      location: string;
      lenderDrawPolicyLimitCents?: number;
      reviewOutcome?: string;
      status: string;
      totalBudgetCents: number;
    };
  };
}

export interface CollaborationParticipant {
  _id: string;
  assignableBuilderProfileId?: string | null;
  displayName?: string;
  inviteEmail?: string;
  permission: "edit" | "view";
  roleSlugs?: string[];
  status: "invited" | "joined" | "revoked";
  workosUserId?: string;
}

export interface PresenceRow {
  data?: {
    cursor?: { x: number; y: number } | null;
  };
  name?: string;
  online: boolean;
  userId: string;
}

export const noopTimelineWorkspacePersistence: TimelineWorkspacePersistence = {
  createCapitalEvent: async () => undefined,
  createCashInfusion: async () => undefined,
  createDraw: async () => undefined,
  createEvidenceAsset: async () => undefined,
  createMilestone: async () => undefined,
  deleteCapitalEvent: async () => undefined,
  deleteDraw: async () => undefined,
  deleteEvidenceAsset: async () => undefined,
  deleteMilestone: async () => undefined,
  generateEvidenceUploadUrl: async () => "about:blank",
  requestModification: async () => undefined,
  reviewModificationRequest: async () => undefined,
  submitPlan: async () => undefined,
  updateCapitalEvent: async () => undefined,
  updateDraw: async () => undefined,
  updateEvidenceAsset: async () => undefined,
  updateMilestone: async () => undefined,
  updatePlanState: async () => undefined,
};
