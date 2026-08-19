import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireWorkspaceAccess } from "#/lib/auth/rbac.ts";
import { enforceLenderPortalPrototypeRouteGate } from "#/lib/lender-portal-prototype-route-gate.ts";

export const Route = createFileRoute("/lender")({
  beforeLoad: ({ context, location }) => {
    enforceLenderPortalPrototypeRouteGate(location.pathname);
    return requireWorkspaceAccess({
      isAuthenticated: Boolean(context.userId),
      organizationId: context.organizationId,
      pathname: location.pathname,
      roles: [context.role, ...(context.roles ?? [])],
      workspace: "lender",
    });
  },
  component: LenderRoute,
  staticData: {
    breadcrumb: {
      label: "Lender",
      to: "/lender",
    },
  },
});

function LenderRoute() {
  return <Outlet />;
}
