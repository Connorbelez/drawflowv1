import type { FunctionReturnType } from "convex/server";

import type { api } from "../../../convex/_generated/api";

export type UserManagementProjection = FunctionReturnType<
  typeof api.workosProjection.listUserManagement
>;

export type SyncStatusProjection = FunctionReturnType<
  typeof api.workosProjection.listSyncStatus
>;

export interface BrokerageProvisioningProjection {
  fairLendBootstrap: {
    displayName: string;
    principalBrokerEmail: string;
    principalBrokerWorkosUserId: string;
    workosOrganizationId: string;
  };
  organizations: OrganizationProvisioning[];
}

export type WorkosUserRow = UserManagementProjection["users"][number];

export interface WorkosOrganizationRow {
  _id?: string;
  name?: string;
  status?: string;
  workosOrganizationId: string;
}

export interface WorkosMembershipRow {
  _id?: string;
  roleSlug?: string;
  roleSlugs?: string[];
  status?: "active" | "inactive" | "pending" | "deleted";
  workosMembershipId: string;
  workosOrganizationId: string;
  workosUserId: string;
}

/**
 * WorkOS owns one mutable membership per external membership id. Projection
 * replay or legacy seed data can temporarily expose more than one local row
 * for that membership, so collapse those rows before rendering mutation
 * controls while preserving their complete projected role set.
 */
export function canonicalizeWorkosMembershipRows(
  memberships: WorkosMembershipRow[]
): WorkosMembershipRow[] {
  const canonicalByMembershipId = new Map<string, WorkosMembershipRow>();
  for (const membership of memberships) {
    const existing = canonicalByMembershipId.get(membership.workosMembershipId);
    if (!existing) {
      canonicalByMembershipId.set(membership.workosMembershipId, {
        ...membership,
        roleSlugs: membershipRoleSlugs(membership),
      });
      continue;
    }
    canonicalByMembershipId.set(membership.workosMembershipId, {
      ...existing,
      roleSlug: existing.roleSlug ?? membership.roleSlug,
      roleSlugs: [
        ...new Set([
          ...membershipRoleSlugs(existing),
          ...membershipRoleSlugs(membership),
        ]),
      ],
    });
  }
  return [...canonicalByMembershipId.values()];
}

function membershipRoleSlugs(membership: WorkosMembershipRow): string[] {
  return [
    ...new Set(
      [membership.roleSlug, ...(membership.roleSlugs ?? [])].filter(
        (role): role is string => Boolean(role)
      )
    ),
  ];
}

export interface WorkosRoleRow {
  _id?: string;
  description?: string;
  name?: string;
  resourceTypeSlug?: string;
  slug: string;
  status?: string;
  workosOrganizationId?: string;
}

export interface WorkosPermissionRow {
  _id?: string;
  name?: string;
  slug: string;
  status?: string;
  workosOrganizationId?: string;
}

export interface WorkosReceiptRow {
  _id?: string;
  eventId: string;
  eventType: string;
  processedAt?: number;
  status: string;
  workosCreatedAt?: number;
}

export interface BrokerageBlock {
  _id: string;
  displayName: string;
  legalName: string;
  principalBrokerEmail?: string;
  principalBrokerWorkosUserId?: string;
  status: string;
}

export interface BuilderProfileBlock {
  _id: string;
  displayName: string;
  status: string;
}

export interface OrganizationMembershipPreview {
  email?: string;
  name?: string;
  roleSlugs: string[];
  workosMembershipId: string;
  workosUserId: string;
}

export interface BuilderAccountLink {
  _id: string;
  role: "owner" | "staff";
  workosUserId: string;
}

export interface OrganizationProvisioning {
  brokerage: BrokerageBlock | null;
  brokerMemberships: OrganizationMembershipPreview[];
  builderAccountLinks: BuilderAccountLink[];
  builderMemberships: OrganizationMembershipPreview[];
  builderProfile: BuilderProfileBlock | null;
  hasBrokerageProfile: boolean;
  hasBuilderProfile: boolean;
  name: string;
  needsBrokerageProfile: boolean;
  needsBuilderProfile: boolean;
  status: string;
  workosOrganizationId: string;
}

export interface MembershipRoleUpdate {
  membershipId: string;
  primaryRoleSlug?: string;
  roleSlugs: string[];
}

export interface MembershipCreate {
  organizationId: string;
  primaryRoleSlug?: string;
  roleSlugs: string[];
  userId: string;
}

export interface InviteUserArgs {
  email: string;
  organizationId: string;
  roleSlug: string;
}

export interface ProvisionBrokerageArgs {
  displayName?: string;
  legalName?: string;
  principalBrokerWorkosUserId?: string;
  workosOrganizationId: string;
}

export interface ProvisionBuilderArgs {
  assignedBrokerWorkosUserId?: string;
  displayName?: string;
  ownerWorkosUserId?: string;
  workosOrganizationId: string;
}

export interface LinkBuilderAccountArgs {
  builderProfileId: string;
  role: "owner" | "staff";
  workosUserId: string;
}

export interface UserManagementHandlers {
  onCreateMembership: (args: MembershipCreate) => Promise<void>;
  onInviteUser: (args: InviteUserArgs) => Promise<void>;
  onLinkBuilderAccount: (args: LinkBuilderAccountArgs) => Promise<void>;
  onProvisionBrokerageProfile: (args: ProvisionBrokerageArgs) => Promise<void>;
  onProvisionBuilderProfile: (args: ProvisionBuilderArgs) => Promise<void>;
  onProvisionFairLendBrokerage: () => Promise<void>;
  onReactivateMembership: (membershipId: string) => Promise<void>;
  onRemoveMembership: (membershipId: string) => Promise<void>;
  onRoleUpdate: (args: MembershipRoleUpdate) => Promise<void>;
  onSyncDirectory: () => Promise<void>;
  onUnlinkBuilderAccount: (linkId: string) => Promise<void>;
}
