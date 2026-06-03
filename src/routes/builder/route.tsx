import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AppShell } from "#/components/app-shell.tsx";
import { builderNavGroups, footerNavLinks } from "#/components/app-shared.tsx";
import { requireWorkspaceAccess } from "#/lib/auth/rbac.ts";

export const Route = createFileRoute("/builder")({
  beforeLoad: ({ context, location }) =>
    requireWorkspaceAccess({
      isAuthenticated: Boolean(context.userId),
      organizationId: context.organizationId,
      pathname: location.pathname,
      roles: [context.role, ...(context.roles ?? [])],
      workspace: "builder",
    }),
  staticData: {
    breadcrumb: {
      label: "Builder",
      to: "/builder",
    },
  },
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <AppShell
      sidebar={{
        brand: {
          label: "DrawFlow Builder",
          to: "/builder" as never,
        },
        footerLinks: footerNavLinks,
        groups: builderNavGroups,
      }}
    >
      <Outlet />
    </AppShell>
  );
}
