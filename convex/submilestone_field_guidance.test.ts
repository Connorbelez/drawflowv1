/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORG = "org_submilestone_field_guidance";
const OTHER_ORG = "org_other_field_guidance";
const ADMIN_USER = "user_field_guidance_admin";
const BUILDER_USER = "user_field_guidance_builder";
const CONTRACTOR_USER = "user_field_guidance_contractor";

function withIdentity(
  t: ReturnType<typeof convexTest>,
  roles: string[],
  subject: string,
  organizationId = ORG,
) {
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

function tiptap(text = "") {
  return JSON.stringify({
    content: text
      ? [
          {
            content: [{ text, type: "text" }],
            type: "paragraph",
          },
        ]
      : [{ type: "paragraph" }],
    type: "doc",
  });
}

async function seedFieldGuidanceFixture() {
  const base = convexTest(schema, modules);
  const admin = withIdentity(base, ["admin"], ADMIN_USER);
  const fixture = await base.run(async (ctx: any) => {
    const now = Date.now();
    const brokerageId = await ctx.db.insert("brokerages", {
      createdAt: now,
      displayName: "Field Guidance Brokerage",
      legalName: "Field Guidance Brokerage Inc.",
      status: "active",
      updatedAt: now,
      workosOrganizationId: ORG,
    });
    const builderProfileId = await ctx.db.insert("builderProfiles", {
      brokerageId,
      createdAt: now,
      displayName: "Field Guidance Builder",
      legalName: "Field Guidance Builder Inc.",
      organizationId: ORG,
      status: "active",
      updatedAt: now,
    });
    const proposalId = await ctx.db.insert("buildProposals", {
      assignedBrokerWorkosUserId: ADMIN_USER,
      borrowerCoPayBps: 2_000,
      borrowerStartingCashCents: 35_000_000,
      borrowerWorkingCapitalLimitCents: 35_000_000,
      brokerageId,
      buildName: "Field Guidance fixture",
      builderProfileId,
      createdAt: now,
      createdByWorkosUserId: ADMIN_USER,
      interestAnnualBps: 925,
      lenderDrawPolicyLimitCents: 55_000_000,
      location: "10 Field Guidance Lane",
      organizationId: ORG,
      reviewOutcome: "none",
      status: "approved",
      totalBudgetCents: 25_000_000,
      updatedAt: now,
      updatedByWorkosUserId: ADMIN_USER,
    });
    const proposalMilestoneId = await ctx.db.insert("proposalMilestones", {
      brokerageId,
      budgetCents: 25_000_000,
      createdAt: now,
      dayEnd: 10,
      dayStart: 0,
      dependencyKeys: [],
      drawAvailabilityCents: 20_000_000,
      durationDays: 10,
      key: "foundation",
      name: "Foundation",
      order: 1,
      organizationId: ORG,
      proposalId,
      updatedAt: now,
    });
    const proposalSubmilestoneId = await ctx.db.insert(
      "proposalSubmilestones",
      {
        brokerageId,
        budgetCents: 25_000_000,
        createdAt: now,
        durationDays: 10,
        key: "excavation",
        milestoneKey: "foundation",
        name: "Excavation",
        order: 1,
        organizationId: ORG,
        proposalId,
        proposalMilestoneId,
        startDay: 0,
        updatedAt: now,
      },
    );
    const builderAccountLinkId = await ctx.db.insert("builderAccountLinks", {
      brokerageId,
      builderProfileId,
      role: "owner",
      status: "active",
      workosUserId: BUILDER_USER,
      createdAt: now,
      updatedAt: now,
    });
    const workflowRuleId = await ctx.db.insert("workflowRules", {
      allowPermitWaiverByRoles: ["admin"],
      brokerageId,
      createdAt: now,
      organizationId: ORG,
      proposalStates: ["draft", "submitted", "approved", "closed"],
      requirePermitForApproval: false,
      ruleKey: "default",
      settings: {},
      updatedAt: now,
      version: 1,
      status: "active",
    });
    const workflowRuleSnapshotId = await ctx.db.insert(
      "workflowRuleSnapshots",
      {
        allowPermitWaiverByRoles: ["admin"],
        brokerageId,
        createdAt: now,
        organizationId: ORG,
        proposalId,
        proposalStates: ["draft", "submitted", "approved", "closed"],
        requirePermitForApproval: false,
        ruleKey: "default",
        settings: {},
        version: 1,
        workflowRuleId,
      },
    );
    const buildId = await ctx.db.insert("activeBuilds", {
      brokerageId,
      buildName: "Field Guidance active build",
      builderProfileId,
      createdAt: now,
      location: "10 Field Guidance Lane",
      organizationId: ORG,
      proposalId,
      startDate: "2026-08-01",
      status: "active",
      totalBudgetCents: 25_000_000,
      updatedAt: now,
      workflowRuleSnapshotId,
    });
    await ctx.db.patch(proposalId, { activeBuildId: buildId });
    const buildMilestoneId = await ctx.db.insert("buildMilestones", {
      brokerageId,
      budgetCents: 25_000_000,
      buildId,
      createdAt: now,
      dayEnd: 10,
      dayStart: 0,
      dependencyKeys: [],
      drawAvailabilityCents: 20_000_000,
      durationDays: 10,
      key: "foundation",
      name: "Foundation",
      order: 1,
      organizationId: ORG,
      proposalMilestoneId,
      status: "planned",
      updatedAt: now,
    });
    const buildSubmilestoneId = await ctx.db.insert("buildSubmilestones", {
      brokerageId,
      buildId,
      buildMilestoneId,
      createdAt: now,
      durationDays: 10,
      key: "excavation",
      milestoneKey: "foundation",
      name: "Excavation",
      order: 1,
      organizationId: ORG,
      proposalSubmilestoneId,
      status: "planned",
      updatedAt: now,
    });
    const contractorId = await ctx.db.insert("contractorProfiles", {
      accountWorkosUserId: CONTRACTOR_USER,
      brokerageId,
      createdAt: now,
      email: "field-guidance-contractor@example.com",
      name: "Field Guidance Contractor",
      organizationId: ORG,
      status: "active",
      trades: ["masonry"],
      updatedAt: now,
    });
    const buildContractorAssignmentId = await ctx.db.insert(
      "buildContractorAssignments",
      {
        brokerageId,
        buildId,
        contractorId,
        createdAt: now,
        organizationId: ORG,
        role: "mason",
        status: "active",
        updatedAt: now,
      },
    );
    const milestoneContractorAssignmentId = await ctx.db.insert(
      "milestoneContractorAssignments",
      {
        assignedAt: now,
        assignedByWorkosUserId: ADMIN_USER,
        brokerageId,
        buildContractorAssignmentId,
        buildId,
        buildMilestoneId,
        buildSubmilestoneId,
        contractorId,
        createdAt: now,
        milestoneKey: "foundation",
        organizationId: ORG,
        postHoc: false,
        role: "mason",
        status: "active",
        submilestoneKey: "excavation",
        updatedAt: now,
      },
    );
    return {
      builderAccountLinkId,
      buildId,
      buildMilestoneId,
      buildSubmilestoneId,
      contractorId,
      milestoneContractorAssignmentId,
      proposalId,
      proposalSubmilestoneId,
    };
  });

  return {
    admin,
    base,
    builder: withIdentity(base, ["builder"], BUILDER_USER),
    contractor: withIdentity(base, ["contractor"], CONTRACTOR_USER),
    ...fixture,
  };
}

const guidanceApi = (api as any).submilestone_field_guidance;

describe("Sub-milestone Field Guidance", () => {
  test("saves both exact TipTap documents without legacy Scope storage and reports readiness", async () => {
    const {
      admin,
      base,
      buildId,
      buildSubmilestoneId,
      proposalSubmilestoneId,
    } =
      await seedFieldGuidanceFixture();
    const args = {
      proposalSubmilestoneId,
      workosOrganizationId: ORG,
    };
    const empty = tiptap();
    const verification = '{ "type":"doc", "content": [{"type":"paragraph","content":[{"type":"text","text":"Check piers"}]}] }';
    const cameraAngles = '{"content":[{"type":"paragraph","content":[{"text":"North and east elevations","type":"text"}]}],"type":"doc"}';

    await expect(
      admin.query(guidanceApi.getSubmilestoneFieldGuidance, args),
    ).resolves.toMatchObject({
      guidance: null,
      readiness: {
        missingSections: ["whatToVerify", "cameraAngles"],
        readyForSiteVisit: false,
      },
    });

    await admin.mutation(guidanceApi.saveSubmilestoneFieldGuidance, {
      ...args,
      cameraAnglesTiptapJson: empty,
      whatToVerifyTiptapJson: verification,
    });
    const afterPartialSave = await admin.query(
      guidanceApi.getSubmilestoneFieldGuidance,
      args,
    );
    expect(afterPartialSave).toMatchObject({
      guidance: {
        cameraAnglesTiptapJson: empty,
        whatToVerifyTiptapJson: verification,
      },
      readiness: {
        missingSections: ["cameraAngles"],
        readyForSiteVisit: false,
      },
    });

    await admin.mutation(guidanceApi.saveSubmilestoneFieldGuidance, {
      ...args,
      cameraAnglesTiptapJson: cameraAngles,
      whatToVerifyTiptapJson: verification,
    });
    const ready = await admin.query(
      guidanceApi.getSubmilestoneFieldGuidance,
      args,
    );
    expect(ready).toMatchObject({
      guidance: {
        cameraAnglesTiptapJson: cameraAngles,
        whatToVerifyTiptapJson: verification,
      },
      readiness: { missingSections: [], readyForSiteVisit: true },
    });

    const state = await base.run(async (ctx: any) => ({
      auditCount: (await ctx.db.query("auditEvents").collect()).length,
      guidanceRows: await ctx.db.query("submilestoneFieldGuidance").collect(),
      scopeRows: await ctx.db.query("submilestoneScopeRevisions").collect(),
      proposalSubmilestone: await ctx.db.get(proposalSubmilestoneId),
      workosUsers: await ctx.db.query("users").collect(),
    }));
    expect(state.auditCount).toBe(0);
    expect(state.scopeRows).toEqual([]);
    expect(state.workosUsers).toEqual([]);
    expect(state.guidanceRows).toHaveLength(1);
    expect(state.guidanceRows[0]).toMatchObject({
      cameraAnglesTiptapJson: cameraAngles,
      buildId,
      buildSubmilestoneId,
      whatToVerifyTiptapJson: verification,
    });
    expect(state.proposalSubmilestone).not.toHaveProperty(
      "scopeOfWorkTiptapJson",
    );
  });

  test("allows Guidance authoring before a Build owner exists without inventing references", async () => {
    const { admin, base, buildSubmilestoneId, proposalSubmilestoneId } =
      await seedFieldGuidanceFixture();
    await base.run(async (ctx: any) => {
      await ctx.db.delete(buildSubmilestoneId);
    });

    const whatToVerify = tiptap("Verify the excavation depth.");
    const cameraAngles = tiptap("Capture north and east elevations.");
    await admin.mutation(guidanceApi.saveSubmilestoneFieldGuidance, {
      cameraAnglesTiptapJson: cameraAngles,
      proposalSubmilestoneId,
      whatToVerifyTiptapJson: whatToVerify,
      workosOrganizationId: ORG,
    });

    const state = await base.run(async (ctx: any) => ({
      guidance: await ctx.db
        .query("submilestoneFieldGuidance")
        .withIndex("by_proposalSubmilestoneId", (query: any) =>
          query.eq("proposalSubmilestoneId", proposalSubmilestoneId),
        )
        .unique(),
    }));
    expect(state.guidance).toMatchObject({
      cameraAnglesTiptapJson: cameraAngles,
      proposalSubmilestoneId,
      whatToVerifyTiptapJson: whatToVerify,
    });
    expect(state.guidance).not.toHaveProperty("buildId");
    expect(state.guidance).not.toHaveProperty("buildSubmilestoneId");
  });

  test("fails closed and rolls back Guidance creation when Build ownership conflicts", async () => {
    const {
      admin,
      base,
      buildId,
      buildMilestoneId,
      buildSubmilestoneId,
      proposalSubmilestoneId,
    } = await seedFieldGuidanceFixture();
    await base.run(async (ctx: any) => {
      const source = await ctx.db.get(buildSubmilestoneId);
      if (!source) {
        throw new Error("Guidance conflict fixture is unavailable.");
      }
      await ctx.db.insert("buildSubmilestones", {
        brokerageId: source.brokerageId,
        buildId,
        buildMilestoneId,
        createdAt: Date.now(),
        durationDays: source.durationDays,
        key: "excavation-duplicate",
        milestoneKey: source.milestoneKey,
        name: source.name,
        order: source.order + 1,
        organizationId: source.organizationId,
        proposalSubmilestoneId,
        status: "planned",
        updatedAt: Date.now(),
      });
    });

    const error = await admin
      .mutation(guidanceApi.saveSubmilestoneFieldGuidance, {
        cameraAnglesTiptapJson: tiptap("Capture all four elevations."),
        proposalSubmilestoneId,
        whatToVerifyTiptapJson: tiptap("Verify the completed excavation."),
        workosOrganizationId: ORG,
      })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      data: {
        code: "SUBMILESTONE_BUILD_LINEAGE_CONFLICT",
        message: expect.stringMatching(/unavailable or conflicting/i),
        reason: "duplicate_owner",
      },
    });

    const state = await base.run(async (ctx: any) => ({
      guidance: await ctx.db.query("submilestoneFieldGuidance").collect(),
    }));
    expect(state.guidance).toEqual([]);
  });

  test("allows backoffice, linked builder, and exact assigned contractor reads", async () => {
    const {
      admin,
      builder,
      contractor,
      proposalSubmilestoneId,
      base,
      contractorId,
      milestoneContractorAssignmentId,
    } = await seedFieldGuidanceFixture();
    const args = {
      proposalSubmilestoneId,
      workosOrganizationId: ORG,
    };
    await admin.mutation(guidanceApi.saveSubmilestoneFieldGuidance, {
      ...args,
      cameraAnglesTiptapJson: tiptap("Capture the east elevation."),
      whatToVerifyTiptapJson: tiptap("Verify completed excavation."),
    });

    await expect(
      builder.query(guidanceApi.getSubmilestoneFieldGuidance, args),
    ).resolves.toMatchObject({
      guidance: { proposalSubmilestoneId },
      readiness: { readyForSiteVisit: true },
    });
    await expect(
      contractor.query(guidanceApi.getSubmilestoneFieldGuidance, args),
    ).resolves.toMatchObject({
      guidance: { proposalSubmilestoneId },
      readiness: { readyForSiteVisit: true },
    });

    const unlinkedContractor = withIdentity(
      base,
      ["contractor"],
      "user_field_guidance_unlinked",
    );
    await expect(
      unlinkedContractor.query(guidanceApi.getSubmilestoneFieldGuidance, args),
    ).rejects.toThrow("Field Guidance unavailable");

    const wrongOrg = withIdentity(base, ["builder"], BUILDER_USER, OTHER_ORG);
    await expect(
      wrongOrg.query(guidanceApi.getSubmilestoneFieldGuidance, args),
    ).rejects.toThrow("organization scope");

    // A linked Contractor profile without the exact canonical assignment must
    // receive the same generic denial as an unlinked Contractor.
    const wrongAssignment = withIdentity(
      base,
      ["contractor"],
      "user_field_guidance_other_assignment",
    );
    await base.run(async (ctx: any) => {
      await ctx.db.patch(contractorId, {
        accountWorkosUserId: "user_field_guidance_other_assignment",
      });
      await ctx.db.patch(milestoneContractorAssignmentId, {
        status: "removed",
      });
    });
    await expect(
      wrongAssignment.query(guidanceApi.getSubmilestoneFieldGuidance, args),
    ).rejects.toThrow("Field Guidance unavailable");
  });

  test("replaces one canonical row across sequential saves, with the latest save winning", async () => {
    const { base, admin, proposalSubmilestoneId } =
      await seedFieldGuidanceFixture();
    const secondAdmin = withIdentity(base, ["broker"], "user_field_guidance_broker");
    const args = {
      proposalSubmilestoneId,
      workosOrganizationId: ORG,
    };
    const first = tiptap("First saved value");
    const second = tiptap("Second saved value");

    await admin.mutation(guidanceApi.saveSubmilestoneFieldGuidance, {
      ...args,
      cameraAnglesTiptapJson: first,
      whatToVerifyTiptapJson: first,
    });
    await secondAdmin.mutation(guidanceApi.saveSubmilestoneFieldGuidance, {
      ...args,
      cameraAnglesTiptapJson: second,
      whatToVerifyTiptapJson: second,
    });

    const rows = (await base.run((ctx: any) =>
      ctx.db
        .query("submilestoneFieldGuidance")
        .withIndex("by_proposalSubmilestoneId", (query: any) =>
          query.eq("proposalSubmilestoneId", proposalSubmilestoneId),
        )
        .collect(),
    )) as Doc<"submilestoneFieldGuidance">[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      cameraAnglesTiptapJson: second,
      updatedByWorkosUserId: "user_field_guidance_broker",
      whatToVerifyTiptapJson: second,
    });
  });

  test("rejects malformed TipTap JSON without creating a row", async () => {
    const { admin, base, proposalSubmilestoneId } =
      await seedFieldGuidanceFixture();
    await expect(
      admin.mutation(guidanceApi.saveSubmilestoneFieldGuidance, {
        cameraAnglesTiptapJson: tiptap("Valid camera guidance"),
        proposalSubmilestoneId,
        whatToVerifyTiptapJson: "not-json",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/whatToVerifyTiptapJson.*valid TipTap JSON/i);
    await expect(
      base.run((ctx: any) => ctx.db.query("submilestoneFieldGuidance").collect()),
    ).resolves.toEqual([]);
  });
});
