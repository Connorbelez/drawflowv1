/**
 * Production proposals contractor profiles bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import {
  authenticatedMutation,
  authenticatedQuery,
  type RoleSlug,
} from "../authz";
import {
  createCanonicalContractorProfile,
  patchCanonicalContractorProfile,
} from "../contractor_profile_application";
import { normalizeContractorEmail } from "../contractorWorkspace";
import type { Doc, MutationCtx } from "../types";
import { authorizeBrokerage } from "./authorization_core.js";
import { contractorDetailIntelligence } from "./contractor_active_helpers.js";
import {
  addContractorRoleToExistingMembership,
  getScopedContractorOrThrow,
  hydrateContractorProfiles,
  normalizeOptionalString,
  replaceContractorOperatingRows,
  requireAnyRole,
  writeContractorProfileEvent,
} from "./contractor_policy_helpers.js";
import { contractorIdentityLinkViews } from "./contractor_proposal_helpers.js";
import {
  assertContractorDetailReadAllowed,
  builderContractorLifecycle,
  builderContractorRelationshipScope,
  builderContractorUnavailable,
  builderVisibleContractorProfile,
  contractorPerformanceSummary,
  contractorWorkHistory,
} from "./contractor_relationship_helpers.js";
import {
  APPROVER_ROLES,
  BACKOFFICE_ROLES,
  BUILDER_ROLES,
} from "./contracts_foundation.js";
import {
  contractorAvailabilityWindowInput,
  contractorCapabilityInput,
  contractorEquipmentInput,
  contractorIdentityLinkStatusInput,
  contractorKindInput,
  contractorPayRateUnitInput,
  contractorProfileCreateInput,
} from "./contracts_workflow.js";
import { isBackoffice } from "./proposal_claim.js";

export const createContractorProfile = authenticatedMutation
  .input({
    brokerageId: v.id("brokerages"),
    ...contractorProfileCreateInput,
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorProfiles"))
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    if (auth.brokerage._id !== args.brokerageId) {
      throw new Error("Forbidden: brokerage scope");
    }
    return await createOrReuseContractorProfile(ctx, {
      auth,
      command: "createContractorProfile",
      contractor: args,
      workosOrganizationId: args.workosOrganizationId,
    });
  })
  .public();

function isBackofficeCreator(roles: readonly RoleSlug[]): boolean {
  return roles.some((role) =>
    (BACKOFFICE_ROLES as readonly string[]).includes(role)
  );
}

export async function createOrReuseContractorProfile(
  ctx: MutationCtx,
  input: {
    auth: { brokerage: Doc<"brokerages">; roles: RoleSlug[]; subject: string };
    command: string;
    contractor: {
      accountWorkosUserId?: string;
      availabilityWindows?: Array<{
        dayOfWeek: number;
        effectiveEndDate?: string;
        effectiveStartDate?: string;
        endMinute: number;
        startMinute: number;
        timezone: string;
      }>;
      capabilities?: Array<{
        capabilityKey: string;
        label: string;
        milestoneArchetypeKey?: string;
        notes?: string;
        trade?: string;
      }>;
      city?: string;
      defaultPayRateCents?: number;
      defaultPayRateUnit?: "hour" | "day" | "fixed";
      email?: string;
      equipment?: Array<{
        equipmentKey: string;
        name: string;
        notes?: string;
        quantity: number;
      }>;
      kind?: "company" | "individual";
      name: string;
      phone?: string;
      trades: string[];
    };
    workosOrganizationId: string;
  }
) {
  const { auth, contractor } = input;
  // Canonical email rules (PRD §6.2, §7.4). Email is optional; when present
  // it is normalized before matching. One active canonical contractor profile
  // per normalized email is allowed inside the brokerage, so builder/backoffice
  // creation with an existing normalized email reuses the canonical profile
  // instead of fragmenting work history. Phone/name/trade matches never
  // auto-merge (PRD §6.2).
  const normalizedEmail = normalizeContractorEmail(contractor.email);
  const now = Date.now();
  if (normalizedEmail) {
    const existing = await ctx.db
      .query("contractorProfiles")
      .withIndex("by_brokerage_normalized_email", (q) =>
        q
          .eq("brokerageId", auth.brokerage._id)
          .eq("normalizedEmail", normalizedEmail)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (existing) {
      // Reuse the canonical profile. Builder/backoffice creation never sends
      // an invitation unless explicitly requested (PRD §7.4, §3.7).
      await writeContractorProfileEvent(ctx, {
        auth,
        command: input.command,
        contractorId: existing._id,
        eventType: "contractor.profile.canonical_reused",
        newState: JSON.stringify({
          requestedName: contractor.name,
          normalizedEmail,
        }),
        organizationId: input.workosOrganizationId,
      });
      return existing._id;
    }
  }
  const contractorId = await createCanonicalContractorProfile(ctx, {
    brokerageId: auth.brokerage._id,
    fields: {
      accountWorkosUserId: contractor.accountWorkosUserId,
      city: normalizeOptionalString(contractor.city),
      defaultPayRateCents:
        contractor.defaultPayRateCents === undefined
          ? undefined
          : Math.max(0, Math.round(contractor.defaultPayRateCents)),
      defaultPayRateUnit: contractor.defaultPayRateUnit,
      email: contractor.email ? contractor.email.trim() : undefined,
      normalizedEmail: normalizedEmail || undefined,
      kind: contractor.kind ?? "company",
      name: contractor.name,
      onboardingStatus: contractor.accountWorkosUserId
        ? "account_linked"
        : "profile_only",
      phone: contractor.phone,
      source: isBackofficeCreator(auth.roles)
        ? "backoffice_created"
        : "builder_created",
      status: "active",
      trades: contractor.trades,
    },
    now,
    organizationId: input.workosOrganizationId,
  });
  await replaceContractorOperatingRows(ctx, {
    availabilityWindows: contractor.availabilityWindows ?? [],
    brokerageId: auth.brokerage._id,
    capabilities: contractor.capabilities ?? [],
    contractorId,
    equipment: contractor.equipment ?? [],
    now,
    organizationId: input.workosOrganizationId,
  });
  await writeContractorProfileEvent(ctx, {
    auth,
    command: input.command,
    contractorId,
    eventType: "contractor.profile.created",
    newState: JSON.stringify({
      accountLinked: Boolean(contractor.accountWorkosUserId),
      capabilities: contractor.capabilities?.length ?? 0,
      equipment: contractor.equipment?.length ?? 0,
      name: contractor.name,
    }),
    organizationId: input.workosOrganizationId,
  });
  return contractorId;
}

export const updateContractorProfile = authenticatedMutation
  .input({
    accountWorkosUserId: v.optional(v.string()),
    availabilityWindows: v.array(contractorAvailabilityWindowInput),
    capabilities: v.array(contractorCapabilityInput),
    city: v.optional(v.string()),
    contractorId: v.id("contractorProfiles"),
    defaultPayRateCents: v.optional(v.number()),
    defaultPayRateUnit: v.optional(contractorPayRateUnitInput),
    email: v.optional(v.string()),
    equipment: v.array(contractorEquipmentInput),
    kind: v.optional(contractorKindInput),
    name: v.string(),
    phone: v.optional(v.string()),
    trades: v.array(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    const contractor = await getScopedContractorOrThrow(
      ctx,
      args.contractorId,
      auth.brokerage._id
    );
    const now = Date.now();
    await patchCanonicalContractorProfile(ctx, {
      brokerageId: auth.brokerage._id,
      contractorId: args.contractorId,
      now,
      organizationId: args.workosOrganizationId,
      patch: {
        accountWorkosUserId: normalizeOptionalString(args.accountWorkosUserId),
        city: normalizeOptionalString(args.city),
        defaultPayRateCents:
          args.defaultPayRateCents === undefined
            ? undefined
            : Math.max(0, Math.round(args.defaultPayRateCents)),
        defaultPayRateUnit: args.defaultPayRateUnit,
        email: normalizeOptionalString(args.email),
        kind: args.kind ?? contractor.kind ?? "company",
        name: args.name.trim() || contractor.name,
        onboardingStatus: args.accountWorkosUserId
          ? "account_linked"
          : contractor.onboardingStatus,
        phone: normalizeOptionalString(args.phone),
        trades: args.trades.map((trade) => trade.trim()).filter(Boolean),
      },
    });
    await replaceContractorOperatingRows(ctx, {
      availabilityWindows: args.availabilityWindows,
      brokerageId: auth.brokerage._id,
      capabilities: args.capabilities,
      contractorId: args.contractorId,
      equipment: args.equipment,
      now,
      organizationId: args.workosOrganizationId,
    });
    await writeContractorProfileEvent(ctx, {
      auth,
      command: "updateContractorProfile",
      contractorId: args.contractorId,
      eventType: "contractor.profile.updated",
      newState: JSON.stringify({
        capabilities: args.capabilities.length,
        equipment: args.equipment.length,
        name: args.name,
        trades: args.trades,
      }),
      organizationId: args.workosOrganizationId,
      priorState: JSON.stringify({
        accountWorkosUserId: contractor.accountWorkosUserId,
        city: contractor.city,
        defaultPayRateCents: contractor.defaultPayRateCents,
        defaultPayRateUnit: contractor.defaultPayRateUnit,
        email: contractor.email,
        name: contractor.name,
        phone: contractor.phone,
        trades: contractor.trades,
      }),
    });
    return null;
  })
  .public();

export const setContractorProfileStatus = authenticatedMutation
  .input({
    contractorId: v.id("contractorProfiles"),
    reason: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    const contractor = await getScopedContractorOrThrow(
      ctx,
      args.contractorId,
      auth.brokerage._id
    );
    await patchCanonicalContractorProfile(ctx, {
      brokerageId: auth.brokerage._id,
      contractorId: args.contractorId,
      now: Date.now(),
      organizationId: args.workosOrganizationId,
      patch: { status: args.status },
    });
    await writeContractorProfileEvent(ctx, {
      auth,
      command: "setContractorProfileStatus",
      contractorId: args.contractorId,
      eventType:
        args.status === "active"
          ? "contractor.profile.activated"
          : "contractor.profile.deactivated",
      newState: JSON.stringify({ status: args.status }),
      organizationId: args.workosOrganizationId,
      priorState: JSON.stringify({ status: contractor.status }),
      reason: args.reason,
    });
    return null;
  })
  .public();

export const linkContractorIdentity = authenticatedMutation
  .input({
    confidence: v.optional(v.number()),
    linkedContractorId: v.id("contractorProfiles"),
    primaryContractorId: v.id("contractorProfiles"),
    reason: v.optional(v.string()),
    status: contractorIdentityLinkStatusInput,
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorIdentityLinks"))
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    requireAnyRole(auth.roles, APPROVER_ROLES);
    if (args.primaryContractorId === args.linkedContractorId) {
      throw new Error("Contractor identity links require two profiles.");
    }
    const primary = await ctx.db.get(args.primaryContractorId);
    const linked = await ctx.db.get(args.linkedContractorId);
    if (!(primary && linked)) {
      throw new Error("Contractor profile not found for identity link.");
    }
    if (primary.brokerageId !== auth.brokerage._id) {
      throw new Error("Forbidden: primary contractor brokerage scope");
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("contractorIdentityLinks")
      .withIndex("by_primary_linked", (q) =>
        q
          .eq("primaryContractorId", args.primaryContractorId)
          .eq("linkedContractorId", args.linkedContractorId)
      )
      .unique();
    const row = {
      confidence:
        args.confidence === undefined
          ? undefined
          : Math.max(0, Math.min(1, args.confidence)),
      linkedBrokerageId: linked.brokerageId,
      linkedContractorId: args.linkedContractorId,
      linkedOrganizationId: linked.organizationId,
      organizationId: args.workosOrganizationId,
      primaryBrokerageId: primary.brokerageId,
      primaryContractorId: args.primaryContractorId,
      primaryOrganizationId: primary.organizationId,
      reason: normalizeOptionalString(args.reason),
      status: args.status,
      updatedAt: now,
    };
    const linkId = existing
      ? existing._id
      : await ctx.db.insert("contractorIdentityLinks", {
          ...row,
          createdAt: now,
          createdByWorkosUserId: auth.subject,
        });
    if (existing) {
      await ctx.db.patch(existing._id, row);
    }
    await writeContractorProfileEvent(ctx, {
      auth,
      command: "linkContractorIdentity",
      contractorId: args.primaryContractorId,
      eventType: "contractor.identity.linked",
      newState: JSON.stringify({
        linkedContractorId: args.linkedContractorId,
        linkedBrokerageId: linked.brokerageId,
        status: args.status,
      }),
      organizationId: args.workosOrganizationId,
      reason: args.reason,
    });
    return linkId;
  })
  .public();

export const linkContractorProfileToWorkosUser = authenticatedMutation
  .input({
    contractorId: v.id("contractorProfiles"),
    workosOrganizationId: v.string(),
    workosUserId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    const contractor = await getScopedContractorOrThrow(
      ctx,
      args.contractorId,
      auth.brokerage._id
    );
    const now = Date.now();
    await patchCanonicalContractorProfile(ctx, {
      brokerageId: auth.brokerage._id,
      contractorId: args.contractorId,
      now,
      organizationId: args.workosOrganizationId,
      patch: {
        accountWorkosUserId: args.workosUserId,
        onboardingStatus: "account_linked",
      },
    });
    await addContractorRoleToExistingMembership(ctx, {
      now,
      workosOrganizationId: args.workosOrganizationId,
      workosUserId: args.workosUserId,
    });
    await writeContractorProfileEvent(ctx, {
      auth,
      command: "linkContractorProfileToWorkosUser",
      contractorId: args.contractorId,
      eventType: "contractor.profile.account_linked",
      newState: JSON.stringify({ workosUserId: args.workosUserId }),
      organizationId: args.workosOrganizationId,
      priorState: JSON.stringify({
        accountWorkosUserId: contractor.accountWorkosUserId,
      }),
    });
    return null;
  })
  .public();

export const listContractors = authenticatedQuery
  .input({
    capabilityKey: v.optional(v.string()),
    includeInactive: v.optional(v.boolean()),
    search: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    const profiles = await ctx.db
      .query("contractorProfiles")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", auth.brokerage._id))
      .collect();
    const enriched = await hydrateContractorProfiles(
      ctx,
      profiles.filter((profile) =>
        args.includeInactive ? true : profile.status === "active"
      )
    );
    const search = args.search?.trim().toLowerCase();
    const contractors = enriched
      .filter((contractor) =>
        args.capabilityKey
          ? contractor.capabilities.some(
              (capability: any) =>
                capability.capabilityKey === args.capabilityKey
            )
          : true
      )
      .filter((contractor) =>
        search
          ? [
              contractor.name,
              contractor.city,
              contractor.email,
              ...(contractor.trades ?? []),
              ...contractor.capabilities.map(
                (capability: any) => capability.label
              ),
              ...contractor.equipment.map((equipment: any) => equipment.name),
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(search)
          : true
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      brokerage: auth.brokerage,
      contractors,
      summary: {
        activeCount: contractors.filter(
          (contractor) => contractor.status === "active"
        ).length,
        capabilityKeys: [
          ...new Set(
            enriched.flatMap((contractor) =>
              contractor.capabilities.map(
                (capability: any) => capability.capabilityKey
              )
            )
          ),
        ].sort(),
        totalCount: contractors.length,
      },
    };
  })
  .public();

export const getBuilderContractorRelationshipByString = authenticatedQuery
  .input({
    contractorId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    requireAnyRole(auth.roles, BUILDER_ROLES);
    const contractorId = ctx.db.normalizeId(
      "contractorProfiles",
      args.contractorId
    );
    if (!contractorId) {
      return builderContractorUnavailable("invalidLink");
    }
    const contractor = await ctx.db.get(contractorId);
    if (!contractor || contractor.brokerageId !== auth.brokerage._id) {
      return builderContractorUnavailable("notFound");
    }
    const scope = await builderContractorRelationshipScope(ctx, {
      brokerageId: auth.brokerage._id,
      contractorId,
      subject: auth.subject,
    });
    if (!scope) {
      return builderContractorUnavailable("accessDenied");
    }

    const [profile] = await hydrateContractorProfiles(ctx, [contractor]);
    const claims = await ctx.db
      .query("contractorInviteClaims")
      .withIndex("by_contractor", (q) => q.eq("contractorId", contractorId))
      .collect();
    const latestClaim = claims.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const onboardingReviews = await ctx.db
      .query("contractorOnboardingReviews")
      .withIndex("by_contractor", (q) => q.eq("contractorId", contractorId))
      .collect();
    const latestReview = onboardingReviews.sort(
      (a, b) => b.updatedAt - a.updatedAt
    )[0];
    const acknowledgements = await ctx.db
      .query("contractorAcknowledgements")
      .withIndex("by_contractor", (q) => q.eq("contractorId", contractorId))
      .collect();
    const acknowledgementByAssignment = new Map(
      acknowledgements
        .filter((acknowledgement) => acknowledgement.kind === "assignment")
        .map((acknowledgement) => [
          acknowledgement.assignmentType === "build"
            ? `build:${String(acknowledgement.buildAssignmentId)}`
            : `proposal:${String(acknowledgement.proposalAssignmentId)}`,
          acknowledgement,
        ])
    );
    const hasPendingAcknowledgement = [
      ...scope.buildMilestoneAssignments.map((assignment) =>
        acknowledgementByAssignment.get(`build:${String(assignment._id)}`)
      ),
      ...scope.proposalMilestoneAssignments.map((assignment) =>
        acknowledgementByAssignment.get(`proposal:${String(assignment._id)}`)
      ),
    ].some(
      (acknowledgement) =>
        !acknowledgement ||
        acknowledgement.state === "pending_acknowledgement" ||
        acknowledgement.state === "clarification_requested" ||
        acknowledgement.state === "scope_disputed"
    );
    const contractorAccountWorkosUserId = profile.accountWorkosUserId;
    const contractorMembership = contractorAccountWorkosUserId
      ? (
          await ctx.db
            .query("workosOrganizationMemberships")
            .withIndex("by_user", (q) =>
              q.eq("workosUserId", contractorAccountWorkosUserId)
            )
            .collect()
        ).find(
          (membership) =>
            membership.workosOrganizationId === args.workosOrganizationId &&
            membership.status === "active" &&
            [membership.roleSlug, ...membership.roleSlugs].includes(
              "contractor"
            )
        )
      : null;
    const lifecycle = builderContractorLifecycle({
      hasMilestoneAssignment:
        scope.buildMilestoneAssignments.length > 0 ||
        scope.proposalMilestoneAssignments.length > 0,
      hasPendingAcknowledgement,
      hasActiveContractorMembership: Boolean(contractorMembership),
      latestClaim,
      latestReview,
      profile,
    });
    const ratings = (
      await ctx.db
        .query("contractorQualityRatings")
        .withIndex("by_contractor", (q) => q.eq("contractorId", contractorId))
        .collect()
    ).filter((rating) => scope.buildIds.has(String(rating.buildId)));
    const workHistory = await contractorWorkHistory(ctx, {
      assignments: scope.buildMilestoneAssignments,
      brokerageId: auth.brokerage._id,
      contractorId,
    });

    return {
      availability: {
        category: "available" as const,
        reference: "CTR-DETAIL-AVAILABLE",
      },
      detail: {
        identityLinks: [],
        intelligence: contractorDetailIntelligence({
          assignments: scope.buildMilestoneAssignments,
          profile,
          proposalAssignments: scope.proposalMilestoneAssignments,
          ratings,
        }),
        performance: contractorPerformanceSummary(
          ratings,
          scope.buildMilestoneAssignments
        ),
        profile: builderVisibleContractorProfile(profile),
        ratings: ratings
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((rating) => ({
            _id: rating._id,
            buildId: rating.buildId,
            createdAt: rating.createdAt,
            milestoneKey: rating.milestoneKey,
            note: rating.note,
            rating: rating.rating,
            source: rating.source,
            submilestoneKey: rating.submilestoneKey,
          })),
        relationship: {
          brokerage: {
            displayName: auth.brokerage.displayName,
          },
          acknowledgementStatus: hasPendingAcknowledgement
            ? "pending"
            : scope.buildMilestoneAssignments.length > 0 ||
                scope.proposalMilestoneAssignments.length > 0
              ? "acknowledged"
              : "not_required",
          assignmentStatus:
            scope.buildMilestoneAssignments.length > 0 ||
            scope.proposalMilestoneAssignments.length > 0
              ? "assigned"
              : "not_assigned",
          invitation: latestClaim
            ? {
                email: latestClaim.invitedNormalizedEmail,
                expiresAt: latestClaim.expiresAt,
                deliveryError: latestClaim.invitationDeliveryError,
                deliveryStatus: latestClaim.invitationDeliveryStatus,
                sentAt: latestClaim.createdAt,
                state: lifecycle.invitationState,
                updatedAt: latestClaim.updatedAt,
              }
            : null,
          lifecycleState: lifecycle.lifecycleState,
          nextAction: lifecycle.nextAction,
          review: latestReview
            ? {
                state: latestReview.status,
                updatedAt: latestReview.updatedAt,
              }
            : null,
          scopes: scope.scopes,
        },
        workHistory,
      },
    };
  })
  .public();

export const getContractorDetail = authenticatedQuery
  .input({
    contractorId: v.id("contractorProfiles"),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    const contractor = await getScopedContractorOrThrow(
      ctx,
      args.contractorId,
      auth.brokerage._id
    );
    if (!isBackoffice(auth.roles)) {
      await assertContractorDetailReadAllowed(ctx, {
        contractor,
        roles: auth.roles,
        subject: auth.subject,
      });
    }
    const [profile] = await hydrateContractorProfiles(ctx, [contractor]);
    const claims = await ctx.db
      .query("contractorInviteClaims")
      .withIndex("by_contractor", (q) =>
        q.eq("contractorId", args.contractorId)
      )
      .collect();
    const latestClaim = claims.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const assignments = await ctx.db
      .query("milestoneContractorAssignments")
      .withIndex("by_contractor", (q) =>
        q.eq("contractorId", args.contractorId)
      )
      .collect();
    const proposalAssignments = await ctx.db
      .query("proposalMilestoneContractorAssignments")
      .withIndex("by_contractor", (q) =>
        q.eq("contractorId", args.contractorId)
      )
      .collect();
    const openProposalAssignments = [];
    for (const assignment of proposalAssignments) {
      const proposal = await ctx.db.get(assignment.proposalId);
      if (proposal?.status !== "closed") {
        openProposalAssignments.push(assignment);
      }
    }
    const ratings = await ctx.db
      .query("contractorQualityRatings")
      .withIndex("by_contractor", (q) =>
        q.eq("contractorId", args.contractorId)
      )
      .collect();
    const identityLinks = await contractorIdentityLinkViews(ctx, {
      brokerageId: auth.brokerage._id,
      contractorId: args.contractorId,
    });
    const workHistory = await contractorWorkHistory(ctx, {
      assignments,
      brokerageId: auth.brokerage._id,
      contractorId: args.contractorId,
    });
    return {
      identityLinks,
      invitation: latestClaim
        ? {
            deliveryError: latestClaim.invitationDeliveryError,
            deliveryStatus: latestClaim.invitationDeliveryStatus,
            email: latestClaim.invitedNormalizedEmail,
            expiresAt: latestClaim.expiresAt,
            sentAt: latestClaim.createdAt,
            state: latestClaim.state,
            updatedAt: latestClaim.updatedAt,
          }
        : null,
      intelligence: contractorDetailIntelligence({
        assignments,
        profile,
        proposalAssignments: openProposalAssignments,
        ratings,
      }),
      performance: contractorPerformanceSummary(ratings, assignments),
      profile,
      ratings: ratings
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((rating) => ({
          _id: rating._id,
          buildId: rating.buildId,
          createdAt: rating.createdAt,
          milestoneKey: rating.milestoneKey,
          note: rating.note,
          rating: rating.rating,
          source: rating.source,
          submilestoneKey: rating.submilestoneKey,
        })),
      workHistory,
    };
  })
  .public();
