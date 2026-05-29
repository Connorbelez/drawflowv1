import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/backoffice/builders")({
  staticData: {
    breadcrumb: {
      label: "Builders",
      to: "/backoffice/builders",
    },
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <Outlet />;
}
