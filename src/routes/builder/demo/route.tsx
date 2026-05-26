import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/builder/demo")({
  staticData: {
    breadcrumb: {
      label: "Demo",
      to: "/builder/demo/dashboard",
    },
  },
  component: Outlet,
});
