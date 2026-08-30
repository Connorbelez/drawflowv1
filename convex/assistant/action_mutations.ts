import type { Doc, Id, MutationCtx } from "../types";
import {
  authorizeProposal,
  authorizeActiveBuild,
  authorizeReminderTarget,
  requireProposalWrite,
  requireBackofficeWrite,
  previewItem,
  getProposalMilestone,
  getProposalMilestoneByKey,
  getBuildMilestone,
  findProposalDraw,
  getProposalDraw,
  findBuildDraw,
  getReminder,
  getSiteVisit,
  touchProposal,
  recalculateProposalBudget,
  ensureProposalPolicyLimitCoversDraws,
  writeScheduleRevision,
  writeProposalAudit,
  writeActiveBuildAudit,
  writeReminderAudit,
  collectByIndex,
} from "../assistant";
import {
  isReadonlyActionKey,
  parseTargetDateKind,
  calculateDrawAvailability,
  validateDayRange,
  normalizeIsoDate,
  requiredString,
  optionalString,
  requiredNumber,
  requiredPositiveCents,
  requiredNonNegativeDay,
  requiredReason,
  requireReason,
  sanitizeForPersistence,
} from "./inputs";
import {
  applyBuildProposalFromSetup,
  applyCatalogDomainMutation,
} from "./mutations";
import {
  type ActiveBuildAuth,
  type AssistantActionInput,
  type AssistantActionKey,
  type AssistantAuth,
  type AssistantPlanItem,
} from "./contracts";

export async function applyAcceptedAction(
  ctx: MutationCtx,
  auth: AssistantAuth,
  item: AssistantPlanItem
) {
  switch (item.actionKey) {
    case "create_build_proposal_from_setup":
      return await applyBuildProposalFromSetup(ctx, auth, item.input);
    case "update_proposal_milestone_schedule":
      return await applyProposalMilestoneSchedule(ctx, auth, item.input);
    case "update_proposal_milestone_budget":
      return await applyProposalMilestoneBudget(ctx, auth, item.input);
    case "create_proposal_planned_draw":
      return await applyCreateProposalDraw(ctx, auth, item.input);
    case "update_proposal_planned_draw":
      return await applyUpdateProposalDraw(ctx, auth, item.input);
    case "delete_proposal_planned_draw":
      return await applyDeleteProposalDraw(ctx, auth, item.input);
    case "create_proposal_reminder":
      return await applyCreateReminder(ctx, auth, item.input);
    case "update_proposal_reminder":
      return await applyUpdateReminder(ctx, auth, item.input);
    case "cancel_proposal_reminder":
      return await applyCancelReminder(ctx, auth, item.input);
    case "set_calendar_target_date":
      return await applyCalendarTargetDate(ctx, auth, item.input);
    case "schedule_active_build_site_visit":
      return await applyScheduleSiteVisit(ctx, auth, item.input);
    case "reschedule_active_build_site_visit":
      return await applyRescheduleSiteVisit(ctx, auth, item.input);
    case "cancel_active_build_site_visit":
      return await applyCancelSiteVisit(ctx, auth, item.input);
    case "request_active_build_milestone_schedule_revision":
    case "request_active_build_milestone_budget_revision":
    case "request_active_build_draw_plan_revision":
      return await applyActiveBuildRevisionRequest(ctx, auth, item);
    default:
      if (isReadonlyActionKey(item.actionKey)) {
        return { readOnly: true };
      }
      return await applyCatalogDomainMutation(ctx, auth, item);
  }
}

