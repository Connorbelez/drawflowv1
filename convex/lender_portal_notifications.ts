import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { v } from "convex/values";
import { enqueueCommunicationIntent } from "./email_transport";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "./fairLendConfig";
import { authenticatedQuery } from "./fluent";
import {
  listActiveApprovalEligibleLenderOrganizationMembers,
  listActiveLenderOrganizationMembers,
  normalizeLenderEmail,
} from "./lenderOrganizationAccess";
import type { MutationCtx, QueryCtx } from "./types";

export const LENDER_PORTAL_NOTIFICATION_EVENT_CLASSES = [
  "approval-required",
  "proposal-updated-after-decline",
  "withdrawal",
  "approval-outcome",
] as const;

export type LenderPortalNotificationEventClass =
  (typeof LENDER_PORTAL_NOTIFICATION_EVENT_CLASSES)[number];

export const authorizeLenderPortalNotificationLink = authenticatedQuery
  .input({
    intentId: v.id("communicationIntents"),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      audience: v.union(
        v.literal("backoffice"),
        v.literal("builder"),
        v.literal("lender")
      ),
      eventClass: v.union(
        v.literal("approval-required"),
        v.literal("proposal-updated-after-decline"),
        v.literal("withdrawal"),
        v.literal("approval-outcome")
      ),
      linkPath: v.string(),
      readOnly: v.boolean(),
    })
  )
  .handler(async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent?.kind.startsWith("lender_portal_")) {
      throw notificationLinkUnavailable();
    }
    const payload = parseLenderPortalPayload(intent.payloadSnapshot);
    if (!isExpectedNotificationLinkPath(payload)) {
      throw notificationLinkUnavailable();
    }
    const viewerWorkosUserId = await resolveViewerWorkosUserId(
      ctx,
      ctx.viewer.subject
    );
    if (payload.recipientWorkosUserId !== viewerWorkosUserId) {
      throw notificationLinkUnavailable();
    }
    const expectedWorkosOrganizationId =
      payload.audience === "lender"
        ? FAIRLEND_WORKOS_ORGANIZATION_ID
        : intent.organizationId;
    if (args.workosOrganizationId !== expectedWorkosOrganizationId) {
      throw notificationLinkUnavailable();
    }
    const viewer = await activeWorkosRecipient(
      ctx,
      viewerWorkosUserId,
      args.workosOrganizationId
    );
    if (!viewer) {
      throw notificationLinkUnavailable();
    }
    const suppressionReason = await lenderPortalCommunicationSuppressionReason(
      ctx,
      intent,
      {
        requireRecipientEmailMatch: false,
      }
    );
    if (suppressionReason) {
      throw notificationLinkUnavailable();
    }
    return {
      audience: payload.audience,
      eventClass: payload.eventClass,
      linkPath: payload.linkPath,
      readOnly: payload.eventClass === "withdrawal",
    };
  })
  .public();

type ReadCtx = Pick<QueryCtx | MutationCtx, "db">;

