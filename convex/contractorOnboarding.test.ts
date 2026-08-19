/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ORG = "org_01KSNW6JHW9P9YS41DZX1YHHGS";
const PRINCIPAL_BROKER = "user_01KR207FRFHQT46EV9N538XBF3";
const APPLICANT = "user_self_service_applicant";

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
    (internal as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORG },
  );
  return { admin, base, seed };
}

async function acceptPendingContractorClaim(
  admin: ReturnType<typeof withIdentity>,
  contractorId: string,
  workosUserId: string,
) {
  await admin.run(async (ctx: any) => {
    const claim = await ctx.db
      .query("contractorInviteClaims")
      .withIndex("by_contractor_state", (q: any) =>
        q.eq("contractorId", contractorId).eq("state", "invited"),
      )
      .first();
    await ctx.db.patch(claim._id, {
      acceptedWorkosUserId: workosUserId,
      state: "accepted_pending_confirmation",
      updatedAt: Date.now(),
    });
  });
}

describe("contractor self-service onboarding (PRD §7.1)", () => {
  test("a member can save a draft, submit, and backoffice approves with role promotion request", async () => {
    const { admin, base, seed } = await seedFoundation();
    const onboardingApi = (api as any).contractorOnboarding;
    // Member (no contractor role yet) can reach the onboarding bridge only.
    const member = withIdentity(base, ["member"], APPLICANT);

    const reviewId = await member.mutation(
      onboardingApi.saveContractorOnboardingDraft,
      {
        draftFields: {
          email: "applicant@example.com",
          kind: "company",
          name: "Self-Service Co",
          trades: ["plumbing"],
        },
        workosOrganizationId: ORG,
      },
    );
    expect(reviewId).toBeDefined();

    const bridge = await member.query(
      onboardingApi.getContractorOnboardingBridge,
      { workosOrganizationId: ORG },
    );
    expect(bridge.hasContractorRole).toBe(false);
    expect(bridge.workspaceUnlocked).toBe(false);
    expect(bridge.onboardingReview.status).toBe("draft");

    await member.mutation(onboardingApi.submitContractorOnboarding, {
      workosOrganizationId: ORG,
    });

    const queue = await admin.query(
      onboardingApi.listContractorOnboardingReviews,
      { workosOrganizationId: ORG },
    );
    expect(queue).toHaveLength(1);
    expect(queue[0].status).toBe("pending_backoffice_review");

    // Backoffice approval requests WorkOS role promotion (fire-and-forget).
    await admin.mutation(onboardingApi.approveContractorOnboarding, {
      reviewId,
      workosOrganizationId: ORG,
    });
    const detail = await admin.query(
      onboardingApi.getContractorOnboardingReview,
      { reviewId, workosOrganizationId: ORG },
    );
    expect(detail.review.status).toBe("approved_pending_workos");

    // Finalize once the role/session syncs → profile linked + active.
    const finalized = await admin.mutation(
      onboardingApi.finalizeContractorOnboardingRoleSync,
      { applicantWorkosUserId: APPLICANT, workosOrganizationId: ORG },
    );
    expect(finalized).toBe(true);
    void seed;
  });

  test("backoffice can reject with a reason and request changes", async () => {
    const { admin, base } = await seedFoundation();
    const onboardingApi = (api as any).contractorOnboarding;
    const member = withIdentity(base, ["member"], APPLICANT);

    const reviewId = await member.mutation(
      onboardingApi.saveContractorOnboardingDraft,
      {
        draftFields: { email: "reject@example.com", name: "Reject Me", trades: [] },
        workosOrganizationId: ORG,
      },
    );
    await member.mutation(onboardingApi.submitContractorOnboarding, {
      workosOrganizationId: ORG,
    });

    await admin.mutation(onboardingApi.requestContractorOnboardingChanges, {
      reason: "Add license number.",
      reviewId,
      workosOrganizationId: ORG,
    });
    let detail = await admin.query(
      onboardingApi.getContractorOnboardingReview,
      { reviewId, workosOrganizationId: ORG },
    );
    expect(detail.review.status).toBe("changes_requested");

    // Applicant re-edits and resubmits (changes_requested → pending review).
    await member.mutation(onboardingApi.saveContractorOnboardingDraft, {
      draftFields: { email: "reject@example.com", name: "Reject Me", trades: [] },
      workosOrganizationId: ORG,
    });
    await member.mutation(onboardingApi.submitContractorOnboarding, {
      workosOrganizationId: ORG,
    });
    detail = await admin.query(
      onboardingApi.getContractorOnboardingReview,
      { reviewId, workosOrganizationId: ORG },
    );
    expect(detail.review.status).toBe("pending_backoffice_review");

    await admin.mutation(onboardingApi.rejectContractorOnboarding, {
      reason: "Not a fit.",
      reviewId,
      workosOrganizationId: ORG,
    });
    detail = await admin.query(
      onboardingApi.getContractorOnboardingReview,
      { reviewId, workosOrganizationId: ORG },
    );
    expect(detail.review.status).toBe("rejected");
  });

  test("onboarding state machine rejects invalid transitions", async () => {
    const { admin, base } = await seedFoundation();
    const onboardingApi = (api as any).contractorOnboarding;
    const member = withIdentity(base, ["member"], APPLICANT);

    const reviewId = await member.mutation(
      onboardingApi.saveContractorOnboardingDraft,
      {
        draftFields: { email: "sm@example.com", name: "SM", trades: [] },
        workosOrganizationId: ORG,
      },
    );
    // Cannot approve a draft directly — must be submitted first (PRD §14.1).
    await expect(
      admin.mutation(onboardingApi.approveContractorOnboarding, {
        reviewId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/Invalid onboarding transition/);
  });
});

describe("contractor invite/claim (PRD §7.3)", () => {
  test("backoffice sends an invite, creating a single live claim intent", async () => {
    const { admin, seed } = await seedFoundation();
    const onboardingApi = (api as any).contractorOnboarding;
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "invitee@example.com",
        kind: "company",
        name: "Invitee Co",
        trades: ["electrical"],
        workosOrganizationId: ORG,
      },
    );
    const claimId = await admin.mutation(
      onboardingApi.sendContractorProfileInvite,
      { contractorId, workosOrganizationId: ORG },
    );
    expect(claimId).toBeDefined();

    // Sending again revokes the prior live invite (single live claim).
    const claimId2 = await admin.mutation(
      onboardingApi.sendContractorProfileInvite,
      { contractorId, workosOrganizationId: ORG },
    );
    const prior = await admin.run(async (ctx: any) => ctx.db.get(claimId));
    expect(prior.state).toBe("revoked");
    void claimId2;
  });

  test("backoffice can revoke and resend invites", async () => {
    const { admin, seed } = await seedFoundation();
    const onboardingApi = (api as any).contractorOnboarding;
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "revokee@example.com",
        kind: "company",
        name: "Revokee Co",
        trades: ["hvac"],
        workosOrganizationId: ORG,
      },
    );
    const claimId = await admin.mutation(
      onboardingApi.sendContractorProfileInvite,
      { contractorId, workosOrganizationId: ORG },
    );
    await admin.mutation(onboardingApi.revokeContractorProfileInvite, {
      claimId,
      reason: "Wrong email.",
      workosOrganizationId: ORG,
    });
    const revoked = await admin.run(async (ctx: any) => ctx.db.get(claimId));
    expect(revoked.state).toBe("revoked");

    // Resend re-activates the invite.
    await admin.mutation(onboardingApi.resendContractorProfileInvite, {
      claimId,
      workosOrganizationId: ORG,
    });
    const resent = await admin.run(async (ctx: any) => ctx.db.get(claimId));
    expect(resent.state).toBe("invited");
  });

  test("a profile without an email cannot be invited", async () => {
    const { admin, seed } = await seedFoundation();
    const onboardingApi = (api as any).contractorOnboarding;
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        kind: "individual",
        name: "No Email Crew",
        trades: ["labour"],
        workosOrganizationId: ORG,
      },
    );
    await expect(
      admin.mutation(onboardingApi.sendContractorProfileInvite, {
        contractorId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/no email/);
  });

  test("a builder can invite a contractor attached to an owned proposal before milestone assignment", async () => {
    const { admin, base, seed } = await seedFoundation();
    const onboardingApi = (api as any).contractorOnboarding;
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "attached-before-assignment@example.com",
        kind: "company",
        name: "Attached Before Assignment Co",
        trades: ["electrical"],
        workosOrganizationId: ORG,
      },
    );
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Builder Owned Proposal",
        location: "10 Builder Scope Way",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.attachProposalContractor,
      {
        contractorId,
        proposalId,
        role: "Electrical crew",
        workosOrganizationId: ORG,
      },
    );
    const builder = withIdentity(base, ["builder"], "user_builder");

    const claimId = await builder.mutation(
      onboardingApi.sendContractorProfileInvite,
      {
        contractorId,
        workosOrganizationId: ORG,
      },
    );

    const persisted = await admin.run(async (ctx: any) => ({
      claim: await ctx.db.get(claimId),
      contractor: await ctx.db.get(contractorId),
    }));
    expect(persisted.claim).toMatchObject({
      contractorId,
      inviterWorkosUserId: "user_builder",
      state: "invited",
    });
    expect(persisted.contractor.onboardingStatus).toBe("invited");
  });

  test("a builder cannot invite a contractor attached only to another builder scope", async () => {
    const { admin, base, seed } = await seedFoundation();
    const onboardingApi = (api as any).contractorOnboarding;
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "other-builder-only@example.com",
        kind: "company",
        name: "Other Builder Only Co",
        trades: ["electrical"],
        workosOrganizationId: ORG,
      },
    );
    const otherBuilderProfileId = await admin.run(async (ctx: any) => {
      const now = Date.now();
      const builderProfileId = await ctx.db.insert("builderProfiles", {
        brokerageId: seed.brokerageId,
        createdAt: now,
        displayName: "Other Builder",
        legalName: "Other Builder LLC",
        organizationId: ORG,
        status: "active",
        updatedAt: now,
      });
      await ctx.db.insert("builderAccountLinks", {
        brokerageId: seed.brokerageId,
        builderProfileId,
        createdAt: now,
        role: "owner",
        status: "active",
        updatedAt: now,
        workosUserId: "user_other_builder",
      });
      return builderProfileId;
    });
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: otherBuilderProfileId,
        buildName: "Other Builder Proposal",
        location: "55 Scoped Way",
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
    await admin.mutation(
      (api as any).production_proposals.assignProposalContractorToMilestone,
      {
        contractorId,
        milestoneKey: "foundation",
        proposalId,
        role: "mason",
        workosOrganizationId: ORG,
      },
    );

    const builder = withIdentity(base, ["builder"], "user_builder");
    await expect(
      builder.mutation(onboardingApi.sendContractorProfileInvite, {
        contractorId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/not attached to any of your proposals\/builds/);
  });

  test("confirming a claim links the canonical profile to the WorkOS user", async () => {
    const { admin, base, seed } = await seedFoundation();
    const onboardingApi = (api as any).contractorOnboarding;
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "claimer@example.com",
        kind: "company",
        name: "Claimer Co",
        trades: ["roofing"],
        workosOrganizationId: ORG,
      },
    );
    // Seed the WorkOS user projection so the email match resolves (PRD §7.3.6).
    await admin.run(async (ctx: any) => {
      await ctx.db.insert("users", {
        authId: "auth_claimer",
        email: "claimer@example.com",
        name: "Claimer",
        workosUserId: "user_claimer",
      });
    });

    await admin.mutation(onboardingApi.sendContractorProfileInvite, {
      contractorId,
      workosOrganizationId: ORG,
    });
    const claimer = withIdentity(base, ["member"], "user_claimer");
    const beforeAcceptance = await claimer.query(
      onboardingApi.getContractorClaimForConfirmation,
      { workosOrganizationId: ORG },
    );
    expect(beforeAcceptance.claim).toBeNull();
    await expect(
      claimer.mutation(onboardingApi.confirmContractorProfileClaim, {
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/No pending contractor claim/i);
    await acceptPendingContractorClaim(
      admin,
      String(contractorId),
      "user_claimer",
    );

    const confirmation = await claimer.query(
      onboardingApi.getContractorClaimForConfirmation,
      { workosOrganizationId: ORG },
    );
    expect(confirmation.claim).not.toBeNull();
    expect(confirmation.contractor.name).toBe("Claimer Co");

    const result = await claimer.mutation(
      onboardingApi.confirmContractorProfileClaim,
      { workosOrganizationId: ORG },
    );
    expect(result.contractorId).toBe(contractorId);

    const profile = await admin.run(async (ctx: any) =>
      ctx.db.get(contractorId),
    );
    expect(profile.accountWorkosUserId).toBe("user_claimer");
    expect(profile.onboardingStatus).toBe("account_linked");
  });

  test("finalize role sync does not overwrite a contractor already claimed by another user", async () => {
    const { admin, base } = await seedFoundation();
    const onboardingApi = (api as any).contractorOnboarding;
    const member = withIdentity(base, ["member"], APPLICANT);

    const reviewId = await member.mutation(
      onboardingApi.saveContractorOnboardingDraft,
      {
        draftFields: {
          email: "claim-collision@example.com",
          kind: "company",
          name: "Claim Collision Co",
          trades: ["plumbing"],
        },
        workosOrganizationId: ORG,
      },
    );
    await member.mutation(onboardingApi.submitContractorOnboarding, {
      workosOrganizationId: ORG,
    });
    await admin.mutation(onboardingApi.approveContractorOnboarding, {
      reviewId,
      workosOrganizationId: ORG,
    });

    const review = await admin.run(async (ctx: any) => ctx.db.get(reviewId));
    await admin.run(async (ctx: any) => {
      await ctx.db.insert("users", {
        authId: "auth_claim_collision",
        email: "claim-collision@example.com",
        name: "Claim Collision",
        workosUserId: "user_claim_collision",
      });
    });
    await admin.mutation(onboardingApi.sendContractorProfileInvite, {
      contractorId: review.contractorId,
      workosOrganizationId: ORG,
    });
    await acceptPendingContractorClaim(
      admin,
      String(review.contractorId),
      "user_claim_collision",
    );

    const claimer = withIdentity(base, ["member"], "user_claim_collision");
    const confirmation = await claimer.query(
      onboardingApi.getContractorClaimForConfirmation,
      { workosOrganizationId: ORG },
    );
    expect(confirmation.claim.state).toBe("accepted_pending_confirmation");
    await claimer.mutation(onboardingApi.confirmContractorProfileClaim, {
      workosOrganizationId: ORG,
    });

    const finalized = await admin.mutation(
      onboardingApi.finalizeContractorOnboardingRoleSync,
      { applicantWorkosUserId: APPLICANT, workosOrganizationId: ORG },
    );
    expect(finalized).toBe(false);

    const profile = await admin.run(async (ctx: any) =>
      ctx.db.get(review.contractorId),
    );
    expect(profile.accountWorkosUserId).toBe("user_claim_collision");

    const afterReview = await admin.run(async (ctx: any) => ctx.db.get(reviewId));
    expect(afterReview.status).toBe("approved_pending_workos");
  });
});

describe("contractor onboarding authorization", () => {
  test("non-backoffice roles cannot list or approve onboarding reviews", async () => {
    const { base } = await seedFoundation();
    const onboardingApi = (api as any).contractorOnboarding;
    const member = withIdentity(base, ["member"], APPLICANT);
    await expect(
      member.query(onboardingApi.listContractorOnboardingReviews, {
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow();
  });
});
