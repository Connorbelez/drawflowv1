/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
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

function participantMentionDocument(
  workosUserId: string,
  label = "UNTRUSTED LABEL"
) {
  return JSON.stringify({
    content: [
      {
        content: [
          { text: "Updated answer for ", type: "text" },
          {
            attrs: {
              id: workosUserId,
              kind: "participant",
              label,
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
  text: string,
  parentCommentId?: Id<"buildCollaborationComments">
) {
  return (await actor.mutation(
    (api as any).build_collaboration_threads.addBuildCollaborationComment,
    {
      buildId: fixture.buildId,
      organizationId: ORGANIZATION_ID,
      parentCommentId,
      plainText: text,
      postId,
      references: [],
      tiptapJson: textDocument(text),
    }
  )) as Id<"buildCollaborationComments">;
}

async function postThreadRevision(
  fixture: Awaited<ReturnType<typeof seedResolutionFixture>>,
  postId: Id<"buildCollaborationPosts">
) {
  return await fixture.base.run(async (ctx) => {
    const post = await ctx.db.get(postId);
    if (!post) {
      throw new Error("Post unavailable.");
    }
    return post.threadRevision ?? 0;
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
          expectedThreadRevision: await postThreadRevision(fixture, postId),
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
          expectedThreadRevision: await postThreadRevision(fixture, postId),
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
        expectedThreadRevision: await postThreadRevision(fixture, postId),
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
      threadState: "resolved",
    });
    expect(resolved.post?.resolutionSummary).toBeUndefined();
    expect(resolved.action?.status).toBe("todo");

    await fixture.builderStaff.mutation(
      (api as any).build_collaboration_editing.editBuildCollaborationComment,
      {
        buildId: fixture.buildId,
        commentId: answerId,
        editReason: "Add accountable recipient",
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        references: [
          {
            entityId: "user_other_contractor",
            entityKind: "participant",
            primary: false,
          },
        ],
        tiptapJson: participantMentionDocument("user_other_contractor"),
      }
    );
    const updatedAnswerContext = await fixture.contractor.query(
      (api as any).build_collaboration_resolution
        .getBuildCollaborationThreadContext,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId,
      }
    );
    expect(updatedAnswerContext.resolutionSummary).toBe(
      "Updated answer for Other Contractor"
    );
    await fixture.base.run(async (ctx) => {
      const participant = await ctx.db
        .query("buildParticipants")
        .withIndex("by_buildId_and_workosUserId", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq("workosUserId", "user_other_contractor")
        )
        .unique();
      if (!participant) {
        throw new Error("Referenced participant unavailable.");
      }
      await ctx.db.patch(participant._id, {
        removedAt: Date.now(),
        status: "removed",
        validUntil: Date.now(),
      });
    });
    const narrowedAnswerContext = await fixture.contractor.query(
      (api as any).build_collaboration_resolution
        .getBuildCollaborationThreadContext,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId,
      }
    );
    expect(narrowedAnswerContext.resolutionSummary).toBe(
      "Updated answer for [Referenced item unavailable]"
    );
    expect(narrowedAnswerContext.resolutionSummary).not.toContain(
      "Other Contractor"
    );
    const narrowedFeed = await fixture.contractor.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      }
    );
    expect(narrowedFeed.page[0]?.post?.resolutionSummary).toBe(
      "Updated answer for [Referenced item unavailable]"
    );

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
        expectedThreadRevision: await postThreadRevision(fixture, postId),
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
          expectedRevision: 2,
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
          expectedThreadRevision: await postThreadRevision(fixture, postId),
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
        expectedThreadRevision: await postThreadRevision(fixture, postId),
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
          expectedThreadRevision: await postThreadRevision(fixture, postId),
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
        expectedThreadRevision: await postThreadRevision(fixture, postId),
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
        expectedThreadRevision: await postThreadRevision(fixture, postId),
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
    await fixture.base.run(async (ctx) => {
      const post = await ctx.db.get(postId);
      const build = await ctx.db.get(fixture.buildId);
      if (!(post && build)) {
        throw new Error("Decision fixture unavailable.");
      }
      const otherBrokerageId = await ctx.db.insert("brokerages", {
        createdAt: Date.now(),
        displayName: "Other Brokerage",
        legalName: "Other Brokerage Inc.",
        status: "active",
        updatedAt: Date.now(),
        workosOrganizationId: "org_other_brokerage",
      });
      const { _creationTime, _id, ...buildFields } = build;
      const otherBuildId = await ctx.db.insert("activeBuilds", {
        ...buildFields,
        brokerageId: otherBrokerageId,
        buildName: "Other Build",
        organizationId: "org_other_tenant",
      });
      await ctx.db.insert("buildCollaborationDecisionOutcomeRevisions", {
        brokerageId: otherBrokerageId,
        buildId: otherBuildId,
        changedByRole: "admin",
        changedByWorkosUserId: "forged_actor",
        createdAt: Date.now(),
        organizationId: "org_other_tenant",
        outcome: "Forged outcome",
        ownerDisplayNameSnapshot: "Forged owner",
        ownerWorkosUserId: "forged_owner",
        postId,
        revision: 999,
      });
    });
    await expect(
      fixture.broker.query(
        (api as any).build_collaboration_resolution
          .getBuildCollaborationThreadContext,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId,
        }
      )
    ).rejects.toThrow("Decision history integrity check failed");
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
          expectedThreadRevision: await postThreadRevision(
            fixture,
            unlinkedPostId
          ),
          organizationId: ORGANIZATION_ID,
          postId: unlinkedPostId,
          resolutionSummary: "Closed",
        }
      )
    ).rejects.toThrow("requires a linked Build entity or Action Item");

    const participantReferenceId = await fixture.base.run(async (ctx) => {
      const post = await ctx.db.get(unlinkedPostId);
      if (!post?.currentRevisionId) {
        throw new Error("Issue revision unavailable.");
      }
      return await ctx.db.insert("buildCollaborationReferences", {
        brokerageId: post.brokerageId,
        buildId: post.buildId,
        createdAt: Date.now(),
        entityId: "user_other_contractor",
        entityKind: "participant",
        labelSnapshot: "Other Contractor",
        organizationId: post.organizationId,
        ownerKind: "postRevision",
        ownerRecordId: post.currentRevisionId,
        postId: post._id,
        primary: false,
      });
    });
    await expect(
      fixture.contractor.mutation(
        (api as any).build_collaboration_resolution
          .resolveBuildCollaborationThread,
        {
          buildId: fixture.buildId,
          expectedThreadRevision: await postThreadRevision(
            fixture,
            unlinkedPostId
          ),
          organizationId: ORGANIZATION_ID,
          postId: unlinkedPostId,
          resolutionSummary: "Mentioned a participant",
        }
      )
    ).rejects.toThrow("requires a linked Build entity or Action Item");

    const staleReferenceId = await fixture.base.run(async (ctx) => {
      await ctx.db.delete(participantReferenceId);
      const post = await ctx.db.get(unlinkedPostId);
      if (!post?.currentRevisionId) {
        throw new Error("Issue revision unavailable.");
      }
      return await ctx.db.insert("buildCollaborationReferences", {
        brokerageId: post.brokerageId,
        buildId: post.buildId,
        createdAt: Date.now(),
        entityId: "missing-document",
        entityKind: "document",
        labelSnapshot: "Stale document",
        organizationId: post.organizationId,
        ownerKind: "postRevision",
        ownerRecordId: post.currentRevisionId,
        postId: post._id,
        primary: false,
      });
    });
    await expect(
      fixture.contractor.mutation(
        (api as any).build_collaboration_resolution
          .resolveBuildCollaborationThread,
        {
          buildId: fixture.buildId,
          expectedThreadRevision: await postThreadRevision(
            fixture,
            unlinkedPostId
          ),
          organizationId: ORGANIZATION_ID,
          postId: unlinkedPostId,
          resolutionSummary: "Stale link",
        }
      )
    ).rejects.toThrow("requires a linked Build entity or Action Item");

    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(staleReferenceId, {
        entityId: "user_builder_staff",
        entityKind: "participant",
        organizationId: "org_other_tenant",
      });
    });
    await expect(
      fixture.contractor.mutation(
        (api as any).build_collaboration_resolution
          .resolveBuildCollaborationThread,
        {
          buildId: fixture.buildId,
          expectedThreadRevision: await postThreadRevision(
            fixture,
            unlinkedPostId
          ),
          organizationId: ORGANIZATION_ID,
          postId: unlinkedPostId,
          resolutionSummary: "Cross-scope link",
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
        expectedThreadRevision: await postThreadRevision(fixture, linkedPostId),
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
    await publishPost(fixture, fixture.contractor, {
      postType: "update",
      text: "A newer routine progress update.",
    });
    const promotedFeed = await fixture.contractor.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      }
    );
    expect(promotedFeed.page[0]?.post?._id).toBe(postId);
    await fixture.broker.mutation(
      (api as any).build_collaboration_resolution
        .setBuildCollaborationAnnouncementExpiration,
      {
        buildId: fixture.buildId,
        expectedThreadRevision: await postThreadRevision(fixture, postId),
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
    const expiredAnnouncement = feed.page.find(
      (entry: any) => entry.kind === "post" && entry.post._id === postId
    );
    expect(expiredAnnouncement).toMatchObject({
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

  test("rejects stale thread commands even when the wall clock does not advance", async () => {
    const fixture = await seedResolutionFixture();
    const postId = await publishPost(fixture, fixture.broker, {
      postType: "announcement",
      text: "Crane operations notice.",
    });
    const staleRevision = await postThreadRevision(fixture, postId);
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      await fixture.broker.mutation(
        (api as any).build_collaboration_resolution
          .setBuildCollaborationAnnouncementExpiration,
        {
          buildId: fixture.buildId,
          expectedThreadRevision: staleRevision,
          expiresAt: now - 1,
          organizationId: ORGANIZATION_ID,
          postId,
        }
      );
      await expect(
        fixture.broker.mutation(
          (api as any).build_collaboration_resolution
            .setBuildCollaborationAnnouncementExpiration,
          {
            buildId: fixture.buildId,
            expectedThreadRevision: staleRevision,
            expiresAt: now + 60_000,
            organizationId: ORGANIZATION_ID,
            postId,
          }
        )
      ).rejects.toThrow("changed while you were working");
    } finally {
      clock.mockRestore();
    }
  });

  test("normalizes legacy prominence rows and reschedules future expirations", async () => {
    const fixture = await seedResolutionFixture();
    const updateId = await publishPost(fixture, fixture.contractor, {
      postType: "update",
      text: "Legacy update",
    });
    const announcementId = await publishPost(fixture, fixture.broker, {
      postType: "announcement",
      text: "Legacy announcement",
    });
    const futureExpiration = Date.now() + 60_000;
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(updateId, {
        announcementProminent: undefined,
        threadRevision: undefined,
      });
      await ctx.db.patch(announcementId, {
        announcementExpiresAt: futureExpiration,
        announcementProminent: undefined,
        threadRevision: undefined,
      });
    });

    const result = await fixture.base.mutation(
      (internal as any).build_collaboration_resolution_migration
        .migrateBuildCollaborationThreadOutcomeState,
      { cursor: null }
    );
    const rows = await fixture.base.run(async (ctx) => ({
      announcement: await ctx.db.get(announcementId),
      update: await ctx.db.get(updateId),
    }));
    expect(result).toMatchObject({
      isDone: true,
      rescheduledCount: 1,
      scannedCount: 2,
    });
    expect(rows.update).toMatchObject({
      announcementProminent: false,
      threadRevision: 0,
    });
    expect(rows.announcement).toMatchObject({
      announcementProminent: true,
      threadRevision: 0,
    });
  });

  test("hydrates deep focused discussions and governs reply reactions, pins, and revocation", async () => {
    const fixture = await seedResolutionFixture();
    const postId = await publishPost(fixture, fixture.contractor, {
      postType: "update",
      text: "Coordinate the deep inspection thread.",
    });
    const comments: Id<"buildCollaborationComments">[] = [];
    let parentCommentId: Id<"buildCollaborationComments"> | undefined;
    for (let depth = 0; depth < 6; depth += 1) {
      const commentId = await addReply(
        fixture,
        depth % 2 === 0 ? fixture.builderStaff : fixture.contractor,
        postId,
        `Reply depth ${depth}`,
        parentCommentId
      );
      comments.push(commentId);
      parentCommentId = commentId;
    }
    const activityBeforeInteractions = await fixture.base.run(
      async (ctx) => (await ctx.db.get(postId))?.lastMeaningfulActivityAt
    );

    await fixture.contractor.mutation(
      (api as any).build_collaboration_threads
        .reactToBuildCollaborationComment,
      {
        buildId: fixture.buildId,
        commentId: comments[0],
        organizationId: ORGANIZATION_ID,
        reaction: "acknowledged",
      }
    );
    await expect(
      fixture.contractor.mutation(
        (api as any).build_collaboration_threads
          .toggleBuildCollaborationPin,
        {
          buildId: fixture.buildId,
          commentId: comments[0],
          kind: "reply",
          organizationId: ORGANIZATION_ID,
          postId,
        }
      )
    ).rejects.toThrow("reply author or Build coordination team");
    await fixture.base.run(async (ctx) => {
      const post = await ctx.db.get(postId);
      if (!post) {
        throw new Error("Expected collaboration post");
      }
      for (let index = 0; index < 21; index += 1) {
        await ctx.db.insert("buildCollaborationPins", {
          brokerageId: post.brokerageId,
          buildId: fixture.buildId,
          commentId: comments[0],
          createdAt: Date.now() + index,
          kind: "reply",
          organizationId: ORGANIZATION_ID,
          postId,
          workosUserId: "user_builder_staff",
        });
      }
    });
    const pinMigration = await fixture.base.mutation(
      (internal as any).build_collaboration_pin_migration
        .normalizeBuildCollaborationPins,
      { cursor: null }
    );
    const normalizedPins = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("buildCollaborationPins")
        .withIndex(
          "by_postId_and_commentId_and_workosUserId_and_kind",
          (query) =>
            query
              .eq("postId", postId)
              .eq("commentId", comments[0])
              .eq("workosUserId", "user_builder_staff")
              .eq("kind", "reply")
        )
        .collect()
    );
    expect(pinMigration).toMatchObject({
      deletedCount: 20,
      isDone: true,
      scannedCount: 21,
    });
    expect(normalizedPins).toHaveLength(1);
    await fixture.builderStaff.mutation(
      (api as any).build_collaboration_threads.toggleBuildCollaborationPin,
      {
        buildId: fixture.buildId,
        commentId: comments[0],
        kind: "reply",
        organizationId: ORGANIZATION_ID,
        postId,
      }
    );
    await fixture.builderStaff.mutation(
      (api as any).build_collaboration_threads.toggleBuildCollaborationPin,
      {
        buildId: fixture.buildId,
        commentId: comments[0],
        kind: "reply",
        organizationId: ORGANIZATION_ID,
        postId,
      }
    );
    await fixture.broker.mutation(
      (api as any).build_collaboration_threads.toggleBuildCollaborationPin,
      {
        buildId: fixture.buildId,
        commentId: comments[0],
        kind: "reply",
        organizationId: ORGANIZATION_ID,
        postId,
      }
    );

    const list = await fixture.broker.query(
      (api as any).build_collaboration_threads
        .listBuildCollaborationComments,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId,
      }
    );
    expect(list.map((row: any) => row.comment.logicalDepth)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(list[0]).toMatchObject({
      comment: {
        pinCount: 2,
        viewerCanPin: true,
        viewerPinned: true,
      },
      reactions: [
        {
          reaction: "acknowledged",
          workosUserId: "user_contractor",
        },
      ],
    });
    expect(list[4].comment).toMatchObject({
      parentAuthorDisplayNameSnapshot: "Contractor Author",
      parentCommentId: comments[3],
    });
    const activityAfterInteractions = await fixture.base.run(
      async (ctx) => (await ctx.db.get(postId))?.lastMeaningfulActivityAt
    );
    expect(activityAfterInteractions).toBe(activityBeforeInteractions);

    await fixture.builderStaff.mutation(
      (api as any).build_collaboration_editing.editBuildCollaborationComment,
      {
        buildId: fixture.buildId,
        commentId: comments[4],
        editReason: "Clarify without moving the reply",
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        references: [],
        tiptapJson: textDocument("Clarified depth four reply"),
      }
    );
    await fixture.contractor.mutation(
      (api as any).build_collaboration_editing
        .tombstoneBuildCollaborationComment,
      {
        buildId: fixture.buildId,
        commentId: comments[1],
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
      }
    );
    for (let batch = 0; batch < 10; batch += 1) {
      await fixture.base.run(async (ctx) => {
        const focus = await ctx.db.get(comments[4]);
        if (!focus) {
          throw new Error("Expected focused collaboration comment");
        }
        for (let offset = 0; offset < 100; offset += 1) {
          const sequence = batch * 100 + offset;
          await ctx.db.insert("buildCollaborationComments", {
            authorDisplayNameSnapshot: "Historical commenter",
            authorRole: "builder-staff",
            authorWorkosUserId: "user_builder_staff",
            brokerageId: focus.brokerageId,
            buildId: focus.buildId,
            contentState: "active",
            createdAt: focus.createdAt - 10_000 + sequence,
            logicalDepth: 0,
            organizationId: focus.organizationId,
            postId: focus.postId,
            revision: 1,
            updatedAt: focus.updatedAt,
          });
        }
      });
    }
    const focused = await fixture.broker.query(
      (api as any).build_collaboration_threads
        .getFocusedBuildCollaborationCommentContext,
      {
        buildId: fixture.buildId,
        commentId: comments[4],
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(focused).toMatchObject({
      focusCommentId: comments[4],
      postId,
      state: "visible",
    });
    expect(focused.rows.map((row: any) => row.comment._id)).toEqual(comments);
    expect(focused.rows[4].comment.parentCommentId).toBe(comments[3]);
    expect(focused.rows[1]).toMatchObject({
      comment: { contentState: "tombstoned" },
      revision: { plainText: "This reply was removed by its author." },
    });

    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(postId, {
        audienceFloorTier: 3,
        audienceMode: "custom",
      });
      const audienceMember = await ctx.db
        .query("buildCollaborationAudienceMembers")
        .withIndex("by_postId_and_workosUserId", (query) =>
          query
            .eq("postId", postId)
            .eq("workosUserId", "user_contractor")
        )
        .unique();
      if (audienceMember) {
        await ctx.db.delete(audienceMember._id);
      }
    });
    const revoked = await fixture.contractor.query(
      (api as any).build_collaboration_threads
        .getFocusedBuildCollaborationCommentContext,
      {
        buildId: fixture.buildId,
        commentId: comments[4],
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(revoked).toEqual({ state: "revoked" });
  });
});
