import { ConvexError } from "convex/values";

import { backofficeRoleSlugs } from "./authz";
import { ensureMilestoneSystemPost } from "./build_collaboration_system_posts";
import type { Doc, Id, MutationCtx } from "./types";

export const MILESTONE_START_SOURCES = [
  "milestone_card",
  "milestone_detail",
  "gantt",
  "calendar",
  "submilestone_ledger",
  "submilestone_detail",
  "guided_field_workflow",
  "assistant",
  "completion_catch_up",
] as const;

export type MilestoneStartSource = (typeof MILESTONE_START_SOURCES)[number];
type WorkLifecycle = "complete" | "in_progress" | "planned";

export interface MilestoneStartActor {
  brokerageId: Id<"brokerages">;
  organizationId: string;
  roles: string[];
  workosUserId: string;
}

export interface RecordMilestoneStartInput {
  actor: MilestoneStartActor;
  actualStartedAt: number;
  build: Doc<"activeBuilds">;
  dependencyOverrideReason?: string;
  idempotencyKey: string;
  milestone: Doc<"buildMilestones">;
  milestones: Doc<"buildMilestones">[];
  source: MilestoneStartSource;
  startParent?: boolean;
  submilestone?: Doc<"buildSubmilestones">;
}

export interface MilestoneStartResult {
  actualStartedAt: number;
  eventIds: Id<"milestoneStartEvents">[];
  milestoneKey: string;
  parentStarted: boolean;
  replayed: boolean;
  reportedAt: number;
  submilestoneKey?: string;
}

export interface AmendMilestoneStartInput {
  actor: MilestoneStartActor;
  actualStartedAt?: number;
  build: Doc<"activeBuilds">;
  idempotencyKey: string;
  milestone: Doc<"buildMilestones">;
  reason: string;
  source: MilestoneStartSource;
  submilestone?: Doc<"buildSubmilestones">;
}

