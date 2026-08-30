import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../types";

export const LENDER_PORTAL_NOTIFICATION_EVENT_CLASSES = [
  "approval-required",
  "proposal-updated-after-decline",
  "withdrawal",
  "approval-outcome",
] as const;

export type LenderPortalNotificationEventClass =
  (typeof LENDER_PORTAL_NOTIFICATION_EVENT_CLASSES)[number];

export type ReadCtx = Pick<QueryCtx | MutationCtx, "db">;

export type LenderPortalNotificationPayload = {
  assignmentId?: string;
  approvalGroup?: "backoffice" | "lender";
  audience: "backoffice" | "builder" | "lender";
  buildId?: string;
  confirmationCycleId?: string;
  eventClass: LenderPortalNotificationEventClass;
  lenderOrganizationId?: string;
  linkPath: string;
  outcome?: "approved" | "rejected";
  proposalId?: string;
  proposalRevisionId?: string;
  proposalRevisionNumber?: number;
  recipientWorkosUserId: string;
  resourceKind: "draw" | "milestone" | "proposal";
  reviewCycleId?: string;
  reviewCycleNumber?: number;
  targetId?: string;
  title: string;
};

export type NotificationRecipient = {
  eligibilityEpoch?: string;
  email: string;
  lenderOrganizationId?: string;
  name: string;
  workosUserId: string;
};

export function lenderProposalLinkPath(input: {
  assignmentId: Id<"proposalLenderAssignments">;
  confirmationCycleId?: Id<"proposalLenderConfirmationCycles">;
  proposalId: Id<"buildProposals">;
  proposalRevisionId?: Id<"proposalRevisions">;
}) {
  const search = new URLSearchParams({
    assignmentId: String(input.assignmentId),
  });
  if (input.confirmationCycleId) {
    search.set("confirmationCycleId", String(input.confirmationCycleId));
  }
  if (input.proposalRevisionId) {
    search.set("proposalRevisionId", String(input.proposalRevisionId));
  }
  return `/lender/proposals/${String(input.proposalId)}?${search.toString()}`;
}

export function backofficeProposalLinkPath(proposalId: Id<"buildProposals">) {
  return `/backoffice/proposals/${String(proposalId)}`;
}

export function builderProposalLinkPath(proposalId: Id<"buildProposals">) {
  return `/builder/proposals/${String(proposalId)}/?tab=closing`;
}

export function reviewLinkPath(input: {
  audience: "backoffice" | "builder" | "lender";
  buildId: Id<"activeBuilds">;
  kind: "draw" | "milestone";
  proposalId: Id<"buildProposals">;
  reviewCycleId: Id<"lenderPortalReviewCycles">;
  reviewCycleNumber: number;
  targetId: Id<"activeBuildDrawRequests"> | Id<"buildMilestones">;
}) {
  const idKey = input.kind === "milestone" ? "milestoneId" : "drawRequestId";
  const search = new URLSearchParams({
    [idKey]: String(input.targetId),
    reviewCycleId: String(input.reviewCycleId),
    reviewCycleNumber: String(input.reviewCycleNumber),
  });
  if (input.audience === "lender") {
    return `/lender/${input.kind === "milestone" ? "milestones" : "draws"}?${search.toString()}`;
  }
  if (input.audience === "backoffice") {
    search.set("tab", input.kind === "milestone" ? "milestones" : "draws");
    return `/backoffice/builds/${String(input.buildId)}?${search.toString()}`;
  }
  search.set("tab", input.kind === "milestone" ? "milestones" : "draws");
  return `/builder/proposals/${String(input.proposalId)}/?${search.toString()}`;
}

export function parseLenderPortalPayload(value: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Lender portal communication payload is invalid.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Lender portal communication payload is invalid.");
  }
  const payload = parsed as Partial<LenderPortalNotificationPayload>;
  if (
    !LENDER_PORTAL_NOTIFICATION_EVENT_CLASSES.includes(
      payload.eventClass as LenderPortalNotificationEventClass
    ) ||
    typeof payload.recipientWorkosUserId !== "string" ||
    typeof payload.linkPath !== "string"
  ) {
    throw new Error("Lender portal communication payload is invalid.");
  }
  return payload as LenderPortalNotificationPayload;
}

export function notificationLinkUnavailable() {
  return new Error(
    "This notification link is no longer available for the current account."
  );
}

