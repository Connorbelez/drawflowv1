"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowUpRight,
  BookOpenCheck,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  History,
  MapPinCheck,
  ReceiptText,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { Separator } from "#/components/ui/separator.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type SiteVisitOrderConfirmation,
  SiteVisitOrderDialog,
} from "../backoffice-build-detail/SiteVisitOrderDialog.tsx";
import type { BrokerageSiteVisitsResult } from "../backoffice-site-visits/site-visit-types.ts";
import type { BuildDetailTarget } from "../build-detail-targets/buildDetailTarget.ts";
import type { CostDocumentSummary } from "../cost-documents/CostDocumentRoadmapReconciliation.tsx";
import {
  CostDocumentFileList,
  DocumentedCostCoverage,
  type SubmilestoneCostDocument,
} from "../cost-documents/SubmilestoneCostDocuments.tsx";
import {
  type CanonicalWorkspaceCollection,
  canonicalCommandErrorMessage,
  createCanonicalCommandKey,
  EvidenceAssetCard,
  evidenceAssetIdentity,
  isCanonicalEvidenceAsset,
  isCanonicalReviewStaleConflict,
} from "./SubmilestoneDetailCanonical.tsx";
import { SubmilestoneSiteVisitWorkspace } from "./SubmilestoneSiteVisitWorkspace.tsx";

type CanonicalReview = FunctionReturnType<
  typeof api.build_submilestone_review.getActiveBuildSubmilestoneReview
>;

type ReviewCommand =
  | "approve"
  | "recommend"
  | "request_changes"
  | "retract"
  | "site_visit"
  | "waive";

interface ReviewCapability {
  allowed: boolean;
}

export interface ReviewTabBootstrap {
  build: {
    buildName: string;
    location: string;
    startDate: string;
  };
  capabilities: {
    canonical: {
      approveChild: ReviewCapability;
      retractChildApproval: ReviewCapability;
      waiveSiteVisit: ReviewCapability;
    };
    review: {
      recommend: ReviewCapability;
      requestChanges: ReviewCapability;
    };
    siteVisit: {
      cancel: ReviewCapability;
      order: ReviewCapability;
    };
  };
  evidence: {
    evidencePackageRevision?: number;
    evidencePackageStatus?: string;
    itemCount: number;
    requirementCount: number;
  };
  milestone: {
    buildMilestoneId: Id<"buildMilestones">;
    drawAvailabilityCents: number;
    key: string;
    name: string;
  };
  overview: {
    actualCompletedAt?: number;
    actualCostCents?: number;
    actualStartedAt?: number;
    budgetCents?: number;
    plannedDurationDays?: number;
    plannedStartDay?: number;
  };
  submilestone: {
    buildSubmilestoneId: Id<"buildSubmilestones">;
    key: string;
    name: string;
    proposalSubmilestoneId: Id<"proposalSubmilestones">;
  };
}

export interface SubmilestoneReviewTabProps {
  bootstrap: ReviewTabBootstrap;
  buildId: Id<"activeBuilds">;
  collection?: CanonicalWorkspaceCollection;
  costDocuments?: CostDocumentSummary[];
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onOpenCostDocument?: (costDocumentId: string) => void;
  onOpenScopeAndGuidance?: () => void;
  onOpenTarget?: (
    target: BuildDetailTarget,
    context?: { selectedTab?: string }
  ) => void;
  onRetry?: () => void;
  organizationId: string;
  readOnly: boolean;
}

