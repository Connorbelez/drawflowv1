import { v } from "convex/values";
import { publicMutation, withMutationTiming } from "../fluent";
import {
  appendAudit,
  appendOutbox,
  getBuildOrThrow,
  getDependencies,
  getDrawGroups,
  getMilestones,
} from "./access";
import { validateProposal } from "./validation";

export const demo_submitProposal = publicMutation
  .use(withMutationTiming("demo_drawflow.submitProposal"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => {
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
    if (validation.errors.length > 0) {
      await appendAudit(ctx, {
        actorPersona: "builder_lead",
        buildId: build._id,
        command: "demo_submitProposal",
        entityType: "proposal",
        eventType: "ProposalSubmitRejected",
        reason: validation.errors[0],
        scenario: "proposal",
        validation: "rejected",
      });
      throw new Error(validation.errors[0]);
    }
    await ctx.db.patch(build._id, {
      status: "submitted",
      submittedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: build._id,
      command: "demo_submitProposal",
      entityType: "proposal",
      eventType: "ProposalSubmitted",
      scenario: "proposal",
    });
    await appendOutbox(ctx, {
      buildId: build._id,
      eventType: "demo.proposal.submitted",
      payloadPreview: "Proposal submitted for lender review.",
      relatedEntity: "Maple Ridge Townhomes proposal",
      scenario: "proposal",
    });
    return { ok: true };
  })
  .public();
export const demo_approveProposal = publicMutation
  .use(withMutationTiming("demo_drawflow.approveProposal"))
  .input({
    reason: v.optional(v.string()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const build = await getBuildOrThrow(ctx, "proposal");
    const now = Date.now();
    if (build.status !== "submitted") {
      throw new Error("Only submitted proposals can be approved.");
    }
    await ctx.db.patch(build._id, {
      status: "approved",
      updatedAt: now,
    });
    await appendAudit(ctx, {
      actorPersona: "lender_admin",
      afterSummary: "Proposal approved",
      beforeSummary: "Proposal submitted",
      buildId: build._id,
      command: "demo_approveProposal",
      entityKey: build.key,
      entityLabel: build.name,
      entityType: "build_proposal",
      eventType: "BuildProposalApproved",
      reason: args.reason,
      scenario: "proposal",
      validation: "lender_admin_final_authority",
    });
    await appendOutbox(ctx, {
      buildId: build._id,
      eventType: "demo.proposal.approved",
      payloadPreview: "Proposal approved by lender admin.",
      relatedEntity: "Maple Ridge Townhomes proposal",
      scenario: "proposal",
    });
    return { ok: true, status: "approved" };
  })
  .public();
