/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_build_collaboration";

function withIdentity(
  t: ReturnType<typeof convexTest>,
  {
    actorKind = "human",
    organizationId = ORGANIZATION_ID,
    roles,
    subject,
    tokenIdentifier,
  }: {
    actorKind?:
      | "agent"
      | "automation"
      | "human"
      | "service"
      | "system"
      | "malformed"
      | null;
    organizationId?: string;
    roles: string[];
    subject: string;
    tokenIdentifier?: string;
  },
) {
  return t.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier:
      tokenIdentifier ?? `https://api.workos.com/|${subject}`,
    ...(actorKind === null
      ? {}
      : { "https://fairlend.ca/actor_kind": actorKind }),
  } as never);
}

async function seedActiveBuild() {
  const base = convexTest(schema, modules);
  const admin = withIdentity(base, {
    roles: ["admin", "principle-broker"],
    subject: "user_admin",
  });
  const foundation = await admin.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORGANIZATION_ID },
  );
  const buildId = await admin.run(async (ctx) => {
    const now = Date.now();
    const proposalId = await ctx.db.insert("buildProposals", {
      assignedBrokerWorkosUserId: "user_broker",
      brokerageId: foundation.brokerageId,
      borrowerCoPayBps: 0,
      borrowerWorkingCapitalLimitCents: 500_000_00,
      buildName: "147 Cedar Ridge",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      createdByWorkosUserId: "user_admin",
      lenderDrawPolicyLimitCents: 1_000_000_00,
      location: "147 Cedar Ridge Road",
      organizationId: ORGANIZATION_ID,
      reviewOutcome: "approved",
      status: "approved",
      templateId: foundation.templateId,
      totalBudgetCents: 2_400_000_00,
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
      },
    );
    const activeBuildId = await ctx.db.insert("activeBuilds", {
      brokerageId: foundation.brokerageId,
      buildName: "147 Cedar Ridge",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      location: "147 Cedar Ridge Road",
      organizationId: ORGANIZATION_ID,
      proposalId,
      startDate: "2026-07-28",
      status: "active",
      totalBudgetCents: 2_400_000_00,
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
    return activeBuildId;
  });

  return { admin, base, buildId };
}

async function addBuildParticipant(
  t: ReturnType<typeof convexTest>,
  {
    buildId,
    displayName,
    role,
    subject,
  }: {
    buildId: string;
    displayName: string;
    role:
      | "admin"
      | "principle-broker"
      | "broker"
      | "builder"
      | "broker-staff"
      | "builder-staff"
      | "homeowner"
      | "contractor";
    subject: string;
  },
) {
  await t.run(async (ctx) => {
    const normalizedBuildId = ctx.db.normalizeId("activeBuilds", buildId);
    if (!normalizedBuildId) {
      throw new Error("Active Build fixture is unavailable.");
    }
    const build = await ctx.db.get(normalizedBuildId);
    if (!build) {
      throw new Error("Active Build fixture is unavailable.");
    }
    const now = Date.now();
    await ctx.db.insert("buildParticipants", {
      brokerageId: build.brokerageId,
      buildId: normalizedBuildId,
      createdAt: now,
      displayNameSnapshot: displayName,
      joinedAt: now,
      organizationId: build.organizationId,
      participationPeriod: 1,
      role,
      status: "active",
      updatedAt: now,
      validFrom: now,
      workosUserId: subject,
    });
  });
}

describe("Build collaboration publication and feed", () => {
  test("publishes only through the authenticated human and returns the visible post", async () => {
    const { admin, buildId } = await seedActiveBuild();

    const postId = await admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "build_wide",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Footing inspection complete.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [{ text: "Footing inspection complete.", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );

    const feed = await admin.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      },
    );

    expect(feed.page).toHaveLength(1);
    expect(feed.page[0]).toMatchObject({
      kind: "post",
      post: {
        _id: postId,
        agentDrafted: false,
        authorWorkosUserId: "user_admin",
        source: "human",
      },
      revision: {
        plainText: "Footing inspection complete.",
      },
    });
  });

  test("rejects an agent-authored publication attempt", async () => {
    const { base, buildId } = await seedActiveBuild();
    const agent = withIdentity(base, {
      actorKind: "agent",
      roles: ["admin"],
      subject: "opaque-subject-01",
    });

    await expect(
      agent.mutation(
        (api as any).build_collaboration
          .approveAndPublishBuildCollaborationBundle,
        {
          actionItems: [],
          audienceMode: "build_wide",
          buildId,
          organizationId: ORGANIZATION_ID,
          plainText: "Publish this without a human.",
          postType: "update",
          references: [],
          requestedReaderIds: [],
          tiptapJson: JSON.stringify({
            content: [],
            type: "doc",
          }),
        },
      ),
    ).rejects.toThrow(
      "Publishing shared collaboration state requires an explicit human-in-the-loop approval.",
    );
  });

  test("fails closed for untrusted or malformed actor provenance", async () => {
    const { base, buildId } = await seedActiveBuild();
    const untrustedMissingClaim = withIdentity(base, {
      actorKind: null,
      roles: ["admin"],
      subject: "opaque-no-provenance",
      tokenIdentifier: "https://agents.fairlend.invalid/|opaque-no-provenance",
    });
    const malformedWorkosClaim = withIdentity(base, {
      actorKind: "malformed",
      roles: ["admin"],
      subject: "user_malformed",
    });
    const publishArgs = {
      actionItems: [],
      audienceMode: "build_wide",
      buildId,
      organizationId: ORGANIZATION_ID,
      plainText: "Human-only publication.",
      postType: "update",
      references: [],
      requestedReaderIds: [],
      tiptapJson: JSON.stringify({
        content: [
          {
            content: [{ text: "Human-only publication.", type: "text" }],
            type: "paragraph",
          },
        ],
        type: "doc",
      }),
    };

    for (const actor of [untrustedMissingClaim, malformedWorkosClaim]) {
      await expect(
        actor.mutation(
          (api as any).build_collaboration
            .approveAndPublishBuildCollaborationBundle,
          publishArgs,
        ),
      ).rejects.toThrow(
        "Publishing shared collaboration state requires an explicit human-in-the-loop approval.",
      );
    }
  });

  test("publishes the server-derived rich text, exclusions, notifications, and shared effects in one bundle", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    await addBuildParticipant(base, {
      buildId,
      displayName: "Broker Reviewer",
      role: "broker",
      subject: "user_broker",
    });
    await addBuildParticipant(base, {
      buildId,
      displayName: "Site Contractor",
      role: "contractor",
      subject: "user_contractor",
    });

    const postId = await admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [
          {
            assigneeWorkosUserId: " user_broker ",
            descriptionPlainText: "Misleading client description",
            descriptionTiptapJson: JSON.stringify({
              content: [
                {
                  content: [
                    { text: "Upload the sealed report.", type: "text" },
                  ],
                  type: "paragraph",
                },
              ],
              type: "doc",
            }),
            title: " Upload engineer seal ",
          },
        ],
        audienceMode: "build_wide",
        buildId,
        excludedReaderIds: ["user_contractor"],
        notificationEffects: [
          {
            channel: "email",
            recipientWorkosUserIds: ["user_broker"],
            summary: "Lender review requested",
          },
        ],
        organizationId: ORGANIZATION_ID,
        plainText: "Benign client-authored preview text.",
        postType: "update",
        references: [
          {
            entityId: " user_broker ",
            entityKind: "participant",
            label: " Broker Reviewer ",
            primary: true,
            summary: " Lender reviewer ",
          },
        ],
        requestedReaderIds: [],
        sharedMutations: [
          {
            entityId: " evidence-package-1 ",
            entityKind: " evidencePackage ",
            operation: " request_review ",
            summary: " Request lender evidence review ",
          },
        ],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                {
                  text: "Canonical TipTap publication text.",
                  type: "text",
                },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );

    const persisted = await base.run(async (ctx) => {
      const revision = await ctx.db
        .query("buildCollaborationPostRevisions")
        .withIndex("by_postId_and_revision", (query) =>
          query.eq("postId", postId),
        )
        .unique();
      const readers = await ctx.db
        .query("buildCollaborationAudienceMembers")
        .withIndex("by_postId_and_workosUserId", (query) =>
          query.eq("postId", postId),
        )
        .collect();
      const snapshots = await ctx.db
        .query("buildCollaborationAudienceSnapshots")
        .withIndex("by_postRevisionId_and_workosUserId", (query) =>
          query.eq("postRevisionId", revision?._id as never),
        )
        .collect();
      const deliveries = await ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient", (query) =>
          query.eq("organizationId", ORGANIZATION_ID),
        )
        .collect();
      const outbox = await ctx.db
        .query("eventOutbox")
        .withIndex("by_entity", (query) =>
          query
            .eq("relatedEntityType", "buildCollaborationPost")
            .eq("relatedEntityId", postId),
        )
        .collect();
      const approvals = await ctx.db
        .query("buildCollaborationPublicationApprovals")
        .collect();
      const actionItems = await ctx.db
        .query("buildActionItems")
        .withIndex("by_originatingPostId_and_status", (query) =>
          query.eq("originatingPostId", postId),
        )
        .collect();
      const references = await ctx.db
        .query("buildCollaborationReferences")
        .withIndex("by_postId", (query) => query.eq("postId", postId))
        .collect();
      return {
        actionItems,
        approvals,
        deliveries,
        outbox,
        readers,
        references,
        revision,
        snapshots,
      };
    });

    expect(persisted.revision?.plainText).toBe(
      "Canonical TipTap publication text.",
    );
    expect(
      persisted.readers.map((reader) => reader.workosUserId),
    ).not.toContain("user_contractor");
    expect(persisted.snapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resolution: "excluded",
          workosUserId: "user_contractor",
        }),
      ]),
    );
    expect(persisted.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipientWorkosUserId: "user_broker",
          status: "unread",
        }),
      ]),
    );
    expect(persisted.actionItems).toEqual([
      expect.objectContaining({
        assigneeWorkosUserId: "user_broker",
        assignmentState: "assigned",
        descriptionPlainText: "Upload the sealed report.",
        priority: "none",
        requiresAcceptance: false,
        title: "Upload engineer seal",
      }),
    ]);
    expect(persisted.references).toEqual([
      expect.objectContaining({
        entityId: "user_broker",
        labelSnapshot: "Broker Reviewer",
        primary: true,
        summarySnapshot: "Lender reviewer",
      }),
    ]);
    expect(persisted.outbox.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        "build_collaboration.notification.email",
        "build_collaboration.shared_mutation.requested",
      ]),
    );
    expect(persisted.approvals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bundleJsonSnapshot: expect.stringContaining(
            "Canonical TipTap publication text.",
          ),
          readerSummaryJson: expect.stringContaining("effectiveReaderIds"),
          state: "published",
        }),
      ]),
    );
    const approvedBundle = JSON.parse(
      persisted.approvals.find((approval) => approval.state === "published")
        ?.bundleJsonSnapshot ?? "{}",
    );
    expect(approvedBundle.actionItems).toEqual([
      expect.objectContaining({
        assigneeWorkosUserId: "user_broker",
        descriptionPlainText: "Upload the sealed report.",
        effectiveAssignmentState: "assigned",
        priority: "none",
        requiresAcceptance: false,
        title: "Upload engineer seal",
      }),
    ]);
    expect(approvedBundle.sharedMutations).toEqual([
      {
        entityId: "evidence-package-1",
        entityKind: "evidencePackage",
        operation: "request_review",
        summary: "Request lender evidence review",
      },
    ]);
  });

  test("rejects custom readers and notification recipients outside the active Build", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    await addBuildParticipant(base, {
      buildId,
      displayName: "Broker Reviewer",
      role: "broker",
      subject: "user_broker",
    });

    await expect(
      admin.mutation(
        (api as any).build_collaboration
          .approveAndPublishBuildCollaborationBundle,
        {
          actionItems: [],
          audienceMode: "custom",
          buildId,
          notificationEffects: [
            {
              channel: "email",
              recipientWorkosUserIds: ["outside-user"],
              summary: "Leak this summary",
            },
          ],
          organizationId: ORGANIZATION_ID,
          plainText: "Build-local publication.",
          postType: "update",
          references: [],
          requestedReaderIds: ["outside-user"],
          tiptapJson: JSON.stringify({
            content: [
              {
                content: [
                  { text: "Build-local publication.", type: "text" },
                ],
                type: "paragraph",
              },
            ],
            type: "doc",
          }),
        },
      ),
    ).rejects.toThrow(
      "Custom audience readers must be active Build participants.",
    );
    const leakedEffects = await base.run(async (ctx) => {
      const outbox = await ctx.db.query("eventOutbox").collect();
      const deliveries = await ctx.db.query("recipientDeliveries").collect();
      return {
        deliveries: deliveries.filter(
          (delivery) => delivery.recipientWorkosUserId === "outside-user",
        ),
        outbox: outbox.filter((event) =>
          event.payloadPreview.includes("outside-user"),
        ),
      };
    });
    expect(leakedEffects).toEqual({ deliveries: [], outbox: [] });
  });

  test("publishes an agent-prepared draft only after human approval and preserves the human author", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    const agent = withIdentity(base, {
      actorKind: "agent",
      roles: ["admin"],
      subject: "svc-opaque-2847",
    });
    const preparedDraft = await agent.mutation(
      (api as any).build_collaboration_drafts
        .saveMyBuildCollaborationDraft,
      {
        acknowledgementRequired: false,
        actionItems: [],
        approvalOwnerWorkosUserId: "user_admin",
        audienceMode: "build_wide",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Prepared by the Build agent for human review.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                {
                  text: "Prepared by the Build agent for human review.",
                  type: "text",
                },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    const draftId = preparedDraft.draftId as Id<"buildCollaborationDrafts">;
    const draftsAwaitingHuman = await admin.query(
      (api as any).build_collaboration_drafts
        .listMyBuildCollaborationDrafts,
      { buildId, organizationId: ORGANIZATION_ID },
    );
    expect(draftsAwaitingHuman).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: draftId,
          approvalOwnerWorkosUserId: "user_admin",
          preparedByActorKind: "agent",
        }),
      ]),
    );

    const postId = await admin.mutation(
      (api as any).build_collaboration_drafts
        .approveAndPublishBuildCollaborationDraft,
      { buildId, draftId, organizationId: ORGANIZATION_ID },
    );
    const result = await admin.run(async (ctx) => {
      const post = await ctx.db.get(postId);
      const approvals = await ctx.db
        .query("buildCollaborationPublicationApprovals")
        .collect();
      return {
        approvals: approvals.filter(
          (approval) => approval.draftId === draftId,
        ),
        post,
      };
    });

    expect(result.post).toMatchObject({
      agentDrafted: true,
      authorWorkosUserId: "user_admin",
      source: "human",
    });
    expect(result.approvals).toMatchObject([
      {
        approvingActorKind: "human",
        approvingWorkosUserId: "user_admin",
        bundleHash: expect.stringMatching(/^sha256-/),
        bundleJsonSnapshot: expect.stringContaining(
          "Prepared by the Build agent",
        ),
        draftRevision: 1,
        state: "published",
      },
    ]);
    const draft = await admin.run(async (ctx) => await ctx.db.get(draftId));
    expect(draft).toMatchObject({
      approvalOwnerWorkosUserId: "user_admin",
      preparedByActorKind: "agent",
      preparedByAgent: true,
      preparedByWorkosUserId: "svc-opaque-2847",
    });
    await expect(
      admin.mutation(
        (api as any).build_collaboration_drafts
          .approveAndPublishBuildCollaborationDraft,
        { buildId, draftId, organizationId: ORGANIZATION_ID },
      ),
    ).rejects.toThrow("This draft is no longer publishable.");
  });

  test("invalidates human approval when the exact prepared bundle changes", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    const agent = withIdentity(base, {
      actorKind: "agent",
      roles: ["admin"],
      subject: "svc-opaque-tamper",
    });
    const preparedDraft = await agent.mutation(
      (api as any).build_collaboration_drafts
        .saveMyBuildCollaborationDraft,
      {
        actionItems: [],
        approvalOwnerWorkosUserId: "user_admin",
        audienceMode: "build_wide",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Exact prepared bundle.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [{ text: "Exact prepared bundle.", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    const draftId = preparedDraft.draftId as Id<"buildCollaborationDrafts">;

    await base.run(async (ctx) => {
      const draft = await ctx.db.get(draftId);
      if (!draft) {
        throw new Error("Draft fixture is unavailable.");
      }
      const changedBundle = JSON.stringify({
        ...JSON.parse(draft.bundleJson),
        notificationEffects: [
          {
            channel: "email",
            recipientWorkosUserId: "user_builder",
            templateKey: "collaboration-published",
          },
        ],
      });
      await ctx.db.patch(draftId, { bundleJson: changedBundle });
    });

    await expect(
      admin.mutation(
        (api as any).build_collaboration_drafts
          .approveAndPublishBuildCollaborationDraft,
        { buildId, draftId, organizationId: ORGANIZATION_ID },
      ),
    ).rejects.toThrow(
      "The draft changed after review. Review the latest revision before publishing.",
    );
  });

  test("rejects every shared mutation for signed non-human actor kinds regardless of subject format", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    const postId = await admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        acknowledgementRequired: true,
        actionItems: [{ title: "Human-owned Action Item" }],
        audienceMode: "build_wide",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Human-published control post.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                { text: "Human-published control post.", type: "text" },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    const actionItemId = await base.run(async (ctx) => {
      const item = await ctx.db
        .query("buildActionItems")
        .withIndex("by_originatingPostId_and_status", (query) =>
          query.eq("originatingPostId", postId),
        )
        .unique();
      if (!item) {
        throw new Error("Action Item fixture is unavailable.");
      }
      return item._id;
    });
    const humanRequired =
      "Publishing shared collaboration state requires an explicit human-in-the-loop approval.";
    const humanShapedAgent = withIdentity(base, {
      actorKind: "agent",
      roles: ["admin"],
      subject: "user_admin",
    });
    const agentPrefixedService = withIdentity(base, {
      actorKind: "service",
      roles: ["admin"],
      subject: "agent_build_collaboration",
    });
    const emailShapedAutomation = withIdentity(base, {
      actorKind: "automation",
      roles: ["admin"],
      subject: "operations@example.com",
    });
    const opaqueSystem = withIdentity(base, {
      actorKind: "system",
      roles: ["admin"],
      subject: "00u4Jk9Qp7",
    });

    await expect(
      humanShapedAgent.mutation(
        (api as any).build_collaboration
          .approveAndPublishBuildCollaborationBundle,
        {
          actionItems: [],
          audienceMode: "build_wide",
          buildId,
          organizationId: ORGANIZATION_ID,
          plainText: "Non-human direct publication.",
          postType: "update",
          references: [],
          requestedReaderIds: [],
          tiptapJson: JSON.stringify({
            content: [{ type: "paragraph" }],
            type: "doc",
          }),
        },
      ),
    ).rejects.toThrow(humanRequired);
    await expect(
      agentPrefixedService.mutation(
        (api as any).build_collaboration_threads
          .addBuildCollaborationComment,
        {
          buildId,
          organizationId: ORGANIZATION_ID,
          plainText: "Service comment.",
          postId,
          references: [],
          tiptapJson: JSON.stringify({
            content: [{ type: "paragraph" }],
            type: "doc",
          }),
        },
      ),
    ).rejects.toThrow(humanRequired);
    await expect(
      emailShapedAutomation.mutation(
        (api as any).build_action_items.updateBuildActionItem,
        {
          actionItemId,
          buildId,
          organizationId: ORGANIZATION_ID,
          title: "Automation rewrite",
        },
      ),
    ).rejects.toThrow(humanRequired);
    await expect(
      opaqueSystem.mutation(
        (api as any).build_collaboration_threads.toggleBuildCollaborationPin,
        {
          buildId,
          kind: "build",
          organizationId: ORGANIZATION_ID,
          postId,
        },
      ),
    ).rejects.toThrow(humanRequired);
    await expect(
      humanShapedAgent.mutation(
        (api as any).build_collaboration_acknowledgements
          .acknowledgeBuildCollaborationPost,
        {
          buildId,
          organizationId: ORGANIZATION_ID,
          postId,
        },
      ),
    ).rejects.toThrow(humanRequired);
    await expect(
      agentPrefixedService.mutation(
        (api as any).build_collaboration_rollout
          .transitionBuildCollaborationTenantStatus,
        {
          buildId,
          expectedStatus: "active",
          nextStatus: "disabled",
          organizationId: ORGANIZATION_ID,
          reason: "Non-human lifecycle attempt.",
        },
      ),
    ).rejects.toThrow(humanRequired);
  });

  test("requires and records acknowledgement only for an authorized lower-tier participant", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    await addBuildParticipant(base, {
      buildId,
      displayName: "Builder Staff",
      role: "builder-staff",
      subject: "user_builder_staff",
    });
    const postId = await admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        acknowledgementRequired: true,
        actionItems: [],
        audienceMode: "build_wide",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Acknowledge the revised site access policy.",
        postType: "announcement",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                {
                  text: "Acknowledge the revised site access policy.",
                  type: "text",
                },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    const builderStaff = withIdentity(base, {
      roles: ["builder-staff"],
      subject: "user_builder_staff",
    });

    const before = await builderStaff.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      },
    );
    expect(before.page[0].acknowledgement).toMatchObject({
      acknowledged: false,
      required: true,
    });

    await builderStaff.mutation(
      (api as any).build_collaboration_acknowledgements
        .acknowledgeBuildCollaborationPost,
      { buildId, organizationId: ORGANIZATION_ID, postId },
    );
    const after = await builderStaff.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      },
    );
    expect(after.page[0].acknowledgement).toMatchObject({
      acknowledged: true,
      required: true,
    });
  });

  test("returns a metadata-free placeholder when a lower-tier participant cannot read a post", async () => {
    const { base, buildId } = await seedActiveBuild();
    await addBuildParticipant(base, {
      buildId,
      displayName: "Builder Staff",
      role: "builder-staff",
      subject: "user_builder_staff",
    });
    await addBuildParticipant(base, {
      buildId,
      displayName: "Contractor",
      role: "contractor",
      subject: "user_contractor",
    });
    const builderStaff = withIdentity(base, {
      roles: ["builder-staff"],
      subject: "user_builder_staff",
    });
    const contractor = withIdentity(base, {
      roles: ["contractor"],
      subject: "user_contractor",
    });
    await builderStaff.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "author_tier_and_higher",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Lender and builder coordination only.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                { text: "Lender and builder coordination only.", type: "text" },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );

    const feed = await contractor.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      },
    );

    expect(feed.page).toEqual([
      {
        kind: "restricted",
        placeholderKey: "restricted-djb2-e64cc199",
      },
    ]);
    expect(JSON.stringify(feed.page)).not.toContain("Lender");
    expect(JSON.stringify(feed.page)).not.toContain("user_builder_staff");
  });

  test("prevents a contractor from restricting a post away from higher roles", async () => {
    const { base, buildId } = await seedActiveBuild();
    await addBuildParticipant(base, {
      buildId,
      displayName: "Contractor",
      role: "contractor",
      subject: "user_contractor",
    });
    const contractor = withIdentity(base, {
      roles: ["contractor"],
      subject: "user_contractor",
    });

    await expect(
      contractor.mutation(
        (api as any).build_collaboration
          .approveAndPublishBuildCollaborationBundle,
        {
          actionItems: [],
          audienceMode: "custom",
          buildId,
          organizationId: ORGANIZATION_ID,
          plainText: "Hide this from the broker.",
          postType: "update",
          references: [],
          requestedReaderIds: ["user_contractor"],
          tiptapJson: JSON.stringify({
            content: [
              {
                content: [{ text: "Hide this from the broker.", type: "text" }],
                type: "paragraph",
              },
            ],
            type: "doc",
          }),
        },
      ),
    ).rejects.toThrow("Custom audiences are unavailable");
  });

  test("exposes timestamped seen markers only upward through the hierarchy", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    await addBuildParticipant(base, {
      buildId,
      displayName: "Contractor",
      role: "contractor",
      subject: "user_contractor",
    });
    const contractor = withIdentity(base, {
      roles: ["contractor"],
      subject: "user_contractor",
    });
    const postId = await contractor.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "build_wide",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Forms stripped on the east elevation.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                {
                  text: "Forms stripped on the east elevation.",
                  type: "text",
                },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    await contractor.mutation(
      (api as any).build_collaboration_threads
        .markBuildCollaborationPostViewed,
      { buildId, organizationId: ORGANIZATION_ID, postId },
    );
    await admin.mutation(
      (api as any).build_collaboration_threads
        .markBuildCollaborationPostViewed,
      { buildId, organizationId: ORGANIZATION_ID, postId },
    );

    const adminFeed = await admin.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      },
    );
    const contractorFeed = await contractor.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      },
    );

    expect(adminFeed.page[0].receipts).toMatchObject([
      {
        viewerRole: "contractor",
        workosUserId: "user_contractor",
      },
    ]);
    expect(contractorFeed.page[0].receipts).toEqual([]);
    expect(JSON.stringify(contractorFeed.page[0])).not.toContain("user_admin");
  });
});

