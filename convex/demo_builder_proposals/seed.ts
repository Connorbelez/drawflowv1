import { v } from "convex/values";
import { publicMutation, withMutationTiming } from "../fluent";
import { appendEvent, cleanupBuilderProposalDemo, ensureTemplates } from "./projections";

export const demo_seedBuilderProposalDemo = publicMutation
  .use(withMutationTiming("demo_builder_proposals.seed"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => await ensureTemplates(ctx))
  .public();

export const demo_resetBuilderProposalDemo = publicMutation
  .use(withMutationTiming("demo_builder_proposals.reset"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => {
    await cleanupBuilderProposalDemo(ctx);
    await ensureTemplates(ctx);
    await appendEvent(ctx, {
      command: "demo_resetBuilderProposalDemo",
      entityType: "demo",
      eventType: "BuilderProposalDemoReset",
      requirementIds: ["REQ-02"],
      validationIds: ["VAL-01"],
    });
    return { reset: true };
  })
  .public();
