import { v } from "convex/values";

import {
  type AuthorizedViewer,
  type RoleSlug,
  authenticatedMutation,
  authenticatedQuery,
  backofficeMutation,
  backofficeQuery,
  normalizeRoleSlugs,
} from "../authz";
import { normalizeContractorEmail } from "../contractorWorkspace";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "../fairLendConfig";
import { internal } from "../_generated/api";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

import {
  BACKOFFICE_ROLES,
  BUILDER_ROLES,
  resolveBrokerageScopeOrThrow,
  requireBackofficeRole,
  writeContractorIdentityEvent,
} from "./access";
export async function createContractorProfileInviteClaim(
  ctx: MutationCtx,
  input: {
    actorRoles: readonly RoleSlug[];
    actorSubject: string;
    brokerageId: Id<"brokerages">;
    contractor: Doc<"contractorProfiles">;
    expiresInDays?: number;
    workosOrganizationId: string;
  }
): Promise<Id<"contractorInviteClaims">> {
  const normalizedEmail = normalizeContractorEmail(input.contractor.email);
  if (!normalizedEmail) {
    throw new Error(
      "Contractor profile has no email; cannot send an invitation."
    );
  }

  const now = Date.now();
  const priorLive = await ctx.db
    .query("contractorInviteClaims")
    .withIndex("by_contractor_state", (q) =>
      q.eq("contractorId", input.contractor._id).eq("state", "invited")
    )
    .collect();
  for (const prior of priorLive) {
    await ctx.db.patch(prior._id, {
      revokedAt: now,
      revokedByWorkosUserId: input.actorSubject,
      state: "revoked",
      updatedAt: now,
    });
  }

  const expiresAt =
    input.expiresInDays === undefined
      ? undefined
      : now + Math.max(1, input.expiresInDays) * 86_400_000;
  const claimId = await ctx.db.insert("contractorInviteClaims", {
    brokerageId: input.brokerageId,
    contractorId: input.contractor._id,
    expiresAt,
    invitedNormalizedEmail: normalizedEmail,
    inviterWorkosUserId: input.actorSubject,
    organizationId: input.workosOrganizationId,
    state: "invited",
    createdAt: now,
    updatedAt: now,
  });

  if (!input.contractor.accountWorkosUserId) {
    await ctx.db.patch(input.contractor._id, {
      onboardingStatus: "invited",
      updatedAt: now,
    });
  }
  await ctx.scheduler.runAfter(
    0,
    internal.workosManagement.inviteContractorUser,
    {
      email: normalizedEmail,
      organizationId: input.workosOrganizationId,
    }
  );
  await writeContractorIdentityEvent(ctx, {
    actorRoles: input.actorRoles,
    actorSubject: input.actorSubject,
    brokerageId: input.brokerageId,
    command: "sendContractorProfileInvite",
    contractorId: input.contractor._id,
    entityType: "contractorInviteClaim",
    eventType: "contractor.invite.sent",
    newState: JSON.stringify({ claimId, normalizedEmail }),
    organizationId: input.workosOrganizationId,
  });

  return claimId;
}

/**
 * Send a WorkOS organization invitation with the `contractor` role and create
 * the app-level claim intent (PRD §7.3, §7.5, §11.3). Backoffice can invite any
 * contractor profile in the brokerage; builder/builder-staff can invite only
 * profiles attached to their own proposals/builds (PRD §11.3).
 */
export const sendContractorProfileInvite = authenticatedMutation
  .input({
    contractorId: v.id("contractorProfiles"),
    workosOrganizationId: v.string(),
    expiresInDays: v.optional(v.number()),
  })
  .returns(v.id("contractorInviteClaims"))
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    const contractor = await ctx.db.get(args.contractorId);
    if (!contractor || contractor.brokerageId !== scope.brokerage._id) {
      throw new Error("Contractor profile not found in brokerage.");
    }
    const isBackoffice = scope.roles.some((role) =>
      BACKOFFICE_ROLES.includes(role)
    );
    const isBuilderSide = scope.roles.some((role) =>
      BUILDER_ROLES.includes(role)
    );
    if (!(isBackoffice || isBuilderSide)) {
      throw new Error("Forbidden: invite permission");
    }
    // Builder-side can only invite profiles attached to their own
    // proposals/builds (PRD §11.3, user story 48).
    if (!isBackoffice && isBuilderSide) {
      await assertContractorAttachedToBuilderScope(
        ctx,
        args.contractorId,
        scope.subject,
        args.workosOrganizationId
      );
    }

    return await createContractorProfileInviteClaim(ctx, {
      actorRoles: scope.roles,
      actorSubject: scope.subject,
      brokerageId: scope.brokerage._id,
      contractor,
      expiresInDays: args.expiresInDays,
      workosOrganizationId: args.workosOrganizationId,
    });
  })
  .public();

