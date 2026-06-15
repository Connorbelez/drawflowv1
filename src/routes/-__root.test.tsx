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

import { RootDocument, RootError } from "./__root.tsx";

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
});
