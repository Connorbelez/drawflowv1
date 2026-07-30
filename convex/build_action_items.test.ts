/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { BuildCollaborationRole } from "./build_collaboration_model";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_action_item_rbac";

function withIdentity(
  t: ReturnType<typeof convexTest>,
  input: {
    organizationId?: string;
    role: BuildCollaborationRole;
    subject: string;
  }
) {
  return t.withIdentity({
    email: `${input.subject}@example.com`,
    name: input.subject,
    organizationId: input.organizationId ?? ORGANIZATION_ID,
    role: input.role,
    roles: [input.role],
    subject: input.subject,
    tokenIdentifier: `https://api.workos.com/|${input.subject}`,
    "https://fairlend.ca/actor_kind": "human",
  } as never);
}

async function seedActionItemBuild() {
  const base = convexTest(schema, modules);
  const admin = withIdentity(base, {
    role: "admin",
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
      borrowerWorkingCapitalLimitCents: 500_000_00,
      buildName: "Action Item RBAC Build",
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
      }
    );
    const activeBuildId = await ctx.db.insert("activeBuilds", {
      brokerageId: foundation.brokerageId,
      buildName: "Action Item RBAC Build",
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
    for (const participant of [
      {
        role: "contractor" as const,
        subject: "user_contractor_creator",
      },
      {
        role: "contractor" as const,
        subject: "user_contractor_reader",
      },
      {
        role: "builder" as const,
        subject: "user_builder",
      },
    ]) {
      await ctx.db.insert("buildParticipants", {
        brokerageId: foundation.brokerageId,
        buildId: activeBuildId,
        createdAt: now,
        displayNameSnapshot: participant.subject,
        joinedAt: now,
        organizationId: ORGANIZATION_ID,
        participationPeriod: 1,
        role: participant.role,
        status: "active",
        updatedAt: now,
        validFrom: now,
        workosUserId: participant.subject,
      });
    }
    return activeBuildId;
  });
  const postId = await admin.mutation(
    (api as any).build_collaboration
      .approveAndPublishBuildCollaborationBundle,
    {
      actionItems: [],
      audienceMode: "build_wide",
      buildId,
      organizationId: ORGANIZATION_ID,
      plainText: "Visible coordination post.",
      postType: "update",
      references: [],
      requestedReaderIds: [],
      tiptapJson: JSON.stringify({
        content: [
          {
            content: [{ text: "Visible coordination post.", type: "text" }],
            type: "paragraph",
          },
        ],
        type: "doc",
      }),
    }
  );
  return {
    admin,
    base,
    buildId,
    postId,
    builder: withIdentity(base, {
      role: "builder",
      subject: "user_builder",
    }),
    creator: withIdentity(base, {
      role: "contractor",
      subject: "user_contractor_creator",
    }),
    reader: withIdentity(base, {
      role: "contractor",
      subject: "user_contractor_reader",
    }),
  };
}

async function readActionItem(
  fixture: Awaited<ReturnType<typeof seedActionItemBuild>>,
  actionItemId: Id<"buildActionItems">
) {
  return await fixture.base.run(async (ctx) => {
    const item = await ctx.db.get(actionItemId);
    const events = await ctx.db
      .query("buildActionItemEvents")
      .withIndex("by_actionItemId_and_createdAt", (query) =>
        query.eq("actionItemId", actionItemId)
      )
      .collect();
    return { events, item };
  });
}

