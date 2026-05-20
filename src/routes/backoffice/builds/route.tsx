import { createFileRoute, Outlet } from "@tanstack/react-router";
export const Route = createFileRoute("/backoffice/builds")({
  staticData: {
    breadcrumb: {
      label: "Builds",
      to: "/backoffice/builds",
    },
  },
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <>
      <Outlet />
    </>
  );
}
