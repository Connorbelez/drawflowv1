import { type AGUIEvent, EventType } from "@ag-ui/core";
import { v } from "convex/values";

import { api } from "./_generated/api";
import {
  authorizeOrganization,
  authorizeProposal,
  authorizeActiveBuild,
  authorizeReminderTarget,
  requireThread,
  requireProposalWrite,
  requireBackofficeWrite,
  denyContractorMutationBatch,
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
  deriveAssistantAuditResourceType,
  writeReminderAudit,
  collectByIndex,
  genericProposalPreviewBefore,
  genericActiveBuildPreviewBefore,
  findProposalCapitalEvent,
  findProposalEvidenceAsset,
  findActiveBuildCapitalEvent,
  findActiveBuildEvidenceAsset,
  genericPreviewLabel,
  genericEntityType,
  genericReasonRequired,
  genericMutationWarnings,
} from "./assistant/access";
export {
  authorizeOrganization,
  authorizeProposal,
  authorizeActiveBuild,
  authorizeReminderTarget,
  requireThread,
  requireProposalWrite,
  requireBackofficeWrite,
  denyContractorMutationBatch,
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
  deriveAssistantAuditResourceType,
  writeReminderAudit,
  collectByIndex,
  genericProposalPreviewBefore,
  genericActiveBuildPreviewBefore,
  findProposalCapitalEvent,
  findProposalEvidenceAsset,
  findActiveBuildCapitalEvent,
  findActiveBuildEvidenceAsset,
  genericPreviewLabel,
  genericEntityType,
  genericReasonRequired,
  genericMutationWarnings,
} from "./assistant/access";
import {
  validateActionForPreview,
  validateActionForCommit,
  buildMutationPreviewItem,
  previewBuildProposalFromSetup,
  previewTrustedFileBlockedAction,
  previewGenericCatalogAction,
  applyActiveBuildGenericRevisionRequest,
} from "./assistant/action_preview";
import {
  applyAcceptedAction,
  applyProposalMilestoneSchedule,
  applyProposalMilestoneBudget,
  applyCreateProposalDraw,
  applyUpdateProposalDraw,
  applyDeleteProposalDraw,
  previewReminderAction,
  applyCreateReminder,
  applyUpdateReminder,
  applyCancelReminder,
  previewTargetDateAction,
  applyCalendarTargetDate,
  applyScheduleSiteVisit,
  applyRescheduleSiteVisit,
  applyCancelSiteVisit,
  applyActiveBuildRevisionRequest,
} from "./assistant/action_mutations";
import {
  normalizeWorkflowSteps,
  updateWorkflowStepList,
  firstOpenWorkflowStepId,
  workflowRunStatusFromSteps,
  isWorkflowStepStatus,
} from "./assistant/planning";
import {
  assistantOperationalBriefing,
  assistantOperationalQueues,
  emptyOperationalQueues,
  countByStatus,
  sortDrawQueueRows,
  sortSiteVisitQueueRows,
  appendBackofficeBriefingItems,
  appendBuilderBriefingItems,
  appendBuildBriefingItems,
  assistantContractorContext,
  assistantCurrentTargetContext,
  summarizeMilestones,
  summarizeCostItems,
  summarizeDraws,
} from "./assistant/briefing";
import {
  applyBuildProposalFromSetup,
  applyCatalogDomainMutation,
} from "./assistant/mutations";
import {
  runDomainMutation,
  runCollaborationMutation,
  stripUndefined,
  optionalNumber,
  reasonOrNote,
  normalizeLoanFacility,
  normalizeTimelineMilestoneInput,
  timelineMilestonePatchInput,
  timelineDrawInput,
  timelineDrawPatchInput,
  capitalEventInput,
  capitalEventPatchInput,
  costItemInput,
  costItemPatchInput,
  contractorAttachmentInput,
  contractorScopeAssignmentInput,
  normalizeContractorInput,
  timelinePlanStateInput,
  normalizeSetupMilestones,
  normalizeSubmilestones,
  normalizeSetupCostItems,
  normalizeSetupContractorAssignments,
  normalizeSetupDraws,
  arrayInput,
  stringArray,
  normalizeBps,
  positiveCentsOrFallback,
  optionalId,
  parseActionKey,
  isMutationActionKey,
  isReadonlyActionKey,
  isBackoffice,
  isBuilder,
  parseTargetDateKind,
  calculateDrawAvailability,
  validateDayRange,
  normalizeIsoDate,
  requiredId,
  maybeId,
  requiredString,
  optionalString,
  optionalStringArray,
  requiredNumber,
  requiredPositiveCents,
  requiredNonNegativeDay,
  requiredProposalTimelineDay,
  requiredReason,
  requireReason,
  normalizeRecord,
  normalizeOptionalString,
  sanitizeForPersistence,
  errorMessage,
} from "./assistant/inputs";

