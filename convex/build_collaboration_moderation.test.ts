/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  type BuildCollaborationRole,
  buildCollaborationRoles,
} from "./build_collaboration_model";
import { collaborationModerationCapabilities } from "./build_collaboration_moderation";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_collaboration_moderation";

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

async function seedModerationFixture() {
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
      buildName: "Moderation fixture",
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
      buildName: "Moderation fixture",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      location: "147 Cedar Ridge Road",
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
        displayName: "Principal Reviewer",
        role: "principle-broker",
        workosUserId: "user_principle_broker",
      },
      {
        displayName: "Broker Reviewer",
        role: "broker",
        workosUserId: "user_broker",
      },
      {
        displayName: "Builder Peer",
        role: "builder",
        workosUserId: "user_builder",
      },
      {
        displayName: "Builder Staff Reviewer",
        role: "builder-staff",
        workosUserId: "user_builder_staff",
      },
      {
        displayName: "Homeowner Moderator",
        role: "homeowner",
        workosUserId: "user_homeowner",
      },
      {
        displayName: "Contractor Author",
        role: "contractor",
        workosUserId: "user_contractor",
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
    adminPeer: withIdentity(base, "admin", "user_admin_peer"),
    base,
    broker: withIdentity(base, "broker"),
    buildId,
    builder: withIdentity(base, "builder"),
    builderStaff: withIdentity(base, "builder-staff"),
    contractor: withIdentity(base, "contractor"),
    homeowner: withIdentity(base, "homeowner"),
    principal: withIdentity(base, "principle-broker"),
  };
}

async function publishContractorPost(
  fixture: Awaited<ReturnType<typeof seedModerationFixture>>,
  text = "Contractor update"
) {
  return (await fixture.contractor.mutation(
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
  )) as Id<"buildCollaborationPosts">;
}

async function publishPostAs(
  fixture: Awaited<ReturnType<typeof seedModerationFixture>>,
  author:
    | typeof fixture.admin
    | typeof fixture.adminPeer
    | typeof fixture.broker
    | typeof fixture.builder
    | typeof fixture.builderStaff
    | typeof fixture.contractor
    | typeof fixture.homeowner
    | typeof fixture.principal,
  text: string,
  audienceMode: "build_wide" | "custom" = "build_wide",
  requestedReaderIds: string[] = []
) {
  return (await author.mutation(
    (api as any).build_collaboration
      .approveAndPublishBuildCollaborationBundle,
    {
      actionItems: [],
      audienceMode,
      buildId: fixture.buildId,
      organizationId: ORGANIZATION_ID,
      plainText: text,
      postType: "update",
      references: [],
      requestedReaderIds,
      tiptapJson: textDocument(text),
    }
  )) as Id<"buildCollaborationPosts">;
}

