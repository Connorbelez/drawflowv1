import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AppShell } from "#/components/app-shell.tsx";
import { requireWorkspaceAccess } from "#/lib/auth/rbac.ts";
import { enforceLenderPortalPrototypeRouteGate } from "#/lib/lender-portal-prototype-route-gate.ts";

export const Route = createFileRoute("/backoffice")({
  beforeLoad: ({ context, location }) => {
    enforceLenderPortalPrototypeRouteGate(location.pathname);
    return requireWorkspaceAccess({
      isAuthenticated: Boolean(context.userId),
      organizationId: context.organizationId,
      pathname: location.pathname,
      roles: [context.role, ...(context.roles ?? [])],
      workspace: "backoffice",
    });
  },
  staticData: {
    breadcrumb: {
      label: "Backoffice",
      to: "/backoffice",
    },
  },
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