import {
  BACKOFFICE_ROLES,
  BACKOFFICE_WRITE_ROLES,
  BUILDER_ROLES,
  ACTIVE_BUILD_REQUEST_ONLY_ACTION_KEYS,
  GENERIC_REASON_REQUIRED_ACTION_KEYS,
  MUTATION_ACTION_KEYS,
  READONLY_CLIENT_ACTION_KEYS,
  TRUSTED_FILE_ACTION_KEYS,
  TOTAL_BPS,
  AssistantActionInput,
  AssistantActionKey,
  AssistantPlanItem,
  AssistantAuth,
  ProposalAuth,
  ActiveBuildAuth,
  ValidationResult,
  MutationActionKey,
  ReadonlyClientActionKey,
  actionInput,
  traceEventInput,
} from "./assistant/contracts";
import { normalizePlannerRecord } from "./assistant/shared";
export {
  daysSinceIsoDate,
  formatCents,
  normalizePlannerRecord,
  parsePlannerJson,
  toIsoDate,
} from "./assistant/shared";
export type { AssistantContextPack } from "./assistant/shared";

import {
  authenticatedAction,
  authenticatedMutation,
  authenticatedQuery,
  normalizeRoleSlugs,
  type RoleSlug,
} from "./authz";
import type { Doc, Id, MutationCtx, QueryCtx, TableNames } from "./types";

import {
  generateSiteVisitGuidanceHandler,
  getProviderStatusHandler,
  planAssistantTurnHandler,
  runAssistantTurnHandler,
} from "./assistant/action_handlers";
import { drawFlowAssistantMutationToolDefinitions } from "./assistant/tool_definitions";
import {
  createWorkflowRunHandler,
  getActiveWorkflowRunHandler,
} from "./assistant/workflow_handlers";
export { drawFlowAssistantMutationToolDefinitions } from "./assistant/tool_definitions";

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
  .handler(getProviderStatusHandler)
  .public();

const siteVisitGuidanceScopeItem = v.object({
  key: v.string(),
  name: v.string(),
});

export const generateSiteVisitGuidance = authenticatedAction
  .input({
    build: v.object({
      location: v.optional(v.string()),
      name: v.string(),
    }),
    currentGuidance: v.object({
      cameraAngles: v.string(),
      whatToVerify: v.string(),
    }),
    milestone: siteVisitGuidanceScopeItem,
    submilestones: v.array(siteVisitGuidanceScopeItem),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      cameraAngles: v.string(),
      source: v.union(
        v.literal("fallback"),
        v.literal("openai"),
        v.literal("openrouter")
      ),
      whatToVerify: v.string(),
    })
  )
  .handler(generateSiteVisitGuidanceHandler)
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
  .handler(runAssistantTurnHandler)
  .public();

