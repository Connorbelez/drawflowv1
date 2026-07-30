/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_collaboration_editing";

function withIdentity(
  t: ReturnType<typeof convexTest>,
  {
    roles,
    subject,
  }: {
    roles: string[];
    subject: string;
  }
) {
  return t.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId: ORGANIZATION_ID,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
    "https://fairlend.ca/actor_kind": "human",
  } as never);
}

async function seedEditingFixture() {
  const base = convexTest(schema, modules);
  const admin = withIdentity(base, {
    roles: ["admin", "principle-broker"],
    subject: "user_admin",
  });
  const foundation = await admin.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORGANIZATION_ID }
  );
  const buildId = await admin.run(async (ctx) => {
    const now = Date.now();
    const proposalId = await ctx.db.insert("buildProposals", {
      assignedBrokerWorkosUserId: "user_broker",
      brokerageId: foundation.brokerageId,
      borrowerCoPayBps: 0,
      borrowerWorkingCapitalLimitCents: 50_000_000,
      buildName: "Editing fixture",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      createdByWorkosUserId: "user_admin",
      lenderDrawPolicyLimitCents: 100_000_000,
      location: "147 Cedar Ridge Road",
      organizationId: ORGANIZATION_ID,
      reviewOutcome: "approved",
      status: "approved",
      templateId: foundation.templateId,
      totalBudgetCents: 240_000_000,
      updatedAt: now,
      updatedByWorkosUserId: "user_admin",
    });
    const workflowRuleSnapshotId = await ctx.db.insert(
      "workflowRuleSnapshots",
      {
        allowPermitWaiverByRoles: ["admin"],
        brokerageId: foundation.brokerageId,
        createdAt: now,
        organizationId: ORGANIZATION_ID,
        proposalId,
        proposalStates: ["draft", "submitted", "approved", "closed"],
        requirePermitForApproval: false,
        ruleKey: "default",
        settings: {},
        version: 1,
        workflowRuleId: foundation.workflowRuleId,
      }
    );
    const activeBuildId = await ctx.db.insert("activeBuilds", {
      brokerageId: foundation.brokerageId,
      buildName: "Editing fixture",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      location: "147 Cedar Ridge Road",
      organizationId: ORGANIZATION_ID,
      proposalId,
      startDate: "2026-07-29",
      status: "active",
      totalBudgetCents: 240_000_000,
      updatedAt: now,
      workflowRuleSnapshotId,
    });
    await ctx.db.patch(proposalId, {
      activeBuildId,
      workflowRuleSnapshotId,
    });
    await ctx.db.insert("buildCollaborationTenantSettings", {
      activatedAt: now,
      activatedByWorkosUserId: "user_admin",
      brokerageId: foundation.brokerageId,
      createdAt: now,
      generousRateLimitMultiplier: 1,
      migrationCompletedAt: now,
      organizationId: ORGANIZATION_ID,
      status: "active",
      updatedAt: now,
    });
    await ctx.db.insert("buildParticipants", {
      brokerageId: foundation.brokerageId,
      buildId: activeBuildId,
      createdAt: now,
      displayNameSnapshot: "Builder Reader",
      joinedAt: now,
      organizationId: ORGANIZATION_ID,
      participationPeriod: 1,
      role: "builder",
      status: "active",
      updatedAt: now,
      validFrom: now,
      workosUserId: "user_builder",
    });
    await ctx.db.insert("buildParticipants", {
      brokerageId: foundation.brokerageId,
      buildId: activeBuildId,
      createdAt: now,
      displayNameSnapshot: "Broker Reviewer",
      joinedAt: now,
      organizationId: ORGANIZATION_ID,
      participationPeriod: 1,
      role: "broker",
      status: "active",
      updatedAt: now,
      validFrom: now,
      workosUserId: "user_broker",
    });
    await ctx.db.insert("buildParticipants", {
      brokerageId: foundation.brokerageId,
      buildId: activeBuildId,
      createdAt: now,
      displayNameSnapshot: "Reference Contractor",
      joinedAt: now,
      organizationId: ORGANIZATION_ID,
      participationPeriod: 1,
      role: "contractor",
      status: "active",
      updatedAt: now,
      validFrom: now,
      workosUserId: "user_reference",
    });
    return activeBuildId;
  });
  return {
    admin,
    base,
    buildId,
    builder: withIdentity(base, {
      roles: ["builder"],
      subject: "user_builder",
    }),
  };
}

function textDocument(text: string) {
  return JSON.stringify({
    content: [
      {
        content: [{ text, type: "text" }],
        type: "paragraph",
      },
    ],
    type: "doc",
  });
}