export function isExpectedNotificationLinkPath(
  payload: LenderPortalNotificationPayload
) {
  if (
    !payload.linkPath.startsWith("/") ||
    payload.linkPath.startsWith("//") ||
    payload.linkPath.includes("\\")
  ) {
    return false;
  }
  if (payload.audience === "lender") {
    return payload.linkPath.startsWith("/lender/");
  }
  if (payload.audience === "backoffice") {
    return payload.linkPath.startsWith("/backoffice/");
  }
  return payload.linkPath.startsWith("/builder/");
}

export async function resolveViewerWorkosUserId(
  ctx: ReadCtx,
  viewerSubject: string
) {
  const workosUserId = viewerSubject.trim();
  if (!workosUserId) {
    throw notificationLinkUnavailable();
  }
  const users = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (query) =>
      query.eq("workosUserId", workosUserId)
    )
    .take(2);
  const user = users.length === 1 ? users[0] : undefined;
  if (user?.workosUserId !== workosUserId || user.status !== "active") {
    throw notificationLinkUnavailable();
  }
  return workosUserId;
}

export function normalizeId<TableName extends TableNames>(
  ctx: ReadCtx,
  tableName: TableName,
  value: string | undefined
): Id<TableName> | null {
  return value ? ctx.db.normalizeId(tableName, value) : null;
}

export async function requireCurrentLenderOrganizationId(
  ctx: ReadCtx,
  assignment: Doc<"proposalLenderAssignments">,
  proposal: Doc<"buildProposals">,
  confirmationCycle: Doc<"proposalLenderConfirmationCycles"> | null,
  revision: Doc<"proposalRevisions"> | null
): Promise<Id<"lenderOrganizations">> {
  const lenderOrganizationId = normalizeId(
    ctx,
    "lenderOrganizations",
    String(assignment.lenderOrganizationId)
  );
  const lenderOrganization = lenderOrganizationId
    ? await ctx.db.get(lenderOrganizationId)
    : null;
  if (
    !lenderOrganizationId ||
    !lenderOrganization ||
    lenderOrganization.status !== "active" ||
    lenderOrganization.brokerageId !== assignment.lenderBrokerageId ||
    assignment.proposalId !== proposal._id ||
    assignment.brokerageId !== proposal.brokerageId ||
    assignment.organizationId !== proposal.organizationId ||
    (revision !== null &&
      (revision.proposalId !== proposal._id ||
        revision.assignmentId !== assignment._id ||
        revision.brokerageId !== proposal.brokerageId ||
        revision.organizationId !== proposal.organizationId)) ||
    (confirmationCycle !== null &&
      (confirmationCycle.assignmentId !== assignment._id ||
        confirmationCycle.proposalId !== proposal._id ||
        confirmationCycle.brokerageId !== proposal.brokerageId ||
        confirmationCycle.organizationId !== proposal.organizationId ||
        (revision !== null &&
          confirmationCycle.proposalRevisionId !== revision._id)))
  ) {
    throw new Error("Lender notification scope is unavailable.");
  }
  return lenderOrganizationId;
}

export async function requireReviewNotificationScope(
  ctx: ReadCtx,
  input: {
    build: Doc<"activeBuilds">;
    cycle: Doc<"lenderPortalReviewCycles">;
    kind: "draw" | "milestone";
    targetId: Id<"activeBuildDrawRequests"> | Id<"buildMilestones">;
  }
) {
  const proposal = await ctx.db.get(input.build.proposalId);
  const target = await ctx.db.get(input.targetId);
  if (
    !proposal ||
    !target ||
    proposal.brokerageId !== input.build.brokerageId ||
    proposal.organizationId !== input.build.organizationId ||
    target.buildId !== input.build._id ||
    input.cycle.buildId !== input.build._id ||
    input.cycle.brokerageId !== input.build.brokerageId ||
    input.cycle.organizationId !== input.build.organizationId ||
    input.cycle.kind !== input.kind ||
    (input.kind === "milestone"
      ? input.cycle.milestoneId !== input.targetId ||
        input.cycle.drawRequestId !== undefined
      : input.cycle.drawRequestId !== input.targetId ||
        input.cycle.milestoneId !== undefined)
  ) {
    throw new Error("Review notification scope is unavailable.");
  }
  return proposal;
}
