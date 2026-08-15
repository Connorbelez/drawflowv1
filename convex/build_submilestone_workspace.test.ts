/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORG = "org_build_submilestone_workspace_scope";

function tiptap(text: string) {
  return JSON.stringify({
    content: [
      {
        content: [{ text, type: "text" }],
        type: "paragraph",
      },
    ],
    type: "doc",
  });
}

function withIdentity(t: any, roles: string[], subject: string, organizationId = ORG) {
  return t.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as any);
}

async function seedClosedBuild() {
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
      buildName: "Canonical Workspace Scope Build",
      location: "1 Canonical Scope Lane",
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
          fileName: "scope-workspace-permit.pdf",
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
              fieldGuidance: {
                cameraAnglesTiptapJson: tiptap("Camera angle guidance"),
                whatToVerifyTiptapJson: tiptap("Verification guidance"),
              },
              key: "forms",
              name: "Forms",
              order: 1,
              scopeOfWorkTiptapJson: tiptap("Canonical v1 scope"),
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
    reason: "Scope workspace fixture is ready to close.",
    workosOrganizationId: ORG,
  });
  await admin.mutation(
    (api as any).production_proposals.lockProposalReviewPolicy,
    {
      expectedAssignmentId: null,
      expectedProposalRevisionNumber: 1,
      idempotencyKey: `submilestone-workspace-lock:${String(proposalId)}`,
      proposalId,
      reason: "Lock the Sub-milestone workspace fixture policy.",
      workosOrganizationId: ORG,
    },
  );
  await admin.mutation(
    (api as any).production_proposals.recordProposalClosing,
    {
      buildStartDate: "2026-05-01",
      ianaTimezone: "America/Toronto",
      loanFacility: {
        interestAnnualBps: 925,
        principalCents: 55_000_000,
      },
      proposalId,
      reason: "Scope workspace fixture loan closed.",
      workosOrganizationId: ORG,
    },
  );
  const closing = await admin.mutation(
    (api as any).production_proposals.activateClosedProposal,
    {
      proposalId,
      reason: "Scope workspace fixture loan closed.",
      workosOrganizationId: ORG,
    },
  );
  const ids = await base.run(async (ctx: any) => {
    const proposalSubmilestone = await ctx.db
      .query("proposalSubmilestones")
      .withIndex("by_proposal", (query: any) => query.eq("proposalId", proposalId))
      .unique();
    const buildSubmilestone = await ctx.db
      .query("buildSubmilestones")
      .withIndex("by_proposalSubmilestoneId", (query: any) =>
        query.eq("proposalSubmilestoneId", proposalSubmilestone._id),
      )
      .unique();
    return { buildSubmilestone, proposalSubmilestone };
  });
  return { admin, base, buildId: closing.buildId, ...ids };
}