export async function applyProposalMilestoneSchedule(
  ctx: MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
) {
  const proposalAuth = await authorizeProposal(ctx, auth, input);
  requireProposalWrite(proposalAuth);
  const milestone = await getProposalMilestone(
    ctx,
    input,
    proposalAuth.proposal._id
  );
  const dayStart = Math.round(requiredNumber(input.dayStart, "dayStart"));
  const dayEnd = Math.round(requiredNumber(input.dayEnd, "dayEnd"));
  validateDayRange(dayStart, dayEnd);
  const now = Date.now();
  const priorState = {
    dayEnd: milestone.dayEnd,
    dayStart: milestone.dayStart,
    durationDays: milestone.durationDays,
  };
  const newState = {
    dayEnd,
    dayStart,
    durationDays: Math.max(1, dayEnd - dayStart),
  };
  await ctx.db.patch(milestone._id, { ...newState, updatedAt: now });
  await touchProposal(ctx, proposalAuth, now);
  await writeProposalAudit(ctx, proposalAuth, {
    command: "assistant.commit.update_proposal_milestone_schedule",
    entityId: String(milestone._id),
    entityType: "proposalMilestone",
    eventType: "assistant.proposal.milestone.schedule_updated",
    newState,
    priorState,
    reason: optionalString(input.reason),
  });
  await writeScheduleRevision(ctx, proposalAuth, {
    entityKey: milestone.key,
    entityType: "proposalMilestone",
    newState,
    priorState,
    reason:
      optionalString(input.reason) ??
      "Assistant HITL proposal schedule update.",
    revisionType: "assistant.proposal.milestone.schedule",
  });
  return { milestoneId: milestone._id };
}

export async function applyProposalMilestoneBudget(
  ctx: MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
) {
  const proposalAuth = await authorizeProposal(ctx, auth, input);
  requireProposalWrite(proposalAuth);
  const milestone = await getProposalMilestone(
    ctx,
    input,
    proposalAuth.proposal._id
  );
  const budgetCents = requiredPositiveCents(
    input.budgetCents,
    "Milestone budget must be greater than zero."
  );
  const drawAvailabilityCents = calculateDrawAvailability(
    budgetCents,
    proposalAuth.proposal.borrowerCoPayBps
  );
  const now = Date.now();
  const priorState = {
    budgetCents: milestone.budgetCents,
    drawAvailabilityCents: milestone.drawAvailabilityCents,
  };
  const newState = { budgetCents, drawAvailabilityCents };
  await ctx.db.patch(milestone._id, { ...newState, updatedAt: now });
  await recalculateProposalBudget(ctx, proposalAuth, now);
  await writeProposalAudit(ctx, proposalAuth, {
    command: "assistant.commit.update_proposal_milestone_budget",
    entityId: String(milestone._id),
    entityType: "proposalMilestone",
    eventType: "assistant.proposal.milestone.budget_updated",
    newState,
    priorState,
    reason: optionalString(input.reason),
  });
  return { milestoneId: milestone._id };
}

export async function applyCreateProposalDraw(
  ctx: MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
) {
  const proposalAuth = await authorizeProposal(ctx, auth, input);
  requireProposalWrite(proposalAuth);
  const drawKey = requiredString(input.drawKey, "drawKey");
  if (await findProposalDraw(ctx, proposalAuth.proposal._id, drawKey)) {
    throw new Error("Proposal draw already exists.");
  }
  const amountCents = requiredPositiveCents(
    input.amountCents,
    "Draw amount must be greater than zero."
  );
  const timingDay = requiredNonNegativeDay(input.timingDay, "timingDay");
  const milestoneKey = optionalString(input.milestoneKey);
  const milestone = milestoneKey
    ? await getProposalMilestoneByKey(
        ctx,
        proposalAuth.proposal._id,
        milestoneKey
      )
    : null;
  const draws = await collectByIndex(
    ctx,
    "proposalDrawScheduleRows",
    "by_proposal",
    proposalAuth.proposal._id
  );
  const now = Date.now();
  const drawId = await ctx.db.insert("proposalDrawScheduleRows", {
    amountCents,
    brokerageId: proposalAuth.brokerage._id,
    createdAt: now,
    customDate: true,
    drawKey,
    label: optionalString(input.label) ?? "Reimbursement draw",
    ...(milestoneKey ? { milestoneKey } : {}),
    order:
      typeof input.order === "number"
        ? Math.max(1, Math.round(input.order))
        : draws.length + 1,
    organizationId: proposalAuth.organizationId,
    proposalId: proposalAuth.proposal._id,
    ...(milestone ? { proposalMilestoneId: milestone._id } : {}),
    source: "manual",
    timingDay,
    updatedAt: now,
  });
  await ensureProposalPolicyLimitCoversDraws(ctx, proposalAuth, now);
  await writeProposalAudit(ctx, proposalAuth, {
    command: "assistant.commit.create_proposal_planned_draw",
    entityId: String(drawId),
    entityType: "proposalDrawScheduleRow",
    eventType: "assistant.proposal.draw.created",
    newState: input,
    reason: optionalString(input.reason),
  });
  return { drawId };
}

