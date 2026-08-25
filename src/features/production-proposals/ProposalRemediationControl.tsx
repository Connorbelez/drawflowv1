import type { FunctionReturnType } from "convex/server";
import {
  ArrowRight,
  CheckCircle2,
  History,
  Loader2,
  Send,
  TriangleAlert,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type RemediationProjection = FunctionReturnType<
  typeof api.production_proposals.getBackofficeProposalRemediation
>;
type Checkpoint = NonNullable<
  RemediationProjection["remediation"]
>["declinedCheckpoint"];

export interface PublishRemediatedProposalCommand {
  expectedAssignmentId: Id<"proposalLenderAssignments">;
  expectedProposalRevisionNumber: number;
  idempotencyKey: string;
  reason: string;
}

export function ProposalRemediationControl({
  control,
  onNavigateToCheckpoint,
  onLoadMoreHistory,
  onPublish,
}: {
  control: RemediationProjection;
  onNavigateToCheckpoint: (checkpoint: Checkpoint) => void;
  onLoadMoreHistory?: () => void;
  onPublish: (command: PublishRemediatedProposalCommand) => Promise<unknown>;
}) {
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const idempotencyKeys = useRef(new Map<string, string>());
  const remediation = control.remediation;
  const cycle = control.currentCycle;

  if (!cycle) {
    return null;
  }

  const publish = async () => {
    if (!(remediation && reason.trim())) {
      return;
    }
    const commandIdentity = `${remediation.publishBase.expectedAssignmentId}:${remediation.publishBase.expectedProposalRevisionNumber}:${reason.trim()}`;
    let idempotencyKey = idempotencyKeys.current.get(commandIdentity);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      idempotencyKeys.current.set(commandIdentity, idempotencyKey);
    }
    setPending(true);
    setError(undefined);
    try {
      const result = await onPublish({
        ...remediation.publishBase,
        idempotencyKey,
        reason: reason.trim(),
      });
      setReason("");
      toast.success("Proposal revision published.", {
        description:
          "A fresh lender confirmation cycle now requires all five acknowledgements.",
      });
      return result;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to publish the proposal revision.";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      className="space-y-5 border-t pt-4"
      id="proposal-remediation-control"
      tabIndex={-1}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-sm">Lender confirmation cycle</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Revision {cycle.proposalRevisionNumber} · cycle {cycle.cycleNumber}
          </p>
        </div>
        <Badge variant={control.lenderNeedsAction ? "default" : "outline"}>
          {remediation
            ? "Revision required"
            : control.lenderNeedsAction
              ? "Lender action required"
              : cycle.status}
        </Badge>
      </div>

      {remediation ? (
        <>
          <Alert variant="destructive">
            <TriangleAlert aria-hidden />
            <AlertTitle>
              Lender requested changes to{" "}
              {checkpointLabel(remediation.declinedCheckpoint)}
            </AlertTitle>
            <AlertDescription>{remediation.privateReason}</AlertDescription>
          </Alert>

          {error ? (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden />
              <AlertTitle>Unable to publish the next revision</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              Update this same proposal through its existing packet controls.
              Then publish Revision{" "}
              {remediation.declinedProposalRevisionNumber + 1}. The lender must
              acknowledge all five checkpoints again.
            </p>
            <Button
              onClick={() =>
                onNavigateToCheckpoint(remediation.declinedCheckpoint)
              }
              variant="outline"
            >
              Open affected proposal section <ArrowRight aria-hidden />
            </Button>
          </div>

          <Separator />

          <div className="space-y-3">
            <label
              className="font-medium text-sm"
              htmlFor="proposal-remediation-reason"
            >
              Revision publication reason
            </label>
            <Textarea
              aria-describedby="proposal-remediation-reason-help"
              id="proposal-remediation-reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Summarize the governed changes in this revision"
              value={reason}
            />
            <p
              className="text-muted-foreground text-xs"
              id="proposal-remediation-reason-help"
            >
              Publication uses the current assignment and base Revision{" "}
              {remediation.publishBase.expectedProposalRevisionNumber}.
            </p>
            <Button
              disabled={pending || !reason.trim()}
              onClick={() => publish().catch(() => undefined)}
            >
              {pending ? (
                <Loader2
                  aria-hidden
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : (
                <Send aria-hidden />
              )}
              Publish next revision
            </Button>
          </div>
        </>
      ) : (
        <Alert>
          <CheckCircle2 aria-hidden />
          <AlertTitle>
            {control.lenderNeedsAction
              ? "Current revision is with the lender"
              : "No remediation is required"}
          </AlertTitle>
          <AlertDescription>
            {cycle.changedCheckpoints.length > 0
              ? `Revision ${cycle.proposalRevisionNumber} changed ${cycle.changedCheckpoints.map(checkpointLabel).join(", ")}.`
              : `Revision ${cycle.proposalRevisionNumber} has no checkpoint changes from the prior lender-reviewed revision.`}
          </AlertDescription>
        </Alert>
      )}

      <Separator />

      <section aria-labelledby="proposal-confirmation-history-title">
        <h3
          className="flex items-center gap-2 font-medium text-sm"
          id="proposal-confirmation-history-title"
        >
          <History aria-hidden className="size-4" /> Confirmation history
        </h3>
        <ol className="mt-3 grid gap-2">
          {control.history.page.map((item) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-xs last:border-0 last:pb-0"
              key={item.confirmationCycleId}
            >
              <span>
                Cycle {item.cycleNumber} · Revision{" "}
                {item.proposalRevisionNumber}
              </span>
              <Badge variant="outline">{item.status}</Badge>
            </li>
          ))}
        </ol>
        {!control.history.isDone && onLoadMoreHistory ? (
          <Button
            className="mt-4"
            onClick={onLoadMoreHistory}
            variant="outline"
          >
            Load older cycles
          </Button>
        ) : null}
      </section>
    </section>
  );
}

export function checkpointLabel(checkpoint: Checkpoint) {
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
