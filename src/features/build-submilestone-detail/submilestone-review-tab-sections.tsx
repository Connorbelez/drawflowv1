import {
  ArrowUpRight,
  BookOpenCheck,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  History,
  MapPinCheck,
  ReceiptText,
  TriangleAlert,
} from "lucide-react";

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
import { Field, FieldLabel } from "#/components/ui/field.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import type { BrokerageSiteVisitsResult } from "../backoffice-site-visits/site-visit-types.ts";
import {
  CostDocumentFileList,
  DocumentedCostCoverage,
  type SubmilestoneCostDocument,
} from "../cost-documents/SubmilestoneCostDocuments.tsx";
import {
  type CanonicalWorkspaceCollection,
  EvidenceAssetCard,
  evidenceAssetIdentity,
  isCanonicalEvidenceAsset,
} from "./SubmilestoneDetailCanonical.tsx";
import { SubmilestoneSiteVisitWorkspace } from "./SubmilestoneSiteVisitWorkspace.tsx";
import type {
  CanonicalReview,
  ReviewCommand,
  ReviewTabBootstrap,
} from "./submilestone-review-tab-contracts.ts";
import {
  formatOptionalReviewCents,
  formatReviewCents,
  formatReviewDate,
  formatReviewTimestamp,
  plannedSubmilestoneDate,
  reviewKindLabel,
  reviewStateLabel,
  siteVisitStatusLabel,
  stateTransitionLabel,
} from "./submilestone-review-tab-formatters.ts";

export function SubmilestoneReviewSummary({
  bootstrap,
  review,
}: {
  bootstrap: ReviewTabBootstrap;
  review: CanonicalReview;
}) {
  const plannedStart = plannedSubmilestoneDate(bootstrap, "start");
  const plannedEnd = plannedSubmilestoneDate(bootstrap, "end");
  const parentApproved = review.parent.reviewDecisionState === "approved";
  const parentAvailability = formatReviewCents(
    bootstrap.milestone.drawAvailabilityCents
  );

  return (
    <section
      aria-labelledby="submilestone-review-summary-heading"
      className="space-y-4"
      data-testid="submilestone-review-summary"
    >
      <div>
        <h3
          className="flex items-center gap-2 font-semibold"
          id="submilestone-review-summary-heading"
        >
          <CircleDollarSign aria-hidden="true" className="size-4" />
          Cost, schedule &amp; draw availability
        </h3>
        <p className="mt-1 text-muted-foreground text-sm">
          Canonical execution facts for {bootstrap.submilestone.name}.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y py-4 sm:grid-cols-4">
        <ReviewFact
          label="Budgeted cost"
          value={formatReviewCents(bootstrap.overview.budgetCents)}
        />
        <ReviewFact
          label="Actual cost"
          value={formatOptionalReviewCents(bootstrap.overview.actualCostCents)}
        />
        <ReviewFact label="Planned start" value={plannedStart} />
        <ReviewFact label="Planned end" value={plannedEnd} />
        <ReviewFact
          label="Actual start"
          value={formatReviewDate(bootstrap.overview.actualStartedAt)}
        />
        <ReviewFact
          label="Actual end"
          value={formatReviewDate(bootstrap.overview.actualCompletedAt)}
        />
        <ReviewFact
          detail={
            parentApproved
              ? "Available from the approved parent Milestone."
              : `${parentAvailability} parent Milestone availability remains locked until parent approval.`
          }
          label="Draw availability unlocked"
          value={parentApproved ? parentAvailability : formatReviewCents(0)}
        />
      </dl>
    </section>
  );
}

