import { v } from "convex/values";
import { publicMutation, publicQuery, withMutationTiming, withQueryTiming } from "../fluent";
import { BUILDER_TEMPLATES, LENDER_DRAW_POLICY_LIMIT_CENTS, ORG_KEY, now } from "./shared";
import { appendEvent, dashboardCards, draftProjectionFromDraft, ensureTemplates, getOptionalDraft, nextProposalNumber } from "./projections";

export const demo_getBuilderDashboard = publicQuery
  .use(withQueryTiming("demo_builder_proposals.getDashboard"))
  .input({ draftId: v.optional(v.id("demo_builderProposalDrafts")) })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const templateRows = await ctx.db
      .query("demo_builderProposalTemplates")
      .withIndex("by_org", (q) => q.eq("orgKey", ORG_KEY))
      .collect();
    const drafts = (
      await ctx.db
        .query("demo_builderProposalDrafts")
        .withIndex("by_org", (q) => q.eq("orgKey", ORG_KEY))
        .collect()
    ).sort((a, b) => b.createdAt - a.createdAt);
    const requestedDraft = args.draftId
      ? await getOptionalDraft(ctx, args.draftId)
      : null;
    return {
      activeDraft: requestedDraft
        ? await draftProjectionFromDraft(ctx, requestedDraft)
        : null,
      dashboard: dashboardCards(drafts),
      drafts,
      needsSeed: templateRows.length === 0,
      orgKey: ORG_KEY,
      templates: templateRows.length > 0 ? templateRows : BUILDER_TEMPLATES,
    };
  })
  .public();

export const demo_startBuilderProposal = publicMutation
  .use(withMutationTiming("demo_builder_proposals.startDraft"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => {
    await ensureTemplates(ctx);
    const createdAt = now();
    const proposalNumber = await nextProposalNumber(ctx);
    const draftId = await ctx.db.insert("demo_builderProposalDrafts", {
      buildLocation: "Hamilton, ON",
      buildName: "Untitled reimbursable build",
      createdAt,
      currentBudgetCents: 0,
      generatedMilestoneVersion: 0,
      lenderDrawPolicyLimitCents: LENDER_DRAW_POLICY_LIMIT_CENTS,
      manuallyEdited: false,
      orgKey: ORG_KEY,
      proposalNumber,
      status: "draft",
      updatedAt: createdAt,
    });
    await appendEvent(ctx, {
      command: "demo_startBuilderProposal",
      draftId,
      entityKey: proposalNumber,
      entityType: "builder_proposal_draft",
      eventType: "BuilderProposalDraftStarted",
      newState: { draftId, proposalNumber, status: "draft" },
      requirementIds: ["REQ-01", "REQ-02", "REQ-11"],
      validationIds: ["VAL-01"],
    });
    return { draftId, proposalNumber };
  })
  .public();
