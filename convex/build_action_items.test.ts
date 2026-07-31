/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";

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
    brokerageId: foundation.brokerageId,
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
        contentHashSha256: "a".repeat(64),
        createdAt: now,
        fileName: "inspection.txt",
        maximumAudienceMode: "build_wide",
        mimeType: "text/plain",
        organizationId: ORGANIZATION_ID,
        scanState: "clean",
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
    expect(effects.auditCount - baseline.auditCount).toBe(2);
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
        contentHashSha256: "b".repeat(64),
        createdAt: now,
        fileName: "builder-only.txt",
        maximumAudienceMode: "custom",
        mimeType: "text/plain",
        organizationId: ORGANIZATION_ID,
        originatingPostId: restrictedPostId,
        readerWorkosUserIds: ["user_builder"],
        scanState: "clean",
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
          contentHashSha256: "c".repeat(64),
          createdAt: now,
          fileName: input.fileName,
          maximumAudienceMode: input.audienceMode,
          mimeType: "text/plain",
          organizationId: ORGANIZATION_ID,
          originatingPostId: input.postId,
          readerWorkosUserIds: input.readerWorkosUserIds,
          scanState: "clean",
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
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId,
        buildId: fixture.buildId,
        expectedRevision: 1,
        nextStatus: "in_progress",
        organizationId: ORGANIZATION_ID,
      }
    );
    await fixture.creator.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId,
        buildId: fixture.buildId,
        expectedRevision: 2,
        nextStatus: "done",
        organizationId: ORGANIZATION_ID,
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
      (api as any).build_action_item_workflow.assignBuildActionItem,
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
        (api as any).build_action_item_workflow
          .acceptBuildActionItemAssignment,
        {
          actionItemId,
          buildId: fixture.buildId,
          expectedRevision: 2,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("Forbidden: Action Item accept assignment authority");
    await fixture.builder.mutation(
      (api as any).build_action_item_workflow
        .acceptBuildActionItemAssignment,
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
      "Completion acceptance is mandatory for this Action Item."
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
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId,
        buildId: fixture.buildId,
        expectedRevision: 2,
        nextStatus: "in_progress",
        organizationId: ORGANIZATION_ID,
      }
    );
    await fixture.creator.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId,
        buildId: fixture.buildId,
        expectedRevision: 3,
        nextStatus: "in_review",
        organizationId: ORGANIZATION_ID,
      }
    );
    await fixture.creator.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId,
        buildId: fixture.buildId,
        expectedRevision: 4,
        nextStatus: "blocked",
        organizationId: ORGANIZATION_ID,
        reason: "Waiting on engineering",
      }
    );
    await expect(
      fixture.creator.mutation(
        (api as any).build_action_item_workflow.transitionBuildActionItem,
        {
          actionItemId,
          buildId: fixture.buildId,
          expectedRevision: 5,
          nextStatus: "in_progress",
          organizationId: ORGANIZATION_ID,
          reason: "Attempt wrong restore",
        }
      )
    ).rejects.toThrow(
      "Reopening must restore the preceding in_review state."
    );
    await fixture.creator.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId,
        buildId: fixture.buildId,
        expectedRevision: 5,
        nextStatus: "in_review",
        organizationId: ORGANIZATION_ID,
        reason: "Engineering response arrived",
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
        (api as any).build_action_item_structure.linkBuildActionItems,
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

  test("supports one level of first-class child work beside non-assignable checklist rows", async () => {
    const fixture = await seedActionItemBuild();
    const parentActionItemId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Coordinate foundation closeout",
      }
    );
    const childActionItemId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        assigneeWorkosUserId: "user_contractor_reader",
        buildId: fixture.buildId,
        descriptionTiptapJson: JSON.stringify({
          content: [
            {
              content: [{ text: "Upload the final footing photo.", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
        expectedParentRevision: 1,
        organizationId: ORGANIZATION_ID,
        parentActionItemId,
        postId: fixture.postId,
        title: "Upload final footing photo",
      }
    );
    await expect(
      fixture.creator.mutation(
        (api as any).build_action_items.createBuildActionItem,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          parentActionItemId: childActionItemId,
          postId: fixture.postId,
          title: "Disallowed grandchild",
        }
      )
    ).rejects.toThrow("only one level of child Action Items");

    const checklistItemId = await fixture.creator.mutation(
      (api as any).build_action_item_structure
        .addBuildActionItemChecklistItem,
      {
        actionItemId: parentActionItemId,
        buildId: fixture.buildId,
        expectedRevision: 2,
        label: "Confirm file naming",
        organizationId: ORGANIZATION_ID,
        required: true,
      }
    );
    await fixture.creator.mutation(
      (api as any).build_action_item_structure
        .toggleBuildActionItemChecklistItem,
      {
        buildId: fixture.buildId,
        checklistItemId,
        expectedRevision: 3,
        organizationId: ORGANIZATION_ID,
      }
    );
    await fixture.reader.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId: childActionItemId,
        buildId: fixture.buildId,
        expectedRevision: 1,
        nextStatus: "in_progress",
        organizationId: ORGANIZATION_ID,
      }
    );

    const structure = await fixture.creator.query(
      (api as any).build_action_item_structure
        .getBuildActionItemStructureContext,
      {
        actionItemId: parentActionItemId,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(structure).toMatchObject({
      checklist: [
        {
          checklistItemId,
          completed: true,
          label: "Confirm file naming",
          required: true,
        },
      ],
      children: [
        {
          actionItemId: childActionItemId,
          assigneeWorkosUserId: "user_contractor_reader",
          status: "in_progress",
          title: "Upload final footing photo",
        },
      ],
      state: "visible",
      viewerCanCreateChild: true,
    });
    expect(structure.checklist[0]).not.toHaveProperty("assigneeWorkosUserId");

    const persisted = await fixture.base.run(async (ctx) => ({
      child: await ctx.db.get(
        childActionItemId as Id<"buildActionItems">
      ),
      parent: await ctx.db.get(
        parentActionItemId as Id<"buildActionItems">
      ),
    }));
    expect(persisted.child?.parentActionItemId).toBe(parentActionItemId);
    expect(persisted.parent?.status).toBe("todo");
  });

  test("never exposes an unreadable relationship endpoint from the legacy Action Item list", async () => {
    const fixture = await seedActionItemBuild();
    const restrictedPostId = await fixture.builder.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "author_tier_and_higher",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Builder-only dependent work.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                { text: "Builder-only dependent work.", type: "text" },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      }
    );
    const sourceId = await fixture.builder.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Build-wide blocker",
      }
    );
    const restrictedTargetId = await fixture.builder.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: restrictedPostId,
        title: "Restricted dependent",
      }
    );
    await fixture.builder.mutation(
      (api as any).build_action_item_structure.linkBuildActionItems,
      {
        buildId: fixture.buildId,
        kind: "blocks",
        organizationId: ORGANIZATION_ID,
        sourceActionItemId: sourceId,
        targetActionItemId: restrictedTargetId,
      }
    );
    const list = await fixture.reader.query(
      (api as any).build_action_items.listBuildActionItems,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
    );
    expect(
      list.find((row: any) => row.item._id === sourceId)?.relations
    ).toEqual([]);
    expect(JSON.stringify(list)).not.toContain(String(restrictedTargetId));

    const structure = await fixture.reader.query(
      (api as any).build_action_item_structure
        .getBuildActionItemStructureContext,
      {
        actionItemId: sourceId,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(structure.relations).toEqual([
      expect.objectContaining({ kind: "blocks" }),
    ]);
    expect(structure.relations[0]).not.toHaveProperty("otherActionItemId");
    expect(structure.relations[0]).not.toHaveProperty("otherActionItemTitle");
  });

  test("keeps dependency, related, and duplicate links cycle-free, idempotent, and visible from both items", async () => {
    const fixture = await seedActionItemBuild();
    const [firstId, secondId, thirdId] = await Promise.all(
      ["Excavate", "Inspect", "Release"].map((title) =>
        fixture.creator.mutation(
          (api as any).build_action_items.createBuildActionItem,
          {
            buildId: fixture.buildId,
            organizationId: ORGANIZATION_ID,
            postId: fixture.postId,
            title,
          }
        )
      )
    );
    const firstRelationId = await fixture.creator.mutation(
      (api as any).build_action_item_structure.linkBuildActionItems,
      {
        buildId: fixture.buildId,
        expectedSourceRevision: 1,
        kind: "blocks",
        organizationId: ORGANIZATION_ID,
        sourceActionItemId: firstId,
        targetActionItemId: secondId,
      }
    );
    await expect(
      fixture.reader.mutation(
        (api as any).build_action_item_structure.linkBuildActionItems,
        {
          buildId: fixture.buildId,
          kind: "blocks",
          organizationId: ORGANIZATION_ID,
          sourceActionItemId: firstId,
          targetActionItemId: secondId,
        }
      )
    ).rejects.toThrow("Forbidden: Action Item link relation authority");
    await expect(
      fixture.reader.mutation(
        (api as any).build_action_item_structure
          .repairBuildActionItemRelation,
        {
          buildId: fixture.buildId,
          expectedSourceRevision: 2,
          organizationId: ORGANIZATION_ID,
          reason: "Unauthorized replay",
          relationId: firstRelationId,
        }
      )
    ).rejects.toThrow("Forbidden: Action Item repair relation authority");
    await fixture.creator.mutation(
      (api as any).build_action_item_structure.linkBuildActionItems,
      {
        buildId: fixture.buildId,
        expectedSourceRevision: 2,
        kind: "blocks",
        organizationId: ORGANIZATION_ID,
        sourceActionItemId: secondId,
        targetActionItemId: thirdId,
      }
    );
    await expect(
      fixture.creator.mutation(
        (api as any).build_action_item_structure.linkBuildActionItems,
        {
          buildId: fixture.buildId,
          kind: "blocks",
          organizationId: ORGANIZATION_ID,
          sourceActionItemId: thirdId,
          targetActionItemId: firstId,
        }
      )
    ).rejects.toThrow("would create a cycle");
    await expect(
      fixture.creator.mutation(
        (api as any).build_action_item_structure.linkBuildActionItems,
        {
          buildId: fixture.buildId,
          kind: "related",
          organizationId: ORGANIZATION_ID,
          sourceActionItemId: firstId,
          targetActionItemId: firstId,
        }
      )
    ).rejects.toThrow("cannot relate to itself");

    const relatedIds = await Promise.all([
      fixture.creator.mutation(
        (api as any).build_action_item_structure.linkBuildActionItems,
        {
          buildId: fixture.buildId,
          expectedSourceRevision: 2,
          kind: "related",
          organizationId: ORGANIZATION_ID,
          sourceActionItemId: firstId,
          targetActionItemId: thirdId,
        }
      ),
      fixture.creator.mutation(
        (api as any).build_action_item_structure.linkBuildActionItems,
        {
          buildId: fixture.buildId,
          expectedSourceRevision: 2,
          kind: "related",
          organizationId: ORGANIZATION_ID,
          sourceActionItemId: firstId,
          targetActionItemId: thirdId,
        }
      ),
    ]);
    expect(new Set(relatedIds).size).toBe(1);
    await fixture.creator.mutation(
      (api as any).build_action_item_structure.linkBuildActionItems,
      {
        buildId: fixture.buildId,
        kind: "duplicate",
        organizationId: ORGANIZATION_ID,
        sourceActionItemId: thirdId,
        targetActionItemId: secondId,
      }
    );

    const firstStructure = await fixture.creator.query(
      (api as any).build_action_item_structure
        .getBuildActionItemStructureContext,
      {
        actionItemId: firstId,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );
    const thirdStructure = await fixture.creator.query(
      (api as any).build_action_item_structure
        .getBuildActionItemStructureContext,
      {
        actionItemId: thirdId,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(firstStructure.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          direction: "outgoing",
          kind: "blocks",
          otherActionItemId: secondId,
          status: "active",
        }),
        expect.objectContaining({
          kind: "related",
          otherActionItemId: thirdId,
          status: "active",
        }),
      ])
    );
    expect(thirdStructure.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          direction: "incoming",
          kind: "related",
          otherActionItemId: firstId,
        }),
        expect.objectContaining({
          kind: "duplicate",
          otherActionItemId: secondId,
        }),
      ])
    );
    const relationEvents = await fixture.base.run(async (ctx) => {
      const firstEvents = await ctx.db
        .query("buildActionItemEvents")
        .withIndex("by_actionItemId_and_createdAt", (query) =>
          query.eq("actionItemId", firstId)
        )
        .collect();
      const thirdEvents = await ctx.db
        .query("buildActionItemEvents")
        .withIndex("by_actionItemId_and_createdAt", (query) =>
          query.eq("actionItemId", thirdId)
        )
        .collect();
      return { firstEvents, thirdEvents };
    });
    expect(
      relationEvents.firstEvents.some(
        (event) => event.eventType === "relation_linked"
      )
    ).toBe(true);
    expect(
      relationEvents.thirdEvents.some(
        (event) => event.eventType === "relation_linked"
      )
    ).toBe(true);
    const detail = await fixture.creator.query(
      (api as any).build_action_item_details.getBuildActionItemDetail,
      {
        actionItemId: firstId,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(detail.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "relation_linked" }),
      ])
    );

    const legacyRelations = await fixture.base.run(async (ctx) => {
      const now = Date.now();
      const directId = await ctx.db.insert("buildActionItemRelations", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: now,
        createdByWorkosUserId: "user_builder",
        kind: "related",
        organizationId: ORGANIZATION_ID,
        sourceActionItemId: secondId,
        status: "active",
        targetActionItemId: firstId,
        updatedAt: now,
      });
      const reverseId = await ctx.db.insert("buildActionItemRelations", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: now + 1,
        createdByWorkosUserId: "user_builder",
        kind: "related",
        organizationId: ORGANIZATION_ID,
        sourceActionItemId: firstId,
        status: "active",
        targetActionItemId: secondId,
        updatedAt: now + 1,
      });
      return { directId, reverseId };
    });
    const replayedLegacyRelationId = await fixture.creator.mutation(
      (api as any).build_action_item_structure.linkBuildActionItems,
      {
        buildId: fixture.buildId,
        kind: "related",
        organizationId: ORGANIZATION_ID,
        sourceActionItemId: firstId,
        targetActionItemId: secondId,
      }
    );
    expect(replayedLegacyRelationId).toBe(legacyRelations.directId);
    const reconciledLegacy = await fixture.base.run(async (ctx) => ({
      audits: (await ctx.db.query("auditEvents").collect()).filter(
        (event) => event.eventType === "build.collaboration.action_item.relation_superseded"
      ),
      direct: await ctx.db.get(legacyRelations.directId),
      endpointEvents: (
        await ctx.db
          .query("buildActionItemEvents")
          .withIndex("by_actionItemId_and_createdAt", (query) =>
            query.eq("actionItemId", firstId)
          )
          .collect()
      ).filter((event) => event.eventType === "relation_superseded"),
      reverse: await ctx.db.get(legacyRelations.reverseId),
    }));
    const upgradedLegacyRelation = reconciledLegacy.direct;
    expect(upgradedLegacyRelation?.relationshipKey).toBe(
      `related:${[String(firstId), String(secondId)].sort().join(":")}`
    );
    expect(reconciledLegacy.reverse).toMatchObject({
      status: "superseded",
      supersededByRelationId: legacyRelations.directId,
    });
    expect(reconciledLegacy.audits).toHaveLength(1);
    expect(reconciledLegacy.endpointEvents).toHaveLength(1);
    await expect(
      fixture.builder.mutation(
        (api as any).build_action_item_structure.repairBuildActionItemRelation,
        {
          buildId: fixture.buildId,
          expectedSourceRevision: 0,
          organizationId: ORGANIZATION_ID,
          reason: "Attempt to revive a quarantined duplicate",
          relationId: legacyRelations.reverseId,
        }
      )
    ).rejects.toThrow("Superseded Action Item relationships cannot be repaired");
    const deduplicatedStructure = await fixture.creator.query(
      (api as any).build_action_item_structure
        .getBuildActionItemStructureContext,
      {
        actionItemId: firstId,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(
      deduplicatedStructure.relations.filter(
        (relation: any) =>
          relation.kind === "related" &&
          relation.otherActionItemId === secondId
      )
    ).toHaveLength(1);
  });

  test("rejects dependency restoration when the active graph changed into a cycle", async () => {
    const fixture = await seedActionItemBuild();
    const [firstId, secondId] = await Promise.all(
      ["Prepare inspection", "Release inspection"].map((title) =>
        fixture.builder.mutation(
          (api as any).build_action_items.createBuildActionItem,
          {
            buildId: fixture.buildId,
            organizationId: ORGANIZATION_ID,
            postId: fixture.postId,
            title,
          }
        )
      )
    );
    await fixture.builder.mutation(
      (api as any).build_action_item_structure.linkBuildActionItems,
      {
        buildId: fixture.buildId,
        kind: "blocks",
        organizationId: ORGANIZATION_ID,
        sourceActionItemId: firstId,
        targetActionItemId: secondId,
      }
    );
    const suspendedRelationId = await fixture.base.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("buildActionItemRelations", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: now,
        createdByWorkosUserId: "user_builder",
        kind: "blocks",
        organizationId: ORGANIZATION_ID,
        sourceActionItemId: secondId,
        status: "suspended",
        suspendedAt: now,
        suspendedByWorkosUserId: "user_builder",
        suspensionReason: "permission_conflict",
        targetActionItemId: firstId,
        updatedAt: now,
      });
    });
    const second = await fixture.base.run((ctx) =>
      ctx.db.get(secondId as Id<"buildActionItems">)
    );
    await expect(
      fixture.builder.mutation(
        (api as any).build_action_item_structure
          .repairBuildActionItemRelation,
        {
          buildId: fixture.buildId,
          expectedSourceRevision: second?.currentRevision ?? -1,
          organizationId: ORGANIZATION_ID,
          reason: "Audience repaired",
          relationId: suspendedRelationId,
        }
      )
    ).rejects.toThrow("would create a cycle");
    const stillSuspended = await fixture.base.run((ctx) =>
      ctx.db.get(suspendedRelationId)
    );
    expect(stillSuspended?.status).toBe("suspended");
  });

  test("quarantines malformed cross-Build relations without exposing or mutating their endpoints", async () => {
    const fixture = await seedActionItemBuild();
    const parentId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Visible parent",
      }
    );
    const malformed = await fixture.base.run(async (ctx) => {
      const [brokerage, build, parent] = await Promise.all([
        ctx.db.get(fixture.brokerageId as Id<"brokerages">),
        ctx.db.get(fixture.buildId),
        ctx.db.get(parentId as Id<"buildActionItems">),
      ]);
      if (!(brokerage && build && parent)) {
        throw new Error("Malformed relation fixture is unavailable.");
      }
      const {
        _creationTime: _buildCreationTime,
        _id: _buildId,
        ...buildFields
      } = build;
      const foreignBuildId = await ctx.db.insert("activeBuilds", {
        ...buildFields,
        buildName: "Foreign Build",
      });
      const {
        _creationTime: _itemCreationTime,
        _id: _itemId,
        ...itemFields
      } = parent;
      const foreignActionItemId = await ctx.db.insert("buildActionItems", {
        ...itemFields,
        buildId: foreignBuildId,
        currentRevision: 11,
        parentActionItemId: parent._id,
        title: "Do not disclose this foreign child",
      });
      const now = Date.now();
      const relationId = await ctx.db.insert("buildActionItemRelations", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: now,
        createdByWorkosUserId: "user_builder",
        kind: "related",
        organizationId: ORGANIZATION_ID,
        sourceActionItemId: parent._id,
        status: "active",
        targetActionItemId: foreignActionItemId,
        updatedAt: now,
      });
      const {
        _creationTime: _brokerageCreationTime,
        _id: _brokerageId,
        ...brokerageFields
      } = brokerage;
      const foreignBrokerageId = await ctx.db.insert("brokerages", {
        ...brokerageFields,
        workosOrganizationId: "org_foreign_checklist",
      });
      const foreignChecklistId = await ctx.db.insert(
        "buildActionItemChecklistItems",
        {
          actionItemId: parent._id,
          brokerageId: foreignBrokerageId,
          buildId: fixture.buildId,
          completed: false,
          createdAt: now,
          label: "Do not disclose this foreign checklist",
          order: 0,
          organizationId: ORGANIZATION_ID,
          required: true,
          updatedAt: now,
        }
      );
      return { foreignActionItemId, foreignChecklistId, relationId };
    });

    const structure = await fixture.creator.query(
      (api as any).build_action_item_structure
        .getBuildActionItemStructureContext,
      {
        actionItemId: parentId,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(structure.children).toEqual([]);
    expect(JSON.stringify(structure)).not.toContain(
      "Do not disclose this foreign child"
    );
    expect(JSON.stringify(structure)).not.toContain(
      "Do not disclose this foreign checklist"
    );
    const list = await fixture.creator.query(
      (api as any).build_action_items.listBuildActionItems,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
    );
    expect(JSON.stringify(list)).not.toContain(
      "Do not disclose this foreign checklist"
    );
    await expect(
      fixture.creator.mutation(
        (api as any).build_action_item_structure
          .toggleBuildActionItemChecklistItem,
        {
          buildId: fixture.buildId,
          checklistItemId: malformed.foreignChecklistId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("Checklist entry is unavailable");

    await fixture.builder.mutation(
      (api as any).build_participants.inviteBuildParticipant,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        role: "contractor",
        workosUserId: "user_malformed_reconciliation",
      }
    );
    await withIdentity(fixture.base, {
      role: "contractor",
      subject: "user_malformed_reconciliation",
    }).mutation(
      (api as any).build_participants.acceptBuildParticipantInvitation,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );
    const result = await fixture.base.run(async (ctx) => ({
      foreign: await ctx.db.get(malformed.foreignActionItemId),
      relation: await ctx.db.get(malformed.relationId),
    }));
    expect(result.foreign?.currentRevision).toBe(11);
    expect(result.relation).toMatchObject({
      status: "suspended",
      suspensionReason: "integrity_conflict",
    });
  });

  test("enforces child, per-item relationship, and Build relationship capacity before insert", async () => {
    const fixture = await seedActionItemBuild();
    const parentId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Capacity parent",
      }
    );
    const childId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        expectedParentRevision: 1,
        organizationId: ORGANIZATION_ID,
        parentActionItemId: parentId,
        postId: fixture.postId,
        title: "Capacity child 0",
      }
    );
    await fixture.base.run(async (ctx) => {
      const child = await ctx.db.get(childId as Id<"buildActionItems">);
      if (!child) {
        throw new Error("Capacity child fixture is unavailable.");
      }
      const {
        _creationTime: _childCreationTime,
        _id: _childId,
        ...childFields
      } = child;
      for (let index = 1; index < 250; index += 1) {
        await ctx.db.insert("buildActionItems", {
          ...childFields,
          title: `Capacity child ${index}`,
        });
      }
    });
    await expect(
      fixture.creator.mutation(
        (api as any).build_action_items.createBuildActionItem,
        {
          buildId: fixture.buildId,
          expectedParentRevision: 2,
          organizationId: ORGANIZATION_ID,
          parentActionItemId: parentId,
          postId: fixture.postId,
          title: "Capacity child 250",
        }
      )
    ).rejects.toThrow("child Action Item limit");

    const [sourceId, targetId, otherTargetId] = await Promise.all(
      ["Capacity source", "Capacity target", "Other capacity target"].map(
        (title) =>
          fixture.creator.mutation(
            (api as any).build_action_items.createBuildActionItem,
            {
              buildId: fixture.buildId,
              organizationId: ORGANIZATION_ID,
              postId: fixture.postId,
              title,
            }
          )
      )
    );
    await fixture.base.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < 500; index += 1) {
        await ctx.db.insert("buildActionItemRelations", {
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          createdAt: now + index,
          createdByWorkosUserId: "user_contractor_creator",
          kind: "related",
          organizationId: ORGANIZATION_ID,
          sourceActionItemId: sourceId,
          status: "active",
          targetActionItemId: targetId,
          updatedAt: now + index,
        });
      }
    });
    await expect(
      fixture.creator.mutation(
        (api as any).build_action_item_structure.linkBuildActionItems,
        {
          buildId: fixture.buildId,
          kind: "related",
          organizationId: ORGANIZATION_ID,
          sourceActionItemId: sourceId,
          targetActionItemId: otherTargetId,
        }
      )
    ).rejects.toThrow("relationship limit");

    const [freshSourceId, freshTargetId] = await Promise.all(
      ["Fresh capacity source", "Fresh capacity target"].map((title) =>
        fixture.creator.mutation(
          (api as any).build_action_items.createBuildActionItem,
          {
            buildId: fixture.buildId,
            organizationId: ORGANIZATION_ID,
            postId: fixture.postId,
            title,
          }
        )
      )
    );
    await fixture.base.run(async (ctx) => {
      const now = Date.now();
      for (let index = 500; index < 2000; index += 1) {
        await ctx.db.insert("buildActionItemRelations", {
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          createdAt: now + index,
          createdByWorkosUserId: "user_contractor_creator",
          kind: "duplicate",
          organizationId: ORGANIZATION_ID,
          sourceActionItemId: sourceId,
          status: "active",
          targetActionItemId: targetId,
          updatedAt: now + index,
        });
      }
    });
    await expect(
      fixture.creator.mutation(
        (api as any).build_action_item_structure.linkBuildActionItems,
        {
          buildId: fixture.buildId,
          kind: "related",
          organizationId: ORGANIZATION_ID,
          sourceActionItemId: freshSourceId,
          targetActionItemId: freshTargetId,
        }
      )
    ).rejects.toThrow("Build has reached");
  });

  test("suspends permission-conflicted dependencies and requires coordinator repair", async () => {
    const fixture = await seedActionItemBuild();
    const contractorParticipantIds = await fixture.base.run(async (ctx) => {
      const participants = await ctx.db
        .query("buildParticipants")
        .withIndex("by_buildId_and_status", (query) =>
          query.eq("buildId", fixture.buildId).eq("status", "active")
        )
        .take(20);
      return participants
        .filter((participant) => participant.role === "contractor")
        .map((participant) => participant._id);
    });
    for (const participantId of contractorParticipantIds) {
      await fixture.builder.mutation(
        (api as any).build_participants.removeBuildParticipant,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          participantId,
          reason: "Prepare access-conflict scenario",
        }
      );
    }
    const restrictedPostId = await fixture.builder.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "author_tier_and_higher",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Builder-only dependency.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [{ text: "Builder-only dependency.", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      }
    );
    const blockerId = await fixture.builder.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: restrictedPostId,
        title: "Builder review",
      }
    );
    const dependentId = await fixture.builder.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Contractor-visible release",
      }
    );
    const relationId = await fixture.builder.mutation(
      (api as any).build_action_item_structure.linkBuildActionItems,
      {
        buildId: fixture.buildId,
        kind: "blocks",
        organizationId: ORGANIZATION_ID,
        sourceActionItemId: blockerId,
        targetActionItemId: dependentId,
      }
    );

    await fixture.builder.mutation(
      (api as any).build_participants.reinviteBuildParticipant,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        role: "contractor",
        workosUserId: "user_contractor_reader",
      }
    );
    await fixture.reader.mutation(
      (api as any).build_participants.acceptBuildParticipantInvitation,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );
    const suspended = await fixture.base.run((ctx) =>
      ctx.db.get(relationId as Id<"buildActionItemRelations">)
    );
    expect(suspended).toMatchObject({
      status: "suspended",
      suspensionReason: "permission_conflict",
    });
    await expect(
      fixture.builder.mutation(
        (api as any).build_action_item_structure
          .repairBuildActionItemRelation,
        {
          buildId: fixture.buildId,
          expectedSourceRevision: 3,
          organizationId: ORGANIZATION_ID,
          reason: "Access repaired",
          relationId,
        }
      )
    ).rejects.toThrow("permission conflict remains");

    const rejoinedParticipantId = await fixture.base.run(async (ctx) => {
      const participant = await ctx.db
        .query("buildParticipants")
        .withIndex(
          "by_buildId_and_workosUserId_and_participationPeriod",
          (query) =>
            query
              .eq("buildId", fixture.buildId)
              .eq("workosUserId", "user_contractor_reader")
        )
        .order("desc")
        .first();
      if (!participant) {
        throw new Error("Rejoined participant fixture is unavailable.");
      }
      return participant._id;
    });
    await fixture.builder.mutation(
      (api as any).build_participants.removeBuildParticipant,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        participantId: rejoinedParticipantId,
        reason: "Restore compatible audiences",
      }
    );
    await fixture.builder.mutation(
      (api as any).build_action_item_structure.repairBuildActionItemRelation,
      {
        buildId: fixture.buildId,
        expectedSourceRevision: 3,
        organizationId: ORGANIZATION_ID,
        reason: "Audience compatibility restored",
        relationId,
      }
    );
    const repaired = await fixture.base.run((ctx) =>
      ctx.db.get(relationId as Id<"buildActionItemRelations">)
    );
    expect(repaired).toMatchObject({ status: "active" });
    expect(repaired?.suspensionReason).toBeUndefined();

    const events = await readActionItem(fixture, blockerId);
    expect(events.events.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["relation_suspended", "relation_restored"])
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

  test("keeps accepted participants pending until bounded relationship reconciliation completes", async () => {
    const fixture = await seedActionItemBuild();
    const [sourceId, targetId] = await Promise.all(
      ["Activation source", "Activation target"].map((title) =>
        fixture.builder.mutation(
          (api as any).build_action_items.createBuildActionItem,
          {
            buildId: fixture.buildId,
            organizationId: ORGANIZATION_ID,
            postId: fixture.postId,
            title,
          }
        )
      )
    );
    await fixture.base.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < 11; index += 1) {
        await ctx.db.insert("buildActionItemRelations", {
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          createdAt: now + index,
          createdByWorkosUserId: "user_builder",
          kind: "related",
          organizationId: ORGANIZATION_ID,
          sourceActionItemId: sourceId,
          status: "active",
          targetActionItemId: targetId,
          updatedAt: now + index,
        });
      }
    });
    const pendingActor = withIdentity(fixture.base, {
      role: "contractor",
      subject: "user_pending_activation",
    });
    await fixture.builder.mutation(
      (api as any).build_participants.inviteBuildParticipant,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        role: "contractor",
        workosUserId: "user_pending_activation",
      }
    );

    vi.useFakeTimers();
    try {
      const participantId = await pendingActor.mutation(
        (api as any).build_participants.acceptBuildParticipantInvitation,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      );
      const pending = await fixture.base.run((ctx) =>
        ctx.db.get(participantId as Id<"buildParticipants">)
      );
      expect(pending?.status).toBe("pending_activation");
      await expect(
        fixture.builder.mutation(
          (api as any).build_participants.removeBuildParticipant,
          {
            buildId: fixture.buildId,
            organizationId: ORGANIZATION_ID,
            participantId,
            reason: "Cancel while activation is reconciling",
          }
        )
      ).rejects.toThrow("activation is still reconciling");
      await expect(
        pendingActor.query(
          (api as any).build_action_items.listBuildActionItems,
          { buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
        )
      ).rejects.toThrow("Forbidden:");

      await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
      const activated = await fixture.base.run(async (ctx) => ({
        audits: (await ctx.db.query("auditEvents").collect())
          .filter((event) => event.entityId === participantId)
          .map((event) => event.eventType),
        participant: await ctx.db.get(
          participantId as Id<"buildParticipants">
        ),
      }));
      expect(activated.participant?.status).toBe("active");
      expect(activated.audits).toEqual(
        expect.arrayContaining([
          "build.participant.activation_pending",
          "build.participant.accepted",
        ])
      );
      await expect(
        pendingActor.query(
          (api as any).build_action_items.listBuildActionItems,
          { buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
        )
      ).resolves.toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  test("counts pending activations toward capacity and rejects an over-capacity activation projection", async () => {
    const fixture = await seedActionItemBuild();
    const overflowActor = withIdentity(fixture.base, {
      role: "contractor",
      subject: "user_activation_overflow",
    });
    const pendingIds = await fixture.base.run(async (ctx) => {
      const now = Date.now();
      const ids: Id<"buildParticipants">[] = [];
      for (let index = 0; index < 497; index += 1) {
        ids.push(await ctx.db.insert("buildParticipants", {
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          createdAt: now + index,
          displayNameSnapshot: `Pending participant ${index}`,
          joinedAt: now + index,
          organizationId: ORGANIZATION_ID,
          participationPeriod: 1,
          role: "contractor",
          status: "pending_activation",
          updatedAt: now + index,
          validFrom: now + index,
          workosUserId: `user_pending_capacity_${index}`,
        }));
      }
      return ids;
    });
    await expect(
      fixture.builder.mutation(
        (api as any).build_participants.inviteBuildParticipant,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          role: "contractor",
          workosUserId: "user_capacity_rejected",
        }
      )
    ).rejects.toThrow("at most 500 current participants");

    await fixture.base.run(async (ctx) => {
      const now = Date.now();
      for (const participantId of pendingIds) {
        await ctx.db.patch(participantId, { status: "active", updatedAt: now });
      }
      await ctx.db.insert("buildParticipants", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: now,
        displayNameSnapshot: "Activation overflow",
        invitedByWorkosUserId: "user_builder",
        organizationId: ORGANIZATION_ID,
        participationPeriod: 1,
        role: "contractor",
        status: "invited",
        updatedAt: now,
        validFrom: now,
        workosUserId: "user_activation_overflow",
      });
    });
    await expect(
      overflowActor.mutation(
        (api as any).build_participants.acceptBuildParticipantInvitation,
        { buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
      )
    ).rejects.toThrow("at most 500 active participants");
    const overflowInvitation = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("buildParticipants")
        .withIndex("by_buildId_and_workosUserId", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq("workosUserId", "user_activation_overflow")
        )
        .unique()
    );
    expect(overflowInvitation?.status).toBe("invited");
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

  test("supports self, peer, lower-tier, and upward-request assignment directions", async () => {
    const fixture = await seedActionItemBuild();
    const selfAssignedId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Unassigned work",
      }
    );
    await fixture.reader.mutation(
      (api as any).build_action_item_workflow.assignBuildActionItem,
      {
        actionItemId: selfAssignedId,
        assigneeWorkosUserId: "user_contractor_reader",
        buildId: fixture.buildId,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
      }
    );

    const peerAssignedId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Peer work",
      }
    );
    await fixture.creator.mutation(
      (api as any).build_action_item_workflow.assignBuildActionItem,
      {
        actionItemId: peerAssignedId,
        assigneeWorkosUserId: "user_contractor_reader",
        buildId: fixture.buildId,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
      }
    );

    const lowerTierId = await fixture.builder.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Lower-tier work",
      }
    );
    await fixture.builder.mutation(
      (api as any).build_action_item_workflow.assignBuildActionItem,
      {
        actionItemId: lowerTierId,
        assigneeWorkosUserId: "user_contractor_creator",
        buildId: fixture.buildId,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
      }
    );

    const upwardId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Higher-tier review",
      }
    );
    await fixture.creator.mutation(
      (api as any).build_action_item_workflow.assignBuildActionItem,
      {
        actionItemId: upwardId,
        assigneeWorkosUserId: "user_builder",
        buildId: fixture.buildId,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
      }
    );
    const upwardBeforeAcceptance = await readActionItem(fixture, upwardId);
    expect(upwardBeforeAcceptance.item).toMatchObject({
      assignmentState: "requested",
      status: "todo",
    });
    await fixture.builder.mutation(
      (api as any).build_action_item_workflow
        .acceptBuildActionItemAssignment,
      {
        actionItemId: upwardId,
        buildId: fixture.buildId,
        expectedRevision: 2,
        organizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.builder.mutation(
        (api as any).build_action_item_workflow
          .acceptBuildActionItemAssignment,
        {
          actionItemId: upwardId,
          buildId: fixture.buildId,
          expectedRevision: 2,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("changed since you opened it");

    for (const actionItemId of [
      selfAssignedId,
      peerAssignedId,
      lowerTierId,
    ]) {
      const persisted = await readActionItem(fixture, actionItemId);
      expect(persisted.item?.assignmentState).toBe("assigned");
      expect(persisted.events.at(-1)?.eventType).toMatch(
        /assigned|reassigned/
      );
    }
  });

  test("coordinators can laterally reassign lower-tier work with an auditable notification", async () => {
    const fixture = await seedActionItemBuild();
    const actionItemId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        assigneeWorkosUserId: "user_contractor_creator",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Coordinate trade handoff",
      }
    );
    await fixture.builder.mutation(
      (api as any).build_action_item_workflow.assignBuildActionItem,
      {
        actionItemId,
        assigneeWorkosUserId: "user_contractor_reader",
        buildId: fixture.buildId,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        reason: "Move the handoff to the site contractor",
      }
    );
    const persisted = await fixture.base.run(async (ctx) => ({
      audit: await ctx.db
        .query("auditEvents")
        .filter((query) =>
          query.eq(query.field("entityId"), actionItemId)
        )
        .collect(),
      deliveries: await ctx.db
        .query("recipientDeliveries")
        .filter((query) =>
          query.eq(query.field("entityId"), actionItemId)
        )
        .collect(),
      item: await ctx.db.get(actionItemId),
      outbox: await ctx.db
        .query("eventOutbox")
        .filter((query) =>
          query.eq(query.field("relatedEntityId"), actionItemId)
        )
        .collect(),
    }));
    expect(persisted.item).toMatchObject({
      assigneeWorkosUserId: "user_contractor_reader",
      assignmentState: "assigned",
    });
    const reassignmentAudit = persisted.audit.filter(
      (event) => event.command === "reassigned"
    );
    expect(reassignmentAudit).toHaveLength(1);
    expect(reassignmentAudit[0]).toMatchObject({
      actorWorkosUserId: "user_builder",
      command: "reassigned",
      reason: "Move the handoff to the site contractor",
    });
    expect(
      persisted.outbox.filter(
        (event) =>
          event.eventType ===
          "build.collaboration.action_item.reassigned"
      )
    ).toHaveLength(1);
    expect(persisted.deliveries).toMatchObject([
      {
        recipientWorkosUserId: "user_contractor_reader",
        status: "unread",
      },
    ]);
  });

  test("direct creation notifies assigned and requested assignees despite mute while suppressing self-assignment", async () => {
    const fixture = await seedActionItemBuild();
    await fixture.base.run(async (ctx) => {
      await ctx.db.insert("buildCollaborationNotificationPreferences", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        channels: [],
        createdAt: 1,
        digestCadence: "never",
        digestEnabled: false,
        ordinaryMuted: true,
        organizationId: ORGANIZATION_ID,
        updatedAt: 1,
        workosUserId: "user_contractor_reader",
      });
    });

    const assignedId = await fixture.builder.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        assigneeWorkosUserId: "user_contractor_reader",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Inspect the footing forms",
      }
    );
    const requestedId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        assigneeWorkosUserId: "user_builder",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Approve the trade handoff",
      }
    );
    const selfAssignedId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        assigneeWorkosUserId: "user_contractor_creator",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Upload the field photo",
      }
    );

    const deliveries = await fixture.base.run(async (ctx) =>
      ctx.db.query("recipientDeliveries").collect()
    );
    expect(deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collaborationActionItemId: assignedId,
          collaborationEventKind: "assignment",
          recipientWorkosUserId: "user_contractor_reader",
        }),
        expect.objectContaining({
          collaborationActionItemId: requestedId,
          collaborationEventKind: "assignment_request",
          recipientWorkosUserId: "user_builder",
        }),
      ])
    );
    expect(
      deliveries.some(
        (delivery) => delivery.collaborationActionItemId === selfAssignedId
      )
    ).toBe(false);
  });

  test("ordinary work completes by its assignee and reopens only with a reason", async () => {
    const fixture = await seedActionItemBuild();
    const actionItemId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        assigneeWorkosUserId: "user_contractor_creator",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Ordinary completion",
      }
    );
    await fixture.creator.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId,
        buildId: fixture.buildId,
        expectedRevision: 1,
        nextStatus: "in_progress",
        organizationId: ORGANIZATION_ID,
      }
    );
    await fixture.creator.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId,
        buildId: fixture.buildId,
        expectedRevision: 2,
        nextStatus: "done",
        organizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.creator.mutation(
        (api as any).build_action_item_workflow.transitionBuildActionItem,
        {
          actionItemId,
          buildId: fixture.buildId,
          expectedRevision: 3,
          nextStatus: "in_progress",
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("requires a reason");
    await fixture.creator.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId,
        buildId: fixture.buildId,
        expectedRevision: 3,
        nextStatus: "in_progress",
        organizationId: ORGANIZATION_ID,
        reason: "Inspection correction reopened the work",
      }
    );
    const persisted = await readActionItem(fixture, actionItemId);
    expect(persisted.item).toMatchObject({
      currentRevision: 4,
      status: "in_progress",
    });
    expect(persisted.item?.completedAt).toBeUndefined();
    expect(persisted.events.at(-1)).toMatchObject({
      eventType: "reopened",
      reason: "Inspection correction reopened the work",
    });
  });

  test("governed work requires a due date, assignee review submission, and authority acceptance", async () => {
    const fixture = await seedActionItemBuild();
    await expect(
      fixture.builder.mutation(
        (api as any).build_action_items.createBuildActionItem,
        {
          assigneeWorkosUserId: "user_contractor_creator",
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: fixture.postId,
          title: "Missing governed due date",
          workKind: "evidence",
        }
      )
    ).rejects.toThrow("Governed Action Items require a due date");
    const actionItemId = await fixture.builder.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        assigneeWorkosUserId: "user_contractor_creator",
        buildId: fixture.buildId,
        dueAt: 1_800_000_000_000,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Upload governed evidence",
        workKind: "evidence",
      }
    );
    await fixture.creator.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId,
        buildId: fixture.buildId,
        expectedRevision: 1,
        nextStatus: "in_progress",
        organizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.creator.mutation(
        (api as any).build_action_item_workflow.transitionBuildActionItem,
        {
          actionItemId,
          buildId: fixture.buildId,
          expectedRevision: 2,
          nextStatus: "done",
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow();
    await fixture.creator.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId,
        buildId: fixture.buildId,
        expectedRevision: 2,
        nextStatus: "in_review",
        organizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.creator.mutation(
        (api as any).build_action_item_workflow.transitionBuildActionItem,
        {
          actionItemId,
          buildId: fixture.buildId,
          expectedRevision: 3,
          nextStatus: "done",
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("Forbidden: Action Item complete authority");
    await fixture.builder.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId,
        buildId: fixture.buildId,
        expectedRevision: 3,
        nextStatus: "done",
        organizationId: ORGANIZATION_ID,
      }
    );
    const persisted = await fixture.base.run(async (ctx) => ({
      audits: await ctx.db
        .query("auditEvents")
        .filter((query) =>
          query.eq(query.field("entityId"), actionItemId)
        )
        .collect(),
      deliveries: await ctx.db
        .query("recipientDeliveries")
        .filter((query) =>
          query.eq(query.field("entityId"), actionItemId)
        )
        .collect(),
      item: await ctx.db.get(actionItemId),
      outbox: await ctx.db
        .query("eventOutbox")
        .filter((query) =>
          query.eq(query.field("relatedEntityId"), actionItemId)
        )
        .collect(),
    }));
    expect(persisted.item).toMatchObject({
      completedByWorkosUserId: "user_contractor_creator",
      completionAcceptedByWorkosUserId: "user_builder",
      completionRequestedByWorkosUserId: "user_contractor_creator",
      requiresAcceptance: true,
      status: "done",
      workKind: "evidence",
    });
    expect(
      persisted.audits
        .map((event) => event.command)
        .filter((command) => command !== "createBuildActionItem")
    ).toEqual([
      "status_changed",
      "completion_requested",
      "completion_accepted",
    ]);
    expect(
      persisted.outbox.filter((event) =>
        [
          "build.collaboration.action_item.status_changed",
          "build.collaboration.action_item.completion_requested",
          "build.collaboration.action_item.completion_accepted",
        ].includes(event.eventType)
      )
    ).toHaveLength(3);
    expect(
      persisted.deliveries.map((delivery) => ({
        kind: delivery.collaborationEventKind,
        recipient: delivery.recipientWorkosUserId,
      }))
    ).toEqual([
      { kind: "assignment", recipient: "user_contractor_creator" },
      { kind: "required_approval", recipient: "user_builder" },
      {
        kind: "acknowledgement_received",
        recipient: "user_contractor_creator",
      },
    ]);
  });

  test("canonical governed references cannot be downgraded by a submitted ordinary work type", async () => {
    const fixture = await seedActionItemBuild();
    const evidenceKey = "foundation-governed-evidence";
    await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Build fixture is unavailable.");
      }
      const now = Date.now();
      await ctx.db.insert("buildEvidenceAssets", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now,
        evidenceKey,
        fileName: "foundation.jpg",
        label: "Foundation evidence",
        locationVerified: true,
        milestoneKey: "foundation",
        mimeType: "image/jpeg",
        organizationId: ORGANIZATION_ID,
        proposalId: build.proposalId,
        sizeBytes: 1024,
        source: "test",
        tag: "completion",
        updatedAt: now,
      });
    });
    const restrictedPostId = await fixture.builder.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "author_tier_and_higher",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Lender-visible evidence coordination.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                {
                  text: "Lender-visible evidence coordination.",
                  type: "text",
                },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      }
    );
    await expect(
      fixture.builder.mutation(
        (api as any).build_action_items.createBuildActionItem,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: restrictedPostId,
          references: [
            {
              entityId: evidenceKey,
              entityKind: "evidencePackage",
              label: "Client label",
            },
          ],
          title: "Review referenced evidence",
          workKind: "ordinary",
        }
      )
    ).rejects.toThrow("Governed Action Items require a due date");
    const actionItemId = await fixture.builder.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        dueAt: 1_800_000_000_000,
        organizationId: ORGANIZATION_ID,
        postId: restrictedPostId,
        references: [
          {
            entityId: evidenceKey,
            entityKind: "evidencePackage",
            label: "Client label",
          },
        ],
        title: "Review referenced evidence",
        workKind: "ordinary",
      }
    );
    await expect(
      fixture.builder.mutation(
        (api as any).build_action_items.updateBuildActionItem,
        {
          actionItemId,
          buildId: fixture.buildId,
          expectedRevision: 1,
          organizationId: ORGANIZATION_ID,
          requiresAcceptance: false,
        }
      )
    ).rejects.toThrow(
      "Completion acceptance is mandatory for this Action Item"
    );
    const persisted = await readActionItem(fixture, actionItemId);
    expect(persisted.item).toMatchObject({
      requiresAcceptance: true,
      workKind: "evidence",
    });

    const explicitlyGovernedActionItemId = await fixture.builder.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        dueAt: 1_800_000_000_000,
        organizationId: ORGANIZATION_ID,
        postId: restrictedPostId,
        references: [
          {
            entityId: evidenceKey,
            entityKind: "evidencePackage",
            label: "Client label",
          },
        ],
        title: "Approve referenced evidence",
        workKind: "approval",
      }
    );
    const explicitlyGoverned = await readActionItem(
      fixture,
      explicitlyGovernedActionItemId
    );
    expect(explicitlyGoverned.item).toMatchObject({
      requiresAcceptance: true,
      workKind: "approval",
    });
  });

  test("participant removal preserves governed completion and reroutes review to an active authority", async () => {
    const fixture = await seedActionItemBuild();
    const builderParticipantId = await fixture.base.run(async (ctx) => {
      const builderParticipant = await ctx.db
        .query("buildParticipants")
        .withIndex("by_buildId_and_workosUserId", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq("workosUserId", "user_builder")
        )
        .unique();
      if (!builderParticipant) {
        throw new Error("Builder participant fixture is unavailable.");
      }
      return builderParticipant._id;
    });
    const removedAssigneeItemId = await fixture.admin.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        assigneeWorkosUserId: "user_builder",
        buildId: fixture.buildId,
        dueAt: 1_800_000_000_000,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Governed item owned by removed participant",
        workKind: "approval",
      }
    );
    const removedAssignerItemId = await fixture.builder.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        assigneeWorkosUserId: "user_contractor_creator",
        buildId: fixture.buildId,
        dueAt: 1_800_000_000_000,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Governed review requiring fallback authority",
        workKind: "evidence",
      }
    );
    await fixture.admin.mutation(
      (api as any).build_participants.removeBuildParticipant,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        participantId: builderParticipantId,
        reason: "Builder left the Build",
      }
    );
    const unassigned = await readActionItem(fixture, removedAssigneeItemId);
    expect(unassigned.item).toMatchObject({
      assignmentState: "unassigned",
      requiresAcceptance: true,
      workKind: "approval",
    });
    expect(unassigned.item?.assigneeWorkosUserId).toBeUndefined();

    await fixture.creator.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId: removedAssignerItemId,
        buildId: fixture.buildId,
        expectedRevision: 1,
        nextStatus: "in_progress",
        organizationId: ORGANIZATION_ID,
      }
    );
    await fixture.creator.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId: removedAssignerItemId,
        buildId: fixture.buildId,
        expectedRevision: 2,
        nextStatus: "in_review",
        organizationId: ORGANIZATION_ID,
      }
    );
    const deliveries = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("recipientDeliveries")
        .filter((query) =>
          query.eq(query.field("entityId"), removedAssignerItemId)
        )
        .collect()
    );
    expect(deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipientWorkosUserId: "user_broker",
          title: "Action Item completion review required",
        }),
      ])
    );
    expect(
      deliveries.some(
        (delivery) =>
          delivery.recipientWorkosUserId === "user_builder"
      )
    ).toBe(false);
  });

  test("removed assignees cannot move work and exceptional reopen restores the original active state", async () => {
    const fixture = await seedActionItemBuild();
    const removedAssigneeItemId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        assigneeWorkosUserId: "user_contractor_reader",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Removed assignee work",
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
      const now = Date.now();
      await ctx.db.patch(participant._id, {
        removedAt: now,
        removalReason: "Left the Build",
        status: "removed",
        updatedAt: now,
        validUntil: now,
      });
    });
    await expect(
      fixture.creator.mutation(
        (api as any).build_action_item_workflow.transitionBuildActionItem,
        {
          actionItemId: removedAssigneeItemId,
          buildId: fixture.buildId,
          expectedRevision: 1,
          nextStatus: "in_progress",
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("removed assignee must be cleared");

    const exceptionalItemId = await fixture.creator.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        assigneeWorkosUserId: "user_contractor_creator",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postId,
        title: "Exceptional state restoration",
      }
    );
    await fixture.creator.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId: exceptionalItemId,
        buildId: fixture.buildId,
        expectedRevision: 1,
        nextStatus: "in_progress",
        organizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.creator.mutation(
        (api as any).build_action_item_workflow.transitionBuildActionItem,
        {
          actionItemId: exceptionalItemId,
          buildId: fixture.buildId,
          expectedRevision: 2,
          nextStatus: "blocked",
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("requires a reason");
    await fixture.creator.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId: exceptionalItemId,
        buildId: fixture.buildId,
        expectedRevision: 2,
        nextStatus: "blocked",
        organizationId: ORGANIZATION_ID,
        reason: "Waiting on material",
      }
    );
    await expect(
      fixture.creator.mutation(
        (api as any).build_action_item_workflow.transitionBuildActionItem,
        {
          actionItemId: exceptionalItemId,
          buildId: fixture.buildId,
          expectedRevision: 3,
          nextStatus: "cancelled",
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("requires a reason");
    await fixture.creator.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId: exceptionalItemId,
        buildId: fixture.buildId,
        expectedRevision: 3,
        nextStatus: "cancelled",
        organizationId: ORGANIZATION_ID,
        reason: "Supplier cancelled the order",
      }
    );
    await fixture.creator.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId: exceptionalItemId,
        buildId: fixture.buildId,
        expectedRevision: 4,
        nextStatus: "in_progress",
        organizationId: ORGANIZATION_ID,
        reason: "Replacement supplier confirmed",
      }
    );
    const restored = await readActionItem(fixture, exceptionalItemId);
    expect(restored.item).toMatchObject({
      currentRevision: 5,
      status: "in_progress",
    });
    expect(restored.item?.previousActiveStatus).toBeUndefined();
  });
});
