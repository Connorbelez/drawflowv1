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

export const BUILDER_ROLE_SLUGS = ["builder"] as const satisfies readonly RoleSlug[];

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

export type Workspace = "backoffice" | "builder";

export type WorkspaceAccessDecision =
  | { reason?: "demo-exception"; status: "allowed" }
  | { reason: "unauthenticated"; status: "unauthenticated" }
  | {
      reason: "no-workspace-access" | "onboarding-required";
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
  pathname: string;
  roles: readonly (string | null | undefined)[];
  workspace: Workspace;
}

export function normalizeRoleSlug(role: string | null | undefined): RoleSlug | null {
  if (!role) {
    return null;
  }
  return ROLE_ALIASES[role.trim().toLowerCase().replace(/\s+/g, "-")] ?? null;
}

export function normalizeRoleSlugs(
  roles: readonly (string | null | undefined)[]
): RoleSlug[] {
  return [...new Set(roles.map(normalizeRoleSlug).filter((role) => role !== null))];
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

  const roles = normalizeRoleSlugs(input.roles);
  if (roles.includes("member")) {
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

export function requireWorkspaceAccess(input: AuthAccessInput): WorkspaceAccessDecision {
  const decision = getWorkspaceAccessDecision(input);
  logRbacDebug("workspace access decision", {
    decision,
    input,
    normalizedRoles: normalizeRoleSlugs(input.roles),
  });

  if (decision.status === "allowed") {
    return decision;
  }

  if (decision.status === "unauthenticated") {
    throw redirect({
      href: `/api/auth/sign-in?returnTo=${encodeURIComponent(input.pathname)}`,
    });
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
