import { Link } from "@tanstack/react-router";

import { Badge } from "#/components/ui/badge.tsx";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "#/components/ui/empty.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { api } from "../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

type ProposalRows = FunctionReturnType<
  typeof api.lender_portal.listLenderAssignedProposals
>;
export type LenderAssignedProposalRow = ProposalRows[number];
export type LenderProposalListLink =
  | "/lender/proposals/$proposalId"
  | "/backoffice/proposals/$planId";

export function LenderAssignedProposalList({
  linkTo,
  proposals,
}: {
  linkTo: LenderProposalListLink;
  proposals: ProposalRows | undefined;
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
              <EmptyTitle>No assigned Proposals</EmptyTitle>
              <EmptyDescription>
                No Proposals are assigned to this lender organization.
              </EmptyDescription>
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
                      {proposal.location} · Updated {formatDate(proposal.assignedAt)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-medium text-xs">
                      {proposal.lenderConfirmation === "approved"
                        ? "Confirmed"
                        : "Confirmation required"}
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
