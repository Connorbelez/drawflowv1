/**
 * Production proposals calendar scheduling bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { type AuthorizedViewer, authenticatedMutation, authenticatedQuery, type RoleSlug } from "../authz";
import { synchronizeMilestoneSystemPostPlanning } from "../build_collaboration_system_posts";
import { ensureActiveBuildPlanningActivationRevision, recordApprovedActiveBuildPlanningRevision } from "../build_collaboration_planning_reconciliation";
import { pushProposalPlanningSnapshot } from "../proposal_collaboration_model";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { getActiveBuildMilestoneOrThrow } from "./active_planning.js";
import { authorizeActiveBuildOrThrow, requireBackofficeActiveBuildWrite, authorizeProposal } from "./authorization_core.js";
import { requireProposalAppPermission, getWorkosUserById } from "./builder_staff_access.js";
import { calendarReminderEventInput, calendarEventId } from "./calendar_contracts.js";
import { requireBackofficeProposalWrite, normalizeOptionalString } from "./contractor_policy_helpers.js";
import { builderAccountSummaries, isBackoffice } from "./proposal_claim.js";
import { writeProposalEvent, writeActiveBuildEvent } from "./proposal_copy_audit.js";
import { requireReason } from "./proposal_lender_approval.js";
import { normalizeIsoDate } from "./roster_projection_helpers.js";
import { collectByIndex } from "./storage_helpers.js";

export function calendarTargetDateEvent(
  target: Doc<"calendarTargetDates">,
  surface: "activeBuild" | "proposal",
) {
  const kind =
    target.dateKind === "evidenceDue"
      ? "evidence"
      : target.dateKind === "drawReleaseTarget"
        ? "draw"
        : target.dateKind === "adminDecisionTarget"
          ? "adminDecision"
          : "review";
  return {
    allDay: !target.targetTime,
    auditRequired: true,
    drawGroupKey: target.drawKey,
    editable: {
      canChangeAssignee: false,
      canChangeStatus: false,
      canMove: true,
      canResizeEnd: false,
      canResizeStart: false,
      requiredReason: "scheduleChange",
    },
    entity:
      surface === "proposal"
        ? { id: String(target.proposalId), type: "proposal" }
        : { id: String(target.buildId), type: "activeBuild" },
    id: calendarEventId(surface, "target", String(target._id)),
    kind,
    milestoneKey: target.milestoneKey,
    organizationId: target.organizationId,
    relatedEntityIds: [
      target.buildId ? String(target.buildId) : "",
      target.proposalId ? String(target.proposalId) : "",
    ].filter(Boolean),
    startsAt: target.targetDate,
    status: "planned",
    subtitle: target.reason,
    surface,
    timeBucket: target.targetTime ? "afternoon" : "allDay",
    timezone: "America/Toronto",
    title: target.dateKind.replace(
      /[A-Z]/g,
      (letter) => ` ${letter.toLowerCase()}`,
    ),
    warnings: [],
  };
}

export function calendarReminderEvent(
  event: Doc<"calendarReminderEvents">,
  surface: "activeBuild" | "proposal",
) {
  const assignedWorkosUser = event.assignedParticipants.find(
    (participant) => participant.workosUserId,
  )?.workosUserId;
  return {
    allDay: event.allDay,
    assigneeUserId: assignedWorkosUser,
    auditRequired: false,
    editable: {
      canChangeAssignee: true,
      canChangeStatus: true,
      canMove: event.status !== "cancelled",
      canResizeEnd: event.status !== "cancelled",
      canResizeStart: event.status !== "cancelled",
      immutableReason:
        event.status === "cancelled"
          ? "Cancelled reminder events are retained for calendar history."
          : undefined,
      requiredReason: "none",
    },
    endsAt: event.endsAt,
    entity: { id: String(event._id), type: "calendarReminder" },
    id: calendarEventId(surface, "reminder", String(event._id)),
    kind: "reminder",
    location: event.location,
    organizationId: event.organizationId,
    ownerUserId: event.createdByWorkosUserId,
    participants: event.assignedParticipants.map((participant) => ({
      ...participant,
      key: participant.workosUserId
        ? `workos:${participant.workosUserId}`
        : participant.builderProfileId
          ? `builder:${participant.builderProfileId}`
          : participant.contractorId
            ? `contractor:${participant.contractorId}`
            : `email:${participant.email ?? participant.displayName ?? "external"}`,
    })),
    relatedEntityIds: [
      event.buildId ? String(event.buildId) : "",
      String(event.proposalId),
      ...event.assignedParticipants
        .map(
          (participant) =>
            participant.workosUserId ??
            participant.builderProfileId ??
            participant.contractorId ??
            participant.email,
        )
        .filter((value): value is string => Boolean(value)),
    ].filter(Boolean),
    startsAt: event.startsAt,
    status: event.status === "cancelled" ? "cancelled" : "planned",
    subtitle:
      event.description ??
      event.assignedParticipants
        .map((participant) => participant.displayName ?? participant.email)
        .filter(Boolean)
        .join(", "),
    surface,
    timeBucket: event.allDay ? "allDay" : "morning",
    timezone: event.timezone,
    title: event.title,
    warnings:
      event.source === "external"
        ? [
            {
              label: `Imported from ${event.externalProvider ?? "external calendar"}`,
              severity: "info",
            },
          ]
        : [],
  };
}

async function getProposalMilestoneByKeyOrThrow(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  milestoneKey: string,
) {
  const milestone = await ctx.db
    .query("proposalMilestones")
    .withIndex("by_proposal_key", (q) =>
      q.eq("proposalId", proposalId).eq("key", milestoneKey),
    )
    .unique();
  if (!milestone) {
    throw new Error("Production proposal milestone not found.");
  }
  return milestone;
}

export const reviseProposalMilestoneSchedule = authenticatedMutation
  .input({
    dayEnd: v.number(),
    dayStart: v.number(),
    milestoneKey: v.string(),
    proposalId: v.id("buildProposals"),
    reason: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    if (isBackoffice(auth.roles)) {
      requireBackofficeProposalWrite(auth, auth.proposal);
    } else if (auth.proposal.status !== "draft") {
      throw new Error("Builder proposal calendar edits require a draft.");
    }
    if (auth.proposal.status !== "draft") {
      requireReason(args.reason ?? "");
    }
    if (args.dayStart < 0 || args.dayEnd < args.dayStart) {
      throw new Error("Milestone schedule range is invalid.");
    }
    const milestone = await getProposalMilestoneByKeyOrThrow(
      ctx,
      args.proposalId,
      args.milestoneKey,
    );
    const priorState = {
      dayEnd: milestone.dayEnd,
      dayStart: milestone.dayStart,
      durationDays: milestone.durationDays,
    };
    const newState = {
      dayEnd: Math.round(args.dayEnd),
      dayStart: Math.round(args.dayStart),
      durationDays: Math.max(1, Math.round(args.dayEnd - args.dayStart)),
    };
    const now = Date.now();
    await ctx.db.patch(milestone._id, { ...newState, updatedAt: now });
    await ctx.db.patch(args.proposalId, {
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await ctx.db.insert("scheduleRevisionRecords", {
      brokerageId: auth.brokerage._id,
      createdAt: now,
      entityKey: args.milestoneKey,
      entityType: "proposalMilestone",
      newState,
      organizationId: args.workosOrganizationId,
      priorState,
      proposalId: args.proposalId,
      reason: args.reason ?? "Draft proposal calendar edit.",
      revisedByWorkosUserId: auth.subject,
      revisionType: "proposal.milestone.schedule",
      warnings: [],
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "reviseProposalMilestoneSchedule",
      eventType: "proposal.milestone.schedule_revised",
      newState: JSON.stringify(newState),
      priorState: JSON.stringify(priorState),
      proposalId: args.proposalId,
      reason: args.reason,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const reviseProposalDrawTiming = authenticatedMutation
  .input({
    drawKey: v.string(),
    proposalId: v.id("buildProposals"),
    reason: v.optional(v.string()),
    timingDay: v.number(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    if (isBackoffice(auth.roles)) {
      requireBackofficeProposalWrite(auth, auth.proposal);
    } else if (auth.proposal.status !== "draft") {
      throw new Error("Builder proposal draw timing edits require a draft.");
    }
    if (auth.proposal.status !== "draft") {
      requireReason(args.reason ?? "");
    }
    if (args.timingDay < 0) {
      throw new Error("Draw timing day cannot be negative.");
    }
    const draw = await ctx.db
      .query("proposalDrawScheduleRows")
      .withIndex("by_proposal_key", (q) =>
        q.eq("proposalId", args.proposalId).eq("drawKey", args.drawKey),
      )
      .unique();
    if (!draw) {
      throw new Error("Draw schedule row not found.");
    }
    const now = Date.now();
    const priorState = { timingDay: draw.timingDay };
    const newState = { timingDay: Math.round(args.timingDay) };
    await ctx.db.patch(draw._id, { ...newState, updatedAt: now });
    await writeProposalEvent(ctx, {
      auth,
      command: "reviseProposalDrawTiming",
      eventType: "proposal.draw_timing.revised",
      newState: JSON.stringify(newState),
      priorState: JSON.stringify(priorState),
      proposalId: args.proposalId,
      reason: args.reason,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const reviseActiveBuildMilestoneSchedule = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    dayEnd: v.number(),
    dayStart: v.number(),
    milestoneKey: v.string(),
    reason: v.string(),
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
    requireReason(args.reason);
    await ensureActiveBuildPlanningActivationRevision(ctx, {
      actor: { actorRoles: auth.roles, actorWorkosUserId: auth.subject },
      build: auth.build,
    });
    if (args.dayStart < 0 || args.dayEnd < args.dayStart) {
      throw new Error("Milestone schedule range is invalid.");
    }
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    const priorState = {
      dayEnd: milestone.dayEnd,
      dayStart: milestone.dayStart,
      durationDays: milestone.durationDays,
    };
    const newState = {
      dayEnd: Math.round(args.dayEnd),
      dayStart: Math.round(args.dayStart),
      durationDays: Math.max(1, Math.round(args.dayEnd - args.dayStart)),
    };
    const now = Date.now();
    await ctx.db.patch(milestone._id, { ...newState, updatedAt: now });
    await recordApprovedActiveBuildPlanningRevision(ctx, {
      actor: {
        actorRoles: auth.roles,
        actorWorkosUserId: auth.subject,
      },
      build: auth.build,
      reason: args.reason,
      sourceCommand: "reviseActiveBuildMilestoneSchedule",
      now,
    });
    const currentMilestone = await ctx.db.get(milestone._id);
    if (currentMilestone) {
      await synchronizeMilestoneSystemPostPlanning(ctx, {
        actor: { roles: auth.roles, workosUserId: auth.subject },
        build: auth.build,
        milestone: currentMilestone,
      });
    }
    await ctx.db.insert("scheduleRevisionRecords", {
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      createdAt: now,
      entityKey: args.milestoneKey,
      entityType: "buildMilestone",
      newState,
      organizationId: args.workosOrganizationId,
      priorState,
      proposalId: auth.proposal._id,
      reason: args.reason,
      revisedByWorkosUserId: auth.subject,
      revisionType: "active_build.milestone.schedule",
      warnings: [],
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "reviseActiveBuildMilestoneSchedule",
      eventType: "active_build.milestone.schedule_revised",
      newState: JSON.stringify(newState),
      priorState: JSON.stringify(priorState),
      reason: args.reason,
    });
    return null;
  })
  .public();

async function upsertCalendarTargetDate(
  ctx: MutationCtx,
  input: {
    auth: {
      brokerage: Doc<"brokerages">;
      build?: Doc<"activeBuilds">;
      proposal: Doc<"buildProposals">;
      roles: RoleSlug[];
      subject: string;
    };
    buildId?: Id<"activeBuilds">;
    dateKind:
      | "adminDecisionTarget"
      | "drawReleaseTarget"
      | "evidenceDue"
      | "reviewTarget";
    drawKey?: string;
    entityKey: string;
    entityType: string;
    milestoneKey?: string;
    proposalId?: Id<"buildProposals">;
    reason?: string;
    targetDate: string;
    targetTime?: string;
    workosOrganizationId: string;
  },
) {
  const existing = await ctx.db
    .query("calendarTargetDates")
    .withIndex("by_entity", (q) =>
      q
        .eq("entityType", input.entityType)
        .eq("entityKey", input.entityKey)
        .eq("dateKind", input.dateKind),
    )
    .collect()
    .then((rows) =>
      rows.find(
        (row) =>
          String(row.buildId ?? "") === String(input.buildId ?? "") &&
          String(row.proposalId ?? "") === String(input.proposalId ?? ""),
      ),
    );
  const now = Date.now();
  const payload = {
    brokerageId: input.auth.brokerage._id,
    buildId: input.buildId,
    dateKind: input.dateKind,
    drawKey: input.drawKey,
    entityKey: input.entityKey,
    entityType: input.entityType,
    milestoneKey: input.milestoneKey,
    organizationId: input.workosOrganizationId,
    proposalId: input.proposalId,
    reason: input.reason,
    targetDate: normalizeIsoDate(input.targetDate, "Target date is invalid."),
    targetTime: normalizeOptionalString(input.targetTime),
    updatedAt: now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }
  return await ctx.db.insert("calendarTargetDates", {
    ...payload,
    createdAt: now,
  });
}

const targetDateMutationInput = {
  buildId: v.optional(v.id("activeBuilds")),
  drawKey: v.optional(v.string()),
  milestoneKey: v.optional(v.string()),
  proposalId: v.optional(v.id("buildProposals")),
  reason: v.optional(v.string()),
  targetDate: v.string(),
  targetTime: v.optional(v.string()),
  workosOrganizationId: v.string(),
};

async function authorizeCalendarTargetMutation(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  args: {
    buildId?: Id<"activeBuilds">;
    proposalId?: Id<"buildProposals">;
    workosOrganizationId: string;
  },
) {
  if (args.buildId) {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    return { ...auth, buildId: args.buildId, proposalId: auth.proposal._id };
  }
  if (args.proposalId) {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    if (isBackoffice(auth.roles)) {
      requireBackofficeProposalWrite(auth, auth.proposal);
    }
    return { ...auth, proposalId: args.proposalId };
  }
  throw new Error("Calendar target requires proposalId or buildId.");
}

export const setEvidenceDueDate = authenticatedMutation
  .input(targetDateMutationInput)
  .returns(v.id("calendarTargetDates"))
  .handler(async (ctx, args) => {
    const auth = await authorizeCalendarTargetMutation(ctx, args);
    return await upsertCalendarTargetDate(ctx, {
      auth,
      buildId: args.buildId,
      dateKind: "evidenceDue",
      entityKey: args.milestoneKey ?? "evidence",
      entityType: "evidencePackage",
      milestoneKey: args.milestoneKey,
      proposalId: auth.proposalId,
      reason: args.reason,
      targetDate: args.targetDate,
      targetTime: args.targetTime,
      workosOrganizationId: args.workosOrganizationId,
    });
  })
  .public();

export const setReviewTargetDate = authenticatedMutation
  .input(targetDateMutationInput)
  .returns(v.id("calendarTargetDates"))
  .handler(async (ctx, args) => {
    const auth = await authorizeCalendarTargetMutation(ctx, args);
    return await upsertCalendarTargetDate(ctx, {
      auth,
      buildId: args.buildId,
      dateKind: "reviewTarget",
      entityKey: args.milestoneKey ?? "review",
      entityType: "review",
      milestoneKey: args.milestoneKey,
      proposalId: auth.proposalId,
      reason: args.reason,
      targetDate: args.targetDate,
      targetTime: args.targetTime,
      workosOrganizationId: args.workosOrganizationId,
    });
  })
  .public();

export const setAdminDecisionTargetDate = authenticatedMutation
  .input(targetDateMutationInput)
  .returns(v.id("calendarTargetDates"))
  .handler(async (ctx, args) => {
    const auth = await authorizeCalendarTargetMutation(ctx, args);
    return await upsertCalendarTargetDate(ctx, {
      auth,
      buildId: args.buildId,
      dateKind: "adminDecisionTarget",
      entityKey: args.milestoneKey ?? "adminDecision",
      entityType: "adminDecision",
      milestoneKey: args.milestoneKey,
      proposalId: auth.proposalId,
      reason: args.reason,
      targetDate: args.targetDate,
      targetTime: args.targetTime,
      workosOrganizationId: args.workosOrganizationId,
    });
  })
  .public();

export const setDrawReleaseTargetDate = authenticatedMutation
  .input(targetDateMutationInput)
  .returns(v.id("calendarTargetDates"))
  .handler(async (ctx, args) => {
    const auth = await authorizeCalendarTargetMutation(ctx, args);
    requireReason(args.reason ?? "");
    return await upsertCalendarTargetDate(ctx, {
      auth,
      buildId: args.buildId,
      dateKind: "drawReleaseTarget",
      drawKey: args.drawKey,
      entityKey: args.drawKey ?? "draw",
      entityType: "draw",
      proposalId: auth.proposalId,
      reason: args.reason,
      targetDate: args.targetDate,
      targetTime: args.targetTime,
      workosOrganizationId: args.workosOrganizationId,
    });
  })
  .public();

async function normalizeReminderParticipants(
  ctx: QueryCtx | MutationCtx,
  input: {
    auth: { brokerage: Doc<"brokerages"> };
    participants?: Array<{
      builderProfileId?: Id<"builderProfiles">;
      contractorId?: Id<"contractorProfiles">;
      displayName?: string;
      email?: string;
      participantType:
        | "builderProfile"
        | "contractorProfile"
        | "externalEmail"
        | "workosUser";
      role?: string;
      workosUserId?: string;
    }>;
    workosOrganizationId: string;
  },
) {
  const normalized = [];
  const seen = new Set<string>();
  for (const participant of input.participants ?? []) {
    if (participant.participantType === "workosUser") {
      const workosUserId = normalizeOptionalString(participant.workosUserId);
      if (!workosUserId) {
        throw new Error("WorkOS invitee requires a user id.");
      }
      const membership = await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_user", (q) => q.eq("workosUserId", workosUserId))
        .filter((q) =>
          q.eq(q.field("workosOrganizationId"), input.workosOrganizationId),
        )
        .first();
      if (membership && membership.status !== "active") {
        throw new Error("Calendar invitee is not an active workspace member.");
      }
      const user = await getWorkosUserById(ctx, workosUserId);
      const key = `workos:${workosUserId}`;
      if (!seen.has(key)) {
        seen.add(key);
        normalized.push({
          displayName:
            normalizeOptionalString(participant.displayName) ??
            user?.name ??
            user?.email ??
            workosUserId,
          email: normalizeOptionalString(participant.email) ?? user?.email,
          participantType: "workosUser" as const,
          role: normalizeOptionalString(participant.role),
          workosUserId,
        });
      }
      continue;
    }
    if (participant.participantType === "builderProfile") {
      if (!participant.builderProfileId) {
        throw new Error("Builder invitee requires a builder profile id.");
      }
      const builder = await ctx.db.get(participant.builderProfileId);
      if (
        !builder ||
        builder.brokerageId !== input.auth.brokerage._id ||
        builder.status !== "active"
      ) {
        throw new Error("Calendar builder invitee is outside this workspace.");
      }
      const key = `builder:${participant.builderProfileId}`;
      if (!seen.has(key)) {
        seen.add(key);
        normalized.push({
          builderProfileId: participant.builderProfileId,
          displayName:
            normalizeOptionalString(participant.displayName) ??
            builder.displayName,
          participantType: "builderProfile" as const,
          role: normalizeOptionalString(participant.role) ?? "builder",
        });
      }
      continue;
    }
    if (participant.participantType === "contractorProfile") {
      if (!participant.contractorId) {
        throw new Error("Contractor invitee requires a contractor id.");
      }
      const contractor = await ctx.db.get(participant.contractorId);
      if (
        !contractor ||
        contractor.brokerageId !== input.auth.brokerage._id ||
        contractor.status !== "active"
      ) {
        throw new Error(
          "Calendar contractor invitee is outside this workspace.",
        );
      }
      const key = `contractor:${participant.contractorId}`;
      if (!seen.has(key)) {
        seen.add(key);
        normalized.push({
          contractorId: participant.contractorId,
          displayName:
            normalizeOptionalString(participant.displayName) ?? contractor.name,
          email: normalizeOptionalString(participant.email) ?? contractor.email,
          participantType: "contractorProfile" as const,
          role: normalizeOptionalString(participant.role) ?? "contractor",
          workosUserId: contractor.accountWorkosUserId,
        });
      }
      continue;
    }
    const email = normalizeOptionalString(participant.email);
    if (!(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw new Error("External invitee requires a valid email.");
    }
    const key = `email:${email.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push({
        displayName: normalizeOptionalString(participant.displayName) ?? email,
        email,
        participantType: "externalEmail" as const,
        role: normalizeOptionalString(participant.role),
      });
    }
  }
  return normalized.slice(0, 50);
}

function normalizeReminderDateRange(input: {
  endsAt?: string;
  startsAt: string;
}) {
  const startsAt = normalizeIsoDate(
    input.startsAt,
    "Reminder start date is invalid.",
  );
  const endsAt = input.endsAt
    ? normalizeIsoDate(input.endsAt, "Reminder end date is invalid.")
    : undefined;
  if (endsAt && endsAt < startsAt) {
    throw new Error("Reminder end date cannot be before start date.");
  }
  return { endsAt, startsAt };
}

export const listProposalCalendarAssignableParticipants = authenticatedQuery
  .input({
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    const participants: any[] = [];
    const addWorkosUser = async (workosUserId: string, role: string) => {
      if (
        participants.some(
          (participant) => participant.key === `workos:${workosUserId}`,
        )
      ) {
        return;
      }
      const user = await getWorkosUserById(ctx, workosUserId);
      participants.push({
        displayName: user?.name ?? user?.email ?? workosUserId,
        email: user?.email,
        key: `workos:${workosUserId}`,
        participantType: "workosUser",
        role,
        workosUserId,
      });
    };
    await addWorkosUser(auth.proposal.createdByWorkosUserId, "creator");
    if (auth.proposal.assignedBrokerWorkosUserId) {
      await addWorkosUser(auth.proposal.assignedBrokerWorkosUserId, "broker");
    }
    if (auth.proposal.builderProfileId) {
      const builder = await ctx.db.get(auth.proposal.builderProfileId);
      if (builder) {
        participants.push({
          builderProfileId: builder._id,
          displayName: builder.displayName,
          key: `builder:${builder._id}`,
          participantType: "builderProfile",
          role: "builder",
        });
        const builderAccounts = await builderAccountSummaries(ctx, builder._id);
        for (const account of builderAccounts) {
          await addWorkosUser(account.workosUserId, `builder ${account.role}`);
        }
      }
    }
    const proposalContractors = (await collectByIndex(
      ctx,
      "proposalContractorAssignments",
      "by_proposal",
      args.proposalId,
    )) as Doc<"proposalContractorAssignments">[];
    for (const assignment of proposalContractors) {
      const contractor = (await ctx.db.get(
        assignment.contractorId,
      )) as Doc<"contractorProfiles"> | null;
      if (!contractor || contractor.status !== "active") {
        continue;
      }
      participants.push({
        contractorId: contractor._id,
        displayName: contractor.name,
        email: contractor.email,
        key: `contractor:${contractor._id}`,
        participantType: "contractorProfile",
        role: assignment.role,
        workosUserId: contractor.accountWorkosUserId,
      });
    }
    return participants;
  })
  .public();

export const createProposalReminderCalendarEvent = authenticatedMutation
  .input(calendarReminderEventInput)
  .returns(v.id("calendarReminderEvents"))
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProposalAppPermission(ctx, auth, "reminder", "create");
    const title = normalizeOptionalString(args.title);
    if (!title) {
      throw new Error("Reminder title is required.");
    }
    const dates = normalizeReminderDateRange(args);
    const now = Date.now();
    const eventId = await ctx.db.insert("calendarReminderEvents", {
      allDay: args.allDay ?? true,
      assignedParticipants: await normalizeReminderParticipants(ctx, {
        auth,
        participants: args.assignedParticipants,
        workosOrganizationId: args.workosOrganizationId,
      }),
      brokerageId: auth.brokerage._id,
      createdAt: now,
      createdByWorkosUserId: auth.subject,
      description: normalizeOptionalString(args.description),
      endsAt: dates.endsAt,
      externalEventId: normalizeOptionalString(args.externalEventId),
      externalProvider: args.externalProvider,
      location: normalizeOptionalString(args.location),
      organizationId: args.workosOrganizationId,
      proposalId: args.proposalId,
      source: args.source ?? "drawflow",
      startsAt: dates.startsAt,
      status: "active",
      timezone: normalizeOptionalString(args.timezone) ?? "America/Toronto",
      title,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "createProposalReminderCalendarEvent",
      eventType: "calendar.reminder.created",
      newState: JSON.stringify({ eventId, title }),
      proposalId: args.proposalId,
    });
    return eventId;
  })
  .public();

export const updateProposalReminderCalendarEvent = authenticatedMutation
  .input({
    ...calendarReminderEventInput,
    eventId: v.id("calendarReminderEvents"),
    status: v.optional(v.union(v.literal("active"), v.literal("cancelled"))),
  })
  .returns(v.id("calendarReminderEvents"))
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProposalAppPermission(ctx, auth, "reminder", "update");
    const existing = await ctx.db.get(args.eventId);
    if (!existing || existing.proposalId !== args.proposalId) {
      throw new Error("Reminder calendar event not found.");
    }
    const title = normalizeOptionalString(args.title);
    if (!title) {
      throw new Error("Reminder title is required.");
    }
    const dates = normalizeReminderDateRange(args);
    const now = Date.now();
    const next = {
      allDay: args.allDay ?? existing.allDay,
      assignedParticipants: await normalizeReminderParticipants(ctx, {
        auth,
        participants: args.assignedParticipants,
        workosOrganizationId: args.workosOrganizationId,
      }),
      description: normalizeOptionalString(args.description),
      endsAt: dates.endsAt,
      externalEventId:
        normalizeOptionalString(args.externalEventId) ??
        existing.externalEventId,
      externalProvider: args.externalProvider ?? existing.externalProvider,
      location: normalizeOptionalString(args.location),
      source: args.source ?? existing.source,
      startsAt: dates.startsAt,
      status: args.status ?? existing.status,
      timezone: normalizeOptionalString(args.timezone) ?? existing.timezone,
      title,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    };
    await ctx.db.patch(args.eventId, next);
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProposalReminderCalendarEvent",
      eventType: "calendar.reminder.updated",
      newState: JSON.stringify(next),
      priorState: JSON.stringify(existing),
      proposalId: args.proposalId,
    });
    return args.eventId;
  })
  .public();

export const deleteProposalReminderCalendarEvent = authenticatedMutation
  .input({
    eventId: v.id("calendarReminderEvents"),
    proposalId: v.id("buildProposals"),
    reason: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProposalAppPermission(ctx, auth, "reminder", "delete");
    const existing = await ctx.db.get(args.eventId);
    if (!existing || existing.proposalId !== args.proposalId) {
      throw new Error("Reminder calendar event not found.");
    }
    await ctx.db.patch(args.eventId, {
      status: "cancelled",
      updatedAt: Date.now(),
      updatedByWorkosUserId: auth.subject,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "deleteProposalReminderCalendarEvent",
      eventType: "calendar.reminder.cancelled",
      newState: JSON.stringify({ status: "cancelled" }),
      priorState: JSON.stringify(existing),
      proposalId: args.proposalId,
      reason: args.reason,
    });
    return null;
  })
  .public();

export function activeBuildSiteVisitScheduleResponse(visit: Doc<"buildSiteVisits">) {
  return {
    evidencePackageId: visit.evidencePackageId,
    scopeBoundAt: visit.scopeBoundAt,
    workOrderId: visit.workOrderId,
    note: visit.note,
    requestedAt: visit.requestedAt,
    requestedDay: visit.requestedDay,
    requestedTime: visit.requestedTime,
    siteVisitGuidance: visit.siteVisitGuidance,
    status: visit.status,
    submilestoneId: visit.submilestoneId,
    submilestoneKeys: visit.submilestoneKeys,
    tokenExpiresAt: visit.tokenExpiresAt,
    url: visit.url,
    visitId: visit.visitId,
  };
}

export function activeBuildSiteVisitAssignmentResponse(
  visit: Doc<"buildSiteVisits">,
) {
  if (
    visit.evidencePackageId === undefined ||
    visit.scopeBoundAt === undefined ||
    visit.workOrderId === undefined ||
    visit.siteVisitGuidance === undefined
  ) {
    throw new Error("Assigned Site Visit response is incomplete.");
  }
  return {
    evidencePackageId: visit.evidencePackageId,
    scopeBoundAt: visit.scopeBoundAt,
    workOrderId: visit.workOrderId,
    ...(visit.note ? { note: visit.note } : {}),
    requestedAt: visit.requestedAt,
    requestedDay: visit.requestedDay,
    ...(visit.requestedTime ? { requestedTime: visit.requestedTime } : {}),
    siteVisitGuidance: visit.siteVisitGuidance,
    status: visit.status,
    submilestoneKeys: visit.submilestoneKeys ?? [],
    tokenExpiresAt: visit.tokenExpiresAt,
    url: visit.url,
    visitId: visit.visitId,
  };
}
