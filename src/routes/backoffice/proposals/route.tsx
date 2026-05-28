import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/backoffice/proposals")({
  staticData: {
    breadcrumb: {
      label: "Proposals",
      to: "/backoffice/proposals",
    },
  },
  component: Outlet,
});
