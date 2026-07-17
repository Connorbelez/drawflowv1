/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ORG = "org_01KSNW6JHW9P9YS41DZX1YHHGS";
const PRINCIPAL_BROKER = "user_01KR207FRFHQT46EV9N538XBF3";

function withIdentity(
  t: ReturnType<typeof convexTest>,
  roles: string[],
  subject: string,
) {
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

async function seedFoundation() {
  const base = convexTest(schema, modules);
  const admin = withIdentity(base, ["admin", "principle-broker"], PRINCIPAL_BROKER);
  const seed = await admin.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORG },
  );
  return { admin, base, seed };
}

describe("contractor duplicate merge (PRD §6.3)", () => {
  test("merging loser profiles migrates assignments + evidence and preserves aliases", async () => {
    const { admin, seed } = await seedFoundation();
    const mergeApi = (api as any).contractorMerge;

    const canonicalId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "canonical@example.com",
        kind: "company",
        name: "Canonical Co",
        trades: ["roofing"],
        workosOrganizationId: ORG,
      },
    );
    const loserId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "loser@example.com",
        kind: "company",
        name: "Loser Co (duplicate)",
        trades: ["roofing"],
        workosOrganizationId: ORG,
      },
    );

    // Create a build + assign the loser contractor so we can verify migration.
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Merge build",
        location: "1 Merge Way",
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
            fileName: "permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1024,
          },
        ],
        lenderDrawPolicyLimitCents: 100_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 24,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 24,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
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
      reason: "ok",
      workosOrganizationId: ORG,
    });
    const closing = await admin.mutation(
      (api as any).production_proposals.recordOfflineClosing,
      {
        buildStartDate: "2026-01-01",
        loanFacility: { interestAnnualBps: 925, principalCents: 100_000_000 },
        proposalId,
        reason: "closed",
        workosOrganizationId: ORG,
      },
    );
    const buildId = closing.buildId;
    await admin.mutation(
      (api as any).production_proposals.assignActiveBuildContractorToMilestone,
      {
        buildId,
        contractorId: loserId,
        milestoneKey: "foundation",
        role: "mason",
        workosOrganizationId: ORG,
      },
    );

    const result = await admin.mutation(mergeApi.mergeContractorProfiles, {
      canonicalContractorId: canonicalId,
      loserContractorIds: [loserId],
      reason: "Same contractor, two records.",
      workosOrganizationId: ORG,
    });
    expect(result.canonicalContractorId).toBe(canonicalId);
    expect(result.mergedLosers).toBe(1);
    expect(result.migratedAssignments).toBeGreaterThanOrEqual(1);

    // The loser's assignment now points to the canonical profile.
    const assignment = await admin.run(async (ctx: any) =>
      ctx.db
        .query("milestoneContractorAssignments")
        .withIndex("by_contractor_build", (q: any) =>
          q.eq("contractorId", canonicalId).eq("buildId", buildId),
        )
        .first(),
    );
    expect(assignment).not.toBeNull();

    // The loser profile is preserved but inactive, with an alias record.
    const loser = await admin.run(async (ctx: any) => ctx.db.get(loserId));
    expect(loser.status).toBe("inactive");
    const alias = await admin.run(async (ctx: any) =>
      ctx.db
        .query("contractorAliases")
        .withIndex("by_merged", (q: any) => q.eq("mergedContractorId", loserId))
        .first(),
    );
    expect(alias.canonicalContractorId).toBe(canonicalId);
    expect(alias.originalName).toBe("Loser Co (duplicate)");
  });

  test("canonical profile cannot be in the loser set", async () => {
    const { admin, seed } = await seedFoundation();
    const mergeApi = (api as any).contractorMerge;
    const id = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "self@example.com",
        kind: "company",
        name: "Self",
        trades: [],
        workosOrganizationId: ORG,
      },
    );
    await expect(
      admin.mutation(mergeApi.mergeContractorProfiles, {
        canonicalContractorId: id,
        loserContractorIds: [id],
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/cannot be in the loser set/);
  });

  test("duplicate hints surface exact email + fuzzy phone/name matches without auto-merge", async () => {
    const { admin, seed } = await seedFoundation();
    const mergeApi = (api as any).contractorMerge;
    const a = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "dup@example.com",
        kind: "company",
        name: "Dup Co",
        phone: "416-555-0000",
        trades: [],
        workosOrganizationId: ORG,
      },
    );
    // Fuzzy phone match (no shared email).
    await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        kind: "company",
        name: "Other Name",
        phone: "416-555-0000",
        trades: [],
        workosOrganizationId: ORG,
      },
    );
    const hints = await admin.query(mergeApi.listContractorDuplicateHints, {
      contractorId: a,
      workosOrganizationId: ORG,
    });
    expect(hints.hints.some((h: any) => h.kind === "phone")).toBe(true);
    expect(hints.hints.every((h: any) => h.confidence !== "exact" || h.kind === "email")).toBe(true);
  });
});

describe("contractor deactivate / unlink (PRD §8.8, user story 68)", () => {
  test("backoffice can deactivate and unlink a profile with audit", async () => {
    const { admin, seed } = await seedFoundation();
    const mergeApi = (api as any).contractorMerge;
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        accountWorkosUserId: "user_to_deactivate",
        brokerageId: seed.brokerageId,
        email: "deactivate@example.com",
        kind: "company",
        name: "Deactivate Co",
        trades: [],
        workosOrganizationId: ORG,
      },
    );

    await admin.mutation(mergeApi.deactivateContractorProfile, {
      contractorId,
      reason: "No longer active.",
      workosOrganizationId: ORG,
    });
    let profile = await admin.run(async (ctx: any) => ctx.db.get(contractorId));
    expect(profile.status).toBe("inactive");

    await admin.mutation(mergeApi.unlinkContractorAccount, {
      contractorId,
      reason: "Account compromised.",
      workosOrganizationId: ORG,
    });
    profile = await admin.run(async (ctx: any) => ctx.db.get(contractorId));
    expect(profile.accountWorkosUserId).toBeUndefined();
    expect(profile.onboardingStatus).toBe("profile_only");
  });
});
