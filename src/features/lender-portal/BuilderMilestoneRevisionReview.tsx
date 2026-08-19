import type { FunctionReturnType } from "convex/server";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  History,
  MapPinCheck,
  ReceiptText,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type BuilderReviewDetail = FunctionReturnType<
  typeof api.lender_portal_phase5.getBuilderNotificationReviewRequest
>;
type BuilderCycle = BuilderReviewDetail["currentCycle"];
type BuilderEvidenceReference = BuilderCycle["evidenceReferences"][number];
type BuilderMilestoneSubmission = Extract<
  BuilderCycle["submission"],
  { kind: "milestone" }
>;

export interface BuilderMilestoneRevisionReviewProps {
  detail: BuilderReviewDetail;
  onOpenBuild: () => void;
}

export interface BuilderMilestoneRevisionFooterProps {
  detail: BuilderReviewDetail;
  errorMessage?: string | null;
  onOpenBuild: () => void;
  onResubmit: (costDocumentIds: Id<"costDocuments">[]) => Promise<void>;
  pending: boolean;
}

const money = new Intl.NumberFormat("en-CA", {
  currency: "CAD",
  style: "currency",
});

const date = new Intl.DateTimeFormat("en-CA", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function BuilderMilestoneRevisionReview({
  detail,
  onOpenBuild,
}: BuilderMilestoneRevisionReviewProps) {
  const submission = detail.currentCycle
    .submission as BuilderMilestoneSubmission;
  const correctionRequired = detail.state === "correction_required";

  return (
    <div
      className="order-first grid min-w-0 gap-4"
      data-testid="builder-milestone-revision-sheet"
    >
      <RevisionStatusSummary detail={detail} />
      {correctionRequired ? (
        <InlineRevisionNotice detail={detail} />
      ) : (
        <ReviewStatusNotice detail={detail} />
      )}
      <CompletionSubmission
        detail={detail}
        onOpenBuild={onOpenBuild}
        submission={submission}
      />
      <LockedRequirementsSummary detail={detail} submission={submission} />
      <RequestHistory detail={detail} />
    </div>
  );
}

export function BuilderMilestoneRevisionFooter({
  detail,
  errorMessage,
  onOpenBuild,
  onResubmit,
  pending,
}: BuilderMilestoneRevisionFooterProps) {
  const canResubmit =
    detail.state === "correction_required" &&
    detail.canResubmit &&
    detail.eligibility.canSubmit;
  const costDocumentIds = builderResubmissionCostDocumentIds(detail);

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 text-left">
          <p className="font-medium text-sm">
            {canResubmit
              ? "Revision ready for validation"
              : detail.state === "completed"
                ? "Milestone review complete"
                : "Decision cycle is in review"}
          </p>
          <p className="mt-1 text-pretty text-muted-foreground text-xs">
            {canResubmit
              ? `Resubmitting keeps this Milestone and creates decision cycle ${detail.currentCycleNumber + 1}.`
              : detail.notice.body}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button onClick={onOpenBuild} type="button" variant="outline">
            <Wrench aria-hidden="true" /> Edit completion in Build
          </Button>
          <Button
            data-testid="builder-milestone-resubmit"
            disabled={!canResubmit || pending}
            loading={pending}
            onClick={() => onResubmit(costDocumentIds)}
            type="button"
          >
            <ClipboardCheck aria-hidden="true" />
            {pending ? "Resubmitting…" : "Resubmit milestone completion"}
          </Button>
        </div>
      </div>
      <p aria-live="polite" className="min-h-4 text-destructive text-xs">
        {errorMessage ?? ""}
      </p>
    </div>
  );
}

export function builderResubmissionCostDocumentIds(
  detail: BuilderReviewDetail
) {
  return [
    ...new Set(
      detail.currentCycle.evidenceReferences.flatMap((reference) =>
        reference.kind === "cost_document" ? [reference.costDocumentId] : []
      )
    ),
  ];
}

function RevisionStatusSummary({ detail }: { detail: BuilderReviewDetail }) {
  const status = builderReviewStateLabel(detail.state);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        aria-label={`Status: ${status}`}
        variant={
          detail.state === "correction_required" ? "warning" : "secondary"
        }
      >
        {status}
      </Badge>
      <Badge variant="outline">
        Decision cycle {detail.currentCycleNumber}
      </Badge>
      <Badge variant="outline">Same Milestone</Badge>
    </div>
  );
}

