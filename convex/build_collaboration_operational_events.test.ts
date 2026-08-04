/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./types";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_build_collaboration_operational_events";

type CollaborationRole =
  | "admin"
  | "principle-broker"
  | "broker"
  | "builder"
  | "broker-staff"
  | "builder-staff"
  | "homeowner"
  | "contractor";

function withIdentity(
  base: ReturnType<typeof convexTest>,
  role: CollaborationRole,
  subject: string,
) {
  return base.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId: ORGANIZATION_ID,
    role,
    roles: [role],
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as never);
}

async function seedOperationalBuild(options?: {
  collaborationActive?: boolean;
}) {
  const base = convexTest(schema, modules);
  const admin = withIdentity(base, "admin", "user_admin");
  const foundation = await admin.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORGANIZATION_ID },
  );
  const fixture = await base.run(async (ctx) => {
    const now = Date.now();
    const proposalId = await ctx.db.insert("buildProposals", {
      assignedBrokerWorkosUserId: "user_broker",
      brokerageId: foundation.brokerageId,
      borrowerCoPayBps: 0,
      borrowerWorkingCapitalLimitCents: 50_000_000,
      buildName: "Operational event build",
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
    const buildId = await ctx.db.insert("activeBuilds", {
      brokerageId: foundation.brokerageId,
      buildName: "Operational event build",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      location: "147 Cedar Ridge Road",
      locationLatitude: 43.2557,
      locationLongitude: -79.8711,
      organizationId: ORGANIZATION_ID,
      proposalId,
      startDate: "2026-07-28",
      status: "active",
      totalBudgetCents: 240_000_000,
      updatedAt: now,
      workflowRuleSnapshotId,
    });
    await ctx.db.patch(proposalId, { activeBuildId: buildId });
    const proposalMilestoneId = await ctx.db.insert("proposalMilestones", {
      brokerageId: foundation.brokerageId,
      budgetCents: 50_000_000,
      createdAt: now,
      dayEnd: 20,
      dayStart: 0,
      dependencyKeys: [],
      drawAvailabilityCents: 40_000_000,
      durationDays: 20,
      key: "foundation",
      name: "Foundation",
      order: 1,
      organizationId: ORGANIZATION_ID,
      proposalId,
      updatedAt: now,
    });
    const milestoneId = await ctx.db.insert("buildMilestones", {
      brokerageId: foundation.brokerageId,
      budgetCents: 50_000_000,
      buildId,
      createdAt: now,
      dayEnd: 20,
      dayStart: 0,
      dependencyKeys: [],
      drawAvailabilityCents: 40_000_000,
      durationDays: 20,
      key: "foundation",
      name: "Foundation",
      order: 1,
      organizationId: ORGANIZATION_ID,
      progressPercent: 75,
      proposalMilestoneId,
      status: "in_progress",
      updatedAt: now,
    });
    await ctx.db.insert("buildCollaborationTenantSettings", {
      activatedAt: options?.collaborationActive === false ? undefined : now,
      activatedByWorkosUserId:
        options?.collaborationActive === false ? undefined : "user_admin",
      brokerageId: foundation.brokerageId,
      createdAt: now,
      generousRateLimitMultiplier: 10,
      migrationCompletedAt: now,
      organizationId: ORGANIZATION_ID,
      status: options?.collaborationActive === false ? "disabled" : "active",
      updatedAt: now,
    });
    const participants: Array<{
      displayName: string;
      role: CollaborationRole;
      subject: string;
    }> = [
      { displayName: "Admin", role: "admin", subject: "user_admin" },
      { displayName: "Broker", role: "broker", subject: "user_broker" },
      {
        displayName: "Builder staff",
        role: "builder-staff",
        subject: "user_builder_staff",
      },
      {
        displayName: "Contractor",
        role: "contractor",
        subject: "user_contractor",
      },
      {
        displayName: "Assigned contractor",
        role: "contractor",
        subject: "user_assigned_contractor",
      },
      {
        displayName: "Homeowner",
        role: "homeowner",
        subject: "user_homeowner",
      },
    ];
    for (const participant of participants) {
      await ctx.db.insert("buildParticipants", {
        brokerageId: foundation.brokerageId,
        buildId,
        createdAt: now,
        displayNameSnapshot: participant.displayName,
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
    const assignedContractorId = await ctx.db.insert("contractorProfiles", {
      accountWorkosUserId: "user_assigned_contractor",
      brokerageId: foundation.brokerageId,
      createdAt: now,
      name: "Assigned contractor",
      organizationId: ORGANIZATION_ID,
      status: "active",
      trades: ["concrete"],
      updatedAt: now,
    });
    const buildContractorAssignmentId = await ctx.db.insert(
      "buildContractorAssignments",
      {
        brokerageId: foundation.brokerageId,
        buildId,
        contractorId: assignedContractorId,
        createdAt: now,
        organizationId: ORGANIZATION_ID,
        role: "Concrete contractor",
        status: "active",
        updatedAt: now,
      },
    );
    await ctx.db.insert("milestoneContractorAssignments", {
      assignedAt: now,
      assignedByWorkosUserId: "user_admin",
      brokerageId: foundation.brokerageId,
      buildContractorAssignmentId,
      buildId,
      buildMilestoneId: milestoneId,
      contractorId: assignedContractorId,
      createdAt: now,
      milestoneKey: "foundation",
      organizationId: ORGANIZATION_ID,
      postHoc: false,
      role: "Concrete contractor",
      status: "active",
      updatedAt: now,
    });
    for (const authority of [
      {
        role: "admin",
        subject: "user_global_admin",
      },
      {
        role: "principle-broker",
        subject: "user_global_principal",
      },
    ] as const) {
      await ctx.db.insert("users", {
        authId: `auth_${authority.subject}`,
        createdAt: now,
        email: `${authority.subject}@example.com`,
        name: authority.subject,
        status: "active",
        updatedAt: now,
        workosUserId: authority.subject,
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        directoryManaged: false,
        roleSlug: authority.role,
        roleSlugs: [authority.role],
        sourceEventId: `fixture_${authority.subject}`,
        sourceEventType: "fixture.operational-events",
        status: "active",
        updatedAt: now,
        workosMembershipId: `membership_${authority.subject}`,
        workosOrganizationId: ORGANIZATION_ID,
        workosUserId: authority.subject,
      });
    }
    return {
      brokerageId: foundation.brokerageId,
      buildId,
      builderProfileId: foundation.builderProfileId,
      milestoneId,
      proposalId,
    };
  });
  return {
    admin,
    base,
    ...fixture,
    broker: withIdentity(base, "broker", "user_broker"),
    builder: withIdentity(base, "builder", "user_builder"),
    builderStaff: withIdentity(base, "builder-staff", "user_builder_staff"),
    assignedContractor: withIdentity(
      base,
      "contractor",
      "user_assigned_contractor",
    ),
    contractor: withIdentity(base, "contractor", "user_contractor"),
    globalAdmin: withIdentity(base, "admin", "user_global_admin"),
    globalPrincipal: withIdentity(
      base,
      "principle-broker",
      "user_global_principal",
    ),
    homeowner: withIdentity(base, "homeowner", "user_homeowner"),
  };
}

async function collaborationSnapshot(
  base: ReturnType<typeof convexTest>,
  buildId: string,
) {
  return await base.run(async (ctx) => {
    const posts = (
      await ctx.db.query("buildCollaborationPosts").collect()
    ).filter((row) => String(row.buildId) === buildId);
    const postIds = new Set(posts.map((post) => String(post._id)));
    return {
      actionItems: (await ctx.db.query("buildActionItems").collect()).filter(
        (row) => String(row.buildId) === buildId,
      ),
      deliveries: (await ctx.db.query("recipientDeliveries").collect()).filter(
        (row) =>
          row.collaborationBuildId &&
          String(row.collaborationBuildId) === buildId,
      ),
      posts,
      references: (
        await ctx.db.query("buildCollaborationReferences").collect()
      ).filter((row) => postIds.has(String(row.postId))),
    };
  });
}

async function silentBackfillSideEffectSnapshot(
  base: ReturnType<typeof convexTest>,
  buildId: string,
) {
  return await base.run(async (ctx) => {
    const actionItems = (await ctx.db.query("buildActionItems").collect()).filter(
      (row) => String(row.buildId) === buildId,
    );
    return {
      activityProjectionIds: (
        await ctx.db.query("buildCollaborationActivityProjections").collect()
      )
        .filter((row) => String(row.buildId) === buildId)
        .map((row) => String(row._id)),
      actionItemAssignmentState: actionItems.map((row) => ({
        assigneeWorkosUserId: row.assigneeWorkosUserId,
        assignedByWorkosUserId: row.assignedByWorkosUserId,
        assignmentRequestedAt: row.assignmentRequestedAt,
        assignmentState: row.assignmentState,
        id: String(row._id),
      })),
      actionItemCreationRequestIds: (
        await ctx.db.query("buildActionItemCreationRequests").collect()
      )
        .filter((row) => String(row.buildId) === buildId)
        .map((row) => String(row._id)),
      actionItemEventIds: (await ctx.db.query("buildActionItemEvents").collect())
        .filter((row) => String(row.buildId) === buildId)
        .map((row) => String(row._id)),
      actionItemRevisionIds: (
        await ctx.db.query("buildActionItemRevisions").collect()
      )
        .filter((row) => String(row.buildId) === buildId)
        .map((row) => String(row._id)),
      auditEventIds: (await ctx.db.query("auditEvents").collect()).map((row) =>
        String(row._id),
      ),
      deliveryIds: (await ctx.db.query("recipientDeliveries").collect())
        .filter(
          (row) =>
            row.collaborationBuildId &&
            String(row.collaborationBuildId) === buildId,
        )
        .map((row) => String(row._id)),
      eventOutboxIds: (await ctx.db.query("eventOutbox").collect()).map((row) =>
        String(row._id),
      ),
      mentionDeliveryIds: (await ctx.db.query("recipientDeliveries").collect())
        .filter(
          (row) =>
            row.collaborationBuildId &&
            String(row.collaborationBuildId) === buildId &&
            row.collaborationEventKind === "direct_mention",
        )
        .map((row) => String(row._id)),
      receiptIds: (await ctx.db.query("buildCollaborationReceipts").collect())
        .filter((row) => String(row.buildId) === buildId)
        .map((row) => String(row._id)),
      followIds: (await ctx.db.query("buildCollaborationFollows").collect())
        .filter((row) => String(row.buildId) === buildId)
        .map((row) => String(row._id)),
    };
  });
}

async function feedKinds(
  actor: ReturnType<typeof withIdentity>,
  buildId: any,
): Promise<string[]> {
  const feed = await actor.query(
    (api as any).build_collaboration.listBuildCollaborationFeed,
    {
      buildId,
      organizationId: ORGANIZATION_ID,
      paginationOpts: { cursor: null, numItems: 50 },
    },
  );
  return feed.page.map((entry: { kind: string }) => entry.kind);
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
  throw new Error("Draw search maintenance did not drain within the test bound.");
}

describe("Build Collaboration operational events", () => {
  test("backfill preview is read-only and validate mode never materializes posts", async () => {
    const fixture = await seedOperationalBuild();
    const before = await collaborationSnapshot(fixture.base, String(fixture.buildId));
    const preview = await fixture.admin.query(
      (api as any).build_collaboration_system_post_backfill
        .previewBuildCollaborationSystemPostBackfill,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    expect(preview.planToken).toMatch(
      /^build-collaboration-system-posts\/v1:[a-f0-9]{64}$/,
    );
    const started = await fixture.admin.mutation(
      (api as any).build_collaboration_system_post_backfill
        .startBuildCollaborationSystemPostBackfill,
      {
        batchSize: 1,
        buildId: fixture.buildId,
        mode: "validate",
        organizationId: ORGANIZATION_ID,
        planToken: preview.planToken,
      },
    );
    let run = started;
    for (let guard = 0; run.status !== "complete"; guard += 1) {
      expect(guard).toBeLessThan(20);
      run = await fixture.admin.mutation(
        (api as any).build_collaboration_system_post_backfill
          .advanceBuildCollaborationSystemPostBackfill,
        {
          buildId: fixture.buildId,
          maxItems: 1,
          organizationId: ORGANIZATION_ID,
          runId: run.runId,
        },
      );
    }
    expect(run).toMatchObject({
      mode: "validate",
      processedMilestoneCount: 1,
      materializedPostCount: 0,
      status: "complete",
    });
    expect(await collaborationSnapshot(fixture.base, String(fixture.buildId))).toEqual(
      before,
    );
    const materializeRun = await fixture.admin.mutation(
      (api as any).build_collaboration_system_post_backfill
        .startBuildCollaborationSystemPostBackfill,
      {
        batchSize: 1,
        buildId: fixture.buildId,
        mode: "materialize",
        organizationId: ORGANIZATION_ID,
        planToken: preview.planToken,
      },
    );
    expect(materializeRun.mode).toBe("materialize");
    expect(materializeRun.runId).not.toBe(started.runId);
  });

  test("materializes active and terminal occurrences with explicit unknown history and idempotent retry", async () => {
    const fixture = await seedOperationalBuild();
    const source = await fixture.base.run(async (ctx) => {
      const now = Date.now();
      const proposalDrawId = await ctx.db.insert("proposalDrawScheduleRows", {
        amountCents: 10_000,
        brokerageId: fixture.brokerageId,
        createdAt: now,
        drawKey: "draw-foundation",
        label: "Foundation reimbursement",
        milestoneKey: "foundation",
        order: 1,
        organizationId: ORGANIZATION_ID,
        proposalId: fixture.proposalId,
        proposalMilestoneId: undefined,
        source: "milestone",
        timingDay: 20,
        updatedAt: now,
      });
      const plannedDrawId = await ctx.db.insert("plannedDrawScheduleRows", {
        amountCents: 10_000,
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        buildMilestoneId: fixture.milestoneId,
        createdAt: now,
        drawKey: "draw-foundation",
        label: "Foundation reimbursement",
        milestoneKey: "foundation",
        order: 1,
        organizationId: ORGANIZATION_ID,
        proposalDrawScheduleRowId: proposalDrawId,
        releaseDate: "2026-07-31",
        releasedAt: "2026-07-31T15:00:00.000Z",
        status: "released",
        timingDay: 20,
        updatedAt: now,
      });
      const secondProposalDrawId = await ctx.db.insert(
        "proposalDrawScheduleRows",
        {
          amountCents: 12_000,
          brokerageId: fixture.brokerageId,
          createdAt: now,
          drawKey: "draw-framing",
          label: "Framing reimbursement",
          milestoneKey: "foundation",
          order: 2,
          organizationId: ORGANIZATION_ID,
          proposalId: fixture.proposalId,
          proposalMilestoneId: undefined,
          source: "milestone",
          timingDay: 30,
          updatedAt: now,
        },
      );
      const plannedActiveDrawId = await ctx.db.insert(
        "plannedDrawScheduleRows",
        {
          amountCents: 12_000,
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          buildMilestoneId: fixture.milestoneId,
          createdAt: now,
          drawKey: "draw-framing",
          label: "Framing reimbursement",
          milestoneKey: "foundation",
          order: 2,
          organizationId: ORGANIZATION_ID,
          proposalDrawScheduleRowId: secondProposalDrawId,
          releaseDate: "2026-08-10",
          status: "approved",
          timingDay: 30,
          updatedAt: now,
        },
      );
      return { plannedActiveDrawId, plannedDrawId };
    });
    const sideEffectsBefore = await silentBackfillSideEffectSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    const preview = await fixture.admin.query(
      (api as any).build_collaboration_system_post_backfill
        .previewBuildCollaborationSystemPostBackfill,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    const run = await fixture.admin.mutation(
      (api as any).build_collaboration_system_post_backfill
        .startBuildCollaborationSystemPostBackfill,
      {
        batchSize: 1,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        planToken: preview.planToken,
      },
    );
    let current = run;
    current = await fixture.admin.mutation(
      (api as any).build_collaboration_system_post_backfill
        .advanceBuildCollaborationSystemPostBackfill,
      {
        buildId: fixture.buildId,
        maxItems: 1,
        organizationId: ORGANIZATION_ID,
        runId: current.runId,
      },
    );
    current = await fixture.admin.mutation(
      (api as any).build_collaboration_system_post_backfill
        .advanceBuildCollaborationSystemPostBackfill,
      {
        buildId: fixture.buildId,
        maxItems: 1,
        organizationId: ORGANIZATION_ID,
        runId: current.runId,
      },
    );
    const cursorCheckpoint = await fixture.base.run(async (ctx) =>
      ctx.db.get(
        current.runId as Id<"buildCollaborationSystemPostBackfillRuns">,
      ),
    );
    expect(cursorCheckpoint).toMatchObject({
      phase: "planned_draws",
      processedMilestoneCount: 1,
      processedPlannedDrawCount: 1,
      status: "running",
    });
    expect(cursorCheckpoint?.plannedDrawCursor).toBeDefined();
    for (let guard = 0; current.status !== "complete"; guard += 1) {
      expect(guard).toBeLessThan(30);
      current = await fixture.admin.mutation(
        (api as any).build_collaboration_system_post_backfill
          .advanceBuildCollaborationSystemPostBackfill,
        {
          buildId: fixture.buildId,
          maxItems: 1,
          organizationId: ORGANIZATION_ID,
          runId: current.runId,
        },
      );
    }
    const posts = await fixture.base.run(async (ctx) =>
      (await ctx.db.query("buildCollaborationPosts").collect()).filter(
        (post) => String(post.buildId) === String(fixture.buildId),
      ),
    );
    expect(posts).toHaveLength(3);
    expect(posts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          historicalBackfill: expect.objectContaining({
            source: "existing_records",
            unknownFacts: expect.arrayContaining(["start", "actor", "evidence"]),
          }),
          materializedAt: expect.any(Number),
          systemPostKind: "milestone",
        }),
        expect.objectContaining({
          historicalBackfill: expect.objectContaining({
            source: "existing_records",
            unknownFacts: expect.arrayContaining(["actor", "evidence"]),
          }),
          systemLifecycle: "resolved",
          systemPostKind: "draw",
        }),
        expect.objectContaining({
          historicalBackfill: expect.objectContaining({
            source: "existing_records",
            unknownFacts: expect.arrayContaining([
              "start",
              "actor",
              "evidence",
              "review",
              "disposition",
            ]),
          }),
          systemLifecycle: "open",
          systemPostKind: "draw",
        }),
      ]),
    );
    expect(await silentBackfillSideEffectSnapshot(
      fixture.base,
      String(fixture.buildId),
    )).toEqual(sideEffectsBefore);
    const rerun = await fixture.admin.mutation(
      (api as any).build_collaboration_system_post_backfill
        .startBuildCollaborationSystemPostBackfill,
      {
        batchSize: 1,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        planToken: preview.planToken,
      },
    );
    expect(rerun.runId).toBe(current.runId);
    expect(
      await fixture.base.run(
        async (ctx) =>
          (await ctx.db.query("buildCollaborationPosts").collect()).filter(
            (post) => String(post.buildId) === String(fixture.buildId),
          ).length,
      ),
      ).toBe(3);
    const activeOperations = await fixture.admin.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId: fixture.buildId,
        filter: "active_operations",
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 10 },
      },
    );
    const activeOperationPosts = activeOperations.page.filter(
      (entry: any) => entry.kind === "post",
    );
    expect(activeOperationPosts).toHaveLength(2);
    expect(
      activeOperationPosts.map((entry: any) => entry.post.systemPost?.lifecycle),
    ).toEqual(expect.arrayContaining(["open"]));
    expect(
      activeOperationPosts.every(
        (entry: any) => entry.post.systemPost?.lifecycle !== "resolved",
      ),
    ).toBe(true);
    const resolvedDrawPost = posts.find(
      (post) =>
        post.systemPostKind === "draw" && post.systemLifecycle === "resolved",
    );
    expect(resolvedDrawPost).toBeDefined();
    await fixture.base.run(async (ctx) => {
      await ctx.db.insert("buildCollaborationBuildStates", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        closeReason: "Historical archive is closed.",
        closedAt: Date.now(),
        closedByRole: "admin",
        closedByWorkosUserId: "user_admin",
        contentRevision: 0,
        createdAt: Date.now(),
        organizationId: ORGANIZATION_ID,
        revision: 1,
        state: "closed",
        updatedAt: Date.now(),
      });
    });
    await expect(
      fixture.admin.mutation(
        (api as any).build_collaboration_threads.addBuildCollaborationComment,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          plainText: "This archived System Post must remain read-only.",
          postId: resolvedDrawPost!._id,
          references: [],
          tiptapJson: JSON.stringify({ content: [], type: "doc" }),
        },
      ),
    ).rejects.toThrow(/closed and read-only/i);
    expect(source.plannedDrawId).toBeDefined();
    expect(source.plannedActiveDrawId).toBeDefined();
  });

  test("derives the collaboration viewer binding from authorized server state", async () => {
    const fixture = await seedOperationalBuild();
    await expect(
      fixture.admin.query(
        (api as any).build_collaboration_viewer
          .getBuildCollaborationViewerBinding,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toEqual({
      buildId: fixture.buildId,
      organizationId: ORGANIZATION_ID,
      role: "admin",
      workosUserId: "user_admin",
    });
  });

  test("creates one canonical Milestone System Post and one bound card per Sub-milestone idempotently", async () => {
    const fixture = await seedOperationalBuild();
    const submilestoneIds = await fixture.base.run(async (ctx) => {
      const milestone = await ctx.db.get(fixture.milestoneId);
      const proposalMilestone = milestone
        ? await ctx.db.get(milestone.proposalMilestoneId)
        : null;
      if (!(milestone && proposalMilestone)) {
        throw new Error("Milestone fixture is unavailable.");
      }
      const now = Date.now();
      const rows = [];
      for (const [index, name] of ["Excavate", "Pour footings"].entries()) {
        const key = `foundation-${index + 1}`;
        const proposalSubmilestoneId = await ctx.db.insert(
          "proposalSubmilestones",
          {
            brokerageId: fixture.brokerageId,
            createdAt: now,
            key,
            milestoneKey: milestone.key,
            name,
            order: index + 1,
            organizationId: ORGANIZATION_ID,
            proposalId: fixture.proposalId,
            proposalMilestoneId: proposalMilestone._id,
            updatedAt: now,
          },
        );
        rows.push(
          await ctx.db.insert("buildSubmilestones", {
            brokerageId: fixture.brokerageId,
            buildId: fixture.buildId,
            buildMilestoneId: milestone._id,
            createdAt: now,
            key,
            milestoneKey: milestone.key,
            name,
            order: index + 1,
            organizationId: ORGANIZATION_ID,
            proposalSubmilestoneId,
            status: "planned",
            updatedAt: now,
          }),
        );
      }
      return rows;
    });

    const startArgs = {
      actualStartedAt: Date.parse("2026-08-03T12:00:00.000Z"),
      buildId: fixture.buildId,
      idempotencyKey: "eng-407-foundation-start-001",
      milestoneKey: "foundation",
      source: "milestone_detail" as const,
      workosOrganizationId: ORGANIZATION_ID,
    };
    const first = await fixture.builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      startArgs,
    );
    const afterFirst = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    const replay = await fixture.builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      startArgs,
    );
    const afterReplay = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    const systemPosts = afterFirst.posts.filter(
      (post) => post.systemPostKind === "milestone",
    );
    const systemCards = afterFirst.actionItems.filter(
      (item) => item.systemMode === "generated_milestone_submilestone",
    );
    expect(first).toMatchObject({ replayed: false });
    expect(replay).toEqual({ ...first, replayed: true });
    expect(systemPosts).toHaveLength(1);
    expect(systemPosts[0]).toMatchObject({
      activationReason: "explicit_start",
      authorDisplayNameSnapshot: "DrawFlow System",
      canonicalBuildMilestoneId: fixture.milestoneId,
      source: "system",
      systemOccurrenceKey: `milestone-system:${fixture.buildId}:${fixture.milestoneId}`,
      triggeredByRole: "builder",
      triggeredByWorkosUserId: "user_builder",
    });
    expect(systemCards).toHaveLength(submilestoneIds.length);
    expect(systemCards.map((item) => item.canonicalBuildSubmilestoneId)).toEqual(
      expect.arrayContaining(submilestoneIds),
    );
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.buildId, { timezone: "America/Toronto" });
    });
    const builderItems = await fixture.builder.query(
      (api as any).build_action_items.listBuildActionItems,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    expect(builderItems[0]?.item.systemPresentation).toMatchObject({
      executionOwnership: {
        state: "assignment_required",
        viewerIsAssignee: false,
      },
      startCommand: {
        allowed: true,
        scope: "submilestone",
        source: "submilestone_detail",
      },
    });
    const contractorItems = await fixture.assignedContractor.query(
      (api as any).build_action_items.listBuildActionItems,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    expect(contractorItems).toEqual([]);
    const generatedCard = systemCards[0]!;
    await expect(
      fixture.admin.mutation(
        (api as any).build_action_items.updateBuildActionItem,
        {
          actionItemId: generatedCard._id,
          buildId: fixture.buildId,
          expectedRevision: generatedCard.currentRevision,
          organizationId: ORGANIZATION_ID,
          title: "Tampered system card",
        },
      ),
    ).rejects.toThrow(/cannot be edited or transitioned directly/i);
    await expect(
      fixture.admin.mutation(
        (api as any).build_action_item_workflow.transitionBuildActionItem,
        {
          actionItemId: generatedCard._id,
          buildId: fixture.buildId,
          expectedRevision: generatedCard.currentRevision,
          nextStatus: "done",
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow(/cannot be edited or transitioned directly/i);
    await expect(
      fixture.admin.mutation(
        (api as any).build_collaboration_editing.tombstoneBuildCollaborationPost,
        {
          buildId: fixture.buildId,
          expectedRevision: systemPosts[0]!.revision,
          organizationId: ORGANIZATION_ID,
          postId: systemPosts[0]!._id,
        },
      ),
    ).rejects.toThrow(/cannot be tombstoned/i);
    expect(afterReplay.posts).toHaveLength(afterFirst.posts.length);
    expect(afterReplay.actionItems).toHaveLength(afterFirst.actionItems.length);
    expect(afterReplay.deliveries).toHaveLength(afterFirst.deliveries.length);
    expect(afterReplay.references).toHaveLength(afterFirst.references.length);
    await expect(
      fixture.builder.query(
        (api as any).build_collaboration_focus
          .getFocusedBuildCollaborationPostContext,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: systemPosts[0]!._id,
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        entry: expect.objectContaining({
          post: expect.objectContaining({
            systemPost: expect.objectContaining({ kind: "milestone" }),
          }),
        }),
        state: "visible",
      }),
    );
    await expect(
      fixture.homeowner.query(
        (api as any).build_collaboration_focus
          .getFocusedBuildCollaborationPostContext,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: systemPosts[0]!._id,
        },
      ),
    ).resolves.toEqual({ state: "revoked" });
    const auditEvents = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query.eq("entityType", "buildCollaborationPost").eq(
            "entityId",
            String(systemPosts[0]!._id),
          ),
        )
        .collect(),
    );
    expect(
      auditEvents.filter(
        (event) => event.eventType === "build.collaboration.system_event.published",
      ),
    ).toHaveLength(1);
    expect(
      afterFirst.deliveries.map((delivery) => delivery.recipientWorkosUserId),
    ).not.toContain("user_homeowner");
    expect(await feedKinds(fixture.builder, fixture.buildId)).toEqual(["post"]);
    expect(await feedKinds(fixture.homeowner, fixture.buildId)).toEqual([
      "restricted",
    ]);
  });

  test("rejects zero-child active Milestone writes and renders legacy recovery without fabricating cards", async () => {
    const fixture = await seedOperationalBuild();
    await expect(
      fixture.admin.mutation(
        (api as any).production_proposals.createActiveBuildTimelineMilestone,
        {
          buildId: fixture.buildId,
          milestone: {
            budgetCents: 10_000_000,
            dayEnd: 30,
            dayStart: 21,
            durationDays: 9,
            evidenceState: "",
            dependencyKeys: [],
            milestoneKey: "framing",
            name: "Framing",
            order: 2,
            policyState: "",
            status: "planned",
            submilestones: [],
            x: 21,
          },
          workosOrganizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow(/at least one valid Sub-milestone/i);

    await fixture.builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      {
        actualStartedAt: Date.parse("2026-08-03T13:00:00.000Z"),
        buildId: fixture.buildId,
        idempotencyKey: "eng-407-legacy-zero-child-start-001",
        milestoneKey: "foundation",
        source: "milestone_detail",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const snapshot = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(
      snapshot.actionItems.filter(
        (item) => item.systemMode === "generated_milestone_submilestone",
      ),
    ).toHaveLength(0);
    const feed = await fixture.admin.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 50 },
      },
    );
    expect(feed.page).toEqual([
      expect.objectContaining({
        kind: "post",
        post: expect.objectContaining({
          systemPost: expect.objectContaining({
            kind: "milestone",
            recoveryState: "recovery_required",
          }),
        }),
      }),
    ]);
  });

  test("publishes submitted and location-unverified Evidence without widening access", async () => {
    const fixture = await seedOperationalBuild();

    await fixture.admin.mutation(
      (api as any).production_proposals.createActiveBuildTimelineEvidenceAsset,
      {
        asset: {
          evidenceKey: "foundation-photo-1",
          fileName: "foundation-photo.webp",
          label: "Foundation photo",
          locationVerified: false,
          milestoneKey: "foundation",
          mimeType: "image/webp",
          sizeBytes: 128_000,
          tag: "Foundation",
        },
        buildId: fixture.buildId,
        workosOrganizationId: ORGANIZATION_ID,
      },
    );

    const snapshot = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(snapshot.posts).toHaveLength(2);
    expect(snapshot.posts.map((post) => post.systemEventKey)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/:submitted$/),
        expect.stringMatching(/:location-unverified$/),
      ]),
    );
    expect(snapshot.posts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ threadState: "open" }),
      ]),
    );
    expect(snapshot.references).toHaveLength(3);
    expect(
      snapshot.references.filter((reference) =>
        String(reference.ownerKind).includes("postRevision"),
      ),
    ).toHaveLength(2);
    expect(snapshot.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: expect.any(String),
          entityKind: "evidenceAsset",
          primary: true,
        }),
      ]),
    );
    expect(snapshot.actionItems).toHaveLength(1);
    expect(snapshot.actionItems[0]).toMatchObject({
      creatorWorkosUserId: "system",
      deadlineProcessingState: "pending",
      dueDatePolicyKey: "evidence-location-unverified",
      dueDateSource: "policy",
      primaryReferenceKind: "evidenceAsset",
      requiresAcceptance: true,
      status: "todo",
      workKind: "evidence",
    });
    expect(snapshot.actionItems[0]?.dueAt).toBeGreaterThan(Date.now());
    expect(snapshot.deliveries.length).toBeGreaterThan(0);
    expect(snapshot.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: expect.stringMatching(/focus=evidenceAsset%3A/),
        }),
        expect.objectContaining({
          recipientWorkosUserId: "user_global_admin",
        }),
        expect.objectContaining({
          recipientWorkosUserId: "user_global_principal",
        }),
      ]),
    );
    expect(await feedKinds(fixture.admin, fixture.buildId)).toEqual([
      "post",
      "post",
    ]);
    expect(await feedKinds(fixture.broker, fixture.buildId)).toEqual([
      "post",
      "post",
    ]);
    expect(await feedKinds(fixture.builderStaff, fixture.buildId)).toEqual([
      "post",
      "post",
    ]);
    expect(await feedKinds(fixture.globalAdmin, fixture.buildId)).toEqual([
      "post",
      "post",
    ]);
    expect(await feedKinds(fixture.globalPrincipal, fixture.buildId)).toEqual([
      "post",
      "post",
    ]);
    expect(await feedKinds(fixture.contractor, fixture.buildId)).toEqual([
      "restricted",
      "restricted",
    ]);
    expect(await feedKinds(fixture.homeowner, fixture.buildId)).toEqual([
      "restricted",
      "restricted",
    ]);

    const asset = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("buildEvidenceAssets")
        .withIndex("by_build_key", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq("evidenceKey", "foundation-photo-1"),
        )
        .unique(),
    );
    expect(asset).toMatchObject({
      collaborationEventRevision: 1,
      locationVerified: false,
    });
  });

  test("publishes material Evidence reviews and suppresses identical no-op retries", async () => {
    const fixture = await seedOperationalBuild();
    await fixture.admin.mutation(
      (api as any).production_proposals.createActiveBuildTimelineEvidenceAsset,
      {
        asset: {
          evidenceKey: "review-package",
          fileName: "review-package.pdf",
          label: "Review package",
          locationVerified: true,
          milestoneKey: "foundation",
          mimeType: "application/pdf",
          sizeBytes: 256_000,
          tag: "Foundation",
        },
        buildId: fixture.buildId,
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    await fixture.admin.mutation(
      (api as any).production_proposals.reviewActiveBuildEvidence,
      {
        accepted: false,
        buildId: fixture.buildId,
        milestoneKey: "foundation",
        note: "Add the engineer seal.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const afterReject = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(afterReject.posts).toHaveLength(2);
    expect(afterReject.actionItems).toHaveLength(1);

    await fixture.admin.mutation(
      (api as any).production_proposals.reviewActiveBuildEvidence,
      {
        accepted: false,
        buildId: fixture.buildId,
        milestoneKey: "foundation",
        note: "Add the engineer seal.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const afterNoOp = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(afterNoOp.posts).toHaveLength(afterReject.posts.length);
    expect(afterNoOp.references).toHaveLength(afterReject.references.length);
    expect(afterNoOp.deliveries).toHaveLength(afterReject.deliveries.length);
    expect(afterNoOp.actionItems).toHaveLength(afterReject.actionItems.length);

    await fixture.admin.mutation(
      (api as any).production_proposals.reviewActiveBuildEvidence,
      {
        accepted: false,
        buildId: fixture.buildId,
        milestoneKey: "foundation",
        note: "Add the engineer seal and revision date.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const afterSecondMaterialReject = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(afterSecondMaterialReject.posts).toHaveLength(
      afterReject.posts.length + 1,
    );
    expect(afterSecondMaterialReject.actionItems).toHaveLength(1);
    const priorPostIds = new Set(afterReject.posts.map((post) => post._id));
    const secondRejectPost = afterSecondMaterialReject.posts.find(
      (post) => !priorPostIds.has(post._id),
    );
    expect(secondRejectPost?.openActionItemCount).toBe(1);
    const linkedActionItems = await fixture.admin.query(
      (api as any).build_action_items.listBuildActionItems,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: secondRejectPost!._id,
      },
    );
    expect(linkedActionItems).toHaveLength(1);
    expect(linkedActionItems[0]?.item._id).toBe(
      afterSecondMaterialReject.actionItems[0]?._id,
    );
    await fixture.admin.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId: afterSecondMaterialReject.actionItems[0]!._id,
        buildId: fixture.buildId,
        expectedRevision:
          afterSecondMaterialReject.actionItems[0]!.currentRevision,
        nextStatus: "cancelled",
        organizationId: ORGANIZATION_ID,
        reason: "Evidence was resolved through the authoritative review.",
      },
    );
    const afterObligationCancellation = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(
      afterObligationCancellation.posts
        .filter((post) => post.postType === "issue")
        .map((post) => post.openActionItemCount),
    ).toEqual([0, 0]);

    await fixture.admin.mutation(
      (api as any).production_proposals.reviewActiveBuildEvidence,
      {
        accepted: true,
        buildId: fixture.buildId,
        milestoneKey: "foundation",
        note: "Seal received and verified.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const afterAcceptance = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(afterAcceptance.posts).toHaveLength(
      afterSecondMaterialReject.posts.length + 1,
    );
    expect(afterAcceptance.actionItems).toHaveLength(1);
    expect(afterAcceptance.posts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ postType: "issue" }),
        expect.objectContaining({ postType: "update" }),
      ]),
    );
  });

  test("publishes Site Visit schedule transitions once and preserves failed-geofence Evidence", async () => {
    const fixture = await seedOperationalBuild();
    const scheduled = await fixture.admin.mutation(
      (api as any).production_proposals.scheduleActiveBuildSiteVisit,
      {
        buildId: fixture.buildId,
        idempotencyKey: "operational-foundation-site-visit",
        milestoneKey: "foundation",
        note: "Inspect footing forms.",
        requestedDay: 12,
        requestedTime: "09:00",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const scheduleReplay = await fixture.admin.mutation(
      (api as any).production_proposals.scheduleActiveBuildSiteVisit,
      {
        buildId: fixture.buildId,
        idempotencyKey: "operational-foundation-site-visit",
        milestoneKey: "foundation",
        note: "Inspect footing forms.",
        requestedDay: 12,
        requestedTime: "09:00",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    expect(scheduleReplay.visitId).toBe(scheduled.visitId);
    await expect(
      fixture.admin.mutation(
        (api as any).production_proposals.scheduleActiveBuildSiteVisit,
        {
          buildId: fixture.buildId,
          idempotencyKey: "operational-foundation-site-visit",
          milestoneKey: "foundation",
          note: "Inspect footing forms.",
          requestedDay: 14,
          requestedTime: "09:00",
          workosOrganizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow(/idempotency key was already used/i);
    const afterScheduleReplay = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(afterScheduleReplay.posts).toHaveLength(1);
    expect(
      await fixture.base.run(
        async (ctx) =>
          (
            await ctx.db
              .query("buildSiteVisits")
              .withIndex("by_build", (query) =>
                query.eq("buildId", fixture.buildId),
              )
              .collect()
          ).length,
      ),
    ).toBe(1);
    await fixture.admin.mutation(
      (api as any).production_proposals.rescheduleActiveBuildSiteVisit,
      {
        buildId: fixture.buildId,
        reason: "Inspector availability changed.",
        requestedDay: 13,
        requestedTime: "10:30",
        visitId: scheduled.visitId,
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const afterReschedule = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(afterReschedule.posts).toHaveLength(2);

    await fixture.admin.mutation(
      (api as any).production_proposals.rescheduleActiveBuildSiteVisit,
      {
        buildId: fixture.buildId,
        reason: "Updated the internal note only.",
        requestedDay: 13,
        requestedTime: "10:30",
        visitId: scheduled.visitId,
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const afterNoOp = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(afterNoOp.posts).toHaveLength(afterReschedule.posts.length);
    expect(afterNoOp.deliveries).toHaveLength(
      afterReschedule.deliveries.length,
    );

    const storageId = await fixture.base.run(async (ctx) =>
      ctx.storage.store(
        new Blob(["site visit evidence"], { type: "image/webp" }),
      ),
    );
    const registration = {
      buildId: String(fixture.buildId),
      clientEvidenceId: "site-visit-geofence-photo",
      fileName: "site-visit-geofence-photo.webp",
      locationAttempt: {
        accuracyMeters: 10,
        attempted: true,
        attemptedAt: 1_722_222_222_222,
        latitude: 43.3,
        longitude: -79.9,
        permissionOutcome: "granted" as const,
        verified: false,
      },
      mimeType: "image/webp",
      sizeBytes: 128_000,
      storageId,
      targetMilestoneKey: "foundation",
      token: scheduled.visitId,
    };
    const registered = await fixture.base.mutation(
      (api as any).production_proposals.registerActiveBuildSiteVisitFile,
      registration,
    );
    expect(registered.status).toBe("registered");
    const afterRegistration = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(afterRegistration.posts).toHaveLength(
      afterReschedule.posts.length + 2,
    );
    expect(afterRegistration.posts.map((post) => post.systemEventKey)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/:submitted$/),
        expect.stringMatching(/:location-unverified$/),
      ]),
    );
    expect(afterRegistration.actionItems).toHaveLength(1);
    const replayed = await fixture.base.mutation(
      (api as any).production_proposals.registerActiveBuildSiteVisitFile,
      registration,
    );
    expect(replayed).toEqual({
      assetId: registered.assetId,
      status: "replayed",
      storageDisposition: "reused_existing_upload",
    });
    const afterRegistrationReplay = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(afterRegistrationReplay.posts).toHaveLength(
      afterRegistration.posts.length,
    );
    expect(afterRegistrationReplay.deliveries).toHaveLength(
      afterRegistration.deliveries.length,
    );
    expect(afterRegistrationReplay.actionItems).toHaveLength(
      afterRegistration.actionItems.length,
    );
    const conflictingStorageId = await fixture.base.run(async (ctx) =>
      ctx.storage.store(
        new Blob(["conflicting site visit evidence"], { type: "image/webp" }),
      ),
    );
    const conflict = await fixture.base.mutation(
      (api as any).production_proposals.registerActiveBuildSiteVisitFile,
      {
        ...registration,
        fileName: "different-file.webp",
        storageId: conflictingStorageId,
      },
    );
    expect(conflict).toMatchObject({
      reason: "idempotency_conflict",
      status: "rejected",
      storageDisposition: "preserved_unowned_upload",
    });
    expect(
      await fixture.base.run(async (ctx) =>
        Boolean(await ctx.storage.get(conflictingStorageId)),
      ),
    ).toBe(true);

    await fixture.base.mutation(
      (api as any).production_proposals
        .submitActiveBuildTokenizedSiteVisitReport,
      {
        buildId: String(fixture.buildId),
        completionObserved: true,
        locationAttempt: {
          accuracyMeters: 10,
          attempted: true,
          attemptedAt: 1_722_222_222_222,
          latitude: 43.3,
          longitude: -79.9,
          permissionOutcome: "granted",
          verified: false,
        },
        missingPrerequisites: [],
        prerequisiteException: {
          acknowledged: true,
          reason: "Permit review is tracked separately.",
        },
        recommendedOutcome: "review",
        reportNotes:
          "<p>Footings were observed; lender review is required for location.</p>",
        token: scheduled.visitId,
      },
    );

    const afterSubmission = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(afterSubmission.posts).toHaveLength(
      afterRegistration.posts.length + 2,
    );
    expect(afterSubmission.actionItems).toHaveLength(2);
    expect(afterSubmission.posts.map((post) => post.systemEventKey)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/:location-unverified$/),
        expect.stringMatching(/:completed$/),
        expect.stringMatching(/:flagged$/),
      ]),
    );
    expect(afterSubmission.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: expect.stringMatching(/focus=siteVisit%3A/),
        }),
      ]),
    );
    const assignedContractorKinds = await feedKinds(
      fixture.assignedContractor,
      fixture.buildId,
    );
    expect(
      assignedContractorKinds.filter((kind) => kind === "post"),
    ).toHaveLength(4);
    expect(
      assignedContractorKinds.filter((kind) => kind === "restricted"),
    ).toHaveLength(2);
    expect(await feedKinds(fixture.contractor, fixture.buildId)).toEqual(
      Array.from({ length: 6 }, () => "restricted"),
    );
    expect(await feedKinds(fixture.homeowner, fixture.buildId)).toEqual(
      Array.from({ length: 6 }, () => "restricted"),
    );
    expect(
      afterSubmission.deliveries.some(
        (delivery) =>
          delivery.recipientWorkosUserId === "user_assigned_contractor" &&
          delivery.href.includes("focus=siteVisit%3A"),
      ),
    ).toBe(true);
    expect(
      afterSubmission.deliveries.some(
        (delivery) => delivery.recipientWorkosUserId === "user_contractor",
      ),
    ).toBe(false);
    const evidence = await fixture.base.run(async (ctx) =>
      (
        await ctx.db
          .query("buildEvidenceAssets")
          .withIndex("by_build", (query) =>
            query.eq("buildId", fixture.buildId),
          )
          .collect()
      ).find((asset) => asset.clientEvidenceId === "site-visit-geofence-photo"),
    );
    expect(evidence).toMatchObject({
      locationAttemptedAt: 1_722_222_222_222,
      locationVerified: false,
    });
    expect(evidence?.locationFailureReason).toMatch(
      /outside the 250 m geofence/,
    );
    expect(evidence?.locationDistanceMeters).toBeGreaterThan(250);

    await fixture.admin.mutation(
      (api as any).production_proposals.cancelActiveBuildSiteVisit,
      {
        buildId: fixture.buildId,
        reason: "Visit requires a replacement inspection.",
        visitId: scheduled.visitId,
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const afterCancellation = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(afterCancellation.posts).toHaveLength(
      afterSubmission.posts.length + 1,
    );
    expect(afterCancellation.actionItems).toHaveLength(
      afterSubmission.actionItems.length,
    );
    await fixture.admin.mutation(
      (api as any).production_proposals.cancelActiveBuildSiteVisit,
      {
        buildId: fixture.buildId,
        reason: "Identical cancellation retry.",
        visitId: scheduled.visitId,
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const afterCancellationRetry = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(afterCancellationRetry.posts).toHaveLength(
      afterCancellation.posts.length,
    );

    await expect(
      fixture.base.mutation(
        (api as any).production_proposals
          .submitActiveBuildTokenizedSiteVisitReport,
        {
          buildId: String(fixture.buildId),
          completionObserved: true,
          locationAttempt: {
            accuracyMeters: 10,
            attempted: true,
            attemptedAt: 1_722_222_222_222,
            latitude: 43.3,
            longitude: -79.9,
            permissionOutcome: "granted",
            verified: false,
          },
          missingPrerequisites: [],
          prerequisiteException: {
            acknowledged: true,
            reason: "Permit review is tracked separately.",
          },
          recommendedOutcome: "review",
          reportNotes:
            "<p>Footings were observed; lender review is required for location.</p>",
          token: scheduled.visitId,
        },
      ),
    ).rejects.toThrow("Site visit token is not active.");
    const afterRetry = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(afterRetry.posts).toHaveLength(afterCancellationRetry.posts.length);
    expect(afterRetry.references).toHaveLength(
      afterCancellationRetry.references.length,
    );
    expect(afterRetry.deliveries).toHaveLength(
      afterCancellationRetry.deliveries.length,
    );
    expect(afterRetry.actionItems).toHaveLength(
      afterCancellationRetry.actionItems.length,
    );
  });

  test("publishes material Milestone transitions and keeps blocked work duplicate-safe", async () => {
    const fixture = await seedOperationalBuild();
    const submission = {
      actualStartedAt: Date.now() - 86_400_000,
      buildId: fixture.buildId,
      completedDay: 20,
      idempotencyKey: "foundation-completion-v1",
      milestoneKey: "foundation",
      note: "Foundation work is ready for lender review.",
      workosOrganizationId: ORGANIZATION_ID,
    };

    await fixture.admin.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      submission,
    );
    await fixture.admin.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      submission,
    );
    let snapshot = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(snapshot.posts).toHaveLength(1);
    expect(snapshot.posts[0]).toMatchObject({ postType: "update" });

    await fixture.admin.mutation(
      (api as any).production_proposals.requestActiveBuildMilestoneInfo,
      {
        buildId: fixture.buildId,
        milestoneKey: "foundation",
        note: "Upload the engineer-sealed footing report.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    await fixture.admin.mutation(
      (api as any).production_proposals.requestActiveBuildMilestoneInfo,
      {
        buildId: fixture.buildId,
        milestoneKey: "foundation",
        note: "Internal wording correction only.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    snapshot = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(snapshot.posts).toHaveLength(2);
    expect(snapshot.actionItems).toHaveLength(1);
    expect(snapshot.actionItems[0]).toMatchObject({
      dueDatePolicyKey: "milestone-review-blocked",
      primaryReferenceKind: "milestone",
      workKind: "evidence",
    });

    await fixture.admin.mutation(
      (api as any).production_proposals.rejectActiveBuildMilestone,
      {
        buildId: fixture.buildId,
        milestoneKey: "foundation",
        note: "The sealed report is still missing.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    await fixture.admin.mutation(
      (api as any).production_proposals.rejectActiveBuildMilestone,
      {
        buildId: fixture.buildId,
        milestoneKey: "foundation",
        note: "Internal rejection note correction.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    await fixture.admin.mutation(
      (api as any).production_proposals.approveActiveBuildMilestone,
      {
        buildId: fixture.buildId,
        milestoneKey: "foundation",
        note: "Engineer seal verified.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    await fixture.admin.mutation(
      (api as any).production_proposals.approveActiveBuildMilestone,
      {
        buildId: fixture.buildId,
        milestoneKey: "foundation",
        note: "Internal approval note correction.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    snapshot = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(snapshot.posts).toHaveLength(4);
    expect(snapshot.actionItems).toHaveLength(1);
    expect(snapshot.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: String(fixture.milestoneId),
          entityKind: "milestone",
          primary: true,
        }),
      ]),
    );
    expect(await feedKinds(fixture.contractor, fixture.buildId)).toEqual([
      "restricted",
      "restricted",
      "restricted",
      "restricted",
    ]);
    expect(await feedKinds(fixture.homeowner, fixture.buildId)).toEqual([
      "restricted",
      "restricted",
      "restricted",
      "restricted",
    ]);
    const persistedMilestone = await fixture.base.run((ctx) =>
      ctx.db.get(fixture.milestoneId),
    );
    expect(persistedMilestone).toMatchObject({
      collaborationEventRevision: 4,
      status: "complete",
    });
  });

  test("publishes governing Document versions, suppresses support noise, and enforces operation binding", async () => {
    const fixture = await seedOperationalBuild();
    const addDocument = (input: {
      clientOperationId: string;
      documentType: "permit" | "budget" | "plan" | "supporting";
      fileName: string;
      supersedesDocumentId?: any;
    }) =>
      fixture.admin.mutation(
        (api as any).production_proposals.addActiveBuildDocument,
        {
          buildId: fixture.buildId,
          mimeType: "application/pdf",
          sizeBytes: 1024,
          workosOrganizationId: ORGANIZATION_ID,
          ...input,
        },
      );

    await addDocument({
      clientOperationId: "supporting-document-v1",
      documentType: "supporting",
      fileName: "Daily site notes.pdf",
    });
    expect(
      (await collaborationSnapshot(fixture.base, String(fixture.buildId)))
        .posts,
    ).toHaveLength(0);

    const permitOperation = {
      clientOperationId: "permit-document-v1",
      documentType: "permit" as const,
      fileName: "Building permit v1.pdf",
    };
    await addDocument(permitOperation);
    await addDocument(permitOperation);
    await expect(
      addDocument({
        ...permitOperation,
        fileName: "Different permit.pdf",
      }),
    ).rejects.toThrow(/operation ID was already used for different content/i);

    const documentsAfterV1 = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("buildDocuments")
        .withIndex("by_build", (query) => query.eq("buildId", fixture.buildId))
        .collect(),
    );
    const permitV1 = documentsAfterV1.find(
      (document) => document.documentType === "permit",
    );
    expect(permitV1).toMatchObject({ status: "uploaded", version: 1 });
    await expect(
      addDocument({
        clientOperationId: "permit-document-v2-without-lineage",
        documentType: "permit",
        fileName: "Building permit v2.pdf",
      }),
    ).rejects.toThrow(/select the current governing Document/i);

    await addDocument({
      clientOperationId: "permit-document-v2",
      documentType: "permit",
      fileName: "Building permit v2.pdf",
      supersedesDocumentId: permitV1!._id,
    });
    await addDocument({
      clientOperationId: "plan-document-v1",
      documentType: "plan",
      fileName: "Issued construction plan.pdf",
    });
    await expect(
      fixture.builderStaff.mutation(
        (api as any).production_proposals.addActiveBuildDocument,
        {
          buildId: fixture.buildId,
          clientOperationId: "builder-staff-plan",
          documentType: "plan",
          fileName: "Unauthorized plan.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
          workosOrganizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow(/Forbidden|role|permission/i);

    const documents = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("buildDocuments")
        .withIndex("by_build", (query) => query.eq("buildId", fixture.buildId))
        .collect(),
    );
    const permitV2 = documents.find(
      (document) => document.clientOperationId === "permit-document-v2",
    );
    expect(
      permitV1 && documents.find((row) => row._id === permitV1._id),
    ).toMatchObject({
      status: "superseded",
      supersededByDocumentId: permitV2?._id,
      version: 1,
    });
    expect(permitV2).toMatchObject({
      status: "uploaded",
      supersedesDocumentId: permitV1?._id,
      version: 2,
    });
    const snapshot = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(snapshot.posts).toHaveLength(3);
    expect(snapshot.references).toHaveLength(4);
    expect(await feedKinds(fixture.contractor, fixture.buildId)).toEqual([
      "restricted",
      "post",
      "post",
    ]);
    expect(await feedKinds(fixture.homeowner, fixture.buildId)).toEqual([
      "restricted",
      "restricted",
      "restricted",
    ]);
  });

  test("publishes Draw submission, return, approval, and release only to financial readers", async () => {
    const fixture = await seedOperationalBuild();
    const permittedBuilderStaff = withIdentity(
      fixture.base,
      "builder-staff",
      "user_builder_staff_draw_view",
    );
    await fixture.base.mutation(
      (internal as any).workosProjection.ingestWorkosEvent,
      {
        data: {
          email: "user_builder_staff_draw_view@example.com",
          email_verified: true,
          first_name: "Draw-view",
          id: "user_builder_staff_draw_view",
          last_name: "Builder Staff",
        },
        event: "user.created",
        id: "operational_draw_view_user_created",
      },
    );
    await fixture.base.mutation(
      (internal as any).workosProjection.ingestWorkosEvent,
      {
        data: {
          id: "membership_operational_draw_view_builder_staff",
          organization_id: ORGANIZATION_ID,
          role: { slug: "builder-staff" },
          roles: [{ slug: "builder-staff" }],
          status: "active",
          user_id: "user_builder_staff_draw_view",
        },
        event: "organization_membership.created",
        id: "operational_draw_view_membership_created",
      },
    );
    const drawGrantId = await fixture.base.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("buildParticipants", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: now,
        displayNameSnapshot: "Draw-view Builder Staff",
        joinedAt: now,
        organizationId: ORGANIZATION_ID,
        participationPeriod: 1,
        role: "builder-staff",
        status: "active",
        updatedAt: now,
        validFrom: now,
        workosUserId: "user_builder_staff_draw_view",
      });
      const builderAccountLinkId = await ctx.db.insert("builderAccountLinks", {
        brokerageId: fixture.brokerageId,
        builderProfileId: fixture.builderProfileId,
        createdAt: now,
        role: "staff",
        status: "active",
        updatedAt: now,
        workosUserId: "user_builder_staff_draw_view",
      });
      const grantId = await ctx.db.insert("builderStaffPermissionGrants", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        builderAccountLinkId,
        builderProfileId: fixture.builderProfileId,
        canCreate: false,
        canDelete: false,
        canUpdate: false,
        canView: true,
        createdAt: now,
        createdByWorkosUserId: "user_admin",
        organizationId: ORGANIZATION_ID,
        resourceType: "draw",
        scope: "activeBuild",
        updatedAt: now,
        updatedByWorkosUserId: "user_admin",
        workosUserId: "user_builder_staff_draw_view",
      });
      await ctx.db.patch(fixture.milestoneId, {
        completionReview: { status: "approved" },
        evidenceState: "Approved",
        status: "complete",
      });
      return grantId;
    });
    const requestDraw = (clientOperationId: string, amountCents: number) =>
      fixture.admin.mutation(
        (api as any).production_proposals.requestActiveBuildDraw,
        {
          amountCents,
          buildId: fixture.buildId,
          clientOperationId,
          drawKey: "foundation-draw",
          note: "Completed Foundation reimbursement.",
          workosOrganizationId: ORGANIZATION_ID,
        },
      );
    const prepareForAdmin = async (drawKey: string) => {
      await fixture.admin.mutation(
        (api as any).production_proposals.startActiveBuildDrawReview,
        {
          buildId: fixture.buildId,
          drawKey,
          note: "Operations review started.",
          workosOrganizationId: ORGANIZATION_ID,
        },
      );
      await fixture.admin.mutation(
        (api as any).production_proposals.submitActiveBuildDrawForAdmin,
        {
          buildId: fixture.buildId,
          drawKey,
          note: "Ready for final lender decision.",
          workosOrganizationId: ORGANIZATION_ID,
        },
      );
    };

    const returnedDraw = await requestDraw("draw-returned-v1", 5_000_000);
    await requestDraw("draw-returned-v1", 5_000_000);
    await prepareForAdmin(returnedDraw.requestKey);
    expect(
      (await collaborationSnapshot(fixture.base, String(fixture.buildId)))
        .posts,
    ).toHaveLength(1);
    await expect(
      fixture.builderStaff.mutation(
        (api as any).production_proposals.rejectActiveBuildDraw,
        {
          buildId: fixture.buildId,
          drawKey: returnedDraw.requestKey,
          note: "Unauthorized return attempt.",
          workosOrganizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow(/Forbidden|role|permission/i);
    await fixture.admin.mutation(
      (api as any).production_proposals.rejectActiveBuildDraw,
      {
        buildId: fixture.buildId,
        drawKey: returnedDraw.requestKey,
        note: "Provide the final statutory declaration.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    await expect(
      fixture.admin.mutation(
        (api as any).production_proposals.rejectActiveBuildDraw,
        {
          buildId: fixture.buildId,
          drawKey: returnedDraw.requestKey,
          note: "Duplicate return attempt.",
          workosOrganizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow(/prepared for admin/i);

    const releasedDraw = await requestDraw("draw-released-v1", 6_000_000);
    await prepareForAdmin(releasedDraw.requestKey);
    await fixture.admin.mutation(
      (api as any).production_proposals.approveActiveBuildDraw,
      {
        buildId: fixture.buildId,
        drawKey: releasedDraw.requestKey,
        note: "Approved within lender authority.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    await fixture.admin.mutation(
      (api as any).production_proposals.releaseActiveBuildDraw,
      {
        buildId: fixture.buildId,
        drawKey: releasedDraw.requestKey,
        note: "Funds released by lender operations.",
        releaseDate: "2026-08-01",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    await expect(
      fixture.admin.mutation(
        (api as any).production_proposals.releaseActiveBuildDraw,
        {
          buildId: fixture.buildId,
          drawKey: releasedDraw.requestKey,
          note: "Duplicate release attempt.",
          releaseDate: "2026-08-01",
          workosOrganizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow(/approved for release/i);
    const terminalFeed = await fixture.admin.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 50 },
      },
    );
    const terminalDrawEntries = terminalFeed.page.filter(
      (entry: any) => entry.post.systemPost?.kind === "draw",
    );
    expect(terminalDrawEntries).toHaveLength(2);
    expect(terminalDrawEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          post: expect.objectContaining({
            systemPost: expect.objectContaining({
              lifecycle: "resolved",
              drawFacts: expect.objectContaining({
                disposition: expect.objectContaining({ kind: "final_decline" }),
                request: expect.objectContaining({
                  displayId: returnedDraw.displayId,
                  status: "rejected",
                }),
                release: expect.objectContaining({ state: "final_decline" }),
              }),
            }),
          }),
        }),
        expect.objectContaining({
          post: expect.objectContaining({
            systemPost: expect.objectContaining({
              lifecycle: "resolved",
              drawFacts: expect.objectContaining({
                disposition: expect.objectContaining({ kind: "released" }),
                request: expect.objectContaining({
                  displayId: releasedDraw.displayId,
                  status: "released",
                }),
                release: expect.objectContaining({ state: "released" }),
              }),
            }),
          }),
        }),
      ]),
    );
    await fixture.base.mutation(
      (internal as any).build_collaboration_search_maintenance
        .ensureBuildCollaborationSearchMaintenance,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    await finishSearchMaintenance(fixture.base);
    const adminDrawSearch = await fixture.admin.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        query: "Foundation reimbursement",
      },
    );
    expect(adminDrawSearch.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resultType: "post",
          postId: expect.anything(),
        }),
      ]),
    );
    const contractorDrawSearch = await fixture.contractor.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        query: "Foundation reimbursement",
      },
    );
    expect(
      contractorDrawSearch.page.filter(
        (result: any) => result.resultType === "post",
      ),
    ).toHaveLength(0);
    const snapshot = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(snapshot.posts).toHaveLength(2);
    expect(snapshot.posts.every((post: any) => post.systemPostKind === "draw")).toBe(
      true,
    );
    expect(snapshot.actionItems).toHaveLength(0);
    expect(snapshot.references).toHaveLength(2);
    expect(
      snapshot.deliveries.some(
        (delivery) =>
          delivery.href.match(/focus=draw%3A/) &&
          delivery.recipientWorkosUserId === "user_global_principal",
      ),
    ).toBe(false);
    expect(await feedKinds(fixture.builderStaff, fixture.buildId)).toEqual([
      "restricted",
      "restricted",
    ]);
    expect(await feedKinds(permittedBuilderStaff, fixture.buildId)).toEqual([
      "post",
      "post",
    ]);
    expect(await feedKinds(fixture.contractor, fixture.buildId)).toEqual([
      "restricted",
      "restricted",
    ]);
    expect(await feedKinds(fixture.homeowner, fixture.buildId)).toEqual([
      "restricted",
      "restricted",
    ]);
    expect(
      snapshot.deliveries.some(
        (delivery) => delivery.recipientWorkosUserId === "user_builder_staff",
      ),
    ).toBe(false);
    expect(
      snapshot.deliveries.some(
        (delivery) =>
          delivery.recipientWorkosUserId === "user_builder_staff_draw_view",
      ),
    ).toBe(true);

    await fixture.base.mutation(
      (internal as any).build_collaboration_delivery_maintenance
        .prepareDueBuildCollaborationExternalDeliveries,
      { asOf: Number.MAX_SAFE_INTEGER, batchSize: 100 },
    );
    const permittedOutboxIds = await fixture.base.run(async (ctx) => [
      ...new Set(
        (await ctx.db.query("buildCollaborationExternalDeliveries").collect())
          .filter(
            (delivery) =>
              delivery.recipientWorkosUserId ===
                "user_builder_staff_draw_view" &&
              delivery.providerOutboxId !== undefined,
          )
          .map((delivery) => delivery.providerOutboxId!),
      ),
    ]);
    expect(permittedOutboxIds.length).toBeGreaterThan(0);

    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(drawGrantId, {
        canView: false,
        updatedAt: Date.now(),
        updatedByWorkosUserId: "user_admin",
      });
    });
    expect(await feedKinds(permittedBuilderStaff, fixture.buildId)).toEqual([
      "restricted",
      "restricted",
    ]);
    for (const eventOutboxId of permittedOutboxIds) {
      expect(
        await fixture.base.mutation(
          (internal as any).build_collaboration_delivery_maintenance
            .prepareBuildCollaborationExternalOutbox,
          { eventOutboxId },
        ),
      ).toBeNull();
    }
    const revokedDeliveryState = await fixture.base.run(async (ctx) => ({
      deliveries: (
        await ctx.db.query("buildCollaborationExternalDeliveries").collect()
      ).filter(
        (delivery) =>
          delivery.recipientWorkosUserId ===
          "user_builder_staff_draw_view",
      ),
      outboxes: await Promise.all(
        permittedOutboxIds.map((outboxId) => ctx.db.get(outboxId)),
      ),
    }));
    expect(revokedDeliveryState.deliveries.length).toBeGreaterThan(0);
    expect(revokedDeliveryState.outboxes.length).toBeGreaterThan(0);
    expect(revokedDeliveryState.outboxes.length).toBe(
      permittedOutboxIds.length,
    );
    expect(revokedDeliveryState.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cancellationReason: "access_revoked",
          status: "cancelled",
        }),
      ]),
    );
    expect(
      revokedDeliveryState.deliveries
        .every(
          (delivery) =>
            delivery.status === "cancelled" &&
            delivery.cancellationReason === "access_revoked",
        ),
    ).toBe(true);
    for (const outbox of revokedDeliveryState.outboxes) {
      expect(outbox).toEqual(
        expect.objectContaining({
          payloadPreview: JSON.stringify({
            reason: "access_revoked",
            redacted: true,
          }),
          status: "failed",
        }),
      );
    }
  });

  test("converges scheduled and requested Draw activation without canonical side effects", async () => {
    const fixture = await seedOperationalBuild();
    const plannedDrawId = await fixture.base.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.patch(fixture.buildId, { timezone: "America/Toronto" });
      await ctx.db.patch(fixture.milestoneId, {
        completionReview: { status: "approved" },
        evidenceState: "Approved",
        status: "complete",
      });
      const proposalDrawId = await ctx.db.insert("proposalDrawScheduleRows", {
        amountCents: 5_000_000,
        brokerageId: fixture.brokerageId,
        createdAt: now,
        drawKey: "scheduled-foundation",
        label: "Foundation reimbursement",
        milestoneKey: "foundation",
        order: 1,
        organizationId: ORGANIZATION_ID,
        proposalId: fixture.proposalId,
        requestStatus: "draft",
        source: "milestone",
        timingDay: 0,
        updatedAt: now,
      });
      return await ctx.db.insert("plannedDrawScheduleRows", {
        amountCents: 5_000_000,
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        buildMilestoneId: fixture.milestoneId,
        createdAt: now,
        drawKey: "scheduled-foundation",
        label: "Foundation reimbursement",
        milestoneKey: "foundation",
        order: 1,
        organizationId: ORGANIZATION_ID,
        proposalDrawScheduleRowId: proposalDrawId,
        status: "planned",
        timingDay: 0,
        updatedAt: now,
      });
    });
    const canonicalBefore = await fixture.base.run(async (ctx) => ({
      capitalEvents: await ctx.db.query("capitalEvents").collect(),
      drawRequests: await ctx.db
        .query("activeBuildDrawRequests")
        .withIndex("by_build", (query) => query.eq("buildId", fixture.buildId))
        .collect(),
      evidenceAssets: await ctx.db
        .query("buildEvidenceAssets")
        .withIndex("by_build", (query) => query.eq("buildId", fixture.buildId))
        .collect(),
      milestones: await ctx.db
        .query("buildMilestones")
        .withIndex("by_build", (query) => query.eq("buildId", fixture.buildId))
        .collect(),
      plannedDraws: await ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build_order", (query) => query.eq("buildId", fixture.buildId))
        .collect(),
      siteVisits: await ctx.db
        .query("buildSiteVisits")
        .withIndex("by_build", (query) => query.eq("buildId", fixture.buildId))
        .collect(),
    }));
    const scheduledArgs = {
      buildId: fixture.buildId,
      plannedDrawId,
      scheduledFor: Date.now(),
    };
    await fixture.base.mutation(
      (internal as any).build_collaboration_scheduling
        .executeScheduledDrawSystemPostActivation,
      scheduledArgs,
    );
    await fixture.base.mutation(
      (internal as any).build_collaboration_scheduling
        .executeScheduledDrawSystemPostActivation,
      scheduledArgs,
    );
    const scheduledSnapshot = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(
      scheduledSnapshot.posts.filter((post) => post.systemPostKind === "draw"),
    ).toHaveLength(1);
    expect(scheduledSnapshot.actionItems).toHaveLength(0);
    const canonicalAfterSchedule = await fixture.base.run(async (ctx) => ({
      capitalEvents: await ctx.db.query("capitalEvents").collect(),
      drawRequests: await ctx.db
        .query("activeBuildDrawRequests")
        .withIndex("by_build", (query) => query.eq("buildId", fixture.buildId))
        .collect(),
      evidenceAssets: await ctx.db
        .query("buildEvidenceAssets")
        .withIndex("by_build", (query) => query.eq("buildId", fixture.buildId))
        .collect(),
      milestones: await ctx.db
        .query("buildMilestones")
        .withIndex("by_build", (query) => query.eq("buildId", fixture.buildId))
        .collect(),
      plannedDraws: await ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build_order", (query) => query.eq("buildId", fixture.buildId))
        .collect(),
      siteVisits: await ctx.db
        .query("buildSiteVisits")
        .withIndex("by_build", (query) => query.eq("buildId", fixture.buildId))
        .collect(),
    }));
    expect(canonicalAfterSchedule).toEqual(canonicalBefore);

    const firstRequest = await fixture.admin.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: 5_000_000,
        buildId: fixture.buildId,
        clientOperationId: "scheduled-draw-request-001",
        drawKey: "scheduled-foundation",
        note: "Foundation reimbursement requested.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const replayedRequest = await fixture.admin.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: 5_000_000,
        buildId: fixture.buildId,
        clientOperationId: "scheduled-draw-request-001",
        drawKey: "scheduled-foundation",
        note: "Foundation reimbursement requested.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    expect(replayedRequest).toEqual(firstRequest);
    const feed = await fixture.admin.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 50 },
      },
    );
    const drawEntry = feed.page.find(
      (entry: any) => entry.post.systemPost?.kind === "draw",
    );
    expect(drawEntry?.actionItems).toEqual([]);
    expect(drawEntry?.post.systemPost?.drawFacts).toMatchObject({
      generatedActionItems: 0,
      planned: {
        drawKey: "scheduled-foundation",
        label: "Foundation reimbursement",
      },
      request: {
        displayId: firstRequest.displayId,
        status: "requested",
      },
      review: { state: "not_started" },
      release: { state: "not_started" },
    });
    const occurrencePostId = drawEntry?.post._id;
    expect(occurrencePostId).toBeDefined();
    await fixture.admin.mutation(
      (api as any).production_proposals.startActiveBuildDrawReview,
      {
        buildId: fixture.buildId,
        drawKey: firstRequest.requestKey,
        note: "Operations review started for the scheduled occurrence.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    await fixture.admin.mutation(
      (api as any).production_proposals.submitActiveBuildDrawForAdmin,
      {
        buildId: fixture.buildId,
        drawKey: firstRequest.requestKey,
        note: "Scheduled occurrence is ready for the final lender decision.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    await fixture.admin.mutation(
      (api as any).production_proposals.approveActiveBuildDraw,
      {
        buildId: fixture.buildId,
        drawKey: firstRequest.requestKey,
        note: "Scheduled occurrence approved within lender authority.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const approvedFeed = await fixture.admin.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 50 },
      },
    );
    const approvedEntry = approvedFeed.page.find(
      (entry: any) => entry.post.systemPost?.kind === "draw",
    );
    expect(approvedEntry?.post._id).toBe(occurrencePostId);
    expect(approvedEntry?.post.systemPost).toMatchObject({
      kind: "draw",
      lifecycle: "open",
      drawFacts: {
        approval: { state: "approved" },
        request: { status: "approved_for_release" },
        release: { state: "approved_for_release" },
      },
    });
    await fixture.admin.mutation(
      (api as any).production_proposals.releaseActiveBuildDraw,
      {
        buildId: fixture.buildId,
        drawKey: firstRequest.requestKey,
        note: "Scheduled occurrence released by lender operations.",
        releaseDate: "2026-08-03",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    await fixture.base.mutation(
      (internal as any).build_collaboration_scheduling
        .executeScheduledDrawSystemPostActivation,
      scheduledArgs,
    );
    const releasedFeed = await fixture.admin.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 50 },
      },
    );
    const releasedEntry = releasedFeed.page.find(
      (entry: any) => entry.post.systemPost?.kind === "draw",
    );
    expect(releasedEntry?.post._id).toBe(occurrencePostId);
    expect(releasedEntry?.post.systemPost).toMatchObject({
      kind: "draw",
      lifecycle: "resolved",
      drawFacts: {
        disposition: { kind: "released" },
        request: { status: "released" },
        release: { state: "released" },
      },
    });
    expect(await feedKinds(fixture.contractor, fixture.buildId)).toEqual([
      "restricted",
    ]);
    expect(await feedKinds(fixture.homeowner, fixture.buildId)).toEqual([
      "restricted",
    ]);
  });

  test("projects withdrawal and administrative cancellation as distinct terminal Draw dispositions", async () => {
    const prepareFixture = async () => {
      const fixture = await seedOperationalBuild();
      await fixture.base.run(async (ctx) => {
        await ctx.db.patch(fixture.milestoneId, {
          completionReview: { status: "approved" },
          evidenceState: "Approved",
          status: "complete",
        });
      });
      return fixture;
    };
    const withdrawnFixture = await prepareFixture();
    const withdrawn = await withdrawnFixture.admin.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: 5_000_000,
        buildId: withdrawnFixture.buildId,
        clientOperationId: "withdrawal-terminal-001",
        drawKey: "withdrawal-draw",
        note: "Temporary reimbursement request.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    await withdrawnFixture.admin.mutation(
      (api as any).production_proposals.withdrawActiveBuildDraw,
      {
        buildId: withdrawnFixture.buildId,
        drawKey: withdrawn.requestKey,
        note: "Builder withdrew the reimbursement request.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const withdrawnFeed = await withdrawnFixture.admin.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId: withdrawnFixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 50 },
      },
    );
    expect(withdrawnFeed.page[0]?.post.systemPost).toMatchObject({
      kind: "draw",
      lifecycle: "resolved",
      drawFacts: {
        disposition: { kind: "withdrawal" },
        request: { status: "withdrawn" },
        release: { state: "withdrawn" },
      },
    });

    const cancelledFixture = await prepareFixture();
    const cancelled = await cancelledFixture.admin.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: 5_000_000,
        buildId: cancelledFixture.buildId,
        clientOperationId: "cancellation-terminal-001",
        drawKey: "cancellation-draw",
        note: "Reimbursement request awaiting final scope.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    await cancelledFixture.admin.mutation(
      (api as any).production_proposals.cancelActiveBuildDraw,
      {
        buildId: cancelledFixture.buildId,
        drawKey: cancelled.requestKey,
        note: "Lender cancelled the request after scope reconciliation.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const cancelledFeed = await cancelledFixture.admin.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId: cancelledFixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 50 },
      },
    );
    expect(cancelledFeed.page[0]?.post.systemPost).toMatchObject({
      kind: "draw",
      lifecycle: "resolved",
      drawFacts: {
        disposition: { kind: "cancellation" },
        request: { status: "cancelled" },
        release: { state: "cancelled" },
      },
    });
    await expect(
      cancelledFixture.admin.mutation(
        (api as any).production_proposals.cancelActiveBuildDraw,
        {
          buildId: cancelledFixture.buildId,
          drawKey: cancelled.requestKey,
          note: "Duplicate cancellation.",
          workosOrganizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow(/open Draw request/i);
  });

  test("rolls the authoritative operation back when collaboration publication violates tenant scope", async () => {
    const fixture = await seedOperationalBuild();
    await fixture.base.run(async (ctx) => {
      const now = Date.now();
      const wrongBrokerageId = await ctx.db.insert("brokerages", {
        createdAt: now,
        displayName: "Wrong brokerage",
        legalName: "Wrong brokerage Inc.",
        status: "active",
        updatedAt: now,
        workosOrganizationId: "org_wrong_brokerage",
      });
      const setting = await ctx.db
        .query("buildCollaborationTenantSettings")
        .withIndex("by_organizationId", (query) =>
          query.eq("organizationId", ORGANIZATION_ID),
        )
        .unique();
      await ctx.db.patch(setting!._id, { brokerageId: wrongBrokerageId });
    });

    await expect(
      fixture.admin.mutation(
        (api as any).production_proposals.addActiveBuildDocument,
        {
          buildId: fixture.buildId,
          clientOperationId: "tenant-rollback-permit",
          documentType: "permit",
          fileName: "Must roll back.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
          workosOrganizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow(/tenant scope/i);

    const state = await fixture.base.run(async (ctx) => ({
      auditCount: (await ctx.db.query("auditEvents").collect()).filter(
        (event) =>
          event.organizationId === ORGANIZATION_ID &&
          event.command === "addActiveBuildDocument",
      ).length,
      documentCount: (
        await ctx.db
          .query("buildDocuments")
          .withIndex("by_build", (query) =>
            query.eq("buildId", fixture.buildId),
          )
          .collect()
      ).length,
    }));
    expect(state).toEqual({ auditCount: 0, documentCount: 0 });
    expect(
      (await collaborationSnapshot(fixture.base, String(fixture.buildId)))
        .posts,
    ).toHaveLength(0);
  });

  test("replays deterministic system events, rolls invalid references back, and skips inactive tenants", async () => {
    const fixture = await seedOperationalBuild();
    const event = {
      buildId: fixture.buildId,
      idempotencyKey: "operational:test:deterministic-replay",
      organizationId: ORGANIZATION_ID,
      plainText: "Deterministic operational event.",
      postType: "issue" as const,
      primaryReferenceId: fixture.milestoneId,
      primaryReferenceKind: "milestone" as const,
      remediation: {
        description: "Resolve the deterministic operational exception.",
        policyKey: "deterministic-test",
        title: "Resolve deterministic exception",
        workKind: "evidence" as const,
      },
      systemLabel: "DrawFlow Operations",
    };
    const firstPostId = await fixture.admin.mutation(
      (internal as any).build_collaboration_system_events
        .publishBuildCollaborationSystemEvent,
      event,
    );
    const afterFirst = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    const replayPostId = await fixture.admin.mutation(
      (internal as any).build_collaboration_system_events
        .publishBuildCollaborationSystemEvent,
      event,
    );
    const afterReplay = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(replayPostId).toBe(firstPostId);
    expect(afterReplay.posts).toHaveLength(afterFirst.posts.length);
    expect(afterReplay.references).toHaveLength(afterFirst.references.length);
    expect(afterReplay.deliveries).toHaveLength(afterFirst.deliveries.length);
    expect(afterReplay.actionItems).toHaveLength(afterFirst.actionItems.length);

    await expect(
      fixture.admin.mutation(
        (internal as any).build_collaboration_system_events
          .publishBuildCollaborationSystemEvent,
        {
          buildId: fixture.buildId,
          idempotencyKey: "operational:test:invalid-reference",
          organizationId: ORGANIZATION_ID,
          plainText: "This event must roll back.",
          postType: "update",
          primaryReferenceId: "missing-site-visit",
          primaryReferenceKind: "siteVisit",
          systemLabel: "DrawFlow Operations",
        },
      ),
    ).rejects.toThrow();
    const afterRollback = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(afterRollback.posts).toHaveLength(afterReplay.posts.length);
    expect(afterRollback.references).toHaveLength(
      afterReplay.references.length,
    );
    expect(afterRollback.deliveries).toHaveLength(
      afterReplay.deliveries.length,
    );
    expect(afterRollback.actionItems).toHaveLength(
      afterReplay.actionItems.length,
    );

    const inactive = await seedOperationalBuild({ collaborationActive: false });
    await inactive.admin.mutation(
      (api as any).production_proposals.createActiveBuildTimelineEvidenceAsset,
      {
        asset: {
          evidenceKey: "inactive-tenant-evidence",
          fileName: "inactive-tenant-evidence.pdf",
          label: "Inactive tenant Evidence",
          locationVerified: false,
          milestoneKey: "foundation",
          mimeType: "application/pdf",
          sizeBytes: 1000,
          tag: "Foundation",
        },
        buildId: inactive.buildId,
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const inactiveSnapshot = await collaborationSnapshot(
      inactive.base,
      String(inactive.buildId),
    );
    expect(inactiveSnapshot.posts).toHaveLength(0);
    expect(inactiveSnapshot.references).toHaveLength(0);
    expect(inactiveSnapshot.deliveries).toHaveLength(0);
    expect(inactiveSnapshot.actionItems).toHaveLength(0);
    const inactiveAsset = await inactive.base.run(async (ctx) =>
      ctx.db
        .query("buildEvidenceAssets")
        .withIndex("by_build_key", (query) =>
          query
            .eq("buildId", inactive.buildId)
            .eq("evidenceKey", "inactive-tenant-evidence"),
        )
        .unique(),
    );
    expect(inactiveAsset).toBeTruthy();
  });

  test("rolls operational source mutations back while cutover snapshots are frozen", async () => {
    const fixture = await seedOperationalBuild();
    const rehearsalId = await fixture.base.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("buildCollaborationCutoverRehearsals", {
        beforeCutoverEpoch: 1,
        brokerageId: fixture.brokerageId,
        createdAt: now,
        organizationId: ORGANIZATION_ID,
        releaseApplicationUrl: "https://drawflow.test.fairlend.ca",
        releaseApplicationVersion: "test-release",
        releaseConvexDeployment: "test:deployment:prod",
        releaseConvexUrl: "https://test.convex.cloud",
        releaseGitCommit: "0123456789abcdef0123456789abcdef01234567",
        representativeBuildId: fixture.buildId,
        requestedByWorkosUserId: "user_admin",
        status: "capturing_before",
        updatedAt: now,
      });
    });

    await expect(
      fixture.admin.mutation(
        (api as any).production_proposals.addActiveBuildDocument,
        {
          buildId: fixture.buildId,
          clientOperationId: "frozen-rehearsal-permit",
          documentType: "permit",
          fileName: "Frozen rehearsal permit.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/temporarily frozen for a rollback rehearsal snapshot/i);

    const state = await fixture.base.run(async (ctx) => ({
      auditCount: (await ctx.db.query("auditEvents").collect()).filter(
        (event) =>
          event.organizationId === ORGANIZATION_ID &&
          event.command === "addActiveBuildDocument"
      ).length,
      documentCount: (
        await ctx.db
          .query("buildDocuments")
          .withIndex("by_build", (query) =>
            query.eq("buildId", fixture.buildId)
          )
          .collect()
      ).length,
    }));
    expect(state).toEqual({ auditCount: 0, documentCount: 0 });
    expect(
      (await collaborationSnapshot(fixture.base, String(fixture.buildId))).posts
    ).toHaveLength(0);

    await fixture.base.run(async (ctx) => {
      const setting = await ctx.db
        .query("buildCollaborationTenantSettings")
        .withIndex("by_organizationId", (query) =>
          query.eq("organizationId", ORGANIZATION_ID)
        )
        .unique();
      await ctx.db.patch(setting!._id, {
        status: "disabled",
        updatedAt: Date.now(),
      });
      await ctx.db.patch(rehearsalId, {
        status: "disabled_verified",
        updatedAt: Date.now(),
      });
    });
    await expect(
      fixture.admin.mutation(
        (api as any).production_proposals.addActiveBuildDocument,
        {
          buildId: fixture.buildId,
          clientOperationId: "frozen-disabled-verified-permit",
          documentType: "permit",
          fileName: "Frozen disabled-verified permit.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/temporarily frozen for a rollback rehearsal snapshot/i);
    expect(
      await fixture.base.run(async (ctx) =>
        (
          await ctx.db
            .query("buildDocuments")
            .withIndex("by_build", (query) =>
              query.eq("buildId", fixture.buildId)
            )
            .collect()
        ).length
      )
    ).toBe(0);

    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(rehearsalId, {
        status: "capturing_after",
        updatedAt: Date.now(),
      });
    });
    await expect(
      fixture.admin.mutation(
        (api as any).production_proposals.addActiveBuildDocument,
        {
          buildId: fixture.buildId,
          clientOperationId: "frozen-after-snapshot-permit",
          documentType: "permit",
          fileName: "Frozen after-snapshot permit.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/temporarily frozen for a rollback rehearsal snapshot/i);
    expect(
      await fixture.base.run(async (ctx) =>
        (
          await ctx.db
            .query("buildDocuments")
            .withIndex("by_build", (query) =>
              query.eq("buildId", fixture.buildId)
            )
            .collect()
        ).length
      )
    ).toBe(0);
  });

  test("reconciles approved planning removals without replacing cards, emits mixed-state summaries, and denies superseded commands", async () => {
    const fixture = await seedOperationalBuild();
    await fixture.base.run(async (ctx) => {
      const milestone = await ctx.db.get(fixture.milestoneId);
      if (!milestone) throw new Error("Milestone fixture is unavailable.");
      const now = Date.now();
      const proposalMilestone = await ctx.db.get(milestone.proposalMilestoneId);
      if (!proposalMilestone) {
        throw new Error("Proposal milestone fixture is unavailable.");
      }
      for (const [index, name] of ["Excavate", "Pour footings"].entries()) {
        const key = `foundation-${index + 1}`;
        const proposalSubmilestoneId = await ctx.db.insert(
          "proposalSubmilestones",
          {
            brokerageId: fixture.brokerageId,
            createdAt: now,
            key,
            milestoneKey: milestone.key,
            name,
            order: index + 1,
            organizationId: ORGANIZATION_ID,
            proposalId: fixture.proposalId,
            proposalMilestoneId: proposalMilestone._id,
            updatedAt: now,
          },
        );
        await ctx.db.insert("buildSubmilestones", {
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          buildMilestoneId: milestone._id,
          createdAt: now,
          key,
          milestoneKey: milestone.key,
          name,
          order: index + 1,
          organizationId: ORGANIZATION_ID,
          proposalSubmilestoneId,
          status: "planned",
          updatedAt: now,
        });
      }
      await ctx.db.patch(fixture.buildId, { timezone: "America/Toronto" });
    });

    await fixture.builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      {
        actualStartedAt: Date.parse("2026-08-03T12:00:00.000Z"),
        buildId: fixture.buildId,
        idempotencyKey: "eng-412-plan-start-001",
        milestoneKey: "foundation",
        source: "milestone_detail",
        startParent: true,
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    await fixture.builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      {
        actualStartedAt: Date.parse("2026-08-03T12:01:00.000Z"),
        buildId: fixture.buildId,
        idempotencyKey: "eng-412-child-start-001",
        milestoneKey: "foundation",
        source: "submilestone_detail",
        submilestoneKey: "foundation-2",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const before = await collaborationSnapshot(fixture.base, String(fixture.buildId));
    const beforeCards = before.actionItems.filter(
      (item) => item.systemMode === "generated_milestone_submilestone",
    );
    expect(beforeCards).toHaveLength(2);
    const firstCard = beforeCards.find(
      (item) => item.title === "Excavate",
    );
    expect(firstCard).toBeDefined();
    const beforeDeliveryCount = before.deliveries.length;

    await fixture.admin.mutation(
      (api as any).production_proposals.updateActiveBuildTimelineMilestone,
      {
        buildId: fixture.buildId,
        milestoneKey: "foundation",
        submilestones: [
          {
            budgetCents: 25_000_000,
            durationDays: 10,
            key: "foundation-2",
            name: "Pour footings",
            order: 2,
            startDay: 10,
          },
        ],
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const afterPlan = await collaborationSnapshot(fixture.base, String(fixture.buildId));
    const afterCards = afterPlan.actionItems.filter(
      (item) => item.systemMode === "generated_milestone_submilestone",
    );
    const supersededCard = afterCards.find((item) => item.title === "Excavate");
    expect(afterCards).toHaveLength(2);
    expect(supersededCard?._id).toBe(firstCard?._id);
    expect(supersededCard?.canonicalPlanningState).toBe("superseded");
    expect(afterPlan.deliveries).toHaveLength(beforeDeliveryCount);

    const reconciliation = await fixture.admin.query(
      (api as any).build_collaboration_planning_reconciliation
        .getActiveBuildPlanningReconciliation,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    expect(reconciliation.activation.revision).toBeLessThan(
      reconciliation.current.revision,
    );
    expect(reconciliation.diffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "changed",
          entityKey: "foundation:foundation-1",
          entityType: "submilestone",
          field: "planningState",
        }),
      ]),
    );

    const focused = await fixture.admin.query(
      (api as any).build_collaboration_focus
        .getFocusedBuildCollaborationPostContext,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: afterPlan.posts.find((post) => post.systemPostKind === "milestone")!._id,
      },
    );
    expect(focused.state).toBe("visible");
    expect(focused.entry.post.planningSummary).toMatchObject({
      counts: { in_progress: 1, superseded: 1 },
      readyForApproval: false,
    });

    const contractorReconciliation = await fixture.contractor.query(
      (api as any).build_collaboration_planning_reconciliation
        .getActiveBuildPlanningReconciliation,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    expect(contractorReconciliation.activation.snapshot.allocations).toEqual([]);
    expect(contractorReconciliation.activation.snapshot.draws).toEqual([]);
    expect(contractorReconciliation.activation.snapshot.evidenceRequirements).toEqual([]);
    expect(contractorReconciliation.diffs.every((diff: { entityType: string }) =>
      diff.entityType === "milestone" || diff.entityType === "submilestone",
    )).toBe(true);

    await expect(
      fixture.builder.mutation(
        (api as any).production_proposals.startActiveBuildMilestone,
        {
          actualStartedAt: Date.parse("2026-08-03T12:05:00.000Z"),
          buildId: fixture.buildId,
          idempotencyKey: "eng-412-superseded-start-001",
          milestoneKey: "foundation",
          source: "submilestone_detail",
          submilestoneKey: "foundation-1",
          workosOrganizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow(/removed by an approved planning revision/i);
    await expect(
      fixture.admin.mutation(
        (api as any).production_proposals.addActiveBuildSubmilestoneEvidence,
        {
          buildId: fixture.buildId,
          evidence: {
            fileName: "superseded.jpg",
            mimeType: "image/jpeg",
            requirementKey: "missing-requirement",
            sizeBytes: 100,
          },
          idempotencyKey: "eng-412-superseded-evidence-001",
          milestoneKey: "foundation",
          submilestoneKey: "foundation-1",
          workosOrganizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow(/removed by an approved planning revision/i);

    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.milestoneId, {
        planningState: "superseded",
        supersededAt: Date.now(),
      });
    });
    await expect(
      fixture.admin.mutation(
        (api as any).production_proposals.reviewActiveBuildEvidence,
        {
          accepted: true,
          buildId: fixture.buildId,
          milestoneKey: "foundation",
          workosOrganizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow(/removed by an approved planning revision/i);
  });

  test("keeps Draw coordination internal, ordinary, and independent from Draw authority", async () => {
    const fixture = await seedOperationalBuild();
    await fixture.base.mutation(
      (internal as any).workosProjection.ingestWorkosEvent,
      {
        data: {
          email: "user_broker@example.com",
          email_verified: true,
          first_name: "Broker",
          id: "user_broker",
          last_name: "Draw Coordinator",
        },
        event: "user.created",
        id: "draw_coordination_broker_user_created",
      },
    );
    await fixture.base.mutation(
      (internal as any).workosProjection.ingestWorkosEvent,
      {
        data: {
          id: "membership_draw_coordinator",
          organization_id: ORGANIZATION_ID,
          role: { slug: "broker" },
          roles: [{ slug: "broker" }],
          status: "active",
          user_id: "user_broker",
        },
        event: "organization_membership.created",
        id: "draw_coordination_broker_membership_created",
      },
    );
    const drawPostId = await fixture.base.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("buildParticipants", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: now,
        displayNameSnapshot: "External Draw viewer",
        joinedAt: now,
        organizationId: ORGANIZATION_ID,
        participationPeriod: 1,
        role: "broker",
        status: "active",
        updatedAt: now,
        validFrom: now,
        workosUserId: "user_external_draw_viewer",
      });
      const postId = await ctx.db.insert("buildCollaborationPosts", {
        acknowledgementRequired: false,
        agentDrafted: false,
        announcementProminent: false,
        audienceFloorTier: 1,
        audienceMode: "build_wide",
        authorDisplayNameSnapshot: "DrawFlow System",
        authorRolesSnapshot: ["system"],
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        commentCount: 0,
        contentState: "active",
        createdAt: now,
        lastMeaningfulActivityAt: now,
        openActionItemCount: 0,
        organizationId: ORGANIZATION_ID,
        postType: "update",
        primaryReferenceId: "draw-coordination-reference",
        primaryReferenceKind: "draw",
        readRevision: 1,
        revision: 1,
        source: "system",
        systemOccurrenceKey: "draw-coordination-occurrence",
        systemPostKind: "draw",
        threadState: "open",
        threadRevision: 0,
        updatedAt: now,
      });
      const revisionId = await ctx.db.insert(
        "buildCollaborationPostRevisions",
        {
          authorRole: "admin",
          authorWorkosUserId: "system",
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          contentHash: "draw-coordination-hash",
          createdAt: now,
          organizationId: ORGANIZATION_ID,
          plainText: "Canonical Draw facts",
          postId,
          revision: 1,
          tiptapJson: JSON.stringify({ content: [], type: "doc" }),
        },
      );
      await ctx.db.patch(postId, { currentRevisionId: revisionId });
      await ctx.db.insert("buildCollaborationFollows", {
        active: true,
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: now,
        organizationId: ORGANIZATION_ID,
        postId,
        reason: "manual",
        updatedAt: now,
        workosUserId: "user_broker",
      });
      return postId;
    });
    const drawSnapshot = async () =>
      await fixture.base.run(async (ctx) => {
        const post = await ctx.db.get(drawPostId);
        if (!post) return null;
        return {
          activationReason: post.activationReason,
          canonicalBuildDrawOccurrenceKey:
            post.canonicalBuildDrawOccurrenceKey,
          canonicalBuildMilestoneId: post.canonicalBuildMilestoneId,
          currentPlanningRevision: post.currentPlanningRevision,
          primaryReferenceId: post.primaryReferenceId,
          primaryReferenceKind: post.primaryReferenceKind,
          systemEventKey: post.systemEventKey,
          systemLifecycle: post.systemLifecycle,
          systemOccurrenceKey: post.systemOccurrenceKey,
          systemPostKind: post.systemPostKind,
          triggeredAt: post.triggeredAt,
          triggeredByRole: post.triggeredByRole,
          triggeredByWorkosUserId: post.triggeredByWorkosUserId,
        };
      });
    const before = await drawSnapshot();
    const itemId = await fixture.broker.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        descriptionPlainText: "Coordinate Draw evidence follow-up",
        descriptionTiptapJson: JSON.stringify({ content: [], type: "doc" }),
        organizationId: ORGANIZATION_ID,
        postId: drawPostId,
        references: [],
        title: "Coordinate Draw evidence follow-up",
        workKind: "ordinary",
      },
    );
    const ordinary = await fixture.base.run(async (ctx) =>
      ctx.db.get(itemId),
    );
    expect((ordinary as any)?.systemMode).toBeUndefined();
    const assigned = await fixture.broker.mutation(
      (api as any).build_action_item_workflow.assignBuildActionItem,
      {
        actionItemId: itemId,
        assigneeWorkosUserId: "user_broker",
        buildId: fixture.buildId,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(assigned).toBe(itemId);
    await fixture.broker.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId: itemId,
        buildId: fixture.buildId,
        expectedRevision: 2,
        nextStatus: "in_progress",
        organizationId: ORGANIZATION_ID,
      },
    );
    await fixture.broker.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId: itemId,
        buildId: fixture.buildId,
        expectedRevision: 3,
        nextStatus: "done",
        organizationId: ORGANIZATION_ID,
      },
    );
    const afterLifecycle = await drawSnapshot();
    expect(afterLifecycle).toEqual(before);
    await fixture.broker.mutation(
      (api as any).build_draw_coordination.joinDrawCoordination,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: drawPostId,
      },
    );
    const joined = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("buildCollaborationFollows")
        .withIndex("by_postId_and_workosUserId", (query) =>
          query.eq("postId", drawPostId).eq("workosUserId", "user_broker"),
        )
        .unique(),
    );
    expect(joined?.active).toBe(true);
    expect(joined?.coordinationActive).toBe(true);
    await fixture.broker.mutation(
      (api as any).build_draw_coordination.leaveDrawCoordination,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: drawPostId,
      },
    );
    const left = await fixture.base.run(async (ctx) =>
      ctx.db.get(joined!._id),
    );
    expect(left?.active).toBe(true);
    expect(left?.coordinationActive).toBe(false);
    const external = withIdentity(
      fixture.base,
      "broker",
      "user_external_draw_viewer",
    );
    const externalFeed = await external.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      },
    );
    expect(externalFeed.page[0]?.kind).toBe("post");
    expect(externalFeed.page[0]?.actionItems).toEqual([]);
    expect(externalFeed.page[0]?.attachments).toEqual([]);
    expect(externalFeed.page[0]?.acknowledgement).toEqual({
      acknowledged: false,
      required: false,
    });
    expect(externalFeed.page[0]?.pins).toEqual([]);
    expect(externalFeed.page[0]?.references).toEqual([]);
    expect(externalFeed.page[0]?.reactions).toEqual([]);
    expect(externalFeed.page[0]?.receipts).toEqual([]);
    expect(externalFeed.page[0]?.post.commentCount).toBe(0);
    expect(externalFeed.page[0]?.post.systemPost.drawCoordination).toBeUndefined();
    await expect(
      external.mutation(
        (api as any).build_draw_coordination.joinDrawCoordination,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: drawPostId,
        },
      ),
    ).rejects.toThrow(/Draw coordination|Forbidden/i);
    const adminState = await fixture.globalAdmin.query(
      (api as any).build_draw_coordination.getDrawCoordinationState,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: drawPostId,
      },
    );
    expect(adminState.joined).toBe(false);
    expect(adminState.oversight).toBe(true);
    expect(adminState.canJoin).toBe(false);
    expect(adminState.canLeave).toBe(false);
    const principalState = await fixture.globalPrincipal.query(
      (api as any).build_draw_coordination.getDrawCoordinationState,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: drawPostId,
      },
    );
    expect(principalState.joined).toBe(false);
    expect(principalState.oversight).toBe(true);
    expect(principalState.canJoin).toBe(false);
    expect(principalState.canLeave).toBe(false);
    const beforeOversightMutation = await silentBackfillSideEffectSnapshot(
      fixture.base,
      fixture.buildId,
    );
    for (const oversight of [fixture.globalAdmin, fixture.globalPrincipal]) {
      await expect(
        oversight.mutation(
          (api as any).build_draw_coordination.joinDrawCoordination,
          {
            buildId: fixture.buildId,
            organizationId: ORGANIZATION_ID,
            postId: drawPostId,
          },
        ),
      ).rejects.toThrow(/oversight|Forbidden/i);
      await expect(
        oversight.mutation(
          (api as any).build_draw_coordination.leaveDrawCoordination,
          {
            buildId: fixture.buildId,
            organizationId: ORGANIZATION_ID,
            postId: drawPostId,
          },
        ),
      ).rejects.toThrow(/oversight|Forbidden/i);
    }
    const afterOversightMutation = await silentBackfillSideEffectSnapshot(
      fixture.base,
      fixture.buildId,
    );
    expect(afterOversightMutation.followIds).toEqual(
      beforeOversightMutation.followIds,
    );
    expect(afterOversightMutation.deliveryIds).toEqual(
      beforeOversightMutation.deliveryIds,
    );
    await fixture.base.run(async (ctx) => {
      const existingState = await ctx.db
        .query("buildCollaborationBuildStates")
        .withIndex("by_buildId", (query) => query.eq("buildId", fixture.buildId))
        .order("desc")
        .first();
      if (existingState) {
        await ctx.db.patch(existingState._id, {
          state: "closed",
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("buildCollaborationBuildStates", {
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          contentRevision: 0,
          createdAt: Date.now(),
          organizationId: ORGANIZATION_ID,
          revision: 0,
          state: "closed",
          updatedAt: Date.now(),
        });
      }
    });
    await expect(
      fixture.broker.mutation(
        (api as any).build_draw_coordination.joinDrawCoordination,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: drawPostId,
        },
      ),
    ).rejects.toThrow(/read-only|closed/i);
  });
});
