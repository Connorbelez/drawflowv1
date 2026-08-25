import type { DirectoryUser } from "./-user-management-detail-sheet";
import type {
  OrganizationProvisioning,
  WorkosMembershipRow,
  WorkosOrganizationRow,
  WorkosRoleRow,
} from "./-user-management-types";

export const BROKER_ROLES = ["principle-broker", "broker", "broker-staff"];
export const BUILDER_ROLES = ["builder", "builder-staff"];

export type ProfileFilter =
  | "all"
  | "complete"
  | "linked"
  | "missing"
  | "brokerage-missing"
  | "builder-missing";
export type SortMode =
  | "attention"
  | "name-asc"
  | "role"
  | "org-count"
  | "status";
export type StatusFilter = "all" | "active" | "inactive" | "pending";

export interface DirectoryStats {
  brokers: number;
  builders: number;
  missingBrokerageProfile: number;
  missingBuilderProfile: number;
  organizations: number;
  people: number;
}

export function uniqueRoles(memberships: WorkosMembershipRow[]): string[] {
  const set = new Set<string>();
  for (const membership of memberships) {
    if (membership.status === "deleted") {
      continue;
    }
    if (membership.roleSlug) {
      set.add(membership.roleSlug);
    }
    for (const role of membership.roleSlugs ?? []) {
      set.add(role);
    }
  }
  return [...set].sort();
}

export function computeProfileFlags(
  memberships: WorkosMembershipRow[],
  provisioningByOrg: Map<string, OrganizationProvisioning>
): {
  brokerage: boolean;
  builder: boolean;
  needsBrokerage: boolean;
  needsBuilder: boolean;
} {
  let brokerage = false;
  let builder = false;
  let needsBrokerage = false;
  let needsBuilder = false;
  for (const membership of memberships) {
    if (membership.status !== "active") {
      continue;
    }
    const provisioning = provisioningByOrg.get(membership.workosOrganizationId);
    if (!provisioning) {
      continue;
    }
    const roles = membershipRoles(membership);
    const isBroker = roles.some((role) => BROKER_ROLES.includes(role));
    const isBuilder = roles.some((role) => BUILDER_ROLES.includes(role));
    if (isBroker) {
      if (provisioning.hasBrokerageProfile) {
        brokerage = true;
      } else {
        needsBrokerage = true;
      }
    }
    if (isBuilder) {
      if (provisioning.hasBuilderProfile) {
        builder = true;
      } else {
        needsBuilder = true;
      }
    }
  }
  return { brokerage, builder, needsBrokerage, needsBuilder };
}

function membershipRoles(membership: WorkosMembershipRow): string[] {
  const set = new Set<string>();
  if (membership.roleSlug) {
    set.add(membership.roleSlug);
  }
  for (const role of membership.roleSlugs ?? []) {
    set.add(role);
  }
  return [...set];
}

export function computeStats(
  directoryUsers: DirectoryUser[],
  provisioningByOrg: Map<string, OrganizationProvisioning>,
  organizations: WorkosOrganizationRow[]
): DirectoryStats {
  let brokers = 0;
  let builders = 0;
  const brokerSeen = new Set<string>();
  const builderSeen = new Set<string>();
  for (const entry of directoryUsers) {
    for (const membership of entry.memberships) {
      if (membership.status !== "active") {
        continue;
      }
      const roles = membershipRoles(membership);
      if (
        roles.some((role) => BROKER_ROLES.includes(role)) &&
        !brokerSeen.has(membership.workosUserId)
      ) {
        brokers += 1;
        brokerSeen.add(membership.workosUserId);
      }
      if (
        roles.some((role) => BUILDER_ROLES.includes(role)) &&
        !builderSeen.has(membership.workosUserId)
      ) {
        builders += 1;
        builderSeen.add(membership.workosUserId);
      }
    }
  }
  let missingBrokerageProfile = 0;
  let missingBuilderProfile = 0;
  for (const row of provisioningByOrg.values()) {
    if (row.needsBrokerageProfile) {
      missingBrokerageProfile += 1;
    }
    if (row.needsBuilderProfile) {
      missingBuilderProfile += 1;
    }
  }
  return {
    brokers,
    builders,
    missingBrokerageProfile,
    missingBuilderProfile,
    organizations: organizations.length,
    people: directoryUsers.filter((entry) => entry.user.status === "active")
      .length,
  };
}

