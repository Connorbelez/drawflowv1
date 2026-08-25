import { v } from "convex/values";
import { publicMutation, withMutationTiming } from "../fluent";
import { DEMO_START_DATE, ORG_KEY, allocateByBps, now, templateForKey } from "./shared";
import type { BuilderProposalMilestone } from "./shared";
import { appendEvent, currentBudgetCents, draftProjection, getDraft, getDraftMilestones, recomputeDraftDerived } from "./projections";

export const demo_generateBuilderProposalMilestones = publicMutation
  .use(withMutationTiming("demo_builder_proposals.generateMilestones"))
  .input({
    allowRegenerate: v.optional(v.boolean()),
    draftId: v.id("demo_builderProposalDrafts"),
    estimatedStartDate: v.optional(v.string()),
    originalBudgetCents: v.number(),
    templateKey: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const draft = await getDraft(ctx, args.draftId);
    const template = templateForKey(args.templateKey);
    if (!template) {
      throw new Error("Select a valid build type template.");
    }
    if (
      !Number.isFinite(args.originalBudgetCents) ||
      args.originalBudgetCents <= 0
    ) {
      throw new Error("Enter a positive total project budget.");
    }
    const existingMilestones = await getDraftMilestones(ctx, args.draftId);
    if (
      existingMilestones.length > 0 &&
      draft.manuallyEdited &&
      !args.allowRegenerate
    ) {
      throw new Error(
        "Regenerating after manual edits requires explicit confirmation."
      );
    }
    for (const milestone of existingMilestones) {
      await ctx.db.delete(milestone._id);
    }
    const allocations = allocateByBps(
      Math.round(args.originalBudgetCents),
      template.milestonePresets
    );
    const createdAt = now();
    let dayCursor = 0;
    for (const [index, presetRow] of template.milestonePresets.entries()) {
      const durationDays = Math.max(1, presetRow.durationDays);
      const dayStart = dayCursor + 1;
      const dayEnd = dayCursor + durationDays;
      dayCursor = dayEnd;
      await ctx.db.insert("demo_builderProposalMilestones", {
        budgetCents: allocations[index],
        createdAt,
        dayEnd,
        dayStart,
        dependencyKeys: presetRow.dependencyKeys,
        draftId: args.draftId,
        durationDays,
        included: true,
        key: presetRow.key,
        name: presetRow.name,
        order: index + 1,
        orgKey: ORG_KEY,
        percentageBps: presetRow.percentageBps,
        source: "template",
        templateKey: template.templateKey,
        type: presetRow.type,
        updatedAt: createdAt,
      });
    }
    await ctx.db.patch(args.draftId, {
      currentBudgetCents: Math.round(args.originalBudgetCents),
      estimatedStartDate: args.estimatedStartDate ?? DEMO_START_DATE,
      generatedMilestoneVersion: draft.generatedMilestoneVersion + 1,
      manuallyEdited: false,
      originalBudgetCents: Math.round(args.originalBudgetCents),
      status: "milestones_generated",
      templateKey: template.templateKey,
      templateTitle: template.title,
      updatedAt: now(),
    });
    await appendEvent(ctx, {
      command: "demo_generateBuilderProposalMilestones",
      draftId: args.draftId,
      entityKey: template.templateKey,
      entityType: "builder_proposal_template",
      eventType: "BuilderProposalMilestonesGenerated",
      newState: {
        originalBudgetCents: Math.round(args.originalBudgetCents),
        rowCount: template.milestonePresets.length,
        templateKey: template.templateKey,
      },
      priorState: {
        generatedMilestoneVersion: draft.generatedMilestoneVersion,
      },
      requirementIds: ["REQ-03", "REQ-04", "REQ-05", "REQ-11"],
      validationIds: ["VAL-02", "VAL-03"],
    });
    return await draftProjection(ctx, args.draftId);
  })
  .public();

export const demo_toggleBuilderProposalMilestone = publicMutation
  .use(withMutationTiming("demo_builder_proposals.toggleMilestone"))
  .input({
    included: v.boolean(),
    milestoneId: v.id("demo_builderProposalMilestones"),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone || milestone.orgKey !== ORG_KEY) {
      throw new Error("Milestone not found.");
    }
    await getDraft(ctx, milestone.draftId);
    await ctx.db.patch(milestone._id, {
      included: args.included,
      updatedAt: now(),
    });
    const milestones = await recomputeDraftDerived(ctx, milestone.draftId);
    await ctx.db.patch(milestone.draftId, {
      manuallyEdited: true,
      updatedAt: now(),
    });
    await appendEvent(ctx, {
      command: "demo_toggleBuilderProposalMilestone",
      draftId: milestone.draftId,
      entityKey: milestone.key,
      entityType: "builder_proposal_milestone",
      eventType: args.included
        ? "BuilderProposalMilestoneIncluded"
        : "BuilderProposalMilestoneExcluded",
      newState: { included: args.included },
      priorState: { included: milestone.included },
      requirementIds: ["REQ-06", "REQ-08", "REQ-11"],
      validationIds: ["VAL-04"],
    });
    return {
      currentBudgetCents: currentBudgetCents(milestones),
      ok: true,
    };
  })
  .public();

