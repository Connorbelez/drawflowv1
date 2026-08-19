import { internal } from "./_generated/api.js";
import { isCanonicalCollaborationSystemPost } from "./build_collaboration_system_event_access";
import { migrations } from "./migrations";

const RETIREMENT_REASON =
  "Retired by the canonical System Post boundary: only Milestone and Draw occurrences may automate collaboration posts.";

/**
 * Retires legacy Evidence, Site Visit, Document, and per-transition automation
 * without deleting its audit history. Human posts and deterministic Milestone
 * and Draw System Posts are not changed.
 */
export const retireNoncanonicalAutomatedCollaborationPosts = migrations.define({
  table: "buildCollaborationPosts",
  migrateOne: async (ctx, post) => {
    if (
      post.source !== "system" ||
      isCanonicalCollaborationSystemPost(post) ||
      post.contentState === "tombstoned"
    ) {
      return;
    }

    const now = Date.now();
    const searchRecords = await ctx.db
      .query("buildCollaborationSearchRecords")
      .withIndex("by_postId", (query) => query.eq("postId", post._id))
      .take(501);
    if (searchRecords.length > 500) {
      throw new Error(
        "A retired automated collaboration post exceeds the bounded search-record cleanup limit.",
      );
    }
    for (const record of searchRecords) {
      if (record.contentState !== "retired") {
        await ctx.db.patch(record._id, {
          contentState: "retired",
          indexedAt: now,
        });
      }
    }

    await ctx.db.insert("auditEvents", {
      actorRoles: ["system"],
      actorWorkosUserId: "system",
      brokerageId: post.brokerageId,
      command: "retireNoncanonicalAutomatedCollaborationPosts",
      createdAt: now,
      entityId: String(post._id),
      entityType: "buildCollaborationPost",
      eventType: "build.collaboration.noncanonical_system_post.retired",
      newState: JSON.stringify({
        contentState: "tombstoned",
        threadState: "resolved",
      }),
      organizationId: post.organizationId,
      priorState: JSON.stringify({
        contentState: post.contentState,
        systemEventKey: post.systemEventKey,
        systemPostKind: post.systemPostKind,
        threadState: post.threadState,
      }),
      reason: RETIREMENT_REASON,
      warnings: [],
    });

    return {
      acknowledgementRequired: false,
      announcementProminent: false,
      contentState: "tombstoned" as const,
      openActionItemCount: 0,
      resolutionSummary: RETIREMENT_REASON,
      resolvedAt: now,
      resolvedByWorkosUserId: "system",
      threadRevision: (post.threadRevision ?? 0) + 1,
      threadState: "resolved" as const,
      tombstonedAt: now,
      tombstonedByWorkosUserId: "system",
      updatedAt: now,
    };
  },
});

export const runNoncanonicalAutomatedCollaborationPostRetirement =
  migrations.runner([
    internal.build_collaboration_system_post_boundary_migrations
      .retireNoncanonicalAutomatedCollaborationPosts,
  ]);
