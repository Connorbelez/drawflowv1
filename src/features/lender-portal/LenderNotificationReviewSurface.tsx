import { useMutation, useQuery } from "convex/react";
import { Check, Loader2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { MilestoneDetailSheet } from "#/features/backoffice-build-detail/MilestoneDetailSheet.tsx";
import { DrawReviewSheet } from "#/features/draw-workflow/DrawReviewSheet.tsx";
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
  viewerWorkosUserId,
}: {
  onClose: () => void;
  reviewCycleId: string;
  reviewCycleNumber: number;
  target: LenderNotificationReviewTarget;
  viewerWorkosUserId: string;
}) {
  return (
    <NotificationReviewSurface
      audience="lender"
      onClose={onClose}
      reviewCycleId={reviewCycleId}
      reviewCycleNumber={reviewCycleNumber}
      target={target}
      viewerWorkosUserId={viewerWorkosUserId}
    />
  );
}

export function BackofficeNotificationReviewSurface(props: {
  onClose: () => void;
  reviewCycleId: string;
  reviewCycleNumber: number;
  target: LenderNotificationReviewTarget;
  viewerWorkosUserId: string;
  workosOrganizationId: string;
}) {
  return <NotificationReviewSurface audience="backoffice" {...props} />;
}

export function BuilderNotificationReviewSurface(props: {
  onClose: () => void;
  reviewCycleId: string;
  reviewCycleNumber: number;
  target: LenderNotificationReviewTarget;
  viewerWorkosUserId: string;
  workosOrganizationId: string;
}) {
  return <NotificationReviewSurface audience="builder" {...props} />;
}

function NotificationReviewSurface({
  audience,
  onClose,
  reviewCycleId,
  reviewCycleNumber,
  target,
  viewerWorkosUserId,
  workosOrganizationId,
}: {
  audience: "backoffice" | "builder" | "lender";
  onClose: () => void;
  reviewCycleId: string;
  reviewCycleNumber: number;
  target: LenderNotificationReviewTarget;
  viewerWorkosUserId: string;
  workosOrganizationId?: string;
}) {
  const typedTarget =
    target.kind === "milestone"
      ? {
          kind: "milestone" as const,
          milestoneId: target.milestoneId as Id<"buildMilestones">,
        }
      : {
          drawRequestId: target.drawRequestId as Id<"activeBuildDrawRequests">,
          kind: "draw" as const,
        };
  const detail = useQuery(
    audience === "lender"
      ? (api as any).lender_portal_phase5.getLenderNotificationReviewRequest
      : audience === "backoffice"
        ? (api as any).lender_portal_phase5
            .getBackofficeNotificationReviewRequest
        : (api as any).lender_portal_phase5.getBuilderNotificationReviewRequest,
    {
      historyPaginationOpts: HISTORY_PAGE,
      reviewCycleId: reviewCycleId as Id<"lenderPortalReviewCycles">,
      reviewCycleNumber,
      target: typedTarget,
      ...(audience === "lender" ? {} : { workosOrganizationId }),
    }
  ) as any;
  const decide = useMutation(
    audience === "backoffice"
      ? (api as any).lender_portal_phase5.decideBackofficeReviewRequest
      : (api as any).lender_portal_phase5.decideLenderReviewRequest
  );
  const [pending, setPending] = useState(false);
  const [privateRationale, setPrivateRationale] = useState("");
  const [revisionInstructions, setRevisionInstructions] = useState("");

  const actionState = useMemo(() => {
    if (!detail) {
      return "loading" as const;
    }
    if (
      detail.currentCycle.state !== "in_review" &&
      detail.currentCycle.state !== "partial_approval"
    ) {
      return "closed" as const;
    }
    if (audience === "builder") {
      return "read_only" as const;
    }
    return detail.currentCycle.decisions.some(
      (decision: any) =>
        decision.group === audience &&
        decision.actorWorkosUserId === viewerWorkosUserId
    )
      ? ("acted" as const)
      : ("needs_action" as const);
  }, [audience, detail, viewerWorkosUserId]);

  if (!detail) {
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

  const submitDecision = async (decision: "approved" | "rejected") => {
    if (decision === "rejected" && !revisionInstructions.trim()) {
      toast.error(
        "Add Builder-visible revision instructions before declining."
      );
      return;
    }
    setPending(true);
    try {
      await decide({
        decision,
        expectedCycleNumber: detail.currentCycleNumber,
        idempotencyKey: crypto.randomUUID(),
        ...(privateRationale.trim()
          ? { privateRationale: privateRationale.trim() }
          : {}),
        ...(decision === "rejected"
          ? { revisionInstructions: revisionInstructions.trim() }
          : {}),
        target: typedTarget,
        ...(audience === "backoffice" ? { workosOrganizationId } : {}),
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
              onClick={() => void submitDecision("rejected")}
              variant="destructive"
            >
              <X aria-hidden="true" /> Request revision
            </Button>
            <Button
              disabled={pending}
              onClick={() => void submitDecision("approved")}
            >
              <Check aria-hidden="true" /> Approve
            </Button>
          </div>
        </FramePanel>
      </Frame>
    ) : actionState === "read_only" ? (
      <Frame>
        <FramePanel className="space-y-1 p-4">
          <p className="font-medium text-sm">{detail.notice.title}</p>
          <p className="text-muted-foreground text-sm">{detail.notice.body}</p>
        </FramePanel>
      </Frame>
    ) : (
      <Badge variant="outline">
        {actionState === "acted"
          ? "Your decision is recorded"
          : "Review closed"}
      </Badge>
    );

  const submission = detail.currentCycle.submission;
  if (target.kind === "draw" && submission.kind === "draw") {
    const approvals = (detail.currentCycle.decisions ?? []).filter(
      (decision: any) =>
        decision.decision === "approved" && decision.countsTowardCurrentApproval
    );
    return (
      <DrawReviewSheet
        actions={actions}
        amountCents={submission.amountCents}
        buildLabel={detail.buildName ?? "Build review"}
        details={[
          { label: "Decision cycle", value: String(detail.currentCycleNumber) },
          { label: "Request key", value: submission.requestKey },
        ]}
        displayId={submission.displayId}
        drawLabel={submission.label}
        evidence={detail.currentCycle.evidenceReferences.map(
          (reference: any, index: number) => ({
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
        onClose={onClose}
        open
        policyGates={detail.currentCycle.requirements.requiredGroups.map(
          (group: "backoffice" | "lender") => ({
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
    return (
      <MilestoneDetailSheet
        data={{
          column:
            audience === "builder"
              ? "Review status"
              : audience === "backoffice"
                ? "Back Office review"
                : "Lender review",
          contractors: [],
          drawGroupKey: "Pooled availability",
          milestoneKey: submission.milestoneKey,
          name: submission.milestoneName,
          status: reviewStateToMilestoneStatus(detail.currentCycle.state),
          submilestones: [],
          submittedAt: detail.currentCycle.submittedAt,
        }}
        onClose={onClose}
        reviewLayer={actions}
      />
    );
  }

  throw new Error("The review notification target does not match its cycle.");
}

function reviewGroupSatisfied(
  group: "backoffice" | "lender",
  approvals: any[],
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
  return state === "completed"
    ? ("complete" as const)
    : ("in_progress" as const);
}
