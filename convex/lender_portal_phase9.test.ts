/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import migrationsTest from "@convex-dev/migrations/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "./fairLendConfig";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORG = "org_phase9_primary";
const OTHER_ORG = "org_phase9_other";
const CANDIDATE_SHA = "a".repeat(40);
const CONFIGURATION_HASH = "b".repeat(64);

function completeMigrationCounts(
  proposalStatusCounts: Partial<
    Record<"approved" | "closed" | "draft" | "submitted", number>
  > = {}
) {
  return {
    activeBuildCount: 0,
    approvalCount: 0,
    assignmentCount: 0,
    closingCount: 0,
    kanbanCardCount: 0,
    policyLockCount: 0,
    policyVersionCount: 0,
    projectionMismatchCount: 0,
    proposalCount: 0,
    proposalStatusCounts,
    reconciliationCandidateCount: 0,
    reconciliationPendingCount: 0,
    reviewCycleCount: 0,
    revisionCount: 0,
  };
}

beforeEach(() => {
  process.env.LENDER_PORTAL_RELEASE_CANDIDATE_SHA = CANDIDATE_SHA;
  process.env.LENDER_PORTAL_RELEASE_CONFIGURATION_HASH = CONFIGURATION_HASH;
});

afterEach(() => {
  delete process.env.LENDER_PORTAL_RELEASE_CANDIDATE_SHA;
  delete process.env.LENDER_PORTAL_RELEASE_CONFIGURATION_HASH;
});

function identity(subject: string, organizationId: string, role: string) {
  return {
    email: `${subject}@example.com`,
    name: subject,
    organizationId,
    role,
    roles: [role],
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  };
}

async function seedTenant(
  t: ReturnType<typeof convexTest>,
  input: { organizationId: string; role: string; subject: string }
) {
  const brokerageId = await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("brokerages", {
      createdAt: now,
      displayName: input.organizationId,
      legalName: `${input.organizationId} Inc.`,
      status: "active",
      updatedAt: now,
      workosOrganizationId: input.organizationId,
    });
  });

  // WorkOS projection tables are webhook-owned. Exercise the same AuthKit
  // projection seam used by existing lender portal product-flow tests.
  const now = new Date().toISOString();
  await t.mutation(internal.auth.authKitEvent, {
    data: {
      createdAt: now,
      domains: [],
      id: input.organizationId,
      name: input.organizationId,
      object: "organization",
      updatedAt: now,
    },
    event: "organization.created",
  });
  await t.mutation(internal.auth.authKitEvent, {
    data: {
      createdAt: now,
      email: `${input.subject}@example.com`,
      emailVerified: true,
      firstName: input.subject,
      id: input.subject,
      profilePictureUrl: null,
      updatedAt: now,
    },
    event: "user.created",
  });
  await t.mutation(internal.auth.authKitEvent, {
    data: {
      createdAt: now,
      directoryManaged: false,
      id: `phase9-membership-${input.subject}`,
      object: "organization_membership",
      organizationId: input.organizationId,
      role: { slug: input.role },
      roles: [{ slug: input.role }],
      status: "active",
      updatedAt: now,
      userId: input.subject,
    },
    event: "organization_membership.created",
  });

  return brokerageId;
}

async function configureDisabledRelease(
  t: ReturnType<typeof convexTest>,
  organizationId = ORG,
  subject = "phase9_admin"
) {
  return await t
    .withIdentity(identity(subject, organizationId, "admin"))
    .mutation(
      api.lender_portal_release.transitionLenderPortalRelease,
      {
        candidateSha: CANDIDATE_SHA,
        canaryRecipientWorkosUserIds: [],
        configurationHash: CONFIGURATION_HASH,
        expectedAccessRevision: 0,
        expectedStatus: "disabled",
        idempotencyKey: "phase9-configure-disabled",
        nextStatus: "disabled",
        organizationId,
        reason: "Bind the disabled tenant to the exact Phase 9 candidate.",
      }
    );
}

async function seedCurrentProposalNotificationFixture(
  t: ReturnType<typeof convexTest>,
  input: {
    brokerageId: any;
    legacyWithoutLenderContentSnapshot?: boolean;
    recipientWorkosUserIds: string[];
  }
) {
  const projectedAt = new Date().toISOString();
  await t.mutation(internal.auth.authKitEvent, {
    data: {
      createdAt: projectedAt,
      domains: [],
      id: FAIRLEND_WORKOS_ORGANIZATION_ID,
      name: "FairLend shared lender identity",
      object: "organization",
      updatedAt: projectedAt,
    },
    event: "organization.created",
  });
  for (const workosUserId of input.recipientWorkosUserIds) {
    await t.mutation(internal.auth.authKitEvent, {
      data: {
        createdAt: projectedAt,
        email: `${workosUserId}@example.com`,
        emailVerified: true,
        firstName: workosUserId,
        id: workosUserId,
        profilePictureUrl: null,
        updatedAt: projectedAt,
      },
      event: "user.created",
    });
    await t.mutation(internal.auth.authKitEvent, {
      data: {
        createdAt: projectedAt,
        directoryManaged: false,
        id: `phase9-lender-membership-${workosUserId}`,
        object: "organization_membership",
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        role: { slug: "lender" },
        roles: [{ slug: "lender" }],
        status: "active",
        updatedAt: projectedAt,
        userId: workosUserId,
      },
      event: "organization_membership.created",
    });
  }

  const fixture = await t.run(async (ctx) => {
    const now = Date.now();
    const builderProfileId = await ctx.db.insert("builderProfiles", {
      brokerageId: input.brokerageId,
      createdAt: now,
      displayName: "Phase 9 notification builder",
      organizationId: ORG,
      status: "active",
      updatedAt: now,
    });
    const lenderOrganizationId = await ctx.db.insert("lenderOrganizations", {
      brokerageId: input.brokerageId,
      createdAt: now,
      displayName: "Phase 9 notification lender",
      legalName: "Phase 9 notification lender Inc.",
      permissions: {
        drawDecisions: true,
        milestoneDecisions: true,
        proposalReview: true,
        siteVisitReview: true,
      },
      status: "active",
      updatedAt: now,
    });
    for (const workosUserId of input.recipientWorkosUserIds) {
      await ctx.db.insert("lenderOrganizationAssignments", {
        assignedAt: now,
        assignedByRole: "admin",
        assignedByWorkosUserId: "phase9_admin",
        brokerageId: input.brokerageId,
        lenderOrganizationId,
        normalizedEmail: `${workosUserId}@example.com`,
        reason: "Exercise current-recipient authorization before release.",
        status: "active",
        updatedAt: now,
        workosUserId,
      });
    }
    const proposalId = await ctx.db.insert("buildProposals", {
      approvedAt: now,
      backOfficeApprovedByWorkosUserId: "phase9_admin",
      borrowerCoPayBps: 0,
      borrowerWorkingCapitalLimitCents: 0,
      brokerageId: input.brokerageId,
      builderProfileId,
      buildName: "Phase 9 release-control proposal",
      createdAt: now,
      createdByWorkosUserId: "phase9_admin",
      lenderDrawPolicyLimitCents: 0,
      location: "Toronto",
      organizationId: ORG,
      reviewOutcome: "approved",
      status: "approved",
      totalBudgetCents: 100,
      updatedAt: now,
      updatedByWorkosUserId: "phase9_admin",
    });
    const assignmentId = await ctx.db.insert("proposalLenderAssignments", {
      assignedAt: now,
      assignedByRole: "admin",
      assignedByWorkosUserId: "phase9_admin",
      brokerageId: input.brokerageId,
      createdAt: now,
      lenderBrokerageId: input.brokerageId,
      lenderOrganizationId,
      lenderOrganizationName: "Phase 9 notification lender",
      organizationId: ORG,
      proposalId,
      status: "current",
    });
    const policy = {
      drawApprovalMode: "backoffice_only" as const,
      drawLenderQuorum: null,
      milestoneApprovalMode: "backoffice_only" as const,
      milestoneLenderQuorum: null,
      milestoneReceiptInvoiceRequired: false,
      milestoneSiteVisitRequired: false,
    };
    const policyVersionId = await ctx.db.insert("proposalReviewPolicyVersions", {
      brokerageId: input.brokerageId,
      configuredAt: now,
      configuredByRole: "admin",
      configuredByWorkosUserId: "phase9_admin",
      idempotencyKey: "phase9-release-notification-policy",
      organizationId: ORG,
      policy,
      proposalId,
      reason: "Exercise the canonical notification authorization path.",
      version: 1,
    });
    const revisionId = await ctx.db.insert("proposalRevisions", {
      assignmentId,
      backOfficeApprovedByWorkosUserId: "phase9_admin",
      brokerageId: input.brokerageId,
      changedCheckpoints: [],
      checkpoints: {
        accessReviewPolicy: policy,
        budget: { totalBudgetCents: 100 },
        builder: {
          builderProfileId,
          displayName: "Phase 9 notification builder",
        },
        milestoneCount: { count: 0 },
        scheduleTimeline: {
          milestonesFingerprint: "phase9-release-notification",
          proposedStartDate: null,
          timelineRangeMax: null,
          timelineRangeMin: null,
        },
      },
      createdAt: now,
      createdByRole: "admin",
      createdByWorkosUserId: "phase9_admin",
      idempotencyKey: "phase9-release-notification-revision",
      organizationId: ORG,
      proposalId,
      reason: "Exercise the canonical notification authorization path.",
      revisionNumber: 1,
      reviewPolicyVersionId: policyVersionId,
    });
    await ctx.db.patch(proposalId, {
      currentProposalRevisionId: revisionId,
      currentProposalRevisionNumber: 1,
      currentReviewPolicyVersionId: policyVersionId,
    });
    const confirmationCycleId = await ctx.db.insert(
      "proposalLenderConfirmationCycles",
      {
        assignmentId,
        brokerageId: input.brokerageId,
        createdAt: now,
        cycleNumber: 1,
        openedAt: now,
        organizationId: ORG,
        proposalId,
        proposalRevisionId: revisionId,
        proposalRevisionNumber: 1,
        status: "pending",
      }
    );
    return {
      assignmentId,
      confirmationCycleId,
      lenderOrganizationId,
      proposalId,
      proposalRevisionId: revisionId,
      proposalRevisionNumber: 1,
    };
  });
  if (!input.legacyWithoutLenderContentSnapshot) {
    await insertCompleteLenderContentSnapshot(t, fixture);
  }
  return fixture;
}

async function insertCompleteLenderContentSnapshot(
  t: ReturnType<typeof convexTest>,
  fixture: Awaited<ReturnType<typeof seedCurrentProposalNotificationFixture>>
) {
  await t.run(async (ctx) => {
    const [proposal, revision] = await Promise.all([
      ctx.db.get(fixture.proposalId),
      ctx.db.get(fixture.proposalRevisionId),
    ]);
    if (!proposal || !revision || !proposal.builderProfileId) {
      throw new Error("Expected a complete proposal revision fixture.");
    }
    const builder = await ctx.db.get(proposal.builderProfileId);
    if (!builder) {
      throw new Error("Expected a Builder fixture.");
    }
    await ctx.db.insert("proposalRevisionLenderContentSnapshots", {
      activeBuild: null,
      assignment: {
        builder: {
          _id: builder._id,
          displayName: builder.displayName,
          status: builder.status,
        },
        builderAssigned: true,
      },
      brokerageId: proposal.brokerageId,
      counts: {
        costItems: 0,
        documents: 0,
        draws: 0,
        milestones: 0,
        submilestones: 0,
      },
      organizationId: proposal.organizationId,
      permitWaiver: null,
      proposal: {
        _id: proposal._id,
        borrowerCoPayBps: proposal.borrowerCoPayBps,
        borrowerStartingCashCents: proposal.borrowerStartingCashCents ?? 0,
        borrowerWorkingCapitalLimitCents:
          proposal.borrowerWorkingCapitalLimitCents,
        builderProfileId: proposal.builderProfileId,
        buildName: proposal.buildName,
        createdAt: proposal.createdAt,
        createdByWorkosUserId: proposal.createdByWorkosUserId,
        currentProposalRevisionId: revision._id,
        currentProposalRevisionNumber: revision.revisionNumber,
        currentReviewPolicyVersionId: revision.reviewPolicyVersionId,
        lenderDrawPolicyLimitCents: proposal.lenderDrawPolicyLimitCents,
        location: proposal.location,
        reviewOutcome: proposal.reviewOutcome,
        status: proposal.status,
        totalBudgetCents: proposal.totalBudgetCents,
        updatedAt: proposal.updatedAt,
        updatedByWorkosUserId: proposal.updatedByWorkosUserId,
      },
      proposalId: proposal._id,
      revisionId: revision._id,
    });
  });
}

