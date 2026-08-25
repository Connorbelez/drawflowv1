import { v } from "convex/values";

import type { RoleSlug } from "../authz";
import type { Doc } from "../types";

export const BACKOFFICE_ROLES = [
  "admin",
  "principle-broker",
  "broker",
  "broker-staff",
] as const satisfies readonly RoleSlug[];

export const BACKOFFICE_WRITE_ROLES = [
  "admin",
  "principle-broker",
  "broker",
] as const satisfies readonly RoleSlug[];

export const BUILDER_ROLES = [
  "admin",
  "builder",
  "builder-staff",
] as const satisfies readonly RoleSlug[];

export const TOTAL_BPS = 10_000;

export const MUTATION_ACTION_KEYS = [
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
  "start_active_build_draw_review",
  "submit_active_build_draw_for_admin",
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

export type MutationActionKey = (typeof MUTATION_ACTION_KEYS)[number];

export const TRUSTED_FILE_ACTION_KEYS = [
  "add_proposal_document",
  "create_proposal_evidence_asset",
  "add_active_build_document",
  "create_active_build_evidence_asset",
] as const satisfies readonly MutationActionKey[];

export const ACTIVE_BUILD_REQUEST_ONLY_ACTION_KEYS = [
  "request_active_build_capital_event_revision",
  "request_active_build_cash_infusion",
  "apply_active_build_modification",
] as const satisfies readonly MutationActionKey[];

export const GENERIC_REASON_REQUIRED_ACTION_KEYS = [
  "request_proposal_changes",
  "reject_proposal",
  "approve_proposal",
  "record_proposal_closing",
  "delete_draft_proposal",
  "delete_proposal_milestone",
  "delete_proposal_draw",
  "delete_proposal_planned_draw",
  "delete_proposal_capital_event",
  "delete_proposal_cost_item",
  "delete_proposal_evidence_asset",
  "stop_proposal_collaboration",
  "undo_proposal_timeline",
  "redo_proposal_timeline",
  "delete_active_build",
  "delete_active_build_cost_item",
  "delete_active_build_milestone",
  "delete_active_build_draw",
  "delete_active_build_capital_event",
  "delete_active_build_evidence_asset",
  "submit_active_build_draw_for_admin",
  "approve_active_build_draw",
  "reject_active_build_draw",
  "release_active_build_draw",
  "request_active_build_facility_change",
  "request_active_build_payback_extension",
  "review_active_build_facility_change",
  "request_active_build_capital_event_revision",
  "request_active_build_cash_infusion",
  "apply_active_build_modification",
] as const satisfies readonly MutationActionKey[];

export const READONLY_CLIENT_ACTION_KEYS = [
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

export type ReadonlyClientActionKey =
  (typeof READONLY_CLIENT_ACTION_KEYS)[number];

export type AssistantActionKey = MutationActionKey | ReadonlyClientActionKey;

export type AssistantActionInput = Record<string, unknown>;

export type AssistantPlanItem = {
  actionKey: AssistantActionKey;
  after: unknown;
  before: unknown;
  clientRequestId: string;
  entityLabel: string;
  entityType: string;
  input: AssistantActionInput;
  mutationName?: string;
  reasonRequired: boolean;
  status: "accepted" | "edited" | "preview" | "rejected";
  validation: {
    errors: string[];
    warnings: string[];
  };
};

export type AssistantAuth = {
  brokerage: Doc<"brokerages">;
  organizationId: string;
  roles: RoleSlug[];
  subject: string;
};

export type ProposalAuth = AssistantAuth & {
  proposal: Doc<"buildProposals">;
};

export type ActiveBuildAuth = ProposalAuth & {
  build: Doc<"activeBuilds">;
};

export type ValidationResult = {
  actionKey: AssistantActionKey;
  clientRequestId: string;
  errors: string[];
  warnings: string[];
};

export const actionInput = v.object({
  actionKey: v.string(),
  clientRequestId: v.string(),
  input: v.any(),
});

export const traceEventInput = v.object({
  aguiType: v.string(),
  label: v.string(),
  metadata: v.optional(v.any()),
  planId: v.optional(v.id("assistantActionPlans")),
  status: v.union(
    v.literal("queued"),
    v.literal("running"),
    v.literal("needs_input"),
    v.literal("succeeded"),
    v.literal("failed")
  ),
});
