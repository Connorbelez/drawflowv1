/**
 * Production proposals active build draws bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { ConvexError, v } from "convex/values";
import { authenticatedMutation } from "../authz";
import { publishDrawCollaborationEvent } from "../build_collaboration_workflow_events";
import { synchronizeDrawSystemPostForCanonicalDraw } from "../build_collaboration_system_posts";
import { recordCanonicalBackofficeReviewDecision, requireCanonicalReviewCycleCompleted, submitCanonicalReviewCycle } from "../lender_portal_phase5";
import { type Doc, type Id } from "../types";
import { activeBuildDrawFundingSnapshot, allocateActiveBuildDrawSources, activeBuildDrawAllocationViews } from "./active_funding.js";
import { authorizeActiveBuildOrThrow, requireBackofficeActiveBuildWrite, requireApproverActiveBuildWrite } from "./authorization_core.js";
import { requireActiveBuildAppPermission } from "./builder_staff_access.js";
import { upsertBuilderDrawDecisionDeliveries } from "./notification_delivery_helpers.js";
import { writeActiveBuildEvent, getActiveBuildDrawRequestOrThrow, calculateActiveBuildAvailableNowCents, activeBuildDrawWorkOrderKey } from "./proposal_copy_audit.js";
import { collectByIndex } from "./storage_helpers.js";

function invalidActiveBuildDrawRequestError(input: {
  availableCents?: number;
  requestedCents?: number;
  safeMessage: string;
  reason:
    | "different_amount_for_operation"
    | "exceeds_available_limit"
    | "invalid_amount"
    | "invalid_draw_key"
    | "invalid_note"
    | "invalid_operation_id";
}) {
  return new ConvexError({
    code: "ACTIVE_BUILD_DRAW_REQUEST_INVALID",
    ...(input.availableCents === undefined
      ? {}
      : { availableCents: input.availableCents }),
    ...(input.requestedCents === undefined
      ? {}
      : { requestedCents: input.requestedCents }),
    reason: input.reason,
    recoverable: true,
    safeMessage: input.safeMessage,
  });
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function buildLegacyActiveBuildDrawOperationId(input: {
  amountCents: number;
  buildId: Id<"activeBuilds">;
  drawKey: string;
  requestedByWorkosUserId: string;
}) {
  return `legacy:${await sha256Hex(
    [
      String(input.buildId),
      input.requestedByWorkosUserId,
      input.drawKey,
      String(input.amountCents),
    ].join("|"),
  )}`;
}

function terminalActiveBuildDrawOperationConflictError(
  request: Doc<"activeBuildDrawRequests">,
) {
  return new ConvexError({
    code: "ACTIVE_BUILD_DRAW_REQUEST_TERMINAL_OPERATION_CONFLICT",
    currentStatus: request.status,
    recoverable: true,
    request: {
      amountCents: request.amountCents,
      displayId: request.displayId,
      requestKey: request.requestKey,
      requestedAt: request.requestedAt,
      ...(request.withdrawnAt === undefined
        ? {}
        : { withdrawnAt: request.withdrawnAt }),
      ...(request.reviewedAt === undefined
        ? {}
        : { reviewedAt: request.reviewedAt }),
      ...(request.releasedAt === undefined
        ? {}
        : { releasedAt: request.releasedAt }),
    },
    safeMessage: `This draw request already ended as ${request.status}. Refresh the build funding view before retrying.`,
  });
}

export const requestActiveBuildDraw = authenticatedMutation
  .input({
    amountCents: v.number(),
    buildId: v.id("activeBuilds"),
    clientOperationId: v.optional(v.string()),
    drawKey: v.string(),
    note: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      amountCents: v.number(),
      availableAfterCents: v.number(),
      displayId: v.string(),
      requestKey: v.string(),
      requestedAt: v.string(),
      sourceAllocations: v.array(
        v.object({
          amountCents: v.number(),
          drawGroupKey: v.string(),
          milestoneKey: v.string(),
          milestoneName: v.string(),
          sourceOrder: v.number(),
        }),
      ),
      status: v.literal("requested"),
      workOrderKey: v.string(),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    await requireActiveBuildAppPermission(ctx, auth, "draw", "update");
    if (!Number.isSafeInteger(args.amountCents) || args.amountCents <= 0) {
      throw invalidActiveBuildDrawRequestError({
        reason: "invalid_amount",
        safeMessage:
          "Draw request amount must be a positive whole number of cents.",
      });
    }
    const amountCents = args.amountCents;
    const drawKey = args.drawKey.trim();
    if (!drawKey || drawKey.length > 256) {
      throw invalidActiveBuildDrawRequestError({
        reason: "invalid_draw_key",
        safeMessage: "Draw request planning reference is invalid.",
      });
    }
    const note = args.note?.trim() || undefined;
    if (note && note.length > 500) {
      throw invalidActiveBuildDrawRequestError({
        reason: "invalid_note",
        safeMessage: "Draw request note must be 500 characters or fewer.",
      });
    }
    const clientOperationId =
      args.clientOperationId?.trim() ||
      (await buildLegacyActiveBuildDrawOperationId({
        amountCents,
        buildId: args.buildId,
        drawKey,
        requestedByWorkosUserId: auth.subject,
      }));
    if (clientOperationId.length > 128) {
      throw invalidActiveBuildDrawRequestError({
        reason: "invalid_operation_id",
        safeMessage: "Draw request operation ID is invalid.",
      });
    }
    const existing = await ctx.db
      .query("activeBuildDrawRequests")
      .withIndex("by_build_operation", (q) =>
        q
          .eq("buildId", args.buildId)
          .eq("clientOperationId", clientOperationId),
      )
      .unique();
    if (existing) {
      if (existing.amountCents !== amountCents) {
        throw invalidActiveBuildDrawRequestError({
          reason: "different_amount_for_operation",
          requestedCents: amountCents,
          safeMessage:
            "This operation ID was already used for a different draw amount.",
        });
      }
      if (existing.status !== "requested") {
        throw terminalActiveBuildDrawOperationConflictError(existing);
      }
      const currentCycleNumber =
        existing.currentLenderPortalReviewCycleNumber ?? 0;
      const resubmitting =
        existing.lenderPortalReviewState === "correction_required";
      const submittedCycleNumber = resubmitting
        ? currentCycleNumber + 1
        : Math.max(1, currentCycleNumber);
      await submitCanonicalReviewCycle(ctx, {
        actorWorkosUserId: auth.subject,
        expectedCycleNumber: resubmitting
          ? currentCycleNumber
          : currentCycleNumber > 0
            ? currentCycleNumber - 1
            : 0,
        idempotencyKey: `${clientOperationId}:lender-portal-cycle:${submittedCycleNumber}`,
        target: { drawRequestId: existing._id, kind: "draw" },
      });
      await synchronizeDrawSystemPostForCanonicalDraw(ctx, {
        actor: { roles: auth.roles, workosUserId: auth.subject },
        activationReason: "draw_request",
        build: auth.build,
        drawRequest: existing,
      });
      const funding = await activeBuildDrawFundingSnapshot(ctx, args.buildId);
      const sourceAllocations = await activeBuildDrawAllocationViews(
        ctx,
        existing._id,
      );
      return {
        amountCents: existing.amountCents,
        availableAfterCents: funding.availableCents,
        displayId: existing.displayId,
        requestKey: existing.requestKey,
        requestedAt: existing.requestedAt,
        sourceAllocations,
        status: "requested" as const,
        workOrderKey: activeBuildDrawWorkOrderKey(existing),
      };
    }
    const funding = await activeBuildDrawFundingSnapshot(ctx, args.buildId);
    if (amountCents > funding.availableCents) {
      throw invalidActiveBuildDrawRequestError({
        availableCents: funding.availableCents,
        reason: "exceeds_available_limit",
        requestedCents: amountCents,
        safeMessage: `Requested draw exceeds the available draw limit of ${funding.availableCents} cents.`,
      });
    }
    const plannedDraw = await ctx.db
      .query("plannedDrawScheduleRows")
      .withIndex("by_build_order", (q) => q.eq("buildId", args.buildId))
      .collect()
      .then((rows) => rows.find((row) => row.drawKey === drawKey));
    const requests = await collectByIndex(
      ctx,
      "activeBuildDrawRequests",
      "by_build",
      args.buildId,
    );
    const sequence = requests.length + 1;
    const now = Date.now();
    const requestedAt = new Date(now).toISOString();
    const displayId = `DR-${String(sequence).padStart(4, "0")}`;
    const requestKey = `${displayId.toLowerCase()}-${String(now)}`;
    const workOrderKey = `DRWO-${String(sequence).padStart(4, "0")}`;
    const sourceAllocations = allocateActiveBuildDrawSources(
      funding.sources,
      amountCents,
    );
    const request = {
      amountCents,
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      clientOperationId,
      collaborationEventRevision: 1,
      createdAt: now,
      displayId,
      label: plannedDraw?.label ?? "Builder reimbursement request",
      note,
      organizationId: args.workosOrganizationId,
      plannedDrawKey: plannedDraw?.drawKey,
      requestedAt,
      requestedByWorkosUserId: auth.subject,
      requestKey,
      status: "requested" as const,
      updatedAt: now,
      workOrderKey,
    };
    const drawRequestId = await ctx.db.insert(
      "activeBuildDrawRequests",
      request,
    );
    for (const allocation of sourceAllocations) {
      await ctx.db.insert("activeBuildDrawRequestAllocations", {
        amountCents: allocation.amountCents,
        brokerageId: auth.brokerage._id,
        buildId: args.buildId,
        buildMilestoneId: allocation.buildMilestoneId,
        createdAt: now,
        drawGroupKey: allocation.drawGroupKey,
        drawRequestId,
        milestoneKey: allocation.milestoneKey,
        organizationId: args.workosOrganizationId,
        sourceOrder: allocation.sourceOrder,
      });
    }
    await submitCanonicalReviewCycle(ctx, {
      actorWorkosUserId: auth.subject,
      expectedCycleNumber: 0,
      idempotencyKey: `${clientOperationId}:lender-portal-cycle:1`,
      target: { drawRequestId, kind: "draw" },
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "requestActiveBuildDraw",
      eventType: "active_build.draw.requested",
      newState: JSON.stringify({
        ...request,
        sourceAllocations: sourceAllocations.map(
          ({ buildMilestoneId: _, ...allocation }) => allocation,
        ),
      }),
      reason: note,
    });
    const persistedDrawRequest = await ctx.db.get(drawRequestId);
    if (!persistedDrawRequest) {
      throw new Error("The submitted Draw request could not be reloaded.");
    }
    await publishDrawCollaborationEvent(ctx, {
      actor: { roles: auth.roles, workosUserId: auth.subject },
      draw: persistedDrawRequest,
      note,
      revision: 1,
      transition: "submitted",
    });
    return {
      amountCents,
      availableAfterCents: funding.availableCents - amountCents,
      displayId,
      requestKey,
      requestedAt,
      sourceAllocations: sourceAllocations.map(
        ({ buildMilestoneId: _, ...allocation }) => allocation,
      ),
      status: "requested" as const,
      workOrderKey,
    };
  })
  .public();

export const withdrawActiveBuildDraw = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    drawKey: v.string(),
    note: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      availableAfterCents: v.number(),
      requestKey: v.string(),
      status: v.literal("withdrawn"),
      withdrawnAt: v.string(),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    await requireActiveBuildAppPermission(ctx, auth, "draw", "update");
    const note = args.note?.trim() || undefined;
    if (note && note.length > 500) {
      throw new Error("Draw withdrawal note must be 500 characters or fewer.");
    }
    const request = await getActiveBuildDrawRequestOrThrow(
      ctx,
      args.buildId,
      args.drawKey,
    );
    if (request.status !== "requested") {
      throw new Error(
        "Only a submitted draw awaiting approval can be withdrawn.",
      );
    }
    const withdrawnAt = new Date().toISOString();
    const patch = {
      status: "withdrawn" as const,
      updatedAt: Date.now(),
      withdrawalNote: note,
      withdrawnAt,
      withdrawnByWorkosUserId: auth.subject,
    };
    await ctx.db.patch(request._id, patch);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "withdrawActiveBuildDraw",
      eventType: "active_build.draw.withdrawn",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(request),
      reason: note,
    });
    await synchronizeDrawSystemPostForCanonicalDraw(ctx, {
      actor: { roles: auth.roles, workosUserId: auth.subject },
      activationReason: "draw_request",
      build: auth.build,
      drawRequest: { ...request, ...patch },
      reason: note,
    });
    return {
      availableAfterCents: await calculateActiveBuildAvailableNowCents(
        ctx,
        args.buildId,
      ),
      requestKey: request.requestKey,
      status: "withdrawn" as const,
      withdrawnAt,
    };
  })
  .public();

export const cancelActiveBuildDraw = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    drawKey: v.string(),
    note: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      cancelledAt: v.string(),
      requestKey: v.string(),
      status: v.literal("cancelled"),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireApproverActiveBuildWrite(auth);
    const note = args.note.trim();
    if (note.length < 3 || note.length > 500) {
      throw new Error(
        "Draw cancellation reason must be between 3 and 500 characters.",
      );
    }
    const request = await getActiveBuildDrawRequestOrThrow(
      ctx,
      args.buildId,
      args.drawKey,
    );
    if (
      request.status === "released" ||
      request.status === "withdrawn" ||
      request.status === "rejected" ||
      request.status === "cancelled"
    ) {
      throw new Error("Only an open Draw request can be cancelled.");
    }
    const cancelledAt = new Date().toISOString();
    const patch = {
      cancellationNote: note,
      cancelledAt,
      cancelledByWorkosUserId: auth.subject,
      status: "cancelled" as const,
      updatedAt: Date.now(),
    };
    await ctx.db.patch(request._id, patch);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "cancelActiveBuildDraw",
      eventType: "active_build.draw.cancelled",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(request),
      reason: note,
    });
    await synchronizeDrawSystemPostForCanonicalDraw(ctx, {
      actor: { roles: auth.roles, workosUserId: auth.subject },
      activationReason: "draw_request",
      build: auth.build,
      drawRequest: { ...request, ...patch },
      reason: note,
    });
    await upsertBuilderDrawDecisionDeliveries(ctx, {
      auth,
      draw: { ...request, ...patch },
      note,
      status: "cancelled",
    });
    return {
      cancelledAt,
      requestKey: request.requestKey,
      status: "cancelled" as const,
    };
  })
  .public();

export const startActiveBuildDrawReview = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    drawKey: v.string(),
    note: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const draw = await getActiveBuildDrawRequestOrThrow(
      ctx,
      args.buildId,
      args.drawKey,
    );
    if (draw.status !== "requested") {
      throw new Error("Only submitted draw requests can enter review.");
    }
    const note = args.note?.trim();
    if (note && note.length > 500) {
      throw new Error("Draw review note must be 500 characters or fewer.");
    }
    const operationsReviewStartedAt = new Date().toISOString();
    const patch = {
      operationsReviewStartedAt,
      operationsReviewerWorkosUserId: auth.subject,
      status: "in_review" as const,
      updatedAt: Date.now(),
    };
    await ctx.db.patch(draw._id, patch);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "startActiveBuildDrawReview",
      eventType: "active_build.draw.review_started",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(draw),
      reason: note,
    });
    await synchronizeDrawSystemPostForCanonicalDraw(ctx, {
      actor: { roles: auth.roles, workosUserId: auth.subject },
      activationReason: "draw_request",
      build: auth.build,
      drawRequest: { ...draw, ...patch },
      reason: note,
    });
    return null;
  })
  .public();

export const submitActiveBuildDrawForAdmin = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    drawKey: v.string(),
    note: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const draw = await getActiveBuildDrawRequestOrThrow(
      ctx,
      args.buildId,
      args.drawKey,
    );
    if (draw.status !== "in_review") {
      throw new Error(
        "Only draw requests under operations review can be sent to admin.",
      );
    }
    const note = args.note.trim();
    if (note.length < 3 || note.length > 500) {
      throw new Error(
        "Draw recommendation note must be between 3 and 500 characters.",
      );
    }
    const patch = {
      operationsRecommendationNote: note,
      operationsReviewerWorkosUserId: auth.subject,
      readyForAdminAt: new Date().toISOString(),
      status: "ready_for_admin" as const,
      updatedAt: Date.now(),
    };
    await ctx.db.patch(draw._id, patch);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "submitActiveBuildDrawForAdmin",
      eventType: "active_build.draw.ready_for_admin",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(draw),
      reason: note,
    });
    await synchronizeDrawSystemPostForCanonicalDraw(ctx, {
      actor: { roles: auth.roles, workosUserId: auth.subject },
      activationReason: "draw_request",
      build: auth.build,
      drawRequest: { ...draw, ...patch },
      reason: note,
    });
    return null;
  })
  .public();

export const approveActiveBuildDraw = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    drawKey: v.string(),
    expectedReviewCycleNumber: v.optional(v.number()),
    note: v.string(),
    reviewIdempotencyKey: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireApproverActiveBuildWrite(auth);
    const draw = await getActiveBuildDrawRequestOrThrow(
      ctx,
      args.buildId,
      args.drawKey,
    );
    if (draw.status !== "in_review" && draw.status !== "ready_for_admin") {
      throw new Error(
        "Only draw requests under review or prepared for admin can be approved for release.",
      );
    }
    const note = args.note.trim();
    if (note.length < 3 || note.length > 500) {
      throw new Error(
        "Draw approval reason must be between 3 and 500 characters.",
      );
    }
    if (
      args.expectedReviewCycleNumber === undefined ||
      !args.reviewIdempotencyKey
    ) {
      throw new ConvexError({
        code: "REVIEW_COMMAND_CONTEXT_REQUIRED",
        message:
          "Refresh the current review cycle before recording this approval.",
        recoverable: true,
      });
    }
    const reviewDecision = await recordCanonicalBackofficeReviewDecision(ctx, {
      actorWorkosUserId: auth.subject,
      decision: "approved",
      expectedCycleNumber: args.expectedReviewCycleNumber,
      idempotencyKey: args.reviewIdempotencyKey,
      privateRationale: note,
      target: { drawRequestId: draw._id, kind: "draw" },
    });
    if (reviewDecision.state !== "completed") {
      return null;
    }
    await requireCanonicalReviewCycleCompleted(
      ctx,
      { drawRequestId: draw._id, kind: "draw" },
      args.expectedReviewCycleNumber,
    );
    const patch = {
      collaborationEventRevision: (draw.collaborationEventRevision ?? 0) + 1,
      reviewNote: note,
      reviewedByWorkosUserId: auth.subject,
      reviewedAt: new Date().toISOString(),
      status: "approved_for_release" as const,
      updatedAt: Date.now(),
    };
    await ctx.db.patch(draw._id, patch);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "approveActiveBuildDraw",
      eventType: "active_build.draw.approved_for_release",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(draw),
      reason: note,
    });
    await publishDrawCollaborationEvent(ctx, {
      actor: { roles: auth.roles, workosUserId: auth.subject },
      draw: { ...draw, ...patch },
      note,
      revision: patch.collaborationEventRevision,
      transition: "approved",
    });
    await upsertBuilderDrawDecisionDeliveries(ctx, {
      auth,
      draw: { ...draw, ...patch },
      note: args.note,
      status: "approved",
    });
    return null;
  })
  .public();

export const rejectActiveBuildDraw = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    drawKey: v.string(),
    expectedReviewCycleNumber: v.optional(v.number()),
    note: v.string(),
    reviewIdempotencyKey: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireApproverActiveBuildWrite(auth);
    const draw = await getActiveBuildDrawRequestOrThrow(
      ctx,
      args.buildId,
      args.drawKey,
    );
    if (draw.status !== "in_review" && draw.status !== "ready_for_admin") {
      throw new Error(
        "Only draw requests under review or prepared for admin can be rejected.",
      );
    }
    const note = args.note.trim();
    if (note.length < 3 || note.length > 500) {
      throw new Error(
        "Draw rejection reason must be between 3 and 500 characters.",
      );
    }
    if (
      args.expectedReviewCycleNumber === undefined ||
      !args.reviewIdempotencyKey
    ) {
      throw new ConvexError({
        code: "REVIEW_COMMAND_CONTEXT_REQUIRED",
        message:
          "Refresh the current review cycle before recording this rejection.",
        recoverable: true,
      });
    }
    await recordCanonicalBackofficeReviewDecision(ctx, {
      actorWorkosUserId: auth.subject,
      decision: "rejected",
      expectedCycleNumber: args.expectedReviewCycleNumber,
      idempotencyKey: args.reviewIdempotencyKey,
      privateRationale: note,
      revisionInstructions: note,
      target: { drawRequestId: draw._id, kind: "draw" },
    });
    const patch = {
      collaborationEventRevision: (draw.collaborationEventRevision ?? 0) + 1,
      reviewNote: note,
      reviewedAt: new Date().toISOString(),
      reviewedByWorkosUserId: auth.subject,
      status: "rejected" as const,
      updatedAt: Date.now(),
    };
    await ctx.db.patch(draw._id, patch);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "rejectActiveBuildDraw",
      eventType: "active_build.draw.rejected",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(draw),
      reason: note,
    });
    await publishDrawCollaborationEvent(ctx, {
      actor: { roles: auth.roles, workosUserId: auth.subject },
      draw: { ...draw, ...patch },
      note,
      revision: patch.collaborationEventRevision,
      transition: "returned",
    });
    await upsertBuilderDrawDecisionDeliveries(ctx, {
      auth,
      draw: { ...draw, ...patch },
      note,
      status: "rejected",
    });
    return null;
  })
  .public();

export const releaseActiveBuildDraw = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    drawKey: v.string(),
    expectedReviewCycleNumber: v.optional(v.number()),
    note: v.string(),
    releaseDate: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireApproverActiveBuildWrite(auth);
    const draw = await getActiveBuildDrawRequestOrThrow(
      ctx,
      args.buildId,
      args.drawKey,
    );
    if (args.expectedReviewCycleNumber === undefined) {
      throw new ConvexError({
        code: "REVIEW_COMMAND_CONTEXT_REQUIRED",
        message: "Refresh the current review cycle before releasing this Draw.",
        recoverable: true,
      });
    }
    await requireCanonicalReviewCycleCompleted(
      ctx,
      { drawRequestId: draw._id, kind: "draw" },
      args.expectedReviewCycleNumber,
    );
    if (draw.status !== "approved_for_release") {
      throw new Error("Only draws approved for release can be released.");
    }
    const note = args.note.trim();
    if (note.length < 3 || note.length > 500) {
      throw new Error(
        "Draw release reason must be between 3 and 500 characters.",
      );
    }
    const patch = {
      collaborationEventRevision: (draw.collaborationEventRevision ?? 0) + 1,
      releaseDate: args.releaseDate,
      releaseNote: note,
      releasedAt: new Date().toISOString(),
      status: "released" as const,
      updatedAt: Date.now(),
    };
    await ctx.db.patch(draw._id, patch);
    await ctx.db.insert("capitalEvents", {
      amountCents: draw.amountCents,
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      createdAt: Date.now(),
      eventDate: args.releaseDate,
      eventType: "draw_release",
      label: `${draw.displayId} · ${draw.label}`,
      organizationId: args.workosOrganizationId,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "releaseActiveBuildDraw",
      eventType: "active_build.draw.released",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(draw),
      reason: note,
    });
    await publishDrawCollaborationEvent(ctx, {
      actor: { roles: auth.roles, workosUserId: auth.subject },
      draw: { ...draw, ...patch },
      note,
      revision: patch.collaborationEventRevision,
      transition: "released",
    });
    await upsertBuilderDrawDecisionDeliveries(ctx, {
      auth,
      draw: { ...draw, ...patch },
      note: args.note,
      status: "released",
    });
    return null;
  })
  .public();
