/// <reference types="vite/client" />

import workpoolTest from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import { hasCurrentBuildInvolvement } from "./build_draw_coordination";
import { resolveCanonicalMilestoneExecutionOwnership } from "./build_collaboration_system_event_access";
import schema from "./schema";
import type { Id } from "./types";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_build_collaboration_operational_events";

afterEach(() => {
  vi.useRealTimers();
});

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
  workpoolTest.register(base, "buildCollaborationSearchWorkpool");
  const admin = withIdentity(base, "admin", "user_admin");
  const foundation = await admin.mutation(
    (internal as any).production_proposals.dev_seedProductionFoundation,
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
      { displayName: "Builder", role: "builder", subject: "user_builder" },
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

async function readPlanningPages(
  viewer: any,
  reference: any,
  args: { buildId: string; organizationId: string },
) {
  const rows: any[] = [];
  let cursor: string | null = null;
  let page: any;
  do {
    page = await viewer.query(reference, {
      ...args,
      paginationOpts: { cursor, numItems: 100 },
    });
    rows.push(...page.page);
    cursor = page.continueCursor;
  } while (!page.isDone);
  return { page, rows };
}

function planningSnapshotFromRows(buildId: string, rows: any[]) {
  const snapshot = {
    allocations: [] as any[],
    budgets: [] as any[],
    buildId,
    draws: [] as any[],
    evidenceRequirements: [] as any[],
    milestones: [] as any[],
    submilestones: [] as any[],
  };
  for (const row of rows) {
    const target =
      row.entityType === "milestone"
        ? snapshot.milestones
        : row.entityType === "submilestone"
          ? snapshot.submilestones
          : row.entityType === "draw"
            ? snapshot.draws
            : row.entityType === "budget"
              ? snapshot.budgets
              : row.entityType === "allocation"
                ? snapshot.allocations
                : row.entityType === "evidenceRequirement"
                  ? snapshot.evidenceRequirements
                  : undefined;
    target?.push(row);
  }
  return snapshot;
}

async function planningReconciliation(viewer: any, buildId: string) {
  const args = { buildId, organizationId: ORGANIZATION_ID };
  const planning = await viewer.query(
    (api as any).build_collaboration_planning_reconciliation
      .getActiveBuildPlanningReconciliation,
    args,
  );
  const module = (api as any).build_collaboration_planning_reconciliation;
  const [activation, current, diffs] = await Promise.all([
    readPlanningPages(
      viewer,
      module.getActiveBuildPlanningActivationSnapshot,
      args,
    ),
    readPlanningPages(
      viewer,
      module.getActiveBuildPlanningReconciliationSnapshot,
      args,
    ),
    readPlanningPages(
      viewer,
      module.listActiveBuildPlanningReconciliationDiffs,
      args,
    ),
  ]);
  return {
    ...planning,
    activation: planning.activation
      ? {
          ...planning.activation,
          snapshot: planningSnapshotFromRows(buildId, activation.rows),
        }
      : null,
    current: {
      revision: planning.current.revision,
      snapshot: planningSnapshotFromRows(buildId, current.rows),
    },
    diffs: diffs.rows,
    diffPagesPending: false,
    diffsTruncated: diffs.page.diffsTruncated,
    materializationPending:
      planning.materializationPending ||
      activation.page.materializationPending ||
      current.page.materializationPending ||
      diffs.page.materializationPending,
  };
}

async function silentBackfillSideEffectSnapshot(
  base: ReturnType<typeof convexTest>,
  buildId: string,
) {
  return await base.run(async (ctx) => {
    const actionItems = (
      await ctx.db.query("buildActionItems").collect()
    ).filter((row) => String(row.buildId) === buildId);
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
      actionItemEventIds: (
        await ctx.db.query("buildActionItemEvents").collect()
      )
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
    const next = await t.run(async (ctx: any) => {
      const jobs = await ctx.db.query("buildCollaborationSearchJobs").collect();
      const job =
        jobs.find((candidate: any) => candidate.status === "queued") ??
        jobs.find((candidate: any) => candidate.status === "running") ??
        jobs.find((candidate: any) => candidate.status === "failed");
      const state = job
        ? await ctx.db
            .query("buildCollaborationSearchStates")
            .withIndex("by_buildId", (query: any) =>
              query.eq("buildId", job.buildId),
            )
            .unique()
        : null;
      return state && job
        ? {
            buildId: job.buildId,
            drainToken: state.drainToken ?? 0,
            jobAttemptVersion: job.attemptVersion ?? 0,
            jobId: job._id,
          }
        : null;
    });
    if (!next) {
      return;
    }
    await t.mutation(
      (internal as any).build_collaboration_search_maintenance
        .processBuildCollaborationSearchDrain,
      next,
    );
  }
  throw new Error(
    "Draw search maintenance did not drain within the test bound.",
  );
}

async function createCompanionCutoverMilestone(
  fixture: Awaited<ReturnType<typeof seedOperationalBuild>>,
  milestoneKey = "companion-cutover",
) {
  await fixture.admin.mutation(
    (api as any).production_proposals.createActiveBuildTimelineMilestone,
    {
      buildId: fixture.buildId,
      milestone: {
        budgetCents: 9_000_000,
        dayEnd: 30,
        dayStart: 21,
        dependencyKeys: [],
        durationDays: 9,
        evidenceState: "",
        milestoneKey,
        name: "Companion cutover",
        order: 2,
        policyState: "",
        status: "planned",
        submilestones: [
          {
            budgetCents: 9_000_000,
            durationDays: 9,
            key: `${milestoneKey}-child`,
            name: "Cutover child",
            order: 1,
            startDay: 0,
          },
        ],
        x: 21,
      },
      workosOrganizationId: ORGANIZATION_ID,
    },
  );
  return await fixture.base.run(async (ctx) => {
    const milestone = await ctx.db
      .query("buildMilestones")
      .withIndex("by_build_key", (query) =>
        query.eq("buildId", fixture.buildId).eq("key", milestoneKey),
      )
      .unique();
    if (!milestone) throw new Error("Cutover Milestone fixture is missing.");
    const submilestone = await ctx.db
      .query("buildSubmilestones")
      .withIndex("by_milestone", (query) =>
        query.eq("buildMilestoneId", milestone._id),
      )
      .unique();
    if (!submilestone)
      throw new Error("Cutover Sub-milestone fixture is missing.");
    const companion = await ctx.db
      .query("buildActionItems")
      .withIndex("by_canonicalBuildSubmilestoneId_and_systemMode", (query) =>
        query
          .eq("canonicalBuildSubmilestoneId", submilestone._id)
          .eq("systemMode", "generated_milestone_submilestone"),
      )
      .unique();
    if (!companion) throw new Error("Cutover companion fixture is missing.");
    return { companion, milestone, submilestone };
  });
}

async function runCompanionCutover(
  fixture: Awaited<ReturnType<typeof seedOperationalBuild>>,
  planToken: string,
) {
  let run = await fixture.admin.mutation(
    (api as any).build_submilestone_companion_cutover
      .startBuildSubmilestoneCompanionCutover,
    {
      batchSize: 1,
      buildId: fixture.buildId,
      organizationId: ORGANIZATION_ID,
      planToken,
    },
  );
  for (
    let guard = 0;
    run.status !== "complete" && run.status !== "blocked";
    guard += 1
  ) {
    expect(guard).toBeLessThan(30);
    run = await fixture.admin.mutation(
      (api as any).build_submilestone_companion_cutover
        .advanceBuildSubmilestoneCompanionCutover,
      {
        buildId: fixture.buildId,
        maxItems: 1,
        organizationId: ORGANIZATION_ID,
        runId: run.runId,
      },
    );
  }
  return run;
}

describe("Build Collaboration operational events", () => {
  test("backfill preview is read-only and validate mode never materializes posts", async () => {
    const fixture = await seedOperationalBuild();
    const before = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
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
    expect(
      await collaborationSnapshot(fixture.base, String(fixture.buildId)),
    ).toEqual(before);
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
            unknownFacts: expect.arrayContaining([
              "start",
              "actor",
              "evidence",
            ]),
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
    expect(
      await silentBackfillSideEffectSnapshot(
        fixture.base,
        String(fixture.buildId),
      ),
    ).toEqual(sideEffectsBefore);
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
      activeOperationPosts.map(
        (entry: any) => entry.post.systemPost?.lifecycle,
      ),
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
        },
      ),
    ).resolves.toEqual({
      buildId: fixture.buildId,
      organizationId: ORGANIZATION_ID,
      role: "admin",
      roles: ["admin", "principle-broker"],
      workosUserId: "user_admin",
    });
  });

  test("fails closed when an exact Work Allocation scope exceeds the bounded assignment read", async () => {
    const fixture = await seedOperationalBuild();
    const scope = await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      const milestone = await ctx.db.get(fixture.milestoneId);
      const proposalMilestone = milestone
        ? await ctx.db.get(milestone.proposalMilestoneId)
        : null;
      const rootAssignment = await ctx.db
        .query("buildContractorAssignments")
        .withIndex("by_build", (query) => query.eq("buildId", fixture.buildId))
        .first();
      if (!(build && milestone && proposalMilestone && rootAssignment)) {
        throw new Error("Operational assignment fixture is unavailable.");
      }
      const now = Date.now();
      const proposalSubmilestoneId = await ctx.db.insert(
        "proposalSubmilestones",
        {
          brokerageId: fixture.brokerageId,
          createdAt: now,
          key: "foundation-overloaded",
          milestoneKey: milestone.key,
          name: "Overloaded assignment scope",
          order: 99,
          organizationId: ORGANIZATION_ID,
          proposalId: fixture.proposalId,
          proposalMilestoneId: proposalMilestone._id,
          updatedAt: now,
        },
      );
      const submilestoneId = await ctx.db.insert("buildSubmilestones", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        buildMilestoneId: milestone._id,
        createdAt: now,
        key: "foundation-overloaded",
        milestoneKey: milestone.key,
        name: "Overloaded assignment scope",
        order: 99,
        organizationId: ORGANIZATION_ID,
        proposalSubmilestoneId,
        status: "planned",
        updatedAt: now,
      });
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("milestoneContractorAssignments", {
          assignedAt: now + index,
          assignedByWorkosUserId: "user_admin",
          brokerageId: fixture.brokerageId,
          buildContractorAssignmentId: rootAssignment._id,
          buildId: fixture.buildId,
          buildMilestoneId: milestone._id,
          buildSubmilestoneId: submilestoneId,
          contractorId: rootAssignment.contractorId,
          createdAt: now + index,
          milestoneKey: milestone.key,
          organizationId: ORGANIZATION_ID,
          postHoc: false,
          role: "Concrete contractor",
          status: index === 100 ? "active" : "removed",
          submilestoneKey: "foundation-overloaded",
          updatedAt: now + index,
        });
      }
      return {
        build,
        milestone,
        submilestone: await ctx.db.get(submilestoneId),
      };
    });
    if (!scope.submilestone) {
      throw new Error("Overloaded submilestone fixture is unavailable.");
    }

    await expect(
      fixture.base.run((ctx) =>
        resolveCanonicalMilestoneExecutionOwnership(ctx, {
          build: scope.build,
          milestone: scope.milestone,
          submilestone: scope.submilestone!,
        }),
      ),
    ).resolves.toEqual({
      reason: "ambiguous",
      state: "assignment_required",
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
      expectedRevision: 0,
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
    expect(
      systemCards.map((item) => item.canonicalBuildSubmilestoneId),
    ).toEqual(expect.arrayContaining(submilestoneIds));
    const excavateCompanion = systemCards.find(
      (item) => item.title === "Excavate",
    );
    if (!excavateCompanion?.canonicalBuildSubmilestoneId) {
      throw new Error("Expected the Excavate canonical companion.");
    }
    await fixture.base.mutation(
      (internal as any).build_collaboration_search_maintenance
        .ensureBuildCollaborationSearchMaintenance,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    await finishSearchMaintenance(fixture.base);
    const submilestoneSearch = await fixture.admin.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        filters: { types: ["submilestone"] },
        organizationId: ORGANIZATION_ID,
        query: "Excavate",
      },
    );
    const canonicalSearchResult = submilestoneSearch.page.find(
      (candidate: any) => candidate.actionItemId === excavateCompanion._id,
    );
    expect(canonicalSearchResult).toMatchObject({
      actionItemId: excavateCompanion._id,
      entityId: excavateCompanion.canonicalBuildSubmilestoneId,
      entityKind: "submilestone",
      focusEntityId: excavateCompanion.canonicalBuildSubmilestoneId,
      focusEntityKind: "submilestone",
      id: excavateCompanion.canonicalBuildSubmilestoneId,
      resultType: "submilestone",
    });
    expect(canonicalSearchResult?.href).toContain(
      `focus=submilestone%3A${String(excavateCompanion.canonicalBuildSubmilestoneId)}&detailTab=collaboration`,
    );
    const genericActionItemSearch = await fixture.admin.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        filters: { types: ["actionItem"] },
        organizationId: ORGANIZATION_ID,
        query: "Excavate",
      },
    );
    expect(
      genericActionItemSearch.page.some(
        (candidate: any) => candidate.actionItemId === excavateCompanion._id,
      ),
    ).toBe(false);
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
    await fixture.base.run(async (ctx) => {
      const assignment = await ctx.db
        .query("milestoneContractorAssignments")
        .filter((query) => query.eq(query.field("buildId"), fixture.buildId))
        .first();
      if (!assignment) {
        throw new Error("Expected the fixture contractor assignment.");
      }
      const submilestone = await ctx.db.get(
        excavateCompanion.canonicalBuildSubmilestoneId as Id<"buildSubmilestones">
      );
      if (!submilestone) {
        throw new Error("Expected the canonical Sub-milestone.");
      }
      await ctx.db.patch(assignment._id, {
        buildSubmilestoneId:
          excavateCompanion.canonicalBuildSubmilestoneId,
        submilestoneKey: submilestone.key,
        updatedAt: Date.now(),
      });
    });
    const assignedContractorItems = await fixture.assignedContractor.query(
      (api as any).build_action_items.listBuildActionItems,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    expect(
      assignedContractorItems.some(
        (row: any) => row.item._id === excavateCompanion._id,
      ),
    ).toBe(true);
    await fixture.base.mutation(
      (internal as any).build_collaboration_search_maintenance
        .ensureBuildCollaborationSearchMaintenance,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    await finishSearchMaintenance(fixture.base);
    const contractorSearch = await fixture.assignedContractor.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        filters: { types: ["submilestone"] },
        organizationId: ORGANIZATION_ID,
        query: "Excavate",
      },
    );
    expect(contractorSearch.page).toContainEqual(
      expect.objectContaining({
        entityId: excavateCompanion.canonicalBuildSubmilestoneId,
        resultType: "submilestone",
      }),
    );
    const homeownerSearch = await fixture.homeowner.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        filters: { types: ["submilestone"] },
        organizationId: ORGANIZATION_ID,
        query: "Excavate",
      },
    );
    expect(homeownerSearch.page).toEqual([]);
    await fixture.base.run(async (ctx) => {
      const assignment = await ctx.db
        .query("milestoneContractorAssignments")
        .filter((query) =>
          query.eq(
            query.field("buildSubmilestoneId"),
            excavateCompanion.canonicalBuildSubmilestoneId,
          ),
        )
        .first();
      if (!assignment) {
        throw new Error("Expected the canonical Sub-milestone assignment.");
      }
      await ctx.db.patch(assignment._id, {
        status: "removed",
        updatedAt: Date.now(),
      });
    });
    await fixture.base.mutation(
      (internal as any).build_collaboration_search_maintenance
        .ensureBuildCollaborationSearchMaintenance,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    await finishSearchMaintenance(fixture.base);
    const revokedContractorSearch = await fixture.assignedContractor.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        filters: { types: ["submilestone"] },
        organizationId: ORGANIZATION_ID,
        query: "Excavate",
      },
    );
    expect(revokedContractorSearch.page).toEqual([]);
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
        (api as any).build_collaboration_editing
          .tombstoneBuildCollaborationPost,
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
    ).resolves.toMatchObject({
      state: "revoked",
    });
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(excavateCompanion._id, {
        canonicalBuildSubmilestoneId: undefined,
        updatedAt: Date.now(),
      });
    });
    await fixture.base.mutation(
      (internal as any).build_collaboration_search_maintenance
        .ensureBuildCollaborationSearchMaintenance,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    await finishSearchMaintenance(fixture.base);
    const invalidBindingSubmilestoneSearch = await fixture.admin.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        filters: { types: ["submilestone"] },
        organizationId: ORGANIZATION_ID,
        query: "Excavate",
      },
    );
    expect(
      invalidBindingSubmilestoneSearch.page.some(
        (candidate: any) => candidate.actionItemId === excavateCompanion._id,
      ),
    ).toBe(false);
    const invalidBindingActionItemSearch = await fixture.admin.action(
      (api as any).build_collaboration_search.searchBuildCollaboration,
      {
        buildId: fixture.buildId,
        filters: { types: ["actionItem"] },
        organizationId: ORGANIZATION_ID,
        query: "Excavate",
      },
    );
    const integrityCandidate = invalidBindingActionItemSearch.page.find(
      (candidate: any) => candidate.actionItemId === excavateCompanion._id,
    );
    expect(integrityCandidate).toMatchObject({
      focusEntityId: excavateCompanion._id,
      focusEntityKind: "actionItem",
      resultType: "actionItem",
    });
    expect(integrityCandidate?.href).toContain(
      `focus=actionItem%3A${String(excavateCompanion._id)}`,
    );
    expect(integrityCandidate?.href).not.toContain("detailTab=");
    const auditEvents = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query
            .eq("entityType", "buildCollaborationPost")
            .eq("entityId", String(systemPosts[0]!._id)),
        )
        .collect(),
    );
    expect(
      auditEvents.filter(
        (event) =>
          event.eventType === "build.collaboration.system_event.published",
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

  test("pre-materializes a silent latent Sub-milestone companion and activates it in place", async () => {
    const fixture = await seedOperationalBuild();
    const beforeSideEffects = await silentBackfillSideEffectSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    const milestone = {
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
      status: "planned" as const,
      submilestones: [
        {
          budgetCents: 10_000_000,
          durationDays: 9,
          key: "frame-walls",
          name: "Frame walls",
          order: 1,
          startDay: 0,
        },
      ],
      x: 21,
    };

    await fixture.admin.mutation(
      (api as any).production_proposals.createActiveBuildTimelineMilestone,
      {
        buildId: fixture.buildId,
        milestone,
        workosOrganizationId: ORGANIZATION_ID,
      },
    );

    const afterCreate = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    const latentPost = afterCreate.posts.find(
      (post) =>
        post.canonicalBuildMilestoneId && post.systemPostKind === "milestone",
    );
    const companion = afterCreate.actionItems.find(
      (item) => item.systemMode === "generated_milestone_submilestone",
    );
    expect(latentPost).toMatchObject({
      activationReason: "plan_activated",
      systemLifecycle: "latent",
    });
    expect(latentPost).not.toHaveProperty("triggeredAt");
    expect(latentPost).not.toHaveProperty("triggeredByRole");
    expect(latentPost).not.toHaveProperty("triggeredByWorkosUserId");
    expect(companion).toMatchObject({
      canonicalBuildMilestoneId: latentPost?.canonicalBuildMilestoneId,
      canonicalPlanningState: "active",
      status: "todo",
      systemMode: "generated_milestone_submilestone",
    });
    const submilestoneId = companion?.canonicalBuildSubmilestoneId;
    if (!(submilestoneId && companion && latentPost)) {
      throw new Error(
        "Expected the generated companion canonical Sub-milestone ID.",
      );
    }
    const {
      commentIds,
      historicalCompanionId,
      matchingMaterialId,
      unrelatedActionItemId,
    } = await fixture.base.run(async (ctx) => {
      const now = Date.now();
      const assignment = (
        await ctx.db.query("milestoneContractorAssignments").collect()
      ).find((candidate) => candidate.buildId === fixture.buildId);
      if (!assignment) {
        throw new Error("Expected the assigned Contractor fixture.");
      }
      await Promise.all([
        ctx.db.patch(assignment._id, {
          buildMilestoneId: latentPost.canonicalBuildMilestoneId,
          buildSubmilestoneId: submilestoneId,
          milestoneKey: "framing",
          submilestoneKey: "frame-walls",
          updatedAt: now,
        }),
        ctx.db.patch(submilestoneId, {
          reviewRevision: 11,
          workflowRevision: 7,
        }),
        ctx.db.patch(latentPost.canonicalBuildMilestoneId!, {
          reviewRevision: 13,
        }),
        ctx.db.patch(companion._id, { currentRevision: 17 }),
      ]);
      const siteVisitRequirementId = await ctx.db.insert(
        "buildSubmilestoneSiteVisitRequirements",
        {
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          buildMilestoneId: latentPost.canonicalBuildMilestoneId!,
          buildSubmilestoneId: submilestoneId,
          createdAt: now,
          evaluatedAt: now,
          manualRequired: false,
          manualSignals: [],
          milestoneKey: "framing",
          organizationId: ORGANIZATION_ID,
          policyRequired: false,
          policySignals: [],
          required: false,
          reviewRound: 1,
          riskRequired: false,
          riskSignals: [],
          status: "not_required",
          submilestoneKey: "frame-walls",
          updatedAt: now,
        },
      );
      await ctx.db.patch(submilestoneId, {
        evidenceReviewState: "in_review",
        reviewDecisionState: "in_review",
        siteVisitRequirementId,
      });
      const commentIds = [];
      for (let index = 0; index < 55; index += 1) {
        commentIds.push(
          await ctx.db.insert("buildActionItemComments", {
            actionItemId: companion._id,
            authorDisplayNameSnapshot: "Builder",
            authorRole: "builder",
            authorWorkosUserId: "user_builder",
            brokerageId: fixture.brokerageId,
            buildId: fixture.buildId,
            createdAt: now + index,
            organizationId: ORGANIZATION_ID,
            plainText: `Workspace comment ${index + 1}`,
            tiptapJson: JSON.stringify({ content: [], type: "doc" }),
          }),
        );
      }
      const unrelatedActionItemId = await ctx.db.insert("buildActionItems", {
        assignmentState: "unassigned",
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: now,
        creatorRole: "builder",
        creatorWorkosUserId: "user_builder",
        currentRevision: 1,
        descriptionPlainText: "Unrelated Action Item",
        descriptionTiptapJson: JSON.stringify({
          content: [],
          type: "doc",
        }),
        organizationId: ORGANIZATION_ID,
        originatingPostId: latentPost._id,
        priority: "none",
        requiresAcceptance: false,
        status: "todo",
        title: "Unrelated Action Item",
        updatedAt: now,
      });
      const historicalCompanionId = await ctx.db.insert("buildActionItems", {
        assignmentState: "unassigned",
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        canonicalBindingRevision: 16,
        canonicalBuildMilestoneId: latentPost.canonicalBuildMilestoneId,
        canonicalCompanionDisposition: "historical_duplicate",
        canonicalCompanionSurvivorId: companion._id,
        canonicalPlanningState: "active",
        createdAt: now,
        creatorRole: "builder",
        creatorWorkosUserId: "user_builder",
        currentRevision: 16,
        descriptionPlainText: "Historical duplicate companion",
        descriptionTiptapJson: JSON.stringify({
          content: [],
          type: "doc",
        }),
        historicalCanonicalBuildSubmilestoneId: submilestoneId,
        organizationId: ORGANIZATION_ID,
        originatingPostId: latentPost._id,
        priority: "none",
        requiresAcceptance: false,
        status: "cancelled",
        systemMode: "generated_milestone_submilestone",
        title: "Frame walls historical duplicate",
        updatedAt: now,
      });
      await ctx.db.insert("buildCostItems", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        buildMilestoneId: latentPost.canonicalBuildMilestoneId,
        costCents: 1_000,
        createdAt: now,
        createdByWorkosUserId: "user_builder",
        itemKey: "other-submilestone-material",
        itemType: "material",
        milestoneKey: "framing",
        organizationId: ORGANIZATION_ID,
        proposalId: fixture.proposalId,
        quantity: 1,
        relevantSubmilestoneKeys: ["other-submilestone"],
        title: "Other Sub-milestone material",
        updatedAt: now,
        updatedByWorkosUserId: "user_builder",
      });
      await ctx.db.insert("buildSubmilestoneEvidenceRequirements", {
        active: true,
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        buildMilestoneId: latentPost.canonicalBuildMilestoneId,
        buildSubmilestoneId: submilestoneId,
        createdAt: now,
        createdByWorkosUserId: "user_builder",
        description: "Progress photo from the active work area.",
        kind: "photo",
        label: "Progress photo",
        locationRequired: true,
        milestoneKey: "framing",
        organizationId: ORGANIZATION_ID,
        proposalId: fixture.proposalId,
        required: true,
        requirementKey: "progress-photo",
        revision: 1,
        submilestoneKey: "frame-walls",
        updatedAt: now,
      });
      await ctx.db.insert("buildSubmilestoneEvidenceRequirements", {
        active: true,
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        buildMilestoneId: latentPost.canonicalBuildMilestoneId,
        buildSubmilestoneId: submilestoneId,
        createdAt: now,
        createdByWorkosUserId: "user_builder",
        kind: "document",
        label: "Delivery ticket",
        locationRequired: false,
        milestoneKey: "framing",
        organizationId: ORGANIZATION_ID,
        proposalId: fixture.proposalId,
        required: false,
        requirementKey: "delivery-ticket",
        revision: 1,
        submilestoneKey: "frame-walls",
        updatedAt: now,
      });
      await ctx.db.insert("auditEvents", {
        actorRoles: ["builder"],
        actorWorkosUserId: "user_builder",
        brokerageId: fixture.brokerageId,
        command: "assignActiveBuildContractorToMilestone",
        createdAt: now + 2,
        entityId: String(fixture.buildId),
        entityType: "activeBuild",
        eventType: "active_build.contractor.milestone_assignment_created",
        newState: JSON.stringify({
          assignmentIds: [assignment._id],
          contractorId: assignment.contractorId,
          milestoneKey: "framing",
          role: assignment.role,
          status: assignment.status,
          submilestoneKeys: ["frame-walls"],
        }),
        organizationId: ORGANIZATION_ID,
        priorState: undefined,
        warnings: [],
      });
      const matchingMaterialId = await ctx.db.insert("buildCostItems", {
        brokerageId: fixture.brokerageId,
        budgetSubmilestoneKey: "frame-walls",
        buildId: fixture.buildId,
        buildMilestoneId: latentPost.canonicalBuildMilestoneId,
        costCents: 2_000,
        createdAt: now + 1,
        createdByWorkosUserId: "user_builder",
        itemKey: "frame-walls-material",
        itemType: "material",
        milestoneKey: "framing",
        organizationId: ORGANIZATION_ID,
        proposalId: fixture.proposalId,
        quantity: 2,
        relevantSubmilestoneKeys: ["frame-walls"],
        supplier: "Northstar Supply",
        budgetTreatment: "add",
        description: "Framing package",
        title: "Frame walls material",
        updatedAt: now + 1,
        updatedByWorkosUserId: "user_builder",
      });
      await ctx.db.insert("contractorProfiles", {
        brokerageId: fixture.brokerageId,
        city: "Hamilton",
        createdAt: now + 1,
        defaultPayRateCents: 32_000,
        defaultPayRateUnit: "day",
        email: "candidate@example.com",
        name: "Candidate contractor",
        onboardingStatus: "invited",
        organizationId: ORGANIZATION_ID,
        status: "active",
        trades: ["framing"],
        updatedAt: now + 1,
      });
      return {
        commentIds,
        historicalCompanionId,
        matchingMaterialId,
        unrelatedActionItemId,
      };
    });
    const builderBootstrap = await fixture.builder.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceBootstrap,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: submilestoneId,
        companionActionItemId: companion!._id,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(builderBootstrap).toMatchObject({
      build: {
        startDate: "2026-07-28",
      },
      companion: {
        actionItemId: companion._id,
        currentRevision: 17,
      },
      persona: "builder",
      revisions: {
        canonicalWorkflowRevision: 7,
        companionRevision: 17,
        parentReviewRevision: 13,
        reviewRevision: 11,
      },
      state: "visible",
      submilestone: { buildSubmilestoneId: submilestoneId },
    });
    expect(builderBootstrap).toMatchObject({
      capabilities: {
        canonical: {
          complete: { allowed: true },
          start: { allowed: true },
          updateEvidence: { allowed: false },
          updateExecution: { allowed: false },
          uploadEvidence: { allowed: false },
        },
        collaboration: {
          comment: { allowed: true },
        },
      },
    });
    expect(
      new Set([
        builderBootstrap.revisions.canonicalWorkflowRevision,
        builderBootstrap.revisions.companionRevision,
        builderBootstrap.revisions.parentReviewRevision,
        builderBootstrap.revisions.reviewRevision,
      ]).size,
    ).toBe(4);
    expect(builderBootstrap).not.toHaveProperty("comments");
    expect(builderBootstrap).not.toHaveProperty("activity");
    expect(builderBootstrap).not.toHaveProperty("revisionHistory");
    expect(builderBootstrap).not.toHaveProperty("evidenceRequirements");
    expect(builderBootstrap.materials).toMatchObject({
      equipmentCount: expect.any(Number),
      materialCount: expect.any(Number),
      totalBudgetCents: 4_000,
    });
    expect(builderBootstrap.people).toMatchObject({
      availableContractors: expect.arrayContaining([
        expect.objectContaining({
          defaultPayRateCents: 32_000,
          defaultPayRateUnit: "day",
          name: "Candidate contractor",
          onboardingStatus: "invited",
          trades: ["framing"],
        }),
        expect.objectContaining({
          name: "Assigned contractor",
          onboardingStatus: "account_linked",
          trades: ["concrete"],
        }),
      ]),
      participants: expect.arrayContaining([
        expect.objectContaining({
          displayName: "Builder",
          redacted: false,
          role: "builder",
          source: "grant",
          workosUserId: "user_builder",
        }),
      ]),
      participantsPartial: false,
    });
    expect(builderBootstrap.evidence).toMatchObject({
      requirementCount: 2,
      requirements: [
        expect.objectContaining({
          kind: "photo",
          label: "Progress photo",
          locationRequired: true,
          requirementKey: "progress-photo",
          status: "active",
        }),
        expect.objectContaining({
          kind: "document",
          label: "Delivery ticket",
          locationRequired: false,
          requirementKey: "delivery-ticket",
          status: "active",
        }),
      ],
    });
    const materialGapPage = await fixture.builder.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceCollection,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: submilestoneId,
        collection: "materials",
        limit: 1,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(materialGapPage).toMatchObject({
      collection: "materials",
      hasMore: false,
      page: [
        expect.objectContaining({
          id: matchingMaterialId,
          kind: "material",
          budgetSubmilestoneKey: "frame-walls",
          budgetTreatment: "add",
          costCents: 2_000,
          description: "Framing package",
          itemKey: "frame-walls-material",
          itemType: "material",
          milestoneKey: "framing",
          quantity: 2,
          relevantSubmilestoneKeys: ["frame-walls"],
          supplier: "Northstar Supply",
          title: "Frame walls material",
          totalCents: 4_000,
        }),
      ],
      state: "visible",
    });
    const evidenceRequirementsPage = await fixture.builder.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceCollection,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: submilestoneId,
        collection: "evidence_requirements",
        limit: 10,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(evidenceRequirementsPage).toMatchObject({
      hasMore: false,
      page: expect.arrayContaining([
        expect.objectContaining({
          kind: "photo",
          locationRequired: true,
          requirementKey: "progress-photo",
          title: "Progress photo",
        }),
        expect.objectContaining({
          kind: "document",
          locationRequired: false,
          requirementKey: "delivery-ticket",
          title: "Delivery ticket",
        }),
      ]),
      state: "visible",
    });
    const peopleHistoryPage = await fixture.builder.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceCollection,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: submilestoneId,
        collection: "people_history",
        limit: 10,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(peopleHistoryPage).toMatchObject({
      hasMore: false,
      page: [
        expect.objectContaining({
          historyType:
            "active_build.contractor.milestone_assignment_created",
          kind: "assignment_history",
          status: "active",
        }),
      ],
      state: "visible",
    });
    const commentsPageOne = await fixture.builder.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceCollection,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: submilestoneId,
        collection: "collaboration_comments",
        limit: 100,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(commentsPageOne).toMatchObject({
      canonicalWorkflowRevision: 7,
      collection: "collaboration_comments",
      companionRevision: 17,
      hasMore: true,
      nextCursor: expect.any(String),
      partial: false,
      state: "visible",
    });
    if (commentsPageOne.state !== "visible") {
      throw new Error("Expected the first collaboration collection page.");
    }
    expect(commentsPageOne.page).toHaveLength(50);
    expect(commentsPageOne.page[0]).toMatchObject({
      id: commentIds.at(-1),
      kind: "comment",
      title: "Builder",
    });
    const commentsPageTwo = await fixture.builder.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceCollection,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: submilestoneId,
        collection: "collaboration_comments",
        cursor: commentsPageOne.nextCursor,
        limit: 100,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(commentsPageTwo).toMatchObject({
      hasMore: false,
      page: expect.arrayContaining([
        expect.objectContaining({ id: commentIds[0] }),
      ]),
      partial: false,
      state: "visible",
    });
    expect(commentsPageTwo).not.toHaveProperty("nextCursor");
    if (commentsPageTwo.state === "visible") {
      expect(commentsPageTwo.page).toHaveLength(5);
    }

    // Bootstrap and offset collections expose an explicit bounded/partial
    // contract. The raw source may contain unrelated sibling materials or
    // audit rows, so exercise the pre-filter truncation signal as well as the
    // collection-specific cursor envelope.
    await fixture.base.run(async (ctx) => {
      const now = Date.now();
      const assignment = (
        await ctx.db.query("milestoneContractorAssignments").collect()
      ).find((candidate) => candidate.buildId === fixture.buildId);
      if (!assignment) {
        throw new Error("Expected the assigned Contractor fixture.");
      }
      for (let index = 0; index < 501; index += 1) {
        await ctx.db.insert("buildCostItems", {
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          buildMilestoneId: latentPost.canonicalBuildMilestoneId,
          costCents: 1,
          createdAt: now + index,
          createdByWorkosUserId: "user_builder",
          itemKey: `bounded-overflow-material-${index}`,
          itemType: "material",
          milestoneKey: "framing",
          organizationId: ORGANIZATION_ID,
          proposalId: fixture.proposalId,
          quantity: 1,
          relevantSubmilestoneKeys: ["other-submilestone"],
          title: `Bounded overflow material ${index}`,
          updatedAt: now + index,
          updatedByWorkosUserId: "user_builder",
        });
        await ctx.db.insert("auditEvents", {
          actorRoles: ["builder"],
          actorWorkosUserId: "user_builder",
          brokerageId: fixture.brokerageId,
          command: "assignActiveBuildContractorToMilestone",
          createdAt: now + index,
          entityId: String(fixture.buildId),
          entityType: "activeBuild",
          eventType:
            "active_build.contractor.milestone_assignment_updated",
          newState: JSON.stringify({
            assignmentIds: [assignment._id],
            contractorId: assignment.contractorId,
            milestoneKey: "framing",
            role: assignment.role,
            status: assignment.status,
            submilestoneKeys: ["frame-walls"],
          }),
          organizationId: ORGANIZATION_ID,
          priorState: undefined,
          warnings: [],
        });
      }
    });
    const boundedBootstrap = await fixture.builder.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceBootstrap,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: submilestoneId,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(boundedBootstrap).toMatchObject({
      materials: { partial: true },
      people: { historyCount: 501, historyPartial: true },
    });
    expect(boundedBootstrap.materials).not.toHaveProperty("equipmentCount");
    expect(boundedBootstrap.materials).not.toHaveProperty("materialCount");
    expect(boundedBootstrap.materials).not.toHaveProperty("totalBudgetCents");

    const boundedHistoryPage = await fixture.builder.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceCollection,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: submilestoneId,
        collection: "people_history",
        limit: 10,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(boundedHistoryPage).toMatchObject({
      collection: "people_history",
      hasMore: true,
      nextCursor: expect.stringMatching(
        /^ws1\|history\|people_history\|/,
      ),
      partial: true,
      state: "visible",
    });
    expect(boundedHistoryPage.page).toHaveLength(10);

    expect(commentsPageOne.nextCursor).toEqual(
      expect.stringMatching(/^ws1\|indexed\|collaboration_comments\|/),
    );
    const offsetIntoIndexed = await fixture.builder.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceCollection,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: submilestoneId,
        collection: "collaboration_comments",
        cursor: boundedHistoryPage.nextCursor,
        limit: 10,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(offsetIntoIndexed).toEqual({
      code: "WORKSPACE_CURSOR_MISMATCH",
      message: "The workspace cursor belongs to a different collection.",
      state: "integrity_error",
    });
    const indexedIntoOffset = await fixture.builder.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceCollection,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: submilestoneId,
        collection: "materials",
        cursor: commentsPageOne.nextCursor,
        limit: 10,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(indexedIntoOffset).toEqual({
      code: "WORKSPACE_CURSOR_MISMATCH",
      message: "The workspace cursor belongs to a different collection.",
      state: "integrity_error",
    });
    await expect(
      fixture.admin.query(
        (api as any).build_submilestone_workspace
          .getBuildSubmilestoneWorkspaceBootstrap,
        {
          buildId: fixture.buildId,
          buildSubmilestoneId: submilestoneId,
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).resolves.toMatchObject({
      capabilities: {
        canonical: { approveChild: { allowed: true } },
      },
      persona: "admin",
      state: "visible",
    });
    await expect(
      fixture.broker.query(
        (api as any).build_submilestone_workspace
          .getBuildSubmilestoneWorkspaceBootstrap,
        {
          buildId: fixture.buildId,
          buildSubmilestoneId: submilestoneId,
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).resolves.toMatchObject({
      capabilities: {
        review: {
          recommend: { allowed: true },
          requestChanges: { allowed: true },
        },
      },
      persona: "broker",
      state: "visible",
    });
    const assignedContractorBootstrap = await fixture.assignedContractor.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceBootstrap,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: submilestoneId,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(assignedContractorBootstrap).toMatchObject({
      capabilities: {
        canonical: {
          complete: { allowed: true },
          start: { allowed: true },
          updateExecution: { allowed: false },
        },
        collaboration: {
          comment: { allowed: true },
          toggleChecklist: { allowed: true },
        },
      },
      persona: "contractor",
      state: "visible",
    });
    expect(assignedContractorBootstrap.overview.executionOwnership).not.toHaveProperty(
      "contractorId",
    );
    expect(assignedContractorBootstrap.overview.executionOwnership).not.toHaveProperty(
      "contractorName",
    );
    expect(assignedContractorBootstrap.people.availableContractors).toEqual(
      [],
    );
    expect(
      assignedContractorBootstrap.people.participants.every(
        (participant: { redacted?: boolean }) => participant.redacted === true,
      ),
    ).toBe(true);
    expect(
      assignedContractorBootstrap.people.participants.every(
        (participant: { workosUserId?: string }) =>
          !Object.prototype.hasOwnProperty.call(participant, "workosUserId"),
      ),
    ).toBe(true);
    const contractorPeoplePage = await fixture.assignedContractor.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceCollection,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: submilestoneId,
        collection: "people_assignments",
        limit: 10,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(contractorPeoplePage.page).toEqual([
      expect.objectContaining({
        kind: "contractor_assignment",
        title: expect.any(String),
      }),
    ]);
    expect(contractorPeoplePage.page[0]).not.toHaveProperty("contractorId");
    expect(contractorPeoplePage.page[0]).not.toHaveProperty("displayName");
    expect(contractorPeoplePage.page[0]).not.toHaveProperty("email");

    // Capability projections follow the canonical lifecycle, while the
    // legacy execution mutation still supports the explicit planned -> start
    // -> complete catch-up path.
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(submilestoneId, {
        actualStartedAt: Date.parse("2026-08-03T14:00:00.000Z"),
        status: "in_progress",
        updatedAt: Date.now(),
        workflowRevision: 8,
      });
    });
    const inProgressBuilderBootstrap = await fixture.builder.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceBootstrap,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: submilestoneId,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(inProgressBuilderBootstrap).toMatchObject({
      capabilities: {
        canonical: {
          complete: { allowed: true },
          correctStart: { allowed: true },
          retractStart: { allowed: true },
          reopen: { allowed: false },
          start: { allowed: false },
          updateEvidence: { allowed: true },
          updateExecution: { allowed: true },
          uploadEvidence: { allowed: true },
        },
      },
    });
    const inProgressContractorBootstrap = await fixture.assignedContractor.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceBootstrap,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: submilestoneId,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(inProgressContractorBootstrap).toMatchObject({
      capabilities: {
        canonical: {
          complete: { allowed: true },
          updateEvidence: { allowed: true },
          updateExecution: { allowed: true },
          uploadEvidence: { allowed: true },
        },
      },
    });

    await fixture.assignedContractor.mutation(
      (api as any).production_proposals.updateActiveBuildSubmilestoneExecution,
      {
        actualCostCents: 1_234,
        buildId: fixture.buildId,
        expectedRevision: 8,
        fieldNote: "Assigned Contractor field completion note.",
        idempotencyKey: "eng-428-assigned-contractor-complete-001",
        milestoneKey: "framing",
        reason: "Assigned Contractor completed the field work.",
        status: "complete",
        submilestoneKey: "frame-walls",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const completeContractorBootstrap = await fixture.assignedContractor.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceBootstrap,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: submilestoneId,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(completeContractorBootstrap).toMatchObject({
      capabilities: {
        canonical: {
          complete: { allowed: false },
          reopen: { allowed: true },
          start: { allowed: false },
          updateEvidence: { allowed: false },
          updateExecution: { allowed: false },
          uploadEvidence: { allowed: false },
        },
      },
      execution: {
        actualStartedAt: Date.parse("2026-08-03T14:00:00.000Z"),
      },
      submilestone: { status: "complete" },
    });
    await fixture.assignedContractor.mutation(
      (api as any).production_proposals.updateActiveBuildSubmilestoneExecution,
      {
        buildId: fixture.buildId,
        expectedRevision: 9,
        idempotencyKey: "eng-428-assigned-contractor-reopen-001",
        milestoneKey: "framing",
        reason: "Assigned Contractor reopened the work for a correction.",
        status: "in_progress",
        submilestoneKey: "frame-walls",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const reopenedContractorBootstrap = await fixture.assignedContractor.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceBootstrap,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: submilestoneId,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(reopenedContractorBootstrap).toMatchObject({
      capabilities: {
        canonical: {
          complete: { allowed: true },
          reopen: { allowed: false },
          updateExecution: { allowed: true },
        },
      },
      submilestone: { status: "in_progress" },
    });
    const reopenedRevision = await fixture.base.run(async (ctx) => {
      const row = await ctx.db.get(
        submilestoneId as Id<"buildSubmilestones">,
      );
      return row?.workflowRevision ?? 0;
    });
    await expect(
      fixture.contractor.mutation(
        (api as any).production_proposals.updateActiveBuildSubmilestoneExecution,
        {
          buildId: fixture.buildId,
          expectedRevision: reopenedRevision,
          idempotencyKey: "eng-428-unassigned-contractor-complete-001",
          milestoneKey: "framing",
          reason: "Unassigned Contractor must be denied.",
          status: "complete",
          submilestoneKey: "frame-walls",
          workosOrganizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow(/assignment|required|operate|permission/i);
    await expect(
      fixture.broker.mutation(
        (api as any).production_proposals.updateActiveBuildSubmilestoneExecution,
        {
          buildId: fixture.buildId,
          expectedRevision: reopenedRevision,
          idempotencyKey: "eng-428-lender-complete-denied-001",
          milestoneKey: "framing",
          reason: "Lender review roles cannot execute Builder work.",
          status: "complete",
          submilestoneKey: "frame-walls",
          workosOrganizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow(/lender|review|operate|forbidden/i);
    await expect(
      fixture.homeowner.mutation(
        (api as any).production_proposals.updateActiveBuildSubmilestoneExecution,
        {
          buildId: fixture.buildId,
          expectedRevision: reopenedRevision,
          idempotencyKey: "eng-428-homeowner-complete-denied-001",
          milestoneKey: "framing",
          reason: "Homeowner is read-only on execution commands.",
          status: "complete",
          submilestoneKey: "frame-walls",
          workosOrganizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow(/forbidden|permission|scope/i);

    // Restore the fixture's planned state for the remainder of this
    // operational-events test, which exercises the separate canonical start
    // and planning-revision flows.
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(submilestoneId, {
        actualStartedAt: undefined,
        completedAt: undefined,
        completedByWorkosUserId: undefined,
        status: "planned",
        updatedAt: Date.now(),
        workflowRevision: 7,
      });
      await ctx.db.patch(fixture.milestoneId, {
        progressPercent: 75,
        updatedAt: Date.now(),
      });
    });
    await expect(
      fixture.builder.query(
        (api as any).build_submilestone_workspace
          .getBuildSubmilestoneWorkspaceBootstrap,
        {
          buildId: fixture.buildId,
          buildSubmilestoneId: submilestoneId,
          companionActionItemId: unrelatedActionItemId,
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).resolves.toMatchObject({
      collaboration: {
        code: "COMPANION_ID_MISMATCH",
        state: "degraded",
      },
      state: "visible",
    });
    await expect(
      fixture.builder.query(
        (api as any).build_submilestone_workspace
          .getBuildSubmilestoneWorkspaceBootstrap,
        {
          buildId: fixture.buildId,
          buildSubmilestoneId: submilestoneId,
          companionActionItemId: historicalCompanionId,
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).resolves.toMatchObject({
      companion: {
        actionItemId: companion._id,
        requestedActionItemId: historicalCompanionId,
      },
      state: "visible",
    });
    await expect(
      fixture.contractor.query(
        (api as any).build_submilestone_workspace
          .getBuildSubmilestoneWorkspaceBootstrap,
        {
          buildId: fixture.buildId,
          buildSubmilestoneId: submilestoneId,
          organizationId: ORGANIZATION_ID,
        },
      ),
    ).resolves.toEqual({ state: "revoked" });
    const homeownerBootstrap = await fixture.homeowner.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceBootstrap,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: submilestoneId,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(homeownerBootstrap).toMatchObject({
      persona: "homeowner",
      state: "visible",
      people: {
        assigned: expect.any(Number),
      },
    });
    expect(homeownerBootstrap.overview.executionOwnership).not.toHaveProperty(
      "contractorId",
    );
    expect(homeownerBootstrap.overview.executionOwnership).not.toHaveProperty(
      "contractorName",
    );
    expect(homeownerBootstrap.people.availableContractors).toEqual([]);
    expect(
      homeownerBootstrap.people.participants.every(
        (participant: { redacted?: boolean }) => participant.redacted === true,
      ),
    ).toBe(true);
    await expect(
      fixture.builder.query(
        (api as any).build_submilestone_workspace
          .getBuildSubmilestoneWorkspaceBootstrap,
        {
          buildId: fixture.buildId,
          buildSubmilestoneId: submilestoneId,
          organizationId: "org_other",
        },
      ),
    ).resolves.toEqual({ state: "revoked" });
    expect(await feedKinds(fixture.builder, fixture.buildId)).toEqual([]);
    await expect(
      fixture.builder.query(
        (api as any).build_collaboration_focus
          .getFocusedBuildCollaborationPostContext,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: latentPost!._id,
        },
      ),
    ).resolves.toEqual({ state: "revoked" });
    await expect(
      fixture.builder.query(
        (api as any).build_collaboration_resolution
          .getBuildCollaborationThreadContext,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: latentPost!._id,
        },
      ),
    ).rejects.toThrow(/Forbidden: collaboration post/);

    const afterCreateSideEffects = await silentBackfillSideEffectSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(afterCreateSideEffects.activityProjectionIds).toEqual(
      beforeSideEffects.activityProjectionIds,
    );
    expect(afterCreateSideEffects.actionItemCreationRequestIds).toEqual(
      beforeSideEffects.actionItemCreationRequestIds,
    );
    expect(afterCreateSideEffects.actionItemEventIds).toEqual(
      beforeSideEffects.actionItemEventIds,
    );
    expect(afterCreateSideEffects.actionItemRevisionIds).toEqual(
      beforeSideEffects.actionItemRevisionIds,
    );
    expect(afterCreateSideEffects.deliveryIds).toEqual(
      beforeSideEffects.deliveryIds,
    );
    expect(afterCreateSideEffects.mentionDeliveryIds).toEqual(
      beforeSideEffects.mentionDeliveryIds,
    );
    expect(afterCreateSideEffects.receiptIds).toEqual(
      beforeSideEffects.receiptIds,
    );

    await fixture.admin.mutation(
      (api as any).production_proposals.updateActiveBuildTimelineMilestone,
      {
        buildId: fixture.buildId,
        milestoneKey: "framing",
        name: "Framing",
        submilestones: milestone.submilestones,
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const afterReplay = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(afterReplay.posts).toHaveLength(afterCreate.posts.length);
    expect(
      afterReplay.actionItems.filter(
        (item) =>
          item.systemMode === "generated_milestone_submilestone" &&
          item.canonicalBuildSubmilestoneId,
      ),
    ).toHaveLength(
      afterCreate.actionItems.filter(
        (item) =>
          item.systemMode === "generated_milestone_submilestone" &&
          item.canonicalBuildSubmilestoneId,
      ).length,
    );
    expect(afterReplay.references).toHaveLength(afterCreate.references.length);

    await fixture.builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      {
        actualStartedAt: Date.parse("2026-08-03T14:00:00.000Z"),
        buildId: fixture.buildId,
        expectedRevision: 0,
        idempotencyKey: "eng-423-framing-start-001",
        milestoneKey: "framing",
        source: "milestone_detail",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const afterStart = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    const activePost = afterStart.posts.find(
      (post) => post._id === latentPost?._id,
    );
    expect(activePost).toMatchObject({
      activationReason: "explicit_start",
      systemLifecycle: "open",
      triggeredAt: expect.any(Number),
      triggeredByRole: "builder",
      triggeredByWorkosUserId: "user_builder",
    });
    expect(
      afterStart.actionItems.find((item) => item._id === companion?._id),
    ).toBeDefined();
    expect(await feedKinds(fixture.builder, fixture.buildId)).toEqual(["post"]);
    await expect(
      fixture.builder.query(
        (api as any).build_collaboration_focus
          .getFocusedBuildCollaborationPostContext,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: latentPost!._id,
        },
      ),
    ).resolves.toEqual(expect.objectContaining({ state: "visible" }));
    await expect(
      fixture.builder.query(
        (api as any).build_collaboration_resolution
          .getBuildCollaborationThreadContext,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: latentPost!._id,
        },
      ),
    ).resolves.toEqual(expect.objectContaining({ threadState: "open" }));

    await fixture.builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      {
        actualStartedAt: Date.parse("2026-08-03T14:00:00.000Z"),
        buildId: fixture.buildId,
        expectedRevision: 0,
        idempotencyKey: "eng-423-framing-start-001",
        milestoneKey: "framing",
        source: "milestone_detail",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const afterStartReplay = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(
      afterStartReplay.posts.find((post) => post._id === latentPost?._id),
    ).toMatchObject({
      revision: activePost?.revision,
      systemLifecycle: "open",
    });
    expect(afterStartReplay.deliveries).toHaveLength(
      afterStart.deliveries.length,
    );

    await fixture.admin.mutation(
      (api as any).production_proposals.updateActiveBuildTimelineMilestone,
      {
        buildId: fixture.buildId,
        milestoneKey: "framing",
        submilestones: [
          {
            budgetCents: 10_000_000,
            durationDays: 9,
            key: "roof-frame",
            name: "Frame roof",
            order: 1,
            startDay: 0,
          },
        ],
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const supersededBootstrap = await fixture.builder.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceBootstrap,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: submilestoneId,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(supersededBootstrap).toMatchObject({
      state: "superseded",
      submilestone: {
        buildSubmilestoneId: submilestoneId,
        planningState: "superseded",
      },
    });
    if (supersededBootstrap.state !== "superseded") {
      throw new Error("Expected a historical Sub-milestone workspace.");
    }
    const supersededCapabilities = supersededBootstrap.capabilities as Record<
      string,
      Record<string, { allowed: boolean; reason?: string }>
    >;
    expect(
      Object.values(supersededCapabilities).flatMap((group) =>
        Object.values(group),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          allowed: false,
          reason: "Historical Sub-milestones are read-only.",
        }),
      ]),
    );
    expect(
      Object.values(supersededCapabilities).flatMap((group) =>
        Object.values(group).map((capability) => capability.allowed),
      ),
    ).not.toContain(true);
    await fixture.admin.mutation(
      (api as any).production_proposals.updateActiveBuildTimelineMilestone,
      {
        buildId: fixture.buildId,
        milestoneKey: "framing",
        submilestones: milestone.submilestones,
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const reintroduced = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    const frameCompanions = reintroduced.actionItems.filter(
      (item) => item.title === "Frame walls",
    );
    expect(frameCompanions).toHaveLength(2);
    expect(frameCompanions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: companion?._id,
          canonicalPlanningState: "superseded",
        }),
        expect.objectContaining({ canonicalPlanningState: "active" }),
      ]),
    );
    expect(
      frameCompanions.find((item) => item.canonicalPlanningState === "active")
        ?._id,
    ).not.toBe(companion?._id);
  });

  test("keeps people history pagination stable across inserts and ignores invalid contractor IDs", async () => {
    const fixture = await seedOperationalBuild();
    const source = await createCompanionCutoverMilestone(
      fixture,
      "history-pagination",
    );
    const assignment = await fixture.base.run(async (ctx) => {
      const assignment = await ctx.db
        .query("milestoneContractorAssignments")
        .withIndex("by_build", (query) => query.eq("buildId", fixture.buildId))
        .first();
      if (!assignment) {
        throw new Error("Expected the operational Contractor assignment.");
      }
      await ctx.db.patch(assignment._id, {
        buildMilestoneId: source.milestone._id,
        buildSubmilestoneId: source.submilestone._id,
        milestoneKey: source.milestone.key,
        submilestoneKey: source.submilestone.key,
      });
      return assignment;
    });

    const eventIds = await fixture.base.run(async (ctx) => {
      const ids = [];
      for (let index = 0; index < 4; index += 1) {
        ids.push(
          await ctx.db.insert("auditEvents", {
            actorRoles: ["builder"],
            actorWorkosUserId: "user_builder",
            brokerageId: fixture.brokerageId,
            command: "assignActiveBuildContractorToMilestone",
            createdAt: 1_000 + index,
            entityId: String(fixture.buildId),
            entityType: "activeBuild",
            eventType:
              "active_build.contractor.milestone_assignment_updated",
            newState: JSON.stringify({
              assignmentIds: [assignment._id],
              contractorId: assignment.contractorId,
              milestoneKey: source.milestone.key,
              role: assignment.role,
              status: assignment.status,
              submilestoneKeys: [source.submilestone.key],
            }),
            organizationId: ORGANIZATION_ID,
            priorState: undefined,
            warnings: [],
          }),
        );
      }
      return ids;
    });

    const firstPage = await fixture.builder.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceCollection,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: source.submilestone._id,
        collection: "people_history",
        limit: 2,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(firstPage).toMatchObject({
      hasMore: true,
      nextCursor: expect.stringMatching(/^ws1\|history\|people_history\|/),
      state: "visible",
    });
    if (firstPage.state !== "visible" || !firstPage.nextCursor) {
      throw new Error("Expected a paginated people history page.");
    }
    expect(firstPage.page.map((row: { id: string }) => row.id)).toEqual([
      eventIds[3],
      eventIds[2],
    ]);

    await fixture.base.run(async (ctx) => {
      await ctx.db.insert("auditEvents", {
        actorRoles: ["builder"],
        actorWorkosUserId: "user_builder",
        brokerageId: fixture.brokerageId,
        command: "assignActiveBuildContractorToMilestone",
        createdAt: 2_000,
        entityId: String(fixture.buildId),
        entityType: "activeBuild",
        eventType: "active_build.contractor.milestone_assignment_updated",
        newState: JSON.stringify({
          assignmentIds: [assignment._id],
          contractorId: assignment.contractorId,
          milestoneKey: source.milestone.key,
          role: assignment.role,
          status: assignment.status,
          submilestoneKeys: [source.submilestone.key],
        }),
        organizationId: ORGANIZATION_ID,
        priorState: undefined,
        warnings: [],
      });
    });
    const secondPage = await fixture.builder.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceCollection,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: source.submilestone._id,
        collection: "people_history",
        cursor: firstPage.nextCursor,
        limit: 2,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(secondPage).toMatchObject({
      hasMore: false,
      page: [
        expect.objectContaining({ id: eventIds[1] }),
        expect.objectContaining({ id: eventIds[0] }),
      ],
      state: "visible",
    });
    expect(secondPage.page.map((row: { id: string }) => row.id)).not.toEqual(
      expect.arrayContaining(
        firstPage.page.map((row: { id: string }) => row.id),
      ),
    );

    const invalidEventId = await fixture.base.run(async (ctx) =>
      ctx.db.insert("auditEvents", {
        actorRoles: ["builder"],
        actorWorkosUserId: "user_builder",
        brokerageId: fixture.brokerageId,
        command: "assignActiveBuildContractorToMilestone",
        createdAt: 3_000,
        entityId: String(fixture.buildId),
        entityType: "activeBuild",
        eventType: "active_build.contractor.milestone_assignment_updated",
        newState: JSON.stringify({
          assignmentIds: [assignment._id],
          contractorId: "not-a-convex-contractor-id",
          milestoneKey: source.milestone.key,
          role: assignment.role,
          status: assignment.status,
          submilestoneKeys: [source.submilestone.key],
        }),
        organizationId: ORGANIZATION_ID,
        priorState: undefined,
        warnings: [],
      }),
    );
    const invalidIdPage = await fixture.builder.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceCollection,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: source.submilestone._id,
        collection: "people_history",
        limit: 1,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(invalidIdPage).toMatchObject({
      hasMore: true,
      page: [expect.objectContaining({ id: invalidEventId })],
      state: "visible",
    });
    expect(invalidIdPage.page[0]).not.toHaveProperty("contractorId");
  });

  test("fails closed for malformed and duplicate canonical companion bindings", async () => {
    const fixture = await seedOperationalBuild();
    await fixture.admin.mutation(
      (api as any).production_proposals.createActiveBuildTimelineMilestone,
      {
        buildId: fixture.buildId,
        milestone: {
          budgetCents: 8_000_000,
          dayEnd: 28,
          dayStart: 21,
          durationDays: 7,
          evidenceState: "",
          dependencyKeys: [],
          milestoneKey: "rough-in",
          name: "Rough-in",
          order: 2,
          policyState: "",
          status: "planned",
          submilestones: [
            {
              budgetCents: 8_000_000,
              durationDays: 7,
              key: "electrical-rough-in",
              name: "Electrical rough-in",
              order: 1,
              startDay: 0,
            },
          ],
          x: 21,
        },
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const companion = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("buildActionItems")
        .withIndex("by_buildId_and_systemMode", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq("systemMode", "generated_milestone_submilestone"),
        )
        .unique(),
    );
    expect(companion).toBeDefined();
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(companion!._id, { organizationId: "org_other" });
    });
    await expect(
      fixture.admin.mutation(
        (api as any).production_proposals.updateActiveBuildTimelineMilestone,
        {
          buildId: fixture.buildId,
          milestoneKey: "rough-in",
          name: "Rough-in updated",
          workosOrganizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow(/invalid tenant or parent scope/i);

    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(companion!._id, { organizationId: ORGANIZATION_ID });
      const {
        _creationTime: _ignoredCreationTime,
        _id: _ignoredId,
        ...row
      } = companion!;
      await ctx.db.insert("buildActionItems", row);
    });
    await expect(
      fixture.builder.mutation(
        (api as any).production_proposals.startActiveBuildMilestone,
        {
          actualStartedAt: Date.parse("2026-08-03T15:00:00.000Z"),
          buildId: fixture.buildId,
          expectedRevision: 0,
          idempotencyKey: "eng-423-duplicate-binding-start-001",
          milestoneKey: "rough-in",
          source: "milestone_detail",
          workosOrganizationId: ORGANIZATION_ID,
        },
      ),
    ).rejects.toThrow(/duplicate collaboration companions/i);
  });

  test("previews, repairs, certifies, and replays duplicate companions without losing the only human history", async () => {
    const fixture = await seedOperationalBuild();
    const source = await createCompanionCutoverMilestone(fixture);
    const duplicateId = await fixture.base.run(async (ctx) => {
      const {
        _creationTime: _ignoredCreationTime,
        _id: _ignoredId,
        ...duplicate
      } = source.companion;
      const duplicateId = await ctx.db.insert("buildActionItems", {
        ...duplicate,
        createdAt: duplicate.createdAt + 1,
        updatedAt: duplicate.updatedAt + 1,
      });
      await ctx.db.insert("buildActionItemComments", {
        actionItemId: duplicateId,
        authorDisplayNameSnapshot: "Admin",
        authorRole: "admin",
        authorWorkosUserId: "user_admin",
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: Date.now(),
        organizationId: ORGANIZATION_ID,
        plainText: "Preserve this cutover discussion.",
        tiptapJson: JSON.stringify({ type: "doc", content: [] }),
      });
      return duplicateId;
    });

    const firstPreview = await fixture.admin.query(
      (api as any).build_submilestone_companion_cutover
        .previewBuildSubmilestoneCompanionCutover,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    const secondPreview = await fixture.admin.query(
      (api as any).build_submilestone_companion_cutover
        .previewBuildSubmilestoneCompanionCutover,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    expect(secondPreview).toEqual(firstPreview);
    expect(firstPreview.counts).toMatchObject({ duplicate: 1 });
    expect(firstPreview.records[0]?.reportId).toMatch(/^[a-f0-9]{64}$/);

    const run = await runCompanionCutover(fixture, firstPreview.planToken);
    expect(run).toMatchObject({
      exceptionCount: 0,
      parityMismatchCount: 0,
      repairedCount: 1,
      status: "complete",
    });
    expect(run.reportHash).toMatch(/^[a-f0-9]{64}$/);
    const certificationState = await fixture.admin.query(
      (api as any).build_collaboration_cutover_certification
        .getBuildCollaborationCutoverCertificationState,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    expect(certificationState.companionCutover).toMatchObject({
      parityMismatchCount: 0,
      planToken: firstPreview.planToken,
      reportHash: run.reportHash,
      runId: run.runId,
      status: "complete",
    });

    const repaired = await fixture.base.run(async (ctx) => ({
      comments: await ctx.db
        .query("buildActionItemComments")
        .withIndex("by_actionItemId_and_createdAt", (query) =>
          query.eq("actionItemId", duplicateId),
        )
        .collect(),
      companions: await ctx.db
        .query("buildActionItems")
        .withIndex("by_canonicalBuildSubmilestoneId_and_systemMode", (query) =>
          query
            .eq("canonicalBuildSubmilestoneId", source.submilestone._id)
            .eq("systemMode", "generated_milestone_submilestone"),
        )
        .collect(),
      loser: await ctx.db.get(source.companion._id),
    }));
    expect(repaired.comments).toHaveLength(1);
    expect(repaired.companions).toEqual([
      expect.objectContaining({
        _id: duplicateId,
        canonicalCompanionDisposition: "active",
      }),
    ]);
    expect(repaired.loser).toMatchObject({
      canonicalCompanionDisposition: "historical_duplicate",
      canonicalCompanionSurvivorId: duplicateId,
      historicalCanonicalBuildSubmilestoneId: source.submilestone._id,
    });
    expect(repaired.loser).not.toHaveProperty("canonicalBuildSubmilestoneId");
    const historicalDetail = await fixture.admin.query(
      (api as any).build_action_item_details.getBuildActionItemDetail,
      {
        actionItemId: source.companion._id,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(historicalDetail.item).toMatchObject({
      canonicalCompanionDisposition: "historical_duplicate",
      canonicalCompanionSurvivorId: duplicateId,
      historicalCanonicalBuildSubmilestoneId: source.submilestone._id,
    });

    const replay = await fixture.admin.mutation(
      (api as any).build_submilestone_companion_cutover
        .startBuildSubmilestoneCompanionCutover,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        planToken: firstPreview.planToken,
      },
    );
    expect(replay).toEqual(run);
  });

  test("materializes a missing companion and reports manual Action Items separately", async () => {
    const fixture = await seedOperationalBuild();
    const source = await createCompanionCutoverMilestone(
      fixture,
      "missing-cutover",
    );
    await fixture.base.run(async (ctx) => {
      const links = await ctx.db
        .query("buildActionItemPostLinks")
        .withIndex("by_actionItemId_and_postId", (query) =>
          query.eq("actionItemId", source.companion._id),
        )
        .collect();
      const references = await ctx.db
        .query("buildCollaborationReferences")
        .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
          query
            .eq("ownerKind", "actionItem")
            .eq("ownerRecordId", String(source.companion._id)),
        )
        .collect();
      for (const link of links) await ctx.db.delete(link._id);
      for (const reference of references) await ctx.db.delete(reference._id);
      await ctx.db.delete(source.companion._id);
      await ctx.db.insert("buildActionItems", {
        assignmentState: "unassigned",
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: Date.now(),
        creatorRole: "admin",
        creatorWorkosUserId: "user_admin",
        currentRevision: 1,
        descriptionPlainText: "Manual coordination item",
        descriptionTiptapJson: JSON.stringify({ type: "doc", content: [] }),
        originatingPostId: source.companion.originatingPostId,
        organizationId: ORGANIZATION_ID,
        priority: "none",
        requiresAcceptance: false,
        status: "todo",
        title: "Manual coordination item",
        updatedAt: Date.now(),
      });
    });
    const preview = await fixture.admin.query(
      (api as any).build_submilestone_companion_cutover
        .previewBuildSubmilestoneCompanionCutover,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    expect(preview.counts.missing).toBe(1);
    expect(preview.manualActionItemCount).toBe(1);

    const run = await runCompanionCutover(fixture, preview.planToken);
    expect(run).toMatchObject({
      manualActionItemCount: 1,
      materializedCount: 1,
      parityMismatchCount: 0,
      status: "complete",
    });
    const dimensions = await fixture.admin.query(
      (api as any).build_submilestone_companion_cutover
        .getBuildActionItemMetricDimensions,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    expect(dimensions).toEqual({
      activeSubmilestoneCompanionCount: 1,
      historicalSubmilestoneCompanionCount: 0,
      manualActionItemCount: 1,
    });
  });

  test("seeds cutover reports in bounded advances and rejects a concurrent Build run", async () => {
    const fixture = await seedOperationalBuild();
    await createCompanionCutoverMilestone(fixture, "bounded-seeding-cutover");
    const preview = await fixture.admin.query(
      (api as any).build_submilestone_companion_cutover
        .previewBuildSubmilestoneCompanionCutover,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    let run = await fixture.admin.mutation(
      (api as any).build_submilestone_companion_cutover
        .startBuildSubmilestoneCompanionCutover,
      {
        batchSize: 1,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        planToken: preview.planToken,
      },
    );
    expect(run).toMatchObject({
      nextSeedOrdinal: 0,
      status: "seeding_reports",
    });
    await expect(
      fixture.admin.query(
        (api as any).build_submilestone_companion_cutover
          .getBuildSubmilestoneCompanionCutoverReports,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          runId: run.runId,
        },
      ),
    ).resolves.toMatchObject({ reports: [] });
    await expect(
      fixture.admin.mutation(
        (api as any).build_submilestone_companion_cutover
          .startBuildSubmilestoneCompanionCutover,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          planToken: "build-submilestone-companion-cutover/v1:other-plan",
        },
      ),
    ).rejects.toThrow(/already in progress for this Build/i);

    run = await fixture.admin.mutation(
      (api as any).build_submilestone_companion_cutover
        .advanceBuildSubmilestoneCompanionCutover,
      {
        buildId: fixture.buildId,
        maxItems: 1,
        organizationId: ORGANIZATION_ID,
        runId: run.runId,
      },
    );
    expect(run).toMatchObject({ nextSeedOrdinal: 1, status: "repairing" });
    await expect(
      fixture.admin.query(
        (api as any).build_submilestone_companion_cutover
          .getBuildSubmilestoneCompanionCutoverReports,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          runId: run.runId,
        },
      ),
    ).resolves.toMatchObject({
      reports: [expect.objectContaining({ ordinal: 0 })],
    });
  });

  test("blocks when a captured Milestone changes between repair and materialization", async () => {
    const fixture = await seedOperationalBuild();
    const source = await createCompanionCutoverMilestone(
      fixture,
      "stable-cursor-cutover",
    );
    const preview = await fixture.admin.query(
      (api as any).build_submilestone_companion_cutover
        .previewBuildSubmilestoneCompanionCutover,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    let run = await fixture.admin.mutation(
      (api as any).build_submilestone_companion_cutover
        .startBuildSubmilestoneCompanionCutover,
      {
        batchSize: 1,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        planToken: preview.planToken,
      },
    );
    for (
      let guard = 0;
      run.status === "seeding_reports" || run.status === "repairing";
      guard += 1
    ) {
      expect(guard).toBeLessThan(3);
      run = await fixture.admin.mutation(
        (api as any).build_submilestone_companion_cutover
          .advanceBuildSubmilestoneCompanionCutover,
        {
          buildId: fixture.buildId,
          maxItems: 1,
          organizationId: ORGANIZATION_ID,
          runId: run.runId,
        },
      );
    }
    expect(run.status).toBe("materializing");
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(source.milestone._id, {
        planningState: "superseded",
        updatedAt: Date.now(),
      });
    });
    for (let guard = 0; run.status === "materializing"; guard += 1) {
      expect(guard).toBeLessThan(3);
      run = await fixture.admin.mutation(
        (api as any).build_submilestone_companion_cutover
          .advanceBuildSubmilestoneCompanionCutover,
        {
          buildId: fixture.buildId,
          maxItems: 1,
          organizationId: ORGANIZATION_ID,
          runId: run.runId,
        },
      );
    }
    expect(run).toMatchObject({ status: "blocked" });
    expect(run.lastError).toMatch(/changed after the run started/i);
  });

  test("persists the final parity mismatch before blocking certification", async () => {
    const fixture = await seedOperationalBuild();
    const source = await createCompanionCutoverMilestone(
      fixture,
      "parity-mismatch-cutover",
    );
    const preview = await fixture.admin.query(
      (api as any).build_submilestone_companion_cutover
        .previewBuildSubmilestoneCompanionCutover,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    let run = await fixture.admin.mutation(
      (api as any).build_submilestone_companion_cutover
        .startBuildSubmilestoneCompanionCutover,
      {
        batchSize: 25,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        planToken: preview.planToken,
      },
    );
    for (
      let guard = 0;
      run.status === "seeding_reports" ||
      run.status === "repairing" ||
      run.status === "materializing";
      guard += 1
    ) {
      expect(guard).toBeLessThan(10);
      run = await fixture.admin.mutation(
        (api as any).build_submilestone_companion_cutover
          .advanceBuildSubmilestoneCompanionCutover,
        {
          buildId: fixture.buildId,
          maxItems: 25,
          organizationId: ORGANIZATION_ID,
          runId: run.runId,
        },
      );
    }
    expect(run.status).toBe("checking_parity");
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(source.companion._id, {
        canonicalCompanionDisposition: "quarantined",
        canonicalPlanningState: "superseded",
        updatedAt: Date.now(),
      });
    });
    run = await fixture.admin.mutation(
      (api as any).build_submilestone_companion_cutover
        .advanceBuildSubmilestoneCompanionCutover,
      {
        buildId: fixture.buildId,
        maxItems: 25,
        organizationId: ORGANIZATION_ID,
        runId: run.runId,
      },
    );
    expect(run).toMatchObject({
      lastParityRecordKey: expect.any(String),
      parityCheckedCount: 1,
      parityMismatchCount: 1,
      status: "blocked",
    });
  });

  test("keyset parity blocks when an already checked canonical record disappears", async () => {
    const fixture = await seedOperationalBuild();
    await createCompanionCutoverMilestone(fixture, "parity-keyset-a");
    await createCompanionCutoverMilestone(fixture, "parity-keyset-b");
    const preview = await fixture.admin.query(
      (api as any).build_submilestone_companion_cutover
        .previewBuildSubmilestoneCompanionCutover,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    let run = await fixture.admin.mutation(
      (api as any).build_submilestone_companion_cutover
        .startBuildSubmilestoneCompanionCutover,
      {
        batchSize: 25,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        planToken: preview.planToken,
      },
    );
    for (let guard = 0; run.status !== "checking_parity"; guard += 1) {
      expect(guard).toBeLessThan(10);
      run = await fixture.admin.mutation(
        (api as any).build_submilestone_companion_cutover
          .advanceBuildSubmilestoneCompanionCutover,
        {
          buildId: fixture.buildId,
          maxItems: 25,
          organizationId: ORGANIZATION_ID,
          runId: run.runId,
        },
      );
    }
    run = await fixture.admin.mutation(
      (api as any).build_submilestone_companion_cutover
        .advanceBuildSubmilestoneCompanionCutover,
      {
        buildId: fixture.buildId,
        maxItems: 1,
        organizationId: ORGANIZATION_ID,
        runId: run.runId,
      },
    );
    expect(run).toMatchObject({
      lastParityRecordKey: expect.stringMatching(/^submilestone:/),
      parityCheckedCount: 1,
      status: "checking_parity",
    });
    await fixture.base.run(async (ctx) => {
      const rawId = run.lastParityRecordKey.replace("submilestone:", "");
      const submilestoneId = ctx.db.normalizeId("buildSubmilestones", rawId);
      if (!submilestoneId) {
        throw new Error("Expected a canonical keyset cursor Sub-milestone ID.");
      }
      await ctx.db.delete(submilestoneId);
    });
    run = await fixture.admin.mutation(
      (api as any).build_submilestone_companion_cutover
        .advanceBuildSubmilestoneCompanionCutover,
      {
        buildId: fixture.buildId,
        maxItems: 1,
        organizationId: ORGANIZATION_ID,
        runId: run.runId,
      },
    );
    expect(run).toMatchObject({
      parityCheckedCount: 2,
      parityMismatchCount: 1,
      status: "blocked",
    });
    expect(run.lastError).toMatch(
      /parity found 1 unresolved binding mismatch/i,
    );
  });

  test("blocks duplicate repair when more than one candidate owns human history", async () => {
    const fixture = await seedOperationalBuild();
    const source = await createCompanionCutoverMilestone(
      fixture,
      "conflict-cutover",
    );
    await fixture.base.run(async (ctx) => {
      const {
        _creationTime: _ignoredCreationTime,
        _id: _ignoredId,
        ...duplicate
      } = source.companion;
      const duplicateId = await ctx.db.insert("buildActionItems", duplicate);
      for (const [actionItemId, plainText] of [
        [source.companion._id, "First history"],
        [duplicateId, "Second history"],
      ] as const) {
        await ctx.db.insert("buildActionItemComments", {
          actionItemId,
          authorDisplayNameSnapshot: "Admin",
          authorRole: "admin",
          authorWorkosUserId: "user_admin",
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          createdAt: Date.now(),
          organizationId: ORGANIZATION_ID,
          plainText,
          tiptapJson: JSON.stringify({ type: "doc", content: [] }),
        });
      }
    });
    const preview = await fixture.admin.query(
      (api as any).build_submilestone_companion_cutover
        .previewBuildSubmilestoneCompanionCutover,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    const run = await runCompanionCutover(fixture, preview.planToken);
    expect(run).toMatchObject({
      exceptionCount: 1,
      status: "blocked",
    });
    expect(run.lastError).toMatch(/conflicting_history/);
    const reports = await fixture.admin.query(
      (api as any).build_submilestone_companion_cutover
        .getBuildSubmilestoneCompanionCutoverReports,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        runId: run.runId,
      },
    );
    expect(reports.reports).toEqual([
      expect.objectContaining({
        exceptionReason: "conflicting_history",
        outcome: "exception",
      }),
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
        expectedRevision: 0,
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

  test("automates only canonical Milestone and Draw System Posts", async () => {
    const fixture = await seedOperationalBuild();

    await fixture.admin.mutation(
      (api as any).production_proposals.createActiveBuildTimelineEvidenceAsset,
      {
        asset: {
          evidenceKey: "canonical-boundary-photo",
          fileName: "canonical-boundary-photo.webp",
          label: "Canonical boundary photo",
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
    await fixture.admin.mutation(
      (api as any).production_proposals.scheduleActiveBuildSiteVisit,
      {
        buildId: fixture.buildId,
        idempotencyKey: "canonical-boundary-site-visit",
        milestoneKey: "foundation",
        requestedDay: 12,
        requestedTime: "09:00",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    await fixture.admin.mutation(
      (api as any).production_proposals.addActiveBuildDocument,
      {
        buildId: fixture.buildId,
        clientOperationId: "canonical-boundary-permit",
        documentType: "permit",
        fileName: "Canonical boundary permit.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        workosOrganizationId: ORGANIZATION_ID,
      },
    );

    let snapshot = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(snapshot.posts).toHaveLength(0);
    expect(snapshot.actionItems).toHaveLength(0);

    await fixture.admin.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualStartedAt: Date.now() - 86_400_000,
        buildId: fixture.buildId,
        completedDay: 20,
        expectedRevision: 0,
        idempotencyKey: "canonical-boundary-milestone-submission",
        milestoneKey: "foundation",
        note: "Foundation work is ready for lender review.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    await fixture.admin.mutation(
      (api as any).production_proposals.requestActiveBuildMilestoneInfo,
      {
        buildId: fixture.buildId,
        milestoneKey: "foundation",
        note: "Upload the engineer-sealed footing report.",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );

    snapshot = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(snapshot.posts).toHaveLength(1);
    expect(snapshot.posts[0]).toMatchObject({
      authorDisplayNameSnapshot: "DrawFlow System",
      source: "system",
      systemPostKind: "milestone",
    });
    expect(snapshot.posts[0]?.systemOccurrenceKey).toMatch(
      /^milestone-system:/,
    );
    expect(snapshot.posts.every((post) => post.systemPostKind)).toBe(true);
  });

  test("retires legacy noncanonical automation while preserving canonical System Posts", async () => {
    const fixture = await seedOperationalBuild();
    const legacyPostId = await fixture.base.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("buildCollaborationPosts", {
        acknowledgementRequired: false,
        agentDrafted: false,
        announcementProminent: false,
        audienceFloorTier: 0,
        audienceMode: "build_wide",
        authorDisplayNameSnapshot: "DrawFlow Operations",
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
        readRevision: 1,
        revision: 1,
        source: "system",
        systemEventKey: "operational:evidence:legacy:submitted",
        threadRevision: 0,
        threadState: "open",
        updatedAt: now,
      });
    });

    expect(await feedKinds(fixture.admin, fixture.buildId)).toEqual([]);

    await fixture.admin.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualStartedAt: Date.now() - 86_400_000,
        buildId: fixture.buildId,
        completedDay: 20,
        expectedRevision: 0,
        idempotencyKey: "canonical-boundary-retirement-milestone",
        milestoneKey: "foundation",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );

    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(legacyPostId, {
        lastMeaningfulActivityAt: Date.now() + 60_000,
      });
    });
    const sparseFirstPage = await fixture.admin.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 1 },
      },
    );
    expect(sparseFirstPage.page).toEqual([]);
    expect(sparseFirstPage.isDone).toBe(false);
    const sparseSecondPage = await fixture.admin.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: {
          cursor: sparseFirstPage.continueCursor,
          numItems: 1,
        },
      },
    );
    expect(sparseSecondPage.page.map((entry: { kind: string }) => entry.kind))
      .toEqual(["post"]);

    let cursor: string | null = null;
    let isDone = false;
    while (!isDone) {
      const result: { continueCursor: string; isDone: boolean } =
        await fixture.admin.mutation(
        (internal as any)
          .build_collaboration_system_post_boundary_migrations
          .retireNoncanonicalAutomatedCollaborationPosts,
        {
          batchSize: 25,
          cursor,
          dryRun: false,
          oneBatchOnly: true,
        },
      );
      cursor = result.continueCursor;
      isDone = result.isDone;
    }

    const state = await fixture.base.run(async (ctx) => ({
      audit: (await ctx.db.query("auditEvents").collect()).find(
        (event) =>
          event.entityId === String(legacyPostId) &&
          event.eventType ===
            "build.collaboration.noncanonical_system_post.retired",
      ),
      legacy: await ctx.db.get(legacyPostId),
      posts: await ctx.db
        .query("buildCollaborationPosts")
        .withIndex("by_buildId_and_createdAt", (query) =>
          query.eq("buildId", fixture.buildId),
        )
        .collect(),
    }));
    expect(state.legacy).toMatchObject({
      contentState: "tombstoned",
      threadState: "resolved",
      tombstonedByWorkosUserId: "system",
    });
    expect(state.audit).toBeDefined();
    expect(
      state.posts.filter((post) => post.systemPostKind === "milestone"),
    ).toHaveLength(1);
    expect(await feedKinds(fixture.admin, fixture.buildId)).toEqual(["post"]);
  });

  test.skip("legacy Evidence automation contract", async () => {
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
        expect.objectContaining({
          recipientWorkosUserId: "user_builder",
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

  test.skip("legacy Evidence review automation contract", async () => {
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

  test.skip("legacy Site Visit automation contract", async () => {
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
          delivery.href?.includes("focus=siteVisit%3A") === true,
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

  test.skip("legacy per-transition Milestone post contract", async () => {
    const fixture = await seedOperationalBuild();
    const submission = {
      actualStartedAt: Date.now() - 86_400_000,
      buildId: fixture.buildId,
      completedDay: 20,
      expectedRevision: 0,
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

  test.skip("legacy Document automation contract", async () => {
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
    const firstDrawSnapshot = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(
      firstDrawSnapshot.deliveries.some(
        (delivery) =>
          delivery.href?.match(/focus=draw%3A/) &&
          delivery.recipientWorkosUserId === "user_builder_staff_draw_view",
      ),
    ).toBe(true);
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
    expect(
      snapshot.posts.every((post: any) => post.systemPostKind === "draw"),
    ).toBe(true);
    expect(snapshot.actionItems).toHaveLength(0);
    expect(snapshot.references).toHaveLength(2);
    expect(
      snapshot.deliveries.some(
        (delivery) =>
          delivery.href?.match(/focus=draw%3A/) &&
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
          delivery.recipientWorkosUserId === "user_builder_staff_draw_view",
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
      revokedDeliveryState.deliveries.every(
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
        .withIndex("by_build_order", (query) =>
          query.eq("buildId", fixture.buildId),
        )
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
        .withIndex("by_build_order", (query) =>
          query.eq("buildId", fixture.buildId),
        )
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

  test.skip("legacy Document publication rollback contract", async () => {
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

  test.skip("legacy generic system-event publisher contract", async () => {
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

    const beforeSilentRemediation = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    await fixture.admin.mutation(
      (internal as any).build_collaboration_system_events
        .publishBuildCollaborationSystemEvent,
      {
        buildId: fixture.buildId,
        idempotencyKey: "operational:test:silent-remediation",
        organizationId: ORGANIZATION_ID,
        plainText: "Historical remediation source record.",
        postType: "issue",
        primaryReferenceId: fixture.milestoneId,
        primaryReferenceKind: "milestone",
        remediation: {
          description: "Historical remediation must remain source-only.",
          policyKey: "historical-remediation",
          title: "Historical remediation",
          workKind: "evidence",
        },
        silentBackfill: {
          materializedAt: Date.now(),
          unknownFacts: ["start"],
        },
        systemLabel: "DrawFlow Operations",
      },
    );
    const afterSilentRemediation = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(afterSilentRemediation.posts).toHaveLength(
      beforeSilentRemediation.posts.length + 1,
    );
    expect(afterSilentRemediation.actionItems).toHaveLength(
      beforeSilentRemediation.actionItems.length,
    );

    await expect(
      fixture.admin.mutation(
        (internal as any).build_collaboration_system_events
          .publishBuildCollaborationSystemEvent,
        {
          buildId: fixture.buildId,
          idempotencyKey: "operational:test:missing-milestone-reference",
          organizationId: ORGANIZATION_ID,
          plainText: "This Milestone System Post must be rejected.",
          postType: "update",
          systemLabel: "DrawFlow Operations",
          systemPostKind: "milestone",
        },
      ),
    ).rejects.toThrow(/Milestone primary reference/i);

    await expect(
      fixture.admin.mutation(
        (internal as any).build_collaboration_system_events
          .publishBuildCollaborationSystemEvent,
        {
          buildId: fixture.buildId,
          idempotencyKey: "operational:test:invalid-milestone-reference",
          organizationId: ORGANIZATION_ID,
          plainText: "This Milestone System Post must be rejected.",
          postType: "update",
          primaryReferenceId: "missing-milestone",
          primaryReferenceKind: "milestone",
          systemLabel: "DrawFlow Operations",
          systemPostKind: "milestone",
        },
      ),
    ).rejects.toThrow(/referenced Milestone is unavailable/i);

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
    expect(afterRollback.posts).toHaveLength(
      afterSilentRemediation.posts.length,
    );
    expect(afterRollback.references).toHaveLength(
      afterSilentRemediation.references.length,
    );
    expect(afterRollback.deliveries).toHaveLength(
      afterSilentRemediation.deliveries.length,
    );
    expect(afterRollback.actionItems).toHaveLength(
      afterSilentRemediation.actionItems.length,
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

  test.skip("legacy operational publication freeze contract", async () => {
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
        },
      ),
    ).rejects.toThrow(/temporarily frozen for a rollback rehearsal snapshot/i);

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

    await fixture.base.run(async (ctx) => {
      const setting = await ctx.db
        .query("buildCollaborationTenantSettings")
        .withIndex("by_organizationId", (query) =>
          query.eq("organizationId", ORGANIZATION_ID),
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
        },
      ),
    ).rejects.toThrow(/temporarily frozen for a rollback rehearsal snapshot/i);
    expect(
      await fixture.base.run(
        async (ctx) =>
          (
            await ctx.db
              .query("buildDocuments")
              .withIndex("by_build", (query) =>
                query.eq("buildId", fixture.buildId),
              )
              .collect()
          ).length,
      ),
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
        },
      ),
    ).rejects.toThrow(/temporarily frozen for a rollback rehearsal snapshot/i);
    expect(
      await fixture.base.run(
        async (ctx) =>
          (
            await ctx.db
              .query("buildDocuments")
              .withIndex("by_build", (query) =>
                query.eq("buildId", fixture.buildId),
              )
              .collect()
          ).length,
      ),
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
        expectedRevision: 0,
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
        expectedRevision: 0,
        idempotencyKey: "eng-412-child-start-001",
        milestoneKey: "foundation",
        source: "submilestone_detail",
        submilestoneKey: "foundation-2",
        workosOrganizationId: ORGANIZATION_ID,
      },
    );
    const before = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    const beforeCards = before.actionItems.filter(
      (item) => item.systemMode === "generated_milestone_submilestone",
    );
    expect(beforeCards).toHaveLength(2);
    const firstCard = beforeCards.find((item) => item.title === "Excavate");
    const secondCard = beforeCards.find(
      (item) => item.title === "Pour footings",
    );
    expect(firstCard).toBeDefined();
    expect(secondCard).toBeDefined();
    await fixture.base.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("buildActionItemRelations", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: now,
        createdByWorkosUserId: "user_admin",
        kind: "blocks",
        organizationId: ORGANIZATION_ID,
        sourceActionItemId: firstCard!._id,
        status: "active",
        targetActionItemId: secondCard!._id,
        updatedAt: now,
      });
    });
    const ordinaryDependencyFocused = await fixture.admin.query(
      (api as any).build_collaboration_focus
        .getFocusedBuildCollaborationPostContext,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: before.posts.find(
          (post) => post.systemPostKind === "milestone",
        )!._id,
      },
    );
    expect(ordinaryDependencyFocused.entry.post.planningSummary).toMatchObject({
      attention: { dependencyExceptions: 0 },
    });
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
    const afterPlan = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    const afterCards = afterPlan.actionItems.filter(
      (item) => item.systemMode === "generated_milestone_submilestone",
    );
    const supersededCard = afterCards.find((item) => item.title === "Excavate");
    expect(afterCards).toHaveLength(2);
    expect(supersededCard?._id).toBe(firstCard?._id);
    expect(supersededCard?.canonicalPlanningState).toBe("superseded");
    expect(afterPlan.deliveries).toHaveLength(beforeDeliveryCount);

    const reconciliation = await planningReconciliation(
      fixture.admin,
      String(fixture.buildId),
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
    expect(
      reconciliation.diffs.filter(
        (diff: { entityKey: string; field: string }) =>
          diff.entityKey === "foundation:foundation-1" &&
          diff.field === "planningState",
      ),
    ).toHaveLength(1);

    const planningRevisionAudit = await fixture.base.run(async (ctx) => {
      const revisions = await ctx.db
        .query("activeBuildPlanningRevisions")
        .withIndex("by_build_revision", (query) =>
          query.eq("buildId", fixture.buildId),
        )
        .collect();
      const auditEvents = await ctx.db.query("auditEvents").collect();
      const revision = revisions.find(
        (row) => row.revision === reconciliation.current.revision,
      );
      const audit = auditEvents.find((event) => {
        if (event.eventType !== "active_build.planning.revised") return false;
        const newState = JSON.parse(event.newState ?? "{}") as {
          revision?: number;
        };
        return newState.revision === reconciliation.current.revision;
      });
      return { audit, revision };
    });
    expect(planningRevisionAudit.revision).toBeDefined();
    expect(planningRevisionAudit.audit).toMatchObject({
      entityId: String(planningRevisionAudit.revision?._id),
      entityType: "activeBuildPlanningRevision",
    });
    expect(
      JSON.parse(planningRevisionAudit.audit?.newState ?? "{}"),
    ).toMatchObject({
      buildId: String(fixture.buildId),
      revision: reconciliation.current.revision,
    });

    const focused = await fixture.admin.query(
      (api as any).build_collaboration_focus
        .getFocusedBuildCollaborationPostContext,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: afterPlan.posts.find(
          (post) => post.systemPostKind === "milestone",
        )!._id,
      },
    );
    expect(focused.state).toBe("visible");
    expect(focused.entry.post.planningSummary).toMatchObject({
      counts: { in_progress: 1, superseded: 1 },
      readyForApproval: false,
      attention: { dependencyExceptions: 0 },
    });

    const contractorReconciliation = await planningReconciliation(
      fixture.contractor,
      String(fixture.buildId),
    );
    expect(contractorReconciliation.activation.snapshot.allocations).toEqual(
      [],
    );
    expect(contractorReconciliation.activation.snapshot.draws).toEqual([]);
    expect(
      contractorReconciliation.activation.snapshot.evidenceRequirements,
    ).toEqual([]);
    expect(
      contractorReconciliation.diffs.every(
        (diff: { entityType: string }) =>
          diff.entityType === "milestone" || diff.entityType === "submilestone",
      ),
    ).toBe(true);
    expect(
      contractorReconciliation.revisions.every(
        (revision: Record<string, unknown>) =>
          Object.keys(revision).sort().join(",") === "approvedAt,kind,revision",
      ),
    ).toBe(true);
    expect(contractorReconciliation.activation).not.toHaveProperty(
      "actorWorkosUserId",
    );

    await expect(
      fixture.builder.mutation(
        (api as any).production_proposals.startActiveBuildMilestone,
        {
          actualStartedAt: Date.parse("2026-08-03T12:05:00.000Z"),
          buildId: fixture.buildId,
          expectedRevision: 0,
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
          expectedRevision: 0,
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
        systemEventKey: `draw-system:${fixture.buildId}:${fixture.proposalId}:request:draw-coordination-reference`,
        systemOccurrenceKey: `draw-system:${fixture.buildId}:${fixture.proposalId}:request:draw-coordination-reference`,
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
          canonicalBuildDrawOccurrenceKey: post.canonicalBuildDrawOccurrenceKey,
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
    const ordinary = await fixture.base.run(async (ctx) => ctx.db.get(itemId));
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
    const left = await fixture.base.run(async (ctx) => ctx.db.get(joined!._id));
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
    expect(
      externalFeed.page[0]?.post.systemPost.drawCoordination,
    ).toBeUndefined();
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
    expect(adminState.workingAudienceCount).toBe(0);
    expect(adminState.workingAudienceTruncated).toBe(false);
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
    const staleAdminFollowId = await fixture.base.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("buildCollaborationFollows", {
        active: false,
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        coordinationActive: true,
        createdAt: now,
        organizationId: ORGANIZATION_ID,
        postId: drawPostId,
        reason: "manual",
        updatedAt: now,
        workosUserId: "user_global_admin",
      });
    });
    const staleAdminState = await fixture.globalAdmin.query(
      (api as any).build_draw_coordination.getDrawCoordinationState,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: drawPostId,
      },
    );
    expect(staleAdminState.joined).toBe(true);
    expect(staleAdminState.oversight).toBe(true);
    expect(staleAdminState.canJoin).toBe(false);
    expect(staleAdminState.canLeave).toBe(false);
    expect(staleAdminState.workingAudienceCount).toBe(0);
    await expect(
      fixture.globalAdmin.mutation(
        (api as any).build_draw_coordination.joinDrawCoordination,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: drawPostId,
        },
      ),
    ).rejects.toThrow(/oversight|Forbidden/i);
    expect(
      await fixture.globalAdmin.mutation(
        (api as any).build_draw_coordination.leaveDrawCoordination,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: drawPostId,
        },
      ),
    ).toBe(false);
    const clearedAdminFollow = await fixture.base.run(async (ctx) =>
      ctx.db.get(staleAdminFollowId),
    );
    expect(clearedAdminFollow?.coordinationActive).toBe(false);
    expect(
      await fixture.globalAdmin.mutation(
        (api as any).build_draw_coordination.leaveDrawCoordination,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: drawPostId,
        },
      ),
    ).toBe(false);
    await fixture.base.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < 101; index += 1) {
        const workosUserId = `draw_audience_${index}`;
        const role = index === 1 ? "contractor" : "broker";
        await ctx.db.insert("buildParticipants", {
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          createdAt: now,
          displayNameSnapshot: `Draw audience ${index}`,
          joinedAt: now,
          organizationId: ORGANIZATION_ID,
          participationPeriod: 1,
          role,
          status: "active",
          updatedAt: now,
          validFrom: now,
          workosUserId,
        });
        await ctx.db.insert("buildCollaborationFollows", {
          active: false,
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          coordinationActive: true,
          createdAt: now,
          organizationId: ORGANIZATION_ID,
          postId: drawPostId,
          reason: "manual",
          updatedAt: now,
          workosUserId,
        });
      }
    });
    for (let index = 0; index < 101; index += 1) {
      const workosUserId = `draw_audience_${index}`;
      const role = index === 1 ? "contractor" : "broker";
      await fixture.base.mutation(
        (internal as any).workosProjection.ingestWorkosEvent,
        {
          data: {
            id: `draw_audience_membership_${index}`,
            organization_id: ORGANIZATION_ID,
            role: { slug: role },
            roles: [{ slug: role }],
            status: index === 0 ? "inactive" : "active",
            user_id: workosUserId,
          },
          event: "organization_membership.created",
          id: `draw_audience_membership_created_${index}`,
        },
      );
    }
    const saturatedAdminState = await fixture.globalAdmin.query(
      (api as any).build_draw_coordination.getDrawCoordinationState,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: drawPostId,
      },
    );
    expect(saturatedAdminState.workingAudienceCount).toBe(98);
    expect(saturatedAdminState.workingAudienceTruncated).toBe(true);
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
      expect(
        await oversight.mutation(
          (api as any).build_draw_coordination.leaveDrawCoordination,
          {
            buildId: fixture.buildId,
            organizationId: ORGANIZATION_ID,
            postId: drawPostId,
          },
        ),
      ).toBe(false);
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
        .withIndex("by_buildId", (query) =>
          query.eq("buildId", fixture.buildId),
        )
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

  test("resolves Draw involvement beyond legacy bounded assignment scans", async () => {
    const fixture = await seedOperationalBuild();
    const involvement = await fixture.base.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < 100; index += 1) {
        await ctx.db.insert("buildBrokerAssignments", {
          assignedBrokerWorkosUserId: `draw_beyond_broker_decoy_${index}`,
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          createdAt: now + index,
          organizationId: ORGANIZATION_ID,
          role: "support",
        });
      }
      await ctx.db.insert("buildBrokerAssignments", {
        assignedBrokerWorkosUserId: "draw_beyond_broker_target",
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: now + 100,
        organizationId: ORGANIZATION_ID,
        role: "primary",
      });
      for (let index = 0; index < 20; index += 1) {
        await ctx.db.insert("builderAccountLinks", {
          brokerageId: fixture.brokerageId,
          builderProfileId: fixture.builderProfileId,
          createdAt: now + index,
          role: "staff",
          status: "inactive",
          updatedAt: now + index,
          workosUserId: "draw_beyond_builder_target",
        });
      }
      await ctx.db.insert("builderAccountLinks", {
        brokerageId: fixture.brokerageId,
        builderProfileId: fixture.builderProfileId,
        createdAt: now + 20,
        role: "staff",
        status: "active",
        updatedAt: now + 20,
        workosUserId: "draw_beyond_builder_target",
      });
      for (let index = 0; index < 20; index += 1) {
        await ctx.db.insert("contractorProfiles", {
          brokerageId: fixture.brokerageId,
          createdAt: now + index,
          name: `Beyond contractor decoy ${index}`,
          organizationId: ORGANIZATION_ID,
          status: "active",
          trades: ["concrete"],
          updatedAt: now + index,
          accountWorkosUserId: "draw_beyond_contractor_target",
        });
      }
      const targetContractorId = await ctx.db.insert("contractorProfiles", {
        brokerageId: fixture.brokerageId,
        createdAt: now + 20,
        name: "Beyond contractor target",
        organizationId: ORGANIZATION_ID,
        status: "active",
        trades: ["concrete"],
        updatedAt: now + 20,
        accountWorkosUserId: "draw_beyond_contractor_target",
      });
      await ctx.db.insert("buildContractorAssignments", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        contractorId: targetContractorId,
        createdAt: now + 20,
        organizationId: ORGANIZATION_ID,
        role: "Concrete contractor",
        status: "active",
        updatedAt: now + 20,
      });
      return {
        broker: await hasCurrentBuildInvolvement(ctx, {
          buildId: fixture.buildId,
          workosUserId: "draw_beyond_broker_target",
        }),
        builder: await hasCurrentBuildInvolvement(ctx, {
          buildId: fixture.buildId,
          workosUserId: "draw_beyond_builder_target",
        }),
        contractor: await hasCurrentBuildInvolvement(ctx, {
          buildId: fixture.buildId,
          workosUserId: "draw_beyond_contractor_target",
        }),
      };
    });
    expect(involvement).toEqual({
      broker: true,
      builder: true,
      contractor: true,
    });
  });

  test("rejects a planning snapshot that exceeds the bounded Milestone cap", async () => {
    const fixture = await seedOperationalBuild();
    await fixture.base.run(async (ctx) => {
      const template = await ctx.db.get(fixture.milestoneId);
      if (!template) throw new Error("Missing Milestone fixture.");
      const { _creationTime, _id, ...templateFields } = template;
      void _creationTime;
      void _id;
      for (let index = 0; index < 1_001; index += 1) {
        await ctx.db.insert("buildMilestones", {
          ...templateFields,
          key: `overflow-${index}`,
          name: `Overflow ${index}`,
          order: index + 2,
          updatedAt: Date.now(),
        });
      }
    });
    await expect(
      fixture.admin.query(
        (api as any).build_collaboration_planning_reconciliation
          .getActiveBuildPlanningReconciliationSnapshot,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          paginationOpts: { cursor: null, numItems: 100 },
        },
      ),
    ).rejects.toThrow(
      /planning snapshot exceeds the 1000 Milestones safety limit/i,
    );
  });

  test("paginates an activation snapshot across planning entity pages", async () => {
    const fixture = await seedOperationalBuild();
    const now = Date.now();
    await fixture.base.run(async (ctx) => {
      const revisionId = await ctx.db.insert("activeBuildPlanningRevisions", {
        actorRoles: ["admin"],
        actorWorkosUserId: "user_admin",
        approvedAt: now,
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: now,
        diffCount: 0,
        kind: "activation",
        organizationId: ORGANIZATION_ID,
        reason: "Synthetic paginated activation snapshot.",
        revision: 1,
        sourceCommand: "test",
        summary: "251 milestone(s)",
      });
      for (let index = 0; index < 251; index += 1) {
        await ctx.db.insert("activeBuildPlanningRevisionEntities", {
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          canonicalId: undefined,
          createdAt: now + index,
          entityKey: `synthetic-${index}`,
          entityType: "milestone",
          organizationId: ORGANIZATION_ID,
          planningState: "active",
          revision: 1,
          revisionId,
          snapshotJson: JSON.stringify({ name: `Synthetic ${index}` }),
        });
      }
    });

    const reconciliation = await planningReconciliation(
      fixture.admin,
      String(fixture.buildId),
    );
    expect(reconciliation.activation.snapshot.milestones).toHaveLength(251);
    expect(reconciliation.diffsTruncated).toBe(false);
  });

  test("signals when the bounded planning revision history has an overflow row", async () => {
    const fixture = await seedOperationalBuild();
    const now = Date.now();
    await fixture.base.run(async (ctx) => {
      for (let revision = 1; revision <= 101; revision += 1) {
        await ctx.db.insert("activeBuildPlanningRevisions", {
          actorRoles: ["admin"],
          actorWorkosUserId: "user_admin",
          approvedAt: now + revision,
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          createdAt: now + revision,
          diffCount: 0,
          kind: revision === 1 ? "activation" : "approved",
          organizationId: ORGANIZATION_ID,
          previousRevision: revision === 1 ? undefined : revision - 1,
          reason: "Synthetic revision history overflow test.",
          revision,
          sourceCommand: "test",
          summary: "No changes",
        });
      }
    });

    const reconciliation = await planningReconciliation(
      fixture.admin,
      String(fixture.buildId),
    );
    expect(reconciliation.revisions).toHaveLength(100);
    expect(reconciliation.revisionsTruncated).toBe(true);
    expect(reconciliation.diffsTruncated).toBe(false);
  });

  test("returns the first 10,000 planning diffs with an explicit truncation signal", async () => {
    const fixture = await seedOperationalBuild();
    const now = Date.now();
    const diffRows = Array.from({ length: 10_001 }, (_, index) => ({
      category: "scope" as const,
      changeType: "changed" as const,
      entityKey: `synthetic-${index}`,
      entityType: "milestone",
      field: "name",
      nextValue: `Synthetic ${index} revised`,
      priorValue: `Synthetic ${index}`,
    }));
    await fixture.base.run(async (ctx) => {
      const revisionId = await ctx.db.insert("activeBuildPlanningRevisions", {
        actorRoles: ["admin"],
        actorWorkosUserId: "user_admin",
        approvedAt: now,
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: now,
        diffCount: diffRows.length,
        kind: "approved",
        organizationId: ORGANIZATION_ID,
        reason: "Synthetic diff truncation test.",
        revision: 1,
        sourceCommand: "test",
        summary: "10,001 synthetic diffs",
      });
      for (let offset = 0; offset < diffRows.length; offset += 250) {
        await ctx.db.insert("activeBuildPlanningRevisionChunks", {
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          chunkIndex: offset / 250,
          chunkKind: "diffs",
          createdAt: now + offset,
          organizationId: ORGANIZATION_ID,
          payloadJson: JSON.stringify(diffRows.slice(offset, offset + 250)),
          revision: 1,
          revisionId,
        });
      }
    });

    const reconciliation = await planningReconciliation(
      fixture.admin,
      String(fixture.buildId),
    );
    expect(reconciliation.diffs).toHaveLength(10_000);
    expect(reconciliation.revisionsTruncated).toBe(false);
    expect(reconciliation.diffsTruncated).toBe(true);
    expect(reconciliation.diffs[0]).toMatchObject({
      entityKey: "synthetic-0",
      revision: 1,
    });
    expect(reconciliation.diffs.at(-1)).toMatchObject({
      entityKey: "synthetic-9999",
      revision: 1,
    });
  });

  test("reports synchronized versus repaired Milestone posts separately", async () => {
    const fixture = await seedOperationalBuild();
    const first = await fixture.admin.mutation(
      (api as any).build_collaboration_planning_reconciliation
        .reconcileActiveBuildMilestonePlanning,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    expect(first).toMatchObject({
      repairedMilestoneCount: 0,
      synchronizedMilestoneCount: 1,
    });
    const second = await fixture.admin.mutation(
      (api as any).build_collaboration_planning_reconciliation
        .reconcileActiveBuildMilestonePlanning,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID },
    );
    expect(second).toMatchObject({
      repairedMilestoneCount: 0,
      synchronizedMilestoneCount: 1,
    });
  });

  test("reconstructs multi-batch planning revisions while materialization is pending and drains idempotently", async () => {
    vi.useFakeTimers();
    const fixture = await seedOperationalBuild();
    const now = Date.now();
    const entityRows = Array.from({ length: 251 }, (_, index) => ({
      entityKey: `synthetic-${index}`,
      entityType: "milestone",
      planningState: "active" as const,
      snapshot: { name: `Synthetic ${index}` },
    }));
    const diffRows = Array.from({ length: 251 }, (_, index) => ({
      category: "scope" as const,
      changeType: "changed" as const,
      entityKey: `synthetic-${index}`,
      entityType: "milestone",
      field: "name",
      nextValue: `Synthetic ${index} revised`,
      priorValue: `Synthetic ${index}`,
    }));
    const { activationRevisionId, approvedRevisionId } = await fixture.base.run(
      async (ctx) => {
        const activationRevisionId = await ctx.db.insert(
          "activeBuildPlanningRevisions",
          {
            actorRoles: ["admin"],
            actorWorkosUserId: "user_admin",
            approvedAt: now,
            brokerageId: fixture.brokerageId,
            buildId: fixture.buildId,
            createdAt: now,
            diffCount: 0,
            kind: "activation",
            organizationId: ORGANIZATION_ID,
            reason: "Synthetic activation materialization test.",
            revision: 1,
            sourceCommand: "test",
            summary: "251 milestone(s)",
          },
        );
        const approvedRevisionId = await ctx.db.insert(
          "activeBuildPlanningRevisions",
          {
            actorRoles: ["admin"],
            actorWorkosUserId: "user_admin",
            approvedAt: now + 1,
            brokerageId: fixture.brokerageId,
            buildId: fixture.buildId,
            createdAt: now + 1,
            diffCount: diffRows.length,
            kind: "approved",
            organizationId: ORGANIZATION_ID,
            previousRevision: 1,
            reason: "Synthetic approved materialization test.",
            revision: 2,
            sourceCommand: "test",
            summary: "251 milestone(s)",
          },
        );
        for (const [chunkIndex, payload] of [
          entityRows.slice(0, 250),
          entityRows.slice(250),
        ].entries()) {
          await ctx.db.insert("activeBuildPlanningRevisionChunks", {
            brokerageId: fixture.brokerageId,
            buildId: fixture.buildId,
            chunkIndex,
            chunkKind: "entities",
            createdAt: now,
            organizationId: ORGANIZATION_ID,
            payloadJson: JSON.stringify(payload),
            revision: 1,
            revisionId: activationRevisionId,
          });
        }
        for (const [chunkIndex, payload] of [
          diffRows.slice(0, 250),
          diffRows.slice(250),
        ].entries()) {
          await ctx.db.insert("activeBuildPlanningRevisionChunks", {
            brokerageId: fixture.brokerageId,
            buildId: fixture.buildId,
            chunkIndex,
            chunkKind: "diffs",
            createdAt: now + 1,
            organizationId: ORGANIZATION_ID,
            payloadJson: JSON.stringify(payload),
            revision: 2,
            revisionId: approvedRevisionId,
          });
        }
        return { activationRevisionId, approvedRevisionId };
      },
    );

    const pending = await planningReconciliation(
      fixture.admin,
      String(fixture.buildId),
    );
    expect(pending.materializationPending).toBe(true);
    expect(
      pending.activation.snapshot.milestones.filter(
        (milestone: { entityKey: string }) =>
          milestone.entityKey.startsWith("synthetic-"),
      ),
    ).toHaveLength(251);
    expect(pending.diffs).toHaveLength(251);

    await fixture.base.mutation(
      (internal as any).build_collaboration_planning_reconciliation
        .materializeActiveBuildPlanningRevisionChunk,
      { revisionId: activationRevisionId },
    );
    await fixture.base.mutation(
      (internal as any).build_collaboration_planning_reconciliation
        .materializeActiveBuildPlanningRevisionChunk,
      { revisionId: approvedRevisionId },
    );
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());

    const completed = await planningReconciliation(
      fixture.admin,
      String(fixture.buildId),
    );
    expect(completed.materializationPending).toBe(false);
    expect(
      completed.activation.snapshot.milestones.filter(
        (milestone: { entityKey: string }) =>
          milestone.entityKey.startsWith("synthetic-"),
      ),
    ).toHaveLength(251);
    expect(completed.diffs).toHaveLength(251);
    expect(
      completed.revisions.find(
        (revision: { revision: number }) => revision.revision === 2,
      )?.diffCount,
    ).toBe(251);

    await fixture.base.mutation(
      (internal as any).build_collaboration_planning_reconciliation
        .materializeActiveBuildPlanningRevisionChunk,
      { revisionId: activationRevisionId },
    );
    const persistedCounts = await fixture.base.run(async (ctx) => ({
      chunks: (
        await ctx.db.query("activeBuildPlanningRevisionChunks").collect()
      ).length,
      diffs: (
        await ctx.db
          .query("activeBuildPlanningRevisionDiffs")
          .withIndex("by_revision", (query) =>
            query.eq("revisionId", approvedRevisionId),
          )
          .collect()
      ).length,
      entities: (
        await ctx.db
          .query("activeBuildPlanningRevisionEntities")
          .withIndex("by_revision", (query) =>
            query.eq("revisionId", activationRevisionId),
          )
          .collect()
      ).length,
    }));
    expect(persistedCounts).toEqual({ chunks: 0, diffs: 251, entities: 251 });
    vi.useRealTimers();
  });

  test("retries residual planning materialization through the canonical scheduler idempotently", async () => {
    vi.useFakeTimers();
    const fixture = await seedOperationalBuild();
    const now = Date.now();
    const revisionId = await fixture.base.run(async (ctx) => {
      const revisionId = await ctx.db.insert("activeBuildPlanningRevisions", {
        actorRoles: ["admin"],
        actorWorkosUserId: "user_admin",
        approvedAt: now,
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: now,
        diffCount: 0,
        kind: "activation",
        organizationId: ORGANIZATION_ID,
        reason: "Synthetic recovery retry test.",
        revision: 1,
        sourceCommand: "test",
        summary: "One milestone",
      });
      await ctx.db.insert("activeBuildPlanningRevisionChunks", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        chunkIndex: 0,
        chunkKind: "entities",
        createdAt: now,
        organizationId: ORGANIZATION_ID,
        payloadJson: JSON.stringify([
          {
            entityKey: "synthetic-0",
            entityType: "milestone",
            planningState: "active",
            snapshot: { name: "Synthetic 0" },
          },
        ]),
        revision: 1,
        revisionId,
      });
      return revisionId;
    });

    await fixture.base.mutation(
      (internal as any).build_collaboration_planning_reconciliation
        .recoverActiveBuildPlanningRevisionMaterialization,
      { asOf: now },
    );
    // Pending indexed recovery finds nothing for legacy chunks and schedules
    // the first legacy page on a separate mutation (Convex allows one
    // paginated query per function). Drain that handoff before asserting.
    await fixture.base.mutation(
      (internal as any).build_collaboration_planning_reconciliation
        .recoverActiveBuildPlanningRevisionMaterialization,
      {
        asOf: now,
        cursor: encodeURIComponent(
          JSON.stringify({ cursor: null, phase: "legacy" }),
        ),
      },
    );
    const scheduled = await fixture.base.run(async (ctx) =>
      (await ctx.db.get(revisionId))
        ? await ctx.db
            .query("activeBuildPlanningRevisionChunks")
            .withIndex("by_revision", (query) =>
              query.eq("revisionId", revisionId),
            )
            .take(1)
        : [],
    );
    expect(scheduled[0]).toMatchObject({
      materializationLastScheduledAt: now,
      materializationRecoveryAttemptCount: 1,
      materializationRecoveryState: "pending",
    });

    // A second sweep before the retry delay must not enqueue a duplicate
    // canonical materializer invocation.
    await fixture.base.mutation(
      (internal as any).build_collaboration_planning_reconciliation
        .recoverActiveBuildPlanningRevisionMaterialization,
      { asOf: now + 1 },
    );
    const stillOneAttempt = await fixture.base.run(
      async (ctx) =>
        (
          await ctx.db
            .query("activeBuildPlanningRevisionChunks")
            .withIndex("by_revision", (query) =>
              query.eq("revisionId", revisionId),
            )
            .take(1)
        )[0]?.materializationRecoveryAttemptCount,
    );
    expect(stillOneAttempt).toBe(1);

    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    const materialized = await fixture.base.run(async (ctx) => ({
      chunks: await ctx.db
        .query("activeBuildPlanningRevisionChunks")
        .withIndex("by_revision", (query) => query.eq("revisionId", revisionId))
        .take(10),
      entities: await ctx.db
        .query("activeBuildPlanningRevisionEntities")
        .withIndex("by_revision", (query) => query.eq("revisionId", revisionId))
        .take(10),
    }));
    expect(materialized.chunks).toHaveLength(0);
    expect(materialized.entities).toHaveLength(1);
  });

  test("exhausts planning materialization recovery once and emits the operational signal", async () => {
    const fixture = await seedOperationalBuild();
    const now = Date.now();
    const revisionId = await fixture.base.run(async (ctx) => {
      const revisionId = await ctx.db.insert("activeBuildPlanningRevisions", {
        actorRoles: ["admin"],
        actorWorkosUserId: "user_admin",
        approvedAt: now,
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: now,
        diffCount: 0,
        kind: "activation",
        organizationId: ORGANIZATION_ID,
        reason: "Synthetic recovery exhaustion test.",
        revision: 1,
        sourceCommand: "test",
        summary: "Malformed chunk",
      });
      await ctx.db.insert("activeBuildPlanningRevisionChunks", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        chunkIndex: 0,
        chunkKind: "entities",
        createdAt: now,
        organizationId: ORGANIZATION_ID,
        payloadJson: "{}",
        revision: 1,
        revisionId,
        materializationLastScheduledAt: now - 5 * 60 * 1000 - 1,
        materializationRecoveryAttemptCount: Number.MAX_SAFE_INTEGER,
        materializationRecoveryState: "pending",
      });
      return revisionId;
    });

    await fixture.base.mutation(
      (internal as any).build_collaboration_planning_reconciliation
        .recoverActiveBuildPlanningRevisionMaterialization,
      { asOf: now },
    );
    await fixture.base.mutation(
      (internal as any).build_collaboration_planning_reconciliation
        .recoverActiveBuildPlanningRevisionMaterialization,
      { asOf: now + 5 * 60 * 1000 + 1 },
    );

    const recoverySignal = await fixture.base.run(async (ctx) => ({
      audit: await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query.eq("entityType", "activeBuildPlanningRevision"),
        )
        .collect(),
      chunk: (
        await ctx.db
          .query("activeBuildPlanningRevisionChunks")
          .withIndex("by_revision", (query) =>
            query.eq("revisionId", revisionId),
          )
          .take(1)
      )[0],
      outbox: await ctx.db
        .query("eventOutbox")
        .withIndex("by_entity", (query) =>
          query
            .eq("relatedEntityType", "activeBuildPlanningRevision")
            .eq("relatedEntityId", String(revisionId)),
        )
        .collect(),
    }));
    expect(recoverySignal.chunk).toMatchObject({
      materializationRecoveryState: "exhausted",
    });
    expect(
      recoverySignal.audit.filter(
        (event) =>
          event.eventType ===
          "active_build.planning.materialization_recovery_exhausted",
      ),
    ).toHaveLength(1);
    expect(
      recoverySignal.outbox.filter(
        (event) =>
          event.eventType ===
          "active_build.planning.materialization_recovery_exhausted",
      ),
    ).toHaveLength(1);
  });
});
