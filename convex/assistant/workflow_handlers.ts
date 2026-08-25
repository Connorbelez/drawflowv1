import type { AuthorizedViewer } from "../authz";
import type { Id, MutationCtx, QueryCtx } from "../types";
import { authorizeOrganization } from "./access";
import { firstOpenWorkflowStepId, normalizeWorkflowSteps } from "./planning";

type AssistantMutationCtx = MutationCtx & { viewer: AuthorizedViewer };
type AssistantQueryCtx = QueryCtx & { viewer: AuthorizedViewer };

export async function createWorkflowRunHandler(
  ctx: AssistantMutationCtx,
  args: {
    goal: string;
    prompt: string;
    routeContext: unknown;
    steps: unknown[];
    threadId?: Id<"assistantThreads">;
    workosOrganizationId: string;
  }
) {
  const auth = await authorizeOrganization(ctx, args.workosOrganizationId);
  const now = Date.now();
  const normalizedSteps = normalizeWorkflowSteps(args.steps);
  return await ctx.db.insert("assistantWorkflowRuns", {
    actorRoles: auth.roles,
    brokerageId: auth.brokerage?._id,
    createdAt: now,
    createdByWorkosUserId: auth.subject,
    currentStepId: firstOpenWorkflowStepId(normalizedSteps),
    goal: args.goal,
    organizationId: auth.organizationId,
    prompt: args.prompt,
    routeContext: args.routeContext,
    status: "running",
    steps: normalizedSteps,
    threadId: args.threadId,
    updatedAt: now,
  });
}

export async function getActiveWorkflowRunHandler(
  ctx: AssistantQueryCtx,
  args: {
    threadId?: Id<"assistantThreads">;
    workosOrganizationId: string;
  }
) {
  const auth = await authorizeOrganization(ctx, args.workosOrganizationId);
  const running = args.threadId
    ? await ctx.db
        .query("assistantWorkflowRuns")
        .withIndex("by_thread_status", (q) =>
          q.eq("threadId", args.threadId).eq("status", "running")
        )
        .order("desc")
        .first()
    : await ctx.db
        .query("assistantWorkflowRuns")
        .withIndex("by_actor_status", (q) =>
          q
            .eq("organizationId", auth.organizationId)
            .eq("createdByWorkosUserId", auth.subject)
            .eq("status", "running")
        )
        .order("desc")
        .first();
  const needsInput = running
    ? null
    : args.threadId
      ? await ctx.db
          .query("assistantWorkflowRuns")
          .withIndex("by_thread_status", (q) =>
            q.eq("threadId", args.threadId).eq("status", "needs_input")
          )
          .order("desc")
          .first()
      : await ctx.db
          .query("assistantWorkflowRuns")
          .withIndex("by_actor_status", (q) =>
            q
              .eq("organizationId", auth.organizationId)
              .eq("createdByWorkosUserId", auth.subject)
              .eq("status", "needs_input")
          )
          .order("desc")
          .first();
  const succeeded =
    running || needsInput
      ? null
      : args.threadId
        ? await ctx.db
            .query("assistantWorkflowRuns")
            .withIndex("by_thread_status", (q) =>
              q.eq("threadId", args.threadId).eq("status", "succeeded")
            )
            .order("desc")
            .first()
        : await ctx.db
            .query("assistantWorkflowRuns")
            .withIndex("by_actor_status", (q) =>
              q
                .eq("organizationId", auth.organizationId)
                .eq("createdByWorkosUserId", auth.subject)
                .eq("status", "succeeded")
            )
            .order("desc")
            .first();
  const active = running ?? needsInput ?? succeeded;
  if (!active || active.organizationId !== auth.organizationId) {
    return null;
  }
  return active;
}
