"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  History,
  MapPinCheck,
  RotateCcw,
  ShieldCheck,
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
import type { BuildDetailTarget } from "../build-detail-targets/buildDetailTarget.ts";
import {
  canonicalCommandErrorMessage,
  createCanonicalCommandKey,
  isCanonicalReviewStaleConflict,
} from "./SubmilestoneDetailCanonical.tsx";

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
  };
  evidence: {
    evidencePackageRevision?: number;
    evidencePackageStatus?: string;
    itemCount: number;
    requirementCount: number;
  };
  milestone: {
    buildMilestoneId: Id<"buildMilestones">;
    key: string;
    name: string;
  };
  submilestone: {
    key: string;
    name: string;
  };
}

export interface SubmilestoneReviewTabProps {
  bootstrap: ReviewTabBootstrap;
  buildId: Id<"activeBuilds">;
  onOpenTarget?: (
    target: BuildDetailTarget,
    context?: { selectedTab?: string }
  ) => void;
  onReferenceOpen?: (reference: {
    entityId: string;
    entityKind: string;
    href: string;
  }) => void;
  onRetry?: () => void;
  organizationId: string;
  readOnly: boolean;
}

export function SubmilestoneReviewTab({
  bootstrap,
  buildId,
  onOpenTarget,
  onReferenceOpen,
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

  const [busy, setBusy] = useState<ReviewCommand | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [remediationText, setRemediationText] = useState("");
  const [siteVisitRequired, setSiteVisitRequired] = useState(false);
  const [siteVisitOpen, setSiteVisitOpen] = useState(false);

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
  const canOrderSiteVisit =
    !readOnly &&
    (capabilities.review.recommend.allowed ||
      capabilities.review.requestChanges.allowed ||
      capabilities.canonical.waiveSiteVisit.allowed ||
      capabilities.canonical.approveChild.allowed) &&
    requirement?.required === true &&
    requirement.status === "required" &&
    currentVisit === null;

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
          submilestoneKeys: input.submilestoneKeys,
          workosOrganizationId: organizationId,
        }),
      "Site Visit ordered."
    );
    if (ordered) {
      setSiteVisitOpen(false);
    }
  };

  const showCommands =
    canRecommend || canRequestChanges || canWaive || canApprove || canRetract;

  return (
    <div className="space-y-5" data-testid="submilestone-review-tab">
      <ReviewSummary bootstrap={bootstrap} review={review} />
      <Separator />
      <SiteVisitReviewSection
        canOrder={canOrderSiteVisit}
        canWaive={canWaive}
        currentVisit={currentVisit}
        onOpenSiteVisit={() => {
          if (!currentVisit) {
            return;
          }
          onReferenceOpen?.({
            entityId: String(currentVisit._id),
            entityKind: "siteVisit",
            href: `siteVisit:${String(currentVisit._id)}`,
          });
        }}
        onOrder={() => setSiteVisitOpen(true)}
        onWaive={waiveRequiredSiteVisit}
        pending={busy !== null}
        requirement={requirement}
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
            key: bootstrap.submilestone.key,
            name: bootstrap.submilestone.name,
          },
        ]}
      />
    </div>
  );
}

function ReviewSummary({
  bootstrap,
  review,
}: {
  bootstrap: ReviewTabBootstrap;
  review: CanonicalReview;
}) {
  return (
    <section aria-labelledby="child-review-heading" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            className="flex items-center gap-2 font-semibold"
            id="child-review-heading"
          >
            <ShieldCheck aria-hidden="true" className="size-4" />
            Child review
          </h3>
          <p className="mt-1 text-muted-foreground text-sm">
            Canonical evidence and decisions for review round{" "}
            {review.child.reviewRound}.
          </p>
        </div>
        <Badge
          variant={
            review.child.reviewDecisionState === "approved"
              ? "success"
              : review.child.reviewDecisionState === "changes_requested" ||
                  review.child.reviewDecisionState === "reopened"
                ? "warning"
                : "outline"
          }
        >
          {reviewStateLabel(review.child.reviewDecisionState)}
        </Badge>
      </div>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <ReviewFact
          label="Evidence Package"
          value={
            bootstrap.evidence.evidencePackageRevision === undefined
              ? "No revision"
              : `Revision ${bootstrap.evidence.evidencePackageRevision} · ${bootstrap.evidence.evidencePackageStatus ?? "draft"}`
          }
        />
        <ReviewFact
          label="Evidence readiness"
          value={`${bootstrap.evidence.itemCount} of ${bootstrap.evidence.requirementCount} evidence items`}
        />
        <ReviewFact
          label="Evidence review"
          value={reviewStateLabel(review.child.evidenceReviewState)}
        />
        <ReviewFact
          label="Review revision"
          value={String(review.child.reviewRevision)}
        />
      </dl>
    </section>
  );
}

function ReviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-medium text-sm">{value}</dd>
    </div>
  );
}

function SiteVisitReviewSection({
  canOrder,
  canWaive,
  currentVisit,
  onOpenSiteVisit,
  onOrder,
  onWaive,
  pending,
  requirement,
}: {
  canOrder: boolean;
  canWaive: boolean;
  currentVisit: CanonicalReview["siteVisit"]["currentVisit"];
  onOpenSiteVisit: () => void;
  onOrder: () => void;
  onWaive: () => void;
  pending: boolean;
  requirement: CanonicalReview["siteVisit"]["requirement"];
}) {
  const signals = requirement
    ? [
        ...requirement.policySignals.map((value) => `Policy · ${value}`),
        ...requirement.riskSignals.map((value) => `Risk · ${value}`),
        ...requirement.manualSignals.map((value) => `Manual · ${value}`),
      ]
    : [];
  return (
    <section aria-labelledby="site-visit-review-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
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
      <div className="flex flex-wrap gap-2">
        {canOrder ? (
          <Button disabled={pending} onClick={onOrder} size="sm" type="button">
            <ClipboardCheck aria-hidden="true" />
            Order Site Visit
          </Button>
        ) : null}
        {currentVisit ? (
          <Button
            onClick={onOpenSiteVisit}
            size="sm"
            type="button"
            variant="outline"
          >
            <ArrowUpRight aria-hidden="true" />
            Manage Site Visit
          </Button>
        ) : null}
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
      </div>
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
  siteVisitRequired,
}: {
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
  siteVisitRequired: boolean;
}) {
  return (
    <section aria-labelledby="review-command-heading" className="space-y-3">
      <div>
        <h3 className="font-semibold text-sm" id="review-command-heading">
          Child review commands
        </h3>
        <p className="mt-1 text-muted-foreground text-xs">
          Commands write only canonical Sub-milestone review state.
        </p>
      </div>
      {canRecommend || canApprove ? (
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
            variant="warning"
          >
            Request changes
          </Button>
        ) : null}
        {canApprove ? (
          <Button
            disabled={busy !== null}
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
            variant="warning"
          >
            Retract child approval
          </Button>
        ) : null}
      </div>
    </section>
  );
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