function InlineRevisionNotice({ detail }: { detail: BuilderReviewDetail }) {
  return (
    <Alert className="border-warning/35 bg-warning/6">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>Why this Milestone needs revision</AlertTitle>
      <AlertDescription>
        <p className="text-pretty break-words">
          {detail.revisionInstructions ?? detail.notice.body}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant={detail.eligibility.canSubmit ? "success" : "warning"}>
            {detail.eligibility.canSubmit
              ? "Eligible to resubmit"
              : "Resubmission unavailable"}
          </Badge>
          <span className="text-xs">
            Decision cycle {detail.currentCycleNumber} · Submitted{" "}
            {formatDate(detail.currentCycle.submittedAt)}
          </span>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function ReviewStatusNotice({ detail }: { detail: BuilderReviewDetail }) {
  return (
    <Alert>
      {detail.state === "completed" ? (
        <CheckCircle2 aria-hidden="true" />
      ) : (
        <ClipboardCheck aria-hidden="true" />
      )}
      <AlertTitle>{detail.notice.title}</AlertTitle>
      <AlertDescription>{detail.notice.body}</AlertDescription>
    </Alert>
  );
}

function CompletionSubmission({
  detail,
  onOpenBuild,
  submission,
}: {
  detail: BuilderReviewDetail;
  onOpenBuild: () => void;
  submission: BuilderMilestoneSubmission;
}) {
  const documentedTotal = documentedTotalCents(
    detail.currentCycle.evidenceReferences
  );
  return (
    <Frame>
      <FramePanel className="space-y-5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-[65ch]">
            <h2 className="font-semibold text-base">Completion submission</h2>
            <p className="mt-1 text-pretty text-muted-foreground text-sm">
              Review the current completion facts. Update canonical Milestone or
              cost-document data in the Build before resubmitting.
            </p>
          </div>
          <Badge
            variant={detail.eligibility.canSubmit ? "success" : "secondary"}
          >
            {detail.eligibility.canSubmit ? "Eligible" : "Read-only"}
          </Badge>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-sm">Entered actual cost</dt>
            <dd className="mt-1 font-semibold text-2xl tabular-nums tracking-tight">
              {formatOptionalMoney(submission.actualCostCents)}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-sm">Eligible documented total</dt>
            <dd className="mt-1 font-semibold text-2xl tabular-nums tracking-tight">
              {money.format(documentedTotal / 100)}
            </dd>
          </div>
        </dl>
        <Separator />
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-medium text-sm">Cycle evidence</h3>
              <p className="mt-1 text-muted-foreground text-xs">
                Immutable evidence references retained from decision cycle{" "}
                {detail.currentCycleNumber}.
              </p>
            </div>
            <Badge variant="outline">
              {detail.currentCycle.evidenceReferences.length} reference
              {detail.currentCycle.evidenceReferences.length === 1 ? "" : "s"}
            </Badge>
          </div>
          {detail.currentCycle.evidenceReferences.length > 0 ? (
            <ul className="grid gap-3">
              {detail.currentCycle.evidenceReferences.map(
                (reference, index) => (
                  <EvidenceRow
                    key={evidenceReferenceKey(reference, index)}
                    reference={reference}
                  />
                )
              )}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              No evidence references are attached to this cycle.
            </p>
          )}
          <Button onClick={onOpenBuild} size="sm" type="button" variant="ghost">
            <Wrench aria-hidden="true" /> Open canonical Build details
          </Button>
        </div>
      </FramePanel>
    </Frame>
  );
}

function EvidenceRow({ reference }: { reference: BuilderEvidenceReference }) {
  const Icon =
    reference.kind === "cost_document"
      ? reference.documentKind === "invoice"
        ? FileText
        : ReceiptText
      : reference.kind === "cost_document_page"
        ? FileCheck2
        : reference.kind === "site_visit"
          ? MapPinCheck
          : FileCheck2;
  return (
    <li className="flex min-w-0 items-start justify-between gap-3 py-1">
      <div className="flex min-w-0 items-start gap-3">
        <Icon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0">
          <p className="break-words font-medium text-sm">{reference.label}</p>
          <p className="mt-1 text-muted-foreground text-xs">
            {evidenceReferenceDetail(reference)}
          </p>
        </div>
      </div>
      <Badge className="shrink-0" variant="secondary">
        Attached
      </Badge>
    </li>
  );
}

function LockedRequirementsSummary({
  detail,
  submission,
}: {
  detail: BuilderReviewDetail;
  submission: BuilderMilestoneSubmission;
}) {
  const requirements = detail.currentCycle.requirements;
  const documentedTotal = documentedTotalCents(
    detail.currentCycle.evidenceReferences
  );
  const receiptsSatisfied =
    !requirements.receiptInvoiceRequired ||
    (submission.actualCostCents !== null &&
      documentedTotal === submission.actualCostCents);
  const siteVisitSatisfied =
    !requirements.siteVisitRequired ||
    detail.currentCycle.evidenceReferences.some(
      (reference) => reference.kind === "site_visit"
    );
  const requiredGroups = requirements.requiredGroups.map((group) =>
    group === "backoffice" ? "Back Office" : "Lender"
  );
  return (
    <Frame>
      <FramePanel className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-base">Locked requirements</h2>
            <p className="mt-1 text-pretty text-muted-foreground text-sm">
              These immutable policy gates are revalidated when you resubmit.
            </p>
          </div>
          <Badge
            variant={detail.eligibility.canSubmit ? "success" : "secondary"}
          >
            {detail.eligibility.canSubmit ? "Can resubmit" : "Awaiting review"}
          </Badge>
        </div>
        <RequirementRow
          complete={siteVisitSatisfied}
          detail={
            requirements.siteVisitRequired
              ? "A completed report and qualifying photo are required."
              : "No Site Visit is required by this policy."
          }
          icon={MapPinCheck}
          label="Site Visit"
        />
        <RequirementRow
          complete={receiptsSatisfied}
          detail={
            requirements.receiptInvoiceRequired
              ? "Eligible receipt and invoice totals must equal actual cost."
              : "Receipt and invoice matching is not required by this policy."
          }
          icon={ReceiptText}
          label="Receipts and invoices"
        />
        <RequirementRow
          complete={false}
          detail={`${requiredGroups.join(" and ") || "No reviewer group"} approval${requiredGroups.length === 1 ? " is" : "s are"} required. Resubmission resets every prior approval.`}
          icon={ShieldCheck}
          label="Review approvals"
          pending
        />
      </FramePanel>
    </Frame>
  );
}

function RequirementRow({
  complete,
  detail,
  icon: Icon,
  label,
  pending = false,
}: {
  complete: boolean;
  detail: string;
  icon: typeof MapPinCheck;
  label: string;
  pending?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      {complete ? (
        <CheckCircle2
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-success"
        />
      ) : (
        <Icon
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-warning"
        />
      )}
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="mt-1 text-pretty text-muted-foreground text-xs">
          {pending ? `Pending. ${detail}` : detail}
        </p>
      </div>
    </div>
  );
}

function RequestHistory({ detail }: { detail: BuilderReviewDetail }) {
  const cycles = builderHistoryCycles(detail);
  return (
    <Frame>
      <FramePanel className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-base">Completion history</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              Builder-safe history for this same Milestone.
            </p>
          </div>
          <History
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        </div>
        <ol className="space-y-4">
          {cycles.map((cycle) => (
            <li key={cycle.cycleNumber}>
              <p className="font-medium text-sm">
                Decision cycle {cycle.cycleNumber}
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                {builderReviewStateLabel(cycle.state)} · Submitted{" "}
                {formatDate(cycle.submittedAt)} · evidence references retained
              </p>
            </li>
          ))}
        </ol>
        <div className="flex items-start gap-2 text-muted-foreground text-xs">
          <ShieldCheck
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          <p>
            Reviewer identity, internal rationale, votes, and private audit
            content are excluded.
          </p>
        </div>
      </FramePanel>
    </Frame>
  );
}

function builderHistoryCycles(detail: BuilderReviewDetail) {
  const cycles = new Map<number, BuilderCycle>();
  for (const cycle of [detail.currentCycle, ...detail.history.page]) {
    cycles.set(cycle.cycleNumber, cycle);
  }
  return [...cycles.values()].sort(
    (left, right) => left.cycleNumber - right.cycleNumber
  );
}

function documentedTotalCents(references: BuilderEvidenceReference[]) {
  return references.reduce(
    (total, reference) =>
      reference.kind === "cost_document"
        ? total + reference.amountCents
        : total,
    0
  );
}

function evidenceReferenceDetail(reference: BuilderEvidenceReference) {
  if (reference.kind === "cost_document") {
    return `${reference.documentKind === "invoice" ? "Invoice" : "Receipt"} · ${money.format(reference.amountCents / 100)}`;
  }
  if (reference.kind === "cost_document_page") {
    return `Cost document page ${reference.order + 1}`;
  }
  if (reference.kind === "site_visit") {
    return `Site Visit completed ${formatDate(reference.completedAt)}`;
  }
  if (reference.kind === "package_revision") {
    return `Evidence Package · ${reference.submilestoneKey}`;
  }
  return reference.locationVerified
    ? "Completion evidence · location verified"
    : "Completion evidence · location unverified";
}

function evidenceReferenceKey(
  reference: BuilderEvidenceReference,
  index: number
) {
  if (reference.kind === "cost_document") {
    return `cost-document:${String(reference.costDocumentId)}`;
  }
  if (reference.kind === "cost_document_page") {
    return `cost-document-page:${String(reference.costDocumentPageId)}`;
  }
  if (reference.kind === "site_visit") {
    return `site-visit:${String(reference.siteVisitId)}`;
  }
  if (reference.kind === "package_revision") {
    return `package:${String(reference.evidencePackageRevisionId)}`;
  }
  return `asset:${String(reference.evidenceAssetId)}:${index}`;
}

function builderReviewStateLabel(state: string) {
  if (state === "correction_required") {
    return "Needs revision";
  }
  if (state === "completed") {
    return "Complete";
  }
  if (state === "partial_approval") {
    return "Review in progress";
  }
  return "Pending review";
}

function formatOptionalMoney(value: number | null) {
  return value === null ? "Not supplied" : money.format(value / 100);
}

function formatDate(value: number | string) {
  const parsed = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed) ? date.format(parsed) : "date unavailable";
}
