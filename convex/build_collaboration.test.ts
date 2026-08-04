/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { emitCanonicalBuildCollaborationNotification } from "./build_collaboration_notifications";
import { syncBuildCollaborationSearchAuthority } from "./build_collaboration_search_authority_projection";
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
    tokenIdentifier: tokenIdentifier ?? `https://api.workos.com/|${subject}`,
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
  await admin.run(async (ctx) => {
    const memberships = (
      await ctx.db.query("workosOrganizationMemberships").collect()
    ).filter(
      (membership) => membership.workosOrganizationId === ORGANIZATION_ID,
    );
    for (const membership of memberships) {
      await syncBuildCollaborationSearchAuthority(ctx, membership);
    }
  });
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
    (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
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
      const externalDeliveries = await ctx.db
        .query("buildCollaborationExternalDeliveries")
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
        externalDeliveries,
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
    const assignedFeed = await admin.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      },
    );
    expect(assignedFeed.page[0]).toMatchObject({
      actionItems: [
        expect.objectContaining({
          assigneeWorkosUserId: "user_broker",
          assignmentState: "assigned",
        }),
      ],
    });
    expect(persisted.references).toEqual([
      expect.objectContaining({
        entityId: "user_broker",
        labelSnapshot: "Broker Reviewer",
        primary: true,
        summarySnapshot: "Broker on this Build",
      }),
    ]);
    expect(persisted.outbox.map((event) => event.eventType)).toContain(
      "build_collaboration.shared_mutation.requested",
    );
    expect(persisted.externalDeliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: "email",
          eventKind: "assignment",
          status: "queued",
        }),
      ]),
    );
    expect(persisted.approvals).toEqual([]);
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
                content: [{ text: "Build-local publication.", type: "text" }],
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
      (api as any).build_collaboration_drafts.saveMyBuildCollaborationDraft,
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
      (api as any).build_collaboration_drafts.listMyBuildCollaborationDrafts,
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
        approvals: approvals.filter((approval) => approval.draftId === draftId),
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

  test("publishes a human-authored draft without creating a HITL approval", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    const preparedDraft = await admin.mutation(
      (api as any).build_collaboration_drafts.saveMyBuildCollaborationDraft,
      {
        acknowledgementRequired: false,
        actionItems: [],
        audienceMode: "build_wide",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Written and submitted entirely by a human.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                {
                  text: "Written and submitted entirely by a human.",
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
    const postId = await admin.mutation(
      (api as any).build_collaboration_drafts
        .approveAndPublishBuildCollaborationDraft,
      { buildId, draftId, organizationId: ORGANIZATION_ID },
    );
    const result = await base.run(async (ctx) => ({
      approvals: (
        await ctx.db.query("buildCollaborationPublicationApprovals").collect()
      ).filter((approval) => approval.draftId === draftId),
      post: await ctx.db.get(postId),
    }));
    expect(result.post).toMatchObject({
      agentDrafted: false,
      authorWorkosUserId: "user_admin",
      source: "human",
    });
    expect(result.approvals).toEqual([]);
  });

  test("invalidates human approval when the exact prepared bundle changes", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    const agent = withIdentity(base, {
      actorKind: "agent",
      roles: ["admin"],
      subject: "svc-opaque-tamper",
    });
    const preparedDraft = await agent.mutation(
      (api as any).build_collaboration_drafts.saveMyBuildCollaborationDraft,
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
        (api as any).build_collaboration_threads.addBuildCollaborationComment,
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
      (api as any).build_collaboration_threads.markBuildCollaborationPostViewed,
      { buildId, organizationId: ORGANIZATION_ID, postId },
    );
    await admin.mutation(
      (api as any).build_collaboration_threads.markBuildCollaborationPostViewed,
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

describe("Build collaboration governed assets", () => {
  test("preserves the optional governed asset reference on Build Documents", async () => {
    const { base, buildId } = await seedActiveBuild();
    const governedAssetId = await base.run(async (ctx) => {
      const build = await ctx.db.get(buildId);
      if (!build) {
        throw new Error("Build fixture is unavailable.");
      }
      const storageId = await ctx.storage.store(
        new Blob(["governed permit"], { type: "application/pdf" }),
      );
      const now = Date.now();
      return await ctx.db.insert("buildCollaborationAssets", {
        brokerageId: build.brokerageId,
        buildId,
        contentHashSha256: "a".repeat(64),
        createdAt: now,
        fileName: "permit.pdf",
        maximumAudienceMode: "build_wide",
        mimeType: "application/pdf",
        organizationId: ORGANIZATION_ID,
        scanState: "clean",
        sizeBytes: 14,
        state: "available",
        storageId,
        updatedAt: now,
        uploadedByWorkosUserId: "user_admin",
        version: 1,
      });
    });

    const documentId = await base.run(async (ctx) => {
      const build = await ctx.db.get(buildId);
      if (!build) {
        throw new Error("Build fixture is unavailable.");
      }
      return await ctx.db.insert("buildDocuments", {
        brokerageId: build.brokerageId,
        buildId,
        createdAt: Date.now(),
        documentType: "permit",
        fileName: "permit.pdf",
        governedAssetId,
        mimeType: "application/pdf",
        organizationId: ORGANIZATION_ID,
        proposalId: build.proposalId,
        sizeBytes: 14,
        status: "uploaded",
        updatedAt: Date.now(),
        uploadedByWorkosUserId: "user_admin",
      });
    });

    expect(
      await base.run(async (ctx) => ctx.db.get(documentId)),
    ).toMatchObject({ governedAssetId });
  });

  test("finalizes through the public scan action and only returns a clean asset", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    const staged = await admin.mutation(
      (api as any).build_collaboration_assets
        .beginBuildCollaborationAssetUpload,
      {
        buildId,
        contextKind: "composer",
        fileName: "scanner-fixture.txt",
        mimeType: "text/plain",
        organizationId: ORGANIZATION_ID,
        sizeBytes: 22,
      },
    );
    const storageId = await base.run(
      async (ctx) =>
        await ctx.storage.store(
          new Blob(["scanner action fixture"], { type: "text/plain" }),
        ),
    );
    const hash = "a".repeat(64);
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ clean: true, sha256: hash }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
    );
    vi.stubEnv(
      "BUILD_COLLABORATION_ASSET_SCAN_URL",
      "https://scanner.example.test/v1/scan",
    );
    vi.stubEnv("BUILD_COLLABORATION_ASSET_SCAN_BEARER_TOKEN", "scanner-secret");
    vi.stubGlobal("fetch", fetchMock);
    try {
      const status = await admin.action(
        (api as any).build_collaboration_asset_actions
          .finalizeAndScanBuildCollaborationAssetUpload,
        {
          buildId,
          contentHashSha256: hash,
          fileName: "scanner-fixture.txt",
          mimeType: "text/plain",
          organizationId: ORGANIZATION_ID,
          stagingSessionId: staged.stagingSessionId,
          storageId,
        },
      );
      expect(status).toMatchObject({
        contentHashSha256: hash,
        scanState: "clean",
        state: "available",
        version: 1,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://scanner.example.test/v1/scan",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer scanner-secret",
          }),
          method: "POST",
        }),
      );
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  test("quarantines, scans, publishes, versions, downloads, and audits immutable assets", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    const staged = await admin.mutation(
      (api as any).build_collaboration_assets
        .beginBuildCollaborationAssetUpload,
      {
        buildId,
        contextKind: "composer",
        fileName: "footing.jpg",
        mimeType: "image/jpeg",
        organizationId: ORGANIZATION_ID,
        sizeBytes: 22,
      },
    );
    const storageId = await base.run(
      async (ctx) =>
        await ctx.storage.store(
          new Blob(["governed footing photo"], { type: "image/jpeg" }),
        ),
    );
    const hash = "d".repeat(64);
    const assetId: Id<"buildCollaborationAssets"> = await admin.mutation(
      (api as any).build_collaboration_assets
        .finalizeBuildCollaborationAssetUpload,
      {
        buildId,
        contentHashSha256: hash,
        fileName: "footing.jpg",
        mimeType: "image/jpeg",
        organizationId: ORGANIZATION_ID,
        stagingSessionId: staged.stagingSessionId,
        storageId,
      },
    );
    const publication = {
      actionItems: [],
      attachmentAssetIds: [assetId],
      audienceMode: "build_wide" as const,
      buildId,
      organizationId: ORGANIZATION_ID,
      plainText: "Attached footing photo.",
      postType: "update" as const,
      references: [],
      requestedReaderIds: [],
      tiptapJson: JSON.stringify({
        content: [
          {
            content: [{ text: "Attached footing photo.", type: "text" }],
            type: "paragraph",
          },
        ],
        type: "doc",
      }),
    };
    const postsBefore = await base.run(
      async (ctx) =>
        (await ctx.db.query("buildCollaborationPosts").collect()).length,
    );
    await expect(
      admin.mutation(
        (api as any).build_collaboration
          .approveAndPublishBuildCollaborationBundle,
        publication,
      ),
    ).rejects.toThrow("asset is unavailable");
    expect(
      await base.run(
        async (ctx) =>
          (await ctx.db.query("buildCollaborationPosts").collect()).length,
      ),
    ).toBe(postsBefore);

    await base.mutation(
      (internal as any).build_collaboration_asset_maintenance
        .recordBuildCollaborationAssetScanResult,
      {
        assetId,
        computedHashSha256: hash,
        outcome: "clean",
        provider: "test-scanner",
      },
    );
    const postId: Id<"buildCollaborationPosts"> = await admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      publication,
    );
    const downloadUrl = await admin.mutation(
      (api as any).build_collaboration_assets
        .authorizeBuildCollaborationAssetDownload,
      { assetId, buildId, organizationId: ORGANIZATION_ID },
    );
    expect(downloadUrl).toContain("http");
    await base.run(async (ctx) => {
      await ctx.db.patch(assetId, { lineageRootAssetId: undefined });
    });

    const replacementSession = await admin.mutation(
      (api as any).build_collaboration_assets
        .beginBuildCollaborationAssetUpload,
      {
        buildId,
        contextKind: "composer",
        fileName: "footing-v2.jpg",
        mimeType: "image/jpeg",
        organizationId: ORGANIZATION_ID,
        sizeBytes: 26,
      },
    );
    const replacementStorageId = await base.run(
      async (ctx) =>
        await ctx.storage.store(
          new Blob(["new governed footing photo"], { type: "image/jpeg" }),
        ),
    );
    const replacementHash = "e".repeat(64);
    const replacementId: Id<"buildCollaborationAssets"> = await admin.mutation(
      (api as any).build_collaboration_assets
        .finalizeBuildCollaborationAssetUpload,
      {
        buildId,
        contentHashSha256: replacementHash,
        fileName: "footing-v2.jpg",
        mimeType: "image/jpeg",
        organizationId: ORGANIZATION_ID,
        stagingSessionId: replacementSession.stagingSessionId,
        storageId: replacementStorageId,
        supersedesAssetId: assetId,
      },
    );
    await base.mutation(
      (internal as any).build_collaboration_asset_maintenance
        .recordBuildCollaborationAssetScanResult,
      {
        assetId: replacementId,
        computedHashSha256: replacementHash,
        outcome: "clean",
        provider: "test-scanner",
      },
    );

    const beforeReplacementPublication = await base.run(async (ctx) => ({
      original: await ctx.db.get(assetId),
      replacement: await ctx.db.get(replacementId),
    }));
    expect(beforeReplacementPublication.original).toMatchObject({
      state: "available",
      version: 1,
    });
    expect(beforeReplacementPublication.replacement).toMatchObject({
      state: "available",
      version: 2,
    });
    expect(
      beforeReplacementPublication.replacement?.publishedAt,
    ).toBeUndefined();
    const conflictingSession = await admin.mutation(
      (api as any).build_collaboration_assets
        .beginBuildCollaborationAssetUpload,
      {
        buildId,
        contextKind: "composer",
        fileName: "conflicting.txt",
        mimeType: "text/plain",
        organizationId: ORGANIZATION_ID,
        sizeBytes: 11,
      },
    );
    const conflictingStorageId = await base.run(
      async (ctx) =>
        await ctx.storage.store(
          new Blob(["conflicting"], { type: "text/plain" }),
        ),
    );
    await admin.mutation(
      (api as any).build_collaboration_assets
        .registerBuildCollaborationAssetUploadedStorage,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
        stagingSessionId: conflictingSession.stagingSessionId,
        storageId: conflictingStorageId,
      },
    );
    await expect(
      admin.action(
        (api as any).build_collaboration_asset_actions
          .finalizeAndScanBuildCollaborationAssetUpload,
        {
          buildId,
          contentHashSha256: "7".repeat(64),
          fileName: "conflicting.txt",
          mimeType: "text/plain",
          organizationId: ORGANIZATION_ID,
          stagingSessionId: conflictingSession.stagingSessionId,
          storageId: conflictingStorageId,
          supersedesAssetId: assetId,
        },
      ),
    ).rejects.toThrow("newer asset version");
    const conflictingCleanup = await base.run(async (ctx) => ({
      session: await ctx.db.get(conflictingSession.stagingSessionId),
      storage: await ctx.db.system.get(conflictingStorageId),
    }));
    expect(conflictingCleanup.session).toMatchObject({ state: "abandoned" });
    expect(conflictingCleanup.storage).toBeNull();
    await admin.mutation(
      (api as any).build_collaboration_threads.addBuildCollaborationComment,
      {
        attachmentAssetIds: [replacementId],
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Published the governed replacement.",
        postId,
        references: [],
        tiptapJson: collaborationDocument(
          "Published the governed replacement.",
        ),
      },
    );

    const state = await base.run(async (ctx) => {
      const audits = await ctx.db.query("auditEvents").collect();
      const attachments = await ctx.db
        .query("buildCollaborationAttachments")
        .withIndex("by_buildId_and_attachmentKind_and_attachmentId", (query) =>
          query
            .eq("buildId", buildId)
            .eq("attachmentKind", "collaborationAsset")
            .eq("attachmentId", assetId),
        )
        .collect();
      return {
        audits: audits.filter((audit) => audit.entityId === assetId),
        attachments,
        original: await ctx.db.get(assetId),
        replacement: await ctx.db.get(replacementId),
      };
    });
    expect(state.original).toMatchObject({ state: "superseded", version: 1 });
    expect(state.replacement).toMatchObject({
      state: "available",
      supersedesAssetId: assetId,
      version: 2,
    });
    expect(state.attachments).toEqual([
      expect.objectContaining({ ownerKind: "postRevision" }),
    ]);
    expect(state.audits.map((audit) => audit.eventType)).toEqual(
      expect.arrayContaining([
        "build.collaboration.asset.quarantined",
        "build.collaboration.asset.scan_passed",
        "build.collaboration.asset.published",
        "build.collaboration.asset.download_authorized",
      ]),
    );
    expect(postId).toBeDefined();
  });

  test("keeps draft assets private, publishes comment assets atomically, and rejects cross-Build reuse", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    const postId = await admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      collaborationPublicationFixture({
        buildId,
        plainText: "A post with a governed reply attachment.",
      }),
    );
    const commentSession = await admin.mutation(
      (api as any).build_collaboration_assets
        .beginBuildCollaborationAssetUpload,
      {
        buildId,
        contextKind: "post",
        contextRecordId: postId,
        fileName: "comment-attachment.pdf",
        mimeType: "application/pdf",
        organizationId: ORGANIZATION_ID,
        sizeBytes: 18,
      },
    );
    const commentStorageId = await base.run(
      async (ctx) =>
        await ctx.storage.store(
          new Blob(["comment attachment"], { type: "application/pdf" }),
        ),
    );
    const commentHash = "3".repeat(64);
    const commentAssetId = await admin.mutation(
      (api as any).build_collaboration_assets
        .finalizeBuildCollaborationAssetUpload,
      {
        buildId,
        contentHashSha256: commentHash,
        fileName: "comment-attachment.pdf",
        mimeType: "application/pdf",
        organizationId: ORGANIZATION_ID,
        stagingSessionId: commentSession.stagingSessionId,
        storageId: commentStorageId,
      },
    );
    await base.mutation(
      (internal as any).build_collaboration_asset_maintenance
        .recordBuildCollaborationAssetScanResult,
      {
        assetId: commentAssetId,
        computedHashSha256: commentHash,
        outcome: "clean",
        provider: "test-scanner",
      },
    );
    const commentId = await admin.mutation(
      (api as any).build_collaboration_threads.addBuildCollaborationComment,
      {
        attachmentAssetIds: [commentAssetId],
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "The governed report is attached.",
        postId,
        references: [],
        tiptapJson: collaborationDocument("The governed report is attached."),
      },
    );
    const comments = await admin.query(
      (api as any).build_collaboration_threads.listBuildCollaborationComments,
      { buildId, organizationId: ORGANIZATION_ID, postId },
    );
    expect(comments).toHaveLength(1);
    expect(comments[0]?.attachments).toEqual([
      expect.objectContaining({
        assetId: commentAssetId,
        fileName: "comment-attachment.pdf",
        state: "available",
        version: 1,
      }),
    ]);
    await expect(
      admin.query(
        (api as any).build_collaboration_focus
          .getFocusedBuildCollaborationAssetContext,
        {
          assetId: commentAssetId,
          buildId,
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).resolves.toEqual({
      assetId: commentAssetId,
      commentId,
      postId,
      state: "visible",
    });

    const draftBundle = collaborationPublicationFixture({
      buildId,
      plainText: "A private draft with a governed attachment.",
    });
    const initialDraft = await admin.mutation(
      (api as any).build_collaboration_drafts.saveMyBuildCollaborationDraft,
      draftBundle,
    );
    const draftSession = await admin.mutation(
      (api as any).build_collaboration_assets
        .beginBuildCollaborationAssetUpload,
      {
        buildId,
        contextKind: "draft",
        contextRecordId: initialDraft.draftId,
        fileName: "private-draft.jpg",
        mimeType: "image/jpeg",
        organizationId: ORGANIZATION_ID,
        sizeBytes: 24,
      },
    );
    const draftStorageId = await base.run(
      async (ctx) =>
        await ctx.storage.store(
          new Blob(["private draft attachment"], { type: "image/jpeg" }),
        ),
    );
    const draftHash = "4".repeat(64);
    const draftAssetId = (await admin.mutation(
      (api as any).build_collaboration_assets
        .finalizeBuildCollaborationAssetUpload,
      {
        buildId,
        contentHashSha256: draftHash,
        fileName: "private-draft.jpg",
        mimeType: "image/jpeg",
        organizationId: ORGANIZATION_ID,
        stagingSessionId: draftSession.stagingSessionId,
        storageId: draftStorageId,
      },
    )) as Id<"buildCollaborationAssets">;
    await base.mutation(
      (internal as any).build_collaboration_asset_maintenance
        .recordBuildCollaborationAssetScanResult,
      {
        assetId: draftAssetId,
        computedHashSha256: draftHash,
        outcome: "clean",
        provider: "test-scanner",
      },
    );
    await admin.mutation(
      (api as any).build_collaboration_drafts.saveMyBuildCollaborationDraft,
      {
        ...draftBundle,
        attachmentAssetIds: [draftAssetId],
        draftId: initialDraft.draftId,
        expectedRevision: initialDraft.revision,
      },
    );
    const openSession = await admin.mutation(
      (api as any).build_collaboration_assets
        .beginBuildCollaborationAssetUpload,
      {
        buildId,
        contextKind: "draft",
        contextRecordId: initialDraft.draftId,
        fileName: "unfinished-draft.txt",
        mimeType: "text/plain",
        organizationId: ORGANIZATION_ID,
        sizeBytes: 17,
      },
    );
    const openStorageId = await base.run(
      async (ctx) =>
        await ctx.storage.store(
          new Blob(["unfinished upload"], { type: "text/plain" }),
        ),
    );
    await admin.mutation(
      (api as any).build_collaboration_assets
        .registerBuildCollaborationAssetUploadedStorage,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
        stagingSessionId: openSession.stagingSessionId,
        storageId: openStorageId,
      },
    );
    const beforeDiscard = await base.run(async (ctx) => ({
      asset: await ctx.db.get(draftAssetId),
      attachments: await ctx.db
        .query("buildCollaborationAttachments")
        .withIndex("by_buildId_and_attachmentKind_and_attachmentId", (query) =>
          query
            .eq("buildId", buildId)
            .eq("attachmentKind", "collaborationAsset")
            .eq("attachmentId", draftAssetId),
        )
        .collect(),
    }));
    expect(beforeDiscard.attachments).toEqual([]);
    expect(beforeDiscard.asset?.originatingPostId).toBeUndefined();
    await admin.mutation(
      (api as any).build_collaboration_drafts.discardMyBuildCollaborationDraft,
      {
        buildId,
        draftId: initialDraft.draftId,
        organizationId: ORGANIZATION_ID,
      },
    );
    const afterDiscard = await base.run(async (ctx) => {
      const session = await ctx.db.get(draftSession.stagingSessionId);
      const openStagingSession = await ctx.db.get(openSession.stagingSessionId);
      const audits = await ctx.db.query("auditEvents").collect();
      return {
        asset: await ctx.db.get(draftAssetId),
        audit: audits.find(
          (audit) =>
            audit.entityId === draftAssetId &&
            audit.eventType === "build.collaboration.asset.abandoned",
        ),
        openStagingSession,
        openStorage: await ctx.db.system.get(openStorageId),
        session,
      };
    });
    expect(afterDiscard.asset).toMatchObject({ state: "rejected" });
    expect(afterDiscard.openStagingSession).toMatchObject({
      state: "abandoned",
    });
    expect(afterDiscard.openStorage).toBeNull();
    expect(afterDiscard.session).toMatchObject({ state: "abandoned" });
    await base.mutation(
      (internal as any).build_collaboration_asset_maintenance
        .recordBuildCollaborationAssetScanResult,
      {
        assetId: draftAssetId,
        computedHashSha256: draftHash,
        outcome: "clean",
        provider: "late-test-scanner",
      },
    );
    const afterLateScan = await base.run(async (ctx) => ({
      asset: await ctx.db.get(draftAssetId),
      storage: await ctx.db.system.get(draftStorageId),
    }));
    expect(afterLateScan.asset).toMatchObject({
      scanState: "rejected",
      state: "rejected",
    });
    expect(afterLateScan.storage).toBeNull();
    expect(afterDiscard.audit).toBeDefined();

    const secondBuildId = await base.run(async (ctx) => {
      const sourceBuild = await ctx.db.get(buildId);
      if (!sourceBuild) {
        throw new Error("Active Build fixture is unavailable.");
      }
      const { _creationTime, _id, ...copy } = sourceBuild;
      return await ctx.db.insert("activeBuilds", {
        ...copy,
        buildName: "148 Cedar Ridge",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    await expect(
      admin.mutation(
        (api as any).build_collaboration
          .approveAndPublishBuildCollaborationBundle,
        collaborationPublicationFixture({
          attachmentAssetIds: [commentAssetId],
          buildId: secondBuildId,
          plainText: "A cross-Build attachment must fail.",
        }),
      ),
    ).rejects.toThrow("asset is unavailable");
  });

  test("rejects scanner failures, orphan assets, tenant forgery, and removed-reader downloads", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    await addBuildParticipant(base, {
      buildId,
      displayName: "Builder Reader",
      role: "builder",
      subject: "user_asset_reader",
    });
    const reader = withIdentity(base, {
      roles: ["builder"],
      subject: "user_asset_reader",
    });
    const session = await admin.mutation(
      (api as any).build_collaboration_assets
        .beginBuildCollaborationAssetUpload,
      {
        buildId,
        contextKind: "composer",
        fileName: "inspection.pdf",
        mimeType: "application/pdf",
        organizationId: ORGANIZATION_ID,
        sizeBytes: 12,
      },
    );
    const storageId = await base.run(
      async (ctx) =>
        await ctx.storage.store(
          new Blob(["unsafe bytes"], { type: "application/pdf" }),
        ),
    );
    const assetId = await admin.mutation(
      (api as any).build_collaboration_assets
        .finalizeBuildCollaborationAssetUpload,
      {
        buildId,
        contentHashSha256: "f".repeat(64),
        fileName: "inspection.pdf",
        mimeType: "application/pdf",
        organizationId: ORGANIZATION_ID,
        stagingSessionId: session.stagingSessionId,
        storageId,
      },
    );
    await base.mutation(
      (internal as any).build_collaboration_asset_maintenance
        .recordBuildCollaborationAssetScanResult,
      {
        assetId,
        computedHashSha256: "0".repeat(64),
        outcome: "clean",
        provider: "test-scanner",
      },
    );
    await expect(
      admin.mutation(
        (api as any).build_collaboration_assets
          .authorizeBuildCollaborationAssetDownload,
        { assetId, buildId, organizationId: ORGANIZATION_ID },
      ),
    ).rejects.toThrow("unavailable");
    await expect(
      admin.mutation(
        (api as any).build_collaboration_assets
          .beginBuildCollaborationAssetUpload,
        {
          buildId,
          contextKind: "composer",
          fileName: "forged.txt",
          mimeType: "text/plain",
          organizationId: "org_forged",
          sizeBytes: 1,
        },
      ),
    ).rejects.toThrow();

    const orphanId = await base.run(async (ctx) => {
      const build = await ctx.db.get(buildId);
      if (!build) {
        throw new Error("Build fixture is unavailable.");
      }
      const orphanStorageId = await ctx.storage.store(
        new Blob(["orphan"], { type: "text/plain" }),
      );
      const now = Date.now();
      return await ctx.db.insert("buildCollaborationAssets", {
        brokerageId: build.brokerageId,
        buildId,
        contentHashSha256: "1".repeat(64),
        createdAt: now,
        fileName: "orphan.txt",
        maximumAudienceMode: "build_wide",
        mimeType: "text/plain",
        organizationId: ORGANIZATION_ID,
        scanState: "clean",
        sizeBytes: 6,
        state: "available",
        storageId: orphanStorageId,
        updatedAt: now,
        uploadedByWorkosUserId: "user_admin",
        version: 1,
      });
    });
    await expect(
      admin.mutation(
        (api as any).build_collaboration
          .approveAndPublishBuildCollaborationBundle,
        {
          actionItems: [],
          attachmentAssetIds: [orphanId],
          audienceMode: "build_wide",
          buildId,
          organizationId: ORGANIZATION_ID,
          plainText: "Orphan should fail.",
          postType: "update",
          references: [],
          requestedReaderIds: [],
          tiptapJson: JSON.stringify({
            content: [
              {
                content: [{ text: "Orphan should fail.", type: "text" }],
                type: "paragraph",
              },
            ],
            type: "doc",
          }),
        },
      ),
    ).rejects.toThrow("orphaned");

    const publishedAssetId = await createPublishedAssetFixture({
      admin,
      base,
      buildId,
    });
    await expect(
      reader.mutation(
        (api as any).build_collaboration_assets
          .authorizeBuildCollaborationAssetDownload,
        {
          assetId: publishedAssetId,
          buildId,
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).resolves.toContain("http");
    await base.run(async (ctx) => {
      const participant = await ctx.db
        .query("buildParticipants")
        .withIndex("by_buildId_and_workosUserId", (query) =>
          query.eq("buildId", buildId).eq("workosUserId", "user_asset_reader"),
        )
        .unique();
      if (participant) {
        await ctx.db.patch(participant._id, {
          status: "removed",
          updatedAt: Date.now(),
        });
      }
    });
    await expect(
      reader.mutation(
        (api as any).build_collaboration_assets
          .authorizeBuildCollaborationAssetDownload,
        {
          assetId: publishedAssetId,
          buildId,
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow();
  });

  test("reauthorizes staged post contexts and exhausts asset attachment ACL pages", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    await addBuildParticipant(base, {
      buildId,
      displayName: "Asset Builder Reader",
      role: "builder",
      subject: "user_asset_builder_reader",
    });
    await addBuildParticipant(base, {
      buildId,
      displayName: "Asset Homeowner Reader",
      role: "homeowner",
      subject: "user_asset_homeowner_reader",
    });
    const builderReader = withIdentity(base, {
      roles: ["builder"],
      subject: "user_asset_builder_reader",
    });
    const homeownerReader = withIdentity(base, {
      roles: ["homeowner"],
      subject: "user_asset_homeowner_reader",
    });

    const restrictedPostId = await admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        ...collaborationPublicationFixture({
          buildId,
          plainText: "Restricted asset context.",
        }),
        audienceMode: "custom",
        requestedReaderIds: [],
      },
    );
    const milestonePostId = await admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      collaborationPublicationFixture({
        buildId,
        plainText: "Revoked milestone asset context.",
      }),
    );

    const stagedAssets = await base.run(async (ctx) => {
      const build = await ctx.db.get(buildId);
      if (!build) {
        throw new Error("Active Build fixture is unavailable.");
      }
      const now = Date.now();
      await ctx.db.patch(milestonePostId, {
        authorDisplayNameSnapshot: "DrawFlow System",
        authorRolesSnapshot: ["system"],
        authorWorkosUserId: "system",
        source: "system",
        systemOccurrenceKey: `milestone-system:${String(buildId)}:revoked`,
        systemPostKind: "milestone",
      });

      const createStagedAsset = async (input: {
        label: string;
        ownerWorkosUserId: string;
        postId: Id<"buildCollaborationPosts">;
      }) => {
        const post = await ctx.db.get(input.postId);
        if (!post) {
          throw new Error("Post fixture is unavailable.");
        }
        const storageId = await ctx.storage.store(
          new Blob([input.label], { type: "text/plain" }),
        );
        const sessionId = await ctx.db.insert(
          "buildCollaborationAssetStagingSessions",
          {
            brokerageId: build.brokerageId,
            buildId,
            contextKind: "post",
            contextRecordId: post._id,
            createdAt: now,
            expiresAt: now + 86_400_000,
            organizationId: ORGANIZATION_ID,
            ownerWorkosUserId: input.ownerWorkosUserId,
            state: "finalized",
            updatedAt: now,
          },
        );
        const assetId = await ctx.db.insert("buildCollaborationAssets", {
          brokerageId: build.brokerageId,
          buildId,
          contentHashSha256: `${input.label}-${"0".repeat(64)}`.slice(0, 64),
          createdAt: now,
          fileName: `${input.label}.txt`,
          maximumAudienceMode: "build_wide",
          mimeType: "text/plain",
          organizationId: ORGANIZATION_ID,
          scanCompletedAt: now,
          scanState: "clean",
          sizeBytes: input.label.length,
          stagingSessionId: sessionId,
          state: "available",
          storageId,
          updatedAt: now,
          uploadedByWorkosUserId: input.ownerWorkosUserId,
          version: 1,
        });
        await ctx.db.patch(sessionId, { assetId });
        return assetId;
      };

      return {
        restrictedAssetId: await createStagedAsset({
          label: "restricted-post",
          ownerWorkosUserId: "user_asset_builder_reader",
          postId: restrictedPostId,
        }),
        milestoneAssetId: await createStagedAsset({
          label: "revoked-milestone",
          ownerWorkosUserId: "user_asset_homeowner_reader",
          postId: milestonePostId,
        }),
      };
    });

    await expect(
      builderReader.mutation(
        (api as any).build_collaboration_assets
          .authorizeBuildCollaborationAssetDownload,
        {
          assetId: stagedAssets.restrictedAssetId,
          buildId,
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow("unavailable");
    await expect(
      homeownerReader.mutation(
        (api as any).build_collaboration_assets
          .authorizeBuildCollaborationAssetDownload,
        {
          assetId: stagedAssets.milestoneAssetId,
          buildId,
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow("unavailable");

    const readablePostId = await admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      collaborationPublicationFixture({
        buildId,
        plainText: "Late readable attachment context.",
      }),
    );
    const paginatedAsset = await base.run(async (ctx) => {
      const build = await ctx.db.get(buildId);
      const readablePost = await ctx.db.get(readablePostId);
      if (!build || !readablePost) {
        throw new Error("Asset pagination fixtures are unavailable.");
      }
      const restrictedPost = await ctx.db.get(restrictedPostId);
      if (!restrictedPost || !restrictedPost.currentRevisionId) {
        throw new Error("Restricted post revision is unavailable.");
      }
      if (!readablePost.currentRevisionId) {
        throw new Error("Readable post revision is unavailable.");
      }
      const now = Date.now();
      const storageId = await ctx.storage.store(
        new Blob(["paginated-asset"], { type: "text/plain" }),
      );
      const assetId = await ctx.db.insert("buildCollaborationAssets", {
        brokerageId: build.brokerageId,
        buildId,
        contentHashSha256: "p".repeat(64),
        createdAt: now,
        fileName: "paginated-asset.txt",
        maximumAudienceMode: "build_wide",
        mimeType: "text/plain",
        organizationId: ORGANIZATION_ID,
        originatingPostId: restrictedPostId,
        publishedAt: now,
        publishedOwnerKind: "postRevision",
        publishedOwnerRecordId: restrictedPost.currentRevisionId,
        scanCompletedAt: now,
        scanState: "clean",
        sizeBytes: 15,
        state: "available",
        storageId,
        updatedAt: now,
        uploadedByWorkosUserId: "user_admin",
        version: 1,
      });
      for (let index = 0; index < 100; index += 1) {
        await ctx.db.insert("buildCollaborationAttachments", {
          attachmentId: assetId,
          attachmentKind: "collaborationAsset",
          brokerageId: build.brokerageId,
          buildId,
          createdAt: now + index,
          createdByWorkosUserId: "user_admin",
          organizationId: ORGANIZATION_ID,
          ownerKind: "postRevision",
          ownerRecordId: restrictedPost.currentRevisionId,
        });
      }
      await ctx.db.insert("buildCollaborationAttachments", {
        attachmentId: assetId,
        attachmentKind: "collaborationAsset",
        brokerageId: build.brokerageId,
        buildId,
        createdAt: now + 101,
        createdByWorkosUserId: "user_admin",
        organizationId: ORGANIZATION_ID,
        ownerKind: "postRevision",
        ownerRecordId: readablePost.currentRevisionId,
      });
      return { assetId, restrictedRevisionId: restrictedPost.currentRevisionId };
    });

    await expect(
      builderReader.mutation(
        (api as any).build_collaboration_assets
          .authorizeBuildCollaborationAssetDownload,
        {
          assetId: paginatedAsset.assetId,
          buildId,
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).resolves.toContain("http");

    await base.run(async (ctx) => {
      const build = await ctx.db.get(buildId);
      if (!build) {
        throw new Error("Active Build fixture is unavailable.");
      }
      const now = Date.now();
      for (let index = 0; index < 1_000; index += 1) {
        await ctx.db.insert("buildCollaborationAttachments", {
          attachmentId: paginatedAsset.assetId,
          attachmentKind: "collaborationAsset",
          brokerageId: build.brokerageId,
          buildId,
          createdAt: now + index,
          createdByWorkosUserId: "user_admin",
          organizationId: ORGANIZATION_ID,
          ownerKind: "postRevision",
          ownerRecordId: paginatedAsset.restrictedRevisionId,
        });
      }
    });
    await expect(
      builderReader.mutation(
        (api as any).build_collaboration_assets
          .authorizeBuildCollaborationAssetDownload,
        {
          assetId: paginatedAsset.assetId,
          buildId,
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow("unavailable");
  });

  test("never deletes storage owned by a published asset or another staging session", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    const publishedAssetId = await createPublishedAssetFixture({
      admin,
      base,
      buildId,
    });
    const publishedAsset = await base.run(
      async (ctx) => await ctx.db.get(publishedAssetId),
    );
    if (!publishedAsset) {
      throw new Error("Published asset fixture unavailable.");
    }
    const attackerSession = await admin.mutation(
      (api as any).build_collaboration_assets
        .beginBuildCollaborationAssetUpload,
      {
        buildId,
        contextKind: "composer",
        fileName: publishedAsset.fileName,
        mimeType: publishedAsset.mimeType,
        organizationId: ORGANIZATION_ID,
        sizeBytes: publishedAsset.sizeBytes,
      },
    );
    await expect(
      admin.action(
        (api as any).build_collaboration_asset_actions
          .finalizeAndScanBuildCollaborationAssetUpload,
        {
          buildId,
          contentHashSha256: publishedAsset.contentHashSha256,
          fileName: publishedAsset.fileName,
          mimeType: publishedAsset.mimeType,
          organizationId: ORGANIZATION_ID,
          stagingSessionId: attackerSession.stagingSessionId,
          storageId: publishedAsset.storageId,
        },
      ),
    ).rejects.toThrow("already been finalized");
    expect(
      await base.run(
        async (ctx) => await ctx.db.system.get(publishedAsset.storageId),
      ),
    ).not.toBeNull();

    const ownerSession = await admin.mutation(
      (api as any).build_collaboration_assets
        .beginBuildCollaborationAssetUpload,
      {
        buildId,
        contextKind: "composer",
        fileName: "owned.txt",
        mimeType: "text/plain",
        organizationId: ORGANIZATION_ID,
        sizeBytes: 5,
      },
    );
    const ownerStorageId = await base.run(
      async (ctx) =>
        await ctx.storage.store(new Blob(["owned"], { type: "text/plain" })),
    );
    await admin.mutation(
      (api as any).build_collaboration_assets
        .registerBuildCollaborationAssetUploadedStorage,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
        stagingSessionId: ownerSession.stagingSessionId,
        storageId: ownerStorageId,
      },
    );
    const secondSession = await admin.mutation(
      (api as any).build_collaboration_assets
        .beginBuildCollaborationAssetUpload,
      {
        buildId,
        contextKind: "composer",
        fileName: "stolen.txt",
        mimeType: "text/plain",
        organizationId: ORGANIZATION_ID,
        sizeBytes: 5,
      },
    );
    await expect(
      admin.action(
        (api as any).build_collaboration_asset_actions
          .finalizeAndScanBuildCollaborationAssetUpload,
        {
          buildId,
          contentHashSha256: "d".repeat(64),
          fileName: "stolen.txt",
          mimeType: "text/plain",
          organizationId: ORGANIZATION_ID,
          stagingSessionId: secondSession.stagingSessionId,
          storageId: ownerStorageId,
        },
      ),
    ).rejects.toThrow("another session");
    const retained = await base.run(async (ctx) => ({
      ownerSession: await ctx.db.get(ownerSession.stagingSessionId),
      secondSession: await ctx.db.get(secondSession.stagingSessionId),
      storage: await ctx.db.system.get(ownerStorageId),
    }));
    expect(retained.ownerSession).toMatchObject({ state: "open" });
    expect(retained.secondSession).toMatchObject({ state: "open" });
    expect(retained.storage).not.toBeNull();
  });

  test("lets a trusted agent stage a complete asset bundle while keeping publication human-only", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    const agent = withIdentity(base, {
      actorKind: "agent",
      roles: ["admin"],
      subject: "svc-asset-preparer",
    });
    const draftBundle = {
      ...collaborationPublicationFixture({
        buildId,
        plainText: "Agent-prepared update with governed evidence.",
      }),
      approvalOwnerWorkosUserId: "user_admin",
    };
    const draft = await agent.mutation(
      (api as any).build_collaboration_drafts.saveMyBuildCollaborationDraft,
      draftBundle,
    );
    const staging = await agent.mutation(
      (api as any).build_collaboration_assets
        .beginBuildCollaborationAssetUpload,
      {
        buildId,
        contextKind: "draft",
        contextRecordId: draft.draftId,
        fileName: "agent-evidence.txt",
        mimeType: "text/plain",
        organizationId: ORGANIZATION_ID,
        sizeBytes: 20,
      },
    );
    const storageId = await base.run(
      async (ctx) =>
        await ctx.storage.store(
          new Blob(["agent prepared asset"], { type: "text/plain" }),
        ),
    );
    const hash = "8".repeat(64);
    const assetId: Id<"buildCollaborationAssets"> = await agent.mutation(
      (api as any).build_collaboration_assets
        .finalizeBuildCollaborationAssetUpload,
      {
        buildId,
        contentHashSha256: hash,
        fileName: "agent-evidence.txt",
        mimeType: "text/plain",
        organizationId: ORGANIZATION_ID,
        stagingSessionId: staging.stagingSessionId,
        storageId,
      },
    );
    await base.mutation(
      (internal as any).build_collaboration_asset_maintenance
        .recordBuildCollaborationAssetScanResult,
      {
        assetId,
        computedHashSha256: hash,
        outcome: "clean",
        provider: "test-scanner",
      },
    );
    await agent.mutation(
      (api as any).build_collaboration_drafts.saveMyBuildCollaborationDraft,
      {
        ...draftBundle,
        attachmentAssetIds: [assetId],
        draftId: draft.draftId,
        expectedRevision: draft.revision,
      },
    );
    await expect(
      agent.mutation(
        (api as any).build_collaboration_drafts
          .approveAndPublishBuildCollaborationDraft,
        {
          buildId,
          draftId: draft.draftId,
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow();

    const approvalOwnerStaging = await admin.mutation(
      (api as any).build_collaboration_assets
        .beginBuildCollaborationAssetUpload,
      {
        buildId,
        contextKind: "draft",
        contextRecordId: draft.draftId,
        fileName: "human-review.txt",
        mimeType: "text/plain",
        organizationId: ORGANIZATION_ID,
        sizeBytes: 1,
      },
    );
    expect(approvalOwnerStaging.stagingSessionId).toBeDefined();

    const approvalOwnerStatuses = await admin.query(
      (api as any).build_collaboration_assets
        .listBuildCollaborationAssetStatuses,
      {
        assetIds: [assetId],
        buildId,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(approvalOwnerStatuses).toEqual([
      expect.objectContaining({
        _id: assetId,
        contentHashSha256: hash,
        fileName: "agent-evidence.txt",
        scanState: "clean",
      }),
    ]);
    await expect(
      admin.mutation(
        (api as any).build_collaboration_assets
          .authorizeBuildCollaborationAssetDownload,
        {
          assetId,
          buildId,
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).resolves.toContain("http");

    const postId: Id<"buildCollaborationPosts"> = await admin.mutation(
      (api as any).build_collaboration_drafts
        .approveAndPublishBuildCollaborationDraft,
      {
        buildId,
        draftId: draft.draftId,
        organizationId: ORGANIZATION_ID,
      },
    );
    const published = await base.run(async (ctx) => ({
      asset: await ctx.db.get(assetId),
      post: await ctx.db.get(postId),
      session: await ctx.db.get(staging.stagingSessionId),
    }));
    expect(published.asset?.publishedAt).toEqual(expect.any(Number));
    expect(published.post?.authorWorkosUserId).toBe("user_admin");
    expect(published.session).toMatchObject({ state: "consumed" });
  });

  test("keeps replacement history linear across a rejected and abandoned attempt", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    const originalAssetId = await createPublishedAssetFixture({
      admin,
      base,
      buildId,
    });
    const original = await base.run(
      async (ctx) => await ctx.db.get(originalAssetId),
    );
    if (!original?.originatingPostId) {
      throw new Error("Published asset fixture has no originating post.");
    }

    const rejectedSession = await admin.mutation(
      (api as any).build_collaboration_assets
        .beginBuildCollaborationAssetUpload,
      {
        buildId,
        contextKind: "post",
        contextRecordId: original.originatingPostId,
        fileName: "reader-v2.txt",
        mimeType: "text/plain",
        organizationId: ORGANIZATION_ID,
        sizeBytes: 15,
      },
    );
    const rejectedStorageId = await base.run(
      async (ctx) =>
        await ctx.storage.store(
          new Blob(["bad replacement"], { type: "text/plain" }),
        ),
    );
    const rejectedAssetId: Id<"buildCollaborationAssets"> =
      await admin.mutation(
        (api as any).build_collaboration_assets
          .finalizeBuildCollaborationAssetUpload,
        {
          buildId,
          contentHashSha256: "b".repeat(64),
          fileName: "reader-v2.txt",
          mimeType: "text/plain",
          organizationId: ORGANIZATION_ID,
          stagingSessionId: rejectedSession.stagingSessionId,
          storageId: rejectedStorageId,
          supersedesAssetId: originalAssetId,
        },
      );
    await base.mutation(
      (internal as any).build_collaboration_asset_maintenance
        .recordBuildCollaborationAssetScanResult,
      {
        assetId: rejectedAssetId,
        message: "Rejected fixture",
        outcome: "rejected",
        provider: "test-scanner",
      },
    );
    await admin.mutation(
      (api as any).build_collaboration_assets.abandonMyBuildCollaborationAssets,
      {
        assetIds: [rejectedAssetId],
        buildId,
        organizationId: ORGANIZATION_ID,
        reason: "Retry with a corrected replacement.",
      },
    );

    const retrySession = await admin.mutation(
      (api as any).build_collaboration_assets
        .beginBuildCollaborationAssetUpload,
      {
        buildId,
        contextKind: "post",
        contextRecordId: original.originatingPostId,
        fileName: "reader-v3.txt",
        mimeType: "text/plain",
        organizationId: ORGANIZATION_ID,
        sizeBytes: 16,
      },
    );
    const retryStorageId = await base.run(
      async (ctx) =>
        await ctx.storage.store(
          new Blob(["good replacement"], { type: "text/plain" }),
        ),
    );
    const retryHash = "c".repeat(64);
    const retryAssetId: Id<"buildCollaborationAssets"> = await admin.mutation(
      (api as any).build_collaboration_assets
        .finalizeBuildCollaborationAssetUpload,
      {
        buildId,
        contentHashSha256: retryHash,
        fileName: "reader-v3.txt",
        mimeType: "text/plain",
        organizationId: ORGANIZATION_ID,
        stagingSessionId: retrySession.stagingSessionId,
        storageId: retryStorageId,
        supersedesAssetId: originalAssetId,
      },
    );
    await base.mutation(
      (internal as any).build_collaboration_asset_maintenance
        .recordBuildCollaborationAssetScanResult,
      {
        assetId: retryAssetId,
        computedHashSha256: retryHash,
        outcome: "clean",
        provider: "test-scanner",
      },
    );
    await admin.mutation(
      (api as any).build_collaboration_threads.addBuildCollaborationComment,
      {
        attachmentAssetIds: [retryAssetId],
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Corrected replacement published.",
        postId: original.originatingPostId,
        references: [],
        tiptapJson: collaborationDocument("Corrected replacement published."),
      },
    );

    const lineage = await base.run(async (ctx) => ({
      original: await ctx.db.get(originalAssetId),
      rejected: await ctx.db.get(rejectedAssetId),
      retry: await ctx.db.get(retryAssetId),
      rejectedStorage: await ctx.db.system.get(rejectedStorageId),
    }));
    expect(lineage.original).toMatchObject({ state: "superseded", version: 1 });
    expect(lineage.rejected).toMatchObject({ state: "rejected", version: 2 });
    expect(lineage.retry).toMatchObject({
      state: "available",
      supersedesAssetId: rejectedAssetId,
      version: 3,
    });
    expect(lineage.rejectedStorage).toBeNull();
  });

  test("rejects oversized staging intent before upload and expires unpublished storage", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    await expect(
      admin.mutation(
        (api as any).build_collaboration_assets
          .beginBuildCollaborationAssetUpload,
        {
          buildId,
          contextKind: "composer",
          fileName: "too-large.bin",
          mimeType: "application/octet-stream",
          organizationId: ORGANIZATION_ID,
          sizeBytes: 100 * 1024 * 1024 + 1,
        },
      ),
    ).rejects.toThrow("100 MB");

    const pendingStaging = await admin.mutation(
      (api as any).build_collaboration_assets
        .beginBuildCollaborationAssetUpload,
      {
        buildId,
        contextKind: "composer",
        fileName: "pending.txt",
        mimeType: "text/plain",
        organizationId: ORGANIZATION_ID,
        sizeBytes: 14,
      },
    );
    const pendingStorageId = await base.run(
      async (ctx) =>
        await ctx.storage.store(
          new Blob(["pending upload"], { type: "text/plain" }),
        ),
    );
    await admin.mutation(
      (api as any).build_collaboration_assets
        .registerBuildCollaborationAssetUploadedStorage,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
        stagingSessionId: pendingStaging.stagingSessionId,
        storageId: pendingStorageId,
      },
    );
    await base.run(async (ctx) => {
      await ctx.db.patch(pendingStaging.stagingSessionId, {
        expiresAt: Date.now() - 1,
      });
    });
    await base.mutation(
      (internal as any).build_collaboration_asset_maintenance
        .expireBuildCollaborationAssetStagingSession,
      { stagingSessionId: pendingStaging.stagingSessionId },
    );
    expect(
      await base.run(async (ctx) => await ctx.db.system.get(pendingStorageId)),
    ).toBeNull();

    const staging = await admin.mutation(
      (api as any).build_collaboration_assets
        .beginBuildCollaborationAssetUpload,
      {
        buildId,
        contextKind: "composer",
        fileName: "expired.txt",
        mimeType: "text/plain",
        organizationId: ORGANIZATION_ID,
        sizeBytes: 13,
      },
    );
    const storageId = await base.run(
      async (ctx) =>
        await ctx.storage.store(
          new Blob(["expired asset"], { type: "text/plain" }),
        ),
    );
    const assetId = await admin.mutation(
      (api as any).build_collaboration_assets
        .finalizeBuildCollaborationAssetUpload,
      {
        buildId,
        contentHashSha256: "9".repeat(64),
        fileName: "expired.txt",
        mimeType: "text/plain",
        organizationId: ORGANIZATION_ID,
        stagingSessionId: staging.stagingSessionId,
        storageId,
      },
    );
    await base.run(async (ctx) => {
      await ctx.db.patch(staging.stagingSessionId, {
        expiresAt: Date.now() - 1,
      });
    });
    await base.mutation(
      (internal as any).build_collaboration_asset_maintenance
        .expireBuildCollaborationAssetStagingSession,
      { stagingSessionId: staging.stagingSessionId },
    );
    const expired = await base.run(async (ctx) => ({
      asset: await ctx.db.get(assetId),
      session: await ctx.db.get(staging.stagingSessionId),
      storage: await ctx.db.system.get(storageId),
    }));
    expect(expired.asset).toMatchObject({
      scanState: "rejected",
      state: "rejected",
      storageDeletedAt: expect.any(Number),
    });
    expect(expired.session).toMatchObject({ state: "abandoned" });
    expect(expired.storage).toBeNull();
  });
});

async function createPublishedAssetFixture(input: {
  admin: ReturnType<typeof withIdentity>;
  base: ReturnType<typeof convexTest>;
  buildId: Id<"activeBuilds">;
}): Promise<Id<"buildCollaborationAssets">> {
  const staging = await input.admin.mutation(
    (api as any).build_collaboration_assets.beginBuildCollaborationAssetUpload,
    {
      buildId: input.buildId,
      contextKind: "composer",
      fileName: "reader.txt",
      mimeType: "text/plain",
      organizationId: ORGANIZATION_ID,
      sizeBytes: 12,
    },
  );
  const storageId = await input.base.run(
    async (ctx) =>
      await ctx.storage.store(
        new Blob(["reader asset"], { type: "text/plain" }),
      ),
  );
  const hash = "2".repeat(64);
  const assetId: Id<"buildCollaborationAssets"> = await input.admin.mutation(
    (api as any).build_collaboration_assets
      .finalizeBuildCollaborationAssetUpload,
    {
      buildId: input.buildId,
      contentHashSha256: hash,
      fileName: "reader.txt",
      mimeType: "text/plain",
      organizationId: ORGANIZATION_ID,
      stagingSessionId: staging.stagingSessionId,
      storageId,
    },
  );
  await input.base.mutation(
    (internal as any).build_collaboration_asset_maintenance
      .recordBuildCollaborationAssetScanResult,
    {
      assetId,
      computedHashSha256: hash,
      outcome: "clean",
      provider: "test-scanner",
    },
  );
  await input.admin.mutation(
    (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
    {
      actionItems: [],
      attachmentAssetIds: [assetId],
      audienceMode: "build_wide",
      buildId: input.buildId,
      organizationId: ORGANIZATION_ID,
      plainText: "Published reader asset.",
      postType: "update",
      references: [],
      requestedReaderIds: [],
      tiptapJson: JSON.stringify({
        content: [
          {
            content: [{ text: "Published reader asset.", type: "text" }],
            type: "paragraph",
          },
        ],
        type: "doc",
      }),
    },
  );
  return assetId;
}

function collaborationPublicationFixture(input: {
  attachmentAssetIds?: Id<"buildCollaborationAssets">[];
  buildId: Id<"activeBuilds">;
  plainText: string;
}) {
  return {
    actionItems: [],
    attachmentAssetIds: input.attachmentAssetIds ?? [],
    audienceMode: "build_wide" as const,
    buildId: input.buildId,
    organizationId: ORGANIZATION_ID,
    plainText: input.plainText,
    postType: "update" as const,
    references: [],
    requestedReaderIds: [],
    tiptapJson: collaborationDocument(input.plainText),
  };
}

function collaborationDocument(plainText: string) {
  return JSON.stringify({
    content: [
      {
        content: [{ text: plainText, type: "text" }],
        type: "paragraph",
      },
    ],
    type: "doc",
  });
}

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
      admin.query((api as any).build_collaboration.listBuildCollaborationFeed, {
        buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      }),
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

    const evidenceId = await prepareLegacyNoteParity(admin, buildId);
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
      "Collaboration activation requires a completed search readiness verification for every Build.",
    );
    await prepareSearchCutover(base, buildId);
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
      reportVersion: "build-collaboration-legacy-note-parity/v2",
      verifiedByWorkosUserId: "user_admin",
    });
    expect(evidenceAndAudits.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorRoles: expect.arrayContaining(["admin"]),
          actorWorkosUserId: "user_admin",
          command: "completeBuildCollaborationLegacyNoteParity",
          createdAt: expect.any(Number),
          entityId: evidenceId,
          entityType: "buildCollaborationLegacyNoteCutover",
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

  test("backfills global authorities before rebuilding the generations verified for cutover", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    const postId = await admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      collaborationPublicationFixture({
        buildId,
        plainText: "Cutover authority backfill beacon.",
      }),
    );
    await base.run(async (ctx) => {
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "admin",
        roleSlugs: ["admin"],
        sourceEventId: "event_cutover_backfill_admin",
        sourceEventType: "organization_membership.created",
        status: "active",
        workosMembershipId: "membership_cutover_backfill_admin",
        workosOrganizationId: ORGANIZATION_ID,
        workosUserId: "user_cutover_backfill_admin",
      });
    });
    await finishSearchMaintenance(base);

    await prepareSearchCutover(base, buildId);

    const backfilledAdmin = withIdentity(base, {
      roles: ["admin"],
      subject: "user_cutover_backfill_admin",
    });
    const result = await backfilledAdmin.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
        query: "cutover authority backfill beacon",
      },
    );
    expect(result).toMatchObject({ indexing: false });
    expect(result.page).toEqual([
      expect.objectContaining({ id: postId, resultType: "post" }),
    ]);
  });

  test("rejects activation when an implicit Build reader changes after verification", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    await deleteCollaborationTenantSetting(base);
    await prepareLegacyNoteParity(admin, buildId);
    await admin.mutation(
      (api as any).build_collaboration_rollout
        .transitionBuildCollaborationTenantStatus,
      {
        buildId,
        expectedStatus: "disabled",
        nextStatus: "migration_ready",
        organizationId: ORGANIZATION_ID,
      },
    );
    await prepareSearchCutover(base, buildId);
    await base.run(async (ctx) => {
      const build = await ctx.db.get(buildId);
      if (!build) {
        throw new Error("Active Build fixture is unavailable.");
      }
      const now = Date.now() + 1;
      await ctx.db.insert("builderAccountLinks", {
        brokerageId: build.brokerageId,
        builderProfileId: build.builderProfileId,
        createdAt: now,
        role: "staff",
        status: "active",
        updatedAt: now,
        workosUserId: "user_reader_added_after_cutover",
      });
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
      "Collaboration search readiness changed after verification; run verification again.",
    );
  });

  test("rejects activation when an assigned contractor profile changes its linked identity", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    await deleteCollaborationTenantSetting(base);
    const contractorId = await base.run(async (ctx) => {
      const build = await ctx.db.get(buildId);
      if (!build) {
        throw new Error("Active Build fixture is unavailable.");
      }
      const now = Date.now();
      const profileId = await ctx.db.insert("contractorProfiles", {
        accountWorkosUserId: "user_original_contractor_reader",
        brokerageId: build.brokerageId,
        createdAt: now,
        name: "Reader Identity Contractor",
        organizationId: ORGANIZATION_ID,
        status: "active",
        trades: ["Concrete"],
        updatedAt: now,
      });
      await ctx.db.insert("buildContractorAssignments", {
        brokerageId: build.brokerageId,
        buildId,
        contractorId: profileId,
        createdAt: now,
        organizationId: ORGANIZATION_ID,
        role: "Concrete contractor",
        status: "active",
        updatedAt: now,
      });
      return profileId;
    });
    await prepareLegacyNoteParity(admin, buildId);
    await admin.mutation(
      (api as any).build_collaboration_rollout
        .transitionBuildCollaborationTenantStatus,
      {
        buildId,
        expectedStatus: "disabled",
        nextStatus: "migration_ready",
        organizationId: ORGANIZATION_ID,
      },
    );
    await prepareSearchCutover(base, buildId);
    await base.run(async (ctx) => {
      await ctx.db.patch(contractorId, {
        accountWorkosUserId: "user_replacement_contractor_reader",
        updatedAt: Date.now() + 1,
      });
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
      "Collaboration search readiness changed after verification; run verification again.",
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
      admin.query((api as any).build_collaboration.listBuildCollaborationFeed, {
        buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      }),
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
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
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
      },
    );

    await expect(
      fixture.admin.query(
        (api as any).build_collaboration_focus
          .getFocusedBuildCollaborationPostContext,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId,
        },
      ),
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
      }),
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
        },
      ),
    ).resolves.toEqual({ state: "revoked" });
    await expect(
      fixture.admin.query(
        (api as any).build_collaboration_focus
          .getFocusedBuildCollaborationPostContext,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: "forged-post-id",
        },
      ),
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
        (api as any).build_collaboration_focus.getFocusedBuildActionItemContext,
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
      }),
    );

    const contractor = withIdentity(fixture.base, {
      roles: ["contractor"],
      subject: "user_contractor",
    });
    await expect(
      contractor.query(
        (api as any).build_collaboration_focus.getFocusedBuildActionItemContext,
        {
          actionItemId: entities.actionItemId,
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).resolves.toBeNull();
    await expect(
      fixture.admin.query(
        (api as any).build_collaboration_focus.getFocusedBuildActionItemContext,
        {
          actionItemId: "forged-action-item-id",
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).resolves.toBeNull();
  });

  test("resolves an exact authorized entity focus without autocomplete enumeration", async () => {
    const fixture = await seedActiveBuild();
    const entities = await seedCollaborationReferenceEntities(fixture);

    await expect(
      fixture.admin.query(
        (api as any).build_collaboration_focus
          .getFocusedBuildCollaborationReference,
        {
          buildId: fixture.buildId,
          entityId: entities.milestoneId,
          entityKind: "milestone",
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).resolves.toEqual({
      reference: expect.objectContaining({
        entityId: entities.milestoneId,
        entityKind: "milestone",
      }),
      state: "visible",
    });
    await expect(
      fixture.admin.query(
        (api as any).build_collaboration_focus
          .getFocusedBuildCollaborationReference,
        {
          buildId: fixture.buildId,
          entityId: "forged-milestone-id",
          entityKind: "milestone",
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).resolves.toEqual({ state: "revoked" });
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
    expect(
      new Set(adminOptions.map((option: any) => option.entityKind)),
    ).toEqual(
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
              content: [{ text: "Legacy reference container.", type: "text" }],
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
      (entry: any) => entry.kind === "post" && entry.post._id === legacyPostId,
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
    const mentionDocument = (id: string, label: string, kind = "participant") =>
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
      const post = await ctx.db.get(postId as Id<"buildCollaborationPosts">);
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
        (api as any).build_collaboration_threads.addBuildCollaborationComment,
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
                content: [{ text: "Adversarial reference.", type: "text" }],
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
      for (const delivery of await ctx.db
        .query("recipientDeliveries")
        .collect()) {
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
    ).toBe(true);

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

  test("digests ordinary publication activity while emitting direct and critical events immediately", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    await addBuildParticipant(base, {
      buildId,
      displayName: "Broker Reviewer",
      role: "broker",
      subject: "user_broker",
    });
    await base.run(async (ctx) => {
      for (const delivery of await ctx.db
        .query("recipientDeliveries")
        .collect()) {
        await ctx.db.delete(delivery._id);
      }
    });

    await admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
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
    const ordinaryState = await base.run(async (ctx) => ({
      canonical: await ctx.db.query("recipientDeliveries").collect(),
      external: await ctx.db
        .query("buildCollaborationExternalDeliveries")
        .collect(),
    }));
    expect(ordinaryState.canonical).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collaborationEventKind: "ordinary_activity",
          recipientWorkosUserId: "user_broker",
        }),
      ]),
    );
    expect(ordinaryState.external).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cadence: "daily",
          deliveryMode: "digest",
          eventKind: "ordinary_activity",
          recipientWorkosUserId: "user_broker",
        }),
      ]),
    );

    await admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
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
    expect(directDeliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collaborationEventKind: "direct_mention",
          recipientWorkosUserId: "user_broker",
        }),
      ]),
    );
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
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
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
      for (const delivery of await ctx.db
        .query("recipientDeliveries")
        .collect()) {
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
      for (const delivery of await ctx.db
        .query("recipientDeliveries")
        .collect()) {
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

describe("Build collaboration authorized search", () => {
  test("searches every readable record kind and applies all server-side filters", async () => {
    const fixture = await seedActiveBuild();
    await addBuildParticipant(fixture.base, {
      buildId: fixture.buildId,
      displayName: "Site Contractor",
      role: "contractor",
      subject: "user_contractor",
    });
    const contractor = withIdentity(fixture.base, {
      roles: ["contractor"],
      subject: "user_contractor",
    });
    const publicPostId = await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [
          {
            assigneeWorkosUserId: "user_contractor",
            descriptionPlainText: "Upload the revised structural report.",
            descriptionTiptapJson: collaborationDocument(
              "Upload the revised structural report.",
            ),
            title: "Confirm structural review",
          },
        ],
        attachmentAssetIds: [],
        audienceMode: "build_wide",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Footings site visit is complete.",
        postType: "update",
        references: [
          {
            entityId: "user_contractor",
            entityKind: "participant",
            label: "Site Contractor",
            summary: "Contractor on this Build",
          },
        ],
        requestedReaderIds: [],
        tiptapJson: collaborationDocument("Footings site visit is complete."),
      },
    );
    await fixture.admin.mutation(
      (api as any).build_collaboration_threads.addBuildCollaborationComment,
      {
        attachmentAssetIds: [],
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "The engineer seal was uploaded.",
        postId: publicPostId,
        references: [],
        tiptapJson: collaborationDocument("The engineer seal was uploaded."),
      },
    );
    const assetId = await createPublishedAssetFixture(fixture);
    await finishSearchMaintenance(fixture.base);

    const search = (query: string, filters?: Record<string, unknown>) =>
      contractor.action(
        (api as any).build_collaboration_search.searchBuildCollaboration,
        {
          buildId: fixture.buildId,
          filters,
          organizationId: ORGANIZATION_ID,
          query,
        },
      );
    const semantic = await contractor.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        query: "foundation inspection",
        searchMode: "semantic",
      },
    );
    expect(semantic.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: publicPostId,
          matchKind: "semantic",
          resultType: "post",
        }),
      ]),
    );
    expect((await search("engineer seal")).page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resultType: "comment",
          title: "Reply by user_admin@example.com",
        }),
      ]),
    );
    const actionItemResults = await search("structural review", {
      assigneeWorkosUserIds: ["user_contractor"],
      audienceModes: ["build_wide"],
      resolutionStates: ["open"],
      statuses: ["todo"],
      types: ["actionItem"],
    });
    expect(actionItemResults.page).toEqual([
      expect.objectContaining({
        assigneeWorkosUserId: "user_contractor",
        resultType: "actionItem",
        title: "Confirm structural review",
      }),
    ]);
    expect(
      (
        await search("Site Contractor", {
          authorWorkosUserIds: ["user_admin"],
          createdFrom: 0,
          createdTo: Date.now() + 1_000,
          entityKinds: ["participant"],
          types: ["reference"],
        })
      ).page,
    ).toEqual([
      expect.objectContaining({
        entityId: "user_contractor",
        entityKind: "participant",
        resultType: "reference",
      }),
    ]);
    expect(
      (
        await search("reader txt", {
          attachmentPresence: "with",
          authorWorkosUserIds: ["user_admin"],
          types: ["asset"],
        })
      ).page,
    ).toEqual([
      expect.objectContaining({
        entityId: assetId,
        focusEntityKind: "asset",
        resultType: "asset",
      }),
    ]);
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(assetId, {
        maximumAudienceMode: "custom",
        readerWorkosUserIds: ["user_admin"],
        updatedAt: Date.now(),
      });
    });
    await fixture.base.mutation(
      (internal as any).build_collaboration_search_maintenance
        .ensureBuildCollaborationSearchMaintenance,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    await finishSearchMaintenance(fixture.base);
    expect(
      (
        await search("reader txt", {
          attachmentPresence: "with",
          types: ["asset"],
        })
      ).page,
    ).toEqual([]);
    expect(
      (
        await fixture.admin.action(
          (api as any).build_collaboration_search.searchBuildCollaboration,
          {
            buildId: fixture.buildId,
            filters: { types: ["asset"] },
            organizationId: ORGANIZATION_ID,
            query: "reader txt",
          },
        )
      ).page,
    ).toEqual([
      expect.objectContaining({ entityId: assetId, resultType: "asset" }),
    ]);
  });

  test("keeps restricted, tombstoned, and cross-Build content out of results and stable cursors", async () => {
    const fixture = await seedActiveBuild();
    await addBuildParticipant(fixture.base, {
      buildId: fixture.buildId,
      displayName: "Site Contractor",
      role: "contractor",
      subject: "user_contractor",
    });
    const contractor = withIdentity(fixture.base, {
      roles: ["contractor"],
      subject: "user_contractor",
    });
    const secretPostId = await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        ...collaborationPublicationFixture({
          buildId: fixture.buildId,
          plainText: "Aquamarine lender reserve is confidential.",
        }),
        audienceMode: "author_tier_and_higher",
      },
    );
    for (const label of ["one", "two", "three"]) {
      await fixture.admin.mutation(
        (api as any).build_collaboration
          .approveAndPublishBuildCollaborationBundle,
        collaborationPublicationFixture({
          buildId: fixture.buildId,
          plainText: `Pagination search record ${label}.`,
        }),
      );
    }
    await finishSearchMaintenance(fixture.base);

    const contractorSecret = await contractor.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        query: "aquamarine",
      },
    );
    expect(contractorSecret).toMatchObject({
      continueCursor: null,
      indexing: false,
      isDone: true,
      page: [],
    });
    expect(
      (
        await fixture.admin.action(
          (api as any).build_collaboration_search.searchBuildCollaboration,
          {
            buildId: fixture.buildId,
            organizationId: ORGANIZATION_ID,
            query: "aquamarine",
          },
        )
      ).page,
    ).toEqual([
      expect.objectContaining({ id: secretPostId, resultType: "post" }),
    ]);
    await fixture.admin.mutation(
      (api as any).build_collaboration_editing.tombstoneBuildCollaborationPost,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        postId: secretPostId,
      },
    );
    const rebuildingSecret = await fixture.admin.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        query: "aquamarine",
      },
    );
    expect(rebuildingSecret).toMatchObject({ indexing: true, page: [] });
    await finishSearchMaintenance(fixture.base);
    expect(
      (
        await fixture.admin.action(
          (api as any).build_collaboration_search.searchBuildCollaboration,
          {
            buildId: fixture.buildId,
            organizationId: ORGANIZATION_ID,
            query: "aquamarine",
          },
        )
      ).page,
    ).toEqual([]);

    const firstPage = await contractor.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        limit: 2,
        organizationId: ORGANIZATION_ID,
        query: "pagination",
      },
    );
    expect(firstPage.page).toHaveLength(2);
    expect(firstPage.continueCursor).toEqual(expect.any(String));
    await fixture.admin.mutation(
      (api as any).build_collaboration_editing.tombstoneBuildCollaborationPost,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        postId: firstPage.page[0].postId,
      },
    );
    await finishSearchMaintenance(fixture.base);
    await expect(
      contractor.action(
        (api as any).build_collaboration_search.searchBuildCollaboration,
        {
          buildId: fixture.buildId,
          cursor: firstPage.continueCursor,
          limit: 2,
          organizationId: ORGANIZATION_ID,
          query: "pagination",
        },
      ),
    ).rejects.toThrow(/cursor/i);
    const refreshedPage = await contractor.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        limit: 10,
        organizationId: ORGANIZATION_ID,
        query: "pagination",
      },
    );
    expect(refreshedPage.page).toHaveLength(2);
    await expect(
      contractor.action(
        (api as any).build_collaboration_search.searchBuildCollaboration,
        {
          buildId: fixture.buildId,
          cursor: firstPage.continueCursor,
          organizationId: ORGANIZATION_ID,
          query: "different query",
        },
      ),
    ).rejects.toThrow(/cursor/i);
    await expect(
      fixture.admin.action(
        (api as any).build_collaboration_search.searchBuildCollaboration,
        {
          buildId: fixture.buildId,
          cursor: firstPage.continueCursor,
          organizationId: ORGANIZATION_ID,
          query: "pagination",
        },
      ),
    ).rejects.toThrow(/cursor/i);

    const secondBuildId = await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Active Build fixture is unavailable.");
      }
      const { _creationTime: _ignoredTime, _id: _ignoredId, ...copy } = build;
      return await ctx.db.insert("activeBuilds", {
        ...copy,
        buildName: "Second isolated Build",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    await expect(
      contractor.action(
        (api as any).build_collaboration_search.searchBuildCollaboration,
        {
          buildId: secondBuildId,
          organizationId: ORGANIZATION_ID,
          query: "pagination",
        },
      ),
    ).rejects.toThrow(/forbidden|participant|access/i);
    expect(
      (
        await fixture.admin.action(
          (api as any).build_collaboration_search.searchBuildCollaboration,
          {
            buildId: secondBuildId,
            organizationId: ORGANIZATION_ID,
            query: "pagination",
          },
        )
      ).page,
    ).toEqual([]);
  });

  test("searches older authorized posts after more than 200 newer restricted posts", async () => {
    const fixture = await seedActiveBuild();
    await addBuildParticipant(fixture.base, {
      buildId: fixture.buildId,
      displayName: "Archive Contractor",
      role: "contractor",
      subject: "archive_contractor",
    });
    const contractor = withIdentity(fixture.base, {
      roles: ["contractor"],
      subject: "archive_contractor",
    });
    const authorizedPostId: Id<"buildCollaborationPosts"> =
      await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      collaborationPublicationFixture({
        buildId: fixture.buildId,
        plainText: "Deep archive authorized beacon.",
      })
    );
    await fixture.base.run(async (ctx) => {
      const sourcePost = await ctx.db.get(authorizedPostId);
      const sourceRevision = sourcePost?.currentRevisionId
        ? await ctx.db.get(sourcePost.currentRevisionId)
        : null;
      if (!(sourcePost && sourceRevision)) {
        throw new Error("Search source fixture is unavailable.");
      }
      const baseTime = Date.now() - 10_000;
      await ctx.db.patch(sourcePost._id, {
        createdAt: baseTime,
        updatedAt: baseTime,
      });
      const {
        _creationTime: _postCreationTime,
        _id: _sourcePostId,
        currentRevisionId: _sourceRevisionId,
        ...postTemplate
      } = sourcePost;
      const {
        _creationTime: _revisionCreationTime,
        _id: _sourceRevisionRecordId,
        postId: _sourceRevisionPostId,
        ...revisionTemplate
      } = sourceRevision;
      for (let index = 0; index < 205; index += 1) {
        const createdAt = baseTime + index + 1;
        const postId = await ctx.db.insert("buildCollaborationPosts", {
          ...postTemplate,
          audienceMode: "author_tier_and_higher",
          createdAt,
          updatedAt: createdAt,
        });
        const plainText = `Restricted archive noise ${index}.`;
        const revisionId = await ctx.db.insert(
          "buildCollaborationPostRevisions",
          {
            ...revisionTemplate,
            contentHash: `restricted-${index}`,
            createdAt,
            plainText,
            postId,
            tiptapJson: collaborationDocument(plainText),
          },
        );
        await ctx.db.patch(postId, { currentRevisionId: revisionId });
      }
    });
    await finishSearchMaintenance(fixture.base);
    const contractorPartition = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("buildCollaborationSearchRecords")
        .withIndex("by_buildId_and_reader", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq("readerPartitionKey", "user:archive_contractor")
        )
        .take(50)
    );
    expect(contractorPartition).not.toHaveLength(0);
    expect(
      contractorPartition.every(
        (record) =>
          record.postId === authorizedPostId &&
          !record.candidateJson.includes("Restricted archive noise")
      )
    ).toBe(true);

    const response = await contractor.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        query: "deep archive authorized beacon",
      },
    );

    expect(response.page).toEqual([
      expect.objectContaining({
        id: authorizedPostId,
        resultType: "post",
      }),
    ]);
  });

  test("continues a keyset cursor without skips when a prior result is revoked", async () => {
    const fixture = await seedActiveBuild();
    await addBuildParticipant(fixture.base, {
      buildId: fixture.buildId,
      displayName: "Cursor Contractor",
      role: "contractor",
      subject: "cursor_contractor",
    });
    const contractor = withIdentity(fixture.base, {
      roles: ["contractor"],
      subject: "cursor_contractor",
    });
    for (const label of ["alpha", "beta", "gamma", "delta"]) {
      await fixture.admin.mutation(
        (api as any).build_collaboration
          .approveAndPublishBuildCollaborationBundle,
        {
          ...collaborationPublicationFixture({
            buildId: fixture.buildId,
            plainText: `Revocation cursor ${label}.`,
          }),
          audienceMode: "custom",
          requestedReaderIds: ["cursor_contractor"],
        },
      );
    }
    await finishSearchMaintenance(fixture.base);
    const firstPage = await contractor.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        limit: 1,
        organizationId: ORGANIZATION_ID,
        query: "revocation cursor",
      },
    );
    expect(firstPage.page).toHaveLength(1);
    await fixture.base.run(async (ctx) => {
      const member = await ctx.db
        .query("buildCollaborationAudienceMembers")
        .withIndex("by_postId_and_workosUserId", (query) =>
          query
            .eq("postId", firstPage.page[0].postId)
            .eq("workosUserId", "cursor_contractor"),
        )
        .unique();
      if (!member) {
        throw new Error("Custom audience member fixture is unavailable.");
      }
      await ctx.db.delete(member._id);
    });
    await fixture.base.mutation(
      (internal as any).build_collaboration_search_maintenance
        .ensureBuildCollaborationSearchMaintenance,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    const rebuilding = await contractor.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        cursor: firstPage.continueCursor,
        limit: 10,
        organizationId: ORGANIZATION_ID,
        query: "revocation cursor",
      },
    );
    expect(rebuilding).toMatchObject({ indexing: true, page: [] });
    await finishSearchMaintenance(fixture.base);
    await expect(
      contractor.action(
        (api as any).build_collaboration_search.searchBuildCollaboration,
        {
          buildId: fixture.buildId,
          cursor: firstPage.continueCursor,
          limit: 10,
          organizationId: ORGANIZATION_ID,
          query: "revocation cursor",
        },
      ),
    ).rejects.toThrow(/cursor/i);
    const refreshed = await contractor.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        limit: 10,
        organizationId: ORGANIZATION_ID,
        query: "revocation cursor",
      },
    );
    expect(refreshed.page).toHaveLength(3);
    expect(
      refreshed.page.some(
        (result: any) => result.id === firstPage.page[0].id,
      ),
    ).toBe(false);
  });

  test("returns role-safe results for every collaboration role", async () => {
    const fixture = await seedActiveBuild();
    const roles = [
      ["principle-broker", "/backoffice/builds"],
      ["broker", "/backoffice/builds"],
      ["builder", "/builder/builds"],
      ["broker-staff", "/backoffice/builds"],
      ["builder-staff", "/builder-staff/builds"],
      ["homeowner", "/homeowner/builds"],
      ["contractor", "/contractor/builds"],
    ] as const;
    for (const [role] of roles) {
      await addBuildParticipant(fixture.base, {
        buildId: fixture.buildId,
        displayName: `Search ${role}`,
        role,
        subject: `search_${role}`,
      });
    }
    const postId = await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      collaborationPublicationFixture({
        buildId: fixture.buildId,
        plainText: "Role complete search beacon.",
      }),
    );
    await finishSearchMaintenance(fixture.base);

    const viewers = [
      [fixture.admin, "/backoffice/builds"],
      ...roles.map(
        ([role, prefix]) =>
          [
            withIdentity(fixture.base, {
              roles: [role],
              subject: `search_${role}`,
            }),
            prefix,
          ] as const,
      ),
    ] as const;
    for (const [viewer, prefix] of viewers) {
      const response = await viewer.action(
        (api as any).build_collaboration_search.searchBuildCollaboration,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          query: "role complete search beacon",
        },
      );
      expect(response.page).toEqual([
        expect.objectContaining({
          href: expect.stringContaining(`${prefix}/${fixture.buildId}`),
          id: postId,
          resultType: "post",
        }),
      ]);
    }
  });

  test("rebuilds exact partitions when a global authority joins after indexing", async () => {
    const fixture = await seedActiveBuild();
    const postId = await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      collaborationPublicationFixture({
        buildId: fixture.buildId,
        plainText: "Late authority search beacon.",
      }),
    );
    await finishSearchMaintenance(fixture.base);
    await fixture.base.run(async (ctx) => {
      for (let index = 0; index < 501; index += 1) {
        await ctx.db.insert("workosOrganizationMemberships", {
          roleSlug: "member",
          roleSlugs: ["member"],
          sourceEventId: `event_ordinary_search_${index}`,
          sourceEventType: "organization_membership.created",
          status: "active",
          workosMembershipId: `membership_ordinary_search_${index}`,
          workosOrganizationId: ORGANIZATION_ID,
          workosUserId: `user_ordinary_search_${index}`,
        });
      }
    });
    await fixture.base.mutation(
      (internal as any).workosProjection.ingestWorkosEvent,
      {
        data: {
          id: "membership_late_search_admin",
          organization_id: ORGANIZATION_ID,
          role: { slug: "broker" },
          roles: [{ slug: "admin" }],
          status: "active",
          user_id: "user_late_search_admin",
        },
        event: "organization_membership.created",
        id: "event_late_search_admin",
      },
    );
    const lateAdmin = withIdentity(fixture.base, {
      roles: ["broker", "admin"],
      subject: "user_late_search_admin",
    });
    const rebuilding = await lateAdmin.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        query: "late authority search beacon",
      },
    );
    expect(rebuilding).toMatchObject({ indexing: true, page: [] });

    await finishSearchMaintenance(fixture.base);
    const ready = await lateAdmin.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        query: "late authority search beacon",
      },
    );
    expect(ready.page).toEqual([
      expect.objectContaining({ id: postId, resultType: "post" }),
    ]);
  });

  test("preserves a failed maintenance job's retry backoff under search traffic", async () => {
    const fixture = await seedActiveBuild();
    await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      collaborationPublicationFixture({
        buildId: fixture.buildId,
        plainText: "Backed off search maintenance beacon.",
      }),
    );
    const futureLeaseExpiresAt = Date.now() + 60_000;
    const failedJobId = await fixture.base.run(async (ctx) => {
      const job = await ctx.db
        .query("buildCollaborationSearchJobs")
        .withIndex("by_buildId_and_status", (query) =>
          query.eq("buildId", fixture.buildId).eq("status", "queued"),
        )
        .first();
      if (!job) {
        throw new Error("Queued search maintenance fixture is unavailable.");
      }
      await ctx.db.patch(job._id, {
        failureCount: 2,
        lastError: "Injected deterministic failure.",
        leaseExpiresAt: futureLeaseExpiresAt,
        status: "failed",
      });
      return job._id;
    });

    await fixture.base.mutation(
      (internal as any).build_collaboration_search_maintenance
        .ensureBuildCollaborationSearchMaintenance,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    await expect(
      fixture.base.run(async (ctx) => await ctx.db.get(failedJobId)),
    ).resolves.toMatchObject({
      leaseExpiresAt: futureLeaseExpiresAt,
      status: "failed",
    });
  });

  test("recovers an expired failed maintenance job instead of wedging the Build", async () => {
    const fixture = await seedActiveBuild();
    await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      collaborationPublicationFixture({
        buildId: fixture.buildId,
        plainText: "Recoverable search maintenance beacon.",
      }),
    );
    await fixture.base.run(async (ctx) => {
      const job = await ctx.db
        .query("buildCollaborationSearchJobs")
        .withIndex("by_buildId_and_status", (query) =>
          query.eq("buildId", fixture.buildId).eq("status", "queued"),
        )
        .first();
      if (!job) {
        throw new Error("Queued search maintenance fixture is unavailable.");
      }
      await ctx.db.patch(job._id, {
        failureCount: 1,
        lastError: "Injected recoverable failure.",
        leaseExpiresAt: Date.now() - 1,
        status: "failed",
      });
    });
    await fixture.base.mutation(
      (internal as any).build_collaboration_search_maintenance
        .ensureBuildCollaborationSearchMaintenance,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    await finishSearchMaintenance(fixture.base);

    const readiness = await fixture.admin.query(
      (api as any).build_collaboration_search
        .getBuildCollaborationSearchReadiness,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    expect(readiness.ready).toBe(true);
  });

  test("searches every currently readable canonical reference kind with focused deep links", async () => {
    const fixture = await seedActiveBuild();
    const entities = await seedCollaborationReferenceEntities(fixture);
    const references = [
      ["participant", "user_admin"],
      ["milestone", entities.milestoneId],
      ["submilestone", entities.submilestoneId],
      ["draw", entities.drawId],
      ["evidencePackage", entities.evidencePackageId],
      ["evidenceAsset", entities.evidenceAssetId],
      ["siteVisit", entities.siteVisitId],
      ["document", entities.documentId],
      ["material", entities.materialId],
      ["actionItem", entities.actionItemId],
    ] as const;
    await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "author_tier_and_higher",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Canonical reference search fixture.",
        postType: "update",
        references: references.map(([entityKind, entityId]) => ({
          entityId,
          entityKind,
          label: `Untrusted ${entityKind}`,
        })),
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: references.map(([entityKind, entityId]) => ({
                attrs: {
                  id: entityId,
                  kind:
                    entityKind === "actionItem"
                      ? "action_item"
                      : entityKind === "evidenceAsset" ||
                          entityKind === "evidencePackage"
                        ? "evidence"
                        : entityKind === "siteVisit"
                          ? "site_visit"
                          : entityKind,
                  label: `Untrusted ${entityKind}`,
                },
                type: "collaborationMention",
              })),
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    await finishSearchMaintenance(fixture.base);

    const response = await fixture.admin.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        filters: { types: ["reference"] },
        limit: 50,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(new Set(response.page.map((row: any) => row.entityKind))).toEqual(
      new Set(references.map(([entityKind]) => entityKind)),
    );
    for (const [entityKind, entityId] of references) {
      expect(response.page).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entityId,
            entityKind,
            href: expect.stringContaining(
              `focus=${encodeURIComponent(`${entityKind}:${entityId}`)}`,
            ),
            resultType: "reference",
          }),
        ]),
      );
    }
  });

  test("reindexes only the edited owner instead of rewriting the whole thread corpus", async () => {
    const fixture = await seedActiveBuild();
    const postId = await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      collaborationPublicationFixture({
        buildId: fixture.buildId,
        plainText: "Incremental search maintenance root.",
      }),
    );
    const firstCommentId = await fixture.admin.mutation(
      (api as any).build_collaboration_threads.addBuildCollaborationComment,
      {
        attachmentAssetIds: [],
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "First stable reply.",
        postId,
        references: [],
        tiptapJson: collaborationDocument("First stable reply."),
      },
    );
    const editedCommentId = await fixture.admin.mutation(
      (api as any).build_collaboration_threads.addBuildCollaborationComment,
      {
        attachmentAssetIds: [],
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Second reply prequartz.",
        postId,
        references: [],
        tiptapJson: collaborationDocument("Second reply prequartz."),
      },
    );
    const queuedOnly = await fixture.base.run(async (ctx) => ({
      records: await ctx.db
        .query("buildCollaborationSearchRecords")
        .withIndex("by_postId", (query) => query.eq("postId", postId))
        .collect(),
      state: await ctx.db
        .query("buildCollaborationSearchStates")
        .withIndex("by_buildId", (query) => query.eq("buildId", fixture.buildId))
        .unique(),
    }));
    expect(queuedOnly.records).toEqual([]);
    expect(queuedOnly.state?.status).toBe("building");
    await finishSearchMaintenance(fixture.base);
    const recordIdsByOwner = async (ownerKind: string, ownerId: string) =>
      await fixture.base.run(async (ctx) =>
        (
          await ctx.db
            .query("buildCollaborationSearchRecords")
            .withIndex(
              "by_postId_and_ownerKind_and_ownerId",
              (query) =>
                query
                  .eq("postId", postId)
                  .eq("ownerKind", ownerKind as "comment" | "post")
                  .eq("ownerId", ownerId),
            )
            .collect()
        ).map((record) => record._id),
      );
    const postRecordsBefore = await recordIdsByOwner("post", postId);
    const firstCommentRecordsBefore = await recordIdsByOwner(
      "comment",
      firstCommentId,
    );
    const editedCommentRecordsBefore = await recordIdsByOwner(
      "comment",
      editedCommentId,
    );

    await fixture.admin.mutation(
      (api as any).build_collaboration_editing
        .editBuildCollaborationComment,
      {
        buildId: fixture.buildId,
        commentId: editedCommentId,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        references: [],
        tiptapJson: collaborationDocument("Second reply aftertopaz."),
      },
    );
    await finishSearchMaintenance(fixture.base);

    expect(await recordIdsByOwner("post", postId)).toEqual(postRecordsBefore);
    expect(await recordIdsByOwner("comment", firstCommentId)).toEqual(
      firstCommentRecordsBefore,
    );
    expect(await recordIdsByOwner("comment", editedCommentId)).not.toEqual(
      editedCommentRecordsBefore,
    );
    expect(
      (
        await fixture.admin.action(
          (api as any).build_collaboration_search.searchBuildCollaboration,
          {
            buildId: fixture.buildId,
            organizationId: ORGANIZATION_ID,
            query: "aftertopaz",
          },
        )
      ).page,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          commentId: editedCommentId,
          resultType: "comment",
        }),
      ]),
    );
    expect(
      (
        await fixture.admin.action(
          (api as any).build_collaboration_search.searchBuildCollaboration,
          {
            buildId: fixture.buildId,
            organizationId: ORGANIZATION_ID,
            query: "prequartz",
          },
        )
      ).page.some((result: any) => result.commentId === editedCommentId),
    ).toBe(false);
  });
});

