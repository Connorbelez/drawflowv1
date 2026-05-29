/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import { __test } from "./builderRoster";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const FAIRLEND_ORG = "org_01KSNW6JHW9P9YS41DZX1YHHGS";
const PRINCIPAL_BROKER = "user_01KR207FRFHQT46EV9N538XBF3";

function asRole(base: ReturnType<typeof convexTest>, roles: string[], subject: string) {
  return base.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId: FAIRLEND_ORG,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as any);
}

/**
 * Seeds the FairLend brokerage + a builder profile with an owner account, then
 * returns a handle scoped to the FairLend principal broker, who also holds the
 * admin role. The seed pins broker membership to the FairLend principal-broker
 * WorkOS id, so proposal authorization (which checks org membership) requires
 * acting as that subject.
 */
async function seededRoster() {
  const base = convexTest(schema, modules);
  const admin = asRole(base, ["admin", "principle-broker"], PRINCIPAL_BROKER);
  const seed = await admin.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: FAIRLEND_ORG },
  );
  return { admin, base, seed };
}

const MILESTONES = [
  {
    budgetCents: 50_000_000,
    dayEnd: 30,
    dayStart: 0,
    dependencyKeys: [] as string[],
    durationDays: 30,
    key: "foundation",
    name: "Foundation",
    order: 1,
    submilestones: [],
  },
];

async function createProposal(
  admin: ReturnType<typeof asRole>,
  seed: { brokerageId: string; builderProfileId: string },
  buildName: string,
) {
  const proposalId = await admin.mutation(
    (api as any).production_proposals.createDraftProposal,
    {
      brokerageId: seed.brokerageId,
      builderProfileId: seed.builderProfileId,
      buildName,
      location: `${buildName} Ave, Toronto, ON`,
      workosOrganizationId: FAIRLEND_ORG,
    },
  );
  await admin.mutation(
    (api as any).production_proposals.saveDraftProposalPackage,
    {
      borrowerCoPayBps: 2_000,
      borrowerWorkingCapitalLimitCents: 40_000_000,
      documents: [
        {
          documentType: "permit",
          fileName: "permit.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
        },
      ],
      lenderDrawPolicyLimitCents: 55_000_000,
      milestones: MILESTONES,
      proposalId,
      workosOrganizationId: FAIRLEND_ORG,
    },
  );
  return proposalId;
}

