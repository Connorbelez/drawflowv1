import type { FunctionReturnType } from "convex/server";
import { CheckCircle2, Clock3, History, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import type { api } from "../../../convex/_generated/api";

type BuilderConfirmationState = FunctionReturnType<
  typeof api.production_proposals.getBuilderProposalConfirmationState
>;

export function BuilderProposalConfirmationStatus({
  onLoadMoreHistory,
  state,
}: {
  onLoadMoreHistory?: () => void;
  state: BuilderConfirmationState;
}) {
  const status = state.lifecycle.lenderConfirmation;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-sm">Proposal confirmation</p>
          <p className="mt-1 text-muted-foreground text-xs">
            {state.currentProposalRevisionNumber === null
              ? "No published revision"
              : `Current Revision ${state.currentProposalRevisionNumber}`}
          </p>
        </div>
        <Badge variant={state.updateRequired ? "destructive" : "outline"}>
          {statusLabel(status)}
        </Badge>
      </div>

      {state.updateRequired ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden />
          <AlertTitle>Back Office is preparing an updated revision</AlertTitle>
          <AlertDescription>
            The current lender confirmation cycle requires an update. You do not
            need to take action here.
          </AlertDescription>
        </Alert>
      ) : status === "approved" ? (
        <Alert>
          <CheckCircle2 aria-hidden />
          <AlertTitle>Current revision confirmed</AlertTitle>
          <AlertDescription>
            The proposal can continue through the remaining closing controls.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <Clock3 aria-hidden />
          <AlertTitle>Confirmation in progress</AlertTitle>
          <AlertDescription>
            The current proposal revision is moving through its governed review
            cycle.
          </AlertDescription>
        </Alert>
      )}

      {state.history.page.length > 0 ? (
        <>
          <Separator />
          <section aria-labelledby="builder-proposal-confirmation-history">
            <h3
              className="flex items-center gap-2 font-medium text-sm"
              id="builder-proposal-confirmation-history"
            >
              <History aria-hidden className="size-4" /> Revision history
            </h3>
            <ol className="mt-3 grid gap-2">
              {state.history.page.map((cycle) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-xs last:border-0 last:pb-0"
                  key={`${cycle.cycleNumber}:${cycle.proposalRevisionNumber}`}
                >
                  <span>
                    Revision {cycle.proposalRevisionNumber} · cycle{" "}
                    {cycle.cycleNumber}
                  </span>
                  <Badge variant="outline">{statusLabel(cycle.status)}</Badge>
                </li>
              ))}
            </ol>
            {!state.history.isDone && onLoadMoreHistory ? (
              <Button
                className="mt-4"
                onClick={onLoadMoreHistory}
                variant="outline"
              >
                Load older cycles
              </Button>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

function statusLabel(
  status:
    | BuilderConfirmationState["lifecycle"]["lenderConfirmation"]
    | "superseded"
) {
  switch (status) {
    case "approved":
      return "Confirmed";
    case "declined":
      return "Update required";
    case "not_required":
      return "Not required";
    case "pending":
      return "In review";
    case "superseded":
      return "Superseded";
  }
}
