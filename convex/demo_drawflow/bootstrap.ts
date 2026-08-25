import { v } from "convex/values";
import { publicMutation, withMutationTiming } from "../fluent";
import { appendAudit, cleanupAll, getBuild } from "./access";
import { seedAll } from "./seed";

export const demo_seedDrawFlowDemo = publicMutation
  .use(withMutationTiming("demo_drawflow.seed"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => {
    const active = await getBuild(ctx, "active");
    const proposal = await getBuild(ctx, "proposal");
    if (active && proposal) {
      return { seeded: false };
    }
    await cleanupAll(ctx);
    await seedAll(ctx);
    return { seeded: true };
  })
  .public();
export const demo_cleanupDrawFlowDemo = publicMutation
  .use(withMutationTiming("demo_drawflow.cleanup"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => {
    await cleanupAll(ctx);
    return { cleaned: true };
  })
  .public();
export const demo_resetDrawFlowDemo = publicMutation
  .use(withMutationTiming("demo_drawflow.reset"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => {
    await cleanupAll(ctx);
    await seedAll(ctx);
    await appendAudit(ctx, {
      actorPersona: "system",
      command: "demo_resetDrawFlowDemo",
      entityType: "demo",
      eventType: "DemoReset",
      scenario: "active",
    });
    return { reset: true };
  })
  .public();
