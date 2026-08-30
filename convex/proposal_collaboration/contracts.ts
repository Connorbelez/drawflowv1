import { normalizeRoleSlugs, type RoleSlug } from "../authz";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

export const COLLABORATION_ROLES = [
  "builder",
  "builder-staff",
  "broker",
  "broker-staff",
  "admin",
  "principle-broker",
] as const satisfies readonly RoleSlug[];

export type CollaborationPermission = "edit" | "view";

export type CollaborationCtx = (QueryCtx | MutationCtx) & {
  viewer?: {
    email?: string;
    roles: RoleSlug[];
    subject: string;
  };
};

export interface CollaborationAuth {
  brokerage: Doc<"brokerages">;
  membership: Doc<"workosOrganizationMemberships">;
  proposal: Doc<"buildProposals">;
  roles: RoleSlug[];
  subject: string;
}

export interface ProposalPlanningSnapshot {
  capitalEvents: Array<{
    amountCents: number;
    capitalEventKey: string;
    eventKind: "cashInfusion" | "cost" | "homeEquityTakeout";
    interestAnnualBps?: number;
    label: string;
    order: number;
    x: number;
  }>;
  costItems?: Array<{
    budgetSubmilestoneKey?: string;
    budgetTreatment?: "add" | "logOnly" | "maintain";
    costCents: number;
    description?: string;
    itemKey: string;
    itemType: "equipment" | "material";
    milestoneKey: string;
    quantity: number;
    relevantSubmilestoneKeys: string[];
    supplier?: string;
    title: string;
  }>;
  draws: Array<{
    amountCents: number;
    customDate?: boolean;
    drawKey: string;
    label: string;
    milestoneKey?: string;
    order: number;
    requestNote?: string;
    requestReviewNote?: string;
    requestStatus?: "approved" | "draft" | "rejected" | "requested";
    requestedAt?: string;
    reviewedAt?: string;
    source: "manual" | "milestone";
    timingDay: number;
  }>;
  milestones: Array<{
    budgetCents: number;
    dayEnd: number;
    dayStart: number;
    dependencyKeys: string[];
    drawAvailabilityCents: number;
    durationDays: number;
    evidenceState?: string;
    icon?: string;
    key: string;
    lane?: number;
    markerLabel?: string;
    name: string;
    order: number;
    policyState?: string;
    submilestones: Array<{
      budgetCents?: number;
      durationDays?: number;
      fieldGuidance?: {
        cameraAnglesTiptapJson: string;
        whatToVerifyTiptapJson: string;
      };
      key: string;
      name: string;
      order: number;
      scopeOfWorkTiptapJson?: string;
    }>;
    timelineStatus?: string;
    tone?: string;
  }>;
  proposal: {
    borrowerStartingCashCents: number;
    lenderDrawPolicyLimitCents: number;
    timelineCurrentDay?: number;
    timelineProgressValue?: number;
    timelineRangeMax?: number;
    timelineRangeMin?: number;
    timelineRouteState?: unknown;
    timelineStartingCashCents?: number;
    totalBudgetCents: number;
  };
  version: 1;
}

export function proposalTimelineScope(proposalId: Id<"buildProposals">) {
  return `proposal:${proposalId}`;
}

export function proposalCollaborationRoomId(input: {
  organizationId: string;
  proposalId: Id<"buildProposals">;
  sessionId: Id<"proposalCollaborationSessions">;
}) {
  return `org:${input.organizationId}:proposal:${input.proposalId}:session:${input.sessionId}`;
}

export function defaultCollaborationPermission(
  roles: readonly RoleSlug[]
): CollaborationPermission {
  if (roles.includes("builder-staff") || roles.includes("broker-staff")) {
    return "view";
  }
  return "edit";
}

export function isCollaborationRole(roles: readonly RoleSlug[]) {
  return roles.some((role) =>
    (COLLABORATION_ROLES as readonly RoleSlug[]).includes(role)
  );
}

export function isBrokerSideRole(roles: readonly RoleSlug[]) {
  return roles.some((role) =>
    (["admin", "principle-broker", "broker", "broker-staff"] as const).includes(
      role as any
    )
  );
}

export async function shareTokenHash(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function generateShareToken() {
  return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
}
