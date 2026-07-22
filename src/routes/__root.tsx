import type { ConvexQueryClient } from "@convex-dev/react-query";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getAuth } from "@workos/authkit-tanstack-react-start";
import type { ConvexReactClient } from "convex/react";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import {
  lazy,
  Suspense,
  type ReactElement,
  type ReactNode,
  useEffect,
  useState,
} from "react";

import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { DEV_SERVICE_WORKER_RECOVERY_SCRIPT } from "#/lib/dev-service-worker-recovery.ts";
import { Toaster } from "../components/ui/sonner";
import { TooltipProvider } from "../components/ui/tooltip";
import ConvexProvider from "../integrations/convex/provider";
import WorkOSProvider from "../integrations/workos/provider";
import appCss from "../styles.css?url";
import { VISUAL_PARITY_ORGANIZATION_ID } from "#/features/production-proposals/visualParityFixtures.ts";

const LazyAppDevtools = lazy(async () => ({
  default: (await import("#/components/app-devtools.tsx")).AppDevtools,
}));

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

  let auth: Awaited<ReturnType<typeof getAuth>>;
  try {
    auth = await getAuth();
  } catch (error) {
    logAuthFailure("getAuth failed", error);
    return emptyAuthContext();
  }
  const tokenClaims = auth.user ? decodeJwtPayload(auth.accessToken) : null;
  const organizationId =
    auth.user
      ? (auth.organizationId ??
        stringClaim(tokenClaims?.organizationId) ??
        stringClaim(tokenClaims?.org_id) ??
        stringClaim(tokenClaims?.["https://workos.com/organization_id"]) ??
        null)
      : null;
  const roles = auth.user
    ? nonEmptyStrings([
        ...(auth.roles ?? []),
        ...toStringArray(tokenClaims?.roles),
        ...toStringArray(tokenClaims?.["https://workos.com/roles"]),
      ])
    : [];
  const role =
    auth.user
      ? (auth.role ??
        stringClaim(tokenClaims?.role) ??
        stringClaim(tokenClaims?.["https://workos.com/role"]) ??
        roles[0] ??
        null)
      : null;
  const permissions = auth.user
    ? nonEmptyStrings([
        ...(auth.permissions ?? []),
        ...toStringArray(tokenClaims?.permissions),
        ...toStringArray(tokenClaims?.["https://workos.com/permissions"]),
      ])
    : [];
  const authPayload = {
    featureFlagCount: auth.user ? (auth.featureFlags ?? []).length : 0,
    impersonatorPresent: Boolean(auth.user && auth.impersonator),
    organizationId,
    permissionCount: permissions.length,
    role,
    roleCount: roles.length,
    sessionPresent: Boolean(auth.user && auth.sessionId),
    tokenPresent: Boolean(auth.user && auth.accessToken),
    userPresent: Boolean(auth.user),
  };

  logAuthDebug("getAuth payload", authPayload);

  return {
    organizationId: authPayload.organizationId,
    permissions,
    role: authPayload.role,
    roles,
    token: auth.user ? auth.accessToken : null,
    userId: auth.user?.id ?? null,
  };
});

function emptyAuthContext() {
  return {
    organizationId: null,
    permissions: [],
    role: null,
    roles: [],
    token: null,
    userId: null,
  };
}

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

function logAuthFailure(label: string, error: unknown) {
  if (import.meta.env.PROD) {
    return;
  }

  console.warn(`[drawflow:auth] ${label}`, {
    message: error instanceof Error ? error.message : String(error),
  });
}

function isVisualParityFixtureEnabled(): boolean {
  return (
    !import.meta.env.PROD &&
    (process.env.DRAWFLOW_VISUAL_PARITY_FIXTURE === "1" ||
      import.meta.env.VITE_DRAWFLOW_VISUAL_PARITY_FIXTURE === "1")
  );
}

function decodeJwtPayload(token: string | null | undefined) {
  if (!token) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }
  try {
    const normalized = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    return JSON.parse(Buffer.from(normalized, "base64").toString("utf8")) as
      | Record<string, unknown>
      | null;
  } catch {
    return null;
  }
}

function stringClaim(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return typeof value === "string" ? [value] : [];
}

function nonEmptyStrings(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

interface RootDocumentProps {
  children: ReactNode;
}

export function RootDocument({ children }: RootDocumentProps): ReactElement {
  const { queryClient } = useRouter().options.context;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {import.meta.env.DEV ? (
          <script>{DEV_SERVICE_WORKER_RECOVERY_SCRIPT}</script>
        ) : null}
        <script>{THEME_INIT_SCRIPT}</script>
        <HeadContent />
      </head>
      <body className="isolate relative flex min-h-svh flex-col bg-background font-sans text-foreground antialiased [overflow-wrap:anywhere] selection:bg-primary/20">
        <WorkOSProvider>
          <ConvexProvider>
            <QueryClientProvider client={queryClient}>
              <TooltipProvider>
                <NuqsAdapter>{children}</NuqsAdapter>
                <Toaster closeButton position="top-right" richColors />
                {import.meta.env.DEV ? <DeferredAppDevtools /> : null}
              </TooltipProvider>
            </QueryClientProvider>
          </ConvexProvider>
        </WorkOSProvider>
        <Scripts />
      </body>
    </html>
  );
}

function DeferredAppDevtools(): ReactElement | null {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setEnabled(true), 1500);
    return () => window.clearTimeout(timeoutId);
  }, []);

  if (!enabled) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <LazyAppDevtools />
    </Suspense>
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
  const errorState = getRootErrorState(error);
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
        <p className="font-medium text-destructive text-sm">{errorState.label}</p>
        <h1 className="mt-2 font-semibold text-2xl">
          DrawFlow could not load this screen.
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">
          This screen hit a recoverable loading problem. Try again now or return
          to backoffice.
        </p>
        <div className="mt-4 rounded-md bg-muted p-3">
          <p className="font-medium text-foreground text-sm">What happened</p>
          <p className="mt-1 text-muted-foreground text-sm">
            {errorState.detail}
          </p>
        </div>
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

const ROOT_ERROR_UNSAFE_PATTERNS = [
  /\[Request ID:[^\]]+\]/i,
  /\brequest id\b/i,
  /\b(?:mutation|query|action)\s+(?:api|internal)\.[\w.]+/i,
  /\b(?:api|internal)\.[\w.]+/i,
  /\b(?:payload|schema|validator|argument)\b/i,
  /\/Users\//,
  /[A-Za-z]:\\/,
  /\n\s*at\s+/,
  /^\s*at\s+/m,
  /stack trace/i,
];

type RootErrorState = {
  detail: string;
  label: string;
};

function getRootErrorState(error: unknown): RootErrorState {
  const rawMessage = error instanceof Error && error.message ? error.message : "";
  const safeMessage = normalizeRootErrorMessage(rawMessage);

  if (safeMessage) {
    return {
      detail: safeMessage,
      label: "Recoverable route error",
    };
  }

  return {
    detail:
      "DrawFlow could not safely finish loading this route. Refresh the page and try the same navigation again.",
    label: inferRootErrorLabel(rawMessage),
  };
}

function normalizeRootErrorMessage(message: string): string | null {
  if (!message) {
    return null;
  }

  if (ROOT_ERROR_UNSAFE_PATTERNS.some((pattern) => pattern.test(message))) {
    return null;
  }

  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 280);
}

function inferRootErrorLabel(message: string): string {
  return /\b(?:auth|organization|membership|permission|profile|role|workspace)\b/i.test(
    message,
  )
    ? "Recoverable access error"
    : "Recoverable route error";
}
