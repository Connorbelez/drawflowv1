import { v } from "convex/values";
import { publicMutation, withMutationTiming } from "../fluent";
import {
  appendAudit,
  findMilestone,
  getBuildOrThrow,
  getDependencies,
  getDrawGroups,
  getMilestones,
} from "./access";
import {
  FLAT_DRAW_FEE_CENTS,
  RECOMMENDED_ORDER,
  WORKING_CAPITAL_CENTS,
  addDays,
  dateDiffDays,
  dateValue,
  type DemoDependency,
} from "./data";
import { recalcDrawGroupDates } from "./lifecycle";
import { recordJitPlanningRun } from "./projection";
import { validateProposal } from "./validation";

export const demo_updateProposalMilestoneValue = publicMutation
  .use(withMutationTiming("demo_drawflow.updateProposalMilestoneValue"))
  .input({ milestoneKey: v.string(), valueCents: v.number() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "proposal", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    await ctx.db.patch(milestone._id, {
      approvedValueCents: Math.max(0, Math.round(args.valueCents)),
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: milestone.buildId,
      command: "demo_updateProposalMilestoneValue",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "ProposalMilestoneValueChanged",
      milestoneKey: milestone.key,
      scenario: "proposal",
    });
    await recalcDrawGroupDates(ctx, "proposal");
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    return { ok: true };
  })
  .public();

export const demo_updateProposalMilestoneDuration = publicMutation
  .use(withMutationTiming("demo_drawflow.updateProposalMilestoneDuration"))
  .input({ durationDays: v.number(), milestoneKey: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "proposal", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    const durationDays = Math.max(1, Math.round(args.durationDays));
    const plannedEndDate = addDays(
      dateValue(milestone.plannedStartDate),
      durationDays - 1
    );
    await ctx.db.patch(milestone._id, {
      durationDays,
      plannedEndDate,
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: milestone.buildId,
      command: "demo_updateProposalMilestoneDuration",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "ProposalMilestoneDurationChanged",
      milestoneKey: milestone.key,
      scenario: "proposal",
    });
    await recalcDrawGroupDates(ctx, "proposal");
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    return { ok: true };
  })
  .public();

export const demo_updateProposalMilestonePlannedDates = publicMutation
  .use(withMutationTiming("demo_drawflow.updateProposalMilestonePlannedDates"))
  .input({
    milestoneKey: v.string(),
    plannedEndDate: v.string(),
    plannedStartDate: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "proposal", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    if (milestone.isDragLocked) {
      throw new Error(`${milestone.name} is locked and cannot be moved.`);
    }
    await ctx.db.patch(milestone._id, {
      durationDays: dateDiffDays(args.plannedStartDate, args.plannedEndDate),
      plannedEndDate: args.plannedEndDate,
      plannedStartDate: args.plannedStartDate,
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: milestone.buildId,
      command: "demo_updateProposalMilestonePlannedDates",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "ProposalMilestoneDatesMoved",
      milestoneKey: milestone.key,
      scenario: "proposal",
    });
    await recalcDrawGroupDates(ctx, "proposal");
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    return { ok: true };
  })
  .public();

export const demo_moveProposalMilestoneToDrawGroup = publicMutation
  .use(withMutationTiming("demo_drawflow.moveProposalMilestoneToDrawGroup"))
  .input({ drawGroupKey: v.string(), milestoneKey: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "proposal", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found.");
    }
    const groups = await getDrawGroups(ctx, "proposal");
    const group = groups.find(
      (candidate) => candidate.key === args.drawGroupKey
    );
    if (!group) {
      throw new Error("Draw group not found.");
    }
    await ctx.db.patch(milestone._id, {
      drawGroupKey: group.key,
      updatedAt: Date.now(),
    });
    await recalcDrawGroupDates(ctx, "proposal");
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: milestone.buildId,
      command: "demo_moveProposalMilestoneToDrawGroup",
      drawGroupKey: group.key,
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "ProposalMilestoneMovedToDrawGroup",
      milestoneKey: milestone.key,
      scenario: "proposal",
    });
    return { ok: true };
  })
  .public();

