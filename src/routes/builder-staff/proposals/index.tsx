import { createFileRoute } from "@tanstack/react-router";

import { BuilderProductionProposalsWorkspace } from "#/routes/builder/proposals/index.tsx";

export const Route = createFileRoute("/builder-staff/proposals/")({
  ssr: false,
  component: BuilderStaffProposalsRoute,
});

function BuilderStaffProposalsRoute() {
  const context = Route.useRouteContext();
  return (
    <BuilderProductionProposalsWorkspace
      routeBase="/builder-staff"
      workosOrganizationId={context.organizationId as string}
    />
  );
}
