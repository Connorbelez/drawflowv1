import type { Doc, Id } from "../_generated/dataModel";
import { enqueueCommunicationIntent } from "../email_transport";
import {
  listActiveApprovalEligibleLenderOrganizationMembers,
  listActiveLenderOrganizationMembers,
  normalizeLenderEmail,
} from "../lenderOrganizationAccess";
import type { MutationCtx } from "../types";
import {
  backofficeProposalLinkPath,
  builderProposalLinkPath,
  lenderProposalLinkPath,
  normalizeId,
  requireCurrentLenderOrganizationId,
  requireReviewNotificationScope,
  reviewLinkPath,
} from "./shared";
import type {
  LenderPortalNotificationEventClass,
  LenderPortalNotificationPayload,
  NotificationRecipient,
  ReadCtx,
} from "./shared";

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

export async function listBackofficeAdminRecipients(
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

export async function listBuilderOwnerRecipients(
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

export async function activeWorkosRecipient(
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

export async function listCurrentReviewLenderRecipients(
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