async function assertContractorAttachedToBuilderScope(
  ctx: QueryCtx,
  contractorId: Id<"contractorProfiles">,
  inviterSubject: string,
  workosOrganizationId: string
) {
  // Builder/staff can invite a contractor only if that contractor is already
  // attached to one of the inviter's proposals/builds (PRD §11.3, user story
  // 48, 51). Resolve the inviter's active builder profiles, then require at
  // least one active contractor assignment whose parent proposal/build belongs
  // to one of those builder profiles.
  const builderLinks = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_user", (q) => q.eq("workosUserId", inviterSubject))
    .collect();
  const activeBuilderProfileIds = new Set<Id<"builderProfiles">>();
  for (const link of builderLinks) {
    if (link.status !== "active") {
      continue;
    }
    const builderProfile = await ctx.db.get(link.builderProfileId);
    if (
      builderProfile &&
      builderProfile.status === "active" &&
      builderProfile.organizationId === workosOrganizationId
    ) {
      activeBuilderProfileIds.add(builderProfile._id);
    }
  }

  if (activeBuilderProfileIds.size === 0) {
    throw new Error(
      "Forbidden: contractor is not attached to any of your proposals/builds"
    );
  }

  const proposalAttachments = await ctx.db
    .query("proposalContractorAssignments")
    .withIndex("by_contractor", (q) => q.eq("contractorId", contractorId))
    .collect();
  for (const attachment of proposalAttachments) {
    if (attachment.status !== "active") {
      continue;
    }
    const proposal = await ctx.db.get(attachment.proposalId);
    if (
      proposal?.builderProfileId &&
      activeBuilderProfileIds.has(proposal.builderProfileId)
    ) {
      return;
    }
  }

  for (const builderProfileId of activeBuilderProfileIds) {
    const proposals = await ctx.db
      .query("buildProposals")
      .withIndex("by_builder", (q) =>
        q.eq("builderProfileId", builderProfileId)
      )
      .collect();
    for (const proposal of proposals) {
      if (!proposal.activeBuildId) {
        continue;
      }
      const attachment = await ctx.db
        .query("buildContractorAssignments")
        .withIndex("by_build_contractor", (q) =>
          q
            .eq("buildId", proposal.activeBuildId!)
            .eq("contractorId", contractorId)
        )
        .unique();
      if (attachment && attachment.status !== "inactive") {
        return;
      }
    }
  }

  const proposalAssignments = await ctx.db
    .query("proposalMilestoneContractorAssignments")
    .withIndex("by_contractor", (q) => q.eq("contractorId", contractorId))
    .collect();
  for (const assignment of proposalAssignments) {
    if (assignment.status === "removed") {
      continue;
    }
    const proposal = await ctx.db.get(assignment.proposalId);
    if (
      proposal?.builderProfileId &&
      activeBuilderProfileIds.has(proposal.builderProfileId)
    ) {
      return;
    }
  }

  const buildAssignments = await ctx.db
    .query("milestoneContractorAssignments")
    .withIndex("by_contractor", (q) => q.eq("contractorId", contractorId))
    .collect();
  for (const assignment of buildAssignments) {
    if (assignment.status === "removed") {
      continue;
    }
    const build = await ctx.db.get(assignment.buildId);
    if (build && activeBuilderProfileIds.has(build.builderProfileId)) {
      return;
    }
  }

  throw new Error(
    "Forbidden: contractor is not attached to any of your proposals/builds"
  );
}

export const resendContractorProfileInvite = backofficeMutation
  .input({
    claimId: v.id("contractorInviteClaims"),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorInviteClaims"))
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    requireBackofficeRole(scope.roles);
    const claim = await ctx.db.get(args.claimId);
    if (!claim || claim.brokerageId !== scope.brokerage._id) {
      throw new Error("Invite claim not found.");
    }
    if (claim.state === "claimed") {
      throw new Error(`Cannot resend invite in state ${claim.state}`);
    }
    // Resend re-activates invited/expired/revoked claims so stale invitations
    // can be controlled without creating duplicate intent rows (PRD user story
    // 67). `claimed` is terminal and cannot be resent.
    const now = Date.now();
    await ctx.db.patch(claim._id, {
      state: "invited",
      revokedAt: undefined,
      revokedByWorkosUserId: undefined,
      revokeReason: undefined,
      updatedAt: now,
    });
    const email = claim.invitedNormalizedEmail;
    if (email) {
      await ctx.scheduler.runAfter(
        0,
        internal.workosManagement.inviteContractorUser,
        {
          email,
          organizationId: args.workosOrganizationId,
        }
      );
    }
    await writeContractorIdentityEvent(ctx, {
      actorRoles: scope.roles,
      actorSubject: scope.subject,
      brokerageId: scope.brokerage._id,
      command: "resendContractorProfileInvite",
      contractorId: claim.contractorId,
      entityType: "contractorInviteClaim",
      eventType: "contractor.invite.resent",
      newState: JSON.stringify({ claimId: claim._id }),
      organizationId: args.workosOrganizationId,
    });
    return claim._id;
  })
  .public();

export const revokeContractorProfileInvite = backofficeMutation
  .input({
    claimId: v.id("contractorInviteClaims"),
    reason: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorInviteClaims"))
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    requireBackofficeRole(scope.roles);
    const claim = await ctx.db.get(args.claimId);
    if (!claim || claim.brokerageId !== scope.brokerage._id) {
      throw new Error("Invite claim not found.");
    }
    if (claim.state === "claimed" || claim.state === "revoked") {
      throw new Error(`Cannot revoke invite in state ${claim.state}`);
    }
    const now = Date.now();
    await ctx.db.patch(claim._id, {
      revokedAt: now,
      revokedByWorkosUserId: scope.subject,
      revokeReason: args.reason,
      state: "revoked",
      updatedAt: now,
    });
    await writeContractorIdentityEvent(ctx, {
      actorRoles: scope.roles,
      actorSubject: scope.subject,
      brokerageId: scope.brokerage._id,
      command: "revokeContractorProfileInvite",
      contractorId: claim.contractorId,
      entityType: "contractorInviteClaim",
      eventType: "contractor.invite.revoked",
      newState: JSON.stringify({ reason: args.reason }),
      organizationId: args.workosOrganizationId,
    });
    return claim._id;
  })
  .public();

/**
 * The claim confirmation screen data (PRD §7.3.6-7). Reachable by an
 * authenticated member (the invitee, post-AuthKit-acceptance) so they can see
 * the profile they are about to claim before confirming.
 */
