/**
 * Production proposals site visit calendar bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { ConvexError, v } from "convex/values";
import { authenticatedMutation } from "../authz";
import { normalizeOperationalIdempotencyKey, operationalRequestFingerprint } from "../build_operational_idempotency";
import { publicQuery } from "../fluent";
import { type Doc, type QueryCtx } from "../types";
import { addDaysIso } from "./active_capital_evidence.js";
import { getActiveBuildMilestoneOrThrow } from "./active_planning.js";
import { authorizeBrokerage, authorizeActiveBuildOrThrow, requireBackofficeActiveBuildWrite, getPrimaryLoanFacility, authorizeProposal } from "./authorization_core.js";
import { calendarProviderInput, calendarSurfaceInput, calendarTimeframeInput, proposalCalendarBaseDate, calendarEventId, proposalCalendarMilestoneEvent, proposalCalendarDrawEvent } from "./calendar_contracts.js";
import { calendarTargetDateEvent, calendarReminderEvent, activeBuildSiteVisitScheduleResponse } from "./calendar_scheduling.js";
import { normalizeOptionalString, activeBuildCompletionReviewWithSiteVisit } from "./contractor_policy_helpers.js";
import { siteVisitGuidanceSectionInput, productionSettingsSiteVisitGuidanceInput } from "./contracts_foundation.js";
import { writeProposalEvent, writeActiveBuildEvent } from "./proposal_copy_audit.js";
import { requireReason } from "./proposal_lender_approval.js";
import { normalizeIsoDate } from "./roster_projection_helpers.js";
import { resolveActiveBuildSiteVisitConfiguration, saveSiteVisitCanonicalGuidance, insertSiteVisitGuidanceSnapshots } from "./site_visit_helpers.js";
import { collectByIndex } from "./storage_helpers.js";

export const scheduleActiveBuildSiteVisit = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    idempotencyKey: v.string(),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    requestedDay: v.number(),
    requestedTime: v.optional(v.string()),
    siteVisitGuidance: v.optional(productionSettingsSiteVisitGuidanceInput),
    submilestoneKeys: v.optional(v.array(v.string())),
    submilestoneGuidanceSections: v.optional(
      v.array(siteVisitGuidanceSectionInput),
    ),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const idempotencyKey = normalizeOperationalIdempotencyKey(
      args.idempotencyKey,
      "Site Visit schedule idempotency key",
    );
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    const configuration = await resolveActiveBuildSiteVisitConfiguration(
      ctx,
      milestone,
      args.siteVisitGuidance,
      args.submilestoneKeys,
      args.submilestoneGuidanceSections,
      auth.build,
    );
    const requestedDay = Math.max(0, Math.round(args.requestedDay));
    const requestedTime = normalizeOptionalString(args.requestedTime);
    const note = normalizeOptionalString(args.note);
    const scheduleRequestFingerprintPayload = {
      milestoneKey: milestone.key,
      note: note ?? null,
      requestedDay,
      requestedTime: requestedTime ?? null,
      siteVisitGuidance: configuration.siteVisitGuidance,
      submilestoneGuidanceSections: configuration.guidanceSections.map(
        (section) => ({
          buildSubmilestoneId: String(section.buildSubmilestone._id),
          cameraAnglesTiptapJson: section.cameraAnglesTiptapJson,
          proposalSubmilestoneId: String(section.proposalSubmilestoneId),
          whatToVerifyTiptapJson: section.whatToVerifyTiptapJson,
        }),
      ),
      submilestoneKeys: [...configuration.submilestoneKeys].sort(),
    };
    const scheduleRequestFingerprint = await operationalRequestFingerprint({
      command: "scheduleActiveBuildSiteVisit",
      ...scheduleRequestFingerprintPayload,
    });
    // Older scheduled Visits were fingerprinted before the command discriminator
    // was added. Accept that exact legacy hash for replay, while retaining the
    // command-specific hash for all newly written rows and conflicts.
    const legacyScheduleRequestFingerprint =
      await operationalRequestFingerprint(scheduleRequestFingerprintPayload);
    const existingVisit = await ctx.db
      .query("buildSiteVisits")
      .withIndex("by_build_schedule_idempotency", (query) =>
        query
          .eq("buildId", args.buildId)
          .eq("scheduleIdempotencyKey", idempotencyKey),
      )
      .unique();
    if (existingVisit) {
      if (
        existingVisit.scheduleRequestFingerprint !== scheduleRequestFingerprint &&
        existingVisit.scheduleRequestFingerprint !== legacyScheduleRequestFingerprint
      ) {
        throw new ConvexError({
          code: "SITE_VISIT_SCHEDULE_IDEMPOTENCY_CONFLICT",
          message:
            "This Site Visit schedule idempotency key was already used for a different request.",
          recoverable: true,
        });
      }
      return activeBuildSiteVisitScheduleResponse(existingVisit);
    }
    const now = Date.now();
    const visitId = `active_visit_${args.milestoneKey}_${now}`;
    const workOrderId = `WO-${visitId}`;
    const evidencePackageId = `EP-${String(args.buildId)}-${args.milestoneKey}`;
    const siteVisit = {
      evidencePackageId,
      scopeBoundAt: now,
      workOrderId,
      note,
      requestedAt: new Date(now).toISOString(),
      requestedDay,
      requestedTime,
      siteVisitGuidance: configuration.siteVisitGuidance,
      ...(configuration.submilestoneId
        ? { submilestoneId: configuration.submilestoneId }
        : {}),
      status: "requested",
      submilestoneKeys: configuration.submilestoneKeys,
      tokenExpiresAt: now + 60 * 60 * 1000,
      url: `/newsitevisit/${String(args.buildId)}/${visitId}`,
      visitId,
    };
    await saveSiteVisitCanonicalGuidance(ctx, {
      auth,
      guidanceSections: configuration.guidanceSections,
      now,
      organizationId: args.workosOrganizationId,
    });
    const siteVisitId = await ctx.db.insert("buildSiteVisits", {
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      buildMilestoneId: milestone._id,
      collaborationEventRevision: 1,
      createdAt: now,
      evidencePackageId,
      scopeBoundAt: now,
      workOrderId,
      milestoneKey: milestone.key,
      note,
      organizationId: args.workosOrganizationId,
      requestedAt: siteVisit.requestedAt,
      requestedDay,
      requestedTime: siteVisit.requestedTime,
      scheduleIdempotencyKey: idempotencyKey,
      scheduleRequestFingerprint,
      siteVisitGuidance: configuration.siteVisitGuidance,
      ...(configuration.submilestoneId
        ? { submilestoneId: configuration.submilestoneId }
        : {}),
      status: "requested",
      submilestoneKeys: configuration.submilestoneKeys,
      tokenExpiresAt: siteVisit.tokenExpiresAt,
      updatedAt: now,
      url: siteVisit.url,
      visitId,
    });
    await insertSiteVisitGuidanceSnapshots(ctx, {
      auth,
      buildSiteVisitId: siteVisitId,
      guidanceSections: configuration.guidanceSections,
      milestone,
      now,
      organizationId: args.workosOrganizationId,
    });
    const completionReview = activeBuildCompletionReviewWithSiteVisit(
      milestone.completionReview,
      siteVisit,
      siteVisit.requestedAt,
    );
    await ctx.db.patch(milestone._id, {
      completionReview,
      evidenceState: milestone.evidenceState ?? "Site visit requested",
      siteVisitGuidance: configuration.siteVisitGuidance,
      updatedAt: now,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "scheduleActiveBuildSiteVisit",
      entityId: String(siteVisitId),
      entityType: "buildSiteVisit",
      eventType: "site_visit.scheduled",
      newState: JSON.stringify(siteVisit),
      priorState: JSON.stringify(milestone.completionReview),
      reason: args.note,
    });
    return siteVisit;
  })
  .public();

export const rescheduleActiveBuildSiteVisit = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    note: v.optional(v.string()),
    reason: v.string(),
    requestedDay: v.number(),
    requestedTime: v.optional(v.string()),
    visitId: v.string(),
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
    const visit = await ctx.db
      .query("buildSiteVisits")
      .withIndex("by_visit", (q) => q.eq("visitId", args.visitId))
      .unique();
    if (!visit || visit.buildId !== args.buildId) {
      throw new Error("Site visit not found.");
    }
    const priorState = JSON.stringify(visit);
    const requestedDay = Math.max(0, Math.round(args.requestedDay));
    const requestedTime =
      args.requestedTime === undefined
        ? visit.requestedTime
        : normalizeOptionalString(args.requestedTime);
    const scheduleChanged =
      requestedDay !== visit.requestedDay ||
      requestedTime !== visit.requestedTime;
    const collaborationEventRevision = scheduleChanged
      ? (visit.collaborationEventRevision ?? 1) + 1
      : visit.collaborationEventRevision;
    await ctx.db.patch(visit._id, {
      collaborationEventRevision,
      note: args.note ?? visit.note,
      requestedDay,
      requestedTime,
      updatedAt: Date.now(),
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "rescheduleActiveBuildSiteVisit",
      entityId: String(visit._id),
      entityType: "buildSiteVisit",
      eventType: "site_visit.rescheduled",
      newState: JSON.stringify({
        requestedDay,
        requestedTime,
        visitId: args.visitId,
      }),
      priorState,
      reason: args.reason,
    });
    return null;
  })
  .public();

export const cancelActiveBuildSiteVisit = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    reason: v.string(),
    visitId: v.string(),
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
    const visit = await ctx.db
      .query("buildSiteVisits")
      .withIndex("by_visit", (q) => q.eq("visitId", args.visitId))
      .unique();
    if (!visit || visit.buildId !== args.buildId) {
      throw new Error("Site visit not found.");
    }
    const statusChanged = visit.status !== "cancelled";
    const collaborationEventRevision = statusChanged
      ? (visit.collaborationEventRevision ?? 1) + 1
      : visit.collaborationEventRevision;
    await ctx.db.patch(visit._id, {
      collaborationEventRevision,
      status: "cancelled",
      updatedAt: Date.now(),
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "cancelActiveBuildSiteVisit",
      entityId: String(visit._id),
      entityType: "buildSiteVisit",
      eventType: "calendar.event.cancelled",
      newState: JSON.stringify({ status: "cancelled", visitId: args.visitId }),
      priorState: JSON.stringify(visit),
      reason: args.reason,
    });
    return null;
  })
  .public();

export const requestLoanFacilityDateChange = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    reason: v.string(),
    requestedPaybackDate: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("activeBuildFacilityChangeRequests"))
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireReason(args.reason);
    const loanFacility = await getPrimaryLoanFacility(ctx, args.buildId);
    if (!loanFacility) {
      throw new Error("Active build loan facility is missing.");
    }
    const requestedPaybackDate = normalizeIsoDate(
      args.requestedPaybackDate,
      "Requested payback date is required.",
    );
    const now = Date.now();
    const requestId = await ctx.db.insert("activeBuildFacilityChangeRequests", {
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      createdAt: now,
      organizationId: args.workosOrganizationId,
      priorState: {
        paybackDate: loanFacility.paybackDate,
        principalCents: loanFacility.principalCents,
      },
      proposalId: auth.proposal._id,
      reason: args.reason,
      requestedByWorkosUserId: auth.subject,
      requestedPayload: { requestedPaybackDate },
      requestType: "paybackExtension",
      status: "requested",
      updatedAt: now,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "requestLoanFacilityDateChange",
      eventType: "active_build.facility_change.requested",
      resourceType: "capitalEvent",
      newState: JSON.stringify({ requestId, requestedPaybackDate }),
      priorState: JSON.stringify({
        paybackDate: loanFacility.paybackDate,
        principalCents: loanFacility.principalCents,
      }),
      reason: args.reason,
    });
    return requestId;
  })
  .public();

export const saveCalendarView = authenticatedMutation
  .input({
    filters: v.any(),
    isDefault: v.optional(v.boolean()),
    label: v.string(),
    surface: calendarSurfaceInput,
    timeframe: calendarTimeframeInput,
    viewKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("calendarSavedViews"))
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    const now = Date.now();
    const existing = await ctx.db
      .query("calendarSavedViews")
      .withIndex("by_view_key", (q) =>
        q
          .eq("organizationId", args.workosOrganizationId)
          .eq("workosUserId", auth.subject)
          .eq("viewKey", args.viewKey),
      )
      .unique();
    const payload = {
      filters: args.filters,
      isDefault: args.isDefault ?? false,
      label: args.label.trim() || args.viewKey,
      surface: args.surface,
      timeframe: args.timeframe,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("calendarSavedViews", {
      ...payload,
      brokerageId: auth.brokerage._id,
      createdAt: now,
      organizationId: args.workosOrganizationId,
      viewKey: args.viewKey,
      workosUserId: auth.subject,
    });
  })
  .public();

export const createCalendarSyncSubscription = authenticatedMutation
  .input({
    buildId: v.optional(v.id("activeBuilds")),
    direction: v.optional(
      v.union(v.literal("outbound"), v.literal("bidirectional")),
    ),
    filters: v.any(),
    provider: calendarProviderInput,
    proposalId: v.optional(v.id("buildProposals")),
    surface: calendarSurfaceInput,
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      feedUrl: v.string(),
      subscriptionId: v.id("calendarSyncSubscriptions"),
      subscriptionKey: v.string(),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    if (args.surface === "proposal" && !args.proposalId) {
      throw new Error("Proposal calendar subscriptions require a proposal id.");
    }
    if (args.surface === "activeBuild" && !args.buildId) {
      throw new Error(
        "Active build calendar subscriptions require a build id.",
      );
    }
    if (args.surface === "proposal" && args.proposalId) {
      await authorizeProposal(ctx, args.proposalId, args.workosOrganizationId);
    }
    if (args.surface === "activeBuild" && args.buildId) {
      await authorizeActiveBuildOrThrow(
        ctx,
        args.buildId,
        args.workosOrganizationId,
      );
    }
    const now = Date.now();
    const subscriptionKey = `cal_${args.provider}_${auth.subject.replace(/[^a-zA-Z0-9]/g, "_")}_${now}`;
    const subscriptionId = await ctx.db.insert("calendarSyncSubscriptions", {
      brokerageId: auth.brokerage._id,
      createdAt: now,
      direction: args.direction ?? "outbound",
      filters: args.filters,
      organizationId: args.workosOrganizationId,
      provider: args.provider,
      sourceBuildId: args.buildId,
      sourceProposalId: args.proposalId,
      status: "active",
      subscriptionKey,
      surface: args.surface,
      updatedAt: now,
      workosUserId: auth.subject,
    });
    await ctx.db.insert("eventOutbox", {
      brokerageId: auth.brokerage._id,
      createdAt: now,
      eventType: "calendar.sync_subscription.created",
      organizationId: args.workosOrganizationId,
      payloadPreview: JSON.stringify({
        provider: args.provider,
        subscriptionKey,
        surface: args.surface,
      }),
      relatedEntityId: String(subscriptionId),
      relatedEntityType: "calendarSyncSubscription",
      status: "pending",
    });
    return {
      feedUrl: `/api/calendar/${subscriptionKey}.ics`,
      subscriptionId,
      subscriptionKey,
    };
  })
  .public();

export const recordExternalCalendarSyncChange = authenticatedMutation
  .input({
    changeKey: v.string(),
    externalEventId: v.optional(v.string()),
    payload: v.any(),
    provider: calendarProviderInput,
    subscriptionKey: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("calendarSyncChanges"))
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    const subscription = args.subscriptionKey
      ? await ctx.db
          .query("calendarSyncSubscriptions")
          .withIndex("by_subscription_key", (q) =>
            q.eq("subscriptionKey", args.subscriptionKey as string),
          )
          .unique()
      : null;
    const now = Date.now();
    const payload =
      args.payload && typeof args.payload === "object"
        ? (args.payload as Record<string, unknown>)
        : {};
    let status: "applied" | "pendingReview" = "pendingReview";
    if (
      subscription?.sourceProposalId &&
      typeof payload.title === "string" &&
      typeof payload.startsAt === "string"
    ) {
      const proposal = await ctx.db.get(subscription.sourceProposalId);
      if (proposal && proposal.organizationId === args.workosOrganizationId) {
        const authForProposal = {
          brokerage: auth.brokerage,
          roles: auth.roles,
          subject: auth.subject,
        };
        await ctx.db.insert("calendarReminderEvents", {
          allDay: typeof payload.allDay === "boolean" ? payload.allDay : true,
          assignedParticipants: [],
          brokerageId: auth.brokerage._id,
          createdAt: now,
          createdByWorkosUserId: auth.subject,
          description:
            typeof payload.description === "string"
              ? normalizeOptionalString(payload.description)
              : undefined,
          endsAt:
            typeof payload.endsAt === "string"
              ? normalizeIsoDate(
                  payload.endsAt,
                  "External event end date is invalid.",
                )
              : undefined,
          externalEventId: args.externalEventId,
          externalProvider: args.provider,
          location:
            typeof payload.location === "string"
              ? normalizeOptionalString(payload.location)
              : undefined,
          organizationId: args.workosOrganizationId,
          proposalId: subscription.sourceProposalId,
          source: "external",
          startsAt: normalizeIsoDate(
            payload.startsAt,
            "External event start date is invalid.",
          ),
          status: "active",
          timezone:
            typeof payload.timezone === "string"
              ? (normalizeOptionalString(payload.timezone) ?? "America/Toronto")
              : "America/Toronto",
          title: payload.title.trim() || "External calendar event",
          updatedAt: now,
          updatedByWorkosUserId: auth.subject,
        });
        await writeProposalEvent(ctx, {
          auth: authForProposal,
          command: "recordExternalCalendarSyncChange",
          eventType: "calendar.reminder.imported",
          newState: JSON.stringify({
            externalEventId: args.externalEventId,
            provider: args.provider,
            title: payload.title,
          }),
          proposalId: subscription.sourceProposalId,
        });
        status = "applied";
      }
    }
    return await ctx.db.insert("calendarSyncChanges", {
      brokerageId: auth.brokerage._id,
      changeKey: args.changeKey,
      createdAt: now,
      externalEventId: args.externalEventId,
      organizationId: args.workosOrganizationId,
      payload: args.payload,
      provider: args.provider,
      status,
      subscriptionId: subscription?._id,
      updatedAt: now,
      workosUserId: auth.subject,
    });
  })
  .public();

async function proposalCalendarEventsForFeed(
  ctx: QueryCtx,
  proposal: Doc<"buildProposals">,
) {
  const [
    milestones,
    submilestones,
    draws,
    evidenceAssets,
    contractorAssignments,
    targetDates,
    reminderEvents,
  ] = await Promise.all([
    collectByIndex(ctx, "proposalMilestones", "by_proposal", proposal._id),
    collectByIndex(ctx, "proposalSubmilestones", "by_proposal", proposal._id),
    collectByIndex(
      ctx,
      "proposalDrawScheduleRows",
      "by_proposal",
      proposal._id,
    ),
    collectByIndex(ctx, "proposalEvidenceAssets", "by_proposal", proposal._id),
    collectByIndex(
      ctx,
      "proposalContractorAssignments",
      "by_proposal",
      proposal._id,
    ),
    collectByIndex(ctx, "calendarTargetDates", "by_proposal", proposal._id),
    collectByIndex(ctx, "calendarReminderEvents", "by_proposal", proposal._id),
  ]);
  const baseDate = proposalCalendarBaseDate(proposal);
  const events: any[] = [];
  const sortedMilestones = [...milestones].sort(
    (a, b) => a.order - b.order || a.key.localeCompare(b.key),
  );
  for (const milestone of sortedMilestones) {
    events.push(
      proposalCalendarMilestoneEvent({ baseDate, milestone, proposal }),
    );
  }
  for (const submilestone of submilestones) {
    const parent = sortedMilestones.find(
      (milestone) => milestone.key === submilestone.milestoneKey,
    );
    const startsAt = addDaysIso(baseDate, parent?.dayStart ?? 0);
    events.push({
      allDay: true,
      auditRequired: proposal.status !== "draft",
      editable: {
        canChangeAssignee: false,
        canChangeStatus: false,
        canMove: false,
        canResizeEnd: false,
        canResizeStart: false,
        requiredReason: "none",
      },
      endsAt: addDaysIso(startsAt, Math.max(1, submilestone.durationDays ?? 1)),
      entity: {
        id: String(submilestone._id),
        key: submilestone.key,
        type: "milestone",
      },
      id: calendarEventId("proposal", "submilestone", submilestone.key),
      kind: "submilestone",
      milestoneKey: submilestone.milestoneKey,
      organizationId: submilestone.organizationId,
      relatedEntityIds: [String(proposal._id)],
      startsAt,
      status: "proposed",
      subtitle: submilestone.milestoneKey,
      surface: "proposal",
      timeBucket: "allDay",
      timezone: "America/Toronto",
      title: submilestone.name,
      warnings: [],
    });
  }
  for (const draw of draws) {
    events.push(proposalCalendarDrawEvent({ baseDate, draw, proposal }));
  }
  for (const event of evidenceAssets) {
    events.push({
      allDay: false,
      auditRequired: false,
      editable: {
        canChangeAssignee: false,
        canChangeStatus: false,
        canMove: false,
        canResizeEnd: false,
        canResizeStart: false,
        requiredReason: "none",
      },
      entity: { id: String(event._id), type: "proposal" },
      id: calendarEventId("proposal", "supporting", String(event._id)),
      kind: "evidence",
      milestoneKey: event.milestoneKey,
      organizationId: event.organizationId,
      relatedEntityIds: [String(proposal._id)],
      startsAt: baseDate,
      status: "planned",
      subtitle: event.label,
      surface: "proposal",
      timeBucket: "midday",
      timezone: "America/Toronto",
      title: event.fileName,
      warnings: event.locationVerified ? [] : ["Location unverified"],
    });
  }
  for (const assignment of contractorAssignments) {
    if (assignment.startDay === undefined && assignment.endDay === undefined) {
      continue;
    }
    events.push({
      allDay: true,
      auditRequired: false,
      editable: {
        canChangeAssignee: true,
        canChangeStatus: false,
        canMove: false,
        canResizeEnd: false,
        canResizeStart: false,
        requiredReason: "none",
      },
      endsAt: addDaysIso(
        baseDate,
        assignment.endDay ?? assignment.startDay ?? 0,
      ),
      entity: { id: String(assignment._id), type: "proposal" },
      id: calendarEventId("proposal", "contractor", String(assignment._id)),
      kind: "contractor",
      organizationId: assignment.organizationId,
      relatedEntityIds: [String(proposal._id), String(assignment.contractorId)],
      startsAt: addDaysIso(
        baseDate,
        assignment.startDay ?? assignment.endDay ?? 0,
      ),
      status: assignment.status === "active" ? "planned" : "cancelled",
      subtitle: assignment.role,
      surface: "proposal",
      timeBucket: "allDay",
      timezone: "America/Toronto",
      title: `${assignment.role} contractor window`,
      warnings: [],
    });
  }
  for (const target of targetDates) {
    events.push(calendarTargetDateEvent(target, "proposal"));
  }
  for (const reminder of reminderEvents) {
    events.push(calendarReminderEvent(reminder, "proposal"));
  }
  return events;
}

function buildCalendarIcsText(events: any[], calendarName: string) {
  const escape = (value: string) =>
    value
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  const dateValue = (value: string) => value.slice(0, 10).replace(/-/g, "");
  const dateTimeValue = (value: string, fallbackHour: string) =>
    value.includes("T")
      ? `${new Date(value).toISOString().replace(/[-:]/g, "").split(".")[0]}Z`
      : `${dateValue(value)}T${fallbackHour}0000`;
  const timestamp = `${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FairLend//DrawFlow Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(calendarName)}`,
  ];
  for (const event of events
    .filter((candidate) => candidate.status !== "cancelled")
    .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)))) {
    const start = dateValue(event.startsAt);
    const end = dateValue(
      addDaysIso(event.endsAt ?? event.startsAt, event.allDay ? 1 : 0),
    );
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escape(event.id)}@drawflow.fairlend.ca`,
      `DTSTAMP:${timestamp}`,
      event.allDay
        ? `DTSTART;VALUE=DATE:${start}`
        : `DTSTART:${dateTimeValue(event.startsAt, "09")}`,
      event.allDay
        ? `DTEND;VALUE=DATE:${end}`
        : `DTEND:${dateTimeValue(event.endsAt ?? event.startsAt, "10")}`,
      `SUMMARY:${escape(event.title)}`,
      `DESCRIPTION:${escape([event.subtitle, event.kind, event.status, ...(event.warnings ?? []).map((warning: any) => (typeof warning === "string" ? warning : warning.label))].filter(Boolean).join(" | "))}`,
      event.location ? `LOCATION:${escape(event.location)}` : "",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.filter((line) => line !== "").join("\r\n")}\r\n`;
}

export const getCalendarSubscriptionIcs = publicQuery
  .input({ subscriptionKey: v.string() })
  .returns(v.string())
  .handler(async (ctx, args) => {
    const subscription = await ctx.db
      .query("calendarSyncSubscriptions")
      .withIndex("by_subscription_key", (q) =>
        q.eq("subscriptionKey", args.subscriptionKey),
      )
      .unique();
    if (!subscription || subscription.status !== "active") {
      throw new Error("Calendar subscription not found.");
    }
    if (subscription.surface === "proposal" && subscription.sourceProposalId) {
      const proposal = await ctx.db.get(subscription.sourceProposalId);
      if (
        !proposal ||
        proposal.organizationId !== subscription.organizationId
      ) {
        throw new Error("Calendar source not found.");
      }
      return buildCalendarIcsText(
        await proposalCalendarEventsForFeed(ctx, proposal),
        proposal.buildName,
      );
    }
    return buildCalendarIcsText([], "DrawFlow Calendar");
  })
  .public();