export async function applyUpdateProposalDraw(
  ctx: MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
) {
  const proposalAuth = await authorizeProposal(ctx, auth, input);
  requireProposalWrite(proposalAuth);
  const draw = await getProposalDraw(ctx, input, proposalAuth.proposal._id);
  const milestoneKey = optionalString(input.milestoneKey);
  const milestone = milestoneKey
    ? await getProposalMilestoneByKey(
        ctx,
        proposalAuth.proposal._id,
        milestoneKey
      )
    : null;
  const patch = {
    ...(input.amountCents === undefined
      ? {}
      : {
          amountCents: requiredPositiveCents(
            input.amountCents,
            "Draw amount must be greater than zero."
          ),
        }),
    ...(input.label === undefined
      ? {}
      : { label: requiredString(input.label, "label") }),
    ...(milestoneKey ? { milestoneKey } : {}),
    ...(milestone ? { proposalMilestoneId: milestone._id } : {}),
    ...(input.order === undefined
      ? {}
      : {
          order: Math.max(1, Math.round(requiredNumber(input.order, "order"))),
        }),
    ...(input.timingDay === undefined
      ? {}
      : {
          customDate: true,
          timingDay: requiredNonNegativeDay(input.timingDay, "timingDay"),
        }),
    updatedAt: Date.now(),
  };
  await ctx.db.patch(draw._id, patch);
  await ensureProposalPolicyLimitCoversDraws(ctx, proposalAuth, Date.now());
  await writeProposalAudit(ctx, proposalAuth, {
    command: "assistant.commit.update_proposal_planned_draw",
    entityId: String(draw._id),
    entityType: "proposalDrawScheduleRow",
    eventType: "assistant.proposal.draw.updated",
    newState: patch,
    priorState: draw,
    reason: optionalString(input.reason),
  });
  return { drawId: draw._id };
}

export async function applyDeleteProposalDraw(
  ctx: MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
) {
  const proposalAuth = await authorizeProposal(ctx, auth, input);
  requireProposalWrite(proposalAuth);
  const draw = await getProposalDraw(ctx, input, proposalAuth.proposal._id);
  await ctx.db.delete(draw._id);
  await writeProposalAudit(ctx, proposalAuth, {
    command: "assistant.commit.delete_proposal_planned_draw",
    entityId: String(draw._id),
    entityType: "proposalDrawScheduleRow",
    eventType: "assistant.proposal.draw.deleted",
    priorState: draw,
    reason: requiredReason(input.reason),
  });
  return { drawId: draw._id };
}

export async function previewReminderAction(
  ctx: MutationCtx,
  auth: AssistantAuth,
  action: {
    actionKey: AssistantActionKey;
    clientRequestId: string;
    input: AssistantActionInput;
  }
) {
  const targetAuth = await authorizeReminderTarget(ctx, auth, action.input);
  if ("build" in targetAuth) {
    // Live-build reminders do not mutate schedule, draw, or approval state.
  } else {
    requireProposalWrite(targetAuth);
  }
  const event =
    action.actionKey === "create_proposal_reminder"
      ? null
      : await getReminder(ctx, action.input, targetAuth);
  if (action.actionKey !== "cancel_proposal_reminder") {
    requiredString(action.input.title, "Reminder title is required.");
    normalizeIsoDate(action.input.startsAt, "Reminder start date is invalid.");
    if (action.input.endsAt !== undefined) {
      normalizeIsoDate(action.input.endsAt, "Reminder end date is invalid.");
    }
  }
  return previewItem(action, {
    after: action.input,
    before: event,
    entityLabel:
      optionalString(action.input.title) ??
      event?.title ??
      "Reminder-only calendar event",
    entityType: "calendarReminderEvent",
    mutationName: `assistant.${action.actionKey}`,
    reasonRequired: action.actionKey === "cancel_proposal_reminder",
  });
}