describe("builder roster aggregation", () => {
  test("a freshly provisioned builder with an owner account reports the no_proposal stage", async () => {
    const { admin, seed } = await seededRoster();

    const roster = await admin.query(
      (api as any).builderRoster.listBuilderRoster,
      {},
    );

    const builder = roster.builders.find(
      (row: any) => row._id === seed.builderProfileId,
    );
    expect(builder).toBeDefined();
    expect(builder.stage).toBe("no_proposal");
    expect(builder.accountCount).toBe(1);
    expect(builder.ownerAccount?.role).toBe("owner");
    expect(builder.ownerAccount?.email).toBe("builder@example.com");
    expect(builder.proposalCount).toBe(0);
    expect(builder.proposedCapitalCents).toBe(0);
    expect(builder.brokerage?.displayName).toBe("FairLendBrokerage");
  });

  test("aggregates proposal counts, capital rollups, and derives the approved stage", async () => {
    const { admin, seed } = await seededRoster();

    // Draft proposal stays open and contributes to proposed capital only.
    await createProposal(admin, seed, "Draft Build");

    // A second proposal is submitted and approved.
    const approvedId = await createProposal(admin, seed, "Approved Build");
    await admin.mutation((api as any).production_proposals.submitProposal, {
      proposalId: approvedId,
      workosOrganizationId: FAIRLEND_ORG,
    });
    await admin.mutation((api as any).production_proposals.approveProposal, {
      permitWaiverReason: "Permit on file via uploaded document.",
      proposalId: approvedId,
      reason: "Underwriting complete; approving for build.",
      workosOrganizationId: FAIRLEND_ORG,
    });

    const roster = await admin.query(
      (api as any).builderRoster.listBuilderRoster,
      {},
    );
    const builder = roster.builders.find(
      (row: any) => row._id === seed.builderProfileId,
    );

    expect(builder.proposalCount).toBe(2);
    expect(builder.proposalCounts.draft).toBe(1);
    expect(builder.proposalCounts.approved).toBe(1);
    // Both proposals are open (none closed) so both count toward proposed.
    expect(builder.proposedCapitalCents).toBe(100_000_000);
    // Only the approved proposal contributes to approved capital.
    expect(builder.approvedCapitalCents).toBe(50_000_000);
    // Approval (without an active build) lands the builder at the approved stage.
    expect(builder.stage).toBe("approved");
    expect(builder.builds.length).toBe(0);
  });

  test("setBuilderProfileStatus deactivates the profile and the roster reports dormant", async () => {
    const { admin, seed } = await seededRoster();

    const result = await admin.mutation(
      (api as any).builderRoster.setBuilderProfileStatus,
      { builderProfileId: seed.builderProfileId, status: "inactive" },
    );
    expect(result.status).toBe("inactive");

    const roster = await admin.query(
      (api as any).builderRoster.listBuilderRoster,
      {},
    );
    const builder = roster.builders.find(
      (row: any) => row._id === seed.builderProfileId,
    );
    expect(builder.status).toBe("inactive");
    expect(builder.stage).toBe("dormant");
  });

  test("listBuilderRoster rejects callers without backoffice access", async () => {
    const { base, seed } = await seededRoster();
    const builder = asRole(base, ["builder"], "user_builder");

    await expect(
      builder.query((api as any).builderRoster.listBuilderRoster, {}),
    ).rejects.toThrow();
    // Sanity: the seed actually produced a builder profile.
    expect(seed.builderProfileId).toBeDefined();
  });

  test("setBuilderProfileStatus rejects callers without user-management write access", async () => {
    const { base, seed } = await seededRoster();
    const builder = asRole(base, ["builder"], "user_builder");

    await expect(
      builder.mutation((api as any).builderRoster.setBuilderProfileStatus, {
        builderProfileId: seed.builderProfileId,
        status: "inactive",
      }),
    ).rejects.toThrow();
  });
});

describe("unprovisioned builders + naming guards", () => {
  test("listUnprovisionedBuilders surfaces builder-role users without a profile and excludes linked ones", async () => {
    const { admin, base, seed } = await seededRoster();

    // A builder-role user with no builder account link in the FairLend org.
    await base.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        authId: "user_unlinked_builder",
        createdAt: now,
        email: "newbuilder@example.com",
        emailVerified: true,
        name: "New Builder",
        status: "active",
        updatedAt: now,
        workosUserId: "user_unlinked_builder",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        roleSlug: "builder",
        roleSlugs: ["builder"],
        sourceEventId: "test_membership_unlinked_builder",
        sourceEventType: "test",
        status: "active",
        updatedAt: now,
        workosMembershipId: "om_unlinked_builder",
        workosOrganizationId: FAIRLEND_ORG,
        workosUserId: "user_unlinked_builder",
      });
    });

    const result = await admin.query(
      (api as any).builderRoster.listUnprovisionedBuilders,
      {},
    );
    const ids = result.candidates.map((row: any) => row.workosUserId);
    expect(ids).toContain("user_unlinked_builder");
    // The seed builder owner is already linked, so must not be a candidate.
    expect(ids).not.toContain("user_builder");
    expect(seed.builderProfileId).toBeDefined();
  });

  test("provisionBuilderProfile requires a builder name distinct from the brokerage", async () => {
    const { admin } = await seededRoster();

    await expect(
      admin.mutation((api as any).brokerageProvisioning.provisionBuilderProfile, {
        displayName: "FairLendBrokerage",
        workosOrganizationId: FAIRLEND_ORG,
      }),
    ).rejects.toThrow();

    const result = await admin.mutation(
      (api as any).brokerageProvisioning.provisionBuilderProfile,
      {
        displayName: "Northwind Homes",
        workosOrganizationId: FAIRLEND_ORG,
      },
    );
    expect(result.operation).toBe("created");

    const roster = await admin.query(
      (api as any).builderRoster.listBuilderRoster,
      {},
    );
    const names = roster.builders.map((row: any) => row.displayName);
    expect(names).toContain("Northwind Homes");
  });

  test("renameBuilderProfile updates the name and rejects the brokerage name", async () => {
    const { admin, seed } = await seededRoster();

    const renamed = await admin.mutation(
      (api as any).builderRoster.renameBuilderProfile,
      { builderProfileId: seed.builderProfileId, displayName: "Cedar Build Co." },
    );
    expect(renamed.displayName).toBe("Cedar Build Co.");

    const roster = await admin.query(
      (api as any).builderRoster.listBuilderRoster,
      {},
    );
    const builder = roster.builders.find(
      (row: any) => row._id === seed.builderProfileId,
    );
    expect(builder.displayName).toBe("Cedar Build Co.");

    // The seed profile shares the FairLend org with the FairLend brokerage, so
    // renaming it to the brokerage name must be rejected.
    await expect(
      admin.mutation((api as any).builderRoster.renameBuilderProfile, {
        builderProfileId: seed.builderProfileId,
        displayName: "FairLendBrokerage",
      }),
    ).rejects.toThrow();
  });

  test("listUnprovisionedBuilders rejects callers without backoffice access", async () => {
    const { base } = await seededRoster();
    const builder = asRole(base, ["builder"], "user_builder");
    await expect(
      builder.query((api as any).builderRoster.listUnprovisionedBuilders, {}),
    ).rejects.toThrow();
  });
});

