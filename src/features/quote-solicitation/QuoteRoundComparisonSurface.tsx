"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  FileText,
  LoaderCircle,
  MapPin,
  Paperclip,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { FieldRichTextPreview } from "#/components/rich-text/field-rich-text.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { api } from "../../../convex/_generated/api";
import type { QuoteRoundRepublishCapacity } from "./QuoteRoundComposerRoute.tsx";

type ComparisonResult = FunctionReturnType<
  typeof api.quote_comparisons.getQuoteRoundComparison
>;
type AvailableComparison = Extract<ComparisonResult, { status: "available" }>;
type Candidate = AvailableComparison["candidates"][number];
type ComparisonInvitation = AvailableComparison["invitations"][number];
const APP_TIME_ZONE = "America/Toronto";
const APP_DATE_TIME_LOCAL_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  timeZone: APP_TIME_ZONE,
  year: "numeric",
});
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const APP_DATE_TIME_LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

interface PackageRevisionSummary {
  _id: string;
  publishedAt: number;
  responseDeadline: number;
  revision: number;
}

interface RepublishInput {
  breakGlassConfirmed?: boolean;
  deadlinePolicy:
    | { kind: "keep" }
    | { kind: "replace"; responseDeadline: number };
  reason: string;
}

interface QuoteRoundComparisonSurfaceProps {
  buildId: string;
  onExit: () => void;
  onRepublish?: (input: RepublishInput) => Promise<void>;
  onSelectPackageRevision?: (packageRevisionId: string) => void;
  organizationId: string;
  packageRevisionHistory?: PackageRevisionSummary[];
  quoteRoundId: string;
  readerKind?: "backoffice" | "builder" | "homeowner";
  readOnly?: boolean;
  republishCapacity?: QuoteRoundRepublishCapacity;
  scopeUpdateAvailable?: boolean;
  selectedPackageRevisionId?: string;
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

function formatDateTimeLocalInAppTimeZone(value: number) {
  const parts = Object.fromEntries(
    APP_DATE_TIME_LOCAL_FORMATTER.formatToParts(new Date(value)).map((part) => [
      part.type,
      part.value,
    ])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function appTimeZoneOffset(value: number) {
  const parts = Object.fromEntries(
    APP_DATE_TIME_LOCAL_FORMATTER.formatToParts(new Date(value)).map((part) => [
      part.type,
      part.value,
    ])
  );
  const wallTime = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute)
  );
  return wallTime - value;
}

/**
 * Convert a datetime-local wall time in the app timezone to an instant. The
 * round deadline display also uses America/Toronto, so parsing cannot depend
 * on the browser or test process timezone. Invalid spring-forward wall times
 * return undefined; a repeated fall-back wall time resolves to its first
 * occurrence.
 */
export function parseAppDateTimeLocal(value: string) {
  const match = APP_DATE_TIME_LOCAL_PATTERN.exec(value);
  if (!match) {
    return;
  }
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const wallTime = Date.UTC(year, month - 1, day, hour, minute);
  const wallDate = new Date(wallTime);
  if (
    !Number.isFinite(wallTime) ||
    wallDate.getUTCFullYear() !== year ||
    wallDate.getUTCMonth() !== month - 1 ||
    wallDate.getUTCDate() !== day ||
    wallDate.getUTCHours() !== hour ||
    wallDate.getUTCMinutes() !== minute
  ) {
    return;
  }

  const candidateOffsets = new Set<number>();
  for (const delta of [-2 * DAY_MS, -DAY_MS, 0, DAY_MS, 2 * DAY_MS]) {
    candidateOffsets.add(appTimeZoneOffset(wallTime + delta));
  }
  const matchingInstants = [...candidateOffsets]
    .map((offset) => wallTime - offset)
    .filter(
      (candidate) => formatDateTimeLocalInAppTimeZone(candidate) === value
    )
    .sort((left, right) => left - right);
  return matchingInstants[0];
}

function useCoarseNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  return now;
}

