/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as schedulingModule from "./build_collaboration_scheduling";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_build_collaboration_scheduling";
const BASE_TIME = Date.parse("2026-08-01T12:00:00.000Z");

afterEach(() => {
  vi.useRealTimers();
});

describe("Build collaboration scheduled publication", () => {
  test("limits scheduling to coordinating humans and Updates or Announcements", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedSchedulingBuild();
    const scheduledFor = BASE_TIME + 60_000;
    const staffCapabilities = await fixture.builderStaff.query(
      (api as any).build_collaboration_scheduling
        .getBuildCollaborationSchedulingCapabilities,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
    );
    expect(staffCapabilities).toMatchObject({ canSchedule: false });

    const staffDraft = await fixture.builderStaff.mutation(
      (api as any).build_collaboration_drafts.saveMyBuildCollaborationDraft,
      {
        ...publicationBundle("Builder staff scheduled update attempt."),
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.builderStaff.mutation(
        (api as any).build_collaboration_scheduling
          .approveAndScheduleBuildCollaborationDraft,
        {
          buildId: fixture.buildId,
          draftId: staffDraft.draftId,
          expectedRevision: staffDraft.revision,
          organizationId: ORGANIZATION_ID,
          scheduledFor,
        }
      )
    ).rejects.toThrow("coordination team");

    const questionDraft = await fixture.admin.mutation(
      (api as any).build_collaboration_drafts.saveMyBuildCollaborationDraft,
      {
        ...publicationBundle("Question cannot be scheduled."),
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postType: "question",
      }
    );
    await expect(
      fixture.admin.mutation(
        (api as any).build_collaboration_scheduling
          .approveAndScheduleBuildCollaborationDraft,
        {
          buildId: fixture.buildId,
          draftId: questionDraft.draftId,
          expectedRevision: questionDraft.revision,
          organizationId: ORGANIZATION_ID,
          scheduledFor,
        }
      )
    ).rejects.toThrow("Only Updates and Announcements");
  });

  test("publishes an approved exact bundle once under the approving human", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedSchedulingBuild();
    const scheduledFor = BASE_TIME + 60_000;
    const { approvalId, draftId } = await saveAndSchedule(fixture, {
      plainText: "Scheduled concrete delivery update.",
      scheduledFor,
    });

    vi.setSystemTime(scheduledFor + 1);
    await fixture.base.action(
      (internal as any).build_collaboration_scheduling
        .executeScheduledBuildCollaborationPublication,
      { approvalId },
    );
    await fixture.base.action(
      (internal as any).build_collaboration_scheduling
        .executeScheduledBuildCollaborationPublication,
      { approvalId },
    );

    const state = await fixture.base.run(async (ctx) => ({
      approval: await ctx.db.get(approvalId),
      draft: await ctx.db.get(draftId),
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
    }));
    expect(state.posts).toHaveLength(1);
    expect(state.posts[0]).toMatchObject({
      authorWorkosUserId: "user_admin",
      createdAt: scheduledFor + 1,
      source: "human",
    });
    expect(state.approval).toMatchObject({
      executionAttemptCount: 1,
      postId: state.posts[0]._id,
      state: "published",
    });
    expect(state.draft).toMatchObject({ state: "published" });
  });

  test("keeps transient execution failures approved and eligible for recovery", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedSchedulingBuild();
    const scheduledFor = BASE_TIME + 60_000;
    const { approvalId } = await saveAndSchedule(fixture, {
      plainText: "Retryable scheduled concrete update.",
      scheduledFor,
    });

    await fixture.base.action(
      (internal as any).build_collaboration_scheduling
        .executeScheduledBuildCollaborationPublication,
      { approvalId }
    );
    const failedAttempt = await fixture.base.run(async (ctx) => ({
      approval: await ctx.db.get(approvalId),
      outbox: await ctx.db.query("eventOutbox").collect(),
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
    }));
    expect(failedAttempt.posts).toEqual([]);
    expect(failedAttempt.approval).toMatchObject({
      executionAttemptCount: 1,
      lastExecutionError: expect.stringContaining("not due yet"),
      state: "approved",
    });
    expect(failedAttempt.outbox).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType:
            "build.collaboration.publication.schedule_retryable_failure",
        }),
      ])
    );

    vi.setSystemTime(scheduledFor + 1);
    await fixture.base.mutation(
      (internal as any).build_collaboration_scheduling
        .processDueBuildCollaborationScheduledPublications,
      { asOf: scheduledFor + 1 }
    );
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());

    const recovered = await fixture.base.run(async (ctx) => ({
      approval: await ctx.db.get(approvalId),
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
    }));
    expect(recovered.posts).toHaveLength(1);
    expect(recovered.approval).toMatchObject({
      executionAttemptCount: 2,
      postId: recovered.posts[0]?._id,
      state: "published",
    });
    expect(recovered.approval).not.toHaveProperty("lastExecutionError");
  });

  test("pauses an approved record with a missing publication target", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedSchedulingBuild();
    const scheduledFor = BASE_TIME + 60_000;
    const { approvalId, draftId } = await saveAndSchedule(fixture, {
      plainText: "Corrupt scheduled target requires renewed approval.",
      scheduledFor,
    });
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(approvalId, { scheduledFor: undefined });
    });
    vi.setSystemTime(scheduledFor + 1);

    await fixture.base.action(
      (internal as any).build_collaboration_scheduling
        .executeScheduledBuildCollaborationPublication,
      { approvalId }
    );

    const state = await fixture.base.run(async (ctx) => ({
      approval: await ctx.db.get(approvalId),
      draft: await ctx.db.get(draftId),
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
    }));
    expect(state.posts).toEqual([]);
    expect(state.approval).toMatchObject({ state: "paused" });
    expect(state.draft).toMatchObject({ state: "active" });
    expect(state.approval?.conflictReason).toContain(
      "publication target is missing or invalid"
    );
  });

  test("recovers an untyped transient publication failure without pausing approval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedSchedulingBuild();
    const scheduledFor = BASE_TIME + 60_000;
    const { approvalId } = await saveAndSchedule(fixture, {
      plainText: "Scheduled update survives a transient Convex failure.",
      scheduledFor,
    });
    vi.setSystemTime(scheduledFor + 1);
    vi.spyOn(
      schedulingModule.publishScheduledBuildCollaborationDraft as never,
      "_handler"
    ).mockImplementationOnce(async () => {
      throw new Error("Transient Convex backend failure.");
    });

    await fixture.base.action(
      (internal as any).build_collaboration_scheduling
        .executeScheduledBuildCollaborationPublication,
      { approvalId }
    );
    const failedAttempt = await fixture.base.run(async (ctx) => ({
      approval: await ctx.db.get(approvalId),
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
    }));
    expect(failedAttempt.posts).toEqual([]);
    expect(failedAttempt.approval).toMatchObject({
      executionAttemptCount: 1,
      lastExecutionError: expect.stringContaining(
        "Transient Convex backend failure"
      ),
      state: "approved",
    });

    await fixture.base.mutation(
      (internal as any).build_collaboration_scheduling
        .processDueBuildCollaborationScheduledPublications,
      { asOf: scheduledFor + 1 }
    );
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());

    const recovered = await fixture.base.run(async (ctx) => ({
      approval: await ctx.db.get(approvalId),
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
    }));
    expect(recovered.posts).toHaveLength(1);
    expect(recovered.approval).toMatchObject({
      executionAttemptCount: 2,
      postId: recovered.posts[0]?._id,
      state: "published",
    });
  });

  test("pauses when the Build closes after exact approval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedSchedulingBuild();
    const scheduledFor = BASE_TIME + 60_000;
    const { approvalId, draftId } = await saveAndSchedule(fixture, {
      plainText: "Scheduled update approved before Build closure.",
      scheduledFor,
    });
    await fixture.base.run(async (ctx) => {
      await ctx.db.insert("buildCollaborationBuildStates", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        closedAt: BASE_TIME + 30_000,
        closedByRole: "admin",
        closedByWorkosUserId: "user_admin",
        closeReason: "Construction collaboration archive finalized.",
        createdAt: BASE_TIME + 30_000,
        organizationId: ORGANIZATION_ID,
        revision: 1,
        state: "closed",
        updatedAt: BASE_TIME + 30_000,
      });
    });

    vi.setSystemTime(scheduledFor + 1);
    await fixture.base.action(
      (internal as any).build_collaboration_scheduling
        .executeScheduledBuildCollaborationPublication,
      { approvalId }
    );

    const state = await fixture.base.run(async (ctx) => ({
      approval: await ctx.db.get(approvalId),
      draft: await ctx.db.get(draftId),
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
    }));
    expect(state.posts).toEqual([]);
    expect(state.approval).toMatchObject({
      conflictReason: expect.stringContaining("closed and read-only"),
      state: "paused",
    });
    expect(state.draft).toMatchObject({ state: "active" });
  });

  test("pauses when the approving human loses current membership", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedSchedulingBuild();
    const scheduledFor = BASE_TIME + 60_000;
    const { approvalId, draftId } = await saveAndSchedule(fixture, {
      plainText: "Membership-sensitive scheduled update.",
      scheduledFor,
    });
    const membershipId = await fixture.base.run(async (ctx) => {
      const membership = await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_user_and_organization", (query) =>
          query
            .eq("workosUserId", "user_admin")
            .eq("workosOrganizationId", ORGANIZATION_ID),
        )
        .first();
      if (!membership) {
        throw new Error("Scheduling membership fixture is unavailable.");
      }
      return membership.workosMembershipId;
    });
    await fixture.base.mutation(
      (internal as any).workosProjection.ingestWorkosEvent,
      {
        data: {
          id: membershipId,
          organization_id: ORGANIZATION_ID,
          user_id: "user_admin",
        },
        event: "organization_membership.deleted",
        id: "event_schedule_membership_removed",
      },
    );

    vi.setSystemTime(scheduledFor + 1);
    await fixture.base.action(
      (internal as any).build_collaboration_scheduling
        .executeScheduledBuildCollaborationPublication,
      { approvalId },
    );

    const state = await fixture.base.run(async (ctx) => ({
      approval: await ctx.db.get(approvalId),
      draft: await ctx.db.get(draftId),
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
      receipts: await ctx.db.query("buildCollaborationReceipts").collect(),
      deliveries: await ctx.db.query("recipientDeliveries").collect(),
    }));
    expect(state.posts).toEqual([]);
    expect(state.receipts).toEqual([]);
    expect(state.deliveries).toEqual([]);
    expect(state.approval).toMatchObject({
      conflictReason: expect.stringMatching(/membership|participation|role/i),
      state: "paused",
    });
    expect(state.draft).toMatchObject({
      scheduleConflictReason: expect.any(String),
      state: "active",
    });
  });

  test("pauses when audience membership changes after approval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedSchedulingBuild();
    const scheduledFor = BASE_TIME + 60_000;
    const { approvalId, draftId } = await saveAndSchedule(fixture, {
      plainText: "Audience-sensitive scheduled update.",
      scheduledFor,
    });
    await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Scheduling Build fixture is unavailable.");
      }
      await ctx.db.insert("buildParticipants", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: BASE_TIME + 1,
        displayNameSnapshot: "Late Site Contractor",
        joinedAt: BASE_TIME + 1,
        organizationId: ORGANIZATION_ID,
        participationPeriod: 1,
        role: "contractor",
        status: "active",
        updatedAt: BASE_TIME + 1,
        validFrom: BASE_TIME + 1,
        workosUserId: "user_late_contractor",
      });
    });

    vi.setSystemTime(scheduledFor + 1);
    await fixture.base.action(
      (internal as any).build_collaboration_scheduling
        .executeScheduledBuildCollaborationPublication,
      { approvalId },
    );

    const state = await fixture.base.run(async (ctx) => ({
      approval: await ctx.db.get(approvalId),
      draft: await ctx.db.get(draftId),
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
    }));
    expect(state.posts).toEqual([]);
    expect(state.approval).toMatchObject({
      conflictReason: expect.stringContaining("Renew human approval"),
      state: "paused",
    });
    expect(state.draft).toMatchObject({ state: "active" });
  });

  test("pauses when an attached governed asset becomes unavailable", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedSchedulingBuild();
    const initialDraft = await fixture.admin.mutation(
      (api as any).build_collaboration_drafts.saveMyBuildCollaborationDraft,
      {
        ...publicationBundle("Scheduled update with governed evidence."),
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );
    const assetBlob = new Blob(["scheduled governed foundation photo"], {
      type: "image/jpeg",
    });
    const staged = await fixture.admin.mutation(
      (api as any).build_collaboration_assets.beginBuildCollaborationAssetUpload,
      {
        buildId: fixture.buildId,
        contextKind: "draft",
        contextRecordId: initialDraft.draftId,
        fileName: "scheduled-foundation.jpg",
        mimeType: "image/jpeg",
        organizationId: ORGANIZATION_ID,
        sizeBytes: assetBlob.size,
      }
    );
    const storageId = await fixture.base.run(
      async (ctx) => await ctx.storage.store(assetBlob)
    );
    const contentHashSha256 = "9".repeat(64);
    const assetId = await fixture.admin.mutation(
      (api as any).build_collaboration_assets
        .finalizeBuildCollaborationAssetUpload,
      {
        buildId: fixture.buildId,
        contentHashSha256,
        fileName: "scheduled-foundation.jpg",
        mimeType: "image/jpeg",
        organizationId: ORGANIZATION_ID,
        stagingSessionId: staged.stagingSessionId,
        storageId,
      }
    );
    await fixture.base.mutation(
      (internal as any).build_collaboration_asset_maintenance
        .recordBuildCollaborationAssetScanResult,
      {
        assetId,
        computedHashSha256: contentHashSha256,
        outcome: "clean",
        provider: "test-scanner",
      }
    );
    const attachedDraft = await fixture.admin.mutation(
      (api as any).build_collaboration_drafts.saveMyBuildCollaborationDraft,
      {
        ...publicationBundle("Scheduled update with governed evidence."),
        attachmentAssetIds: [assetId],
        buildId: fixture.buildId,
        draftId: initialDraft.draftId,
        expectedRevision: initialDraft.revision,
        organizationId: ORGANIZATION_ID,
      }
    );
    const scheduledFor = BASE_TIME + 60_000;
    const approvalId = await fixture.admin.mutation(
      (api as any).build_collaboration_scheduling
        .approveAndScheduleBuildCollaborationDraft,
      {
        buildId: fixture.buildId,
        draftId: attachedDraft.draftId,
        expectedRevision: attachedDraft.revision,
        organizationId: ORGANIZATION_ID,
        scheduledFor,
      }
    );
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(assetId, {
        scanMessage: "Asset revoked after approval.",
        scanState: "rejected",
        state: "rejected",
        updatedAt: BASE_TIME + 30_000,
      });
    });

    vi.setSystemTime(scheduledFor + 1);
    await fixture.base.action(
      (internal as any).build_collaboration_scheduling
        .executeScheduledBuildCollaborationPublication,
      { approvalId }
    );

    const state = await fixture.base.run(async (ctx) => ({
      approval: await ctx.db.get(approvalId),
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
    }));
    expect(state.posts).toEqual([]);
    expect(state.approval).toMatchObject({
      conflictReason: expect.stringMatching(/asset|attachment|unavailable/i),
      state: "paused",
    });
  });

  test("pauses when an approved shared mutation has a stale expected revision", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedSchedulingBuild();
    const sourcePostId = (await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        ...publicationBundle("Original coordination state."),
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      },
    )) as Id<"buildCollaborationPosts">;
    const scheduledFor = BASE_TIME + 60_000;
    const { approvalId } = await saveAndSchedule(fixture, {
      plainText: "Scheduled update depending on original state.",
      scheduledFor,
      sharedMutations: [
        {
          entityId: sourcePostId,
          entityKind: "post",
          expectedRevision: 1,
          operation: "assert_revision",
          summary: "Publish only while the source post remains at revision 1.",
        },
      ],
    });
    await fixture.admin.mutation(
      (api as any).build_collaboration_editing.editBuildCollaborationPost,
      {
        buildId: fixture.buildId,
        editReason: "State changed before scheduled execution.",
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        postId: sourcePostId,
        references: [],
        tiptapJson: publicationBundle("Revised coordination state.").tiptapJson,
      },
    );

    vi.setSystemTime(scheduledFor + 1);
    await fixture.base.action(
      (internal as any).build_collaboration_scheduling
        .executeScheduledBuildCollaborationPublication,
      { approvalId },
    );

    const state = await fixture.base.run(async (ctx) => ({
      approval: await ctx.db.get(approvalId),
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
    }));
    expect(state.posts).toHaveLength(1);
    expect(state.posts[0]).toMatchObject({
      _id: sourcePostId,
      revision: 2,
    });
    expect(state.approval).toMatchObject({
      conflictReason: expect.stringContaining("Revision conflict"),
      state: "paused",
    });
  });

  test("records the exact revision observed by an atomic publication guard", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedSchedulingBuild();
    const sourcePostId = (await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        ...publicationBundle("Stable source coordination state."),
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    )) as Id<"buildCollaborationPosts">;
    const scheduledFor = BASE_TIME + 60_000;
    const { approvalId } = await saveAndSchedule(fixture, {
      plainText: "Scheduled publication with an exact revision guard.",
      scheduledFor,
      sharedMutations: [
        {
          entityId: sourcePostId,
          entityKind: "post",
          expectedRevision: 1,
          operation: "assert_revision",
          summary: "Require the stable source coordination state.",
        },
      ],
    });

    vi.setSystemTime(scheduledFor + 1);
    await fixture.base.action(
      (internal as any).build_collaboration_scheduling
        .executeScheduledBuildCollaborationPublication,
      { approvalId }
    );

    const state = await fixture.base.run(async (ctx) => ({
      approval: await ctx.db.get(approvalId),
      outbox: await ctx.db.query("eventOutbox").collect(),
    }));
    const guardEvent = state.outbox.find(
      (event) =>
        event.eventType ===
        "build_collaboration.shared_revision_precondition.applied"
    );
    expect(state.approval?.state).toBe("published");
    expect(guardEvent).toBeDefined();
    expect(JSON.parse(guardEvent?.payloadPreview ?? "{}")).toMatchObject({
      entityId: sourcePostId,
      expectedRevision: 1,
      observedRevision: 1,
      operation: "assert_revision",
    });
  });

  test("atomically applies a revision guard or pauses when a concurrent edit wins", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedSchedulingBuild();
    const sourcePostId = (await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        ...publicationBundle("Original concurrent coordination state."),
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    )) as Id<"buildCollaborationPosts">;
    const scheduledFor = BASE_TIME + 60_000;
    const { approvalId } = await saveAndSchedule(fixture, {
      plainText: "Scheduled publication guarded by the source revision.",
      scheduledFor,
      sharedMutations: [
        {
          entityId: sourcePostId,
          entityKind: "post",
          expectedRevision: 1,
          operation: "assert_revision",
          summary: "Publish only while the source post remains at revision 1.",
        },
      ],
    });

    vi.setSystemTime(scheduledFor + 1);
    const [editResult, executionResult] = await Promise.allSettled([
      fixture.admin.mutation(
        (api as any).build_collaboration_editing.editBuildCollaborationPost,
        {
          buildId: fixture.buildId,
          editReason: "Concurrent source edit.",
          expectedRevision: 1,
          organizationId: ORGANIZATION_ID,
          postId: sourcePostId,
          references: [],
          tiptapJson: publicationBundle(
            "Concurrent revised coordination state."
          ).tiptapJson,
        }
      ),
      fixture.base.action(
        (internal as any).build_collaboration_scheduling
          .executeScheduledBuildCollaborationPublication,
        { approvalId }
      ),
    ]);
    expect(editResult.status).toBe("fulfilled");
    expect(executionResult.status).toBe("fulfilled");

    const state = await fixture.base.run(async (ctx) => ({
      approval: await ctx.db.get(approvalId),
      outbox: await ctx.db.query("eventOutbox").collect(),
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
      sourcePost: await ctx.db.get(sourcePostId),
    }));
    expect(state.sourcePost?.revision).toBe(2);
    if (state.approval?.state === "published") {
      const guardEvent = state.outbox.find(
        (event) =>
          event.eventType ===
          "build_collaboration.shared_revision_precondition.applied"
      );
      expect(guardEvent).toBeDefined();
      expect(JSON.parse(guardEvent?.payloadPreview ?? "{}")).toMatchObject({
        entityId: sourcePostId,
        expectedRevision: 1,
        observedRevision: 1,
        operation: "assert_revision",
      });
      expect(state.posts).toHaveLength(2);
    } else {
      expect(state.approval).toMatchObject({
        conflictReason: expect.stringContaining("Revision conflict"),
        state: "paused",
      });
      expect(state.posts).toHaveLength(1);
    }
  });

  test("rejects stale private draft saves while preserving offline capture time and shared silence", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedSchedulingBuild();
    const initial = await fixture.admin.mutation(
      (api as any).build_collaboration_drafts.saveMyBuildCollaborationDraft,
      {
        ...publicationBundle("Offline foundation photo draft."),
        buildId: fixture.buildId,
        offlineCapturedAt: BASE_TIME - 30_000,
        organizationId: ORGANIZATION_ID,
      },
    );

    await expect(
      fixture.admin.mutation(
        (api as any).build_collaboration_drafts.saveMyBuildCollaborationDraft,
        {
          ...publicationBundle("Stale overwrite attempt."),
          buildId: fixture.buildId,
          draftId: initial.draftId,
          expectedRevision: 0,
          offlineCapturedAt: BASE_TIME - 20_000,
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow("Draft revision conflict");
    await fixture.admin.mutation(
      (api as any).build_collaboration_drafts.saveMyBuildCollaborationDraft,
      {
        ...publicationBundle("Reconciled offline foundation photo draft."),
        buildId: fixture.buildId,
        draftId: initial.draftId,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
      },
    );

    const state = await fixture.base.run(async (ctx) => ({
      draft: await ctx.db.get(initial.draftId),
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
      receipts: await ctx.db.query("buildCollaborationReceipts").collect(),
      deliveries: await ctx.db.query("recipientDeliveries").collect(),
    }));
    expect(state.draft).toMatchObject({
      offlineCapturedAt: BASE_TIME - 30_000,
      revision: 2,
      state: "active",
    });
    expect(state.posts).toEqual([]);
    expect(state.receipts).toEqual([]);
    expect(state.deliveries).toEqual([]);
  });
});