describe("active Build Sub-milestone workspace Scope boundary", () => {
  test("returns the canonical Proposal Sub-milestone ID and never projects legacy Scope or description", async () => {
    const fixture = await seedClosedBuild();
    const completedAt = Date.parse("2026-05-08T16:00:00.000Z");
    await fixture.base.run(async (ctx: any) => {
      await ctx.db.patch(fixture.buildSubmilestone._id, {
        completedAt,
        fieldNote: "Execution note only",
      });
    });

    const bootstrap = await fixture.admin.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceBootstrap,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: fixture.buildSubmilestone._id,
        organizationId: ORG,
      },
    );

    expect(bootstrap.state).toBe("visible");
    expect(bootstrap.submilestone).toMatchObject({
      buildSubmilestoneId: fixture.buildSubmilestone._id,
      proposalSubmilestoneId: fixture.proposalSubmilestone._id,
    });
    expect(bootstrap.submilestone).not.toHaveProperty("scopeOfWorkTiptapJson");
    expect(bootstrap.overview).not.toHaveProperty("scopeOfWorkTiptapJson");
    expect(bootstrap.overview).not.toHaveProperty("description");
    expect(bootstrap.submilestone).not.toHaveProperty("description");
    expect(bootstrap.execution).toMatchObject({ fieldNote: "Execution note only" });
    expect(bootstrap.execution.actualCompletedAt).toBe(completedAt);
    expect(bootstrap.overview).toMatchObject({
      actualCompletedAt: completedAt,
      fieldNote: "Execution note only",
    });
    expect(bootstrap.milestone.drawAvailabilityCents).toBe(8_000_000);
    expect(bootstrap.capabilities.siteVisit).toEqual({
      cancel: { allowed: true },
      order: { allowed: true },
    });
    expect(bootstrap.capabilities.canonical.uploadEvidence).toEqual({
      allowed: true,
    });
    await fixture.base.run((ctx: any) =>
      ctx.db.patch(fixture.buildSubmilestone._id, {
        planningState: "superseded",
        supersededAt: Date.now(),
        supersededByPlanningRevision: 2,
      }),
    );
    const supersededBootstrap = await fixture.admin.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceBootstrap,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: fixture.buildSubmilestone._id,
        organizationId: ORG,
      },
    );
    expect(supersededBootstrap.capabilities.siteVisit).toEqual({
      cancel: {
        allowed: false,
        reason: "Historical Sub-milestones are read-only.",
      },
      order: {
        allowed: false,
        reason: "Historical Sub-milestones are read-only.",
      },
    });
  });

  test("does not leak a successor draft through the active Build bootstrap", async () => {
    const fixture = await seedClosedBuild();
    const successorDraftId = await fixture.admin.mutation(
      (api as any).submilestone_scope_contracts.createSubmilestoneScopeDraft,
      {
        proposalSubmilestoneId: fixture.proposalSubmilestone._id,
        workosOrganizationId: ORG,
      },
    );
    await fixture.admin.mutation(
      (api as any).submilestone_scope_contracts.saveSubmilestoneScopeDraft,
      {
        revisionId: successorDraftId,
        scopeOfWorkTiptapJson: tiptap("Unpublished successor draft"),
        workosOrganizationId: ORG,
      },
    );
    const bootstrap = await fixture.admin.query(
      (api as any).build_submilestone_workspace
        .getBuildSubmilestoneWorkspaceBootstrap,
      {
        buildId: fixture.buildId,
        buildSubmilestoneId: fixture.buildSubmilestone._id,
        organizationId: ORG,
      },
    );
    expect(JSON.stringify(bootstrap)).not.toContain("Unpublished successor draft");
    expect(bootstrap.submilestone).not.toHaveProperty("scopeOfWorkTiptapJson");
    expect(bootstrap.overview).not.toHaveProperty("scopeOfWorkTiptapJson");
  });

  test("denies a cross-organization viewer and an unassigned contractor", async () => {
    const fixture = await seedClosedBuild();
    const otherOrgBuilder = withIdentity(
      fixture.base,
      ["builder"],
      "user_other_org_builder",
      "org_other_scope_workspace",
    );
    await expect(
      otherOrgBuilder.query(
        (api as any).build_submilestone_workspace
          .getBuildSubmilestoneWorkspaceBootstrap,
        {
          buildId: fixture.buildId,
          buildSubmilestoneId: fixture.buildSubmilestone._id,
          organizationId: ORG,
        },
      ),
    ).resolves.toEqual({ state: "revoked" });

    const unassignedContractor = withIdentity(
      fixture.base,
      ["contractor"],
      "user_unassigned_contractor",
    );
    await fixture.base.run(async (ctx: any) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) throw new Error("Build fixture is unavailable.");
      const now = Date.now();
      const contractorId = await ctx.db.insert("contractorProfiles", {
        accountWorkosUserId: "user_unassigned_contractor",
        brokerageId: build.brokerageId,
        createdAt: now,
        name: "Unassigned Contractor",
        organizationId: ORG,
        status: "active",
        trades: ["concrete"],
        updatedAt: now,
      });
      await ctx.db.insert("buildContractorAssignments", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        contractorId,
        createdAt: now,
        organizationId: ORG,
        role: "concrete",
        status: "active",
        updatedAt: now,
      });
    });
    await expect(
      unassignedContractor.query(
        (api as any).build_submilestone_workspace
          .getBuildSubmilestoneWorkspaceBootstrap,
        {
          buildId: fixture.buildId,
          buildSubmilestoneId: fixture.buildSubmilestone._id,
          organizationId: ORG,
        },
      ),
    ).resolves.toEqual({ state: "revoked" });
  });
});