export function BuilderSubmittedEvidence({
  bootstrap,
  collection,
  loadingMore,
  onLoadMore,
  onOpenScopeAndGuidance,
  review,
}: {
  bootstrap: ReviewTabBootstrap;
  collection?: CanonicalWorkspaceCollection;
  loadingMore: boolean;
  onLoadMore?: () => void;
  onOpenScopeAndGuidance?: () => void;
  review: CanonicalReview;
}) {
  const collectionRecord = collection as
    | {
        hasMore?: boolean;
        page?: unknown[];
        state?: string;
      }
    | undefined;
  const assets = (collectionRecord?.page ?? [])
    .map((asset) =>
      asset && typeof asset === "object"
        ? (asset as Record<string, unknown>)
        : {}
    )
    .filter(isCanonicalEvidenceAsset)
    .filter((asset) => {
      const sourceKind = String(asset.sourceKind ?? "").toLowerCase();
      return sourceKind !== "site_visit" && sourceKind !== "backoffice";
    })
    .filter((asset, index, all) => {
      const identity = evidenceAssetIdentity(asset);
      return (
        !identity ||
        all.findIndex(
          (candidate) => evidenceAssetIdentity(candidate) === identity
        ) === index
      );
    });

  return (
    <section
      aria-labelledby="builder-submitted-evidence-heading"
      className="space-y-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            className="flex items-center gap-2 font-semibold"
            id="builder-submitted-evidence-heading"
          >
            <ClipboardCheck aria-hidden="true" className="size-4" />
            Builder Submitted Evidence
          </h3>
          <p className="mt-1 text-muted-foreground text-sm">
            Evidence tagged to {bootstrap.submilestone.name} in the canonical
            Evidence Package.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge variant="outline">
            {reviewStateLabel(review.child.evidenceReviewState)}
          </Badge>
          {onOpenScopeAndGuidance ? (
            <Button
              onClick={onOpenScopeAndGuidance}
              size="sm"
              type="button"
              variant="outline"
            >
              <BookOpenCheck aria-hidden="true" />
              Scope &amp; Field Guidance
            </Button>
          ) : null}
        </div>
      </div>
      {collection === undefined ? (
        <Frame data-testid="builder-submitted-evidence-loading">
          <FramePanel
            aria-live="polite"
            className="min-h-24 animate-pulse text-muted-foreground text-sm motion-reduce:animate-none"
            role="status"
          >
            Loading Builder Submitted Evidence…
          </FramePanel>
        </Frame>
      ) : collectionRecord?.state === "visible" ? (
        assets.length === 0 ? (
          <p className="flex min-h-24 items-center justify-center text-center text-muted-foreground text-sm">
            No Builder evidence has been submitted for this Sub-milestone.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {assets.map((asset, index) => (
              <EvidenceAssetCard
                asset={asset}
                key={evidenceAssetIdentity(asset) || `review-evidence-${index}`}
              />
            ))}
          </div>
        )
      ) : (
        <Frame>
          <FramePanel className="text-muted-foreground text-sm">
            Builder Submitted Evidence is unavailable for this Build access.
          </FramePanel>
        </Frame>
      )}
      {collectionRecord?.state === "visible" && collectionRecord.hasMore ? (
        <Button
          disabled={loadingMore}
          onClick={onLoadMore}
          size="sm"
          type="button"
          variant="outline"
        >
          {loadingMore ? "Loading evidence…" : "Load more evidence"}
        </Button>
      ) : null}
    </section>
  );
}

export function CostDocumentReview({
  bootstrap,
  documents,
  onOpenCostDocument,
}: {
  bootstrap: ReviewTabBootstrap;
  documents: SubmilestoneCostDocument[];
  onOpenCostDocument?: (costDocumentId: string) => void;
}) {
  return (
    <section
      aria-labelledby="cost-document-review-heading"
      className="space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            className="flex items-center gap-2 font-semibold text-sm"
            id="cost-document-review-heading"
          >
            <ReceiptText aria-hidden="true" className="size-4" />
            Receipts &amp; Invoices
          </h3>
          <p className="mt-1 text-muted-foreground text-xs">
            Cost Documents allocated to this Sub-milestone.
          </p>
        </div>
        <Badge variant="outline">
          {documents.length} document{documents.length === 1 ? "" : "s"}
        </Badge>
      </div>
      <DocumentedCostCoverage
        budgetCents={bootstrap.overview.budgetCents}
        documents={documents}
        submilestoneName={bootstrap.submilestone.name}
      />
      <CostDocumentFileList
        documents={documents}
        onOpenCostDocument={onOpenCostDocument}
      />
    </section>
  );
}

export function ReviewFact({
  detail,
  label,
  value,
}: {
  detail?: string;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-medium text-sm tabular-nums">{value}</dd>
      {detail ? (
        <p className="mt-1 max-w-64 text-muted-foreground text-xs">{detail}</p>
      ) : null}
    </div>
  );
}