describe("Build Action Item server authorization", () => {
  test("creates idempotent rich Action Items with inherited visibility, projections, detail, and immutable history", async () => {
    const fixture = await seedActionItemBuild();
    const anchorActionItemId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        requestId: "anchor-action-item",
        title: "Confirm footing inspection",
      }
    );
    const assetId = await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Build fixture is unavailable.");
      }
      const storageId = await ctx.storage.store(
        new Blob(["inspection attachment"], { type: "text/plain" })
      );
      const now = Date.now();
      return await ctx.db.insert("buildCollaborationAssets", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now,
        fileName: "inspection.txt",
        maximumAudienceMode: "build_wide",
        mimeType: "text/plain",
        organizationId: ORGANIZATION_ID,
        sizeBytes: 21,
        state: "available",
        storageId,
        updatedAt: now,
        uploadedByWorkosUserId: "user_contractor_creator",
        version: 1,
      });
    });
    const baseline = await fixture.base.run(async (ctx) => {
      const post = await ctx.db.get(
        fixture.postId as Id<"buildCollaborationPosts">
      );
      const auditCount = (await ctx.db.query("auditEvents").collect()).length;
      const outboxCount = (await ctx.db.query("eventOutbox").collect()).length;
      return { auditCount, outboxCount, post };
    });
    const description = JSON.stringify({
      content: [
        {
          content: [
            {
              text: "Upload the engineer seal with ",
              type: "text",
            },
            {
              attrs: {
                eyebrow: "Forged role",
                id: "user_contractor_creator",
                kind: "participant",
                label: "Forged participant label",
                summary: "Forged participant summary",
              },
              type: "collaborationMention",
            },
          ],
          type: "paragraph",
        },
      ],
      type: "doc",
    });
    const creationInput = {
      assigneeWorkosUserId: "user_contractor_creator",
      attachmentAssetIds: [assetId],
      buildId: fixture.buildId,
      descriptionTiptapJson: description,
      dueAt: 1_800_000_000_000,
      labels: ["Evidence", "Draw 3", "evidence"],
      organizationId: ORGANIZATION_ID,
      postId: fixture.postId,
      priority: "high",
      references: [
        {
          entityId: "user_contractor_creator",
          entityKind: "participant",
          label: "Client-supplied label is ignored",
          primary: true,
        },
        {
          entityId: anchorActionItemId,
          entityKind: "actionItem",
          label: "Client-supplied action label is ignored",
        },
      ],
      requestId: "ticket-11-idempotency",
      title: "Upload engineer seal",
    };
    const actionItemId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      creationInput
    );
    const replayedId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      { ...creationInput, title: "Duplicate submission must not win" }
    );
    expect(replayedId).toBe(actionItemId);

    let detail = await fixture.reader.query(
      (api as any).build_action_item_details.getBuildActionItemDetail,
      {
        actionItemId,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(detail).toMatchObject({
      attachments: [{ fileName: "inspection.txt", state: "available" }],
      item: {
        actionItemId,
        assigneeWorkosUserId: "user_contractor_creator",
        audienceMode: "build_wide",
        creatorWorkosUserId: "user_contractor_creator",
        currentRevision: 1,
        priority: "high",
        title: "Upload engineer seal",
      },
      labels: ["Draw 3", "Evidence"],
      references: [
        {
          entityId: "user_contractor_creator",
          entityKind: "participant",
          label: "user_contractor_creator",
        },
        {
          entityId: anchorActionItemId,
          entityKind: "actionItem",
          label: "Confirm footing inspection",
        },
      ],
      state: "visible",
    });
    expect(detail.revisions).toHaveLength(1);
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(assetId, {
        state: "quarantined",
        updatedAt: Date.now(),
      });
    });
    detail = await fixture.reader.query(
      (api as any).build_action_item_details.getBuildActionItemDetail,
      {
        actionItemId,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(detail.attachments).toEqual([]);
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(assetId, {
        state: "available",
        updatedAt: Date.now(),
      });
    });

    await fixture.reader.mutation(
      (api as any).build_action_item_details.addBuildActionItemComment,
      {
        actionItemId,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        references: [
          {
            entityId: "user_contractor_creator",
            entityKind: "participant",
            label: "Ignored",
          },
        ],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                { text: "I will upload this with ", type: "text" },
                {
                  attrs: {
                    id: "user_contractor_creator",
                    kind: "participant",
                    label: "Forged comment label",
                  },
                  type: "collaborationMention",
                },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      }
    );
    await fixture.creator.mutation(
      (api as any).build_action_items.updateBuildActionItem,
      {
        actionItemId,
        buildId: fixture.buildId,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        title: "Upload signed engineer seal",
      }
    );
    detail = await fixture.reader.query(
      (api as any).build_action_item_details.getBuildActionItemDetail,
      {
        actionItemId,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(detail.comments).toMatchObject([
      {
        authorDisplayName: "user_contractor_reader",
        plainText: expect.stringContaining("I will upload this with"),
        references: [
          {
            entityId: "user_contractor_creator",
            entityKind: "participant",
          },
        ],
      },
    ]);
    expect(detail.revisions.map((revision: any) => revision.revision)).toEqual([
      2, 1,
    ]);

    const effects = await fixture.base.run(async (ctx) => {
      const post = await ctx.db.get(
        fixture.postId as Id<"buildCollaborationPosts">
      );
      const audits = (await ctx.db.query("auditEvents").collect()).filter(
        (event) =>
          event.eventType === "build.collaboration.action_item.created" &&
          event.entityId === actionItemId
      );
      const outbox = (await ctx.db.query("eventOutbox").collect()).filter(
        (event) =>
          event.eventType === "build.collaboration.action_item.created" &&
          event.relatedEntityId === actionItemId
      );
      const projections = await ctx.db
        .query("buildCollaborationActivityProjections")
        .withIndex("by_buildId_and_projectionKey", (query) =>
          query.eq("buildId", fixture.buildId)
        )
        .collect();
      const requests = await ctx.db
        .query("buildActionItemCreationRequests")
        .withIndex(
          "by_postId_and_creatorWorkosUserId_and_requestId",
          (query) =>
            query
              .eq("postId", fixture.postId)
              .eq("creatorWorkosUserId", "user_contractor_creator")
              .eq("requestId", "ticket-11-idempotency")
        )
        .collect();
      return {
        auditCount: (await ctx.db.query("auditEvents").collect()).length,
        audits,
        outbox,
        outboxCount: (await ctx.db.query("eventOutbox").collect()).length,
        post,
        projections: projections.filter(
          (projection) => projection.actionItemId === actionItemId
        ),
        requests,
      };
    });
    expect(effects.audits).toHaveLength(1);
    expect(effects.outbox).toHaveLength(1);
    expect(effects.projections).toHaveLength(3);
    expect(effects.requests).toHaveLength(1);
    expect(effects.auditCount - baseline.auditCount).toBe(1);
    expect(effects.outboxCount - baseline.outboxCount).toBe(1);
    expect(effects.post?.openActionItemCount).toBe(
      (baseline.post?.openActionItemCount ?? 0) + 1
    );
    expect(effects.post?.lastMeaningfulActivityAt).toBeGreaterThan(
      baseline.post?.lastMeaningfulActivityAt ?? 0
    );

    const crossBuildActionItemId = await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Build fixture is unavailable.");
      }
      const {
        _creationTime: _ignoredCreationTime,
        _id: _ignoredId,
        ...buildFields
      } = build;
      const otherBuildId = await ctx.db.insert("activeBuilds", {
        ...buildFields,
        buildName: "Other Build",
      });
      const now = Date.now();
      return await ctx.db.insert("buildActionItems", {
        assignmentState: "unassigned",
        brokerageId: build.brokerageId,
        buildId: otherBuildId,
        createdAt: now,
        creatorRole: "contractor",
        creatorWorkosUserId: "user_contractor_creator",
        currentRevision: 1,
        descriptionPlainText: "",
        descriptionTiptapJson: JSON.stringify({
          content: [],
          type: "doc",
        }),
        originatingPostId: fixture.postId,
        organizationId: ORGANIZATION_ID,
        priority: "none",
        requiresAcceptance: false,
        status: "todo",
        title: "Cross-Build work",
        updatedAt: now,
      });
    });
    await expect(
      fixture.creator.mutation(
        (api as any).build_action_items.createBuildActionItem,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: fixture.postId,
          references: [
            {
              entityId: crossBuildActionItemId,
              entityKind: "actionItem",
              label: "Cross-Build work",
            },
          ],
          requestId: "cross-build-reference",
          title: "Invalid cross-Build reference",
        }
      )
    ).rejects.toThrow(
      "referenced entity does not exist in this active Build"
    );

    const restrictedPostId = await fixture.builder.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "custom",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Builder-only coordination.",
        postType: "update",
        references: [],
        requestedReaderIds: ["user_builder"],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [{ text: "Builder-only coordination.", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      }
    );
    await expect(
      fixture.reader.mutation(
        (api as any).build_action_items.createBuildActionItem,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: restrictedPostId,
          requestId: "restricted-post",
          title: "Must not be created",
        }
      )
    ).rejects.toThrow("parent post is unavailable");

    const otherCustomPostId = await fixture.builder.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "custom",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Builder and reader coordination.",
        postType: "update",
        references: [],
        requestedReaderIds: ["user_builder", "user_contractor_reader"],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                { text: "Builder and reader coordination.", type: "text" },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      }
    );
    const restrictedAssetId = await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Build fixture is unavailable.");
      }
      const storageId = await ctx.storage.store(
        new Blob(["restricted attachment"], { type: "text/plain" })
      );
      const now = Date.now();
      return await ctx.db.insert("buildCollaborationAssets", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now,
        fileName: "builder-only.txt",
        maximumAudienceMode: "custom",
        mimeType: "text/plain",
        organizationId: ORGANIZATION_ID,
        originatingPostId: restrictedPostId,
        readerWorkosUserIds: ["user_builder"],
        sizeBytes: 21,
        state: "available",
        storageId,
        updatedAt: now,
        uploadedByWorkosUserId: "user_builder",
        version: 1,
      });
    });
    await expect(
      fixture.builder.mutation(
        (api as any).build_action_items.createBuildActionItem,
        {
          attachmentAssetIds: [restrictedAssetId],
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: otherCustomPostId,
          requestId: "cross-custom-audience-asset",
          title: "Must not widen attachment audience",
        }
      )
    ).rejects.toThrow("attachment is unavailable");

    await fixture.base.run(async (ctx) => {
      const creatorParticipation = await ctx.db
        .query("buildParticipants")
        .withIndex("by_buildId_and_workosUserId", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq("workosUserId", "user_contractor_creator")
        )
        .unique();
      if (creatorParticipation) {
        await ctx.db.patch(creatorParticipation._id, {
          status: "removed",
          updatedAt: Date.now(),
        });
      }
    });
    detail = await fixture.reader.query(
      (api as any).build_action_item_details.getBuildActionItemDetail,
      {
        actionItemId,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(detail.references).toContainEqual(
      expect.objectContaining({
        entityId: "user_contractor_creator",
        label: "Unavailable reference",
      })
    );
    expect(detail.item.descriptionTiptapJson).toContain(
      "[Referenced item unavailable]"
    );
    expect(detail.item.descriptionTiptapJson).not.toContain(
      "Forged participant label"
    );
    expect(detail.revisions[0]?.snapshotJson).toContain(
      "[Referenced item unavailable]"
    );
    expect(detail.comments[0]?.tiptapJson).toContain(
      "[Referenced item unavailable]"
    );
    expect(detail.comments[0]?.tiptapJson).not.toContain(
      "Forged comment label"
    );
  });

  test("originating-post attachments follow live build-wide and tiered audiences", async () => {
    const fixture = await seedActionItemBuild();
    const insertOriginatingAsset = async (input: {
      audienceMode: "author_tier_and_higher" | "build_wide";
      fileName: string;
      postId: Id<"buildCollaborationPosts">;
      readerWorkosUserIds: string[];
    }) =>
      await fixture.base.run(async (ctx) => {
        const build = await ctx.db.get(fixture.buildId);
        if (!build) {
          throw new Error("Build fixture is unavailable.");
        }
        const storageId = await ctx.storage.store(
          new Blob([input.fileName], { type: "text/plain" })
        );
        const now = Date.now();
        return await ctx.db.insert("buildCollaborationAssets", {
          brokerageId: build.brokerageId,
          buildId: build._id,
          createdAt: now,
          fileName: input.fileName,
          maximumAudienceMode: input.audienceMode,
          mimeType: "text/plain",
          organizationId: ORGANIZATION_ID,
          originatingPostId: input.postId,
          readerWorkosUserIds: input.readerWorkosUserIds,
          sizeBytes: input.fileName.length,
          state: "available",
          storageId,
          updatedAt: now,
          uploadedByWorkosUserId: "user_builder",
          version: 1,
        });
      });
    const addParticipant = async (
      role: BuildCollaborationRole,
      workosUserId: string
    ) =>
      await fixture.base.run(async (ctx) => {
        const build = await ctx.db.get(fixture.buildId);
        if (!build) {
          throw new Error("Build fixture is unavailable.");
        }
        const now = Date.now();
        await ctx.db.insert("buildParticipants", {
          brokerageId: build.brokerageId,
          buildId: build._id,
          createdAt: now,
          displayNameSnapshot: workosUserId,
          joinedAt: now,
          organizationId: ORGANIZATION_ID,
          participationPeriod: 1,
          role,
          status: "active",
          updatedAt: now,
          validFrom: now,
          workosUserId,
        });
      });

    const buildWideAssetId = await insertOriginatingAsset({
      audienceMode: "build_wide",
      fileName: "build-wide.txt",
      postId: fixture.postId,
      readerWorkosUserIds: [
        "user_builder",
        "user_contractor_creator",
        "user_contractor_reader",
      ],
    });
    const buildWideItemId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        attachmentAssetIds: [buildWideAssetId],
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Build-wide attachment",
      }
    );
    await addParticipant("contractor", "user_new_contractor");
    let detail = await fixture.reader.query(
      (api as any).build_action_item_details.getBuildActionItemDetail,
      {
        actionItemId: buildWideItemId,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(detail.attachments).toMatchObject([
      { fileName: "build-wide.txt", state: "available" },
    ]);

    const tieredPostId = await fixture.builder.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "author_tier_and_higher",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Tiered coordination.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [{ text: "Tiered coordination.", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      }
    );
    const tieredAssetId = await insertOriginatingAsset({
      audienceMode: "author_tier_and_higher",
      fileName: "tiered.txt",
      postId: tieredPostId,
      readerWorkosUserIds: ["user_builder"],
    });
    const tieredItemId = await fixture.builder.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        attachmentAssetIds: [tieredAssetId],
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: tieredPostId,
        title: "Tiered attachment",
      }
    );
    await addParticipant("broker", "user_new_broker");
    detail = await fixture.builder.query(
      (api as any).build_action_item_details.getBuildActionItemDetail,
      {
        actionItemId: tieredItemId,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(detail.attachments).toMatchObject([
      { fileName: "tiered.txt", state: "available" },
    ]);
  });

  test("a reader may create, but cannot mutate another participant's Action Item", async () => {
    const fixture = await seedActionItemBuild();
    const actionItemId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        assigneeWorkosUserId: "user_contractor_creator",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Upload the footing inspection",
      }
    );

    await expect(
      fixture.reader.mutation(
        (api as any).build_action_items.updateBuildActionItem,
        {
          actionItemId,
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          title: "Reader hijacked title",
        }
      )
    ).rejects.toThrow("Forbidden: Action Item edit fields authority");

    await fixture.creator.mutation(
      (api as any).build_action_items.updateBuildActionItem,
      {
        actionItemId,
        buildId: fixture.buildId,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        status: "in_progress",
      }
    );
    await fixture.creator.mutation(
      (api as any).build_action_items.updateBuildActionItem,
      {
        actionItemId,
        buildId: fixture.buildId,
        expectedRevision: 2,
        organizationId: ORGANIZATION_ID,
        status: "done",
      }
    );

    const persisted = await readActionItem(fixture, actionItemId);
    expect(persisted.item).toMatchObject({
      currentRevision: 3,
      status: "done",
    });
    expect(persisted.events.at(-1)).toMatchObject({
      actorRole: "contractor",
      actorWorkosUserId: "user_contractor_creator",
      exercisedAuthority: "assignee",
      revision: 3,
    });
    expect(persisted.events.at(-1)?.priorState).toBeTruthy();
    expect(persisted.events.at(-1)?.newState).toBeTruthy();
  });

  test("upward assignment requests acceptance and preserves assigning authority", async () => {
    const fixture = await seedActionItemBuild();
    const actionItemId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Review the draw blocker",
      }
    );
    await fixture.creator.mutation(
      (api as any).build_action_items.updateBuildActionItem,
      {
        actionItemId,
        assigneeWorkosUserId: "user_builder",
        buildId: fixture.buildId,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
      }
    );
    let persisted = await readActionItem(fixture, actionItemId);
    expect(persisted.item).toMatchObject({
      assignedByWorkosUserId: "user_contractor_creator",
      assigneeWorkosUserId: "user_builder",
      assignmentState: "requested",
      requiresAcceptance: true,
    });
    expect(persisted.events.at(-1)?.warnings).toEqual([
      "assignment_requested",
    ]);

    await expect(
      fixture.creator.mutation(
        (api as any).build_action_items.acceptBuildActionItemAssignment,
        {
          actionItemId,
          buildId: fixture.buildId,
          expectedRevision: 2,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("Forbidden: Action Item accept assignment authority");
    await fixture.builder.mutation(
      (api as any).build_action_items.acceptBuildActionItemAssignment,
      {
        actionItemId,
        buildId: fixture.buildId,
        expectedRevision: 2,
        organizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.creator.mutation(
        (api as any).build_action_items.updateBuildActionItem,
        {
          actionItemId,
          buildId: fixture.buildId,
          expectedRevision: 3,
          organizationId: ORGANIZATION_ID,
          requiresAcceptance: false,
        }
      )
    ).rejects.toThrow(
      "Completion acceptance is mandatory for this upward assignment."
    );
    persisted = await readActionItem(fixture, actionItemId);
    expect(persisted.item).toMatchObject({
      assignmentState: "assigned",
      currentRevision: 3,
    });
    expect(persisted.events.at(-1)).toMatchObject({
      exercisedAuthority: "assignee",
      revision: 3,
    });
  });

  test("blocked work restores only its preceding active state and audits complete before/after snapshots", async () => {
    const fixture = await seedActionItemBuild();
    const actionItemId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        assigneeWorkosUserId: "user_contractor_creator",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Original title",
      }
    );
    await fixture.creator.mutation(
      (api as any).build_action_items.updateBuildActionItem,
      {
        actionItemId,
        buildId: fixture.buildId,
        dueAt: 1_800_000_000_000,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        title: "Revised title",
      }
    );
    await fixture.creator.mutation(
      (api as any).build_action_items.updateBuildActionItem,
      {
        actionItemId,
        buildId: fixture.buildId,
        expectedRevision: 2,
        organizationId: ORGANIZATION_ID,
        status: "in_progress",
      }
    );
    await fixture.creator.mutation(
      (api as any).build_action_items.updateBuildActionItem,
      {
        actionItemId,
        buildId: fixture.buildId,
        expectedRevision: 3,
        organizationId: ORGANIZATION_ID,
        status: "in_review",
      }
    );
    await fixture.creator.mutation(
      (api as any).build_action_items.updateBuildActionItem,
      {
        actionItemId,
        blockedReason: "Waiting on engineering",
        buildId: fixture.buildId,
        expectedRevision: 4,
        organizationId: ORGANIZATION_ID,
        status: "blocked",
      }
    );
    await expect(
      fixture.creator.mutation(
        (api as any).build_action_items.updateBuildActionItem,
        {
          actionItemId,
          buildId: fixture.buildId,
          expectedRevision: 5,
          organizationId: ORGANIZATION_ID,
          status: "in_progress",
        }
      )
    ).rejects.toThrow(
      "Unblocking must restore the Action Item's preceding active state."
    );
    await fixture.creator.mutation(
      (api as any).build_action_items.updateBuildActionItem,
      {
        actionItemId,
        buildId: fixture.buildId,
        expectedRevision: 5,
        organizationId: ORGANIZATION_ID,
        status: "in_review",
      }
    );

    const persisted = await readActionItem(fixture, actionItemId);
    const editEvent = persisted.events.find((event) => event.revision === 2);
    expect(JSON.parse(editEvent?.priorState ?? "{}")).toMatchObject({
      dueAt: null,
      title: "Original title",
    });
    expect(JSON.parse(editEvent?.newState ?? "{}")).toMatchObject({
      dueAt: 1_800_000_000_000,
      title: "Revised title",
    });
    expect(persisted.item).toMatchObject({
      currentRevision: 6,
      status: "in_review",
    });
  });

  test("relationship creation requires every source reader to read the target", async () => {
    const fixture = await seedActionItemBuild();
    const narrowPostId = await fixture.builder.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "custom",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Builder-only blocker.",
        postType: "update",
        references: [],
        requestedReaderIds: ["user_builder"],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [{ text: "Builder-only blocker.", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      }
    );
    const sourceActionItemId = await fixture.builder.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: narrowPostId,
        title: "Narrow blocker",
      }
    );
    const targetActionItemId = await fixture.builder.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Build-wide dependent work",
      }
    );

    await expect(
      fixture.builder.mutation(
        (api as any).build_action_items.linkBuildActionItems,
        {
          buildId: fixture.buildId,
          kind: "blocks",
          organizationId: ORGANIZATION_ID,
          sourceActionItemId,
          targetActionItemId,
        }
      )
    ).rejects.toThrow(
      "Every reader of the dependent Action Item must be able to read the related Action Item."
    );
  });

  test("participants joining after a build-wide post can receive its Action Items", async () => {
    const fixture = await seedActionItemBuild();
    await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Build fixture is unavailable.");
      }
      const now = Date.now();
      await ctx.db.insert("buildParticipants", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now,
        displayNameSnapshot: "Late participant",
        joinedAt: now,
        organizationId: ORGANIZATION_ID,
        participationPeriod: 1,
        role: "contractor",
        status: "active",
        updatedAt: now,
        validFrom: now,
        workosUserId: "user_late_contractor",
      });
    });
    const actionItemId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        assigneeWorkosUserId: "user_late_contractor",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Late assignment",
      }
    );
    const persisted = await readActionItem(fixture, actionItemId);
    expect(persisted.item).toMatchObject({
      assigneeWorkosUserId: "user_late_contractor",
      assignmentState: "assigned",
    });
  });

  test("removed participants and cross-tenant calls cannot exercise Action Item authority", async () => {
    const fixture = await seedActionItemBuild();
    const actionItemId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Protected work",
      }
    );
    await fixture.base.run(async (ctx) => {
      const participant = await ctx.db
        .query("buildParticipants")
        .withIndex("by_buildId_and_workosUserId", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq("workosUserId", "user_contractor_reader")
        )
        .unique();
      if (!participant) {
        throw new Error("Participant fixture is unavailable.");
      }
      await ctx.db.patch(participant._id, {
        removedAt: Date.now(),
        removalReason: "Removed for RBAC test",
        status: "removed",
        updatedAt: Date.now(),
        validUntil: Date.now(),
      });
    });

    await expect(
      fixture.reader.mutation(
        (api as any).build_action_items.updateBuildActionItem,
        {
          actionItemId,
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          title: "Removed participant edit",
        }
      )
    ).rejects.toThrow("Forbidden: active build participation");
    await expect(
      fixture.creator.mutation(
        (api as any).build_action_items.updateBuildActionItem,
        {
          actionItemId,
          buildId: fixture.buildId,
          organizationId: "org_other_tenant",
          title: "Cross-tenant edit",
        }
      )
    ).rejects.toThrow();
  });
});
