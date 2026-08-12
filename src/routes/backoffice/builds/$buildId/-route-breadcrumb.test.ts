import { describe, expect, test } from "vitest";

import { resolveBuildBreadcrumbLabel } from "./-route-breadcrumb";

describe("resolveBuildBreadcrumbLabel", () => {
  test("uses the canonical Build name when the projection is available", () => {
    expect(
      resolveBuildBreadcrumbLabel({
        detail: { build: { buildName: "  4-plex Proposal  " } },
      }),
    ).toBe("4-plex Proposal");
  });

  test("uses an intentional loading label before the projection resolves", () => {
    expect(resolveBuildBreadcrumbLabel({ detail: undefined })).toBe(
      "Loading build…",
    );
  });

  test("uses intentional fallback labels for invalid and unavailable Builds", () => {
    expect(
      resolveBuildBreadcrumbLabel({
        availability: {
          category: "invalidLink",
          requestedBuildId: "bad-build-id",
        },
        detail: null,
      }),
    ).toBe("Invalid build link");
    expect(
      resolveBuildBreadcrumbLabel({
        availability: {
          category: "accessDenied",
          requestedBuildId: "revoked-build-id",
        },
        detail: null,
      }),
    ).toBe("Build unavailable");
    expect(
      resolveBuildBreadcrumbLabel({
        availability: {
          category: "notFound",
          requestedBuildId: "deleted-build-id",
        },
        detail: null,
      }),
    ).toBe("Build unavailable");
  });

  test("waits for an availability result after an inaccessible projection", () => {
    expect(resolveBuildBreadcrumbLabel({ detail: null })).toBe(
      "Checking build access…",
    );
  });
});
