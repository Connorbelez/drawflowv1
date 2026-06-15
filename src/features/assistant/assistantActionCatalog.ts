import { toolDefinition } from "@tanstack/ai";
import { z } from "zod/v4";

export const assistantMutationActionKeys = [
  "update_proposal_milestone_schedule",
  "update_proposal_milestone_budget",
  "create_proposal_planned_draw",
  "update_proposal_planned_draw",
  "delete_proposal_planned_draw",
  "create_proposal_reminder",
  "update_proposal_reminder",
  "cancel_proposal_reminder",
  "set_calendar_target_date",
  "schedule_active_build_site_visit",
  "reschedule_active_build_site_visit",
  "cancel_active_build_site_visit",
  "request_active_build_milestone_schedule_revision",
  "request_active_build_milestone_budget_revision",
  "request_active_build_draw_plan_revision",
] as const;

export const assistantReadonlyClientActionKeys = [
  "open_proposal_route",
  "open_active_build_route",
  "open_calendar_surface",
  "focus_milestone",
  "focus_draw",
  "focus_calendar_event",
  "explain_current_surface",
] as const;

const idLike = z.string().min(1);

export const assistantToolDefinitions = {
  createProposalPlannedDraw: toolDefinition({
    description:
      "Create a reimbursement-only planned draw row on an editable Build Proposal after HITL confirmation.",
    inputSchema: z.object({
      amountCents: z.number().int().positive(),
      drawKey: idLike,
      label: z.string().min(1),
      milestoneKey: z.string().optional(),
      proposalId: idLike,
      timingDay: z.number().int().nonnegative(),
    }),
    name: "create_proposal_planned_draw",
  }),
  openProposalRoute: toolDefinition({
    description:
      "Open a Build Proposal route as an immediate read-only client action.",
    inputSchema: z.object({ proposalId: idLike }),
    name: "open_proposal_route",
  }),
  requestActiveBuildDrawPlanRevision: toolDefinition({
    description:
      "Create an auditable active-build draw-plan revision request instead of directly mutating live draw rows.",
    inputSchema: z.object({
      amountCents: z.number().int().positive().optional(),
      buildId: idLike,
      drawKey: idLike,
      label: z.string().optional(),
      milestoneKey: z.string().optional(),
      reason: z.string().min(3),
      timingDay: z.number().int().nonnegative().optional(),
    }),
    name: "request_active_build_draw_plan_revision",
  }),
  setCalendarTargetDate: toolDefinition({
    description:
      "Set an explicit operational calendar target date without silently changing milestone or draw schedules.",
    inputSchema: z.object({
      buildId: idLike.optional(),
      dateKind: z.enum([
        "evidenceDue",
        "reviewTarget",
        "adminDecisionTarget",
        "drawReleaseTarget",
      ]),
      drawKey: z.string().optional(),
      milestoneKey: z.string().optional(),
      proposalId: idLike.optional(),
      reason: z.string().optional(),
      targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      targetTime: z.string().optional(),
    }),
    name: "set_calendar_target_date",
  }),
  updateProposalMilestoneSchedule: toolDefinition({
    description:
      "Update Build Proposal milestone start/end day fields after HITL confirmation.",
    inputSchema: z.object({
      dayEnd: z.number().int().nonnegative(),
      dayStart: z.number().int().nonnegative(),
      milestoneKey: idLike,
      proposalId: idLike,
      reason: z.string().optional(),
    }),
    name: "update_proposal_milestone_schedule",
  }),
};