type LenderPortalNotificationPayload = {
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

export async function enqueueProposalApprovalRequiredNotifications(
  ctx: MutationCtx,
  input: {
    assignment: Doc<"proposalLenderAssignments">;
    confirmationCycle: Doc<"proposalLenderConfirmationCycles">;
    proposal: Doc<"buildProposals">;
    revision: Doc<"proposalRevisions">;
  }
) {
  const lenderOrganizationId = await requireCurrentLenderOrganizationId(
    ctx,
    input.assignment,
    input.proposal,
    input.confirmationCycle,
    input.revision
  );
  const recipients = await listActiveApprovalEligibleLenderOrganizationMembers(
    ctx,
    lenderOrganizationId,
    "proposal_review"
  );
  const linkPath = lenderProposalLinkPath({
    assignmentId: input.assignment._id,
    confirmationCycleId: input.confirmationCycle._id,
    proposalId: input.proposal._id,
    proposalRevisionId: input.revision._id,
  });
  for (const recipient of recipients) {
    const payload: LenderPortalNotificationPayload = {
      assignmentId: String(input.assignment._id),
      audience: "lender",
      confirmationCycleId: String(input.confirmationCycle._id),
      eventClass: "approval-required",
      lenderOrganizationId: String(lenderOrganizationId),
      linkPath,
      proposalId: String(input.proposal._id),
      proposalRevisionId: String(input.revision._id),
      proposalRevisionNumber: input.revision.revisionNumber,
      recipientWorkosUserId: recipient.workosUserId,
      resourceKind: "proposal",
      title: input.proposal.buildName,
    };
    await enqueueCommunicationIntent(ctx, {
      brokerageId: input.proposal.brokerageId,
      idempotencyKey: lenderPortalIntentKey({
        eventClass: payload.eventClass,
        immutableResourceId: String(input.confirmationCycle._id),
        recipientWorkosUserId: recipient.workosUserId,
        resourceKind: payload.resourceKind,
      }),
      kind: "lender_portal_approval_required",
      organizationId: input.proposal.organizationId,
      payloadSnapshot: JSON.stringify(payload),
      recipientEmailSnapshot: recipient.email,
      recipientNameSnapshot: recipient.name || undefined,
      relatedEntityId: String(input.proposal._id),
      relatedEntityType: "proposal",
      templateKey: "lender_portal_approval_required_v1",
    });
  }
}

export async function enqueueProposalUpdatedAfterDeclineNotifications(
  ctx: MutationCtx,
  input: {
    assignment: Doc<"proposalLenderAssignments">;
    confirmationCycle: Doc<"proposalLenderConfirmationCycles">;
    proposal: Doc<"buildProposals">;
    revision: Doc<"proposalRevisions">;
  }
) {
  const lenderOrganizationId = await requireCurrentLenderOrganizationId(
    ctx,
    input.assignment,
    input.proposal,
    input.confirmationCycle,
    input.revision
  );
  const recipients = await listActiveLenderOrganizationMembers(
    ctx,
    lenderOrganizationId
  );
  const linkPath = lenderProposalLinkPath({
    assignmentId: input.assignment._id,
    confirmationCycleId: input.confirmationCycle._id,
    proposalId: input.proposal._id,
    proposalRevisionId: input.revision._id,
  });
  for (const recipient of recipients) {
    await enqueueLenderPortalIntent(ctx, {
      brokerageId: input.proposal.brokerageId,
      immutableResourceId: String(input.confirmationCycle._id),
      kind: "lender_portal_proposal_updated_after_decline",
      organizationId: input.proposal.organizationId,
      payload: {
        assignmentId: String(input.assignment._id),
        audience: "lender",
        confirmationCycleId: String(input.confirmationCycle._id),
        eventClass: "proposal-updated-after-decline",
        lenderOrganizationId: String(lenderOrganizationId),
        linkPath,
        proposalId: String(input.proposal._id),
        proposalRevisionId: String(input.revision._id),
        proposalRevisionNumber: input.revision.revisionNumber,
        recipientWorkosUserId: recipient.workosUserId,
        resourceKind: "proposal",
        title: input.proposal.buildName,
      },
      recipient,
      relatedEntityId: String(input.proposal._id),
      relatedEntityType: "proposal",
      templateKey: "lender_portal_proposal_updated_after_decline_v1",
    });
  }
}

export async function enqueueProposalWithdrawalNotifications(
  ctx: MutationCtx,
  input: {
    assignment: Doc<"proposalLenderAssignments">;
    confirmationCycle: Doc<"proposalLenderConfirmationCycles"> | null;
    proposal: Doc<"buildProposals">;
    revision: Doc<"proposalRevisions"> | null;
  }
) {
  const lenderOrganizationId = await requireCurrentLenderOrganizationId(
    ctx,
    input.assignment,
    input.proposal,
    input.confirmationCycle,
    input.revision
  );
  const recipients = await listActiveLenderOrganizationMembers(
    ctx,
    lenderOrganizationId
  );
  const linkPath = lenderProposalLinkPath({
    assignmentId: input.assignment._id,
    confirmationCycleId: input.confirmationCycle?._id,
    proposalId: input.proposal._id,
    proposalRevisionId: input.revision?._id,
  });
  for (const recipient of recipients) {
    await enqueueLenderPortalIntent(ctx, {
      brokerageId: input.proposal.brokerageId,
      immutableResourceId: String(input.assignment._id),
      kind: "lender_portal_withdrawal",
      nextAttemptAt: Date.now() + 60_000,
      organizationId: input.proposal.organizationId,
      payload: {
        assignmentId: String(input.assignment._id),
        audience: "lender",
        confirmationCycleId: input.confirmationCycle
          ? String(input.confirmationCycle._id)
          : undefined,
        eventClass: "withdrawal",
        lenderOrganizationId: String(lenderOrganizationId),
        linkPath,
        proposalId: String(input.proposal._id),
        proposalRevisionId: input.revision
          ? String(input.revision._id)
          : undefined,
        proposalRevisionNumber: input.revision?.revisionNumber,
        recipientWorkosUserId: recipient.workosUserId,
        resourceKind: "proposal",
        title: input.proposal.buildName,
      },
      recipient,
      relatedEntityId: String(input.proposal._id),
      relatedEntityType: "proposal",
      templateKey: "lender_portal_withdrawal_v1",
    });
  }
}

export async function enqueueProposalApprovalOutcomeNotifications(
  ctx: MutationCtx,
  input: {
    assignment: Doc<"proposalLenderAssignments">;
    confirmationCycle: Doc<"proposalLenderConfirmationCycles">;
    outcome: "approved" | "rejected";
    proposal: Doc<"buildProposals">;
    revision: Doc<"proposalRevisions">;
  }
) {
  await requireCurrentLenderOrganizationId(
    ctx,
    input.assignment,
    input.proposal,
    input.confirmationCycle,
    input.revision
  );
  const [backofficeRecipients, builderRecipients] = await Promise.all([
    listBackofficeAdminRecipients(ctx, input.proposal.organizationId),
    listBuilderOwnerRecipients(ctx, input.proposal),
  ]);
  for (const recipient of backofficeRecipients) {
    await enqueueLenderPortalIntent(ctx, {
      brokerageId: input.proposal.brokerageId,
      immutableResourceId: String(input.confirmationCycle._id),
      kind: "lender_portal_approval_outcome",
      organizationId: input.proposal.organizationId,
      payload: {
        assignmentId: String(input.assignment._id),
        audience: "backoffice",
        confirmationCycleId: String(input.confirmationCycle._id),
        eventClass: "approval-outcome",
        linkPath: backofficeProposalLinkPath(input.proposal._id),
        outcome: input.outcome,
        proposalId: String(input.proposal._id),
        proposalRevisionId: String(input.revision._id),
        proposalRevisionNumber: input.revision.revisionNumber,
        recipientWorkosUserId: recipient.workosUserId,
        resourceKind: "proposal",
        title: input.proposal.buildName,
      },
      recipient,
      relatedEntityId: String(input.proposal._id),
      relatedEntityType: "proposal",
      templateKey: "lender_portal_approval_outcome_v1",
    });
  }
  for (const recipient of builderRecipients) {
    await enqueueLenderPortalIntent(ctx, {
      brokerageId: input.proposal.brokerageId,
      immutableResourceId: String(input.confirmationCycle._id),
      kind: "lender_portal_approval_outcome",
      organizationId: input.proposal.organizationId,
      payload: {
        assignmentId: String(input.assignment._id),
        audience: "builder",
        confirmationCycleId: String(input.confirmationCycle._id),
        eventClass: "approval-outcome",
        linkPath: builderProposalLinkPath(input.proposal._id),
        outcome: input.outcome,
        proposalId: String(input.proposal._id),
        proposalRevisionId: String(input.revision._id),
        proposalRevisionNumber: input.revision.revisionNumber,
        recipientWorkosUserId: recipient.workosUserId,
        resourceKind: "proposal",
        title: input.proposal.buildName,
      },
      recipient,
      relatedEntityId: String(input.proposal._id),
      relatedEntityType: "proposal",
      templateKey: "lender_portal_approval_outcome_v1",
    });
  }
}

export async function enqueueReviewApprovalRequiredNotifications(
  ctx: MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    cycle: Doc<"lenderPortalReviewCycles">;
    kind: "draw" | "milestone";
    label: string;
    groups?: Array<"backoffice" | "lender">;
    targetId: Id<"activeBuildDrawRequests"> | Id<"buildMilestones">;
  }
) {
  const proposal = await requireReviewNotificationScope(ctx, input);
  const requestedGroups =
    input.groups ?? input.cycle.requirements.requiredGroups;
  for (const group of requestedGroups) {
    if (!input.cycle.requirements.requiredGroups.includes(group)) {
      throw new Error(
        "Review notification group is not required by the locked policy."
      );
    }
    const recipients =
      group === "backoffice"
        ? await listBackofficeAdminRecipients(ctx, input.build.organizationId)
        : await listCurrentReviewLenderRecipients(ctx, input.build, input.kind);
    for (const recipient of recipients) {
      const audience = group === "backoffice" ? "backoffice" : "lender";
      await enqueueLenderPortalIntent(ctx, {
        brokerageId: input.build.brokerageId,
        buildId: input.build._id,
        immutableResourceId: `${String(input.cycle._id)}:${group}`,
        kind: "lender_portal_approval_required",
        organizationId: input.build.organizationId,
        payload: {
          approvalGroup: group,
          audience,
          buildId: String(input.build._id),
          eventClass: "approval-required",
          lenderOrganizationId: recipient.lenderOrganizationId,
          linkPath: reviewLinkPath({
            audience,
            buildId: input.build._id,
            kind: input.kind,
            proposalId: proposal._id,
            reviewCycleId: input.cycle._id,
            reviewCycleNumber: input.cycle.cycleNumber,
            targetId: input.targetId,
          }),
          proposalId: String(proposal._id),
          recipientWorkosUserId: recipient.workosUserId,
          resourceKind: input.kind,
          reviewCycleId: String(input.cycle._id),
          reviewCycleNumber: input.cycle.cycleNumber,
          targetId: String(input.targetId),
          title: input.label,
        },
        recipient,
        relatedEntityId: String(input.targetId),
        relatedEntityType: input.kind,
        templateKey: "lender_portal_approval_required_v1",
      });
    }
  }
}

