import { createFileRoute, Outlet } from "@tanstack/react-router";

import { requireIntegrationAdminAccess } from "#/lib/auth/rbac.ts";

export const Route = createFileRoute("/backoffice/lenders")({
  beforeLoad: ({ context, location }) =>
    requireIntegrationAdminAccess({
      isAuthenticated: Boolean(context.userId),
      organizationId: context.organizationId,
      pathname: location.pathname,
      roles: [context.role, ...(context.roles ?? [])],
      workspace: "backoffice",
    }),
  component: RouteComponent,
  staticData: {
    breadcrumb: {
      label: "Lenders",
      to: "/backoffice/lenders",
    },
  },
});

function RouteComponent() {
  return <Outlet />;
}
