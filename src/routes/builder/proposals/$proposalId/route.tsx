import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/builder/proposals/$proposalId")({
  component: Outlet,
});