export async function recordMilestoneStart(
  ctx: MutationCtx,
  input: RecordMilestoneStartInput
): Promise<MilestoneStartResult> {
  validateStartInput(input);
  const replay = await findIdempotentStart(ctx, input);
  if (replay) {
    const shouldActivateSystemPost =
      input.source !== "completion_catch_up" &&
      (!input.submilestone ||
        replay.parentStarted ||
        input.milestone.actualStartedAt !== undefined);
    if (shouldActivateSystemPost) {
      await ensureMilestoneSystemPost(ctx, {
        actor: input.actor,
        activationReason: "explicit_start",
        build: input.build,
        milestone: input.milestone,
      });
    }
    return replay;
  }

  const target = input.submilestone ?? input.milestone;
  if (target.actualStartedAt !== undefined) {
    throw new ConvexError({
      actualStartedAt: target.actualStartedAt,
      code: "WORK_ALREADY_STARTED",
      message:
        "This work already has an actual start. Use the correction workflow.",
      milestoneKey: input.milestone.key,
      submilestoneKey: input.submilestone?.key,
    });
  }
  if (target.status === "complete") {
    throw new ConvexError({
      code: "COMPLETED_WORK_REQUIRES_CORRECTION",
      message:
        "Completed work can only receive a missing start through the correction workflow.",
      milestoneKey: input.milestone.key,
      submilestoneKey: input.submilestone?.key,
    });
  }

  const dependencySnapshot = incompleteDependencySnapshot(
    input.milestone,
    input.milestones
  );
  const reason = normalizeOptionalText(input.dependencyOverrideReason);
  if (dependencySnapshot.length > 0 && !reason) {
    throw new ConvexError({
      code: "DEPENDENCY_EXCEPTION_REASON_REQUIRED",
      dependencies: dependencySnapshot,
      message:
        "Explain why work began before the declared predecessor milestones were complete.",
    });
  }
  if (
    dependencySnapshot.length > 0 &&
    reason &&
    !input.actor.roles.some(
      (role) =>
        role.trim().toLowerCase() === "builder" ||
        role.trim().toLowerCase() === "builder-staff" ||
        role.trim().toLowerCase() === "builder_staff"
    )
  ) {
    throw new ConvexError({
      code: "DEPENDENCY_EXCEPTION_NOT_AUTHORIZED",
      message:
        "Only an authorized Builder or Builder Staff member may record a dependency exception.",
    });
  }
  const warnings = dependencySnapshot.map(
    (dependency) =>
      `${dependency.milestoneName} (${dependency.milestoneKey}) was ${dependency.status}.`
  );
  const reportedAt = Date.now();
  const eventIds: Id<"milestoneStartEvents">[] = [];
  let parentStarted = false;

  if (
    input.submilestone &&
    input.startParent &&
    input.milestone.actualStartedAt === undefined &&
    input.milestone.status === "planned"
  ) {
    const parentEventId = await appendStartEvent(ctx, {
      ...input,
      dependencySnapshot,
      milestone: input.milestone,
      newLifecycleState: "in_progress",
      priorLifecycleState: input.milestone.status,
      reason,
      reportedAt,
      submilestone: undefined,
      warnings,
    });
    await ctx.db.patch(input.milestone._id, {
      actualStartedAt: input.actualStartedAt,
      startEventId: parentEventId,
      startReportedAt: reportedAt,
      startedByWorkosUserId: input.actor.workosUserId,
      startSource: input.source,
      status: "in_progress",
      updatedAt: reportedAt,
    });
    eventIds.push(parentEventId);
    parentStarted = true;
  }

  const targetEventId = await appendStartEvent(ctx, {
    ...input,
    dependencySnapshot,
    newLifecycleState: "in_progress",
    priorLifecycleState: target.status,
    reason,
    reportedAt,
    warnings,
  });
  await ctx.db.patch(target._id, {
    actualStartedAt: input.actualStartedAt,
    startEventId: targetEventId,
    startReportedAt: reportedAt,
    startedByWorkosUserId: input.actor.workosUserId,
    startSource: input.source,
    status: "in_progress",
    updatedAt: reportedAt,
  });
  eventIds.push(targetEventId);

  if (dependencySnapshot.length > 0) {
    if (!reason) {
      throw new Error(
        "A dependency exception reason is required to notify lender operations."
      );
    }
    await createDependencyExceptionDeliveries(ctx, {
      actor: input.actor,
      build: input.build,
      eventId: targetEventId,
      milestone: input.milestone,
      reason,
      submilestone: input.submilestone,
    });
  }

  const shouldActivateSystemPost =
    input.source !== "completion_catch_up" &&
    (!input.submilestone ||
      parentStarted ||
      input.milestone.actualStartedAt !== undefined);
  if (shouldActivateSystemPost) {
    await ensureMilestoneSystemPost(ctx, {
      actor: input.actor,
      activationReason: "explicit_start",
      build: input.build,
      milestone: input.milestone,
    });
  }

  return {
    actualStartedAt: input.actualStartedAt,
    eventIds,
    milestoneKey: input.milestone.key,
    parentStarted,
    replayed: false,
    reportedAt,
    ...(input.submilestone ? { submilestoneKey: input.submilestone.key } : {}),
  };
}

export async function correctMilestoneStart(
  ctx: MutationCtx,
  input: AmendMilestoneStartInput & { actualStartedAt: number }
): Promise<MilestoneStartResult> {
  validateAmendmentInput(input);
  const reason = requiredReason(input.reason);
  const replay = await findIdempotentAmendment(ctx, input, "start_corrected");
  if (replay) {
    return replay;
  }
  const target = input.submilestone ?? input.milestone;
  const completedWork =
    target.status === "complete" ||
    input.milestone.status === "complete" ||
    Boolean(input.milestone.completionClaim);
  if (target.actualStartedAt === undefined && !completedWork) {
    throw new ConvexError({
      code: "START_NOT_RECORDED",
      message: "This work has no recorded start to correct.",
    });
  }
  const reportedAt = Date.now();
  const eventId = await appendAmendmentEvent(ctx, {
    ...input,
    eventType: "start_corrected",
    newActualStartedAt: input.actualStartedAt,
    newLifecycleState:
      target.status === "planned" ? "in_progress" : target.status,
    originalEventId: target.startEventId,
    priorActualStartedAt: target.actualStartedAt,
    priorLifecycleState: target.status,
    reason,
    reportedAt,
  });
  await ctx.db.patch(target._id, {
    actualStartedAt: input.actualStartedAt,
    startEventId: eventId,
    startReportedAt: reportedAt,
    startedByWorkosUserId: input.actor.workosUserId,
    startSource: input.source,
    status: target.status === "planned" ? "in_progress" : target.status,
    updatedAt: reportedAt,
  });
  return amendmentResult(input, eventId, reportedAt, input.actualStartedAt);
}