export function filterUsers(
  directoryUsers: DirectoryUser[],
  {
    organizationFilter,
    organizationsById,
    profileFilter,
    provisioningByOrg,
    query,
    roleFilter,
    sortMode,
    statusFilter,
  }: {
    organizationFilter: string;
    organizationsById: Map<string, WorkosOrganizationRow>;
    profileFilter: ProfileFilter;
    provisioningByOrg: Map<string, OrganizationProvisioning>;
    query: string;
    roleFilter: string;
    sortMode: SortMode;
    statusFilter: StatusFilter;
  }
): DirectoryUser[] {
  const normalized = query.trim().toLowerCase();
  return directoryUsers
    .filter((entry) =>
      matchesEntry(entry, {
        normalized,
        organizationFilter,
        organizationsById,
        profileFilter,
        provisioningByOrg,
        roleFilter,
        statusFilter,
      })
    )
    .sort((a, b) =>
      compareDirectoryUsers(a, b, {
        provisioningByOrg,
        sortMode,
      })
    );
}

function matchesEntry(
  entry: DirectoryUser,
  {
    normalized,
    organizationFilter,
    organizationsById,
    profileFilter,
    provisioningByOrg,
    roleFilter,
    statusFilter,
  }: {
    normalized: string;
    organizationFilter: string;
    organizationsById: Map<string, WorkosOrganizationRow>;
    profileFilter: ProfileFilter;
    provisioningByOrg: Map<string, OrganizationProvisioning>;
    roleFilter: string;
    statusFilter: StatusFilter;
  }
): boolean {
  if (!matchesRole(entry, roleFilter)) {
    return false;
  }
  if (!matchesOrganization(entry, organizationFilter)) {
    return false;
  }
  if (!matchesStatus(entry, statusFilter)) {
    return false;
  }
  if (!matchesProfile(entry, profileFilter, provisioningByOrg)) {
    return false;
  }
  return matchesQuery(entry, normalized, organizationsById);
}

function matchesRole(entry: DirectoryUser, roleFilter: string): boolean {
  if (roleFilter === "all") {
    return true;
  }
  return entry.memberships.some((membership) =>
    membershipRoles(membership).includes(roleFilter)
  );
}

function matchesOrganization(
  entry: DirectoryUser,
  organizationFilter: string
): boolean {
  if (organizationFilter === "all") {
    return true;
  }
  return entry.memberships.some(
    (membership) =>
      membership.status === "active" &&
      membership.workosOrganizationId === organizationFilter
  );
}

function matchesStatus(
  entry: DirectoryUser,
  statusFilter: StatusFilter
): boolean {
  if (statusFilter === "active") {
    return entry.user.status === "active";
  }
  if (statusFilter === "inactive") {
    return entry.user.status !== "active";
  }
  if (statusFilter === "pending") {
    return entry.user.status === "pending";
  }
  return true;
}

function matchesProfile(
  entry: DirectoryUser,
  profileFilter: ProfileFilter,
  provisioningByOrg: Map<string, OrganizationProvisioning>
): boolean {
  if (profileFilter === "all") {
    return true;
  }
  const flags = computeProfileFlags(entry.memberships, provisioningByOrg);
  if (profileFilter === "missing") {
    return flags.needsBrokerage || flags.needsBuilder;
  }
  if (profileFilter === "brokerage-missing") {
    return flags.needsBrokerage;
  }
  if (profileFilter === "builder-missing") {
    return flags.needsBuilder;
  }
  if (profileFilter === "linked") {
    return flags.brokerage || flags.builder;
  }
  return (
    (flags.brokerage || flags.builder) &&
    !flags.needsBrokerage &&
    !flags.needsBuilder
  );
}

function matchesQuery(
  entry: DirectoryUser,
  normalized: string,
  organizationsById: Map<string, WorkosOrganizationRow>
): boolean {
  if (!normalized) {
    return true;
  }
  const hay =
    `${entry.displayName} ${entry.user.email ?? ""} ${entry.user.workosUserId ?? ""}`.toLowerCase();
  if (hay.includes(normalized)) {
    return true;
  }
  return entry.memberships.some((membership) =>
    `${membership.workosOrganizationId} ${
      organizationsById.get(membership.workosOrganizationId)?.name ?? ""
    }`
      .toLowerCase()
      .includes(normalized)
  );
}

