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
  RECOMMENDED_ORDER,
  addDays,
  dateDiffDays,
  dateValue,
  earliestDate,
  latestDate,
} from "./data";
import { recalcDrawGroupDates } from "./lifecycle";
import { recordJitPlanningRun } from "./projection";

export const demo_dismissWorkspaceIssue = publicMutation
  .use(withMutationTiming("demo_drawflow.dismissWorkspaceIssue"))
  .input({
    actorPersona: v.string(),
    conditionHash: v.string(),
    drawGroupKey: v.optional(v.string()),
    issueCode: v.string(),
    issueId: v.string(),
    milestoneKey: v.optional(v.string()),
    reason: v.optional(v.string()),
    scenario: v.union(v.literal("active"), v.literal("proposal")),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const existing = await ctx.db
      .query("demo_warningDismissals")
      .withIndex("by_warning", (q) =>
        q
          .eq("scenario", args.scenario)
          .eq("warningId", args.issueId)
          .eq("conditionHash", args.conditionHash)
      )
      .first();
    if (existing) {
      return { ok: true };
    }
    await ctx.db.insert("demo_warningDismissals", {
      actorPersona: args.actorPersona,
      conditionHash: args.conditionHash,
      dismissedAt: Date.now(),
      drawGroupKey: args.drawGroupKey,
      milestoneKey: args.milestoneKey,
      reason: args.reason,
      scenario: args.scenario,
      warningCode: args.issueCode,
      warningId: args.issueId,
    });
    await appendAudit(ctx, {
      actorPersona: args.actorPersona,
      command: "demo_dismissWorkspaceIssue",
      drawGroupKey: args.drawGroupKey,
      entityKey: args.issueId,
      entityType: "workspace_issue",
      eventType: "WorkspaceIssueDismissed",
      milestoneKey: args.milestoneKey,
      reason: args.reason ?? args.issueCode,
      scenario: args.scenario,
    });
    return { ok: true };
  })
  .public();
