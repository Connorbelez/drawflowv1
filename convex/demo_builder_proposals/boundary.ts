import { v } from "convex/values";
import { publicMutation, withMutationTiming } from "../fluent";
import { BANK_ITEMS, ORG_KEY, now } from "./shared";
import { appendEvent, boundaryPayload, currentBudgetCents, getDraft, getDraftMilestones, nextExplicitDrawGroupIndex, readinessForDraft, recomputeDraftDerived } from "./projections";

export const demo_addBuilderProposalBankItem = publicMutation
  .use(withMutationTiming("demo_builder_proposals.addBankItem"))
  .input({
    bankItemKey: v.optional(v.string()),
    draftId: v.id("demo_builderProposalDrafts"),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const draft = await getDraft(ctx, args.draftId);
    const milestones = await getDraftMilestones(ctx, args.draftId);
    const existingBankKeys = new Set(
      milestones.map((milestone) => milestone.bankItemKey).filter(Boolean)
    );
    const item =
      BANK_ITEMS.find(
        (candidate) => candidate.bankItemKey === args.bankItemKey
      ) ??
      BANK_ITEMS.find(
        (candidate) => !existingBankKeys.has(candidate.bankItemKey)
      );
    if (!item) {
      throw new Error("All bank milestones have already been added.");
    }
    if (existingBankKeys.has(item.bankItemKey)) {
      throw new Error(`${item.name} is already in this proposal.`);
    }
    const order =
      milestones.reduce((max, milestone) => Math.max(max, milestone.order), 0) +
      1;
    const baseBudget = draft.originalBudgetCents ?? 0;
    const budgetCents =
      baseBudget > 0
        ? Math.round((baseBudget * item.percentageBps) / 10_000)
        : 5_000_000;
    const createdAt = now();
    const drawGroupIndex = nextExplicitDrawGroupIndex(milestones);
    const milestoneId = await ctx.db.insert("demo_builderProposalMilestones", {
      bankItemKey: item.bankItemKey,
      budgetCents,
      createdAt,
      dayEnd: 0,
      dayStart: 0,
      dependencyKeys: item.dependencyKeys,
      ...(drawGroupIndex === undefined ? {} : { drawGroupIndex }),
      draftId: args.draftId,
      durationDays: item.durationDays,
      included: true,
      key: item.bankItemKey,
      name: item.name,
      order,
      orgKey: ORG_KEY,
      percentageBps: item.percentageBps,
      source: "bank",
      type: item.type,
      updatedAt: createdAt,
    });
    await recomputeDraftDerived(ctx, args.draftId);
    await ctx.db.patch(args.draftId, {
      manuallyEdited: true,
      updatedAt: now(),
    });
    await appendEvent(ctx, {
      command: "demo_addBuilderProposalBankItem",
      draftId: args.draftId,
      entityKey: item.bankItemKey,
      entityType: "builder_proposal_milestone",
      eventType: "BuilderProposalBankMilestoneAdded",
      newState: { budgetCents, name: item.name },
      requirementIds: ["REQ-07", "REQ-08", "REQ-11"],
      validationIds: ["VAL-04"],
    });
    return { milestoneId };
  })
  .public();

