import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  authenticatedMutation,
  authenticatedQuery,
  backofficeMutation,
  backofficeQuery,
} from "../authz";
import {
  createCanonicalContractorProfile,
  patchCanonicalContractorProfile,
} from "../contractor_profile_application";
import { normalizeContractorEmail } from "../contractorWorkspace";
import type { Doc, Id, QueryCtx } from "../types";

import {
  assertOnboardingTransition,
  ONBOARDING_SUBMITTABLE_STATES,
  requireBackofficeRole,
  resolveBrokerageScopeOrThrow,
  writeContractorIdentityEvent,
} from "./access";
export const getContractorOnboardingBridge = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    const existingReview = await ctx.db
      .query("contractorOnboardingReviews")
      .withIndex("by_applicant", (q) =>
        q.eq("applicantWorkosUserId", scope.subject)
      )
      .first();

    // If a canonical profile is already linked, the workspace is unlocked and
    // the bridge reports active (PRD §7.1 step 11).
    const linkedProfile = await ctx.db
      .query("contractorProfiles")
      .withIndex("by_account_user", (q) =>
        q.eq("accountWorkosUserId", scope.subject)
      )
      .first();

    return {
      organizationId: args.workosOrganizationId,
      applicantWorkosUserId: scope.subject,
      roles: scope.roles,
      hasContractorRole: scope.roles.includes("contractor"),
      onboardingReview: existingReview
        ? redactOnboardingReview(existingReview)
        : null,
      linkedProfileId: linkedProfile?._id ?? null,
      workspaceUnlocked:
        scope.roles.includes("contractor") && Boolean(linkedProfile),
    };
  })
  .public();

/**
 * Save (or create) the onboarding draft. Reachable by a member, so the user can
 * complete profile details later (PRD §7.1.2, user story 2). Creates a
 * self_service contractor profile on first draft if none exists for the
 * normalized email (PRD §7.1 step 6).
 */
export const saveContractorOnboardingDraft = authenticatedMutation
  .input({
    workosOrganizationId: v.string(),
    draftFields: v.any(),
    note: v.optional(v.string()),
  })
  .returns(v.id("contractorOnboardingReviews"))
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    const applicantEmail = (args.draftFields as { email?: string })?.email;
    const normalizedEmail = normalizeContractorEmail(applicantEmail);
    const existing = await ctx.db
      .query("contractorOnboardingReviews")
      .withIndex("by_applicant", (q) =>
        q.eq("applicantWorkosUserId", scope.subject)
      )
      .first();

    const now = Date.now();

    if (existing) {
      // Drafts can be edited from draft or changes_requested only (PRD §14.1).
      if (!ONBOARDING_SUBMITTABLE_STATES.has(existing.status)) {
        throw new Error(
          `Onboarding draft is not editable in status ${existing.status}`
        );
      }
      await ctx.db.patch(existing._id, {
        applicantNormalizedEmail: normalizedEmail || undefined,
        draftFields: args.draftFields,
        submissionNote: args.note ?? existing.submissionNote,
        updatedAt: now,
      });
      return existing._id;
    }

    // First draft: match by normalized verified email only (PRD §7.1 step 4).
    // Multiple email matches route to backoffice review — never guess (PRD
    // §6.2, §7.1 step 7).
    let contractorId: Id<"contractorProfiles"> | null = null;
    if (normalizedEmail) {
      const matches = await ctx.db
        .query("contractorProfiles")
        .withIndex("by_brokerage_normalized_email", (q) =>
          q
            .eq("brokerageId", scope.brokerage._id)
            .eq("normalizedEmail", normalizedEmail)
        )
        .filter((q) => q.eq(q.field("status"), "active"))
        .collect();
      if (matches.length === 1) {
        contractorId = matches[0]._id;
      }
      // matches.length > 1 → leave contractorId null; backoffice review
      // resolves the ambiguity (PRD §7.1 step 7).
    }

    if (!contractorId) {
      // No exact match → create a pending self_service profile (PRD §7.1.6).
      const draftKind = (args.draftFields as { kind?: string })?.kind;
      contractorId = await createCanonicalContractorProfile(ctx, {
        brokerageId: scope.brokerage._id,
        fields: {
          accountWorkosUserId: undefined,
          email: applicantEmail?.trim() || undefined,
          kind:
            draftKind === "individual" || draftKind === "crew"
              ? draftKind
              : "company",
          name:
            (args.draftFields as { name?: string })?.name ??
            "Self-service applicant",
          normalizedEmail: normalizedEmail || undefined,
          onboardingStatus: "profile_only",
          source: "self_service",
          status: "active",
          trades: (args.draftFields as { trades?: string[] })?.trades ?? [],
        },
        now,
        organizationId: args.workosOrganizationId,
      });
    }

    const reviewId = await ctx.db.insert("contractorOnboardingReviews", {
      applicantNormalizedEmail: normalizedEmail || undefined,
      applicantWorkosUserId: scope.subject,
      brokerageId: scope.brokerage._id,
      contractorId,
      draftFields: args.draftFields,
      organizationId: args.workosOrganizationId,
      status: "draft",
      submissionNote: args.note,
      createdAt: now,
      updatedAt: now,
    });

    await writeContractorIdentityEvent(ctx, {
      actorRoles: scope.roles,
      actorSubject: scope.subject,
      brokerageId: scope.brokerage._id,
      command: "saveContractorOnboardingDraft",
      contractorId,
      eventType: "contractor.onboarding.draft_saved",
      newState: JSON.stringify({ reviewId }),
      organizationId: args.workosOrganizationId,
    });

    return reviewId;
  })
  .public();