async function prepareLegacyNoteParity(
  admin: ReturnType<typeof withIdentity>,
  buildId: Id<"activeBuilds">,
) {
  let accumulator: string | undefined;
  let planToken: string | undefined;
  for (const phase of ["builds", "notes"] as const) {
    let cursor: string | null = null;
    for (let pageCount = 0; pageCount < 100; pageCount += 1) {
      const page: {
        accumulator: string;
        continueCursor: string;
        isDone: boolean;
        planToken?: string;
      } = await admin.query(
        (api as any).build_collaboration_legacy_note_plan
          .previewBuildCollaborationLegacyNoteMigrationPage,
        {
          accumulator,
          buildId,
          organizationId: ORGANIZATION_ID,
          paginationOpts: { cursor, numItems: 25 },
          phase,
        },
      );
      accumulator = page.accumulator;
      planToken = page.planToken ?? planToken;
      if (page.isDone) {
        break;
      }
      cursor = page.continueCursor;
    }
  }
  if (!planToken) {
    throw new Error("Legacy-note preview did not produce a plan token.");
  }
  let migration = await admin.mutation(
    (api as any).build_collaboration_legacy_note_plan
      .startBuildCollaborationLegacyNoteMigration,
    { buildId, organizationId: ORGANIZATION_ID, planToken },
  );
  for (let iteration = 0; migration.status === "validating"; iteration += 1) {
    if (iteration >= 100) {
      throw new Error("Legacy-note manifest validation did not finish.");
    }
    migration = await admin.mutation(
      (api as any).build_collaboration_legacy_note_plan
        .advanceBuildCollaborationLegacyNotePlan,
      {
        buildId,
        maxItems: 25,
        organizationId: ORGANIZATION_ID,
        runId: migration.runId,
      },
    );
  }
  while (migration.status === "importing") {
    const imported = await admin.mutation(
      (api as any).build_collaboration_legacy_note_import
        .applyBuildCollaborationLegacyNoteMigrationBatch,
      {
        buildId,
        maxNotes: 25,
        organizationId: ORGANIZATION_ID,
        planToken,
        runId: migration.runId,
      },
    );
    if (imported.complete) {
      migration = { ...migration, status: "complete" };
    }
  }
  let parity = await admin.mutation(
    (api as any).build_collaboration_legacy_note_parity
      .startBuildCollaborationLegacyNoteParity,
    {
      buildId,
      migrationRunId: migration.runId,
      organizationId: ORGANIZATION_ID,
      planToken,
    },
  );
  for (let iteration = 0; parity.status !== "complete"; iteration += 1) {
    if (iteration >= 100 || parity.status === "blocked") {
      throw new Error(parity.blockedReason ?? "Legacy-note parity did not finish.");
    }
    parity = await admin.mutation(
      (api as any).build_collaboration_legacy_note_parity
        .advanceBuildCollaborationLegacyNoteParity,
      {
        buildId,
        maxItems: 10,
        organizationId: ORGANIZATION_ID,
        parityRunId: parity.parityRunId,
        reason: "Rollout test parity.",
      },
    );
  }
  if (!parity.evidenceId) {
    throw new Error("Legacy-note parity did not produce evidence.");
  }
  return parity.evidenceId;
}