export const planAssistantTurn = authenticatedAction
  .input({
    assistantContext: v.any(),
    prompt: v.string(),
    routeContext: v.any(),
    siteMap: v.any(),
    threadId: v.optional(v.id("assistantThreads")),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(planAssistantTurnHandler)
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

export const listReminderTargets = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeOrganization(ctx, args.workosOrganizationId);
    const targets: Array<{
      buildId?: Id<"activeBuilds">;
      href: string;
      id: string;
      kind: "activeBuild" | "proposal";
      label: string;
      proposalId?: Id<"buildProposals">;
      status?: string;
      subtitle?: string;
      updatedAt: number;
    }> = [];
    const seen = new Set<string>();
    const pushProposal = (proposal: Doc<"buildProposals">) => {
      const key = `proposal:${proposal._id}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      targets.push({
        href: `/builder/proposals/${proposal._id}`,
        id: key,
        kind: "proposal",
        label: proposal.buildName,
        proposalId: proposal._id,
        status: proposal.status,
        subtitle: proposal.location,
        updatedAt: proposal.updatedAt,
      });
    };
    const pushBuild = (build: Doc<"activeBuilds">) => {
      const key = `activeBuild:${build._id}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      targets.push({
        buildId: build._id,
        href: `/builder/builds/${build._id}`,
        id: key,
        kind: "activeBuild",
        label: build.buildName,
        proposalId: build.proposalId,
        status: build.status,
        subtitle: build.location,
        updatedAt: build.updatedAt,
      });
    };

    if (isBackoffice(auth.roles)) {
      const [proposals, builds] = await Promise.all([
        ctx.db
          .query("buildProposals")
          .withIndex("by_brokerage", (q) =>
            q.eq("brokerageId", auth.brokerage._id)
          )
          .order("desc")
          .take(50),
        ctx.db
          .query("activeBuilds")
          .withIndex("by_brokerage", (q) =>
            q.eq("brokerageId", auth.brokerage._id)
          )
          .order("desc")
          .take(50),
      ]);
      for (const build of builds) {
        if (build.organizationId === auth.organizationId) {
          pushBuild(build);
        }
      }
      for (const proposal of proposals) {
        if (proposal.organizationId === auth.organizationId) {
          pushProposal(proposal);
        }
      }
    }

    if (isBuilder(auth.roles)) {
      const links = await ctx.db
        .query("builderAccountLinks")
        .withIndex("by_user", (q) => q.eq("workosUserId", auth.subject))
        .take(50);
      for (const link of links) {
        if (link.status !== "active") {
          continue;
        }
        const proposals = await ctx.db
          .query("buildProposals")
          .withIndex("by_builder", (q) =>
            q.eq("builderProfileId", link.builderProfileId)
          )
          .take(50);
        for (const proposal of proposals) {
          if (
            proposal.organizationId !== auth.organizationId ||
            proposal.brokerageId !== auth.brokerage._id
          ) {
            continue;
          }
          if (proposal.activeBuildId) {
            const build = await ctx.db.get(proposal.activeBuildId);
            if (
              build &&
              build.organizationId === auth.organizationId &&
              build.brokerageId === auth.brokerage._id
            ) {
              pushBuild(build);
            }
          }
          pushProposal(proposal);
        }
      }
    }

    if (auth.roles.includes("builder-staff")) {
      const grants = await ctx.db
        .query("builderStaffPermissionGrants")
        .withIndex("by_user", (q) => q.eq("workosUserId", auth.subject))
        .take(100);
      for (const grant of grants) {
        if (
          grant.organizationId !== auth.organizationId ||
          grant.brokerageId !== auth.brokerage._id ||
          !(grant.canView || grant.canCreate)
        ) {
          continue;
        }
        if (grant.buildId) {
          const build = await ctx.db.get(grant.buildId);
          if (
            build &&
            build.organizationId === auth.organizationId &&
            build.brokerageId === auth.brokerage._id
          ) {
            pushBuild(build);
          }
        }
        if (grant.proposalId) {
          const proposal = await ctx.db.get(grant.proposalId);
          if (
            proposal &&
            proposal.organizationId === auth.organizationId &&
            proposal.brokerageId === auth.brokerage._id
          ) {
            pushProposal(proposal);
          }
        }
      }
    }

    return {
      targets: targets
        .sort(
          (a, b) => b.updatedAt - a.updatedAt || a.label.localeCompare(b.label)
        )
        .slice(0, 50),
    };
  })
  .public();

export const getAssistantContext = authenticatedQuery
  .input({
    routeContext: v.any(),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeOrganization(ctx, args.workosOrganizationId);
    const routeContext = normalizeRecord(args.routeContext, "routeContext");
    return {
      contractors: await assistantContractorContext(ctx, auth),
      generatedAt: Date.now(),
      operationalBriefing: await assistantOperationalBriefing(ctx, auth),
      queues: await assistantOperationalQueues(ctx, auth),
      route: {
        activeBuildId: optionalString(routeContext.activeBuildId),
        pathname: optionalString(routeContext.pathname),
        proposalId: optionalString(routeContext.proposalId),
        selectedDrawKey: optionalString(routeContext.selectedDrawKey),
        selectedMilestoneKey: optionalString(routeContext.selectedMilestoneKey),
        selectedSubmilestoneKeys: optionalStringArray(
          routeContext.selectedSubmilestoneKeys
        ),
        selectedPanel: optionalString(routeContext.selectedPanel),
      },
      target: await assistantCurrentTargetContext(ctx, auth, routeContext),
      viewer: {
        organizationId: auth.organizationId,
        roles: auth.roles,
        subject: auth.subject,
        workspace: isBackoffice(auth.roles)
          ? "backoffice"
          : isBuilder(auth.roles)
            ? "builder"
            : "authenticated",
      },
    };
  })
  .public();

