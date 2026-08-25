import { v } from "convex/values";
import type { Id } from "../types";
import { publicMutation, withMutationTiming } from "../fluent";
import { IDEMPOTENCY_WINDOW_MS } from "./view";

interface ApproveDrawAuditMeta {
  actorPersona: string;
  buildId: Id<"demo_builds">;
  drawGroupKey: string;
  priorStatus: string;
  reason?: string;
  scenario: string;
}

async function recordApproveDrawAudit(
  ctx: {
    db: { insert: (table: "demo_auditEvents", row: any) => Promise<any> };
  },
  meta: ApproveDrawAuditMeta
): Promise<void> {
  const createdAt = Date.now();
  await ctx.db.insert("demo_auditEvents", {
    actorPersona: meta.actorPersona,
    afterSummary: "release_approved",
    beforeSummary: meta.priorStatus,
    buildId: meta.buildId,
    command: "demo_approveDraw",
    correlationId: `demo_approveDraw:${meta.drawGroupKey}:${createdAt}`,
    createdAt,
    drawGroupKey: meta.drawGroupKey,
    entityKey: meta.drawGroupKey,
    entityLabel: `Draw ${meta.drawGroupKey}`,
    entityType: "drawGroup",
    eventType: "drawApproved",
    milestoneKey: undefined,
    reason: meta.reason,
    scenario: meta.scenario,
    validation: "accepted",
  });
}

async function recordApproveDrawOutbox(
  ctx: {
    db: { insert: (table: "demo_eventOutbox", row: any) => Promise<any> };
  },
  meta: ApproveDrawAuditMeta
): Promise<void> {
  await ctx.db.insert("demo_eventOutbox", {
    buildId: meta.buildId,
    createdAt: Date.now(),
    drawGroupKey: meta.drawGroupKey,
    eventType: "drawApproved",
    milestoneKey: undefined,
    payloadPreview: `Draw ${meta.drawGroupKey} release approved`,
    relatedEntity: "drawGroup",
    scenario: meta.scenario,
    status: "mock_delivered",
  });
}

export const demo_approveDraw = publicMutation
  .use(withMutationTiming("demo_drawflow_backoffice.approveDraw"))
  .input({
    buildId: v.id("demo_builds"),
    drawGroupKey: v.string(),
    actorPersona: v.optional(v.string()),
    overrideReason: v.optional(v.string()),
  })
  .returns(
    v.object({
      idempotent: v.boolean(),
      status: v.string(),
      drawGroupKey: v.string(),
    })
  )
  .handler(async (ctx, args) => {
    const actorPersona = args.actorPersona ?? "lender_admin";
    const build = await ctx.db.get(args.buildId);
    if (!build) {
      throw new Error(`Build ${args.buildId} not found`);
    }
    const drawGroup = await ctx.db
      .query("demo_drawGroups")
      .withIndex("by_scenario_key", (q) =>
        q.eq("scenario", build.scenario).eq("key", args.drawGroupKey)
      )
      .first();
    if (!drawGroup) {
      throw new Error(
        `Draw group ${args.drawGroupKey} not found for scenario ${build.scenario}`
      );
    }

    // Idempotency: if already approved and recent audit exists for same actor
    // within the window, return without writing.
    if (drawGroup.status === "release_approved") {
      const recentAudit = await ctx.db
        .query("demo_auditEvents")
        .withIndex("by_draw_group", (q) =>
          q.eq("scenario", build.scenario).eq("drawGroupKey", args.drawGroupKey)
        )
        .collect();
      const within = recentAudit.some(
        (event) =>
          event.command === "demo_approveDraw" &&
          event.actorPersona === actorPersona &&
          Date.now() - event.createdAt < IDEMPOTENCY_WINDOW_MS
      );
      if (within) {
        return {
          idempotent: true,
          status: "release_approved",
          drawGroupKey: drawGroup.key,
        };
      }
    }

    // Policy check: lender draw policy limit
    const drawGroups = await ctx.db
      .query("demo_drawGroups")
      .withIndex("by_build_order", (q) => q.eq("buildId", args.buildId))
      .collect();
    const alreadyApproved = drawGroups
      .filter((g) => g.status === "release_approved" && g._id !== drawGroup._id)
      .reduce((sum, g) => sum + g.approvedValueCents, 0);
    const projected = alreadyApproved + drawGroup.approvedValueCents;
    if (projected > build.lenderDrawPolicyLimitCents && !args.overrideReason) {
      throw new Error(
        "policy_limit: lender draw policy limit would be exceeded; provide overrideReason to override."
      );
    }

    const priorStatus = drawGroup.status;
    await ctx.db.patch(drawGroup._id, {
      status: "release_approved",
      releaseApprovedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await recordApproveDrawAudit(ctx, {
      buildId: args.buildId,
      drawGroupKey: drawGroup.key,
      scenario: build.scenario,
      actorPersona,
      priorStatus,
      reason: args.overrideReason,
    });
    await recordApproveDrawOutbox(ctx, {
      buildId: args.buildId,
      drawGroupKey: drawGroup.key,
      scenario: build.scenario,
      actorPersona,
      priorStatus,
    });
    return {
      idempotent: false,
      status: "release_approved",
      drawGroupKey: drawGroup.key,
    };
  })
  .public();
