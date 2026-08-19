import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, ExternalLink, FileText, Loader2, X } from "lucide-react";
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

type ReviewerDetail = FunctionReturnType<
  typeof api.lender_portal_phase5.getLenderReviewRequest
>;
type BuilderDetail = FunctionReturnType<
  typeof api.lender_portal_phase5.getBuilderNotificationReviewRequest
>;
type BuilderSubmitResult = FunctionReturnType<
  typeof api.lender_portal_phase5.submitBuilderReviewRequest
>;
type ReviewerCycle = ReviewerDetail["currentCycle"];
type ReviewDecision = ReviewerCycle["decisions"][number];
type ReviewSubmission = ReviewerCycle["submission"];
type ReviewReference = ReviewerCycle["evidenceReferences"][number];
type ReviewRequirements = ReviewerCycle["requirements"];
type ReviewState = ReviewerCycle["state"];
type LenderEvidence = FunctionReturnType<
  typeof api.lender_portal_phase5.getLenderReviewEvidence
>;

interface NormalizedCycle {
  cycleId?: Id<"lenderPortalReviewCycles">;
  cycleNumber: number;
  decisions: ReviewDecision[];
  evidenceReferences: ReviewReference[];
  requirements: ReviewRequirements;
  state: ReviewState;
  submission: ReviewSubmission;
  submittedAt: number;
}

interface NormalizedDetail {
  buildId: Id<"activeBuilds">;
  buildName: string;
  currentCycle: NormalizedCycle;
  currentCycleNumber: number;
  cycles: NormalizedCycle[];
  notice: { body: string; title: string };
  viewerActionState:
    | "needs_action"
    | "acted"
    | "not_required"
    | "ineligible"
    | "closed"
    | "unavailable"
    | "read_only";
}

interface DecisionCommand {
  decision: "approved" | "rejected";
  expectedCycleNumber: number;
  idempotencyKey: string;
  privateRationale?: string;
  revisionInstructions?: string;
  target: ReturnType<typeof typedReviewTarget>;
}

function typedReviewTarget(target: LenderNotificationReviewTarget) {
  return target.kind === "milestone"
    ? {
        kind: "milestone" as const,
        milestoneId: target.milestoneId as Id<"buildMilestones">,
      }
    : {
        drawRequestId: target.drawRequestId as Id<"activeBuildDrawRequests">,
        kind: "draw" as const,
      };
}

function normalizeReviewerDetail(detail: ReviewerDetail): NormalizedDetail {
  return {
    buildId: detail.buildId,
    buildName: detail.buildName,
    currentCycle: detail.currentCycle,
    currentCycleNumber: detail.currentCycleNumber,
    cycles: detail.cycles.page,
    notice: { body: "The current review cycle is read-only.", title: "Review" },
    viewerActionState: detail.viewerActionState,
  };
}

function normalizeBuilderDetail(detail: BuilderDetail): NormalizedDetail {
  const normalizeCycle = (
    cycle: BuilderDetail["currentCycle"]
  ): NormalizedCycle => ({
    ...cycle,
    decisions: [],
  });
  return {
    buildId: detail.buildId,
    buildName: "Build review",
    currentCycle: normalizeCycle(detail.currentCycle),
    currentCycleNumber: detail.currentCycleNumber,
    cycles: detail.history.page.map(normalizeCycle),
    notice: detail.notice,
    viewerActionState: "read_only",
  };
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

function reviewHistory(detail: NormalizedDetail) {
  const cycles = new Map<number, NormalizedCycle>();
  for (const cycle of [detail.currentCycle, ...detail.cycles]) {
    cycles.set(cycle.cycleNumber, cycle);
  }
  return [...cycles.values()]
    .sort((left, right) => left.cycleNumber - right.cycleNumber)
    .flatMap((cycle) => [
      {
        actor: "Builder team",
        createdAt: cycle.submittedAt,
        id: `cycle-${cycle.cycleNumber}-submitted`,
        title: `Cycle ${cycle.cycleNumber} submitted`,
      },
      ...cycle.decisions.map((decision) => ({
        actor: decision.group === "backoffice" ? "Back Office" : "Lender",
        createdAt: decision.createdAt,
        id: String(decision.decisionId),
        title:
          decision.decision === "approved"
            ? `Cycle ${cycle.cycleNumber} approved`
            : `Cycle ${cycle.cycleNumber} revision requested`,
      })),
    ]);
}

function ReviewHistoryNavigation({
  canLoadNewer,
  canLoadOlder,
  onLoadNewer,
  onLoadOlder,
}: {
  canLoadNewer: boolean;
  canLoadOlder: boolean;
  onLoadNewer: () => void;
  onLoadOlder: () => void;
}) {
  if (!(canLoadNewer || canLoadOlder)) {
    return null;
  }
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
      <Button
        disabled={!canLoadNewer}
        onClick={onLoadNewer}
        size="sm"
        variant="outline"
      >
        Newer history
      </Button>
      <Button
        disabled={!canLoadOlder}
        onClick={onLoadOlder}
        size="sm"
        variant="outline"
      >
        Older history
      </Button>
    </div>
  );
}

