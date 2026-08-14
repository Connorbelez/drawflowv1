import { createFileRoute } from "@tanstack/react-router";
import { LenderShell } from "#/components/lender-shell.tsx";
import { LenderProposalReviewVariantD } from "../../lender.proposal-confirmation-prototype.tsx";

export const Route = createFileRoute("/lender/proposals/$proposalId")({
  component: LenderProposalReview,
});
function LenderProposalReview() {
  return (
    <LenderShell activeNavigation="Proposals" pageTitle="Proposal review">
      <main className="flex-1 p-4 sm:p-6">
        <LenderProposalReviewVariantD />
      </main>
    </LenderShell>
  );
}
