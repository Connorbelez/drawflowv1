/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

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

describe("Build Collaboration operational events", () => {
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
      "post",
      "post",
      "post",
      "post",
    ]);
    expect(await feedKinds(fixture.homeowner, fixture.buildId)).toEqual([
      "post",
      "post",
      "post",
      "post",
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
    const snapshot = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId),
    );
    expect(snapshot.posts).toHaveLength(5);
    expect(snapshot.actionItems).toHaveLength(1);
    expect(snapshot.actionItems[0]).toMatchObject({
      dueDatePolicyKey: "draw-returned",
      primaryReferenceKind: "draw",
      workKind: "draw_blocker",
    });
    expect(snapshot.references.length).toBeGreaterThanOrEqual(10);
    expect(snapshot.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: expect.stringMatching(/focus=draw%3A/),
          recipientWorkosUserId: "user_global_principal",
        }),
      ]),
    );
    expect(await feedKinds(fixture.builderStaff, fixture.buildId)).toEqual([
      "restricted",
      "restricted",
      "restricted",
      "restricted",
      "restricted",
    ]);
    expect(await feedKinds(permittedBuilderStaff, fixture.buildId)).toEqual([
      "post",
      "post",
      "post",
      "post",
      "post",
    ]);
    expect(await feedKinds(fixture.contractor, fixture.buildId)).toEqual([
      "restricted",
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
      "restricted",
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
});
