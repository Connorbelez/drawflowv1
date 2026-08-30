import { v } from "convex/values";
import { authenticatedMutation, authenticatedQuery } from "../authz";
import { patchCanonicalContractorProfile } from "../contractor_profile_application";
import type { Doc, Id, QueryCtx } from "../types";

import {
  resolveBrokerageScopeOrThrow,
  writeContractorIdentityEvent,
} from "./access";
export const getContractorClaimForConfirmation = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    // A claim awaiting confirmation: the invitee accepted the WorkOS invitation
    // (they're now a member) and a claim intent exists for their email.
    const claim = await resolvePendingClaimForUser(
      ctx,
      scope.brokerage._id,
      scope.subject
    );
    if (!claim) {
      return { claim: null };
    }
    const contractor = await ctx.db.get(claim.contractorId);
    return {
      claim: {
        _id: claim._id,
        state: claim.state,
        invitedNormalizedEmail: claim.invitedNormalizedEmail ?? null,
        expiresAt: claim.expiresAt ?? null,
      },
      contractor: contractor
        ? {
            _id: contractor._id,
            name: contractor.name,
            email: contractor.email ?? null,
            trades: contractor.trades,
            city: contractor.city ?? null,
          }
        : null,
    };
  })
  .public();

async function resolvePendingClaimForUser(
  ctx: QueryCtx,
  brokerageId: Id<"brokerages">,
  applicantSubject: string
): Promise<Doc<"contractorInviteClaims"> | null> {
  const byAccepter = await ctx.db
    .query("contractorInviteClaims")
    .withIndex("by_accepted_user", (q) =>
      q.eq("acceptedWorkosUserId", applicantSubject)
    )
    .filter((q) =>
      q.and(
        q.eq(q.field("state"), "accepted_pending_confirmation"),
        q.eq(q.field("brokerageId"), brokerageId)
      )
    )
    .first();
  return byAccepter ?? null;
}

/**
 * Confirm "this is my contractor profile" and link the canonical profile
 * (PRD §7.3.7-8). Invited known contractors bypass backoffice review. Single-use
 * after successful claim (PRD §7.3).
 */
export const confirmContractorProfileClaim = authenticatedMutation
  .input({ workosOrganizationId: v.string() })
  .returns(v.object({ contractorId: v.id("contractorProfiles") }))
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    const claim = await resolvePendingClaimForUser(
      ctx,
      scope.brokerage._id,
      scope.subject
    );
    if (!claim) {
      throw new Error("No pending contractor claim found to confirm.");
    }
    if (claim.state === "revoked") {
      throw new Error("This invite has been revoked.");
    }
    if (claim.expiresAt && claim.expiresAt < Date.now()) {
      await ctx.db.patch(claim._id, { state: "expired" });
      throw new Error("This invite has expired.");
    }
    const now = Date.now();
    await patchCanonicalContractorProfile(ctx, {
      brokerageId: scope.brokerage._id,
      contractorId: claim.contractorId,
      now,
      organizationId: args.workosOrganizationId,
      patch: {
        accountWorkosUserId: scope.subject,
        onboardingStatus: "account_linked",
      },
    });
    await ctx.db.patch(claim._id, {
      acceptedWorkosUserId: scope.subject,
      confirmedAt: now,
      state: "claimed",
      updatedAt: now,
    });
    await writeContractorIdentityEvent(ctx, {
      actorRoles: scope.roles,
      actorSubject: scope.subject,
      brokerageId: scope.brokerage._id,
      command: "confirmContractorProfileClaim",
      contractorId: claim.contractorId,
      entityType: "contractorInviteClaim",
      eventType: "contractor.invite.claimed",
      newState: JSON.stringify({
        acceptedWorkosUserId: scope.subject,
      }),
      organizationId: args.workosOrganizationId,
    });
    return { contractorId: claim.contractorId };
  })
  .public();

/**
 * Reject an incorrect email match so a stale/mistyped profile does not get
 * linked (PRD user story 12, §7.3). The member chooses to NOT claim.
 */
export const rejectContractorProfileMatch = authenticatedMutation
  .input({
    workosOrganizationId: v.string(),
    reason: v.optional(v.string()),
  })
  .returns(v.boolean())
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    const claim = await resolvePendingClaimForUser(
      ctx,
      scope.brokerage._id,
      scope.subject
    );
    if (!claim) {
      return false;
    }
    const now = Date.now();
    await ctx.db.patch(claim._id, {
      revokeReason: args.reason ?? "Rejected by invitee during claim",
      revokedByWorkosUserId: scope.subject,
      revokedAt: now,
      state: "revoked",
      updatedAt: now,
    });
    await writeContractorIdentityEvent(ctx, {
      actorRoles: scope.roles,
      actorSubject: scope.subject,
      brokerageId: scope.brokerage._id,
      command: "rejectContractorProfileMatch",
      contractorId: claim.contractorId,
      entityType: "contractorInviteClaim",
      eventType: "contractor.invite.match_rejected",
      newState: JSON.stringify({ reason: args.reason }),
      organizationId: args.workosOrganizationId,
    });
    return true;
  })
  .public();
