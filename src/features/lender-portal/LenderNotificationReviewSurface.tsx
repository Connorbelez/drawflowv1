import { useMutation, useQuery } from "convex/react";
import { Check, Loader2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import {
  MilestoneDetailSheet,
  type MilestoneSheetData,
} from "#/features/backoffice-build-detail/MilestoneDetailSheet.tsx";
import type { BrokerageSiteVisitsResult } from "#/features/backoffice-site-visits/site-visit-types.ts";
import { DrawReviewSheet } from "#/features/draw-workflow/DrawReviewSheet.tsx";
import {
  BuilderMilestoneRevisionFooter,
  BuilderMilestoneRevisionReview,
} from "#/features/lender-portal/BuilderMilestoneRevisionReview.tsx";
import {
  type LenderBuildDetailData,
  toMilestoneSheetData,
} from "#/features/lender-portal/LenderBuildDetailOverview.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  BuilderDetail,
  BuilderSubmitResult,
  DecisionCommand,
  LenderEvidence,
  NormalizedDetail,
} from "./LenderNotificationReviewParts.tsx";
import {
  formatCurrency,
  LenderCollaboration,
  LenderDrawActionItems,
  MilestoneReviewPolicyFacts,
  normalizeBuilderDetail,
  normalizeReviewerDetail,
  ReviewEvidencePanel,
  ReviewHistoryNavigation,
  reviewGroupSatisfied,
  reviewHistory,
  reviewStateToDrawStatus,
  reviewStateToMilestoneStatus as reviewStateToMilestoneStatusImpl,
  toLenderMilestoneSiteVisits,
  typedReviewTarget,
} from "./LenderNotificationReviewParts.tsx";

const HISTORY_PAGE = { cursor: null, numItems: 20 } as const;

export type LenderNotificationReviewTarget =
  | { drawRequestId: string; kind: "draw" }
  | { kind: "milestone"; milestoneId: string };

export function LenderNotificationReviewSurface({
  onClose,
  reviewCycleId,
  reviewCycleNumber,
  target,
  viewerWorkosUserId: _viewerWorkosUserId,
}: {
  onClose: () => void;
  reviewCycleId: string;
  reviewCycleNumber: number;
  target: LenderNotificationReviewTarget;
  viewerWorkosUserId: string;
}) {
  return (
    <LenderReviewLoader
      onClose={onClose}
      reviewCycleId={reviewCycleId}
      reviewCycleNumber={reviewCycleNumber}
      target={target}
    />
  );
}

export function LenderReviewSurface({
  onClose,
  target,
  viewerWorkosUserId: _viewerWorkosUserId,
}: {
  onClose: () => void;
  target: LenderNotificationReviewTarget;
  viewerWorkosUserId: string;
}) {
  return <LenderReviewLoader onClose={onClose} target={target} />;
}

export function BackofficeNotificationReviewSurface(props: {
  milestoneData?: MilestoneSheetData;
  milestoneSiteVisits?: BrokerageSiteVisitsResult;
  onClose: () => void;
  reviewCycleId: string;
  reviewCycleNumber: number;
  target: LenderNotificationReviewTarget;
  viewerWorkosUserId: string;
  workosOrganizationId: string;
}) {
  return <BackofficeReviewLoader {...props} />;
}

export function BuilderNotificationReviewSurface(props: {
  onClose: () => void;
  onOpenBuild: (input: { buildId: string; milestoneKey: string }) => void;
  onResubmitted: (input: { cycleId: string; cycleNumber: number }) => void;
  reviewCycleId: string;
  reviewCycleNumber: number;
  target: LenderNotificationReviewTarget;
  viewerWorkosUserId: string;
  workosOrganizationId: string;
}) {
  return <BuilderReviewLoader {...props} />;
}