export async function enqueueReviewApprovalOutcomeNotifications(
  ctx: MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    cycle: Doc<"lenderPortalReviewCycles">;
    kind: "draw" | "milestone";
    label: string;
    outcome: "approved" | "rejected";
    targetId: Id<"activeBuildDrawRequests"> | Id<"buildMilestones">;
  }
) {
  const proposal = await requireReviewNotificationScope(ctx, input);
  const [backofficeRecipients, builderRecipient] = await Promise.all([
    listBackofficeAdminRecipients(ctx, input.build.organizationId),
    activeWorkosRecipient(
      ctx,
      input.cycle.submittedByWorkosUserId,
      input.build.organizationId
    ),
  ]);
  const audiences = [
    ...backofficeRecipients.map((recipient) => ({
      audience: "backoffice" as const,
      recipient,
    })),
    ...(builderRecipient
      ? [{ audience: "builder" as const, recipient: builderRecipient }]
      : []),
  ];
  for (const { audience, recipient } of audiences) {
    await enqueueLenderPortalIntent(ctx, {
      brokerageId: input.build.brokerageId,
      buildId: input.build._id,
      immutableResourceId: String(input.cycle._id),
      kind: "lender_portal_approval_outcome",
      organizationId: input.build.organizationId,
      payload: {
        audience,
        buildId: String(input.build._id),
        eventClass: "approval-outcome",
        linkPath: reviewLinkPath({
          audience,
          buildId: input.build._id,
          kind: input.kind,
          proposalId: proposal._id,
          reviewCycleId: input.cycle._id,
          reviewCycleNumber: input.cycle.cycleNumber,
          targetId: input.targetId,
        }),
        outcome: input.outcome,
        proposalId: String(proposal._id),
        recipientWorkosUserId: recipient.workosUserId,
        resourceKind: input.kind,
        reviewCycleId: String(input.cycle._id),
        reviewCycleNumber: input.cycle.cycleNumber,
        targetId: String(input.targetId),
        title: input.label,
      },
      recipient,
      relatedEntityId: String(input.targetId),
      relatedEntityType: input.kind,
      templateKey: "lender_portal_approval_outcome_v1",
    });
  }
}

