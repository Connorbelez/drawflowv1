import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/builder/demo/dashboard")({
  staticData: {
    breadcrumb: {
      label: "Dashboard",
      to: "/builder/demo/dashboard",
    },
  },
  component: Outlet,
});
