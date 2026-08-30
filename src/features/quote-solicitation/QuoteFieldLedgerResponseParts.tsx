import {
  ArrowRight,
  CircleAlert,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import type { ChangeEvent } from "react";

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
import { Card } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { cn } from "#/lib/utils.ts";
import type {
  DraftLinePatch,
  QuoteAccess,
  QuoteDraft,
  ReadableLifecycleResult,
} from "./QuoteFieldLedgerContracts";
import {
  formatBytes,
  formatDateTime,
  money,
  responseLifecycleBadge,
  responseSubmissionStatus,
  revisionStatusLabel,
} from "./QuoteFieldLedgerUtils";

export function ExpandedScopeEditor({
  amount,
  lines,
  onAdd,
  onAmountChange,
  onRemove,
  onScopeChange,
  onTitleChange,
  readOnly,
  scope,
  title,
  values,
}: {
  amount: string;
  lines: DraftLinePatch[];
  onAdd: () => void;
  onAmountChange: (value: string) => void;
  onRemove: (lineKey: string) => void;
  onScopeChange: (value: "labour" | "materials") => void;
  onTitleChange: (value: string) => void;
  readOnly: boolean;
  scope: "labour" | "materials";
  title: string;
  values: Record<string, number | undefined>;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-sm">Expanded scope</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Add a clearly separated item without modifying the issued pricing
            rows.
          </p>
        </div>
        <Badge variant="outline">Separate from issued scope</Badge>
      </div>
      <Card className="p-3">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_8rem_auto]">
          <Input
            aria-label="Expanded scope title"
            disabled={readOnly}
            nativeInput
            onChange={(event) => onTitleChange(event.currentTarget.value)}
            placeholder="Expanded scope title"
            value={title}
          />
          <Input
            aria-label="Expanded scope quoted amount"
            disabled={readOnly}
            inputMode="decimal"
            min="0"
            nativeInput
            onChange={(event) => onAmountChange(event.currentTarget.value)}
            placeholder="$0.00"
            step="0.01"
            type="number"
            value={amount}
          />
          <NativeSelect
            aria-label="Expanded scope type"
            disabled={readOnly}
            onChange={(event) =>
              onScopeChange(event.currentTarget.value as "labour" | "materials")
            }
            value={scope}
          >
            <NativeSelectOption value="labour">Labour</NativeSelectOption>
            <NativeSelectOption value="materials">Materials</NativeSelectOption>
          </NativeSelect>
          <Button
            aria-label="Add expanded scope"
            disabled={readOnly}
            onClick={onAdd}
            size="icon"
            variant="outline"
          >
            <Plus />
          </Button>
        </div>
      </Card>
      {lines.length ? (
        <div className="mt-3 grid gap-2">
          {lines.map((line) => (
            <Card
              className="flex-row items-center gap-3 p-3"
              key={line.lineKey}
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{line.title}</p>
                <p className="mt-1 text-muted-foreground text-xs">
                  Expanded {line.scope} scope
                </p>
              </div>
              <p className="font-semibold text-sm tabular-nums">
                {money(values[line.lineKey] ?? 0)}
              </p>
              <Button
                disabled={readOnly}
                onClick={() => onRemove(line.lineKey)}
                size="sm"
                variant="outline"
              >
                Remove
              </Button>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ResponseAttachments({
  attachments,
  attachmentError,
  onFileChange,
  readOnly,
  uploading,
}: {
  attachments: NonNullable<QuoteDraft>["attachments"];
  attachmentError: string | null;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readOnly: boolean;
  uploading: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-sm">Response attachments</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Supporting files remain private to this Field Ledger draft.
          </p>
        </div>
        <Badge variant="outline">20 MB each</Badge>
      </div>
      <Input
        aria-label="Attach supporting response file"
        disabled={readOnly || uploading}
        nativeInput
        onChange={onFileChange}
        type="file"
      />
      {uploading ? (
        <p className="mt-2 flex items-center gap-2 text-muted-foreground text-xs">
          <Loader2 className="size-3 animate-spin" />
          Uploading and attaching file…
        </p>
      ) : null}
      {attachmentError ? (
        <p
          className="mt-2 flex items-center gap-2 text-destructive text-xs"
          role="alert"
        >
          <CircleAlert className="size-3" />
          {attachmentError}
        </p>
      ) : null}
      {attachments.length ? (
        <ul className="mt-3 grid gap-2">
          {attachments.map((attachment) => (
            <li
              className="flex items-center justify-between gap-3 border-b py-2 text-sm"
              key={attachment.storageId}
            >
              <span className="min-w-0 truncate">{attachment.fileName}</span>
              <span className="shrink-0 text-muted-foreground text-xs">
                {formatBytes(attachment.sizeBytes)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ReviewBand({
  expandedSubtotal,
  labourSubtotal,
  lifecycle,
  lifecycleMessage,
  lifecyclePending,
  materialSubtotal,
  onStartRevision,
  onSubmit,
  onWithdraw,
  onWithdrawalExplanationChange,
  readOnly,
  submissionBlocked,
  total,
  withdrawalExplanation,
}: {
  expandedSubtotal: number;
  labourSubtotal: number;
  lifecycle: ReadableLifecycleResult | null;
  lifecycleMessage: string | null;
  lifecyclePending: "submit" | "revise" | "withdraw" | null;
  materialSubtotal: number;
  onStartRevision: () => Promise<void>;
  onSubmit: () => Promise<void>;
  onWithdraw: () => Promise<void>;
  onWithdrawalExplanationChange: (value: string) => void;
  readOnly: boolean;
  submissionBlocked: boolean;
  total: number;
  withdrawalExplanation: string;
}) {
  const currentSubmission = lifecycle?.currentSubmission ?? null;
  const submissionStatus = responseSubmissionStatus(currentSubmission);
  const hasRevisionDraft = Boolean(currentSubmission && lifecycle?.draft);
  const canSubmit =
    Boolean(lifecycle?.eligibility.canSubmit) &&
    !readOnly &&
    !submissionBlocked;
  const canRevise = Boolean(lifecycle?.eligibility.canRevise) && !readOnly;
  const canWithdraw = Boolean(lifecycle?.eligibility.canWithdraw) && !readOnly;
  const submitLabel = currentSubmission ? "Resubmit quote" : "Submit quote";
  const badge = responseLifecycleBadge(
    currentSubmission,
    submissionStatus,
    readOnly
  );
  const authorityCopy =
    hasRevisionDraft && currentSubmission
      ? `Revision ${currentSubmission.revision} is still authoritative. Your revision draft changes nothing until you explicitly resubmit it.`
      : "Internal teams receive only approved progress metadata before submission, never unsubmitted prices, answers, notes, or files.";
  return (
    <div className="grid gap-5">
      <div>
        <Badge variant={badge.variant}>{badge.label}</Badge>
        <h3 className="mt-3 font-semibold text-xl">Review your Field Ledger</h3>
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
          Labour, materials, and expanded scope remain distinct. DrawFlow
          recalculates the canonical total and freezes a new immutable revision
          only when the server accepts submission.
        </p>
      </div>
      <Frame>
        <FramePanel className="grid gap-3 p-4 sm:grid-cols-2">
          <ReviewFact label="Labour" value={money(labourSubtotal)} />
          <ReviewFact label="Materials" value={money(materialSubtotal)} />
          <ReviewFact label="Expanded scope" value={money(expandedSubtotal)} />
          <ReviewFact label="Current draft total" strong value={money(total)} />
        </FramePanel>
      </Frame>
      <Alert variant="info">
        <ShieldCheck />
        <AlertTitle>Immutable response history</AlertTitle>
        <AlertDescription>{authorityCopy}</AlertDescription>
      </Alert>
      <CurrentSubmissionSummary
        hasRevisionDraft={hasRevisionDraft}
        lifecycle={lifecycle}
        submissionStatus={submissionStatus}
      />
      {lifecycleMessage ? (
        <Alert
          variant={
            lifecycleMessage.includes("submitted") ? "success" : "warning"
          }
        >
          <CircleAlert />
          <AlertTitle>Response status</AlertTitle>
          <AlertDescription>{lifecycleMessage}</AlertDescription>
        </Alert>
      ) : null}
      <ResponseLifecycleActions
        canRevise={canRevise}
        canSubmit={canSubmit}
        canWithdraw={canWithdraw}
        currentSubmission={currentSubmission}
        hasDraft={Boolean(lifecycle?.draft)}
        lifecyclePending={lifecyclePending}
        onStartRevision={onStartRevision}
        onSubmit={onSubmit}
        onWithdraw={onWithdraw}
        onWithdrawalExplanationChange={onWithdrawalExplanationChange}
        submissionStatus={submissionStatus}
        submitLabel={submitLabel}
        total={total}
        withdrawalExplanation={withdrawalExplanation}
      />
      {lifecycle ? (
        lifecycle.eligibility.reason &&
        !(canSubmit || canRevise || canWithdraw) ? (
          <p className="text-muted-foreground text-xs">
            {lifecycle.eligibility.reason}
          </p>
        ) : null
      ) : (
        <p className="text-muted-foreground text-xs">
          Loading immutable response status…
        </p>
      )}
    </div>
  );
}

export function CurrentSubmissionSummary({
  hasRevisionDraft,
  lifecycle,
  submissionStatus,
}: {
  hasRevisionDraft: boolean;
  lifecycle: ReadableLifecycleResult | null;
  submissionStatus: string | null;
}) {
  const submission = lifecycle?.currentSubmission;
  if (!submission) {
    return null;
  }
  let title = `Revision ${submission.revision} submitted`;
  if (submissionStatus === "withdrawn") {
    title = `Revision ${submission.revision} withdrawn`;
  } else if (hasRevisionDraft) {
    title = `Revision ${submission.revision} is still authoritative`;
  }
  const revisionCount =
    (lifecycle as ReadableLifecycleResult & { revisionCount?: number })
      .revisionCount ?? lifecycle.revisions.length;
  return (
    <Frame>
      <FramePanel className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="font-semibold text-sm">{title}</p>
          <p className="mt-1 text-muted-foreground text-xs">
            {money(submission.canonicalTotalCents)} · submitted{" "}
            {formatDateTime(submission.submittedAt)}
          </p>
        </div>
        <Badge variant="outline">
          {revisionCount} immutable{" "}
          {revisionCount === 1 ? "revision" : "revisions"}
        </Badge>
      </FramePanel>
      {revisionCount ? (
        <FramePanel className="p-0">
          <div className="border-b px-4 py-3">
            <p className="font-semibold text-sm">Revision history</p>
            <p className="mt-1 text-muted-foreground text-xs">
              Prior revisions remain immutable and visibly superseded or
              withdrawn.
            </p>
          </div>
          <ol className="divide-y">
            {[...lifecycle.revisions].reverse().map((revision) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                key={revision.revision}
              >
                <div>
                  <p className="font-medium text-sm">
                    Revision {revision.revision}
                  </p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {money(revision.canonicalTotalCents)} ·{" "}
                    {formatDateTime(revision.submittedAt)}
                  </p>
                </div>
                <Badge variant="outline">{revisionStatusLabel(revision)}</Badge>
              </li>
            ))}
          </ol>
        </FramePanel>
      ) : null}
    </Frame>
  );
}

export function ResponseLifecycleActions({
  canRevise,
  canSubmit,
  canWithdraw,
  currentSubmission,
  hasDraft,
  lifecyclePending,
  onStartRevision,
  onSubmit,
  onWithdraw,
  onWithdrawalExplanationChange,
  submissionStatus,
  submitLabel,
  total,
  withdrawalExplanation,
}: {
  canRevise: boolean;
  canSubmit: boolean;
  canWithdraw: boolean;
  currentSubmission: ReadableLifecycleResult["currentSubmission"];
  hasDraft: boolean;
  lifecyclePending: "submit" | "revise" | "withdraw" | null;
  onStartRevision: () => Promise<void>;
  onSubmit: () => Promise<void>;
  onWithdraw: () => Promise<void>;
  onWithdrawalExplanationChange: (value: string) => void;
  submissionStatus: string | null;
  submitLabel: string;
  total: number;
  withdrawalExplanation: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {canSubmit ? (
        <SubmitResponseDialog
          lifecyclePending={lifecyclePending}
          onSubmit={onSubmit}
          submitLabel={submitLabel}
          total={total}
        />
      ) : null}
      {canRevise && currentSubmission && !hasDraft ? (
        <Button
          disabled={Boolean(lifecyclePending)}
          loading={lifecyclePending === "revise"}
          onClick={onStartRevision}
          variant="outline"
        >
          <RotateCcw />
          {submissionStatus === "withdrawn"
            ? "Prepare a new quote"
            : "Revise quote"}
        </Button>
      ) : null}
      {canWithdraw && currentSubmission && submissionStatus !== "withdrawn" ? (
        <WithdrawResponseDialog
          lifecyclePending={lifecyclePending}
          onWithdraw={onWithdraw}
          onWithdrawalExplanationChange={onWithdrawalExplanationChange}
          withdrawalExplanation={withdrawalExplanation}
        />
      ) : null}
    </div>
  );
}

export function SubmitResponseDialog({
  lifecyclePending,
  onSubmit,
  submitLabel,
  total,
}: {
  lifecyclePending: "submit" | "revise" | "withdraw" | null;
  onSubmit: () => Promise<void>;
  submitLabel: string;
  total: number;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            disabled={Boolean(lifecyclePending)}
            loading={lifecyclePending === "submit"}
          />
        }
      >
        <Send /> {submitLabel}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Submit this quote revision?</AlertDialogTitle>
          <AlertDialogDescription>
            The server will recalculate the final total from every saved pricing
            line, validate the current package and deadline, and freeze an
            immutable revision. The displayed draft total is {money(total)}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>
            Keep editing
          </AlertDialogClose>
          <AlertDialogClose onClick={onSubmit} render={<Button />}>
            Confirm {submitLabel.toLowerCase()}
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function WithdrawResponseDialog({
  lifecyclePending,
  onWithdraw,
  onWithdrawalExplanationChange,
  withdrawalExplanation,
}: {
  lifecyclePending: "submit" | "revise" | "withdraw" | null;
  onWithdraw: () => Promise<void>;
  onWithdrawalExplanationChange: (value: string) => void;
  withdrawalExplanation: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            disabled={Boolean(lifecyclePending)}
            loading={lifecyclePending === "withdraw"}
            variant="destructive-outline"
          />
        }
      >
        <Undo2 /> Withdraw quote
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Withdraw this submitted quote?</AlertDialogTitle>
          <AlertDialogDescription>
            Withdrawal removes the current revision from comparison but never
            deletes its immutable history. You may prepare and submit another
            revision before the deadline.
          </AlertDialogDescription>
          <Textarea
            aria-label="Optional withdrawal explanation"
            onChange={(event) =>
              onWithdrawalExplanationChange(event.currentTarget.value)
            }
            placeholder="Optional explanation"
            value={withdrawalExplanation}
          />
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>
            Keep submitted
          </AlertDialogClose>
          <AlertDialogClose
            onClick={onWithdraw}
            render={<Button variant="destructive" />}
          >
            Confirm withdrawal
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ReviewFact({
  label,
  strong,
  value,
}: {
  label: string;
  strong?: boolean;
  value: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          "mt-1 tabular-nums",
          strong ? "font-semibold text-lg" : "font-medium"
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function LedgerRail({
  access,
  readOnly,
  total,
}: {
  access: QuoteAccess;
  readOnly: boolean;
  total: number;
}) {
  return (
    <aside className="hidden xl:block">
      <div className="sticky top-24 divide-y border-y">
        <section className="py-4">
          <p className="font-semibold text-sm">Package reference</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Revision {access.package.revision} · private invitation
          </p>
        </section>
        <section className="py-4">
          <p className="font-medium text-sm">{access.package.siteAddress}</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Due {formatDateTime(access.package.responseDeadline)}
          </p>
        </section>
        <section className="py-4">
          <p className="text-muted-foreground text-xs">Field Ledger total</p>
          <p className="mt-1 font-semibold text-xl tabular-nums">
            {money(total)}
          </p>
          <p
            className={cn(
              "mt-2 text-xs",
              readOnly ? "text-warning" : "text-success"
            )}
          >
            {readOnly ? "Read-only package" : "Autosaves are enabled"}
          </p>
        </section>
      </div>
    </aside>
  );
}

export function LedgerPersistentReview({
  readOnly,
  syncMessage,
  total,
}: {
  readOnly: boolean;
  syncMessage: string;
  total: number;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-3 py-2 backdrop-blur sm:px-5">
      <div className="mx-auto flex max-w-[88rem] items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            aria-live="polite"
            className="truncate text-muted-foreground text-xs"
          >
            {syncMessage}
          </p>
          <p className="font-semibold text-sm tabular-nums">{money(total)}</p>
        </div>
        <Button
          onClick={() =>
            document
              .getElementById("review")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          variant={readOnly ? "outline" : "default"}
        >
          Review quote <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

export function LedgerRecoverySurface({
  kind,
  onReopenInvitation,
}: {
  kind: "superseded" | "unavailable";
  onReopenInvitation?: () => void;
}) {
  const superseded = kind === "superseded";
  return (
    <main className="grid min-h-svh place-items-center bg-bg-base p-4">
      <Frame className="w-full max-w-xl">
        <FramePanel className="p-6">
          <Badge variant="outline">Private invitation</Badge>
          <h1 className="mt-3 font-semibold text-xl">
            {superseded
              ? "Package replaced"
              : "Field Ledger access interrupted"}
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            {superseded
              ? "This package revision was replaced. Use the newest invitation supplied by the issuing team; no previous draft content is shown here."
              : "No further package or response content was loaded. Reopen the original invitation after checking your connection."}
          </p>
          <div className="mt-6">
            <Button onClick={onReopenInvitation} variant="outline">
              <RefreshCw />
              Reopen invitation
            </Button>
          </div>
        </FramePanel>
      </Frame>
    </main>
  );
}