export async function retractMilestoneStart(
  ctx: MutationCtx,
  input: AmendMilestoneStartInput
): Promise<MilestoneStartResult> {
  validateAmendmentInput(input);
  const reason = requiredReason(input.reason);
  const replay = await findIdempotentAmendment(ctx, input, "start_retracted");
  if (replay) {
    return replay;
  }
  const target = input.submilestone ?? input.milestone;
  if (target.actualStartedAt === undefined) {
    throw new ConvexError({
      code: "START_NOT_RECORDED",
      message: "This work has no recorded start to retract.",
    });
  }
  const reportedAt = Date.now();
  const nextLifecycleState = lifecycleAfterRetraction(target);
  const eventId = await appendAmendmentEvent(ctx, {
    ...input,
    eventType: "start_retracted",
    newActualStartedAt: undefined,
    newLifecycleState: nextLifecycleState,
    originalEventId: target.startEventId,
    priorActualStartedAt: target.actualStartedAt,
    priorLifecycleState: target.status,
    reason,
    reportedAt,
  });
  await ctx.db.patch(target._id, {
    actualStartedAt: undefined,
    startEventId: eventId,
    startReportedAt: undefined,
    startedByWorkosUserId: undefined,
    startSource: undefined,
    status: nextLifecycleState,
    updatedAt: reportedAt,
  });
  return amendmentResult(input, eventId, reportedAt, target.actualStartedAt);
}

function validateStartInput(input: RecordMilestoneStartInput) {
  const idempotencyKey = input.idempotencyKey.trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    throw new ConvexError({
      code: "INVALID_IDEMPOTENCY_KEY",
      message:
        "A stable idempotency key between 8 and 200 characters is required.",
    });
  }
  if (
    !Number.isFinite(input.actualStartedAt) ||
    input.actualStartedAt > Date.now()
  ) {
    throw new ConvexError({
      code: "FUTURE_ACTUAL_START",
      message: "Actual start must be now or earlier.",
    });
  }
  if (
    input.build.organizationId !== input.actor.organizationId ||
    input.milestone.organizationId !== input.actor.organizationId ||
    input.milestone.buildId !== input.build._id ||
    (input.submilestone &&
      (input.submilestone.organizationId !== input.actor.organizationId ||
        input.submilestone.buildId !== input.build._id ||
        input.submilestone.buildMilestoneId !== input.milestone._id))
  ) {
    throw new Error("Forbidden: milestone start scope");
  }
  if (input.milestone.planningState === "superseded") {
    throw new ConvexError({
      code: "MILESTONE_SUPERSEDED",
      message:
        "This Milestone was removed by an approved planning revision and cannot execute commands.",
      milestoneKey: input.milestone.key,
    });
  }
  if (input.submilestone?.planningState === "superseded") {
    throw new ConvexError({
      code: "SUBMILESTONE_SUPERSEDED",
      message:
        "This Sub-milestone was removed by an approved planning revision and cannot execute commands.",
      submilestoneKey: input.submilestone.key,
    });
  }
}

function validateAmendmentInput(input: AmendMilestoneStartInput) {
  if (
    input.actualStartedAt !== undefined &&
    (!Number.isFinite(input.actualStartedAt) ||
      input.actualStartedAt > Date.now())
  ) {
    throw new ConvexError({
      code: "FUTURE_ACTUAL_START",
      message: "Actual start must be now or earlier.",
    });
  }
  if (
    input.idempotencyKey.trim().length < 8 ||
    input.idempotencyKey.trim().length > 200
  ) {
    throw new ConvexError({
      code: "INVALID_IDEMPOTENCY_KEY",
      message:
        "A stable idempotency key between 8 and 200 characters is required.",
    });
  }
  if (
    input.build.organizationId !== input.actor.organizationId ||
    input.milestone.organizationId !== input.actor.organizationId ||
    input.milestone.buildId !== input.build._id ||
    (input.submilestone &&
      (input.submilestone.organizationId !== input.actor.organizationId ||
        input.submilestone.buildId !== input.build._id ||
        input.submilestone.buildMilestoneId !== input.milestone._id))
  ) {
    throw new Error("Forbidden: milestone start scope");
  }
  if (input.milestone.planningState === "superseded") {
    throw new ConvexError({
      code: "MILESTONE_SUPERSEDED",
      message:
        "This Milestone was removed by an approved planning revision and cannot execute commands.",
      milestoneKey: input.milestone.key,
    });
  }
  if (input.submilestone?.planningState === "superseded") {
    throw new ConvexError({
      code: "SUBMILESTONE_SUPERSEDED",
      message:
        "This Sub-milestone was removed by an approved planning revision and cannot execute commands.",
      submilestoneKey: input.submilestone.key,
    });
  }
}

