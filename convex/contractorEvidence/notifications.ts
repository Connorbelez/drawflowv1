import { v } from "convex/values";

import { contractorRoleMutation, contractorRoleQuery } from "./access";
// ---------------------------------------------------------------------------
// Notification read-back (PRD §10)
// ---------------------------------------------------------------------------

export const listContractorNotifications = contractorRoleQuery
  .input({ includeRead: v.optional(v.boolean()) })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    const rows = await ctx.db
      .query("contractorNotifications")
      .withIndex("by_contractor_created", (q) =>
        q.eq("contractorId", contractor._id)
      )
      .collect();
    return rows
      .filter((row) => (args.includeRead ? true : row.readAt === undefined))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
      .map((row) => ({
        _id: row._id,
        kind: row.kind,
        channel: row.channel,
        title: row.title,
        body: row.body ?? null,
        proposalId: row.proposalId ?? null,
        buildId: row.buildId ?? null,
        milestoneKey: row.milestoneKey ?? null,
        readAt: row.readAt ?? null,
        createdAt: row.createdAt,
      }));
  })
  .public();

export const markContractorNotificationRead = contractorRoleMutation
  .input({ notificationId: v.id("contractorNotifications") })
  .returns(v.boolean())
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.contractorId !== contractor._id) {
      throw new Error(
        "Forbidden: notification does not belong to your profile."
      );
    }
    await ctx.db.patch(args.notificationId, { readAt: Date.now() });
    return true;
  })
  .public();
