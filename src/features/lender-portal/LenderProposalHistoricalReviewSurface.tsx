import type { FunctionReturnType } from "convex/server";
import { CheckCircle2, FileText, History, LockKeyhole } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import {
  PROPOSAL_CONFIRMATION_CHECKPOINTS,
  ProposalCheckpointFacts,
  proposalCheckpointFacts,
} from "#/features/lender-portal/LenderProposalConfirmationSheet.tsx";
import type { api } from "../../../convex/_generated/api";

type HistoricalProposalDetail = FunctionReturnType<
  typeof api.production_proposals.getHistoricalLenderProposalDetail
>;
type HistoricalProposalConfirmation = FunctionReturnType<
  typeof api.production_proposals.getHistoricalLenderProposalConfirmation
>;

export function LenderProposalHistoricalReviewSurface({
  confirmation,
  detail,
  onLoadMore,
}: {
  confirmation: HistoricalProposalConfirmation;
  detail: HistoricalProposalDetail;
  onLoadMore?: () => void;
}) {
  const canLoadMore = !(
    detail.documents.isDone &&
    detail.revisions.isDone &&
    detail.decisions.isDone &&
    confirmation.history.isDone
  );

  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <Frame>
        <FramePanel className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-balance font-semibold text-xl">
                {detail.proposal.buildName}
              </h1>
              <p className="mt-1 text-pretty text-muted-foreground text-sm">
                {detail.proposal.location}
              </p>
            </div>
            <Badge variant="secondary">Assignment withdrawn</Badge>
          </div>
          <Alert>
            <LockKeyhole aria-hidden />
            <AlertTitle>Historical proposal access</AlertTitle>
            <AlertDescription>
              This sealed assignment record is read-only. It contains only the
              proposal facts, documents, revisions, and decisions captured for
              this lender assignment.
            </AlertDescription>
          </Alert>
          <p className="text-muted-foreground text-xs">
            Snapshot sealed {formatDateTime(detail.capturedAt)}
          </p>
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel className="space-y-4 p-5">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-sm">
              <History aria-hidden className="size-4" /> Published revisions
            </h2>
            <p className="mt-1 text-pretty text-muted-foreground text-xs">
              Checkpoint facts frozen for each published revision in this
              assignment.
            </p>
          </div>
          <Separator />
          {detail.revisions.page.length ? (
            <ol className="grid gap-5">
              {detail.revisions.page.map((revision) => (
                <li
                  className="space-y-4 border-b pb-5 last:border-0 last:pb-0"
                  key={revision.revisionId}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-sm">
                        Revision {revision.revisionNumber}
                      </h3>
                      <p className="mt-1 text-muted-foreground text-xs">
                        Published {formatDateTime(revision.createdAt)}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {revision.changedCheckpoints.length === 0
                        ? "Initial published facts"
                        : `${revision.changedCheckpoints.length} changed ${revision.changedCheckpoints.length === 1 ? "checkpoint" : "checkpoints"}`}
                    </Badge>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {PROPOSAL_CONFIRMATION_CHECKPOINTS.map(
                      ([checkpoint, label]) => (
                        <ProposalCheckpointFacts
                          facts={proposalCheckpointFacts(
                            revision.checkpoints,
                            checkpoint
                          )}
                          key={checkpoint}
                          label={label}
                        />
                      )
                    )}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground text-sm">
              No published revisions were captured for this assignment.
            </p>
          )}
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel className="space-y-4 p-5">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-sm">
              <CheckCircle2 aria-hidden className="size-4" /> Lender decisions
            </h2>
            <p className="mt-1 text-pretty text-muted-foreground text-xs">
              Final lender decisions sealed for this assignment, without private
              reviewer details or rationale.
            </p>
          </div>
          <Separator />
          {detail.decisions.page.length ? (
            <ol className="grid gap-3">
              {detail.decisions.page.map((decision) => {
                const decidedAt = decision.approvedAt ?? decision.declinedAt;
                return (
                  <li
                    className="grid gap-2 border-b pb-3 last:border-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-center"
                    key={decision.approvalId}
                  >
                    <div>
                      <p className="font-semibold text-sm">
                        {decision.proposalRevisionNumber
                          ? `Revision ${decision.proposalRevisionNumber}`
                          : "Historical decision"}
                      </p>
                      <p className="mt-1 text-muted-foreground text-xs">
                        {decidedAt
                          ? `Recorded ${formatDateTime(decidedAt)}`
                          : "Decision timestamp unavailable"}
                      </p>
                    </div>
                    <Badge
                      variant={
                        decision.status === "declined"
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {decision.status}
                    </Badge>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-muted-foreground text-sm">
              No final lender decisions were captured for this assignment.
            </p>
          )}
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel className="space-y-4 p-5">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-sm">
              <FileText aria-hidden className="size-4" /> Assignment documents
            </h2>
            <p className="mt-1 text-pretty text-muted-foreground text-xs">
              Documents frozen when the assignment was withdrawn.
            </p>
          </div>
          <Separator />
          {detail.documents.page.length ? (
            <ul className="grid gap-3">
              {detail.documents.page.map((document) => (
                <li
                  className="flex min-w-0 flex-wrap items-center justify-between gap-3"
                  key={document.documentId}
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium text-sm">
                      {document.fileName}
                    </p>
                    <p className="mt-1 text-muted-foreground text-xs">
                      {document.documentType} · {document.status}
                    </p>
                  </div>
                  {document.storageUrl ? (
                    <Button
                      render={
                        <a
                          aria-label={`Open ${document.fileName}`}
                          href={document.storageUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open document
                        </a>
                      }
                      size="sm"
                      variant="outline"
                    />
                  ) : (
                    <Badge variant="outline">File unavailable</Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              No documents were captured for this assignment.
            </p>
          )}
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel className="space-y-4 p-5">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-sm">
              <History aria-hidden className="size-4" /> Confirmation record
            </h2>
            <p className="mt-1 text-pretty text-muted-foreground text-xs">
              Immutable published revisions and lender decisions from this
              assignment interval.
            </p>
          </div>
          <Separator />
          <ol className="grid gap-3">
            {confirmation.history.page.map((cycle) => (
              <li
                className="grid gap-2 border-b pb-3 last:border-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-center"
                key={cycle.confirmationCycleId}
              >
                <div>
                  <p className="font-semibold text-sm">
                    Cycle {cycle.cycleNumber} · Revision{" "}
                    {cycle.proposalRevisionNumber}
                  </p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    Opened {formatDateTime(cycle.openedAt)} ·{" "}
                    {`${countAcknowledgedCheckpoints(cycle)} of ${PROPOSAL_CONFIRMATION_CHECKPOINTS.length} checkpoints acknowledged`}
                  </p>
                </div>
                <Badge
                  variant={
                    cycle.status === "declined" ? "destructive" : "outline"
                  }
                >
                  {cycle.status}
                </Badge>
              </li>
            ))}
          </ol>
          {canLoadMore && onLoadMore ? (
            <Button onClick={onLoadMore} variant="outline">
              Load older assignment history
            </Button>
          ) : null}
        </FramePanel>
      </Frame>
    </div>
  );
}

function countAcknowledgedCheckpoints(
  cycle: HistoricalProposalConfirmation["history"]["page"][number]
) {
  const checkpointNames = new Set(
    PROPOSAL_CONFIRMATION_CHECKPOINTS.map(([checkpoint]) => checkpoint)
  );
  return new Set(
    cycle.acknowledgements
      .map((acknowledgement) => acknowledgement.checkpoint)
      .filter((checkpoint) => checkpointNames.has(checkpoint))
  ).size;
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
