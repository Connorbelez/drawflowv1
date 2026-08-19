import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LenderShell } from "#/components/lender-shell.tsx";
import { DrawReviewSheet } from "#/features/draw-workflow/DrawReviewSheet.tsx";
import {
  type LenderDrawQueueRequest,
  LenderDrawQueueVariantD,
} from "../lender.draws-prototype.tsx";

export const Route = createFileRoute("/lender/draws")({
  component: LenderDrawQueue,
  staticData: {
    breadcrumb: {
      label: "Draws",
      to: "/lender/draws",
    },
  },
});
function LenderDrawQueue() {
  const [selectedDraw, setSelectedDraw] =
    useState<LenderDrawQueueRequest | null>(null);

  return (
    <LenderShell activeNavigation="Draws" pageTitle="Draw queue">
      <LenderDrawQueueVariantD onOpenDraw={setSelectedDraw} />
      <LenderDrawQueueReviewSheet
        onClose={() => setSelectedDraw(null)}
        request={selectedDraw}
      />
    </LenderShell>
  );
}

// TODO(lender-portal): replace these representative sheet values with the
// canonical Draw Request, funding, evidence, and locked-policy projections.
function LenderDrawQueueReviewSheet({
  onClose,
  request,
}: {
  onClose: () => void;
  request: LenderDrawQueueRequest | null;
}) {
  if (!request) {
    return null;
  }

  return (
    <DrawReviewSheet
      amountCents={parseRepresentativeCad(request.amount)}
      buildLabel={request.build}
      details={[
        { label: "Work order", value: request.workOrderKey },
        { label: "Decision cycle", value: request.cycle },
      ]}
      displayId={request.displayId}
      drawLabel={request.requestLabel}
      evidence={request.evidence.map((fact) => ({
        detail: fact.label,
        id: fact.label,
        label: fact.label,
        stateLabel: fact.tone === "success" ? "Verified" : undefined,
        type: "other" as const,
      }))}
      location={request.location}
      onClose={onClose}
      open
      policyGates={request.approvals.map((group) => ({
        label: group.label,
        state: group.state === "approved" ? "satisfied" : "pending",
        stateLabel: group.progress,
      }))}
      requestNote={request.requestNote}
      status={queueStateToWorkflowStatus(request.state)}
      submittedAt={request.submittedAt}
      viewerRole="lender"
    />
  );
}

function parseRepresentativeCad(value: string) {
  return Math.round(Number(value.replace(/[^\d.-]/g, "")) * 100);
}

function queueStateToWorkflowStatus(state: LenderDrawQueueRequest["state"]) {
  switch (state) {
    case "approved":
      return "approved_for_release" as const;
    case "correction":
      return "rejected" as const;
    default:
      return "in_review" as const;
  }
}
