import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/backoffice/contractors")({
  staticData: {
    breadcrumb: {
      label: "Contractors",
      to: "/backoffice/contractors",
    },
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <Outlet />;
}