async function seedCompleteLenderSnapshotChildren(
  t: ReturnType<typeof convexTest>,
  fixture: Awaited<ReturnType<typeof seedCurrentProposalNotificationFixture>>
) {
  return await t.run(async (ctx) => {
    const [proposal, revision, root] = await Promise.all([
      ctx.db.get(fixture.proposalId),
      ctx.db.get(fixture.proposalRevisionId),
      ctx.db
        .query("proposalRevisionLenderContentSnapshots")
        .filter((query) =>
          query.eq(query.field("revisionId"), fixture.proposalRevisionId)
        )
        .unique(),
    ]);
    if (!proposal || !revision || !root) {
      throw new Error("Expected a complete lender snapshot fixture.");
    }
    const now = Date.now();
    const scope = {
      brokerageId: proposal.brokerageId,
      organizationId: proposal.organizationId,
      proposalId: proposal._id,
    };
    const sourceDocumentId = await ctx.db.insert("proposalDocuments", {
      ...scope,
      createdAt: now,
      documentType: "permit",
      fileName: "phase9-permit.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
      status: "uploaded",
      updatedAt: now,
      uploadedByWorkosUserId: "phase9_admin",
    });
    const sourceMilestoneId = await ctx.db.insert("proposalMilestones", {
      ...scope,
      budgetCents: 100,
      createdAt: now,
      dayEnd: 5,
      dayStart: 0,
      dependencyKeys: [],
      drawAvailabilityCents: 100,
      durationDays: 5,
      key: "phase9-foundation",
      name: "Phase 9 foundation",
      order: 1,
      updatedAt: now,
    });
    const sourceSubmilestoneId = await ctx.db.insert("proposalSubmilestones", {
      ...scope,
      budgetCents: 100,
      createdAt: now,
      durationDays: 5,
      key: "phase9-forms",
      milestoneKey: "phase9-foundation",
      name: "Phase 9 forms",
      order: 1,
      proposalMilestoneId: sourceMilestoneId,
      startDay: 0,
      updatedAt: now,
    });
    const sourceCostItemId = await ctx.db.insert("proposalCostItems", {
      ...scope,
      budgetTreatment: "logOnly",
      costCents: 100,
      createdAt: now,
      createdByWorkosUserId: "phase9_admin",
      itemKey: "phase9-concrete",
      itemType: "material",
      milestoneKey: "phase9-foundation",
      proposalMilestoneId: sourceMilestoneId,
      quantity: 1,
      relevantSubmilestoneKeys: ["phase9-forms"],
      title: "Phase 9 concrete",
      updatedAt: now,
      updatedByWorkosUserId: "phase9_admin",
    });
    const sourceDrawId = await ctx.db.insert("proposalDrawScheduleRows", {
      ...scope,
      amountCents: 100,
      createdAt: now,
      drawKey: "phase9-draw",
      label: "Phase 9 reimbursement",
      milestoneKey: "phase9-foundation",
      order: 1,
      proposalMilestoneId: sourceMilestoneId,
      source: "milestone",
      timingDay: 5,
      updatedAt: now,
    });
    const snapshotScope = { ...scope, revisionId: revision._id };
    const documentId = await ctx.db.insert("proposalRevisionLenderDocuments", {
      ...snapshotScope,
      createdAt: now,
      documentType: "permit",
      fileName: "phase9-permit.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
      sourceDocumentId,
      status: "uploaded",
      storageUrl: null,
      updatedAt: now,
      uploadedByWorkosUserId: "phase9_admin",
    });
    const milestoneId = await ctx.db.insert("proposalRevisionLenderMilestones", {
      ...snapshotScope,
      budgetCents: 100,
      createdAt: now,
      dayEnd: 5,
      dayStart: 0,
      dependencyKeys: [],
      drawAvailabilityCents: 100,
      durationDays: 5,
      key: "phase9-foundation",
      name: "Phase 9 foundation",
      order: 1,
      sourceMilestoneId,
      updatedAt: now,
    });
    const submilestoneId = await ctx.db.insert(
      "proposalRevisionLenderSubmilestones",
      {
        ...snapshotScope,
        budgetCents: 100,
        createdAt: now,
        durationDays: 5,
        key: "phase9-forms",
        milestoneKey: "phase9-foundation",
        name: "Phase 9 forms",
        order: 1,
        proposalMilestoneId: sourceMilestoneId,
        sourceSubmilestoneId,
        startDay: 0,
        updatedAt: now,
      }
    );
    const costItemId = await ctx.db.insert("proposalRevisionLenderCostItems", {
      ...snapshotScope,
      budgetTreatment: "logOnly",
      costCents: 100,
      createdAt: now,
      createdByWorkosUserId: "phase9_admin",
      itemKey: "phase9-concrete",
      itemType: "material",
      milestoneKey: "phase9-foundation",
      proposalMilestoneId: sourceMilestoneId,
      quantity: 1,
      relevantSubmilestoneKeys: ["phase9-forms"],
      sourceCostItemId,
      title: "Phase 9 concrete",
      updatedAt: now,
      updatedByWorkosUserId: "phase9_admin",
    });
    const drawId = await ctx.db.insert("proposalRevisionLenderDraws", {
      ...snapshotScope,
      amountCents: 100,
      createdAt: now,
      drawKey: "phase9-draw",
      label: "Phase 9 reimbursement",
      milestoneKey: "phase9-foundation",
      order: 1,
      source: "milestone",
      sourceDrawId,
      timingDay: 5,
      updatedAt: now,
    });
    await ctx.db.patch(root._id, {
      counts: {
        costItems: 1,
        documents: 1,
        draws: 1,
        milestones: 1,
        submilestones: 1,
      },
    });
    await ctx.db.patch(revision._id, {
      checkpoints: {
        ...revision.checkpoints,
        milestoneCount: { count: 1 },
      },
    });
    return {
      costItemId,
      documentId,
      drawId,
      milestoneId,
      rootId: root._id as Id<"proposalRevisionLenderContentSnapshots">,
      sourceCostItemId,
      sourceDrawId,
      sourceMilestoneId,
      sourceSubmilestoneId,
      submilestoneId,
    };
  });
}

async function insertLenderPortalIntent(
  t: ReturnType<typeof convexTest>,
  input: {
    brokerageId: any;
    createdAt?: number;
    idempotencyKey: string;
    organizationId?: string;
    recipientWorkosUserId: string;
    proposalCorrelation?: Awaited<
      ReturnType<typeof seedCurrentProposalNotificationFixture>
    >;
    status?: "pending" | "dispatching" | "retry_scheduled";
  }
) {
  return await t.run(async (ctx) => {
    const now = input.createdAt ?? Date.now();
    return await ctx.db.insert("communicationIntents", {
      attemptCount: input.status === "dispatching" ? 1 : 0,
      brokerageId: input.brokerageId,
      channel: "email",
      createdAt: now,
      idempotencyKey: input.idempotencyKey,
      kind: "lender_portal_approval_required",
      nextAttemptAt: now - 1,
      organizationId: input.organizationId ?? ORG,
      payloadSnapshot: JSON.stringify({
        assignmentId: input.proposalCorrelation
          ? String(input.proposalCorrelation.assignmentId)
          : undefined,
        audience: "lender",
        confirmationCycleId: input.proposalCorrelation
          ? String(input.proposalCorrelation.confirmationCycleId)
          : undefined,
        eventClass: "approval-required",
        lenderOrganizationId: input.proposalCorrelation
          ? String(input.proposalCorrelation.lenderOrganizationId)
          : undefined,
        linkPath: "/lender/proposals/example",
        proposalId: input.proposalCorrelation
          ? String(input.proposalCorrelation.proposalId)
          : undefined,
        proposalRevisionId: input.proposalCorrelation
          ? String(input.proposalCorrelation.proposalRevisionId)
          : undefined,
        proposalRevisionNumber:
          input.proposalCorrelation?.proposalRevisionNumber,
        recipientWorkosUserId: input.recipientWorkosUserId,
        resourceKind: "proposal",
        title: "Phase 9 test",
      }),
      recipientEmailSnapshot: `${input.recipientWorkosUserId}@example.com`,
      relatedEntityId: input.proposalCorrelation
        ? String(input.proposalCorrelation.proposalId)
        : "phase9-resource",
      relatedEntityType: "proposal",
      status: input.status ?? "pending",
      templateKey: "lender_portal_approval_required_v1",
      updatedAt: now,
    });
  });
}

async function runMigration(
  t: ReturnType<typeof convexTest>,
  name:
    | "backfillLegacyProposalLenderAssignmentOrganizations"
    | "backfillProposalPhase3PolicyAndRevision"
    | "validateLenderPortalPhase9ApplyManifest"
    | "reconcileLenderPortalPhase9PolicyAssignmentFacts"
    | "reconcileLenderPortalPhase9ApprovalFacts"
    | "reconcileLenderPortalPhase9PolicyLocks"
    | "reconcileLenderPortalProposalLifecycle"
    | "rebuildLenderPortalProposalKanbanProjection",
  dryRun = false
) {
  let cursor: string | null = null;
  let isDone = false;
  while (!isDone) {
    const result: { continueCursor: string; isDone: boolean } =
      await t.mutation(internal.migrations[name], {
        batchSize: 25,
        cursor,
        dryRun,
        oneBatchOnly: true,
      });
    cursor = result.continueCursor;
    isDone = result.isDone;
  }
}

async function runPhase9MigrationRunner(t: ReturnType<typeof convexTest>) {
  await t.mutation(
    internal.migrations.runLenderPortalPhase9Migration,
    { batchSize: 25, reset: true }
  );
  // Each migration in the registered series schedules the next component
  // step. Drain one level per step so the test exercises the shipped runner.
  for (let step = 0; step < 8; step += 1) {
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  }
}

