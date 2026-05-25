import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/backoffice/builds/$buildId")({
  validateSearch: (search) => ({
    milestone:
      typeof search.milestone === "string" ? search.milestone : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return <Outlet />;
}
