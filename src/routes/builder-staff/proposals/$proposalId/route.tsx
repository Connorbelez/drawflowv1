import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/builder-staff/proposals/$proposalId")({
  component: Outlet,
});