export const demo_reorderProposalMilestones = publicMutation
  .use(withMutationTiming("demo_drawflow.reorderProposalMilestones"))
  .input({
    direction: v.union(v.literal("up"), v.literal("down")),
    milestoneKey: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestones = await getMilestones(ctx, "proposal");
    const index = milestones.findIndex(
      (milestone) => milestone.key === args.milestoneKey
    );
    const targetIndex = args.direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= milestones.length) {
      return { ok: false };
    }
    const current = milestones[index];
    const target = milestones[targetIndex];
    await ctx.db.patch(current._id, {
      order: target.order,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(target._id, {
      order: current.order,
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: current.buildId,
      command: "demo_reorderProposalMilestones",
      entityKey: current.key,
      entityLabel: current.name,
      entityType: "milestone",
      eventType: "ProposalMilestonesReordered",
      milestoneKey: current.key,
      scenario: "proposal",
    });
    await recalcDrawGroupDates(ctx, "proposal");
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    return { ok: true };
  })
  .public();

export const demo_addProposalMilestone = publicMutation
  .use(withMutationTiming("demo_drawflow.addProposalMilestone"))
  .input({
    drawGroupKey: v.optional(v.string()),
    durationDays: v.optional(v.number()),
    name: v.string(),
    plannedStartDate: v.optional(v.string()),
    valueCents: v.optional(v.number()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const build = await getBuildOrThrow(ctx, "proposal");
    const milestones = await getMilestones(ctx, "proposal");
    const order = milestones.length + 1;
    const key = `custom_${order}`;
    const durationDays = Math.max(1, Math.round(args.durationDays ?? 7));
    const start = args.plannedStartDate ?? addDays("2026-08-01", order);
    const milestoneId = await ctx.db.insert("demo_milestones", {
      approvedValueCents: Math.max(0, Math.round(args.valueCents ?? 0)),
      buildId: build._id,
      code: `M-${String(order * 10).padStart(3, "0")}`,
      drawGroupKey: args.drawGroupKey ?? "d9",
      durationDays,
      evidenceReviewStatus: "not_started",
      key,
      name: args.name.trim() || "Custom Milestone",
      order,
      plannedEndDate: addDays(start, durationDays - 1),
      plannedStartDate: start,
      progressPercent: 0,
      requiresSiteVisit: false,
      scenario: "proposal",
      status: "draft",
      type: "custom",
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: build._id,
      command: "demo_addProposalMilestone",
      entityKey: key,
      entityLabel: args.name,
      entityType: "milestone",
      eventType: "ProposalMilestoneAdded",
      milestoneKey: key,
      scenario: "proposal",
    });
    await recalcDrawGroupDates(ctx, "proposal");
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    return { milestoneId, key };
  })
  .public();

export const demo_addProposalDependency = publicMutation
  .use(withMutationTiming("demo_drawflow.addProposalDependency"))
  .input({
    blockedKey: v.string(),
    blockerKey: v.string(),
    dependencyType: v.union(
      v.literal("hard_blocker"),
      v.literal("soft_dependency"),
      v.literal("procurement_dependency")
    ),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const build = await getBuildOrThrow(ctx, "proposal");
    if (args.blockedKey === args.blockerKey) {
      throw new Error("A milestone cannot depend on itself.");
    }
    const dependencies = await getDependencies(ctx, "proposal");
    if (createsCycle(dependencies, args.blockerKey, args.blockedKey)) {
      await appendAudit(ctx, {
        actorPersona: "builder_lead",
        command: "demo_addProposalDependency",
        entityKey: args.blockedKey,
        entityType: "dependency",
        eventType: "ProposalDependencyCycleRejected",
        milestoneKey: args.blockedKey,
        scenario: "proposal",
        validation: "rejected",
      });
      throw new Error("Dependency would create a cycle.");
    }
    const dependencyId = await ctx.db.insert("demo_milestoneDependencies", {
      blockedKey: args.blockedKey,
      blockerKey: args.blockerKey,
      buildId: build._id,
      isSystem: false,
      scenario: "proposal",
      severity:
        args.dependencyType === "soft_dependency" ? "warning" : "blocking",
      type: args.dependencyType,
    });
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: build._id,
      command: "demo_addProposalDependency",
      entityKey: args.blockedKey,
      entityType: "dependency",
      eventType: "ProposalDependencyAdded",
      milestoneKey: args.blockedKey,
      scenario: "proposal",
    });
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    return { dependencyId };
  })
  .public();

export const demo_removeProposalDependency = publicMutation
  .use(withMutationTiming("demo_drawflow.removeProposalDependency"))
  .input({ blockedKey: v.string(), blockerKey: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const dependencies = await getDependencies(ctx, "proposal");
    const dependency = dependencies.find(
      (edge) =>
        edge.blockedKey === args.blockedKey &&
        edge.blockerKey === args.blockerKey
    );
    if (!dependency) {
      return { ok: false };
    }
    if (dependency.isSystem) {
      await appendAudit(ctx, {
        actorPersona: "builder_lead",
        command: "demo_removeProposalDependency",
        entityKey: args.blockedKey,
        entityType: "dependency",
        eventType: "ProposalSystemDependencyRemoveBlocked",
        milestoneKey: args.blockedKey,
        scenario: "proposal",
        validation: "rejected",
      });
      throw new Error("System hard dependencies cannot be removed.");
    }
    await ctx.db.delete(dependency._id);
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      command: "demo_removeProposalDependency",
      entityKey: args.blockedKey,
      entityType: "dependency",
      eventType: "ProposalDependencyRemoved",
      milestoneKey: args.blockedKey,
      scenario: "proposal",
    });
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    return { ok: true };
  })
  .public();

