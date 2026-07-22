import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import {
  builderStaffNavGroups,
  footerNavLinks,
} from "#/components/app-shared.tsx";
import { AppShell } from "#/components/app-shell.tsx";
import {
  hasBuilderStaffWorkspaceAccess,
  requireWorkspaceAccess,
} from "#/lib/auth/rbac.ts";

export const Route = createFileRoute("/builder-staff")({
  beforeLoad: ({ context, location }) => {
    requireWorkspaceAccess({
      isAuthenticated: Boolean(context.userId),
      organizationId: context.organizationId,
      pathname: location.pathname,
      roles: [context.role, ...(context.roles ?? [])],
      workspace: "builder",
    });
    if (
      !hasBuilderStaffWorkspaceAccess([context.role, ...(context.roles ?? [])])
    ) {
      throw redirect({
        search: {
          reason: "no-workspace-access",
          workspace: "builder",
        },
        to: "/protected-access",
      });
    }
  },
  staticData: {
    breadcrumb: {
      label: "Builder",
      to: "/builder-staff",
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
          to: "/builder-staff" as never,
        },
        footerLinks: footerNavLinks,
        groups: builderStaffNavGroups,
      }}
    >
      <Outlet />
    </AppShell>
  );
}
