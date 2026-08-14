import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/lender")({
  component: LenderRoute,
  staticData: {
    breadcrumb: {
      label: "Lender",
      to: "/lender",
    },
  },
});

function LenderRoute() {
  // TODO(lender-portal): add lender-specific access enforcement after the
  // canonical lender organization and membership roles are implemented.
  // Do not reuse Back Office or Builder authorization as a substitute.
  // The shell belongs to the index route so existing throwaway /lender/*
  // prototype routes are not wrapped in a second, production shell.
  return <Outlet />;
}
