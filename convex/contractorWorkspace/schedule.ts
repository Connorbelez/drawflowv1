import { v } from "convex/values";

import {
  type AuthorizedViewer,
  contractorMutation,
  contractorQuery,
} from "../authz";
import {
  getContractorProfileByAccount,
  requireContractorLinkedProfile,
} from "../contractorAuth";
import {
  type MilestoneStartSource,
  recordMilestoneStart,
} from "../milestone_start";
import { resolveCanonicalMilestoneExecutionOwnership } from "../build_collaboration_system_event_access";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";
import {
  contractorRoleQuery,
  loadContractorAssignments,
  isCanonicalBuildAssignment,
  isContractorVisibleBuild,
} from "./access";

const scheduleEventValidator = v.object({
  _id: v.string(),
  entityType: v.union(
    v.literal("milestone_start"),
    v.literal("milestone_end"),
    v.literal("submilestone"),
    v.literal("site_visit"),
    v.literal("reminder"),
  ),
  title: v.string(),
  startsAt: v.string(),
  endsAt: v.union(v.string(), v.null()),
  parentName: v.string(),
  parentId: v.string(),
  milestoneKey: v.union(v.string(), v.null()),
});

export const listContractorScheduleEvents = contractorRoleQuery
  .returns(v.array(scheduleEventValidator))
  .handler(async (ctx) => {
    const contractor = ctx.contractorProfile;
    const { buildAssignments, proposalAssignments } =
      await loadContractorAssignments(ctx, contractor._id);
    const events = await projectContractorSchedule(ctx, {
      contractorId: contractor._id,
      fromMs: 0,
      toMs: Number.POSITIVE_INFINITY,
      buildAssignments,
      proposalAssignments,
    });
    return events.sort((a, b) => {
      const aT = Date.parse(a.startsAt) || 0;
      const bT = Date.parse(b.startsAt) || 0;
      return aT - bT;
    });
  })
  .public();

export interface ContractorScheduleEvent {
  _id: string;
  endsAt: string | null;
  entityType:
    | "milestone_start"
    | "milestone_end"
    | "submilestone"
    | "site_visit"
    | "reminder";
  milestoneKey: string | null;
  parentId: string;
  parentName: string;
  startsAt: string;
  title: string;
}

export async function projectContractorSchedule(
  ctx: QueryCtx,
  input: {
    contractorId: Id<"contractorProfiles">;
    fromMs: number;
    toMs: number;
    buildAssignments: Doc<"milestoneContractorAssignments">[];
    proposalAssignments: Doc<"proposalMilestoneContractorAssignments">[];
  }
): Promise<ContractorScheduleEvent[]> {
  const events: ContractorScheduleEvent[] = [];

  // Proposal milestone start/end windows.
  for (const assignment of input.proposalAssignments) {
    if (assignment.status === "removed") {
      continue;
    }
    const proposal = await ctx.db.get(assignment.proposalId);
    if (!proposal || proposal.status === "closed") {
      continue;
    }
    const milestone = await ctx.db.get(assignment.proposalMilestoneId);
    if (!milestone) {
      continue;
    }
    const startEvent = milestoneEvent(
      proposal._id,
      proposal.buildName,
      assignment.milestoneKey,
      milestone.name,
      milestone.dayStart,
      "milestone_start"
    );
    if (startEvent && inWindow(startEvent, input.fromMs, input.toMs)) {
      events.push(startEvent);
    }
    const endEvent = milestoneEvent(
      proposal._id,
      proposal.buildName,
      assignment.milestoneKey,
      milestone.name,
      milestone.dayEnd,
      "milestone_end"
    );
    if (endEvent && inWindow(endEvent, input.fromMs, input.toMs)) {
      events.push(endEvent);
    }
  }

  // Active build milestone start/end windows.
  for (const assignment of input.buildAssignments) {
    if (assignment.status === "removed") {
      continue;
    }
    const build = await ctx.db.get(assignment.buildId);
    if (!isContractorVisibleBuild(build)) {
      continue;
    }
    const milestone = await ctx.db.get(assignment.buildMilestoneId);
    if (!milestone) {
      continue;
    }
    const startEvent = milestoneEvent(
      build._id,
      build.buildName,
      assignment.milestoneKey,
      milestone.name,
      milestone.dayStart,
      "milestone_start"
    );
    if (startEvent && inWindow(startEvent, input.fromMs, input.toMs)) {
      events.push(startEvent);
    }
    const endEvent = milestoneEvent(
      build._id,
      build.buildName,
      assignment.milestoneKey,
      milestone.name,
      milestone.dayEnd,
      "milestone_end"
    );
    if (endEvent && inWindow(endEvent, input.fromMs, input.toMs)) {
      events.push(endEvent);
    }
  }

  // Coordination reminders from the shared calendar projection, scoped to the
  // contractor's assigned proposals (PRD §8.6). ICS feed is deferred.
  const proposalIds = new Set(
    input.proposalAssignments.map((a) => a.proposalId)
  );
  for (const proposalId of proposalIds) {
    const reminders = await ctx.db
      .query("calendarReminderEvents")
      .withIndex("by_proposal", (q) => q.eq("proposalId", proposalId))
      .filter((q: any) => q.eq(q.field("status"), "active"))
      .collect();
    for (const reminder of reminders) {
      const involvesContractor = reminder.assignedParticipants?.some(
        (p: any) => p.participantType === "contractorProfile"
      );
      if (!involvesContractor) {
        continue;
      }
      const proposal = await ctx.db.get(proposalId);
      const event: ContractorScheduleEvent = {
        _id: `reminder:${reminder._id}`,
        entityType: "reminder",
        title: reminder.title,
        startsAt: reminder.startsAt,
        endsAt: reminder.endsAt ?? null,
        parentName: proposal?.buildName ?? "DrawFlow",
        parentId: proposalId,
        milestoneKey: null,
      };
      if (inWindow(event, input.fromMs, input.toMs)) {
        events.push(event);
      }
    }
  }

  return events;
}

function milestoneEvent(
  parentId: string,
  parentName: string,
  milestoneKey: string,
  milestoneName: string,
  dayOffset: number,
  kind: "milestone_start" | "milestone_end"
): ContractorScheduleEvent | null {
  if (typeof dayOffset !== "number") {
    return null;
  }
  // Project day offsets from a fixed epoch so events sort correctly; the real
  // calendar projection maps day offsets to absolute dates elsewhere. For the
  // contractor read view we emit ISO dates derived from the day offset.
  const date = new Date(Date.UTC(2026, 0, 1));
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return {
    _id: `${parentId}:${milestoneKey}:${kind}`,
    entityType: kind,
    title: `${milestoneName} ${kind === "milestone_start" ? "start" : "end"}`,
    startsAt: date.toISOString(),
    endsAt: null,
    parentName,
    parentId,
    milestoneKey,
  };
}

function inWindow(
  event: ContractorScheduleEvent,
  fromMs: number,
  toMs: number
): boolean {
  const t = Date.parse(event.startsAt) || 0;
  if (fromMs > 0 && t < fromMs) {
    return false;
  }
  if (toMs !== Number.POSITIVE_INFINITY && t > toMs) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// getContractorProfile (PRD §8.8 operational fields + readiness)
// ---------------------------------------------------------------------------
