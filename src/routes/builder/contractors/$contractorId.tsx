import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { ContractorDetailSurface } from "#/features/contractors/ContractorDetailSurface.tsx";
import {
  getVisualContractorDetail,
  isProductionVisualParityFixtureEnabled,
} from "#/features/contractors/contractorVisualFixtures.ts";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/builder/contractors/$contractorId")({
  staticData: {
    breadcrumb: {
      label: "Contractor detail",
      to: "/builder",
    },
  },
  component: BuilderContractorRoute,
});

function BuilderContractorRoute() {
  const { contractorId } = Route.useParams();
  const context = Route.useRouteContext();
  const workosOrganizationId = context.organizationId as string;
  const visualFixture = isProductionVisualParityFixtureEnabled();
  const contractorApi = (api as any).production_proposals;
  const liveDetail = useQuery(
    contractorApi.getContractorDetail,
    visualFixture
      ? "skip"
      : {
          contractorId: contractorId as Id<"contractorProfiles">,
          workosOrganizationId,
        }
  );
  const detail = visualFixture
    ? getVisualContractorDetail(contractorId)
    : liveDetail;

  if (detail === undefined) {
    return (
      <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
        <Frame>
          <FramePanel className="p-5 text-sm">Loading contractor...</FramePanel>
        </Frame>
      </main>
    );
  }

  return (
    <ContractorDetailSurface
      backHref="/builder"
      backLabel="Builder workspace"
      buildHrefForWorkHistory={(row) => `/builder/builds/${row.buildId}`}
      detail={detail}
      emptyWorkHistory="No assigned build or milestone work is visible for this contractor."
    />
  );
}
