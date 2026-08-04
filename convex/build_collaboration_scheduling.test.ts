/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as schedulingModule from "./build_collaboration_scheduling";
import {
  buildLocalDateAt,
  buildLocalMidnightUtc,
} from "./build_collaboration_system_posts";
import { buildCollaborationValidationError } from "./build_collaboration_validation";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_build_collaboration_scheduling";
const BASE_TIME = Date.parse("2026-08-01T12:00:00.000Z");

afterEach(() => {
  vi.useRealTimers();
});

describe("Build collaboration scheduled publication", () => {
  test("resolves Build-local midnights across DST transitions", () => {
    expect(
      buildLocalMidnightUtc("2026-03-08", "America/Toronto")
    ).toBe(Date.parse("2026-03-08T05:00:00.000Z"));
    expect(
      buildLocalMidnightUtc("2026-11-01", "America/Toronto")
    ).toBe(Date.parse("2026-11-01T04:00:00.000Z"));
    expect(
      buildLocalDateAt(
        Date.parse("2026-03-08T04:59:59.000Z"),
        "America/Toronto"
      )
    ).toBe("2026-03-07");
    expect(
      buildLocalDateAt(
        Date.parse("2026-03-08T05:00:00.000Z"),
        "America/Toronto"
      )
    ).toBe("2026-03-08");
  });

  test("queues exact durable activation timestamps for normal and DST dates", async () => {
    vi.useFakeTimers();
    const cases = [
      {
        expected: Date.parse("2026-02-01T05:00:00.000Z"),
        now: Date.parse("2026-01-01T12:00:00.000Z"),
        startDate: "2026-01-31",
      },
      {
        expected: Date.parse("2026-03-08T05:00:00.000Z"),
        now: Date.parse("2026-03-01T12:00:00.000Z"),
        startDate: "2026-03-07",
      },
      {
        expected: Date.parse("2026-11-01T04:00:00.000Z"),
        now: Date.parse("2026-10-01T12:00:00.000Z"),
        startDate: "2026-10-31",
      },
    ];

    for (const testCase of cases) {
      vi.setSystemTime(testCase.now);
      const fixture = await seedSchedulingBuild();
      await seedCanonicalSchedulingMilestone(fixture, {
        startDate: testCase.startDate,
      });
      await fixture.base.mutation(
        (internal as any).build_collaboration_scheduling
          .scheduleCurrentMilestoneSystemPostActivationsInternal,
        { buildId: fixture.buildId },
      );

      const scheduledFunctions = await fixture.base.run(async (ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      );
      const activation = scheduledFunctions.find((scheduled) =>
        scheduled.name.endsWith(
          "build_collaboration_scheduling:executeScheduledMilestoneSystemPostActivation",
        ),
      );
      expect(activation?.scheduledTime).toBe(testCase.expected);
    }
  });

  test("revalidates a stale scheduled activation after the Build startDate moves", async () => {
    vi.useFakeTimers();
    const initialNow = Date.parse("2026-01-01T12:00:00.000Z");
    const initialDue = Date.parse("2026-02-01T05:00:00.000Z");
    const repairedDue = Date.parse("2026-02-03T05:00:00.000Z");
    vi.setSystemTime(initialNow);
    const fixture = await seedSchedulingBuild();
    const canonical = await seedCanonicalSchedulingMilestone(fixture, {
      startDate: "2026-01-31",
    });
    await fixture.base.mutation(
      (internal as any).build_collaboration_scheduling
        .scheduleCurrentMilestoneSystemPostActivationsInternal,
      { buildId: fixture.buildId },
    );

    const initialScheduled = await fixture.base.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(
      initialScheduled.some(
        (scheduled) =>
          scheduled.name.endsWith(
            "build_collaboration_scheduling:executeScheduledMilestoneSystemPostActivation",
          ) && scheduled.scheduledTime === initialDue,
      ),
    ).toBe(true);

    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.buildId, {
        startDate: "2026-02-02",
        updatedAt: initialNow,
      });
    });
    vi.setSystemTime(initialDue);
    await fixture.base.mutation(
      (internal as any).build_collaboration_scheduling
        .executeScheduledMilestoneSystemPostActivation,
      {
        buildId: fixture.buildId,
        milestoneId: canonical.buildMilestoneId,
        scheduledFor: initialDue,
      },
    );

    const rescheduled = await fixture.base.run(async (ctx) => ({
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(rescheduled.posts).toEqual([]);
    expect(
      rescheduled.scheduled.some(
        (scheduled) =>
          scheduled.name.endsWith(
            "build_collaboration_scheduling:executeScheduledMilestoneSystemPostActivation",
          ) && scheduled.scheduledTime === repairedDue,
      ),
    ).toBe(true);

    vi.setSystemTime(repairedDue);
    await fixture.base.mutation(
      (internal as any).build_collaboration_scheduling
        .executeScheduledMilestoneSystemPostActivation,
      {
        buildId: fixture.buildId,
        milestoneId: canonical.buildMilestoneId,
        scheduledFor: repairedDue,
      },
    );
    const activated = await fixture.base.run(async (ctx) => ({
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
    }));
    expect(activated.posts).toHaveLength(1);
  });

  test("materializes scheduled milestone cards without starts and records one missed-start marker", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedSchedulingBuild();
    const canonical = await seedCanonicalSchedulingMilestone(fixture);
    const springStart = buildLocalMidnightUtc(
      "2026-03-08",
      "America/Toronto"
    );
    await fixture.base.mutation(
      (internal as any).build_collaboration_scheduling
        .reconcileDueMilestoneSystemPosts,
      { asOf: springStart }
    );
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());

    const first = await fixture.base.run(async (ctx) => {
      const post = await ctx.db
        .query("buildCollaborationPosts")
        .withIndex("by_buildId_and_systemEventKey", (query) =>
          query.eq(
            "buildId",
            fixture.buildId
          )
        )
        .first();
      const revision = post?.currentRevisionId
        ? await ctx.db.get(post.currentRevisionId)
        : null;
      return {
        actionItems: await ctx.db.query("buildActionItems").collect(),
        deliveries: await ctx.db.query("recipientDeliveries").collect(),
        milestone: await ctx.db.get(canonical.buildMilestoneId),
        outbox: await ctx.db.query("eventOutbox").collect(),
        post,
        revision,
        submilestone: await ctx.db.get(canonical.buildSubmilestoneId),
      };
    });
    expect(first.post).toMatchObject({
      activationReason: "scheduled",
      systemPostKind: "milestone",
    });
    expect(first.revision?.plainText).toContain("does not record that work has started");
    expect(first.actionItems).toHaveLength(1);
    expect(first.deliveries).toHaveLength(0);
    expect(first.milestone?.actualStartedAt).toBeUndefined();
    expect(first.submilestone?.actualStartedAt).toBeUndefined();

    await fixture.base.mutation(
      (internal as any).build_collaboration_scheduling
        .reconcileDueMilestoneSystemPosts,
      { asOf: springStart }
    );
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    const repeated = await fixture.base.run(async (ctx) => ({
      actionItems: await ctx.db.query("buildActionItems").collect(),
      audits: await ctx.db.query("auditEvents").collect(),
      outbox: await ctx.db.query("eventOutbox").collect(),
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
    }));
    expect(repeated.posts).toHaveLength(1);
    expect(repeated.actionItems).toHaveLength(1);

    const missedStart = buildLocalMidnightUtc(
      "2026-03-09",
      "America/Toronto"
    );
    await fixture.base.mutation(
      (internal as any).build_collaboration_scheduling
        .reconcileDueMilestoneSystemPosts,
      { asOf: missedStart }
    );
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    const behind = await fixture.builderStaff.query(
      (api as any).build_action_items.listBuildActionItems,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
    );
    expect(behind[0]?.item.systemPresentation).toMatchObject({
      column: "behind_schedule",
      plannedStartDate: "2026-03-08",
      state: "known",
      timezone: "America/Toronto",
    });

    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(canonical.buildSubmilestoneId, {
        actualStartedAt: missedStart,
        status: "in_progress",
        updatedAt: missedStart,
      });
    });
    const overdueStart = buildLocalMidnightUtc(
      "2026-03-10",
      "America/Toronto"
    );
    await fixture.base.mutation(
      (internal as any).build_collaboration_scheduling
        .reconcileDueMilestoneSystemPosts,
      { asOf: overdueStart }
    );
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    const started = await fixture.builderStaff.query(
      (api as any).build_action_items.listBuildActionItems,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
    );
    expect(started[0]?.item.systemPresentation).toMatchObject({
      attention: "overdue_completion",
      column: "in_progress",
    });
    const final = await fixture.base.run(async (ctx) => ({
      audits: await ctx.db.query("auditEvents").collect(),
      outbox: await ctx.db.query("eventOutbox").collect(),
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
    }));
    expect(
      final.audits.filter(
        (event) =>
          event.eventType ===
          "build.collaboration.system_action_item.missed_start"
      )
    ).toHaveLength(1);
    expect(
      final.outbox.filter(
        (event) =>
          event.eventType ===
          "build.collaboration.system_action_item.missed_start"
      )
    ).toHaveLength(1);
    expect(final.posts).toHaveLength(1);
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.buildId, { timezone: undefined });
    });
    const legacy = await fixture.builderStaff.query(
      (api as any).build_action_items.listBuildActionItems,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
    );
    expect(legacy[0]?.item.systemPresentation).toMatchObject({
      column: "backlog",
      state: "unknown",
    });
  });

  test("only promotes typed domain validation failures to material conflicts", async () => {
    await expect(
      schedulingModule.revalidateMaterialBoundary(async () => {
        throw new Error("Transient Convex database failure.");
      })
    ).rejects.toThrow("Transient Convex database failure.");

    await expect(
      schedulingModule.revalidateMaterialBoundary(async () => {
        throw buildCollaborationValidationError(
          "Deterministic publication conflict."
        );
      })
    ).rejects.toMatchObject({
      data: expect.objectContaining({
        code: "BUILD_COLLABORATION_SCHEDULE_MATERIAL_CONFLICT",
      }),
    });
  });

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
      const buildState = await ctx.db
        .query("buildCollaborationBuildStates")
        .withIndex("by_buildId", (query) =>
          query.eq("buildId", fixture.buildId)
        )
        .unique();
      if (!buildState) {
        throw new Error("Expected scheduled publication lifecycle state.");
      }
      await ctx.db.patch(buildState._id, {
        closedAt: BASE_TIME + 30_000,
        closedByRole: "admin",
        closedByWorkosUserId: "user_admin",
        closeReason: "Construction collaboration archive finalized.",
        revision: buildState.revision + 1,
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

  test("pauses a custom audience when an approved reader leaves the Build", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedSchedulingBuild();
    const scheduledFor = BASE_TIME + 60_000;
    const draft = await fixture.admin.mutation(
      (api as any).build_collaboration_drafts.saveMyBuildCollaborationDraft,
      {
        ...publicationBundle("Custom audience reader must remain active."),
        audienceMode: "custom",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        requestedReaderIds: ["user_admin", "user_builder_staff"],
      }
    );
    const approvalId = (await fixture.admin.mutation(
      (api as any).build_collaboration_scheduling
        .approveAndScheduleBuildCollaborationDraft,
      {
        buildId: fixture.buildId,
        draftId: draft.draftId,
        expectedRevision: draft.revision,
        organizationId: ORGANIZATION_ID,
        scheduledFor,
      }
    )) as Id<"buildCollaborationPublicationApprovals">;
    await fixture.base.run(async (ctx) => {
      const participant = await ctx.db
        .query("buildParticipants")
        .withIndex("by_buildId_and_workosUserId", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq("workosUserId", "user_builder_staff")
        )
        .unique();
      if (!participant) {
        throw new Error("Scheduling participant fixture is unavailable.");
      }
      await ctx.db.patch(participant._id, {
        removedAt: BASE_TIME + 30_000,
        status: "removed",
        updatedAt: BASE_TIME + 30_000,
        validUntil: BASE_TIME + 30_000,
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
      draft: await ctx.db.get(draft.draftId),
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
    }));
    expect(state.posts).toEqual([]);
    expect(state.approval).toMatchObject({
      conflictReason: expect.stringContaining(
        "Custom audience readers must be active Build participants"
      ),
      state: "paused",
    });
    expect(state.draft).toMatchObject({ state: "active" });
  });

  test("pauses when an approved participant reference is revoked", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedSchedulingBuild();
    const scheduledFor = BASE_TIME + 60_000;
    const draft = await fixture.admin.mutation(
      (api as any).build_collaboration_drafts.saveMyBuildCollaborationDraft,
      {
        ...publicationBundle("Referenced participant must remain authorized."),
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        references: [
          {
            entityId: "user_builder_staff",
            entityKind: "participant",
            label: "Builder Staff",
            primary: true,
            summary: "Active Build participant",
          },
        ],
      }
    );
    const approvalId = (await fixture.admin.mutation(
      (api as any).build_collaboration_scheduling
        .approveAndScheduleBuildCollaborationDraft,
      {
        buildId: fixture.buildId,
        draftId: draft.draftId,
        expectedRevision: draft.revision,
        organizationId: ORGANIZATION_ID,
        scheduledFor,
      }
    )) as Id<"buildCollaborationPublicationApprovals">;
    await fixture.base.run(async (ctx) => {
      const participant = await ctx.db
        .query("buildParticipants")
        .withIndex("by_buildId_and_workosUserId", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq("workosUserId", "user_builder_staff")
        )
        .unique();
      if (!participant) {
        throw new Error("Scheduling participant fixture is unavailable.");
      }
      await ctx.db.patch(participant._id, {
        removedAt: BASE_TIME + 30_000,
        status: "removed",
        updatedAt: BASE_TIME + 30_000,
        validUntil: BASE_TIME + 30_000,
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
      draft: await ctx.db.get(draft.draftId),
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
    }));
    expect(state.posts).toEqual([]);
    expect(state.approval).toMatchObject({
      conflictReason: expect.stringContaining(
        "referenced entity does not exist in this active Build or is archived"
      ),
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

  test("pauses when an approved governed asset becomes orphaned", async () => {
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
    const assetBlob = new Blob(["scheduled governed footing photo"], {
      type: "image/jpeg",
    });
    const staged = await fixture.admin.mutation(
      (api as any).build_collaboration_assets.beginBuildCollaborationAssetUpload,
      {
        buildId: fixture.buildId,
        contextKind: "draft",
        contextRecordId: initialDraft.draftId,
        fileName: "scheduled-footing.jpg",
        mimeType: "image/jpeg",
        organizationId: ORGANIZATION_ID,
        sizeBytes: assetBlob.size,
      }
    );
    const storageId = await fixture.base.run(
      async (ctx) => await ctx.storage.store(assetBlob)
    );
    const contentHashSha256 = "8".repeat(64);
    const assetId = await fixture.admin.mutation(
      (api as any).build_collaboration_assets
        .finalizeBuildCollaborationAssetUpload,
      {
        buildId: fixture.buildId,
        contentHashSha256,
        fileName: "scheduled-footing.jpg",
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
      await ctx.db.patch(staged.stagingSessionId, {
        state: "abandoned",
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
      draft: await ctx.db.get(attachedDraft.draftId),
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
    }));
    expect(state.posts).toEqual([]);
    expect(state.approval).toMatchObject({
      conflictReason: expect.stringContaining(
        "A proposed collaboration asset is orphaned"
      ),
      state: "paused",
    });
    expect(state.draft).toMatchObject({ state: "active" });
  });

  test("pauses when a newer replacement asset publishes after approval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedSchedulingBuild();
    const originalAssetId = await stageCleanSchedulingAsset(fixture, {
      content: "original governed footing evidence",
      fileName: "footing-v1.jpg",
      hashCharacter: "1",
    });
    await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        ...publicationBundle("Published original governed evidence."),
        attachmentAssetIds: [originalAssetId],
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );
    const approvedReplacementId = await stageCleanSchedulingAsset(fixture, {
      content: "approved replacement evidence",
      fileName: "footing-v2.jpg",
      hashCharacter: "2",
      supersedesAssetId: originalAssetId,
    });
    const scheduledFor = BASE_TIME + 60_000;
    const draft = await fixture.admin.mutation(
      (api as any).build_collaboration_drafts.saveMyBuildCollaborationDraft,
      {
        ...publicationBundle("Scheduled approved replacement evidence."),
        attachmentAssetIds: [approvedReplacementId],
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );
    const approvalId = (await fixture.admin.mutation(
      (api as any).build_collaboration_scheduling
        .approveAndScheduleBuildCollaborationDraft,
      {
        buildId: fixture.buildId,
        draftId: draft.draftId,
        expectedRevision: draft.revision,
        organizationId: ORGANIZATION_ID,
        scheduledFor,
      }
    )) as Id<"buildCollaborationPublicationApprovals">;

    await fixture.base.run(async (ctx) => {
      const original = await ctx.db.get(originalAssetId);
      if (!original) {
        throw new Error("Original scheduling asset fixture is unavailable.");
      }
      const { _creationTime: _ignoredCreationTime, _id: _ignoredId, ...fields } =
        original;
      await ctx.db.insert("buildCollaborationAssets", {
        ...fields,
        contentHashSha256: "3".repeat(64),
        fileName: "footing-v3.jpg",
        lineageRootAssetId: originalAssetId,
        publishedAt: BASE_TIME + 30_000,
        supersedesAssetId: approvedReplacementId,
        updatedAt: BASE_TIME + 30_000,
        version: 3,
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
      draft: await ctx.db.get(draft.draftId),
      posts: await ctx.db.query("buildCollaborationPosts").collect(),
    }));
    expect(state.posts).toHaveLength(1);
    expect(state.approval).toMatchObject({
      conflictReason: expect.stringMatching(
        /current published asset version changed|newer asset version/i
      ),
      state: "paused",
    });
    expect(state.draft).toMatchObject({ state: "active" });
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

async function stageCleanSchedulingAsset(
  fixture: Awaited<ReturnType<typeof seedSchedulingBuild>>,
  input: {
    content: string;
    fileName: string;
    hashCharacter: string;
    supersedesAssetId?: Id<"buildCollaborationAssets">;
  }
) {
  const blob = new Blob([input.content], { type: "image/jpeg" });
  const staged = await fixture.admin.mutation(
    (api as any).build_collaboration_assets.beginBuildCollaborationAssetUpload,
    {
      buildId: fixture.buildId,
      contextKind: "composer",
      fileName: input.fileName,
      mimeType: "image/jpeg",
      organizationId: ORGANIZATION_ID,
      sizeBytes: blob.size,
    }
  );
  const storageId = await fixture.base.run(
    async (ctx) => await ctx.storage.store(blob)
  );
  const contentHashSha256 = input.hashCharacter.repeat(64);
  const assetId = (await fixture.admin.mutation(
    (api as any).build_collaboration_assets
      .finalizeBuildCollaborationAssetUpload,
    {
      buildId: fixture.buildId,
      contentHashSha256,
      fileName: input.fileName,
      mimeType: "image/jpeg",
      organizationId: ORGANIZATION_ID,
      stagingSessionId: staged.stagingSessionId,
      storageId,
      supersedesAssetId: input.supersedesAssetId,
    }
  )) as Id<"buildCollaborationAssets">;
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
  return assetId;
}

async function seedCanonicalSchedulingMilestone(
  fixture: {
    base: ReturnType<typeof convexTest>;
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
  },
  options: { startDate?: string; timezone?: string } = {},
) {
  return await fixture.base.run(async (ctx) => {
    const build = await ctx.db.get(fixture.buildId);
    if (!build) {
      throw new Error("Scheduling Build fixture is unavailable.");
    }
    const now = BASE_TIME;
    await ctx.db.patch(build._id, {
      startDate: options.startDate ?? "2026-03-07",
      timezone: options.timezone ?? "America/Toronto",
      updatedAt: now,
    });
    const proposalMilestoneId = await ctx.db.insert("proposalMilestones", {
      brokerageId: fixture.brokerageId,
      budgetCents: 10_000,
      dayEnd: 2,
      dayStart: 1,
      dependencyKeys: [],
      drawAvailabilityCents: 10_000,
      durationDays: 2,
      key: "foundation",
      name: "Foundation",
      order: 1,
      organizationId: ORGANIZATION_ID,
      proposalId: build.proposalId,
      createdAt: now,
      updatedAt: now,
    });
    const proposalSubmilestoneId = await ctx.db.insert(
      "proposalSubmilestones",
      {
        brokerageId: fixture.brokerageId,
        createdAt: now,
        durationDays: 1,
        key: "excavate",
        milestoneKey: "foundation",
        name: "Excavate",
        order: 1,
        organizationId: ORGANIZATION_ID,
        proposalId: build.proposalId,
        proposalMilestoneId,
        startDay: 1,
        updatedAt: now,
      }
    );
    const buildMilestoneId = await ctx.db.insert("buildMilestones", {
      brokerageId: fixture.brokerageId,
      budgetCents: 10_000,
      buildId: build._id,
      collaborationEventRevision: 1,
      dayEnd: 2,
      dayStart: 1,
      dependencyKeys: [],
      drawAvailabilityCents: 10_000,
      durationDays: 2,
      key: "foundation",
      name: "Foundation",
      order: 1,
      organizationId: ORGANIZATION_ID,
      proposalMilestoneId,
      status: "planned",
      createdAt: now,
      updatedAt: now,
    });
    const buildSubmilestoneId = await ctx.db.insert("buildSubmilestones", {
      brokerageId: fixture.brokerageId,
      buildId: build._id,
      buildMilestoneId,
      createdAt: now,
      durationDays: 1,
      key: "excavate",
      milestoneKey: "foundation",
      name: "Excavate",
      order: 1,
      organizationId: ORGANIZATION_ID,
      proposalSubmilestoneId,
      startDay: 1,
      status: "planned",
      updatedAt: now,
    });
    return { buildMilestoneId, buildSubmilestoneId };
  });
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