type NotificationRecipient = {
  eligibilityEpoch?: string;
  email: string;
  lenderOrganizationId?: string;
  name: string;
  workosUserId: string;
};

async function enqueueLenderPortalIntent(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    buildId?: Id<"activeBuilds">;
    immutableResourceId: string;
    kind:
      | "lender_portal_approval_required"
      | "lender_portal_proposal_updated_after_decline"
      | "lender_portal_withdrawal"
      | "lender_portal_approval_outcome";
    nextAttemptAt?: number;
    organizationId: string;
    payload: LenderPortalNotificationPayload;
    recipient: NotificationRecipient;
    relatedEntityId: string;
    relatedEntityType: "draw" | "milestone" | "proposal";
    templateKey: string;
  }
) {
  await enqueueCommunicationIntent(ctx, {
    brokerageId: input.brokerageId,
    buildId: input.buildId,
    idempotencyKey: lenderPortalIntentKey({
      eventClass: input.payload.eventClass,
      immutableResourceId: `${input.immutableResourceId}:${input.payload.audience}`,
      recipientWorkosUserId: input.recipient.workosUserId,
      resourceKind: input.payload.resourceKind,
    }),
    kind: input.kind,
    nextAttemptAt: input.nextAttemptAt,
    organizationId: input.organizationId,
    payloadSnapshot: JSON.stringify(input.payload),
    recipientEmailSnapshot: input.recipient.email,
    recipientNameSnapshot: input.recipient.name || undefined,
    relatedEntityId: input.relatedEntityId,
    relatedEntityType: input.relatedEntityType,
    templateKey: input.templateKey,
  });
}