/**
 * Submit the onboarding for backoffice review (PRD §7.1 step 8). Transitions
 * draft/changes_requested → pending_backoffice_review.
 */
export const submitContractorOnboarding = authenticatedMutation
  .input({
    workosOrganizationId: v.string(),
    note: v.optional(v.string()),
  })
  .returns(v.id("contractorOnboardingReviews"))
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    const existing = await ctx.db
      .query("contractorOnboardingReviews")
      .withIndex("by_applicant", (q) =>
        q.eq("applicantWorkosUserId", scope.subject)
      )
      .first();
    if (!existing) {
      throw new Error("No onboarding draft found to submit.");
    }
    assertOnboardingTransition(existing.status, "pending_backoffice_review");
    const now = Date.now();
    await ctx.db.patch(existing._id, {
      status: "pending_backoffice_review",
      submittedAt: now,
      submissionNote: args.note ?? existing.submissionNote,
      updatedAt: now,
    });
    await writeContractorIdentityEvent(ctx, {
      actorRoles: scope.roles,
      actorSubject: scope.subject,
      brokerageId: scope.brokerage._id,
      command: "submitContractorOnboarding",
      contractorId: existing.contractorId,
      entityType: "contractorOnboardingReview",
      eventType: "contractor.onboarding.submitted",
      newState: JSON.stringify({ reviewId: existing._id }),
      organizationId: args.workosOrganizationId,
    });
    return existing._id;
  })
  .public();

function redactOnboardingReview(review: Doc<"contractorOnboardingReviews">) {
  return {
    _id: review._id,
    status: review.status,
    applicantNormalizedEmail: review.applicantNormalizedEmail ?? null,
    lastOutcome: review.lastOutcome ?? null,
    reviewDecisionNote: review.reviewDecisionNote ?? null,
    submittedAt: review.submittedAt ?? null,
    reviewedAt: review.reviewedAt ?? null,
    contractorId: review.contractorId,
  };
}

// ---------------------------------------------------------------------------
// Backoffice onboarding review (PRD §7.2, §9)
// ---------------------------------------------------------------------------

/**
 * Backoffice review queue of self-service onboardings awaiting a decision
 * (PRD §9, §17.1). Returns rows in pending_backoffice_review + changes_requested.
 */
