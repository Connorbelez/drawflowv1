import type { ConvexQueryClient } from "@convex-dev/react-query";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { createServerFn } from "@tanstack/react-start";
import { getAuth } from "@workos/authkit-tanstack-react-start";
import type { ConvexReactClient } from "convex/react";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import type { ReactElement, ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { Toaster } from "../components/ui/sonner";
import { TooltipProvider } from "../components/ui/tooltip";
import ConvexProvider from "../integrations/convex/provider";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import WorkOSProvider from "../integrations/workos/provider";
import appCss from "../styles.css?url";
import { VISUAL_PARITY_ORGANIZATION_ID } from "#/features/production-proposals/visualParityFixtures.ts";

interface RouterContext {
  convexClient: ConvexReactClient;
  convexQueryClient: ConvexQueryClient;
  organizationId?: string | null;
  permissions?: string[];
  queryClient: QueryClient;
  role?: string | null;
  roles?: string[];
  token?: string | null;
  userId?: string | null;
}

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);root.style.colorScheme=resolved;}catch(e){}})();`;

const fetchWorkosAuth = createServerFn({ method: "GET" }).handler(async () => {
  if (isVisualParityFixtureEnabled()) {
    const fixtureAuth = {
      organizationId: VISUAL_PARITY_ORGANIZATION_ID,
      permissions: ["proposal:read", "proposal:write"],
      role: "admin",
      roles: ["admin", "builder", "broker"],
      token: null,
      userId: "user_visual_parity",
    };
    logAuthDebug("visual parity auth fixture", {
      organizationId: fixtureAuth.organizationId,
      permissionCount: fixtureAuth.permissions.length,
      role: fixtureAuth.role,
      roleCount: fixtureAuth.roles.length,
      tokenPresent: false,
      userPresent: true,
    });
    return fixtureAuth;
  }

  const auth = await getAuth();
  const authPayload = {
    featureFlagCount: auth.user ? (auth.featureFlags ?? []).length : 0,
    impersonatorPresent: Boolean(auth.user && auth.impersonator),
    organizationId: auth.user ? (auth.organizationId ?? null) : null,
    permissionCount: auth.user ? (auth.permissions ?? []).length : 0,
    role: auth.user ? (auth.role ?? null) : null,
    roleCount: auth.user ? (auth.roles ?? []).length : 0,
    sessionPresent: Boolean(auth.user && auth.sessionId),
    tokenPresent: Boolean(auth.user && auth.accessToken),
    userPresent: Boolean(auth.user),
  };

  logAuthDebug("getAuth payload", authPayload);

  return {
    organizationId: authPayload.organizationId,
    permissions: auth.user ? (auth.permissions ?? []) : [],
    role: authPayload.role,
    roles: auth.user ? (auth.roles ?? []) : [],
    token: auth.user ? auth.accessToken : null,
    userId: auth.user?.id ?? null,
  };
});

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async (ctx) => {
    const auth = await fetchWorkosAuth();
    const { token } = auth;

    if (token) {
      ctx.context.convexQueryClient.serverHttpClient?.setAuth(token);
    } else {
      ctx.context.convexQueryClient.serverHttpClient?.clearAuth();
    }

    logAuthDebug("root beforeLoad context payload", {
      organizationId: auth.organizationId,
      permissionCount: auth.permissions.length,
      role: auth.role,
      roleCount: auth.roles.length,
      tokenPresent: Boolean(auth.token),
      userPresent: Boolean(auth.userId),
    });

    return auth;
  },
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "drawFlow",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  errorComponent: RootError,
  notFoundComponent: RootNotFound,
  shellComponent: RootDocument,
});

interface AuthDebugPayload {
  featureFlagCount?: number;
  impersonatorPresent?: boolean;
  organizationId?: string | null;
  permissionCount?: number;
  role?: string | null;
  roleCount?: number;
  sessionPresent?: boolean;
  tokenPresent?: boolean;
  userPresent?: boolean;
}

function logAuthDebug(label: string, payload: AuthDebugPayload) {
  if (import.meta.env.PROD) {
    return;
  }

  console.info(`[drawflow:auth] ${label}`, payload);
}

function isVisualParityFixtureEnabled(): boolean {
  return (
    !import.meta.env.PROD &&
    (process.env.DRAWFLOW_VISUAL_PARITY_FIXTURE === "1" ||
      import.meta.env.VITE_DRAWFLOW_VISUAL_PARITY_FIXTURE === "1")
  );
}

interface RootDocumentProps {
  children: ReactNode;
}

export function RootDocument({ children }: RootDocumentProps): ReactElement {
  const { queryClient } = useRouter().options.context;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="isolate relative flex min-h-svh flex-col bg-background font-sans text-foreground antialiased [overflow-wrap:anywhere] selection:bg-primary/20">
        <WorkOSProvider>
          <ConvexProvider>
            <QueryClientProvider client={queryClient}>
              <TooltipProvider>
                <NuqsAdapter>{children}</NuqsAdapter>
                <Toaster closeButton position="top-right" richColors />
                <TanStackDevtools
                  config={{
                    position: "bottom-right",
                  }}
                  plugins={[
                    {
                      name: "Tanstack Router",
                      render: <TanStackRouterDevtoolsPanel />,
                    },
                    TanStackQueryDevtools,
                  ]}
                />
              </TooltipProvider>
            </QueryClientProvider>
          </ConvexProvider>
        </WorkOSProvider>
        <Scripts />
      </body>
    </html>
  );
}

function RootNotFound(): ReactElement {
  return (
    <main className="grid min-h-[calc(100vh-4rem)] place-items-center bg-bg-base p-6 text-foreground">
      <Card className="w-full max-w-xl p-6">
        <p className="font-medium text-muted-foreground text-sm">404</p>
        <h1 className="mt-2 font-semibold text-2xl">Page not found</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          This DrawFlow route does not exist or is no longer available.
        </p>
        <Button className="mt-5" render={<a href="/backoffice" />}>
          Back to backoffice
        </Button>
      </Card>
    </main>
  );
}

export function RootError({ error, reset }: ErrorComponentProps): ReactElement {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "An unexpected DrawFlow route error occurred.";
  const retryRoute = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
      return;
    }

    reset();
  };

  return (
    <main className="grid min-h-[calc(100vh-4rem)] place-items-center bg-bg-base p-6 text-foreground">
      <Card className="w-full max-w-2xl p-6">
        <p className="font-medium text-destructive text-sm">Route error</p>
        <h1 className="mt-2 font-semibold text-2xl">
          DrawFlow could not load this screen.
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">
          The route failed while loading. Refresh the screen or return to the
          workspace.
        </p>
        <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-muted-foreground text-xs">
          {message}
        </pre>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={retryRoute}>Try again</Button>
          <Button render={<a href="/backoffice" />} variant="outline">
            Back to backoffice
          </Button>
        </div>
      </Card>
    </main>
  );
}
