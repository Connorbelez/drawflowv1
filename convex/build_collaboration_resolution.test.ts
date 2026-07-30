/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { BuildCollaborationRole } from "./build_collaboration_model";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_collaboration_resolution";

function withIdentity(
  t: ReturnType<typeof convexTest>,
  role: BuildCollaborationRole,
  subject = `user_${role.replace("-", "_")}`
) {
  return t.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId: ORGANIZATION_ID,
    role,
    roles: [role],
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
    "https://fairlend.ca/actor_kind": "human",
  } as never);
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

async function seedResolutionFixture() {
  const base = convexTest(schema, modules);
  const admin = withIdentity(base, "admin");
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
      buildName: "Resolution fixture",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      createdByWorkosUserId: "user_admin",
      lenderDrawPolicyLimitCents: 100_000_000,
      location: "92 Resolution Road",
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
      buildName: "Resolution fixture",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      location: "92 Resolution Road",
      organizationId: ORGANIZATION_ID,
      proposalId,
      startDate: "2026-07-30",
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
    const participants: Array<{
      displayName: string;
      role: BuildCollaborationRole;
      workosUserId: string;
    }> = [
      {
        displayName: "Broker Coordinator",
        role: "broker",
        workosUserId: "user_broker",
      },
      {
        displayName: "Builder Staff",
        role: "builder-staff",
        workosUserId: "user_builder_staff",
      },
      {
        displayName: "Contractor Author",
        role: "contractor",
        workosUserId: "user_contractor",
      },
      {
        displayName: "Other Contractor",
        role: "contractor",
        workosUserId: "user_other_contractor",
      },
    ];
    for (const participant of participants) {
      await ctx.db.insert("buildParticipants", {
        brokerageId: foundation.brokerageId,
        buildId: activeBuildId,
        createdAt: now,
        displayNameSnapshot: participant.displayName,
        joinedAt: now,
        organizationId: ORGANIZATION_ID,
        participationPeriod: 1,
        role: participant.role,
        status: "active",
        updatedAt: now,
        validFrom: now,
        workosUserId: participant.workosUserId,
      });
    }
    return activeBuildId;
  });
  return {
    admin,
    base,
    broker: withIdentity(base, "broker"),
    buildId,
    builderStaff: withIdentity(base, "builder-staff"),
    contractor: withIdentity(base, "contractor"),
    otherContractor: withIdentity(
      base,
      "contractor",
      "user_other_contractor"
    ),
  };
}

async function publishPost(
  fixture: Awaited<ReturnType<typeof seedResolutionFixture>>,
  actor: typeof fixture.broker | typeof fixture.contractor,
  input: {
    actionTitle?: string;
    postType: "update" | "question" | "decision" | "issue" | "announcement";
    text: string;
  }
) {
  return (await actor.mutation(
    (api as any).build_collaboration
      .approveAndPublishBuildCollaborationBundle,
    {
      actionItems: input.actionTitle
        ? [{ priority: "high", title: input.actionTitle }]
        : [],
      audienceMode: "build_wide",
      buildId: fixture.buildId,
      organizationId: ORGANIZATION_ID,
      plainText: input.text,
      postType: input.postType,
      references: [],
      requestedReaderIds: [],
      tiptapJson: textDocument(input.text),
    }
  )) as Id<"buildCollaborationPosts">;
}

async function addReply(
  fixture: Awaited<ReturnType<typeof seedResolutionFixture>>,
  actor: typeof fixture.builderStaff | typeof fixture.contractor,
  postId: Id<"buildCollaborationPosts">,
  text: string
) {
  return (await actor.mutation(
    (api as any).build_collaboration_threads.addBuildCollaborationComment,
    {
      buildId: fixture.buildId,
      organizationId: ORGANIZATION_ID,
      plainText: text,
      postId,
      references: [],
      tiptapJson: textDocument(text),
    }
  )) as Id<"buildCollaborationComments">;
}

async function postUpdatedAt(
  fixture: Awaited<ReturnType<typeof seedResolutionFixture>>,
  postId: Id<"buildCollaborationPosts">
) {
  return await fixture.base.run(async (ctx) => {
    const post = await ctx.db.get(postId);
    if (!post) {
      throw new Error("Post unavailable.");
    }
    return post.updatedAt;
  });
}

