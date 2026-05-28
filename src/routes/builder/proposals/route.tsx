import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/builder/proposals")({
  staticData: {
    breadcrumb: {
      label: "Proposals",
      to: "/builder/proposals",
    },
  },
  component: Outlet,
});
