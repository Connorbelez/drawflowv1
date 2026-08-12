import { describe, expect, test } from "vitest";

import { resolveRouteBreadcrumb } from "./route-breadcrumbs";

describe("resolveRouteBreadcrumb", () => {
  test("resolves static breadcrumb labels", () => {
    expect(
      resolveRouteBreadcrumb({
        params: {},
        staticData: {
          breadcrumb: {
            label: "Proposals",
            to: "/backoffice/proposals",
          },
        },
      })
    ).toEqual({
      label: "Proposals",
      to: "/backoffice/proposals",
    });
  });

  test("resolves dynamic breadcrumb labels from route params", () => {
    expect(
      resolveRouteBreadcrumb({
        params: {
          planId: "k571c7gk7brea4vm7ztbe842rn87xrzt",
        },
        staticData: {
          breadcrumb: {
            label: ({ params }) => params.planId,
            to: "/backoffice/proposals/$planId",
          },
        },
      })
    ).toEqual({
      label: "k571c7gk7brea4vm7ztbe842rn87xrzt",
      to: "/backoffice/proposals/$planId",
    });
  });

  test("skips missing dynamic breadcrumb labels", () => {
    expect(
      resolveRouteBreadcrumb({
        params: {},
        staticData: {
          breadcrumb: {
            label: ({ params }) => params.planId,
            to: "/backoffice/proposals/$planId",
          },
        },
      })
    ).toBeNull();
  });

  test("resolves dynamic route params and search state for a destination", () => {
    expect(
      resolveRouteBreadcrumb({
        params: { buildId: "active-build-01" },
        search: { focus: "draw:draw-01", tab: "details" },
        staticData: {
          breadcrumb: {
            label: "4-plex Proposal",
            params: ({ params }) => ({ buildId: params.buildId }),
            search: ({ search }) => search,
            to: "/backoffice/builds/$buildId",
          },
        },
      })
    ).toEqual({
      label: "4-plex Proposal",
      params: { buildId: "active-build-01" },
      search: { focus: "draw:draw-01", tab: "details" },
      to: "/backoffice/builds/$buildId",
    });
  });
});
