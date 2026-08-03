"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowLeft,
  Check,
  CircleDollarSign,
  FileText,
  LoaderCircle,
  MapPin,
  Paperclip,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { FieldRichTextPreview } from "#/components/rich-text/field-rich-text.tsx";
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
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { api } from "../../../convex/_generated/api";

type ComparisonResult = FunctionReturnType<
  typeof api.quote_comparisons.getQuoteRoundComparison
>;
type AvailableComparison = Extract<ComparisonResult, { status: "available" }>;
type Candidate = AvailableComparison["candidates"][number];
type ComparisonInvitation = AvailableComparison["invitations"][number];
const APP_TIME_ZONE = "America/Toronto";

interface QuoteRoundComparisonSurfaceProps {
  buildId: string;
  onExit: () => void;
  organizationId: string;
  quoteRoundId: string;
  readOnly?: boolean;
}

function formatCents(value: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value / 100);
}

function formatDate(value: number | undefined) {
  if (value === undefined) {
    return "Not set";
  }
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TIME_ZONE,
  }).format(value);
}

function ComparisonLineList({
  lines,
  title,
}: {
  lines: Candidate["labourLines"];
  title: string;
}) {
  return (
    <section aria-label={title} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-medium text-sm">{title}</h4>
        <span className="text-muted-foreground text-xs">
          {lines.length} lines
        </span>
      </div>
      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-muted-foreground text-xs">
          No quoted lines in this category.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {lines.map((line) => (
            <li
              className="flex min-w-0 items-start justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2 text-sm"
              key={line._id}
            >
              <span className="min-w-0 truncate" title={line.title}>
                {line.title}
              </span>
              <span className="shrink-0 font-medium tabular-nums">
                {line.quotedAmountCents === undefined
                  ? "Not priced"
                  : formatCents(line.quotedAmountCents)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CandidateCard({
  candidate,
  canSetPreferred,
  disabled,
  isPreferred,
  onSelect,
  selecting,
}: {
  canSetPreferred: boolean;
  candidate: Candidate;
  disabled: boolean;
  isPreferred: boolean;
  onSelect: () => Promise<void>;
  selecting: boolean;
}) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="gap-3 border-b bg-muted/20 p-4 sm:p-5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">
              {candidate.invitation.recipientNameSnapshot}
            </CardTitle>
            <CardDescription className="truncate">
              {candidate.invitation.recipientEmailSnapshot}
            </CardDescription>
          </div>
          {isPreferred ? (
            <Badge className="shrink-0" variant="success">
              <ShieldCheck />
              Preferred Quote
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Current submitted total
            </p>
            <p className="font-semibold text-2xl tabular-nums">
              {formatCents(candidate.totals.canonicalTotalCents)}
            </p>
          </div>
          {canSetPreferred ? (
            <Button
              aria-label={
                isPreferred
                  ? `Preferred Quote selected from ${candidate.invitation.recipientNameSnapshot}`
                  : `Select ${candidate.invitation.recipientNameSnapshot} as Preferred Quote`
              }
              disabled={disabled || isPreferred}
              onClick={onSelect}
              size="sm"
              variant={isPreferred ? "secondary" : "outline"}
            >
              {selecting ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Check />
              )}
              {isPreferred ? "Selected" : "Select Preferred"}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardPanel className="space-y-5 p-4 sm:p-5">
        <div className="grid gap-2 sm:grid-cols-4">
          {(
            [
              ["Labour", candidate.totals.labourCents],
              ["Materials", candidate.totals.materialsCents],
              ["Expanded scope", candidate.totals.expandedScopeCents],
              ["Template priced", candidate.totals.templatePricedCents],
            ] as const
          ).map(([label, amount]) => (
            <div className="rounded-lg border bg-background p-3" key={label}>
              <p className="text-muted-foreground text-xs">{label}</p>
              <p className="font-medium tabular-nums">{formatCents(amount)}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <ComparisonLineList
            lines={candidate.labourLines}
            title="Labour lines"
          />
          <ComparisonLineList
            lines={candidate.materialLines}
            title="Material lines"
          />
        </div>
        {candidate.expandedScopeLines.length > 0 ? (
          <ComparisonLineList
            lines={candidate.expandedScopeLines}
            title="Expanded scope / alternates"
          />
        ) : null}
        {candidate.answers.length > 0 ? (
          <section aria-label="Response answers" className="space-y-2">
            <h4 className="font-medium text-sm">Response answers</h4>
            <dl className="divide-y rounded-lg border text-sm">
              {candidate.answers.map((answer) => (
                <div
                  className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(8rem,0.4fr)_minmax(0,1fr)]"
                  key={answer.sourcePackageRevisionResponseFieldId}
                >
                  <dt className="text-muted-foreground">{answer.label}</dt>
                  <dd className="min-w-0 whitespace-pre-wrap break-words">
                    {answer.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
        {candidate.commentsHtml ? (
          <section aria-label="Recipient comments" className="space-y-2">
            <h4 className="font-medium text-sm">Recipient comments</h4>
            <FieldRichTextPreview
              ariaLabel="Recipient comments"
              value={candidate.commentsHtml}
            />
          </section>
        ) : null}
        {candidate.attachments.length > 0 ? (
          <section aria-label="Submission attachments" className="space-y-2">
            <h4 className="flex items-center gap-2 font-medium text-sm">
              <Paperclip className="size-4" /> Attachments
            </h4>
            <ul className="space-y-1 text-sm">
              {candidate.attachments.map((attachment) => (
                <li
                  className="flex items-center gap-2 truncate"
                  key={attachment._id}
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{attachment.fileName}</span>
                  <span className="shrink-0 text-muted-foreground text-xs">
                    {attachment.mimeType}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </CardPanel>
      <FrameFooter className="flex flex-wrap gap-2 border-t bg-muted/10 px-4 py-3 text-muted-foreground text-xs sm:px-5">
        <span>Submission revision {candidate.submission.revision}</span>
        <span aria-hidden="true">·</span>
        <span>Submitted {formatDate(candidate.submission.submittedAt)}</span>
        {candidate.history.length > 1 ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{candidate.history.length} revisions retained</span>
          </>
        ) : null}
      </FrameFooter>
    </Card>
  );
}

function InvitationHistoryCard({
  invitation,
}: {
  invitation: ComparisonInvitation;
}) {
  return (
    <Card className="min-w-0 p-4 shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="truncate text-sm">
            {invitation.recipientNameSnapshot}
          </CardTitle>
          <CardDescription className="truncate">
            {invitation.recipientEmailSnapshot}
          </CardDescription>
        </div>
        <Badge
          variant={
            invitation.participationState === "active" ? "success" : "outline"
          }
        >
          {invitation.participationState}
        </Badge>
      </div>
      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <p className="text-muted-foreground">Immutable response</p>
          <p className="mt-1 font-medium">
            {invitation.hasCurrentSubmission
              ? "Current submission recorded"
              : "No current submission"}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Access history</p>
          <p className="mt-1 font-medium">
            {invitation.access.active} active · {invitation.access.total} total
          </p>
          <p className="mt-1 text-muted-foreground">
            {invitation.access.expired} expired · {invitation.access.rotated}{" "}
            rotated · {invitation.access.revoked} revoked
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Delivery</p>
          <p className="mt-1 font-medium">
            {invitation.communication.latestStatus ?? "Not dispatched"}
          </p>
          <p className="mt-1 text-muted-foreground">
            {invitation.communication.attemptCount} attempt
            {invitation.communication.attemptCount === 1 ? "" : "s"} ·{" "}
            {invitation.communication.recoveryState}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Reminder state</p>
          <p className="mt-1 font-medium">
            {invitation.communication.reminderEligible
              ? "Eligible"
              : "Not eligible"}
          </p>
          {invitation.communication.cooldownUntil ? (
            <p className="mt-1 text-muted-foreground">
              Cooldown until{" "}
              {formatDate(invitation.communication.cooldownUntil)}
            </p>
          ) : null}
        </div>
      </div>
      {invitation.communication.history.length > 0 ? (
        <ol className="mt-4 grid gap-1 border-t pt-3 text-muted-foreground text-xs">
          {invitation.communication.history.map((entry) => (
            <li key={`${entry.createdAt}:${entry.kind}:${entry.status}`}>
              {formatDate(entry.createdAt)} · {entry.kind} · {entry.status}
              {entry.detail ? ` · ${entry.detail}` : ""}
            </li>
          ))}
        </ol>
      ) : null}
    </Card>
  );
}

function PreferredSelectionFrame({
  busy,
  canClear,
  confirming,
  onCancelClear,
  onClear,
  onRequestClear,
  preferred,
}: {
  busy: boolean;
  canClear: boolean;
  confirming: boolean;
  onCancelClear: () => void;
  onClear: () => Promise<void>;
  onRequestClear: () => void;
  preferred: AvailableComparison["preferred"];
}) {
  if (!(preferred || canClear)) {
    return null;
  }
  return (
    <Frame>
      <FramePanel className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <Badge variant="success">
            <ShieldCheck /> Preferred Quote
          </Badge>
          <p className="truncate text-sm">
            {preferred
              ? `Submission revision ${preferred.submissionRevision} selected ${formatDate(preferred.selectedAt)}.`
              : "The stored Preferred Quote is no longer an active comparison candidate. Clear it to recover this round."}
          </p>
        </div>
        {canClear ? (
          confirming ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="text-muted-foreground text-xs">
                Confirm clearing this selection?
              </span>
              <Button
                disabled={busy}
                onClick={onClear}
                size="sm"
                variant="outline"
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <RotateCcw />
                )}
                Confirm clear
              </Button>
              <Button
                disabled={busy}
                onClick={onCancelClear}
                size="sm"
                variant="ghost"
              >
                Keep Preferred
              </Button>
            </div>
          ) : (
            <Button
              disabled={busy}
              onClick={onRequestClear}
              size="sm"
              variant="outline"
            >
              <RotateCcw />
              Clear Preferred
            </Button>
          )
        ) : null}
      </FramePanel>
    </Frame>
  );
}

export function QuoteRoundComparisonSurface({
  buildId,
  onExit,
  organizationId,
  quoteRoundId,
  readOnly = false,
}: QuoteRoundComparisonSurfaceProps) {
  const comparison = useQuery(api.quote_comparisons.getQuoteRoundComparison, {
    buildId,
    quoteRoundId,
    workosOrganizationId: organizationId,
  });
  const setPreferred = useMutation(
    api.quote_comparisons.setPreferredQuoteSubmissionRevision
  );
  const clearPreferred = useMutation(
    api.quote_comparisons.clearPreferredQuoteSubmissionRevision
  );
  const [busySubmissionId, setBusySubmissionId] = useState<string>();
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState<string>();
  const isMutating = busySubmissionId !== undefined;

  if (comparison === undefined) {
    return (
      <main className="grid min-h-[calc(100vh-4rem)] place-items-center bg-muted/30 p-3 sm:p-5">
        <Frame>
          <FramePanel className="flex items-center gap-2 p-5 text-sm">
            <LoaderCircle className="animate-spin" /> Loading Quote comparison…
          </FramePanel>
        </Frame>
      </main>
    );
  }
  if (comparison.status === "unavailable") {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-muted/30 p-3 sm:p-5">
        <div className="mx-auto max-w-6xl">
          <Frame>
            <FrameHeader>
              <FrameTitle>Quote comparison unavailable</FrameTitle>
              <FrameDescription>{comparison.reason}</FrameDescription>
            </FrameHeader>
            <FramePanel className="p-4">
              <Button onClick={onExit} variant="outline">
                <ArrowLeft /> Build Quotes
              </Button>
            </FramePanel>
          </Frame>
        </div>
      </main>
    );
  }
  const invitations = comparison.invitations ?? [];

  const selectCandidate = async (candidate: Candidate) => {
    if (isMutating) {
      return;
    }
    setError(undefined);
    setBusySubmissionId(String(candidate.submission._id));
    try {
      const result = await setPreferred({
        buildId,
        expectedStateVersion: comparison.stateVersion,
        quoteRoundId,
        reason:
          "Builder selected a Preferred Quote from the normalized comparison.",
        submissionRevisionId: String(candidate.submission._id),
        workosOrganizationId: organizationId,
      });
      if (result.status === "conflict") {
        setError(
          "Preferred Quote changed elsewhere. Refresh the comparison and try again."
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Preferred Quote selection failed."
      );
    } finally {
      setBusySubmissionId(undefined);
    }
  };

  const clear = async () => {
    if (!comparison.canClearPreferred || isMutating) {
      return;
    }
    setError(undefined);
    setBusySubmissionId("clear");
    try {
      const result = await clearPreferred({
        buildId,
        confirmed: true,
        expectedStateVersion: comparison.stateVersion,
        quoteRoundId,
        reason: "Builder cleared the Preferred Quote during commercial review.",
        workosOrganizationId: organizationId,
      });
      if (result.status === "conflict") {
        setError(
          "Preferred Quote changed elsewhere. Refresh the comparison and try again."
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Preferred Quote clear failed."
      );
    } finally {
      setConfirmClear(false);
      setBusySubmissionId(undefined);
    }
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-muted/30 p-3 sm:p-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button onClick={onExit} variant="ghost">
            <ArrowLeft /> Build Quotes
          </Button>
          <Badge
            variant={
              comparison.round.state === "closed" ? "outline" : "success"
            }
          >
            {comparison.round.state}
          </Badge>
          {readOnly ? <Badge variant="outline">Read-only view</Badge> : null}
        </div>
        {error ? (
          <Alert variant="error">
            <RotateCcw />
            <AlertTitle>Comparison action failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Frame>
          <FrameHeader>
            <FrameTitle>{comparison.round.title}</FrameTitle>
            <FrameDescription>
              Immutable submission comparison for Package Revision{" "}
              {comparison.package.revision}. Draft content is private to each
              recipient.
            </FrameDescription>
          </FrameHeader>
          <FramePanel className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-start gap-2 rounded-xl border bg-background p-3">
              <CircleDollarSign className="mt-0.5 size-4 text-primary" />
              <div>
                <p className="text-muted-foreground text-xs">Candidates</p>
                <p className="font-medium">
                  {comparison.candidates.length} current submissions
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-xl border bg-background p-3">
              <FileText className="mt-0.5 size-4 text-primary" />
              <div>
                <p className="text-muted-foreground text-xs">
                  Response deadline
                </p>
                <p className="font-medium">
                  {formatDate(comparison.package.responseDeadline)}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-xl border bg-background p-3 sm:col-span-2">
              <MapPin className="mt-0.5 size-4 text-primary" />
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs">
                  Build location snapshot
                </p>
                <p
                  className="truncate font-medium"
                  title={comparison.package.siteAddressSnapshot}
                >
                  {comparison.package.siteAddressSnapshot}
                </p>
              </div>
            </div>
          </FramePanel>
        </Frame>

        <Frame>
          <FrameHeader>
            <FrameTitle>Invitation and delivery history</FrameTitle>
            <FrameDescription>
              Immutable recipient snapshots, access credentials, and bounded
              communication outcomes for this Quote Round.
            </FrameDescription>
          </FrameHeader>
          <FramePanel className="grid gap-3 p-4 md:grid-cols-2">
            {invitations.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No invitations are recorded for this Quote Round.
              </p>
            ) : (
              invitations.map((invitation) => (
                <InvitationHistoryCard
                  invitation={invitation}
                  key={invitation._id}
                />
              ))
            )}
          </FramePanel>
        </Frame>

        <PreferredSelectionFrame
          busy={isMutating}
          canClear={comparison.canClearPreferred && !readOnly}
          confirming={confirmClear}
          onCancelClear={() => setConfirmClear(false)}
          onClear={clear}
          onRequestClear={() => setConfirmClear(true)}
          preferred={comparison.preferred}
        />

        <section aria-label="Current quote submissions" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-semibold text-lg">Current submissions</h2>
              <p className="text-muted-foreground text-sm">
                Side-by-side totals, normalized package lines, answers,
                comments, and attachment metadata.
              </p>
            </div>
            <span className="text-muted-foreground text-xs">
              State version {comparison.stateVersion}
            </span>
          </div>
          {comparison.candidates.length === 0 ? (
            <Frame>
              <FramePanel className="p-5 text-muted-foreground text-sm">
                No active immutable submissions yet. Recipient Drafts remain
                private until submitted.
              </FramePanel>
            </Frame>
          ) : (
            <div className="grid min-w-0 gap-4 xl:grid-cols-2">
              {comparison.candidates.map((candidate) => (
                <CandidateCard
                  candidate={candidate}
                  canSetPreferred={comparison.canSetPreferred && !readOnly}
                  disabled={isMutating}
                  isPreferred={
                    comparison.preferred?.submissionRevisionId ===
                    candidate.submission._id
                  }
                  key={candidate.submission._id}
                  onSelect={() => selectCandidate(candidate)}
                  selecting={
                    busySubmissionId === String(candidate.submission._id)
                  }
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
