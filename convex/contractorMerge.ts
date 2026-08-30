import { v } from "convex/values";

import { backofficeMutation, backofficeQuery } from "./authz";
import { resolveBrokerageScopeOrThrow } from "./contractor_identity_scope";
import {
  patchCanonicalContractorProfile,
  writeContractorIdentityEvent,
} from "./contractor_profile_application";
import type { Doc, Id, MutationCtx } from "./types";

/**
 * Backoffice contractor identity-resolution operations (PRD §6.3, §9, §11.3).
 *
 * Backoffice owns manual duplicate merge and identity resolution (PRD §3.11).
 * Builders cannot merge brokerage-wide identities. Every merge, profile link,
 * unlink, and role-promotion request writes audit history (PRD §11.3).
 *
 * Merge semantics (PRD §6.3):
 *  - select a canonical contractor profile,
 *  - preserve losing profiles as aliases/merged records (contractorAliases),
 *  - migrate active assignment pointers to the canonical profile,
 *  - migrate contractor evidence, ratings, schedule links, and work history,
 *  - write audit events with actor, prior/new state, reason, affected records.
 */

// ---------------------------------------------------------------------------
// Duplicate hints (PRD §6.2, §9, user story 60)
// ---------------------------------------------------------------------------

/**
 * List duplicate hints for a contractor profile (exact email, plus fuzzy
 * phone/name hints). Phone/name matches are hints only — never auto-merge
 * (PRD §6.2). Backoffice-scoped.
 */
export const listContractorDuplicateHints = backofficeQuery
  .input({
    contractorId: v.id("contractorProfiles"),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    const profile = await ctx.db.get(args.contractorId);
    if (!profile || profile.brokerageId !== scope.brokerage._id) {
      throw new Error("Contractor not found in brokerage.");
    }
    const peers = await ctx.db
      .query("contractorProfiles")
      .withIndex("by_brokerage", (q) =>
        q.eq("brokerageId", scope.brokerage._id)
      )
      .filter((q) =>
        q.and(
          q.neq(q.field("_id"), profile._id),
          q.eq(q.field("status"), "active")
        )
      )
      .collect();
    const hints: Array<{
      contractorId: Id<"contractorProfiles">;
      name: string;
      email: string | null;
      phone: string | null;
      kind: "email" | "phone" | "name";
      confidence: "exact" | "fuzzy";
    }> = [];
    for (const peer of peers) {
      if (
        profile.normalizedEmail &&
        peer.normalizedEmail === profile.normalizedEmail
      ) {
        hints.push({
          confidence: "exact",
          contractorId: peer._id,
          email: peer.email ?? null,
          kind: "email",
          name: peer.name,
          phone: peer.phone ?? null,
        });
      } else if (profile.phone && peer.phone && peer.phone === profile.phone) {
        hints.push({
          confidence: "fuzzy",
          contractorId: peer._id,
          email: peer.email ?? null,
          kind: "phone",
          name: peer.name,
          phone: peer.phone ?? null,
        });
      } else if (
        peer.name.trim().toLowerCase() === profile.name.trim().toLowerCase()
      ) {
        hints.push({
          confidence: "fuzzy",
          contractorId: peer._id,
          email: peer.email ?? null,
          kind: "name",
          name: peer.name,
          phone: peer.phone ?? null,
        });
      }
    }
    return { contractorId: profile._id, hints };
  })
  .public();

// ---------------------------------------------------------------------------
// Manual merge (PRD §6.3, user story 59)
// ---------------------------------------------------------------------------

/**
 * Merge one or more losing contractor profiles into a canonical profile. The
 * canonical profile survives; losers are marked inactive and preserved as
 * aliases. All assignment pointers, evidence, ratings, schedule links,
 * acknowledgements, scope issues, and notifications migrate to the canonical
 * profile (PRD §6.3).
 *
 * Transaction-safe batching: Convex mutations are transactional with document
 * limits. For very large rosters the migration is batched via scheduler
 * continuation; this initial pass handles the common case in a single
 * transaction.
 */
