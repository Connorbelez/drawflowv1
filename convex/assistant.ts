import { type AGUIEvent, EventType } from "@ag-ui/core";
import { toolDefinition } from "@tanstack/ai";
import { v } from "convex/values";
import OpenAI from "openai";
import { z } from "zod/v4";

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

type MutationActionKey = (typeof MUTATION_ACTION_KEYS)[number];

const READONLY_CLIENT_ACTION_KEYS = [
  "open_proposal_route",
  "open_active_build_route",
  "open_calendar_surface",
  "focus_milestone",
  "focus_draw",
  "focus_calendar_event",
  "explain_current_surface",
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

const _drawFlowAssistantToolDefinitions = MUTATION_ACTION_KEYS.map((name) =>
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
    await buildMutationPreviewItem(ctx, auth, item);
    return {
      actionKey: item.actionKey,
      clientRequestId: item.clientRequestId,
      errors: [],
      warnings: item.validation.warnings,
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
  }
}

async function applyAcceptedAction(
  ctx: MutationCtx,
  auth: AssistantAuth,
  item: AssistantPlanItem
) {
  switch (item.actionKey) {
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
      return { readOnly: true };
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
    validation: { errors: [], warnings: input.warnings ?? [] },
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