describe("Build collaboration moderation hierarchy", () => {
  test("matches every approved role edge and never treats author removal as moderation", () => {
    for (const viewerRole of buildCollaborationRoles) {
      for (const authorRole of buildCollaborationRoles) {
        const capabilities = collaborationModerationCapabilities({
          authorRole,
          authorWorkosUserId: `author_${authorRole}`,
          contentState: "active",
          viewerRole,
          viewerWorkosUserId: `viewer_${viewerRole}`,
        });
        expect(capabilities.canModerate).toBe(
          expectedModerationAuthority(viewerRole, authorRole)
        );
      }
      expect(
        collaborationModerationCapabilities({
          authorRole: viewerRole,
          authorWorkosUserId: "same_user",
          contentState: "active",
          viewerRole,
          viewerWorkosUserId: "same_user",
        }).canModerate
      ).toBe(false);
    }
  });

  test("enforces every adjacent hierarchy edge through direct mutations", async () => {
    const fixture = await seedModerationFixture();
    const builderStaffPost = await publishPostAs(
      fixture,
      fixture.builderStaff,
      "Builder staff content"
    );
    const brokerPost = await publishPostAs(
      fixture,
      fixture.broker,
      "Broker content"
    );
    const principalPost = await publishPostAs(
      fixture,
      fixture.principal,
      "Principal content"
    );
    const adminPost = await publishPostAs(
      fixture,
      fixture.adminPeer,
      "Admin content"
    );

    await fixture.broker.mutation(
      (api as any).build_collaboration_moderation
        .moderateBuildCollaborationContent,
      {
        buildId: fixture.buildId,
        entityId: builderStaffPost,
        entityKind: "post",
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        reason: "Tier three review",
      }
    );
    await fixture.principal.mutation(
      (api as any).build_collaboration_moderation
        .moderateBuildCollaborationContent,
      {
        buildId: fixture.buildId,
        entityId: brokerPost,
        entityKind: "post",
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        reason: "Principal review",
      }
    );
    const finalCaseId = await fixture.admin.mutation(
      (api as any).build_collaboration_moderation
        .moderateBuildCollaborationContent,
      {
        buildId: fixture.buildId,
        entityId: principalPost,
        entityKind: "post",
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        reason: "Administrative review",
      }
    );
    await expect(
      fixture.principal.mutation(
        (api as any).build_collaboration_moderation
          .appealBuildCollaborationModeration,
        {
          buildId: fixture.buildId,
          caseId: finalCaseId,
          organizationId: ORGANIZATION_ID,
          reason: "No tier exists above admin",
        }
      )
    ).rejects.toThrow("Forbidden");
    await expect(
      fixture.builder.mutation(
        (api as any).build_collaboration_moderation
          .moderateBuildCollaborationContent,
        {
          buildId: fixture.buildId,
          entityId: brokerPost,
          entityKind: "post",
          expectedRevision: 1,
          organizationId: ORGANIZATION_ID,
          reason: "Same-tier attempt",
        }
      )
    ).rejects.toThrow("Forbidden");
    await fixture.admin.mutation(
      (api as any).build_collaboration_moderation
        .moderateBuildCollaborationContent,
      {
        buildId: fixture.buildId,
        entityId: adminPost,
        entityKind: "post",
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        reason: "Administrative peer review",
      }
    );
    await expect(
      fixture.contractor.mutation(
        (api as any).build_collaboration_moderation
          .moderateBuildCollaborationContent,
        {
          buildId: fixture.buildId,
          entityId: adminPost,
          entityKind: "post",
          expectedRevision: 1,
          organizationId: ORGANIZATION_ID,
          reason: "Lower-tier attempt",
        }
      )
    ).rejects.toThrow("Forbidden");
  });

  test("does not widen a custom audience or reveal its metadata to a direct caller", async () => {
    const fixture = await seedModerationFixture();
    const postId = await publishPostAs(
      fixture,
      fixture.broker,
      "Restricted broker evidence",
      "custom",
      ["user_broker"]
    );
    await expect(
      fixture.contractor.mutation(
        (api as any).build_collaboration_moderation
          .moderateBuildCollaborationContent,
        {
          buildId: fixture.buildId,
          entityId: postId,
          entityKind: "post",
          expectedRevision: 1,
          organizationId: ORGANIZATION_ID,
          reason: "Unauthorized direct attempt",
        }
      )
    ).rejects.toThrow("Forbidden: collaboration moderation target");
    const feed = await fixture.contractor.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      }
    );
    expect(feed.page).toEqual([
      expect.objectContaining({ kind: "restricted" }),
    ]);
    expect(JSON.stringify(feed)).not.toContain("Restricted broker evidence");
  });

  test("fails closed for foreign-tenant and foreign-entity active case pointers", async () => {
    const fixture = await seedModerationFixture();
    const targetPostId = await publishContractorPost(
      fixture,
      "Pointer validation target"
    );
    const otherPostId = await publishContractorPost(
      fixture,
      "Different moderation target"
    );
    const { crossEntityCaseId, crossTenantCaseId } = await fixture.base.run(
      async (ctx) => {
        const targetPost = await ctx.db.get(targetPostId);
        const otherPost = await ctx.db.get(otherPostId);
        if (!(targetPost && otherPost)) {
          throw new Error("Pointer validation posts unavailable.");
        }
        const now = Date.now();
        const caseFields = {
          appealReviewerMinimumTier: 3,
          brokerageId: targetPost.brokerageId,
          buildId: targetPost.buildId,
          commentId: undefined,
          contentAuthorRole: "contractor" as const,
          contentAuthorWorkosUserId: "user_contractor",
          createdAt: now,
          currentReason: "sensitive foreign case reason",
          entityKind: "post" as const,
          evidenceSnapshotJson: JSON.stringify({
            attachmentIds: [],
            receiptSnapshots: [],
            referenceIds: [],
          }),
          moderatorRole: "builder-staff" as const,
          moderatorTier: 2,
          moderatorWorkosUserId: "user_builder_staff",
          postId: targetPostId,
          status: "moderated" as const,
          updatedAt: now,
        };
        const crossTenantCaseId = await ctx.db.insert(
          "buildCollaborationModerationCases",
          {
            ...caseFields,
            entityId: targetPostId,
            organizationId: "org_foreign_tenant",
          }
        );
        const crossEntityCaseId = await ctx.db.insert(
          "buildCollaborationModerationCases",
          {
            ...caseFields,
            currentReason: "sensitive cross-entity reason",
            entityId: otherPostId,
            organizationId: ORGANIZATION_ID,
            postId: otherPostId,
          }
        );
        await ctx.db.insert("buildCollaborationModerationEvents", {
          actorRole: "builder-staff",
          actorWorkosUserId: "user_builder_staff",
          brokerageId: targetPost.brokerageId,
          buildId: targetPost.buildId,
          caseId: crossTenantCaseId,
          createdAt: now,
          eventType: "moderated",
          newState: "{}",
          organizationId: "org_foreign_tenant",
          priorState: "{}",
          reason: "sensitive foreign event reason",
        });
        return { crossEntityCaseId, crossTenantCaseId };
      }
    );

    for (const forgedCase of [
      {
        caseId: crossTenantCaseId,
        forbiddenText: "sensitive foreign case reason",
      },
      {
        caseId: crossEntityCaseId,
        forbiddenText: "sensitive cross-entity reason",
      },
    ]) {
      await fixture.base.run(async (ctx) => {
        await ctx.db.patch(targetPostId, {
          activeModerationCaseId: forgedCase.caseId,
        });
      });
      const context = await fixture.contractor.query(
        (api as any).build_collaboration_moderation
          .getBuildCollaborationModerationContext,
        {
          buildId: fixture.buildId,
          entityId: targetPostId,
          entityKind: "post",
          organizationId: ORGANIZATION_ID,
        }
      );
      expect(context).toMatchObject({
        events: [],
      });
      expect(context.caseId).toBeUndefined();
      expect(context.currentReason).toBeUndefined();
      expect(context.evidence).toBeUndefined();
      expect(context.status).toBeUndefined();
      expect(JSON.stringify(context)).not.toContain(forgedCase.forbiddenText);
    }
  });

  test("preserves evidence, redacts content, escalates appeals, and audits every transition", async () => {
    const fixture = await seedModerationFixture();
    const postId = await publishContractorPost(fixture);
    await fixture.broker.mutation(
      (api as any).build_collaboration_threads
        .markBuildCollaborationPostViewed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId,
      }
    );
    const builderStaffReceiptId = (await fixture.builderStaff.mutation(
      (api as any).build_collaboration_threads
        .markBuildCollaborationPostViewed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId,
      }
    )) as Id<"buildCollaborationReceipts">;
    const frozenBuilderStaffReceipt = await fixture.base.run(async (ctx) => {
      const receipt = await ctx.db.get(builderStaffReceiptId);
      if (!receipt) {
        throw new Error("Builder Staff receipt unavailable.");
      }
      return receipt;
    });
    const evidence = await fixture.base.run(async (ctx) => {
      const post = await ctx.db.get(postId);
      if (!post?.currentRevisionId) {
        throw new Error("Post revision unavailable.");
      }
      const build = await ctx.db.get(post.buildId);
      if (!build) {
        throw new Error("Build unavailable.");
      }
      const referenceId = await ctx.db.insert("buildCollaborationReferences", {
        brokerageId: post.brokerageId,
        buildId: post.buildId,
        createdAt: Date.now(),
        entityId: "user_homeowner",
        entityKind: "participant",
        labelSnapshot: "Homeowner Moderator",
        organizationId: post.organizationId,
        ownerKind: "postRevision",
        ownerRecordId: post.currentRevisionId,
        postId,
        primary: true,
      });
      const documentId = await ctx.db.insert("buildDocuments", {
        brokerageId: post.brokerageId,
        buildId: post.buildId,
        contractorVisible: true,
        createdAt: Date.now(),
        documentType: "supporting",
        fileName: "Site safety direction.pdf",
        mimeType: "application/pdf",
        organizationId: post.organizationId,
        proposalId: build.proposalId,
        sizeBytes: 4200,
        status: "uploaded",
        updatedAt: Date.now(),
        uploadedByWorkosUserId: "user_contractor",
      });
      const attachmentId = await ctx.db.insert(
        "buildCollaborationAttachments",
        {
          attachmentId: documentId,
          attachmentKind: "document",
          brokerageId: post.brokerageId,
          buildId: post.buildId,
          createdAt: Date.now(),
          createdByWorkosUserId: "user_contractor",
          organizationId: post.organizationId,
          ownerKind: "postRevision",
          ownerRecordId: post.currentRevisionId,
        }
      );
      return {
        attachmentId,
        currentRevisionId: post.currentRevisionId,
        referenceId,
      };
    });

    await expect(
      fixture.contractor.mutation(
        (api as any).build_collaboration_moderation
          .moderateBuildCollaborationContent,
        {
          buildId: fixture.buildId,
          entityId: postId,
          entityKind: "post",
          expectedRevision: 1,
          organizationId: ORGANIZATION_ID,
          reason: "Self moderation",
        }
      )
    ).rejects.toThrow("Forbidden");
    await expect(
      fixture.builderStaff.mutation(
        (api as any).build_collaboration_moderation
          .moderateBuildCollaborationContent,
        {
          buildId: fixture.buildId,
          entityId: postId,
          entityKind: "post",
          expectedRevision: 1,
          organizationId: ORGANIZATION_ID,
          reason: " ",
        }
      )
    ).rejects.toThrow("reason is required");

    await expect(
      fixture.homeowner.mutation(
        (api as any).build_collaboration_moderation
          .moderateBuildCollaborationContent,
        {
          buildId: fixture.buildId,
          entityId: postId,
          entityKind: "post",
          expectedRevision: 1,
          organizationId: ORGANIZATION_ID,
          reason: "Homeowners cannot moderate",
        }
      )
    ).rejects.toThrow("Forbidden");
    const caseId = (await fixture.builderStaff.mutation(
      (api as any).build_collaboration_moderation
        .moderateBuildCollaborationContent,
      {
        buildId: fixture.buildId,
        entityId: postId,
        entityKind: "post",
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        reason: "Unsafe project instruction",
      }
    )) as Id<"buildCollaborationModerationCases">;
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(builderStaffReceiptId, {
        lastViewedAt: frozenBuilderStaffReceipt.lastViewedAt + 60_000,
        viewerRole: "admin",
      });
    });

    const moderatedFeed = await fixture.contractor.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      }
    );
    expect(moderatedFeed.page[0]).toMatchObject({
      actionItems: [],
      kind: "post",
      post: {
        contentState: "moderated",
        viewerCanAppeal: true,
      },
      reactions: [],
      receipts: [],
      references: [],
      revision: {
        plainText:
          "This post is unavailable while it is under moderation.",
      },
    });
    expect(JSON.stringify(moderatedFeed.page[0])).not.toContain(
      "Contractor update"
    );

    const authorNotification = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient", (query) =>
          query
            .eq("organizationId", ORGANIZATION_ID)
            .eq("recipientWorkosUserId", "user_contractor")
        )
        .collect()
    );
    expect(authorNotification).toHaveLength(1);
    expect(authorNotification[0].body).toContain(
      "Unsafe project instruction"
    );
    expect(authorNotification[0].body).not.toContain("Contractor update");

    await fixture.contractor.mutation(
      (api as any).build_collaboration_moderation
        .appealBuildCollaborationModeration,
      {
        buildId: fixture.buildId,
        caseId,
        organizationId: ORGANIZATION_ID,
        reason: "This is required site-safety context",
      }
    );
    const reviewerContext = await fixture.broker.query(
      (api as any).build_collaboration_moderation
        .getBuildCollaborationModerationContext,
      {
        buildId: fixture.buildId,
        entityId: postId,
        entityKind: "post",
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(reviewerContext).toMatchObject({
      canResolveAppeal: true,
      evidence: {
        attachments: [
          expect.objectContaining({
            attachmentKind: "document",
            label: "Site safety direction.pdf",
          }),
        ],
        plainText: "Contractor update",
        receipts: [
          expect.objectContaining({
            displayNameSnapshot: "Builder Staff Reviewer",
            firstViewedAt: frozenBuilderStaffReceipt.firstViewedAt,
            lastViewedAt: frozenBuilderStaffReceipt.lastViewedAt,
            viewerRole: "builder-staff",
            workosUserId: "user_builder_staff",
          }),
        ],
        references: [
          expect.objectContaining({
            entityKind: "participant",
            label: "Homeowner Moderator",
          }),
        ],
      },
    });
    await expect(
      fixture.builderStaff.mutation(
        (api as any).build_collaboration_moderation
          .resolveBuildCollaborationModerationAppeal,
        {
          buildId: fixture.buildId,
          caseId,
          organizationId: ORGANIZATION_ID,
          outcome: "restore",
          reason: "Attempt below reviewer floor",
        }
      )
    ).rejects.toThrow("Forbidden");
    await fixture.broker.mutation(
      (api as any).build_collaboration_moderation
        .resolveBuildCollaborationModerationAppeal,
      {
        buildId: fixture.buildId,
        caseId,
        organizationId: ORGANIZATION_ID,
        outcome: "retain",
        reason: "Escalate for principal review",
      }
    );
    await fixture.contractor.mutation(
      (api as any).build_collaboration_moderation
        .appealBuildCollaborationModeration,
      {
        buildId: fixture.buildId,
        caseId,
        organizationId: ORGANIZATION_ID,
        reason: "Requesting principal review",
      }
    );
    await expect(
      fixture.broker.mutation(
        (api as any).build_collaboration_moderation
          .resolveBuildCollaborationModerationAppeal,
        {
          buildId: fixture.buildId,
          caseId,
          organizationId: ORGANIZATION_ID,
          outcome: "restore",
          reason: "Broker cannot resolve tier-four appeal",
        }
      )
    ).rejects.toThrow("Forbidden");
    await fixture.principal.mutation(
      (api as any).build_collaboration_moderation
        .resolveBuildCollaborationModerationAppeal,
      {
        buildId: fixture.buildId,
        caseId,
        organizationId: ORGANIZATION_ID,
        outcome: "restore",
        reason: "Context is legitimate and safe",
      }
    );

    const state = await fixture.base.run(async (ctx) => {
      const post = await ctx.db.get(postId);
      const moderationCase = await ctx.db.get(caseId);
      const events = await ctx.db
        .query("buildCollaborationModerationEvents")
        .withIndex("by_caseId_and_createdAt", (query) =>
          query.eq("caseId", caseId)
        )
        .collect();
      const audits = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query
            .eq("entityType", "buildCollaborationPost")
            .eq("entityId", postId)
        )
        .collect();
      return {
        attachment: await ctx.db.get(evidence.attachmentId),
        audits: audits.filter((audit) =>
          audit.eventType.startsWith("build.collaboration.moderation.")
        ),
        events,
        moderationCase,
        post,
        reference: await ctx.db.get(evidence.referenceId),
        revision: await ctx.db.get(evidence.currentRevisionId),
      };
    });
    expect(state.post).toMatchObject({
      contentState: "active",
      revision: 1,
    });
    expect(state.post?.activeModerationCaseId).toBeUndefined();
    expect(state.moderationCase).toMatchObject({
      status: "restored",
    });
    expect(state.events.map((event) => event.eventType)).toEqual([
      "moderated",
      "appealed",
      "retained",
      "appealed",
      "restored",
    ]);
    expect(state.audits).toHaveLength(5);
    expect(state.revision?.plainText).toBe("Contractor update");
    expect(state.reference).not.toBeNull();
    expect(state.attachment).not.toBeNull();
  });

  test("keeps author tombstones separate and supports comment moderation", async () => {
    const fixture = await seedModerationFixture();
    const removablePostId = await publishContractorPost(
      fixture,
      "Author-removable update"
    );
    await expect(
      fixture.homeowner.mutation(
        (api as any).build_collaboration_editing
          .tombstoneBuildCollaborationPost,
        {
          buildId: fixture.buildId,
          expectedRevision: 1,
          organizationId: ORGANIZATION_ID,
          postId: removablePostId,
        }
      )
    ).rejects.toThrow("Forbidden");
    await fixture.contractor.mutation(
      (api as any).build_collaboration_editing
        .tombstoneBuildCollaborationPost,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        postId: removablePostId,
      }
    );

    const postId = await publishContractorPost(fixture, "Discussion anchor");
    const commentId = (await fixture.contractor.mutation(
      (api as any).build_collaboration_threads.addBuildCollaborationComment,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Unsafe reply",
        postId,
        references: [],
        tiptapJson: textDocument("Unsafe reply"),
      }
    )) as Id<"buildCollaborationComments">;
    await fixture.builderStaff.mutation(
      (api as any).build_collaboration_moderation
        .moderateBuildCollaborationContent,
      {
        buildId: fixture.buildId,
        entityId: commentId,
        entityKind: "comment",
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        reason: "Unsafe reply instruction",
      }
    );
    const rows = await fixture.contractor.query(
      (api as any).build_collaboration_threads
        .listBuildCollaborationComments,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId,
      }
    );
    expect(rows[0]).toMatchObject({
      comment: {
        contentState: "moderated",
        viewerCanAppeal: true,
      },
      references: [],
      revision: {
        plainText:
          "This reply is unavailable while it is under moderation.",
      },
    });
    expect(JSON.stringify(rows[0])).not.toContain("Unsafe reply");
  });
});

function expectedModerationAuthority(
  viewerRole: BuildCollaborationRole,
  authorRole: BuildCollaborationRole
) {
  const allowedAuthors: Record<
    BuildCollaborationRole,
    ReadonlySet<BuildCollaborationRole>
  > = {
    admin: new Set(buildCollaborationRoles),
    "principle-broker": new Set([
      "broker",
      "builder",
      "broker-staff",
      "builder-staff",
      "homeowner",
      "contractor",
    ]),
    broker: new Set(["builder-staff", "homeowner", "contractor"]),
    builder: new Set(["builder-staff", "homeowner", "contractor"]),
    "broker-staff": new Set([
      "builder-staff",
      "homeowner",
      "contractor",
    ]),
    "builder-staff": new Set(["contractor"]),
    homeowner: new Set(),
    contractor: new Set(),
  };
  return allowedAuthors[viewerRole].has(authorRole);
}
