/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  advanceBuildActionItemDeadlineSchedule,
  dueBuildActionItemDeadlineStages,
} from "./build_action_item_deadline_model";
import {
  actionItemOverdueState,
  buildActionItemDeadlineHref,
  eligibleDeadlineStages,
} from "./build_action_item_queues";
import type { BuildCollaborationRole } from "./build_collaboration_model";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_action_item_queues";

function withIdentity(
  t: ReturnType<typeof convexTest>,
  input: { role: BuildCollaborationRole; subject: string }
) {
  return t.withIdentity({
    email: `${input.subject}@example.com`,
    name: input.subject,
    organizationId: ORGANIZATION_ID,
    role: input.role,
    roles: [input.role],
    subject: input.subject,
    tokenIdentifier: `https://api.workos.com/|${input.subject}`,
    "https://fairlend.ca/actor_kind": "human",
  } as never);
}

async function seedQueueBuilds() {
  const base = convexTest(schema, modules);
  const admin = withIdentity(base, { role: "admin", subject: "user_admin" });
  const builder = withIdentity(base, {
    role: "builder",
    subject: "user_builder",
  });
  const assignee = withIdentity(base, {
    role: "contractor",
    subject: "user_assignee",
  });
  const reader = withIdentity(base, {
    role: "contractor",
    subject: "user_reader",
  });
  const foundation = await admin.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORGANIZATION_ID }
  );
  const buildIds = await admin.run(async (ctx) => {
    const now = Date.now();
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
    const ids: Id<"activeBuilds">[] = [];
    for (const [index, buildName] of ["Queue Build A", "Queue Build B"].entries()) {
      const proposalId = await ctx.db.insert("buildProposals", {
        assignedBrokerWorkosUserId: "user_broker",
        brokerageId: foundation.brokerageId,
        borrowerCoPayBps: 0,
        borrowerWorkingCapitalLimitCents: 50_000_000,
        buildName,
        builderProfileId: foundation.builderProfileId,
        createdAt: now + index,
        createdByWorkosUserId: "user_admin",
        lenderDrawPolicyLimitCents: 100_000_000,
        location: `${100 + index} Queue Road`,
        organizationId: ORGANIZATION_ID,
        reviewOutcome: "approved",
        status: "approved",
        templateId: foundation.templateId,
        totalBudgetCents: 240_000_000,
        updatedAt: now + index,
        updatedByWorkosUserId: "user_admin",
      });
      const workflowRuleSnapshotId = await ctx.db.insert(
        "workflowRuleSnapshots",
        {
          allowPermitWaiverByRoles: ["admin"],
          brokerageId: foundation.brokerageId,
          createdAt: now + index,
          organizationId: ORGANIZATION_ID,
          proposalId,
          proposalStates: ["draft", "submitted", "approved", "closed"],
          requirePermitForApproval: false,
          ruleKey: `queue-${index}`,
          settings: {},
          version: 1,
          workflowRuleId: foundation.workflowRuleId,
        }
      );
      const buildId = await ctx.db.insert("activeBuilds", {
        brokerageId: foundation.brokerageId,
        buildName,
        builderProfileId: foundation.builderProfileId,
        createdAt: now + index,
        location: `${100 + index} Queue Road`,
        organizationId: ORGANIZATION_ID,
        proposalId,
        startDate: "2026-07-31",
        status: "active",
        totalBudgetCents: 240_000_000,
        updatedAt: now + index,
        workflowRuleSnapshotId,
      });
      await ctx.db.patch(proposalId, { activeBuildId: buildId, workflowRuleSnapshotId });
      for (const participant of [
        { role: "builder" as const, subject: "user_builder" },
        { role: "contractor" as const, subject: "user_assignee" },
        { role: "contractor" as const, subject: "user_reader" },
      ]) {
        await ctx.db.insert("buildParticipants", {
          brokerageId: foundation.brokerageId,
          buildId,
          createdAt: now + index,
          displayNameSnapshot: participant.subject,
          joinedAt: now + index,
          organizationId: ORGANIZATION_ID,
          participationPeriod: 1,
          role: participant.role,
          status: "active",
          updatedAt: now + index,
          validFrom: now + index,
          workosUserId: participant.subject,
        });
      }
      ids.push(buildId);
    }
    return ids;
  });
  const postIds: Id<"buildCollaborationPosts">[] = [];
  for (const [index, buildId] of buildIds.entries()) {
    postIds.push(
      await builder.mutation(
        (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
        {
          actionItems: [],
          audienceMode: "build_wide",
          buildId,
          organizationId: ORGANIZATION_ID,
          plainText: `Queue post ${index + 1}`,
          postType: "update",
          references: [],
          requestedReaderIds: [],
          tiptapJson: JSON.stringify({
            content: [
              {
                content: [{ text: `Queue post ${index + 1}`, type: "text" }],
                type: "paragraph",
              },
            ],
            type: "doc",
          }),
        }
      )
    );
  }
  return {
    admin,
    assignee,
    base,
    brokerageId: foundation.brokerageId as Id<"brokerages">,
    builder,
    buildIds,
    postIds,
    reader,
  };
}

