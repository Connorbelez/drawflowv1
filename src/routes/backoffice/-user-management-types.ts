import type { FunctionReturnType } from "convex/server";

import type { api } from "../../../convex/_generated/api";

export type UserManagementProjection = FunctionReturnType<
  typeof api.workosProjection.listUserManagement
>;

export type SyncStatusProjection = FunctionReturnType<
  typeof api.workosProjection.listSyncStatus
>;

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
  status: string;
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
