import { createFileRoute } from "@tanstack/react-router";

import { BuilderProductionHomeWorkspace } from "#/routes/builder/index.tsx";

export const Route = createFileRoute("/builder-staff/")({
  ssr: false,
  component: BuilderStaffHomeRoute,
});

function BuilderStaffHomeRoute() {
  const context = Route.useRouteContext();
  return (
    <BuilderProductionHomeWorkspace
      routeBase="/builder-staff"
      workosOrganizationId={context.organizationId as string}
    />
  );
}
