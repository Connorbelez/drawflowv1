// @vitest-environment jsdom

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-devtools", () => ({
  TanStackDevtools: () => null,
}));

vi.mock("@tanstack/react-query", () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="query-client-provider">{children}</div>
  ),
}));

vi.mock("@tanstack/react-router", () => ({
  createRootRouteWithContext: () => (config: unknown) => config,
  HeadContent: () => null,
  Scripts: () => null,
  useRouter: () => ({
    options: {
      context: {
        queryClient: {},
      },
    },
  }),
}));

vi.mock("@tanstack/react-router-devtools", () => ({
  TanStackRouterDevtoolsPanel: () => null,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    handler: (handler: unknown) => handler,
  }),
}));

vi.mock("@workos/authkit-tanstack-react-start", () => ({
  getAuth: vi.fn(),
}));

vi.mock("../components/ui/sonner", () => ({
  Toaster: (props: {
    closeButton?: boolean;
    position?: string;
    richColors?: boolean;
  }) => <div data-position={props.position} data-testid="global-toaster" />,
}));

vi.mock("../components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="tooltip-provider">{children}</div>
  ),
}));

vi.mock("../integrations/convex/provider", () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="convex-provider">{children}</div>
  ),
}));

vi.mock("../integrations/tanstack-query/devtools", () => ({
  default: null,
}));

vi.mock("../integrations/workos/provider", () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="workos-provider">{children}</div>
  ),
}));

import { getAuth } from "@workos/authkit-tanstack-react-start";

import { RootDocument, RootError, Route } from "./__root.tsx";

describe("RootDocument", () => {
  test("mounts the global toast renderer for sonner feedback", () => {
    const markup = renderToStaticMarkup(
      <RootDocument>
        <main>Workspace</main>
      </RootDocument>,
    );

    expect(markup).toContain('data-testid="global-toaster"');
    expect(markup).toContain('data-position="top-right"');
  });

  test("runs local service-worker recovery before route hydration", () => {
    const markup = renderToStaticMarkup(
      <RootDocument>
        <main>Workspace</main>
      </RootDocument>
    );

    expect(markup).toContain("drawflow:dev-service-worker-recovery-attempts");
    expect(markup).toContain("getRegistrations");
    expect(markup.indexOf("getRegistrations")).toBeLessThan(
      markup.indexOf("Workspace")
    );
  });
});

describe("RootError", () => {
  test("renders a recoverable route error surface", () => {
    const markup = renderToStaticMarkup(
      <RootError
        error={new Error("Failed to fetch dynamically imported module")}
        reset={vi.fn()}
      />,
    );

    expect(markup).toContain("DrawFlow could not load this screen.");
    expect(markup).toContain("Failed to fetch dynamically imported module");
    expect(markup).toContain("Try again");
    expect(markup).toContain("Back to backoffice");
  });

  test("redacts mutation names, request ids, file paths, and stack traces from route failures", () => {
    const markup = renderToStaticMarkup(
      <RootError
        error={new Error(
          "[Request ID: req_123] Could not run mutation api.workosManagement.updateMembershipRoles from /Users/connor/Dev/drawFlow/v1/drawflowv1-core-workflow-remediation-20260717/convex/workosManagement.ts\n    at handler (/Users/connor/Dev/drawFlow/v1/drawflowv1-core-workflow-remediation-20260717/convex/workosManagement.ts:231:5)\n    at stack trace frame",
        )}
        reset={vi.fn()}
      />,
    );

    expect(markup).toContain("DrawFlow could not load this screen.");
    expect(markup).not.toContain("api.workosManagement.updateMembershipRoles");
    expect(markup).not.toContain("req_123");
    expect(markup).not.toContain("/Users/connor/Dev/drawFlow");
    expect(markup).not.toContain("stack trace frame");
  });
});

describe("root auth boundary", () => {
  test("treats AuthKit failures as an unauthenticated local session", async () => {
    vi.mocked(getAuth).mockRejectedValueOnce(new Error("HTTPError"));
    const rootBeforeLoad = (
      Route as unknown as {
        beforeLoad?: (input: never) => Promise<unknown>;
      }
    ).beforeLoad;

    const auth = await rootBeforeLoad?.({
      context: {
        convexQueryClient: {
          serverHttpClient: {
            clearAuth: vi.fn(),
            setAuth: vi.fn(),
          },
        },
      },
    } as never);

    expect(auth).toEqual({
      initialAuth: null,
      organizationId: null,
      permissions: [],
      role: null,
      roles: [],
      token: null,
      userId: null,
    });
  });

  test("seeds client initialAuth from the resolved AuthKit session", async () => {
    vi.mocked(getAuth).mockResolvedValueOnce({
      accessToken: "header.payload.sig",
      entitlements: ["backoffice"],
      featureFlags: ["beta"],
      impersonator: undefined,
      organizationId: "org_123",
      permissions: ["proposal:read"],
      role: "admin",
      roles: ["admin", "broker"],
      sessionId: "session_123",
      user: { email: "admin@example.com", id: "user_123" },
    } as never);
    const rootBeforeLoad = (
      Route as unknown as {
        beforeLoad?: (input: never) => Promise<unknown>;
      }
    ).beforeLoad;

    const auth = (await rootBeforeLoad?.({ context: {} } as never)) as {
      initialAuth: {
        organizationId?: string;
        sessionId: string;
        user: { id: string };
      };
      token: string | null;
    };

    expect(auth.token).toBe("header.payload.sig");
    expect(auth.initialAuth.user.id).toBe("user_123");
    expect(auth.initialAuth.sessionId).toBe("session_123");
    expect(auth.initialAuth.organizationId).toBe("org_123");
  });
});