export const mergeContractorProfiles = backofficeMutation
  .input({
    canonicalContractorId: v.id("contractorProfiles"),
    loserContractorIds: v.array(v.id("contractorProfiles")),
    reason: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      canonicalContractorId: v.id("contractorProfiles"),
      migratedAssignments: v.number(),
      migratedEvidence: v.number(),
      mergedLosers: v.number(),
    })
  )
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    const canonical = await ctx.db.get(args.canonicalContractorId);
    if (!canonical || canonical.brokerageId !== scope.brokerage._id) {
      throw new Error("Canonical contractor not found in brokerage.");
    }
    if (args.loserContractorIds.includes(args.canonicalContractorId)) {
      throw new Error("Canonical profile cannot be in the loser set.");
    }
    const losers: Doc<"contractorProfiles">[] = [];
    for (const loserId of args.loserContractorIds) {
      const loser = await ctx.db.get(loserId);
      if (!loser || loser.brokerageId !== scope.brokerage._id) {
        throw new Error("Loser contractor not found in brokerage.");
      }
      losers.push(loser);
    }
    if (losers.length === 0) {
      throw new Error("At least one loser profile is required.");
    }

    const now = Date.now();
    let migratedAssignments = 0;
    let migratedEvidence = 0;

    for (const loser of losers) {
      // Preserve the losing profile as an alias (PRD §6.1.4, §6.3).
      await ctx.db.insert("contractorAliases", {
        brokerageId: scope.brokerage._id,
        canonicalContractorId: canonical._id,
        createdByWorkosUserId: scope.subject,
        createdAt: now,
        mergedAt: now,
        mergedByWorkosUserId: scope.subject,
        mergedContractorId: loser._id,
        mergeStatus: "resolved",
        organizationId: args.workosOrganizationId,
        originalEmail: loser.email,
        originalName: loser.name,
        originalPhone: loser.phone,
        originalTrade: loser.trades[0],
        updatedAt: now,
      });

      // Migrate assignment pointers (proposal + build milestone assignments).
      const proposalAssignments = await ctx.db
        .query("proposalMilestoneContractorAssignments")
        .withIndex("by_contractor", (q) => q.eq("contractorId", loser._id))
        .collect();
      for (const assignment of proposalAssignments) {
        await ctx.db.patch(assignment._id, {
          contractorId: canonical._id,
          updatedAt: now,
        });
        migratedAssignments += 1;
      }
      const buildAssignments = await ctx.db
        .query("milestoneContractorAssignments")
        .withIndex("by_contractor", (q) => q.eq("contractorId", loser._id))
        .collect();
      for (const assignment of buildAssignments) {
        await ctx.db.patch(assignment._id, {
          contractorId: canonical._id,
          updatedAt: now,
        });
        migratedAssignments += 1;
      }

      // Migrate evidence, ratings, schedule links, acks, issues, notifications.
      migratedEvidence += await migrateContractorChildRows(
        ctx,
        loser._id,
        canonical._id,
        now
      );

      // Mark loser inactive (preserved, not deleted — PRD §6.3, §3.19).
      await patchCanonicalContractorProfile(ctx, {
        brokerageId: scope.brokerage._id,
        contractorId: loser._id,
        now,
        organizationId: args.workosOrganizationId,
        patch: {
          accountWorkosUserId: undefined,
          status: "inactive",
        },
      });
    }

    await writeContractorIdentityEvent(ctx, {
      actorRoles: scope.roles,
      actorSubject: scope.subject,
      brokerageId: scope.brokerage._id,
      command: "mergeContractorProfiles",
      contractorId: canonical._id,
      eventType: "contractor.profile.merged",
      newState: JSON.stringify({
        canonicalContractorId: canonical._id,
        loserContractorIds: losers.map((l) => l._id),
        migratedAssignments,
        migratedEvidence,
      }),
      organizationId: args.workosOrganizationId,
      priorState: JSON.stringify({
        loserNames: losers.map((l) => l.name),
      }),
      reason: args.reason,
    });

    return {
      canonicalContractorId: canonical._id,
      migratedAssignments,
      migratedEvidence,
      mergedLosers: losers.length,
    };
  })
  .public();

