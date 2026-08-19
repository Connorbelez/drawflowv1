import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { LenderShell } from "#/components/lender-shell.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { LenderProposalHistoricalReviewSurface } from "#/features/lender-portal/LenderProposalHistoricalReviewSurface.tsx";
import { LenderProposalLifecycleActions } from "#/features/lender-portal/LenderProposalLifecycleActions.tsx";
import { LenderProposalNotificationReviewSurface } from "#/features/lender-portal/LenderProposalNotificationReviewSurface.tsx";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface LenderProposalNotificationSearch {
  assignmentId?: string;
  confirmationCycleId?: string;
  proposalRevisionId?: string;
}

export function validateLenderProposalNotificationSearch(
  search: Record<string, unknown>
): LenderProposalNotificationSearch {
  return {
    ...(typeof search.assignmentId === "string"
      ? { assignmentId: search.assignmentId }
      : {}),
    ...(typeof search.confirmationCycleId === "string"
      ? { confirmationCycleId: search.confirmationCycleId }
      : {}),
    ...(typeof search.proposalRevisionId === "string"
      ? { proposalRevisionId: search.proposalRevisionId }
      : {}),
  };
}

export function lenderProposalDetailQueryArgs(
  proposalId: string,
  search: LenderProposalNotificationSearch,
  assignmentStatus?: "current" | "withdrawn"
) {
  return search.assignmentId && assignmentStatus === "current"
    ? {
        assignmentId: search.assignmentId as Id<"proposalLenderAssignments">,
        proposalId: proposalId as Id<"buildProposals">,
      }
    : ("skip" as const);
}

export function historicalLenderProposalDetailQueryArgs(
  proposalId: string,
  search: LenderProposalNotificationSearch,
  assignmentStatus: "current" | "withdrawn" | undefined,
  historyLimit: number
) {
  return search.assignmentId && assignmentStatus === "withdrawn"
    ? {
        assignmentId: search.assignmentId as Id<"proposalLenderAssignments">,
        paginationOpts: { cursor: null, numItems: historyLimit },
        proposalId: proposalId as Id<"buildProposals">,
      }
    : ("skip" as const);
}

export const Route = createFileRoute("/lender/proposals/$proposalId")({
  component: LenderProposalReview,
  staticData: {
    breadcrumb: {
      label: "Proposal review",
      params: (match) => ({ proposalId: match.params.proposalId }),
      to: "/lender/proposals/$proposalId",
    },
  },
  validateSearch: validateLenderProposalNotificationSearch,
});
function LenderProposalReview() {
  const { proposalId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [historyLimit, setHistoryLimit] = useState(20);
  const lifecycle = useQuery(
    api.production_proposals.getLenderProposalLifecycleProjection,
    search.assignmentId
      ? {
          assignmentId: search.assignmentId as Id<"proposalLenderAssignments">,
          proposalId: proposalId as Id<"buildProposals">,
        }
      : "skip"
  );
  const context = Route.useRouteContext();
  const confirmation = useQuery(
    api.production_proposals.getLenderProposalConfirmation,
    lifecycle?.assignment.status === "current"
      ? {
          historyPaginationOpts: { cursor: null, numItems: historyLimit },
          proposalId: proposalId as Id<"buildProposals">,
          workosOrganizationId: context.organizationId as string,
        }
      : "skip"
  );
  const currentDetail = useQuery(
    api.production_proposals.getCurrentLenderProposalDetail,
    lenderProposalDetailQueryArgs(
      proposalId,
      search,
      lifecycle?.assignment.status
    )
  );
  const historicalDetail = useQuery(
    api.production_proposals.getHistoricalLenderProposalDetail,
    historicalLenderProposalDetailQueryArgs(
      proposalId,
      search,
      lifecycle?.assignment.status,
      historyLimit
    )
  );
  const historicalConfirmation = useQuery(
    api.production_proposals.getHistoricalLenderProposalConfirmation,
    historicalLenderProposalDetailQueryArgs(
      proposalId,
      search,
      lifecycle?.assignment.status,
      historyLimit
    )
  );
  const assignmentStatus = lifecycle?.assignment.status;
  const detailReady =
    assignmentStatus === "current"
      ? Boolean(currentDetail && confirmation)
      : assignmentStatus === "withdrawn"
        ? Boolean(historicalDetail && historicalConfirmation)
        : false;

  if (!(search.assignmentId && lifecycle && detailReady)) {
    return (
      <LenderShell activeNavigation="Proposals" pageTitle="Proposal review">
        <Frame className="mx-auto mt-6 max-w-xl">
          <FramePanel
            aria-live="polite"
            className="flex items-center gap-3 p-5"
            role="status"
          >
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            Checking the proposal assignment…
          </FramePanel>
        </Frame>
      </LenderShell>
    );
  }
  if (
    lifecycle.assignment.status === "current" &&
    ((search.confirmationCycleId &&
      confirmation.currentCycle?.confirmationCycleId !==
        search.confirmationCycleId) ||
      (search.proposalRevisionId &&
        confirmation.currentCycle?.proposalRevisionId !==
          search.proposalRevisionId))
  ) {
    throw new Error("This proposal notification is no longer current.");
  }
  if (lifecycle.assignment.status === "withdrawn") {
    return (
      <LenderShell activeNavigation="Proposals" pageTitle="Proposal history">
        <main className="flex-1 p-4 sm:p-6">
          <LenderProposalHistoricalReviewSurface
            confirmation={historicalConfirmation}
            detail={historicalDetail}
            onLoadMore={() => setHistoryLimit((current) => current + 20)}
          />
        </main>
      </LenderShell>
    );
  }
  return (
    <LenderShell activeNavigation="Proposals" pageTitle="Proposal review">
      <main className="flex-1 p-4 sm:p-6">
        <div className="space-y-4">
          <LenderProposalLifecycleActions
            capabilities={lifecycle.lifecycleActions}
            onActivated={(buildId) =>
              navigate({
                params: { buildId },
                to: "/lender/builds/$buildId",
              })
            }
            proposal={{
              ...currentDetail.proposal,
              principalCents: currentDetail.loanFacility?.principalCents,
            }}
            workosOrganizationId={context.organizationId as string}
          />
          <LenderProposalNotificationReviewSurface
            assignmentStatus="current"
            confirmation={confirmation}
            detail={currentDetail}
            onLoadMoreHistory={() => setHistoryLimit((current) => current + 20)}
            viewerWorkosUserId={context.userId as string}
            workosOrganizationId={context.organizationId as string}
          />
        </div>
      </main>
    </LenderShell>
  );
}