export async function applyCreateReminder(
  ctx: MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
) {
  const targetAuth = await authorizeReminderTarget(ctx, auth, input);
  if (!("build" in targetAuth)) {
    requireProposalWrite(targetAuth);
  }
  const title = requiredString(input.title, "Reminder title is required.");
  const startsAt = normalizeIsoDate(
    input.startsAt,
    "Reminder start date is invalid."
  );
  const endsAt =
    input.endsAt === undefined
      ? undefined
      : normalizeIsoDate(input.endsAt, "Reminder end date is invalid.");
  if (endsAt && endsAt < startsAt) {
    throw new Error("Reminder end date cannot be before start date.");
  }
  const now = Date.now();
  const eventId = await ctx.db.insert("calendarReminderEvents", {
    allDay: typeof input.allDay === "boolean" ? input.allDay : true,
    assignedParticipants: [],
    brokerageId: targetAuth.brokerage._id,
    ...("build" in targetAuth ? { buildId: targetAuth.build._id } : {}),
    createdAt: now,
    createdByWorkosUserId: targetAuth.subject,
    description: optionalString(input.description),
    ...(endsAt ? { endsAt } : {}),
    location: optionalString(input.location),
    organizationId: targetAuth.organizationId,
    proposalId: targetAuth.proposal._id,
    source: "drawflow",
    startsAt,
    status: "active",
    timezone: optionalString(input.timezone) ?? "America/Toronto",
    title,
    updatedAt: now,
    updatedByWorkosUserId: targetAuth.subject,
  });
  await writeReminderAudit(ctx, targetAuth, {
    command: "assistant.commit.create_proposal_reminder",
    entityId: String(eventId),
    entityType: "calendarReminderEvent",
    eventType: "assistant.calendar.reminder.created",
    newState: input,
  });
  return { eventId };
}

export async function applyUpdateReminder(
  ctx: MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
) {
  const targetAuth = await authorizeReminderTarget(ctx, auth, input);
  if (!("build" in targetAuth)) {
    requireProposalWrite(targetAuth);
  }
  const event = await getReminder(ctx, input, targetAuth);
  const startsAt =
    input.startsAt === undefined
      ? event.startsAt
      : normalizeIsoDate(input.startsAt, "Reminder start date is invalid.");
  const endsAt =
    input.endsAt === undefined
      ? event.endsAt
      : normalizeIsoDate(input.endsAt, "Reminder end date is invalid.");
  const patch = {
    ...(input.allDay === undefined ? {} : { allDay: Boolean(input.allDay) }),
    ...(input.description === undefined
      ? {}
      : { description: optionalString(input.description) }),
    ...(endsAt ? { endsAt } : {}),
    ...(input.location === undefined
      ? {}
      : { location: optionalString(input.location) }),
    startsAt,
    ...(input.timezone === undefined
      ? {}
      : { timezone: optionalString(input.timezone) ?? event.timezone }),
    ...(input.title === undefined
      ? {}
      : { title: requiredString(input.title, "Reminder title is required.") }),
    updatedAt: Date.now(),
    updatedByWorkosUserId: targetAuth.subject,
  };
  await ctx.db.patch(event._id, patch);
  await writeReminderAudit(ctx, targetAuth, {
    command: "assistant.commit.update_proposal_reminder",
    entityId: String(event._id),
    entityType: "calendarReminderEvent",
    eventType: "assistant.calendar.reminder.updated",
    newState: patch,
    priorState: event,
  });
  return { eventId: event._id };
}

export async function applyCancelReminder(
  ctx: MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
) {
  const targetAuth = await authorizeReminderTarget(ctx, auth, input);
  if (!("build" in targetAuth)) {
    requireProposalWrite(targetAuth);
  }
  const event = await getReminder(ctx, input, targetAuth);
  await ctx.db.patch(event._id, {
    status: "cancelled",
    updatedAt: Date.now(),
    updatedByWorkosUserId: targetAuth.subject,
  });
  await writeReminderAudit(ctx, targetAuth, {
    command: "assistant.commit.cancel_proposal_reminder",
    entityId: String(event._id),
    entityType: "calendarReminderEvent",
    eventType: "assistant.calendar.reminder.cancelled",
    newState: { status: "cancelled" },
    priorState: event,
    reason: optionalString(input.reason),
  });
  return { eventId: event._id };
}