async function listBackofficeAdminRecipients(
  ctx: ReadCtx,
  organizationId: string
) {
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_organization", (query) =>
      query.eq("workosOrganizationId", organizationId)
    )
    .take(1_001);
  if (memberships.length > 1_000) {
    throw new Error("Back Office recipient count exceeds the safe limit.");
  }
  const recipients: NotificationRecipient[] = [];
  const seen = new Set<string>();
  for (const membership of memberships) {
    const roles = [membership.roleSlug, ...membership.roleSlugs]
      .filter((role): role is string => typeof role === "string")
      .map((role) => role.trim().toLowerCase());
    if (
      membership.status !== "active" ||
      !roles.includes("admin") ||
      seen.has(membership.workosUserId)
    ) {
      continue;
    }
    const recipient = await activeWorkosRecipient(
      ctx,
      membership.workosUserId,
      organizationId
    );
    if (recipient) {
      seen.add(recipient.workosUserId);
      recipients.push(recipient);
    }
  }
  return recipients;
}

async function listBuilderOwnerRecipients(
  ctx: ReadCtx,
  proposal: Doc<"buildProposals">
) {
  if (!proposal.builderProfileId) {
    return [];
  }
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder", (query) =>
      query.eq("builderProfileId", proposal.builderProfileId!)
    )
    .take(101);
  if (links.length > 100) {
    throw new Error("Builder owner recipient count exceeds the safe limit.");
  }
  const recipients: NotificationRecipient[] = [];
  for (const link of links) {
    if (link.status !== "active" || link.role !== "owner") {
      continue;
    }
    const recipient = await activeWorkosRecipient(
      ctx,
      link.workosUserId,
      proposal.organizationId
    );
    if (recipient) {
      recipients.push(recipient);
    }
  }
  return recipients;
}

async function activeWorkosRecipient(
  ctx: ReadCtx,
  workosUserId: string,
  organizationId: string
): Promise<NotificationRecipient | null> {
  const [users, memberships] = await Promise.all([
    ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (query) =>
        query.eq("workosUserId", workosUserId)
      )
      .take(2),
    ctx.db
      .query("workosOrganizationMemberships")
      .withIndex("by_user_and_organization", (query) =>
        query
          .eq("workosUserId", workosUserId)
          .eq("workosOrganizationId", organizationId)
      )
      .take(20),
  ]);
  const user = users.length === 1 ? users[0] : undefined;
  if (
    !user ||
    user.status !== "active" ||
    !memberships.some((membership) => membership.status === "active")
  ) {
    return null;
  }
  return {
    email: normalizeLenderEmail(user.email),
    name: user.name.trim(),
    workosUserId,
  };
}

async function listCurrentReviewLenderRecipients(
  ctx: ReadCtx,
  build: Doc<"activeBuilds">,
  kind: "draw" | "milestone"
) {
  const assignments = await ctx.db
    .query("proposalLenderAssignments")
    .withIndex("by_proposal_status", (query) =>
      query.eq("proposalId", build.proposalId).eq("status", "current")
    )
    .take(2);
  const assignment = assignments.find(
    (candidate) =>
      candidate.brokerageId === build.brokerageId &&
      candidate.organizationId === build.organizationId
  );
  if (!assignment) {
    return [];
  }
  const lenderOrganizationId = normalizeId(
    ctx,
    "lenderOrganizations",
    String(assignment.lenderOrganizationId)
  );
  if (!lenderOrganizationId) {
    return [];
  }
  const lenderOrganization = await ctx.db.get(lenderOrganizationId);
  if (
    !lenderOrganization ||
    lenderOrganization.status !== "active" ||
    lenderOrganization.brokerageId !== assignment.lenderBrokerageId
  ) {
    return [];
  }
  const capability =
    kind === "milestone" ? "milestone_decisions" : "draw_decisions";
  return (
    await listActiveApprovalEligibleLenderOrganizationMembers(
      ctx,
      lenderOrganizationId,
      capability
    )
  ).map((recipient) => ({
    ...recipient,
    lenderOrganizationId: String(lenderOrganizationId),
  }));
}

export function lenderPortalIntentKey(input: {
  eventClass: LenderPortalNotificationEventClass;
  immutableResourceId: string;
  recipientWorkosUserId: string;
  resourceKind: LenderPortalNotificationPayload["resourceKind"];
}) {
  return [
    "lp8",
    input.eventClass,
    input.resourceKind,
    input.immutableResourceId,
    input.recipientWorkosUserId,
  ].join(":");
}

