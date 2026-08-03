"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowRight,
  FilePlus2,
  LockKeyhole,
  RefreshCw,
  Send,
} from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type QuoteRoundListProjection = FunctionReturnType<
  typeof api.quote_rounds.listQuoteRounds
>;
type QuoteRoundSummary = QuoteRoundListProjection["rounds"][number];

function formatDeadline(value: number | undefined) {
  if (!value) {
    return "No deadline set";
  }
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function modeLabel(mode: QuoteRoundSummary["mode"]) {
  return mode === "combined"
    ? "Labour + Materials"
    : mode === "labour"
      ? "Labour"
      : "Materials";
}

export function QuoteRoundsSurface({
  buildId,
  onCreate,
  onOpen,
  organizationId,
}: {
  buildId: string;
  onCreate: () => void;
  onOpen: (roundId: string) => void;
  organizationId: string;
}) {
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  return (
    <QuoteRoundsQuery
      buildId={buildId}
      key={refreshGeneration}
      onCreate={onCreate}
      onOpen={onOpen}
      onRetry={() => setRefreshGeneration((value) => value + 1)}
      organizationId={organizationId}
    />
  );
}

function QuoteRoundsQuery({
  buildId,
  onCreate,
  onOpen,
  onRetry,
  organizationId,
}: {
  buildId: string;
  onCreate: () => void;
  onOpen: (roundId: string) => void;
  onRetry: () => void;
  organizationId: string;
}) {
  const quoteRoundList = useQuery(api.quote_rounds.listQuoteRounds, {
    buildId: buildId as Id<"activeBuilds">,
    workosOrganizationId: organizationId,
  });

  if (quoteRoundList === undefined) {
    return (
      <Frame data-testid="quote-rounds-loading">
        <FramePanel className="flex flex-wrap items-center gap-3 p-4 text-sm">
          <span className="min-w-0 flex-1">Loading Build Quotes…</span>
          <Button onClick={onRetry} size="sm" variant="outline">
            <RefreshCw />
            Refresh
          </Button>
        </FramePanel>
      </Frame>
    );
  }
  const rounds = quoteRoundList.rounds;

  return (
    <div className="space-y-4" data-testid="build-quote-rounds-surface">
      <Frame>
        <FrameHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <FrameTitle>Build Quotes</FrameTitle>
            <FrameDescription>
              Draft, publish, and audit private contractor and supplier Quote
              Rounds from the canonical Build context.
            </FrameDescription>
          </div>
          <Button onClick={onCreate}>
            <FilePlus2 />
            New Quote Round
          </Button>
        </FrameHeader>
      </Frame>
      {rounds.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {rounds.map((round) => (
            <Card
              key={round._id}
              render={
                <button
                  aria-label={`Open ${round.title}`}
                  className="min-h-36 text-left"
                  onClick={() => onOpen(round._id)}
                  type="button"
                />
              }
            >
              <CardHeader className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="min-w-0 flex-1 truncate text-base">
                    {round.title}
                  </CardTitle>
                  <Badge
                    variant={
                      round.state === "open"
                        ? "success"
                        : round.state === "draft"
                          ? "outline"
                          : "secondary"
                    }
                  >
                    {round.state}
                  </Badge>
                </div>
                <CardDescription>
                  {modeLabel(round.mode)} · revision {round.revision} ·{" "}
                  {round.invitationCount} invitation
                  {round.invitationCount === 1 ? "" : "s"}
                </CardDescription>
              </CardHeader>
              <CardPanel className="flex items-center gap-3 p-4 pt-0 text-muted-foreground text-xs">
                <span>
                  {round.packageRevisionNumber
                    ? `Package v${round.packageRevisionNumber}`
                    : "Editable draft"}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {formatDeadline(round.responseDeadline)}
                </span>
                {round.state === "open" ? (
                  <Send className="size-4 text-success-foreground" />
                ) : (
                  <LockKeyhole className="size-4" />
                )}
                <ArrowRight className="size-4" />
              </CardPanel>
            </Card>
          ))}
        </div>
      ) : (
        <Frame>
          <FramePanel className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
            <span className="grid size-10 place-items-center rounded-xl bg-muted">
              <FilePlus2 className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm">No Quote Rounds yet</p>
              <p className="text-muted-foreground text-xs">
                Start a controlled labour, material, or combined package from
                this Build.
              </p>
            </div>
            <Button onClick={onCreate}>
              <FilePlus2 />
              Start one
            </Button>
          </FramePanel>
        </Frame>
      )}
      <Alert variant="info">
        <LockKeyhole />
        <AlertTitle>Publication is immutable</AlertTitle>
        <AlertDescription>
          Open Quote Rounds retain their package, response-template, and active
          invitation snapshots even when the Build changes later.
        </AlertDescription>
      </Alert>
    </div>
  );
}