export async function previewTargetDateAction(
  ctx: MutationCtx,
  auth: AssistantAuth,
  action: {
    actionKey: AssistantActionKey;
    clientRequestId: string;
    input: AssistantActionInput;
  }
) {
  const targetAuth = action.input.buildId
    ? await authorizeActiveBuild(ctx, auth, action.input)
    : await authorizeProposal(ctx, auth, action.input);
  if ("build" in targetAuth) {
    requireBackofficeWrite(targetAuth.roles);
  } else {
    requireProposalWrite(targetAuth);
  }
  const dateKind = parseTargetDateKind(action.input.dateKind);
  if (dateKind === "drawReleaseTarget") {
    requireReason(action.input.reason);
  }
  normalizeIsoDate(action.input.targetDate, "Target date is invalid.");
  return previewItem(action, {
    after: action.input,
    before: null,
    entityLabel: `${dateKind} target`,
    entityType: "calendarTargetDate",
    mutationName: "assistant.setCalendarTargetDate",
    reasonRequired: dateKind === "drawReleaseTarget",
  });
}

export async function applyCalendarTargetDate(
  ctx: MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
) {
  const targetAuth = input.buildId
    ? await authorizeActiveBuild(ctx, auth, input)
    : await authorizeProposal(ctx, auth, input);
  if ("build" in targetAuth) {
    requireBackofficeWrite(targetAuth.roles);
  } else {
    requireProposalWrite(targetAuth);
  }
  const proposal = targetAuth.proposal;
  const build: Doc<"activeBuilds"> | undefined =
    "build" in targetAuth ? (targetAuth as ActiveBuildAuth).build : undefined;
  const dateKind = parseTargetDateKind(input.dateKind);
  const targetDate = normalizeIsoDate(
    input.targetDate,
    "Target date is invalid."
  );
  const entityKey =
    optionalString(input.drawKey) ??
    optionalString(input.milestoneKey) ??
    dateKind;
  const entityType = optionalString(input.drawKey)
    ? "draw"
    : optionalString(input.milestoneKey)
      ? "milestone"
      : dateKind;
  const existing = await ctx.db
    .query("calendarTargetDates")
    .withIndex("by_entity", (q) =>
      q
        .eq("entityType", entityType)
        .eq("entityKey", entityKey)
        .eq("dateKind", dateKind)
    )
    .collect()
    .then((rows) =>
      rows.find(
        (row) =>
          String(row.buildId ?? "") === String(build?._id ?? "") &&
          String(row.proposalId ?? "") === String(proposal._id)
      )
    );
  const now = Date.now();
  const payload: {
    brokerageId: Id<"brokerages">;
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
    organizationId: string;
    proposalId: Id<"buildProposals">;
    reason?: string;
    targetDate: string;
    targetTime?: string;
    updatedAt: number;
  } = {
    brokerageId: targetAuth.brokerage._id,
    ...(build ? { buildId: build._id } : {}),
    dateKind,
    drawKey: optionalString(input.drawKey),
    entityKey,
    entityType,
    milestoneKey: optionalString(input.milestoneKey),
    organizationId: targetAuth.organizationId,
    proposalId: proposal._id,
    reason: optionalString(input.reason),
    targetDate,
    targetTime: optionalString(input.targetTime),
    updatedAt: now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return { targetDateId: existing._id };
  }
  const targetDateId = await ctx.db.insert("calendarTargetDates", {
    ...payload,
    createdAt: now,
  });
  return { targetDateId };
}

export async function applyScheduleSiteVisit(
  ctx: MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
) {
  const buildAuth = await authorizeActiveBuild(ctx, auth, input);
  requireBackofficeWrite(buildAuth.roles);
  const milestone = await getBuildMilestone(ctx, input, buildAuth.build._id);
  const requestedDay = requiredNonNegativeDay(
    input.requestedDay,
    "requestedDay"
  );
  const now = Date.now();
  const visitId = `assistant_visit_${milestone.key}_${now}`;
  const visit = {
    brokerageId: buildAuth.brokerage._id,
    buildId: buildAuth.build._id,
    buildMilestoneId: milestone._id,
    createdAt: now,
    milestoneKey: milestone.key,
    note: optionalString(input.note),
    organizationId: buildAuth.organizationId,
    requestedAt: new Date(now).toISOString(),
    requestedDay,
    status: "requested" as const,
    tokenExpiresAt: now + 60 * 60 * 1000,
    updatedAt: now,
    url: `/newsitevisit/${String(buildAuth.build._id)}/${visitId}`,
    visitId,
  };
  const siteVisitId = await ctx.db.insert("buildSiteVisits", visit);
  await writeActiveBuildAudit(ctx, buildAuth, {
    command: "assistant.commit.schedule_active_build_site_visit",
    entityId: String(siteVisitId),
    entityType: "buildSiteVisit",
    eventType: "assistant.active_build.site_visit.scheduled",
    newState: visit,
    reason: optionalString(input.note),
  });
  return { siteVisitId };
}