export const listContractorOnboardingReviews = backofficeQuery
  .input({
    workosOrganizationId: v.string(),
    includeResolved: v.optional(v.boolean()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    requireBackofficeRole(scope.roles);
    const reviews = await ctx.db
      .query("contractorOnboardingReviews")
      .withIndex("by_brokerage_status", (q) =>
        q.eq("brokerageId", scope.brokerage._id)
      )
      .collect();
    const filtered = reviews.filter((review) =>
      args.includeResolved
        ? true
        : review.status === "pending_backoffice_review" ||
          review.status === "changes_requested"
    );
    // Enrich with the profile identity fields (PRD §9 review must show).
    return Promise.all(
      filtered.map(async (review) => {
        const profile = await ctx.db.get(review.contractorId);
        return {
          _id: review._id,
          status: review.status,
          applicantWorkosUserId: review.applicantWorkosUserId,
          applicantNormalizedEmail: review.applicantNormalizedEmail ?? null,
          submittedAt: review.submittedAt ?? null,
          lastOutcome: review.lastOutcome ?? null,
          reviewDecisionNote: review.reviewDecisionNote ?? null,
          contractor: profile
            ? {
                _id: profile._id,
                name: profile.name,
                email: profile.email ?? null,
                source: profile.source ?? null,
                status: profile.status,
                trades: profile.trades,
              }
            : null,
        };
      })
    );
  })
  .public();

export const getContractorOnboardingReview = backofficeQuery
  .input({
    reviewId: v.id("contractorOnboardingReviews"),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    requireBackofficeRole(scope.roles);
    const review = await ctx.db.get(args.reviewId);
    if (!review || review.brokerageId !== scope.brokerage._id) {
      throw new Error("Onboarding review not found.");
    }
    const profile = await ctx.db.get(review.contractorId);
    const capabilities = await ctx.db
      .query("contractorCapabilities")
      .withIndex("by_contractor", (q) =>
        q.eq("contractorId", review.contractorId)
      )
      .collect();
    return {
      review: redactOnboardingReview(review),
      draftFields: review.draftFields ?? null,
      contractor: profile
        ? {
            _id: profile._id,
            name: profile.name,
            email: profile.email ?? null,
            normalizedEmail: profile.normalizedEmail ?? null,
            source: profile.source ?? null,
            status: profile.status,
            trades: profile.trades,
            city: profile.city ?? null,
            phone: profile.phone ?? null,
          }
        : null,
      capabilities: capabilities.map((c) => ({
        _id: c._id,
        capabilityKey: c.capabilityKey,
        label: c.label,
      })),
      // Duplicate warnings: other profiles sharing the normalized email or
      // fuzzy phone/name matches (PRD §9, §17.1 duplicate warnings).
      duplicateWarnings: await collectDuplicateWarnings(
        ctx,
        scope.brokerage._id,
        profile
      ),
    };
  })
  .public();

async function collectDuplicateWarnings(
  ctx: QueryCtx,
  brokerageId: Id<"brokerages">,
  profile: Doc<"contractorProfiles"> | null
) {
  if (!profile) {
    return [];
  }
  const warnings: Array<{
    kind: "email" | "phone" | "name";
    contractorId: Id<"contractorProfiles">;
    name: string;
  }> = [];
  const peers = await ctx.db
    .query("contractorProfiles")
    .withIndex("by_brokerage", (q) => q.eq("brokerageId", brokerageId))
    .filter((q) =>
      q.and(
        q.neq(q.field("_id"), profile._id),
        q.eq(q.field("status"), "active")
      )
    )
    .collect();
  for (const peer of peers) {
    if (
      profile.normalizedEmail &&
      peer.normalizedEmail === profile.normalizedEmail
    ) {
      warnings.push({
        contractorId: peer._id,
        kind: "email",
        name: peer.name,
      });
    } else if (profile.phone && peer.phone && peer.phone === profile.phone) {
      // Phone/name matches are hints only — never auto-merge (PRD §6.2).
      warnings.push({
        contractorId: peer._id,
        kind: "phone",
        name: peer.name,
      });
    } else if (
      peer.name.trim().toLowerCase() === profile.name.trim().toLowerCase()
    ) {
      warnings.push({
        contractorId: peer._id,
        kind: "name",
        name: peer.name,
      });
    }
  }
  return warnings;
}

/**
 * Approve a self-service onboarding and request WorkOS contractor role
 * promotion (PRD §7.2, user story 56). The only self-service path that
 * attempts role promotion. Promotion is fire-and-forget to the WorkOS adapter;
 * the webhook/session sync finalizes the role + profile link (PRD §7.1.11).
 */
export const approveContractorOnboarding = backofficeMutation
  .input({
    reviewId: v.id("contractorOnboardingReviews"),
    workosOrganizationId: v.string(),
    note: v.optional(v.string()),
    complianceOutcome: v.optional(
      v.union(
        v.literal("compliance_required"),
        v.literal("approved_missing_compliance"),
        v.literal("compliance_not_required")
      )
    ),
  })
  .returns(v.id("contractorOnboardingReviews"))
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    requireBackofficeRole(scope.roles);
    const review = await ctx.db.get(args.reviewId);
    if (!review || review.brokerageId !== scope.brokerage._id) {
      throw new Error("Onboarding review not found.");
    }
    assertOnboardingTransition(review.status, "approved_pending_workos");
    const now = Date.now();
    await ctx.db.patch(review._id, {
      status: "approved_pending_workos",
      lastOutcome: args.complianceOutcome ?? "approved",
      reviewDecisionNote: args.note,
      reviewerWorkosUserId: scope.subject,
      reviewedAt: now,
      updatedAt: now,
    });

    await writeContractorIdentityEvent(ctx, {
      actorRoles: scope.roles,
      actorSubject: scope.subject,
      brokerageId: scope.brokerage._id,
      command: "approveContractorOnboarding",
      contractorId: review.contractorId,
      entityType: "contractorOnboardingReview",
      eventType: "contractor.onboarding.approved",
      newState: JSON.stringify({
        complianceOutcome: args.complianceOutcome ?? "approved",
      }),
      organizationId: args.workosOrganizationId,
    });

    // Request WorkOS contractor role promotion. The profile is linked once the
    // role/session sync completes (PRD §7.1 step 10-11). Fire-and-forget; the
    // webhook projection owns the authoritative role state.
    await ctx.scheduler.runAfter(
      0,
      internal.workosManagement.createClaimMembershipForUser,
      {
        organizationId: args.workosOrganizationId,
        primaryRoleSlug: "contractor",
        roleSlugs: ["contractor"],
        userId: review.applicantWorkosUserId,
      }
    );

    return review._id;
  })
  .public();

