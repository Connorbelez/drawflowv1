import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/builder/demo/dashboard/proposals")({
  staticData: {
    breadcrumb: {
      label: "Proposals",
      to: "/builder/demo/dashboard/proposals",
    },
  },
  component: Outlet,
});
