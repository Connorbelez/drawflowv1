import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/backoffice/builds/$buildId/")({
  component: RouteComponent,
});

function RouteComponent() {
  return null;
}
