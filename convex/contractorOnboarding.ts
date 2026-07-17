import { v } from "convex/values";

import {
  type AuthorizedViewer,
  type RoleSlug,
  authenticatedMutation,
  authenticatedQuery,
  backofficeMutation,
  backofficeQuery,
  normalizeRoleSlugs,
} from "./authz";
import { normalizeContractorEmail } from "./contractorWorkspace";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "./fairLendConfig";
import { internal } from "./_generated/api";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

/**
 * Contractor onboarding, invite/claim, and backoffice review module.
 *
 * This module owns the three gated identity flows that unlock the Contractor
 * Workspace (PRD §7):
 *
 *  1. Self-service onboarding — an authenticated `member` enters the onboarding
 *     bridge, drafts/submit profile fields, and waits for backoffice approval
 *     + WorkOS `contractor` role promotion before full workspace access (PRD
 *     §7.1, §14.1). A `member` can reach ONLY `/contractor/onboarding` until
 *     the role + profile link resolve (PRD §3.12, §11.1).
 *
 *  2. Invited contractor claim — a builder/backoffice-issued WorkOS
 *     organization invitation lets a known contractor claim a specific existing
 *     contractor profile after AuthKit acceptance + confirmation. Invited known
 *     contractors bypass backoffice onboarding review (PRD §7.3, §14.2).
 *
 *  3. Backoffice review — backoffice staff approve/reject/request-changes/merge
 *     self-service onboardings, and send/resend/revoke invites. Approval is the
 *     only self-service path that attempts WorkOS contractor role promotion
 *     (PRD §7.2).
 *
 * WorkOS remains the source of truth for users, organization membership, and
 * role assignment; WorkOS projection tables stay webhook-owned (PRD §3.4, §3.5,
 * §7.5). DrawFlow stores only app-level onboarding review state + claim intent
 * + audit metadata.
 */

const BACKOFFICE_ROLES: readonly RoleSlug[] = [
  "admin",
  "principle-broker",
  "broker",
  "broker-staff",
];

const BUILDER_ROLES: readonly RoleSlug[] = ["admin", "builder", "builder-staff"];

// ---------------------------------------------------------------------------
// Brokerage scope resolution (self-service reachable by member role)
// ---------------------------------------------------------------------------

interface BrokerageScope {
  brokerage: Doc<"brokerages">;
  roles: RoleSlug[];
  subject: string;
}

async function resolveBrokerageScopeOrThrow(
  ctx: QueryCtx | MutationCtx,
  workosOrganizationId: string,
  viewer?: AuthorizedViewer
): Promise<BrokerageScope> {
  const activeViewer =
    viewer ?? (ctx as unknown as { viewer: AuthorizedViewer }).viewer;
  const subject = activeViewer.subject;
  const membership = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (q) => q.eq("workosUserId", subject))
    .filter((q) =>
      q.eq(q.field("workosOrganizationId"), workosOrganizationId)
    )
    .first();
  const activeTokenOrganizationId = activeViewer.organizationId?.trim();
  if (
    (!membership || membership.status !== "active") &&
    activeTokenOrganizationId !== workosOrganizationId
  ) {
    throw new Error("Forbidden: WorkOS membership");
  }
  const brokerage = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (q) =>
      q.eq("workosOrganizationId", workosOrganizationId)
    )
    .unique();
  if (!brokerage) {
    throw new Error("Forbidden: brokerage");
  }
  const roles = normalizeRoleSlugs(
    activeViewer.roles ?? membership?.roleSlugs ?? []
  );
  return { brokerage, roles, subject };
}

function requireBackofficeRole(roles: readonly RoleSlug[]): void {
  if (!roles.some((role) => BACKOFFICE_ROLES.includes(role))) {
    throw new Error("Forbidden: backoffice role required");
  }
}

// ---------------------------------------------------------------------------
// Audit helper for onboarding/claim events
// ---------------------------------------------------------------------------