function LenderReviewLoader({
  onClose,
  reviewCycleId,
  reviewCycleNumber,
  target,
}: {
  onClose: () => void;
  reviewCycleId?: string;
  reviewCycleNumber?: number;
  target: LenderNotificationReviewTarget;
}) {
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [newerHistoryCursors, setNewerHistoryCursors] = useState<
    Array<string | null>
  >([]);
  const typedTarget = typedReviewTarget(target);
  const ordinary =
    reviewCycleId === undefined && reviewCycleNumber === undefined;
  const ordinaryDetail = useQuery(
    api.lender_portal_phase5.getLenderReviewRequest,
    ordinary
      ? {
          historyPaginationOpts: {
            cursor: historyCursor,
            numItems: HISTORY_PAGE.numItems,
          },
          target: typedTarget,
        }
      : "skip"
  );
  const notificationDetail = useQuery(
    api.lender_portal_phase5.getLenderNotificationReviewRequest,
    !ordinary && reviewCycleId !== undefined && reviewCycleNumber !== undefined
      ? {
          historyPaginationOpts: {
            cursor: historyCursor,
            numItems: HISTORY_PAGE.numItems,
          },
          reviewCycleId: reviewCycleId as Id<"lenderPortalReviewCycles">,
          reviewCycleNumber,
          target: typedTarget,
        }
      : "skip"
  );
  const detail = ordinaryDetail ?? notificationDetail;
  const evidence = useQuery(
    api.lender_portal_phase5.getLenderReviewEvidence,
    detail
      ? { cycleId: detail.currentCycle.cycleId, target: typedTarget }
      : "skip"
  );
  const buildDetail = useQuery(
    api.lender_portal.getLenderBuildDetail,
    detail ? { buildId: detail.buildId } : "skip"
  );
  const decide = useMutation(
    api.lender_portal_phase5.decideLenderReviewRequest
  );
  return (
    <ReviewSurfaceContent
      audience="lender"
      buildDetail={buildDetail}
      detail={detail ? normalizeReviewerDetail(detail) : undefined}
      evidence={evidence}
      historyPage={
        detail
          ? {
              canLoadNewer: newerHistoryCursors.length > 0,
              canLoadOlder: !detail.cycles.isDone,
              onLoadNewer: () => {
                const next = [...newerHistoryCursors];
                const cursor = next.pop() ?? null;
                setNewerHistoryCursors(next);
                setHistoryCursor(cursor);
              },
              onLoadOlder: () => {
                setNewerHistoryCursors((current) => [
                  ...current,
                  historyCursor,
                ]);
                setHistoryCursor(detail.cycles.continueCursor);
              },
            }
          : undefined
      }
      onClose={onClose}
      onDecide={(command) => decide(command)}
      target={target}
    />
  );
}

function BackofficeReviewLoader({
  milestoneData,
  milestoneSiteVisits,
  onClose,
  reviewCycleId,
  reviewCycleNumber,
  target,
  workosOrganizationId,
}: {
  milestoneData?: MilestoneSheetData;
  milestoneSiteVisits?: BrokerageSiteVisitsResult;
  onClose: () => void;
  reviewCycleId: string;
  reviewCycleNumber: number;
  target: LenderNotificationReviewTarget;
  viewerWorkosUserId: string;
  workosOrganizationId: string;
}) {
  const typedTarget = typedReviewTarget(target);
  const detail = useQuery(
    api.lender_portal_phase5.getBackofficeNotificationReviewRequest,
    {
      historyPaginationOpts: HISTORY_PAGE,
      reviewCycleId: reviewCycleId as Id<"lenderPortalReviewCycles">,
      reviewCycleNumber,
      target: typedTarget,
      workosOrganizationId,
    }
  );
  const decide = useMutation(
    api.lender_portal_phase5.decideBackofficeReviewRequest
  );
  const evidence = useQuery(
    api.lender_portal_phase5.getBackofficeReviewEvidence,
    detail
      ? {
          cycleId: detail.currentCycle.cycleId,
          target: typedTarget,
          workosOrganizationId,
        }
      : "skip"
  );
  return (
    <ReviewSurfaceContent
      audience="backoffice"
      detail={detail ? normalizeReviewerDetail(detail) : undefined}
      evidence={evidence}
      milestoneData={milestoneData}
      milestoneSiteVisits={milestoneSiteVisits}
      onClose={onClose}
      onDecide={(command) => decide({ ...command, workosOrganizationId })}
      target={target}
    />
  );
}