export function SiteVisitReviewSection({
  canCancel,
  canOrder,
  canWaive,
  currentVisit,
  guidanceReady,
  onCancelVisit,
  onOrder,
  onWaive,
  pending,
  requirement,
  siteVisits,
}: {
  canCancel: boolean;
  canOrder: boolean;
  canWaive: boolean;
  currentVisit: CanonicalReview["siteVisit"]["currentVisit"];
  guidanceReady: boolean;
  onCancelVisit: (input: {
    buildId: string;
    reason: string;
    visitId: string;
  }) => Promise<void>;
  onOrder: () => void;
  onWaive: () => void;
  pending: boolean;
  requirement: CanonicalReview["siteVisit"]["requirement"];
  siteVisits: BrokerageSiteVisitsResult | undefined;
}) {
  const signals = requirement
    ? [
        ...requirement.policySignals.map((value) => `Policy · ${value}`),
        ...requirement.riskSignals.map((value) => `Risk · ${value}`),
        ...requirement.manualSignals.map((value) => `Manual · ${value}`),
      ]
    : [];
  return (
    <section
      aria-labelledby="site-visit-review-heading"
      className="min-w-0 max-w-full space-y-3 overflow-hidden max-sm:w-[calc(100vw-3rem)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            className="flex items-center gap-2 font-semibold text-sm"
            id="site-visit-review-heading"
          >
            <MapPinCheck aria-hidden="true" className="size-4" />
            Site Visit
          </h3>
          <p className="mt-1 text-muted-foreground text-xs">
            Policy, risk, and manual signals remain distinct from Visit
            completion.
          </p>
        </div>
        <Badge
          variant={
            requirement?.status === "required"
              ? "warning"
              : requirement?.status === "satisfied"
                ? "success"
                : "outline"
          }
        >
          {requirement
            ? siteVisitStatusLabel(requirement.status)
            : "Not evaluated"}
        </Badge>
      </div>
      {requirement ? (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <ReviewFact
            label="Requirement"
            value={requirement.required ? "Required" : "Not required"}
          />
          <ReviewFact
            label="Associated Visit"
            value={
              currentVisit
                ? `${currentVisit.visitId} · ${siteVisitStatusLabel(currentVisit.status)}`
                : "No Visit ordered"
            }
          />
          {requirement.status === "waived" && requirement.waiverReason ? (
            <ReviewFact label="Admin waiver" value={requirement.waiverReason} />
          ) : null}
        </dl>
      ) : (
        <p className="text-muted-foreground text-sm">
          No Site Visit requirement snapshot exists for this review round.
        </p>
      )}
      {signals.length ? (
        <ul className="space-y-1 text-sm">
          {signals.map((signal) => (
            <li key={signal}>{signal}</li>
          ))}
        </ul>
      ) : null}
      <SubmilestoneSiteVisitWorkspace
        canCancel={canCancel}
        canOrder={canOrder}
        guidanceReady={guidanceReady}
        onCancelVisit={onCancelVisit}
        onOrder={onOrder}
        pending={pending}
        siteVisits={siteVisits}
      />
      {canWaive ? (
        <Button
          disabled={pending}
          onClick={onWaive}
          size="sm"
          type="button"
          variant="outline"
        >
          Waive Site Visit
        </Button>
      ) : null}
    </section>
  );
}

export function ParentReadinessSection({
  milestoneName,
  onOpenParent,
  parent,
}: {
  milestoneName: string;
  onOpenParent?: () => void;
  parent: CanonicalReview["parent"];
}) {
  const blockerCount = Math.max(
    0,
    parent.childCount - parent.approvedChildCount
  );
  return (
    <section aria-labelledby="parent-readiness-heading" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm" id="parent-readiness-heading">
            Parent Milestone readiness
          </h3>
          <p className="mt-1 text-muted-foreground text-xs">
            {milestoneName} remains a separate aggregate approval target.
          </p>
        </div>
        <Badge variant={parent.readyForApproval ? "success" : "outline"}>
          {reviewStateLabel(parent.reviewDecisionState)}
        </Badge>
      </div>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <ReviewFact
          label="Approved children"
          value={`${parent.approvedChildCount} of ${parent.childCount}`}
        />
        <ReviewFact
          label="Blockers"
          value={
            blockerCount === 0
              ? "No child approval blockers"
              : `${blockerCount} child approval blocker${blockerCount === 1 ? "" : "s"}`
          }
        />
      </dl>
      {parent.readyForApproval ? (
        <p className="text-sm text-success-foreground">
          Every canonical child is independently approved. Parent approval is
          still explicit.
        </p>
      ) : null}
      {onOpenParent ? (
        <Button
          onClick={onOpenParent}
          size="sm"
          type="button"
          variant="outline"
        >
          Review parent Milestone
          <ArrowUpRight aria-hidden="true" />
        </Button>
      ) : null}
    </section>
  );
}

