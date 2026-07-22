import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/backoffice/builders/builderId")({
  beforeLoad: () => {
    throw redirect({ to: "/backoffice/builders" });
  },
});
