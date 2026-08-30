import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { adminMutation, adminQuery } from "./authz";
import { normalizeOperationalIdempotencyKey } from "./build_operational_idempotency";
import {
  primaryActorRole,
  requireReason,
  writeLenderAudit,
} from "./lender_organizations/helpers";
import {
  DEFAULT_PROPOSAL_REVIEW_POLICY,
  proposalReviewPoliciesEqual,
  proposalReviewPolicySnapshotValidator,
  validateProposalReviewPolicyQuorums,
} from "./lender_portal_phase3";
import {
  getLenderOrganizationApprovalEligibility,
  resolveLenderOrganizationTarget,
} from "./lenderOrganizationAccess";
import type { MutationCtx, QueryCtx } from "./types";

const eligibleCountsValidator = v.object({
  draw: v.number(),
  milestone: v.number(),
  proposalReview: v.number(),
});

const effectiveDefaultValidator = v.object({
  configuredAt: v.union(v.number(), v.null()),
  configuredByDisplayName: v.union(v.string(), v.null()),
  configuredByRole: v.union(v.string(), v.null()),
  configuredByWorkosUserId: v.union(v.string(), v.null()),
  eligibleCounts: eligibleCountsValidator,
  lenderOrganizationId: v.id("lenderOrganizations"),
  lenderOrganizationName: v.string(),
  policy: proposalReviewPolicySnapshotValidator,
  policyVersionId: v.union(
    v.id("lenderOrganizationReviewPolicyVersions"),
    v.null()
  ),
  provenance: v.union(
    v.literal("organization_default"),
    v.literal("system_baseline")
  ),
  reason: v.union(v.string(), v.null()),
  validationIssue: v.union(v.string(), v.null()),
  version: v.union(v.number(), v.null()),
});

export async function getCurrentLenderOrganizationReviewPolicyVersion(
  ctx: QueryCtx | MutationCtx,
  lenderOrganizationId: Id<"lenderOrganizations">
) {
  const versions = await ctx.db
    .query("lenderOrganizationReviewPolicyVersions")
    .withIndex("by_lender_organization_and_version", (query) =>
      query.eq("lenderOrganizationId", lenderOrganizationId)
    )
    .order("desc")
    .take(1);
  return versions[0] ?? null;
}

export async function getEffectiveLenderOrganizationReviewPolicy(
  ctx: QueryCtx | MutationCtx,
  lenderOrganizationId: Id<"lenderOrganizations">
) {
  const { brokerage, organization } = await resolveLenderOrganizationTarget(
    ctx,
    lenderOrganizationId
  );
  const current = await getCurrentLenderOrganizationReviewPolicyVersion(
    ctx,
    lenderOrganizationId
  );
  if (current && current.brokerageId !== brokerage._id) {
    throw new Error(
      "Lender organization review default scope is inconsistent."
    );
  }
  return {
    brokerage,
    organization,
    policy: current?.policy ?? DEFAULT_PROPOSAL_REVIEW_POLICY,
    policyVersion: current,
    provenance: current
      ? ("organization_default" as const)
      : ("system_baseline" as const),
  };
}

export async function validateEffectiveLenderOrganizationReviewPolicy(
  ctx: QueryCtx | MutationCtx,
  lenderOrganizationId: Id<"lenderOrganizations">,
  policy: Doc<"lenderOrganizationReviewPolicyVersions">["policy"]
) {
  const eligibility = await getLenderOrganizationApprovalEligibility(
    ctx,
    lenderOrganizationId
  );
  validateProposalReviewPolicyQuorums(policy, eligibility.counts);
  return eligibility.counts;
}

async function resolveActorDisplayName(
  ctx: QueryCtx | MutationCtx,
  workosUserId: string | undefined
) {
  if (!workosUserId) {
    return null;
  }
  const rows = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (query) =>
      query.eq("workosUserId", workosUserId)
    )
    .take(2);
  if (rows.length !== 1) {
    return null;
  }
  const [user] = rows;
  return user?.name || user?.email || null;
}

async function projectEffectiveDefault(
  ctx: QueryCtx | MutationCtx,
  lenderOrganizationId: Id<"lenderOrganizations">
) {
  const effective = await getEffectiveLenderOrganizationReviewPolicy(
    ctx,
    lenderOrganizationId
  );
  const eligibleCounts = await getLenderOrganizationApprovalEligibility(
    ctx,
    lenderOrganizationId
  ).then((result) => result.counts);
  let validationIssue: string | null = null;
  try {
    validateProposalReviewPolicyQuorums(effective.policy, eligibleCounts);
  } catch (error) {
    validationIssue =
      error instanceof Error
        ? error.message
        : "The current default is not satisfiable by eligible lender members.";
  }
  return {
    configuredAt: effective.policyVersion?.configuredAt ?? null,
    configuredByDisplayName: await resolveActorDisplayName(
      ctx,
      effective.policyVersion?.configuredByWorkosUserId
    ),
    configuredByRole: effective.policyVersion?.configuredByRole ?? null,
    configuredByWorkosUserId:
      effective.policyVersion?.configuredByWorkosUserId ?? null,
    eligibleCounts,
    lenderOrganizationId,
    lenderOrganizationName: effective.organization.displayName,
    policy: effective.policy,
    policyVersionId: effective.policyVersion?._id ?? null,
    provenance: effective.provenance,
    reason: effective.policyVersion?.reason ?? null,
    validationIssue,
    version: effective.policyVersion?.version ?? null,
  };
}

