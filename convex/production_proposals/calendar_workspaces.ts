/**
 * Production proposals calendar workspaces bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { authenticatedQuery } from "../authz";
import { addDaysIso } from "./active_capital_evidence.js";
import { authorizeActiveBuildOrThrow, authorizeProposal } from "./authorization_core.js";
import { proposalAppPermissionProjection, activeBuildAppPermissionProjection, canUseAppPermission } from "./builder_staff_access.js";
import { calendarTimeframeValues, calendarDateFromMs, proposalCalendarBaseDate, calendarEventId, userCalendarSavedViews, proposalCalendarMilestoneEvent, activeBuildCalendarMilestoneEvent, proposalCalendarDrawEvent, activeBuildCalendarDrawEvent, activeBuildCalendarDrawRequestEvent } from "./calendar_contracts.js";
import { calendarTargetDateEvent, calendarReminderEvent } from "./calendar_scheduling.js";
import { collectByIndex } from "./storage_helpers.js";

export const getProposalCalendarWorkspace = authenticatedQuery
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
    const appPermissions = await proposalAppPermissionProjection(ctx, auth);
    const [
      milestones,
      submilestones,
      draws,
      evidenceAssets,
      contractorAssignments,
      targetDates,
      reminderEvents,
    ] = await Promise.all([
      collectByIndex(ctx, "proposalMilestones", "by_proposal", args.proposalId),
      collectByIndex(
        ctx,
        "proposalSubmilestones",
        "by_proposal",
        args.proposalId,
      ),
      collectByIndex(
        ctx,
        "proposalDrawScheduleRows",
        "by_proposal",
        args.proposalId,
      ),
      collectByIndex(
        ctx,
        "proposalEvidenceAssets",
        "by_proposal",
        args.proposalId,
      ),
      collectByIndex(
        ctx,
        "proposalContractorAssignments",
        "by_proposal",
        args.proposalId,
      ),
      collectByIndex(
        ctx,
        "calendarTargetDates",
        "by_proposal",
        args.proposalId,
      ),
      collectByIndex(
        ctx,
        "calendarReminderEvents",
        "by_proposal",
        args.proposalId,
      ),
    ]);
    const baseDate = proposalCalendarBaseDate(auth.proposal);
    const events: any[] = [];
    const sortedMilestones = [...milestones].sort(
      (a, b) => a.order - b.order || a.key.localeCompare(b.key),
    );
    for (const milestone of canUseAppPermission(
      appPermissions,
      "milestone",
      "view",
    )
      ? sortedMilestones
      : []) {
      events.push(
        proposalCalendarMilestoneEvent({
          baseDate,
          milestone,
          proposal: auth.proposal,
        }),
      );
    }
    for (const submilestone of canUseAppPermission(
      appPermissions,
      "submilestone",
      "view",
    )
      ? submilestones
      : []) {
      const parent = sortedMilestones.find(
        (milestone) => milestone.key === submilestone.milestoneKey,
      );
      const startsAt = addDaysIso(
        baseDate,
        submilestone.startDay ?? parent?.dayStart ?? 0,
      );
      events.push({
        allDay: true,
        auditRequired: auth.proposal.status !== "draft",
        editable: {
          canChangeAssignee: false,
          canChangeStatus: false,
          canMove: auth.proposal.status !== "closed",
          canResizeEnd: auth.proposal.status !== "closed",
          canResizeStart: false,
          requiredReason:
            auth.proposal.status === "draft" ? "none" : "scheduleChange",
        },
        endsAt: addDaysIso(
          startsAt,
          Math.max(1, submilestone.durationDays ?? 1),
        ),
        entity: {
          id: String(submilestone._id),
          key: submilestone.key,
          type: "milestone",
        },
        id: calendarEventId("proposal", "submilestone", submilestone.key),
        kind: "submilestone",
        metrics: { budgetCents: submilestone.budgetCents },
        milestoneKey: submilestone.milestoneKey,
        organizationId: submilestone.organizationId,
        relatedEntityIds: [String(args.proposalId)],
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
    for (const draw of canUseAppPermission(appPermissions, "draw", "view")
      ? draws
      : []) {
      events.push(
        proposalCalendarDrawEvent({ baseDate, draw, proposal: auth.proposal }),
      );
    }
    for (const event of canUseAppPermission(appPermissions, "evidence", "view")
      ? evidenceAssets
      : []) {
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
        relatedEntityIds: [String(args.proposalId)],
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
    for (const assignment of canUseAppPermission(
      appPermissions,
      "contractor",
      "view",
    )
      ? contractorAssignments
      : []) {
      if (
        assignment.startDay === undefined &&
        assignment.endDay === undefined
      ) {
        continue;
      }
      events.push({
        allDay: true,
        auditRequired: false,
        editable: {
          canChangeAssignee: true,
          canChangeStatus: false,
          canMove: true,
          canResizeEnd: true,
          canResizeStart: true,
          requiredReason: "scheduleChange",
        },
        endsAt: addDaysIso(
          baseDate,
          assignment.endDay ?? assignment.startDay ?? 0,
        ),
        entity: { id: String(assignment._id), type: "proposal" },
        id: calendarEventId("proposal", "contractor", String(assignment._id)),
        kind: "contractor",
        organizationId: assignment.organizationId,
        relatedEntityIds: [
          String(args.proposalId),
          String(assignment.contractorId),
        ],
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
    for (const reminder of canUseAppPermission(
      appPermissions,
      "reminder",
      "view",
    )
      ? reminderEvents
      : []) {
      events.push(calendarReminderEvent(reminder, "proposal"));
    }
    return {
      defaultTimeframe: "month",
      events,
      savedViews: await userCalendarSavedViews(ctx, {
        organizationId: args.workosOrganizationId,
        subject: auth.subject,
        surface: "proposal",
      }),
      source: {
        id: args.proposalId,
        title: auth.proposal.buildName,
        location: auth.proposal.location,
        status: auth.proposal.status,
      },
      surface: "proposal",
      timeframes: calendarTimeframeValues,
      warnings: events.flatMap((event) => event.warnings ?? []),
    };
  })
  .public();

export const getActiveBuildCalendarWorkspace = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    const appPermissions = await activeBuildAppPermissionProjection(ctx, auth);
    const [
      milestones,
      submilestones,
      draws,
      drawRequests,
      siteVisits,
      evidenceAssets,
      loanFacilities,
      targetDates,
      reminderEvents,
      auditEvents,
    ] = await Promise.all([
      collectByIndex(ctx, "buildMilestones", "by_build", args.buildId),
      collectByIndex(ctx, "buildSubmilestones", "by_build", args.buildId),
      collectByIndex(ctx, "plannedDrawScheduleRows", "by_build", args.buildId),
      collectByIndex(ctx, "activeBuildDrawRequests", "by_build", args.buildId),
      collectByIndex(ctx, "buildSiteVisits", "by_build", args.buildId),
      collectByIndex(ctx, "buildEvidenceAssets", "by_build", args.buildId),
      collectByIndex(ctx, "loanFacilities", "by_build", args.buildId),
      collectByIndex(ctx, "calendarTargetDates", "by_build", args.buildId),
      collectByIndex(ctx, "calendarReminderEvents", "by_build", args.buildId),
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(args.buildId)),
        )
        .collect(),
    ]);
    const events: any[] = [];
    const sortedMilestones = [...milestones].sort(
      (a, b) => a.order - b.order || a.key.localeCompare(b.key),
    );
    for (const milestone of canUseAppPermission(
      appPermissions,
      "milestone",
      "view",
    )
      ? sortedMilestones
      : []) {
      events.push(
        activeBuildCalendarMilestoneEvent({ build: auth.build, milestone }),
      );
    }
    for (const submilestone of canUseAppPermission(
      appPermissions,
      "submilestone",
      "view",
    )
      ? submilestones
      : []) {
      const parent = sortedMilestones.find(
        (milestone) => milestone.key === submilestone.milestoneKey,
      );
      const startDay = parent?.dayStart ?? 0;
      events.push({
        allDay: true,
        auditRequired: true,
        editable: {
          canChangeAssignee: false,
          canChangeStatus: true,
          canMove: submilestone.status !== "complete",
          canResizeEnd: submilestone.status !== "complete",
          canResizeStart: false,
          requiredReason: "scheduleChange",
        },
        endsAt: addDaysIso(
          auth.build.startDate,
          startDay + Math.max(1, submilestone.durationDays ?? 1),
        ),
        entity: {
          id: submilestone._id,
          type: "submilestone",
        },
        id: calendarEventId(
          "activeBuild",
          "submilestone",
          String(submilestone._id),
        ),
        kind: "submilestone",
        metrics: { budgetCents: submilestone.budgetCents },
        milestoneKey: submilestone.milestoneKey,
        organizationId: submilestone.organizationId,
        relatedEntityIds: [String(args.buildId)],
        startsAt: addDaysIso(auth.build.startDate, startDay),
        status:
          submilestone.status === "complete"
            ? "completed"
            : submilestone.status === "in_progress"
              ? "inProgress"
              : "planned",
        subtitle: submilestone.milestoneKey,
        surface: "activeBuild",
        timeBucket: "allDay",
        timezone: "America/Toronto",
        title: submilestone.name,
        warnings: [],
      });
    }
    for (const draw of canUseAppPermission(appPermissions, "draw", "view")
      ? draws
      : []) {
      events.push(activeBuildCalendarDrawEvent({ build: auth.build, draw }));
    }
    for (const request of canUseAppPermission(appPermissions, "draw", "view")
      ? drawRequests
      : []) {
      events.push(
        activeBuildCalendarDrawRequestEvent({ build: auth.build, request }),
      );
    }
    for (const visit of canUseAppPermission(appPermissions, "evidence", "view")
      ? siteVisits
      : []) {
      events.push({
        allDay: false,
        auditRequired: visit.status !== "requested",
        editable: {
          canChangeAssignee: true,
          canChangeStatus: true,
          canMove: visit.status !== "complete",
          canResizeEnd: false,
          canResizeStart: false,
          requiredReason:
            visit.status === "requested" ? "scheduleChange" : "override",
        },
        entity: { id: String(visit._id), type: "siteVisit" },
        id: calendarEventId("activeBuild", "siteVisit", visit.visitId),
        kind: "siteVisit",
        milestoneKey: visit.milestoneKey,
        organizationId: visit.organizationId,
        relatedEntityIds: [
          String(args.buildId),
          String(visit.buildMilestoneId),
        ],
        startsAt: addDaysIso(auth.build.startDate, visit.requestedDay),
        status:
          visit.status === "complete"
            ? "completed"
            : visit.status === "cancelled"
              ? "cancelled"
              : "planned",
        subtitle: visit.note ?? "Site visit",
        surface: "activeBuild",
        timeBucket: "morning",
        timezone: "America/Toronto",
        title: `Site visit: ${visit.milestoneKey}`,
        warnings:
          visit.tokenExpiresAt < Date.now() && visit.status === "requested"
            ? ["Token expired"]
            : [],
      });
    }
    for (const asset of canUseAppPermission(appPermissions, "evidence", "view")
      ? evidenceAssets
      : []) {
      events.push({
        allDay: false,
        auditRequired: !asset.locationVerified,
        editable: {
          canChangeAssignee: false,
          canChangeStatus: !asset.locationVerified,
          canMove: false,
          canResizeEnd: false,
          canResizeStart: false,
          immutableReason: "Evidence upload timestamps are immutable.",
          requiredReason: asset.locationVerified ? "none" : "override",
        },
        entity: { id: String(asset._id), type: "evidencePackage" },
        id: calendarEventId("activeBuild", "evidence", asset.evidenceKey),
        kind: "evidence",
        milestoneKey: asset.milestoneKey,
        organizationId: asset.organizationId,
        relatedEntityIds: [String(args.buildId)],
        startsAt: calendarDateFromMs(asset.createdAt),
        status: asset.locationVerified ? "submitted" : "inReview",
        subtitle: asset.label,
        surface: "activeBuild",
        timeBucket: "midday",
        timezone: "America/Toronto",
        title: asset.fileName,
        warnings: asset.locationVerified ? [] : ["Location unverified"],
      });
    }
    for (const loan of loanFacilities) {
      if (!loan.paybackDate) {
        continue;
      }
      events.push({
        allDay: true,
        auditRequired: true,
        editable: {
          canChangeAssignee: false,
          canChangeStatus: false,
          canMove: false,
          canResizeEnd: false,
          canResizeStart: false,
          immutableReason: "Payback changes require a facility change request.",
          requiredReason: "materialDecision",
        },
        entity: { id: String(loan._id), type: "loanFacility" },
        id: calendarEventId("activeBuild", "loan", String(loan._id)),
        kind: "loan",
        metrics: { amountCents: loan.principalCents },
        organizationId: loan.organizationId,
        relatedEntityIds: [String(args.buildId)],
        startsAt: loan.paybackDate,
        status: loan.status === "closed" ? "completed" : "planned",
        subtitle: "Loan payback date",
        surface: "activeBuild",
        timeBucket: "endOfDay",
        timezone: "America/Toronto",
        title: "Loan payback",
        warnings: [],
      });
    }
    for (const target of targetDates) {
      events.push(calendarTargetDateEvent(target, "activeBuild"));
    }
    for (const reminder of canUseAppPermission(
      appPermissions,
      "reminder",
      "view",
    )
      ? reminderEvents
      : []) {
      events.push(calendarReminderEvent(reminder, "activeBuild"));
    }
    return {
      auditEvents: auditEvents
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((event) => ({
          command: event.command,
          createdAt: event.createdAt,
          eventType: event.eventType,
          reason: event.reason,
        })),
      defaultTimeframe: "week",
      events,
      savedViews: await userCalendarSavedViews(ctx, {
        organizationId: args.workosOrganizationId,
        subject: auth.subject,
        surface: "activeBuild",
      }),
      source: {
        id: args.buildId,
        location: auth.build.location,
        status: auth.build.status,
        title: auth.build.buildName,
      },
      surface: "activeBuild",
      timeframes: calendarTimeframeValues,
      warnings: events.flatMap((event) => event.warnings ?? []),
    };
  })
  .public();
