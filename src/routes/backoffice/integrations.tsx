import { createFileRoute } from "@tanstack/react-router";

import { IntegrationOperationsConsole } from "#/features/integration-operations/integration-operations-console.tsx";
import { requireIntegrationAdminAccess } from "#/lib/auth/rbac.ts";

export const Route = createFileRoute("/backoffice/integrations")({
  beforeLoad: ({ context, location }) =>
    requireIntegrationAdminAccess({
      isAuthenticated: Boolean(context.userId),
      organizationId: context.organizationId,
      pathname: location.pathname,
      roles: [context.role, ...(context.roles ?? [])],
      workspace: "backoffice",
    }),
  component: RouteComponent,
});

function RouteComponent() {
  const context = Route.useRouteContext();
  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_12%_0%,color-mix(in_oklch,var(--primary)_10%,transparent),transparent_32rem),var(--bg-base)] px-4 py-5 text-fg-primary sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1800px]">
        <IntegrationOperationsConsole
          workosOrganizationId={context.organizationId as string}
        />
      </div>
    </main>
  );
}
