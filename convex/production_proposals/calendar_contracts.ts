/**
 * Production proposals calendar contracts bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { authenticatedQuery } from "../authz";
import { type Doc, type QueryCtx } from "../types";
import { addDaysIso } from "./active_capital_evidence.js";
import { authorizeProposal } from "./authorization_core.js";
import { proposalAppPermissionProjection, canUseAppPermission } from "./builder_staff_access.js";
import { proposalContractorPlanningProjection } from "./contractor_proposal_helpers.js";
import { collectByIndex } from "./storage_helpers.js";

export const getProposalContractorPlanning = authenticatedQuery
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
    if (!canUseAppPermission(appPermissions, "contractor", "view")) {
      return null;
    }

    const [documents, milestones, submilestones] = await Promise.all([
      collectByIndex(ctx, "proposalDocuments", "by_proposal", args.proposalId),
      collectByIndex(ctx, "proposalMilestones", "by_proposal", args.proposalId),
      collectByIndex(
        ctx,
        "proposalSubmilestones",
        "by_proposal",
        args.proposalId,
      ),
    ]);

    return await proposalContractorPlanningProjection(ctx, {
      auth,
      documents,
      milestones,
      proposalId: args.proposalId,
      submilestones,
    });
  })
  .public();

export const calendarTimeframeValues = [
  "day",
  "week",
  "month",
  "quarter",
  "agenda",
] as const;

export const calendarProviderInput = v.union(
  v.literal("ics"),
  v.literal("google"),
  v.literal("outlook"),
);

export const calendarSurfaceInput = v.union(
  v.literal("proposal"),
  v.literal("activeBuild"),
);

export const calendarTimeframeInput = v.union(
  v.literal("day"),
  v.literal("week"),
  v.literal("month"),
  v.literal("quarter"),
  v.literal("agenda"),
);

const calendarReminderParticipantInput = v.object({
  builderProfileId: v.optional(v.id("builderProfiles")),
  contractorId: v.optional(v.id("contractorProfiles")),
  displayName: v.optional(v.string()),
  email: v.optional(v.string()),
  participantType: v.union(
    v.literal("workosUser"),
    v.literal("builderProfile"),
    v.literal("contractorProfile"),
    v.literal("externalEmail"),
  ),
  role: v.optional(v.string()),
  workosUserId: v.optional(v.string()),
});

export const calendarReminderEventInput = {
  allDay: v.optional(v.boolean()),
  assignedParticipants: v.optional(v.array(calendarReminderParticipantInput)),
  description: v.optional(v.string()),
  endsAt: v.optional(v.string()),
  externalEventId: v.optional(v.string()),
  externalProvider: v.optional(calendarProviderInput),
  location: v.optional(v.string()),
  proposalId: v.id("buildProposals"),
  source: v.optional(v.union(v.literal("drawflow"), v.literal("external"))),
  startsAt: v.string(),
  timezone: v.optional(v.string()),
  title: v.string(),
  workosOrganizationId: v.string(),
};

export function calendarDateFromMs(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function proposalCalendarBaseDate(proposal: Doc<"buildProposals">) {
  if (proposal.proposedStartDate) {
    return proposal.proposedStartDate;
  }
  return calendarDateFromMs(proposal.submittedAt ?? proposal.createdAt);
}

export function calendarEventId(...parts: Array<number | string | undefined>) {
  return parts.filter((part) => part !== undefined).join(":");
}

function calendarStatusForProposalMilestone(
  proposal: Doc<"buildProposals">,
  milestone: Doc<"proposalMilestones">,
) {
  if (milestone.completionReview?.status === "rejected") {
    return "rejected";
  }
  if (milestone.completionReview?.status === "approved") {
    return "approved";
  }
  if (proposal.status === "draft") {
    return "proposed";
  }
  return "planned";
}

function calendarStatusForActiveMilestone(milestone: Doc<"buildMilestones">) {
  if (milestone.completionReview?.status === "rejected") {
    return "rejected";
  }
  if (milestone.completionReview?.status === "approved") {
    return "approved";
  }
  if (milestone.status === "complete") {
    return "completed";
  }
  if (milestone.status === "in_progress") {
    return "inProgress";
  }
  return "planned";
}

function defaultCalendarSavedViews(surface: "activeBuild" | "proposal") {
  const base = [
    {
      filters: { needsAction: true },
      id: "my-week",
      isDefault: false,
      label: "My week",
      timeframe: "week",
    },
    {
      filters: { eventKinds: ["draw", "drawGroup", "loan"] },
      id: "capital-release",
      isDefault: false,
      label: "Capital release",
      timeframe: "month",
    },
    {
      filters: { eventKinds: ["evidence", "review", "adminDecision"] },
      id: "evidence-review",
      isDefault: false,
      label: "Evidence and review",
      timeframe: "agenda",
    },
    {
      filters: { statuses: ["overdue", "blocked"] },
      id: "overdue-blocked",
      isDefault: false,
      label: "Overdue and blocked",
      timeframe: "agenda",
    },
  ];
  if (surface === "proposal") {
    return [
      {
        filters: { surface: "proposal" },
        id: "proposal-feasibility",
        isDefault: true,
        label: "Proposal feasibility",
        timeframe: "month",
      },
      ...base,
    ];
  }
  return [
    {
      filters: { eventKinds: ["siteVisit"] },
      id: "site-visits",
      isDefault: true,
      label: "Site visits",
      timeframe: "week",
    },
    ...base,
  ];
}

export async function userCalendarSavedViews(
  ctx: QueryCtx,
  input: {
    organizationId: string;
    subject: string;
    surface: "activeBuild" | "proposal";
  },
) {
  const savedRows = await ctx.db
    .query("calendarSavedViews")
    .withIndex("by_user_surface", (q) =>
      q
        .eq("organizationId", input.organizationId)
        .eq("workosUserId", input.subject)
        .eq("surface", input.surface),
    )
    .collect();
  const customViews = savedRows.map((view) => ({
    filters: view.filters,
    id: view.viewKey,
    isDefault: view.isDefault,
    label: view.label,
    timeframe: view.timeframe,
  }));
  return [...defaultCalendarSavedViews(input.surface), ...customViews];
}

export function proposalCalendarMilestoneEvent(input: {
  baseDate: string;
  milestone: Doc<"proposalMilestones">;
  proposal: Doc<"buildProposals">;
}) {
  const status = calendarStatusForProposalMilestone(
    input.proposal,
    input.milestone,
  );
  return {
    allDay: true,
    auditRequired: input.proposal.status !== "draft",
    editable: {
      canChangeAssignee: false,
      canChangeStatus: false,
      canMove: input.proposal.status !== "closed",
      canResizeEnd: input.proposal.status !== "closed",
      canResizeStart: input.proposal.status !== "closed",
      requiredReason:
        input.proposal.status === "draft" ? "none" : "scheduleChange",
    },
    endsAt: addDaysIso(input.baseDate, input.milestone.dayEnd),
    entity: {
      id: String(input.milestone._id),
      key: input.milestone.key,
      type: "milestone",
    },
    id: calendarEventId("proposal", "milestone", input.milestone.key),
    kind: "milestone",
    metrics: {
      amountCents: input.milestone.drawAvailabilityCents,
      budgetCents: input.milestone.budgetCents,
    },
    milestoneKey: input.milestone.key,
    organizationId: input.milestone.organizationId,
    relatedEntityIds: [String(input.proposal._id)],
    startsAt: addDaysIso(input.baseDate, input.milestone.dayStart),
    status,
    subtitle: `Day ${input.milestone.dayStart} to ${input.milestone.dayEnd}`,
    surface: "proposal",
    timeBucket: "allDay",
    timezone: "America/Toronto",
    title: input.milestone.name,
    warnings:
      input.milestone.dependencyKeys.length > 0
        ? [`Depends on ${input.milestone.dependencyKeys.join(", ")}`]
        : [],
  };
}

export function activeBuildCalendarMilestoneEvent(input: {
  build: Doc<"activeBuilds">;
  milestone: Doc<"buildMilestones">;
}) {
  const status = calendarStatusForActiveMilestone(input.milestone);
  return {
    allDay: true,
    auditRequired: true,
    editable: {
      canChangeAssignee: false,
      canChangeStatus: true,
      canMove: status !== "approved" && status !== "completed",
      canResizeEnd: status !== "approved" && status !== "completed",
      canResizeStart: status !== "approved" && status !== "completed",
      requiredReason: "scheduleChange",
    },
    endsAt: addDaysIso(input.build.startDate, input.milestone.dayEnd),
    entity: {
      id: String(input.milestone._id),
      key: input.milestone.key,
      type: "milestone",
    },
    id: calendarEventId("activeBuild", "milestone", input.milestone.key),
    kind: "milestone",
    metrics: {
      amountCents: input.milestone.drawAvailabilityCents,
      budgetCents: input.milestone.budgetCents,
      progressPercent: input.milestone.progressPercent ?? 0,
    },
    milestoneKey: input.milestone.key,
    organizationId: input.milestone.organizationId,
    relatedEntityIds: [String(input.build._id)],
    startsAt: addDaysIso(input.build.startDate, input.milestone.dayStart),
    status,
    subtitle: `Day ${input.milestone.dayStart} to ${input.milestone.dayEnd}`,
    surface: "activeBuild",
    timeBucket: "allDay",
    timezone: "America/Toronto",
    title: input.milestone.name,
    warnings:
      input.milestone.dependencyKeys.length > 0
        ? [`Depends on ${input.milestone.dependencyKeys.join(", ")}`]
        : [],
  };
}

function calendarDrawStatus(status?: string) {
  if (status === "released") {
    return "released";
  }
  if (status === "approved" || status === "approved_for_release") {
    return "approved";
  }
  if (status === "rejected" || status === "withdrawn" || status === "cancelled") {
    return "rejected";
  }
  if (
    status === "requested" ||
    status === "in_review" ||
    status === "ready_for_admin"
  ) {
    return "submitted";
  }
  return "proposed";
}

export function proposalCalendarDrawEvent(input: {
  baseDate: string;
  draw: Doc<"proposalDrawScheduleRows">;
  proposal: Doc<"buildProposals">;
}) {
  return {
    allDay: false,
    auditRequired: input.proposal.status !== "draft",
    drawGroupKey: input.draw.drawKey,
    editable: {
      canChangeAssignee: false,
      canChangeStatus: false,
      canMove: input.proposal.status !== "closed",
      canResizeEnd: false,
      canResizeStart: false,
      requiredReason:
        input.proposal.status === "draft" ? "none" : "scheduleChange",
    },
    entity: {
      id: String(input.draw._id),
      key: input.draw.drawKey,
      type: "draw",
    },
    id: calendarEventId("proposal", "draw", input.draw.drawKey),
    kind: "draw",
    metrics: { amountCents: input.draw.amountCents },
    milestoneKey: input.draw.milestoneKey,
    organizationId: input.draw.organizationId,
    relatedEntityIds: [String(input.proposal._id)],
    startsAt: addDaysIso(input.baseDate, input.draw.timingDay),
    status: calendarDrawStatus(input.draw.requestStatus),
    subtitle: `Draw availability, day ${input.draw.timingDay}`,
    surface: "proposal",
    timeBucket: "endOfDay",
    timezone: "America/Toronto",
    title: input.draw.label,
    warnings: [],
  };
}

export function activeBuildCalendarDrawEvent(input: {
  build: Doc<"activeBuilds">;
  draw: Doc<"plannedDrawScheduleRows">;
}) {
  const releaseDate =
    input.draw.releaseDate ??
    input.draw.releasedAt?.slice(0, 10) ??
    addDaysIso(input.build.startDate, input.draw.timingDay);
  return {
    allDay: false,
    auditRequired: input.draw.status !== "planned",
    drawGroupKey: input.draw.drawKey,
    editable: {
      canChangeAssignee: false,
      canChangeStatus: true,
      canMove: input.draw.status !== "released",
      canResizeEnd: false,
      canResizeStart: false,
      immutableReason:
        input.draw.status === "released"
          ? "Released draw timestamps are immutable."
          : undefined,
      requiredReason:
        input.draw.status === "released" ? "none" : "materialDecision",
    },
    entity: {
      id: String(input.draw._id),
      key: input.draw.drawKey,
      type: "draw",
    },
    id: calendarEventId("activeBuild", "draw", input.draw.drawKey),
    kind: "draw",
    metrics: { amountCents: input.draw.amountCents },
    milestoneKey: input.draw.milestoneKey,
    organizationId: input.draw.organizationId,
    relatedEntityIds: [String(input.build._id)],
    startsAt: releaseDate,
    status: calendarDrawStatus(input.draw.status),
    subtitle: `Reimbursement draw, day ${input.draw.timingDay}`,
    surface: "activeBuild",
    timeBucket: "endOfDay",
    timezone: "America/Toronto",
    title: input.draw.label,
    warnings: [],
  };
}

export function activeBuildCalendarDrawRequestEvent(input: {
  build: Doc<"activeBuilds">;
  request: Doc<"activeBuildDrawRequests">;
}) {
  const eventDate =
    input.request.releaseDate ??
    input.request.releasedAt?.slice(0, 10) ??
    input.request.requestedAt.slice(0, 10);
  return {
    allDay: false,
    auditRequired: true,
    drawGroupKey: input.request.plannedDrawKey,
    editable: {
      canChangeAssignee: false,
      canChangeStatus:
        input.request.status === "requested" ||
        input.request.status === "in_review" ||
        input.request.status === "ready_for_admin" ||
        input.request.status === "approved_for_release",
      canMove: false,
      canResizeEnd: false,
      canResizeStart: false,
      immutableReason: "Draw request lifecycle dates are system recorded.",
      requiredReason: "materialDecision" as const,
    },
    entity: {
      id: String(input.request._id),
      key: input.request.requestKey,
      type: "draw" as const,
    },
    id: calendarEventId("activeBuild", "drawRequest", input.request.requestKey),
    kind: "draw" as const,
    metrics: { amountCents: input.request.amountCents },
    organizationId: input.request.organizationId,
    relatedEntityIds: [String(input.build._id)],
    startsAt: eventDate,
    status: calendarDrawStatus(input.request.status),
    subtitle: `${input.request.displayId} · actual draw request`,
    surface: "activeBuild" as const,
    timeBucket: "endOfDay" as const,
    timezone: "America/Toronto",
    title: input.request.label,
    warnings: [],
  };
}
