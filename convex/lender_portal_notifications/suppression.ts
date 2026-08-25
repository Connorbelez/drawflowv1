import type { Doc } from "../_generated/dataModel";
import {
  listActiveApprovalEligibleLenderOrganizationMembers,
  listActiveLenderOrganizationMembers,
  normalizeLenderEmail,
} from "../lenderOrganizationAccess";
import {
  activeWorkosRecipient,
  listBackofficeAdminRecipients,
  listBuilderOwnerRecipients,
} from "./enqueue";
import {
  normalizeId,
  parseLenderPortalPayload,
} from "./shared";
import type {
  LenderPortalNotificationPayload,
  NotificationRecipient,
  ReadCtx,
} from "./shared";

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
