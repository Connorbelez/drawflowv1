import { describe, expect, it, vi } from "vitest";

import {
  canUseAppPermission,
  filterMaterialPlanningActionsForPermissions,
  hasAnyAppPermission,
  type BuilderStaffAppPermissions,
} from "./app-permissions.ts";

const limitedPermissions: BuilderStaffAppPermissions = {
  grants: [
    {
      canCreate: false,
      canDelete: false,
      canUpdate: true,
      canView: true,
      resourceType: "material",
    },
    {
      canCreate: false,
      canDelete: false,
      canUpdate: false,
      canView: true,
      resourceType: "draw",
    },
  ],
  mode: "limited",
  role: "staff",
};

describe("builder staff app permissions", () => {
  it("allows full access when no limited projection is present", () => {
    expect(canUseAppPermission(undefined, "draw", "delete")).toBe(true);
    expect(
      canUseAppPermission({ grants: [], mode: "full" }, "draw", "delete"),
    ).toBe(true);
  });

  it("uses resource/action grants for limited staff", () => {
    expect(canUseAppPermission(limitedPermissions, "material", "update")).toBe(
      true,
    );
    expect(canUseAppPermission(limitedPermissions, "material", "create")).toBe(
      false,
    );
    expect(canUseAppPermission(limitedPermissions, "draw", "view")).toBe(true);
    expect(canUseAppPermission(limitedPermissions, "draw", "update")).toBe(
      false,
    );
  });

  it("checks whether any requested action is available", () => {
    expect(
      hasAnyAppPermission(limitedPermissions, [
        ["draw", "update"],
        ["material", "update"],
      ]),
    ).toBe(true);
    expect(
      hasAnyAppPermission(limitedPermissions, [
        ["draw", "update"],
        ["contractor", "update"],
      ]),
    ).toBe(false);
  });

  it("filters material planning actions independently", () => {
    const actions = {
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    };

    const filtered = filterMaterialPlanningActionsForPermissions(
      limitedPermissions,
      actions,
    );

    expect(filtered?.create).toBeUndefined();
    expect(filtered?.delete).toBeUndefined();
    expect(filtered?.update).toBe(actions.update);
  });
});
