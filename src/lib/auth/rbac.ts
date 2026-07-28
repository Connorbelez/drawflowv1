import { redirect } from "@tanstack/react-router";

export const ROLE_SLUGS = [
  "member",
  "admin",
  "principle-broker",
  "broker",
  "broker-staff",
  "builder",
  "builder-staff",
  "contractor",
] as const;

export type RoleSlug = (typeof ROLE_SLUGS)[number];

export const BACKOFFICE_ROLE_SLUGS = [
  "admin",
  "principle-broker",
  "broker",
  "broker-staff",
] as const satisfies readonly RoleSlug[];

export const BUILDER_ROLE_SLUGS = [
  "admin",
  "builder",
  "builder-staff",
] as const satisfies readonly RoleSlug[];

export const USER_MANAGEMENT_WRITE_ROLE_SLUGS = [
  "admin",
  "principle-broker",
] as const satisfies readonly RoleSlug[];

export const NON_DESTRUCTIVE_WRITE_ROLE_SLUGS = [
  "admin",
  "principle-broker",
  "broker",
  "broker-staff",
] as const satisfies readonly RoleSlug[];

export const DESTRUCTIVE_WRITE_ROLE_SLUGS = [
  "admin",
  "principle-broker",
] as const satisfies readonly RoleSlug[];

export const ACTIVE_BUILD_FINAL_DECISION_ROLE_SLUGS = [
  "admin",
  "principle-broker",
] as const satisfies readonly RoleSlug[];

export function canMakeActiveBuildFinalDecision(
  roles: readonly (string | null | undefined)[]
): boolean {
  return hasAnyRole(
    normalizeRoleSlugs(roles),
    ACTIVE_BUILD_FINAL_DECISION_ROLE_SLUGS
  );
}

/**
 * Contractor Workspace is a first-class workspace with its own access policy
 * (PRD §11.1). The contractor role is the only role granted full workspace
 * access. The onboarding bridge has a looser policy — `member` or `contractor`
 * can reach `/contractor/onboarding` until the role + profile link resolve
 * (PRD §5.2, §11.1 onboarding bridge). The linked-profile requirement is
 * enforced by the backend (`requireContractorLinkedProfile`), so this RBAC
 * layer gates role + organization only.
 */
export const CONTRACTOR_WORKSPACE_ROLE_SLUGS = [
  "contractor",
] as const satisfies readonly RoleSlug[];

export const CONTRACTOR_ONBOARDING_ROLE_SLUGS = [
  "member",
  "contractor",
] as const satisfies readonly RoleSlug[];

export type Workspace = "backoffice" | "builder" | "contractor";

export type WorkspaceAccessDecision =
  | { reason?: "demo-exception"; status: "allowed" }
  | { reason: "unauthenticated"; status: "unauthenticated" }
  | {
      reason:
        | "missing-organization"
        | "no-workspace-access"
        | "onboarding-required"
        | "profile-link-required";
      status: "forbidden";
    };

const ROLE_ALIASES: Record<string, RoleSlug> = {
  "principal-broker": "principle-broker",
  "principle-broker": "principle-broker",
  admin: "admin",
  broker: "broker",
  "broker-staff": "broker-staff",
  broker_staff: "broker-staff",
  builder: "builder",
  "builder-staff": "builder-staff",
  builder_staff: "builder-staff",
  contractor: "contractor",
  member: "member",
};

export interface AuthAccessInput {
  isAuthenticated: boolean;
  organizationId?: string | null;
  pathname: string;
  /**
   * Whether the authenticated contractor role has a linked canonical profile.
   * Only meaningful for the contractor workspace; defaults to true so legacy
   * call sites (which never set it) behave as before. When false, a
   * contractor-role caller is routed to the profile-link resolution state
   * instead of the full workspace (PRD §11.1, §5.2).
   */
  profileLinked?: boolean;
  roles: readonly (string | null | undefined)[];
  workspace: Workspace;
}

export function normalizeRoleSlug(
  role: string | null | undefined
): RoleSlug | null {
  if (!role) {
    return null;
  }
  return ROLE_ALIASES[role.trim().toLowerCase().replace(/\s+/g, "-")] ?? null;
}

export function normalizeRoleSlugs(
  roles: readonly (string | null | undefined)[]
): RoleSlug[] {
  return [
    ...new Set(roles.map(normalizeRoleSlug).filter((role) => role !== null)),
  ];
}