export const demo_applyWorkspaceIssueQuickFix = publicMutation
  .use(withMutationTiming("demo_drawflow.applyWorkspaceIssueQuickFix"))
  .input({
    action: v.string(),
    issueId: v.string(),
    targetId: v.optional(v.string()),
  })
  .returns(v.any())
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Quick-fix command routing is intentionally kept in one mutation.
  .handler(async (ctx, args) => {
    if (args.action === "applyRecommendedPlan") {
      const build = await getBuildOrThrow(ctx, "proposal");
      const milestones = await getMilestones(ctx, "proposal");
      const orderedMilestones = [...milestones].sort(
        (a, b) =>
          RECOMMENDED_ORDER.indexOf(a.key) - RECOMMENDED_ORDER.indexOf(b.key)
      );
      for (const [index, milestone] of orderedMilestones.entries()) {
        const start = addDays("2026-01-05", index * 30);
        await ctx.db.patch(milestone._id, {
          order: index + 1,
          plannedEndDate: addDays(start, milestone.durationDays - 1),
          plannedStartDate: start,
          updatedAt: Date.now(),
        });
      }
      await recalcDrawGroupDates(ctx, "proposal");
      await appendAudit(ctx, {
        actorPersona: "builder_lead",
        buildId: build._id,
        command: "demo_applyWorkspaceIssueQuickFix",
        entityKey: args.issueId,
        entityType: "workspace_issue",
        eventType: "WorkspaceIssueQuickFixApplied",
        reason: "Applied recommended capital-constrained plan.",
        scenario: "proposal",
      });
      await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
      return { ok: true };
    }

    if (args.action === "splitDrawGroup" && args.targetId) {
      const build = await getBuildOrThrow(ctx, "proposal");
      const groups = await getDrawGroups(ctx, "proposal");
      const group = groups.find((candidate) => candidate.key === args.targetId);
      const milestones = await getMilestones(ctx, "proposal");
      const groupMilestones = milestones.filter(
        (milestone) => milestone.drawGroupKey === args.targetId
      );
      if (group && groupMilestones.length > 1) {
        const splitIndex = Math.floor(groupMilestones.length / 2) - 1;
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
        await appendAudit(ctx, {
          actorPersona: "builder_lead",
          buildId: build._id,
          command: "demo_applyWorkspaceIssueQuickFix",
          drawGroupKey: group.key,
          entityKey: args.issueId,
          entityLabel: group.label,
          entityType: "workspace_issue",
          eventType: "WorkspaceIssueQuickFixApplied",
          reason: "Split draw group to reduce working-capital exposure.",
          scenario: "proposal",
        });
        await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
        return { ok: true };
      }
    }

    if (args.action === "shiftDependentMilestone" && args.targetId) {
      const dependencies = await getDependencies(ctx, "proposal");
      const dependency = dependencies.find(
        (edge) => edge._id === args.targetId
      );
      if (!dependency) {
        throw new Error("Dependency not found.");
      }
      const blocker = await findMilestone(
        ctx,
        "proposal",
        dependency.blockerKey
      );
      const blocked = await findMilestone(
        ctx,
        "proposal",
        dependency.blockedKey
      );
      if (!(blocker && blocked)) {
        throw new Error("Dependency milestones not found.");
      }
      const start = addDays(dateValue(blocker.plannedEndDate), 1);
      await ctx.db.patch(blocked._id, {
        plannedEndDate: addDays(start, blocked.durationDays - 1),
        plannedStartDate: start,
        updatedAt: Date.now(),
      });
      await recalcDrawGroupDates(ctx, "proposal");
      await appendAudit(ctx, {
        actorPersona: "builder_lead",
        command: "demo_applyWorkspaceIssueQuickFix",
        entityKey: args.issueId,
        entityType: "workspace_issue",
        eventType: "WorkspaceIssueQuickFixApplied",
        milestoneKey: blocked.key,
        reason: `Shifted ${blocked.name} after ${blocker.name}.`,
        scenario: "proposal",
      });
      await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
      return { ok: true };
    }

    if (args.action === "shiftNextDrawGroup" && args.targetId) {
      const groups = await getDrawGroups(ctx, "proposal");
      const current = groups.find((group) => group.key === args.targetId);
      if (!current) {
        throw new Error("Draw group sequence not found.");
      }
      const next = groups.find((group) => group.order === current.order + 1);
      if (!next) {
        throw new Error("Draw group sequence not found.");
      }
      const milestones = await getMilestones(ctx, "proposal");
      const currentMilestones = milestones.filter(
        (milestone) => milestone.drawGroupKey === current.key
      );
      const nextMilestones = milestones.filter(
        (milestone) => milestone.drawGroupKey === next.key
      );
      const currentEnd = latestDate(
        currentMilestones.map((milestone) => milestone.plannedEndDate)
      );
      const nextStart = earliestDate(
        nextMilestones.map((milestone) => milestone.plannedStartDate)
      );
      const deltaDays = dateDiffDays(nextStart, currentEnd);
      for (const milestone of nextMilestones) {
        await ctx.db.patch(milestone._id, {
          plannedEndDate: addDays(
            dateValue(milestone.plannedEndDate),
            deltaDays
          ),
          plannedStartDate: addDays(
            dateValue(milestone.plannedStartDate),
            deltaDays
          ),
          updatedAt: Date.now(),
        });
      }
      await recalcDrawGroupDates(ctx, "proposal");
      await appendAudit(ctx, {
        actorPersona: "builder_lead",
        command: "demo_applyWorkspaceIssueQuickFix",
        drawGroupKey: next.key,
        entityKey: args.issueId,
        entityType: "workspace_issue",
        eventType: "WorkspaceIssueQuickFixApplied",
        reason: `Shifted ${next.label} after ${current.label}.`,
        scenario: "proposal",
      });
      await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
      return { ok: true };
    }

    throw new Error(
      "This issue opens the relevant editor instead of applying an automatic fix."
    );
  })
  .public();
