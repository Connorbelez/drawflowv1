import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/builder/demo/dashboard/builds")({
  staticData: {
    breadcrumb: {
      label: "Live Builds",
      to: "/builder/demo/dashboard/builds",
    },
  },
  component: Outlet,
});
