"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { SiteVisitOrderDialog } from "../backoffice-build-detail/SiteVisitOrderDialog.tsx";
import {
  canonicalCommandErrorMessage,
  isCanonicalReviewStaleConflict,
} from "./SubmilestoneDetailCanonical.tsx";
import {
  BuilderSubmittedEvidence,
  CostDocumentReview,
  ParentReadinessSection,
  ReviewCommands,
  ReviewHistory,
  SiteVisitReviewSection,
  SubmilestoneReviewSummary,
} from "./submilestone-review-tab-sections.tsx";

export type {
  ReviewTabBootstrap,
  SubmilestoneReviewTabProps,
} from "./submilestone-review-tab-contracts.ts";

import type { SubmilestoneReviewTabProps } from "./submilestone-review-tab-contracts.ts";
import { useSubmilestoneReviewTabWorkflow } from "./submilestone-review-tab-workflow.ts";

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
  const workflow = useSubmilestoneReviewTabWorkflow({
    bootstrap,
    buildId,
    collection,
    costDocuments,
    loadingMore,
    onLoadMore,
    onOpenCostDocument,
    onOpenScopeAndGuidance,
    onOpenTarget,
    onRetry,
    organizationId,
    readOnly,
  });
  if (workflow === null) {
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
  const {
    approvalBlocker,
    approveSubmilestone,
    busy,
    canApprove,
    canCancelSiteVisit,
    canOrderSiteVisit,
    canRecommend,
    canRequestChanges,
    canRetract,
    canWaive,
    cancelVisitOptimistically,
    currentVisit,
    error,
    fieldGuidance,
    note,
    orderSiteVisit,
    reason,
    recommendReview,
    requestReviewChanges,
    remediationText,
    requirement,
    retractSubmilestone,
    review,
    scopedCostDocuments,
    setNote,
    setReason,
    setRemediationText,
    setSiteVisitOpen,
    setSiteVisitRequired,
    showApproveInterface,
    showCommands,
    siteVisitOpen,
    siteVisitRequired,
    visibleSiteVisits,
    waiveRequiredSiteVisit,
  } = workflow;

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
