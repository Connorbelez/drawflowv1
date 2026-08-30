import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { ProposalReviewRouteContent } from "./-proposal-review-route-content.tsx";
import { validateProposalReviewSearch } from "./-proposal-review-route-support.tsx";

// biome-ignore lint/performance/noBarrelFile: preserve the route module's public exports
export {
  buildProposalMilestoneMutationArgs,
  buildProposalProbeReferenceLines,
  buildProposalTimelineItems,
  buildProposalTimelineMarkers,
  buildReviewChartData,
  formatUtcDateInputValue,
  getDefaultApprovalStartDateInput,
  validateApprovalStartDate,
} from "./-proposal-review-chart-helpers.ts";
export type {
  ProposalReviewRouteTab,
  ProposalReviewSearch,
} from "./-proposal-review-route-support.tsx";
export {
  BackofficeProposalLifecycleActions,
  resolveProposalReviewRouteTab,
  shouldLoadProposalCalendarWorkspace,
  shouldLoadProposalContractorPlanning,
  shouldLoadProposalReviewBuilders,
  shouldMountProposalStaffPanel,
  validateProposalReviewSearch,
} from "./-proposal-review-route-support.tsx";
export { ProposalReviewSurface } from "./-proposal-review-surface.tsx";

export const Route = createFileRoute("/backoffice/proposals/$planId")({
  ssr: false,
  staticData: {
    breadcrumb: {
      label: ({ params }) => params.planId,
      to: "/backoffice/proposals/$planId",
    },
  },
  validateSearch: validateProposalReviewSearch,
  component: ProposalReviewRoute,
});

function ProposalReviewRoute() {
  const { planId } = Route.useParams();
  const search = Route.useSearch();
  const context = Route.useRouteContext();
  const navigate = useNavigate();

  return (
    <ProposalReviewRouteContent
      context={context}
      navigate={navigate}
      planId={planId}
      search={search}
    />
  );
}