export const demo_recomputeProposalPlan = publicMutation
  .use(withMutationTiming("demo_drawflow.recomputeProposalPlan"))
  .input({ runType: v.union(v.literal("jit"), v.literal("explicit")) })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const build = await getBuildOrThrow(ctx, "proposal");
    const milestones = await getMilestones(ctx, "proposal");
    const drawGroups = await getDrawGroups(ctx, "proposal");
    const dependencies = await getDependencies(ctx, "proposal");
    const validation = validateProposal(
      milestones,
      drawGroups,
      dependencies,
      build.workingCapitalLimitCents
    );
    const runId = await ctx.db.insert("demo_planningRuns", {
      buildId: build._id,
      createdAt: Date.now(),
      errors: validation.errors,
      interestEstimateCents: drawGroups.length * FLAT_DRAW_FEE_CENTS,
      recommendedDrawCount: 9,
      recommendedOrderKeys: RECOMMENDED_ORDER,
      runType: args.runType,
      scenario: "proposal",
      status: validation.errors.length > 0 ? "blocked" : "feasible",
      warnings: validation.warnings,
    });
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: build._id,
      command: "demo_recomputeProposalPlan",
      entityType: "planning_run",
      eventType: "ProposalPlanAnalyzed",
      scenario: "proposal",
    });
    return { runId };
  })
  .public();

export const demo_applyProposalPlanRecommendation = publicMutation
  .use(withMutationTiming("demo_drawflow.applyProposalPlanRecommendation"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => {
    const build = await getBuildOrThrow(ctx, "proposal");
    const milestones = await getMilestones(ctx, "proposal");
    const orderedMilestones = [...milestones].sort(
      (a, b) =>
        RECOMMENDED_ORDER.indexOf(a.key) - RECOMMENDED_ORDER.indexOf(b.key)
    );
    const recommendedGroupByKey = new Map<string, string>();
    let currentGroupNumber = 1;
    let currentGroupTotal = 0;
    for (const milestone of orderedMilestones) {
      if (
        currentGroupTotal > 0 &&
        currentGroupTotal + milestone.approvedValueCents > WORKING_CAPITAL_CENTS
      ) {
        currentGroupNumber += 1;
        currentGroupTotal = 0;
      }
      recommendedGroupByKey.set(milestone.key, `d${currentGroupNumber}`);
      currentGroupTotal += milestone.approvedValueCents;
    }
    for (const milestone of milestones) {
      const newOrder = RECOMMENDED_ORDER.indexOf(milestone.key) + 1;
      if (newOrder > 0) {
        const start = addDays("2026-01-05", Math.floor((newOrder - 1) * 30));
        await ctx.db.patch(milestone._id, {
          drawGroupKey:
            recommendedGroupByKey.get(milestone.key) ?? milestone.drawGroupKey,
          order: newOrder,
          plannedEndDate: addDays(start, milestone.durationDays - 1),
          plannedStartDate: start,
          updatedAt: Date.now(),
        });
      }
    }
    await recalcDrawGroupDates(ctx, "proposal");
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: build._id,
      command: "demo_applyProposalPlanRecommendation",
      entityType: "planning_run",
      eventType: "ProposalRecommendationApplied",
      scenario: "proposal",
    });
    return { ok: true };
  })
  .public();

export const demo_splitProposalDrawGroup = publicMutation
  .use(withMutationTiming("demo_drawflow.splitProposalDrawGroup"))
  .input({
    afterMilestoneKey: v.optional(v.string()),
    drawGroupKey: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const build = await getBuildOrThrow(ctx, "proposal");
    const groups = await getDrawGroups(ctx, "proposal");
    const group = groups.find(
      (candidate) => candidate.key === args.drawGroupKey
    );
    if (!group) {
      throw new Error("Draw group not found.");
    }
    const milestones = await getMilestones(ctx, "proposal");
    const groupMilestones = milestones.filter(
      (milestone) => milestone.drawGroupKey === group.key
    );
    const splitIndex = args.afterMilestoneKey
      ? groupMilestones.findIndex(
          (milestone) => milestone.key === args.afterMilestoneKey
        )
      : Math.floor(groupMilestones.length / 2) - 1;
    if (splitIndex < 0 || splitIndex >= groupMilestones.length - 1) {
      return {
        ok: false,
        reason: "Choose a milestone before the end of a draw group to split.",
      };
    }
    const nextNumber = groups.length + 1;
    const newKey = `d${nextNumber}`;
    await ctx.db.insert("demo_drawGroups", {
      approvedValueCents: 0,
      buildId: build._id,
      key: newKey,
      label: `Draw ${nextNumber}`,
      order: nextNumber,
      plannedEndDate: group.plannedEndDate,
      plannedStartDate: group.plannedEndDate,
      requestedValueCents: 0,
      scenario: "proposal",
      status: "planned",
      updatedAt: Date.now(),
    });
    for (const milestone of groupMilestones.slice(splitIndex + 1)) {
      await ctx.db.patch(milestone._id, {
        drawGroupKey: newKey,
        updatedAt: Date.now(),
      });
    }
    await recalcDrawGroupDates(ctx, "proposal");
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: build._id,
      command: "demo_splitProposalDrawGroup",
      drawGroupKey: group.key,
      entityKey: group.key,
      entityLabel: group.label,
      entityType: "draw_group",
      eventType: "ProposalDrawGroupSplit",
      scenario: "proposal",
    });
    return { ok: true };
  })
  .public();

