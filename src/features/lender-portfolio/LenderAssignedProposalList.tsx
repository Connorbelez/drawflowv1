import { Link } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "#/components/ui/tabs.tsx";
import { api } from "../../../convex/_generated/api";

type ProposalRows = FunctionReturnType<
  typeof api.lender_portal.listLenderAssignedProposals
>;
export type LenderAssignedProposalRow = ProposalRows[number];
type LenderProposalPortfolioRow = FunctionReturnType<
  typeof api.lender_portal.listLenderAssignedProposalPage
>["page"][number];
type LenderProposalPortfolioView = LenderProposalPortfolioRow["view"];
export type LenderProposalListLink =
  | "/lender/proposals/$proposalId"
  | "/backoffice/proposals/$planId";

export function LenderAssignedProposalList({
  emptyDescription = "No Proposals are assigned to this lender organization.",
  emptyTitle = "No assigned Proposals",
  linkTo,
  proposals,
}: {
  emptyDescription?: string;
  emptyTitle?: string;
  linkTo: LenderProposalListLink;
  proposals:
    | readonly (LenderAssignedProposalRow | LenderProposalPortfolioRow)[]
    | undefined;
}) {
  return (
    <Frame>
      <FramePanel className="p-0">
        {proposals === undefined ? (
          <p aria-live="polite" className="p-5 text-muted-foreground text-sm">
            Loading assigned Proposals…
          </p>
        ) : proposals.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyTitle>{emptyTitle}</EmptyTitle>
              <EmptyDescription>{emptyDescription}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y">
            {proposals.map((proposal) => (
              <li key={proposal.proposalId}>
                <Link
                  aria-label={`Open Proposal ${proposal.buildName}`}
                  className="flex items-center justify-between gap-4 p-5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  params={
                    linkTo === "/backoffice/proposals/$planId"
                      ? { planId: proposal.proposalId }
                      : { proposalId: proposal.proposalId }
                  }
                  preload="intent"
                  search={
                    linkTo === "/lender/proposals/$proposalId"
                      ? { assignmentId: proposal.assignmentId }
                      : undefined
                  }
                  title={`${proposal.buildName} — ${proposal.location}`}
                  to={linkTo}
                  viewTransition
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-sm">
                        {proposal.buildName}
                      </span>
                      <Badge variant="outline">
                        {proposal.readOnly ? "Withdrawn" : "Assigned"}
                      </Badge>
                    </span>
                    <span className="mt-1 block truncate text-muted-foreground text-xs">
                      {proposal.location} · Updated{" "}
                      {formatDate(proposal.assignedAt)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-medium text-xs">
                      {proposalPortfolioStatus(proposal)}
                    </span>
                    <span className="mt-1 block text-muted-foreground text-xs">
                      {formatStatus(proposal.proposalStatus)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </FramePanel>
    </Frame>
  );
}

const proposalPortfolioViews = [
  { label: "Needs action", value: "needs_action" },
  { label: "In progress", value: "in_progress" },
  { label: "Approved", value: "approved" },
  { label: "Update pending", value: "update_pending" },
  { label: "Closed", value: "closed" },
  { label: "Withdrawn", value: "withdrawn" },
] as const satisfies readonly {
  label: string;
  value: LenderProposalPortfolioView;
}[];

const proposalPortfolioEmptyState: Record<
  LenderProposalPortfolioView,
  { description: string; title: string }
> = {
  approved: {
    description: "No assigned Proposals have been approved.",
    title: "No approved Proposals",
  },
  closed: {
    description: "No assigned Proposals have completed closing.",
    title: "No closed Proposals",
  },
  in_progress: {
    description: "No assigned Proposals are waiting on other participants.",
    title: "No Proposals in progress",
  },
  needs_action: {
    description:
      "No assigned Proposals require your acknowledgement or decision.",
    title: "No Proposals need action",
  },
  update_pending: {
    description: "No declined Proposals are waiting for a published update.",
    title: "No updates pending",
  },
  withdrawn: {
    description: "No withdrawn assignment records are available.",
    title: "No withdrawn Proposals",
  },
};

export function LenderProposalPortfolio() {
  const [view, setView] = useState<LenderProposalPortfolioView>("needs_action");
  const { loadMore, results, status } = usePaginatedQuery(
    api.lender_portal.listLenderAssignedProposalPage,
    { view },
    { initialNumItems: 20 }
  );
  const emptyState = proposalPortfolioEmptyState[view];

  return (
    <section aria-labelledby="proposal-portfolio-heading" className="space-y-4">
      <div className="flex flex-col gap-3">
        <div>
          <h2
            className="text-balance font-heading font-semibold text-lg"
            id="proposal-portfolio-heading"
          >
            Assigned proposal portfolio
          </h2>
          <p className="mt-1 text-pretty text-muted-foreground text-sm">
            Review assigned work by its current confirmation state.
          </p>
        </div>
      </div>
      <Tabs
        onValueChange={(value) => {
          if (isLenderProposalPortfolioView(value)) {
            setView(value);
          }
        }}
        value={view}
      >
        <div className="overflow-x-auto pb-1">
          <TabsList aria-label="Proposal portfolio view">
            {proposalPortfolioViews.map((option) => (
              <TabsTrigger key={option.value} value={option.value}>
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent className="space-y-4" value={view}>
          <p aria-live="polite" className="sr-only tabular-nums">
            Loaded Proposals: {results.length}. Current view:{" "}
            {
              proposalPortfolioViews.find((option) => option.value === view)
                ?.label
            }
            .
          </p>
          <LenderAssignedProposalList
            emptyDescription={emptyState.description}
            emptyTitle={emptyState.title}
            linkTo="/lender/proposals/$proposalId"
            proposals={status === "LoadingFirstPage" ? undefined : results}
          />
          {status === "CanLoadMore" || status === "LoadingMore" ? (
            <div className="flex justify-center">
              <Button
                disabled={status === "LoadingMore"}
                onClick={() => loadMore(20)}
                variant="outline"
              >
                {status === "LoadingMore" ? (
                  <Loader2
                    aria-hidden="true"
                    className="animate-spin motion-reduce:animate-none"
                  />
                ) : null}
                {status === "LoadingMore"
                  ? "Loading Proposals…"
                  : "Load more Proposals"}
              </Button>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </section>
  );
}

function isLenderProposalPortfolioView(
  value: unknown
): value is LenderProposalPortfolioView {
  return proposalPortfolioViews.some((option) => option.value === value);
}

function proposalPortfolioStatus(
  proposal: LenderAssignedProposalRow | LenderProposalPortfolioRow
) {
  if ("view" in proposal) {
    switch (proposal.view) {
      case "needs_action":
        return "Confirmation required";
      case "in_progress":
        return "Review in progress";
      case "approved":
        return "Confirmed";
      case "update_pending":
        return "Update requested";
      case "closed":
        return "Closed";
      case "withdrawn":
        return "Withdrawn record";
    }
  }
  return proposal.lenderConfirmation === "approved"
    ? "Confirmed"
    : "Lender confirmation pending";
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

function formatStatus(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