function participantMentionDocument(entityId: string, label: string) {
  return JSON.stringify({
    content: [
      {
        content: [
          { text: "Review with ", type: "text" },
          {
            attrs: {
              eyebrow: "Forged role",
              id: entityId,
              kind: "participant",
              label,
              summary: "Forged summary",
            },
            type: "collaborationMention",
          },
        ],
        type: "paragraph",
      },
    ],
    type: "doc",
  });
}

async function publishPost(
  fixture: Awaited<ReturnType<typeof seedEditingFixture>>,
  text = "Original post"
) {
  const postId = await fixture.admin.mutation(
    (api as any).build_collaboration
      .approveAndPublishBuildCollaborationBundle,
    {
      actionItems: [],
      audienceMode: "build_wide",
      buildId: fixture.buildId,
      organizationId: ORGANIZATION_ID,
      plainText: text,
      postType: "update",
      references: [],
      requestedReaderIds: [],
      tiptapJson: textDocument(text),
    }
  );
  return postId as Id<"buildCollaborationPosts">;
}

describe("Build collaboration immutable editing", () => {
  test("creates canonical immutable post revisions and preserves receipt semantics", async () => {
    const fixture = await seedEditingFixture();
    const postId = await publishPost(fixture);
    await fixture.builder.mutation(
      (api as any).build_collaboration_threads
        .markBuildCollaborationPostViewed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId,
      }
    );
    const before = await fixture.base.run(async (ctx) => {
      const post = await ctx.db.get(postId);
      if (!post) {
        throw new Error("Post fixture unavailable.");
      }
      return {
        activity: post.lastMeaningfulActivityAt,
        currentRevisionId: post.currentRevisionId,
      };
    });

    await fixture.admin.mutation(
      (api as any).build_collaboration_editing.editBuildCollaborationPost,
      {
        buildId: fixture.buildId,
        editReason: "Correct reviewer",
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        postId,
        references: [
          {
            entityId: "user_reference",
            entityKind: "participant",
            primary: true,
          },
        ],
        tiptapJson: participantMentionDocument("user_reference", "LEAKED LABEL"),
      }
    );

    const state = await fixture.base.run(async (ctx) => {
      const post = await ctx.db.get(postId);
      const revisions = await ctx.db
        .query("buildCollaborationPostRevisions")
        .withIndex("by_postId_and_revision", (query) =>
          query.eq("postId", postId)
        )
        .collect();
      const references = await ctx.db
        .query("buildCollaborationReferences")
        .withIndex("by_postId", (query) => query.eq("postId", postId))
        .collect();
      const receipt = await ctx.db
        .query("buildCollaborationReceipts")
        .withIndex("by_postId_and_workosUserId", (query) =>
          query.eq("postId", postId).eq("workosUserId", "user_builder")
        )
        .unique();
      return { post, receipt, references, revisions };
    });

    expect(state.post).toMatchObject({
      lastMeaningfulActivityAt: before.activity,
      readRevision: 2,
      revision: 2,
    });
    expect(state.receipt?.latestRevisionViewed).toBe(1);
    expect(state.revisions).toHaveLength(2);
    expect(state.revisions[0]._id).toBe(before.currentRevisionId);
    expect(state.revisions[0].plainText).toBe("Original post");
    expect(state.revisions[1]).toMatchObject({
      authorWorkosUserId: "user_admin",
      editReason: "Correct reviewer",
      plainText: "Review with Reference Contractor",
      revision: 2,
    });
    expect(state.revisions[1].tiptapJson).toContain(
      '"label":"Reference Contractor"'
    );
    expect(state.revisions[1].tiptapJson).not.toContain("LEAKED LABEL");
    expect(state.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: "user_reference",
          labelSnapshot: "Reference Contractor",
          ownerKind: "postRevision",
          ownerRecordId: state.revisions[1]._id,
        }),
      ])
    );

    await expect(
      fixture.admin.mutation(
        (api as any).build_collaboration_editing.editBuildCollaborationPost,
        {
          buildId: fixture.buildId,
          expectedRevision: 1,
          organizationId: ORGANIZATION_ID,
          postId,
          references: [],
          tiptapJson: textDocument("Stale draft"),
        }
      )
    ).rejects.toThrow("Revision conflict");
    await expect(
      fixture.builder.mutation(
        (api as any).build_collaboration_editing.editBuildCollaborationPost,
        {
          buildId: fixture.buildId,
          expectedRevision: 2,
          organizationId: ORGANIZATION_ID,
          postId,
          references: [],
          tiptapJson: textDocument("Unauthorized rewrite"),
        }
      )
    ).rejects.toThrow("Forbidden");
    const readerHistory = await fixture.builder.query(
      (api as any).build_collaboration_editing
        .listBuildCollaborationPostRevisionHistory,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId,
      }
    );
    expect(readerHistory[0].plainText).toBe(
      "Review with Reference Contractor"
    );
    await fixture.base.run(async (ctx) => {
      const participant = await ctx.db
        .query("buildParticipants")
        .withIndex("by_buildId_and_workosUserId", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq("workosUserId", "user_reference")
        )
        .unique();
      if (!participant) {
        throw new Error("Referenced participant fixture unavailable.");
      }
      await ctx.db.patch(participant._id, {
        removedAt: Date.now(),
        status: "removed",
        updatedAt: Date.now(),
      });
    });
    const redactedHistory = await fixture.builder.query(
      (api as any).build_collaboration_editing
        .listBuildCollaborationPostRevisionHistory,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId,
      }
    );
    expect(redactedHistory[0].plainText).toBe(
      "Review with [Referenced item unavailable]"
    );
    expect(redactedHistory[0].tiptapJson).not.toContain("user_reference");
    expect(redactedHistory[0].tiptapJson).not.toContain(
      "Reference Contractor"
    );

    const competing = await Promise.allSettled([
      fixture.admin.mutation(
        (api as any).build_collaboration_editing.editBuildCollaborationPost,
        {
          buildId: fixture.buildId,
          expectedRevision: 2,
          organizationId: ORGANIZATION_ID,
          postId,
          references: [],
          tiptapJson: textDocument("First concurrent edit"),
        }
      ),
      fixture.admin.mutation(
        (api as any).build_collaboration_editing.editBuildCollaborationPost,
        {
          buildId: fixture.buildId,
          expectedRevision: 2,
          organizationId: ORGANIZATION_ID,
          postId,
          references: [],
          tiptapJson: textDocument("Second concurrent edit"),
        }
      ),
    ]);
    expect(competing.filter((result) => result.status === "fulfilled")).toHaveLength(
      1
    );
    expect(competing.filter((result) => result.status === "rejected")).toHaveLength(
      1
    );
    const history = await fixture.admin.query(
      (api as any).build_collaboration_editing
        .listBuildCollaborationPostRevisionHistory,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId,
      }
    );
    expect(history.map((revision: { revision: number }) => revision.revision)).toEqual([
      3, 2, 1,
    ]);
  });

  test("edits and tombstones replies without changing post content history", async () => {
    const fixture = await seedEditingFixture();
    const postId = await publishPost(fixture);
    const commentId = await fixture.admin.mutation(
      (api as any).build_collaboration_threads.addBuildCollaborationComment,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Original reply",
        postId,
        references: [],
        tiptapJson: textDocument("Original reply"),
      }
    );
    await fixture.builder.mutation(
      (api as any).build_collaboration_threads
        .markBuildCollaborationPostViewed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId,
      }
    );
    const before = await fixture.base.run(async (ctx) => {
      const post = await ctx.db.get(postId);
      if (!post) {
        throw new Error("Post fixture unavailable.");
      }
      return post.lastMeaningfulActivityAt;
    });

    await fixture.admin.mutation(
      (api as any).build_collaboration_editing.editBuildCollaborationComment,
      {
        buildId: fixture.buildId,
        commentId,
        editReason: "Correct typo",
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        references: [],
        tiptapJson: textDocument("Corrected reply"),
      }
    );
    await expect(
      fixture.builder.mutation(
        (api as any).build_collaboration_editing
          .tombstoneBuildCollaborationComment,
        {
          buildId: fixture.buildId,
          commentId,
          expectedRevision: 2,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("Forbidden");

    const edited = await fixture.base.run(async (ctx) => {
      const post = await ctx.db.get(postId);
      const receipt = await ctx.db
        .query("buildCollaborationReceipts")
        .withIndex("by_postId_and_workosUserId", (query) =>
          query.eq("postId", postId).eq("workosUserId", "user_builder")
        )
        .unique();
      const postRevisions = await ctx.db
        .query("buildCollaborationPostRevisions")
        .withIndex("by_postId_and_revision", (query) =>
          query.eq("postId", postId)
        )
        .collect();
      return { post, postRevisions, receipt };
    });
    expect(edited.post).toMatchObject({
      lastMeaningfulActivityAt: before,
      readRevision: 2,
      revision: 1,
    });
    expect(edited.receipt?.latestRevisionViewed).toBe(1);
    expect(edited.postRevisions).toHaveLength(1);
    const readerHistory = await fixture.builder.query(
      (api as any).build_collaboration_editing
        .listBuildCollaborationCommentRevisionHistory,
      {
        buildId: fixture.buildId,
        commentId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(readerHistory[0].plainText).toBe("Corrected reply");

    await fixture.admin.mutation(
      (api as any).build_collaboration_editing
        .tombstoneBuildCollaborationComment,
      {
        buildId: fixture.buildId,
        commentId,
        expectedRevision: 2,
        organizationId: ORGANIZATION_ID,
      }
    );
    const comments = await fixture.builder.query(
      (api as any).build_collaboration_threads
        .listBuildCollaborationComments,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId,
      }
    );
    expect(comments).toHaveLength(1);
    expect(comments[0].comment).toMatchObject({
      contentState: "tombstoned",
      revision: 3,
    });
    expect(comments[0].revision.plainText).toBe(
      "This reply was removed by its author."
    );
    expect(comments[0].references).toEqual([]);
    expect(JSON.stringify(comments[0])).not.toContain("Corrected reply");
    await expect(
      fixture.builder.query(
        (api as any).build_collaboration_editing
          .listBuildCollaborationCommentRevisionHistory,
        {
          buildId: fixture.buildId,
          commentId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("Forbidden");

    const durable = await fixture.base.run(async (ctx) => {
      const revisions = await ctx.db
        .query("buildCollaborationCommentRevisions")
        .withIndex("by_commentId_and_revision", (query) =>
          query.eq("commentId", commentId)
        )
        .collect();
      const audits = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query
            .eq("entityType", "buildCollaborationComment")
            .eq("entityId", commentId)
        )
        .collect();
      return { audits, revisions };
    });
    expect(durable.revisions.map((revision) => revision.plainText)).toEqual([
      "Original reply",
      "Corrected reply",
    ]);
    expect(durable.audits.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        "build.collaboration.comment.edited",
        "build.collaboration.comment.tombstoned",
      ])
    );
  });

  test("tombstones posts without leaking or deleting durable records", async () => {
    const fixture = await seedEditingFixture();
    const postId = await publishPost(fixture, "Confidential original");
    const hiddenCommentId = await fixture.admin.mutation(
      (api as any).build_collaboration_threads.addBuildCollaborationComment,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Hidden with its parent thread",
        postId,
        references: [],
        tiptapJson: textDocument("Hidden with its parent thread"),
      }
    );
    const seeded = await fixture.base.run(async (ctx) => {
      const post = await ctx.db.get(postId);
      const build = await ctx.db.get(fixture.buildId);
      if (!(post?.currentRevisionId && build)) {
        throw new Error("Post fixture unavailable.");
      }
      const attachmentId = await ctx.db.insert(
        "buildCollaborationAttachments",
        {
          attachmentId: "durable-attachment",
          attachmentKind: "collaborationAsset",
          brokerageId: build.brokerageId,
          buildId: build._id,
          createdAt: Date.now(),
          createdByWorkosUserId: "user_admin",
          organizationId: ORGANIZATION_ID,
          ownerKind: "postRevision",
          ownerRecordId: post.currentRevisionId,
        }
      );
      return { attachmentId, revisionId: post.currentRevisionId };
    });

    await expect(
      fixture.builder.mutation(
        (api as any).build_collaboration_editing
          .tombstoneBuildCollaborationPost,
        {
          buildId: fixture.buildId,
          expectedRevision: 1,
          organizationId: ORGANIZATION_ID,
          postId,
        }
      )
    ).rejects.toThrow("Forbidden");
    await fixture.admin.mutation(
      (api as any).build_collaboration_editing.tombstoneBuildCollaborationPost,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        postId,
      }
    );

    const feed = await fixture.builder.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      }
    );
    const entry = feed.page.find(
      (candidate: any) =>
        candidate.kind === "post" && candidate.post._id === postId
    );
    expect(entry.post).toMatchObject({
      contentState: "tombstoned",
      readRevision: 2,
      revision: 2,
    });
    expect(entry.revision.plainText).toBe(
      "This post was removed by its author."
    );
    expect(entry.references).toEqual([]);
    expect(entry.actionItems).toEqual([]);
    expect(entry.receipts).toEqual([]);
    expect(entry.reactions).toEqual([]);
    expect(JSON.stringify(entry)).not.toContain("Confidential original");
    await expect(
      fixture.builder.query(
        (api as any).build_collaboration_editing
          .listBuildCollaborationPostRevisionHistory,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId,
        }
      )
    ).rejects.toThrow("Forbidden");
    await expect(
      fixture.builder.query(
        (api as any).build_collaboration_editing
          .listBuildCollaborationCommentRevisionHistory,
        {
          buildId: fixture.buildId,
          commentId: hiddenCommentId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("Forbidden");

    const durable = await fixture.base.run(async (ctx) => ({
      attachment: await ctx.db.get(seeded.attachmentId),
      revision: await ctx.db.get(
        seeded.revisionId as Id<"buildCollaborationPostRevisions">
      ),
    }));
    expect(durable.attachment).not.toBeNull();
    expect(durable.revision?.plainText).toBe("Confidential original");
    const history = await fixture.admin.query(
      (api as any).build_collaboration_editing
        .listBuildCollaborationPostRevisionHistory,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId,
      }
    );
    expect(history).toHaveLength(1);
    expect(history[0].plainText).toBe("Confidential original");
  });
});