describe("Build collaboration thread resolution", () => {
  test("accepts only a visible Question reply and automatically reopens without changing linked work", async () => {
    const fixture = await seedResolutionFixture();
    const postId = await publishPost(fixture, fixture.contractor, {
      actionTitle: "Confirm revised site direction",
      postType: "question",
      text: "Can the revised site direction proceed?",
    });
    const answerId = await addReply(
      fixture,
      fixture.builderStaff,
      postId,
      "Yes, the revised direction is approved."
    );

    await expect(
      fixture.otherContractor.mutation(
        (api as any).build_collaboration_resolution
          .resolveBuildCollaborationThread,
        {
          acceptedCommentId: answerId,
          buildId: fixture.buildId,
          expectedUpdatedAt: await postUpdatedAt(fixture, postId),
          organizationId: ORGANIZATION_ID,
          postId,
        }
      )
    ).rejects.toThrow("Forbidden");

    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(answerId, { contentState: "moderated" });
    });
    await expect(
      fixture.contractor.mutation(
        (api as any).build_collaboration_resolution
          .resolveBuildCollaborationThread,
        {
          acceptedCommentId: answerId,
          buildId: fixture.buildId,
          expectedUpdatedAt: await postUpdatedAt(fixture, postId),
          organizationId: ORGANIZATION_ID,
          postId,
        }
      )
    ).rejects.toThrow("selected answer is unavailable");
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(answerId, { contentState: "active" });
    });

    await fixture.contractor.mutation(
      (api as any).build_collaboration_resolution
        .resolveBuildCollaborationThread,
      {
        acceptedCommentId: answerId,
        buildId: fixture.buildId,
        expectedUpdatedAt: await postUpdatedAt(fixture, postId),
        organizationId: ORGANIZATION_ID,
        postId,
      }
    );
    const resolved = await fixture.base.run(async (ctx) => {
      const post = await ctx.db.get(postId);
      const action = await ctx.db
        .query("buildActionItems")
        .withIndex("by_originatingPostId_and_status", (query) =>
          query.eq("originatingPostId", postId)
        )
        .first();
      return { action, post };
    });
    expect(resolved.post).toMatchObject({
      acceptedCommentId: answerId,
      resolutionSummary: "Yes, the revised direction is approved.",
      threadState: "resolved",
    });
    expect(resolved.action?.status).toBe("todo");

    await addReply(
      fixture,
      fixture.builderStaff,
      postId,
      "Additional permit context arrived."
    );
    const reopened = await fixture.base.run(async (ctx) => {
      const post = await ctx.db.get(postId);
      const action = await ctx.db
        .query("buildActionItems")
        .withIndex("by_originatingPostId_and_status", (query) =>
          query.eq("originatingPostId", postId)
        )
        .first();
      const events = await ctx.db
        .query("buildCollaborationThreadEvents")
        .withIndex("by_postId_and_createdAt", (query) =>
          query.eq("postId", postId)
        )
        .collect();
      return { action, events, post };
    });
    expect(reopened.post).toMatchObject({ threadState: "open" });
    expect(reopened.post?.acceptedCommentId).toBeUndefined();
    expect(reopened.action?.status).toBe("todo");
    expect(reopened.events.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["resolved", "reply_reopened"])
    );

    await fixture.contractor.mutation(
      (api as any).build_collaboration_resolution
        .resolveBuildCollaborationThread,
      {
        acceptedCommentId: answerId,
        buildId: fixture.buildId,
        expectedUpdatedAt: await postUpdatedAt(fixture, postId),
        organizationId: ORGANIZATION_ID,
        postId,
      }
    );
    await fixture.builderStaff.mutation(
      (api as any).build_collaboration_editing
        .tombstoneBuildCollaborationComment,
      {
        buildId: fixture.buildId,
        commentId: answerId,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
      }
    );
    const invalidatedAnswer = await fixture.base.run(async (ctx) => {
      const post = await ctx.db.get(postId);
      const events = await ctx.db
        .query("buildCollaborationThreadEvents")
        .withIndex("by_postId_and_createdAt", (query) =>
          query.eq("postId", postId)
        )
        .collect();
      return { events, post };
    });
    expect(invalidatedAnswer.post).toMatchObject({ threadState: "open" });
    expect(invalidatedAnswer.post?.acceptedCommentId).toBeUndefined();
    expect(
      invalidatedAnswer.events.map((event) => event.eventType)
    ).toContain("accepted_answer_unavailable");
  });

  test("requires Decision outcome and owner and preserves every resolved revision", async () => {
    const fixture = await seedResolutionFixture();
    const postId = await publishPost(fixture, fixture.contractor, {
      postType: "decision",
      text: "Choose the foundation waterproofing system.",
    });
    await expect(
      fixture.broker.mutation(
        (api as any).build_collaboration_resolution
          .resolveBuildCollaborationThread,
        {
          buildId: fixture.buildId,
          expectedUpdatedAt: await postUpdatedAt(fixture, postId),
          organizationId: ORGANIZATION_ID,
          postId,
        }
      )
    ).rejects.toThrow("requires a concise outcome");

    await fixture.broker.mutation(
      (api as any).build_collaboration_resolution
        .resolveBuildCollaborationThread,
      {
        buildId: fixture.buildId,
        decisionOutcome: "Use the two-coat membrane system.",
        decisionOwnerWorkosUserId: "user_contractor",
        expectedUpdatedAt: await postUpdatedAt(fixture, postId),
        organizationId: ORGANIZATION_ID,
        postId,
        resolutionSummary: "Selected after consultant review.",
      }
    );
    await expect(
      fixture.contractor.mutation(
        (api as any).build_collaboration_resolution
          .reopenBuildCollaborationThread,
        {
          buildId: fixture.buildId,
          expectedUpdatedAt: await postUpdatedAt(fixture, postId),
          organizationId: ORGANIZATION_ID,
          postId,
          reason: " ",
        }
      )
    ).rejects.toThrow("reopening reason is required");
    await fixture.contractor.mutation(
      (api as any).build_collaboration_resolution
        .reopenBuildCollaborationThread,
      {
        buildId: fixture.buildId,
        expectedUpdatedAt: await postUpdatedAt(fixture, postId),
        organizationId: ORGANIZATION_ID,
        postId,
        reason: "Consultant issued a revised specification.",
      }
    );
    await fixture.broker.mutation(
      (api as any).build_collaboration_resolution
        .resolveBuildCollaborationThread,
      {
        buildId: fixture.buildId,
        decisionOutcome: "Use the revised three-coat membrane system.",
        decisionOwnerWorkosUserId: "user_builder_staff",
        expectedUpdatedAt: await postUpdatedAt(fixture, postId),
        organizationId: ORGANIZATION_ID,
        postId,
      }
    );
    const context = await fixture.broker.query(
      (api as any).build_collaboration_resolution
        .getBuildCollaborationThreadContext,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId,
      }
    );
    expect(context.decisionRevisions).toMatchObject([
      {
        outcome: "Use the revised three-coat membrane system.",
        ownerDisplayNameSnapshot: "Builder Staff",
        revision: 2,
      },
      {
        outcome: "Use the two-coat membrane system.",
        ownerDisplayNameSnapshot: "Contractor Author",
        revision: 1,
      },
    ]);
  });

  test("requires linked work and a disposition for Issues without mutating the work", async () => {
    const fixture = await seedResolutionFixture();
    const unlinkedPostId = await publishPost(fixture, fixture.contractor, {
      postType: "issue",
      text: "Unlinked blocker",
    });
    await expect(
      fixture.contractor.mutation(
        (api as any).build_collaboration_resolution
          .resolveBuildCollaborationThread,
        {
          buildId: fixture.buildId,
          expectedUpdatedAt: await postUpdatedAt(fixture, unlinkedPostId),
          organizationId: ORGANIZATION_ID,
          postId: unlinkedPostId,
          resolutionSummary: "Closed",
        }
      )
    ).rejects.toThrow("requires a linked Build entity or Action Item");

    const linkedPostId = await publishPost(fixture, fixture.contractor, {
      actionTitle: "Resolve delivery conflict",
      postType: "issue",
      text: "Concrete delivery conflicts with inspection.",
    });
    await fixture.contractor.mutation(
      (api as any).build_collaboration_resolution
        .resolveBuildCollaborationThread,
      {
        buildId: fixture.buildId,
        expectedUpdatedAt: await postUpdatedAt(fixture, linkedPostId),
        organizationId: ORGANIZATION_ID,
        postId: linkedPostId,
        resolutionSummary: "Inspection moved before the delivery window.",
      }
    );
    const state = await fixture.base.run(async (ctx) => {
      const post = await ctx.db.get(linkedPostId);
      const action = await ctx.db
        .query("buildActionItems")
        .withIndex("by_originatingPostId_and_status", (query) =>
          query.eq("originatingPostId", linkedPostId)
        )
        .first();
      return { action, post };
    });
    expect(state.post).toMatchObject({
      resolutionSummary: "Inspection moved before the delivery window.",
      threadState: "resolved",
    });
    expect(state.action?.status).toBe("todo");
  });

  test("expires Announcement prominence while retaining history and emits audit/outbox records", async () => {
    const fixture = await seedResolutionFixture();
    await expect(
      publishPost(fixture, fixture.contractor, {
        postType: "announcement",
        text: "Contractor cannot announce",
      })
    ).rejects.toThrow("Announcements may only be published");
    const postId = await publishPost(fixture, fixture.broker, {
      postType: "announcement",
      text: "Site closed Friday for crane operations.",
    });
    await fixture.broker.mutation(
      (api as any).build_collaboration_resolution
        .setBuildCollaborationAnnouncementExpiration,
      {
        buildId: fixture.buildId,
        expectedUpdatedAt: await postUpdatedAt(fixture, postId),
        expiresAt: Date.now() - 1000,
        organizationId: ORGANIZATION_ID,
        postId,
      }
    );
    const feed = await fixture.contractor.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      }
    );
    expect(feed.page[0]).toMatchObject({
      kind: "post",
      post: {
        announcementProminent: false,
        postType: "announcement",
      },
      revision: {
        plainText: "Site closed Friday for crane operations.",
      },
    });
    const effects = await fixture.base.run(async (ctx) => {
      const audits = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query
            .eq("entityType", "buildCollaborationPost")
            .eq("entityId", postId)
        )
        .collect();
      const outbox = await ctx.db
        .query("eventOutbox")
        .withIndex("by_entity", (query) =>
          query
            .eq("relatedEntityType", "buildCollaborationPost")
            .eq("relatedEntityId", postId)
        )
        .collect();
      return { audits, outbox };
    });
    expect(effects.audits.map((event) => event.eventType)).toContain(
      "build.collaboration.thread.announcement_expiration_changed"
    );
    expect(effects.outbox.map((event) => event.eventType)).toContain(
      "build.collaboration.thread.announcement_expiration_changed"
    );
  });
});