describe("Build Action Item queues, deadlines, and escalation", () => {
  test("computes overdue and reminder stages at exact deadline boundaries", () => {
    const dueAt = Date.parse("2026-08-01T12:00:00.000Z");
    const day = 24 * 60 * 60 * 1000;

    expect(actionItemOverdueState({ dueAt, status: "todo" }, dueAt)).toEqual({
      overdue: false,
      overdueByMs: undefined,
    });
    expect(
      actionItemOverdueState({ dueAt, status: "todo" }, dueAt + 1)
    ).toEqual({ overdue: true, overdueByMs: 1 });
    expect(
      actionItemOverdueState({ dueAt, status: "done" }, dueAt + day)
    ).toEqual({ overdue: false, overdueByMs: undefined });

    expect(eligibleDeadlineStages(dueAt, dueAt - day - 1)).toEqual([]);
    expect(eligibleDeadlineStages(dueAt, dueAt - day)).toEqual(["before"]);
    expect(eligibleDeadlineStages(dueAt, dueAt)).toEqual(["before", "due"]);
    expect(eligibleDeadlineStages(dueAt, dueAt + day)).toEqual([
      "before",
      "due",
      "overdue",
    ]);
    expect(eligibleDeadlineStages(dueAt, dueAt + 2 * day)).toEqual([
      "before",
      "due",
      "overdue",
      "escalated",
    ]);
    expect(
      buildActionItemDeadlineHref({
        actionItemId: "action-1",
        buildId: "build-1",
        recipientRole: "contractor",
      })
    ).toBe(
      "/contractor/builds/build-1?tab=details&focus=actionItem%3Aaction-1"
    );
    expect(
      buildActionItemDeadlineHref({
        actionItemId: "action-1",
        buildId: "build-1",
        recipientRole: "builder-staff",
      })
    ).toBe(
      "/builder-staff/builds/build-1?tab=details&focus=actionItem%3Aaction-1"
    );
    expect(
      dueBuildActionItemDeadlineStages({
        asOf: dueAt + day,
        dueAt,
        nextStage: "due",
      })
    ).toEqual(["due", "overdue"]);
    expect(
      advanceBuildActionItemDeadlineSchedule({
        dueAt,
        processedStages: ["due", "overdue"],
      })
    ).toMatchObject({
      deadlineNextAt: dueAt + 2 * day,
      deadlineNextStage: "escalated",
      deadlineProcessingState: "pending",
    });
  });

  test("projects one canonical item into post, Build, entity, and cross-Build personal queues", async () => {
    const fixture = await seedQueueBuilds();
    const itemIds: Id<"buildActionItems">[] = [];
    for (const [index, buildId] of fixture.buildIds.entries()) {
      itemIds.push(
        await fixture.builder.mutation(
          (api as any).build_action_items.createBuildActionItem,
          {
            assigneeWorkosUserId: "user_assignee",
            buildId,
            organizationId: ORGANIZATION_ID,
            postId: fixture.postIds[index],
            title: `Canonical queue item ${index + 1}`,
          }
        )
      );
    }
    await fixture.base.run(async (ctx) => {
      const now = Date.now();
      const item = await ctx.db.get(itemIds[0]);
      if (!item?.queueSortAt) {
        throw new Error("Expected Action Item queue sort projection fixture.");
      }
      await ctx.db.insert("buildCollaborationReferences", {
        actionItemQueueSortAt: item.queueSortAt,
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildIds[0],
        createdAt: now,
        entityId: "material-queue-1",
        entityKind: "material",
        labelSnapshot: "Structural steel",
        organizationId: ORGANIZATION_ID,
        ownerKind: "actionItem",
        ownerRecordId: itemIds[0],
        postId: fixture.postIds[0],
        primary: true,
      });
    });

    const buildQueue = await fixture.assignee.query(
      (api as any).build_action_item_queues.listBuildActionItemQueue,
      {
        buildId: fixture.buildIds[0],
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
        scope: "build",
      }
    );
    const postQueue = await fixture.assignee.query(
      (api as any).build_action_item_queues.listBuildActionItemQueue,
      {
        buildId: fixture.buildIds[0],
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
        postId: fixture.postIds[0],
        scope: "post",
      }
    );
    const entityQueue = await fixture.assignee.query(
      (api as any).build_action_item_queues.listBuildActionItemQueue,
      {
        buildId: fixture.buildIds[0],
        entityId: "material-queue-1",
        entityKind: "material",
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
        scope: "entity",
      }
    );
    const personalQueue = await fixture.assignee.query(
      (api as any).build_action_item_queues.listMyBuildActionItemQueue,
      {
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      }
    );
    expect(buildQueue.page.map((row: any) => row.item._id)).toEqual([
      itemIds[0],
    ]);
    expect(postQueue.page.map((row: any) => row.item._id)).toEqual([
      itemIds[0],
    ]);
    expect(entityQueue.page.map((row: any) => row.item._id)).toEqual([
      itemIds[0],
    ]);
    expect(personalQueue.page.map((row: any) => row.item._id).sort()).toEqual(
      [...itemIds].sort()
    );
    expect(new Set(personalQueue.page.map((row: any) => row.buildId)).size).toBe(
      2
    );
    const firstPersonalPage = await fixture.assignee.query(
      (api as any).build_action_item_queues.listMyBuildActionItemQueue,
      {
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 1 },
      }
    );
    expect(firstPersonalPage.isDone).toBe(false);
    expect(firstPersonalPage.page).toHaveLength(1);
    const secondPersonalPage = await fixture.assignee.query(
      (api as any).build_action_item_queues.listMyBuildActionItemQueue,
      {
        organizationId: ORGANIZATION_ID,
        paginationOpts: {
          cursor: firstPersonalPage.continueCursor,
          numItems: 1,
        },
      }
    );
    expect(secondPersonalPage.page).toHaveLength(1);
    expect(secondPersonalPage.page[0].item._id).not.toBe(
      firstPersonalPage.page[0].item._id
    );
    await expect(
      fixture.assignee.query(
        (api as any).build_action_item_queues.listMyBuildActionItemQueue,
        {
          organizationId: ORGANIZATION_ID,
          paginationOpts: { cursor: null, numItems: 51 },
        }
      )
    ).rejects.toThrow("pages must contain 1 to 50 items");
    await expect(
      fixture.assignee.query(
        (api as any).build_action_item_queues.listMyBuildActionItemQueue,
        {
          organizationId: "org_other",
          paginationOpts: { cursor: null, numItems: 20 },
        }
      )
    ).rejects.toThrow("Cross-organization Action Item queues are forbidden.");
    await expect(
      fixture.reader.query(
        (api as any).build_action_item_queues.listMyBuildActionItemQueue,
        {
          organizationId: ORGANIZATION_ID,
          paginationOpts: { cursor: null, numItems: 20 },
        }
      )
    ).resolves.toMatchObject({ page: [] });
    await fixture.base.run(async (ctx) => {
      const participation = await ctx.db
        .query("buildParticipants")
        .withIndex(
          "by_buildId_and_workosUserId_and_participationPeriod",
          (query) =>
            query
              .eq("buildId", fixture.buildIds[0])
              .eq("workosUserId", "user_assignee")
        )
        .first();
      if (!participation) {
        throw new Error("Expected assignee participation fixture.");
      }
      await ctx.db.patch(participation._id, { status: "removed" });
    });
    const afterRevocation = await fixture.assignee.query(
      (api as any).build_action_item_queues.listMyBuildActionItemQueue,
      {
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      }
    );
    expect(afterRevocation.page.map((row: any) => row.item._id)).toEqual([
      itemIds[1],
    ]);
  });

  test("keeps overdue work on page one across every queue scope", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-31T10:00:00.000Z"));
      const fixture = await seedQueueBuilds();
      const overdueId = await fixture.builder.mutation(
        (api as any).build_action_items.createBuildActionItem,
        {
          assigneeWorkosUserId: "user_assignee",
          buildId: fixture.buildIds[0],
          dueAt: Date.now() - 60_000,
          organizationId: ORGANIZATION_ID,
          postId: fixture.postIds[0],
          title: "Older overdue work",
        }
      );
      vi.setSystemTime(new Date("2026-07-31T11:00:00.000Z"));
      const undatedIds: Id<"buildActionItems">[] = [];
      for (let index = 0; index < 21; index += 1) {
        undatedIds.push(
          await fixture.builder.mutation(
            (api as any).build_action_items.createBuildActionItem,
            {
              assigneeWorkosUserId: "user_assignee",
              buildId: fixture.buildIds[0],
              organizationId: ORGANIZATION_ID,
              postId: fixture.postIds[0],
              title: `Newer undated work ${index + 1}`,
            }
          )
        );
      }
      await fixture.base.run(async (ctx) => {
        for (const actionItemId of [overdueId, ...undatedIds]) {
          const item = await ctx.db.get(
            actionItemId as Id<"buildActionItems">
          );
          if (!item?.queueSortAt) {
            throw new Error("Expected Action Item queue sort projection fixture.");
          }
          await ctx.db.insert("buildCollaborationReferences", {
            actionItemQueueSortAt: item.queueSortAt,
            brokerageId: fixture.brokerageId,
            buildId: fixture.buildIds[0],
            createdAt: Date.now(),
            entityId: "material-ordered-queue",
            entityKind: "material",
            labelSnapshot: "Ordered material",
            organizationId: ORGANIZATION_ID,
            ownerKind: "actionItem",
            ownerRecordId: actionItemId,
            postId: fixture.postIds[0],
            primary: true,
          });
        }
      });
      const queueArgs = {
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      };
      const [build, post, entity, personal] = await Promise.all([
        fixture.assignee.query(
          (api as any).build_action_item_queues.listBuildActionItemQueue,
          { ...queueArgs, buildId: fixture.buildIds[0], scope: "build" }
        ),
        fixture.assignee.query(
          (api as any).build_action_item_queues.listBuildActionItemQueue,
          {
            ...queueArgs,
            buildId: fixture.buildIds[0],
            postId: fixture.postIds[0],
            scope: "post",
          }
        ),
        fixture.assignee.query(
          (api as any).build_action_item_queues.listBuildActionItemQueue,
          {
            ...queueArgs,
            buildId: fixture.buildIds[0],
            entityId: "material-ordered-queue",
            entityKind: "material",
            scope: "entity",
          }
        ),
        fixture.assignee.query(
          (api as any).build_action_item_queues.listMyBuildActionItemQueue,
          queueArgs
        ),
      ]);
      for (const page of [build, post, entity, personal]) {
        expect(page.isDone).toBe(false);
        expect(page.page[0]).toMatchObject({
          item: { _id: overdueId },
          overdue: true,
        });
      }
    } finally {
      vi.useRealTimers();
    }
  });

  test("paginates entity-matching work instead of unrelated Build work", async () => {
    const fixture = await seedQueueBuilds();
    const now = Date.now();
    for (let index = 0; index < 21; index += 1) {
      await fixture.builder.mutation(
        (api as any).build_action_items.createBuildActionItem,
        {
          buildId: fixture.buildIds[0],
          dueAt: now + index * 1000,
          organizationId: ORGANIZATION_ID,
          postId: fixture.postIds[0],
          title: `Earlier unrelated work ${index + 1}`,
        }
      );
    }
    const relatedId = await fixture.builder.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildIds[0],
        dueAt: now + 60_000,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postIds[0],
        title: "Later related work",
      }
    );
    await fixture.base.run(async (ctx) => {
      const related = await ctx.db.get(relatedId as Id<"buildActionItems">);
      if (related?.queueSortAt === undefined) {
        throw new Error("Expected related Action Item queue projection fixture.");
      }
      await ctx.db.insert("buildCollaborationReferences", {
        actionItemQueueSortAt: related.queueSortAt,
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildIds[0],
        createdAt: now,
        entityId: "material-sparse-queue",
        entityKind: "material",
        labelSnapshot: "Sparse material",
        organizationId: ORGANIZATION_ID,
        ownerKind: "actionItem",
        ownerRecordId: relatedId,
        postId: fixture.postIds[0],
        primary: true,
      });
    });

    const entityQueue = await fixture.reader.query(
      (api as any).build_action_item_queues.listBuildActionItemQueue,
      {
        buildId: fixture.buildIds[0],
        entityId: "material-sparse-queue",
        entityKind: "material",
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
        scope: "entity",
      }
    );
    expect(entityQueue).toMatchObject({
      isDone: true,
      page: [{ item: { _id: relatedId } }],
    });
  });

  test("keeps entity queue projections synchronized with due dates, status, and references", async () => {
    const fixture = await seedQueueBuilds();
    const now = Date.now();
    const itemIds: Id<"buildActionItems">[] = [];
    for (const [index, title] of ["First related", "Second related"].entries()) {
      itemIds.push(
        (await fixture.builder.mutation(
          (api as any).build_action_items.createBuildActionItem,
          {
            buildId: fixture.buildIds[0],
            dueAt: now + (index + 1) * 60_000,
            organizationId: ORGANIZATION_ID,
            postId: fixture.postIds[0],
            title,
          }
        )) as Id<"buildActionItems">
      );
    }
    await fixture.base.run(async (ctx) => {
      for (const actionItemId of itemIds) {
        const item = await ctx.db.get(actionItemId);
        if (item?.queueSortAt === undefined) {
          throw new Error("Expected Action Item queue sort projection fixture.");
        }
        await ctx.db.insert("buildCollaborationReferences", {
          actionItemQueueSortAt: item.queueSortAt,
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildIds[0],
          createdAt: now,
          entityId: "material-synchronized-queue",
          entityKind: "material",
          labelSnapshot: "Synchronized material",
          organizationId: ORGANIZATION_ID,
          ownerKind: "actionItem",
          ownerRecordId: actionItemId,
          postId: fixture.postIds[0],
          primary: true,
        });
      }
    });
    const queue = (includeCompleted = false) =>
      fixture.reader.query(
        (api as any).build_action_item_queues.listBuildActionItemQueue,
        {
          buildId: fixture.buildIds[0],
          entityId: "material-synchronized-queue",
          entityKind: "material",
          includeCompleted,
          organizationId: ORGANIZATION_ID,
          paginationOpts: { cursor: null, numItems: 20 },
          scope: "entity",
        }
      );

    expect((await queue()).page.map((row: any) => row.item._id)).toEqual(
      itemIds
    );
    await fixture.builder.mutation(
      (api as any).build_action_items.updateBuildActionItem,
      {
        actionItemId: itemIds[0],
        buildId: fixture.buildIds[0],
        dueAt: now + 3 * 60_000,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect((await queue()).page.map((row: any) => row.item._id)).toEqual([
      itemIds[1],
      itemIds[0],
    ]);

    await fixture.builder.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId: itemIds[1],
        buildId: fixture.buildIds[0],
        expectedRevision: 1,
        nextStatus: "in_progress",
        organizationId: ORGANIZATION_ID,
      }
    );
    await fixture.builder.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId: itemIds[1],
        buildId: fixture.buildIds[0],
        expectedRevision: 2,
        nextStatus: "done",
        organizationId: ORGANIZATION_ID,
      }
    );
    expect((await queue(true)).page.map((row: any) => row.item._id)).toEqual([
      itemIds[0],
      itemIds[1],
    ]);

    await fixture.builder.mutation(
      (api as any).build_action_item_queues.replaceBuildActionItemReferences,
      {
        actionItemId: itemIds[0],
        buildId: fixture.buildIds[0],
        expectedRevision: 2,
        organizationId: ORGANIZATION_ID,
        reason: "This material is no longer related.",
        references: [],
      }
    );
    expect((await queue(true)).page.map((row: any) => row.item._id)).toEqual([
      itemIds[1],
    ]);
  });

  test("deduplicates entity references on Action Item creation and replacement", async () => {
    const fixture = await seedQueueBuilds();
    const actionItemId = (await fixture.builder.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildIds[0],
        organizationId: ORGANIZATION_ID,
        postId: fixture.postIds[0],
        references: [
          {
            entityId: "user_reader",
            entityKind: "participant",
            label: "Ignored duplicate one",
          },
          {
            entityId: "user_reader",
            entityKind: "participant",
            label: "Ignored duplicate two",
            primary: true,
          },
        ],
        title: "Deduplicated references",
      }
    )) as Id<"buildActionItems">;
    const entityQueue = (entityId: string) =>
      fixture.reader.query(
        (api as any).build_action_item_queues.listBuildActionItemQueue,
        {
          buildId: fixture.buildIds[0],
          entityId,
          entityKind: "participant",
          includeCompleted: true,
          organizationId: ORGANIZATION_ID,
          paginationOpts: { cursor: null, numItems: 20 },
          scope: "entity",
        }
      );
    expect((await entityQueue("user_reader")).page).toMatchObject([
      { item: { _id: actionItemId } },
    ]);
    await expect(
      fixture.base.run(async (ctx) =>
        await ctx.db
          .query("buildCollaborationReferences")
          .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
            query
              .eq("ownerKind", "actionItem")
              .eq("ownerRecordId", actionItemId)
          )
          .collect()
      )
    ).resolves.toMatchObject([{ primary: true }]);

    await fixture.builder.mutation(
      (api as any).build_action_item_queues.replaceBuildActionItemReferences,
      {
        actionItemId,
        buildId: fixture.buildIds[0],
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        reason: "The responsible participant changed.",
        references: [
          {
            entityId: "user_assignee",
            entityKind: "participant",
            label: "Ignored replacement one",
          },
          {
            entityId: "user_assignee",
            entityKind: "participant",
            label: "Ignored replacement two",
            primary: true,
          },
        ],
      }
    );
    expect((await entityQueue("user_reader")).page).toEqual([]);
    expect((await entityQueue("user_assignee")).page).toMatchObject([
      { item: { _id: actionItemId } },
    ]);
    await expect(
      fixture.base.run(async (ctx) =>
        await ctx.db
          .query("buildCollaborationReferences")
          .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
            query
              .eq("ownerKind", "actionItem")
              .eq("ownerRecordId", actionItemId)
          )
          .collect()
      )
    ).resolves.toMatchObject([{ primary: true }]);
  });

  test("enforces policy due-date overrides and emits idempotent deadline reminders and escalation", async () => {
    const fixture = await seedQueueBuilds();
    const dueAt = Date.now() + 72 * 60 * 60 * 1000;
    const itemId = await fixture.builder.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        assigneeWorkosUserId: "user_assignee",
        buildId: fixture.buildIds[0],
        dueAt,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postIds[0],
        title: "Submit governed evidence",
        workKind: "evidence",
      }
    );
    await fixture.admin.mutation(
      (internal as any).build_action_item_queues.applyBuildActionItemPolicyDueDate,
      {
        actionItemId: itemId,
        buildId: fixture.buildIds[0],
        dueAt,
        organizationId: ORGANIZATION_ID,
        policyKey: "evidence-review-sla",
      }
    );
    await fixture.builder.mutation(
      (api as any).build_action_items.updateBuildActionItem,
      {
        actionItemId: itemId,
        buildId: fixture.buildIds[0],
        dueAt,
        expectedRevision: 2,
        organizationId: ORGANIZATION_ID,
        priority: "high",
      }
    );
    const policyPreserved = await fixture.base.run((ctx) => ctx.db.get(itemId));
    expect(policyPreserved).toMatchObject({
      dueAt,
      dueDateSource: "policy",
      priority: "high",
    });
    await expect(
      fixture.assignee.mutation(
        (api as any).build_action_item_queues.overrideBuildActionItemPolicyDueDate,
        {
          actionItemId: itemId,
          buildId: fixture.buildIds[0],
          dueAt: dueAt + 60_000,
          organizationId: ORGANIZATION_ID,
          reason: "Need more time",
        }
      )
    ).rejects.toThrow("coordinating authority");
    await expect(
      fixture.builder.mutation(
        (api as any).build_action_item_queues.overrideBuildActionItemPolicyDueDate,
        {
          actionItemId: itemId,
          buildId: fixture.buildIds[0],
          dueAt: dueAt + 60_000,
          organizationId: ORGANIZATION_ID,
          reason: " ",
        }
      )
    ).rejects.toThrow("override reason");
    await fixture.builder.mutation(
      (api as any).build_action_item_queues.overrideBuildActionItemPolicyDueDate,
      {
        actionItemId: itemId,
        buildId: fixture.buildIds[0],
        dueAt,
        organizationId: ORGANIZATION_ID,
        reason: "Site access was rescheduled by the inspector.",
      }
    );
    const beforeActivity = await fixture.base.run(async (ctx) => ({
      item: await ctx.db.get(itemId as Id<"buildActionItems">),
      post: await ctx.db.get(fixture.postIds[0]),
    }));
    for (const asOf of [
      dueAt - 23 * 60 * 60 * 1000,
      dueAt,
      dueAt + 25 * 60 * 60 * 1000,
      dueAt + 49 * 60 * 60 * 1000,
      dueAt + 49 * 60 * 60 * 1000,
    ]) {
      await fixture.admin.mutation(
        (internal as any).build_action_item_queues
          .processOneBuildActionItemDeadline,
        { actionItemId: itemId, asOf }
      );
    }
    const effects = await fixture.base.run(async (ctx) => ({
      deliveries: (await ctx.db.query("recipientDeliveries").collect()).filter(
        (row) => row.entityId === itemId
      ),
      item: await ctx.db.get(itemId),
      outbox: (await ctx.db.query("eventOutbox").collect()).filter(
        (row) =>
          row.relatedEntityId === itemId &&
          row.eventType.startsWith(
            "build.collaboration.action_item.deadline."
          )
      ),
      post: await ctx.db.get(fixture.postIds[0]),
    }));
    expect(
      effects.deliveries
        .filter((row) => row.recipientWorkosUserId === "user_assignee")
        .map((row) => row.dedupeKey)
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(":before:"),
        expect.stringContaining(":due:"),
        expect.stringContaining(":overdue:"),
      ])
    );
    expect(
      effects.deliveries.some(
        (row) =>
          row.recipientWorkosUserId === "user_builder" &&
          row.dedupeKey.includes(":escalated:")
      )
    ).toBe(true);
    expect(effects.deliveries).toHaveLength(4);
    expect(
      effects.deliveries.find(
        (row) => row.recipientWorkosUserId === "user_assignee"
      )?.href
    ).toContain("/contractor/builds/");
    expect(
      effects.deliveries.find(
        (row) => row.recipientWorkosUserId === "user_builder"
      )?.href
    ).toContain("/builder/builds/");
    expect(effects.deliveries.every((row) => row.href.includes("%3A"))).toBe(
      true
    );
    expect(effects.outbox).toHaveLength(4);
    expect(effects.item).toMatchObject({
      assigneeWorkosUserId: "user_assignee",
      deadlineProcessingState: "complete",
      dueAt,
      status: "todo",
    });
    expect(effects.post?.lastMeaningfulActivityAt).toBe(
      beforeActivity.post?.lastMeaningfulActivityAt
    );

    await fixture.admin.mutation(
      (internal as any).build_action_item_queues.applyBuildActionItemPolicyDueDate,
      {
        actionItemId: itemId,
        buildId: fixture.buildIds[0],
        dueAt,
        organizationId: ORGANIZATION_ID,
        policyKey: "evidence-review-sla-reconciled",
      }
    );
    await fixture.admin.mutation(
      (internal as any).build_action_item_queues
        .processOneBuildActionItemDeadline,
      { actionItemId: itemId, asOf: dueAt + 49 * 60 * 60 * 1000 }
    );
    const sameDeadlineReplay = await fixture.base.run(async (ctx) => ({
      deliveries: (await ctx.db.query("recipientDeliveries").collect()).filter(
        (row) => row.entityId === itemId
      ),
      item: await ctx.db.get(itemId as Id<"buildActionItems">),
    }));
    expect(sameDeadlineReplay.deliveries).toHaveLength(4);
    expect(sameDeadlineReplay.item?.deadlineScheduleGeneration).toBe(1);

    await fixture.builder.mutation(
      (api as any).build_action_item_queues.overrideBuildActionItemPolicyDueDate,
      {
        actionItemId: itemId,
        buildId: fixture.buildIds[0],
        dueAt: dueAt + 60_000,
        organizationId: ORGANIZATION_ID,
        reason: "Move the deadline to a new lifecycle.",
      }
    );
    await fixture.builder.mutation(
      (api as any).build_action_item_queues.overrideBuildActionItemPolicyDueDate,
      {
        actionItemId: itemId,
        buildId: fixture.buildIds[0],
        dueAt,
        organizationId: ORGANIZATION_ID,
        reason: "Return to the original date as a new lifecycle.",
      }
    );
    await fixture.admin.mutation(
      (internal as any).build_action_item_queues
        .processOneBuildActionItemDeadline,
      { actionItemId: itemId, asOf: dueAt }
    );
    const repeatedDeadline = await fixture.base.run(async (ctx) => ({
      deliveries: (await ctx.db.query("recipientDeliveries").collect()).filter(
        (row) => row.entityId === itemId
      ),
      item: await ctx.db.get(itemId as Id<"buildActionItems">),
    }));
    expect(repeatedDeadline.deliveries).toHaveLength(6);
    expect(
      new Set(repeatedDeadline.deliveries.map((row) => row.dedupeKey)).size
    ).toBe(6);
    expect(repeatedDeadline.item?.deadlineScheduleGeneration).toBe(3);
  });

  test("rejects policy overrides above the actor and fail-closes corrupt reference scope", async () => {
    const fixture = await seedQueueBuilds();
    const dueAt = Date.now() + 60_000;
    await fixture.base.run(async (ctx) => {
      for (const [subject, role] of [
        ["user_admin", "admin"],
        ["user_principle", "principle-broker"],
      ] as const) {
        await ctx.db.insert("buildParticipants", {
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildIds[0],
          createdAt: Date.now(),
          displayNameSnapshot: `${subject} lower Build grant`,
          joinedAt: Date.now(),
          organizationId: ORGANIZATION_ID,
          participationPeriod: 1,
          role: "contractor",
          status: "active",
          updatedAt: Date.now(),
          validFrom: Date.now(),
          workosUserId: subject,
        });
        await ctx.db.insert("workosOrganizationMemberships", {
          roleSlug: role,
          roleSlugs: [role],
          sourceEventId: `deadline-${subject}`,
          sourceEventType: "test",
          status: "active",
          workosMembershipId: `membership-${subject}`,
          workosOrganizationId: ORGANIZATION_ID,
          workosUserId: subject,
        });
      }
    });
    const adminItemId = await fixture.admin.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildIds[0],
        organizationId: ORGANIZATION_ID,
        postId: fixture.postIds[0],
        title: "Admin-governed deadline",
      }
    );
    await fixture.admin.mutation(
      (internal as any).build_action_item_queues.applyBuildActionItemPolicyDueDate,
      {
        actionItemId: adminItemId,
        buildId: fixture.buildIds[0],
        dueAt,
        organizationId: ORGANIZATION_ID,
        policyKey: "admin-sla",
      }
    );
    await expect(
      fixture.builder.mutation(
        (api as any).build_action_item_queues.overrideBuildActionItemPolicyDueDate,
        {
          actionItemId: adminItemId,
          buildId: fixture.buildIds[0],
          dueAt: dueAt + 60_000,
          organizationId: ORGANIZATION_ID,
          reason: "Builder cannot govern an admin-created item.",
        }
      )
    ).rejects.toThrow("coordinating authority");
    await fixture.admin.mutation(
      (internal as any).build_action_item_queues
        .processOneBuildActionItemDeadline,
      { actionItemId: adminItemId, asOf: dueAt }
    );
    const principle = withIdentity(fixture.base, {
      role: "principle-broker",
      subject: "user_principle",
    });
    const principleItemId = await principle.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildIds[0],
        organizationId: ORGANIZATION_ID,
        postId: fixture.postIds[0],
        title: "Principle Broker governed deadline",
      }
    );
    await fixture.admin.mutation(
      (internal as any).build_action_item_queues.applyBuildActionItemPolicyDueDate,
      {
        actionItemId: principleItemId,
        buildId: fixture.buildIds[0],
        dueAt,
        organizationId: ORGANIZATION_ID,
        policyKey: "principle-sla",
      }
    );
    await fixture.admin.mutation(
      (internal as any).build_action_item_queues
        .processOneBuildActionItemDeadline,
      { actionItemId: principleItemId, asOf: dueAt }
    );
    const globalAuthorityDeliveries = await fixture.base.run(async (ctx) =>
      (await ctx.db.query("recipientDeliveries").collect()).filter((row) =>
        [adminItemId, principleItemId].includes(
          row.entityId as Id<"buildActionItems">
        )
      )
    );
    expect(
      globalAuthorityDeliveries.map((row) => row.recipientWorkosUserId)
    ).toEqual(expect.arrayContaining(["user_admin", "user_principle"]));
    expect(
      globalAuthorityDeliveries.every((row) =>
        row.href.startsWith("/backoffice/builds/")
      )
    ).toBe(true);

    const contractorItemId = await fixture.assignee.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildIds[0],
        organizationId: ORGANIZATION_ID,
        postId: fixture.postIds[0],
        title: "Contractor-created governed deadline",
      }
    );
    await fixture.admin.mutation(
      (internal as any).build_action_item_queues.applyBuildActionItemPolicyDueDate,
      {
        actionItemId: contractorItemId,
        buildId: fixture.buildIds[0],
        dueAt,
        organizationId: ORGANIZATION_ID,
        policyKey: "contractor-sla",
      }
    );
    await expect(
      fixture.assignee.mutation(
        (api as any).build_action_item_queues.overrideBuildActionItemPolicyDueDate,
        {
          actionItemId: contractorItemId,
          buildId: fixture.buildIds[0],
          dueAt: dueAt + 60_000,
          organizationId: ORGANIZATION_ID,
          reason: "Creator authority is not coordinator authority.",
        }
      )
    ).rejects.toThrow("coordinating authority");

    const builderItemId = await fixture.builder.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildIds[0],
        organizationId: ORGANIZATION_ID,
        postId: fixture.postIds[0],
        title: "Reference integrity",
      }
    );
    const corruptReferenceId = await fixture.base.run((ctx) =>
      ctx.db.insert("buildCollaborationReferences", {
        actionItemQueueSortAt: Number.MAX_SAFE_INTEGER - 1,
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildIds[1],
        createdAt: Date.now(),
        entityId: "material-corrupt",
        entityKind: "material",
        labelSnapshot: "Corrupt cross-Build reference",
        organizationId: ORGANIZATION_ID,
        ownerKind: "actionItem",
        ownerRecordId: builderItemId,
        postId: fixture.postIds[1],
        primary: true,
      })
    );
    await expect(
      fixture.builder.mutation(
        (api as any).build_action_items.updateBuildActionItem,
        {
          actionItemId: builderItemId,
          buildId: fixture.buildIds[0],
          dueAt: Date.now() + 60_000,
          expectedRevision: 1,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("reference scope integrity failure");
    await expect(
      fixture.builder.mutation(
        (api as any).build_action_item_workflow.transitionBuildActionItem,
        {
          actionItemId: builderItemId,
          buildId: fixture.buildIds[0],
          expectedRevision: 1,
          nextStatus: "in_progress",
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("reference scope integrity failure");
    await expect(
      fixture.builder.mutation(
        (api as any).build_action_item_queues.replaceBuildActionItemReferences,
        {
          actionItemId: builderItemId,
          buildId: fixture.buildIds[0],
          expectedRevision: 1,
          organizationId: ORGANIZATION_ID,
          reason: "Attempt repair through ordinary editing.",
          references: [],
        }
      )
    ).rejects.toThrow("reference scope integrity failure");
    expect(
      await fixture.base.run((ctx) => ctx.db.get(corruptReferenceId))
    ).not.toBeNull();
    const rolledBackItem = await fixture.base.run((ctx) =>
      ctx.db.get(builderItemId as Id<"buildActionItems">)
    );
    expect(rolledBackItem).toMatchObject({
      currentRevision: 1,
      queueSortAt: Number.MAX_SAFE_INTEGER - 1,
      status: "todo",
    });
    expect(rolledBackItem?.dueAt).toBeUndefined();
  });

  test("quarantines a corrupt deadline independently without starving valid work", async () => {
    const fixture = await seedQueueBuilds();
    const dueAt = Date.now();
    const [corruptItemId, corruptPostItemId, validItemId] = await Promise.all(
      ["Corrupt reminder", "Corrupt post reminder", "Valid reminder"].map((title) =>
        fixture.builder.mutation(
          (api as any).build_action_items.createBuildActionItem,
          {
            assigneeWorkosUserId: "user_assignee",
            buildId: fixture.buildIds[0],
            dueAt,
            organizationId: ORGANIZATION_ID,
            postId: fixture.postIds[0],
            title,
          }
        )
      )
    );
    await fixture.base.run((ctx) =>
      ctx.db.patch(corruptItemId, { organizationId: "org_corrupt" })
    );
    await fixture.base.run((ctx) =>
      ctx.db.patch(corruptPostItemId, {
        originatingPostId: fixture.postIds[1],
      })
    );

    for (const actionItemId of [corruptItemId, corruptPostItemId]) {
      await fixture.admin.mutation(
        (internal as any).build_action_item_queues
          .processOneBuildActionItemDeadline,
        { actionItemId, asOf: dueAt }
      );
    }
    await fixture.admin.mutation(
      (internal as any).build_action_item_queues
        .processOneBuildActionItemDeadline,
      { actionItemId: validItemId, asOf: dueAt }
    );

    const result = await fixture.base.run(async (ctx) => ({
      audits: (await ctx.db.query("auditEvents").collect()).filter(
        (row) => row.entityId === corruptItemId
      ),
      corrupt: await ctx.db.get(corruptItemId),
      corruptPost: await ctx.db.get(corruptPostItemId),
      valid: await ctx.db.get(validItemId),
      validDeliveries: (
        await ctx.db.query("recipientDeliveries").collect()
      ).filter((row) => row.entityId === validItemId),
    }));
    expect(result.corrupt).toMatchObject({
      deadlineProcessingFailure: expect.stringContaining("scope"),
      deadlineProcessingState: "quarantined",
    });
    expect(result.audits.map((row) => row.eventType)).toContain(
      "build.collaboration.action_item.deadline.quarantined"
    );
    expect(result.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          brokerageId: fixture.brokerageId,
          organizationId: ORGANIZATION_ID,
        }),
      ])
    );
    expect(result.corruptPost).toMatchObject({
      deadlineProcessingFailure: expect.stringContaining(
        "parent post scope integrity"
      ),
      deadlineProcessingState: "quarantined",
    });
    expect(result.valid).toMatchObject({
      deadlineNextStage: "overdue",
      deadlineProcessingState: "pending",
    });
    expect(result.validDeliveries).toHaveLength(2);
  });

  test("backfills legacy deadline schedules before the indexed processor is activated", async () => {
    const fixture = await seedQueueBuilds();
    const dueAt = Date.now() + 60_000;
    const itemId = await fixture.builder.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildIds[0],
        dueAt,
        organizationId: ORGANIZATION_ID,
        postId: fixture.postIds[0],
        title: "Legacy scheduled item",
      }
    );
    const { duplicateReferenceId, referenceId } = await fixture.base.run(
      async (ctx) => {
      await ctx.db.patch(itemId, {
        deadlineNextAt: undefined,
        deadlineNextStage: undefined,
        deadlineProcessingState: undefined,
        queueSortAt: undefined,
      });
      const referenceId = await ctx.db.insert("buildCollaborationReferences", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildIds[0],
        createdAt: Date.now(),
        entityId: "material-legacy-projection",
        entityKind: "material",
        labelSnapshot: "Legacy projection",
        organizationId: ORGANIZATION_ID,
        ownerKind: "actionItem",
        ownerRecordId: itemId,
        postId: fixture.postIds[0],
        primary: false,
      });
        const duplicateReferenceId = await ctx.db.insert(
          "buildCollaborationReferences",
          {
            brokerageId: fixture.brokerageId,
            buildId: fixture.buildIds[0],
            createdAt: Date.now() + 1,
            entityId: "material-legacy-projection",
            entityKind: "material",
            labelSnapshot: "Legacy projection duplicate",
            organizationId: ORGANIZATION_ID,
            ownerKind: "actionItem",
            ownerRecordId: itemId,
            postId: fixture.postIds[0],
            primary: true,
          }
        );
        return { duplicateReferenceId, referenceId };
      }
    );

    await fixture.admin.mutation(
      (internal as any).build_action_item_deadline_migrations
        .backfillBuildActionItemDeadlineSchedules,
      {
        cursor: null,
        dryRun: false,
        oneBatchOnly: true,
      }
    );
    let referenceCursor: string | null = null;
    for (let batch = 0; batch < 3; batch += 1) {
      const result: { continueCursor: string; isDone: boolean } =
        await fixture.admin.mutation(
        (internal as any).build_action_item_deadline_migrations
          .backfillBuildActionItemReferenceQueueSort,
        {
          cursor: referenceCursor,
          dryRun: false,
          oneBatchOnly: true,
        }
        );
      if (result.isDone) {
        break;
      }
      referenceCursor = result.continueCursor;
    }

    await expect(fixture.base.run((ctx) => ctx.db.get(itemId))).resolves.toMatchObject(
      {
        deadlineNextAt: dueAt - 24 * 60 * 60 * 1000,
        deadlineNextStage: "before",
        deadlineProcessingState: "pending",
        queueSortAt: dueAt,
      }
    );
    await expect(
      fixture.base.run((ctx) => ctx.db.get(referenceId))
    ).resolves.toMatchObject({ actionItemQueueSortAt: dueAt, primary: true });
    await expect(
      fixture.base.run((ctx) => ctx.db.get(duplicateReferenceId))
    ).resolves.toBeNull();
    const entityQueue = await fixture.reader.query(
      (api as any).build_action_item_queues.listBuildActionItemQueue,
      {
        buildId: fixture.buildIds[0],
        entityId: "material-legacy-projection",
        entityKind: "material",
        includeCompleted: true,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
        scope: "entity",
      }
    );
    expect(entityQueue.page).toMatchObject([{ item: { _id: itemId } }]);
  });

  test("bounds legacy reference migration transactions at maximum cardinality", async () => {
    const fixture = await seedQueueBuilds();
    const itemId = (await fixture.builder.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildIds[0],
        organizationId: ORGANIZATION_ID,
        postId: fixture.postIds[0],
        title: "Maximum legacy reference cardinality",
      }
    )) as Id<"buildActionItems">;
    await fixture.base.run(async (ctx) => {
      for (let index = 0; index < 100; index += 1) {
        await ctx.db.insert("buildCollaborationReferences", {
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildIds[0],
          createdAt: Date.now() + index,
          entityId: `legacy-entity-${index}`,
          entityKind: "material",
          labelSnapshot: `Legacy entity ${index}`,
          organizationId: ORGANIZATION_ID,
          ownerKind: "actionItem",
          ownerRecordId: itemId,
          postId: fixture.postIds[0],
          primary: index === 0,
        });
      }
    });

    const result = await fixture.admin.mutation(
      (internal as any).build_action_item_deadline_migrations
        .backfillBuildActionItemReferenceQueueSort,
      {
        cursor: null,
        dryRun: false,
        oneBatchOnly: true,
      }
    );
    expect(result).toMatchObject({ isDone: false, processed: 1 });
    const references = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("buildCollaborationReferences")
        .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
          query.eq("ownerKind", "actionItem").eq("ownerRecordId", itemId)
        )
        .collect()
    );
    expect(references).toHaveLength(100);
    expect(
      references.filter(
        (reference) => reference.actionItemQueueSortAt !== undefined
      )
    ).toHaveLength(1);
  });

  test("orders creation, assignment, workflow, completion, and material-reference activity", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-31T12:00:00.000Z"));
      const fixture = await seedQueueBuilds();
      const itemId = await fixture.builder.mutation(
        (api as any).build_action_items.createBuildActionItem,
        {
          buildId: fixture.buildIds[0],
          organizationId: ORGANIZATION_ID,
          postId: fixture.postIds[0],
          title: "Activity ordering",
        }
      );
      const createdAt = await fixture.base.run(
        async (ctx) =>
          (await ctx.db.get(fixture.postIds[0]))?.lastMeaningfulActivityAt
      );
      vi.setSystemTime(new Date("2026-07-31T12:01:00.000Z"));
      await fixture.builder.mutation(
        (api as any).build_action_items.updateBuildActionItem,
        {
          actionItemId: itemId,
          buildId: fixture.buildIds[0],
          expectedRevision: 1,
          organizationId: ORGANIZATION_ID,
          title: "Activity ordering renamed",
        }
      );
      const afterOrdinaryEdit = await fixture.base.run(
        async (ctx) =>
          (await ctx.db.get(fixture.postIds[0]))?.lastMeaningfulActivityAt
      );
      expect(afterOrdinaryEdit).toBe(createdAt);

      vi.setSystemTime(new Date("2026-07-31T12:02:00.000Z"));
      await fixture.builder.mutation(
        (api as any).build_action_item_workflow.assignBuildActionItem,
        {
          actionItemId: itemId,
          assigneeWorkosUserId: "user_assignee",
          buildId: fixture.buildIds[0],
          expectedRevision: 2,
          organizationId: ORGANIZATION_ID,
        }
      );
      const afterAssignment = await fixture.base.run(
        async (ctx) =>
          (await ctx.db.get(fixture.postIds[0]))?.lastMeaningfulActivityAt
      );
      expect(afterAssignment).toBe(Date.parse("2026-07-31T12:02:00.000Z"));

      vi.setSystemTime(new Date("2026-07-31T12:03:00.000Z"));
      await fixture.assignee.mutation(
        (api as any).build_action_item_workflow.transitionBuildActionItem,
        {
          actionItemId: itemId,
          buildId: fixture.buildIds[0],
          expectedRevision: 3,
          nextStatus: "in_progress",
          organizationId: ORGANIZATION_ID,
        }
      );
      const afterTransition = await fixture.base.run(
        async (ctx) =>
          (await ctx.db.get(fixture.postIds[0]))?.lastMeaningfulActivityAt
      );
      expect(afterTransition).toBe(Date.parse("2026-07-31T12:03:00.000Z"));

      await fixture.base.run(async (ctx) => {
        const item = await ctx.db.get(itemId as Id<"buildActionItems">);
        if (!item?.queueSortAt) {
          throw new Error("Expected Action Item queue sort projection fixture.");
        }
        await ctx.db.insert("buildCollaborationReferences", {
          actionItemQueueSortAt: item.queueSortAt,
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildIds[0],
          createdAt: Date.now(),
          entityId: "material-activity",
          entityKind: "material",
          labelSnapshot: "Activity material",
          organizationId: ORGANIZATION_ID,
          ownerKind: "actionItem",
          ownerRecordId: itemId,
          postId: fixture.postIds[0],
          primary: true,
        });
      });
      vi.setSystemTime(new Date("2026-07-31T12:04:00.000Z"));
      await fixture.builder.mutation(
        (api as any).build_action_item_queues.replaceBuildActionItemReferences,
        {
          actionItemId: itemId,
          buildId: fixture.buildIds[0],
          expectedRevision: 4,
          organizationId: ORGANIZATION_ID,
          reason: "Material selection was withdrawn.",
          references: [],
        }
      );
      const afterReferenceChange = await fixture.base.run(
        async (ctx) =>
          (await ctx.db.get(fixture.postIds[0]))?.lastMeaningfulActivityAt
      );
      expect(afterReferenceChange).toBe(
        Date.parse("2026-07-31T12:04:00.000Z")
      );

      vi.setSystemTime(new Date("2026-07-31T12:05:00.000Z"));
      await fixture.assignee.mutation(
        (api as any).build_action_item_workflow.transitionBuildActionItem,
        {
          actionItemId: itemId,
          buildId: fixture.buildIds[0],
          expectedRevision: 5,
          nextStatus: "done",
          organizationId: ORGANIZATION_ID,
        }
      );
      const afterCompletion = await fixture.base.run(
        async (ctx) =>
          (await ctx.db.get(fixture.postIds[0]))?.lastMeaningfulActivityAt
      );
      expect(afterCompletion).toBe(Date.parse("2026-07-31T12:05:00.000Z"));
    } finally {
      vi.useRealTimers();
    }
  });
});
