import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LenderShell } from "#/components/lender-shell.tsx";
import { DrawReviewSheet } from "#/features/draw-workflow/DrawReviewSheet.tsx";
import { LenderNotificationReviewSurface } from "#/features/lender-portal/LenderNotificationReviewSurface.tsx";
import {
  type LenderDrawQueueRequest,
  LenderDrawQueueVariantD,
} from "../lender.draws-prototype.tsx";

interface LenderDrawSearch {
  drawRequestId?: string;
  reviewCycleId?: string;
  reviewCycleNumber?: number;
}

export function validateLenderDrawSearch(
  search: Record<string, unknown>
): LenderDrawSearch {
  return {
    ...(typeof search.drawRequestId === "string"
      ? { drawRequestId: search.drawRequestId }
      : {}),
    ...(typeof search.reviewCycleId === "string"
      ? { reviewCycleId: search.reviewCycleId }
      : {}),
    ...(typeof search.reviewCycleNumber === "string" &&
    Number.isSafeInteger(Number(search.reviewCycleNumber))
      ? { reviewCycleNumber: Number(search.reviewCycleNumber) }
      : {}),
  };
}

export const Route = createFileRoute("/lender/draws")({
  component: LenderDrawQueue,
  staticData: {
    breadcrumb: {
      label: "Draws",
      to: "/lender/draws",
    },
  },
  validateSearch: validateLenderDrawSearch,
});
function LenderDrawQueue() {
  const context = Route.useRouteContext();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [selectedDraw, setSelectedDraw] =
    useState<LenderDrawQueueRequest | null>(null);
  const notificationTarget =
    search.drawRequestId &&
    search.reviewCycleId &&
    search.reviewCycleNumber !== undefined
      ? {
          drawRequestId: search.drawRequestId,
          reviewCycleId: search.reviewCycleId,
          reviewCycleNumber: search.reviewCycleNumber,
        }
      : null;

  return (
    <LenderShell activeNavigation="Draws" pageTitle="Draw queue">
      {notificationTarget ? (
        <LenderNotificationReviewSurface
          onClose={() => navigate({ search: {}, to: "/lender/draws" })}
          reviewCycleId={notificationTarget.reviewCycleId}
          reviewCycleNumber={notificationTarget.reviewCycleNumber}
          target={{
            drawRequestId: notificationTarget.drawRequestId,
            kind: "draw",
          }}
          viewerWorkosUserId={context.userId as string}
        />
      ) : (
        <>
          <LenderDrawQueueVariantD onOpenDraw={setSelectedDraw} />
          <LenderDrawQueueReviewSheet
            onClose={() => setSelectedDraw(null)}
            request={selectedDraw}
          />
        </>
      )}
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