export function roleLabel(role: RoleSlug): string {
  if (role === "principle-broker") {
    return "Principal Broker";
  }
  return role
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

export function getWorkspaceAccessDecision(
  input: AuthAccessInput
): WorkspaceAccessDecision {
  if (isBuilderDemoPath(input.pathname)) {
    return { reason: "demo-exception", status: "allowed" };
  }

  if (!input.isAuthenticated) {
    return { reason: "unauthenticated", status: "unauthenticated" };
  }

  if (!input.organizationId?.trim()) {
    return { reason: "missing-organization", status: "forbidden" };
  }

  const roles = normalizeRoleSlugs(input.roles);

  // Contractor Workspace has a two-tier policy (PRD §11.1). The onboarding
  // bridge at /contractor/onboarding is reachable by member OR contractor
  // roles; the rest of /contractor requires the contractor role. The
  // linked-profile requirement is enforced by the backend, surfaced here as a
  // profile-link-required forbidden reason when the contractor role is present
  // but the caller opts out via the `profileLinked` input (default true so
  // existing call sites are unaffected).
  if (input.workspace === "contractor") {
    if (isContractorOnboardingPath(input.pathname)) {
      return hasAnyRole(roles, CONTRACTOR_ONBOARDING_ROLE_SLUGS)
        ? { status: "allowed" }
        : { reason: "no-workspace-access", status: "forbidden" };
    }
    if (!hasAnyRole(roles, CONTRACTOR_WORKSPACE_ROLE_SLUGS)) {
      // A member without the contractor role belongs on the onboarding bridge.
      return roles.includes("member")
        ? { reason: "onboarding-required", status: "forbidden" }
        : { reason: "no-workspace-access", status: "forbidden" };
    }
    return input.profileLinked === false
      ? { reason: "profile-link-required", status: "forbidden" }
      : { status: "allowed" };
  }

  if (roles.length === 1 && roles.includes("member")) {
    return { reason: "onboarding-required", status: "forbidden" };
  }

  const allowed =
    input.workspace === "backoffice"
      ? hasAnyRole(roles, BACKOFFICE_ROLE_SLUGS)
      : hasAnyRole(roles, BUILDER_ROLE_SLUGS);

  return allowed
    ? { status: "allowed" }
    : { reason: "no-workspace-access", status: "forbidden" };
}

export function hasBuilderStaffWorkspaceAccess(
  roles: readonly (string | null | undefined)[]
): boolean {
  const normalizedRoles = normalizeRoleSlugs(roles);
  return (
    normalizedRoles.includes("admin") ||
    normalizedRoles.includes("builder-staff")
  );
}

export function requireWorkspaceAccess(
  input: AuthAccessInput
): WorkspaceAccessDecision {
  const decision = getWorkspaceAccessDecision(input);
  logRbacDebug("workspace access decision", {
    decision,
    input,
    normalizedRoles: normalizeRoleSlugs(input.roles),
  });

  if (decision.status === "allowed") {
    return decision;
  }

  throwAccessRedirect(input, decision);
}

export function getUserManagementAccessDecision(
  input: AuthAccessInput
): WorkspaceAccessDecision {
  const workspaceDecision = getWorkspaceAccessDecision({
    ...input,
    workspace: "backoffice",
  });
  if (workspaceDecision.status !== "allowed") {
    return workspaceDecision;
  }

  return hasAnyRole(
    normalizeRoleSlugs(input.roles),
    USER_MANAGEMENT_WRITE_ROLE_SLUGS
  )
    ? { status: "allowed" }
    : { reason: "no-workspace-access", status: "forbidden" };
}

export function requireUserManagementWriteAccess(
  input: AuthAccessInput
): WorkspaceAccessDecision {
  const decision = getUserManagementAccessDecision(input);
  logRbacDebug("user management access decision", {
    decision,
    input,
    normalizedRoles: normalizeRoleSlugs(input.roles),
  });

  if (decision.status === "allowed") {
    return decision;
  }

  throwAccessRedirect({ ...input, workspace: "backoffice" }, decision);
}

function throwAccessRedirect(
  input: AuthAccessInput,
  decision: Exclude<WorkspaceAccessDecision, { status: "allowed" }>
): never {
  if (decision.status === "unauthenticated") {
    throw redirect({
      href: `/api/auth/sign-in?returnPathname=${encodeURIComponent(input.pathname)}`,
    });
  }

  // Contractor onboarding-required / profile-link-required states route the
  // caller to the onboarding bridge rather than the generic protected-access
  // page, so they can resolve their identity in place (PRD §11.1).
  if (
    input.workspace === "contractor" &&
    (decision.reason === "onboarding-required" ||
      decision.reason === "profile-link-required")
  ) {
    throw redirect({ to: "/contractor/onboarding" });
  }

  throw redirect({
    to: "/protected-access",
    search: {
      reason: decision.reason,
      workspace: input.workspace,
    },
  });
}

export function isBuilderDemoPath(pathname: string): boolean {
  return pathname === "/builder/demo" || pathname.startsWith("/builder/demo/");
}

/**
 * The onboarding bridge is the single contractor path a `member` role may
 * reach (PRD §5.2, §11.1). It is also where a contractor without a linked
 * profile lands to resolve their identity.
 */
export function isContractorOnboardingPath(pathname: string): boolean {
  return (
    pathname === "/contractor/onboarding" ||
    pathname.startsWith("/contractor/onboarding/")
  );
}

/**
 * Any path under the contractor route family. Used to scope the contractor
 * workspace guard.
 */
export function isContractorPath(pathname: string): boolean {
  return pathname === "/contractor" || pathname.startsWith("/contractor/");
}

function hasAnyRole(
  actual: readonly RoleSlug[],
  allowed: readonly RoleSlug[]
): boolean {
  return actual.some((role) => allowed.includes(role));
}

function logRbacDebug(label: string, payload: unknown) {
  if (import.meta.env.PROD) {
    return;
  }

  console.info(`[drawflow:rbac] ${label}`, payload);
}
