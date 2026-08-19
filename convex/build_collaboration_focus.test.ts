/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_build_detail_target";

type TestRole = "admin" | "builder" | "contractor" | "homeowner";

function withIdentity(
  base: ReturnType<typeof convexTest>,
  role: TestRole,
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

async function seedBuildDetailTargets() {
  const base = convexTest(schema, modules);
  const admin = withIdentity(base, "admin", "focus_admin");
  const foundation = await admin.mutation(
    (internal as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORGANIZATION_ID },
  );
  const ids = await base.run(async (ctx) => {
    const now = Date.now();
    const proposalId = await ctx.db.insert("buildProposals", {
      brokerageId: foundation.brokerageId,
      borrowerCoPayBps: 0,
      borrowerWorkingCapitalLimitCents: 10_000_000,
      buildName: "Detail target build",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      createdByWorkosUserId: "focus_admin",
      lenderDrawPolicyLimitCents: 20_000_000,
      location: "12 Focus Lane",
      organizationId: ORGANIZATION_ID,
      reviewOutcome: "approved",
      status: "approved",
      templateId: foundation.templateId,
      totalBudgetCents: 50_000_000,
      updatedAt: now,
      updatedByWorkosUserId: "focus_admin",
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
      buildName: "Detail target build",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      location: "12 Focus Lane",
      organizationId: ORGANIZATION_ID,
      proposalId,
      startDate: "2026-08-01",
      status: "active",
      totalBudgetCents: 50_000_000,
      updatedAt: now,
      workflowRuleSnapshotId,
    });
    const otherBuildId = await ctx.db.insert("activeBuilds", {
      brokerageId: foundation.brokerageId,
      buildName: "Other detail target build",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      location: "14 Focus Lane",
      organizationId: ORGANIZATION_ID,
      proposalId,
      startDate: "2026-08-01",
      status: "active",
      totalBudgetCents: 50_000_000,
      updatedAt: now,
      workflowRuleSnapshotId,
    });
    await ctx.db.patch(proposalId, { activeBuildId: buildId });
    await ctx.db.insert("buildCollaborationTenantSettings", {
      activatedAt: now,
      activatedByWorkosUserId: "focus_admin",
      brokerageId: foundation.brokerageId,
      createdAt: now,
      generousRateLimitMultiplier: 10,
      migrationCompletedAt: now,
      organizationId: ORGANIZATION_ID,
      status: "active",
      updatedAt: now,
    });
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
    const proposalSubmilestoneId = await ctx.db.insert(
      "proposalSubmilestones",
      {
        brokerageId: foundation.brokerageId,
        budgetCents: 50_000_000,
        createdAt: now,
        durationDays: 20,
        key: "footings",
        milestoneKey: "foundation",
        name: "Footings",
        order: 1,
        organizationId: ORGANIZATION_ID,
        proposalId,
        proposalMilestoneId,
        startDay: 0,
        updatedAt: now,
      },
    );
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
      planningState: "active",
      proposalMilestoneId,
      status: "planned",
      updatedAt: now,
    });
    const submilestoneId = await ctx.db.insert("buildSubmilestones", {
      brokerageId: foundation.brokerageId,
      budgetCents: 50_000_000,
      buildId,
      buildMilestoneId: milestoneId,
      createdAt: now,
      durationDays: 20,
      key: "footings",
      milestoneKey: "foundation",
      name: "Footings",
      order: 1,
      organizationId: ORGANIZATION_ID,
      planningState: "active",
      proposalSubmilestoneId,
      startDay: 0,
      status: "planned",
      updatedAt: now,
      workflowRevision: 1,
    });
    const drawId = await ctx.db.insert("activeBuildDrawRequests", {
      amountCents: 4_000_000,
      brokerageId: foundation.brokerageId,
      buildId,
      clientOperationId: "focus-draw-operation",
      createdAt: now,
      displayId: "DR-FOCUS-01",
      label: "Foundation reimbursement",
      organizationId: ORGANIZATION_ID,
      requestKey: "focus-draw-request",
      requestedAt: "2026-08-12T12:00:00.000Z",
      requestedByWorkosUserId: "focus_builder",
      status: "requested",
      updatedAt: now,
    });
    const postId = await ctx.db.insert("buildCollaborationPosts", {
      acknowledgementRequired: false,
      agentDrafted: false,
      audienceFloorTier: 0,
      audienceMode: "build_wide",
      authorDisplayNameSnapshot: "DrawFlow",
      authorRolesSnapshot: [],
      brokerageId: foundation.brokerageId,
      buildId,
      canonicalBuildMilestoneId: milestoneId,
      commentCount: 0,
      contentState: "active",
      createdAt: now,
      lastMeaningfulActivityAt: now,
      openActionItemCount: 3,
      organizationId: ORGANIZATION_ID,
      postType: "update",
      readRevision: 1,
      revision: 1,
      source: "system",
      systemEventKey: `milestone:${milestoneId}`,
      systemLifecycle: "open",
      systemOccurrenceKey: `milestone:${milestoneId}`,
      systemPostKind: "milestone",
      threadRevision: 0,
      threadState: "open",
      updatedAt: now,
    });
    const actionTemplate = {
      assignmentState: "unassigned" as const,
      brokerageId: foundation.brokerageId,
      buildId,
      createdAt: now,
      creatorRole: "builder" as const,
      creatorWorkosUserId: "focus_builder",
      currentRevision: 1,
      descriptionPlainText: "",
      descriptionTiptapJson: JSON.stringify({ content: [], type: "doc" }),
      organizationId: ORGANIZATION_ID,
      originatingPostId: postId,
      priority: "none" as const,
      requiresAcceptance: false,
      status: "todo" as const,
      updatedAt: now,
    };
    const companionId = await ctx.db.insert("buildActionItems", {
      ...actionTemplate,
      canonicalBindingRevision: 1,
      canonicalBuildMilestoneId: milestoneId,
      canonicalBuildSubmilestoneId: submilestoneId,
      canonicalCompanionDisposition: "active",
      canonicalPlanningState: "active",
      systemMode: "generated_milestone_submilestone",
      title: "Footings",
    });
    const manualActionItemId = await ctx.db.insert("buildActionItems", {
      ...actionTemplate,
      title: "Confirm concrete delivery",
    });
    const malformedActionItemId = await ctx.db.insert("buildActionItems", {
      ...actionTemplate,
      canonicalBuildMilestoneId: milestoneId,
      systemMode: "generated_milestone_submilestone",
      title: "Malformed generated companion",
    });
    for (const participant of [
      { role: "admin" as const, subject: "focus_admin" },
      { role: "builder" as const, subject: "focus_builder" },
      { role: "contractor" as const, subject: "focus_contractor" },
      { role: "homeowner" as const, subject: "focus_homeowner" },
    ]) {
      for (const participantBuildId of [buildId, otherBuildId]) {
        await ctx.db.insert("buildParticipants", {
          brokerageId: foundation.brokerageId,
          buildId: participantBuildId,
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
    }
    const contractorId = await ctx.db.insert("contractorProfiles", {
      accountWorkosUserId: "focus_contractor",
      brokerageId: foundation.brokerageId,
      createdAt: now,
      name: "Focus contractor",
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
        contractorId,
        createdAt: now,
        organizationId: ORGANIZATION_ID,
        role: "Concrete contractor",
        status: "active",
        updatedAt: now,
      },
    );
    await ctx.db.insert("milestoneContractorAssignments", {
      assignedAt: now,
      assignedByWorkosUserId: "focus_admin",
      brokerageId: foundation.brokerageId,
      buildContractorAssignmentId,
      buildId,
      buildMilestoneId: milestoneId,
      buildSubmilestoneId: submilestoneId,
      contractorId,
      createdAt: now,
      milestoneKey: "foundation",
      organizationId: ORGANIZATION_ID,
      postHoc: false,
      role: "Concrete contractor",
      status: "active",
      submilestoneKey: "footings",
      updatedAt: now,
    });
    return {
      buildId,
      companionId,
      malformedActionItemId,
      manualActionItemId,
      milestoneId,
      otherBuildId,
      submilestoneId,
      drawId,
    };
  });
  return {
    admin,
    base,
    builder: withIdentity(base, "builder", "focus_builder"),
    contractor: withIdentity(base, "contractor", "focus_contractor"),
    homeowner: withIdentity(base, "homeowner", "focus_homeowner"),
    ...ids,
  };
}

async function resolveTarget(
  viewer: ReturnType<typeof withIdentity>,
  input: { buildId: string; focus: string; organizationId?: string },
) {
  return await viewer.query(
    (api as any).build_collaboration_focus.resolveBuildDetailTarget,
    {
      buildId: input.buildId,
      focus: input.focus,
      organizationId: input.organizationId ?? ORGANIZATION_ID,
    },
  );
}

describe("build detail target resolution", () => {
  test("resolves an authorized Draw focus and revokes it after deletion", async () => {
    const fixture = await seedBuildDetailTargets();

    await expect(
      resolveTarget(fixture.builder, {
        buildId: fixture.buildId,
        focus: `draw:${fixture.drawId}`,
      }),
    ).resolves.toEqual({
      state: "visible",
      target: {
        drawId: fixture.drawId,
        kind: "draw",
        readOnly: false,
      },
    });

    await fixture.base.run(async (ctx) => {
      await ctx.db.delete(fixture.drawId);
    });

    await expect(
      resolveTarget(fixture.builder, {
        buildId: fixture.buildId,
        focus: `draw:${fixture.drawId}`,
      }),
    ).resolves.toEqual({ state: "revoked" });
  });

  test("keeps manual Action Items generic and preserves the parent Milestone target", async () => {
    const fixture = await seedBuildDetailTargets();

    await expect(
      resolveTarget(fixture.builder, {
        buildId: fixture.buildId,
        focus: `actionItem:${fixture.manualActionItemId}`,
      }),
    ).resolves.toEqual({
      state: "visible",
      target: {
        actionItemId: fixture.manualActionItemId,
        kind: "actionItem",
        readOnly: false,
      },
    });
    await expect(
      resolveTarget(fixture.builder, {
        buildId: fixture.buildId,
        focus: `milestone:${fixture.milestoneId}`,
      }),
    ).resolves.toEqual({
      state: "visible",
      target: {
        kind: "milestone",
        milestoneId: fixture.milestoneId,
        readOnly: false,
      },
    });
  });

  test("converges generated and direct links on the canonical Sub-milestone", async () => {
    const fixture = await seedBuildDetailTargets();
    const generated = await resolveTarget(fixture.builder, {
      buildId: fixture.buildId,
      focus: `actionItem:${fixture.companionId}`,
    });
    const direct = await resolveTarget(fixture.builder, {
      buildId: fixture.buildId,
      focus: `submilestone:${fixture.submilestoneId}`,
    });

    expect(generated).toEqual(direct);
    expect(generated).toEqual({
      state: "visible",
      target: {
        companionId: fixture.companionId,
        kind: "submilestone",
        readOnly: false,
        submilestoneId: fixture.submilestoneId,
      },
    });
    await expect(
      resolveTarget(fixture.contractor, {
        buildId: fixture.buildId,
        focus: `actionItem:${fixture.companionId}`,
      }),
    ).resolves.toEqual(generated);
    await expect(
      resolveTarget(fixture.homeowner, {
        buildId: fixture.buildId,
        focus: `submilestone:${fixture.submilestoneId}`,
      }),
    ).resolves.toEqual({ state: "revoked" });
  });

  test("keeps a direct canonical Sub-milestone visible when its companion is missing", async () => {
    const fixture = await seedBuildDetailTargets();
    await fixture.base.run(async (ctx) => {
      await ctx.db.delete(fixture.companionId);
    });

    await expect(
      resolveTarget(fixture.builder, {
        buildId: fixture.buildId,
        focus: `submilestone:${fixture.submilestoneId}`,
      }),
    ).resolves.toEqual({
      state: "visible",
      target: {
        kind: "submilestone",
        readOnly: false,
        submilestoneId: fixture.submilestoneId,
      },
    });
  });

  test("fails malformed generated bindings closed without a generic fallback", async () => {
    const fixture = await seedBuildDetailTargets();

    await expect(
      resolveTarget(fixture.builder, {
        buildId: fixture.buildId,
        focus: `actionItem:${fixture.malformedActionItemId}`,
      }),
    ).resolves.toMatchObject({
      code: "GENERATED_COMPANION_BINDING_MISSING",
      state: "integrity_error",
    });
    await expect(
      resolveTarget(fixture.builder, {
        buildId: fixture.otherBuildId,
        focus: `actionItem:${fixture.manualActionItemId}`,
      }),
    ).resolves.toEqual({ state: "revoked" });
    await expect(
      resolveTarget(fixture.builder, {
        buildId: fixture.buildId,
        focus: `actionItem:${fixture.manualActionItemId}`,
        organizationId: "org_foreign",
      }),
    ).resolves.toEqual({ state: "revoked" });
  });

  test("marks superseded canonical targets read-only and reacts to access revocation", async () => {
    const fixture = await seedBuildDetailTargets();
    await fixture.base.run(async (ctx) => {
      await Promise.all([
        ctx.db.patch(fixture.submilestoneId, {
          planningState: "superseded",
          supersededAt: Date.now(),
        }),
        ctx.db.patch(fixture.companionId, {
          canonicalCompanionDisposition: "historical",
          canonicalPlanningState: "superseded",
        }),
      ]);
    });
    await expect(
      resolveTarget(fixture.builder, {
        buildId: fixture.buildId,
        focus: `submilestone:${fixture.submilestoneId}`,
      }),
    ).resolves.toMatchObject({
      state: "visible",
      target: { kind: "submilestone", readOnly: true },
    });

    await fixture.base.run(async (ctx) => {
      const participant = await ctx.db
        .query("buildParticipants")
        .withIndex(
          "by_buildId_and_workosUserId_and_participationPeriod",
          (query) =>
            query
              .eq("buildId", fixture.buildId)
              .eq("workosUserId", "focus_builder"),
        )
        .first();
      if (!participant) {
        throw new Error("Builder participant fixture is unavailable.");
      }
      await ctx.db.patch(participant._id, {
        removedAt: Date.now(),
        status: "removed",
        updatedAt: Date.now(),
      });
    });
    await expect(
      resolveTarget(fixture.builder, {
        buildId: fixture.buildId,
        focus: `submilestone:${fixture.submilestoneId}`,
      }),
    ).resolves.toEqual({ state: "revoked" });
  });
});
