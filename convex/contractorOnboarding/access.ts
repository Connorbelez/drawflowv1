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

export const BACKOFFICE_ROLES: readonly RoleSlug[] = [
  "admin",
  "principle-broker",
  "broker",
  "broker-staff",
];

export const BUILDER_ROLES: readonly RoleSlug[] = [
  "admin",
  "builder",
  "builder-staff",
];

// ---------------------------------------------------------------------------
// Brokerage scope resolution (self-service reachable by member role)
// ---------------------------------------------------------------------------

export interface BrokerageScope {
  brokerage: Doc<"brokerages">;
  roles: RoleSlug[];
  subject: string;
}

export async function resolveBrokerageScopeOrThrow(
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
    .filter((q) => q.eq(q.field("workosOrganizationId"), workosOrganizationId))
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

export function requireBackofficeRole(roles: readonly RoleSlug[]): void {
  if (!roles.some((role) => BACKOFFICE_ROLES.includes(role))) {
    throw new Error("Forbidden: backoffice role required");
  }
}

// ---------------------------------------------------------------------------
// Audit helper for onboarding/claim events
// ---------------------------------------------------------------------------

export async function writeContractorIdentityEvent(
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

export const ONBOARDING_SUBMITTABLE_STATES = new Set([
  "draft",
  "changes_requested",
]);

export function assertOnboardingTransition(from: string, to: string): void {
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
  if (!(targets && targets.includes(to))) {
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
export async function assertContractorAttachedToBuilderScope(
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

export const FAIRLEND_ORG_ID = FAIRLEND_WORKOS_ORGANIZATION_ID;