function compareDirectoryUsers(
  a: DirectoryUser,
  b: DirectoryUser,
  {
    provisioningByOrg,
    sortMode,
  }: {
    provisioningByOrg: Map<string, OrganizationProvisioning>;
    sortMode: SortMode;
  }
): number {
  if (sortMode === "attention") {
    return (
      attentionScore(b, provisioningByOrg) -
        attentionScore(a, provisioningByOrg) || compareNames(a, b)
    );
  }
  if (sortMode === "role") {
    return primaryRole(a).localeCompare(primaryRole(b)) || compareNames(a, b);
  }
  if (sortMode === "org-count") {
    return activeOrgCount(b) - activeOrgCount(a) || compareNames(a, b);
  }
  if (sortMode === "status") {
    return (
      statusRank(a.user.status).localeCompare(statusRank(b.user.status)) ||
      compareNames(a, b)
    );
  }
  return compareNames(a, b);
}

function attentionScore(
  entry: DirectoryUser,
  provisioningByOrg: Map<string, OrganizationProvisioning>
): number {
  const flags = computeProfileFlags(entry.memberships, provisioningByOrg);
  let score = 0;
  if (flags.needsBrokerage) {
    score += 40;
  }
  if (flags.needsBuilder) {
    score += 40;
  }
  if (entry.user.status !== "active") {
    score += 15;
  }
  if (activeOrgCount(entry) === 0) {
    score += 10;
  }
  return score;
}

function activeOrgCount(entry: DirectoryUser): number {
  return new Set(
    entry.memberships
      .filter((membership) => membership.status === "active")
      .map((membership) => membership.workosOrganizationId)
  ).size;
}

function compareNames(a: DirectoryUser, b: DirectoryUser): number {
  return a.displayName.localeCompare(b.displayName, undefined, {
    sensitivity: "base",
  });
}

export function organizationLabel(organization: WorkosOrganizationRow): string {
  return organization.name ?? organization.workosOrganizationId;
}

function primaryRole(entry: DirectoryUser): string {
  return uniqueRoles(entry.memberships)[0] ?? "zz-no-role";
}

function statusRank(status?: string | null): string {
  if (status === "active") {
    return "1-active";
  }
  if (status === "pending") {
    return "2-pending";
  }
  if (status === "inactive") {
    return "3-inactive";
  }
  return "4-other";
}

export function collectRoleOptions(
  roles: WorkosRoleRow[],
  organizationRoles: WorkosRoleRow[],
  memberships: WorkosMembershipRow[]
): string[] {
  const collected = new Set<string>();
  for (const role of roles) {
    if (role.status !== "deleted" && role.slug) {
      collected.add(role.slug);
    }
  }
  for (const role of organizationRoles) {
    if (role.status !== "deleted" && role.slug) {
      collected.add(role.slug);
    }
  }
  for (const membership of memberships) {
    if (membership.roleSlug) {
      collected.add(membership.roleSlug);
    }
    for (const role of membership.roleSlugs ?? []) {
      collected.add(role);
    }
  }
  return [...collected].sort();
}

export function collectRoleOptionsByOrganization(
  roles: WorkosRoleRow[],
  organizationRoles: WorkosRoleRow[],
  memberships: WorkosMembershipRow[],
  organizations: WorkosOrganizationRow[]
): Map<string, string[]> {
  const environmentRoles = roles
    .filter((role) => role.status !== "deleted" && role.slug)
    .map((role) => role.slug);
  const collected = new Map<string, Set<string>>();

  for (const organization of organizations) {
    collected.set(organization.workosOrganizationId, new Set(environmentRoles));
  }
  for (const role of organizationRoles) {
    if (role.status === "deleted" || !role.slug || !role.workosOrganizationId) {
      continue;
    }
    const options =
      collected.get(role.workosOrganizationId) ?? new Set(environmentRoles);
    options.add(role.slug);
    collected.set(role.workosOrganizationId, options);
  }
  for (const membership of memberships) {
    const options =
      collected.get(membership.workosOrganizationId) ??
      new Set(environmentRoles);
    if (membership.roleSlug) {
      options.add(membership.roleSlug);
    }
    for (const role of membership.roleSlugs ?? []) {
      options.add(role);
    }
    collected.set(membership.workosOrganizationId, options);
  }

  return new Map(
    [...collected].map(([organizationId, options]) => [
      organizationId,
      [...options].sort(),
    ])
  );
}

const INITIALS_EMAIL_RE = /@.*/;
const INITIALS_SPLIT_RE = /[\s._-]+/;

export function makeInitials(
  name: string | null | undefined,
  email: string | null | undefined
): string {
  const source = (name?.trim() || email?.trim() || "??").toString();
  const parts = source
    .replace(INITIALS_EMAIL_RE, "")
    .split(INITIALS_SPLIT_RE)
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}
