import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/demo/drawflow/")({
  beforeLoad: () => {
    throw redirect({ to: "/demo/drawflow/active" });
  },
});