async function findIdempotentAmendment(
  ctx: MutationCtx,
  input: AmendMilestoneStartInput,
  eventType: "start_corrected" | "start_retracted"
): Promise<MilestoneStartResult | null> {
  const events = await ctx.db
    .query("milestoneStartEvents")
    .withIndex("by_organization_idempotency", (query) =>
      query
        .eq("organizationId", input.actor.organizationId)
        .eq("idempotencyKey", input.idempotencyKey.trim())
    )
    .take(2);
  if (events.length === 0) {
    return null;
  }
  const event = events[0];
  if (
    !event ||
    event.eventType !== eventType ||
    event.buildId !== input.build._id ||
    event.milestoneKey !== input.milestone.key ||
    event.submilestoneKey !== input.submilestone?.key ||
    event.source !== input.source ||
    event.reason !== input.reason.trim() ||
    (eventType === "start_corrected" &&
      event.actualStartedAt !== input.actualStartedAt)
  ) {
    throw new ConvexError({
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "This idempotency key belongs to a different start command.",
    });
  }
  return {
    actualStartedAt:
      event.actualStartedAt ?? event.priorActualStartedAt ?? event.reportedAt,
    eventIds: [event._id],
    milestoneKey: event.milestoneKey,
    parentStarted: false,
    replayed: true,
    reportedAt: event.reportedAt,
    ...(event.submilestoneKey
      ? { submilestoneKey: event.submilestoneKey }
      : {}),
  };
}