describe("deriveStage", () => {
  const { deriveStage } = __test;
  const proposal = (status: "draft" | "submitted" | "approved" | "closed") => ({
    _id: "p",
    activeBuildId: null,
    approvedAt: null,
    buildName: "b",
    closedAt: null,
    location: "l",
    reviewOutcome: "none" as const,
    status,
    submittedAt: null,
    totalBudgetCents: 0,
    updatedAt: 0,
  });
  const build = (status: "active" | "future_start") => ({
    _id: "b",
    buildName: "b",
    location: "l",
    proposalId: "p",
    startDate: "2026-01-01",
    status,
    totalBudgetCents: 0,
    updatedAt: 0,
  });

  test("inactive profiles are always dormant regardless of pipeline", () => {
    expect(
      deriveStage({
        accountCount: 2,
        builds: [build("active")],
        profileStatus: "inactive",
        proposals: [proposal("approved")],
      }),
    ).toBe("dormant");
  });

  test("an active build outranks an approved proposal", () => {
    expect(
      deriveStage({
        accountCount: 1,
        builds: [build("active")],
        profileStatus: "active",
        proposals: [proposal("approved"), proposal("submitted")],
      }),
    ).toBe("building");
  });

  test("a future-start build does not promote to building", () => {
    expect(
      deriveStage({
        accountCount: 1,
        builds: [build("future_start")],
        profileStatus: "active",
        proposals: [proposal("submitted")],
      }),
    ).toBe("in_review");
  });

  test("stage follows the highest-progress proposal status", () => {
    expect(
      deriveStage({
        accountCount: 1,
        builds: [],
        profileStatus: "active",
        proposals: [proposal("draft"), proposal("submitted")],
      }),
    ).toBe("in_review");
    expect(
      deriveStage({
        accountCount: 1,
        builds: [],
        profileStatus: "active",
        proposals: [proposal("draft")],
      }),
    ).toBe("drafting");
  });

  test("only-closed proposals with no build read as closed", () => {
    expect(
      deriveStage({
        accountCount: 1,
        builds: [],
        profileStatus: "active",
        proposals: [proposal("closed")],
      }),
    ).toBe("closed");
  });

  test("no proposals: invited without accounts, no_proposal with accounts", () => {
    expect(
      deriveStage({
        accountCount: 0,
        builds: [],
        profileStatus: "active",
        proposals: [],
      }),
    ).toBe("invited");
    expect(
      deriveStage({
        accountCount: 1,
        builds: [],
        profileStatus: "active",
        proposals: [],
      }),
    ).toBe("no_proposal");
  });
});
