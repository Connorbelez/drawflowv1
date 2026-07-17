import { normalizeRoleSlugs } from "#/lib/auth/rbac.ts";

export type AccessDestination =
  | "/backoffice"
  | "/builder"
  | "/builder-staff"
  | "/contractor"
  | "/contractor/onboarding";

const BACKOFFICE_ROLES = new Set([
  "admin",
  "principle-broker",
  "broker",
  "broker-staff",
]);

export function resolveAccessDestination(
  roles: readonly (string | null | undefined)[]
): AccessDestination | null {
  const normalizedRoles = normalizeRoleSlugs(roles);

  if (normalizedRoles.some((role) => BACKOFFICE_ROLES.has(role))) {
    return "/backoffice";
  }
  if (normalizedRoles.includes("builder")) {
    return "/builder";
  }
  if (normalizedRoles.includes("builder-staff")) {
    return "/builder-staff";
  }
  if (normalizedRoles.includes("contractor")) {
    return "/contractor";
  }
  if (normalizedRoles.includes("member")) {
    return "/contractor/onboarding";
  }

  return null;
}
