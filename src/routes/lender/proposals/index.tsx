import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { LenderShell } from "#/components/lender-shell.tsx";
import { LenderAssignedProposalList } from "#/features/lender-portfolio/LenderAssignedProposalList.tsx";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/lender/proposals/")({
  component: LenderProposals,
  staticData: {
    breadcrumb: {
      label: "Proposals",
      to: "/lender/proposals",
    },
  },
});

function LenderProposals() {
  const proposals = useQuery(api.lender_portal.listLenderAssignedProposals, {});

  return (
    <LenderShell activeNavigation="Proposals" pageTitle="Proposal list">
      <main className="min-h-[calc(100vh-3.5rem)] bg-muted/30 pb-20">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 p-4 md:p-6">
          <header>
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.14em]">
              Assigned portfolio
            </p>
            <h1 className="mt-2 font-heading font-semibold text-2xl">
              Proposals
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
              Confirm proposals assigned to this lender organization, including
              read-only records retained after withdrawal.
            </p>
          </header>

          <LenderAssignedProposalList
            linkTo="/lender/proposals/$proposalId"
            proposals={proposals}
          />
        </div>
      </main>
    </LenderShell>
  );
}