export const createWorkflowRun = authenticatedMutation
  .input({
    goal: v.string(),
    prompt: v.string(),
    routeContext: v.any(),
    steps: v.array(v.any()),
    threadId: v.optional(v.id("assistantThreads")),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("assistantWorkflowRuns"))
  .handler(createWorkflowRunHandler)
  .public();

export const getActiveWorkflowRun = authenticatedQuery
  .input({
    threadId: v.optional(v.id("assistantThreads")),
    workosOrganizationId: v.string(),
  })
  .returns(v.union(v.any(), v.null()))
  .handler(getActiveWorkflowRunHandler)
  .public();

export const updateWorkflowStep = authenticatedMutation
  .input({
    error: v.optional(v.string()),
    finalSummary: v.optional(v.string()),
    result: v.optional(v.any()),
    routeContext: v.optional(v.any()),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("needs_input"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    stepId: v.string(),
    workflowRunId: v.id("assistantWorkflowRuns"),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeOrganization(ctx, args.workosOrganizationId);
    const run = await ctx.db.get(args.workflowRunId);
    if (!run || run.organizationId !== auth.organizationId) {
      throw new Error("Workflow run not found");
    }
    const steps = updateWorkflowStepList(run.steps, {
      error: args.error,
      result: args.result,
      status: args.status,
      stepId: args.stepId,
    });
    const currentStepId = firstOpenWorkflowStepId(steps);
    const status = workflowRunStatusFromSteps(steps, args.status);
    const patch: Partial<Doc<"assistantWorkflowRuns">> = {
      routeContext: args.routeContext ?? run.routeContext,
      status,
      steps,
      updatedAt: Date.now(),
    };
    if (currentStepId) {
      patch.currentStepId = currentStepId;
    }
    if (args.finalSummary ?? run.finalSummary) {
      patch.finalSummary = args.finalSummary ?? run.finalSummary;
    }
    await ctx.db.patch(run._id, patch);
    return {
      currentStepId,
      status,
      steps,
    };
  })
  .public();

export const appendWorkflowSteps = authenticatedMutation
  .input({
    steps: v.array(v.any()),
    workflowRunId: v.id("assistantWorkflowRuns"),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeOrganization(ctx, args.workosOrganizationId);
    const run = await ctx.db.get(args.workflowRunId);
    if (!run || run.organizationId !== auth.organizationId) {
      throw new Error("Workflow run not found");
    }
    const steps = [...run.steps, ...normalizeWorkflowSteps(args.steps)];
    const currentStepId = firstOpenWorkflowStepId(steps);
    const patch: Partial<Doc<"assistantWorkflowRuns">> = {
      status: "running",
      steps,
      updatedAt: Date.now(),
    };
    if (currentStepId) {
      patch.currentStepId = currentStepId;
    }
    await ctx.db.patch(run._id, patch);
    return {
      currentStepId,
      status: "running",
      steps,
    };
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
    const drawRequestKeysByPlanningReference = new Map<string, string>();
    for (const item of acceptedItems) {
      const planningReference = optionalString(item.input.drawKey);
      const chainedRequestKey = planningReference
        ? drawRequestKeysByPlanningReference.get(planningReference)
        : undefined;
      const effectiveItem: AssistantPlanItem = {
        ...item,
        input: {
          ...item.input,
          ...(item.actionKey === "request_active_build_draw"
            ? {
                clientOperationId: `assistant:${String(args.planId)}:${item.clientRequestId}`,
              }
            : {}),
          ...(chainedRequestKey ? { drawKey: chainedRequestKey } : {}),
        },
      };
      const result = await applyAcceptedAction(ctx, auth, effectiveItem);
      if (
        item.actionKey === "request_active_build_draw" &&
        planningReference &&
        result &&
        typeof result === "object" &&
        "requestKey" in result &&
        typeof result.requestKey === "string"
      ) {
        drawRequestKeysByPlanningReference.set(
          planningReference,
          result.requestKey
        );
      }
      applied.push({
        clientRequestId: item.clientRequestId,
        result,
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
