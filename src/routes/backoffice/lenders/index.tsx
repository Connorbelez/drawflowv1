import { createFileRoute } from "@tanstack/react-router";

import { LenderControlPlaneSurface } from "./-lender-control-plane";

export const Route = createFileRoute("/backoffice/lenders/")({
  component: LenderControlPlaneRoute,
});

function LenderControlPlaneRoute() {
  return <LenderControlPlaneSurface />;
}