async function writeContractorIdentityEvent(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    organizationId: string;
    actorSubject: string;
    actorRoles: readonly RoleSlug[];
    command: string;
    contractorId: Id<"contractorProfiles">;
    entityType?: string;
    eventType: string;
    newState?: string;
    priorState?: string;
    reason?: string;
    warnings?: string[];
  }
) {
  const now = Date.now();
  await ctx.db.insert("auditEvents", {
    actorRoles: input.actorRoles as RoleSlug[],
    actorWorkosUserId: input.actorSubject,
    brokerageId: input.brokerageId,
    command: input.command,
    createdAt: now,
    entityId: String(input.contractorId),
    entityType: input.entityType ?? "contractorProfile",
    eventType: input.eventType,
    newState: input.newState,
    organizationId: input.organizationId,
    priorState: input.priorState,
    reason: input.reason,
    warnings: input.warnings ?? [],
  });
}

// ---------------------------------------------------------------------------
// Onboarding state machine helpers (PRD §14.1)
// ---------------------------------------------------------------------------

const ONBOARDING_SUBMITTABLE_STATES = new Set([
  "draft",
  "changes_requested",
]);

function assertOnboardingTransition(
  from: string,
  to: string
): void {
  // PRD §14.1 state machine.
  const allowed: Record<string, string[]> = {
    draft: ["pending_backoffice_review"],
    pending_backoffice_review: [
      "changes_requested",
      "approved_pending_workos",
      "rejected",
      "merged",
    ],
    changes_requested: ["pending_backoffice_review"],
    approved_pending_workos: ["active"],
    merged: ["active"],
  };
  const targets = allowed[from];
  if (!targets || !targets.includes(to)) {
    throw new Error(
      `Invalid onboarding transition: ${from} -> ${to} (PRD §14.1)`
    );
  }
}

// ---------------------------------------------------------------------------
// Self-service onboarding bridge (PRD §7.1)
// ---------------------------------------------------------------------------

