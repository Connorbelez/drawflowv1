export const REQUIRED_BUILD_COLLABORATION_ROLES = [
  "admin",
  "principle-broker",
  "broker",
  "builder",
  "broker-staff",
  "builder-staff",
  "homeowner",
  "contractor",
] as const;

export type BuildCollaborationPersonaRole =
  (typeof REQUIRED_BUILD_COLLABORATION_ROLES)[number];

/**
 * Canonical production shell for each collaboration persona. Builder Staff
 * intentionally uses the shared /builder shell; role-specific capabilities
 * are resolved by the Build authorization and app-permission projections.
 */
export const BUILD_COLLABORATION_ROUTE_PREFIX_BY_ROLE = {
  admin: "backoffice",
  "principle-broker": "backoffice",
  broker: "backoffice",
  builder: "builder",
  "broker-staff": "backoffice",
  "builder-staff": "builder",
  homeowner: "homeowner",
  contractor: "contractor",
} as const satisfies Record<BuildCollaborationPersonaRole, string>;

export function isBuildCollaborationPersonaRole(
  value: string
): value is BuildCollaborationPersonaRole {
  return (REQUIRED_BUILD_COLLABORATION_ROLES as readonly string[]).includes(
    value
  );
}

export function buildCollaborationBuildPath(
  role: BuildCollaborationPersonaRole,
  buildId: string
) {
  return `/${BUILD_COLLABORATION_ROUTE_PREFIX_BY_ROLE[role]}/builds/${encodeURIComponent(buildId)}`;
}