describe("Lender Portal Phase 9 release control", () => {
  test("fails safe, enforces current operator membership, and isolates tenants", async () => {
    const t = convexTest(schema, modules);
    await seedTenant(t, {
      organizationId: ORG,
      role: "admin",
      subject: "phase9_admin",
    });
    await seedTenant(t, {
      organizationId: OTHER_ORG,
      role: "admin",
      subject: "phase9_other_admin",
    });
    await seedTenant(t, {
      organizationId: "org_phase9_broker",
      role: "broker",
      subject: "phase9_broker",
    });

    const admin = t.withIdentity(identity("phase9_admin", ORG, "admin"));
    await expect(
      admin.query(
        api.lender_portal_release.getLenderPortalReleaseState,
        { organizationId: ORG }
      )
    ).resolves.toEqual({
      accessRevision: 0,
      available: false,
      candidateSha: undefined,
      canaryRecipientCount: 0,
      configurationHash: undefined,
      status: "disabled",
      updatedAt: undefined,
    });
    await expect(
      t.withIdentity(identity("phase9_other_admin", OTHER_ORG, "admin")).query(
        api.lender_portal_release.getLenderPortalReleaseState,
        { organizationId: ORG }
      )
    ).rejects.toThrow("tenant context");
    await expect(
      t.withIdentity(
        identity("phase9_broker", "org_phase9_broker", "broker")
      ).mutation(
        api.lender_portal_release.transitionLenderPortalRelease,
        {
          candidateSha: CANDIDATE_SHA,
          canaryRecipientWorkosUserIds: [],
          configurationHash: CONFIGURATION_HASH,
          expectedAccessRevision: 0,
          expectedStatus: "disabled",
          idempotencyKey: "forbidden-broker",
          nextStatus: "disabled",
          organizationId: "org_phase9_broker",
          reason: "A broker must not operate release controls.",
        }
      )
    ).rejects.toThrow("administrator or principal broker");
    await expect(
      t.withIdentity(identity("phase9_admin", ORG, "principle-broker")).query(
        api.lender_portal_release.getLenderPortalReleaseState,
        { organizationId: ORG }
      )
    ).rejects.toThrow("administrator or principal broker");

    const now = new Date().toISOString();
    await t.mutation(internal.auth.authKitEvent, {
      data: {
        createdAt: now,
        directoryManaged: false,
        id: "phase9-membership-phase9_admin",
        object: "organization_membership",
        organizationId: ORG,
        role: { slug: "admin" },
        roles: [{ slug: "admin" }],
        status: "inactive",
        updatedAt: now,
        userId: "phase9_admin",
      },
      event: "organization_membership.updated",
    });
    await expect(
      admin.query(
        api.lender_portal_release.getLenderPortalReleaseState,
        { organizationId: ORG }
      )
    ).rejects.toThrow("administrator or principal broker");
    await t.mutation(internal.auth.authKitEvent, {
      data: {
        createdAt: now,
        directoryManaged: false,
        id: "phase9-membership-phase9_admin",
        object: "organization_membership",
        organizationId: ORG,
        role: { slug: "admin" },
        roles: [{ slug: "admin" }],
        status: "active",
        updatedAt: now,
        userId: "phase9_admin",
      },
      event: "organization_membership.updated",
    });
    await t.mutation(internal.auth.authKitEvent, {
      data: { id: ORG },
      event: "organization.deleted",
    });
    await expect(
      admin.query(
        api.lender_portal_release.getLenderPortalReleaseState,
        { organizationId: ORG }
      )
    ).rejects.toThrow("administrator or principal broker");
  });

  test("blocks tenant release until legacy current revisions have immutable lender snapshots", async () => {
    const t = convexTest(schema, modules);
    const brokerageId = await seedTenant(t, {
      organizationId: ORG,
      role: "admin",
      subject: "phase9_admin",
    });
    const fixture = await seedCurrentProposalNotificationFixture(t, {
      brokerageId,
      legacyWithoutLenderContentSnapshot: true,
      recipientWorkosUserIds: ["allowed_recipient"],
    });
    const admin = t.withIdentity(identity("phase9_admin", ORG, "admin"));
    await configureDisabledRelease(t);

    const canaryInput = {
      candidateSha: CANDIDATE_SHA,
      canaryRecipientWorkosUserIds: ["allowed_recipient"],
      configurationHash: CONFIGURATION_HASH,
      expectedAccessRevision: 1,
      expectedStatus: "disabled" as const,
      idempotencyKey: "phase9-legacy-snapshot-canary",
      nextStatus: "canary" as const,
      organizationId: ORG,
      reason: "Release only after immutable lender snapshot readiness.",
    };
    await expect(
      admin.mutation(
        api.lender_portal_release.transitionLenderPortalRelease,
        canaryInput
      )
    ).rejects.toThrow("must be republished through the canonical Back Office");
    await expect(
      admin.query(api.lender_portal_release.getLenderPortalReleaseState, {
        organizationId: ORG,
      })
    ).resolves.toMatchObject({ accessRevision: 1, status: "disabled" });

    await expect(
      admin.mutation(api.production_proposals.publishProposalRevision, {
        expectedAssignmentId: fixture.assignmentId,
        expectedProposalRevisionNumber: fixture.proposalRevisionNumber,
        idempotencyKey: "phase9-legacy-snapshot-republish",
        proposalId: fixture.proposalId,
        reason: "Publish a reviewed revision with immutable lender content.",
        workosOrganizationId: ORG,
      })
    ).resolves.toMatchObject({ revisionNumber: 2 });
    await expect(
      admin.mutation(
        api.lender_portal_release.transitionLenderPortalRelease,
        canaryInput
      )
    ).resolves.toMatchObject({ accessRevision: 2, status: "canary" });
  }, 30_000);

  test("keeps release disabled for every malformed lender snapshot child class", async () => {
    const t = convexTest(schema, modules);
    const brokerageId = await seedTenant(t, {
      organizationId: ORG,
      role: "admin",
      subject: "phase9_admin",
    });
    const fixture = await seedCurrentProposalNotificationFixture(t, {
      brokerageId,
      recipientWorkosUserIds: ["allowed_recipient"],
    });
    const rows = await seedCompleteLenderSnapshotChildren(t, fixture);
    const admin = t.withIdentity(identity("phase9_admin", ORG, "admin"));
    await configureDisabledRelease(t);
    let attempt = 0;
    const expectBlocked = async (label: string) => {
      attempt += 1;
      await expect(
        admin.mutation(api.lender_portal_release.transitionLenderPortalRelease, {
          candidateSha: CANDIDATE_SHA,
          canaryRecipientWorkosUserIds: ["allowed_recipient"],
          configurationHash: CONFIGURATION_HASH,
          expectedAccessRevision: 1,
          expectedStatus: "disabled",
          idempotencyKey: `phase9-malformed-snapshot-${attempt}-${label}`,
          nextStatus: "canary",
          organizationId: ORG,
          reason: `Reject the ${label} lender snapshot fixture.`,
        })
      ).rejects.toThrow("must be republished through the canonical Back Office");
      await expect(
        admin.query(api.lender_portal_release.getLenderPortalReleaseState, {
          organizationId: ORG,
        })
      ).resolves.toMatchObject({ accessRevision: 1, status: "disabled" });
    };

    const duplicateSnapshotChild = async (input: {
      countKey: "costItems" | "draws" | "submilestones";
      snapshotId: any;
      snapshotTable:
        | "proposalRevisionLenderCostItems"
        | "proposalRevisionLenderDraws"
        | "proposalRevisionLenderSubmilestones";
      sourceField:
        | "sourceCostItemId"
        | "sourceDrawId"
        | "sourceSubmilestoneId";
      sourceId: any;
      sourceTable:
        | "proposalCostItems"
        | "proposalDrawScheduleRows"
        | "proposalSubmilestones";
    }) =>
      await t.run(async (ctx: any) => {
        const [root, snapshotRow, sourceRow] = await Promise.all([
          ctx.db.get(rows.rootId),
          ctx.db.get(input.snapshotId),
          ctx.db.get(input.sourceId),
        ]);
        if (!root || !snapshotRow || !sourceRow) {
          throw new Error("Missing duplicate-key lender snapshot fixture.");
        }
        const {
          _creationTime: sourceCreationTime,
          _id: sourceId,
          ...sourceValue
        } = sourceRow;
        void sourceCreationTime;
        void sourceId;
        const duplicateSourceId = await ctx.db.insert(
          input.sourceTable,
          sourceValue,
        );
        const {
          _creationTime: snapshotCreationTime,
          _id: snapshotId,
          ...snapshotValue
        } = snapshotRow;
        void snapshotCreationTime;
        void snapshotId;
        const duplicateSnapshotId = await ctx.db.insert(input.snapshotTable, {
          ...snapshotValue,
          [input.sourceField]: duplicateSourceId,
        });
        await ctx.db.patch(root._id, {
          counts: {
            ...root.counts,
            [input.countKey]: root.counts[input.countKey] + 1,
          },
        });
        return { duplicateSnapshotId, duplicateSourceId };
      });
    const removeDuplicateSnapshotChild = async (input: {
      countKey: "costItems" | "draws" | "submilestones";
      duplicateSnapshotId: any;
      duplicateSourceId: any;
    }) => {
      await t.run(async (ctx: any) => {
        const root = await ctx.db.get(rows.rootId);
        if (!root) {
          throw new Error("Missing lender snapshot root fixture.");
        }
        await ctx.db.delete(input.duplicateSnapshotId);
        await ctx.db.delete(input.duplicateSourceId);
        await ctx.db.patch(root._id, {
          counts: {
            ...root.counts,
            [input.countKey]: root.counts[input.countKey] - 1,
          },
        });
      });
    };

    const policyVersionId = await t.run(async (ctx) => {
      const revision = await ctx.db.get(fixture.proposalRevisionId);
      if (!revision) throw new Error("Missing proposal revision fixture.");
      await ctx.db.patch(revision.reviewPolicyVersionId, {
        organizationId: OTHER_ORG,
      });
      return revision.reviewPolicyVersionId;
    });
    await expectBlocked("foreign-policy-scope");
    await t.run(async (ctx) => {
      await ctx.db.patch(policyVersionId, { organizationId: ORG });
    });

    const policyLockId = await t.run(async (ctx) => {
      const [assignment, policyVersion, revision, root] = await Promise.all([
        ctx.db.get(fixture.assignmentId),
        ctx.db.get(policyVersionId),
        ctx.db.get(fixture.proposalRevisionId),
        ctx.db.get(rows.rootId),
      ]);
      if (!assignment || !policyVersion || !revision || !root) {
        throw new Error("Missing policy-lock lender snapshot fixture.");
      }
      const lockId = await ctx.db.insert("proposalReviewPolicyLocks", {
        activeLenderMemberCount: 1,
        assignmentId: assignment._id,
        brokerageId,
        idempotencyKey: "phase9-malformed-policy-lock",
        lenderOrganizationId: fixture.lenderOrganizationId,
        lockedAt: Date.now(),
        lockedByRole: "admin",
        lockedByWorkosUserId: "phase9_admin",
        organizationId: ORG,
        policy: policyVersion.policy,
        policyVersionId: policyVersion._id,
        proposalId: fixture.proposalId,
        proposalRevisionId: revision._id,
        proposalRevisionNumber: revision.revisionNumber + 1,
        reason: "Prove malformed policy locks block release.",
      });
      await ctx.db.patch(root._id, {
        proposal: { ...root.proposal, lockedReviewPolicyId: lockId },
      });
      return lockId;
    });
    await expectBlocked("policy-lock-revision-mismatch");
    await t.run(async (ctx) => {
      const root = await ctx.db.get(rows.rootId);
      if (!root) throw new Error("Missing lender snapshot root fixture.");
      const { lockedReviewPolicyId: ignored, ...proposalWithoutLock } =
        root.proposal;
      void ignored;
      await ctx.db.patch(root._id, { proposal: proposalWithoutLock });
      await ctx.db.delete(policyLockId);
    });

    const activeBuildId = await t.run(async (ctx) => {
      const [proposal, root] = await Promise.all([
        ctx.db.get(fixture.proposalId),
        ctx.db.get(rows.rootId),
      ]);
      if (!proposal?.builderProfileId || !root) {
        throw new Error("Missing active Build lender snapshot fixture.");
      }
      const now = Date.now();
      const workflowRuleId = await ctx.db.insert("workflowRules", {
        allowPermitWaiverByRoles: [],
        brokerageId,
        createdAt: now,
        organizationId: ORG,
        proposalStates: [],
        requirePermitForApproval: false,
        ruleKey: "phase9-snapshot-build",
        settings: {},
        status: "active",
        updatedAt: now,
        version: 1,
      });
      const workflowRuleSnapshotId = await ctx.db.insert(
        "workflowRuleSnapshots",
        {
          allowPermitWaiverByRoles: [],
          brokerageId,
          createdAt: now,
          organizationId: ORG,
          proposalId: proposal._id,
          proposalStates: [],
          requirePermitForApproval: false,
          ruleKey: "phase9-snapshot-build",
          settings: {},
          version: 1,
          workflowRuleId,
        },
      );
      const buildId = await ctx.db.insert("activeBuilds", {
        brokerageId,
        builderProfileId: proposal.builderProfileId,
        buildName: proposal.buildName,
        createdAt: now,
        location: proposal.location,
        organizationId: ORG,
        proposalId: proposal._id,
        startDate: "2027-01-01",
        status: "active",
        timezone: "America/Toronto",
        totalBudgetCents: proposal.totalBudgetCents,
        updatedAt: now,
        workflowRuleSnapshotId,
      });
      await ctx.db.patch(root._id, {
        activeBuild: {
          _id: buildId,
          startDate: "2027-01-01",
          status: "future_start",
          timezone: "America/Toronto",
        },
        proposal: { ...root.proposal, activeBuildId: buildId },
      });
      return buildId;
    });
    await expectBlocked("active-build-status-mismatch");
    await t.run(async (ctx) => {
      const root = await ctx.db.get(rows.rootId);
      if (!root) throw new Error("Missing lender snapshot root fixture.");
      const { activeBuildId: ignored, ...proposalWithoutBuild } = root.proposal;
      void ignored;
      await ctx.db.patch(root._id, {
        activeBuild: null,
        proposal: proposalWithoutBuild,
      });
      await ctx.db.delete(activeBuildId);
    });

    for (const duplicate of [
      {
        countKey: "submilestones" as const,
        label: "duplicate-submilestone-key",
        snapshotId: rows.submilestoneId,
        snapshotTable: "proposalRevisionLenderSubmilestones" as const,
        sourceField: "sourceSubmilestoneId" as const,
        sourceId: rows.sourceSubmilestoneId,
        sourceTable: "proposalSubmilestones" as const,
      },
      {
        countKey: "costItems" as const,
        label: "duplicate-cost-item-key",
        snapshotId: rows.costItemId,
        snapshotTable: "proposalRevisionLenderCostItems" as const,
        sourceField: "sourceCostItemId" as const,
        sourceId: rows.sourceCostItemId,
        sourceTable: "proposalCostItems" as const,
      },
      {
        countKey: "draws" as const,
        label: "duplicate-draw-key",
        snapshotId: rows.drawId,
        snapshotTable: "proposalRevisionLenderDraws" as const,
        sourceField: "sourceDrawId" as const,
        sourceId: rows.sourceDrawId,
        sourceTable: "proposalDrawScheduleRows" as const,
      },
    ]) {
      const inserted = await duplicateSnapshotChild(duplicate);
      await expectBlocked(duplicate.label);
      await removeDuplicateSnapshotChild({ ...duplicate, ...inserted });
    }

    const deletedDocument = await t.run(async (ctx) => {
      const row = await ctx.db.get(rows.documentId);
      if (!row) throw new Error("Missing document snapshot fixture.");
      const { _creationTime, _id, ...value } = row;
      await ctx.db.delete(row._id);
      return value;
    });
    await expectBlocked("missing-document");
    await t.run(async (ctx) => {
      await ctx.db.insert("proposalRevisionLenderDocuments", deletedDocument);
    });

    await t.run(async (ctx) => {
      const root = await ctx.db.get(rows.rootId);
      if (!root) throw new Error("Missing lender snapshot root fixture.");
      await ctx.db.patch(root._id, {
        counts: { ...root.counts, documents: 2 },
      });
    });
    await expectBlocked("wrong-child-count");
    await t.run(async (ctx) => {
      const root = await ctx.db.get(rows.rootId);
      if (!root) throw new Error("Missing lender snapshot root fixture.");
      await ctx.db.patch(root._id, {
        counts: { ...root.counts, documents: 1 },
      });
      await ctx.db.patch(rows.milestoneId, { dependencyKeys: ["foreign-key"] });
    });
    await expectBlocked("tampered-milestone-link");
    await t.run(async (ctx) => {
      await ctx.db.patch(rows.milestoneId, { dependencyKeys: [] });
      await ctx.db.patch(rows.submilestoneId, { organizationId: OTHER_ORG });
    });
    await expectBlocked("unscoped-submilestone");

    const sourceCostItemId = await t.run(async (ctx) => {
      await ctx.db.patch(rows.submilestoneId, { organizationId: ORG });
      const proposal = await ctx.db.get(fixture.proposalId);
      if (!proposal) throw new Error("Missing proposal fixture.");
      const { _creationTime, _id, ...proposalValue } = proposal;
      const foreignProposalId = await ctx.db.insert("buildProposals", {
        ...proposalValue,
        buildName: "Foreign lender snapshot proposal",
        organizationId: OTHER_ORG,
      });
      const foreignMilestoneId = await ctx.db.insert("proposalMilestones", {
        brokerageId,
        budgetCents: 1,
        createdAt: Date.now(),
        dayEnd: 1,
        dayStart: 0,
        dependencyKeys: [],
        drawAvailabilityCents: 1,
        durationDays: 1,
        key: "foreign-milestone",
        name: "Foreign milestone",
        order: 1,
        organizationId: OTHER_ORG,
        proposalId: foreignProposalId,
        updatedAt: Date.now(),
      });
      return await ctx.db.insert("proposalCostItems", {
        brokerageId,
        costCents: 1,
        createdAt: Date.now(),
        createdByWorkosUserId: "phase9_admin",
        itemKey: "foreign-cost",
        itemType: "material",
        milestoneKey: "foreign-milestone",
        organizationId: OTHER_ORG,
        proposalId: foreignProposalId,
        proposalMilestoneId: foreignMilestoneId,
        quantity: 1,
        relevantSubmilestoneKeys: [],
        title: "Foreign cost",
        updatedAt: Date.now(),
        updatedByWorkosUserId: "phase9_admin",
      });
    });
    const originalSourceCostItemId = await t.run(async (ctx) => {
      const row = await ctx.db.get(rows.costItemId);
      if (!row) throw new Error("Missing cost snapshot fixture.");
      await ctx.db.patch(row._id, { sourceCostItemId });
      return row.sourceCostItemId;
    });
    await expectBlocked("foreign-cost-source");
    await t.run(async (ctx) => {
      await ctx.db.patch(rows.costItemId, { sourceCostItemId: originalSourceCostItemId });
      await ctx.db.patch(rows.drawId, { milestoneKey: "foreign-key" });
    });
    await expectBlocked("tampered-draw-parent");
    await t.run(async (ctx) => {
      await ctx.db.patch(rows.drawId, { milestoneKey: "phase9-foundation" });
    });

    await expect(
      admin.mutation(api.lender_portal_release.transitionLenderPortalRelease, {
        candidateSha: CANDIDATE_SHA,
        canaryRecipientWorkosUserIds: ["allowed_recipient"],
        configurationHash: CONFIGURATION_HASH,
        expectedAccessRevision: 1,
        expectedStatus: "disabled",
        idempotencyKey: "phase9-complete-snapshot-canary",
        nextStatus: "canary",
        organizationId: ORG,
        reason: "Enable only after every lender snapshot child is valid.",
      })
    ).resolves.toMatchObject({ accessRevision: 2, status: "canary" });
  }, 30_000);

  test("keeps release disabled for current assignment and revision scope mismatches", async () => {
    const t = convexTest(schema, modules);
    const brokerageId = await seedTenant(t, {
      organizationId: ORG,
      role: "admin",
      subject: "phase9_admin",
    });
    const foreignBrokerageId = await seedTenant(t, {
      organizationId: OTHER_ORG,
      role: "admin",
      subject: "phase9_other_admin",
    });
    const fixture = await seedCurrentProposalNotificationFixture(t, {
      brokerageId,
      recipientWorkosUserIds: ["allowed_recipient"],
    });
    const admin = t.withIdentity(identity("phase9_admin", ORG, "admin"));
    await configureDisabledRelease(t);
    let attempt = 0;
    const expectBlocked = async (label: string) => {
      attempt += 1;
      await expect(
        admin.mutation(api.lender_portal_release.transitionLenderPortalRelease, {
          candidateSha: CANDIDATE_SHA,
          canaryRecipientWorkosUserIds: ["allowed_recipient"],
          configurationHash: CONFIGURATION_HASH,
          expectedAccessRevision: 1,
          expectedStatus: "disabled",
          idempotencyKey: `phase9-scope-mismatch-${attempt}-${label}`,
          nextStatus: "canary",
          organizationId: ORG,
          reason: `Reject the ${label} current assignment fixture.`,
        })
      ).rejects.toThrow("must be republished through the canonical Back Office");
      await expect(
        admin.query(api.lender_portal_release.getLenderPortalReleaseState, {
          organizationId: ORG,
        })
      ).resolves.toMatchObject({ accessRevision: 1, status: "disabled" });
    };

    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.assignmentId, { organizationId: OTHER_ORG });
    });
    await expectBlocked("assignment-organization");
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.assignmentId, {
        brokerageId: foreignBrokerageId,
        organizationId: ORG,
      });
    });
    await expectBlocked("assignment-brokerage");
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.assignmentId, {
        brokerageId,
        lenderBrokerageId: foreignBrokerageId,
      });
    });
    await expectBlocked("assignment-lender-brokerage");
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.assignmentId, { lenderBrokerageId: brokerageId });
      await ctx.db.patch(fixture.proposalId, { currentProposalRevisionNumber: 2 });
    });
    await expectBlocked("revision-number-pointer");
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.proposalId, {
        currentProposalRevisionId: undefined,
        currentProposalRevisionNumber: 1,
      });
    });
    await expectBlocked("revision-id-pointer");
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.proposalId, {
        currentProposalRevisionId: fixture.proposalRevisionId,
      });
      await ctx.db.patch(fixture.proposalRevisionId, { assignmentId: undefined });
    });
    await expectBlocked("revision-assignment-pointer");
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.proposalRevisionId, {
        assignmentId: fixture.assignmentId,
      });
    });

    await expect(
      admin.mutation(api.lender_portal_release.transitionLenderPortalRelease, {
        candidateSha: CANDIDATE_SHA,
        canaryRecipientWorkosUserIds: ["allowed_recipient"],
        configurationHash: CONFIGURATION_HASH,
        expectedAccessRevision: 1,
        expectedStatus: "disabled",
        idempotencyKey: "phase9-consistent-assignment-canary",
        nextStatus: "canary",
        organizationId: ORG,
        reason: "Enable only after current assignment and revision scope is consistent.",
      })
    ).resolves.toMatchObject({ accessRevision: 2, status: "canary" });
  }, 30_000);

  test("supports idempotent canary, draining, rollback, and paused retry semantics", async () => {
    process.env.LENDER_PORTAL_RELEASE_CANDIDATE_SHA = CANDIDATE_SHA;
    process.env.LENDER_PORTAL_RELEASE_CONFIGURATION_HASH = CONFIGURATION_HASH;
    const t = convexTest(schema, modules);
    const brokerageId = await seedTenant(t, {
      organizationId: ORG,
      role: "admin",
      subject: "phase9_admin",
    });
    const proposalCorrelation =
      await seedCurrentProposalNotificationFixture(t, {
        brokerageId,
        recipientWorkosUserIds: ["allowed_recipient", "blocked_recipient"],
      });
    const admin = t.withIdentity(identity("phase9_admin", ORG, "admin"));
    const configured = await configureDisabledRelease(t);
    await expect(configureDisabledRelease(t)).resolves.toEqual(configured);
    await expect(
      admin.mutation(
        api.lender_portal_release.transitionLenderPortalRelease,
        {
          candidateSha: CANDIDATE_SHA,
          canaryRecipientWorkosUserIds: [],
          configurationHash: CONFIGURATION_HASH,
          expectedAccessRevision: 0,
          expectedStatus: "disabled",
          idempotencyKey: "phase9-configure-disabled",
          nextStatus: "disabled",
          organizationId: ORG,
          reason: "Reuse the same key with different input.",
        }
      )
    ).rejects.toThrow("reused with different input");
    const canary = await admin.mutation(
      api.lender_portal_release.transitionLenderPortalRelease,
      {
        candidateSha: CANDIDATE_SHA,
        canaryRecipientWorkosUserIds: ["allowed_recipient"],
        configurationHash: CONFIGURATION_HASH,
        expectedAccessRevision: 1,
        expectedStatus: "disabled",
        idempotencyKey: "phase9-enable-canary",
        nextStatus: "canary",
        organizationId: ORG,
        reason: "Enable one authorized recipient canary.",
      }
    );
    expect(canary).toMatchObject({
      accessRevision: 2,
      canaryRecipientCount: 1,
      status: "canary",
    });
    const allowedIntentId = await insertLenderPortalIntent(t, {
      brokerageId,
      idempotencyKey: "phase9-allowed",
      proposalCorrelation,
      recipientWorkosUserId: "allowed_recipient",
    });
    const blockedIntentId = await insertLenderPortalIntent(t, {
      brokerageId,
      idempotencyKey: "phase9-blocked",
      proposalCorrelation,
      recipientWorkosUserId: "blocked_recipient",
    });
    await expect(
      t.query(internal.quote_notifications.listDueCommunicationIntentIds, {
        limit: 40,
        now: Date.now(),
      })
    ).resolves.toEqual([allowedIntentId]);

    const recoveredIntentId = await insertLenderPortalIntent(t, {
      brokerageId,
      idempotencyKey: "phase9-provider-recovery",
      proposalCorrelation,
      recipientWorkosUserId: "allowed_recipient",
      status: "dispatching",
    });
    const recoveredAttemptId = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert("communicationAttempts", {
        attemptNumber: 1,
        brokerageId,
        claimedFromStatus: "pending",
        communicationIntentId: recoveredIntentId,
        createdAt: now,
        organizationId: ORG,
        startedAt: now,
        state: "claimed",
        updatedAt: now,
      });
      await ctx.db.insert("communicationProviderReservations", {
        communicationAttemptId: id,
        communicationIntentId: recoveredIntentId,
        communicationKind: "lender_portal_approval_required",
        createdAt: now,
        leaseExpiresAt: now + 60_000,
        lenderPortalReleaseAccessRevision: 2,
        organizationId: ORG,
        state: "active",
        updatedAt: now,
      });
      return id;
    });
    const recoveryArgs = {
      attemptId: recoveredAttemptId,
      intentId: recoveredIntentId,
      now: Date.now(),
      providerResendEmailId: "provider-phase9-recovery",
      sender: "DrawFlow <notifications@example.com>",
    };
    const recoveredEmailId = await t.mutation(
      internal.quote_notifications.recordCommunicationDispatchSuccess,
      recoveryArgs
    );
    await expect(
      t.mutation(
        internal.quote_notifications.recordCommunicationDispatchSuccess,
        { ...recoveryArgs, now: recoveryArgs.now + 1 }
      )
    ).resolves.toBe(recoveredEmailId);
    await t.mutation(
      internal.quote_notifications.releaseCommunicationProviderReservation,
      { attemptId: recoveredAttemptId, now: recoveryArgs.now + 2 }
    );
    await t.mutation(
      internal.quote_notifications.releaseCommunicationProviderReservation,
      { attemptId: recoveredAttemptId, now: recoveryArgs.now + 3 }
    );
    const recovery = await t.run(async (ctx) => ({
      emails: await ctx.db
        .query("emailMessages")
        .withIndex("by_communicationIntentId_and_createdAt", (query) =>
          query.eq("communicationIntentId", recoveredIntentId)
        )
        .collect(),
      outcomes: await ctx.db
        .query("communicationOutcomes")
        .withIndex("by_communicationIntentId_and_providerCreatedAt", (query) =>
          query.eq("communicationIntentId", recoveredIntentId)
        )
        .collect(),
      reservations: await ctx.db
        .query("communicationProviderReservations")
        .withIndex("by_communicationAttemptId", (query) =>
          query.eq("communicationAttemptId", recoveredAttemptId)
        )
        .collect(),
    }));
    expect(recovery.emails).toHaveLength(1);
    expect(recovery.outcomes).toHaveLength(1);
    expect(recovery.reservations).toEqual([
      expect.objectContaining({ state: "released" }),
    ]);

    const claimedIntentId = await insertLenderPortalIntent(t, {
      brokerageId,
      idempotencyKey: "phase9-in-flight",
      proposalCorrelation,
      recipientWorkosUserId: "allowed_recipient",
      status: "dispatching",
    });
    const attemptId = await t.run(async (ctx) =>
      await ctx.db.insert("communicationAttempts", {
        attemptNumber: 1,
        brokerageId,
        claimedFromStatus: "retry_scheduled",
        communicationIntentId: claimedIntentId,
        createdAt: Date.now(),
        organizationId: ORG,
        startedAt: Date.now(),
        state: "claimed",
        updatedAt: Date.now(),
      })
    );
    await t.run(async (ctx) =>
      ctx.db.insert("communicationProviderReservations", {
        communicationAttemptId: attemptId,
        communicationIntentId: claimedIntentId,
        communicationKind: "lender_portal_approval_required",
        createdAt: Date.now(),
        leaseExpiresAt: Date.now() + 60_000,
        lenderPortalReleaseAccessRevision: 2,
        organizationId: ORG,
        state: "active",
        updatedAt: Date.now(),
      })
    );
    await admin.mutation(
      api.lender_portal_release.transitionLenderPortalRelease,
      {
        candidateSha: CANDIDATE_SHA,
        canaryRecipientWorkosUserIds: [],
        configurationHash: CONFIGURATION_HASH,
        expectedAccessRevision: 2,
        expectedStatus: "canary",
        idempotencyKey: "phase9-drain",
        nextStatus: "draining",
        organizationId: ORG,
        reason: "Drain the canary before rollback.",
      }
    );
    await expect(
      t.mutation(
        internal.quote_notifications
          .authorizeCommunicationProviderSubmission,
        { attemptId, intentId: claimedIntentId, now: Date.now() }
      )
    ).resolves.toBe(false);
    const paused = await t.run(async (ctx) => ({
      attempt: await ctx.db.get(attemptId),
      blockedIntent: await ctx.db.get(blockedIntentId),
      intent: await ctx.db.get(claimedIntentId),
      outcomes: await ctx.db
        .query("communicationOutcomes")
        .withIndex("by_communicationIntentId_and_providerCreatedAt", (query) =>
          query.eq("communicationIntentId", claimedIntentId)
        )
        .collect(),
    }));
    expect(paused.attempt).toMatchObject({
      finishedAt: expect.any(Number),
      state: "abandoned",
    });
    expect(paused.intent).toMatchObject({
      idempotencyKey: "phase9-in-flight",
      status: "retry_scheduled",
    });
    expect(paused.blockedIntent).toMatchObject({ status: "pending" });
    expect(paused.outcomes).toEqual([
      expect.objectContaining({
        communicationAttemptId: attemptId,
        outcomeType: "dispatch_suppressed",
        safeDetail: expect.stringContaining("Release revision 3"),
      }),
    ]);
    expect(JSON.stringify(paused.outcomes)).not.toContain("allowed_recipient");
    expect(JSON.stringify(paused.outcomes)).not.toContain("@example.com");
    await expect(
      t.query(internal.quote_notifications.listDueCommunicationIntentIds, {
        limit: 40,
        now: Date.now(),
      })
    ).resolves.toEqual([]);
    await expect(
      admin.mutation(
        api.lender_portal_release.transitionLenderPortalRelease,
        {
          candidateSha: CANDIDATE_SHA,
          canaryRecipientWorkosUserIds: [],
          configurationHash: CONFIGURATION_HASH,
          expectedAccessRevision: 3,
          expectedStatus: "draining",
          idempotencyKey: "phase9-disable-blocked-by-provider",
          nextStatus: "disabled",
          organizationId: ORG,
          reason: "Disabled must wait for the provider reservation fence.",
        }
      )
    ).rejects.toThrow("provider reservations remain unresolved");
    await expect(
      admin.query(
        api.lender_portal_release.getLenderPortalOperationalHealth,
        { now: Date.now(), organizationId: ORG }
      )
    ).resolves.toMatchObject({
      providerReservations: { active: 1 },
      release: { status: "draining" },
    });
    await t.run(async (ctx) => {
      const reservation = await ctx.db
        .query("communicationProviderReservations")
        .withIndex("by_communicationAttemptId", (query) =>
          query.eq("communicationAttemptId", attemptId)
        )
        .unique();
      if (!reservation) throw new Error("Expected provider reservation.");
      await ctx.db.patch(reservation._id, { leaseExpiresAt: Date.now() - 1 });
    });
    await expect(
      t.mutation(
        internal.quote_notifications.authorizeCommunicationProviderSubmission,
        { attemptId, intentId: claimedIntentId, now: Date.now() }
      )
    ).resolves.toBe(false);
    await expect(
      admin.mutation(
        api.lender_portal_release.transitionLenderPortalRelease,
        {
          candidateSha: CANDIDATE_SHA,
          canaryRecipientWorkosUserIds: [],
          configurationHash: CONFIGURATION_HASH,
          expectedAccessRevision: 3,
          expectedStatus: "draining",
          idempotencyKey: "phase9-disable-blocked-by-expired-provider",
          nextStatus: "disabled",
          organizationId: ORG,
          reason: "Lease expiry is not a reconciled provider outcome.",
        }
      )
    ).rejects.toThrow("provider reservations remain unresolved");
    await expect(
      admin.query(
        api.lender_portal_release.getLenderPortalOperationalHealth,
        { now: Date.now(), organizationId: ORG }
      )
    ).resolves.toMatchObject({
      providerReservations: {
        active: 0,
        expiredLease: 1,
        reconciliationRequired: 1,
      },
      release: { status: "draining" },
    });
    await t.mutation(
      internal.quote_notifications.releaseCommunicationProviderReservation,
      { attemptId, now: Date.now() }
    );
    await admin.mutation(
      api.lender_portal_release.transitionLenderPortalRelease,
      {
        candidateSha: CANDIDATE_SHA,
        canaryRecipientWorkosUserIds: [],
        configurationHash: CONFIGURATION_HASH,
        expectedAccessRevision: 3,
        expectedStatus: "draining",
        idempotencyKey: "phase9-disable",
        nextStatus: "disabled",
        organizationId: ORG,
        reason: "Complete the history-preserving rollback.",
      }
    );
    await admin.mutation(
      api.lender_portal_release.transitionLenderPortalRelease,
      {
        candidateSha: CANDIDATE_SHA,
        canaryRecipientWorkosUserIds: [],
        configurationHash: CONFIGURATION_HASH,
        expectedAccessRevision: 4,
        expectedStatus: "disabled",
        idempotencyKey: "phase9-resume",
        nextStatus: "enabled",
        organizationId: ORG,
        reason: "Resume queued work after the rollback rehearsal.",
      }
    );
    await expect(
      t.query(internal.quote_notifications.listDueCommunicationIntentIds, {
        limit: 40,
        now: Date.now(),
      })
    ).resolves.toEqual(
      expect.arrayContaining([allowedIntentId, blockedIntentId, claimedIntentId])
    );
    await admin.mutation(
      api.lender_portal_release.transitionLenderPortalRelease,
      {
        candidateSha: CANDIDATE_SHA,
        canaryRecipientWorkosUserIds: [],
        configurationHash: CONFIGURATION_HASH,
        expectedAccessRevision: 5,
        expectedStatus: "enabled",
        idempotencyKey: "phase9-emergency-disable",
        nextStatus: "disabled",
        organizationId: ORG,
        reason: "Exercise immediate tenant stop without deleting queued work.",
      }
    );
    const audit = await admin.query(
      api.lender_portal_release.listLenderPortalReleaseAudit,
      { organizationId: ORG, paginationOpts: { cursor: null, numItems: 25 } }
    );
    expect(audit.page).toHaveLength(6);
    expect(audit.page.map((event: any) => event.status)).toEqual([
      "disabled",
      "enabled",
      "disabled",
      "draining",
      "canary",
      "disabled",
    ]);
    expect(audit.page[0]).toMatchObject({
      accessRevision: 6,
      actorRoles: ["admin"],
      correlationId: expect.any(String),
      warnings: [],
    });
    expect(audit.page[0].priorState).toContain(CONFIGURATION_HASH);
    expect(audit.page[0].newState).toContain(CONFIGURATION_HASH);
    expect(audit.page[0].priorState).toContain("canaryScopeHash");
    expect(audit.page[0].newState).toContain("canaryRecipientCount");
    expect(JSON.stringify(audit)).not.toContain("allowed_recipient");
    delete process.env.LENDER_PORTAL_RELEASE_CANDIDATE_SHA;
    delete process.env.LENDER_PORTAL_RELEASE_CONFIGURATION_HASH;
  });

  test("exposes tenant-safe health without recipient payloads", async () => {
    const t = convexTest(schema, modules);
    const brokerageId = await seedTenant(t, {
      organizationId: ORG,
      role: "admin",
      subject: "phase9_admin",
    });
    await configureDisabledRelease(t);
    const healthIntentId = await insertLenderPortalIntent(t, {
      brokerageId,
      createdAt: Date.now() - 16 * 60 * 1000,
      idempotencyKey: "phase9-health",
      recipientWorkosUserId: "private_recipient",
      status: "retry_scheduled",
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let attemptNumber = 1; attemptNumber <= 11; attemptNumber += 1) {
        await ctx.db.insert("communicationAttempts", {
          attemptNumber,
          brokerageId,
          communicationIntentId: healthIntentId,
          createdAt: now + attemptNumber,
          finishedAt: now + attemptNumber + 10,
          organizationId: ORG,
          safeError:
            attemptNumber === 1 ? "Privacy-safe provider failure." : undefined,
          startedAt: now + attemptNumber,
          state: attemptNumber === 1 ? "failed" : "completed",
          updatedAt: now + attemptNumber + 10,
        });
      }
      await ctx.db.insert("lenderOrganizationReconciliationCandidates", {
        brokerageId,
        createdAt: now,
        legacyWorkosOrganizationId: "foreign-legacy-lender",
        organizationId: OTHER_ORG,
        reason: "Foreign tenant ambiguity must not block the primary tenant.",
        sourceRecordId: "foreign-source-row",
        sourceTable: "proposalLenderAssignments",
        status: "open",
        updatedAt: now,
      });
      await ctx.db.insert("communicationIntents", {
        attemptCount: 0,
        brokerageId,
        channel: "email",
        createdAt: now,
        idempotencyKey: "unrelated-quote-traffic",
        kind: "quote_invitation_initial",
        nextAttemptAt: now,
        organizationId: ORG,
        payloadSnapshot: "{}",
        recipientEmailSnapshot: "private-quote@example.com",
        relatedEntityId: "quote",
        relatedEntityType: "quoteRound",
        status: "pending",
        templateKey: "quote_invitation_initial_v1",
        updatedAt: now,
      });
    });
    const health = await t
      .withIdentity(identity("phase9_admin", ORG, "admin"))
      .query(
        api.lender_portal_release.getLenderPortalOperationalHealth,
        { now: Date.now(), organizationId: ORG }
      );
    expect(health).toMatchObject({
      attempts: { failed: 1 },
      incompleteSampling: true,
      intents: { retryScheduled: 1 },
      release: { status: "disabled" },
      sampledIntentCount: 1,
      terminalHealthy: false,
    });
    expect(health.alerts).toEqual(
      expect.arrayContaining([
        "lender_portal_failed_attempt_threshold_exceeded",
        "lender_portal_operational_sample_incomplete",
      ])
    );
    expect(JSON.stringify(health)).not.toContain("private_recipient");
    expect(JSON.stringify(health)).not.toContain("@example.com");
  });
});