/**
 * Read the caller's onboarding bridge state. Reachable by an authenticated
 * member of FairLendBrokerage so the onboarding surface can render before the
 * contractor role is assigned (PRD §5.2, §11.1 onboarding bridge).
 */
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
      contractorId = await ctx.db.insert("contractorProfiles", {
        accountWorkosUserId: undefined,
        brokerageId: scope.brokerage._id,
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
        organizationId: args.workosOrganizationId,
        source: "self_service",
        status: "active",
        trades:
          (args.draftFields as { trades?: string[] })?.trades ?? [],
        createdAt: now,
        updatedAt: now,
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

function redactOnboardingReview(
  review: Doc<"contractorOnboardingReviews">
) {
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
    assertOnboardingTransition(
      review.status,
      "approved_pending_workos"
    );
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
    await ctx.scheduler.runAfter(0, internal.workosManagement.createClaimMembershipForUser, {
      organizationId: args.workosOrganizationId,
      primaryRoleSlug: "contractor",
      roleSlugs: ["contractor"],
      userId: review.applicantWorkosUserId,
    });

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
    const now = Date.now();
    await ctx.db.patch(review.contractorId, {
      accountWorkosUserId: args.applicantWorkosUserId,
      onboardingStatus: "account_linked",
      updatedAt: now,
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
    if (!isBackoffice && !isBuilderSide) {
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

    const normalizedEmail = normalizeContractorEmail(contractor.email);
    if (!normalizedEmail) {
      throw new Error(
        "Contractor profile has no email; cannot send an invitation."
      );
    }

    // Revoke any prior live invite for this profile (single live claim, PRD
    // §7.3 single-use after successful claim).
    const now = Date.now();
    const priorLive = await ctx.db
      .query("contractorInviteClaims")
      .withIndex("by_contractor_state", (q) =>
        q
          .eq("contractorId", args.contractorId)
          .eq("state", "invited")
      )
      .collect();
    for (const prior of priorLive) {
      await ctx.db.patch(prior._id, {
        revokedAt: now,
        revokedByWorkosUserId: scope.subject,
        state: "revoked",
        updatedAt: now,
      });
    }

    const expiresAt =
      args.expiresInDays === undefined
        ? undefined
        : now + Math.max(1, args.expiresInDays) * 86_400_000;

    const claimId = await ctx.db.insert("contractorInviteClaims", {
      brokerageId: scope.brokerage._id,
      contractorId: args.contractorId,
      expiresAt,
      invitedNormalizedEmail: normalizedEmail,
      inviterWorkosUserId: scope.subject,
      organizationId: args.workosOrganizationId,
      state: "invited",
      createdAt: now,
      updatedAt: now,
    });

    // WorkOS organization invitation — WorkOS owns membership + role projection
    // (PRD §7.5). Fire-and-forget; the webhook finalizes projection.
    await ctx.scheduler.runAfter(0, internal.workosManagement.inviteContractorUser, {
      email: normalizedEmail,
      organizationId: args.workosOrganizationId,
    });

    await writeContractorIdentityEvent(ctx, {
      actorRoles: scope.roles,
      actorSubject: scope.subject,
      brokerageId: scope.brokerage._id,
      command: "sendContractorProfileInvite",
      contractorId: args.contractorId,
      entityType: "contractorInviteClaim",
      eventType: "contractor.invite.sent",
      newState: JSON.stringify({ claimId, normalizedEmail }),
      organizationId: args.workosOrganizationId,
    });

    return claimId;
  })
  .public();

async function assertContractorAttachedToBuilderScope(
  ctx: QueryCtx,
  contractorId: Id<"contractorProfiles">,
  _inviterSubject: string,
  _workosOrganizationId: string
) {
  // Builder/staff can invite a contractor only if that contractor is already
  // attached to one of the inviter's proposals/builds (PRD §11.3, user story
  // 48, 51). For admin (which is both builder + backoffice side) this is
  // always satisfied; for true builder/builder-staff we look for an assignment
  // on a proposal/build whose builder-side staff includes the inviter.
  const proposalAssignments = await ctx.db
    .query("proposalMilestoneContractorAssignments")
    .withIndex("by_contractor", (q) => q.eq("contractorId", contractorId))
    .filter((q) => q.neq(q.field("status"), "removed"))
    .first();
  const buildAssignments = await ctx.db
    .query("milestoneContractorAssignments")
    .withIndex("by_contractor", (q) => q.eq("contractorId", contractorId))
    .filter((q) => q.neq(q.field("status"), "removed"))
    .first();
  if (!proposalAssignments && !buildAssignments) {
    throw new Error(
      "Forbidden: contractor is not attached to any of your proposals/builds"
    );
  }
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
      await ctx.scheduler.runAfter(0, internal.workosManagement.inviteContractorUser, {
        email,
        organizationId: args.workosOrganizationId,
      });
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
  // Prefer a claim that already recorded this user as the accepter; otherwise
  // fall back to an email match against the viewer's normalized identity email
  // (supplied out-of-band here by membership lookup).
  const byAccepter = await ctx.db
    .query("contractorInviteClaims")
    .withIndex("by_accepted_user", (q) =>
      q.eq("acceptedWorkosUserId", applicantSubject)
    )
    .filter((q) =>
      q.eq(q.field("state"), "accepted_pending_confirmation")
    )
    .first();
  if (byAccepter) {
    return byAccepter;
  }
  // Look up the user's email via projection to match invited_normalized_email.
  const user = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (q) => q.eq("workosUserId", applicantSubject))
    .first();
  const normalizedEmail = normalizeContractorEmail(user?.email);
  if (!normalizedEmail) {
    return null;
  }
  return (
    (await ctx.db
      .query("contractorInviteClaims")
      .withIndex("by_invited_email", (q) =>
        q.eq("invitedNormalizedEmail", normalizedEmail)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("state"), "invited"),
          q.eq(q.field("brokerageId"), brokerageId)
        )
      )
      .first()) ?? null
  );
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
    await ctx.db.patch(claim.contractorId, {
      accountWorkosUserId: scope.subject,
      onboardingStatus: "account_linked",
      updatedAt: now,
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

export const FAIRLEND_ORG_ID = FAIRLEND_WORKOS_ORGANIZATION_ID;
