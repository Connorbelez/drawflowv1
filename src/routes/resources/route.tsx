import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/resources")({
  component: ResourcesRoute,
});

function ResourcesRoute() {
  return <Outlet />;
}
