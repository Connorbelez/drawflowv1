import { type AGUIEvent, EventType } from "@ag-ui/core";
import { toolDefinition } from "@tanstack/ai";
import { v } from "convex/values";
import OpenAI from "openai";
import { z } from "zod/v4";

import { api } from "./_generated/api";
import {
  authenticatedAction,
  authenticatedMutation,
  authenticatedQuery,
  normalizeRoleSlugs,
  type RoleSlug,
} from "./authz";
import type { Doc, Id, MutationCtx, QueryCtx, TableNames } from "./types";

const BACKOFFICE_ROLES = [
  "admin",
  "principle-broker",
  "broker",
  "broker-staff",
] as const satisfies readonly RoleSlug[];

const BACKOFFICE_WRITE_ROLES = [
  "admin",
  "principle-broker",
  "broker",
] as const satisfies readonly RoleSlug[];

const BUILDER_ROLES = [
  "admin",
  "builder",
  "builder-staff",
] as const satisfies readonly RoleSlug[];

const TOTAL_BPS = 10_000;

const MUTATION_ACTION_KEYS = [
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

type MutationActionKey = (typeof MUTATION_ACTION_KEYS)[number];

const TRUSTED_FILE_ACTION_KEYS = [
  "add_proposal_document",
  "create_proposal_evidence_asset",
  "add_active_build_document",
  "create_active_build_evidence_asset",
] as const satisfies readonly MutationActionKey[];

const ACTIVE_BUILD_REQUEST_ONLY_ACTION_KEYS = [
  "request_active_build_capital_event_revision",
  "request_active_build_cash_infusion",
  "apply_active_build_modification",
] as const satisfies readonly MutationActionKey[];

const GENERIC_REASON_REQUIRED_ACTION_KEYS = [
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

const READONLY_CLIENT_ACTION_KEYS = [
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

type ReadonlyClientActionKey = (typeof READONLY_CLIENT_ACTION_KEYS)[number];

type AssistantActionKey = MutationActionKey | ReadonlyClientActionKey;

type AssistantActionInput = Record<string, unknown>;

type AssistantPlanItem = {
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

type AssistantAuth = {
  brokerage: Doc<"brokerages">;
  organizationId: string;
  roles: RoleSlug[];
  subject: string;
};

type ProposalAuth = AssistantAuth & {
  proposal: Doc<"buildProposals">;
};

type ActiveBuildAuth = ProposalAuth & {
  build: Doc<"activeBuilds">;
};

type ValidationResult = {
  actionKey: AssistantActionKey;
  clientRequestId: string;
  errors: string[];
  warnings: string[];
};

const actionInput = v.object({
  actionKey: v.string(),
  clientRequestId: v.string(),
  input: v.any(),
});

const traceEventInput = v.object({
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

export const drawFlowAssistantMutationToolDefinitions = MUTATION_ACTION_KEYS.map((name) =>
  toolDefinition({
    description: `DrawFlow assistant closed-catalog mutation action: ${name}`,
    inputSchema: z.object({}).passthrough(),
    name,
  })
);

export const getProviderStatus = authenticatedAction
  .input({})
  .returns(
    v.object({
      defaultModel: v.string(),
      openaiConfigured: v.boolean(),
      openrouterConfigured: v.boolean(),
      provider: v.union(
        v.literal("openai"),
        v.literal("openrouter"),
        v.literal("unconfigured")
      ),
      readOnly: v.boolean(),
    })
  )
  .handler(async () => {
    const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
    const openrouterConfigured = Boolean(process.env.OPENROUTER_API_KEY);
    const provider = openaiConfigured
      ? "openai"
      : openrouterConfigured
        ? "openrouter"
        : "unconfigured";
    return {
      defaultModel: process.env.DRAWFLOW_ASSISTANT_MODEL ?? "gpt-4.1-mini",
      openaiConfigured,
      openrouterConfigured,
      provider,
      readOnly: !(openaiConfigured || openrouterConfigured),
    };
  })
  .public();

export const runAssistantTurn = authenticatedAction
  .input({
    prompt: v.string(),
    routeContext: v.any(),
    threadId: v.optional(v.id("assistantThreads")),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      model: v.string(),
      provider: v.union(v.literal("openai"), v.literal("openrouter")),
      text: v.string(),
    })
  )
  .handler(async (ctx, args) => {
    if (ctx.viewer.organizationId !== args.workosOrganizationId) {
      throw new Error("Forbidden: organization scope");
    }
    const openaiKey = process.env.OPENAI_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    const provider = openaiKey ? "openai" : "openrouter";
    const apiKey = openaiKey ?? openrouterKey;
    if (!apiKey) {
      throw new Error("DrawFlow assistant model provider is not configured.");
    }
    const model = process.env.DRAWFLOW_ASSISTANT_MODEL ?? "gpt-4.1-mini";
    const client = new OpenAI({
      apiKey,
      ...(provider === "openrouter"
        ? { baseURL: "https://openrouter.ai/api/v1" }
        : {}),
    });
    const response = await client.chat.completions.create({
      messages: [
        {
          content:
            "You are the DrawFlow in-product assistant. Do not reveal raw chain-of-thought. Use only the closed DrawFlow action catalog for mutations, and tell the user that data-changing actions require HITL preview and confirmation.",
          role: "system",
        },
        {
          content: `Route context:\n${JSON.stringify(sanitizeForPersistence(args.routeContext))}\n\nUser request:\n${args.prompt}`,
          role: "user",
        },
      ],
      model,
      temperature: 0.2,
    });
    return {
      model,
      provider,
      text:
        response.choices[0]?.message.content ??
        "I could not generate a DrawFlow assistant response.",
    };
  })
  .public();

export const ensureThread = authenticatedMutation
  .input({
    routeContext: v.any(),
    threadId: v.optional(v.id("assistantThreads")),
    title: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("assistantThreads"))
  .handler(async (ctx, args) => {
    const auth = await authorizeOrganization(ctx, args.workosOrganizationId);
    if (args.threadId) {
      const existing = await ctx.db.get(args.threadId);
      if (!existing || existing.organizationId !== args.workosOrganizationId) {
        throw new Error("Assistant thread not found for organization.");
      }
      await ctx.db.patch(args.threadId, {
        routeContext: sanitizeForPersistence(args.routeContext),
        updatedAt: Date.now(),
      });
      return args.threadId;
    }
    const now = Date.now();
    return await ctx.db.insert("assistantThreads", {
      brokerageId: auth.brokerage._id,
      createdAt: now,
      createdByWorkosUserId: auth.subject,
      organizationId: args.workosOrganizationId,
      routeContext: sanitizeForPersistence(args.routeContext),
      status: "active",
      title: normalizeOptionalString(args.title) ?? "DrawFlow assistant",
      updatedAt: now,
    });
  })
  .public();

export const createActionPlan = authenticatedMutation
  .input({
    actions: v.array(actionInput),
    routeContext: v.any(),
    threadId: v.optional(v.id("assistantThreads")),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("assistantActionPlans"))
  .handler(async (ctx, args) => {
    const auth = await authorizeOrganization(ctx, args.workosOrganizationId);
    denyContractorMutationBatch(auth.roles);
    if (args.threadId) {
      await requireThread(ctx, args.threadId, args.workosOrganizationId);
    }
    const seen = new Set<string>();
    const items: AssistantPlanItem[] = [];
    const validationResults: ValidationResult[] = [];
    let proposalId: Id<"buildProposals"> | undefined;
    let buildId: Id<"activeBuilds"> | undefined;

    for (const action of args.actions) {
      if (seen.has(action.clientRequestId)) {
        throw new Error("Assistant action clientRequestId must be unique.");
      }
      seen.add(action.clientRequestId);
      const item = await validateActionForPreview(ctx, auth, {
        actionKey: action.actionKey,
        clientRequestId: action.clientRequestId,
        input: normalizeRecord(action.input, "Assistant action input"),
      });
      items.push(item);
      validationResults.push({
        actionKey: item.actionKey,
        clientRequestId: item.clientRequestId,
        errors: item.validation.errors,
        warnings: item.validation.warnings,
      });
      const itemProposalId = maybeId<"buildProposals">(item.input.proposalId);
      const itemBuildId = maybeId<"activeBuilds">(item.input.buildId);
      proposalId ??= itemProposalId;
      buildId ??= itemBuildId;
    }

    const now = Date.now();
    return await ctx.db.insert("assistantActionPlans", {
      acceptedClientRequestIds: items.map((item) => item.clientRequestId),
      actorRoles: auth.roles,
      brokerageId: auth.brokerage._id,
      ...(buildId ? { buildId } : {}),
      createdAt: now,
      createdByWorkosUserId: auth.subject,
      items: sanitizeForPersistence(items),
      organizationId: args.workosOrganizationId,
      ...(proposalId ? { proposalId } : {}),
      rejectedClientRequestIds: [],
      routeContext: sanitizeForPersistence(args.routeContext),
      status: "preview",
      ...(args.threadId ? { threadId: args.threadId } : {}),
      updatedAt: now,
      validationResults: sanitizeForPersistence(validationResults),
    });
  })
  .public();

export const getActionPlan = authenticatedQuery
  .input({
    planId: v.id("assistantActionPlans"),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeOrganization(ctx, args.workosOrganizationId);
    const plan = await ctx.db.get(args.planId);
    if (
      !plan ||
      plan.organizationId !== args.workosOrganizationId ||
      (plan.brokerageId && plan.brokerageId !== auth.brokerage._id)
    ) {
      throw new Error("Assistant action plan not found for organization.");
    }
    return plan;
  })
  .public();

export const commitActionPlan = authenticatedMutation
  .input({
    acceptedClientRequestIds: v.array(v.string()),
    editedInputs: v.any(),
    planId: v.id("assistantActionPlans"),
    rejectedClientRequestIds: v.array(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeOrganization(ctx, args.workosOrganizationId);
    denyContractorMutationBatch(auth.roles);
    const plan = await ctx.db.get(args.planId);
    if (
      !plan ||
      plan.organizationId !== args.workosOrganizationId ||
      (plan.brokerageId && plan.brokerageId !== auth.brokerage._id)
    ) {
      throw new Error("Assistant action plan not found for organization.");
    }
    if (plan.status !== "preview" && plan.status !== "failed") {
      throw new Error("Assistant action plan is not awaiting confirmation.");
    }

    const editedInputs = normalizeRecord(args.editedInputs, "editedInputs");
    const accepted = new Set(args.acceptedClientRequestIds);
    const rejected = new Set(args.rejectedClientRequestIds);
    const planItems = plan.items as AssistantPlanItem[];
    const acceptedItems = planItems
      .filter((item) => accepted.has(item.clientRequestId))
      .map((item) => ({
        ...item,
        input: {
          ...normalizeRecord(item.input, "stored assistant action input"),
          ...normalizeRecord(
            editedInputs[item.clientRequestId] ?? {},
            "edited assistant action input"
          ),
        },
        status: editedInputs[item.clientRequestId] ? "edited" : "accepted",
      })) as AssistantPlanItem[];

    const validationResults: ValidationResult[] = [];
    for (const item of acceptedItems) {
      const result = await validateActionForCommit(ctx, auth, item);
      validationResults.push(result);
      if (result.errors.length > 0) {
        const now = Date.now();
        const outcome = {
          failedClientRequestId: item.clientRequestId,
          ok: false,
          reason: result.errors[0],
        };
        await ctx.db.patch(args.planId, {
          acceptedClientRequestIds: [...accepted],
          commitOutcome: outcome,
          items: planItems.map((stored) =>
            stored.clientRequestId === item.clientRequestId
              ? {
                  ...stored,
                  input: item.input,
                  status: item.status,
                  validation: {
                    errors: result.errors,
                    warnings: result.warnings,
                  },
                }
              : rejected.has(stored.clientRequestId)
                ? { ...stored, status: "rejected" }
                : stored
          ),
          rejectedClientRequestIds: [...rejected],
          status: "failed",
          updatedAt: now,
          validationResults: sanitizeForPersistence(validationResults),
        });
        return outcome;
      }
    }

    const applied: Array<{
      clientRequestId: string;
      result: unknown;
    }> = [];
    for (const item of acceptedItems) {
      applied.push({
        clientRequestId: item.clientRequestId,
        result: await applyAcceptedAction(ctx, auth, item),
      });
    }
    const now = Date.now();
    const outcome = { applied, ok: true };
    await ctx.db.patch(args.planId, {
      acceptedClientRequestIds: [...accepted],
      commitOutcome: sanitizeForPersistence(outcome),
      committedAt: now,
      items: planItems.map((stored) => {
        const acceptedItem = acceptedItems.find(
          (item) => item.clientRequestId === stored.clientRequestId
        );
        if (acceptedItem) {
          return {
            ...stored,
            input: acceptedItem.input,
            status: acceptedItem.status,
            validation: { errors: [], warnings: [] },
          };
        }
        if (rejected.has(stored.clientRequestId)) {
          return { ...stored, status: "rejected" };
        }
        return stored;
      }),
      rejectedClientRequestIds: [...rejected],
      status: "committed",
      updatedAt: now,
      validationResults: sanitizeForPersistence(validationResults),
    });
    return outcome;
  })
  .public();

export const recordTraceEvent = authenticatedMutation
  .input({
    event: traceEventInput,
    threadId: v.id("assistantThreads"),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("assistantTraceEvents"))
  .handler(async (ctx, args) => {
    await authorizeOrganization(ctx, args.workosOrganizationId);
    await requireThread(ctx, args.threadId, args.workosOrganizationId);
    if (args.event.planId) {
      const plan = await ctx.db.get(args.event.planId);
      if (!plan || plan.organizationId !== args.workosOrganizationId) {
        throw new Error("Assistant action plan not found for organization.");
      }
    }
    return await ctx.db.insert("assistantTraceEvents", {
      aguiType: args.event.aguiType,
      createdAt: Date.now(),
      label: args.event.label,
      metadata: sanitizeForPersistence(args.event.metadata ?? {}),
      organizationId: args.workosOrganizationId,
      ...(args.event.planId ? { planId: args.event.planId } : {}),
      status: args.event.status,
      threadId: args.threadId,
    });
  })
  .public();

export const listTraceEvents = authenticatedQuery
  .input({
    threadId: v.id("assistantThreads"),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    await authorizeOrganization(ctx, args.workosOrganizationId);
    await requireThread(ctx, args.threadId, args.workosOrganizationId);
    return await ctx.db
      .query("assistantTraceEvents")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
  })
  .public();

export const createNavigationTrace = authenticatedMutation
  .input({
    aguiEvent: v.any(),
    threadId: v.id("assistantThreads"),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("assistantTraceEvents"))
  .handler(async (ctx, args) => {
    await authorizeOrganization(ctx, args.workosOrganizationId);
    await requireThread(ctx, args.threadId, args.workosOrganizationId);
    const event = args.aguiEvent as Partial<AGUIEvent>;
    return await ctx.db.insert("assistantTraceEvents", {
      aguiType: String(event.type ?? EventType.CUSTOM),
      createdAt: Date.now(),
      label: "Read-only assistant client action",
      metadata: sanitizeForPersistence(event),
      organizationId: args.workosOrganizationId,
      status: "succeeded",
      threadId: args.threadId,
    });
  })
  .public();

async function validateActionForPreview(
  ctx: MutationCtx,
  auth: AssistantAuth,
  action: {
    actionKey: string;
    clientRequestId: string;
    input: AssistantActionInput;
  }
): Promise<AssistantPlanItem> {
  const actionKey = parseActionKey(action.actionKey);
  if (isReadonlyActionKey(actionKey)) {
    return {
      actionKey,
      after: action.input,
      before: null,
      clientRequestId: action.clientRequestId,
      entityLabel: actionKey,
      entityType: "navigation",
      input: action.input,
      reasonRequired: false,
      status: "preview",
      validation: { errors: [], warnings: [] },
    };
  }
  denyContractorMutationBatch(auth.roles);
  return await buildMutationPreviewItem(ctx, auth, {
    actionKey,
    clientRequestId: action.clientRequestId,
    input: action.input,
  });
}

async function validateActionForCommit(
  ctx: MutationCtx,
  auth: AssistantAuth,
  item: AssistantPlanItem
): Promise<ValidationResult> {
  try {
    if (isReadonlyActionKey(item.actionKey)) {
      return {
        actionKey: item.actionKey,
        clientRequestId: item.clientRequestId,
        errors: [],
        warnings: [],
      };
    }
    const preview = await buildMutationPreviewItem(ctx, auth, item);
    return {
      actionKey: item.actionKey,
      clientRequestId: item.clientRequestId,
      errors: preview.validation.errors,
      warnings: preview.validation.warnings,
    };
  } catch (error) {
    return {
      actionKey: item.actionKey,
      clientRequestId: item.clientRequestId,
      errors: [errorMessage(error)],
      warnings: [],
    };
  }
}

async function buildMutationPreviewItem(
  ctx: MutationCtx,
  auth: AssistantAuth,
  action: {
    actionKey: AssistantActionKey;
    clientRequestId: string;
    input: AssistantActionInput;
  }
): Promise<AssistantPlanItem> {
  if (!isMutationActionKey(action.actionKey)) {
    throw new Error(
      `Assistant action is not in the mutation catalog: ${action.actionKey}`
    );
  }
  switch (action.actionKey) {
    case "create_build_proposal_from_setup":
      return previewBuildProposalFromSetup(action);
    case "add_proposal_document":
    case "create_proposal_evidence_asset":
    case "add_active_build_document":
    case "create_active_build_evidence_asset":
      return await previewTrustedFileBlockedAction(ctx, auth, action);
    case "update_proposal_milestone_schedule": {
      const proposalAuth = await authorizeProposal(ctx, auth, action.input);
      requireProposalWrite(proposalAuth);
      const milestone = await getProposalMilestone(
        ctx,
        action.input,
        proposalAuth.proposal._id
      );
      const dayStart = requiredNumber(action.input.dayStart, "dayStart");
      const dayEnd = requiredNumber(action.input.dayEnd, "dayEnd");
      validateDayRange(dayStart, dayEnd);
      return previewItem(action, {
        after: { dayEnd: Math.round(dayEnd), dayStart: Math.round(dayStart) },
        before: {
          dayEnd: milestone.dayEnd,
          dayStart: milestone.dayStart,
          durationDays: milestone.durationDays,
        },
        entityLabel: milestone.name,
        entityType: "proposalMilestone",
        mutationName: "assistant.updateProposalMilestoneSchedule",
        reasonRequired: proposalAuth.proposal.status !== "draft",
      });
    }
    case "update_proposal_milestone_budget": {
      const proposalAuth = await authorizeProposal(ctx, auth, action.input);
      requireProposalWrite(proposalAuth);
      const milestone = await getProposalMilestone(
        ctx,
        action.input,
        proposalAuth.proposal._id
      );
      const budgetCents = requiredPositiveCents(
        action.input.budgetCents,
        "Milestone budget must be greater than zero."
      );
      return previewItem(action, {
        after: {
          budgetCents,
          drawAvailabilityCents: calculateDrawAvailability(
            budgetCents,
            proposalAuth.proposal.borrowerCoPayBps
          ),
        },
        before: {
          budgetCents: milestone.budgetCents,
          drawAvailabilityCents: milestone.drawAvailabilityCents,
        },
        entityLabel: milestone.name,
        entityType: "proposalMilestone",
        mutationName: "assistant.updateProposalMilestoneBudget",
        reasonRequired: proposalAuth.proposal.status !== "draft",
      });
    }
    case "create_proposal_planned_draw": {
      const proposalAuth = await authorizeProposal(ctx, auth, action.input);
      requireProposalWrite(proposalAuth);
      const drawKey = requiredString(action.input.drawKey, "drawKey");
      const existing = await findProposalDraw(
        ctx,
        proposalAuth.proposal._id,
        drawKey
      );
      if (existing) {
        throw new Error("Proposal draw already exists.");
      }
      const amountCents = requiredPositiveCents(
        action.input.amountCents,
        "Draw amount must be greater than zero."
      );
      const timingDay = requiredNonNegativeDay(
        action.input.timingDay,
        "timingDay"
      );
      const milestoneKey = optionalString(action.input.milestoneKey);
      if (milestoneKey) {
        await getProposalMilestoneByKey(
          ctx,
          proposalAuth.proposal._id,
          milestoneKey
        );
      }
      return previewItem(action, {
        after: { amountCents, drawKey, milestoneKey, timingDay },
        before: null,
        entityLabel: optionalString(action.input.label) ?? drawKey,
        entityType: "proposalDrawScheduleRow",
        mutationName: "assistant.createProposalDraw",
        reasonRequired: false,
      });
    }
    case "update_proposal_planned_draw": {
      const proposalAuth = await authorizeProposal(ctx, auth, action.input);
      requireProposalWrite(proposalAuth);
      const draw = await getProposalDraw(
        ctx,
        action.input,
        proposalAuth.proposal._id
      );
      const amountCents =
        action.input.amountCents === undefined
          ? draw.amountCents
          : requiredPositiveCents(
              action.input.amountCents,
              "Draw amount must be greater than zero."
            );
      const timingDay =
        action.input.timingDay === undefined
          ? draw.timingDay
          : requiredNonNegativeDay(action.input.timingDay, "timingDay");
      return previewItem(action, {
        after: { amountCents, timingDay },
        before: {
          amountCents: draw.amountCents,
          timingDay: draw.timingDay,
        },
        entityLabel: draw.label,
        entityType: "proposalDrawScheduleRow",
        mutationName: "assistant.updateProposalDraw",
        reasonRequired: proposalAuth.proposal.status !== "draft",
      });
    }
    case "delete_proposal_planned_draw": {
      const proposalAuth = await authorizeProposal(ctx, auth, action.input);
      requireProposalWrite(proposalAuth);
      const draw = await getProposalDraw(
        ctx,
        action.input,
        proposalAuth.proposal._id
      );
      return previewItem(action, {
        after: null,
        before: draw,
        entityLabel: draw.label,
        entityType: "proposalDrawScheduleRow",
        mutationName: "assistant.deleteProposalDraw",
        reasonRequired: true,
      });
    }
    case "create_proposal_reminder":
    case "update_proposal_reminder":
    case "cancel_proposal_reminder": {
      const proposalAuth = await authorizeProposal(ctx, auth, action.input);
      requireProposalWrite(proposalAuth);
      return await previewReminderAction(ctx, action, proposalAuth);
    }
    case "set_calendar_target_date": {
      return await previewTargetDateAction(ctx, auth, action);
    }
    case "schedule_active_build_site_visit":
    case "reschedule_active_build_site_visit":
    case "cancel_active_build_site_visit": {
      const buildAuth = await authorizeActiveBuild(ctx, auth, action.input);
      requireBackofficeWrite(buildAuth.roles);
      const milestone = await getBuildMilestone(
        ctx,
        action.input,
        buildAuth.build._id
      );
      return previewItem(action, {
        after: action.input,
        before: milestone.completionReview?.siteVisit ?? null,
        entityLabel: milestone.name,
        entityType: "buildSiteVisit",
        mutationName: `assistant.${action.actionKey}`,
        reasonRequired: action.actionKey !== "schedule_active_build_site_visit",
      });
    }
    case "request_active_build_milestone_schedule_revision":
    case "request_active_build_milestone_budget_revision":
    case "request_active_build_draw_plan_revision": {
      const buildAuth = await authorizeActiveBuild(ctx, auth, action.input);
      requireBackofficeWrite(buildAuth.roles);
      requireReason(action.input.reason);
      const entity =
        action.actionKey === "request_active_build_draw_plan_revision"
          ? await findBuildDraw(
              ctx,
              buildAuth.build._id,
              optionalString(action.input.drawKey) ?? ""
            )
          : await getBuildMilestone(ctx, action.input, buildAuth.build._id);
      if (
        action.actionKey === "request_active_build_draw_plan_revision" &&
        action.input.amountCents !== undefined
      ) {
        requiredPositiveCents(
          action.input.amountCents,
          "Draw amount must be greater than zero."
        );
      }
      if (
        action.actionKey === "request_active_build_milestone_budget_revision" &&
        action.input.budgetCents !== undefined
      ) {
        requiredPositiveCents(
          action.input.budgetCents,
          "Milestone budget must be greater than zero."
        );
      }
      if (
        action.actionKey === "request_active_build_milestone_schedule_revision"
      ) {
        validateDayRange(
          requiredNumber(action.input.dayStart, "dayStart"),
          requiredNumber(action.input.dayEnd, "dayEnd")
        );
      }
      return previewItem(action, {
        after: action.input,
        before: entity ?? null,
        entityLabel:
          entity && "label" in entity
            ? String(entity.label)
            : entity && "name" in entity
              ? String(entity.name)
              : (optionalString(action.input.drawKey) ?? "Requested draw plan"),
        entityType:
          action.actionKey === "request_active_build_draw_plan_revision"
            ? "plannedDrawScheduleRow"
            : "buildMilestone",
        mutationName: `assistant.${action.actionKey}`,
        reasonRequired: true,
        warnings: ["active-build-request-only"],
      });
    }
    default:
      return await previewGenericCatalogAction(ctx, auth, action);
  }
}

async function applyAcceptedAction(
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

async function applyProposalMilestoneSchedule(
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

async function applyProposalMilestoneBudget(
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

async function applyCreateProposalDraw(
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

async function applyUpdateProposalDraw(
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

async function applyDeleteProposalDraw(
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

async function previewReminderAction(
  ctx: MutationCtx,
  action: {
    actionKey: AssistantActionKey;
    clientRequestId: string;
    input: AssistantActionInput;
  },
  proposalAuth: ProposalAuth
) {
  const event =
    action.actionKey === "create_proposal_reminder"
      ? null
      : await getReminder(ctx, action.input, proposalAuth.proposal._id);
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

async function applyCreateReminder(
  ctx: MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
) {
  const proposalAuth = await authorizeProposal(ctx, auth, input);
  requireProposalWrite(proposalAuth);
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
    brokerageId: proposalAuth.brokerage._id,
    createdAt: now,
    createdByWorkosUserId: proposalAuth.subject,
    description: optionalString(input.description),
    ...(endsAt ? { endsAt } : {}),
    location: optionalString(input.location),
    organizationId: proposalAuth.organizationId,
    proposalId: proposalAuth.proposal._id,
    source: "drawflow",
    startsAt,
    status: "active",
    timezone: optionalString(input.timezone) ?? "America/Toronto",
    title,
    updatedAt: now,
    updatedByWorkosUserId: proposalAuth.subject,
  });
  await writeProposalAudit(ctx, proposalAuth, {
    command: "assistant.commit.create_proposal_reminder",
    entityId: String(eventId),
    entityType: "calendarReminderEvent",
    eventType: "assistant.calendar.reminder.created",
    newState: input,
  });
  return { eventId };
}

async function applyUpdateReminder(
  ctx: MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
) {
  const proposalAuth = await authorizeProposal(ctx, auth, input);
  requireProposalWrite(proposalAuth);
  const event = await getReminder(ctx, input, proposalAuth.proposal._id);
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
    updatedByWorkosUserId: proposalAuth.subject,
  };
  await ctx.db.patch(event._id, patch);
  await writeProposalAudit(ctx, proposalAuth, {
    command: "assistant.commit.update_proposal_reminder",
    entityId: String(event._id),
    entityType: "calendarReminderEvent",
    eventType: "assistant.calendar.reminder.updated",
    newState: patch,
    priorState: event,
  });
  return { eventId: event._id };
}

async function applyCancelReminder(
  ctx: MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
) {
  const proposalAuth = await authorizeProposal(ctx, auth, input);
  requireProposalWrite(proposalAuth);
  const event = await getReminder(ctx, input, proposalAuth.proposal._id);
  await ctx.db.patch(event._id, {
    status: "cancelled",
    updatedAt: Date.now(),
    updatedByWorkosUserId: proposalAuth.subject,
  });
  await writeProposalAudit(ctx, proposalAuth, {
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

async function previewTargetDateAction(
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

async function applyCalendarTargetDate(
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

async function applyScheduleSiteVisit(
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

async function applyRescheduleSiteVisit(
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

async function applyCancelSiteVisit(
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

async function applyActiveBuildRevisionRequest(
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

function previewBuildProposalFromSetup(action: {
  actionKey: AssistantActionKey;
  clientRequestId: string;
  input: AssistantActionInput;
}) {
  const buildName = requiredString(
    action.input.buildName ?? action.input.title,
    "buildName"
  );
  requiredString(
    action.input.location ?? action.input.projectAddress,
    "location"
  );
  const milestones = arrayInput(
    action.input.milestones ?? action.input.items,
    "milestones"
  );
  if (milestones.length === 0) {
    throw new Error("At least one setup milestone is required.");
  }
  return previewItem(action, {
    after: {
      buildName,
      location: action.input.location ?? action.input.projectAddress,
      milestoneCount: milestones.length,
      redirectTo: optionalString(action.input.redirectTo) ?? "proposal",
    },
    before: null,
    entityLabel: buildName,
    entityType: "buildProposalSetup",
    mutationName: "assistant.create_build_proposal_from_setup",
    reasonRequired: false,
    warnings: action.input.documents
      ? ["prompt-document-metadata-ignored-without-trusted-file-provenance"]
      : [],
  });
}

async function previewTrustedFileBlockedAction(
  ctx: MutationCtx,
  auth: AssistantAuth,
  action: {
    actionKey: AssistantActionKey;
    clientRequestId: string;
    input: AssistantActionInput;
  }
) {
  let label: string = action.actionKey;
  let before: unknown = null;
  if (action.input.buildId) {
    const buildAuth = await authorizeActiveBuild(ctx, auth, action.input);
    label = buildAuth.build.buildName;
    before = buildAuth.build;
  } else if (action.input.proposalId) {
    const proposalAuth = await authorizeProposal(ctx, auth, action.input);
    label = proposalAuth.proposal.buildName;
    before = proposalAuth.proposal;
  }
  return previewItem(action, {
    after: action.input,
    before,
    entityLabel: label,
    entityType: "trustedFileAttachment",
    errors: [
      "This action requires a trusted file attachment selected by the user; prompt-only file mutations are blocked.",
    ],
    mutationName: `assistant.${action.actionKey}`,
    reasonRequired: true,
    warnings: ["trusted-file-required"],
  });
}

async function previewGenericCatalogAction(
  ctx: MutationCtx,
  auth: AssistantAuth,
  action: {
    actionKey: AssistantActionKey;
    clientRequestId: string;
    input: AssistantActionInput;
  }
) {
  if (!isMutationActionKey(action.actionKey)) {
    throw new Error(
      `Assistant action is not in the mutation catalog: ${action.actionKey}`
    );
  }

  if (
    (TRUSTED_FILE_ACTION_KEYS as readonly string[]).includes(action.actionKey)
  ) {
    return await previewTrustedFileBlockedAction(ctx, auth, action);
  }

  if (action.input.buildId) {
    const buildAuth = await authorizeActiveBuild(ctx, auth, action.input);
    const before = await genericActiveBuildPreviewBefore(ctx, buildAuth, action);
    return previewItem(action, {
      after: action.input,
      before,
      entityLabel: genericPreviewLabel(
        before,
        buildAuth.build.buildName
      ),
      entityType: genericEntityType(action.actionKey, "activeBuild"),
      mutationName: `assistant.${action.actionKey}`,
      reasonRequired: genericReasonRequired(action.actionKey),
      warnings: genericMutationWarnings(action.actionKey),
    });
  }

  if (action.input.proposalId) {
    const proposalAuth = await authorizeProposal(ctx, auth, action.input);
    const before = await genericProposalPreviewBefore(ctx, proposalAuth, action);
    return previewItem(action, {
      after: action.input,
      before,
      entityLabel: genericPreviewLabel(
        before,
        proposalAuth.proposal.buildName
      ),
      entityType: genericEntityType(action.actionKey, "buildProposal"),
      mutationName: `assistant.${action.actionKey}`,
      reasonRequired: genericReasonRequired(action.actionKey),
      warnings: genericMutationWarnings(action.actionKey),
    });
  }

  if (action.input.sessionId) {
    const sessionId = requiredId<"proposalCollaborationSessions">(
      ctx,
      "proposalCollaborationSessions",
      action.input.sessionId,
      "sessionId"
    );
    const session = await ctx.db.get(sessionId);
    if (!session || session.organizationId !== auth.organizationId) {
      throw new Error("Collaboration session not found.");
    }
    return previewItem(action, {
      after: action.input,
      before: session,
      entityLabel: `Collaboration ${String(session._id)}`,
      entityType: "proposalCollaborationSession",
      mutationName: `assistant.${action.actionKey}`,
      reasonRequired: genericReasonRequired(action.actionKey),
      warnings: genericMutationWarnings(action.actionKey),
    });
  }

  if (
    action.actionKey === "save_calendar_view" ||
    action.actionKey === "create_calendar_sync_subscription" ||
    action.actionKey === "join_proposal_collaboration"
  ) {
    return previewItem(action, {
      after: action.input,
      before: null,
      entityLabel: action.actionKey,
      entityType: "organizationScopedAction",
      mutationName: `assistant.${action.actionKey}`,
      reasonRequired: genericReasonRequired(action.actionKey),
      warnings: genericMutationWarnings(action.actionKey),
    });
  }

  throw new Error(
    `${action.actionKey} requires proposalId, buildId, or sessionId.`
  );
}

async function applyBuildProposalFromSetup(
  ctx: MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
) {
  const buildName = requiredString(input.buildName ?? input.title, "buildName");
  const location = requiredString(
    input.location ?? input.projectAddress,
    "location"
  );
  const proposedStartDate =
    input.proposedStartDate === undefined
      ? undefined
      : normalizeIsoDate(input.proposedStartDate, "Proposed start date is invalid.");
  const builderProfileId = optionalId<"builderProfiles">(
    ctx,
    "builderProfiles",
    input.builderProfileId
  );
  const proposalId: Id<"buildProposals"> = builderProfileId
    ? await (ctx as any).runMutation(
        (api as any).production_proposals.createDraftProposal,
        {
          brokerageId: auth.brokerage._id,
          buildName,
          builderProfileId,
          location,
          ...(proposedStartDate ? { proposedStartDate } : {}),
          workosOrganizationId: auth.organizationId,
        }
      )
    : await (ctx as any).runMutation(
        (api as any).production_proposals.createBrokerDraftProposal,
        {
          buildName,
          location,
          ...(proposedStartDate ? { proposedStartDate } : {}),
          workosOrganizationId: auth.organizationId,
        }
      );

  const milestones = normalizeSetupMilestones(
    input.milestones ?? input.items
  );
  const totalBudgetCents = milestones.reduce(
    (sum, milestone) => sum + milestone.budgetCents,
    0
  );
  const borrowerCoPayBps = normalizeBps(
    input.borrowerCoPayBps ?? input.coPayBps ?? 2_000
  );
  const borrowerWorkingCapitalLimitCents = positiveCentsOrFallback(
    input.borrowerWorkingCapitalLimitCents ??
      input.maxCashOnHandCents ??
      input.startingCashCents,
    Math.max(1, Math.round(totalBudgetCents * 0.32))
  );
  const lenderDrawPolicyLimitCents = positiveCentsOrFallback(
    input.lenderDrawPolicyLimitCents ??
      input.reimbursableBudgetCents ??
      Math.round((totalBudgetCents * (TOTAL_BPS - borrowerCoPayBps)) / TOTAL_BPS),
    totalBudgetCents
  );

  await (ctx as any).runMutation(
    (api as any).production_proposals.saveDraftProposalPackage,
    {
      borrowerCoPayBps,
      borrowerWorkingCapitalLimitCents,
      buildName,
      contractorAssignments: normalizeSetupContractorAssignments(
        input.contractorAssignments
      ),
      costItems: normalizeSetupCostItems(input.costItems),
      draws: normalizeSetupDraws(input.draws),
      lenderDrawPolicyLimitCents,
      location,
      milestones,
      proposalId,
      ...(proposedStartDate ? { proposedStartDate } : {}),
      workosOrganizationId: auth.organizationId,
    }
  );
  await writeProposalAudit(ctx, { ...auth, proposal: (await ctx.db.get(proposalId))! }, {
    command: "assistant.commit.create_build_proposal_from_setup",
    entityId: String(proposalId),
    entityType: "buildProposal",
    eventType: "assistant.proposal.created_from_setup",
    newState: {
      buildName,
      location,
      milestoneCount: milestones.length,
      redirectTo: optionalString(input.redirectTo) ?? "proposal",
    },
    reason: optionalString(input.reason),
  });
  return {
    proposalId,
    redirectTo: optionalString(input.redirectTo) ?? "proposal",
  };
}

async function applyCatalogDomainMutation(
  ctx: MutationCtx,
  auth: AssistantAuth,
  item: AssistantPlanItem
) {
  const input = item.input;
  const org = auth.organizationId;
  if ((TRUSTED_FILE_ACTION_KEYS as readonly string[]).includes(item.actionKey)) {
    throw new Error(
      "This action requires a trusted file attachment selected by the user."
    );
  }
  if (
    item.actionKey === "provision_proposal_builder_staff" ||
    item.actionKey === "provision_active_build_builder_staff"
  ) {
    throw new Error(
      "Builder staff provisioning uses the WorkOS Management action runtime and is not available from mutation-only assistant commits yet."
    );
  }

  switch (item.actionKey) {
    case "submit_build_proposal":
      return await runDomainMutation(ctx, "submitProposal", {
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "request_proposal_changes":
      return await runDomainMutation(ctx, "requestChanges", {
        proposalId: input.proposalId,
        reason: reasonOrNote(input),
        workosOrganizationId: org,
      });
    case "reject_proposal":
      return await runDomainMutation(ctx, "rejectProposal", {
        proposalId: input.proposalId,
        reason: reasonOrNote(input),
        workosOrganizationId: org,
      });
    case "approve_proposal":
      return await runDomainMutation(ctx, "approveProposal", {
        permitWaiverReason: optionalString(input.permitWaiverReason),
        proposalId: input.proposalId,
        reason: reasonOrNote(input),
        workosOrganizationId: org,
      });
    case "assign_proposal_builder":
      return await runDomainMutation(ctx, "assignDraftBuilder", {
        builderProfileId: input.builderProfileId,
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "unassign_proposal_builder":
      return await runDomainMutation(ctx, "unassignDraftBuilder", {
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "create_proposal_claim_link":
      return await runDomainMutation(ctx, "createDraftProposalClaimLink", {
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "record_proposal_closing":
      return await runDomainMutation(ctx, "recordOfflineClosing", {
        buildStartDate: requiredString(
          input.buildStartDate ?? input.startDate,
          "buildStartDate"
        ),
        loanFacility: normalizeLoanFacility(input),
        proposalId: input.proposalId,
        reason: reasonOrNote(input),
        workosOrganizationId: org,
      });
    case "delete_draft_proposal":
      return await runDomainMutation(ctx, "deleteDraftProposal", {
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "update_proposal_approved_amount":
      return await runDomainMutation(ctx, "updateProductionProposalApprovedAmount", {
        approvedAmountCents: requiredPositiveCents(
          input.approvedAmountCents ?? input.amountCents,
          "Approved amount must be greater than zero."
        ),
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "update_proposal_interest_rate":
      return await runDomainMutation(ctx, "updateProductionProposalInterestRate", {
        interestAnnualBps: requiredNumber(
          input.interestAnnualBps ?? input.interestBps,
          "interestAnnualBps"
        ),
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "update_proposal_start_date":
      return await runDomainMutation(ctx, "updateProductionProposalProposedStartDate", {
        proposalId: input.proposalId,
        proposedStartDate: requiredString(
          input.proposedStartDate ?? input.startDate,
          "proposedStartDate"
        ),
        workosOrganizationId: org,
      });
    case "create_proposal_milestone":
      return await runDomainMutation(ctx, "createProductionTimelineMilestone", {
        milestone: normalizeTimelineMilestoneInput(input),
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "update_proposal_milestone":
      return await runDomainMutation(ctx, "updateProductionTimelineMilestone", {
        ...timelineMilestonePatchInput(input),
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "delete_proposal_milestone":
      return await runDomainMutation(ctx, "deleteProductionTimelineMilestone", {
        milestoneKey: input.milestoneKey,
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "create_proposal_draw":
      return await runDomainMutation(ctx, "createProductionTimelineDraw", {
        ...timelineDrawInput(input),
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "update_proposal_draw":
      return await runDomainMutation(ctx, "updateProductionTimelineDraw", {
        ...timelineDrawPatchInput(input),
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "delete_proposal_draw":
      return await runDomainMutation(ctx, "deleteProductionTimelineDraw", {
        drawKey: input.drawKey,
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "update_submitted_proposal_draw":
      return await runDomainMutation(ctx, "updateSubmittedProposalDrawScheduleRow", {
        amountCents: optionalNumber(input.amountCents),
        drawKey: input.drawKey,
        label: optionalString(input.label),
        proposalId: input.proposalId,
        reason: reasonOrNote(input),
        timingDay: optionalNumber(input.timingDay ?? input.x),
        workosOrganizationId: org,
      });
    case "create_proposal_capital_event":
      return await runDomainMutation(ctx, "createProductionTimelineCapitalEvent", {
        ...capitalEventInput(input),
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "update_proposal_capital_event":
      return await runDomainMutation(ctx, "updateProductionTimelineCapitalEvent", {
        ...capitalEventPatchInput(input),
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "delete_proposal_capital_event":
      return await runDomainMutation(ctx, "deleteProductionTimelineCapitalEvent", {
        capitalEventKey: input.capitalEventKey,
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "create_proposal_cash_infusion":
      return await runDomainMutation(ctx, "createProductionTimelineCashInfusion", {
        amountCents: input.amountCents,
        cashInfusionKey: input.cashInfusionKey ?? input.capitalEventKey,
        label: input.label,
        order: input.order,
        proposalId: input.proposalId,
        workosOrganizationId: org,
        x: input.x ?? input.timingDay,
      });
    case "update_proposal_evidence_asset":
      return await runDomainMutation(ctx, "updateProductionTimelineEvidenceAsset", {
        evidenceKey: input.evidenceKey,
        label: optionalString(input.label),
        proposalId: input.proposalId,
        tag: optionalString(input.tag),
        workosOrganizationId: org,
      });
    case "delete_proposal_evidence_asset":
      return await runDomainMutation(ctx, "deleteProductionTimelineEvidenceAsset", {
        evidenceKey: input.evidenceKey,
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "request_proposal_timeline_modification":
      return await runDomainMutation(ctx, "requestProductionTimelineModification", {
        milestoneKey: optionalString(input.milestoneKey),
        proposalId: input.proposalId,
        reason: reasonOrNote(input),
        requestType: input.requestType,
        requestedPayload: input.requestedPayload ?? input.payload ?? input,
        workosOrganizationId: org,
      });
    case "review_proposal_timeline_modification":
      return await runDomainMutation(ctx, "reviewProductionTimelineModificationRequest", {
        note: optionalString(input.note ?? input.reason),
        requestId: input.requestId,
        status: input.status,
        workosOrganizationId: org,
      });
    case "update_proposal_timeline_plan_state":
      return await runDomainMutation(ctx, "updateProductionTimelinePlanState", {
        ...timelinePlanStateInput(input),
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "create_proposal_cost_item":
      return await runDomainMutation(ctx, "createProposalCostItem", {
        ...costItemInput(input),
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "update_proposal_cost_item":
      return await runDomainMutation(ctx, "updateProposalCostItem", {
        ...costItemPatchInput(input),
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "delete_proposal_cost_item":
      return await runDomainMutation(ctx, "deleteProposalCostItem", {
        itemId: input.itemId,
        proposalId: input.proposalId,
        reason: optionalString(input.reason),
        workosOrganizationId: org,
      });
    case "attach_proposal_contractor":
      return await runDomainMutation(ctx, "attachProposalContractor", {
        ...contractorAttachmentInput(input),
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "create_and_attach_proposal_contractor":
      return await runDomainMutation(ctx, "createAndAttachProposalContractor", {
        contractor: normalizeContractorInput(input.contractor ?? input),
        proposalId: input.proposalId,
        role: optionalString(input.role),
        workosOrganizationId: org,
      });
    case "assign_proposal_contractor_to_scope":
      return await runDomainMutation(ctx, "assignProposalContractorToMilestone", {
        ...contractorScopeAssignmentInput(input),
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "update_proposal_builder_staff_permissions":
      return await runDomainMutation(ctx, "saveProposalBuilderStaffPermissions", {
        permissions: input.permissions ?? [],
        proposalId: input.proposalId,
        staffEmail: optionalString(input.staffEmail),
        staffWorkosUserId: optionalString(input.staffWorkosUserId),
        workosOrganizationId: org,
      });
    case "remove_proposal_builder_staff":
      return await runDomainMutation(ctx, "removeProposalBuilderStaffMember", {
        proposalId: input.proposalId,
        staffWorkosUserId: input.staffWorkosUserId,
        workosOrganizationId: org,
      });
    case "save_calendar_view":
      return await runDomainMutation(ctx, "saveCalendarView", {
        filters: input.filters ?? {},
        isDefault: Boolean(input.isDefault),
        label: input.label,
        surface: input.surface,
        timeframe: input.timeframe,
        viewKey: input.viewKey,
        workosOrganizationId: org,
      });
    case "create_calendar_sync_subscription":
      return await runDomainMutation(ctx, "createCalendarSyncSubscription", {
        buildId: input.buildId,
        direction: input.direction,
        filters: input.filters ?? {},
        provider: input.provider,
        proposalId: input.proposalId,
        surface: input.surface,
        workosOrganizationId: org,
      });
    case "start_proposal_collaboration":
      return await runCollaborationMutation(ctx, "startSession", {
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "stop_proposal_collaboration":
      return await runCollaborationMutation(ctx, "stopSession", {
        reason: optionalString(input.reason),
        sessionId: input.sessionId,
        workosOrganizationId: org,
      });
    case "invite_proposal_collaborator":
      return await runCollaborationMutation(ctx, "inviteParticipant", {
        inviteEmail: optionalString(input.inviteEmail ?? input.email),
        permission: input.permission ?? "view",
        sessionId: input.sessionId,
        targetWorkosUserId: optionalString(input.targetWorkosUserId),
        workosOrganizationId: org,
      });
    case "set_proposal_collaborator_permission":
      return await runCollaborationMutation(ctx, "setParticipantPermission", {
        participantId: input.participantId,
        permission: input.permission,
        reason: optionalString(input.reason),
        sessionId: input.sessionId,
        targetWorkosUserId: optionalString(input.targetWorkosUserId),
        workosOrganizationId: org,
      });
    case "assign_collaboration_to_builder":
      return await runCollaborationMutation(ctx, "assignSessionToBuilder", {
        reason: optionalString(input.reason),
        sessionId: input.sessionId,
        targetWorkosUserId: input.targetWorkosUserId,
        workosOrganizationId: org,
      });
    case "undo_proposal_timeline":
      return await runCollaborationMutation(ctx, "undoProposalTimeline", {
        proposalId: input.proposalId,
        reason: optionalString(input.reason),
        sessionId: input.sessionId,
        workosOrganizationId: org,
      });
    case "redo_proposal_timeline":
      return await runCollaborationMutation(ctx, "redoProposalTimeline", {
        proposalId: input.proposalId,
        reason: optionalString(input.reason),
        sessionId: input.sessionId,
        workosOrganizationId: org,
      });
    case "join_proposal_collaboration":
      return await runCollaborationMutation(ctx, "joinSession", {
        shareToken: input.shareToken,
        workosOrganizationId: org,
      });
    case "update_active_build_details":
      return await runDomainMutation(ctx, "updateActiveBuildNonFinancialDetails", {
        buildId: input.buildId,
        buildName: input.buildName,
        location: input.location,
        locationLatitude: input.locationLatitude,
        locationLongitude: input.locationLongitude,
        locationPlaceId: input.locationPlaceId,
        reason: reasonOrNote(input),
        startDate: input.startDate,
        workosOrganizationId: org,
      });
    case "add_active_build_note":
      return await runDomainMutation(ctx, "addActiveBuildNote", {
        body: input.body ?? input.note,
        buildId: input.buildId,
        visibility: input.visibility ?? "internal",
        workosOrganizationId: org,
      });
    case "delete_active_build":
      return await runDomainMutation(ctx, "deleteActiveBuild", {
        buildId: input.buildId,
        reason: reasonOrNote(input),
        workosOrganizationId: org,
      });
    case "create_active_build_cost_item":
      return await runDomainMutation(ctx, "createActiveBuildCostItem", {
        ...costItemInput(input),
        buildId: input.buildId,
        workosOrganizationId: org,
      });
    case "update_active_build_cost_item":
      return await runDomainMutation(ctx, "updateActiveBuildCostItem", {
        ...costItemPatchInput(input),
        buildId: input.buildId,
        workosOrganizationId: org,
      });
    case "delete_active_build_cost_item":
      return await runDomainMutation(ctx, "deleteActiveBuildCostItem", {
        buildId: input.buildId,
        itemId: input.itemId,
        reason: optionalString(input.reason),
        workosOrganizationId: org,
      });
    case "attach_active_build_contractor":
      return await runDomainMutation(ctx, "attachActiveBuildContractor", {
        ...contractorAttachmentInput(input),
        buildId: input.buildId,
        workosOrganizationId: org,
      });
    case "create_and_assign_active_build_contractor": {
      const contractorId = await runDomainMutation(ctx, "createContractorProfile", {
        ...normalizeContractorInput(input.contractor ?? input),
        brokerageId: auth.brokerage._id,
        workosOrganizationId: org,
      });
      return await runDomainMutation(ctx, "assignActiveBuildContractorToMilestone", {
        ...contractorScopeAssignmentInput({ ...input, contractorId }),
        buildId: input.buildId,
        workosOrganizationId: org,
      });
    }
    case "assign_active_build_contractor_to_scope":
      return await runDomainMutation(ctx, "assignActiveBuildContractorToMilestone", {
        ...contractorScopeAssignmentInput(input),
        buildId: input.buildId,
        workosOrganizationId: org,
      });
    case "start_active_build_milestone":
      return await runDomainMutation(ctx, "startActiveBuildMilestone", {
        buildId: input.buildId,
        milestoneKey: input.milestoneKey,
        note: optionalString(input.note ?? input.reason),
        workosOrganizationId: org,
      });
    case "submit_active_build_milestone_completion":
      return await runDomainMutation(ctx, "submitActiveBuildMilestoneCompletion", {
        actualCostCents: optionalNumber(input.actualCostCents),
        buildId: input.buildId,
        completedDay: input.completedDay,
        milestoneKey: input.milestoneKey,
        note: optionalString(input.note),
        qualityNote: optionalString(input.qualityNote),
        qualityRating: optionalNumber(input.qualityRating),
        workosOrganizationId: org,
      });
    case "approve_active_build_milestone":
      return await runDomainMutation(ctx, "approveActiveBuildMilestone", {
        buildId: input.buildId,
        milestoneKey: input.milestoneKey,
        note: optionalString(input.note ?? input.reason),
        workosOrganizationId: org,
      });
    case "reject_active_build_milestone":
      return await runDomainMutation(ctx, "rejectActiveBuildMilestone", {
        buildId: input.buildId,
        milestoneKey: input.milestoneKey,
        note: optionalString(input.note ?? input.reason),
        workosOrganizationId: org,
      });
    case "request_active_build_milestone_info":
      return await runDomainMutation(ctx, "requestActiveBuildMilestoneInfo", {
        buildId: input.buildId,
        milestoneKey: input.milestoneKey,
        note: reasonOrNote(input),
        workosOrganizationId: org,
      });
    case "review_active_build_evidence":
      return await runDomainMutation(ctx, "reviewActiveBuildEvidence", {
        accepted: Boolean(input.accepted),
        buildId: input.buildId,
        milestoneKey: input.milestoneKey,
        note: optionalString(input.note ?? input.reason),
        workosOrganizationId: org,
      });
    case "update_active_build_evidence_asset":
      return await runDomainMutation(ctx, "updateActiveBuildTimelineEvidenceAsset", {
        buildId: input.buildId,
        evidenceKey: input.evidenceKey,
        label: optionalString(input.label),
        tag: optionalString(input.tag),
        workosOrganizationId: org,
      });
    case "delete_active_build_evidence_asset":
      return await runDomainMutation(ctx, "deleteActiveBuildTimelineEvidenceAsset", {
        buildId: input.buildId,
        evidenceKey: input.evidenceKey,
        workosOrganizationId: org,
      });
    case "record_active_build_site_visit":
      return await runDomainMutation(ctx, "recordActiveBuildSiteVisit", {
        buildId: input.buildId,
        milestoneKey: input.milestoneKey,
        note: optionalString(input.note ?? input.reason),
        status: input.status ?? "complete",
        visitId: input.visitId,
        workosOrganizationId: org,
      });
    case "request_active_build_draw":
      return await runDomainMutation(ctx, "requestActiveBuildDraw", {
        amountCents: input.amountCents,
        buildId: input.buildId,
        drawKey: input.drawKey,
        note: optionalString(input.note ?? input.reason),
        workosOrganizationId: org,
      });
    case "approve_active_build_draw":
      return await runDomainMutation(ctx, "approveActiveBuildDraw", {
        buildId: input.buildId,
        drawKey: input.drawKey,
        note: optionalString(input.note ?? input.reason),
        workosOrganizationId: org,
      });
    case "reject_active_build_draw":
      return await runDomainMutation(ctx, "rejectActiveBuildDraw", {
        buildId: input.buildId,
        drawKey: input.drawKey,
        note: optionalString(input.note ?? input.reason),
        workosOrganizationId: org,
      });
    case "release_active_build_draw":
      return await runDomainMutation(ctx, "releaseActiveBuildDraw", {
        buildId: input.buildId,
        drawKey: input.drawKey,
        note: optionalString(input.note ?? input.reason),
        releaseDate: input.releaseDate,
        workosOrganizationId: org,
      });
    case "request_active_build_facility_change":
      return await runDomainMutation(ctx, "requestActiveBuildFacilityChange", {
        buildId: input.buildId,
        reason: optionalString(input.reason),
        requestedPrincipalCents: input.requestedPrincipalCents,
        requestType: "principalIncrease",
        workosOrganizationId: org,
      });
    case "request_active_build_payback_extension":
      return await runDomainMutation(ctx, "requestActiveBuildFacilityChange", {
        buildId: input.buildId,
        reason: optionalString(input.reason),
        requestedPaybackDate: input.requestedPaybackDate ?? input.paybackDate,
        requestType: "paybackExtension",
        workosOrganizationId: org,
      });
    case "review_active_build_facility_change":
      return await runDomainMutation(ctx, "reviewActiveBuildFacilityChangeRequest", {
        note: optionalString(input.note ?? input.reason),
        requestId: input.requestId,
        status: input.status,
        workosOrganizationId: org,
      });
    case "update_active_build_builder_staff_permissions":
      return await runDomainMutation(ctx, "saveActiveBuildBuilderStaffPermissions", {
        buildId: input.buildId,
        permissions: input.permissions ?? [],
        staffEmail: optionalString(input.staffEmail),
        staffWorkosUserId: optionalString(input.staffWorkosUserId),
        workosOrganizationId: org,
      });
    case "remove_active_build_builder_staff":
      return await runDomainMutation(ctx, "removeActiveBuildBuilderStaffMember", {
        buildId: input.buildId,
        staffWorkosUserId: input.staffWorkosUserId,
        workosOrganizationId: org,
      });
    case "create_active_build_milestone":
      return await runDomainMutation(ctx, "createActiveBuildTimelineMilestone", {
        buildId: input.buildId,
        milestone: normalizeTimelineMilestoneInput(input),
        workosOrganizationId: org,
      });
    case "update_active_build_milestone":
      return await runDomainMutation(ctx, "updateActiveBuildTimelineMilestone", {
        ...timelineMilestonePatchInput(input),
        buildId: input.buildId,
        workosOrganizationId: org,
      });
    case "delete_active_build_milestone":
      return await runDomainMutation(ctx, "deleteActiveBuildTimelineMilestone", {
        buildId: input.buildId,
        milestoneKey: input.milestoneKey,
        workosOrganizationId: org,
      });
    case "create_active_build_draw":
      return await runDomainMutation(ctx, "createActiveBuildTimelineDraw", {
        ...timelineDrawInput(input),
        buildId: input.buildId,
        workosOrganizationId: org,
      });
    case "update_active_build_draw":
      return await runDomainMutation(ctx, "updateActiveBuildTimelineDraw", {
        ...timelineDrawPatchInput(input),
        buildId: input.buildId,
        workosOrganizationId: org,
      });
    case "delete_active_build_draw":
      return await runDomainMutation(ctx, "deleteActiveBuildTimelineDraw", {
        buildId: input.buildId,
        drawKey: input.drawKey,
        workosOrganizationId: org,
      });
    case "create_active_build_capital_event":
      return await runDomainMutation(ctx, "createActiveBuildTimelineCapitalEvent", {
        ...capitalEventInput(input),
        buildId: input.buildId,
        workosOrganizationId: org,
      });
    case "update_active_build_capital_event":
      return await runDomainMutation(ctx, "updateActiveBuildTimelineCapitalEvent", {
        ...capitalEventPatchInput(input),
        buildId: input.buildId,
        workosOrganizationId: org,
      });
    case "delete_active_build_capital_event":
      return await runDomainMutation(ctx, "deleteActiveBuildTimelineCapitalEvent", {
        buildId: input.buildId,
        capitalEventKey: input.capitalEventKey,
        workosOrganizationId: org,
      });
    case "request_active_build_capital_event_revision":
    case "request_active_build_cash_infusion":
    case "apply_active_build_modification":
      return await applyActiveBuildGenericRevisionRequest(ctx, auth, item);
    case "update_active_build_timeline_plan_state":
      return await runDomainMutation(ctx, "updateActiveBuildTimelinePlanState", {
        ...timelinePlanStateInput(input),
        buildId: input.buildId,
        workosOrganizationId: org,
      });
    default:
      throw new Error(`Assistant action is not implemented: ${item.actionKey}`);
  }
}

async function applyActiveBuildGenericRevisionRequest(
  ctx: MutationCtx,
  auth: AssistantAuth,
  item: AssistantPlanItem
) {
  const input = item.input;
  const buildAuth = await authorizeActiveBuild(ctx, auth, input);
  requireReason(input.reason);
  const now = Date.now();
  const entityKey =
    optionalString(input.capitalEventKey) ??
    optionalString(input.cashInfusionKey) ??
    optionalString(input.milestoneKey) ??
    item.actionKey;
  const revisionId = await ctx.db.insert("scheduleRevisionRecords", {
    brokerageId: buildAuth.brokerage._id,
    buildId: buildAuth.build._id,
    createdAt: now,
    entityKey,
    entityType:
      item.actionKey === "apply_active_build_modification"
        ? "activeBuildModification"
        : "capitalEvent",
    newState: sanitizeForPersistence(input),
    organizationId: buildAuth.organizationId,
    priorState: null,
    proposalId: buildAuth.proposal._id,
    reason: requiredReason(input.reason),
    revisionType: `assistant.${item.actionKey}`,
    revisedByWorkosUserId: buildAuth.subject,
    warnings: ["assistant-request-only"],
  });
  await writeActiveBuildAudit(ctx, buildAuth, {
    command: `assistant.commit.${item.actionKey}`,
    entityId: String(revisionId),
    entityType:
      item.actionKey === "apply_active_build_modification"
        ? "activeBuildModification"
        : "capitalEvent",
    eventType: `assistant.${item.actionKey}`,
    newState: input,
    reason: requiredReason(input.reason),
    warnings: ["assistant-request-only"],
  });
  return { revisionId };
}

async function authorizeOrganization(
  ctx: (QueryCtx | MutationCtx) & {
    viewer: { organizationId?: string; roles: RoleSlug[]; subject: string };
  },
  workosOrganizationId: string
): Promise<AssistantAuth> {
  if (ctx.viewer.organizationId !== workosOrganizationId) {
    throw new Error("Forbidden: organization scope");
  }
  const brokerage = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (q) =>
      q.eq("workosOrganizationId", workosOrganizationId)
    )
    .unique();
  if (!brokerage || brokerage.status !== "active") {
    throw new Error("Forbidden: brokerage scope");
  }
  const roles = normalizeRoleSlugs(ctx.viewer.roles);
  return {
    brokerage,
    organizationId: workosOrganizationId,
    roles,
    subject: ctx.viewer.subject,
  };
}

async function authorizeProposal(
  ctx: QueryCtx | MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
): Promise<ProposalAuth> {
  const proposalId = requiredId<"buildProposals">(
    ctx,
    "buildProposals",
    input.proposalId,
    "proposalId"
  );
  const proposal = await ctx.db.get(proposalId);
  if (
    !proposal ||
    proposal.organizationId !== auth.organizationId ||
    proposal.brokerageId !== auth.brokerage._id
  ) {
    throw new Error("Forbidden: proposal scope");
  }
  if (isBackoffice(auth.roles)) {
    return { ...auth, proposal };
  }
  if (!isBuilder(auth.roles)) {
    throw new Error("Forbidden: proposal scope");
  }
  if (!proposal.builderProfileId) {
    throw new Error("Forbidden: proposal builder scope");
  }
  const link = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder_user", (q) =>
      q
        .eq("builderProfileId", proposal.builderProfileId!)
        .eq("workosUserId", auth.subject)
    )
    .unique();
  if (!link || link.status !== "active") {
    throw new Error("Forbidden: proposal builder scope");
  }
  return { ...auth, proposal };
}

async function authorizeActiveBuild(
  ctx: QueryCtx | MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
): Promise<ActiveBuildAuth> {
  const buildId = requiredId<"activeBuilds">(
    ctx,
    "activeBuilds",
    input.buildId,
    "buildId"
  );
  const build = await ctx.db.get(buildId);
  if (
    !build ||
    build.organizationId !== auth.organizationId ||
    build.brokerageId !== auth.brokerage._id
  ) {
    throw new Error("Forbidden: active build scope");
  }
  const proposal = await ctx.db.get(build.proposalId);
  if (!proposal || proposal.brokerageId !== auth.brokerage._id) {
    throw new Error("Forbidden: active build proposal scope");
  }
  if (!(isBackoffice(auth.roles) || isBuilder(auth.roles))) {
    throw new Error("Forbidden: active build scope");
  }
  return { ...auth, build, proposal };
}

async function requireThread(
  ctx: QueryCtx | MutationCtx,
  threadId: Id<"assistantThreads">,
  workosOrganizationId: string
) {
  const thread = await ctx.db.get(threadId);
  if (!thread || thread.organizationId !== workosOrganizationId) {
    throw new Error("Assistant thread not found for organization.");
  }
  return thread;
}

function requireProposalWrite(auth: ProposalAuth) {
  if (isBackoffice(auth.roles)) {
    if (
      BACKOFFICE_WRITE_ROLES.some((role) => auth.roles.includes(role)) &&
      (auth.roles.includes("admin") ||
        auth.roles.includes("principle-broker") ||
        auth.proposal.assignedBrokerWorkosUserId === auth.subject)
    ) {
      return;
    }
    throw new Error("Forbidden: proposal write");
  }
  if (isBuilder(auth.roles) && auth.proposal.status === "draft") {
    return;
  }
  throw new Error("Forbidden: proposal write");
}

function requireBackofficeWrite(roles: readonly RoleSlug[]) {
  if (
    roles.includes("admin") ||
    roles.includes("principle-broker") ||
    roles.includes("broker")
  ) {
    return;
  }
  throw new Error("Forbidden: backoffice write");
}

function denyContractorMutationBatch(roles: readonly RoleSlug[]) {
  if (roles.includes("contractor")) {
    throw new Error("Contractor assistant access is read-only in v1.");
  }
}

function previewItem(
  action: {
    actionKey: AssistantActionKey;
    clientRequestId: string;
    input: AssistantActionInput;
  },
  input: {
    after: unknown;
    before: unknown;
    entityLabel: string;
    entityType: string;
    errors?: string[];
    mutationName?: string;
    reasonRequired: boolean;
    warnings?: string[];
  }
): AssistantPlanItem {
  return {
    actionKey: action.actionKey,
    after: sanitizeForPersistence(input.after),
    before: sanitizeForPersistence(input.before),
    clientRequestId: action.clientRequestId,
    entityLabel: input.entityLabel,
    entityType: input.entityType,
    input: sanitizeForPersistence(action.input),
    ...(input.mutationName ? { mutationName: input.mutationName } : {}),
    reasonRequired: input.reasonRequired,
    status: "preview",
    validation: {
      errors: input.errors ?? [],
      warnings: input.warnings ?? [],
    },
  };
}

async function getProposalMilestone(
  ctx: QueryCtx | MutationCtx,
  input: AssistantActionInput,
  proposalId: Id<"buildProposals">
) {
  return await getProposalMilestoneByKey(
    ctx,
    proposalId,
    requiredString(input.milestoneKey, "milestoneKey")
  );
}

async function getProposalMilestoneByKey(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  milestoneKey: string
) {
  const milestone = await ctx.db
    .query("proposalMilestones")
    .withIndex("by_proposal_key", (q) =>
      q.eq("proposalId", proposalId).eq("key", milestoneKey)
    )
    .unique();
  if (!milestone) {
    throw new Error("Production proposal milestone not found.");
  }
  return milestone;
}

async function getBuildMilestone(
  ctx: QueryCtx | MutationCtx,
  input: AssistantActionInput,
  buildId: Id<"activeBuilds">
) {
  const milestoneKey = requiredString(input.milestoneKey, "milestoneKey");
  const milestone = await ctx.db
    .query("buildMilestones")
    .withIndex("by_build_key", (q) =>
      q.eq("buildId", buildId).eq("key", milestoneKey)
    )
    .unique();
  if (!milestone) {
    throw new Error("Active-build milestone not found.");
  }
  return milestone;
}

async function findProposalDraw(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  drawKey: string
) {
  return await ctx.db
    .query("proposalDrawScheduleRows")
    .withIndex("by_proposal_key", (q) =>
      q.eq("proposalId", proposalId).eq("drawKey", drawKey)
    )
    .unique();
}

async function getProposalDraw(
  ctx: QueryCtx | MutationCtx,
  input: AssistantActionInput,
  proposalId: Id<"buildProposals">
) {
  const draw = await findProposalDraw(
    ctx,
    proposalId,
    requiredString(input.drawKey, "drawKey")
  );
  if (!draw) {
    throw new Error("Proposal draw schedule row not found.");
  }
  return draw;
}

async function findBuildDraw(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  drawKey: string
) {
  const draws = (await collectByIndex(
    ctx,
    "plannedDrawScheduleRows",
    "by_build",
    buildId
  )) as Doc<"plannedDrawScheduleRows">[];
  return draws.find((row) => row.drawKey === drawKey) ?? null;
}

async function getReminder(
  ctx: QueryCtx | MutationCtx,
  input: AssistantActionInput,
  proposalId: Id<"buildProposals">
) {
  const eventId = requiredId<"calendarReminderEvents">(
    ctx,
    "calendarReminderEvents",
    input.eventId,
    "eventId"
  );
  const event = await ctx.db.get(eventId);
  if (!event || event.proposalId !== proposalId) {
    throw new Error("Reminder calendar event not found.");
  }
  return event;
}

async function getSiteVisit(
  ctx: QueryCtx | MutationCtx,
  input: AssistantActionInput,
  buildId: Id<"activeBuilds">
) {
  const visitId = requiredString(input.visitId, "visitId");
  const visit = await ctx.db
    .query("buildSiteVisits")
    .withIndex("by_visit", (q) => q.eq("visitId", visitId))
    .unique();
  if (!visit || visit.buildId !== buildId) {
    throw new Error("Active-build site visit not found.");
  }
  return visit;
}

async function touchProposal(
  ctx: MutationCtx,
  auth: ProposalAuth,
  now: number
) {
  await ctx.db.patch(auth.proposal._id, {
    updatedAt: now,
    updatedByWorkosUserId: auth.subject,
  });
}

async function recalculateProposalBudget(
  ctx: MutationCtx,
  auth: ProposalAuth,
  now: number
) {
  const milestones = await collectByIndex(
    ctx,
    "proposalMilestones",
    "by_proposal",
    auth.proposal._id
  );
  const totalBudgetCents = milestones.reduce(
    (total: number, milestone: any) => total + milestone.budgetCents,
    0
  );
  await ctx.db.patch(auth.proposal._id, {
    totalBudgetCents,
    updatedAt: now,
    updatedByWorkosUserId: auth.subject,
  });
}

async function ensureProposalPolicyLimitCoversDraws(
  ctx: MutationCtx,
  auth: ProposalAuth,
  now: number
) {
  const draws = await collectByIndex(
    ctx,
    "proposalDrawScheduleRows",
    "by_proposal",
    auth.proposal._id
  );
  const totalDrawAmountCents = draws.reduce(
    (total: number, draw: any) => total + draw.amountCents,
    0
  );
  if (totalDrawAmountCents > auth.proposal.lenderDrawPolicyLimitCents) {
    await ctx.db.patch(auth.proposal._id, {
      lenderDrawPolicyLimitCents: totalDrawAmountCents,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
  } else {
    await touchProposal(ctx, auth, now);
  }
}

async function writeScheduleRevision(
  ctx: MutationCtx,
  auth: ProposalAuth,
  input: {
    entityKey: string;
    entityType: string;
    newState: unknown;
    priorState: unknown;
    reason: string;
    revisionType: string;
  }
) {
  await ctx.db.insert("scheduleRevisionRecords", {
    brokerageId: auth.brokerage._id,
    createdAt: Date.now(),
    entityKey: input.entityKey,
    entityType: input.entityType,
    newState: sanitizeForPersistence(input.newState),
    organizationId: auth.organizationId,
    priorState: sanitizeForPersistence(input.priorState),
    proposalId: auth.proposal._id,
    reason: input.reason,
    revisionType: input.revisionType,
    revisedByWorkosUserId: auth.subject,
    warnings: [],
  });
}

async function writeProposalAudit(
  ctx: MutationCtx,
  auth: ProposalAuth,
  input: {
    command: string;
    entityId: string;
    entityType: string;
    eventType: string;
    newState?: unknown;
    priorState?: unknown;
    reason?: string;
    warnings?: string[];
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: auth.roles,
    actorWorkosUserId: auth.subject,
    brokerageId: auth.brokerage._id,
    command: input.command,
    createdAt: Date.now(),
    entityId: input.entityId,
    entityType: input.entityType,
    eventType: input.eventType,
    newState:
      input.newState === undefined
        ? undefined
        : JSON.stringify(sanitizeForPersistence(input.newState)),
    organizationId: auth.organizationId,
    priorState:
      input.priorState === undefined
        ? undefined
        : JSON.stringify(sanitizeForPersistence(input.priorState)),
    reason: input.reason,
    warnings: input.warnings ?? [],
  });
}

async function writeActiveBuildAudit(
  ctx: MutationCtx,
  auth: ActiveBuildAuth,
  input: {
    command: string;
    entityId: string;
    entityType: string;
    eventType: string;
    newState?: unknown;
    priorState?: unknown;
    reason?: string;
    warnings?: string[];
  }
) {
  await writeProposalAudit(ctx, auth, input);
}

async function collectByIndex(
  ctx: QueryCtx | MutationCtx,
  table: string,
  indexName: string,
  value: unknown
) {
  return await (ctx.db.query(table as any) as any)
    .withIndex(indexName, (q: any) =>
      q.eq(indexName.includes("build") ? "buildId" : "proposalId", value)
    )
    .collect();
}

async function genericProposalPreviewBefore(
  ctx: MutationCtx,
  auth: ProposalAuth,
  action: { actionKey: AssistantActionKey; input: AssistantActionInput }
) {
  if (action.input.milestoneKey) {
    return await getProposalMilestoneByKey(
      ctx,
      auth.proposal._id,
      String(action.input.milestoneKey)
    ).catch(() => auth.proposal);
  }
  if (action.input.drawKey) {
    return (
      (await findProposalDraw(
        ctx,
        auth.proposal._id,
        String(action.input.drawKey)
      )) ?? auth.proposal
    );
  }
  if (action.input.itemId) {
    const itemId = optionalId<"proposalCostItems">(
      ctx,
      "proposalCostItems",
      action.input.itemId
    );
    return itemId ? (await ctx.db.get(itemId)) ?? auth.proposal : auth.proposal;
  }
  if (action.input.capitalEventKey) {
    return (
      (await findProposalCapitalEvent(
        ctx,
        auth.proposal._id,
        String(action.input.capitalEventKey)
      )) ?? auth.proposal
    );
  }
  if (action.input.evidenceKey) {
    return (
      (await findProposalEvidenceAsset(
        ctx,
        auth.proposal._id,
        String(action.input.evidenceKey)
      )) ?? auth.proposal
    );
  }
  return auth.proposal;
}

async function genericActiveBuildPreviewBefore(
  ctx: MutationCtx,
  auth: ActiveBuildAuth,
  action: { actionKey: AssistantActionKey; input: AssistantActionInput }
) {
  if (action.input.milestoneKey) {
    return await getBuildMilestone(ctx, action.input, auth.build._id).catch(
      () => auth.build
    );
  }
  if (action.input.drawKey) {
    return (
      (await findBuildDraw(
        ctx,
        auth.build._id,
        String(action.input.drawKey)
      )) ?? auth.build
    );
  }
  if (action.input.itemId) {
    const itemId = optionalId<"buildCostItems">(
      ctx,
      "buildCostItems",
      action.input.itemId
    );
    return itemId ? (await ctx.db.get(itemId)) ?? auth.build : auth.build;
  }
  if (action.input.capitalEventKey) {
    return (
      (await findActiveBuildCapitalEvent(
        ctx,
        auth.build._id,
        String(action.input.capitalEventKey)
      )) ?? auth.build
    );
  }
  if (action.input.evidenceKey) {
    return (
      (await findActiveBuildEvidenceAsset(
        ctx,
        auth.build._id,
        String(action.input.evidenceKey)
      )) ?? auth.build
    );
  }
  return auth.build;
}

async function findProposalCapitalEvent(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  capitalEventKey: string
) {
  return await ctx.db
    .query("proposalCapitalEvents")
    .withIndex("by_proposal_key", (q) =>
      q.eq("proposalId", proposalId).eq("capitalEventKey", capitalEventKey)
    )
    .unique();
}

async function findProposalEvidenceAsset(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  evidenceKey: string
) {
  return await ctx.db
    .query("proposalEvidenceAssets")
    .withIndex("by_proposal_key", (q) =>
      q.eq("proposalId", proposalId).eq("evidenceKey", evidenceKey)
    )
    .unique();
}

async function findActiveBuildCapitalEvent(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  capitalEventKey: string
) {
  return await ctx.db
    .query("capitalEvents")
    .withIndex("by_build", (q) => q.eq("buildId", buildId))
    .collect()
    .then(
      (rows) =>
        rows.find((row) => row.capitalEventKey === capitalEventKey) ?? null
    );
}

async function findActiveBuildEvidenceAsset(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  evidenceKey: string
) {
  return await ctx.db
    .query("buildEvidenceAssets")
    .withIndex("by_build_key", (q) =>
      q.eq("buildId", buildId).eq("evidenceKey", evidenceKey)
    )
    .unique();
}

function genericPreviewLabel(before: unknown, fallback: string) {
  if (before && typeof before === "object") {
    const record = before as Record<string, unknown>;
    return String(
      record.name ??
        record.title ??
        record.label ??
        record.buildName ??
        record.drawKey ??
        record.key ??
        fallback
    );
  }
  return fallback;
}

function genericEntityType(actionKey: AssistantActionKey, fallback: string) {
  if (String(actionKey).includes("cost_item")) {
    return "costItem";
  }
  if (String(actionKey).includes("contractor")) {
    return "contractorAssignment";
  }
  if (String(actionKey).includes("staff")) {
    return "builderStaffPermission";
  }
  if (String(actionKey).includes("collaboration")) {
    return "proposalCollaborationSession";
  }
  if (String(actionKey).includes("milestone")) {
    return "milestone";
  }
  if (String(actionKey).includes("draw")) {
    return "draw";
  }
  if (String(actionKey).includes("capital")) {
    return "capitalEvent";
  }
  if (String(actionKey).includes("evidence")) {
    return "evidenceAsset";
  }
  return fallback;
}

function genericReasonRequired(actionKey: MutationActionKey) {
  return (GENERIC_REASON_REQUIRED_ACTION_KEYS as readonly string[]).includes(
    actionKey
  );
}

function genericMutationWarnings(actionKey: MutationActionKey) {
  const warnings: string[] = ["delegates-to-domain-mutation"];
  if (
    (ACTIVE_BUILD_REQUEST_ONLY_ACTION_KEYS as readonly string[]).includes(
      actionKey
    )
  ) {
    warnings.push("active-build-request-only");
  }
  if (
    actionKey === "provision_proposal_builder_staff" ||
    actionKey === "provision_active_build_builder_staff"
  ) {
    warnings.push("workos-action-runtime-required");
  }
  return warnings;
}

async function runDomainMutation(
  ctx: MutationCtx,
  name: string,
  args: Record<string, unknown>
) {
  return await (ctx as any).runMutation(
    (api as any).production_proposals[name],
    stripUndefined(args)
  );
}

async function runCollaborationMutation(
  ctx: MutationCtx,
  name: string,
  args: Record<string, unknown>
) {
  return await (ctx as any).runMutation(
    (api as any).proposal_collaboration[name],
    stripUndefined(args)
  );
}

function stripUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([, nested]) => nested !== undefined)
  );
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function reasonOrNote(input: AssistantActionInput) {
  return requiredReason(input.reason ?? input.note);
}

function normalizeLoanFacility(input: AssistantActionInput) {
  const loanFacility = normalizeRecord(input.loanFacility, "loanFacility");
  return {
    interestAnnualBps: requiredNumber(
      loanFacility.interestAnnualBps ?? input.interestAnnualBps ?? 925,
      "interestAnnualBps"
    ),
    principalCents: requiredPositiveCents(
      loanFacility.principalCents ??
        input.principalCents ??
        input.approvedAmountCents,
      "Loan principal must be greater than zero."
    ),
  };
}

function normalizeTimelineMilestoneInput(input: AssistantActionInput) {
  const milestone = normalizeRecord(input.milestone ?? input, "milestone");
  const dayStart = Math.max(
    0,
    Math.round(requiredNumber(milestone.dayStart ?? milestone.x ?? 0, "dayStart"))
  );
  const durationDays = Math.max(
    1,
    Math.round(
      requiredNumber(
        milestone.durationDays ??
          (typeof milestone.dayEnd === "number"
            ? milestone.dayEnd - dayStart
            : 1),
        "durationDays"
      )
    )
  );
  return {
    budgetCents: requiredPositiveCents(
      milestone.budgetCents ?? milestone.amountCents,
      "Milestone budget must be greater than zero."
    ),
    dayEnd: Math.max(
      dayStart,
      Math.round(
        optionalNumber(milestone.dayEnd) ?? dayStart + durationDays
      )
    ),
    dayStart,
    dependencyKeys: stringArray(milestone.dependencyKeys),
    durationDays,
    icon: optionalString(milestone.icon),
    key: requiredString(milestone.key ?? milestone.milestoneKey, "milestoneKey"),
    name: requiredString(milestone.name ?? milestone.title, "Milestone name"),
    order: Math.max(1, Math.round(optionalNumber(milestone.order) ?? 1)),
    submilestones: normalizeSubmilestones(milestone.submilestones),
  };
}

function timelineMilestonePatchInput(input: AssistantActionInput) {
  return stripUndefined({
    budgetCents: optionalNumber(input.budgetCents),
    dayEnd: optionalNumber(input.dayEnd),
    dayStart: optionalNumber(input.dayStart),
    dependencyKeys: Array.isArray(input.dependencyKeys)
      ? stringArray(input.dependencyKeys)
      : undefined,
    drawAvailabilityCents: optionalNumber(input.drawAvailabilityCents),
    durationDays: optionalNumber(input.durationDays),
    evidenceState: optionalString(input.evidenceState),
    icon: optionalString(input.icon),
    isDragLocked:
      typeof input.isDragLocked === "boolean" ? input.isDragLocked : undefined,
    lane: optionalNumber(input.lane),
    markerLabel: optionalString(input.markerLabel),
    milestoneKey: requiredString(input.milestoneKey, "milestoneKey"),
    name: optionalString(input.name ?? input.title),
    order: optionalNumber(input.order),
    policyState: optionalString(input.policyState),
    progressPercent: optionalNumber(input.progressPercent),
    status: optionalString(input.status),
    submilestones: input.submilestones
      ? normalizeSubmilestones(input.submilestones)
      : undefined,
    tone: optionalString(input.tone),
  });
}

function timelineDrawInput(input: AssistantActionInput) {
  return stripUndefined({
    amountCents: requiredPositiveCents(
      input.amountCents,
      "Draw amount must be greater than zero."
    ),
    customDate:
      typeof input.customDate === "boolean" ? input.customDate : undefined,
    drawKey: requiredString(input.drawKey, "drawKey"),
    itemMilestoneKey: optionalString(input.itemMilestoneKey ?? input.milestoneKey),
    label: requiredString(input.label ?? input.drawKey, "label"),
    order: optionalNumber(input.order),
    x: requiredNonNegativeDay(input.x ?? input.timingDay, "timingDay"),
  });
}

function timelineDrawPatchInput(input: AssistantActionInput) {
  return stripUndefined({
    amountCents: optionalNumber(input.amountCents),
    customDate:
      typeof input.customDate === "boolean" ? input.customDate : undefined,
    drawKey: requiredString(input.drawKey, "drawKey"),
    itemMilestoneKey: optionalString(input.itemMilestoneKey ?? input.milestoneKey),
    label: optionalString(input.label),
    order: optionalNumber(input.order),
    x: optionalNumber(input.x ?? input.timingDay),
  });
}

function capitalEventInput(input: AssistantActionInput) {
  return stripUndefined({
    amountCents: requiredPositiveCents(
      input.amountCents,
      "Capital event amount must be greater than zero."
    ),
    capitalEventKey: requiredString(
      input.capitalEventKey ?? input.eventKey,
      "capitalEventKey"
    ),
    eventKind:
      input.eventKind === "cashInfusion" ? "cashInfusion" : "cost",
    label: requiredString(input.label ?? input.capitalEventKey, "label"),
    order: optionalNumber(input.order),
    x: requiredNonNegativeDay(input.x ?? input.timingDay, "x"),
  });
}

function capitalEventPatchInput(input: AssistantActionInput) {
  return stripUndefined({
    amountCents: optionalNumber(input.amountCents),
    capitalEventKey: requiredString(
      input.capitalEventKey ?? input.eventKey,
      "capitalEventKey"
    ),
    eventKind:
      input.eventKind === "cashInfusion" || input.eventKind === "cost"
        ? input.eventKind
        : undefined,
    label: optionalString(input.label),
    order: optionalNumber(input.order),
    x: optionalNumber(input.x ?? input.timingDay),
  });
}

function costItemInput(input: AssistantActionInput) {
  return stripUndefined({
    costCents: requiredPositiveCents(
      input.costCents ?? input.amountCents,
      "Cost item amount must be greater than zero."
    ),
    description: optionalString(input.description),
    itemType: input.itemType === "equipment" ? "equipment" : "material",
    milestoneKey: requiredString(input.milestoneKey, "milestoneKey"),
    quantity: Math.max(1, Math.round(optionalNumber(input.quantity) ?? 1)),
    reason: optionalString(input.reason),
    relevantSubmilestoneKeys: stringArray(input.relevantSubmilestoneKeys),
    supplier: optionalString(input.supplier),
    title: requiredString(input.title ?? input.name, "Cost item title"),
  });
}

function costItemPatchInput(input: AssistantActionInput) {
  return stripUndefined({
    costCents: optionalNumber(input.costCents ?? input.amountCents),
    description: optionalString(input.description),
    itemId: input.itemId,
    itemType:
      input.itemType === "equipment" || input.itemType === "material"
        ? input.itemType
        : undefined,
    milestoneKey: optionalString(input.milestoneKey),
    quantity: optionalNumber(input.quantity),
    reason: optionalString(input.reason),
    relevantSubmilestoneKeys: Array.isArray(input.relevantSubmilestoneKeys)
      ? stringArray(input.relevantSubmilestoneKeys)
      : undefined,
    supplier: optionalString(input.supplier),
    title: optionalString(input.title ?? input.name),
  });
}

function contractorAttachmentInput(input: AssistantActionInput) {
  return stripUndefined({
    agreedRateCents: optionalNumber(input.agreedRateCents),
    agreedRateUnit: optionalString(input.agreedRateUnit),
    contractorId: input.contractorId,
    endDate: optionalString(input.endDate),
    endDay: optionalNumber(input.endDay),
    notes: optionalString(input.notes ?? input.note),
    role: requiredString(input.role, "role"),
    startDate: optionalString(input.startDate),
    startDay: optionalNumber(input.startDay),
  });
}

function contractorScopeAssignmentInput(input: AssistantActionInput) {
  return stripUndefined({
    actualCostCents: optionalNumber(input.actualCostCents),
    actualHours: optionalNumber(input.actualHours),
    agreedRateCents: optionalNumber(input.agreedRateCents),
    agreedRateUnit: optionalString(input.agreedRateUnit),
    contractorId: input.contractorId,
    costNotes: optionalString(input.costNotes),
    estimatedCostCents: optionalNumber(input.estimatedCostCents),
    estimatedHours: optionalNumber(input.estimatedHours),
    milestoneKey: requiredString(input.milestoneKey, "milestoneKey"),
    note: optionalString(input.note),
    postHoc: typeof input.postHoc === "boolean" ? input.postHoc : undefined,
    role: requiredString(input.role, "role"),
    status: optionalString(input.status),
    submilestoneKeys: stringArray(
      input.submilestoneKeys ?? input.subMilestoneKeys
    ),
  });
}

function normalizeContractorInput(value: unknown) {
  const input = normalizeRecord(value, "contractor");
  return stripUndefined({
    accountWorkosUserId: optionalString(input.accountWorkosUserId),
    availabilityWindows: Array.isArray(input.availabilityWindows)
      ? input.availabilityWindows
      : [],
    capabilities: Array.isArray(input.capabilities) ? input.capabilities : [],
    city: optionalString(input.city),
    defaultPayRateCents: optionalNumber(input.defaultPayRateCents),
    defaultPayRateUnit: optionalString(input.defaultPayRateUnit),
    email: optionalString(input.email),
    equipment: Array.isArray(input.equipment) ? input.equipment : [],
    kind: input.kind === "individual" ? "individual" : "company",
    name: requiredString(input.name, "Contractor name"),
    phone: optionalString(input.phone),
    trades: stringArray(input.trades).length
      ? stringArray(input.trades)
      : ["general"],
  });
}

function timelinePlanStateInput(input: AssistantActionInput) {
  return {
    currentDay: requiredNumber(input.currentDay, "currentDay"),
    minimumCashReserveCents: optionalNumber(input.minimumCashReserveCents),
    progressValue: requiredNumber(input.progressValue, "progressValue"),
    rangeMax: requiredNumber(input.rangeMax, "rangeMax"),
    rangeMin: requiredNumber(input.rangeMin, "rangeMin"),
    routeState: normalizeRecord(input.routeState, "routeState"),
    startingCashCents: requiredPositiveCents(
      input.startingCashCents,
      "Starting cash must be greater than zero."
    ),
  };
}

function normalizeSetupMilestones(value: unknown) {
  return arrayInput(value, "milestones").map((row, index) => {
    const record = normalizeRecord(row, "milestone");
    const data = normalizeRecord(record.data ?? {}, "milestone.data");
    const key = requiredString(
      record.key ?? record.id ?? data.key ?? data.milestoneKey,
      "milestoneKey"
    );
    const dayStart = Math.max(
      0,
      Math.round(optionalNumber(record.dayStart ?? record.x ?? data.dayStart) ?? 0)
    );
    const durationDays = Math.max(
      1,
      Math.round(optionalNumber(record.durationDays ?? data.durationDays) ?? 1)
    );
    const budgetCents = requiredPositiveCents(
      record.budgetCents ??
        data.budgetCents ??
        (typeof data.amount === "number" ? data.amount * 100 : undefined),
      "Milestone budget must be greater than zero."
    );
    return {
      budgetCents,
      dayEnd: Math.max(
        dayStart,
        Math.round(optionalNumber(record.dayEnd ?? data.dayEnd) ?? dayStart + durationDays)
      ),
      dayStart,
      dependencyKeys: stringArray(record.dependencyKeys ?? data.dependencyKeys),
      durationDays,
      icon: optionalString(record.icon ?? data.icon),
      key,
      name: requiredString(
        record.name ?? record.label ?? data.name ?? data.label,
        "Milestone name"
      ),
      order: Math.max(1, Math.round(optionalNumber(record.order) ?? index + 1)),
      submilestones: normalizeSubmilestones(
        record.submilestones ??
          record.subMilestones ??
          record.submilestoneDetails ??
          data.submilestoneDetails
      ),
    };
  });
}

function normalizeSubmilestones(value: unknown) {
  return arrayInput(value, "submilestones", true).map((row, index) => {
    const record = normalizeRecord(row, "submilestone");
    const key = requiredString(record.key ?? record.id, "submilestone key");
    return stripUndefined({
      budgetCents: optionalNumber(record.budgetCents),
      durationDays: optionalNumber(record.durationDays),
      key,
      name: requiredString(record.name ?? record.label, "submilestone name"),
      order: Math.max(1, Math.round(optionalNumber(record.order) ?? index + 1)),
      startDay: optionalNumber(record.startDay),
    });
  });
}

function normalizeSetupCostItems(value: unknown) {
  return arrayInput(value, "costItems", true).map((row) => {
    const input = normalizeRecord(row, "costItem");
    return costItemInput(input);
  });
}

function normalizeSetupContractorAssignments(value: unknown) {
  return arrayInput(value, "contractorAssignments", true).map((row) => {
    const input = normalizeRecord(row, "contractorAssignment");
    return stripUndefined({
      contractorId: optionalString(input.contractorId),
      contractorName: requiredString(
        input.contractorName ?? input.name,
        "contractorName"
      ),
      estimatedCostCents: optionalNumber(input.estimatedCostCents),
      estimatedHours: optionalNumber(input.estimatedHours),
      milestoneKey: requiredString(input.milestoneKey, "milestoneKey"),
      role: requiredString(input.role, "role"),
      submilestoneKeys: stringArray(input.submilestoneKeys),
    });
  });
}

function normalizeSetupDraws(value: unknown) {
  return arrayInput(value, "draws", true).map((row) => {
    const input = normalizeRecord(row, "draw");
    return stripUndefined({
      amountCents: requiredPositiveCents(
        input.amountCents,
        "Draw amount must be greater than zero."
      ),
      customDate:
        typeof input.customDate === "boolean" ? input.customDate : undefined,
      drawKey: requiredString(input.drawKey, "drawKey"),
      label: requiredString(input.label ?? input.drawKey, "label"),
      milestoneKey: optionalString(input.milestoneKey),
      order: optionalNumber(input.order),
      timingDay: requiredNonNegativeDay(
        input.timingDay ?? input.x,
        "timingDay"
      ),
    });
  });
}

function arrayInput(value: unknown, label: string, optional = false) {
  if (value === undefined || value === null) {
    if (optional) {
      return [];
    }
    throw new Error(`${label} must be an array.`);
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean)
    : [];
}

function normalizeBps(value: unknown) {
  const bps = Math.round(requiredNumber(value, "bps"));
  return Math.max(0, Math.min(TOTAL_BPS, bps));
}

function positiveCentsOrFallback(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : Math.max(1, Math.round(fallback));
}

function optionalId<TableName extends TableNames>(
  ctx: QueryCtx | MutationCtx,
  tableName: TableName,
  value: unknown
) {
  if (typeof value !== "string" || !value) {
    return undefined;
  }
  return ctx.db.normalizeId(tableName as any, value) as Id<TableName> | null;
}

function parseActionKey(value: string): AssistantActionKey {
  if (
    (MUTATION_ACTION_KEYS as readonly string[]).includes(value) ||
    (READONLY_CLIENT_ACTION_KEYS as readonly string[]).includes(value)
  ) {
    return value as AssistantActionKey;
  }
  throw new Error(`Assistant action is outside the closed catalog: ${value}`);
}

function isMutationActionKey(
  value: AssistantActionKey
): value is MutationActionKey {
  return (MUTATION_ACTION_KEYS as readonly string[]).includes(value);
}

function isReadonlyActionKey(
  value: AssistantActionKey
): value is ReadonlyClientActionKey {
  return (READONLY_CLIENT_ACTION_KEYS as readonly string[]).includes(value);
}

function isBackoffice(roles: readonly RoleSlug[]) {
  return roles.some((role) =>
    (BACKOFFICE_ROLES as readonly RoleSlug[]).includes(role)
  );
}

function isBuilder(roles: readonly RoleSlug[]) {
  return roles.some((role) =>
    (BUILDER_ROLES as readonly RoleSlug[]).includes(role)
  );
}

function parseTargetDateKind(value: unknown) {
  if (
    value === "evidenceDue" ||
    value === "reviewTarget" ||
    value === "adminDecisionTarget" ||
    value === "drawReleaseTarget"
  ) {
    return value;
  }
  throw new Error("Calendar target date kind is not supported.");
}

function calculateDrawAvailability(
  budgetCents: number,
  borrowerCoPayBps: number
) {
  return Math.round((budgetCents * (TOTAL_BPS - borrowerCoPayBps)) / TOTAL_BPS);
}

function validateDayRange(dayStart: number, dayEnd: number) {
  if (dayStart < 0 || dayEnd < dayStart) {
    throw new Error("Milestone schedule range is invalid.");
  }
}

function normalizeIsoDate(value: unknown, message: string) {
  if (typeof value !== "string") {
    throw new Error(message);
  }
  const day = value.slice(0, 10);
  const parsed = Date.parse(`${day}T00:00:00Z`);
  if (!(/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(parsed))) {
    throw new Error(message);
  }
  return day;
}

function requiredId<TableName extends TableNames>(
  ctx: QueryCtx | MutationCtx,
  tableName: TableName,
  value: unknown,
  field: string
) {
  if (typeof value !== "string") {
    throw new Error(`${field} is required.`);
  }
  const normalized = ctx.db.normalizeId(tableName as any, value);
  if (!normalized) {
    throw new Error(`${field} is invalid.`);
  }
  return normalized as Id<TableName>;
}

function maybeId<TableName extends TableNames>(value: unknown) {
  return typeof value === "string" && value
    ? (value as Id<TableName>)
    : undefined;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
  return value;
}

function requiredPositiveCents(value: unknown, message: string) {
  const amount = Math.round(requiredNumber(value, "amountCents"));
  if (amount <= 0) {
    throw new Error(message);
  }
  return amount;
}

function requiredNonNegativeDay(value: unknown, field: string) {
  const day = Math.round(requiredNumber(value, field));
  if (day < 0) {
    throw new Error(`${field} cannot be negative.`);
  }
  return day;
}

function requiredReason(value: unknown) {
  const reason = requiredString(value, "reason");
  if (reason.length < 3) {
    throw new Error("A reason is required.");
  }
  return reason;
}

function requireReason(value: unknown) {
  requiredReason(value);
}

function normalizeRecord(value: unknown, label: string): AssistantActionInput {
  if (value === undefined || value === null) {
    return {};
  }
  if (
    typeof value !== "object" ||
    Array.isArray(value) ||
    value instanceof Date
  ) {
    throw new Error(`${label} must be an object.`);
  }
  return value as AssistantActionInput;
}

function normalizeOptionalString(value: unknown) {
  return optionalString(value);
}

function sanitizeForPersistence(value: unknown): any {
  if (Array.isArray(value)) {
    return value.map(sanitizeForPersistence);
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (/chainofthought|rawthought|reasoning/i.test(key)) {
        continue;
      }
      if (nested === undefined) {
        continue;
      }
      output[key] = sanitizeForPersistence(nested);
    }
    return output;
  }
  return value;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