export function ReviewCommands({
  approvalBlocker,
  busy,
  canApprove,
  canRecommend,
  canRequestChanges,
  canRetract,
  canWaive,
  note,
  onApprove,
  onNoteChange,
  onReasonChange,
  onRecommend,
  onRemediationChange,
  onRequestChanges,
  onRetract,
  onSiteVisitRequiredChange,
  reason,
  remediationText,
  showApprove,
  siteVisitRequired,
}: {
  approvalBlocker?: string;
  busy: ReviewCommand | null;
  canApprove: boolean;
  canRecommend: boolean;
  canRequestChanges: boolean;
  canRetract: boolean;
  canWaive: boolean;
  note: string;
  onApprove: () => void;
  onNoteChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onRecommend: () => void;
  onRemediationChange: (value: string) => void;
  onRequestChanges: () => void;
  onRetract: () => void;
  onSiteVisitRequiredChange: (value: boolean) => void;
  reason: string;
  remediationText: string;
  showApprove: boolean;
  siteVisitRequired: boolean;
}) {
  return (
    <section aria-labelledby="review-command-heading" className="space-y-3">
      <div>
        <h3 className="font-semibold text-sm" id="review-command-heading">
          Sub-milestone decision
        </h3>
        <p className="mt-1 text-muted-foreground text-xs">
          Record the canonical review decision for this Sub-milestone.
        </p>
      </div>
      {canRecommend || showApprove ? (
        <Label className="space-y-1">
          <span>Reviewer note</span>
          <Input
            aria-label="Reviewer note"
            disabled={busy !== null}
            onChange={(event) => onNoteChange(event.target.value)}
            value={note}
          />
        </Label>
      ) : null}
      {canRequestChanges || canRetract || canWaive ? (
        <Label className="space-y-1">
          <span>Reason</span>
          <Input
            aria-label="Review reason"
            disabled={busy !== null}
            onChange={(event) => onReasonChange(event.target.value)}
            value={reason}
          />
        </Label>
      ) : null}
      {canRequestChanges ? (
        <Label className="space-y-1">
          <span>Remediation steps</span>
          <Textarea
            aria-label="Remediation steps"
            disabled={busy !== null}
            onChange={(event) => onRemediationChange(event.target.value)}
            placeholder="One required remediation step per line"
            value={remediationText}
          />
        </Label>
      ) : null}
      {canRecommend ? (
        <Field className="flex-row items-center gap-2">
          <Checkbox
            checked={siteVisitRequired}
            disabled={busy !== null}
            id="review-site-visit-required"
            onCheckedChange={(checked) =>
              onSiteVisitRequiredChange(checked === true)
            }
          />
          <FieldLabel htmlFor="review-site-visit-required">
            Require a Site Visit
          </FieldLabel>
        </Field>
      ) : null}
      {showApprove && approvalBlocker ? (
        <Frame>
          <FramePanel className="flex items-start gap-2 p-3 text-muted-foreground text-sm">
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-warning"
            />
            <p>{approvalBlocker}</p>
          </FramePanel>
        </Frame>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {canRecommend ? (
          <Button
            disabled={busy !== null}
            onClick={onRecommend}
            size="sm"
            type="button"
            variant="outline"
          >
            Record recommendation
          </Button>
        ) : null}
        {canRequestChanges ? (
          <Button
            disabled={busy !== null}
            onClick={onRequestChanges}
            size="sm"
            type="button"
            variant="destructive-outline"
          >
            Request changes
          </Button>
        ) : null}
        {showApprove ? (
          <Button
            disabled={busy !== null || !canApprove}
            onClick={onApprove}
            size="sm"
            type="button"
          >
            <CheckCircle2 aria-hidden="true" />
            Approve Sub-milestone
          </Button>
        ) : null}
        {canRetract ? (
          <Button
            disabled={busy !== null}
            onClick={onRetract}
            size="sm"
            type="button"
            variant="destructive-outline"
          >
            Retract child approval
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export function ReviewHistory({
  decisions,
}: {
  decisions: CanonicalReview["decisions"];
}) {
  return (
    <section aria-labelledby="review-history-heading" className="space-y-3">
      <div>
        <h3
          className="flex items-center gap-2 font-semibold text-sm"
          id="review-history-heading"
        >
          <History aria-hidden="true" className="size-4" />
          Canonical decision history
        </h3>
        <p className="mt-1 text-muted-foreground text-xs">
          Current and superseded rounds remain immutable and readable.
        </p>
      </div>
      {decisions.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No canonical review decisions have been recorded.
        </p>
      ) : (
        <ol className="space-y-3">
          {decisions.map((decision) => (
            <li key={decision._id}>
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>{reviewKindLabel(decision.kind)}</CardTitle>
                    <CardDescription>
                      Round {decision.reviewRound} ·{" "}
                      {formatReviewTimestamp(decision.createdAt)}
                    </CardDescription>
                  </div>
                  <Badge variant="outline">
                    {decision.actorRoles.join(", ")}
                  </Badge>
                </CardHeader>
                <CardPanel className="space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    Actor {decision.actorWorkosUserId}
                  </p>
                  {decision.reason || decision.note ? (
                    <p>{decision.reason ?? decision.note}</p>
                  ) : null}
                  {decision.remediation?.length ? (
                    <div>
                      <p className="font-medium text-xs">Remediation</p>
                      <ul className="mt-1 list-disc space-y-1 ps-5">
                        {decision.remediation.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <p className="text-muted-foreground text-xs">
                    {stateTransitionLabel(
                      decision.priorState,
                      decision.newState
                    )}
                  </p>
                  {decision.warnings.length ? (
                    <div className="text-warning-foreground">
                      <p className="font-medium text-xs">Warnings</p>
                      <ul className="mt-1 list-disc space-y-1 ps-5">
                        {decision.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </CardPanel>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