function BuilderReviewLoader({
  onClose,
  onOpenBuild,
  onResubmitted,
  reviewCycleId,
  reviewCycleNumber,
  target,
  workosOrganizationId,
}: {
  onClose: () => void;
  onOpenBuild: (input: { buildId: string; milestoneKey: string }) => void;
  onResubmitted: (input: { cycleId: string; cycleNumber: number }) => void;
  reviewCycleId: string;
  reviewCycleNumber: number;
  target: LenderNotificationReviewTarget;
  viewerWorkosUserId: string;
  workosOrganizationId: string;
}) {
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [newerHistoryCursors, setNewerHistoryCursors] = useState<
    Array<string | null>
  >([]);
  const [resubmissionError, setResubmissionError] = useState<string | null>(
    null
  );
  const [resubmitting, setResubmitting] = useState(false);
  const typedTargetValue = typedReviewTarget(target);
  const detail = useQuery(
    api.lender_portal_phase5.getBuilderNotificationReviewRequest,
    {
      historyPaginationOpts: {
        cursor: historyCursor,
        numItems: HISTORY_PAGE.numItems,
      },
      reviewCycleId: reviewCycleId as Id<"lenderPortalReviewCycles">,
      reviewCycleNumber,
      target: typedTargetValue,
      workosOrganizationId,
    }
  );
  const submit = useMutation(
    api.lender_portal_phase5.submitBuilderReviewRequest
  );
  const resubmit = async (costDocumentIds: Id<"costDocuments">[]) => {
    if (!detail || target.kind !== "milestone") {
      return;
    }
    setResubmissionError(null);
    setResubmitting(true);
    try {
      const result: BuilderSubmitResult = await submit({
        ...(costDocumentIds.length > 0 ? { costDocumentIds } : {}),
        expectedCycleNumber: detail.currentCycleNumber,
        idempotencyKey: crypto.randomUUID(),
        target: typedTargetValue,
        workosOrganizationId,
      });
      toast.success(
        `Milestone completion resubmitted for decision cycle ${result.cycleNumber}.`
      );
      onResubmitted({
        cycleId: String(result.cycleId),
        cycleNumber: result.cycleNumber,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to resubmit this Milestone completion. Refresh and try again.";
      setResubmissionError(message);
      toast.error(message);
    } finally {
      setResubmitting(false);
    }
  };
  return (
    <ReviewSurfaceContent
      audience="builder"
      builderDetail={detail}
      builderResubmissionError={resubmissionError}
      builderResubmitting={resubmitting}
      detail={detail ? normalizeBuilderDetail(detail) : undefined}
      historyPage={
        detail
          ? {
              canLoadNewer: newerHistoryCursors.length > 0,
              canLoadOlder: !detail.history.isDone,
              onLoadNewer: () => {
                const next = [...newerHistoryCursors];
                const cursor = next.pop() ?? null;
                setNewerHistoryCursors(next);
                setHistoryCursor(cursor);
              },
              onLoadOlder: () => {
                setNewerHistoryCursors((current) => [
                  ...current,
                  historyCursor,
                ]);
                setHistoryCursor(detail.history.continueCursor);
              },
            }
          : undefined
      }
      onClose={onClose}
      onOpenBuilderBuild={onOpenBuild}
      onResubmitBuilder={resubmit}
      target={target}
    />
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: One renderer preserves the locked shared-sheet IA while adapting three typed, privacy-distinct review audiences.
function ReviewSurfaceContent({
  audience,
  buildDetail,
  builderDetail,
  builderResubmissionError,
  builderResubmitting = false,
  detail,
  evidence,
  historyPage,
  milestoneData,
  milestoneSiteVisits,
  onClose,
  onDecide,
  onOpenBuilderBuild,
  onResubmitBuilder,
  target,
}: {
  audience: "backoffice" | "builder" | "lender";
  buildDetail?: LenderBuildDetailData;
  builderDetail?: BuilderDetail;
  builderResubmissionError?: string | null;
  builderResubmitting?: boolean;
  detail?: NormalizedDetail;
  evidence?: LenderEvidence;
  historyPage?: {
    canLoadNewer: boolean;
    canLoadOlder: boolean;
    onLoadNewer: () => void;
    onLoadOlder: () => void;
  };
  milestoneData?: MilestoneSheetData;
  milestoneSiteVisits?: BrokerageSiteVisitsResult;
  onClose: () => void;
  onDecide?: (command: DecisionCommand) => Promise<unknown>;
  onOpenBuilderBuild?: (input: {
    buildId: string;
    milestoneKey: string;
  }) => void;
  onResubmitBuilder?: (costDocumentIds: Id<"costDocuments">[]) => Promise<void>;
  target: LenderNotificationReviewTarget;
}) {
  const [pending, setPending] = useState(false);
  const [privateRationale, setPrivateRationale] = useState("");
  const [revisionInstructions, setRevisionInstructions] = useState("");

  if (
    !detail ||
    (audience === "lender" && !buildDetail) ||
    (audience === "backoffice" &&
      target.kind === "milestone" &&
      !(milestoneData && milestoneSiteVisits))
  ) {
    return (
      <Frame className="mx-auto mt-6 max-w-xl">
        <FramePanel
          aria-live="polite"
          className="flex items-center gap-3 p-5"
          role="status"
        >
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          Loading the current review cycle…
        </FramePanel>
      </Frame>
    );
  }

  const actionState = detail.viewerActionState;

  const submitDecision = async (decision: "approved" | "rejected") => {
    if (decision === "rejected" && !revisionInstructions.trim()) {
      toast.error(
        "Add Builder-visible revision instructions before declining."
      );
      return;
    }
    setPending(true);
    try {
      if (!onDecide) {
        throw new Error("This review is read-only.");
      }
      await onDecide({
        decision,
        expectedCycleNumber: detail.currentCycleNumber,
        idempotencyKey: crypto.randomUUID(),
        ...(privateRationale.trim()
          ? { privateRationale: privateRationale.trim() }
          : {}),
        ...(decision === "rejected"
          ? { revisionInstructions: revisionInstructions.trim() }
          : {}),
        target: typedReviewTarget(target),
      });
      toast.success(
        decision === "approved" ? "Approval recorded." : "Revision requested."
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Decision failed.");
    } finally {
      setPending(false);
    }
  };
  const actions =
    actionState === "needs_action" ? (
      <Frame>
        <FramePanel className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium text-sm">
                {audience === "backoffice"
                  ? "Back Office decision"
                  : "Lender decision"}
              </p>
              <p className="text-muted-foreground text-xs">
                Cycle {detail.currentCycleNumber} · current authorization
              </p>
            </div>
            <Badge variant="outline">Action required</Badge>
          </div>
          <Textarea
            aria-label="Builder-visible revision instructions"
            onChange={(event) => setRevisionInstructions(event.target.value)}
            placeholder="Builder-visible revision instructions (required to decline)"
            value={revisionInstructions}
          />
          <Textarea
            aria-label="Private lender rationale"
            onChange={(event) => setPrivateRationale(event.target.value)}
            placeholder="Private lender rationale (optional)"
            value={privateRationale}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              disabled={pending}
              onClick={() => submitDecision("rejected")}
              variant="destructive"
            >
              <X aria-hidden="true" /> Request revision
            </Button>
            <Button
              disabled={pending}
              onClick={() => submitDecision("approved")}
            >
              <Check aria-hidden="true" /> Approve
            </Button>
          </div>
        </FramePanel>
      </Frame>
    ) : actionState === "read_only" || actionState === "ineligible" ? (
      <Frame>
        <FramePanel className="space-y-1 p-4">
          <p className="font-medium text-sm">
            {actionState === "ineligible"
              ? "Waiting for an eligible lender"
              : detail.notice.title}
          </p>
          <p className="text-muted-foreground text-sm">
            {actionState === "ineligible"
              ? "You can review this request, but only a currently eligible lender can record the final decision."
              : detail.notice.body}
          </p>
        </FramePanel>
      </Frame>
    ) : (
      <Badge variant="outline">
        {actionState === "acted"
          ? "Your decision is recorded"
          : "Review closed"}
      </Badge>
    );
  const reviewLayer = (
    <div className="space-y-4">
      {actions}
      {audience === "builder" ? null : (
        <ReviewEvidencePanel evidence={evidence} />
      )}
    </div>
  );

  const submission = detail.currentCycle.submission;
  const historyNavigation = historyPage ? (
    <ReviewHistoryNavigation {...historyPage} />
  ) : undefined;
  if (target.kind === "draw" && submission.kind === "draw") {
    const approvals = detail.currentCycle.decisions.filter(
      (decision) =>
        decision.decision === "approved" && decision.countsTowardCurrentApproval
    );
    const draw = buildDetail?.draws.find(
      (row) => String(row.drawRequestId) === target.drawRequestId
    );
    if (audience === "lender" && !draw) {
      throw new Error("The current Draw Request projection is unavailable.");
    }
    const history = reviewHistory(detail);
    const collaboration = buildDetail ? (
      <LenderCollaboration
        rows={buildDetail.collaboration.filter(
          (row) =>
            row.primaryReferenceKind === null ||
            (row.primaryReferenceKind === "draw" &&
              row.primaryReferenceId === target.drawRequestId)
        )}
      />
    ) : undefined;
    const costDocumentReferences =
      detail.currentCycle.evidenceReferences.filter(
        (reference) => reference.kind === "cost_document"
      );
    const receiptCoverageCents =
      costDocumentReferences.length === 0
        ? undefined
        : costDocumentReferences.reduce(
            (total, reference) => total + reference.amountCents,
            0
          );
    return (
      <DrawReviewSheet
        actionItems={<LenderDrawActionItems rows={draw?.actionItems ?? []} />}
        actions={reviewLayer}
        amountCents={submission.amountCents}
        builder={
          buildDetail
            ? { displayName: buildDetail.builder.displayName }
            : undefined
        }
        buildLabel={detail.buildName ?? "Build review"}
        collaborationAction={collaboration}
        details={[
          { label: "Decision cycle", value: String(detail.currentCycleNumber) },
          { label: "Request key", value: submission.requestKey },
        ]}
        displayId={submission.displayId}
        drawLabel={submission.label}
        evidence={detail.currentCycle.evidenceReferences.map(
          (reference, index) => ({
            amountLabel:
              reference.kind === "cost_document"
                ? formatCurrency(reference.amountCents)
                : undefined,
            detail: reference.label,
            id: `${reference.kind}-${index}`,
            label: reference.label,
            type:
              reference.kind === "cost_document"
                ? reference.documentKind === "invoice"
                  ? "invoice"
                  : "document"
                : "other",
          })
        )}
        funding={
          buildDetail && draw
            ? {
                availableAfterRequestCents:
                  draw.fundingPosition.remainingAfterCents,
                drawAvailabilityCents:
                  draw.fundingPosition.availableBeforeCents,
                drawnCents: buildDetail.funding.releasedCents,
                receiptCoverageCents,
                totalApprovedCents: buildDetail.funding.approvedMilestoneCents,
              }
            : undefined
        }
        history={history}
        historyNavigation={historyNavigation}
        location={buildDetail?.build.location}
        onClose={onClose}
        open
        policyGates={detail.currentCycle.requirements.requiredGroups.map(
          (group) => ({
            label: group === "backoffice" ? "Back Office Admin" : "Lender",
            state: reviewGroupSatisfied(
              group,
              approvals,
              detail.currentCycle.requirements.lenderQuorum
            )
              ? "satisfied"
              : "pending",
            stateLabel: reviewGroupSatisfied(
              group,
              approvals,
              detail.currentCycle.requirements.lenderQuorum
            )
              ? "Satisfied"
              : "Pending",
          })
        )}
        requestNote={submission.note ?? undefined}
        status={reviewStateToDrawStatus(detail.currentCycle.state)}
        submittedAt={new Date(detail.currentCycle.submittedAt).toISOString()}
        viewerRole={audience}
      />
    );
  }

  if (target.kind === "milestone" && submission.kind === "milestone") {
    const milestone = buildDetail?.milestones.find(
      (row) => String(row.buildMilestoneId) === target.milestoneId
    );
    if (audience === "lender" && !(buildDetail && milestone)) {
      throw new Error("The current Milestone projection is unavailable.");
    }
    const recentEvents = reviewHistory(detail).map((entry) => ({
      _id: entry.id,
      actor: entry.actor,
      createdAt: entry.createdAt,
      title: entry.title,
    }));
    const collaboration = buildDetail ? (
      <LenderCollaboration
        rows={buildDetail.collaboration.filter(
          (row) =>
            row.primaryReferenceKind === null ||
            ((row.primaryReferenceKind === "milestone" ||
              row.primaryReferenceKind === "submilestone") &&
              (row.primaryReferenceId === target.milestoneId ||
                row.primaryReferenceId === submission.milestoneKey))
        )}
      />
    ) : undefined;
    const builderRevision =
      audience === "builder" &&
      builderDetail &&
      onOpenBuilderBuild &&
      onResubmitBuilder
        ? {
            footer: (
              <BuilderMilestoneRevisionFooter
                detail={builderDetail}
                errorMessage={builderResubmissionError}
                onOpenBuild={() =>
                  onOpenBuilderBuild({
                    buildId: String(builderDetail.buildId),
                    milestoneKey: submission.milestoneKey,
                  })
                }
                onResubmit={onResubmitBuilder}
                pending={builderResubmitting}
              />
            ),
            review: (
              <div className="order-first grid gap-4">
                <BuilderMilestoneRevisionReview
                  detail={builderDetail}
                  onOpenBuild={() =>
                    onOpenBuilderBuild({
                      buildId: String(builderDetail.buildId),
                      milestoneKey: submission.milestoneKey,
                    })
                  }
                />
                {historyNavigation}
              </div>
            ),
          }
        : null;
    return (
      <MilestoneDetailSheet
        collaboration={collaboration}
        data={
          audience === "backoffice" && milestoneData
            ? {
                ...milestoneData,
                recentEvents,
                status: reviewStateToMilestoneStatus(detail.currentCycle.state),
              }
            : buildDetail && milestone
              ? toMilestoneSheetData(buildDetail, milestone, recentEvents)
              : {
                  column:
                    audience === "builder"
                      ? detail.notice.title
                      : "Back Office review",
                  contractors: [],
                  milestoneKey: submission.milestoneKey,
                  name: submission.milestoneName,
                  recentEvents,
                  status: reviewStateToMilestoneStatus(
                    detail.currentCycle.state
                  ),
                  submilestones: [],
                  submittedAt: detail.currentCycle.submittedAt,
                }
        }
        footer={builderRevision?.footer}
        onClose={onClose}
        reviewLayer={
          builderRevision?.review ?? (
            <div className="space-y-4">
              <MilestoneReviewPolicyFacts cycle={detail.currentCycle} />
              {reviewLayer}
              {historyNavigation}
            </div>
          )
        }
        showSiteVisitFieldLink={audience !== "lender"}
        siteVisits={
          audience === "backoffice"
            ? milestoneSiteVisits
            : buildDetail && milestone
              ? toLenderMilestoneSiteVisits(buildDetail, milestone)
              : undefined
        }
      />
    );
  }

  throw new Error("The review notification target does not match its cycle.");
}

export function reviewStateToMilestoneStatus(state: string) {
  return reviewStateToMilestoneStatusImpl(state);
}
