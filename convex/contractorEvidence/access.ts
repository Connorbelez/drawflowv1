import { v } from "convex/values";

import {
  type AuthorizedViewer,
  type RoleSlug,
  backofficeMutation,
  backofficeQuery,
  contractorMutation,
  contractorQuery,
  normalizeRoleSlugs,
} from "../authz";
import { requireContractorLinkedProfile } from "../contractorAuth";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

/**
 * Contractor supporting evidence, acknowledgements, and scope-issue module.
 *
 * These are the contractor-initiated write surfaces inside the Contractor
 * Workspace (PRD §8.7 evidence, §13.6 acknowledgements/issues, §14.3/§14.4
 * state machines). Every function is contractor-scoped (requires the linked
 * canonical profile) OR backoffice-scoped for review, and every material
 * action writes audit history (PRD §11.3).
 *
 * Hard guarantees enforced here:
 *  - Contractor evidence is supporting context only. It never auto-satisfies
 *    completion, draw, or approval requirements (PRD §3.14, §18).
 *  - Evidence uploads are constrained to the contractor's own assigned scope
 *    (PRD §3.36, user story 36).
 *  - Evidence is visible immediately to the assigned builder side and
 *    backoffice/lender staff (PRD §3.15). Other contractors never see it
 *    (PRD §8.7, user story 36).
 */

export const ALLOWED_EVIDENCE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
  "application/pdf",
]);

export const contractorRoleQuery = contractorQuery.use(requireContractorLinkedProfile);
export const contractorRoleMutation = contractorMutation.use(
  requireContractorLinkedProfile
);

// ---------------------------------------------------------------------------
// Shared assignment-scope authorization
// ---------------------------------------------------------------------------

export interface ContractorAssignmentRef {
  assignmentType: "proposal" | "build";
  proposalAssignmentId?: Id<"proposalMilestoneContractorAssignments">;
  buildAssignmentId?: Id<"milestoneContractorAssignments">;
  proposalId?: Id<"buildProposals">;
  buildId?: Id<"activeBuilds">;
  milestoneKey: string;
  submilestoneKey?: string;
}

/**
 * Resolve + authorize that the contractor owns the target assignment scope.
 * Throws if the assignment does not belong to the linked contractor profile.
 * Returns the hydrated proposal/build ids used to key the evidence row.
 */
export async function authorizeAssignmentScope(
  ctx: QueryCtx,
  contractorId: Id<"contractorProfiles">,
  input: ContractorAssignmentRef
): Promise<{
  proposalId: Id<"buildProposals"> | null;
  buildId: Id<"activeBuilds"> | null;
}> {
  if (input.assignmentType === "proposal") {
    if (!input.proposalAssignmentId) {
      throw new Error("Proposal assignment id is required.");
    }
    const assignment = await ctx.db.get(input.proposalAssignmentId);
    if (
      !assignment ||
      assignment.contractorId !== contractorId ||
      assignment.status === "removed"
    ) {
      throw new Error("Forbidden: evidence must target your own assignment");
    }
    return {
      proposalId: assignment.proposalId,
      buildId: null,
    };
  }
  if (!input.buildAssignmentId) {
    throw new Error("Build assignment id is required.");
  }
  const assignment = await ctx.db.get(input.buildAssignmentId);
  if (
    !assignment ||
    assignment.contractorId !== contractorId ||
    assignment.status === "removed"
  ) {
    throw new Error("Forbidden: evidence must target your own assignment");
  }
  return { proposalId: null, buildId: assignment.buildId };
}

export async function writeEvidenceEvent(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    organizationId: string;
    actorSubject: string;
    actorRoles: readonly RoleSlug[];
    command: string;
    contractorId: Id<"contractorProfiles">;
    evidenceId?: Id<"contractorEvidence">;
    eventType: string;
    newState?: string;
    priorState?: string;
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: input.actorRoles as RoleSlug[],
    actorWorkosUserId: input.actorSubject,
    brokerageId: input.brokerageId,
    command: input.command,
    createdAt: Date.now(),
    entityId: input.evidenceId
      ? String(input.evidenceId)
      : String(input.contractorId),
    entityType: input.evidenceId ? "contractorEvidence" : "contractorProfile",
    eventType: input.eventType,
    newState: input.newState,
    organizationId: input.organizationId,
    priorState: input.priorState,
    warnings: [],
  });
}

// ---------------------------------------------------------------------------
// Evidence upload (PRD §8.7)
// ---------------------------------------------------------------------------

/**
 * Generate a storage upload URL for contractor evidence. The URL is
 * unauthenticated on purpose (Convex storage handles the one-time token), but
 * this endpoint still requires the contractor role + linked profile so only
 * authenticated contractors can request upload URLs at all.
 */
export function viewerSubject(ctx: unknown): string {
  return (ctx as { viewer: AuthorizedViewer }).viewer.subject;
}

export function viewerRoles(ctx: unknown): readonly RoleSlug[] {
  return (ctx as { viewer: AuthorizedViewer }).viewer.roles;
}

export interface BrokerageScope {
  brokerage: Doc<"brokerages">;
  roles: RoleSlug[];
  subject: string;
}

export async function resolveBrokerageScopeOrThrow(
  ctx: QueryCtx | MutationCtx,
  workosOrganizationId: string
): Promise<BrokerageScope> {
  const viewer = (ctx as unknown as { viewer: AuthorizedViewer }).viewer;
  const subject = viewer.subject;
  const membership = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (q) => q.eq("workosUserId", subject))
    .filter((q) => q.eq(q.field("workosOrganizationId"), workosOrganizationId))
    .first();
  const activeTokenOrganizationId = viewer.organizationId?.trim();
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
  const roles = normalizeRoleSlugs(viewer.roles ?? membership?.roleSlugs ?? []);
  return { brokerage, roles, subject };
}
