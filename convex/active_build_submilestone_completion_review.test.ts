/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import {
  appendActiveSubmilestoneEvidenceAssetToDraft,
  ensureActiveSubmilestoneEvidencePackageDraft,
  freezeActiveSubmilestoneEvidencePackage,
} from "./build_submilestone_evidence";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORG = "org_submilestone_completion_review";

function withIdentity(t: any, roles: string[], subject: string) {
  return t.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId: ORG,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as any);
}

async function seedFixture() {
  const base = convexTest(schema, modules);
  const admin = withIdentity(base, ["admin"], "user_admin");
  const seed = await admin.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORG },
  );
  const proposalId = await admin.mutation(
    (api as any).production_proposals.createDraftProposal,
    {
      brokerageId: seed.brokerageId,
      builderProfileId: seed.builderProfileId,
      buildName: "Sub-milestone completion review fixture",
      location: "7 Evidence Review Lane",
      workosOrganizationId: ORG,
    },
  );
  await admin.mutation(
    (api as any).production_proposals.saveDraftProposalPackage,
    {
      borrowerCoPayBps: 2_000,
      borrowerWorkingCapitalLimitCents: 35_000_000,
      documents: [
        {
          documentType: "permit",
          fileName: "review-fixture-permit.pdf",
          mimeType: "application/pdf",
          sizeBytes: 512,
        },
      ],
      lenderDrawPolicyLimitCents: 55_000_000,
      milestones: [
        {
          budgetCents: 50_000_000,
          dayEnd: 20,
          dayStart: 0,
          dependencyKeys: [],
          durationDays: 20,
          key: "foundation",
          name: "Foundation",
          order: 1,
          submilestones: [
            {
              budgetCents: 10_000_000,
              durationDays: 5,
              key: "forms",
              name: "Forms",
              order: 1,
            },
          ],
        },
      ],
      proposalId,
      workosOrganizationId: ORG,
    },
  );
  await admin.mutation((api as any).production_proposals.submitProposal, {
    proposalId,
    workosOrganizationId: ORG,
  });
  await admin.mutation((api as any).production_proposals.approveProposal, {
    proposalId,
    reason: "Review fixture is ready to close.",
    workosOrganizationId: ORG,
  });
  const closing = await admin.mutation(
    (api as any).production_proposals.recordOfflineClosing,
    {
      buildStartDate: "2026-05-01",
      ianaTimezone: "America/Toronto",
      loanFacility: {
        interestAnnualBps: 925,
        principalCents: 55_000_000,
      },
      proposalId,
      reason: "Review fixture loan closed.",
      workosOrganizationId: ORG,
    },
  );
  await base.run(async (ctx: any) => {
    const build = await ctx.db.get(closing.buildId);
    if (!build) {
      throw new Error("Review fixture Build is unavailable.");
    }
    const now = Date.now();
    await ctx.db.insert("buildCollaborationTenantSettings", {
      activatedAt: now,
      activatedByWorkosUserId: "user_admin",
      brokerageId: build.brokerageId,
      createdAt: now,
      generousRateLimitMultiplier: 1,
      migrationCompletedAt: now,
      organizationId: ORG,
      status: "active",
      updatedAt: now,
    });
    for (const participant of [
      ["user_builder", "builder"],
      ["user_broker", "broker"],
      ["user_contractor", "contractor"],
    ] as const) {
      await ctx.db.insert("buildParticipants", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now,
        displayNameSnapshot: participant[0],
        joinedAt: now,
        organizationId: ORG,
        participationPeriod: 1,
        role: participant[1],
        status: "active",
        updatedAt: now,
        validFrom: now,
        workosUserId: participant[0],
      });
    }
  });
  const builder = withIdentity(base, ["builder"], "user_builder");
  const contractor = withIdentity(base, ["contractor"], "user_contractor");
  const lender = withIdentity(base, ["broker"], "user_broker");
  return { admin, base, builder, closing, contractor, lender };
}

async function startForms(fixture: Awaited<ReturnType<typeof seedFixture>>) {
  return await fixture.builder.mutation(
    (api as any).production_proposals.startActiveBuildMilestone,
    {
      actualStartedAt: Date.parse("2026-05-03T14:30:00.000Z"),
      buildId: fixture.closing.buildId,
      idempotencyKey: "completion-review-forms-start",
      milestoneKey: "foundation",
      source: "milestone_detail",
      submilestoneKey: "forms",
      workosOrganizationId: ORG,
    },
  );
}

async function storeEvidence(
  fixture: Awaited<ReturnType<typeof seedFixture>>,
  content: string,
) {
  return await fixture.base.run((ctx: any) =>
    ctx.storage.store(new Blob([content], { type: "image/jpeg" })),
  );
}

async function submilestoneState(
  fixture: Awaited<ReturnType<typeof seedFixture>>,
) {
  return await fixture.base.run(async (ctx: any) => {
    const milestone = await ctx.db
      .query("buildMilestones")
      .withIndex("by_build_key", (q: any) =>
        q.eq("buildId", fixture.closing.buildId).eq("key", "foundation"),
      )
      .unique();
    if (!milestone) {
      throw new Error("Foundation milestone is unavailable.");
    }
    const submilestone = await ctx.db
      .query("buildSubmilestones")
      .withIndex("by_milestone", (q: any) =>
        q.eq("buildMilestoneId", milestone._id),
      )
      .filter((q: any) => q.eq(q.field("key"), "forms"))
      .unique();
    if (!submilestone) {
      throw new Error("Forms Sub-milestone is unavailable.");
    }
    const packageRevision = submilestone.evidencePackageRevisionId
      ? await ctx.db.get(submilestone.evidencePackageRevisionId)
      : null;
    return { milestone, packageRevision, submilestone };
  });
}

