import { toolDefinition } from "@tanstack/ai";
import { z } from "zod/v4";

export const assistantMutationActionKeys = [
  "create_build_proposal_from_setup",
  "update_proposal_milestone_schedule",
  "update_proposal_milestone_budget",
  "create_proposal_planned_draw",
  "update_proposal_planned_draw",
  "delete_proposal_planned_draw",
  "submit_build_proposal",
  "request_proposal_changes",
  "reject_proposal",
  "approve_proposal",
  "assign_proposal_builder",
  "unassign_proposal_builder",
  "create_proposal_claim_link",
  "record_proposal_closing",
  "delete_draft_proposal",
  "update_proposal_approved_amount",
  "update_proposal_interest_rate",
  "update_proposal_start_date",
  "add_proposal_document",
  "create_proposal_milestone",
  "update_proposal_milestone",
  "delete_proposal_milestone",
  "create_proposal_draw",
  "update_proposal_draw",
  "delete_proposal_draw",
  "update_submitted_proposal_draw",
  "create_proposal_capital_event",
  "update_proposal_capital_event",
  "delete_proposal_capital_event",
  "create_proposal_cash_infusion",
  "create_proposal_evidence_asset",
  "update_proposal_evidence_asset",
  "delete_proposal_evidence_asset",
  "request_proposal_timeline_modification",
  "review_proposal_timeline_modification",
  "update_proposal_timeline_plan_state",
  "create_proposal_cost_item",
  "update_proposal_cost_item",
  "delete_proposal_cost_item",
  "attach_proposal_contractor",
  "create_and_attach_proposal_contractor",
  "assign_proposal_contractor_to_scope",
  "provision_proposal_builder_staff",
  "update_proposal_builder_staff_permissions",
  "remove_proposal_builder_staff",
  "save_calendar_view",
  "create_calendar_sync_subscription",
  "start_proposal_collaboration",
  "stop_proposal_collaboration",
  "invite_proposal_collaborator",
  "set_proposal_collaborator_permission",
  "assign_collaboration_to_builder",
  "undo_proposal_timeline",
  "redo_proposal_timeline",
  "join_proposal_collaboration",
  "create_proposal_reminder",
  "update_proposal_reminder",
  "cancel_proposal_reminder",
  "set_calendar_target_date",
  "update_active_build_details",
  "add_active_build_note",
  "add_active_build_document",
  "delete_active_build",
  "create_active_build_cost_item",
  "update_active_build_cost_item",
  "delete_active_build_cost_item",
  "attach_active_build_contractor",
  "create_and_assign_active_build_contractor",
  "assign_active_build_contractor_to_scope",
  "start_active_build_milestone",
  "submit_active_build_milestone_completion",
  "approve_active_build_milestone",
  "reject_active_build_milestone",
  "request_active_build_milestone_info",
  "review_active_build_evidence",
  "create_active_build_evidence_asset",
  "update_active_build_evidence_asset",
  "delete_active_build_evidence_asset",
  "schedule_active_build_site_visit",
  "reschedule_active_build_site_visit",
  "cancel_active_build_site_visit",
  "record_active_build_site_visit",
  "request_active_build_draw",
  "approve_active_build_draw",
  "reject_active_build_draw",
  "release_active_build_draw",
  "request_active_build_facility_change",
  "request_active_build_payback_extension",
  "review_active_build_facility_change",
  "provision_active_build_builder_staff",
  "update_active_build_builder_staff_permissions",
  "remove_active_build_builder_staff",
  "create_active_build_milestone",
  "update_active_build_milestone",
  "delete_active_build_milestone",
  "create_active_build_draw",
  "update_active_build_draw",
  "delete_active_build_draw",
  "create_active_build_capital_event",
  "update_active_build_capital_event",
  "delete_active_build_capital_event",
  "request_active_build_capital_event_revision",
  "request_active_build_cash_infusion",
  "update_active_build_timeline_plan_state",
  "apply_active_build_modification",
  "request_active_build_milestone_schedule_revision",
  "request_active_build_milestone_budget_revision",
  "request_active_build_draw_plan_revision",
] as const;