export const demo_updateBuilderProposalMilestone = publicMutation
  .use(withMutationTiming("demo_builder_proposals.updateMilestone"))
  .input({
    budgetCents: v.optional(v.number()),
    drawGroupIndex: v.optional(v.number()),
    durationDays: v.optional(v.number()),
    milestoneId: v.id("demo_builderProposalMilestones"),
    name: v.optional(v.string()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone || milestone.orgKey !== ORG_KEY) {
      throw new Error("Milestone not found.");
    }
    const patch: Record<string, number | string> = {};
    if (args.name !== undefined) {
      if (!args.name.trim()) {
        throw new Error("Milestone name is required.");
      }
      patch.name = args.name.trim();
    }
    if (args.budgetCents !== undefined) {
      patch.budgetCents = Math.round(args.budgetCents);
    }
    if (args.durationDays !== undefined) {
      patch.durationDays = Math.round(args.durationDays);
    }
    if (args.drawGroupIndex !== undefined) {
      patch.drawGroupIndex = Math.max(0, Math.round(args.drawGroupIndex));
    }
    await ctx.db.patch(milestone._id, {
      ...patch,
      updatedAt: now(),
    });
    const milestones = await recomputeDraftDerived(ctx, milestone.draftId);
    await ctx.db.patch(milestone.draftId, {
      manuallyEdited: true,
      updatedAt: now(),
    });
    await appendEvent(ctx, {
      command: "demo_updateBuilderProposalMilestone",
      draftId: milestone.draftId,
      entityKey: milestone.key,
      entityType: "builder_proposal_milestone",
      eventType: "BuilderProposalMilestoneUpdated",
      newState: patch,
      priorState: {
        budgetCents: milestone.budgetCents,
        drawGroupIndex: milestone.drawGroupIndex,
        durationDays: milestone.durationDays,
        name: milestone.name,
      },
      requirementIds: ["REQ-06", "REQ-08", "REQ-11"],
      validationIds: ["VAL-04"],
    });
    return {
      currentBudgetCents: currentBudgetCents(milestones),
      ok: true,
    };
  })
  .public();

export const demo_updateBuilderProposalDrawGroups = publicMutation
  .use(withMutationTiming("demo_builder_proposals.updateDrawGroups"))
  .input({
    assignments: v.array(
      v.object({
        drawGroupIndex: v.number(),
        milestoneId: v.id("demo_builderProposalMilestones"),
      })
    ),
    draftId: v.id("demo_builderProposalDrafts"),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    await getDraft(ctx, args.draftId);
    const milestones = await getDraftMilestones(ctx, args.draftId);
    const milestoneById = new Map<string, BuilderProposalMilestone>(
      milestones.map((milestone) => [String(milestone._id), milestone])
    );
    const priorState = milestones.map((milestone) => ({
      drawGroupIndex: milestone.drawGroupIndex,
      key: milestone.key,
    }));

    for (const assignment of args.assignments) {
      const milestone = milestoneById.get(String(assignment.milestoneId));
      if (
        !milestone ||
        milestone.draftId !== args.draftId ||
        milestone.orgKey !== ORG_KEY
      ) {
        throw new Error("Draw group milestone not found.");
      }
    }

    for (const assignment of args.assignments) {
      await ctx.db.patch(assignment.milestoneId, {
        drawGroupIndex: Math.max(0, Math.round(assignment.drawGroupIndex)),
        updatedAt: now(),
      });
    }

    const refreshedMilestones = await recomputeDraftDerived(ctx, args.draftId);
    await ctx.db.patch(args.draftId, {
      manuallyEdited: true,
      updatedAt: now(),
    });
    await appendEvent(ctx, {
      command: "demo_updateBuilderProposalDrawGroups",
      draftId: args.draftId,
      entityType: "builder_proposal_draw_group_plan",
      eventType: "BuilderProposalDrawGroupsUpdated",
      newState: refreshedMilestones.map((milestone) => ({
        drawGroupIndex: milestone.drawGroupIndex,
        key: milestone.key,
      })),
      priorState,
      requirementIds: ["REQ-06", "REQ-08", "REQ-11"],
      validationIds: ["VAL-04"],
    });
    return {
      currentBudgetCents: currentBudgetCents(refreshedMilestones),
      ok: true,
    };
  })
  .public();

export const demo_reorderBuilderProposalMilestone = publicMutation
  .use(withMutationTiming("demo_builder_proposals.reorderMilestone"))
  .input({
    milestoneId: v.id("demo_builderProposalMilestones"),
    targetIndex: v.number(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await ctx.db.get(args.milestoneId);
    if (!milestone || milestone.orgKey !== ORG_KEY) {
      throw new Error("Milestone not found.");
    }
    const milestones = await getDraftMilestones(ctx, milestone.draftId);
    const currentIndex = milestones.findIndex(
      (candidate) => candidate._id === args.milestoneId
    );
    if (currentIndex < 0) {
      throw new Error("Milestone not found in draft.");
    }
    const nextMilestones = [...milestones];
    const [moved] = nextMilestones.splice(currentIndex, 1);
    const targetIndex = Math.max(
      0,
      Math.min(nextMilestones.length, Math.round(args.targetIndex))
    );
    nextMilestones.splice(targetIndex, 0, moved);
    for (const [index, row] of nextMilestones.entries()) {
      await ctx.db.patch(row._id, {
        order: index + 1,
        updatedAt: now(),
      });
    }
    const refreshedMilestones = await recomputeDraftDerived(
      ctx,
      milestone.draftId
    );
    await ctx.db.patch(milestone.draftId, {
      manuallyEdited: true,
      updatedAt: now(),
    });
    await appendEvent(ctx, {
      command: "demo_reorderBuilderProposalMilestone",
      draftId: milestone.draftId,
      entityKey: milestone.key,
      entityType: "builder_proposal_milestone",
      eventType: "BuilderProposalMilestoneReordered",
      newState: { targetIndex },
      priorState: { order: milestone.order },
      requirementIds: ["REQ-06", "REQ-08", "REQ-11"],
      validationIds: ["VAL-04"],
    });
    return {
      currentBudgetCents: currentBudgetCents(refreshedMilestones),
      ok: true,
    };
  })
  .public();