async function submitReviewPackage(
  fixture: Awaited<ReturnType<typeof seedFixture>>,
  key: string,
) {
  const before = await submilestoneState(fixture);
  const storageId = await storeEvidence(fixture, key);
  const evidence = await fixture.builder.mutation(
    (api as any).production_proposals.addActiveBuildSubmilestoneEvidence,
    {
      buildId: fixture.closing.buildId,
      evidence: {
        fileName: `${key}.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 100,
        storageId,
      },
      expectedRevision: before.submilestone.workflowRevision ?? 0,
      idempotencyKey: `${key}-evidence`,
      milestoneKey: "foundation",
      submilestoneKey: "forms",
      workosOrganizationId: ORG,
    },
  );
  const afterEvidence = await submilestoneState(fixture);
  await fixture.builder.mutation(
    (api as any).production_proposals.freezeActiveBuildSubmilestoneEvidencePackage,
    {
      buildId: fixture.closing.buildId,
      expectedRevision: afterEvidence.submilestone.workflowRevision,
      milestoneKey: "foundation",
      packageRevisionId: evidence.evidencePackageRevisionId,
      submilestoneKey: "forms",
      workosOrganizationId: ORG,
    },
  );
  const frozen = await submilestoneState(fixture);
  return await fixture.builder.mutation(
    (api as any).production_proposals.submitActiveBuildSubmilestoneCompletionForReview,
    {
      buildId: fixture.closing.buildId,
      completionNote: `Review package ${key}`,
      declareComplete: true,
      expectedPackageRevision: frozen.packageRevision?.revision,
      expectedRevision: frozen.submilestone.workflowRevision,
      idempotencyKey: `${key}-submit`,
      milestoneKey: "foundation",
      packageRevisionId: evidence.evidencePackageRevisionId,
      submilestoneKey: "forms",
      workosOrganizationId: ORG,
    },
  );
}

describe("canonical Sub-milestone completion review", () => {
  test("deduplicates Evidence Package items by asset and requirement pair", async () => {
    const fixture = await seedFixture();
    await startForms(fixture);
    await fixture.builder.mutation(
      (api as any).production_proposals.configureActiveBuildSubmilestoneEvidenceRequirements,
      {
        buildId: fixture.closing.buildId,
        milestoneKey: "foundation",
        requirements: [
          {
            kind: "photo",
            label: "Forms photo",
            required: true,
            requirementKey: "forms-photo",
          },
          {
            kind: "document",
            label: "Forms document",
            required: true,
            requirementKey: "forms-document",
          },
        ],
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    const storageId = await storeEvidence(fixture, "same-asset");
    const result = await fixture.base.run(async (ctx: any) => {
      const build = await ctx.db.get(fixture.closing.buildId);
      const milestone = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (q: any) =>
          q.eq("buildId", fixture.closing.buildId).eq("key", "foundation"),
        )
        .unique();
      const submilestone = milestone
        ? await ctx.db
            .query("buildSubmilestones")
            .withIndex("by_milestone", (q: any) =>
              q.eq("buildMilestoneId", milestone._id),
            )
            .filter((q: any) => q.eq(q.field("key"), "forms"))
            .unique()
        : null;
      if (!build || !milestone || !submilestone) {
        throw new Error("Evidence pair fixture is incomplete.");
      }
      const now = Date.now();
      const assetId = await ctx.db.insert("buildEvidenceAssets", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now,
        evidenceKey: "same-asset-for-two-requirements",
        fileName: "same-asset.jpg",
        label: "Same asset",
        locationVerified: true,
        milestoneKey: milestone.key,
        mimeType: "image/jpeg",
        organizationId: build.organizationId,
        proposalId: build.proposalId,
        sizeBytes: 128,
        source: "test",
        storageId,
        submilestoneKey: submilestone.key,
        tag: milestone.name,
        updatedAt: now,
      });
      const asset = await ctx.db.get(assetId);
      if (!asset) {
        throw new Error("Evidence pair asset is unavailable.");
      }
      const first = await appendActiveSubmilestoneEvidenceAssetToDraft(ctx, {
        actorWorkosUserId: "user_builder",
        asset,
        build,
        milestone,
        requirementKey: "forms-photo",
        sourceKind: "canonical_upload",
        submilestone,
      });
      const second = await appendActiveSubmilestoneEvidenceAssetToDraft(ctx, {
        actorWorkosUserId: "user_builder",
        asset,
        build,
        milestone,
        requirementKey: "forms-document",
        sourceKind: "canonical_upload",
        submilestone,
      });
      const replay = await appendActiveSubmilestoneEvidenceAssetToDraft(ctx, {
        actorWorkosUserId: "user_builder",
        asset,
        build,
        milestone,
        requirementKey: "forms-photo",
        sourceKind: "canonical_upload",
        submilestone,
      });
      const items = await ctx.db
        .query("buildSubmilestoneEvidencePackageItems")
        .withIndex("by_package_revision", (q: any) =>
          q.eq("packageRevisionId", first.packageRevision._id),
        )
        .collect();
      return { first, items, replay, second };
    });
    expect(result.second.packageRevision._id).toBe(result.first.packageRevision._id);
    expect(result.replay.item?._id).toBe(result.first.item?._id);
    expect(result.items).toHaveLength(2);
    expect(result.items.map((item: any) => item.requirementKey).sort()).toEqual([
      "forms-document",
      "forms-photo",
    ]);
    expect(
      result.items.every(
        (item: any) => item.evidenceAssetId === result.first.item?.evidenceAssetId,
      ),
    ).toBe(true);
  });

  test("audits draft-to-frozen Evidence Packages and keeps frozen replay idempotent", async () => {
    const fixture = await seedFixture();
    await startForms(fixture);
    const result = await fixture.base.run(async (ctx: any) => {
      const build = await ctx.db.get(fixture.closing.buildId);
      const milestone = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (q: any) =>
          q.eq("buildId", fixture.closing.buildId).eq("key", "foundation"),
        )
        .unique();
      const submilestone = milestone
        ? await ctx.db
            .query("buildSubmilestones")
            .withIndex("by_milestone", (q: any) =>
              q.eq("buildMilestoneId", milestone._id),
            )
            .filter((q: any) => q.eq(q.field("key"), "forms"))
            .unique()
        : null;
      if (!build || !milestone || !submilestone) {
        throw new Error("Evidence freeze fixture is incomplete.");
      }
      const first = await freezeActiveSubmilestoneEvidencePackage(ctx, {
        actorRoles: ["builder"],
        actorWorkosUserId: "user_builder",
        build,
        milestone,
        reason: "Builder froze the first completion package.",
        submilestone,
      });
      if (!first) {
        throw new Error("First frozen Evidence Package is unavailable.");
      }
      const draft = await ensureActiveSubmilestoneEvidencePackageDraft(ctx, {
        actorWorkosUserId: "user_builder",
        build,
        milestone,
        submilestone,
      });
      const second = await freezeActiveSubmilestoneEvidencePackage(ctx, {
        actorRoles: ["admin"],
        actorWorkosUserId: "user_admin",
        build,
        expectedRevision: draft.revision,
        milestone,
        reason: "Admin froze the replacement completion package.",
        submilestone,
      });
      if (!second) {
        throw new Error("Second frozen Evidence Package is unavailable.");
      }
      const replay = await freezeActiveSubmilestoneEvidencePackage(ctx, {
        actorRoles: ["builder"],
        actorWorkosUserId: "user_builder",
        build,
        expectedRevision: second.revision,
        milestone,
        reason: "This replay must not create a new audit.",
        submilestone,
      });
      const audits = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "buildSubmilestone")
            .eq("entityId", String(submilestone._id)),
        )
        .filter((q: any) =>
          q.eq(q.field("command"), "freezeActiveSubmilestoneEvidencePackage"),
        )
        .collect();
      return {
        audits,
        draft,
        first,
        replay,
        second,
        submilestoneId: String(submilestone._id),
      };
    });
    expect(result.replay).toEqual(result.second);
    expect(result.audits).toHaveLength(2);
    expect(result.audits[0]).toMatchObject({
      actorRoles: ["builder"],
      actorWorkosUserId: "user_builder",
      command: "freezeActiveSubmilestoneEvidencePackage",
      entityType: "buildSubmilestone",
      eventType: "active_build.submilestone.evidence_package_frozen",
      reason: "Builder froze the first completion package.",
      warnings: [],
    });
    expect(result.audits[1]).toMatchObject({
      actorRoles: ["admin"],
      actorWorkosUserId: "user_admin",
      reason: "Admin froze the replacement completion package.",
      warnings: [],
    });
    for (const [index, audit] of result.audits.entries()) {
      expect(audit.createdAt).toEqual(expect.any(Number));
      expect(audit.entityId).toBe(result.submilestoneId);
      expect(JSON.parse(audit.priorState)).toMatchObject({
        revision: index + 1,
        status: "draft",
      });
      expect(JSON.parse(audit.newState)).toMatchObject({
        revision: index + 1,
        status: "frozen",
      });
    }
  });

  test("keeps 100% as progress-only, then enters review only after a frozen package and declaration", async () => {
    const fixture = await seedFixture();
    await startForms(fixture);
    await fixture.builder.mutation(
      (api as any).production_proposals.configureActiveBuildSubmilestoneEvidenceRequirements,
      {
        buildId: fixture.closing.buildId,
        milestoneKey: "foundation",
        requirements: [
          {
            kind: "photo",
            label: "Forms photo",
            required: true,
            requirementKey: "forms-photo",
          },
        ],
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    const startState = await submilestoneState(fixture);
    const progress = await fixture.builder.mutation(
      (api as any).production_proposals.updateActiveBuildSubmilestoneProgress,
      {
        actualCostCents: 250_000,
        buildId: fixture.closing.buildId,
        completionForecastDate: "2026-05-07",
        expectedRevision: startState.submilestone.workflowRevision ?? 0,
        fieldNote: "Forms are installed.",
        idempotencyKey: "completion-review-forms-progress",
        milestoneKey: "foundation",
        progressPercent: 100,
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(progress).toMatchObject({ progressPercent: 100, replayed: false });
    expect((await submilestoneState(fixture)).submilestone).toMatchObject({
      progressPercent: 100,
      status: "in_progress",
    });
    const progressReplay = await fixture.builder.mutation(
      (api as any).production_proposals.updateActiveBuildSubmilestoneProgress,
      {
        actualCostCents: 250_000,
        buildId: fixture.closing.buildId,
        completionForecastDate: "2026-05-07",
        expectedRevision: startState.submilestone.workflowRevision ?? 0,
        fieldNote: "Forms are installed.",
        idempotencyKey: "completion-review-forms-progress",
        milestoneKey: "foundation",
        progressPercent: 100,
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(progressReplay).toMatchObject({ progressPercent: 100, replayed: true });
    expect((await submilestoneState(fixture)).submilestone.workflowRevision).toBe(
      progress.revision,
    );
    const evidence = await fixture.builder.mutation(
      (api as any).production_proposals.addActiveBuildSubmilestoneEvidence,
      {
        buildId: fixture.closing.buildId,
        evidence: {
          fileName: "forms-photo.jpg",
          mimeType: "image/jpeg",
          requirementKey: "forms-photo",
          sizeBytes: 1024,
          storageId: await storeEvidence(fixture, "forms-photo"),
        },
        expectedRevision: progress.revision,
        idempotencyKey: "completion-review-forms-evidence",
        milestoneKey: "foundation",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    const packageAfterEvidence = await submilestoneState(fixture);
    expect(evidence).toMatchObject({
      evidencePackageRevisionId: packageAfterEvidence.packageRevision?._id,
      locationVerified: false,
      replayed: false,
    });
    expect(packageAfterEvidence.packageRevision?.status).toBe("draft");
    await expect(
      fixture.builder.mutation(
        (api as any).production_proposals.submitActiveBuildSubmilestoneCompletionForReview,
        {
          buildId: fixture.closing.buildId,
          declareComplete: true,
          expectedPackageRevision: packageAfterEvidence.packageRevision?.revision,
          expectedRevision: evidence.revision,
          idempotencyKey: "completion-review-forms-before-freeze",
          milestoneKey: "foundation",
          packageRevisionId: evidence.evidencePackageRevisionId,
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/stale or not frozen/i);
    const frozen = await fixture.builder.mutation(
      (api as any).production_proposals.freezeActiveBuildSubmilestoneEvidencePackage,
      {
        buildId: fixture.closing.buildId,
        expectedRevision: evidence.revision,
        milestoneKey: "foundation",
        packageRevisionId: evidence.evidencePackageRevisionId,
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(frozen).toMatchObject({ status: "frozen", readyExceptFor: [] });
    const frozenState = await submilestoneState(fixture);
    expect(frozenState.packageRevision?.status).toBe("frozen");
    await expect(
      fixture.builder.mutation(
        (api as any).production_proposals.submitActiveBuildSubmilestoneCompletionForReview,
        {
          buildId: fixture.closing.buildId,
          declareComplete: false,
          expectedPackageRevision: frozenState.packageRevision?.revision,
          expectedRevision: frozen.revision,
          idempotencyKey: "completion-review-forms-no-declaration",
          milestoneKey: "foundation",
          packageRevisionId: evidence.evidencePackageRevisionId,
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/declaration is required/i);
    await expect(
      fixture.builder.mutation(
        (api as any).production_proposals.submitActiveBuildSubmilestoneCompletionForReview,
        {
          buildId: fixture.closing.buildId,
          declareComplete: true,
          expectedPackageRevision: (frozenState.packageRevision?.revision ?? 0) + 1,
          expectedRevision: frozen.revision,
          idempotencyKey: "completion-review-forms-stale-package",
          milestoneKey: "foundation",
          packageRevisionId: evidence.evidencePackageRevisionId,
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/stale or not frozen/i);
    const submitted = await fixture.builder.mutation(
      (api as any).production_proposals.submitActiveBuildSubmilestoneCompletionForReview,
      {
        buildId: fixture.closing.buildId,
        completionNote: "I declare the Forms Sub-milestone complete.",
        declareComplete: true,
        expectedPackageRevision: frozenState.packageRevision?.revision,
        expectedRevision: frozen.revision,
        idempotencyKey: "completion-review-forms-submit",
        milestoneKey: "foundation",
        packageRevisionId: evidence.evidencePackageRevisionId,
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(submitted).toMatchObject({
      replayed: false,
      status: "in_review",
    });
    const replayed = await fixture.builder.mutation(
      (api as any).production_proposals.submitActiveBuildSubmilestoneCompletionForReview,
      {
        buildId: fixture.closing.buildId,
        completionNote: "I declare the Forms Sub-milestone complete.",
        declareComplete: true,
        expectedPackageRevision: frozenState.packageRevision?.revision,
        expectedRevision: frozen.revision + 1,
        idempotencyKey: "completion-review-forms-submit",
        milestoneKey: "foundation",
        packageRevisionId: evidence.evidencePackageRevisionId,
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(replayed).toMatchObject({ replayed: true, status: "in_review" });
    expect((await submilestoneState(fixture)).submilestone).toMatchObject({
      evidenceReviewState: "in_review",
      progressPercent: 100,
      status: "in_progress",
    });
    const stalePackageRevisionId = evidence.evidencePackageRevisionId;
    await fixture.base.run(async (ctx: any) => {
      const build = await ctx.db.get(fixture.closing.buildId);
      const milestone = build
        ? await ctx.db
            .query("buildMilestones")
            .withIndex("by_build_key", (q: any) =>
              q.eq("buildId", fixture.closing.buildId).eq("key", "foundation"),
            )
            .unique()
        : null;
      const submilestone = milestone
        ? await ctx.db
            .query("buildSubmilestones")
            .withIndex("by_milestone", (q: any) =>
              q.eq("buildMilestoneId", milestone._id),
            )
            .filter((q: any) => q.eq(q.field("key"), "forms"))
            .unique()
        : null;
      if (!build || !milestone || !submilestone) {
        throw new Error("Evidence freeze fixture is incomplete.");
      }
      await ensureActiveSubmilestoneEvidencePackageDraft(ctx, {
        actorWorkosUserId: "user_builder",
        build,
        milestone,
        submilestone,
      });
    });
    await expect(
      fixture.builder.mutation(
        (api as any).production_proposals.freezeActiveBuildSubmilestoneEvidencePackage,
        {
          buildId: fixture.closing.buildId,
          expectedRevision: replayed.revision,
          milestoneKey: "foundation",
          packageRevisionId: stalePackageRevisionId,
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/revision changed/i);
    const secondEvidence = await fixture.builder.mutation(
      (api as any).production_proposals.addActiveBuildSubmilestoneEvidence,
      {
        buildId: fixture.closing.buildId,
        evidence: {
          fileName: "forms-photo-replacement.jpg",
          mimeType: "image/jpeg",
          requirementKey: "forms-photo",
          sizeBytes: 2048,
          storageId: await storeEvidence(fixture, "forms-photo-replacement"),
        },
        expectedRevision: replayed.revision,
        idempotencyKey: "completion-review-forms-evidence-replacement",
        milestoneKey: "foundation",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    const secondEvidenceState = await submilestoneState(fixture);
    const secondEvidenceEventKeys = await fixture.base.run(async (ctx: any) =>
      (await ctx.db.query("buildCollaborationPosts").collect())
        .map((post: any) => post.systemEventKey)
        .filter(
          (key: string | undefined) =>
            key?.includes(String(secondEvidence.evidenceAssetId)),
        ),
    );
    expect(secondEvidenceState.packageRevision?.revision).toBe(
      (frozenState.packageRevision?.revision ?? 0) + 1,
    );
    expect(secondEvidenceState.packageRevision?.status).toBe("draft");
    expect(secondEvidenceEventKeys).toEqual(
      expect.arrayContaining([
        `operational:evidence:${secondEvidence.evidenceAssetId}:r1:submitted`,
        `operational:evidence:${secondEvidence.evidenceAssetId}:r1:location-unverified`,
      ]),
    );
    const secondEvidenceAsset = await fixture.base.run((ctx: any) =>
      ctx.db.get(secondEvidence.evidenceAssetId),
    );
    expect(secondEvidenceAsset).toMatchObject({
      collaborationEventRevision: 1,
    });
  });

  test("rejects lender execution and stale progress atomically", async () => {
    const fixture = await seedFixture();
    await startForms(fixture);
    const initial = await submilestoneState(fixture);
    await expect(
      fixture.lender.mutation(
        (api as any).production_proposals.updateActiveBuildSubmilestoneProgress,
        {
          buildId: fixture.closing.buildId,
          expectedRevision: initial.submilestone.workflowRevision ?? 0,
          idempotencyKey: "completion-review-lender-progress",
          milestoneKey: "foundation",
          progressPercent: 50,
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/cannot execute Builder work/i);
    await expect(
      fixture.contractor.mutation(
        (api as any).production_proposals.updateActiveBuildSubmilestoneProgress,
        {
          buildId: fixture.closing.buildId,
          expectedRevision: initial.submilestone.workflowRevision ?? 0,
          idempotencyKey: "completion-review-unassigned-contractor",
          milestoneKey: "foundation",
          progressPercent: 50,
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/exact assigned Contractor/i);
    const first = await fixture.builder.mutation(
      (api as any).production_proposals.updateActiveBuildSubmilestoneProgress,
      {
        buildId: fixture.closing.buildId,
        expectedRevision: initial.submilestone.workflowRevision ?? 0,
        idempotencyKey: "completion-review-stale-first",
        milestoneKey: "foundation",
        progressPercent: 25,
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      fixture.builder.mutation(
        (api as any).production_proposals.updateActiveBuildSubmilestoneProgress,
        {
          buildId: fixture.closing.buildId,
          expectedRevision: initial.submilestone.workflowRevision ?? 0,
          idempotencyKey: "completion-review-stale-second",
          milestoneKey: "foundation",
          progressPercent: 75,
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/changed; refresh/i);
    expect((await submilestoneState(fixture)).submilestone).toMatchObject({
      progressPercent: 25,
      workflowRevision: first.revision,
    });
  });

  test("requires an explicit requirement key when required and optional evidence coexist", async () => {
    const fixture = await seedFixture();
    await startForms(fixture);
    await fixture.builder.mutation(
      (api as any).production_proposals.configureActiveBuildSubmilestoneEvidenceRequirements,
      {
        buildId: fixture.closing.buildId,
        milestoneKey: "foundation",
        requirements: [
          {
            kind: "photo",
            label: "Forms photo",
            required: true,
            requirementKey: "forms-photo",
          },
          {
            kind: "document",
            label: "Forms permit",
            required: false,
            requirementKey: "forms-permit",
          },
        ],
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    const before = await submilestoneState(fixture);
    await expect(
      fixture.builder.mutation(
        (api as any).production_proposals.addActiveBuildSubmilestoneEvidence,
        {
          buildId: fixture.closing.buildId,
          evidence: {
            fileName: "forms-ambiguous.jpg",
            mimeType: "image/jpeg",
            sizeBytes: 100,
            storageId: await storeEvidence(fixture, "forms-ambiguous"),
          },
          expectedRevision: before.submilestone.workflowRevision ?? 0,
          idempotencyKey: "completion-review-ambiguous-evidence",
          milestoneKey: "foundation",
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/multiple evidence requirements/i);

    const added = await fixture.builder.mutation(
      (api as any).production_proposals.addActiveBuildSubmilestoneEvidence,
      {
        buildId: fixture.closing.buildId,
        evidence: {
          fileName: "forms-permit.pdf",
          mimeType: "application/pdf",
          requirementKey: "forms-permit",
          sizeBytes: 100,
          storageId: await storeEvidence(fixture, "forms-permit"),
        },
        expectedRevision: before.submilestone.workflowRevision ?? 0,
        idempotencyKey: "completion-review-optional-evidence",
        milestoneKey: "foundation",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    const persisted = await fixture.base.run(async (ctx: any) =>
      ctx.db
        .query("buildSubmilestoneEvidencePackageItems")
        .withIndex("by_package_revision", (query: any) =>
          query.eq("packageRevisionId", added.evidencePackageRevisionId),
        )
        .collect(),
    );
    expect(persisted).toHaveLength(1);
    expect(persisted[0].requirementKey).toBe("forms-permit");
  });

  test("promotes only a published discussion attachment and preserves provenance", async () => {
    const fixture = await seedFixture();
    await startForms(fixture);
    await fixture.builder.mutation(
      (api as any).production_proposals.configureActiveBuildSubmilestoneEvidenceRequirements,
      {
        buildId: fixture.closing.buildId,
        milestoneKey: "foundation",
        requirements: [
          {
            kind: "photo",
            label: "Forms photo",
            required: true,
            requirementKey: "forms-photo",
          },
          {
            kind: "document",
            label: "Forms permit",
            required: false,
            requirementKey: "forms-permit",
          },
        ],
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    const source = await fixture.base.run(async (ctx: any) => {
      const build = await ctx.db.get(fixture.closing.buildId);
      if (!build) {
        throw new Error("Review fixture Build is unavailable.");
      }
      const now = Date.now();
      const postId = await ctx.db.insert("buildCollaborationPosts", {
        acknowledgementRequired: false,
        agentDrafted: false,
        audienceFloorTier: 0,
        audienceMode: "build_wide",
        authorDisplayNameSnapshot: "Builder",
        authorRolesSnapshot: ["builder"],
        authorRole: "builder",
        authorWorkosUserId: "user_builder",
        brokerageId: build.brokerageId,
        buildId: build._id,
        commentCount: 0,
        contentState: "active",
        createdAt: now,
        lastMeaningfulActivityAt: now,
        openActionItemCount: 0,
        organizationId: ORG,
        postType: "update",
        readRevision: 1,
        revision: 1,
        source: "human",
        threadRevision: 0,
        threadState: "open",
        updatedAt: now,
      });
      const postRevisionId = await ctx.db.insert(
        "buildCollaborationPostRevisions",
        {
          authorRole: "builder",
          authorWorkosUserId: "user_builder",
          brokerageId: build.brokerageId,
          buildId: build._id,
          contentHash: "forms-photo-content-hash",
          createdAt: now,
          organizationId: ORG,
          plainText: "Forms photo attached.",
          postId,
          revision: 1,
          tiptapJson: JSON.stringify({ content: [], type: "doc" }),
        },
      );
      await ctx.db.patch(postId, { currentRevisionId: postRevisionId });
      const storageId = await ctx.storage.store(
        new Blob(["forms photo"], { type: "image/jpeg" }),
      );
      const sourceCapturedAt = now - 10_000;
      const publishedAt = now - 5_000;
      const assetId = await ctx.db.insert("buildCollaborationAssets", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        contentHashSha256: "forms-photo-sha256",
        createdAt: now,
        fileName: "forms-discussion.jpg",
        maximumAudienceMode: "build_wide",
        mimeType: "image/jpeg",
        organizationId: ORG,
        originatingPostId: postId,
        publishedAt,
        publishedOwnerKind: "postRevision",
        publishedOwnerRecordId: postRevisionId,
        readerWorkosUserIds: ["user_builder", "user_broker"],
        scanCompletedAt: now,
        scanState: "clean",
        sizeBytes: 11,
        state: "available",
        sourceCapturedAt,
        storageId,
        updatedAt: now,
        uploadedByWorkosUserId: "user_builder",
        version: 3,
      });
      return { assetId, postId, postRevisionId, publishedAt, sourceCapturedAt };
    });
    await expect(
      fixture.builder.mutation(
        (api as any).production_proposals.promoteActiveBuildDiscussionAttachmentToEvidence,
        {
          assetId: source.assetId,
          buildId: fixture.closing.buildId,
          evidenceKey: "forms-discussion-missing-attachment",
          milestoneKey: "foundation",
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/published discussion attachment/i);
    await fixture.base.run(async (ctx: any) => {
      const build = await ctx.db.get(fixture.closing.buildId);
      if (!build) {
        throw new Error("Review fixture Build is unavailable.");
      }
      await ctx.db.insert("buildCollaborationAttachments", {
        attachmentId: source.assetId,
        attachmentKind: "collaborationAsset",
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: Date.now(),
        createdByWorkosUserId: "user_builder",
        organizationId: ORG,
        ownerKind: "postRevision",
        ownerRecordId: source.postRevisionId,
      });
    });
    await expect(
      fixture.builder.mutation(
        (api as any).production_proposals.promoteActiveBuildDiscussionAttachmentToEvidence,
        {
          assetId: source.assetId,
          buildId: fixture.closing.buildId,
          evidenceKey: "forms-discussion-ambiguous",
          milestoneKey: "foundation",
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/multiple evidence requirements/i);
    const promotion = await fixture.builder.mutation(
      (api as any).production_proposals.promoteActiveBuildDiscussionAttachmentToEvidence,
      {
        assetId: source.assetId,
        buildId: fixture.closing.buildId,
        evidenceKey: "forms-discussion-promoted",
        milestoneKey: "foundation",
        requirementKey: "forms-photo",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(promotion.replayed).toBe(false);
    const promoted = await fixture.base.run(async (ctx: any) => {
      const asset = await ctx.db.get(promotion.assetId);
      const provenance = await ctx.db
        .query("buildSubmilestoneEvidencePromotions")
        .withIndex("by_source_asset", (q: any) =>
          q.eq("sourceDiscussionAssetId", source.assetId),
        )
        .collect();
      return { asset, provenance };
    });
    expect(promoted.asset).toMatchObject({
      sourceDiscussionAssetId: source.assetId,
      sourceDiscussionAssetVersion: 3,
      sourceDiscussionPostId: source.postId,
      sourceDiscussionPublishedAt: source.publishedAt,
      sourceDiscussionUploadedByWorkosUserId: "user_builder",
    });
    expect(promoted.provenance).toContainEqual(
      expect.objectContaining({
        sourceAssetVersion: 3,
        sourceDiscussionAssetId: source.assetId,
        sourceDiscussionPostId: source.postId,
        sourceCapturedAt: source.sourceCapturedAt,
        sourcePublishedAt: source.publishedAt,
        sourceUploaderWorkosUserId: "user_builder",
      }),
    );
  });

  test("preserves location-unverified evidence and creates a lender remediation event", async () => {
    const fixture = await seedFixture();
    await startForms(fixture);
    const state = await submilestoneState(fixture);
    const added = await fixture.builder.mutation(
      (api as any).production_proposals.addActiveBuildSubmilestoneEvidence,
      {
        buildId: fixture.closing.buildId,
        evidence: {
          fileName: "forms-location-denied.jpg",
          locationAttempt: {
            attempted: true,
            attemptedAt: Date.parse("2026-05-03T15:00:00.000Z"),
            failureReason: "Location permission was denied.",
            permissionOutcome: "denied",
            verified: true,
          },
          mimeType: "image/jpeg",
          sizeBytes: 256,
          storageId: await storeEvidence(fixture, "forms-location-denied"),
        },
        expectedRevision: state.submilestone.workflowRevision ?? 0,
        idempotencyKey: "completion-review-location-denied",
        milestoneKey: "foundation",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(added.locationVerified).toBe(false);
    const persisted = await fixture.base.run(async (ctx: any) => {
      const asset = await ctx.db.get(added.evidenceAssetId);
      const posts = await ctx.db
        .query("buildCollaborationPosts")
        .withIndex("by_buildId_and_createdAt", (q: any) =>
          q.eq("buildId", fixture.closing.buildId),
        )
        .collect();
      return { asset, posts };
    });
    expect(persisted.asset).toMatchObject({
      locationFailureReason: "Location permission was denied.",
      locationVerified: false,
    });
    const remediationPosts = persisted.posts.filter(
      (post: any) => post.postType === "issue",
    );
    expect(remediationPosts.length).toBeGreaterThan(0);
    const remediationText = await fixture.base.run(async (ctx: any) => {
      const revisions = await ctx.db
        .query("buildCollaborationPostRevisions")
        .withIndex("by_buildId_and_createdAt", (q: any) =>
          q.eq("buildId", fixture.closing.buildId),
        )
        .collect();
      return revisions.map((revision: any) => revision.plainText).join(" ");
    });
    expect(remediationText).toMatch(/location could not be verified/i);
    expect(remediationText).toMatch(/lender review is required/i);
  });

  test("governs staff recommendations, changes-requested rounds, and Admin-only child approval", async () => {
    const fixture = await seedFixture();
    await startForms(fixture);
    await submitReviewPackage(fixture, "eng411-round-1");
    const inReview = await fixture.lender.query(
      (api as any).build_submilestone_review.getActiveBuildSubmilestoneReview,
      {
        buildId: fixture.closing.buildId,
        milestoneKey: "foundation",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    const recommendation = await fixture.lender.mutation(
      (api as any).build_submilestone_review.recommendActiveBuildSubmilestoneReview,
      {
        buildId: fixture.closing.buildId,
        expectedRevision: inReview.child.reviewRevision,
        idempotencyKey: "eng411-recommend-1",
        milestoneKey: "foundation",
        note: "Inspect the forms before final approval.",
        siteVisitRequired: true,
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(recommendation.requirement).toMatchObject({
      manualRequired: true,
      required: true,
      status: "required",
    });
    await expect(
      fixture.lender.mutation(
        (api as any).build_submilestone_review.approveActiveBuildSubmilestone,
        {
          buildId: fixture.closing.buildId,
          idempotencyKey: "eng411-staff-approve-denied",
          milestoneKey: "foundation",
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/Lender Admin/i);
    const changes = await fixture.lender.mutation(
      (api as any).build_submilestone_review.requestActiveBuildSubmilestoneChanges,
      {
        buildId: fixture.closing.buildId,
        expectedRevision: (await submilestoneState(fixture)).submilestone.reviewRevision,
        idempotencyKey: "eng411-changes-1",
        milestoneKey: "foundation",
        reason: "Provide a clearer completion photo.",
        remediation: ["Upload one unobstructed forms photo."],
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(changes.status).toBe("changes_requested");
    const afterChanges = await submilestoneState(fixture);
    expect(afterChanges.submilestone).toMatchObject({
      evidenceReviewState: "changes_requested",
      reviewDecisionState: "changes_requested",
      status: "in_progress",
    });
    expect(afterChanges.packageRevision?.status).toBe("frozen");
    const historyCount = await fixture.base.run(async (ctx: any) =>
      (await ctx.db
        .query("buildSubmilestoneReviewRounds")
        .withIndex("by_submilestone_round", (q: any) =>
          q.eq("buildSubmilestoneId", afterChanges.submilestone._id),
        )
        .collect()).length,
    );
    await submitReviewPackage(fixture, "eng411-round-2");
    const afterResubmit = await submilestoneState(fixture);
    const laterHistoryCount = await fixture.base.run(async (ctx: any) =>
      (await ctx.db
        .query("buildSubmilestoneReviewRounds")
        .withIndex("by_submilestone_round", (q: any) =>
          q.eq("buildSubmilestoneId", afterChanges.submilestone._id),
        )
        .collect()).length,
    );
    expect(laterHistoryCount).toBe(historyCount + 1);
    expect(afterResubmit.submilestone.evidenceReviewState).toBe("in_review");
  });

  test("requires a completed Site Visit or an audited Admin waiver before child approval", async () => {
    const fixture = await seedFixture();
    await startForms(fixture);
    await submitReviewPackage(fixture, "eng411-site-visit");
    const reviewed = await fixture.lender.mutation(
      (api as any).build_submilestone_review.recommendActiveBuildSubmilestoneReview,
      {
        buildId: fixture.closing.buildId,
        idempotencyKey: "eng411-site-recommendation",
        milestoneKey: "foundation",
        note: "Site inspection required for this risk signal.",
        siteVisitRequired: true,
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      fixture.admin.mutation(
        (api as any).build_submilestone_review.approveActiveBuildSubmilestone,
        {
          buildId: fixture.closing.buildId,
          idempotencyKey: "eng411-approve-without-visit",
          milestoneKey: "foundation",
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/Site Visit/i);
    await expect(
      fixture.lender.mutation(
        (api as any).build_submilestone_review.waiveActiveBuildSubmilestoneSiteVisit,
        {
          buildId: fixture.closing.buildId,
          idempotencyKey: "eng411-waiver-staff-denied",
          milestoneKey: "foundation",
          reason: "Staff cannot waive this gate.",
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/Lender Admin/i);
    await expect(
      fixture.admin.mutation(
        (api as any).build_submilestone_review.waiveActiveBuildSubmilestoneSiteVisit,
        {
          buildId: fixture.closing.buildId,
          idempotencyKey: "eng411-waiver-no-reason",
          milestoneKey: "foundation",
          reason: "  ",
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/reason is required/i);
    const waived = await fixture.admin.mutation(
      (api as any).build_submilestone_review.waiveActiveBuildSubmilestoneSiteVisit,
      {
        buildId: fixture.closing.buildId,
        idempotencyKey: "eng411-waiver-admin",
        milestoneKey: "foundation",
        reason: "Admin accepted the preserved location-unverified evidence.",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(waived.status).toBe("waived");
    const approved = await fixture.admin.mutation(
      (api as any).build_submilestone_review.approveActiveBuildSubmilestone,
      {
        buildId: fixture.closing.buildId,
        idempotencyKey: "eng411-child-approve-after-waiver",
        milestoneKey: "foundation",
        note: "Approved after the audited waiver.",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(approved.status).toBe("approved");
    const reviewedState = await submilestoneState(fixture);
    const audit = await fixture.base.run(async (ctx: any) =>
      (await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q.eq("entityType", "buildSubmilestone").eq("entityId", String(reviewedState.submilestone._id)),
        )
        .collect()).filter((event: any) => event.command === "waiveActiveBuildSubmilestoneSiteVisit"),
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorRoles: ["admin"],
      reason: "Admin accepted the preserved location-unverified evidence.",
      warnings: expect.any(Array),
    });
    void reviewed;
  });

  test("restores a waived Site Visit requirement when a later recommendation requires it", async () => {
    const fixture = await seedFixture();
    await startForms(fixture);
    await submitReviewPackage(fixture, "eng411-site-visit-reset");
    await fixture.lender.mutation(
      (api as any).build_submilestone_review.recommendActiveBuildSubmilestoneReview,
      {
        buildId: fixture.closing.buildId,
        idempotencyKey: "eng411-site-reset-recommendation-1",
        milestoneKey: "foundation",
        siteVisitRequired: true,
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    await fixture.admin.mutation(
      (api as any).build_submilestone_review.waiveActiveBuildSubmilestoneSiteVisit,
      {
        buildId: fixture.closing.buildId,
        idempotencyKey: "eng411-site-reset-waiver",
        milestoneKey: "foundation",
        reason: "Admin waiver must be reconsidered if risk returns.",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    const afterWaiver = await fixture.lender.query(
      (api as any).build_submilestone_review.getActiveBuildSubmilestoneReview,
      {
        buildId: fixture.closing.buildId,
        milestoneKey: "foundation",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(afterWaiver.siteVisit.requirement).toMatchObject({
      manualRequired: true,
      required: true,
      status: "waived",
    });
    const restored = await fixture.lender.mutation(
      (api as any).build_submilestone_review.recommendActiveBuildSubmilestoneReview,
      {
        buildId: fixture.closing.buildId,
        expectedRevision: afterWaiver.child.reviewRevision,
        idempotencyKey: "eng411-site-reset-recommendation-2",
        milestoneKey: "foundation",
        note: "Risk returned; require a new Site Visit before approval.",
        siteVisitRequired: true,
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(restored.requirement).toMatchObject({
      manualRequired: true,
      required: true,
      status: "required",
    });
    expect(restored.requirement.waivedAt).toBeUndefined();
    expect(restored.requirement.waivedByRole).toBeUndefined();
    expect(restored.requirement.waivedByWorkosUserId).toBeUndefined();
    expect(restored.requirement.waiverReason).toBeUndefined();
    const stateAfterWaiver = await submilestoneState(fixture);
    const persisted = await fixture.base.run(async (ctx: any) => {
      const requirement = await ctx.db.get(afterWaiver.siteVisit.requirement._id);
      const audits = (await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q.eq("entityType", "buildSubmilestone").eq("entityId", String(stateAfterWaiver.submilestone._id)),
        )
        .collect()).filter(
        (event: any) =>
          event.eventType ===
          "active_build.submilestone.site_visit.requirement_reopened",
        );
      return { audits, requirement };
    });
    expect(persisted.requirement).toMatchObject({
      manualRequired: true,
      required: true,
      status: "required",
    });
    expect(persisted.requirement).not.toHaveProperty("waivedAt");
    expect(persisted.requirement).not.toHaveProperty("waiverReason");
    expect(persisted.audits).toHaveLength(1);
    expect(JSON.parse(persisted.audits[0].priorState)).toMatchObject({
      status: "waived",
    });
    expect(JSON.parse(persisted.audits[0].newState)).toMatchObject({
      status: "required",
      waivedAt: null,
      waiverReason: null,
    });
  });

  test("derives the parent review state when a child is retracted before parent approval", async () => {
    const fixture = await seedFixture();
    await startForms(fixture);
    await submitReviewPackage(fixture, "eng411-parent-never-approved");
    await fixture.admin.mutation(
      (api as any).build_submilestone_review.recommendActiveBuildSubmilestoneReview,
      {
        buildId: fixture.closing.buildId,
        idempotencyKey: "eng411-parent-never-approved-recommendation",
        milestoneKey: "foundation",
        siteVisitRequired: true,
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    await fixture.admin.mutation(
      (api as any).build_submilestone_review.waiveActiveBuildSubmilestoneSiteVisit,
      {
        buildId: fixture.closing.buildId,
        idempotencyKey: "eng411-parent-never-approved-waiver",
        milestoneKey: "foundation",
        reason: "Admin waiver for child-only retraction coverage.",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    await fixture.admin.mutation(
      (api as any).build_submilestone_review.approveActiveBuildSubmilestone,
      {
        buildId: fixture.closing.buildId,
        idempotencyKey: "eng411-parent-never-approved-child-approval",
        milestoneKey: "foundation",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    const beforeRetraction = await fixture.admin.query(
      (api as any).build_submilestone_review.getActiveBuildSubmilestoneReview,
      {
        buildId: fixture.closing.buildId,
        milestoneKey: "foundation",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(beforeRetraction.parent.reviewDecisionState).toBe("ready_for_approval");
    await fixture.admin.mutation(
      (api as any).build_submilestone_review.retractActiveBuildSubmilestoneApproval,
      {
        buildId: fixture.closing.buildId,
        expectedRevision: beforeRetraction.child.reviewRevision,
        idempotencyKey: "eng411-parent-never-approved-child-retraction",
        milestoneKey: "foundation",
        reason: "Correct the child evidence before parent approval.",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    const afterRetraction = await fixture.admin.query(
      (api as any).build_submilestone_review.getActiveBuildSubmilestoneReview,
      {
        buildId: fixture.closing.buildId,
        milestoneKey: "foundation",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(afterRetraction.child.reviewDecisionState).toBe("reopened");
    expect(afterRetraction.parent.reviewDecisionState).toBe("in_review");
    expect(afterRetraction.parent.readyForApproval).toBe(false);
  });

  test("parent approval resolves one System Post and both retraction commands reopen it without erasing child history", async () => {
    const fixture = await seedFixture();
    await startForms(fixture);
    await submitReviewPackage(fixture, "eng411-parent");
    await fixture.admin.mutation(
      (api as any).build_submilestone_review.recommendActiveBuildSubmilestoneReview,
      {
        buildId: fixture.closing.buildId,
        idempotencyKey: "eng411-parent-site-recommendation",
        milestoneKey: "foundation",
        siteVisitRequired: true,
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    await fixture.admin.mutation(
      (api as any).build_submilestone_review.waiveActiveBuildSubmilestoneSiteVisit,
      {
        buildId: fixture.closing.buildId,
        idempotencyKey: "eng411-parent-site-waiver",
        milestoneKey: "foundation",
        reason: "Admin waiver for the parent lifecycle test.",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    await fixture.admin.mutation(
      (api as any).build_submilestone_review.approveActiveBuildSubmilestone,
      {
        buildId: fixture.closing.buildId,
        idempotencyKey: "eng411-parent-child-approve",
        milestoneKey: "foundation",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    const ready = await fixture.admin.query(
      (api as any).build_submilestone_review.getActiveBuildSubmilestoneReview,
      {
        buildId: fixture.closing.buildId,
        milestoneKey: "foundation",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(ready.parent.readyForApproval).toBe(true);
    const parent = await fixture.admin.mutation(
      (api as any).build_submilestone_review.approveActiveBuildMilestoneReview,
      {
        buildId: fixture.closing.buildId,
        expectedRevision: ready.parent.reviewRevision,
        idempotencyKey: "eng411-parent-approve",
        milestoneKey: "foundation",
        reason: "All independently approved children satisfy the review gate.",
        workosOrganizationId: ORG,
      },
    );
    expect(parent.status).toBe("approved");
    const resolvedPosts = await fixture.base.run(async (ctx: any) =>
      (await ctx.db
        .query("buildCollaborationPosts")
        .withIndex("by_buildId_and_systemPostKind_and_canonicalBuildMilestoneId", (q: any) =>
          q
            .eq("buildId", fixture.closing.buildId)
            .eq("systemPostKind", "milestone"),
        )
        .collect()).filter((post: any) => post.threadState === "resolved"),
    );
    expect(resolvedPosts).toHaveLength(1);
    await expect(
      fixture.admin.mutation(
        (api as any).build_collaboration_resolution.reopenBuildCollaborationThread,
        {
          buildId: fixture.closing.buildId,
          expectedThreadRevision: resolvedPosts[0].threadRevision,
          organizationId: ORG,
          postId: resolvedPosts[0]._id,
          reason: "Discussion cannot reopen canonical review state.",
        },
      ),
    ).rejects.toThrow(/canonical domain command/i);
    const parentState = await fixture.admin.query(
      (api as any).build_submilestone_review.getActiveBuildSubmilestoneReview,
      {
        buildId: fixture.closing.buildId,
        milestoneKey: "foundation",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    const parentRetraction = await fixture.admin.mutation(
      (api as any).build_submilestone_review.retractActiveBuildMilestoneApproval,
      {
        buildId: fixture.closing.buildId,
        expectedRevision: parentState.parent.reviewRevision,
        idempotencyKey: "eng411-parent-retract",
        milestoneKey: "foundation",
        reason: "Re-open the parent decision for a corrected admin review.",
        workosOrganizationId: ORG,
      },
    );
    expect(parentRetraction.status).toBe("reopened");
    const afterParentRetraction = await fixture.admin.query(
      (api as any).build_submilestone_review.getActiveBuildSubmilestoneReview,
      {
        buildId: fixture.closing.buildId,
        milestoneKey: "foundation",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(afterParentRetraction.child.reviewDecisionState).toBe("approved");
    expect(afterParentRetraction.parent.reviewDecisionState).toBe("reopened");
    const childRetraction = await fixture.admin.mutation(
      (api as any).build_submilestone_review.retractActiveBuildSubmilestoneApproval,
      {
        buildId: fixture.closing.buildId,
        expectedRevision: afterParentRetraction.child.reviewRevision,
        idempotencyKey: "eng411-child-retract",
        milestoneKey: "foundation",
        reason: "Only the affected child requires another evidence round.",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(childRetraction.status).toBe("reopened");
    const finalState = await fixture.admin.query(
      (api as any).build_submilestone_review.getActiveBuildSubmilestoneReview,
      {
        buildId: fixture.closing.buildId,
        milestoneKey: "foundation",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(finalState.child.reviewDecisionState).toBe("reopened");
    expect(finalState.parent.readyForApproval).toBe(false);
    const posts = await fixture.base.run(async (ctx: any) =>
      (await ctx.db
        .query("buildCollaborationPosts")
        .withIndex("by_buildId_and_createdAt", (q: any) =>
          q.eq("buildId", fixture.closing.buildId),
        )
        .collect()).filter((post: any) => post.systemPostKind === "milestone"),
    );
    expect(posts).toHaveLength(1);
    expect(posts[0].threadState).toBe("open");
  });
});
