/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { emitCanonicalBuildCollaborationNotification } from "./build_collaboration_notifications";
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

async function seedCollaborationReferenceEntities(
  fixture: Awaited<ReturnType<typeof seedActiveBuild>>,
) {
  const seedPostId = await fixture.admin.mutation(
    (api as any).build_collaboration
      .approveAndPublishBuildCollaborationBundle,
    {
      actionItems: [],
      audienceMode: "author_tier_and_higher",
      buildId: fixture.buildId,
      organizationId: ORGANIZATION_ID,
      plainText: "Reference fixture.",
      postType: "update",
      references: [],
      requestedReaderIds: [],
      tiptapJson: JSON.stringify({
        content: [
          {
            content: [{ text: "Reference fixture.", type: "text" }],
            type: "paragraph",
          },
        ],
        type: "doc",
      }),
    },
  );
  return await fixture.base.run(async (ctx) => {
    const build = await ctx.db.get(fixture.buildId);
    if (!build) {
      throw new Error("Active Build fixture is unavailable.");
    }
    const now = Date.now();
    const proposalMilestoneId = await ctx.db.insert("proposalMilestones", {
      brokerageId: build.brokerageId,
      budgetCents: 500_000_00,
      createdAt: now,
      dayEnd: 20,
      dayStart: 0,
      dependencyKeys: [],
      drawAvailabilityCents: 400_000_00,
      durationDays: 20,
      key: "foundation",
      name: "Foundation",
      order: 1,
      organizationId: build.organizationId,
      proposalId: build.proposalId,
      updatedAt: now,
    });
    const proposalSubmilestoneId = await ctx.db.insert(
      "proposalSubmilestones",
      {
        brokerageId: build.brokerageId,
        createdAt: now,
        key: "footings",
        milestoneKey: "foundation",
        name: "Footings",
        order: 1,
        organizationId: build.organizationId,
        proposalId: build.proposalId,
        proposalMilestoneId,
        updatedAt: now,
      },
    );
    const milestoneId = await ctx.db.insert("buildMilestones", {
      brokerageId: build.brokerageId,
      budgetCents: 500_000_00,
      buildId: build._id,
      createdAt: now,
      dayEnd: 20,
      dayStart: 0,
      dependencyKeys: [],
      drawAvailabilityCents: 400_000_00,
      durationDays: 20,
      key: "foundation",
      name: "Foundation",
      order: 1,
      organizationId: build.organizationId,
      progressPercent: 35,
      proposalMilestoneId,
      status: "in_progress",
      updatedAt: now,
    });
    const submilestoneId = await ctx.db.insert("buildSubmilestones", {
      brokerageId: build.brokerageId,
      buildId: build._id,
      buildMilestoneId: milestoneId,
      createdAt: now,
      key: "footings",
      milestoneKey: "foundation",
      name: "Footings",
      order: 1,
      organizationId: build.organizationId,
      proposalSubmilestoneId,
      status: "planned",
      updatedAt: now,
    });
    const proposalDrawId = await ctx.db.insert("proposalDrawScheduleRows", {
      amountCents: 184_000_00,
      brokerageId: build.brokerageId,
      createdAt: now,
      drawKey: "draw-1",
      label: "Draw 1",
      order: 1,
      organizationId: build.organizationId,
      proposalId: build.proposalId,
      proposalMilestoneId,
      source: "milestone",
      timingDay: 20,
      updatedAt: now,
    });
    const drawId = await ctx.db.insert("plannedDrawScheduleRows", {
      amountCents: 184_000_00,
      brokerageId: build.brokerageId,
      buildId: build._id,
      buildMilestoneId: milestoneId,
      createdAt: now,
      drawKey: "draw-1",
      label: "Draw 1",
      milestoneKey: "foundation",
      order: 1,
      organizationId: build.organizationId,
      proposalDrawScheduleRowId: proposalDrawId,
      status: "planned",
      timingDay: 20,
      updatedAt: now,
    });
    const visitId = await ctx.db.insert("buildSiteVisits", {
      brokerageId: build.brokerageId,
      buildId: build._id,
      buildMilestoneId: milestoneId,
      createdAt: now,
      milestoneKey: "foundation",
      organizationId: build.organizationId,
      requestedAt: "2026-07-29T12:00:00.000Z",
      requestedDay: 10,
      status: "requested",
      tokenExpiresAt: now + 86_400_000,
      updatedAt: now,
      url: "https://example.test/site-visit",
      visitId: "SV-1",
    });
    const evidenceAssetId = await ctx.db.insert("buildEvidenceAssets", {
      brokerageId: build.brokerageId,
      buildId: build._id,
      createdAt: now,
      evidenceKey: "foundation-evidence",
      fileName: "foundation.jpg",
      label: "Foundation photo",
      locationVerified: true,
      milestoneKey: "foundation",
      mimeType: "image/jpeg",
      organizationId: build.organizationId,
      proposalId: build.proposalId,
      siteVisitId: visitId,
      sizeBytes: 1024,
      source: "test",
      tag: "Progress photo",
      updatedAt: now,
    });
    const documentId = await ctx.db.insert("buildDocuments", {
      brokerageId: build.brokerageId,
      buildId: build._id,
      contractorVisible: false,
      createdAt: now,
      documentType: "budget",
      fileName: "confidential-budget.pdf",
      mimeType: "application/pdf",
      organizationId: build.organizationId,
      proposalId: build.proposalId,
      sizeBytes: 2048,
      status: "uploaded",
      updatedAt: now,
      uploadedByWorkosUserId: "user_admin",
    });
    const permitDocumentId = await ctx.db.insert("buildDocuments", {
      brokerageId: build.brokerageId,
      buildId: build._id,
      createdAt: now,
      documentType: "permit",
      fileName: "building-permit.pdf",
      mimeType: "application/pdf",
      organizationId: build.organizationId,
      proposalId: build.proposalId,
      sizeBytes: 1024,
      status: "uploaded",
      updatedAt: now,
      uploadedByWorkosUserId: "user_admin",
    });
    const materialId = await ctx.db.insert("buildCostItems", {
      brokerageId: build.brokerageId,
      buildId: build._id,
      buildMilestoneId: milestoneId,
      costCents: 12_500_00,
      createdAt: now,
      createdByWorkosUserId: "user_admin",
      itemKey: "concrete",
      itemType: "material",
      milestoneKey: "foundation",
      organizationId: build.organizationId,
      proposalId: build.proposalId,
      quantity: 10,
      relevantSubmilestoneKeys: ["footings"],
      supplier: "Secret Supplier",
      title: "Concrete",
      updatedAt: now,
      updatedByWorkosUserId: "user_admin",
    });
    const actionItemId = await ctx.db.insert("buildActionItems", {
      assignmentState: "unassigned",
      brokerageId: build.brokerageId,
      buildId: build._id,
      createdAt: now,
      creatorWorkosUserId: "user_admin",
      currentRevision: 1,
      descriptionPlainText: "",
      descriptionTiptapJson: JSON.stringify({ content: [], type: "doc" }),
      originatingPostId: seedPostId,
      organizationId: build.organizationId,
      priority: "high",
      requiresAcceptance: false,
      status: "todo",
      title: "Upload engineer seal",
      updatedAt: now,
    });
    return {
      actionItemId,
      documentId,
      drawId,
      evidenceAssetId,
      evidencePackageId: "foundation-evidence",
      materialId,
      milestoneId,
      permitDocumentId,
      siteVisitId: visitId,
      submilestoneId,
    };
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
        summarySnapshot: "Broker on this Build",
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

    const requiredDelivery = await base.run(async (ctx) =>
      ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient", (query) =>
          query
            .eq("organizationId", ORGANIZATION_ID)
            .eq("recipientWorkosUserId", "user_builder_staff"),
        )
        .first(),
    );
    expect(requiredDelivery).toMatchObject({
      actionRequired: true,
      collaborationEventKind: "acknowledgement_required",
      collaborationPostId: postId,
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
    const receivedDelivery = await base.run(async (ctx) =>
      ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient", (query) =>
          query
            .eq("organizationId", ORGANIZATION_ID)
            .eq("recipientWorkosUserId", "user_admin"),
        )
        .filter((query) =>
          query.eq(
            query.field("collaborationEventKind"),
            "acknowledgement_received",
          ),
        )
        .first(),
    );
    expect(receivedDelivery).toMatchObject({
      collaborationPostId: postId,
      recipientWorkosUserId: "user_admin",
    });
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

describe("Build collaboration canonical reference authorization", () => {
  test("hydrates an authorized focused post without leaking hidden or forged targets", async () => {
    const fixture = await seedActiveBuild();
    await addBuildParticipant(fixture.base, {
      buildId: fixture.buildId,
      displayName: "Site Contractor",
      role: "contractor",
      subject: "user_contractor",
    });
    const postId = await fixture.admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "custom",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Focused broker-only post.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [{ text: "Focused broker-only post.", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      }
    );

    await expect(
      fixture.admin.query(
        (api as any).build_collaboration_focus
          .getFocusedBuildCollaborationPostContext,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId,
        }
      )
    ).resolves.toEqual(
      expect.objectContaining({
        entry: expect.objectContaining({
          kind: "post",
          post: expect.objectContaining({ _id: postId }),
          revision: expect.objectContaining({
            plainText: "Focused broker-only post.",
          }),
        }),
        state: "visible",
      })
    );

    const contractor = withIdentity(fixture.base, {
      roles: ["contractor"],
      subject: "user_contractor",
    });
    await expect(
      contractor.query(
        (api as any).build_collaboration_focus
          .getFocusedBuildCollaborationPostContext,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId,
        }
      )
    ).resolves.toEqual({ state: "revoked" });
    await expect(
      fixture.admin.query(
        (api as any).build_collaboration_focus
          .getFocusedBuildCollaborationPostContext,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: "forged-post-id",
        }
      )
    ).resolves.toEqual({ state: "revoked" });
  });

  test("resolves an authorized focused Action Item without leaking hidden or forged targets", async () => {
    const fixture = await seedActiveBuild();
    await addBuildParticipant(fixture.base, {
      buildId: fixture.buildId,
      displayName: "Site Contractor",
      role: "contractor",
      subject: "user_contractor",
    });
    const entities = await seedCollaborationReferenceEntities(fixture);

    await expect(
      fixture.admin.query(
        (api as any).build_collaboration_focus
          .getFocusedBuildActionItemContext,
        {
          actionItemId: entities.actionItemId,
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        actionItemId: entities.actionItemId,
        postId: expect.any(String),
      })
    );

    const contractor = withIdentity(fixture.base, {
      roles: ["contractor"],
      subject: "user_contractor",
    });
    await expect(
      contractor.query(
        (api as any).build_collaboration_focus
          .getFocusedBuildActionItemContext,
        {
          actionItemId: entities.actionItemId,
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).resolves.toBeNull();
    await expect(
      fixture.admin.query(
        (api as any).build_collaboration_focus
          .getFocusedBuildActionItemContext,
        {
          actionItemId: "forged-action-item-id",
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).resolves.toBeNull();
  });

  test("indexes every canonical kind while omitting restricted fields and entities for lower roles", async () => {
    const fixture = await seedActiveBuild();
    await addBuildParticipant(fixture.base, {
      buildId: fixture.buildId,
      displayName: "Site Contractor",
      role: "contractor",
      subject: "user_contractor",
    });
    await addBuildParticipant(fixture.base, {
      buildId: fixture.buildId,
      displayName: "Homeowner",
      role: "homeowner",
      subject: "user_homeowner",
    });
    const entities = await seedCollaborationReferenceEntities(fixture);

    const adminOptions = await fixture.admin.query(
      (api as any).build_collaboration_references
        .listBuildCollaborationTagOptions,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(new Set(adminOptions.map((option: any) => option.entityKind))).toEqual(
      new Set([
        "actionItem",
        "document",
        "draw",
        "evidenceAsset",
        "evidencePackage",
        "material",
        "milestone",
        "participant",
        "siteVisit",
        "submilestone",
      ]),
    );
    expect(
      adminOptions.every((option: any) => option.href.startsWith("?tab=")),
    ).toBe(true);
    expect(
      adminOptions.find((option: any) => option.entityKind === "actionItem")
        ?.href,
    ).toContain("tab=details");
    expect(
      adminOptions.find((option: any) => option.entityKind === "draw")?.href,
    ).toContain("tab=details");
    expect(
      adminOptions.find((option: any) => option.entityKind === "participant")
        ?.href,
    ).toContain("tab=details");

    const contractor = withIdentity(fixture.base, {
      roles: ["contractor"],
      subject: "user_contractor",
    });
    const contractorOptions = await contractor.query(
      (api as any).build_collaboration_references
        .listBuildCollaborationTagOptions,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      },
    );
    const contractorSerialized = JSON.stringify(contractorOptions);
    expect(contractorOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityKind: "document",
          label: "building-permit.pdf",
        }),
        expect.objectContaining({
          entityKind: "material",
          label: "Concrete",
          summary: "Material · 10 qty",
        }),
      ]),
    );
    expect(contractorSerialized).not.toContain("confidential-budget.pdf");
    expect(contractorSerialized).not.toContain("Secret Supplier");
    expect(contractorSerialized).not.toContain("foundation-evidence");
    expect(
      contractorOptions.some((option: any) => option.entityKind === "draw"),
    ).toBe(false);
    expect(
      contractorOptions.some(
        (option: any) => option.entityKind === "actionItem",
      ),
    ).toBe(false);
    await expect(
      contractor.mutation(
        (api as any).build_collaboration
          .approveAndPublishBuildCollaborationBundle,
        {
          actionItems: [],
          audienceMode: "author_tier_and_higher",
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          plainText: "Attempt to disclose a hidden Action Item.",
          postType: "update",
          references: [
            {
              entityId: entities.actionItemId,
              entityKind: "actionItem",
              label: "Forged Action Item",
            },
          ],
          requestedReaderIds: [],
          tiptapJson: JSON.stringify({
            content: [
              {
                content: [
                  {
                    text: "Attempt to disclose a hidden Action Item.",
                    type: "text",
                  },
                ],
                type: "paragraph",
              },
            ],
            type: "doc",
          }),
        },
      ),
    ).rejects.toThrow(
      "The referenced entity is not readable by every publication reader.",
    );

    const homeowner = withIdentity(fixture.base, {
      roles: ["homeowner"],
      subject: "user_homeowner",
    });
    const homeownerOptions = await homeowner.query(
      (api as any).build_collaboration_references
        .listBuildCollaborationTagOptions,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(
      homeownerOptions.some(
        (option: any) =>
          option.entityKind === "document" ||
          option.entityKind === "draw" ||
          option.entityKind === "evidenceAsset" ||
          option.entityKind === "evidencePackage",
      ),
    ).toBe(false);

    const legacyPostId = await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "build_wide",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Legacy reference container.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                { text: "Legacy reference container.", type: "text" },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    await fixture.base.run(async (ctx) => {
      const post = await ctx.db.get(
        legacyPostId as Id<"buildCollaborationPosts">,
      );
      const build = await ctx.db.get(fixture.buildId);
      if (!(post?.currentRevisionId && build)) {
        throw new Error("Legacy reference fixture is unavailable.");
      }
      await ctx.db.insert("buildCollaborationReferences", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: Date.now(),
        entityId: entities.drawId,
        entityKind: "draw",
        labelSnapshot: "SECRET DRAW $184,000",
        organizationId: build.organizationId,
        ownerKind: "postRevision",
        ownerRecordId: post.currentRevisionId,
        postId: legacyPostId,
        primary: true,
        summarySnapshot: "Secret lender release state",
      });
    });
    const contractorFeed = await contractor.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      },
    );
    const legacyEntry = contractorFeed.page.find(
      (entry: any) =>
        entry.kind === "post" && entry.post._id === legacyPostId,
    );
    expect(JSON.stringify(legacyEntry)).not.toContain("SECRET");
    expect(legacyEntry.references).toEqual([
      expect.objectContaining({ labelSnapshot: "Unavailable reference" }),
    ]);
  });

  test("persists canonical post and Action Item snapshots while feed reads current labels", async () => {
    const fixture = await seedActiveBuild();
    const entities = await seedCollaborationReferenceEntities(fixture);
    const postId = await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [
          {
            references: [
              {
                entityId: entities.materialId,
                entityKind: "material",
                label: "Forged material",
                primary: true,
                summary: "Forged supplier summary",
              },
            ],
            title: "Confirm concrete",
          },
        ],
        audienceMode: "author_tier_and_higher",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Foundation reference.",
        postType: "update",
        references: [
          {
            entityId: entities.milestoneId,
            entityKind: "milestone",
            label: "Forged milestone",
            primary: true,
            summary: "Forged milestone summary",
          },
        ],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [{ text: "Foundation reference.", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    const immutableSnapshots = await fixture.base.run(async (ctx) => {
      const references = await ctx.db
        .query("buildCollaborationReferences")
        .withIndex("by_postId", (query) => query.eq("postId", postId))
        .collect();
      await ctx.db.patch(entities.milestoneId, {
        name: "Foundation and footings",
      });
      return references;
    });
    expect(immutableSnapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: entities.milestoneId,
          labelSnapshot: "Foundation",
          ownerKind: "postRevision",
          summarySnapshot: "35% complete · in progress",
        }),
        expect.objectContaining({
          entityId: entities.materialId,
          labelSnapshot: "Concrete",
          ownerKind: "actionItem",
          summarySnapshot: "$12,500 · 10 qty",
        }),
      ]),
    );

    const feed = await fixture.admin.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      },
    );
    const published = feed.page.find(
      (entry: any) => entry.kind === "post" && entry.post._id === postId,
    );
    expect(published.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: entities.milestoneId,
          labelSnapshot: "Foundation and footings",
        }),
      ]),
    );
  });

  test("rewrites rich-text mentions from canonical references and rejects unmatched nodes", async () => {
    const fixture = await seedActiveBuild();
    await addBuildParticipant(fixture.base, {
      buildId: fixture.buildId,
      displayName: "Broker Reviewer",
      role: "broker",
      subject: "user_broker",
    });
    const mentionDocument = (
      id: string,
      label: string,
      kind = "participant",
    ) =>
      JSON.stringify({
        content: [
          {
            content: [
              {
                attrs: {
                  eyebrow: "Forged role",
                  id,
                  kind,
                  label,
                  summary: "Forged confidential summary",
                },
                type: "collaborationMention",
              },
            ],
            type: "paragraph",
          },
        ],
        type: "doc",
      });
    const postId = await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "author_tier_and_higher",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Client preview",
        postType: "update",
        references: [
          {
            entityId: "user_broker",
            entityKind: "participant",
            label: "Forged participant",
          },
        ],
        requestedReaderIds: [],
        tiptapJson: mentionDocument("user_broker", "SECRET FORGED LABEL"),
      },
    );
    const revision = await fixture.base.run(async (ctx) => {
      const post = await ctx.db.get(
        postId as Id<"buildCollaborationPosts">,
      );
      return post?.currentRevisionId
        ? await ctx.db.get(post.currentRevisionId)
        : null;
    });
    expect(revision?.plainText).toBe("Broker Reviewer");
    expect(revision?.tiptapJson).toContain('"label":"Broker Reviewer"');
    expect(revision?.tiptapJson).toContain('"eyebrow":"Broker"');
    expect(revision?.tiptapJson).not.toContain("SECRET");
    expect(revision?.tiptapJson).not.toContain("Forged");

    await expect(
      fixture.admin.mutation(
        (api as any).build_collaboration
          .approveAndPublishBuildCollaborationBundle,
        {
          actionItems: [],
          audienceMode: "author_tier_and_higher",
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          plainText: "Client preview",
          postType: "update",
          references: [],
          requestedReaderIds: [],
          tiptapJson: mentionDocument("missing-entity", "Leaked label"),
        },
      ),
    ).rejects.toThrow(
      "Every rich-text Build reference must match an authorized canonical reference.",
    );
  });

  test("uses current dynamic readers for comments and short-circuits system-event retries", async () => {
    const fixture = await seedActiveBuild();
    const entities = await seedCollaborationReferenceEntities(fixture);
    const buildWidePostId = await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "build_wide",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Dynamic audience post.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [{ text: "Dynamic audience post.", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    await addBuildParticipant(fixture.base, {
      buildId: fixture.buildId,
      displayName: "New contractor",
      role: "contractor",
      subject: "user_new_contractor",
    });
    await expect(
      fixture.admin.mutation(
        (api as any).build_collaboration_threads
          .addBuildCollaborationComment,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          plainText: "Financial comment.",
          postId: buildWidePostId,
          references: [
            {
              entityId: entities.drawId,
              entityKind: "draw",
              label: "Client draw label",
            },
          ],
          tiptapJson: JSON.stringify({
            content: [
              {
                content: [{ text: "Financial comment.", type: "text" }],
                type: "paragraph",
              },
            ],
            type: "doc",
          }),
        },
      ),
    ).rejects.toThrow(
      "The referenced entity is not readable by every publication reader.",
    );

    const systemArgs = {
      buildId: fixture.buildId,
      idempotencyKey: "reference-idempotency-1",
      organizationId: ORGANIZATION_ID,
      plainText: "Milestone changed.",
      postType: "update",
      primaryReferenceId: entities.milestoneId,
      primaryReferenceKind: "milestone",
      systemLabel: "DrawFlow",
    };
    const firstSystemPostId = await fixture.base.mutation(
      (internal as any).build_collaboration_system_events
        .publishBuildCollaborationSystemEvent,
      systemArgs,
    );
    await fixture.base.run(async (ctx) => {
      await ctx.db.delete(entities.milestoneId);
    });
    const retriedSystemPostId = await fixture.base.mutation(
      (internal as any).build_collaboration_system_events
        .publishBuildCollaborationSystemEvent,
      systemArgs,
    );
    expect(retriedSystemPostId).toBe(firstSystemPostId);
  });

  test("rejects cross-Build, archived, and mandatory-reader-incompatible references without leaking details", async () => {
    const fixture = await seedActiveBuild();
    const entities = await seedCollaborationReferenceEntities(fixture);
    await addBuildParticipant(fixture.base, {
      buildId: fixture.buildId,
      displayName: "Removed participant",
      role: "contractor",
      subject: "user_removed",
    });
    await addBuildParticipant(fixture.base, {
      buildId: fixture.buildId,
      displayName: "Active contractor",
      role: "contractor",
      subject: "user_contractor",
    });
    const { foreignMilestoneId } = await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      const sourceMilestone = await ctx.db.get(entities.milestoneId);
      if (!(build && sourceMilestone)) {
        throw new Error("Reference fixture is unavailable.");
      }
      const now = Date.now();
      const otherBuildId = await ctx.db.insert("activeBuilds", {
        brokerageId: build.brokerageId,
        buildName: "Other Build",
        builderProfileId: build.builderProfileId,
        createdAt: now,
        location: "Other address",
        organizationId: build.organizationId,
        proposalId: build.proposalId,
        startDate: "2026-08-01",
        status: "active",
        totalBudgetCents: 100_000_00,
        updatedAt: now,
        workflowRuleSnapshotId: build.workflowRuleSnapshotId,
      });
      const foreignMilestoneId = await ctx.db.insert("buildMilestones", {
        brokerageId: sourceMilestone.brokerageId,
        budgetCents: sourceMilestone.budgetCents,
        buildId: otherBuildId,
        createdAt: now,
        dayEnd: sourceMilestone.dayEnd,
        dayStart: sourceMilestone.dayStart,
        dependencyKeys: sourceMilestone.dependencyKeys,
        drawAvailabilityCents: sourceMilestone.drawAvailabilityCents,
        durationDays: sourceMilestone.durationDays,
        key: "foreign",
        name: "Foreign confidential milestone",
        order: sourceMilestone.order,
        organizationId: sourceMilestone.organizationId,
        proposalMilestoneId: sourceMilestone.proposalMilestoneId,
        status: sourceMilestone.status,
        updatedAt: now,
      });
      const removed = await ctx.db
        .query("buildParticipants")
        .withIndex("by_buildId_and_workosUserId", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq("workosUserId", "user_removed"),
        )
        .unique();
      if (removed) {
        await ctx.db.patch(removed._id, {
          removedAt: now,
          status: "removed",
          updatedAt: now,
          validUntil: now,
        });
      }
      return { foreignMilestoneId };
    });
    const publish = (reference: {
      entityId: string;
      entityKind: "draw" | "milestone" | "participant";
    }) =>
      fixture.admin.mutation(
        (api as any).build_collaboration
          .approveAndPublishBuildCollaborationBundle,
        {
          actionItems: [],
          audienceMode: "build_wide",
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          plainText: "Adversarial reference.",
          postType: "update",
          references: [{ ...reference, label: "Client-controlled disclosure" }],
          requestedReaderIds: [],
          tiptapJson: JSON.stringify({
            content: [
              {
                content: [
                  { text: "Adversarial reference.", type: "text" },
                ],
                type: "paragraph",
              },
            ],
            type: "doc",
          }),
        },
      );

    await expect(
      publish({
        entityId: foreignMilestoneId,
        entityKind: "milestone",
      }),
    ).rejects.toThrow(
      "The referenced entity does not exist in this active Build or is archived.",
    );
    await expect(
      publish({ entityId: "user_removed", entityKind: "participant" }),
    ).rejects.toThrow(
      "The referenced entity does not exist in this active Build or is archived.",
    );
    await expect(
      publish({ entityId: entities.drawId, entityKind: "draw" }),
    ).rejects.toThrow(
      "The referenced entity is not readable by every publication reader.",
    );
  });

  test("applies mandatory precedence, deterministic dedupe, mute rules, and transaction rollback", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    await addBuildParticipant(base, {
      buildId,
      displayName: "Broker Reviewer",
      role: "broker",
      subject: "user_broker",
    });
    await admin.run(async (ctx) => {
      const build = await ctx.db.get(buildId);
      if (!build) {
        throw new Error("Active Build fixture is unavailable.");
      }
      await ctx.db.insert("buildCollaborationNotificationPreferences", {
        brokerageId: build.brokerageId,
        buildId,
        channels: [],
        createdAt: 1,
        digestCadence: "never",
        digestEnabled: false,
        ordinaryMuted: true,
        organizationId: ORGANIZATION_ID,
        updatedAt: 1,
        workosUserId: "user_broker",
      });
      const brokerage = await ctx.db.get(build.brokerageId);
      const authorization = {
        brokerage,
        build,
        organizationId: ORGANIZATION_ID,
        viewer: { subject: "user_admin" },
      } as never;
      const common = {
        actionLabel: "Open thread",
        authorization,
        body: "Canonical notification body",
        entityId: "notification-source-1",
        entityType: "buildCollaborationPost",
        href: `/backoffice/builds/${buildId}?tab=details`,
        now: 10,
        readerIds: ["user_admin", "user_broker"],
        recipientWorkosUserId: "user_broker",
        title: "Canonical notification",
      } as const;
      expect(
        await emitCanonicalBuildCollaborationNotification(ctx as never, {
          ...common,
          dedupeKey: "notification:ordinary-muted",
          kind: "ordinary_activity",
        }),
      ).toBeNull();
      const first = await emitCanonicalBuildCollaborationNotification(
        ctx as never,
        {
          ...common,
          dedupeKey: "notification:mandatory-dedupe",
          kind: "direct_mention",
        },
      );
      const replay = await emitCanonicalBuildCollaborationNotification(
        ctx as never,
        {
          ...common,
          dedupeKey: "notification:mandatory-dedupe",
          kind: "direct_mention",
        },
      );
      expect(replay).toBe(first);
    });
    await expect(
      admin.run(async (ctx) => {
        const build = await ctx.db.get(buildId);
        const brokerage = build ? await ctx.db.get(build.brokerageId) : null;
        if (!(build && brokerage)) {
          throw new Error("Active Build fixture is unavailable.");
        }
        await emitCanonicalBuildCollaborationNotification(ctx as never, {
          actionLabel: "Open thread",
          authorization: {
            brokerage,
            build,
            organizationId: ORGANIZATION_ID,
            viewer: { subject: "user_admin" },
          } as never,
          body: "Must roll back",
          dedupeKey: "notification:forced-rollback",
          entityId: "notification-source-2",
          entityType: "buildCollaborationPost",
          href: `/backoffice/builds/${buildId}?tab=details`,
          kind: "assignment",
          now: 20,
          readerIds: ["user_admin", "user_broker"],
          recipientWorkosUserId: "user_broker",
          title: "Must roll back",
        });
        throw new Error("Force transaction rollback");
      }),
    ).rejects.toThrow("Force transaction rollback");
    const deliveries = await base.run(async (ctx) =>
      ctx.db.query("recipientDeliveries").collect(),
    );
    expect(deliveries).toEqual([
      expect.objectContaining({
        actionRequired: true,
        collaborationEventKind: "direct_mention",
        dedupeKey: "notification:mandatory-dedupe",
      }),
    ]);
  });

  test("rebuilds notification previews from readable canonical data and hides them after access revocation", async () => {
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
    const broker = withIdentity(base, {
      roles: ["broker"],
      subject: "user_broker",
    });
    const contractor = withIdentity(base, {
      roles: ["contractor"],
      subject: "user_contractor",
    });
    const restrictedPostId = await admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "author_tier_and_higher",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Restricted lender coordination.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                { text: "Restricted lender coordination.", type: "text" },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    await base.run(async (ctx) => {
      const build = await ctx.db.get(buildId);
      if (!build) {
        throw new Error("Active Build fixture is unavailable.");
      }
      await ctx.db.insert("recipientDeliveries", {
        actionLabel: "Open thread",
        actionRequired: true,
        body: "RESTRICTED LEAKED PREVIEW",
        brokerageId: build.brokerageId,
        collaborationBuildId: buildId,
        collaborationEventKind: "direct_mention",
        collaborationPostId: restrictedPostId,
        createdAt: 1,
        dedupeKey: "notification:restricted-stale-row",
        entityId: restrictedPostId,
        entityLabel: "RESTRICTED LEAKED LABEL",
        entityType: "buildCollaborationPost",
        href: `/backoffice/builds/${buildId}?tab=details`,
        organizationId: ORGANIZATION_ID,
        recipientWorkosUserId: "user_contractor",
        resolutionMode: "recipient",
        sourceLabel: "Build collaboration",
        status: "unread",
        title: "RESTRICTED LEAKED TITLE",
        updatedAt: 1,
      });
    });
    const restrictedInbox = await contractor.query(
      (api as any).build_collaboration_inbox.listRecipientInbox,
      {
        paginationOpts: { cursor: null, numItems: 100 },
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    expect(restrictedInbox.page).toEqual([]);
    expect(JSON.stringify(restrictedInbox)).not.toContain("RESTRICTED");
    const postId = await admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "build_wide",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Untrusted client preview.",
        postType: "update",
        references: [
          {
            entityId: "user_broker",
            entityKind: "participant",
            label: "Untrusted label",
          },
        ],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [{ text: "Canonical readable update.", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    await base.run(async (ctx) => {
      const delivery = await ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient", (query) =>
          query
            .eq("organizationId", ORGANIZATION_ID)
            .eq("recipientWorkosUserId", "user_broker"),
        )
        .first();
      if (!delivery) {
        throw new Error("Notification fixture is unavailable.");
      }
      await ctx.db.patch(delivery._id, {
        body: "RESTRICTED STORED PREVIEW",
        entityLabel: "RESTRICTED ENTITY LABEL",
      });
    });
    const before = await broker.query(
      (api as any).build_collaboration_inbox.listRecipientInbox,
      {
        paginationOpts: { cursor: null, numItems: 100 },
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    expect(before.page).toEqual([
      expect.objectContaining({
        body: "Canonical readable update.",
        entityId: postId,
        entityLabel: "147 Cedar Ridge",
      }),
    ]);
    expect(JSON.stringify(before)).not.toContain("RESTRICTED");

    await base.run(async (ctx) => {
      const participant = await ctx.db
        .query("buildParticipants")
        .withIndex("by_buildId_and_workosUserId", (query) =>
          query.eq("buildId", buildId).eq("workosUserId", "user_broker"),
        )
        .unique();
      if (!participant) {
        throw new Error("Participant fixture is unavailable.");
      }
      await ctx.db.patch(participant._id, {
        removedAt: 100,
        status: "removed",
        updatedAt: 100,
        validUntil: 100,
      });
    });
    const after = await broker.query(
      (api as any).build_collaboration_inbox.listRecipientInbox,
      {
        paginationOpts: { cursor: null, numItems: 100 },
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    expect(after.page).toEqual([]);
    const deliveryCountBefore = await base.run(async (ctx) =>
      ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient", (query) =>
          query
            .eq("organizationId", ORGANIZATION_ID)
            .eq("recipientWorkosUserId", "user_broker"),
        )
        .collect()
        .then((records) => records.length),
    );
    await admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "build_wide",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Update after participant revocation.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                { text: "Update after participant revocation.", type: "text" },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    const deliveryCountAfter = await base.run(async (ctx) =>
      ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient", (query) =>
          query
            .eq("organizationId", ORGANIZATION_ID)
            .eq("recipientWorkosUserId", "user_broker"),
        )
        .collect()
        .then((records) => records.length),
    );
    expect(deliveryCountAfter).toBe(deliveryCountBefore);
  });

  test("emits mention, followed-reply, and Build-wide pin events with follow mute semantics", async () => {
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
    const broker = withIdentity(base, {
      roles: ["broker"],
      subject: "user_broker",
    });
    const contractor = withIdentity(base, {
      roles: ["contractor"],
      subject: "user_contractor",
    });
    const postId = await admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "build_wide",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Follow this coordination thread.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                { text: "Follow this coordination thread.", type: "text" },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    await base.run(async (ctx) => {
      for (const delivery of await ctx.db.query("recipientDeliveries").collect()) {
        await ctx.db.delete(delivery._id);
      }
    });
    await admin.mutation(
      (api as any).build_collaboration_notifications
        .updateMyBuildCollaborationNotificationPreferences,
      {
        buildId,
        channels: ["in_app"],
        digestCadence: "daily",
        digestEnabled: true,
        ordinaryMuted: true,
        organizationId: ORGANIZATION_ID,
      },
    );
    await contractor.mutation(
      (api as any).build_collaboration_threads.addBuildCollaborationComment,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Broker, please review this reply.",
        postId,
        references: [
          {
            entityId: "user_broker",
            entityKind: "participant",
            label: "Broker Reviewer",
          },
        ],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                { text: "Broker, please review this reply.", type: "text" },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    let deliveries = await base.run(async (ctx) =>
      ctx.db.query("recipientDeliveries").collect(),
    );
    expect(deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collaborationEventKind: "direct_mention",
          recipientWorkosUserId: "user_broker",
        }),
      ]),
    );
    expect(
      deliveries.some(
        (delivery) =>
          delivery.collaborationEventKind === "followed_reply" &&
          delivery.recipientWorkosUserId === "user_admin",
      ),
    ).toBe(false);

    await admin.mutation(
      (api as any).build_collaboration_notifications
        .updateMyBuildCollaborationNotificationPreferences,
      {
        buildId,
        channels: ["in_app"],
        digestCadence: "daily",
        digestEnabled: true,
        ordinaryMuted: false,
        organizationId: ORGANIZATION_ID,
      },
    );
    await contractor.mutation(
      (api as any).build_collaboration_threads.addBuildCollaborationComment,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "A second followed reply.",
        postId,
        references: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [{ text: "A second followed reply.", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    await broker.mutation(
      (api as any).build_collaboration_threads.toggleBuildCollaborationPin,
      {
        buildId,
        kind: "build",
        organizationId: ORGANIZATION_ID,
        postId,
      },
    );
    deliveries = await base.run(async (ctx) =>
      ctx.db.query("recipientDeliveries").collect(),
    );
    expect(deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collaborationEventKind: "followed_reply",
          recipientWorkosUserId: "user_admin",
        }),
        expect.objectContaining({
          collaborationEventKind: "build_wide_pin",
          recipientWorkosUserId: "user_admin",
        }),
        expect.objectContaining({
          collaborationEventKind: "build_wide_pin",
          recipientWorkosUserId: "user_contractor",
        }),
      ]),
    );
  });

  test("defers ordinary publication activity while emitting direct and critical events immediately", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    await addBuildParticipant(base, {
      buildId,
      displayName: "Broker Reviewer",
      role: "broker",
      subject: "user_broker",
    });
    await base.run(async (ctx) => {
      for (const delivery of await ctx.db.query("recipientDeliveries").collect()) {
        await ctx.db.delete(delivery._id);
      }
    });

    await admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "build_wide",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Ordinary progress update.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [{ text: "Ordinary progress update.", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    expect(
      await base.run(async (ctx) => ctx.db.query("recipientDeliveries").collect()),
    ).toEqual([]);

    await admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "build_wide",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Broker review requested.",
        postType: "update",
        references: [
          {
            entityId: "user_broker",
            entityKind: "participant",
            label: "Untrusted label",
          },
        ],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                {
                  attrs: {
                    id: "user_broker",
                    kind: "participant",
                    label: "Untrusted label",
                  },
                  type: "collaborationMention",
                },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    const directDeliveries = await base.run(async (ctx) =>
      ctx.db.query("recipientDeliveries").collect(),
    );
    expect(directDeliveries).toEqual([
      expect.objectContaining({
        collaborationEventKind: "direct_mention",
        recipientWorkosUserId: "user_broker",
      }),
    ]);
  });

  test("paginates past more than one hundred unreadable rows without starving an older readable notification", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    await addBuildParticipant(base, {
      buildId,
      displayName: "Site Contractor",
      role: "contractor",
      subject: "user_contractor",
    });
    const contractor = withIdentity(base, {
      roles: ["contractor"],
      subject: "user_contractor",
    });
    const restrictedPostId = await admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "author_tier_and_higher",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Restricted lender coordination.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                { text: "Restricted lender coordination.", type: "text" },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    await base.run(async (ctx) => {
      const build = await ctx.db.get(buildId);
      if (!build) {
        throw new Error("Active Build fixture is unavailable.");
      }
      await ctx.db.insert("recipientDeliveries", {
        actionLabel: "Open build",
        actionRequired: false,
        body: "Readable legacy notification",
        brokerageId: build.brokerageId,
        createdAt: 1,
        dedupeKey: "notification:readable-oldest",
        entityId: buildId,
        entityLabel: build.buildName,
        entityType: "activeBuild",
        href: `/backoffice/builds/${buildId}`,
        organizationId: ORGANIZATION_ID,
        recipientWorkosUserId: "user_contractor",
        resolutionMode: "recipient",
        sourceLabel: "Build operations",
        status: "unread",
        title: "Readable notification",
        updatedAt: 1,
      });
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("recipientDeliveries", {
          actionLabel: "Open thread",
          actionRequired: true,
          body: `RESTRICTED ${index}`,
          brokerageId: build.brokerageId,
          collaborationBuildId: buildId,
          collaborationEventKind: "direct_mention",
          collaborationPostId: restrictedPostId,
          createdAt: index + 2,
          dedupeKey: `notification:restricted:${index}`,
          entityId: restrictedPostId,
          entityLabel: "RESTRICTED",
          entityType: "buildCollaborationPost",
          href: `/backoffice/builds/${buildId}`,
          organizationId: ORGANIZATION_ID,
          recipientWorkosUserId: "user_contractor",
          resolutionMode: "recipient",
          sourceLabel: "Build collaboration",
          status: "unread",
          title: "RESTRICTED",
          updatedAt: index + 2,
        });
      }
    });

    const firstPage = await contractor.query(
      (api as any).build_collaboration_inbox.listRecipientInbox,
      {
        paginationOpts: { cursor: null, numItems: 100 },
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    expect(firstPage.page).toEqual([]);
    expect(firstPage.isDone).toBe(false);
    const secondPage = await contractor.query(
      (api as any).build_collaboration_inbox.listRecipientInbox,
      {
        paginationOpts: { cursor: firstPage.continueCursor, numItems: 100 },
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    expect(secondPage.page).toEqual([
      expect.objectContaining({
        body: "Readable legacy notification",
        title: "Readable notification",
      }),
    ]);
    expect(JSON.stringify(secondPage)).not.toContain("RESTRICTED");
  });

  test("projects collaboration notification deep links onto every recipient's current role-safe Build route", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    const recipients = [
      {
        expectedPrefix: "/builder/builds",
        role: "builder" as const,
        subject: "user_builder",
      },
      {
        expectedPrefix: "/builder-staff/builds",
        role: "builder-staff" as const,
        subject: "user_builder_staff",
      },
      {
        expectedPrefix: "/contractor/builds",
        role: "contractor" as const,
        subject: "user_contractor",
      },
      {
        expectedPrefix: "/homeowner/builds",
        role: "homeowner" as const,
        subject: "user_homeowner",
      },
    ];
    for (const recipient of recipients.slice(1)) {
      await addBuildParticipant(base, {
        buildId,
        displayName: recipient.subject,
        role: recipient.role,
        subject: recipient.subject,
      });
    }
    const postId = await admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "build_wide",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Role-safe routing thread.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [{ text: "Role-safe routing thread.", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    const commentId = await admin.mutation(
      (api as any).build_collaboration_threads.addBuildCollaborationComment,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Focus this reply.",
        postId,
        references: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [{ text: "Focus this reply.", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    await base.run(async (ctx) => {
      const build = await ctx.db.get(buildId);
      if (!build) {
        throw new Error("Active Build fixture is unavailable.");
      }
      for (const delivery of await ctx.db.query("recipientDeliveries").collect()) {
        await ctx.db.delete(delivery._id);
      }
      for (const [index, recipient] of recipients.entries()) {
        await ctx.db.insert("recipientDeliveries", {
          actionLabel: "Open reply",
          actionRequired: true,
          body: "Untrusted stored reply preview",
          brokerageId: build.brokerageId,
          collaborationBuildId: buildId,
          collaborationCommentId: commentId,
          collaborationEventKind: "direct_mention",
          collaborationPostId: postId,
          createdAt: index + 1,
          dedupeKey: `notification:role-route:${recipient.subject}`,
          entityId: commentId,
          entityLabel: "Untrusted stored Build label",
          entityType: "buildCollaborationComment",
          href: `/backoffice/builds/${buildId}`,
          organizationId: ORGANIZATION_ID,
          recipientWorkosUserId: recipient.subject,
          resolutionMode: "recipient",
          sourceLabel: "Build collaboration",
          status: "unread",
          title: "Untrusted stored title",
          updatedAt: index + 1,
        });
      }
    });

    for (const recipient of recipients) {
      const inbox = await withIdentity(base, {
        roles: [recipient.role],
        subject: recipient.subject,
      }).query((api as any).build_collaboration_inbox.listRecipientInbox, {
        paginationOpts: { cursor: null, numItems: 100 },
        workosOrganizationId: ORGANIZATION_ID,
      });
      expect(inbox.page).toHaveLength(1);
      expect(inbox.page[0].href).toContain(
        `${recipient.expectedPrefix}/${buildId}`,
      );
      expect(inbox.page[0].href).not.toContain("collaborationPost=");
      expect(inbox.page[0].href).toContain(
        `focus=${encodeURIComponent(`comment:${commentId}`)}`,
      );
    }
  });

  test("revalidates a global author's current WorkOS role before future notifications", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    for (const subject of ["user_staff_demoted", "user_staff_revoked"]) {
      await addBuildParticipant(base, {
        buildId,
        displayName: subject,
        role: "builder-staff",
        subject,
      });
    }
    const postIds = await Promise.all(
      ["Demotion acknowledgement.", "Revocation acknowledgement."].map(
        (plainText) =>
          admin.mutation(
            (api as any).build_collaboration
              .approveAndPublishBuildCollaborationBundle,
            {
              acknowledgementRequired: true,
              actionItems: [],
              audienceMode: "build_wide",
              buildId,
              organizationId: ORGANIZATION_ID,
              plainText,
              postType: "announcement",
              references: [],
              requestedReaderIds: [],
              tiptapJson: JSON.stringify({
                content: [
                  {
                    content: [{ text: plainText, type: "text" }],
                    type: "paragraph",
                  },
                ],
                type: "doc",
              }),
            },
          ),
      ),
    );
    const membershipId = await base.run(async (ctx) => {
      const membership = await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_user_and_organization", (query) =>
          query
            .eq("workosUserId", "user_admin")
            .eq("workosOrganizationId", ORGANIZATION_ID),
        )
        .first();
      if (!membership) {
        throw new Error("Admin WorkOS membership fixture is unavailable.");
      }
      for (const delivery of await ctx.db.query("recipientDeliveries").collect()) {
        await ctx.db.delete(delivery._id);
      }
      return membership.workosMembershipId;
    });
    await base.mutation((internal as any).workosProjection.ingestWorkosEvent, {
      data: {
        id: membershipId,
        organization_id: ORGANIZATION_ID,
        role: { slug: "broker" },
        status: "active",
        user_id: "user_admin",
      },
      event: "organization_membership.updated",
      id: "test_admin_demoted",
    });
    await withIdentity(base, {
      roles: ["builder-staff"],
      subject: "user_staff_demoted",
    }).mutation(
      (api as any).build_collaboration_acknowledgements
        .acknowledgeBuildCollaborationPost,
      { buildId, organizationId: ORGANIZATION_ID, postId: postIds[0] },
    );
    await base.mutation((internal as any).workosProjection.ingestWorkosEvent, {
      data: {
        id: membershipId,
        organization_id: ORGANIZATION_ID,
        user_id: "user_admin",
      },
      event: "organization_membership.deleted",
      id: "test_admin_revoked",
    });
    await withIdentity(base, {
      roles: ["builder-staff"],
      subject: "user_staff_revoked",
    }).mutation(
      (api as any).build_collaboration_acknowledgements
        .acknowledgeBuildCollaborationPost,
      { buildId, organizationId: ORGANIZATION_ID, postId: postIds[1] },
    );

    const authorDeliveries = await base.run(async (ctx) =>
      ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient", (query) =>
          query
            .eq("organizationId", ORGANIZATION_ID)
            .eq("recipientWorkosUserId", "user_admin"),
        )
        .collect(),
    );
    expect(authorDeliveries).toEqual([]);
  });

  test("keeps a removed implicit participant excluded beyond five hundred histories and restores a later reinvitation", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    await base.run(async (ctx) => {
      const build = await ctx.db.get(buildId);
      if (!build) {
        throw new Error("Active Build fixture is unavailable.");
      }
      for (let index = 0; index < 501; index += 1) {
        await ctx.db.insert("buildParticipants", {
          brokerageId: build.brokerageId,
          buildId,
          createdAt: index + 1,
          displayNameSnapshot: `Removed filler ${index}`,
          organizationId: ORGANIZATION_ID,
          participationPeriod: 1,
          removedAt: index + 1,
          role: "contractor",
          status: "removed",
          updatedAt: index + 1,
          validFrom: 0,
          validUntil: index + 1,
          workosUserId: `removed_filler_${index}`,
        });
      }
      await ctx.db.insert("buildParticipants", {
        brokerageId: build.brokerageId,
        buildId,
        createdAt: 1_000,
        displayNameSnapshot: "Removed implicit broker",
        organizationId: ORGANIZATION_ID,
        participationPeriod: 1,
        removedAt: 1_000,
        role: "broker",
        status: "removed",
        updatedAt: 1_000,
        validFrom: 0,
        validUntil: 1_000,
        workosUserId: "user_broker",
      });
    });
    let options = await admin.query(
      (api as any).build_collaboration_references
        .listBuildCollaborationTagOptions,
      { buildId, organizationId: ORGANIZATION_ID },
    );
    expect(
      options.some(
        (option: any) =>
          option.entityKind === "participant" &&
          option.entityId === "user_broker",
      ),
    ).toBe(false);

    await base.run(async (ctx) => {
      const build = await ctx.db.get(buildId);
      if (!build) {
        throw new Error("Active Build fixture is unavailable.");
      }
      await ctx.db.insert("buildParticipants", {
        brokerageId: build.brokerageId,
        buildId,
        createdAt: 2_000,
        displayNameSnapshot: "Reinvited broker",
        joinedAt: 2_000,
        organizationId: ORGANIZATION_ID,
        participationPeriod: 2,
        role: "broker",
        status: "active",
        updatedAt: 2_000,
        validFrom: 2_000,
        workosUserId: "user_broker",
      });
    });
    options = await admin.query(
      (api as any).build_collaboration_references
        .listBuildCollaborationTagOptions,
      { buildId, organizationId: ORGANIZATION_ID },
    );
    expect(
      options.some(
        (option: any) =>
          option.entityKind === "participant" &&
          option.entityId === "user_broker",
      ),
    ).toBe(true);
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
