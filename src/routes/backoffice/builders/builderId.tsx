import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/backoffice/builders/builderId")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/backoffice/builders/builderId"!</div>;
}
