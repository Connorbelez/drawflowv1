import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AppShell } from "#/components/app-shell.tsx";
import { contractorNavGroups, footerNavLinks } from "#/features/contractor/contractorNav.tsx";
import { requireWorkspaceAccess } from "#/lib/auth/rbac.ts";

export const Route = createFileRoute("/contractor")({
  beforeLoad: ({ context, location }) =>
    requireWorkspaceAccess({
      isAuthenticated: Boolean(context.userId),
      organizationId: context.organizationId,
      pathname: location.pathname,
      roles: [context.role, ...(context.roles ?? [])],
      workspace: "contractor",
    }),
  staticData: {
    breadcrumb: {
      label: "Contractor",
      to: "/contractor",
    },
  },
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <AppShell
      sidebar={{
        brand: {
          label: "DrawFlow Contractor",
          to: "/contractor" as never,
        },
        footerLinks: footerNavLinks,
        groups: contractorNavGroups,
      }}
    >
      <Outlet />
    </AppShell>
  );
}
