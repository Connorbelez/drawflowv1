import { v } from "convex/values";
import {
  publicMutation,
  publicQuery,
  withMutationTiming,
  withQueryTiming,
} from "../fluent";

// -----------------------------------------------------------------------------
// Notes mutations
// -----------------------------------------------------------------------------

export const demo_addBuildNote = publicMutation
  .use(withMutationTiming("demo_drawflow_backoffice.addBuildNote"))
  .input({
    buildId: v.id("demo_builds"),
    visibility: v.union(v.literal("internal"), v.literal("public")),
    body: v.string(),
    authorPersona: v.optional(v.string()),
  })
  .returns(v.id("demo_buildNotes"))
  .handler(async (ctx, args) => {
    const body = args.body.trim();
    if (!body) {
      throw new Error("empty_body");
    }
    const build = await ctx.db.get(args.buildId);
    if (!build) {
      throw new Error(`Build ${args.buildId} not found`);
    }
    const now = Date.now();
    const id = await ctx.db.insert("demo_buildNotes", {
      buildId: args.buildId,
      scenario: build.scenario,
      visibility: args.visibility,
      body,
      authorPersona: args.authorPersona ?? "lender_admin",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("demo_auditEvents", {
      actorPersona: args.authorPersona ?? "lender_admin",
      buildId: args.buildId,
      command: "demo_addBuildNote",
      correlationId: `demo_addBuildNote:${id}:${now}`,
      createdAt: now,
      entityKey: id,
      entityType: "buildNote",
      eventType: `buildNote.${args.visibility}.added`,
      scenario: build.scenario,
      validation: "accepted",
    });
    return id;
  })
  .public();
// -----------------------------------------------------------------------------
// Borrower-safe public notes: NEVER returns internal notes.
// -----------------------------------------------------------------------------

export const demo_getBorrowerVisibleNotes = publicQuery
  .use(withQueryTiming("demo_drawflow_backoffice.getBorrowerVisibleNotes"))
  .input({ buildId: v.id("demo_builds") })
  .returns(v.array(v.any()))
  .handler(async (ctx, { buildId }) => {
    const rows = await ctx.db
      .query("demo_buildNotes")
      .withIndex("by_build_visibility", (q) =>
        q.eq("buildId", buildId).eq("visibility", "public")
      )
      .collect();
    return rows;
  })
  .public();

// -----------------------------------------------------------------------------
// Milestone approval from sheet (delegates to existing approveMilestoneCompletion
// in demo_drawflow.ts; this is a thin wrapper that mirrors the audit + outbox)
// -----------------------------------------------------------------------------

export const demo_approveMilestoneFromSheet = publicMutation
  .use(withMutationTiming("demo_drawflow_backoffice.approveMilestoneFromSheet"))
  .input({
    buildId: v.id("demo_builds"),
    milestoneKey: v.string(),
    actorPersona: v.optional(v.string()),
    note: v.optional(v.string()),
  })
  .returns(
    v.object({
      milestoneKey: v.string(),
      status: v.string(),
    })
  )
  .handler(async (ctx, args) => {
    const actorPersona = args.actorPersona ?? "lender_admin";
    const build = await ctx.db.get(args.buildId);
    if (!build) {
      throw new Error(`Build ${args.buildId} not found`);
    }
    const milestone = await ctx.db
      .query("demo_milestones")
      .withIndex("by_key", (q) =>
        q.eq("scenario", build.scenario).eq("key", args.milestoneKey)
      )
      .first();
    if (!milestone) {
      throw new Error(
        `Milestone ${args.milestoneKey} not found for scenario ${build.scenario}`
      );
    }
    const priorStatus = milestone.status;
    const now = Date.now();
    await ctx.db.patch(milestone._id, {
      status: "completion_approved",
      evidenceReviewStatus: "approved",
      approvedAt: now,
      approvedByPersona: actorPersona,
      progressPercent: 100,
      updatedAt: now,
    });
    await ctx.db.insert("demo_auditEvents", {
      actorPersona,
      afterSummary: "completion_approved",
      beforeSummary: priorStatus,
      buildId: args.buildId,
      command: "demo_approveMilestoneFromSheet",
      correlationId: `demo_approveMilestoneFromSheet:${args.milestoneKey}:${now}`,
      createdAt: now,
      entityKey: args.milestoneKey,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "milestoneCompleted",
      milestoneKey: args.milestoneKey,
      reason: args.note,
      scenario: build.scenario,
      validation: "accepted",
    });
    await ctx.db.insert("demo_eventOutbox", {
      buildId: args.buildId,
      createdAt: now,
      drawGroupKey: milestone.drawGroupKey,
      eventType: "milestoneCompleted",
      milestoneKey: args.milestoneKey,
      payloadPreview: `Milestone ${milestone.name} approved`,
      relatedEntity: "milestone",
      scenario: build.scenario,
      status: "mock_delivered",
    });
    return { milestoneKey: args.milestoneKey, status: "completion_approved" };
  })
  .public();
