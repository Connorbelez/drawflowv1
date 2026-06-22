import type { MaterialPlanningActions } from "#/features/material-planning/MaterialPlanningTab.tsx";

export type BuilderStaffPermissionResource =
  | "capitalEvent"
  | "contractor"
  | "draw"
  | "evidence"
  | "material"
  | "milestone"
  | "reminder"
  | "submilestone";

export type BuilderStaffPermissionAction =
  | "create"
  | "delete"
  | "update"
  | "view";

export interface BuilderStaffPermissionGrant {
  canCreate: boolean;
  canDelete: boolean;
  canUpdate: boolean;
  canView: boolean;
  resourceType: BuilderStaffPermissionResource;
}

export interface BuilderStaffAppPermissions {
  grants?: BuilderStaffPermissionGrant[];
  mode?: "full" | "limited";
  role?: "backoffice" | "owner" | "staff" | string;
}

type PermissionCheck = readonly [
  BuilderStaffPermissionResource,
  BuilderStaffPermissionAction,
];

const ACTION_FIELD = {
  create: "canCreate",
  delete: "canDelete",
  update: "canUpdate",
  view: "canView",
} as const satisfies Record<BuilderStaffPermissionAction, keyof BuilderStaffPermissionGrant>;

export function canUseAppPermission(
  permissions: BuilderStaffAppPermissions | null | undefined,
  resourceType: BuilderStaffPermissionResource,
  action: BuilderStaffPermissionAction,
) {
  if (!permissions || permissions.mode === "full") {
    return true;
  }
  const grant = permissions.grants?.find(
    (candidate) => candidate.resourceType === resourceType,
  );
  return Boolean(grant?.[ACTION_FIELD[action]]);
}

export function hasAnyAppPermission(
  permissions: BuilderStaffAppPermissions | null | undefined,
  checks: PermissionCheck[],
) {
  return checks.some(([resourceType, action]) =>
    canUseAppPermission(permissions, resourceType, action),
  );
}

export function filterMaterialPlanningActionsForPermissions(
  permissions: BuilderStaffAppPermissions | null | undefined,
  actions: MaterialPlanningActions | undefined,
) {
  if (!actions) {
    return undefined;
  }
  const filtered: MaterialPlanningActions = {
    ...(actions.create && canUseAppPermission(permissions, "material", "create")
      ? { create: actions.create }
      : {}),
    ...(actions.delete && canUseAppPermission(permissions, "material", "delete")
      ? { delete: actions.delete }
      : {}),
    ...(actions.update && canUseAppPermission(permissions, "material", "update")
      ? { update: actions.update }
      : {}),
  };
  return filtered.create || filtered.delete || filtered.update
    ? filtered
    : undefined;
}

export const PROPOSAL_TIMELINE_EDIT_PERMISSION_CHECKS: PermissionCheck[] = [
  ["capitalEvent", "create"],
  ["capitalEvent", "delete"],
  ["capitalEvent", "update"],
  ["draw", "create"],
  ["draw", "delete"],
  ["draw", "update"],
  ["evidence", "create"],
  ["evidence", "delete"],
  ["evidence", "update"],
  ["milestone", "create"],
  ["milestone", "delete"],
  ["milestone", "update"],
  ["submilestone", "create"],
  ["submilestone", "delete"],
  ["submilestone", "update"],
];

export const ACTIVE_BUILD_TIMELINE_EDIT_PERMISSION_CHECKS: PermissionCheck[] = [
  ...PROPOSAL_TIMELINE_EDIT_PERMISSION_CHECKS,
  ["reminder", "create"],
  ["reminder", "delete"],
  ["reminder", "update"],
];