async function saveAndSchedule(
  fixture: Awaited<ReturnType<typeof seedSchedulingBuild>>,
  input: {
    plainText: string;
    scheduledFor: number;
    sharedMutations?: Array<{
      entityId: string;
      entityKind: string;
      expectedRevision: number;
      operation: string;
      summary: string;
    }>;
  },
) {
  const draft = await fixture.admin.mutation(
    (api as any).build_collaboration_drafts.saveMyBuildCollaborationDraft,
    {
      ...publicationBundle(input.plainText, input.sharedMutations),
      buildId: fixture.buildId,
      organizationId: ORGANIZATION_ID,
    },
  );
  const approvalId = await fixture.admin.mutation(
    (api as any).build_collaboration_scheduling
      .approveAndScheduleBuildCollaborationDraft,
    {
      buildId: fixture.buildId,
      draftId: draft.draftId,
      expectedRevision: draft.revision,
      organizationId: ORGANIZATION_ID,
      scheduledFor: input.scheduledFor,
    },
  );
  return {
    approvalId: approvalId as Id<"buildCollaborationPublicationApprovals">,
    draftId: draft.draftId as Id<"buildCollaborationDrafts">,
  };
}

function publicationBundle(
  plainText: string,
  sharedMutations: Array<{
    entityId: string;
    entityKind: string;
    expectedRevision: number;
    operation: string;
    summary: string;
  }> = [],
) {
  return {
    actionItems: [],
    attachmentAssetIds: [],
    audienceMode: "build_wide" as const,
    plainText,
    postType: "update" as const,
    references: [],
    requestedReaderIds: [],
    sharedMutations,
    tiptapJson: JSON.stringify({
      content: [
        {
          content: [{ text: plainText, type: "text" }],
          type: "paragraph",
        },
      ],
      type: "doc",
    }),
  };
}