export const demo_createBuilderProposalCustomMilestone = publicMutation
  .use(withMutationTiming("demo_builder_proposals.createCustomMilestone"))
  .input({
    budgetCents: v.optional(v.number()),
    draftId: v.id("demo_builderProposalDrafts"),
    durationDays: v.optional(v.number()),
    name: v.optional(v.string()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    await getDraft(ctx, args.draftId);
    const milestones = await getDraftMilestones(ctx, args.draftId);
    const order =
      milestones.reduce((max, milestone) => Math.max(max, milestone.order), 0) +
      1;
    const createdAt = now();
    const key = `custom_${createdAt}`;
    const name = args.name?.trim() || "Owner requested contingency";
    const budgetCents = Math.round(args.budgetCents ?? 2_500_000);
    const durationDays = Math.round(args.durationDays ?? 5);
    const drawGroupIndex = nextExplicitDrawGroupIndex(milestones);
    const milestoneId = await ctx.db.insert("demo_builderProposalMilestones", {
      budgetCents,
      createdAt,
      dayEnd: 0,
      dayStart: 0,
      dependencyKeys: [],
      ...(drawGroupIndex === undefined ? {} : { drawGroupIndex }),
      draftId: args.draftId,
      durationDays,
      included: true,
      key,
      name,
      order,
      orgKey: ORG_KEY,
      source: "custom",
      type: "custom_scope",
      updatedAt: createdAt,
    });
    await recomputeDraftDerived(ctx, args.draftId);
    await ctx.db.patch(args.draftId, {
      manuallyEdited: true,
      updatedAt: now(),
    });
    await appendEvent(ctx, {
      command: "demo_createBuilderProposalCustomMilestone",
      draftId: args.draftId,
      entityKey: key,
      entityType: "builder_proposal_milestone",
      eventType: "BuilderProposalCustomMilestoneCreated",
      newState: { budgetCents, durationDays, name },
      requirementIds: ["REQ-07", "REQ-08", "REQ-11"],
      validationIds: ["VAL-04"],
    });
    return { milestoneId };
  })
  .public();

export const demo_updateBuilderProposalCashAvailability = publicMutation
  .use(withMutationTiming("demo_builder_proposals.updateCashAvailability"))
  .input({
    borrowerCashAvailabilityCents: v.number(),
    borrowerCoPayCents: v.optional(v.number()),
    draftId: v.id("demo_builderProposalDrafts"),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const draft = await getDraft(ctx, args.draftId);
    const rounded = Math.round(args.borrowerCashAvailabilityCents);
    const roundedCoPay =
      args.borrowerCoPayCents === undefined
        ? draft.borrowerCoPayCents
        : Math.max(0, Math.round(args.borrowerCoPayCents));
    const draftPatch =
      roundedCoPay === undefined
        ? {
            borrowerCashAvailabilityCents: rounded,
            updatedAt: now(),
          }
        : {
            borrowerCashAvailabilityCents: rounded,
            borrowerCoPayCents: roundedCoPay,
            updatedAt: now(),
          };
    await ctx.db.patch(args.draftId, draftPatch);
    const refreshedDraft = {
      ...draft,
      borrowerCashAvailabilityCents: rounded,
      borrowerCoPayCents: roundedCoPay,
    };
    const milestones = await getDraftMilestones(ctx, args.draftId);
    const readiness = readinessForDraft(refreshedDraft, milestones);
    await appendEvent(ctx, {
      command: "demo_updateBuilderProposalCashAvailability",
      draftId: args.draftId,
      entityType: "builder_proposal_draft",
      eventType: "BuilderProposalCashAvailabilityUpdated",
      newState: {
        borrowerCashAvailabilityCents: rounded,
        borrowerCoPayCents: roundedCoPay,
        lenderDrawPolicyLimitCents: draft.lenderDrawPolicyLimitCents,
      },
      priorState: {
        borrowerCashAvailabilityCents: draft.borrowerCashAvailabilityCents,
        borrowerCoPayCents: draft.borrowerCoPayCents,
        lenderDrawPolicyLimitCents: draft.lenderDrawPolicyLimitCents,
      },
      requirementIds: ["REQ-09", "REQ-11"],
      validationIds: ["VAL-05"],
      warnings: readiness.warningIssues,
    });
    return { readiness };
  })
  .public();

export const demo_finalizeBuilderProposalBoundary = publicMutation
  .use(withMutationTiming("demo_builder_proposals.finalizeBoundary"))
  .input({ draftId: v.id("demo_builderProposalDrafts") })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const draft = await getDraft(ctx, args.draftId);
    const milestones = await getDraftMilestones(ctx, args.draftId);
    const readiness = readinessForDraft(draft, milestones);
    if (!readiness.canFinalize) {
      await appendEvent(ctx, {
        command: "demo_finalizeBuilderProposalBoundary",
        draftId: args.draftId,
        entityType: "builder_proposal_boundary",
        eventType: "BuilderProposalBoundaryRejected",
        reason: readiness.blockingIssues[0],
        requirementIds: ["REQ-08", "REQ-10", "REQ-12"],
        validationIds: ["VAL-06"],
        warnings: readiness.warningIssues,
      });
      throw new Error(readiness.blockingIssues[0] ?? "Proposal is incomplete.");
    }
    const existingPayloads = await ctx.db
      .query("demo_builderProposalBoundaryPayloads")
      .withIndex("by_draft", (q) => q.eq("draftId", args.draftId))
      .collect();
    for (const payload of existingPayloads) {
      await ctx.db.delete(payload._id);
    }
    const refreshedMilestones = await recomputeDraftDerived(ctx, args.draftId);
    const refreshedReadiness = readinessForDraft(draft, refreshedMilestones);
    const payload = boundaryPayload(
      draft,
      refreshedMilestones,
      refreshedReadiness
    );
    const payloadId = await ctx.db.insert(
      "demo_builderProposalBoundaryPayloads",
      {
        buildName: draft.buildName,
        createdAt: now(),
        draftId: args.draftId,
        orgKey: ORG_KEY,
        payload,
        payloadVersion: 1,
        snapshotSummary: `${payload.milestoneSequence.length} milestones · ${refreshedReadiness.currentBudgetCents} cents · reimbursement only`,
        status: "workspace_ready",
        validationWarnings: refreshedReadiness.warningIssues,
      }
    );
    await ctx.db.patch(args.draftId, {
      status: "workspace_ready",
      updatedAt: now(),
      workspaceReadyAt: now(),
    });
    await appendEvent(ctx, {
      command: "demo_finalizeBuilderProposalBoundary",
      draftId: args.draftId,
      entityKey: String(payloadId),
      entityType: "builder_proposal_boundary",
      eventType: "BuilderProposalBoundaryPayloadFrozen",
      newState: {
        payloadId,
        status: "workspace_ready",
      },
      requirementIds: ["REQ-10", "REQ-11", "REQ-12"],
      validationIds: ["VAL-06", "VAL-08"],
      warnings: refreshedReadiness.warningIssues,
    });
    return { payload, payloadId };
  })
  .public();