export const demo_mergeProposalDrawGroups = publicMutation
  .use(withMutationTiming("demo_drawflow.mergeProposalDrawGroups"))
  .input({ drawGroupKey: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const groups = await getDrawGroups(ctx, "proposal");
    const group = groups.find(
      (candidate) => candidate.key === args.drawGroupKey
    );
    if (!group || group.order === 1) {
      return { ok: false };
    }
    const previous = groups.find(
      (candidate) => candidate.order === group.order - 1
    );
    if (!previous) {
      return { ok: false };
    }
    const milestones = await getMilestones(ctx, "proposal");
    for (const milestone of milestones.filter(
      (candidate) => candidate.drawGroupKey === group.key
    )) {
      await ctx.db.patch(milestone._id, {
        drawGroupKey: previous.key,
        updatedAt: Date.now(),
      });
    }
    await ctx.db.delete(group._id);
    const remainingGroups = groups
      .filter((candidate) => candidate._id !== group._id)
      .sort((a, b) => a.order - b.order);
    for (const [index, remainingGroup] of remainingGroups.entries()) {
      const order = index + 1;
      await ctx.db.patch(remainingGroup._id, {
        label: `Draw ${order}`,
        order,
        updatedAt: Date.now(),
      });
    }
    await recalcDrawGroupDates(ctx, "proposal");
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      command: "demo_mergeProposalDrawGroups",
      drawGroupKey: previous.key,
      entityKey: previous.key,
      entityLabel: previous.label,
      entityType: "draw_group",
      eventType: "ProposalDrawGroupsMerged",
      scenario: "proposal",
    });
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    return { ok: true };
  })
  .public();

export const demo_reorderProposalMilestoneAbsolute = publicMutation
  .use(withMutationTiming("demo_drawflow.reorderProposalMilestoneAbsolute"))
  .input({
    fromIndex: v.number(),
    milestoneKey: v.string(),
    toIndex: v.number(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestones = await getMilestones(ctx, "proposal");
    const fromIndex = milestones.findIndex(
      (milestone) => milestone.key === args.milestoneKey
    );
    if (fromIndex < 0) {
      return { ok: false };
    }
    const boundedToIndex = Math.max(
      0,
      Math.min(milestones.length - 1, Math.round(args.toIndex))
    );
    const reordered = [...milestones];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(boundedToIndex, 0, moved);
    for (const [index, milestone] of reordered.entries()) {
      await ctx.db.patch(milestone._id, {
        order: index + 1,
        updatedAt: Date.now(),
      });
    }
    await recalcDrawGroupDates(ctx, "proposal");
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: moved.buildId,
      command: "demo_reorderProposalMilestoneAbsolute",
      entityKey: moved.key,
      entityLabel: moved.name,
      entityType: "milestone",
      eventType: "ProposalMilestonesReorderedByDrag",
      milestoneKey: moved.key,
      reason: `Moved from ${args.fromIndex + 1} to ${boundedToIndex + 1}.`,
      scenario: "proposal",
    });
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    return { ok: true };
  })
  .public();


function createsCycle(
  dependencies: DemoDependency[],
  blockerKey: string,
  blockedKey: string
) {
  const edges = [...dependencies, { blockedKey, blockerKey }];
  const visit = (
    current: string,
    target: string,
    seen: Set<string>
  ): boolean => {
    if (current === target) {
      return true;
    }
    if (seen.has(current)) {
      return false;
    }
    seen.add(current);
    return edges
      .filter((edge) => edge.blockerKey === current)
      .some((edge) => visit(edge.blockedKey, target, seen));
  };
  return visit(blockedKey, blockerKey, new Set<string>());
}
