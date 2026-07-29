import { createFileRoute, Outlet } from "@tanstack/react-router";
import { footerNavLinks } from "#/components/app-shared.tsx";
import { AppShell } from "#/components/app-shell.tsx";
import { homeownerNavGroups } from "#/features/homeowner/homeownerNav.tsx";
import { requireHomeownerWorkspaceAccess } from "#/lib/auth/rbac.ts";

export const Route = createFileRoute("/homeowner")({
  beforeLoad: ({ context, location }) =>
    requireHomeownerWorkspaceAccess({
      isAuthenticated: Boolean(context.userId),
      pathname: location.pathname,
    }),
  component: HomeownerRoute,
  staticData: {
    breadcrumb: {
      label: "Homeowner",
      to: "/homeowner",
    },
  },
});

function HomeownerRoute() {
  return (
    <AppShell
      sidebar={{
        brand: {
          label: "DrawFlow Homeowner",
          to: "/homeowner" as never,
        },
        footerLinks: footerNavLinks,
        groups: homeownerNavGroups,
      }}
    >
      <Outlet />
    </AppShell>
  );
}