function packageRevisionView(input: {
  backendHistorical: boolean;
  comparisonHistory: PackageRevisionSummary[];
  currentPackageId: string;
  currentPackageRevision: number;
  packageRevisionHistory: PackageRevisionSummary[];
  readOnly: boolean;
  selectedPackageRevisionId?: string;
}) {
  const authoritativeHistory = [...input.comparisonHistory].sort(
    (left, right) => left.revision - right.revision
  );
  const outerNavigationIds = new Set(
    input.packageRevisionHistory.map((revision) => revision._id)
  );
  const orderedHistory = (
    input.packageRevisionHistory.length > 0
      ? authoritativeHistory.filter((revision) =>
          outerNavigationIds.has(revision._id)
        )
      : authoritativeHistory
  ).sort((left, right) => left.revision - right.revision);
  const selectedFromHistory = input.selectedPackageRevisionId
    ? orderedHistory.find(
        (revision) => revision._id === input.selectedPackageRevisionId
      )
    : orderedHistory.find(
        (revision) => revision._id === input.currentPackageId
      );
  const backendQueriedRevision = {
    _id: input.currentPackageId,
    publishedAt: 0,
    responseDeadline: 0,
    revision: input.currentPackageRevision,
  };
  const selectedRevision =
    selectedFromHistory ??
    (input.selectedPackageRevisionId
      ? backendQueriedRevision
      : (authoritativeHistory.at(-1) ?? backendQueriedRevision));
  const newest = authoritativeHistory.at(-1);
  const historical =
    input.backendHistorical ||
    Boolean(
      selectedFromHistory && newest && selectedFromHistory._id !== newest._id
    );
  return {
    displayedRevision:
      selectedRevision?.revision ?? input.currentPackageRevision,
    effectiveReadOnly: input.readOnly || historical,
    historical,
    orderedHistory,
    selectedRevision,
  };
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

export function PackageRevisionNavigation({
  history,
  onSelect,
  selectedRevision,
}: {
  history: PackageRevisionSummary[];
  onSelect?: (packageRevisionId: string) => void;
  selectedRevision?: PackageRevisionSummary;
}) {
  const orderedHistory = [...history].sort(
    (left, right) => left.revision - right.revision
  );
  const resolvedRevision = selectedRevision ?? orderedHistory.at(-1);
  const selectedIndex = resolvedRevision
    ? orderedHistory.findIndex(
        (revision) => revision._id === resolvedRevision._id
      )
    : -1;
  const noSelection = selectedIndex < 0;

  if (!resolvedRevision) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        aria-label="Previous Package Revision"
        disabled={!onSelect || noSelection || selectedIndex === 0}
        onClick={() => onSelect?.(orderedHistory[selectedIndex - 1]._id)}
        size="icon-sm"
        variant="outline"
      >
        <ChevronLeft />
      </Button>
      <Badge variant="outline">Package v{resolvedRevision.revision}</Badge>
      <Button
        aria-label="Next Package Revision"
        disabled={
          !onSelect || noSelection || selectedIndex >= orderedHistory.length - 1
        }
        onClick={() => onSelect?.(orderedHistory[selectedIndex + 1]._id)}
        size="icon-sm"
        variant="outline"
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

function RepublishScopeDialog({
  currentDeadline,
  onRepublish,
  republishCapacity,
}: {
  currentDeadline: number;
  onRepublish: (input: RepublishInput) => Promise<void>;
  republishCapacity?: QuoteRoundRepublishCapacity;
}) {
  const [deadlineKind, setDeadlineKind] = useState<"keep" | "replace">("keep");
  const [replacementDeadline, setReplacementDeadline] = useState("");
  const [reason, setReason] = useState("");
  const [breakGlassConfirmed, setBreakGlassConfirmed] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const now = useCoarseNow();
  const parsedReplacementDeadline = parseAppDateTimeLocal(replacementDeadline);
  const requiresBreakGlass = republishCapacity === "admin";
  const invalidReplacementDeadline =
    deadlineKind === "replace" &&
    replacementDeadline.length > 0 &&
    parsedReplacementDeadline === undefined;
  const expiredReplacementDeadline =
    deadlineKind === "replace" &&
    replacementDeadline.length > 0 &&
    parsedReplacementDeadline !== undefined &&
    parsedReplacementDeadline <= now;
  const replacementDeadlineValidationMessage = invalidReplacementDeadline
    ? "Enter a valid America/Toronto wall time. This date or time may be invalid, including a nonexistent daylight-saving transition time."
    : expiredReplacementDeadline
      ? "The response deadline must be in the future."
      : undefined;
  const canSubmit =
    reason.trim().length > 0 &&
    (deadlineKind === "keep" ||
      (Number.isFinite(parsedReplacementDeadline) &&
        !replacementDeadlineValidationMessage)) &&
    (!requiresBreakGlass || breakGlassConfirmed);

  const resetForm = () => {
    setDeadlineKind("keep");
    setReplacementDeadline("");
    setReason("");
    setBreakGlassConfirmed(false);
    setError(undefined);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && pending) {
      return;
    }
    setOpen(nextOpen);
    if (!nextOpen) {
      resetForm();
    }
  };

  const submit = async () => {
    if (pending || !canSubmit) {
      return;
    }
    const deadlinePolicy =
      deadlineKind === "keep"
        ? ({ kind: "keep" } as const)
        : parsedReplacementDeadline === undefined
          ? undefined
          : ({
              kind: "replace",
              responseDeadline: parsedReplacementDeadline,
            } as const);
    if (!deadlinePolicy) {
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      await onRepublish({
        deadlinePolicy,
        ...(requiresBreakGlass ? { breakGlassConfirmed } : {}),
        reason: reason.trim(),
      });
      resetForm();
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The Package Revision could not be published."
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog onOpenChange={handleOpenChange} open={open}>
      <AlertDialogTrigger
        render={
          <Button size="sm" variant="outline">
            Publish Scope update
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Publish a new Package Revision</AlertDialogTitle>
          <AlertDialogDescription>
            The new Package Revision uses the effective Scope. Earlier Package
            Revisions and their submissions remain available for review.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4 px-6 pb-6">
          <Label className="grid gap-2">
            <span>Deadline policy</span>
            <NativeSelect
              aria-label="Deadline policy"
              className="w-full"
              disabled={pending}
              onChange={(event) =>
                setDeadlineKind(event.target.value as "keep" | "replace")
              }
              value={deadlineKind}
            >
              <NativeSelectOption value="keep">
                Keep {formatDate(currentDeadline)}
              </NativeSelectOption>
              <NativeSelectOption value="replace">
                Replace response deadline
              </NativeSelectOption>
            </NativeSelect>
          </Label>
          {deadlineKind === "replace" ? (
            <Label className="grid gap-2">
              <span>Replacement response deadline (America/Toronto)</span>
              <Input
                aria-label="Replacement response deadline"
                disabled={pending}
                onChange={(event) => setReplacementDeadline(event.target.value)}
                type="datetime-local"
                value={replacementDeadline}
              />
              {replacementDeadlineValidationMessage ? (
                <span className="text-destructive text-xs" role="alert">
                  {replacementDeadlineValidationMessage}
                </span>
              ) : parsedReplacementDeadline === undefined ? null : (
                <span className="text-muted-foreground text-xs">
                  Parsed instant: {formatDate(parsedReplacementDeadline)}
                </span>
              )}
            </Label>
          ) : null}
          <Label className="grid gap-2">
            <span>Package revision reason</span>
            <Textarea
              aria-label="Package revision reason"
              disabled={pending}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why this Package Revision is being published."
              value={reason}
            />
          </Label>
          {requiresBreakGlass ? (
            <Label className="items-start font-normal text-sm leading-5">
              <Checkbox
                aria-labelledby="quote-round-republish-break-glass-label"
                checked={breakGlassConfirmed}
                disabled={pending}
                id="quote-round-republish-break-glass"
                onCheckedChange={(checked) =>
                  setBreakGlassConfirmed(checked === true)
                }
              />
              <span id="quote-round-republish-break-glass-label">
                I acknowledge this administrative break-glass republish and its
                audit record.
              </span>
            </Label>
          ) : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogClose
            disabled={pending}
            render={<Button variant="ghost">Cancel</Button>}
          />
          <Button disabled={!canSubmit || pending} onClick={submit}>
            {pending ? <LoaderCircle className="animate-spin" /> : null}
            Confirm publish
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function QuoteRoundComparisonSurface({
  buildId,
  onExit,
  onRepublish,
  onSelectPackageRevision,
  organizationId,
  packageRevisionHistory,
  quoteRoundId,
  republishCapacity,
  readOnly = false,
  readerKind,
  scopeUpdateAvailable,
  selectedPackageRevisionId,
}: QuoteRoundComparisonSurfaceProps) {
  return (
    <QuoteRoundComparisonErrorBoundary
      key={`${buildId}:${quoteRoundId}`}
      onExit={onExit}
    >
      <QuoteRoundComparisonQuery
        buildId={buildId}
        onExit={onExit}
        onRepublish={onRepublish}
        onSelectPackageRevision={onSelectPackageRevision}
        organizationId={organizationId}
        packageRevisionHistory={packageRevisionHistory}
        quoteRoundId={quoteRoundId}
        readerKind={readerKind}
        readOnly={readOnly}
        republishCapacity={republishCapacity}
        scopeUpdateAvailable={scopeUpdateAvailable}
        selectedPackageRevisionId={selectedPackageRevisionId}
      />
    </QuoteRoundComparisonErrorBoundary>
  );
}

interface QuoteRoundComparisonErrorBoundaryProps {
  children: ReactNode;
  onExit: () => void;
}

class QuoteRoundComparisonErrorBoundary extends Component<
  QuoteRoundComparisonErrorBoundaryProps,
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // A revoked Build participant sees a fail-closed state while the parent
    // workspace remains navigable; no cached comparison is retained.
  }

  render() {
    if (this.state.error) {
      return (
        <main className="min-h-[calc(100vh-4rem)] bg-muted/30 p-3 sm:p-5">
          <div className="mx-auto max-w-6xl">
            <Frame>
              <FrameHeader>
                <FrameTitle>Quote comparison unavailable</FrameTitle>
                <FrameDescription>
                  This Quote Round is no longer available in your current Build
                  access scope.
                </FrameDescription>
              </FrameHeader>
              <FramePanel className="p-4">
                <Button onClick={this.props.onExit} variant="outline">
                  <ArrowLeft /> Build Quotes
                </Button>
              </FramePanel>
            </Frame>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

function QuoteRoundComparisonQuery({
  buildId,
  onExit,
  onRepublish,
  onSelectPackageRevision,
  organizationId,
  packageRevisionHistory = [],
  quoteRoundId,
  republishCapacity,
  readOnly = false,
  readerKind,
  scopeUpdateAvailable = false,
  selectedPackageRevisionId,
}: QuoteRoundComparisonSurfaceProps) {
  const now = useCoarseNow();
  const comparisonArgs: FunctionArgs<
    typeof api.quote_comparisons.getQuoteRoundComparison
  > = {
    buildId,
    now,
    ...(selectedPackageRevisionId
      ? { packageRevisionId: selectedPackageRevisionId }
      : {}),
    quoteRoundId,
    readerKind,
    workosOrganizationId: organizationId,
  };
  const comparison = useQuery(
    api.quote_comparisons.getQuoteRoundComparison,
    comparisonArgs
  );
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
  const {
    displayedRevision: displayedPackageRevision,
    effectiveReadOnly,
    historical: isHistoricalRevision,
    orderedHistory: orderedPackageHistory,
    selectedRevision: effectiveSelectedPackageRevision,
  } = packageRevisionView({
    backendHistorical: comparison.isHistoricalPackageRevision,
    comparisonHistory: comparison.packageRevisionHistory,
    currentPackageId: String(comparison.package._id),
    currentPackageRevision: comparison.package.revision,
    packageRevisionHistory,
    readOnly,
    selectedPackageRevisionId,
  });

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
          <div className="flex flex-wrap items-center gap-2">
            {orderedPackageHistory.length > 0 ? (
              <PackageRevisionNavigation
                history={orderedPackageHistory}
                onSelect={onSelectPackageRevision}
                selectedRevision={effectiveSelectedPackageRevision}
              />
            ) : (
              <Badge variant="outline">
                Package v{displayedPackageRevision}
              </Badge>
            )}
            <Badge
              variant={
                comparison.round.state === "closed" ? "outline" : "success"
              }
            >
              {comparison.round.state}
            </Badge>
            {isHistoricalRevision ? (
              <Badge variant="warning">Historical revision</Badge>
            ) : null}
            {effectiveReadOnly ? (
              <Badge variant="outline">Read-only view</Badge>
            ) : null}
          </div>
        </div>
        {error ? (
          <Alert variant="error">
            <RotateCcw />
            <AlertTitle>Comparison action failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {scopeUpdateAvailable && !isHistoricalRevision ? (
          <Alert variant="warning">
            <RotateCcw />
            <AlertTitle>Update available</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>
                Effective Scope has changed since this Package Revision was
                published.
              </span>
              {onRepublish && republishCapacity && !readOnly ? (
                <RepublishScopeDialog
                  currentDeadline={comparison.package.responseDeadline}
                  onRepublish={onRepublish}
                  republishCapacity={republishCapacity}
                />
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <Frame>
          <FrameHeader>
            <FrameTitle>{comparison.round.title}</FrameTitle>
            <FrameDescription>
              Immutable submission comparison for Package Revision{" "}
              {displayedPackageRevision}. Draft content is private to each
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
          canClear={comparison.canClearPreferred && !effectiveReadOnly}
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
                  canSetPreferred={
                    comparison.canSetPreferred && !effectiveReadOnly
                  }
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