/**
 * Returns a safe suppression reason when a committed lender-portal intent is
 * stale at delivery time. A null result means the recipient and exact resource
 * correlation remain current. Non-lender intents are outside this resolver.
 */
export async function lenderPortalCommunicationSuppressionReason(
  ctx: ReadCtx,
  intent: Doc<"communicationIntents">,
  options: { requireRecipientEmailMatch?: boolean } = {}
): Promise<string | null> {
  if (!intent.kind.startsWith("lender_portal_")) {
    return null;
  }
  let payload: LenderPortalNotificationPayload;
  try {
    payload = parseLenderPortalPayload(intent.payloadSnapshot);
  } catch {
    return "Lender portal communication payload is invalid.";
  }
  const resourceReason =
    payload.resourceKind === "proposal"
      ? await proposalCommunicationSuppressionReason(ctx, intent, payload)
      : await reviewCommunicationSuppressionReason(ctx, intent, payload);
  if (resourceReason) {
    return resourceReason;
  }
  const recipientReason = await currentRecipientSuppressionReason(
    ctx,
    intent,
    payload,
    options.requireRecipientEmailMatch ?? true
  );
  if (recipientReason) {
    return recipientReason;
  }
  return recipientReason;
}

async function currentRecipientSuppressionReason(
  ctx: ReadCtx,
  intent: Doc<"communicationIntents">,
  payload: LenderPortalNotificationPayload,
  requireEmailMatch: boolean
) {
  let recipient: NotificationRecipient | null | undefined;
  if (payload.audience === "lender") {
    const lenderOrganizationId = normalizeId(
      ctx,
      "lenderOrganizations",
      payload.lenderOrganizationId
    );
    if (!lenderOrganizationId) {
      return "Lender recipient organization is unavailable.";
    }
    const requiresDecision = payload.eventClass === "approval-required";
    const recipients = requiresDecision
      ? await listActiveApprovalEligibleLenderOrganizationMembers(
          ctx,
          lenderOrganizationId,
          payload.resourceKind === "milestone"
            ? "milestone_decisions"
            : payload.resourceKind === "draw"
              ? "draw_decisions"
              : "proposal_review"
        )
      : await listActiveLenderOrganizationMembers(ctx, lenderOrganizationId);
    recipient = recipients.find(
      (candidate) =>
        candidate.workosUserId === payload.recipientWorkosUserId
    );
  } else if (payload.audience === "backoffice") {
    recipient = (
      await listBackofficeAdminRecipients(ctx, intent.organizationId)
    ).find(
      (candidate) => candidate.workosUserId === payload.recipientWorkosUserId
    );
  } else {
    recipient = await activeWorkosRecipient(
      ctx,
      payload.recipientWorkosUserId,
      intent.organizationId
    );
  }
  if (
    !recipient ||
    (requireEmailMatch &&
      normalizeLenderEmail(recipient.email) !==
        normalizeLenderEmail(intent.recipientEmailSnapshot))
  ) {
    return "Recipient is no longer authorized for this communication.";
  }
  return null;
}