export const assistantReadonlyClientActionKeys = [
  "open_route",
  "open_proposal_route",
  "open_active_build_route",
  "open_calendar_surface",
  "focus_milestone",
  "focus_draw",
  "focus_calendar_event",
  "explain_current_surface",
  "select_proposal_template",
] as const;

export const assistantSetupClientActionKeys = [
  "set_proposal_setup_field",
  "set_proposal_setup_address",
  "set_proposal_setup_permit_status",
  "advance_proposal_setup_step",
  "set_setup_milestone_included",
  "create_setup_milestone",
  "reorder_setup_milestones",
  "update_setup_milestone",
  "update_setup_milestone_schedule_budget",
  "set_setup_budget_cascade_mode",
  "create_setup_submilestone",
  "update_setup_submilestone",
  "move_setup_submilestone",
  "delete_setup_submilestone",
  "update_setup_field_guidance",
  "import_proposal_budget_workbook",
  "create_setup_contractor_assignment",
  "delete_setup_contractor_assignment",
  "create_setup_cost_item",
  "update_setup_cost_item",
  "delete_setup_cost_item",
] as const;

export const assistantClientActionKeys = [
  ...assistantReadonlyClientActionKeys,
  ...assistantSetupClientActionKeys,
] as const;

export type AssistantMutationActionKey =
  (typeof assistantMutationActionKeys)[number];
export type AssistantReadonlyClientActionKey =
  (typeof assistantReadonlyClientActionKeys)[number];
export type AssistantSetupClientActionKey =
  (typeof assistantSetupClientActionKeys)[number];
export type AssistantClientActionKey =
  (typeof assistantClientActionKeys)[number];
export type AssistantActionKey =
  | AssistantMutationActionKey
  | AssistantClientActionKey;

const idLike = z.string().min(1);
const passthroughInput = z.object({}).passthrough();

export const assistantGenericToolDefinitions = Object.fromEntries(
  [...assistantMutationActionKeys, ...assistantClientActionKeys].map((name) => [
    name,
    toolDefinition({
      description: `DrawFlow assistant closed-catalog action: ${name}`,
      inputSchema: passthroughInput,
      name,
    }),
  ])
) as unknown as Record<AssistantActionKey, ReturnType<typeof toolDefinition>>;

export const assistantToolDefinitions = {
  ...assistantGenericToolDefinitions,
  createProposalReminder: toolDefinition({
    description:
      "Create a reminder-only event on a Build Proposal calendar after HITL confirmation.",
    inputSchema: z.object({
      allDay: z.boolean().optional(),
      buildId: idLike.optional(),
      description: z.string().optional(),
      endsAt: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      location: z.string().optional(),
      proposalId: idLike.optional(),
      startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      timezone: z.string().optional(),
      title: z.string().min(1),
    }),
    name: "create_proposal_reminder",
  }),
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
  openRoute: toolDefinition({
    description:
      "Open a known DrawFlow route from the assistant sitemap as an immediate read-only client action.",
    inputSchema: z.object({
      label: z.string().min(1),
      routeId: idLike,
      to: z.string().min(1),
    }),
    name: "open_route",
  }),
  selectProposalTemplate: toolDefinition({
    description:
      "Select a Build Proposal setup template in the current client UI as an immediate read-only client action.",
    inputSchema: z.object({
      templateKey: idLike,
    }),
    name: "select_proposal_template",
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
  startActiveBuildMilestone: toolDefinition({
    description:
      "Prepare an explicit, auditable actual work-start confirmation for a live Build milestone. The actual start is separate from the approved schedule; incomplete dependencies require a reason.",
    inputSchema: z.object({
      actualStartedAt: z.number().int().positive(),
      buildId: idLike,
      dependencyOverrideReason: z.string().min(3).optional(),
      idempotencyKey: idLike,
      milestoneKey: idLike,
      startParent: z.boolean().optional(),
      submilestoneKey: idLike.optional(),
    }),
    name: "start_active_build_milestone",
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