describe("Build collaboration tenant rollout", () => {
  test("fails closed for both missing and disabled tenant settings", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    await deleteCollaborationTenantSetting(base);

    const missingState = await admin.query(
      (api as any).build_collaboration_rollout
        .getBuildCollaborationRolloutState,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(missingState).toEqual({
      activatedAt: undefined,
      available: false,
      migrationCompletedAt: undefined,
      status: "disabled",
    });
    await expect(
      admin.query(
        (api as any).build_collaboration.listBuildCollaborationFeed,
        {
          buildId,
          organizationId: ORGANIZATION_ID,
          paginationOpts: { cursor: null, numItems: 20 },
        },
      ),
    ).rejects.toThrow(
      "Build collaboration is unavailable until this tenant is active.",
    );

    await insertDisabledCollaborationTenantSetting(base, buildId);
    await expect(
      admin.mutation(
        (api as any).build_collaboration
          .approveAndPublishBuildCollaborationBundle,
        {
          actionItems: [],
          audienceMode: "build_wide",
          buildId,
          organizationId: ORGANIZATION_ID,
          plainText: "This must fail closed.",
          postType: "update",
          references: [],
          requestedReaderIds: [],
          tiptapJson: JSON.stringify({
            content: [{ type: "paragraph" }],
            type: "doc",
          }),
        },
      ),
    ).rejects.toThrow(
      "Build collaboration is unavailable until this tenant is active.",
    );
  });

  test("records parity and audits the only legal activation sequence", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    await deleteCollaborationTenantSetting(base);

    const evidenceId = await admin.mutation(
      (api as any).build_collaboration_rollout
        .recordBuildCollaborationMigrationParityEvidence,
      {
        buildId,
        importedPostCount: 4,
        mismatchCount: 0,
        organizationId: ORGANIZATION_ID,
        reason: "Legacy notes matched imported collaboration posts.",
        reportHash: "sha256:parity-report",
        sourceRecordCount: 4,
      },
    );
    const settingId = await admin.mutation(
      (api as any).build_collaboration_rollout
        .transitionBuildCollaborationTenantStatus,
      {
        buildId,
        expectedStatus: "disabled",
        nextStatus: "migration_ready",
        organizationId: ORGANIZATION_ID,
      },
    );
    await admin.mutation(
      (api as any).build_collaboration_rollout
        .transitionBuildCollaborationTenantStatus,
      {
        buildId,
        expectedStatus: "migration_ready",
        nextStatus: "active",
        organizationId: ORGANIZATION_ID,
      },
    );

    const state = await admin.query(
      (api as any).build_collaboration_rollout
        .getBuildCollaborationRolloutState,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(state).toMatchObject({
      available: true,
      status: "active",
    });
    expect(state.activatedAt).toEqual(expect.any(Number));
    expect(state.migrationCompletedAt).toEqual(expect.any(Number));

    const evidenceAndAudits = await base.run(async (ctx) => {
      const evidence = await ctx.db.get(evidenceId);
      const audits = await ctx.db.query("auditEvents").collect();
      return { audits, evidence };
    });
    expect(evidenceAndAudits.evidence).toMatchObject({
      parityPassed: true,
      reportHash: "sha256:parity-report",
      verifiedByWorkosUserId: "user_admin",
    });
    expect(evidenceAndAudits.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorRoles: expect.arrayContaining(["admin"]),
          actorWorkosUserId: "user_admin",
          command: "recordBuildCollaborationMigrationParityEvidence",
          createdAt: expect.any(Number),
          entityId: evidenceId,
          entityType: "buildCollaborationMigrationParityEvidence",
        }),
        expect.objectContaining({
          actorWorkosUserId: "user_admin",
          command: "transitionBuildCollaborationTenantStatus",
          entityId: settingId,
          entityType: "buildCollaborationTenantSettings",
          newState: expect.stringContaining('"status":"active"'),
          priorState: JSON.stringify({ status: "migration_ready" }),
        }),
      ]),
    );
  });

  test("rejects activation without passing parity, illegal transitions, and cross-tenant commands", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    await base.run(async (ctx) => {
      const setting = await ctx.db
        .query("buildCollaborationTenantSettings")
        .withIndex("by_organizationId", (query) =>
          query.eq("organizationId", ORGANIZATION_ID),
        )
        .unique();
      if (!setting) {
        throw new Error("Collaboration tenant fixture is unavailable.");
      }
      await ctx.db.patch(setting._id, { status: "migration_ready" });
    });

    await expect(
      admin.mutation(
        (api as any).build_collaboration_rollout
          .transitionBuildCollaborationTenantStatus,
        {
          buildId,
          expectedStatus: "migration_ready",
          nextStatus: "active",
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow(
      "Collaboration activation requires durable passing migration parity evidence.",
    );

    await expect(
      admin.mutation(
        (api as any).build_collaboration_rollout
          .transitionBuildCollaborationTenantStatus,
        {
          buildId,
          expectedStatus: "migration_ready",
          nextStatus: "migration_ready",
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow("Illegal collaboration rollout transition");

    await expect(
      admin.mutation(
        (api as any).build_collaboration_rollout
          .transitionBuildCollaborationTenantStatus,
        {
          buildId,
          expectedStatus: "migration_ready",
          nextStatus: "disabled",
          organizationId: "org_other",
          reason: "Cross-tenant rollback attempt.",
        },
      ),
    ).rejects.toThrow();
  });

  test("requires operator authority and a rollback reason", async () => {
    const { base, buildId } = await seedActiveBuild();
    await addBuildParticipant(base, {
      buildId,
      displayName: "Contractor",
      role: "contractor",
      subject: "user_contractor",
    });
    const contractor = withIdentity(base, {
      roles: ["contractor"],
      subject: "user_contractor",
    });
    const admin = withIdentity(base, {
      roles: ["admin", "principle-broker"],
      subject: "user_admin",
    });

    await expect(
      contractor.mutation(
        (api as any).build_collaboration_rollout
          .transitionBuildCollaborationTenantStatus,
        {
          buildId,
          expectedStatus: "active",
          nextStatus: "disabled",
          organizationId: ORGANIZATION_ID,
          reason: "Unauthorized rollback.",
        },
      ),
    ).rejects.toThrow(
      "Only an administrator or principal broker can change collaboration rollout state.",
    );
    await expect(
      admin.mutation(
        (api as any).build_collaboration_rollout
          .transitionBuildCollaborationTenantStatus,
        {
          buildId,
          expectedStatus: "active",
          nextStatus: "disabled",
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow("A rollback reason is required.");
  });

  test("rolls back access without deleting collaboration data or audit history", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    const postId = await admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "build_wide",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Preserve this post across rollback.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                {
                  text: "Preserve this post across rollback.",
                  type: "text",
                },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    await admin.mutation(
      (api as any).build_collaboration_rollout
        .transitionBuildCollaborationTenantStatus,
      {
        buildId,
        expectedStatus: "active",
        nextStatus: "disabled",
        organizationId: ORGANIZATION_ID,
        reason: "Production rollback drill.",
      },
    );

    await expect(
      admin.query(
        (api as any).build_collaboration.listBuildCollaborationFeed,
        {
          buildId,
          organizationId: ORGANIZATION_ID,
          paginationOpts: { cursor: null, numItems: 20 },
        },
      ),
    ).rejects.toThrow(
      "Build collaboration is unavailable until this tenant is active.",
    );
    const preserved = await base.run(async (ctx) => {
      const post = await ctx.db.get(postId);
      const revisions = await ctx.db
        .query("buildCollaborationPostRevisions")
        .withIndex("by_postId_and_revision", (query) =>
          query.eq("postId", postId),
        )
        .collect();
      const audit = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query.eq("entityType", "buildCollaborationTenantSettings"),
        )
        .filter((query) =>
          query.eq(
            query.field("eventType"),
            "build.collaboration.tenant_status.changed",
          ),
        )
        .collect();
      return { audit, post, revisions };
    });
    expect(preserved.post?._id).toBe(postId);
    expect(preserved.revisions).toHaveLength(1);
    expect(preserved.audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          newState: expect.stringContaining('"status":"disabled"'),
          priorState: JSON.stringify({ status: "active" }),
          reason: "Production rollback drill.",
        }),
      ]),
    );
  });
});

async function deleteCollaborationTenantSetting(
  t: ReturnType<typeof convexTest>,
) {
  await t.run(async (ctx) => {
    const settings = await ctx.db
      .query("buildCollaborationTenantSettings")
      .collect();
    const setting = settings.find(
      (candidate) => candidate.organizationId === ORGANIZATION_ID,
    );
    if (setting) {
      await ctx.db.delete(setting._id);
    }
  });
}

async function insertDisabledCollaborationTenantSetting(
  t: ReturnType<typeof convexTest>,
  buildId: string,
) {
  await t.run(async (ctx) => {
    const normalizedBuildId = ctx.db.normalizeId("activeBuilds", buildId);
    if (!normalizedBuildId) {
      throw new Error("Active Build fixture is unavailable.");
    }
    const build = await ctx.db.get(normalizedBuildId);
    if (!build) {
      throw new Error("Active Build fixture is unavailable.");
    }
    const now = Date.now();
    await ctx.db.insert("buildCollaborationTenantSettings", {
      brokerageId: build.brokerageId,
      createdAt: now,
      generousRateLimitMultiplier: 1,
      organizationId: build.organizationId,
      status: "disabled",
      updatedAt: now,
    });
  });
}
