// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import { AccessPortalPage } from "#/features/access-portal/AccessPortalPage.tsx";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router",
  );
  return {
    ...actual,
    createFileRoute: () => (config: unknown) => config,
    redirect: (options: unknown) => options,
  };
});

import { Route } from "./index.tsx";

describe("root access portal", () => {
  test("renders the persona-specific sign-in and onboarding surface", () => {
    const markup = renderToStaticMarkup(<AccessPortalPage />);

    expect(markup).toContain("One entry point. Your DrawFlow workspace.");
    expect(markup).toContain("Builder or developer");
    expect(markup).toContain("Lender team");
    expect(markup).toContain("Contractor");
    expect(markup).toContain("Continue to secure sign in");
  });

  test("redirects authenticated lender roles before rendering the portal", () => {
    expect(() =>
      Route.beforeLoad?.({
        context: {
          role: "broker",
          roles: ["builder"],
          userId: "user_123",
        },
      } as never),
    ).toThrowError();
  });

  test("keeps unauthenticated visitors at root", () => {
    expect(
      Route.beforeLoad?.({
        context: { role: null, roles: [], userId: null },
      } as never),
    ).toBeUndefined();
  });
});