export const rejectContractorOnboarding = backofficeMutation
  .input({
    reviewId: v.id("contractorOnboardingReviews"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorOnboardingReviews"))
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    requireBackofficeRole(scope.roles);
    const review = await ctx.db.get(args.reviewId);
    if (!review || review.brokerageId !== scope.brokerage._id) {
      throw new Error("Onboarding review not found.");
    }
    assertOnboardingTransition(review.status, "rejected");
    const now = Date.now();
    await ctx.db.patch(review._id, {
      status: "rejected",
      lastOutcome: "rejected",
      reviewDecisionNote: args.reason,
      reviewerWorkosUserId: scope.subject,
      reviewedAt: now,
      updatedAt: now,
    });
    await writeContractorIdentityEvent(ctx, {
      actorRoles: scope.roles,
      actorSubject: scope.subject,
      brokerageId: scope.brokerage._id,
      command: "rejectContractorOnboarding",
      contractorId: review.contractorId,
      entityType: "contractorOnboardingReview",
      eventType: "contractor.onboarding.rejected",
      newState: JSON.stringify({ reason: args.reason }),
      organizationId: args.workosOrganizationId,
    });
    return review._id;
  })
  .public();

export const requestContractorOnboardingChanges = backofficeMutation
  .input({
    reviewId: v.id("contractorOnboardingReviews"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorOnboardingReviews"))
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    requireBackofficeRole(scope.roles);
    const review = await ctx.db.get(args.reviewId);
    if (!review || review.brokerageId !== scope.brokerage._id) {
      throw new Error("Onboarding review not found.");
    }
    assertOnboardingTransition(review.status, "changes_requested");
    const now = Date.now();
    await ctx.db.patch(review._id, {
      status: "changes_requested",
      lastOutcome: "changes_requested",
      reviewDecisionNote: args.reason,
      reviewerWorkosUserId: scope.subject,
      reviewedAt: now,
      updatedAt: now,
    });
    await writeContractorIdentityEvent(ctx, {
      actorRoles: scope.roles,
      actorSubject: scope.subject,
      brokerageId: scope.brokerage._id,
      command: "requestContractorOnboardingChanges",
      contractorId: review.contractorId,
      entityType: "contractorOnboardingReview",
      eventType: "contractor.onboarding.changes_requested",
      newState: JSON.stringify({ reason: args.reason }),
      organizationId: args.workosOrganizationId,
    });
    return review._id;
  })
  .public();

/**
 * Finalize an approved onboarding once the WorkOS contractor role/session has
 * synced. Links the canonical profile to the WorkOS user and flips the review
 * to active (PRD §7.1.11). Called by the post-role-sync path or backoffice.
 */
export const finalizeContractorOnboardingRoleSync = backofficeMutation
  .input({
    applicantWorkosUserId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.boolean())
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    requireBackofficeRole(scope.roles);
    const review = await ctx.db
      .query("contractorOnboardingReviews")
      .withIndex("by_applicant", (q) =>
        q.eq("applicantWorkosUserId", args.applicantWorkosUserId)
      )
      .first();
    if (!review) {
      return false;
    }
    if (review.status !== "approved_pending_workos") {
      return false;
    }
    const contractor = await ctx.db.get(review.contractorId);
    if (!contractor || contractor.brokerageId !== scope.brokerage._id) {
      return false;
    }
    if (
      contractor.accountWorkosUserId &&
      contractor.accountWorkosUserId !== args.applicantWorkosUserId
    ) {
      return false;
    }
    const now = Date.now();
    await patchCanonicalContractorProfile(ctx, {
      brokerageId: scope.brokerage._id,
      contractorId: review.contractorId,
      now,
      organizationId: args.workosOrganizationId,
      patch: {
        accountWorkosUserId: args.applicantWorkosUserId,
        onboardingStatus: "account_linked",
      },
    });
    await ctx.db.patch(review._id, {
      status: "active",
      updatedAt: now,
    });
    await writeContractorIdentityEvent(ctx, {
      actorRoles: scope.roles,
      actorSubject: scope.subject,
      brokerageId: scope.brokerage._id,
      command: "finalizeContractorOnboardingRoleSync",
      contractorId: review.contractorId,
      eventType: "contractor.onboarding.active",
      newState: JSON.stringify({
        accountWorkosUserId: args.applicantWorkosUserId,
      }),
      organizationId: args.workosOrganizationId,
    });
    return true;
  })
  .public();

// ---------------------------------------------------------------------------
// Invited contractor claim (PRD §7.3, §14.2)
// ---------------------------------------------------------------------------
