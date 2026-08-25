/**
 * Production proposals operations handoffs bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { ConvexError, v } from "convex/values";
import { authenticatedMutation, authenticatedQuery } from "../authz";
import { authorizeBrokerage } from "./authorization_core.js";
import { requireAnyRole } from "./contractor_policy_helpers.js";
import { APPROVER_ROLES } from "./contracts_foundation.js";
import { recipientDeliveryProjectionValidator, operationsHandoffReturnDecisionValidator, operationsHandoffProjectionValidator, integrationEndpointProjectionValidator, integrationDeliveryProjectionValidator } from "./contracts_workflow.js";
import { integrationEndpointProjection, integrationDeliveryProjection, authorizeIntegrationAdmin, getRecipientDeliveryOrThrow } from "./integration_helpers.js";
import { operationsHandoffProjection, authorizeOperationsQueueMutation, getOperationsHandoffOrThrow, resolveOperationsQueueTarget, requireOperationsHandoffText, normalizeOperationsHandoffWarnings, operationsHandoffAuditState, writeOperationsHandoffEvent } from "./operations_helpers.js";

export const escalateOperationsQueueItem = authenticatedMutation
  .input({
    decisionPreview: v.string(),
    evidenceSummary: v.string(),
    queueItemId: v.string(),
    reason: v.string(),
    recommendation: v.string(),
    requiredAction: v.string(),
    warnings: v.array(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(operationsHandoffProjectionValidator)
  .handler(async (ctx, args) => {
    const auth = await authorizeOperationsQueueMutation(
      ctx,
      args.workosOrganizationId,
    );
    const target = await resolveOperationsQueueTarget(ctx, {
      auth,
      queueItemId: args.queueItemId,
      workosOrganizationId: args.workosOrganizationId,
    });
    const activeHandoff = await ctx.db
      .query("operationsQueueHandoffs")
      .withIndex("by_brokerage_queue_item", (q) =>
        q
          .eq("brokerageId", auth.brokerage._id)
          .eq("queueItemId", args.queueItemId),
      )
      .order("desc")
      .first();
    if (
      activeHandoff &&
      activeHandoff.acknowledgementState !== "acknowledged"
    ) {
      throw new ConvexError(
        "This queue item already has an active escalation.",
      );
    }

    const now = Date.now();
    const escalationReason = requireOperationsHandoffText(
      args.reason,
      "Escalation reason",
    );
    const handoffId = await ctx.db.insert("operationsQueueHandoffs", {
      acknowledgementState: "pending_decision",
      brokerageId: auth.brokerage._id,
      createdAt: now,
      decisionPreview: requireOperationsHandoffText(
        args.decisionPreview,
        "Decision preview",
      ),
      escalatedByWorkosUserId: auth.subject,
      escalationReason,
      evidenceSummary: requireOperationsHandoffText(
        args.evidenceSummary,
        "Evidence summary",
      ),
      organizationId: args.workosOrganizationId,
      queueItemId: args.queueItemId,
      recommendation: requireOperationsHandoffText(
        args.recommendation,
        "Recommendation",
      ),
      requiredAction: requireOperationsHandoffText(
        args.requiredAction,
        "Required action",
      ),
      targetHref: target.href,
      targetLabel: target.label,
      targetRecordId: target.recordId,
      targetType: target.type,
      updatedAt: now,
      warnings: normalizeOperationsHandoffWarnings(args.warnings),
    });
    const handoff = await ctx.db.get(handoffId);
    if (!handoff) {
      throw new ConvexError("Operations escalation could not be created.");
    }
    await writeOperationsHandoffEvent(ctx, {
      auth,
      command: "escalateOperationsQueueItem",
      eventType: "operations.escalation.created",
      handoff,
      newState: operationsHandoffAuditState(handoff),
      organizationId: args.workosOrganizationId,
      reason: escalationReason,
    });
    return operationsHandoffProjection(handoff);
  })
  .public();

export const returnOperationsEscalationDecision = authenticatedMutation
  .input({
    decision: operationsHandoffReturnDecisionValidator,
    followUpAssignment: v.string(),
    handoffId: v.id("operationsQueueHandoffs"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(operationsHandoffProjectionValidator)
  .handler(async (ctx, args) => {
    const { auth, handoff } = await getOperationsHandoffOrThrow(
      ctx,
      args.handoffId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, APPROVER_ROLES);
    if (handoff.acknowledgementState !== "pending_decision") {
      throw new ConvexError("This escalation is not awaiting a decision.");
    }
    const now = Date.now();
    const priorState = operationsHandoffAuditState(handoff);
    const returnReason = requireOperationsHandoffText(
      args.reason,
      "Return reason",
    );
    await ctx.db.patch(handoff._id, {
      acknowledgementState: "returned",
      followUpAssignment: requireOperationsHandoffText(
        args.followUpAssignment,
        "Follow-up assignment",
      ),
      returnDecision: args.decision,
      returnedAt: now,
      returnedByWorkosUserId: auth.subject,
      returnReason,
      updatedAt: now,
    });
    const updated = await ctx.db.get(handoff._id);
    if (!updated) {
      throw new ConvexError("Operations escalation unavailable.");
    }
    await writeOperationsHandoffEvent(ctx, {
      auth,
      command: "returnOperationsEscalationDecision",
      eventType: "operations.escalation.returned",
      handoff: updated,
      newState: operationsHandoffAuditState(updated),
      organizationId: args.workosOrganizationId,
      priorState,
      reason: returnReason,
    });
    return operationsHandoffProjection(updated);
  })
  .public();

export const acknowledgeOperationsEscalationReturn = authenticatedMutation
  .input({
    handoffId: v.id("operationsQueueHandoffs"),
    workosOrganizationId: v.string(),
  })
  .returns(operationsHandoffProjectionValidator)
  .handler(async (ctx, args) => {
    const { auth, handoff } = await getOperationsHandoffOrThrow(
      ctx,
      args.handoffId,
      args.workosOrganizationId,
    );
    if (auth.subject !== handoff.escalatedByWorkosUserId) {
      throw new ConvexError(
        "Only the escalating operator can acknowledge this return.",
      );
    }
    if (handoff.acknowledgementState !== "returned") {
      throw new ConvexError(
        "This escalation has no returned decision to acknowledge.",
      );
    }
    const now = Date.now();
    const priorState = operationsHandoffAuditState(handoff);
    await ctx.db.patch(handoff._id, {
      acknowledgedAt: now,
      acknowledgedByWorkosUserId: auth.subject,
      acknowledgementState: "acknowledged",
      updatedAt: now,
    });
    const updated = await ctx.db.get(handoff._id);
    if (!updated) {
      throw new ConvexError("Operations escalation unavailable.");
    }
    await writeOperationsHandoffEvent(ctx, {
      auth,
      command: "acknowledgeOperationsEscalationReturn",
      eventType: "operations.escalation.acknowledged",
      handoff: updated,
      newState: operationsHandoffAuditState(updated),
      organizationId: args.workosOrganizationId,
      priorState,
      reason: "Returned operations decision acknowledged.",
    });
    return operationsHandoffProjection(updated);
  })
  .public();

export const listRecipientInbox = authenticatedQuery
  .input({
    includeResolved: v.optional(v.boolean()),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      actionRequiredCount: v.number(),
      deliveries: v.array(recipientDeliveryProjectionValidator),
      unreadCount: v.number(),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    const records = await ctx.db
      .query("recipientDeliveries")
      .withIndex("by_recipient", (q) =>
        q
          .eq("organizationId", args.workosOrganizationId)
          .eq("recipientWorkosUserId", auth.subject),
      )
      .order("desc")
      .take(100);
    const visibleRecords = args.includeResolved
      ? records
      : records.filter(
          (record) =>
            record.status !== "dismissed" && record.status !== "resolved",
        );

    return {
      actionRequiredCount: visibleRecords.filter(
        (record) =>
          record.actionRequired &&
          record.status !== "dismissed" &&
          record.status !== "resolved",
      ).length,
      deliveries: visibleRecords.map((record) => ({
        _id: record._id,
        actionLabel: record.actionLabel,
        actionRequired: record.actionRequired,
        body: record.body,
        createdAt: record.createdAt,
        entityId: record.entityId,
        entityLabel: record.entityLabel,
        entityType: record.entityType,
        href: record.href,
        resolutionMode: record.resolutionMode,
        sourceLabel: record.sourceLabel,
        status: record.status,
        title: record.title,
        updatedAt: record.updatedAt,
      })),
      unreadCount: visibleRecords.filter((record) => record.status === "unread")
        .length,
    };
  })
  .public();

export const markRecipientDeliveryRead = authenticatedMutation
  .input({
    deliveryId: v.id("recipientDeliveries"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const delivery = await getRecipientDeliveryOrThrow(
      ctx,
      args.deliveryId,
      args.workosOrganizationId,
    );
    if (delivery.status === "unread") {
      await ctx.db.patch(delivery._id, {
        status: "read",
        updatedAt: Date.now(),
      });
    }
    return null;
  })
  .public();

export const dismissRecipientDelivery = authenticatedMutation
  .input({
    deliveryId: v.id("recipientDeliveries"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const delivery = await getRecipientDeliveryOrThrow(
      ctx,
      args.deliveryId,
      args.workosOrganizationId,
    );
    if (delivery.status !== "dismissed" && delivery.status !== "resolved") {
      await ctx.db.patch(delivery._id, {
        status: "dismissed",
        updatedAt: Date.now(),
      });
    }
    return null;
  })
  .public();

export const resolveRecipientDelivery = authenticatedMutation
  .input({
    deliveryId: v.id("recipientDeliveries"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const delivery = await getRecipientDeliveryOrThrow(
      ctx,
      args.deliveryId,
      args.workosOrganizationId,
    );
    if (delivery.resolutionMode !== "recipient") {
      throw new ConvexError("Resolve this delivery from its related workflow.");
    }
    if (delivery.status !== "resolved") {
      await ctx.db.patch(delivery._id, {
        status: "resolved",
        updatedAt: Date.now(),
      });
    }
    return null;
  })
  .public();

export const getIntegrationOperations = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(
    v.object({
      attempts: v.array(integrationDeliveryProjectionValidator),
      endpoints: v.array(integrationEndpointProjectionValidator),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeIntegrationAdmin(
      ctx,
      args.workosOrganizationId,
    );
    const [endpoints, attempts] = await Promise.all([
      ctx.db
        .query("integrationEndpoints")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.workosOrganizationId),
        )
        .order("desc")
        .take(100),
      ctx.db
        .query("integrationDeliveryAttempts")
        .withIndex("by_organization_attempted", (q) =>
          q.eq("organizationId", args.workosOrganizationId),
        )
        .order("desc")
        .take(200),
    ]);
    const visibleEndpoints = endpoints.filter(
      (endpoint) => endpoint.brokerageId === auth.brokerage._id,
    );
    const endpointById = new Map(
      visibleEndpoints.map((endpoint) => [String(endpoint._id), endpoint]),
    );

    return {
      attempts: attempts.flatMap((attempt) => {
        const endpoint = endpointById.get(String(attempt.endpointId));
        return endpoint && attempt.brokerageId === auth.brokerage._id
          ? [integrationDeliveryProjection(attempt, endpoint)]
          : [];
      }),
      endpoints: visibleEndpoints.map(integrationEndpointProjection),
    };
  })
  .public();
