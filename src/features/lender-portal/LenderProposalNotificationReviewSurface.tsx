import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, Loader2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import {
  type ProductionProposalDetail,
  ProductionProposalReviewSurface,
} from "#/features/production-proposals/ProductionProposalSurfaces.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const CHECKPOINTS = [
  ["milestoneCount", "Milestone count"],
  ["budget", "Budget"],
  ["scheduleTimeline", "Schedule and timeline"],
  ["builder", "Builder"],
  ["accessReviewPolicy", "Access and review policy"],
] as const;

type Checkpoint = (typeof CHECKPOINTS)[number][0];
type LenderProposalConfirmation = FunctionReturnType<
  typeof api.production_proposals.getLenderProposalConfirmation
>;

export function LenderProposalNotificationReviewSurface({
  confirmation,
  detail,
  viewerWorkosUserId,
  workosOrganizationId,
}: {
  confirmation: LenderProposalConfirmation | undefined;
  detail: ProductionProposalDetail;
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
  const [declinedCheckpoint, setDeclinedCheckpoint] =
    useState<Checkpoint>("milestoneCount");
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");
  const cycle = confirmation?.currentCycle;

  if (!cycle) {
    return (
      <ProductionProposalReviewSurface
        detail={detail}
        initialActiveTab="review"
        lenderAssignmentSurface={
          <Frame>
            <FramePanel className="p-4 text-sm">
              This proposal has no current lender confirmation action.
            </FramePanel>
          </Frame>
        }
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
  const acknowledged = new Set(
    cycle.acknowledgements
      .filter((item) => item.acknowledgedByWorkosUserId === viewerWorkosUserId)
      .map((item) => item.checkpoint)
  );

  const run = async (action: () => Promise<unknown>, message: string) => {
    setPending(true);
    try {
      await action();
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setPending(false);
    }
  };

  const actions = (
    <Frame>
      <FramePanel className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium text-sm">Lender confirmation</p>
            <p className="text-muted-foreground text-xs">
              Revision {cycle.proposalRevisionNumber} · cycle{" "}
              {cycle.cycleNumber}
            </p>
          </div>
          <Badge
            variant={confirmation.lenderNeedsAction ? "outline" : "secondary"}
          >
            {confirmation.lenderNeedsAction ? "Action required" : cycle.status}
          </Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {CHECKPOINTS.map(([checkpoint, label]) => (
            <Button
              disabled={
                pending ||
                !confirmation.canAcknowledge ||
                acknowledged.has(checkpoint)
              }
              key={checkpoint}
              onClick={() =>
                void run(
                  () =>
                    acknowledge({
                      ...commandBase,
                      checkpoint,
                      idempotencyKey: crypto.randomUUID(),
                    }),
                  `${label} acknowledged.`
                )
              }
              size="sm"
              variant={acknowledged.has(checkpoint) ? "secondary" : "outline"}
            >
              {acknowledged.has(checkpoint) ? <Check aria-hidden /> : null}
              {label}
            </Button>
          ))}
        </div>
        <Textarea
          aria-label="Private lender decision reason"
          onChange={(event) => setReason(event.target.value)}
          placeholder="Private lender decision reason"
          value={reason}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <NativeSelect
            aria-label="Declined proposal checkpoint"
            className="w-full sm:w-auto"
            onChange={(event) =>
              setDeclinedCheckpoint(event.target.value as Checkpoint)
            }
            value={declinedCheckpoint}
          >
            {CHECKPOINTS.map(([checkpoint, label]) => (
              <NativeSelectOption key={checkpoint} value={checkpoint}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button
            disabled={pending || cycle.status !== "pending" || !reason.trim()}
            onClick={() =>
              void run(
                () =>
                  decline({
                    ...commandBase,
                    declinedCheckpoint,
                    idempotencyKey: crypto.randomUUID(),
                    reason: reason.trim(),
                  }),
                "Proposal revision requested."
              )
            }
            variant="destructive"
          >
            <X aria-hidden /> Request revision
          </Button>
          <Button
            disabled={pending || !confirmation.canDecide || !reason.trim()}
            onClick={() =>
              void run(
                () =>
                  approve({
                    ...commandBase,
                    idempotencyKey: crypto.randomUUID(),
                    reason: reason.trim(),
                  }),
                "Proposal approved for closing."
              )
            }
          >
            {pending ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" />
            ) : (
              <Check aria-hidden />
            )}
            Approve for closing
          </Button>
        </div>
      </FramePanel>
    </Frame>
  );

  return (
    <ProductionProposalReviewSurface
      detail={detail}
      initialActiveTab="review"
      lenderAssignmentSurface={actions}
    />
  );
}