async function proposalCommunicationSuppressionReason(
  ctx: ReadCtx,
  intent: Doc<"communicationIntents">,
  payload: LenderPortalNotificationPayload
) {
  const assignmentId = normalizeId(
    ctx,
    "proposalLenderAssignments",
    payload.assignmentId
  );
  const proposalId = normalizeId(ctx, "buildProposals", payload.proposalId);
  const revisionId = normalizeId(
    ctx,
    "proposalRevisions",
    payload.proposalRevisionId
  );
  const confirmationCycleId = normalizeId(
    ctx,
    "proposalLenderConfirmationCycles",
    payload.confirmationCycleId
  );
  if (!assignmentId || !proposalId) {
    return "Proposal communication correlation is unavailable.";
  }
  const [assignment, proposal, revision, cycle] = await Promise.all([
    ctx.db.get(assignmentId),
    ctx.db.get(proposalId),
    revisionId ? ctx.db.get(revisionId) : null,
    confirmationCycleId ? ctx.db.get(confirmationCycleId) : null,
  ]);
  if (
    !assignment ||
    !proposal ||
    assignment.proposalId !== proposal._id ||
    assignment.brokerageId !== proposal.brokerageId ||
    assignment.organizationId !== proposal.organizationId ||
    intent.brokerageId !== proposal.brokerageId ||
    intent.organizationId !== proposal.organizationId ||
    intent.buildId !== undefined ||
    intent.relatedEntityType !== "proposal" ||
    intent.relatedEntityId !== String(proposal._id) ||
    (revision &&
      (revision.proposalId !== proposal._id ||
        revision.assignmentId !== assignment._id ||
        revision.brokerageId !== proposal.brokerageId ||
        revision.organizationId !== proposal.organizationId ||
        revision.revisionNumber !== payload.proposalRevisionNumber)) ||
    (cycle &&
      (cycle.assignmentId !== assignment._id ||
        cycle.brokerageId !== proposal.brokerageId ||
        cycle.organizationId !== proposal.organizationId ||
        (revision && cycle.proposalRevisionId !== revision._id)))
  ) {
    return "Proposal communication scope is unavailable.";
  }
  const lenderOrganizationId = normalizeId(
    ctx,
    "lenderOrganizations",
    String(assignment.lenderOrganizationId)
  );
  const payloadLenderOrganizationId = normalizeId(
    ctx,
    "lenderOrganizations",
    payload.lenderOrganizationId
  );
  const lenderOrganization = lenderOrganizationId
    ? await ctx.db.get(lenderOrganizationId)
    : null;
  if (
    !lenderOrganizationId ||
    !lenderOrganization ||
    lenderOrganization.status !== "active" ||
    lenderOrganization.brokerageId !== assignment.lenderBrokerageId ||
    (payload.audience === "lender" &&
      payloadLenderOrganizationId !== lenderOrganizationId)
  ) {
    return "Proposal lender organization scope is unavailable.";
  }
  if (payload.audience === "builder") {
    const builderRecipients = await listBuilderOwnerRecipients(ctx, proposal);
    if (
      !builderRecipients.some(
        (recipient) => recipient.workosUserId === payload.recipientWorkosUserId
      )
    ) {
      return "Builder proposal ownership is no longer current.";
    }
  }
  if (payload.eventClass === "withdrawal") {
    return assignment.status === "current"
      ? "The lender assignment has not been withdrawn."
      : null;
  }
  if (!revision || !cycle) {
    return "Proposal revision or confirmation cycle is unavailable.";
  }
  if (
    assignment.status !== "current" ||
    proposal.currentProposalRevisionId !== revision._id
  ) {
    return "The proposal notification is stale.";
  }
  if (
    payload.eventClass === "approval-required" ||
    payload.eventClass === "proposal-updated-after-decline"
  ) {
    return cycle.status === "pending"
      ? null
      : "The proposal confirmation action is no longer outstanding.";
  }
  const expectedStatus =
    payload.outcome === "approved" ? "approved" : "declined";
  return cycle.status === expectedStatus
    ? null
    : "The proposal approval outcome is no longer current.";
}

