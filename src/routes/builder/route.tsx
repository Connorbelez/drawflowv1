import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AppShell } from "#/components/app-shell.tsx";
import { builderNavGroups, footerNavLinks } from "#/components/app-shared.tsx";

export const Route = createFileRoute("/builder")({
  staticData: {
    breadcrumb: {
      label: "Builder",
      to: "/builder/demo/dashboard",
    },
  },
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <AppShell
      contentClassName="p-1 md:p-2"
      sidebar={{
        brand: {
          label: "DrawFlow Builder",
          to: "/builder/demo/dashboard" as never,
        },
        footerLinks: footerNavLinks,
        groups: builderNavGroups,
      }}
    >
      <Outlet />
    </AppShell>
  );
}
