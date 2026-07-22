import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/builder-staff/proposals")({
  staticData: {
    breadcrumb: {
      label: "Proposals",
      to: "/builder-staff/proposals",
    },
  },
  component: Outlet,
});
