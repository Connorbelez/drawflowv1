import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/start")({
  component: StartRoute,
});

function StartRoute() {
  return <Outlet />;
}
