import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { LenderShell } from "#/components/lender-shell.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { LenderProposalNotificationReviewSurface } from "#/features/lender-portal/LenderProposalNotificationReviewSurface.tsx";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type LenderProposalNotificationSearch = {
  assignmentId?: string;
  confirmationCycleId?: string;
  proposalRevisionId?: string;
};

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
  search: LenderProposalNotificationSearch
) {
  return search.assignmentId
    ? {
        assignmentId:
          search.assignmentId as Id<"proposalLenderAssignments">,
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
          historyPaginationOpts: { cursor: null, numItems: 20 },
          proposalId: proposalId as Id<"buildProposals">,
          workosOrganizationId: context.organizationId as string,
        }
      : "skip"
  );
  const detail = useQuery(
    api.production_proposals.getCurrentLenderProposalDetail,
    lenderProposalDetailQueryArgs(proposalId, search)
  );

  if (
    !search.assignmentId ||
    !lifecycle ||
    !detail ||
    (lifecycle.assignment.status === "current" && !confirmation)
  ) {
    return (
      <LenderShell activeNavigation="Proposals" pageTitle="Proposal review">
        <Frame className="mx-auto mt-6 max-w-xl">
          <FramePanel
            aria-live="polite"
            className="flex items-center gap-3 p-5"
            role="status"
          >
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            Checking the current proposal assignment…
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
  return (
    <LenderShell activeNavigation="Proposals" pageTitle="Proposal review">
      <main className="flex-1 p-4 sm:p-6">
        <LenderProposalNotificationReviewSurface
          confirmation={confirmation}
          detail={detail}
          viewerWorkosUserId={context.userId as string}
          workosOrganizationId={context.organizationId as string}
        />
      </main>
    </LenderShell>
  );
}