export const getLenderOrganizationDefaultReviewPolicy = adminQuery
  .input({ lenderOrganizationId: v.id("lenderOrganizations") })
  .returns(effectiveDefaultValidator)
  .handler(async (ctx, args) =>
    projectEffectiveDefault(ctx, args.lenderOrganizationId)
  )
  .public();

export const saveLenderOrganizationDefaultReviewPolicy = adminMutation
  .input({
    expectedVersion: v.union(v.number(), v.null()),
    idempotencyKey: v.string(),
    lenderOrganizationId: v.id("lenderOrganizations"),
    policy: proposalReviewPolicySnapshotValidator,
    reason: v.string(),
  })
  .returns(effectiveDefaultValidator)
  .handler(async (ctx, args) => {
    if (
      args.expectedVersion !== null &&
      (!Number.isInteger(args.expectedVersion) || args.expectedVersion < 1)
    ) {
      throw new Error("Expected organization default version is invalid.");
    }
    const reason = requireReason(args.reason);
    const idempotencyKey = normalizeOperationalIdempotencyKey(
      args.idempotencyKey,
      "Organization review default idempotency key"
    );
    const { brokerage, organization } = await resolveLenderOrganizationTarget(
      ctx,
      args.lenderOrganizationId
    );
    const idempotent = await ctx.db
      .query("lenderOrganizationReviewPolicyVersions")
      .withIndex("by_lender_organization_and_idempotency_key", (query) =>
        query
          .eq("lenderOrganizationId", args.lenderOrganizationId)
          .eq("idempotencyKey", idempotencyKey)
      )
      .unique();
    if (idempotent) {
      if (
        idempotent.brokerageId !== brokerage._id ||
        idempotent.configuredByWorkosUserId !== ctx.viewer.subject ||
        idempotent.reason !== reason ||
        !proposalReviewPoliciesEqual(idempotent.policy, args.policy)
      ) {
        throw new Error(
          "Organization review default idempotency key was reused with different values."
        );
      }
      return await projectEffectiveDefault(ctx, args.lenderOrganizationId);
    }
    const current = await getCurrentLenderOrganizationReviewPolicyVersion(
      ctx,
      args.lenderOrganizationId
    );
    if ((current?.version ?? null) !== args.expectedVersion) {
      throw new Error(
        "Stale organization review default. Reload the current version and try again."
      );
    }
    if (current && proposalReviewPoliciesEqual(current.policy, args.policy)) {
      throw new Error(
        "The organization review default has no changes to save."
      );
    }
    const eligibleCounts =
      await validateEffectiveLenderOrganizationReviewPolicy(
        ctx,
        args.lenderOrganizationId,
        args.policy
      );
    const now = Date.now();
    const version = (current?.version ?? 0) + 1;
    const policyVersionId = await ctx.db.insert(
      "lenderOrganizationReviewPolicyVersions",
      {
        brokerageId: brokerage._id,
        configuredAt: now,
        configuredByRole: primaryActorRole(ctx.viewer.roles),
        configuredByWorkosUserId: ctx.viewer.subject,
        idempotencyKey,
        lenderOrganizationId: args.lenderOrganizationId,
        policy: args.policy,
        ...(current ? { previousVersionId: current._id } : {}),
        reason,
        version,
      }
    );
    await ctx.db.patch(organization._id, { updatedAt: now });
    await writeLenderAudit(ctx, brokerage, organization._id, {
      command: "saveLenderOrganizationDefaultReviewPolicy",
      entityId: String(policyVersionId),
      entityType: "lenderOrganizationReviewPolicyVersion",
      eventType: "lender.organization.review_policy_default.saved",
      newState: {
        eligibleCounts,
        policy: args.policy,
        policyVersionId,
        version,
      },
      ...(current
        ? {
            priorState: {
              policy: current.policy,
              policyVersionId: current._id,
              version: current.version,
            },
          }
        : { priorState: { provenance: "system_baseline" } }),
      reason,
    });
    return await projectEffectiveDefault(ctx, args.lenderOrganizationId);
  })
  .public();