function LenderCollaboration({
  rows,
}: {
  rows: LenderBuildDetailData["collaboration"];
}) {
  return (
    <Frame>
      <FramePanel className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-sm">Participant-visible updates</h2>
          <Badge variant="outline">Read-only</Badge>
        </div>
        {rows.length > 0 ? (
          <ol className="mt-3 divide-y border-y">
            {rows.map((row) => (
              <li className="py-3" key={row.postId}>
                <div className="flex flex-wrap justify-between gap-2 text-xs">
                  <span className="font-medium">{row.sourceLabel}</span>
                  <time
                    className="text-muted-foreground tabular-nums"
                    dateTime={new Date(row.publishedAt).toISOString()}
                  >
                    {new Date(row.publishedAt).toLocaleString("en-CA")}
                  </time>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-pretty break-words text-sm leading-6">
                  {row.body}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-muted-foreground text-sm">
            No participant-visible updates are linked to this review.
          </p>
        )}
      </FramePanel>
    </Frame>
  );
}

function LenderDrawActionItems({
  rows,
}: {
  rows: LenderBuildDetailData["draws"][number]["actionItems"];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No Action Items are linked to this Draw System Post.
      </p>
    );
  }
  return (
    <ol className="divide-y border-y">
      {rows.map((row) => (
        <li
          className="flex min-h-12 items-center justify-between gap-3 py-2"
          key={row.actionItemId}
        >
          <span className="min-w-0 truncate font-medium text-sm">
            {row.title}
          </span>
          <Badge className="shrink-0" variant="outline">
            {statusLabel(row.status)}
          </Badge>
        </li>
      ))}
    </ol>
  );
}

function MilestoneReviewPolicyFacts({ cycle }: { cycle: NormalizedCycle }) {
  const approvals = cycle.decisions.filter(
    (decision) =>
      decision.decision === "approved" && decision.countsTowardCurrentApproval
  );
  return (
    <Frame>
      <FramePanel className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium text-sm">Milestone review policy</p>
            <p className="mt-1 text-muted-foreground text-xs">
              Exact requirements and decisions for cycle {cycle.cycleNumber}.
            </p>
          </div>
          <Badge variant="outline">{statusLabel(cycle.state)}</Badge>
        </div>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <ReviewPolicyFact
            label="Approval mode"
            value={statusLabel(cycle.requirements.approvalMode)}
          />
          <ReviewPolicyFact
            label="Required groups"
            value={cycle.requirements.requiredGroups
              .map((group) =>
                group === "backoffice" ? "Back Office" : "Lender"
              )
              .join(" + ")}
          />
          <ReviewPolicyFact
            label="Lender quorum"
            value={String(cycle.requirements.lenderQuorum ?? 1)}
          />
          <ReviewPolicyFact
            label="Site Visit"
            value={
              cycle.requirements.siteVisitRequired ? "Required" : "Not required"
            }
          />
          <ReviewPolicyFact
            label="Receipts / invoices"
            value={
              cycle.requirements.receiptInvoiceRequired
                ? "Required"
                : "Not required"
            }
          />
        </dl>
        <div>
          <p className="text-muted-foreground text-xs">Approval progress</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {cycle.requirements.requiredGroups.map((group) => {
              const satisfied = reviewGroupSatisfied(
                group,
                approvals,
                cycle.requirements.lenderQuorum
              );
              return (
                <Badge key={group} variant={satisfied ? "success" : "outline"}>
                  {group === "backoffice" ? "Back Office" : "Lender"}:{" "}
                  {satisfied ? "Satisfied" : "Pending"}
                </Badge>
              );
            })}
          </div>
        </div>
        {cycle.decisions.length > 0 ? (
          <ol className="divide-y border-y">
            {cycle.decisions.map((decision) => (
              <li
                className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm"
                key={decision.decisionId}
              >
                <span>
                  {decision.group === "backoffice" ? "Back Office" : "Lender"}
                  {" · "}
                  {decision.decision === "approved"
                    ? "Approved"
                    : "Revision requested"}
                </span>
                <time
                  className="shrink-0 text-muted-foreground text-xs tabular-nums"
                  dateTime={new Date(decision.createdAt).toISOString()}
                >
                  {new Date(decision.createdAt).toLocaleString("en-CA")}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground text-sm">
            No decisions have been recorded for this cycle.
          </p>
        )}
      </FramePanel>
    </Frame>
  );
}

function ReviewPolicyFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function toLenderMilestoneSiteVisits(
  detail: LenderBuildDetailData,
  milestone: LenderBuildDetailData["milestones"][number]
): BrokerageSiteVisitsResult {
  const visits = milestone.siteVisits.map((visit) => ({
    buildDisplayId: String(detail.build.buildId),
    buildHref: `/lender/builds/${String(detail.build.buildId)}`,
    buildId: detail.build.buildId,
    buildName: detail.build.buildName,
    builderName: detail.builder.displayName,
    completedAt: visit.completedAt,
    geofenceFlagged: milestone.reviewEvidence.some(
      (asset) =>
        asset.siteVisitId === visit.siteVisitId && !asset.locationVerified
    ),
    location: detail.build.location,
    milestoneKey: milestone.key,
    milestoneName: milestone.name,
    ...(milestone.reviewState
      ? { milestoneReviewStatus: milestone.reviewState }
      : {}),
    operationalStatus: "complete" as const,
    recordNote: visit.report,
    recordNoteFormat: "plain_text" as const,
    requestedAt: visit.requestedAt,
    requestedDay: visit.requestedDay,
    scheduledDateLabel: `Day ${visit.requestedDay}`,
    tokenExpiresAt: visit.tokenExpiresAt,
    tokenMsRemaining: 0,
    ...(visit.tokenOpenedAt === null
      ? {}
      : { tokenOpenedAt: visit.tokenOpenedAt }),
    tokenState: "consumed" as const,
    updatedAt: visit.updatedAt,
    // Field-token URLs are not lender review facts. The shared sheet hides
    // its copy control when this redacted projection is supplied.
    url: "",
    visitId: visit.visitId,
  }));
  return {
    builds: [
      {
        activeVisitCount: 0,
        buildDisplayId: String(detail.build.buildId),
        buildId: detail.build.buildId,
        buildName: detail.build.buildName,
        builderName: detail.builder.displayName,
        href: `/lender/builds/${String(detail.build.buildId)}`,
        location: detail.build.location,
        visits,
      },
    ],
    summary: {
      cancelled: 0,
      complete: visits.length,
      expiringWithin15Min: 0,
      expired: 0,
      geofenceFlagged: visits.filter((visit) => visit.geofenceFlagged).length,
      inField: 0,
      open: 0,
      total: visits.length,
    },
    visits,
  };
}

function statusLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    style: "currency",
  }).format(cents / 100);
}

interface ReviewEvidence {
  files: Array<{
    downloadUrl: string | null;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}

function ReviewEvidencePanel({
  evidence,
}: {
  evidence: ReviewEvidence | undefined;
}) {
  if (evidence === undefined) {
    return (
      <Frame>
        <FramePanel
          aria-live="polite"
          className="flex items-center gap-3 p-4 text-muted-foreground text-sm"
          role="status"
        >
          <Loader2
            aria-hidden="true"
            className="size-4 animate-spin motion-reduce:animate-none"
          />
          Loading current-cycle evidence…
        </FramePanel>
      </Frame>
    );
  }

  return (
    <Frame>
      <FramePanel className="space-y-3 p-4">
        <div>
          <p className="font-medium text-sm">Current-cycle evidence</p>
          <p className="text-pretty text-muted-foreground text-xs">
            Files authorized for this exact review cycle.
          </p>
        </div>
        {evidence.files.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No files are attached to this review cycle.
          </p>
        ) : (
          <ul className="divide-y border-y">
            {evidence.files.map((file) => (
              <li
                className="flex min-h-12 items-center justify-between gap-3 py-2"
                key={`${file.downloadUrl ?? "unavailable"}-${file.fileName}-${file.sizeBytes}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FileText
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-sm">
                      {file.fileName}
                    </span>
                    <span className="block text-muted-foreground text-xs tabular-nums">
                      {formatFileSize(file.sizeBytes)}
                    </span>
                  </span>
                </span>
                {file.downloadUrl ? (
                  <Button
                    aria-label={`Open ${file.fileName}`}
                    render={
                      <a
                        href={file.downloadUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <span className="sr-only">Open {file.fileName}</span>
                      </a>
                    }
                    size="icon"
                    variant="ghost"
                  >
                    <ExternalLink aria-hidden="true" />
                  </Button>
                ) : (
                  <Badge variant="outline">Unavailable</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </FramePanel>
    </Frame>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function reviewGroupSatisfied(
  group: "backoffice" | "lender",
  approvals: ReviewDecision[],
  lenderQuorum: number | null
) {
  const count = approvals.filter((decision) => decision.group === group).length;
  return group === "lender" ? count >= (lenderQuorum ?? 1) : count > 0;
}

function reviewStateToDrawStatus(state: string) {
  if (state === "completed") {
    return "approved_for_release" as const;
  }
  if (state === "correction_required") {
    return "rejected" as const;
  }
  return "in_review" as const;
}

export function reviewStateToMilestoneStatus(state: string) {
  if (state === "completed") {
    return "complete" as const;
  }
  if (state === "correction_required") {
    return "needs_revision" as const;
  }
  return "in_progress" as const;
}
