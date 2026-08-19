import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  LenderProposalConfirmationSheet,
  type ProposalConfirmationCheckpoint,
} from "#/features/lender-portal/LenderProposalConfirmationSheet.tsx";
import {
  type ProductionProposalDetail,
  ProductionProposalReviewSurface,
} from "#/features/production-proposals/ProductionProposalSurfaces.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type LenderProposalConfirmation = FunctionReturnType<
  typeof api.production_proposals.getLenderProposalConfirmation
>;

export function LenderProposalNotificationReviewSurface({
  assignmentStatus,
  confirmation,
  detail,
  onLoadMoreHistory,
  viewerWorkosUserId,
  workosOrganizationId,
}: {
  assignmentStatus: "current" | "withdrawn";
  confirmation: LenderProposalConfirmation | undefined;
  detail: ProductionProposalDetail;
  onLoadMoreHistory?: () => void;
  viewerWorkosUserId: string;
  workosOrganizationId: string;
}) {
  const acknowledge = useMutation(
    api.production_proposals.acknowledgeProposalConfirmationCheckpoint
  );
  const approve = useMutation(
    api.production_proposals.approveExternalProposalForClosing
  );
  const decline = useMutation(
    api.production_proposals.declineExternalProposalForClosing
  );
  const [open, setOpen] = useState(assignmentStatus === "current");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const idempotencyKeys = useRef(new Map<string, string>());
  const cycle = confirmation?.currentCycle;

  const stableIdempotencyKey = (command: string) => {
    const existing = idempotencyKeys.current.get(command);
    if (existing) {
      return existing;
    }
    const next = crypto.randomUUID();
    idempotencyKeys.current.set(command, next);
    return next;
  };

  const run = async (action: () => Promise<unknown>, message: string) => {
    setPending(true);
    setError(undefined);
    try {
      await action();
      toast.success(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Action failed.";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  };

  const reviewControl = (
    <Frame>
      <FramePanel className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium text-sm">Lender confirmation</p>
            <p className="mt-1 text-muted-foreground text-xs">
              {cycle
                ? `Revision ${cycle.proposalRevisionNumber} · cycle ${cycle.cycleNumber}`
                : "No active confirmation cycle"}
            </p>
          </div>
          <Badge
            variant={
              assignmentStatus === "withdrawn"
                ? "secondary"
                : confirmation?.lenderNeedsAction
                  ? "default"
                  : "outline"
            }
          >
            {assignmentStatus === "withdrawn"
              ? "Assignment withdrawn"
              : confirmation?.lenderNeedsAction
                ? "Action required"
                : (cycle?.status ?? "Pending")}
          </Badge>
        </div>

        {assignmentStatus === "withdrawn" ? (
          <Alert>
            <LockKeyhole aria-hidden />
            <AlertTitle>Historical proposal access</AlertTitle>
            <AlertDescription>
              This lender assignment was withdrawn. The proposal packet is
              read-only and no acknowledgement or decision command is available.
            </AlertDescription>
          </Alert>
        ) : cycle ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              {confirmation?.closingGateSatisfied
                ? "This revision is approved for closing."
                : "Open the governed five-checkpoint review to continue."}
            </p>
            <Button onClick={() => setOpen(true)}>
              Open lender confirmation <ArrowRight aria-hidden />
            </Button>
          </div>
        ) : (
          <Alert>
            <LockKeyhole aria-hidden />
            <AlertTitle>No current confirmation cycle</AlertTitle>
            <AlertDescription>
              This assignment has no lender action. Back Office can restore a
              missing cycle from the assignment controls.
            </AlertDescription>
          </Alert>
        )}
      </FramePanel>
    </Frame>
  );

  if (!(cycle && confirmation) || assignmentStatus === "withdrawn") {
    return (
      <ProductionProposalReviewSurface
        detail={detail}
        initialActiveTab="review"
        lenderAssignmentSurface={reviewControl}
      />
    );
  }

  const commandBase = {
    expectedAssignmentId: cycle.assignmentId as Id<"proposalLenderAssignments">,
    expectedConfirmationCycleId:
      cycle.confirmationCycleId as Id<"proposalLenderConfirmationCycles">,
    expectedProposalRevisionId:
      cycle.proposalRevisionId as Id<"proposalRevisions">,
    proposalId: detail.proposal._id as Id<"buildProposals">,
    workosOrganizationId,
  };

  return (
    <>
      <ProductionProposalReviewSurface
        detail={detail}
        initialActiveTab="review"
        lenderAssignmentSurface={reviewControl}
      />
      <LenderProposalConfirmationSheet
        buildName={detail.proposal.buildName}
        confirmation={confirmation}
        error={error}
        onAcknowledge={(checkpoint) =>
          run(
            () =>
              acknowledge({
                ...commandBase,
                checkpoint,
                idempotencyKey: stableIdempotencyKey(
                  `acknowledge:${cycle.confirmationCycleId}:${checkpoint}`
                ),
              }),
            `${checkpointLabel(checkpoint)} acknowledged.`
          ).then(() => undefined)
        }
        onApprove={(reason) =>
          run(
            () =>
              approve({
                ...commandBase,
                idempotencyKey: stableIdempotencyKey(
                  `approve:${cycle.confirmationCycleId}:${reason}`
                ),
                reason,
              }),
            "Proposal approved for closing."
          ).then(() => undefined)
        }
        onDecline={(declinedCheckpoint, reason) =>
          run(
            () =>
              decline({
                ...commandBase,
                declinedCheckpoint,
                idempotencyKey: stableIdempotencyKey(
                  `decline:${cycle.confirmationCycleId}:${declinedCheckpoint}:${reason}`
                ),
                reason,
              }),
            "Proposal revision requested."
          ).then(() => undefined)
        }
        onLoadMoreHistory={onLoadMoreHistory}
        onOpenChange={setOpen}
        open={open}
        pending={pending}
        viewerWorkosUserId={viewerWorkosUserId}
      />
    </>
  );
}

function checkpointLabel(checkpoint: ProposalConfirmationCheckpoint) {
  switch (checkpoint) {
    case "milestoneCount":
      return "Milestone count";
    case "budget":
      return "Budget";
    case "scheduleTimeline":
      return "Schedule and timeline";
    case "builder":
      return "Builder";
    case "accessReviewPolicy":
      return "Access and review policy";
  }
}
