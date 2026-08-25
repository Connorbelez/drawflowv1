import { v } from "convex/values";
import { publicMutation, withMutationTiming } from "../fluent";
import {
  appendAudit,
  appendOutbox,
  findMilestone,
  latestSiteVisit,
} from "./access";
import { recomputeActiveDrawGroupStatuses } from "./lifecycle";

export const demo_approveMilestoneCompletion = publicMutation
  .use(withMutationTiming("demo_drawflow.approveMilestoneCompletion"))
  .input({
    milestoneKey: v.string(),
    overrideReason: v.optional(v.string()),
    persona: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "active", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    if (args.persona !== "lender_admin") {
      throw new Error("Only Lender Admin can approve completion.");
    }
    if (milestone.evidenceReviewStatus !== "accepted") {
      throw new Error("Evidence must be accepted before completion approval.");
    }
    const visit = await latestSiteVisit(ctx, "active", milestone.key);
    if (
      milestone.requiresSiteVisit &&
      visit?.status !== "completed" &&
      !args.overrideReason?.trim()
    ) {
      throw new Error(
        "Site visit must be complete or overridden with a reason."
      );
    }
    await ctx.db.patch(milestone._id, {
      approvedAt: Date.now(),
      approvedByPersona: args.persona,
      status: "completion_approved",
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: args.persona,
      buildId: milestone.buildId,
      command: "demo_approveMilestoneCompletion",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "MilestoneCompletionApproved",
      milestoneKey: milestone.key,
      reason: args.overrideReason,
      scenario: "active",
    });
    await appendOutbox(ctx, {
      buildId: milestone.buildId,
      eventType: "demo.milestone.completionApproved",
      milestoneKey: milestone.key,
      payloadPreview: `${milestone.name} completion approved.`,
      relatedEntity: milestone.name,
      scenario: "active",
    });
    await recomputeActiveDrawGroupStatuses(ctx);
    return { ok: true };
  })
  .public();
export const demo_rejectMilestoneCompletion = publicMutation
  .use(withMutationTiming("demo_drawflow.rejectMilestoneCompletion"))
  .input({ milestoneKey: v.string(), persona: v.string(), reason: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    if (!args.reason.trim()) {
      throw new Error("Rejection requires a reason.");
    }
    const milestone = await findMilestone(ctx, "active", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    if (args.persona !== "lender_admin") {
      throw new Error("Only Lender Admin can reject completion.");
    }
    await ctx.db.patch(milestone._id, {
      status: "completion_rejected",
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: args.persona,
      buildId: milestone.buildId,
      command: "demo_rejectMilestoneCompletion",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "MilestoneCompletionRejected",
      milestoneKey: milestone.key,
      reason: args.reason,
      scenario: "active",
    });
    await appendOutbox(ctx, {
      buildId: milestone.buildId,
      eventType: "demo.milestone.completionRejected",
      milestoneKey: milestone.key,
      payloadPreview: `${milestone.name} completion rejected.`,
      relatedEntity: milestone.name,
      scenario: "active",
    });
    return { ok: true };
  })
  .public();
