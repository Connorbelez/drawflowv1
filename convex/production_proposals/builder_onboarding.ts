/**
 * Production proposals builder onboarding bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { authenticatedAction, authenticatedMutation, authenticatedQuery, normalizeRoleSlugs } from "../authz";
import { listAssignableBrokerMembers } from "../brokerAssignments";
import { internalMutation, publicQuery } from "../fluent";
import { generateShareToken, shareTokenHash } from "../proposal_collaboration_model";
import { type Id } from "../types";
import { authorizeBrokerage, authorizeProposal } from "./authorization_core.js";
import { getOwnedBuilderProfile, getOwnedBuilderProfiles, getActiveOrganizationMembership } from "./builder_staff_access.js";
import { requireBackofficeProposalWrite, requireAnyRole } from "./contractor_policy_helpers.js";
import { listAvailableContractorOptions } from "./contractor_proposal_helpers.js";
import { BACKOFFICE_ROLES, BUILDER_ROLES, builderOnboardingRecoveryValidator } from "./contracts_foundation.js";
import { resolveBorrowerStartingCashCents } from "./directory_cards.js";
import { getProposalClaimLinkByToken, canClaimDraftProposal, claimRoles, getOrCreateClaimantBuilderProfile, isBackoffice } from "./proposal_claim.js";
import { upsertKanbanCard, writeProposalEvent } from "./proposal_copy_audit.js";
import { collectProposalTemplateDetails, collectByIndex } from "./storage_helpers.js";

export const getBuilderProposalCreateContext = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    if (!isBackoffice(auth.roles)) {
      requireAnyRole(auth.roles, BUILDER_ROLES);
    }

    const builderProfile = isBackoffice(auth.roles)
      ? await ctx.db
          .query("builderProfiles")
          .withIndex("by_brokerage", (q) =>
            q.eq("brokerageId", auth.brokerage._id),
          )
          .filter((q) => q.eq(q.field("status"), "active"))
          .first()
      : await getOwnedBuilderProfile(ctx, auth.brokerage._id, auth.subject);
    if (!builderProfile) {
      throw new Error("Forbidden: builder ownership");
    }

    const brokerMembers = await listAssignableBrokerMembers(
      ctx,
      auth.brokerage,
    );
    return {
      availableContractors: await listAvailableContractorOptions(
        ctx,
        auth.brokerage._id,
      ),
      brokerage: auth.brokerage,
      brokers: brokerMembers.options,
      builderProfile,
      defaultAssignedBrokerWorkosUserId:
        brokerMembers.defaultAssignedBrokerWorkosUserId,
      templates: await collectProposalTemplateDetails(ctx, auth.brokerage._id),
    };
  })
  .public();

export const getBrokerProposalCreateContext = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);

    const brokerMembers = await listAssignableBrokerMembers(
      ctx,
      auth.brokerage,
    );
    return {
      availableContractors: await listAvailableContractorOptions(
        ctx,
        auth.brokerage._id,
      ),
      brokerage: auth.brokerage,
      brokers: brokerMembers.options,
      defaultAssignedBrokerWorkosUserId:
        brokerMembers.defaultAssignedBrokerWorkosUserId,
      templates: await collectProposalTemplateDetails(ctx, auth.brokerage._id),
    };
  })
  .public();

type BuilderOnboardingRecoveryKind =
  | "ambiguous-builder-profile"
  | "missing-broker-assignment"
  | "missing-brokerage"
  | "missing-builder-profile"
  | "missing-membership"
  | "missing-organization"
  | "projection-failed"
  | "projection-pending";

function builderOnboardingRecovery(input: {
  email?: string;
  invitationStatus: "active" | "deleted" | "inactive" | "missing" | "pending";
  kind: BuilderOnboardingRecoveryKind;
  organizationId: string;
  organizationName?: string;
  projectionStatus: "failed" | "missing" | "pending" | "ready";
  responsibleOwner: string;
  subject: string;
}) {
  let hash = 0;
  for (const character of `${input.kind}|${input.organizationId}|${input.subject}`) {
    hash = (hash * 31 + character.charCodeAt(0)) % 2_147_483_647;
  }
  return {
    intendedDestination: "/builder" as const,
    invitationStatus: input.invitationStatus,
    invitedEmail: input.email,
    kind: input.kind,
    organization: {
      id: input.organizationId,
      name: input.organizationName ?? "Current organization",
    },
    projectionStatus: input.projectionStatus,
    requiredRole: "Builder" as const,
    responsibleOwner: input.responsibleOwner,
    supportReference: `BLDR-${hash.toString(36).toUpperCase().padStart(7, "0")}`,
  };
}

export const getBuilderOnboardingState = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(
    v.object({
      builderProfile: v.union(
        v.object({
          _id: v.id("builderProfiles"),
          displayName: v.string(),
        }),
        v.null(),
      ),
      complete: v.boolean(),
      dismissed: v.boolean(),
      hasProfile: v.boolean(),
      hasProposals: v.boolean(),
      isBuilder: v.boolean(),
      proposalCount: v.number(),
      recovery: builderOnboardingRecoveryValidator,
    }),
  )
  .handler(async (ctx, args) => {
    const roles = normalizeRoleSlugs(ctx.viewer.roles);
    const subject = ctx.viewer.subject;
    const isBuilder =
      roles.includes("builder") || roles.includes("builder-staff");
    const [dismissal, membership, organization, brokerage] = await Promise.all([
      ctx.db
        .query("builderOnboardingDismissals")
        .withIndex("by_user_org", (q) =>
          q
            .eq("workosUserId", subject)
            .eq("organizationId", args.workosOrganizationId),
        )
        .unique(),
      ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_user", (q) => q.eq("workosUserId", subject))
        .filter((q) =>
          q.eq(q.field("workosOrganizationId"), args.workosOrganizationId),
        )
        .first(),
      ctx.db
        .query("workosOrganizations")
        .withIndex("by_workos_organization_id", (q) =>
          q.eq("workosOrganizationId", args.workosOrganizationId),
        )
        .unique(),
      ctx.db
        .query("brokerages")
        .withIndex("by_workos_organization", (q) =>
          q.eq("workosOrganizationId", args.workosOrganizationId),
        )
        .unique(),
    ]);
    const organizationName = organization?.name ?? brokerage?.displayName;
    const recoveryState = (
      kind: BuilderOnboardingRecoveryKind,
      input: {
        hasProfile?: boolean;
        invitationStatus?:
          | "active"
          | "deleted"
          | "inactive"
          | "missing"
          | "pending";
        projectionStatus: "failed" | "missing" | "pending" | "ready";
        responsibleOwner: string;
      },
    ) => ({
      builderProfile: null,
      complete: false,
      dismissed: Boolean(dismissal),
      hasProfile: input.hasProfile ?? false,
      hasProposals: false,
      isBuilder: true,
      proposalCount: 0,
      recovery: builderOnboardingRecovery({
        email: ctx.viewer.email,
        invitationStatus:
          input.invitationStatus ?? membership?.status ?? "missing",
        kind,
        organizationId: args.workosOrganizationId,
        organizationName,
        projectionStatus: input.projectionStatus,
        responsibleOwner: input.responsibleOwner,
        subject,
      }),
    });

    if (!isBuilder) {
      return {
        builderProfile: null,
        complete: true,
        dismissed: Boolean(dismissal),
        hasProfile: false,
        hasProposals: false,
        isBuilder: false,
        proposalCount: 0,
        recovery: undefined,
      };
    }
    if (!organization || organization.status !== "active") {
      return recoveryState("missing-organization", {
        projectionStatus: "missing",
        responsibleOwner: "Platform Admin",
      });
    }
    if (!membership) {
      return recoveryState("missing-membership", {
        projectionStatus: "missing",
        responsibleOwner: "Organization Admin or invitation sender",
      });
    }
    if (membership.status === "pending") {
      return recoveryState("projection-pending", {
        invitationStatus: "pending",
        projectionStatus: "pending",
        responsibleOwner: "Organization Admin or invitation sender",
      });
    }
    if (membership.status !== "active") {
      return recoveryState("projection-failed", {
        invitationStatus: membership.status,
        projectionStatus: "failed",
        responsibleOwner: "Platform Admin",
      });
    }
    if (!brokerage || brokerage.status !== "active") {
      return recoveryState("missing-brokerage", {
        invitationStatus: "active",
        projectionStatus: "failed",
        responsibleOwner: "Platform Admin",
      });
    }

    const ownedBuilderProfiles = await getOwnedBuilderProfiles(
      ctx,
      brokerage._id,
      subject,
    );
    const hasProfile = ownedBuilderProfiles.length > 0;
    if (!hasProfile) {
      return recoveryState("missing-builder-profile", {
        invitationStatus: "active",
        projectionStatus: "ready",
        responsibleOwner: "Principal Broker",
      });
    }
    if (ownedBuilderProfiles.length > 1) {
      return recoveryState("ambiguous-builder-profile", {
        hasProfile: true,
        invitationStatus: "active",
        projectionStatus: "failed",
        responsibleOwner: "Platform Admin",
      });
    }

    const builderProfile = ownedBuilderProfiles[0];
    const proposals = await ctx.db
      .query("buildProposals")
      .withIndex("by_builder", (q) =>
        q.eq("builderProfileId", builderProfile._id),
      )
      .collect();
    const proposalCount = proposals.length;
    const hasProposals = proposalCount > 0;
    return {
      builderProfile: {
        _id: builderProfile._id,
        displayName: builderProfile.displayName,
      },
      complete: hasProposals,
      dismissed: Boolean(dismissal),
      hasProfile: true,
      hasProposals,
      isBuilder: true,
      proposalCount,
      recovery: undefined,
    };
  })
  .public();

export const dismissBuilderOnboarding = authenticatedMutation
  .input({ workosOrganizationId: v.string() })
  .returns(v.object({ dismissed: v.literal(true) }))
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    const isBuilder =
      auth.roles.includes("builder") || auth.roles.includes("builder-staff");
    if (
      isBuilder &&
      !(await getActiveOrganizationMembership(
        ctx,
        auth.subject,
        args.workosOrganizationId,
      ))
    ) {
      throw new Error("Forbidden: WorkOS membership");
    }

    const existing = await ctx.db
      .query("builderOnboardingDismissals")
      .withIndex("by_user_org", (q) =>
        q
          .eq("workosUserId", auth.subject)
          .eq("organizationId", args.workosOrganizationId),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("builderOnboardingDismissals", {
        dismissedAt: Date.now(),
        organizationId: args.workosOrganizationId,
        workosUserId: auth.subject,
      });
    }
    return { dismissed: true as const };
  })
  .public();

export const createDraftProposalClaimLink = authenticatedMutation
  .input({
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      claimPath: v.string(),
      claimToken: v.string(),
      expiresAt: v.number(),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    if (auth.proposal.status !== "draft") {
      throw new Error("Only draft proposals can receive builder claim links.");
    }
    if (auth.proposal.builderProfileId) {
      throw new Error("Proposal is already assigned to a builder.");
    }

    const now = Date.now();
    const activeLinks = await ctx.db
      .query("proposalClaimLinks")
      .withIndex("by_proposal_status", (q) =>
        q.eq("proposalId", args.proposalId).eq("status", "active"),
      )
      .collect();
    for (const link of activeLinks) {
      await ctx.db.patch(link._id, {
        status: "revoked",
        updatedAt: now,
      });
    }

    const claimToken = generateShareToken();
    const expiresAt = now + 1000 * 60 * 60 * 24 * 30;
    await ctx.db.insert("proposalClaimLinks", {
      brokerageId: auth.brokerage._id,
      createdAt: now,
      createdByWorkosUserId: auth.subject,
      expiresAt,
      organizationId: args.workosOrganizationId,
      proposalId: args.proposalId,
      shareTokenHash: await shareTokenHash(claimToken),
      status: "active",
      updatedAt: now,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "createDraftProposalClaimLink",
      eventType: "proposal.claim_link_created",
      newState: JSON.stringify({ expiresAt }),
      proposalId: args.proposalId,
    });

    return {
      claimPath: `/proposal-claim/${claimToken}`,
      claimToken,
      expiresAt,
    };
  })
  .public();

export const getProposalClaimPreview = publicQuery
  .input({ claimToken: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const link = await getProposalClaimLinkByToken(ctx, args.claimToken);
    if (!link) {
      return null;
    }
    const proposal = await ctx.db.get(link.proposalId);
    const brokerage = await ctx.db.get(link.brokerageId);
    if (!(proposal && brokerage)) {
      return null;
    }

    const now = Date.now();
    const expired = Boolean(link.expiresAt && link.expiresAt < now);
    const milestones = await collectByIndex(
      ctx,
      "proposalMilestones",
      "by_proposal",
      proposal._id,
    );
    const draws = await collectByIndex(
      ctx,
      "proposalDrawScheduleRows",
      "by_proposal",
      proposal._id,
    );

    return {
      brokerage: {
        displayName: brokerage.displayName,
        legalName: brokerage.legalName,
        workosOrganizationId: brokerage.workosOrganizationId,
      },
      claimStatus: expired ? "expired" : link.status,
      createdAt: link.createdAt,
      drawCount: draws.length,
      expiresAt: link.expiresAt ?? null,
      milestoneCount: milestones.length,
      proposal: {
        borrowerCoPayBps: proposal.borrowerCoPayBps,
        borrowerStartingCashCents: resolveBorrowerStartingCashCents(proposal),
        buildName: proposal.buildName,
        lenderDrawPolicyLimitCents: proposal.lenderDrawPolicyLimitCents,
        location: proposal.location,
        status: proposal.status,
        totalBudgetCents: proposal.totalBudgetCents,
      },
      workosOrganizationId: link.organizationId,
    };
  })
  .public();

const claimDraftProposalLinkReturn = v.object({
  builderProfileId: v.id("builderProfiles"),
  proposalId: v.id("buildProposals"),
  workosMembershipId: v.union(v.string(), v.null()),
});

export const claimDraftProposalLink = authenticatedAction
  .input({
    claimToken: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(claimDraftProposalLinkReturn)
  .handler(async (ctx, args) => {
    const preview: {
      claimStatus: string;
      workosOrganizationId: string;
    } | null = await ctx.runQuery(
      api.production_proposals.getProposalClaimPreview,
      { claimToken: args.claimToken },
    );
    if (
      !preview ||
      preview.workosOrganizationId !== args.workosOrganizationId ||
      preview.claimStatus !== "active"
    ) {
      throw new Error("Proposal claim link was not found.");
    }

    const membership: { workosId?: string } = await ctx.runAction(
      internal.workosManagement.createClaimMembershipForUser,
      {
        organizationId: args.workosOrganizationId,
        primaryRoleSlug: "builder",
        roleSlugs: ["builder"],
        userId: ctx.viewer.subject,
      },
    );

    const claimed: {
      builderProfileId: Id<"builderProfiles">;
      proposalId: Id<"buildProposals">;
    } = await ctx.runMutation(
      internal.production_proposals.finalizeDraftProposalClaimLink,
      {
        claimToken: args.claimToken,
        claimantEmail: ctx.viewer.email,
        claimantRoles: ctx.viewer.roles,
        claimantWorkosUserId: ctx.viewer.subject,
        workosOrganizationId: args.workosOrganizationId,
      },
    );

    return {
      ...claimed,
      workosMembershipId: membership.workosId ?? null,
    };
  })
  .public();

export const finalizeDraftProposalClaimLink = internalMutation
  .input({
    claimToken: v.string(),
    claimantEmail: v.optional(v.string()),
    claimantRoles: v.array(v.string()),
    claimantWorkosUserId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      builderProfileId: v.id("builderProfiles"),
      proposalId: v.id("buildProposals"),
    }),
  )
  .handler(async (ctx, args) => {
    const link = await getProposalClaimLinkByToken(ctx, args.claimToken);
    if (!link || link.organizationId !== args.workosOrganizationId) {
      throw new Error("Proposal claim link was not found.");
    }
    if (link.status !== "active") {
      throw new Error("Proposal claim link is no longer active.");
    }
    if (link.expiresAt && link.expiresAt < Date.now()) {
      throw new Error("Proposal claim link has expired.");
    }

    const brokerage = await ctx.db.get(link.brokerageId);
    if (
      !brokerage ||
      brokerage.status !== "active" ||
      brokerage.workosOrganizationId !== link.organizationId
    ) {
      throw new Error("Proposal claim link was not found.");
    }
    const auth = {
      brokerage,
      roles: claimRoles(args.claimantRoles),
      subject: args.claimantWorkosUserId,
    };
    if (!canClaimDraftProposal(auth.roles)) {
      throw new Error("Sign in with a builder account to claim this proposal.");
    }

    const proposal = await ctx.db.get(link.proposalId);
    if (!proposal || proposal.brokerageId !== auth.brokerage._id) {
      throw new Error("Proposal claim link was not found.");
    }
    if (proposal.status !== "draft") {
      throw new Error("Only draft proposals can be claimed.");
    }
    if (proposal.builderProfileId) {
      throw new Error("Proposal is already assigned to a builder.");
    }

    const now = Date.now();
    const builderProfile = await getOrCreateClaimantBuilderProfile(ctx, {
      auth,
      claimantEmail: args.claimantEmail,
      now,
      proposal,
      workosOrganizationId: args.workosOrganizationId,
    });
    await ctx.db.patch(proposal._id, {
      builderProfileId: builderProfile._id,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await ctx.db.patch(link._id, {
      claimedAt: now,
      claimedBuilderProfileId: builderProfile._id,
      claimedByWorkosUserId: auth.subject,
      status: "claimed",
      updatedAt: now,
    });
    await upsertKanbanCard(ctx, proposal._id, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "claimDraftProposalLink",
      eventType: "proposal.builder_claimed",
      newState: JSON.stringify({ builderProfileId: builderProfile._id }),
      priorState: JSON.stringify({ assignment: "unassigned" }),
      proposalId: proposal._id,
    });

    return {
      builderProfileId: builderProfile._id,
      proposalId: proposal._id,
    };
  })
  .internal();
