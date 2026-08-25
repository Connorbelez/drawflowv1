import type { PaginationOptions } from "convex/server";
import { v } from "convex/values";

export const lenderRoleValidator = v.union(
  v.literal("lender"),
  v.literal("lender-admin"),
  v.literal("lender-staff")
);

export const lenderPermissionsValidator = v.object({
  proposalReview: v.boolean(),
  milestoneDecisions: v.boolean(),
  drawDecisions: v.boolean(),
  siteVisitReview: v.boolean(),
});

export const lenderOrganizationValidator = v.object({
  id: v.id("lenderOrganizations"),
  brokerageId: v.id("brokerages"),
  brokerageName: v.string(),
  legalName: v.string(),
  displayName: v.string(),
  status: v.union(v.literal("active"), v.literal("inactive")),
  permissions: lenderPermissionsValidator,
  memberCount: v.number(),
  pendingCount: v.number(),
  updatedAt: v.number(),
});

export const brokerageOptionValidator = v.object({
  id: v.id("brokerages"),
  displayName: v.string(),
});

export const lenderMemberValidator = v.object({
  assignmentId: v.id("lenderOrganizationAssignments"),
  membershipId: v.optional(v.string()),
  userId: v.id("users"),
  workosUserId: v.string(),
  name: v.string(),
  email: v.string(),
  profilePictureUrl: v.optional(v.string()),
  roleSlugs: v.array(v.string()),
  assignmentStatus: v.union(v.literal("active"), v.literal("pending")),
  membershipStatus: v.literal("active"),
  canMakeFinalDecision: v.boolean(),
});

export const unassignedUserValidator = v.object({
  userId: v.id("users"),
  workosUserId: v.string(),
  name: v.string(),
  email: v.string(),
  profilePictureUrl: v.optional(v.string()),
  membershipId: v.string(),
  roleSlugs: v.array(v.string()),
});

export const pendingInvitationValidator = v.object({
  assignmentId: v.id("lenderOrganizationAssignments"),
  email: v.string(),
  status: v.union(v.literal("pending"), v.literal("conflict_rejected")),
  assignedAt: v.number(),
  reconciledAt: v.optional(v.number()),
  reconciliationReason: v.optional(v.string()),
});

export const lenderMembershipReconciliationValidator = v.object({
  assignmentId: v.id("lenderOrganizationAssignments"),
  membershipId: v.string(),
  membershipStatus: v.union(
    v.literal("active"),
    v.literal("inactive"),
    v.literal("pending"),
    v.literal("deleted")
  ),
  roleSlugs: v.array(v.string()),
  workosUserId: v.string(),
});

export const acceptedInvitationValidator = v.object({
  adapter: v.union(v.literal("fake"), v.literal("workos")),
  operation: v.literal("inviteLenderUser"),
  status: v.literal("accepted"),
  sync: v.literal("waiting-for-webhook"),
  stagedAssignmentId: v.id("lenderOrganizationAssignments"),
  workosId: v.optional(v.string()),
});

export const lenderMemberDirectoryEntryValidator = v.union(
  v.object({
    kind: v.literal("member"),
    member: lenderMemberValidator,
  }),
  v.object({
    kind: v.literal("pending_invitation"),
    pendingInvitation: pendingInvitationValidator,
  })
);

export const LENDER_ORGANIZATION_PAGE_LIMIT = 5;
export const LENDER_MEMBER_PAGE_LIMIT = 25;

export function requireBoundedPage(
  paginationOpts: PaginationOptions,
  maximum: number,
  label: string
) {
  if (
    !Number.isSafeInteger(paginationOpts.numItems) ||
    paginationOpts.numItems < 1 ||
    paginationOpts.numItems > maximum
  ) {
    throw new Error(`${label} page size must be between 1 and ${maximum}`);
  }
}
