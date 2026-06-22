import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/builder-staff/builds")({
  staticData: {
    breadcrumb: {
      label: "Live Builds",
      to: "/builder-staff/builds",
    },
  },
  component: Outlet,
});