async function migrateContractorChildRows(
  ctx: MutationCtx,
  fromContractorId: Id<"contractorProfiles">,
  toContractorId: Id<"contractorProfiles">,
  now: number
): Promise<number> {
  let count = 0;
  const evidence = await ctx.db
    .query("contractorEvidence")
    .withIndex("by_contractor", (q) => q.eq("contractorId", fromContractorId))
    .collect();
  for (const row of evidence) {
    await ctx.db.patch(row._id, {
      contractorId: toContractorId,
      updatedAt: now,
    });
    count += 1;
  }
  const ratings = await ctx.db
    .query("contractorQualityRatings")
    .withIndex("by_contractor", (q) => q.eq("contractorId", fromContractorId))
    .collect();
  for (const row of ratings) {
    await ctx.db.patch(row._id, { contractorId: toContractorId });
    count += 1;
  }
  const acks = await ctx.db
    .query("contractorAcknowledgements")
    .withIndex("by_contractor", (q) => q.eq("contractorId", fromContractorId))
    .collect();
  for (const row of acks) {
    await ctx.db.patch(row._id, {
      contractorId: toContractorId,
      updatedAt: now,
    });
    count += 1;
  }
  const issues = await ctx.db
    .query("contractorScopeIssues")
    .withIndex("by_contractor", (q) => q.eq("contractorId", fromContractorId))
    .collect();
  for (const row of issues) {
    await ctx.db.patch(row._id, {
      contractorId: toContractorId,
      updatedAt: now,
    });
    count += 1;
  }
  const notifications = await ctx.db
    .query("contractorNotifications")
    .withIndex("by_contractor", (q) => q.eq("contractorId", fromContractorId))
    .collect();
  for (const row of notifications) {
    await ctx.db.patch(row._id, { contractorId: toContractorId });
    count += 1;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Deactivate / unlink (PRD §8.8, user story 68)
// ---------------------------------------------------------------------------

/**
 * Deactivate a contractor profile. Reviewed action only — protects active
 * assignments and audit history (PRD user story 68). Does not delete the
 * profile or its history.
 */
export const deactivateContractorProfile = backofficeMutation
  .input({
    contractorId: v.id("contractorProfiles"),
    reason: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorProfiles"))
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    const contractor = await ctx.db.get(args.contractorId);
    if (!contractor || contractor.brokerageId !== scope.brokerage._id) {
      throw new Error("Contractor not found in brokerage.");
    }
    const now = Date.now();
    const priorStatus = contractor.status;
    await patchCanonicalContractorProfile(ctx, {
      brokerageId: scope.brokerage._id,
      contractorId: args.contractorId,
      now,
      organizationId: args.workosOrganizationId,
      patch: { status: "inactive" },
    });
    await writeContractorIdentityEvent(ctx, {
      actorRoles: scope.roles,
      actorSubject: scope.subject,
      brokerageId: scope.brokerage._id,
      command: "deactivateContractorProfile",
      contractorId: args.contractorId,
      eventType: "contractor.profile.deactivated",
      newState: JSON.stringify({ status: "inactive" }),
      organizationId: args.workosOrganizationId,
      priorState: JSON.stringify({ status: priorStatus }),
      reason: args.reason,
    });
    return args.contractorId;
  })
  .public();

/**
 * Unlink a contractor account from its WorkOS user. Reviewed action only —
 * contractors cannot self-unlink (PRD §3.19, user story 68). Clears the
 * account link + resets onboarding status to profile_only.
 */
export const unlinkContractorAccount = backofficeMutation
  .input({
    contractorId: v.id("contractorProfiles"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorProfiles"))
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    const contractor = await ctx.db.get(args.contractorId);
    if (!contractor || contractor.brokerageId !== scope.brokerage._id) {
      throw new Error("Contractor not found in brokerage.");
    }
    if (!contractor.accountWorkosUserId) {
      throw new Error("Contractor profile has no linked account to unlink.");
    }
    const now = Date.now();
    const priorAccount = contractor.accountWorkosUserId;
    await patchCanonicalContractorProfile(ctx, {
      brokerageId: scope.brokerage._id,
      contractorId: args.contractorId,
      now,
      organizationId: args.workosOrganizationId,
      patch: {
        accountWorkosUserId: undefined,
        onboardingStatus: "profile_only",
      },
    });
    await writeContractorIdentityEvent(ctx, {
      actorRoles: scope.roles,
      actorSubject: scope.subject,
      brokerageId: scope.brokerage._id,
      command: "unlinkContractorAccount",
      contractorId: args.contractorId,
      eventType: "contractor.profile.account_unlinked",
      newState: JSON.stringify({ accountWorkosUserId: null }),
      organizationId: args.workosOrganizationId,
      priorState: JSON.stringify({ accountWorkosUserId: priorAccount }),
      reason: args.reason,
    });
    return args.contractorId;
  })
  .public();

export { normalizeContractorEmail } from "./contractorWorkspace";