async function reviewCommunicationSuppressionReason(
  ctx: ReadCtx,
  intent: Doc<"communicationIntents">,
  payload: LenderPortalNotificationPayload
) {
  const buildId = normalizeId(ctx, "activeBuilds", payload.buildId);
  const cycleId = normalizeId(
    ctx,
    "lenderPortalReviewCycles",
    payload.reviewCycleId
  );
  const targetId =
    payload.resourceKind === "milestone"
      ? normalizeId(ctx, "buildMilestones", payload.targetId)
      : normalizeId(ctx, "activeBuildDrawRequests", payload.targetId);
  if (!buildId || !cycleId || !targetId) {
    return "Review communication correlation is unavailable.";
  }
  const [build, cycle, target, decisions] = await Promise.all([
    ctx.db.get(buildId),
    ctx.db.get(cycleId),
    ctx.db.get(targetId),
    ctx.db
      .query("lenderPortalReviewDecisions")
      .withIndex("by_cycle", (query) => query.eq("cycleId", cycleId))
      .take(1_001),
  ]);
  if (decisions.length > 1_000) {
    return "Review decision history exceeds the safe boundary.";
  }
  if (
    !build ||
    !cycle ||
    !target ||
    intent.buildId !== build._id ||
    intent.brokerageId !== build.brokerageId ||
    intent.organizationId !== build.organizationId ||
    intent.relatedEntityType !== payload.resourceKind ||
    intent.relatedEntityId !== String(target._id) ||
    cycle.buildId !== build._id ||
    cycle.brokerageId !== build.brokerageId ||
    cycle.organizationId !== build.organizationId ||
    cycle.cycleNumber !== payload.reviewCycleNumber ||
    target.buildId !== build._id ||
    target.currentLenderPortalReviewCycleId !== cycle._id
  ) {
    return "The review cycle is no longer current.";
  }
  const proposalId = normalizeId(ctx, "buildProposals", payload.proposalId);
  const proposal = proposalId ? await ctx.db.get(proposalId) : null;
  if (
    !proposal ||
    build.proposalId !== proposal._id ||
    proposal.brokerageId !== build.brokerageId ||
    proposal.organizationId !== build.organizationId
  ) {
    return "Review proposal scope is unavailable.";
  }
  if (payload.audience === "lender") {
    const assignments = await ctx.db
      .query("proposalLenderAssignments")
      .withIndex("by_proposal_status", (query) =>
        query.eq("proposalId", proposal._id).eq("status", "current")
      )
      .take(2);
    const assignment = assignments.length === 1 ? assignments[0] : null;
    const lenderOrganizationId = assignment
      ? normalizeId(
          ctx,
          "lenderOrganizations",
          String(assignment.lenderOrganizationId)
        )
      : null;
    const payloadLenderOrganizationId = normalizeId(
      ctx,
      "lenderOrganizations",
      payload.lenderOrganizationId
    );
    const lenderOrganization = lenderOrganizationId
      ? await ctx.db.get(lenderOrganizationId)
      : null;
    if (
      !assignment ||
      assignment.brokerageId !== build.brokerageId ||
      assignment.organizationId !== build.organizationId ||
      !lenderOrganizationId ||
      payloadLenderOrganizationId !== lenderOrganizationId ||
      !lenderOrganization ||
      lenderOrganization.status !== "active" ||
      lenderOrganization.brokerageId !== assignment.lenderBrokerageId
    ) {
      return "Review lender organization scope is unavailable.";
    }
  }
  if (payload.audience === "builder") {
    if (cycle.submittedByWorkosUserId !== payload.recipientWorkosUserId) {
      return "The review request submitter is no longer the intended recipient.";
    }
    const proposal = await ctx.db.get(build.proposalId);
    if (!proposal?.builderProfileId) {
      return "Builder review access is unavailable.";
    }
    const link = await ctx.db
      .query("builderAccountLinks")
      .withIndex("by_builder_user", (query) =>
        query
          .eq("builderProfileId", proposal.builderProfileId!)
          .eq("workosUserId", payload.recipientWorkosUserId)
      )
      .unique();
    if (!link || link.status !== "active") {
      return "Builder review access is no longer current.";
    }
  }
  if (payload.eventClass === "approval-required") {
    if (
      !payload.approvalGroup ||
      !cycle.requirements.requiredGroups.includes(payload.approvalGroup) ||
      (cycle.state !== "in_review" && cycle.state !== "partial_approval")
    ) {
      return "The review approval action is no longer outstanding.";
    }
    if (
      payload.approvalGroup === "backoffice" &&
      cycle.approvedGroups.includes("backoffice")
    ) {
      return "The Back Office review group is already satisfied.";
    }
    if (
      payload.approvalGroup === "lender" &&
      cycle.lenderApprovalCount >= (cycle.requirements.lenderQuorum ?? 1)
    ) {
      return "The lender review group is already satisfied.";
    }
    return decisions.some(
      (decision) =>
        decision.group === payload.approvalGroup &&
        decision.actorWorkosUserId === payload.recipientWorkosUserId
    )
      ? "The recipient already supplied a decision for this review cycle."
      : null;
  }
  const expectedState =
    payload.outcome === "approved" ? "completed" : "correction_required";
  return cycle.state === expectedState
    ? null
    : "The review approval outcome is no longer current.";
}

function lenderProposalLinkPath(input: {
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

function backofficeProposalLinkPath(proposalId: Id<"buildProposals">) {
  return `/backoffice/proposals/${String(proposalId)}`;
}

function builderProposalLinkPath(proposalId: Id<"buildProposals">) {
  return `/builder/proposals/${String(proposalId)}/?tab=closing`;
}

function reviewLinkPath(input: {
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

function parseLenderPortalPayload(value: string) {
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

function notificationLinkUnavailable() {
  return new Error(
    "This notification link is no longer available for the current account."
  );
}

function isExpectedNotificationLinkPath(
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

async function resolveViewerWorkosUserId(ctx: ReadCtx, viewerSubject: string) {
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

function normalizeId<TableName extends TableNames>(
  ctx: ReadCtx,
  tableName: TableName,
  value: string | undefined
): Id<TableName> | null {
  return value ? ctx.db.normalizeId(tableName, value) : null;
}

async function requireCurrentLenderOrganizationId(
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

async function requireReviewNotificationScope(
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