export function SubmilestoneReviewTab({
  bootstrap,
  buildId,
  collection,
  costDocuments = [],
  loadingMore = false,
  onLoadMore,
  onOpenCostDocument,
  onOpenScopeAndGuidance,
  onOpenTarget,
  onRetry,
  organizationId,
  readOnly,
}: SubmilestoneReviewTabProps) {
  const review = useQuery(
    api.build_submilestone_review.getActiveBuildSubmilestoneReview,
    {
      buildId,
      milestoneKey: bootstrap.milestone.key,
      submilestoneKey: bootstrap.submilestone.key,
      workosOrganizationId: organizationId,
    }
  );
  const fieldGuidance = useQuery(
    api.submilestone_field_guidance.getSubmilestoneFieldGuidance,
    {
      proposalSubmilestoneId: bootstrap.submilestone.proposalSubmilestoneId,
      workosOrganizationId: organizationId,
    }
  );
  const siteVisits = useQuery(
    api.production_proposals.listBrokerageSiteVisits,
    {
      buildId,
      milestoneKey: bootstrap.milestone.key,
      submilestoneId: bootstrap.submilestone.buildSubmilestoneId,
      workosOrganizationId: organizationId,
    }
  );
  const recommend = useMutation(
    api.build_submilestone_review.recommendActiveBuildSubmilestoneReview
  );
  const requestChanges = useMutation(
    api.build_submilestone_review.requestActiveBuildSubmilestoneChanges
  );
  const waiveSiteVisit = useMutation(
    api.build_submilestone_review.waiveActiveBuildSubmilestoneSiteVisit
  );
  const approveChild = useMutation(
    api.build_submilestone_review.approveActiveBuildSubmilestone
  );
  const retractChild = useMutation(
    api.build_submilestone_review.retractActiveBuildSubmilestoneApproval
  );
  const scheduleSiteVisit = useMutation(
    api.production_proposals.scheduleActiveBuildSiteVisit
  );
  const cancelSiteVisit = useMutation(
    api.production_proposals.cancelActiveBuildSiteVisit
  );

  const [busy, setBusy] = useState<ReviewCommand | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [remediationText, setRemediationText] = useState("");
  const [siteVisitRequired, setSiteVisitRequired] = useState(false);
  const [siteVisitOpen, setSiteVisitOpen] = useState(false);
  const visitScopeKey = `${buildId}:${bootstrap.submilestone.buildSubmilestoneId}`;
  const optimisticVisits = useOptimisticallyHiddenVisits(visitScopeKey);

  if (review === undefined) {
    return (
      <Frame data-testid="submilestone-review-loading">
        <FramePanel
          aria-live="polite"
          className="min-h-28 animate-pulse text-muted-foreground text-sm motion-reduce:animate-none"
          role="status"
        >
          Loading canonical child review…
        </FramePanel>
      </Frame>
    );
  }

  const capabilities = bootstrap.capabilities;
  const requirement = review.siteVisit.requirement;
  const currentVisit = review.siteVisit.currentVisit;
  const remediation = remediationText
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  const inReview = review.child.evidenceReviewState === "in_review";
  const childApproved = review.child.reviewDecisionState === "approved";
  const requiredVisitSatisfied =
    !requirement?.required ||
    requirement.status === "satisfied" ||
    requirement.status === "waived";
  const canRecommend =
    !readOnly && capabilities.review.recommend.allowed && inReview;
  const canRequestChanges =
    !readOnly && capabilities.review.requestChanges.allowed && inReview;
  const canWaive =
    !readOnly &&
    capabilities.canonical.waiveSiteVisit.allowed &&
    inReview &&
    requirement?.required === true &&
    requirement.status === "required";
  const canApprove =
    !readOnly &&
    capabilities.canonical.approveChild.allowed &&
    inReview &&
    requiredVisitSatisfied;
  const canRetract =
    !readOnly &&
    capabilities.canonical.retractChildApproval.allowed &&
    childApproved;
  const canOrderSiteVisit = !readOnly && capabilities.siteVisit.order.allowed;
  const canCancelSiteVisit = !readOnly && capabilities.siteVisit.cancel.allowed;
  const showApproveInterface = !readOnly && !childApproved;
  const approvalBlocker = capabilities.canonical.approveChild.allowed
    ? inReview
      ? requiredVisitSatisfied
        ? undefined
        : "Complete or waive the required Site Visit before approving this Sub-milestone."
      : "Builder evidence must be in review before this Sub-milestone can be approved."
    : (capabilities.canonical.approveChild.reason ??
      "You do not have authority to approve this Sub-milestone.");

  const commandArgs = {
    buildId,
    expectedRevision: review.child.reviewRevision,
    milestoneKey: bootstrap.milestone.key,
    submilestoneKey: bootstrap.submilestone.key,
    workosOrganizationId: organizationId,
  };

  const runCommand = async (
    command: ReviewCommand,
    action: () => Promise<unknown>,
    success: string
  ) => {
    setBusy(command);
    setError(null);
    try {
      await action();
      setNote("");
      setReason("");
      setRemediationText("");
      setSiteVisitRequired(false);
      toast.success(success);
      return true;
    } catch (cause) {
      setError(cause);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const recommendReview = async () => {
    if (!note.trim()) {
      setError("Add a reviewer note before recording the recommendation.");
      return;
    }
    await runCommand(
      "recommend",
      () =>
        recommend({
          ...commandArgs,
          idempotencyKey: createCanonicalCommandKey("review-recommendation"),
          note: note.trim(),
          ...(remediation.length ? { remediation } : {}),
          siteVisitRequired,
        }),
      "Review recommendation recorded."
    );
  };

  const requestReviewChanges = async () => {
    if (!reason.trim() || remediation.length === 0) {
      setError(
        "Add a reason and at least one remediation step before requesting changes."
      );
      return;
    }
    await runCommand(
      "request_changes",
      () =>
        requestChanges({
          ...commandArgs,
          idempotencyKey: createCanonicalCommandKey("review-changes"),
          reason: reason.trim(),
          remediation,
        }),
      "Changes requested from the field team."
    );
  };

  const waiveRequiredSiteVisit = async () => {
    if (!reason.trim()) {
      setError("Add the Admin waiver rationale before waiving the Site Visit.");
      return;
    }
    await runCommand(
      "waive",
      () =>
        waiveSiteVisit({
          ...commandArgs,
          idempotencyKey: createCanonicalCommandKey("site-visit-waiver"),
          reason: reason.trim(),
        }),
      "Required Site Visit waived with an audited rationale."
    );
  };

  const approveSubmilestone = async () => {
    await runCommand(
      "approve",
      () =>
        approveChild({
          ...commandArgs,
          idempotencyKey: createCanonicalCommandKey("child-approval"),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      "Sub-milestone approved."
    );
  };

  const retractSubmilestone = async () => {
    if (!reason.trim()) {
      setError("Add a reason before retracting child approval.");
      return;
    }
    await runCommand(
      "retract",
      () =>
        retractChild({
          ...commandArgs,
          idempotencyKey: createCanonicalCommandKey("child-retraction"),
          reason: reason.trim(),
        }),
      "Sub-milestone approval retracted."
    );
  };

  const orderSiteVisit = async (input: SiteVisitOrderConfirmation) => {
    const ordered = await runCommand(
      "site_visit",
      () =>
        scheduleSiteVisit({
          buildId,
          idempotencyKey: createCanonicalCommandKey("site-visit-order"),
          milestoneKey: input.milestoneKey,
          ...(input.note ? { note: input.note } : {}),
          requestedDay: input.requestedDay ?? 0,
          ...(input.requestedTime
            ? { requestedTime: input.requestedTime }
            : {}),
          siteVisitGuidance: input.siteVisitGuidance,
          submilestoneGuidanceSections: input.submilestoneGuidanceSections.map(
            (section) => ({
              ...section,
              buildSubmilestoneId:
                section.buildSubmilestoneId as Id<"buildSubmilestones">,
              proposalSubmilestoneId:
                section.proposalSubmilestoneId as Id<"proposalSubmilestones">,
            })
          ),
          submilestoneKeys: input.submilestoneKeys,
          workosOrganizationId: organizationId,
        }),
      "Site Visit ordered."
    );
    if (ordered) {
      setSiteVisitOpen(false);
    }
  };

  const cancelVisitOptimistically = async (input: {
    buildId: string;
    reason: string;
    visitId: string;
  }) => {
    optimisticVisits.hide(input.visitId);
    try {
      await cancelSiteVisit({
        buildId,
        reason: input.reason,
        visitId: input.visitId,
        workosOrganizationId: organizationId,
      });
    } catch (cause) {
      optimisticVisits.restore(input.visitId);
      throw cause;
    }
  };

  const visibleSiteVisits = siteVisits
    ? {
        ...siteVisits,
        visits: siteVisits.visits.filter(
          (visit) =>
            visit.operationalStatus !== "cancelled" &&
            !optimisticVisits.hiddenIds.has(visit.visitId)
        ),
      }
    : undefined;
  const scopedCostDocuments = costDocumentsForSubmilestone(
    costDocuments,
    bootstrap.submilestone.buildSubmilestoneId
  );

  const showCommands =
    canRecommend ||
    canRequestChanges ||
    canWaive ||
    showApproveInterface ||
    canRetract;

  return (
    <div className="space-y-5" data-testid="submilestone-review-tab">
      <SubmilestoneReviewSummary bootstrap={bootstrap} review={review} />
      <Separator />
      <BuilderSubmittedEvidence
        bootstrap={bootstrap}
        collection={collection}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        onOpenScopeAndGuidance={onOpenScopeAndGuidance}
        review={review}
      />
      <Separator />
      <CostDocumentReview
        bootstrap={bootstrap}
        documents={scopedCostDocuments}
        onOpenCostDocument={onOpenCostDocument}
      />
      <Separator />
      <SiteVisitReviewSection
        canCancel={canCancelSiteVisit}
        canOrder={canOrderSiteVisit}
        canWaive={canWaive}
        currentVisit={currentVisit}
        guidanceReady={fieldGuidance !== undefined}
        onCancelVisit={cancelVisitOptimistically}
        onOrder={() => setSiteVisitOpen(true)}
        onWaive={waiveRequiredSiteVisit}
        pending={busy !== null}
        requirement={requirement}
        siteVisits={visibleSiteVisits}
      />
      <Separator />
      <ParentReadinessSection
        milestoneName={bootstrap.milestone.name}
        onOpenParent={
          onOpenTarget
            ? () =>
                onOpenTarget(
                  {
                    kind: "milestone",
                    milestoneId: bootstrap.milestone.buildMilestoneId,
                  },
                  { selectedTab: "review" }
                )
            : undefined
        }
        parent={review.parent}
      />
      {showCommands ? (
        <>
          <Separator />
          <ReviewCommands
            approvalBlocker={approvalBlocker}
            busy={busy}
            canApprove={canApprove}
            canRecommend={canRecommend}
            canRequestChanges={canRequestChanges}
            canRetract={canRetract}
            canWaive={canWaive}
            note={note}
            onApprove={approveSubmilestone}
            onNoteChange={setNote}
            onReasonChange={setReason}
            onRecommend={recommendReview}
            onRemediationChange={setRemediationText}
            onRequestChanges={requestReviewChanges}
            onRetract={retractSubmilestone}
            onSiteVisitRequiredChange={setSiteVisitRequired}
            reason={reason}
            remediationText={remediationText}
            showApprove={showApproveInterface}
            siteVisitRequired={siteVisitRequired}
          />
        </>
      ) : null}
      {error ? (
        <Frame aria-live="assertive">
          <FramePanel
            className="space-y-2 border-destructive/35 p-3 text-sm"
            role="alert"
          >
            <div className="flex items-center gap-2 text-destructive-text">
              <TriangleAlert aria-hidden="true" className="size-4" />
              <p className="font-medium">Review command failed</p>
            </div>
            <p>{canonicalCommandErrorMessage(error)}</p>
            {isCanonicalReviewStaleConflict(error) ? (
              <p className="text-muted-foreground text-xs">
                A newer child or parent review decision is available. Refresh
                the Review tab, confirm the latest state, and retry.
              </p>
            ) : null}
            {onRetry ? (
              <Button
                onClick={onRetry}
                size="sm"
                type="button"
                variant="outline"
              >
                <RotateCcw aria-hidden="true" />
                Refresh review
              </Button>
            ) : null}
          </FramePanel>
        </Frame>
      ) : null}
      <Separator />
      <ReviewHistory decisions={review.decisions} />
      <SiteVisitOrderDialog
        build={{
          location: bootstrap.build.location,
          name: bootstrap.build.buildName,
        }}
        milestone={{
          key: bootstrap.milestone.key,
          name: bootstrap.milestone.name,
        }}
        onConfirm={orderSiteVisit}
        onOpenChange={setSiteVisitOpen}
        open={siteVisitOpen}
        request={
          siteVisitOpen ? { milestoneKey: bootstrap.milestone.key } : null
        }
        submilestones={[
          {
            _id: String(bootstrap.submilestone.buildSubmilestoneId),
            fieldGuidance: fieldGuidance?.guidance ?? null,
            key: bootstrap.submilestone.key,
            name: bootstrap.submilestone.name,
            proposalSubmilestoneId: String(
              bootstrap.submilestone.proposalSubmilestoneId
            ),
          },
        ]}
      />
    </div>
  );
}

function SubmilestoneReviewSummary({
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

function BuilderSubmittedEvidence({
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

function CostDocumentReview({
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

function ReviewFact({
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

function formatReviewCents(cents: number | undefined) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format((cents ?? 0) / 100);
}

function formatOptionalReviewCents(cents: number | undefined) {
  return cents === undefined ? "Not recorded" : formatReviewCents(cents);
}

function formatReviewDate(value: number | undefined) {
  if (value === undefined) {
    return "Not recorded";
  }
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function plannedSubmilestoneDate(
  bootstrap: ReviewTabBootstrap,
  boundary: "end" | "start"
) {
  const { plannedDurationDays, plannedStartDay } = bootstrap.overview;
  if (plannedStartDay === undefined || !bootstrap.build.startDate) {
    return "Not scheduled";
  }
  const start = Date.parse(bootstrap.build.startDate);
  if (!Number.isFinite(start)) {
    return boundary === "start" ? bootstrap.build.startDate : "Not scheduled";
  }
  const dayOffset =
    Math.max(0, Math.round(plannedStartDay)) +
    (boundary === "end"
      ? Math.max(1, Math.round(plannedDurationDays ?? 1)) - 1
      : 0);
  const date = new Date(start);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

function SiteVisitReviewSection({
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

function ParentReadinessSection({
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

function ReviewCommands({
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

function costDocumentsForSubmilestone(
  documents: CostDocumentSummary[],
  buildSubmilestoneId: Id<"buildSubmilestones">
): SubmilestoneCostDocument[] {
  return documents
    .filter(
      (document) =>
        document.lifecycle.state === "current" &&
        document.allocations.some(
          (allocation) =>
            String(allocation.buildSubmilestoneId) ===
            String(buildSubmilestoneId)
        )
    )
    .map((document) => ({
      _id: String(document._id),
      allocationAmountCents: document.allocations
        .filter(
          (allocation) =>
            String(allocation.buildSubmilestoneId) ===
            String(buildSubmilestoneId)
        )
        .reduce((sum, allocation) => sum + allocation.amountCents, 0),
      kind: document.kind,
      pages: document.pages.map((page) => ({
        assetId: String(page.assetId),
        fileName: page.fileName,
        mimeType: page.mimeType,
      })),
      title: document.title,
    }));
}

const EMPTY_VISIT_IDS = new Set<string>();

function useOptimisticallyHiddenVisits(scopeKey: string) {
  const [state, setState] = useState<{
    hiddenIds: Set<string>;
    scopeKey: string;
  }>(() => ({ hiddenIds: new Set(), scopeKey }));
  const hiddenIds =
    state.scopeKey === scopeKey ? state.hiddenIds : EMPTY_VISIT_IDS;
  const update = (visitId: string, hidden: boolean) => {
    setState((current) => {
      const nextIds = new Set(
        current.scopeKey === scopeKey ? current.hiddenIds : EMPTY_VISIT_IDS
      );
      if (hidden) {
        nextIds.add(visitId);
      } else {
        nextIds.delete(visitId);
      }
      return { hiddenIds: nextIds, scopeKey };
    });
  };
  return {
    hiddenIds,
    hide: (visitId: string) => update(visitId, true),
    restore: (visitId: string) => update(visitId, false),
  };
}

function ReviewHistory({
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

function reviewStateLabel(state: string) {
  return state
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function siteVisitStatusLabel(status: string) {
  return reviewStateLabel(status);
}

function reviewKindLabel(kind: string) {
  return reviewStateLabel(kind);
}

function formatReviewTimestamp(value: number) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value);
}

function stateTransitionLabel(priorState: string, newState: string) {
  return `State transition: ${summarizeState(priorState)} → ${summarizeState(newState)}`;
}

function summarizeState(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return (
      Object.entries(parsed)
        .map(([key, item]) => `${reviewStateLabel(key)}: ${String(item)}`)
        .join(", ") || "Recorded"
    );
  } catch {
    return value || "Recorded";
  }
}