export async function applyRescheduleSiteVisit(
  ctx: MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
) {
  const buildAuth = await authorizeActiveBuild(ctx, auth, input);
  requireBackofficeWrite(buildAuth.roles);
  const visit = await getSiteVisit(ctx, input, buildAuth.build._id);
  const requestedDay = requiredNonNegativeDay(
    input.requestedDay,
    "requestedDay"
  );
  const patch = {
    note: optionalString(input.reason) ?? visit.note,
    requestedDay,
    updatedAt: Date.now(),
  };
  await ctx.db.patch(visit._id, patch);
  await writeActiveBuildAudit(ctx, buildAuth, {
    command: "assistant.commit.reschedule_active_build_site_visit",
    entityId: String(visit._id),
    entityType: "buildSiteVisit",
    eventType: "assistant.active_build.site_visit.rescheduled",
    newState: patch,
    priorState: visit,
    reason: requiredReason(input.reason),
  });
  return { siteVisitId: visit._id };
}

export async function applyCancelSiteVisit(
  ctx: MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
) {
  const buildAuth = await authorizeActiveBuild(ctx, auth, input);
  requireBackofficeWrite(buildAuth.roles);
  const visit = await getSiteVisit(ctx, input, buildAuth.build._id);
  await ctx.db.patch(visit._id, {
    status: "cancelled",
    updatedAt: Date.now(),
  });
  await writeActiveBuildAudit(ctx, buildAuth, {
    command: "assistant.commit.cancel_active_build_site_visit",
    entityId: String(visit._id),
    entityType: "buildSiteVisit",
    eventType: "assistant.active_build.site_visit.cancelled",
    newState: { status: "cancelled" },
    priorState: visit,
    reason: requiredReason(input.reason),
  });
  return { siteVisitId: visit._id };
}

export async function applyActiveBuildRevisionRequest(
  ctx: MutationCtx,
  auth: AssistantAuth,
  item: AssistantPlanItem
) {
  const input = item.input;
  const buildAuth = await authorizeActiveBuild(ctx, auth, input);
  requireBackofficeWrite(buildAuth.roles);
  const now = Date.now();
  const reason = requiredReason(input.reason);
  let entityKey = "";
  let entityType = "";
  let priorState: unknown = null;
  let revisionType = "";

  if (item.actionKey === "request_active_build_draw_plan_revision") {
    entityKey = optionalString(input.drawKey) ?? "new-draw";
    entityType = "plannedDrawScheduleRow";
    priorState = await findBuildDraw(ctx, buildAuth.build._id, entityKey);
    revisionType = "assistant.active_build.draw_plan_request";
  } else {
    const milestone = await getBuildMilestone(ctx, input, buildAuth.build._id);
    entityKey = milestone.key;
    entityType = "buildMilestone";
    priorState = milestone;
    revisionType =
      item.actionKey === "request_active_build_milestone_budget_revision"
        ? "assistant.active_build.milestone.budget_request"
        : "assistant.active_build.milestone.schedule_request";
  }

  const revisionId = await ctx.db.insert("scheduleRevisionRecords", {
    brokerageId: buildAuth.brokerage._id,
    buildId: buildAuth.build._id,
    createdAt: now,
    entityKey,
    entityType,
    newState: sanitizeForPersistence(input),
    organizationId: buildAuth.organizationId,
    priorState: sanitizeForPersistence(priorState),
    proposalId: buildAuth.proposal._id,
    reason,
    revisionType,
    revisedByWorkosUserId: buildAuth.subject,
    warnings: ["assistant-request-only"],
  });
  await writeActiveBuildAudit(ctx, buildAuth, {
    command: `assistant.commit.${item.actionKey}`,
    entityId: String(revisionId),
    entityType,
    eventType: revisionType,
    newState: input,
    priorState,
    reason,
    warnings: ["assistant-request-only"],
  });
  return { revisionId };
}