async function seedSchedulingBuild() {
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
      assignedBrokerWorkosUserId: "user_admin",
      brokerageId: foundation.brokerageId,
      borrowerCoPayBps: 0,
      borrowerWorkingCapitalLimitCents: 50_000_000,
      buildName: "Scheduled Collaboration Build",
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
      },
    );
    const activeBuildId = await ctx.db.insert("activeBuilds", {
      brokerageId: foundation.brokerageId,
      buildName: "Scheduled Collaboration Build",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      location: "147 Cedar Ridge Road",
      organizationId: ORGANIZATION_ID,
      proposalId,
      startDate: "2026-08-01",
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
    return activeBuildId;
  });
  await provisionBuilderStaffParticipant(base, buildId);
  return {
    admin,
    base,
    brokerageId: foundation.brokerageId,
    buildId,
    builderStaff: withIdentity(base, {
      roles: ["builder-staff"],
      subject: "user_builder_staff",
    }),
  };
}

async function provisionBuilderStaffParticipant(
  base: ReturnType<typeof convexTest>,
  buildId: Id<"activeBuilds">
) {
  await base.mutation((internal as any).workosProjection.ingestWorkosEvent, {
    data: {
      email: "builder.staff@example.com",
      email_verified: true,
      first_name: "Builder",
      id: "user_builder_staff",
      last_name: "Staff",
    },
    event: "user.created",
    id: "scheduling_user_builder_staff_created",
  });
  await base.mutation((internal as any).workosProjection.ingestWorkosEvent, {
    data: {
      id: "membership_scheduling_builder_staff",
      organization_id: ORGANIZATION_ID,
      role: { slug: "builder-staff" },
      roles: [{ slug: "builder-staff" }],
      status: "active",
      user_id: "user_builder_staff",
    },
    event: "organization_membership.created",
    id: "scheduling_membership_builder_staff_created",
  });
  await base.run(async (ctx) => {
    const build = await ctx.db.get(buildId);
    if (!build) {
      throw new Error("Scheduling Build fixture is unavailable.");
    }
    await ctx.db.insert("buildParticipants", {
      brokerageId: build.brokerageId,
      buildId,
      createdAt: BASE_TIME,
      displayNameSnapshot: "Builder Staff",
      joinedAt: BASE_TIME,
      organizationId: ORGANIZATION_ID,
      participationPeriod: 1,
      role: "builder-staff",
      status: "active",
      updatedAt: BASE_TIME,
      validFrom: BASE_TIME,
      workosUserId: "user_builder_staff",
    });
  });
}

function withIdentity(
  t: ReturnType<typeof convexTest>,
  input: { roles: string[]; subject: string },
) {
  return t.withIdentity({
    email: `${input.subject}@example.com`,
    name: input.subject,
    organizationId: ORGANIZATION_ID,
    role: input.roles[0],
    roles: input.roles,
    subject: input.subject,
    tokenIdentifier: `https://api.workos.com/|${input.subject}`,
    "https://fairlend.ca/actor_kind": "human",
  } as never);
}