async function appendAmendmentEvent(
  ctx: MutationCtx,
  input: AmendMilestoneStartInput & {
    eventType: "start_corrected" | "start_retracted";
    newActualStartedAt?: number;
    newLifecycleState: WorkLifecycle;
    originalEventId?: Id<"milestoneStartEvents">;
    priorActualStartedAt?: number;
    priorLifecycleState: WorkLifecycle;
    reason: string;
    reportedAt: number;
  }
) {
  const eventId = await ctx.db.insert("milestoneStartEvents", {
    actualStartedAt: input.newActualStartedAt,
    actorRoles: input.actor.roles,
    actorWorkosUserId: input.actor.workosUserId,
    brokerageId: input.actor.brokerageId,
    buildId: input.build._id,
    buildMilestoneId: input.milestone._id,
    ...(input.submilestone
      ? {
          buildSubmilestoneId: input.submilestone._id,
          submilestoneKey: input.submilestone.key,
        }
      : {}),
    dependencySnapshot: [],
    eventType: input.eventType,
    idempotencyKey: input.idempotencyKey.trim(),
    milestoneKey: input.milestone.key,
    newLifecycleState: input.newLifecycleState,
    organizationId: input.actor.organizationId,
    originalEventId: input.originalEventId,
    priorActualStartedAt: input.priorActualStartedAt,
    priorLifecycleState: input.priorLifecycleState,
    reason: input.reason,
    reportedAt: input.reportedAt,
    source: input.source,
    warnings: [],
  });
  const webhookEventType =
    input.eventType === "start_corrected"
      ? "milestone.start_corrected"
      : "milestone.start_retracted";
  const payload = {
    actualStartedAt: input.newActualStartedAt,
    actorRoles: input.actor.roles,
    actorWorkosUserId: input.actor.workosUserId,
    buildId: input.build._id,
    eventId,
    idempotencyKey: input.idempotencyKey.trim(),
    milestoneKey: input.milestone.key,
    newLifecycleState: input.newLifecycleState,
    organizationId: input.actor.organizationId,
    originalEventId: input.originalEventId,
    priorActualStartedAt: input.priorActualStartedAt,
    priorLifecycleState: input.priorLifecycleState,
    reason: input.reason,
    reportedAt: input.reportedAt,
    source: input.source,
    submilestoneKey: input.submilestone?.key,
  };
  await ctx.db.insert("auditEvents", {
    actorRoles: input.actor.roles,
    actorWorkosUserId: input.actor.workosUserId,
    brokerageId: input.actor.brokerageId,
    command:
      input.eventType === "start_corrected"
        ? "correctMilestoneStart"
        : "retractMilestoneStart",
    createdAt: input.reportedAt,
    entityId: String(input.build._id),
    entityType: "activeBuild",
    eventType: webhookEventType,
    newState: JSON.stringify(payload),
    organizationId: input.actor.organizationId,
    priorState: JSON.stringify({
      actualStartedAt: input.priorActualStartedAt,
      lifecycleState: input.priorLifecycleState,
    }),
    reason: input.reason,
    warnings: [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: input.actor.brokerageId,
    createdAt: input.reportedAt,
    eventType: webhookEventType,
    organizationId: input.actor.organizationId,
    payloadPreview: JSON.stringify(payload),
    relatedEntityId: input.build._id,
    relatedEntityType: "activeBuild",
    status: "pending",
  });
  return eventId;
}

function amendmentResult(
  input: AmendMilestoneStartInput,
  eventId: Id<"milestoneStartEvents">,
  reportedAt: number,
  actualStartedAt: number
): MilestoneStartResult {
  return {
    actualStartedAt,
    eventIds: [eventId],
    milestoneKey: input.milestone.key,
    parentStarted: false,
    replayed: false,
    reportedAt,
    ...(input.submilestone ? { submilestoneKey: input.submilestone.key } : {}),
  };
}

function lifecycleAfterRetraction(
  target: Doc<"buildMilestones"> | Doc<"buildSubmilestones">
): WorkLifecycle {
  if (target.status === "complete") {
    return "complete";
  }
  if ("completionClaim" in target && target.completionClaim) {
    return "in_progress";
  }
  if (
    ("progressPercent" in target && (target.progressPercent ?? 0) > 0) ||
    ("completedAt" in target && target.completedAt !== undefined)
  ) {
    return "in_progress";
  }
  return "planned";
}

function requiredReason(value: string) {
  const reason = value.trim();
  if (reason.length < 3) {
    throw new ConvexError({
      code: "START_AMENDMENT_REASON_REQUIRED",
      message: "A correction or retraction reason is required.",
    });
  }
  return reason;
}

async function findIdempotentStart(
  ctx: MutationCtx,
  input: RecordMilestoneStartInput
): Promise<MilestoneStartResult | null> {
  const events = await ctx.db
    .query("milestoneStartEvents")
    .withIndex("by_organization_idempotency", (query) =>
      query
        .eq("organizationId", input.actor.organizationId)
        .eq("idempotencyKey", input.idempotencyKey.trim())
    )
    .take(4);
  if (events.length === 0) {
    return null;
  }
  const normalizedReason = normalizeOptionalText(
    input.dependencyOverrideReason
  );
  if (
    events.some(
      (event) =>
        event.buildId !== input.build._id ||
        event.milestoneKey !== input.milestone.key ||
        event.actualStartedAt !== input.actualStartedAt ||
        event.source !== input.source ||
        event.reason !== normalizedReason
    )
  ) {
    throw new ConvexError({
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "This idempotency key belongs to a different start command.",
    });
  }
  const targetEvent = events.find(
    (event) => event.submilestoneKey === input.submilestone?.key
  );
  if (!targetEvent?.actualStartedAt) {
    throw new ConvexError({
      code: "IDEMPOTENCY_RESULT_INVALID",
      message: "The original start result is incomplete.",
    });
  }
  if (
    Boolean(targetEvent.startParentRequested) !== Boolean(input.startParent)
  ) {
    throw new ConvexError({
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "This idempotency key belongs to a different start command.",
    });
  }
  return {
    actualStartedAt: targetEvent.actualStartedAt,
    eventIds: events.map((event) => event._id),
    milestoneKey: targetEvent.milestoneKey,
    parentStarted: Boolean(
      input.submilestone &&
        events.some((event) => event.submilestoneKey === undefined)
    ),
    replayed: true,
    reportedAt: targetEvent.reportedAt,
    ...(targetEvent.submilestoneKey
      ? { submilestoneKey: targetEvent.submilestoneKey }
      : {}),
  };
}

function incompleteDependencySnapshot(
  milestone: Doc<"buildMilestones">,
  milestones: Doc<"buildMilestones">[]
) {
  const byKey = new Map(
    milestones.map((candidate) => [candidate.key, candidate])
  );
  return milestone.dependencyKeys.flatMap((dependencyKey) => {
    const dependency = byKey.get(dependencyKey);
    if (!dependency || dependency.status === "complete") {
      return [];
    }
    return [
      {
        milestoneKey: dependency.key,
        milestoneName: dependency.name,
        status: dependency.status,
      },
    ];
  });
}

async function appendStartEvent(
  ctx: MutationCtx,
  input: RecordMilestoneStartInput & {
    dependencySnapshot: Array<{
      milestoneKey: string;
      milestoneName: string;
      status: WorkLifecycle;
    }>;
    newLifecycleState: WorkLifecycle;
    priorLifecycleState: WorkLifecycle;
    reason?: string;
    reportedAt: number;
    warnings: string[];
  }
) {
  const eventId = await ctx.db.insert("milestoneStartEvents", {
    actualStartedAt: input.actualStartedAt,
    actorRoles: input.actor.roles,
    actorWorkosUserId: input.actor.workosUserId,
    brokerageId: input.actor.brokerageId,
    buildId: input.build._id,
    buildMilestoneId: input.milestone._id,
    ...(input.submilestone
      ? {
          buildSubmilestoneId: input.submilestone._id,
          submilestoneKey: input.submilestone.key,
        }
      : {}),
    dependencySnapshot: input.dependencySnapshot,
    eventType: "started",
    idempotencyKey: input.idempotencyKey.trim(),
    milestoneKey: input.milestone.key,
    newLifecycleState: input.newLifecycleState,
    organizationId: input.actor.organizationId,
    priorLifecycleState: input.priorLifecycleState,
    reason: input.reason,
    reportedAt: input.reportedAt,
    source: input.source,
    startParentRequested: input.startParent ?? false,
    warnings: input.warnings,
  });
  const payload = {
    actualStartedAt: input.actualStartedAt,
    actorRoles: input.actor.roles,
    actorWorkosUserId: input.actor.workosUserId,
    buildId: input.build._id,
    dependencySnapshot: input.dependencySnapshot,
    eventId,
    idempotencyKey: input.idempotencyKey.trim(),
    milestoneKey: input.milestone.key,
    newLifecycleState: input.newLifecycleState,
    organizationId: input.actor.organizationId,
    priorLifecycleState: input.priorLifecycleState,
    reason: input.reason,
    reportedAt: input.reportedAt,
    source: input.source,
    submilestoneKey: input.submilestone?.key,
    warnings: input.warnings,
  };
  await ctx.db.insert("auditEvents", {
    actorRoles: input.actor.roles,
    actorWorkosUserId: input.actor.workosUserId,
    brokerageId: input.actor.brokerageId,
    command: "recordMilestoneStart",
    createdAt: input.reportedAt,
    entityId: String(input.build._id),
    entityType: "activeBuild",
    eventType: "milestone.started",
    newState: JSON.stringify(payload),
    organizationId: input.actor.organizationId,
    priorState: JSON.stringify({
      actualStartedAt: null,
      lifecycleState: input.priorLifecycleState,
    }),
    reason: input.reason,
    warnings: input.warnings,
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: input.actor.brokerageId,
    createdAt: input.reportedAt,
    eventType: "milestone.started",
    organizationId: input.actor.organizationId,
    payloadPreview: JSON.stringify(payload),
    relatedEntityId: input.build._id,
    relatedEntityType: "activeBuild",
    status: "pending",
  });
  return eventId;
}

async function createDependencyExceptionDeliveries(
  ctx: MutationCtx,
  input: {
    actor: MilestoneStartActor;
    build: Doc<"activeBuilds">;
    eventId: Id<"milestoneStartEvents">;
    milestone: Doc<"buildMilestones">;
    reason: string;
    submilestone?: Doc<"buildSubmilestones">;
  }
) {
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_organization", (query) =>
      query.eq("workosOrganizationId", input.actor.organizationId)
    )
    .take(500);
  const eligible = memberships.filter(isEligibleLenderMembership);
  const [brokerage, proposal, brokerAssignments] = await Promise.all([
    ctx.db.get(input.actor.brokerageId),
    ctx.db.get(input.build.proposalId),
    ctx.db
      .query("buildBrokerAssignments")
      .withIndex("by_build", (query) => query.eq("buildId", input.build._id))
      .take(100),
  ]);
  const assignedIds = new Set(
    [
      proposal?.assignedBrokerWorkosUserId,
      brokerage?.principalBrokerWorkosUserId,
      ...brokerAssignments.map(
        (assignment) => assignment.assignedBrokerWorkosUserId
      ),
    ].filter((value): value is string => Boolean(value))
  );
  const assignedMemberships = await Promise.all(
    [...assignedIds].map((workosUserId) =>
      ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_user_and_organization", (query) =>
          query
            .eq("workosUserId", workosUserId)
            .eq("workosOrganizationId", input.actor.organizationId)
        )
        .first()
    )
  );
  const assignedEligibleIds = assignedMemberships
    .filter(isEligibleLenderMembership)
    .map((membership) => membership.workosUserId);
  const recipients = new Set(
    assignedEligibleIds.length > 0
      ? assignedEligibleIds
      : eligible.map((membership) => membership.workosUserId)
  );
  const targetName = input.submilestone?.name ?? input.milestone.name;
  const now = Date.now();
  if (recipients.size === 0) {
    await ctx.db.insert("operationsQueueHandoffs", {
      acknowledgementState: "pending_decision",
      brokerageId: input.actor.brokerageId,
      createdAt: now,
      decisionPreview:
        "Review the dependency exception and determine whether execution may continue.",
      escalatedByWorkosUserId: input.actor.workosUserId,
      escalationReason: input.reason,
      evidenceSummary: `${targetName} was reported started before every declared predecessor was complete.`,
      organizationId: input.actor.organizationId,
      queueItemId: `milestone-start-exception:${input.eventId}`,
      recommendation:
        "Assign lender staff and review the out-of-sequence work start.",
      requiredAction: "Review dependency exception",
      targetHref: `/backoffice/builds/${input.build._id}?milestone=${encodeURIComponent(input.milestone.key)}&rail=open`,
      targetLabel: `${input.build.buildName} · ${targetName}`,
      targetRecordId: String(input.build._id),
      targetType: "activeBuild",
      updatedAt: now,
      warnings: [
        "No eligible lender recipient was available when the exception was recorded.",
      ],
    });
  }
  for (const recipientWorkosUserId of recipients) {
    await ctx.db.insert("recipientDeliveries", {
      actionLabel: "Review exception",
      actionRequired: true,
      body: `${targetName} was reported started before every declared predecessor was complete. Builder reason: ${input.reason}`,
      brokerageId: input.actor.brokerageId,
      createdAt: now,
      dedupeKey: `milestone-start-exception:${input.eventId}`,
      entityId: String(input.build._id),
      entityLabel: `${input.build.buildName} · ${targetName}`,
      entityType: "activeBuild",
      href: `/backoffice/builds/${input.build._id}?milestone=${encodeURIComponent(input.milestone.key)}&rail=open`,
      organizationId: input.actor.organizationId,
      recipientWorkosUserId,
      resolutionMode: "domain",
      sourceLabel: "Builder milestone start",
      status: "unread",
      title: `${targetName} started out of sequence`,
      updatedAt: now,
    });
  }
}

function isEligibleLenderMembership(
  membership: Doc<"workosOrganizationMemberships"> | null
): membership is Doc<"workosOrganizationMemberships"> {
  return (
    membership !== null &&
    membership.status === "active" &&
    [membership.roleSlug, ...(membership.roleSlugs ?? [])].some(
      (role) =>
        role !== undefined &&
        (backofficeRoleSlugs as readonly string[]).includes(role)
    )
  );
}

function normalizeOptionalText(value?: string) {
  const normalized = value?.trim();
  return normalized || undefined;
}