async function finishSearchMaintenance(t: ReturnType<typeof convexTest>) {
  for (let iteration = 0; iteration < 5000; iteration += 1) {
    const pendingJobIds = await t.run(async (ctx) =>
      (await ctx.db.query("buildCollaborationSearchJobs").collect())
        .filter((job) => job.status !== "complete")
        .map((job) => job._id),
    );
    if (pendingJobIds.length === 0) {
      return;
    }
    for (const jobId of pendingJobIds) {
      await t.mutation(
        (internal as any).build_collaboration_search_maintenance
          .processBuildCollaborationSearchJob,
        { jobId },
      );
    }
  }
  throw new Error("Search maintenance did not drain within the test bound.");
}

async function prepareSearchCutover(
  t: ReturnType<typeof convexTest>,
  buildId: Id<"activeBuilds">,
) {
  await t.mutation(
    (internal as any).build_collaboration_search_maintenance
      .ensureBuildCollaborationSearchMaintenance,
    { buildId, organizationId: ORGANIZATION_ID },
  );
  await finishSearchMaintenance(t);
  const checkId = await t.mutation(
    (internal as any).build_collaboration_search_maintenance
      .startBuildCollaborationSearchCutoverVerification,
    { buildId, organizationId: ORGANIZATION_ID },
  );
  for (let iteration = 0; iteration < 100; iteration += 1) {
    await t.mutation(
      (internal as any).build_collaboration_search_maintenance
        .processBuildCollaborationSearchCutoverVerification,
      { checkId },
    );
    await finishSearchMaintenance(t);
    const status = await t.run(async (ctx) => (await ctx.db.get(checkId))?.status);
    if (status !== "building") {
      return;
    }
  }
  throw new Error("Search cutover verification did not finish within the test bound.");
}

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
