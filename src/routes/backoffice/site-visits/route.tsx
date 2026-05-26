import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/backoffice/site-visits")({
  staticData: {
    breadcrumb: {
      label: "Site Visits",
      to: "/backoffice/site-visits",
    },
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Site Visits</div>;
}
