import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/backoffice/draws")({
  staticData: {
    breadcrumb: {
      label: "Draws",
      to: "/backoffice/draws",
    },
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Draws</div>;
}