describe("Lender Portal Phase 9 migration", () => {
  test("rejects malformed durable migration count evidence at the schema boundary", async () => {
    const t = convexTest(schema, modules);
    const brokerageId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("brokerages", {
        createdAt: now,
        displayName: "Phase 9 validator Brokerage",
        legalName: "Phase 9 validator Brokerage Inc.",
        status: "active",
        updatedAt: now,
        workosOrganizationId: ORG,
      });
    });
    const now = Date.now();

    await expect(
      t.run(async (ctx) =>
        ctx.db.insert(
          "lenderPortalPhase9MigrationRuns",
          {
            active: true,
            brokerageId,
            candidateSha: CANDIDATE_SHA,
            configurationHash: CONFIGURATION_HASH,
            countsBefore: { proposalCount: 1 },
            createdAt: now,
            inventoryFingerprint: "malformed-count-evidence",
            issueCount: 0,
            issueSnapshots: [],
            organizationId: ORG,
            reason: "Prove malformed count evidence cannot persist.",
            runToken: "malformed-count-evidence",
            status: "blocked",
            updatedAt: now,
            updatedByWorkosUserId: "phase9_admin",
            workosProjectionFingerprintBefore: "workos-fingerprint",
            workosProjectionRowCount: 0,
          } as never
        )
      )
    ).rejects.toThrow();
  });

  test("accepts sparse known proposal-status counts and rejects unknown buckets", async () => {
    const t = convexTest(schema, modules);
    const brokerageId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("brokerages", {
        createdAt: now,
        displayName: "Phase 9 status validator Brokerage",
        legalName: "Phase 9 status validator Brokerage Inc.",
        status: "active",
        updatedAt: now,
        workosOrganizationId: ORG,
      });
    });
    const now = Date.now();
    const baseRun = {
      active: true,
      brokerageId,
      candidateSha: CANDIDATE_SHA,
      configurationHash: CONFIGURATION_HASH,
      createdAt: now,
      inventoryFingerprint: "status-count-evidence",
      issueCount: 0,
      issueSnapshots: [],
      organizationId: ORG,
      reason: "Prove proposal-status count validation.",
      status: "blocked" as const,
      updatedAt: now,
      updatedByWorkosUserId: "phase9_admin",
      workosProjectionFingerprintBefore: "workos-fingerprint",
      workosProjectionRowCount: 0,
    };

    await expect(
      t.run(async (ctx) =>
        ctx.db.insert("lenderPortalPhase9MigrationRuns", {
          ...baseRun,
          countsBefore: completeMigrationCounts({ closed: 1 }),
          runToken: "sparse-known-status-count",
        })
      )
    ).resolves.toBeDefined();
    await expect(
      t.run(async (ctx) =>
        ctx.db.insert(
          "lenderPortalPhase9MigrationRuns",
          {
            ...baseRun,
            countsBefore: {
              ...completeMigrationCounts(),
              proposalStatusCounts: { archived: 1 },
            },
            runToken: "unknown-status-count",
          } as never
        )
      )
    ).rejects.toThrow();
  });

  test("rejects migration issue readback for a run outside the authenticated Brokerage", async () => {
    const t = convexTest(schema, modules);
    await seedTenant(t, {
      organizationId: ORG,
      role: "admin",
      subject: "phase9_admin",
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      const foreignBrokerageId = await ctx.db.insert("brokerages", {
        createdAt: now,
        displayName: "Foreign Brokerage",
        legalName: "Foreign Brokerage Inc.",
        status: "active",
        updatedAt: now,
        workosOrganizationId: OTHER_ORG,
      });
      await ctx.db.insert("lenderPortalPhase9MigrationRuns", {
        active: true,
        brokerageId: foreignBrokerageId,
        candidateSha: CANDIDATE_SHA,
        configurationHash: CONFIGURATION_HASH,
        countsBefore: completeMigrationCounts(),
        createdAt: now,
        inventoryFingerprint: "foreign-brokerage-run",
        issueCount: 1,
        issueSnapshots: [
          {
            code: "private_foreign_issue",
            disposition: "open",
            field: "private",
            provenance: "foreign",
            reason: "PRIVATE FOREIGN BROKERAGE ISSUE",
            sourceRecordId: "private-foreign-record",
            sourceTable: "foreignTable",
          },
        ],
        organizationId: ORG,
        reason: "Prove issue readback checks Brokerage scope.",
        runToken: "foreign-brokerage-run",
        status: "blocked",
        updatedAt: now,
        updatedByWorkosUserId: "foreign_operator",
        workosProjectionFingerprintBefore: "foreign-workos-fingerprint",
        workosProjectionRowCount: 0,
      });
    });

    await expect(
      t
        .withIdentity(identity("phase9_admin", ORG, "admin"))
        .query(api.lender_portal_phase9.listLenderPortalPhase9MigrationIssues, {
          limit: 25,
          organizationId: ORG,
          runToken: "foreign-brokerage-run",
        })
    ).rejects.toThrow("Forbidden: Phase 9 migration run Brokerage scope.");
  });

  test("rejects prepare replay when the deterministic run belongs to another Brokerage", async () => {
    const t = convexTest(schema, modules);
    await seedTenant(t, {
      organizationId: ORG,
      role: "admin",
      subject: "phase9_admin",
    });
    await configureDisabledRelease(t);
    const admin = t.withIdentity(identity("phase9_admin", ORG, "admin"));
    const request = {
      candidateSha: CANDIDATE_SHA,
      configurationHash: CONFIGURATION_HASH,
      organizationId: ORG,
      reason: "Prepare the exact tenant migration inventory.",
    };
    const prepared = await admin.mutation(
      api.lender_portal_phase9.prepareLenderPortalPhase9MigrationRun,
      request
    );
    const { foreignBrokerageId, runId } = await t.run(async (ctx) => {
      const now = Date.now();
      const foreignBrokerageId = await ctx.db.insert("brokerages", {
        createdAt: now,
        displayName: "Foreign Brokerage",
        legalName: "Foreign Brokerage Inc.",
        status: "active",
        updatedAt: now,
        workosOrganizationId: OTHER_ORG,
      });
      const run = await ctx.db
        .query("lenderPortalPhase9MigrationRuns")
        .withIndex("by_organizationId_and_runToken", (query) =>
          query
            .eq("organizationId", ORG)
            .eq("runToken", prepared.runToken)
        )
        .unique();
      if (!run) throw new Error("Prepared migration run is unavailable.");
      await ctx.db.patch(run._id, { brokerageId: foreignBrokerageId });
      return { foreignBrokerageId, runId: run._id };
    });

    await expect(
      admin.mutation(
        api.lender_portal_phase9.prepareLenderPortalPhase9MigrationRun,
        request
      )
    ).rejects.toThrow("Forbidden: Phase 9 migration run Brokerage scope.");
    const runs = await t.run(async (ctx) =>
      ctx.db
        .query("lenderPortalPhase9MigrationRuns")
        .withIndex("by_organizationId_and_runToken", (query) =>
          query
            .eq("organizationId", ORG)
            .eq("runToken", prepared.runToken)
        )
        .collect()
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      _id: runId,
      brokerageId: foreignBrokerageId,
      status: prepared.status,
    });
  });

  test("rejects verification of a same-organization run from another Brokerage without writing verification state", async () => {
    const t = convexTest(schema, modules);
    await seedTenant(t, {
      organizationId: ORG,
      role: "admin",
      subject: "phase9_admin",
    });
    await configureDisabledRelease(t);
    const admin = t.withIdentity(identity("phase9_admin", ORG, "admin"));
    const prepared = await admin.mutation(
      api.lender_portal_phase9.prepareLenderPortalPhase9MigrationRun,
      {
        candidateSha: CANDIDATE_SHA,
        configurationHash: CONFIGURATION_HASH,
        organizationId: ORG,
        reason: "Prepare a migration run for Brokerage scope verification.",
      }
    );
    const { foreignBrokerageId, runId } = await t.run(async (ctx) => {
      const now = Date.now();
      const foreignBrokerageId = await ctx.db.insert("brokerages", {
        createdAt: now,
        displayName: "Foreign Brokerage",
        legalName: "Foreign Brokerage Inc.",
        status: "active",
        updatedAt: now,
        workosOrganizationId: OTHER_ORG,
      });
      const run = await ctx.db
        .query("lenderPortalPhase9MigrationRuns")
        .withIndex("by_organizationId_and_runToken", (query) =>
          query
            .eq("organizationId", ORG)
            .eq("runToken", prepared.runToken)
        )
        .unique();
      if (!run) throw new Error("Prepared migration run is unavailable.");
      await ctx.db.patch(run._id, {
        brokerageId: foreignBrokerageId,
        status: "applying",
      });
      return { foreignBrokerageId, runId: run._id };
    });

    await expect(
      admin.mutation(
        api.lender_portal_phase9.verifyLenderPortalPhase9MigrationRun,
        {
          organizationId: ORG,
          reason: "Attempt to verify the foreign Brokerage run.",
          runToken: prepared.runToken,
        }
      )
    ).rejects.toThrow("Forbidden: Phase 9 migration run Brokerage scope.");
    const result = await t.run(async (ctx) => {
      const run = await ctx.db.get(runId);
      const auditEvents = await ctx.db
        .query("auditEvents")
        .withIndex(
          "by_organizationId_and_phase9RunToken_and_createdAt",
          (query) =>
            query
              .eq("organizationId", ORG)
              .eq("phase9RunToken", prepared.runToken)
        )
        .collect();
      return { auditEvents, run };
    });
    expect(result.run).toMatchObject({
      brokerageId: foreignBrokerageId,
      status: "applying",
    });
    expect(result.run?.verifiedAt).toBeUndefined();
    expect(
      result.auditEvents.filter(
        (event) => event.eventType === "lender_portal.migration.verified"
      )
    ).toEqual([]);
  });

  test("blocks release for an open legacy reconciliation candidate without tenant provenance", async () => {
    const t = convexTest(schema, modules);
    await seedTenant(t, {
      organizationId: ORG,
      role: "admin",
      subject: "phase9_admin",
    });
    await configureDisabledRelease(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("lenderOrganizationReconciliationCandidates", {
        createdAt: now,
        legacyWorkosOrganizationId: "legacy-unscoped-lender",
        reason: "PRIVATE LEGACY MUTABLE SOURCE DETAIL",
        sourceRecordId: "legacy-unscoped-source",
        sourceTable: "proposalLenderAssignments",
        status: "open",
        updatedAt: now,
      });
    });
    const admin = t.withIdentity(identity("phase9_admin", ORG, "admin"));
    const blockedRun = await admin.mutation(
      api.lender_portal_phase9.prepareLenderPortalPhase9MigrationRun,
      {
        candidateSha: CANDIDATE_SHA,
        configurationHash: CONFIGURATION_HASH,
        organizationId: ORG,
        reason: "Fail closed on unresolved legacy tenant provenance.",
      }
    );
    expect(blockedRun).toMatchObject({ issueCount: 1, status: "blocked" });
    const issues = await admin.query(
      api.lender_portal_phase9.listLenderPortalPhase9MigrationIssues,
      {
        limit: 25,
        organizationId: ORG,
        runToken: blockedRun.runToken,
      }
    );
    expect(issues.page).toEqual([
      expect.objectContaining({
        code: "unscoped_lender_reconciliation_candidate",
        provenance: "lenderOrganizationReconciliationCandidates",
        sourceTable: "lenderOrganizationReconciliationCandidates",
      }),
    ]);
    expect(JSON.stringify(issues)).not.toContain(
      "PRIVATE LEGACY MUTABLE SOURCE DETAIL"
    );
    await expect(
      admin.mutation(api.lender_portal_release.transitionLenderPortalRelease, {
        candidateSha: CANDIDATE_SHA,
        canaryRecipientWorkosUserIds: [],
        configurationHash: CONFIGURATION_HASH,
        expectedAccessRevision: 1,
        expectedStatus: "disabled",
        idempotencyKey: "phase9-unscoped-reconciliation-canary",
        nextStatus: "canary",
        organizationId: ORG,
        reason: "Release must stay disabled with unresolved tenant provenance.",
      })
    ).rejects.toThrow();
    await expect(
      admin.query(api.lender_portal_release.getLenderPortalReleaseState, {
        organizationId: ORG,
      })
    ).resolves.toMatchObject({ accessRevision: 1, status: "disabled" });
  });

  test("does not inventory organization-mismatched proposals in a shared Brokerage", async () => {
    const t = convexTest(schema, modules);
    const brokerageId = await seedTenant(t, {
      organizationId: ORG,
      role: "admin",
      subject: "phase9_admin",
    });
    await configureDisabledRelease(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      for (const [organizationId, buildName] of [
        [ORG, "Visible tenant proposal"],
        [OTHER_ORG, "PRIVATE FOREIGN TENANT PROPOSAL"],
      ] as const) {
        await ctx.db.insert("buildProposals", {
          borrowerCoPayBps: 0,
          borrowerWorkingCapitalLimitCents: 0,
          brokerageId,
          buildName,
          createdAt: now,
          createdByWorkosUserId: "phase9_admin",
          lenderDrawPolicyLimitCents: 0,
          location: "Toronto",
          organizationId,
          reviewOutcome: "none",
          status: "draft",
          totalBudgetCents: 100,
          updatedAt: now,
          updatedByWorkosUserId: "phase9_admin",
        });
      }
    });
    const inventory = await t
      .withIdentity(identity("phase9_admin", ORG, "admin"))
      .query(
        api.lender_portal_phase9
          .inventoryLenderPortalPhase9MigrationCandidates,
        {
          candidateSha: CANDIDATE_SHA,
          organizationId: ORG,
          paginationOpts: { cursor: null, numItems: 25 },
        }
      );
    expect(inventory.page).toHaveLength(1);
    expect(JSON.stringify(inventory)).not.toContain("PRIVATE FOREIGN");
    await expect(
      t.withIdentity(identity("phase9_admin", ORG, "admin")).mutation(
        api.lender_portal_phase9.prepareLenderPortalPhase9MigrationRun,
        {
          candidateSha: CANDIDATE_SHA,
          configurationHash: CONFIGURATION_HASH,
          organizationId: ORG,
          reason: "Foreign reconciliation rows are outside this exact tenant.",
        }
      )
    ).resolves.toMatchObject({ issueCount: 0, status: "ready" });
  });

  test("refuses WorkOS-derived lender ownership and mutable default policy inference", async () => {
    const t = convexTest(schema, modules);
    const brokerageId = await seedTenant(t, {
      organizationId: ORG,
      role: "admin",
      subject: "phase9_admin",
    });
    await configureDisabledRelease(t);
    const fixture = await t.run(async (ctx) => {
      const now = Date.now();
      const proposalId = await ctx.db.insert("buildProposals", {
        borrowerCoPayBps: 0,
        borrowerWorkingCapitalLimitCents: 0,
        brokerageId,
        buildName: "Unsafe inference fixture",
        createdAt: now,
        createdByWorkosUserId: "phase9_admin",
        lenderDrawPolicyLimitCents: 0,
        location: "Toronto",
        organizationId: ORG,
        reviewOutcome: "approved",
        status: "approved",
        totalBudgetCents: 100,
        updatedAt: now,
        updatedByWorkosUserId: "phase9_admin",
      });
      const assignmentId = await ctx.db.insert("proposalLenderAssignments", {
        assignedAt: now,
        assignedByRole: "admin",
        assignedByWorkosUserId: "phase9_admin",
        brokerageId,
        createdAt: now,
        lenderBrokerageId: brokerageId,
        lenderOrganizationId: "workos_org_is_not_lender_ownership",
        lenderOrganizationName: "Unverified lender",
        organizationId: ORG,
        proposalId,
        status: "current",
      });
      return { assignmentId, proposalId };
    });
    await runMigration(
      t,
      "backfillLegacyProposalLenderAssignmentOrganizations"
    );
    await runMigration(
      t,
      "backfillLegacyProposalLenderAssignmentOrganizations"
    );
    await runMigration(t, "backfillProposalPhase3PolicyAndRevision");
    const result = await t.run(async (ctx) => ({
      assignment: await ctx.db.get(fixture.assignmentId),
      reconciliationCandidates: await ctx.db
        .query("lenderOrganizationReconciliationCandidates")
        .withIndex("by_brokerage_organization_status", (query) =>
          query
            .eq("brokerageId", brokerageId)
            .eq("organizationId", ORG)
            .eq("status", "open")
        )
        .collect(),
      issues: await ctx.db
        .query("proposalPhase3MigrationIssues")
        .withIndex("by_proposal_and_status", (query) =>
          query.eq("proposalId", fixture.proposalId).eq("status", "open")
        )
        .collect(),
      lenderOrganizations: await ctx.db.query("lenderOrganizations").collect(),
      policies: await ctx.db
        .query("proposalReviewPolicyVersions")
        .withIndex("by_proposal", (query) =>
          query.eq("proposalId", fixture.proposalId)
        )
        .collect(),
      revisions: await ctx.db
        .query("proposalRevisions")
        .withIndex("by_proposal", (query) =>
          query.eq("proposalId", fixture.proposalId)
        )
        .collect(),
    }));
    expect(result.assignment?.lenderOrganizationId).toBe(
      "workos_org_is_not_lender_ownership"
    );
    expect(result.lenderOrganizations).toEqual([]);
    expect(result.reconciliationCandidates).toEqual([
      expect.objectContaining({
        organizationId: ORG,
        sourceRecordId: String(fixture.assignmentId),
      }),
    ]);
    expect(result.policies).toEqual([]);
    expect(result.revisions).toEqual([]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        reason: expect.stringContaining("verifiable proposal fields"),
        sourceTable: "buildProposals",
      }),
    ]);
    const admin = t.withIdentity(identity("phase9_admin", ORG, "admin"));
    const blockedRun = await admin.mutation(
      api.lender_portal_phase9.prepareLenderPortalPhase9MigrationRun,
      {
        candidateSha: CANDIDATE_SHA,
        configurationHash: CONFIGURATION_HASH,
        organizationId: ORG,
        reason: "Persist the actionable ambiguity inventory.",
      }
    );
    expect(blockedRun).toMatchObject({ status: "blocked" });
    const issueReadback = await admin.query(
      api.lender_portal_phase9.listLenderPortalPhase9MigrationIssues,
      {
        limit: 25,
        organizationId: ORG,
        runToken: blockedRun.runToken,
      }
    );
    expect(issueReadback.total).toBe(blockedRun.issueCount);
    expect(issueReadback.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "explicit_approval_evidence_missing",
          sourceTable: "buildProposals",
        }),
        expect.objectContaining({
          disposition: "open",
          field: "lenderOrganizationId",
          provenance: expect.any(String),
          sourceRecordId: String(fixture.assignmentId),
        }),
      ])
    );
  });

  test("blocks contradictory approval and policy-lock links at the manifest and apply gate", async () => {
    const t = convexTest(schema, modules);
    const brokerageId = await seedTenant(t, {
      organizationId: ORG,
      role: "admin",
      subject: "phase9_admin",
    });
    const otherBrokerageId = await seedTenant(t, {
      organizationId: OTHER_ORG,
      role: "admin",
      subject: "phase9_other_admin",
    });
    await configureDisabledRelease(t);
    const fixture = await t.run(async (ctx) => {
      const now = Date.now();
      const policy = {
        drawApprovalMode: "backoffice_only" as const,
        drawLenderQuorum: null,
        milestoneApprovalMode: "backoffice_only" as const,
        milestoneLenderQuorum: null,
        milestoneReceiptInvoiceRequired: false,
        milestoneSiteVisitRequired: false,
      };
      const primaryProposalId = await ctx.db.insert("buildProposals", {
        borrowerCoPayBps: 0,
        borrowerWorkingCapitalLimitCents: 0,
        brokerageId,
        buildName: "Contradictory primary proposal",
        createdAt: now - 3_000,
        createdByWorkosUserId: "phase9_admin",
        lenderDrawPolicyLimitCents: 0,
        location: "Toronto",
        organizationId: ORG,
        reviewOutcome: "approved",
        status: "closed",
        totalBudgetCents: 100,
        updatedAt: now,
        updatedByWorkosUserId: "phase9_admin",
      });
      const otherProposalId = await ctx.db.insert("buildProposals", {
        borrowerCoPayBps: 0,
        borrowerWorkingCapitalLimitCents: 0,
        brokerageId: otherBrokerageId,
        buildName: "Contradictory source proposal",
        createdAt: now - 3_000,
        createdByWorkosUserId: "phase9_other_admin",
        lenderDrawPolicyLimitCents: 0,
        location: "Ottawa",
        organizationId: OTHER_ORG,
        reviewOutcome: "approved",
        status: "approved",
        totalBudgetCents: 100,
        updatedAt: now,
        updatedByWorkosUserId: "phase9_other_admin",
      });
      const lenderOrganizationId = await ctx.db.insert(
        "lenderOrganizations",
        {
          brokerageId: otherBrokerageId,
          createdAt: now,
          displayName: "Wrong Lender",
          legalName: "Wrong Lender Inc.",
          permissions: {
            drawDecisions: true,
            milestoneDecisions: true,
            proposalReview: true,
            siteVisitReview: true,
          },
          status: "active",
          updatedAt: now,
        }
      );
      const assignmentId = await ctx.db.insert(
        "proposalLenderAssignments",
        {
          assignedAt: now - 2_500,
          assignedByRole: "admin",
          assignedByWorkosUserId: "phase9_admin",
          brokerageId,
          createdAt: now - 2_500,
          lenderBrokerageId: otherBrokerageId,
          lenderOrganizationId,
          lenderOrganizationName: "Wrong Lender",
          organizationId: OTHER_ORG,
          proposalId: primaryProposalId,
          status: "current",
        }
      );
      const policyId = await ctx.db.insert("proposalReviewPolicyVersions", {
        brokerageId: otherBrokerageId,
        configuredAt: now - 2_000,
        configuredByRole: "admin",
        configuredByWorkosUserId: "phase9_other_admin",
        idempotencyKey: "phase9-contradictory-policy",
        organizationId: OTHER_ORG,
        policy,
        proposalId: otherProposalId,
        reason: "Contradictory policy scope.",
        version: 1,
      });
      const otherBuilderProfileId = await ctx.db.insert("builderProfiles", {
        brokerageId: otherBrokerageId,
        createdAt: now,
        displayName: "Wrong Builder",
        organizationId: OTHER_ORG,
        status: "active",
        updatedAt: now,
      });
      const revisionId = await ctx.db.insert("proposalRevisions", {
        assignmentId,
        backOfficeApprovedByWorkosUserId: "phase9_other_admin",
        brokerageId: otherBrokerageId,
        changedCheckpoints: [],
        checkpoints: {
          accessReviewPolicy: policy,
          budget: { totalBudgetCents: 100 },
          builder: {
            builderProfileId: otherBuilderProfileId,
            displayName: "Wrong Builder",
          },
          milestoneCount: { count: 0 },
          scheduleTimeline: {
            milestonesFingerprint: "contradictory",
            proposedStartDate: null,
            timelineRangeMax: null,
            timelineRangeMin: null,
          },
        },
        createdAt: now - 1_900,
        createdByRole: "admin",
        createdByWorkosUserId: "phase9_other_admin",
        idempotencyKey: "phase9-contradictory-revision",
        organizationId: OTHER_ORG,
        proposalId: otherProposalId,
        reason: "Contradictory revision scope.",
        revisionNumber: 1,
        reviewPolicyVersionId: policyId,
      });
      await ctx.db.patch(primaryProposalId, {
        currentProposalRevisionId: revisionId,
        currentProposalRevisionNumber: 1,
        currentReviewPolicyVersionId: policyId,
      });
      const closingId = await ctx.db.insert("proposalClosings", {
        brokerageId,
        buildStartDate: "2026-09-01",
        closedAt: now - 1_000,
        closedByRole: "admin",
        closedByWorkosUserId: "phase9_admin",
        createdAt: now - 1_000,
        ianaTimezone: "America/Toronto",
        loanFacility: { interestAnnualBps: 900, principalCents: 100 },
        organizationId: ORG,
        proposalId: primaryProposalId,
        reason: "Exact closing with contradictory lock.",
      });
      const approvalId = await ctx.db.insert("proposalLenderApprovals", {
        approvedAt: now - 1_500,
        approverRole: "lender-admin",
        approverWorkosUserId: "wrong_lender_admin",
        assignmentId,
        brokerageId,
        createdAt: now - 1_500,
        lenderOrganizationId,
        organizationId: ORG,
        proposalId: primaryProposalId,
        proposalRevisionId: revisionId,
        proposalRevisionNumber: 1,
        status: "approved",
      });
      const lockId = await ctx.db.insert("proposalReviewPolicyLocks", {
        activeLenderMemberCount: 1,
        assignmentId,
        brokerageId,
        eligibleLenderApproverCount: 1,
        idempotencyKey: "phase9-contradictory-lock",
        lenderOrganizationId,
        lockedAt: now - 1_000,
        lockedByRole: "admin",
        lockedByWorkosUserId: "phase9_admin",
        organizationId: ORG,
        policy,
        policyVersionId: policyId,
        proposalId: primaryProposalId,
        proposalRevisionId: revisionId,
        proposalRevisionNumber: 1,
        reason: "Contradictory lock scope.",
      });
      return { approvalId, closingId, lockId, primaryProposalId };
    });

    const admin = t.withIdentity(identity("phase9_admin", ORG, "admin"));
    const blocked = await admin.mutation(
      api.lender_portal_phase9.prepareLenderPortalPhase9MigrationRun,
      {
        candidateSha: CANDIDATE_SHA,
        configurationHash: CONFIGURATION_HASH,
        organizationId: ORG,
        reason: "Persist contradictory link evidence without applying it.",
      }
    );
    expect(blocked.status).toBe("blocked");
    const issueReadback = await admin.query(
      api.lender_portal_phase9.listLenderPortalPhase9MigrationIssues,
      {
        limit: 25,
        organizationId: ORG,
        runToken: blocked.runToken,
      }
    );
    expect(issueReadback.total).toBe(blocked.issueCount);
    expect(issueReadback.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "approval_scope_conflict",
          sourceRecordId: String(fixture.approvalId),
          sourceTable: "proposalLenderApprovals",
        }),
        expect.objectContaining({
          code: "policy_lock_scope_conflict",
          sourceRecordId: String(fixture.lockId),
          sourceTable: "proposalClosings",
        }),
      ])
    );
    await expect(
      admin.mutation(
        api.lender_portal_phase9.authorizeLenderPortalPhase9MigrationRun,
        {
          organizationId: ORG,
          reason: "A blocked run must never authorize.",
          runToken: blocked.runToken,
        }
      )
    ).rejects.toThrow("Only a ready");
    await expect(
      runMigration(t, "reconcileLenderPortalPhase9ApprovalFacts")
    ).rejects.toThrow("authorized exact-candidate inventory run");
    const unchanged = await t.run(async (ctx) => ({
      approval: await ctx.db.get(fixture.approvalId),
      closing: await ctx.db.get(fixture.closingId),
      proposal: await ctx.db.get(fixture.primaryProposalId),
    }));
    expect(unchanged.approval?.proposalRevisionId).toBeDefined();
    expect(unchanged.closing?.reviewPolicyLockId).toBeUndefined();
    expect(unchanged.proposal?.lockedReviewPolicyId).toBeUndefined();
  });

  test("rejects authorization when the persisted manifest no longer matches release configuration", async () => {
    const t = convexTest(schema, modules);
    await seedTenant(t, {
      organizationId: ORG,
      role: "admin",
      subject: "phase9_admin",
    });
    await configureDisabledRelease(t);
    const admin = t.withIdentity(identity("phase9_admin", ORG, "admin"));
    const prepared = await admin.mutation(
      api.lender_portal_phase9.prepareLenderPortalPhase9MigrationRun,
      {
        candidateSha: CANDIDATE_SHA,
        configurationHash: CONFIGURATION_HASH,
        organizationId: ORG,
        reason: "Bind an empty exact rehearsal manifest.",
      }
    );
    const changedHash = "c".repeat(64);
    await admin.mutation(
      api.lender_portal_release.transitionLenderPortalRelease,
      {
        candidateSha: CANDIDATE_SHA,
        canaryRecipientWorkosUserIds: [],
        configurationHash: changedHash,
        expectedAccessRevision: 1,
        expectedStatus: "disabled",
        idempotencyKey: "phase9-change-disabled-config",
        nextStatus: "disabled",
        organizationId: ORG,
        reason: "Exercise exact manifest configuration drift protection.",
      }
    );
    await expect(
      admin.mutation(
        api.lender_portal_phase9.authorizeLenderPortalPhase9MigrationRun,
        {
          organizationId: ORG,
          reason: "The stale manifest must fail closed.",
          runToken: prepared.runToken,
        }
      )
    ).rejects.toThrow("no longer matches");
    await admin.mutation(
      api.lender_portal_release.transitionLenderPortalRelease,
      {
        candidateSha: CANDIDATE_SHA,
        canaryRecipientWorkosUserIds: [],
        configurationHash: CONFIGURATION_HASH,
        expectedAccessRevision: 2,
        expectedStatus: "disabled",
        idempotencyKey: "phase9-restore-disabled-config",
        nextStatus: "disabled",
        organizationId: ORG,
        reason: "Restore exact runtime configuration before snapshot drift test.",
      }
    );
    const projectionTime = new Date().toISOString();
    await t.mutation(internal.auth.authKitEvent, {
      data: {
        createdAt: projectionTime,
        domains: [],
        id: ORG,
        name: "Phase 9 projection changed after rehearsal",
        object: "organization",
        updatedAt: projectionTime,
      },
      event: "organization.updated",
    });
    await expect(
      admin.mutation(
        api.lender_portal_phase9.authorizeLenderPortalPhase9MigrationRun,
        {
          organizationId: ORG,
          reason: "Persist and audit observed projection drift.",
          runToken: prepared.runToken,
        }
      )
    ).resolves.toMatchObject({ status: "blocked" });
    const blockedReadback = await admin.query(
      api.lender_portal_phase9.getLenderPortalPhase9MigrationRun,
      { organizationId: ORG, runToken: prepared.runToken }
    );
    expect(blockedReadback).toMatchObject({
      inventoryFingerprintAfter: expect.any(String),
      status: "blocked",
      workosProjectionFingerprintAfter: expect.any(String),
    });
    const blockedAudit = await admin.query(
      api.lender_portal_phase9.readLenderPortalPhase9MigrationAudit,
      {
        organizationId: ORG,
        paginationOpts: { cursor: null, numItems: 25 },
        runToken: prepared.runToken,
      }
    );
    expect(blockedAudit.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "lender_portal.migration.authorization_blocked",
          warnings: ["migration_snapshot_drift"],
        }),
      ])
    );
    expect(
      blockedAudit.page.find(
        (event) =>
          event.eventType === "lender_portal.migration.authorization_blocked"
      )?.newState
    ).toContain("observedWorkosProjectionFingerprint");
  });

  test("serializes authorized migration apply across tenants", async () => {
    const t = convexTest(schema, modules);
    await seedTenant(t, {
      organizationId: ORG,
      role: "admin",
      subject: "phase9_admin",
    });
    await seedTenant(t, {
      organizationId: OTHER_ORG,
      role: "admin",
      subject: "phase9_other_admin",
    });
    await configureDisabledRelease(t);
    await configureDisabledRelease(t, OTHER_ORG, "phase9_other_admin");
    const primary = t.withIdentity(identity("phase9_admin", ORG, "admin"));
    const other = t.withIdentity(
      identity("phase9_other_admin", OTHER_ORG, "admin")
    );
    const primaryRun = await primary.mutation(
      api.lender_portal_phase9.prepareLenderPortalPhase9MigrationRun,
      {
        candidateSha: CANDIDATE_SHA,
        configurationHash: CONFIGURATION_HASH,
        organizationId: ORG,
        reason: "Prepare the primary tenant run.",
      }
    );
    const otherRun = await other.mutation(
      api.lender_portal_phase9.prepareLenderPortalPhase9MigrationRun,
      {
        candidateSha: CANDIDATE_SHA,
        configurationHash: CONFIGURATION_HASH,
        organizationId: OTHER_ORG,
        reason: "Prepare the second tenant run.",
      }
    );
    await primary.mutation(
      api.lender_portal_phase9.authorizeLenderPortalPhase9MigrationRun,
      {
        organizationId: ORG,
        reason: "Reserve the global runner for the primary tenant.",
        runToken: primaryRun.runToken,
      }
    );
    await expect(
      primary.mutation(
        api.lender_portal_release.transitionLenderPortalRelease,
        {
          candidateSha: CANDIDATE_SHA,
          canaryRecipientWorkosUserIds: [],
          configurationHash: CONFIGURATION_HASH,
          expectedAccessRevision: 1,
          expectedStatus: "disabled",
          idempotencyKey: "phase9-enable-during-authorized-migration",
          nextStatus: "enabled",
          organizationId: ORG,
          reason: "Release enable must interlock with migration apply.",
        }
      )
    ).rejects.toThrow("authorized Phase 9 migration is active");
    process.env.LENDER_PORTAL_RELEASE_CANDIDATE_SHA = "d".repeat(40);
    await expect(
      runMigration(t, "validateLenderPortalPhase9ApplyManifest")
    ).rejects.toThrow("running deployment does not prove");
    process.env.LENDER_PORTAL_RELEASE_CANDIDATE_SHA = CANDIDATE_SHA;
    await expect(
      other.mutation(
        api.lender_portal_phase9.authorizeLenderPortalPhase9MigrationRun,
        {
          organizationId: OTHER_ORG,
          reason: "A concurrent tenant apply must fail closed.",
          runToken: otherRun.runToken,
        }
      )
    ).rejects.toThrow("Another tenant has an active authorized");
  });

  test("blocks lifecycle, review-cycle, and Kanban contradictions at runner preflight", async () => {
    const t = convexTest(schema, modules);
    migrationsTest.register(t);
    const brokerageId = await seedTenant(t, {
      organizationId: ORG,
      role: "admin",
      subject: "phase9_admin",
    });
    await configureDisabledRelease(t);
    const fixture = await t.run(async (ctx) => {
      const now = Date.now();
      const builderProfileId = await ctx.db.insert("builderProfiles", {
        brokerageId,
        createdAt: now,
        displayName: "Preflight Builder",
        organizationId: ORG,
        status: "active",
        updatedAt: now,
      });
      const proposalId = await ctx.db.insert("buildProposals", {
        borrowerCoPayBps: 0,
        borrowerWorkingCapitalLimitCents: 0,
        brokerageId,
        buildName: "Preflight contradiction fixture",
        createdAt: now,
        createdByWorkosUserId: "phase9_admin",
        lenderDrawPolicyLimitCents: 0,
        location: "Toronto",
        organizationId: ORG,
        reviewOutcome: "none",
        status: "draft",
        totalBudgetCents: 100,
        updatedAt: now,
        updatedByWorkosUserId: "phase9_admin",
      });
      const workflowRuleId = await ctx.db.insert("workflowRules", {
        allowPermitWaiverByRoles: [],
        brokerageId,
        createdAt: now,
        organizationId: ORG,
        proposalStates: [],
        requirePermitForApproval: false,
        ruleKey: "phase9-preflight",
        settings: {},
        status: "active",
        updatedAt: now,
        version: 1,
      });
      const workflowRuleSnapshotId = await ctx.db.insert(
        "workflowRuleSnapshots",
        {
          allowPermitWaiverByRoles: [],
          brokerageId,
          createdAt: now,
          organizationId: ORG,
          proposalId,
          proposalStates: [],
          requirePermitForApproval: false,
          ruleKey: "phase9-preflight",
          settings: {},
          version: 1,
          workflowRuleId,
        }
      );
      return { builderProfileId, proposalId, workflowRuleSnapshotId };
    });
    const admin = t.withIdentity(identity("phase9_admin", ORG, "admin"));
    const prepared = await admin.mutation(
      api.lender_portal_phase9.prepareLenderPortalPhase9MigrationRun,
      {
        candidateSha: CANDIDATE_SHA,
        configurationHash: CONFIGURATION_HASH,
        organizationId: ORG,
        reason: "Prepare a clean exact-scope snapshot.",
      }
    );
    await admin.mutation(
      api.lender_portal_phase9.authorizeLenderPortalPhase9MigrationRun,
      {
        organizationId: ORG,
        reason: "Authorize before injecting the interleaving contradiction.",
        runToken: prepared.runToken,
      }
    );
    const contradictions = await t.run(async (ctx) => {
      const now = Date.now();
      const buildId = await ctx.db.insert("activeBuilds", {
        brokerageId,
        buildName: "Unexpected active Build",
        builderProfileId: fixture.builderProfileId,
        createdAt: now,
        location: "Toronto",
        organizationId: ORG,
        proposalId: fixture.proposalId,
        startDate: "2026-09-01",
        status: "active",
        totalBudgetCents: 100,
        updatedAt: now,
        workflowRuleSnapshotId: fixture.workflowRuleSnapshotId,
      });
      const drawRequestId = await ctx.db.insert("activeBuildDrawRequests", {
        amountCents: 10,
        brokerageId,
        buildId,
        clientOperationId: "phase9-foreign-target",
        createdAt: now,
        displayId: "DRAW-FOREIGN",
        label: "Foreign target",
        organizationId: OTHER_ORG,
        requestKey: "phase9-foreign-target",
        requestedAt: new Date(now).toISOString(),
        requestedByWorkosUserId: "foreign_user",
        status: "requested",
        updatedAt: now,
      });
      const cycleId = await ctx.db.insert("lenderPortalReviewCycles", {
        approvedGroups: [],
        brokerageId,
        buildId,
        commandFingerprint: "phase9-contradictory-cycle",
        cycleNumber: 1,
        decisionSummaries: [],
        drawRequestId,
        evidenceReferences: [],
        idempotencyKey: "phase9-contradictory-cycle",
        isCurrent: true,
        kind: "draw",
        lenderApprovalCount: 0,
        organizationId: ORG,
        requestIdentity: `draw:${String(drawRequestId)}`,
        requirements: {
          approvalMode: "backoffice_only",
          lenderQuorum: null,
          receiptInvoiceRequired: false,
          requiredGroups: ["backoffice"],
          siteVisitRequired: false,
        },
        state: "in_review",
        submission: {
          allocations: [],
          amountCents: 10,
          displayId: "DRAW-FOREIGN",
          drawRequestId,
          kind: "draw",
          label: "Foreign target",
          note: null,
          requestedAt: new Date(now).toISOString(),
          requestKey: "phase9-foreign-target",
        },
        submittedAt: now,
        submittedByWorkosUserId: "phase9_admin",
        targetLabel: "Foreign target",
        updatedAt: now,
      });
      const cardId = await ctx.db.insert("proposalKanbanCards", {
        brokerageId,
        builderName: "Wrong builder",
        column: "draft",
        href: "/foreign",
        organizationId: OTHER_ORG,
        proposalId: fixture.proposalId,
        sortAt: now,
        subtitle: "Private foreign value",
        title: "Wrong card",
        totalBudgetCents: 999,
        updatedAt: now,
      });
      return { cardId, cycleId };
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date());
    await runPhase9MigrationRunner(t);
    vi.useRealTimers();
    const readback = await admin.query(
      api.lender_portal_phase9.getLenderPortalPhase9MigrationRun,
      { organizationId: ORG, runToken: prepared.runToken }
    );
    expect(readback.status).toBe("blocked");
    const issues = await admin.query(
      api.lender_portal_phase9.listLenderPortalPhase9MigrationIssues,
      {
        limit: 25,
        organizationId: ORG,
        runToken: prepared.runToken,
      }
    );
    expect(issues.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "non_closed_lifecycle_evidence" }),
        expect.objectContaining({
          code: "review_cycle_scope_conflict",
          sourceRecordId: String(contradictions.cycleId),
        }),
        expect.objectContaining({
          code: "kanban_projection_scope_conflict",
          sourceRecordId: String(contradictions.cardId),
        }),
      ])
    );
    const unchanged = await t.run(async (ctx) => ({
      card: await ctx.db.get(contradictions.cardId),
      proposal: await ctx.db.get(fixture.proposalId),
    }));
    expect(unchanged.card).toMatchObject({
      organizationId: OTHER_ORG,
      title: "Wrong card",
    });
    expect(unchanged.proposal?.activeBuildId).toBeUndefined();
  });

  test("dry-runs, applies explicit lifecycle evidence, rebuilds projection, and replays as a no-op", async () => {
    const t = convexTest(schema, modules);
    migrationsTest.register(t);
    const brokerageId = await seedTenant(t, {
      organizationId: ORG,
      role: "admin",
      subject: "phase9_admin",
    });
    await configureDisabledRelease(t);
    const fixture = await t.run(async (ctx) => {
      const now = Date.now();
      const builderProfileId = await ctx.db.insert("builderProfiles", {
        brokerageId,
        createdAt: now,
        displayName: "Phase 9 Builder",
        organizationId: ORG,
        status: "active",
        updatedAt: now,
      });
      const proposalId = await ctx.db.insert("buildProposals", {
        approvedAt: now - 2_000,
        backOfficeApprovedByWorkosUserId: "phase9_admin",
        borrowerCoPayBps: 0,
        borrowerWorkingCapitalLimitCents: 0,
        brokerageId,
        builderProfileId,
        buildName: "Explicit lifecycle fixture",
        createdAt: now - 3_000,
        createdByWorkosUserId: "phase9_admin",
        lenderDrawPolicyLimitCents: 0,
        location: "Toronto",
        organizationId: ORG,
        reviewOutcome: "approved",
        status: "closed",
        totalBudgetCents: 100,
        updatedAt: now,
        updatedByWorkosUserId: "phase9_admin",
      });
      const lenderOrganizationId = await ctx.db.insert(
        "lenderOrganizations",
        {
          brokerageId,
          createdAt: now - 2_900,
          displayName: "Phase 9 Lender",
          legalName: "Phase 9 Lender Inc.",
          permissions: {
            drawDecisions: true,
            milestoneDecisions: true,
            proposalReview: true,
            siteVisitReview: true,
          },
          status: "active",
          updatedAt: now - 2_900,
        }
      );
      const assignmentId = await ctx.db.insert(
        "proposalLenderAssignments",
        {
          assignedAt: now - 2_800,
          assignedByRole: "admin",
          assignedByWorkosUserId: "phase9_admin",
          brokerageId,
          createdAt: now - 2_800,
          lenderBrokerageId: brokerageId,
          lenderOrganizationId,
          lenderOrganizationName: "Phase 9 Lender",
          organizationId: ORG,
          proposalId,
          status: "current",
        }
      );
      const workflowRuleId = await ctx.db.insert("workflowRules", {
        allowPermitWaiverByRoles: [],
        brokerageId,
        createdAt: now,
        organizationId: ORG,
        proposalStates: [],
        requirePermitForApproval: false,
        ruleKey: "phase9-test",
        settings: {},
        status: "active",
        updatedAt: now,
        version: 1,
      });
      const workflowRuleSnapshotId = await ctx.db.insert(
        "workflowRuleSnapshots",
        {
          allowPermitWaiverByRoles: [],
          brokerageId,
          createdAt: now,
          organizationId: ORG,
          proposalId,
          proposalStates: [],
          requirePermitForApproval: false,
          ruleKey: "phase9-test",
          version: 1,
          workflowRuleId,
          settings: {},
        }
      );
      const policy = {
        drawApprovalMode: "backoffice_only" as const,
        drawLenderQuorum: null,
        milestoneApprovalMode: "backoffice_only" as const,
        milestoneLenderQuorum: null,
        milestoneReceiptInvoiceRequired: false,
        milestoneSiteVisitRequired: false,
      };
      const policyVersionId = await ctx.db.insert(
        "proposalReviewPolicyVersions",
        {
          brokerageId,
          configuredAt: now - 2_500,
          configuredByRole: "admin",
          configuredByWorkosUserId: "phase9_admin",
          idempotencyKey: "phase9-explicit-policy",
          organizationId: ORG,
          policy,
          proposalId,
          reason: "Explicit policy history for Phase 9 reconciliation.",
          version: 1,
        }
      );
      const revisionId = await ctx.db.insert("proposalRevisions", {
        assignmentId,
        backOfficeApprovedByWorkosUserId: "phase9_admin",
        brokerageId,
        changedCheckpoints: [
          "accessReviewPolicy",
          "budget",
          "builder",
          "milestoneCount",
          "scheduleTimeline",
        ],
        checkpoints: {
          accessReviewPolicy: policy,
          budget: { totalBudgetCents: 100 },
          builder: {
            builderProfileId,
            displayName: "Phase 9 Builder",
          },
          milestoneCount: { count: 0 },
          scheduleTimeline: {
            milestonesFingerprint: "phase9-explicit",
            proposedStartDate: null,
            timelineRangeMax: null,
            timelineRangeMin: null,
          },
        },
        createdAt: now - 2_000,
        createdByRole: "admin",
        createdByWorkosUserId: "phase9_admin",
        idempotencyKey: "phase9-explicit-revision",
        organizationId: ORG,
        proposalId,
        reason: "Explicit immutable revision history.",
        revisionNumber: 1,
        reviewPolicyVersionId: policyVersionId,
      });
      await ctx.db.patch(proposalId, {
        currentProposalRevisionId: revisionId,
        currentProposalRevisionNumber: 1,
        currentReviewPolicyVersionId: policyVersionId,
        workflowRuleSnapshotId,
      });
      const closingId = await ctx.db.insert("proposalClosings", {
        brokerageId,
        buildStartDate: "2026-09-01",
        closedAt: now - 1_000,
        closedByRole: "admin",
        closedByWorkosUserId: "phase9_admin",
        createdAt: now - 1_000,
        ianaTimezone: "America/Toronto",
        loanFacility: { interestAnnualBps: 900, principalCents: 100 },
        organizationId: ORG,
        proposalId,
        reason: "Explicit signed closing evidence.",
      });
      const approvalId = await ctx.db.insert("proposalLenderApprovals", {
        approvedAt: now - 1_500,
        approverRole: "lender-admin",
        approverWorkosUserId: "phase9_lender_admin",
        assignmentId,
        brokerageId,
        createdAt: now - 1_500,
        lenderOrganizationId,
        organizationId: ORG,
        proposalId,
        status: "approved",
      });
      const policyLockId = await ctx.db.insert("proposalReviewPolicyLocks", {
        activeLenderMemberCount: 1,
        assignmentId,
        brokerageId,
        eligibleLenderApproverCount: 1,
        eligibleLenderApproverCounts: {
          draw: 1,
          milestone: 1,
          proposalReview: 1,
        },
        idempotencyKey: "phase9-explicit-policy-lock",
        lenderOrganizationId,
        lockedAt: now - 1_000,
        lockedByRole: "admin",
        lockedByWorkosUserId: "phase9_admin",
        organizationId: ORG,
        policy,
        policyVersionId,
        proposalId,
        proposalRevisionId: revisionId,
        proposalRevisionNumber: 1,
        reason: "Explicit immutable lock evidence for Phase 9.",
      });
      const buildId = await ctx.db.insert("activeBuilds", {
        brokerageId,
        buildName: "Explicit lifecycle fixture",
        builderProfileId,
        createdAt: now,
        location: "Toronto",
        organizationId: ORG,
        proposalId,
        startDate: "2026-09-01",
        status: "active",
        totalBudgetCents: 100,
        updatedAt: now,
        workflowRuleSnapshotId,
      });
      const foreignProposalId = await ctx.db.insert("buildProposals", {
        borrowerCoPayBps: 0,
        borrowerWorkingCapitalLimitCents: 0,
        brokerageId,
        buildName: "Foreign tenant runner sentinel",
        createdAt: now,
        createdByWorkosUserId: "foreign_user",
        lenderDrawPolicyLimitCents: 0,
        location: "Private",
        organizationId: OTHER_ORG,
        reviewOutcome: "none",
        status: "draft",
        totalBudgetCents: 100,
        updatedAt: now,
        updatedByWorkosUserId: "foreign_user",
      });
      return {
        approvalId,
        buildId,
        closingId,
        foreignProposalId,
        policyLockId,
        proposalId,
      };
    });

    const admin = t.withIdentity(identity("phase9_admin", ORG, "admin"));
    const prepared = await admin.mutation(
      api.lender_portal_phase9.prepareLenderPortalPhase9MigrationRun,
      {
        candidateSha: CANDIDATE_SHA,
        configurationHash: CONFIGURATION_HASH,
        organizationId: ORG,
        reason: "Record the exact Phase 9 rehearsal inventory.",
      }
    );
    expect(prepared).toMatchObject({ issueCount: 0, status: "ready" });
    const replayedPreparation = await admin.mutation(
      api.lender_portal_phase9.prepareLenderPortalPhase9MigrationRun,
      {
        candidateSha: CANDIDATE_SHA,
        configurationHash: CONFIGURATION_HASH,
        organizationId: ORG,
        reason: "Replay the deterministic rehearsal without duplicating it.",
      }
    );
    expect(replayedPreparation).toEqual(prepared);
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("lenderPortalPhase9MigrationRuns")
          .withIndex("by_organizationId_and_runToken", (query) =>
            query
              .eq("organizationId", ORG)
              .eq("runToken", prepared.runToken)
          )
          .collect()
      )
    ).resolves.toHaveLength(1);
    await expect(
      admin.mutation(
        api.lender_portal_phase9
          .authorizeLenderPortalPhase9MigrationRun,
        {
          organizationId: ORG,
          reason: "Authorize the exact disabled candidate rehearsal.",
          runToken: prepared.runToken,
        }
      )
    ).resolves.toMatchObject({ status: "authorized" });

    await expect(
      runMigration(t, "reconcileLenderPortalProposalLifecycle", true)
    ).rejects.toThrow("DRY RUN");
    const afterDryRun = await t.run(async (ctx) =>
      ctx.db.get(fixture.proposalId)
    );
    expect(afterDryRun?.activeBuildId).toBeUndefined();
    expect(afterDryRun?.closedAt).toBeUndefined();
    vi.useFakeTimers();
    vi.setSystemTime(new Date());
    await runPhase9MigrationRunner(t);
    await runPhase9MigrationRunner(t);
    vi.useRealTimers();
    const result = await t.run(async (ctx) => ({
      approval: await ctx.db.get(fixture.approvalId),
      audits: await ctx.db
        .query("auditEvents")
        .withIndex("by_organizationId_and_createdAt", (query) =>
          query.eq("organizationId", ORG)
        )
        .filter((query) =>
          query.eq(query.field("actorWorkosUserId"), "system:lender-portal-phase9-migration")
        )
        .collect(),
      cards: await ctx.db
        .query("proposalKanbanCards")
        .withIndex("by_proposal", (query) =>
          query.eq("proposalId", fixture.proposalId)
        )
        .collect(),
      closing: await ctx.db.get(fixture.closingId),
      build: await ctx.db.get(fixture.buildId),
      foreignCards: await ctx.db
        .query("proposalKanbanCards")
        .withIndex("by_proposal", (query) =>
          query.eq("proposalId", fixture.foreignProposalId)
        )
        .collect(),
      proposal: await ctx.db.get(fixture.proposalId),
    }));
    expect(result.proposal).toMatchObject({
      activeBuildId: fixture.buildId,
      closedAt: expect.any(Number),
      lockedReviewPolicyId: fixture.policyLockId,
    });
    expect(result.approval).toMatchObject({
      proposalRevisionId: expect.any(String),
      proposalRevisionNumber: 1,
    });
    expect(result.closing).toMatchObject({
      reviewPolicyLockId: fixture.policyLockId,
    });
    expect(result.build).toMatchObject({
      reviewPolicyLockId: fixture.policyLockId,
    });
    expect(result.foreignCards).toEqual([]);
    expect(result.cards).toEqual([
      expect.objectContaining({
        builderName: "Phase 9 Builder",
        column: "closed",
        proposalId: fixture.proposalId,
      }),
    ]);
    expect(result.audits).toHaveLength(5);
    expect(result.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "lender_portal.migration.apply_started",
        }),
      ])
    );

    await expect(
      admin.mutation(
        api.lender_portal_phase9.verifyLenderPortalPhase9MigrationRun,
        {
          organizationId: ORG,
          reason: "Verify counts, projections, and WorkOS non-write evidence.",
          runToken: prepared.runToken,
        }
      )
    ).resolves.toMatchObject({
      issueCount: 0,
      status: "verified",
      workosProjectionWriteCount: 0,
    });
    const runReadback = await admin.query(
      api.lender_portal_phase9.getLenderPortalPhase9MigrationRun,
      { organizationId: ORG, runToken: prepared.runToken }
    );
    expect(runReadback).toMatchObject({
      countsAfter: expect.objectContaining({
        projectionMismatchCount: 0,
        reconciliationPendingCount: 0,
      }),
      countsBefore: expect.objectContaining({ proposalCount: 1 }),
      inventoryFingerprint: expect.any(String),
      status: "verified",
      workosProjectionFingerprintAfter: expect.any(String),
      workosProjectionFingerprintBefore: expect.any(String),
      workosProjectionWriteCount: 0,
    });
    expect(Object.keys(runReadback.countsBefore).sort()).toEqual([
      "activeBuildCount",
      "approvalCount",
      "assignmentCount",
      "closingCount",
      "kanbanCardCount",
      "policyLockCount",
      "policyVersionCount",
      "projectionMismatchCount",
      "proposalCount",
      "proposalStatusCounts",
      "reconciliationCandidateCount",
      "reconciliationPendingCount",
      "reviewCycleCount",
      "revisionCount",
    ]);
    expect(runReadback.countsBefore.proposalStatusCounts).toEqual({
      closed: 1,
    });
    expect(runReadback.countsAfter).toEqual(
      expect.objectContaining({
        proposalStatusCounts: { closed: 1 },
      })
    );

    const inventory = await t
      .withIdentity(identity("phase9_admin", ORG, "admin"))
      .query(
        api.lender_portal_phase9
          .inventoryLenderPortalPhase9MigrationCandidates,
        {
          candidateSha: CANDIDATE_SHA,
          organizationId: ORG,
          paginationOpts: { cursor: null, numItems: 25 },
        }
      );
    expect(inventory.page).toEqual([
      expect.objectContaining({
        activeBuildCount: 1,
        ambiguityCodes: [],
        closingCount: 1,
        projectionMatches: true,
      }),
    ]);
    const auditReadback = await t
      .withIdentity(identity("phase9_admin", ORG, "admin"))
      .query(
        api.lender_portal_phase9
          .readLenderPortalPhase9MigrationAudit,
        {
          organizationId: ORG,
          paginationOpts: { cursor: null, numItems: 25 },
          runToken: prepared.runToken,
        }
      );
    expect(auditReadback.page.length).toBeGreaterThanOrEqual(2);
    expect(auditReadback.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateSha: CANDIDATE_SHA,
          eventType: "lender_portal.migration.lifecycle_reconciled",
        }),
        expect.objectContaining({
          candidateSha: CANDIDATE_SHA,
          eventType: "lender_portal.migration.projection_rebuilt",
        }),
        expect.objectContaining({
          candidateSha: CANDIDATE_SHA,
          eventType: "lender_portal.migration.approval_reconciled",
        }),
        expect.objectContaining({
          candidateSha: CANDIDATE_SHA,
          eventType: "lender_portal.migration.policy_lock_reconciled",
        }),
        expect.objectContaining({
          eventType: "lender_portal.migration.authorized",
          newState: expect.stringContaining('"status":"authorized"'),
          priorState: expect.stringContaining('"status":"ready"'),
        }),
        expect.objectContaining({
          eventType: "lender_portal.migration.apply_started",
          newState: expect.stringContaining('"status":"applying"'),
          priorState: expect.stringContaining('"status":"authorized"'),
        }),
        expect.objectContaining({
          eventType: "lender_portal.migration.verified",
          newState: expect.stringContaining('"status":"verified"'),
          priorState: expect.stringContaining('"status":"applying"'),
        }),
      ])
    );
  });
});
