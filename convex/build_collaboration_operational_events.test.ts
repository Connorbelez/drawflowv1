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
  subject: string
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

async function seedOperationalBuild(options?: { collaborationActive?: boolean }) {
  const base = convexTest(schema, modules);
  const admin = withIdentity(base, "admin", "user_admin");
  const foundation = await admin.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORGANIZATION_ID }
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
      }
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
      activatedAt:
        options?.collaborationActive === false ? undefined : now,
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
      }
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
    return { buildId, milestoneId, proposalId };
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
      "user_assigned_contractor"
    ),
    contractor: withIdentity(base, "contractor", "user_contractor"),
    globalAdmin: withIdentity(base, "admin", "user_global_admin"),
    globalPrincipal: withIdentity(
      base,
      "principle-broker",
      "user_global_principal"
    ),
    homeowner: withIdentity(base, "homeowner", "user_homeowner"),
  };
}

async function collaborationSnapshot(
  base: ReturnType<typeof convexTest>,
  buildId: string
) {
  return await base.run(async (ctx) => {
    const posts = (
      await ctx.db.query("buildCollaborationPosts").collect()
    ).filter((row) => String(row.buildId) === buildId);
    const postIds = new Set(posts.map((post) => String(post._id)));
    return {
      actionItems: (await ctx.db.query("buildActionItems").collect()).filter(
        (row) => String(row.buildId) === buildId
      ),
      deliveries: (await ctx.db.query("recipientDeliveries").collect()).filter(
        (row) =>
          row.collaborationBuildId &&
          String(row.collaborationBuildId) === buildId
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
  buildId: any
): Promise<string[]> {
  const feed = await actor.query(
    (api as any).build_collaboration.listBuildCollaborationFeed,
    {
      buildId,
      organizationId: ORGANIZATION_ID,
      paginationOpts: { cursor: null, numItems: 50 },
    }
  );
  return feed.page.map((entry: { kind: string }) => entry.kind);
}

describe("Build Collaboration operational events", () => {
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
      }
    );

    const snapshot = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId)
    );
    expect(snapshot.posts).toHaveLength(2);
    expect(snapshot.posts.map((post) => post.systemEventKey)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/:submitted$/),
        expect.stringMatching(/:location-unverified$/),
      ])
    );
    expect(snapshot.posts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ threadState: "open" }),
      ])
    );
    expect(snapshot.references).toHaveLength(3);
    expect(
      snapshot.references.filter((reference) =>
        String(reference.ownerKind).includes("postRevision")
      )
    ).toHaveLength(2);
    expect(snapshot.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: expect.any(String),
          entityKind: "evidenceAsset",
          primary: true,
        }),
      ])
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
      ])
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
            .eq("evidenceKey", "foundation-photo-1")
        )
        .unique()
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
      }
    );
    await fixture.admin.mutation(
      (api as any).production_proposals.reviewActiveBuildEvidence,
      {
        accepted: false,
        buildId: fixture.buildId,
        milestoneKey: "foundation",
        note: "Add the engineer seal.",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const afterReject = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId)
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
      }
    );
    const afterNoOp = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId)
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
      }
    );
    const afterSecondMaterialReject = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId)
    );
    expect(afterSecondMaterialReject.posts).toHaveLength(
      afterReject.posts.length + 1
    );
    expect(afterSecondMaterialReject.actionItems).toHaveLength(1);

    await fixture.admin.mutation(
      (api as any).production_proposals.reviewActiveBuildEvidence,
      {
        accepted: true,
        buildId: fixture.buildId,
        milestoneKey: "foundation",
        note: "Seal received and verified.",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const afterAcceptance = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId)
    );
    expect(afterAcceptance.posts).toHaveLength(
      afterSecondMaterialReject.posts.length + 1
    );
    expect(afterAcceptance.actionItems).toHaveLength(1);
    expect(afterAcceptance.posts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ postType: "issue" }),
        expect.objectContaining({ postType: "update" }),
      ])
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
      }
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
      }
    );
    expect(scheduleReplay.visitId).toBe(scheduled.visitId);
    const afterScheduleReplay = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId)
    );
    expect(afterScheduleReplay.posts).toHaveLength(1);
    expect(
      await fixture.base.run(async (ctx) =>
        (
          await ctx.db
            .query("buildSiteVisits")
            .withIndex("by_build", (query) =>
              query.eq("buildId", fixture.buildId)
            )
            .collect()
        ).length
      )
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
      }
    );
    const afterReschedule = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId)
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
      }
    );
    const afterNoOp = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId)
    );
    expect(afterNoOp.posts).toHaveLength(afterReschedule.posts.length);
    expect(afterNoOp.deliveries).toHaveLength(afterReschedule.deliveries.length);

    const storageId = await fixture.base.run(async (ctx) =>
      ctx.storage.store(
        new Blob(["site visit evidence"], { type: "image/webp" })
      )
    );
    const registration = {
      buildId: String(fixture.buildId),
      clientEvidenceId: "site-visit-geofence-photo",
      fileName: "site-visit-geofence-photo.webp",
      locationAttempt: {
        accuracyMeters: 10,
        attempted: true,
        attemptedAt: 1_722_222_222_222,
        latitude: 43.2557,
        longitude: -79.8711,
        permissionOutcome: "granted" as const,
        verified: true,
      },
      mimeType: "image/webp",
      sizeBytes: 128_000,
      storageId,
      targetMilestoneKey: "foundation",
      token: scheduled.visitId,
    };
    await fixture.base.mutation(
      (api as any).production_proposals.registerActiveBuildSiteVisitFile,
      registration
    );
    const afterRegistration = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId)
    );
    expect(afterRegistration.posts).toHaveLength(afterReschedule.posts.length + 1);
    expect(afterRegistration.posts.map((post) => post.systemEventKey)).toEqual(
      expect.arrayContaining([expect.stringMatching(/:submitted$/)])
    );
    expect(afterRegistration.actionItems).toHaveLength(0);
    await fixture.base.mutation(
      (api as any).production_proposals.registerActiveBuildSiteVisitFile,
      registration
    );
    const afterRegistrationReplay = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId)
    );
    expect(afterRegistrationReplay.posts).toHaveLength(
      afterRegistration.posts.length
    );
    expect(afterRegistrationReplay.deliveries).toHaveLength(
      afterRegistration.deliveries.length
    );
    expect(afterRegistrationReplay.actionItems).toHaveLength(
      afterRegistration.actionItems.length
    );

    await fixture.base.mutation(
      (api as any).production_proposals.submitActiveBuildTokenizedSiteVisitReport,
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
      }
    );

    const afterSubmission = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId)
    );
    expect(afterSubmission.posts).toHaveLength(afterRegistration.posts.length + 3);
    expect(afterSubmission.actionItems).toHaveLength(2);
    expect(afterSubmission.posts.map((post) => post.systemEventKey)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/:location-unverified$/),
        expect.stringMatching(/:completed$/),
        expect.stringMatching(/:flagged$/),
      ])
    );
    expect(afterSubmission.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: expect.stringMatching(/focus=siteVisit%3A/),
        }),
      ])
    );
    const assignedContractorKinds = await feedKinds(
      fixture.assignedContractor,
      fixture.buildId
    );
    expect(
      assignedContractorKinds.filter((kind) => kind === "post")
    ).toHaveLength(4);
    expect(
      assignedContractorKinds.filter((kind) => kind === "restricted")
    ).toHaveLength(2);
    expect(await feedKinds(fixture.contractor, fixture.buildId)).toEqual(
      Array.from({ length: 6 }, () => "restricted")
    );
    expect(await feedKinds(fixture.homeowner, fixture.buildId)).toEqual(
      Array.from({ length: 6 }, () => "restricted")
    );
    expect(
      afterSubmission.deliveries.some(
        (delivery) =>
          delivery.recipientWorkosUserId === "user_assigned_contractor" &&
          delivery.href.includes("focus=siteVisit%3A")
      )
    ).toBe(true);
    expect(
      afterSubmission.deliveries.some(
        (delivery) => delivery.recipientWorkosUserId === "user_contractor"
      )
    ).toBe(false);
    const evidence = await fixture.base.run(async (ctx) =>
      (
        await ctx.db
          .query("buildEvidenceAssets")
          .withIndex("by_build", (query) =>
            query.eq("buildId", fixture.buildId)
          )
          .collect()
      ).find(
        (asset) => asset.clientEvidenceId === "site-visit-geofence-photo"
      )
    );
    expect(evidence).toMatchObject({
      locationAttemptedAt: 1_722_222_222_222,
      locationVerified: false,
    });
    expect(evidence?.locationFailureReason).toMatch(
      /outside the 250 m geofence/
    );
    expect(evidence?.locationDistanceMeters).toBeGreaterThan(250);

    await fixture.admin.mutation(
      (api as any).production_proposals.cancelActiveBuildSiteVisit,
      {
        buildId: fixture.buildId,
        reason: "Visit requires a replacement inspection.",
        visitId: scheduled.visitId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const afterCancellation = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId)
    );
    expect(afterCancellation.posts).toHaveLength(afterSubmission.posts.length + 1);
    expect(afterCancellation.actionItems).toHaveLength(
      afterSubmission.actionItems.length
    );
    await fixture.admin.mutation(
      (api as any).production_proposals.cancelActiveBuildSiteVisit,
      {
        buildId: fixture.buildId,
        reason: "Identical cancellation retry.",
        visitId: scheduled.visitId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const afterCancellationRetry = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId)
    );
    expect(afterCancellationRetry.posts).toHaveLength(
      afterCancellation.posts.length
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
        }
      )
    ).rejects.toThrow("Site visit token is not active.");
    const afterRetry = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId)
    );
    expect(afterRetry.posts).toHaveLength(afterCancellationRetry.posts.length);
    expect(afterRetry.references).toHaveLength(
      afterCancellationRetry.references.length
    );
    expect(afterRetry.deliveries).toHaveLength(
      afterCancellationRetry.deliveries.length
    );
    expect(afterRetry.actionItems).toHaveLength(
      afterCancellationRetry.actionItems.length
    );
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
      event
    );
    const afterFirst = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId)
    );
    const replayPostId = await fixture.admin.mutation(
      (internal as any).build_collaboration_system_events
        .publishBuildCollaborationSystemEvent,
      event
    );
    const afterReplay = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId)
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
        }
      )
    ).rejects.toThrow();
    const afterRollback = await collaborationSnapshot(
      fixture.base,
      String(fixture.buildId)
    );
    expect(afterRollback.posts).toHaveLength(afterReplay.posts.length);
    expect(afterRollback.references).toHaveLength(afterReplay.references.length);
    expect(afterRollback.deliveries).toHaveLength(afterReplay.deliveries.length);
    expect(afterRollback.actionItems).toHaveLength(afterReplay.actionItems.length);

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
      }
    );
    const inactiveSnapshot = await collaborationSnapshot(
      inactive.base,
      String(inactive.buildId)
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
            .eq("evidenceKey", "inactive-tenant-evidence")
        )
        .unique()
    );
    expect(inactiveAsset).toBeTruthy();
  });
});
