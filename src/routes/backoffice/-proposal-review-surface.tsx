import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { AnimatedCurvedTimeline } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import {
  MilestoneCard,
  type MilestoneCardUpdate,
} from "#/features/timeline-workspace/-MilestoneCard.tsx";
import { TimelineCashflowCompoundChart } from "#/features/timeline-workspace/-TimelineCashflowCompoundChart.tsx";
import { TimelineDrawAvailabilityChart } from "#/features/timeline-workspace/-TimelineDrawAvailabilityChart.tsx";
import { TimelineEndNodeButton } from "#/features/timeline-workspace/-TimelineEndNodeButton.tsx";
import { getMilestoneEndX } from "#/features/timeline-workspace/-timeline-milestone-schedule.ts";
import type { DemoMilestone } from "#/features/timeline-workspace/-timeline-share-snapshot.ts";
import { cn } from "#/lib/utils.ts";
import type {
  ProposalReviewMilestone,
  ProposalReviewSnapshotMilestone,
} from "./-proposal-review-chart-helpers.ts";
import {
  buildProposalMilestoneMutationArgs,
  buildProposalProbeReferenceLines,
  buildProposalTimelineMarkers,
  buildReviewChartData,
  buildTimelineItems,
  centsToDollars,
  formatCents,
  formatCompactMoney,
  getDefaultApprovalStartDateInput,
  validateApprovalStartDate,
} from "./-proposal-review-chart-helpers.ts";

const PROPOSAL_REVIEW_TIMELINE_SIZING = {
  cardWidth: 232,
  minNodeSpacingPx: 198,
  paddingX: 136,
  pixelsPerUnit: 6.4,
} as const;

type TabKey = "adjustments" | "timeline";
type DecisionModal = "approve" | "reject";

export function ProposalReviewSurface({
  approvePlan,
  navigateToBuild,
  planId,
  rejectPlan,
  updateDraw,
  updateMilestone,
  viewModel,
}: {
  approvePlan: (args: {
    adminNote?: string;
    planId: string;
    startDate: number;
  }) => Promise<{ buildKey?: string }>;
  navigateToBuild: (buildKey: string) => void;
  planId: string;
  rejectPlan: (args: {
    adminNote?: string;
    planId: string;
    reason?: string;
  }) => Promise<unknown>;
  updateDraw: (args: {
    amountCents?: number;
    drawKey: string;
    planId: string;
  }) => Promise<unknown>;
  updateMilestone: (args: {
    budgetCents?: number;
    dayEnd?: number;
    dayStart?: number;
    durationDays?: number;
    milestoneKey: string;
    planId: string;
  }) => Promise<unknown>;
  viewModel: any;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [probeValue, setProbeValue] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("timeline");
  const [startDate, setStartDate] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [decisionModal, setDecisionModal] = useState<DecisionModal | null>(
    null
  );
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [terminalBuild, setTerminalBuild] = useState<{
    buildKey?: string;
  } | null>(null);

  const chartData = useMemo(() => buildReviewChartData(viewModel), [viewModel]);
  const timelineItems = useMemo(
    () => buildTimelineItems(viewModel),
    [viewModel]
  );
  const timelineMarkers = useMemo(
    () => buildProposalTimelineMarkers(viewModel),
    [viewModel]
  );
  const startingCash = centsToDollars(viewModel?.plan?.startingCashCents ?? 0);
  const timelineRange = useMemo(
    () => ({ max: chartData.maxDay + 10, min: 0, unit: "days" as const }),
    [chartData.maxDay]
  );
  const xDomain = useMemo(
    () => [timelineRange.min, timelineRange.max] as [number, number],
    [timelineRange.max, timelineRange.min]
  );
  const probeReferenceLines = useMemo(
    () =>
      buildProposalProbeReferenceLines(
        probeValue,
        chartData.cashflow,
        chartData.drawAvailability,
        startingCash
      ),
    [chartData.cashflow, chartData.drawAvailability, probeValue, startingCash]
  );
  const snapshotMilestones = viewModel?.snapshot?.milestones ?? [];
  const workingMilestones = viewModel?.workingCopy?.milestones ?? [];
  const snapshotDraws = viewModel?.snapshot?.draws ?? [];
  const workingDraws = viewModel?.workingCopy?.draws ?? [];
  const plan = viewModel?.plan;
  const canEditTimeline = plan?.status === "submitted";
  const approvalValidation = useMemo(
    () => validateApprovalStartDate(startDate, plan?.status),
    [plan?.status, startDate]
  );
  const canAttemptApproval = plan?.status === "submitted" && !terminalBuild;

  const openApproveModal = useCallback(() => {
    setStartDate(
      (current) => current || getDefaultApprovalStartDateInput(plan)
    );
    setDecisionModal("approve");
  }, [plan]);

  const openRejectModal = useCallback(() => {
    setDecisionModal("reject");
  }, []);

  const tabs = [
    ["timeline", "Timeline"],
    ...(plan?.status === "submitted" ? [["adjustments", "Adjustments"]] : []),
  ] as const;

  const handleMilestoneUpdate = useCallback(
    (milestoneKey: string, patch: MilestoneCardUpdate) => {
      if (!canEditTimeline) {
        return;
      }

      const milestone = workingMilestones.find(
        (row: ProposalReviewMilestone) => row.milestoneKey === milestoneKey
      );
      if (!milestone) {
        return;
      }

      const mutationArgs = buildProposalMilestoneMutationArgs(
        milestone,
        milestoneKey,
        patch,
        planId
      );
      if (!mutationArgs) {
        return;
      }

      void updateMilestone(mutationArgs)
        .then(() => {
          toast.success("Milestone updated.");
        })
        .catch((error) => {
          toast.error(
            error instanceof Error ? error.message : "Milestone update failed."
          );
        });
    },
    [canEditTimeline, planId, updateMilestone, workingMilestones]
  );

  if (viewModel === undefined) {
    return (
      <main className="grid min-h-[calc(100vh-4rem)] place-items-center bg-muted/30">
        <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading proposal review...
        </div>
      </main>
    );
  }

  const approve = async () => {
    if (!canAttemptApproval) {
      toast.error("This proposal is no longer awaiting approval.");
      return;
    }

    if (!approvalValidation.ok) {
      toast.error(approvalValidation.message);
      return;
    }

    setIsApproving(true);
    try {
      const result = await approvePlan({
        adminNote: adminNote || undefined,
        planId,
        startDate: approvalValidation.parsed,
      });
      setTerminalBuild({ buildKey: result.buildKey });
      setDecisionModal(null);
      toast.success("Proposal approved and promoted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approval failed.");
    } finally {
      setIsApproving(false);
    }
  };

  const reject = async () => {
    setIsRejecting(true);
    try {
      await rejectPlan({
        adminNote: adminNote || undefined,
        planId,
        reason: rejectReason || undefined,
      });
      setDecisionModal(null);
      toast.success("Proposal archived.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Archive failed.");
    } finally {
      setIsRejecting(false);
    }
  };

  const terminal = terminalBuild || plan?.status !== "submitted";

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-muted/30 p-4">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <Frame>
          <FramePanel className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Proposal review · {plan?.ownerPersona ?? "builder"}
              </p>
              <h1 className="font-semibold text-2xl tracking-tight">
                {plan?.buildName ?? "Timeline proposal"}
              </h1>
              <p className="mt-1 text-muted-foreground text-sm">
                Frozen snapshot compared with lender working copy.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {terminalBuild?.buildKey ? (
                <Button
                  onClick={() => navigateToBuild(terminalBuild.buildKey ?? "")}
                >
                  <ExternalLink />
                  Open active build
                </Button>
              ) : null}
              <Button
                data-ixc-ref="UI-REJECT-BUTTON"
                disabled={Boolean(terminal)}
                onClick={openRejectModal}
                variant="destructive"
              >
                <XCircle />
                Reject / Archive
              </Button>
              <Button
                data-ixc-ref="UI-APPROVE-BUTTON"
                disabled={!canAttemptApproval}
                onClick={openApproveModal}
              >
                <CheckCircle2 />
                Approve
              </Button>
            </div>
          </FramePanel>
        </Frame>

        <Card>
          <CardHeader className="border-b p-4">
            <div
              aria-label="Proposal review sections"
              className="flex flex-wrap gap-2"
              data-ixc-ref="UI-REVIEW-TABS"
              data-testid="proposal-review-tabs"
              role="tablist"
            >
              {tabs.map(([key, label]) => (
                <Button
                  aria-selected={activeTab === key}
                  data-ixc-ref={`UI-REVIEW-TAB-${label.toUpperCase().replaceAll(" ", "-")}`}
                  key={key}
                  onClick={() => setActiveTab(key as TabKey)}
                  role="tab"
                  variant={activeTab === key ? "secondary" : "ghost"}
                >
                  {label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-4" role="tabpanel">
            {activeTab === "timeline" ? (
              <div
                className="flex min-w-0 flex-col gap-8"
                data-testid="proposal-review-timeline-stack"
              >
                <section
                  aria-label="Cashflow"
                  className="min-w-0"
                  data-testid="proposal-review-cashflow-section"
                >
                  <TimelineCashflowCompoundChart
                    data={chartData.cashflow}
                    onProbeChange={setProbeValue}
                    referenceLines={probeReferenceLines.cashflow}
                    xDomain={xDomain}
                    xTicks={chartData.ticks}
                    yDomain={[0, chartData.maxValue]}
                  />
                </section>
                <section
                  aria-label="Construction timeline"
                  className="relative z-30 min-w-0 overflow-visible"
                  data-testid="proposal-review-timeline-section"
                >
                  <AnimatedCurvedTimeline<DemoMilestone>
                    cardWidth={PROPOSAL_REVIEW_TIMELINE_SIZING.cardWidth}
                    className="min-w-0"
                    endCardWidth={276}
                    formatValue={(value) => `Day ${Math.round(value)}`}
                    getItemEndValue={(item) =>
                      workingMilestones.find(
                        (row: ProposalReviewMilestone) =>
                          row.milestoneKey === item.id
                      )?.dayEnd ?? getMilestoneEndX(item)
                    }
                    hoverValue={probeValue}
                    items={timelineItems}
                    markerStackProximityPx={88}
                    markers={timelineMarkers}
                    minNodeSpacingPx={
                      PROPOSAL_REVIEW_TIMELINE_SIZING.minNodeSpacingPx
                    }
                    onHoverValueChange={setProbeValue}
                    paddingX={PROPOSAL_REVIEW_TIMELINE_SIZING.paddingX}
                    pixelsPerUnit={
                      PROPOSAL_REVIEW_TIMELINE_SIZING.pixelsPerUnit
                    }
                    range={timelineRange}
                    renderCard={(item, context) => (
                      <MilestoneCard
                        active={context.active}
                        complete={false}
                        item={item}
                        onUpdate={handleMilestoneUpdate}
                        readOnly={!canEditTimeline}
                        reducedMotion={Boolean(prefersReducedMotion)}
                      />
                    )}
                    renderEndNode={(item, context) => (
                      <TimelineEndNodeButton
                        active={context.active}
                        complete={false}
                        item={item}
                        onClick={() => context.activate()}
                        reducedMotion={Boolean(prefersReducedMotion)}
                        testIdPrefix="proposal-review-timeline"
                      />
                    )}
                    straightLine
                  />
                </section>
                <section
                  aria-label="Draw availability"
                  className="min-w-0"
                  data-testid="proposal-review-draw-availability-section"
                >
                  <TimelineDrawAvailabilityChart
                    data={chartData.drawAvailability}
                    formatMoney={formatCompactMoney}
                    formatTimelineDay={(value) => `Day ${Math.round(value)}`}
                    onProbeChange={setProbeValue}
                    referenceLines={probeReferenceLines.drawAvailability}
                    xDomain={xDomain}
                    xTicks={chartData.ticks}
                    yDomain={[0, chartData.maxValue]}
                  />
                </section>
              </div>
            ) : null}
            {activeTab === "adjustments" ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <MilestoneAdjustmentsTable
                  milestones={workingMilestones}
                  onCommit={(milestoneKey, patch) => {
                    const milestone = workingMilestones.find(
                      (row: ProposalReviewMilestone) =>
                        row.milestoneKey === milestoneKey
                    );
                    if (!milestone) {
                      return;
                    }

                    const mutationArgs = buildProposalMilestoneMutationArgs(
                      milestone,
                      milestoneKey,
                      patch,
                      planId
                    );
                    if (!mutationArgs) {
                      return;
                    }

                    void updateMilestone(mutationArgs)
                      .then(() => {
                        toast.success("Milestone updated.");
                      })
                      .catch((error) => {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Milestone update failed."
                        );
                      });
                  }}
                  snapshotMilestones={snapshotMilestones}
                />
                <ComparisonTable
                  label="Draws"
                  rows={workingDraws.map((draw: any) => {
                    const frozen = snapshotDraws.find(
                      (row: any) => row.sourceTimelineDrawId === draw._id
                    );
                    return {
                      id: draw.drawKey,
                      name: draw.label,
                      snapshot: frozen?.amountCents,
                      working: draw.amountCents,
                      onCommit: (value: number) =>
                        updateDraw({
                          amountCents: value,
                          drawKey: draw.drawKey,
                          planId,
                        }),
                    };
                  })}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <ProposalDecisionDialog
          adminNote={adminNote}
          approvalValidation={approvalValidation}
          buildName={plan?.buildName ?? "Timeline proposal"}
          isApproving={isApproving}
          isRejecting={isRejecting}
          modal={decisionModal}
          onAdminNoteChange={setAdminNote}
          onApprove={() => void approve()}
          onOpenChange={(open) => {
            if (!open) {
              setDecisionModal(null);
            }
          }}
          onReject={() => void reject()}
          onRejectReasonChange={setRejectReason}
          onStartDateChange={setStartDate}
          rejectReason={rejectReason}
          startDate={startDate}
        />
      </div>
    </main>
  );
}

function ProposalDecisionDialog({
  adminNote,
  approvalValidation,
  buildName,
  isApproving,
  isRejecting,
  modal,
  onAdminNoteChange,
  onApprove,
  onOpenChange,
  onReject,
  onRejectReasonChange,
  onStartDateChange,
  rejectReason,
  startDate,
}: {
  adminNote: string;
  approvalValidation: ReturnType<typeof validateApprovalStartDate>;
  buildName: string;
  isApproving: boolean;
  isRejecting: boolean;
  modal: DecisionModal | null;
  onAdminNoteChange: (value: string) => void;
  onApprove: () => void;
  onOpenChange: (open: boolean) => void;
  onReject: () => void;
  onRejectReasonChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  rejectReason: string;
  startDate: string;
}) {
  const isApprove = modal === "approve";

  return (
    <Dialog onOpenChange={onOpenChange} open={modal !== null}>
      <DialogContent
        className="sm:max-w-md"
        data-testid={
          isApprove ? "proposal-approve-dialog" : "proposal-reject-dialog"
        }
      >
        <DialogHeader>
          <DialogTitle>
            {isApprove ? "Approve proposal" : "Reject / archive proposal"}
          </DialogTitle>
          <DialogDescription>
            {isApprove
              ? `Promote ${buildName} to an active build. Milestone and draw dates are anchored to the project start date you choose.`
              : `Archive ${buildName} and remove it from the submitted proposals queue.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 px-6 pb-2">
          {isApprove ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="proposal-approval-start-date">
                  Project start date
                </Label>
                <Input
                  data-ixc-ref="UI-START-DATE"
                  id="proposal-approval-start-date"
                  min={getDefaultApprovalStartDateInput({
                    status: "submitted",
                  })}
                  onChange={(event) =>
                    onStartDateChange(event.currentTarget.value)
                  }
                  type="date"
                  value={startDate}
                />
                <p className="text-muted-foreground text-xs">
                  Must be today or later (UTC). Defaults to today.
                </p>
                {!approvalValidation.ok && startDate ? (
                  <p className="text-destructive text-xs" role="alert">
                    {approvalValidation.message}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="proposal-approval-admin-note">
                  Admin note{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <Textarea
                  data-ixc-ref="UI-ADMIN-NOTE"
                  id="proposal-approval-admin-note"
                  onChange={(event) =>
                    onAdminNoteChange(event.currentTarget.value)
                  }
                  placeholder="Note sent to the builder with approval"
                  rows={3}
                  value={adminNote}
                />
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor="proposal-archive-reason">
                  Archive reason{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <Textarea
                  id="proposal-archive-reason"
                  onChange={(event) =>
                    onRejectReasonChange(event.currentTarget.value)
                  }
                  placeholder="Why this proposal is being archived"
                  rows={3}
                  value={rejectReason}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="proposal-archive-admin-note">
                  Admin note{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <Textarea
                  id="proposal-archive-admin-note"
                  onChange={(event) =>
                    onAdminNoteChange(event.currentTarget.value)
                  }
                  placeholder="Internal note for the builder record"
                  rows={3}
                  value={adminNote}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          {isApprove ? (
            <Button
              data-ixc-ref="UI-APPROVE-CONFIRM"
              data-testid="proposal-approve-confirm"
              disabled={!approvalValidation.ok || isApproving}
              onClick={onApprove}
            >
              {isApproving ? (
                <Loader2 className="animate-spin" />
              ) : (
                <CheckCircle2 />
              )}
              Confirm approval
            </Button>
          ) : (
            <Button
              data-ixc-ref="UI-REJECT-CONFIRM"
              data-testid="proposal-reject-confirm"
              disabled={isRejecting}
              onClick={onReject}
              variant="destructive"
            >
              {isRejecting ? <Loader2 className="animate-spin" /> : <XCircle />}
              Confirm archive
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MilestoneAdjustmentsTable({
  milestones,
  onCommit,
  snapshotMilestones,
}: {
  milestones: ProposalReviewMilestone[];
  onCommit: (milestoneKey: string, patch: MilestoneCardUpdate) => void;
  snapshotMilestones: ProposalReviewSnapshotMilestone[];
}) {
  return (
    <Card className="xl:col-span-2">
      <CardHeader className="border-b p-4">
        <CardTitle className="text-base">Milestones</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Snapshot</TableHead>
              <TableHead>Planned cost</TableHead>
              <TableHead>Start day</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {milestones.map((milestone) => {
              const frozen = snapshotMilestones.find(
                (row) => row.sourceTimelineMilestoneId === milestone._id
              );
              const workingStart = milestone.x ?? milestone.dayStart;
              const snapshotCostDiff =
                frozen !== undefined &&
                frozen.budgetCents !== milestone.budgetCents;
              const snapshotStartDiff =
                frozen !== undefined && frozen.dayStart !== workingStart;
              const snapshotDurationDiff =
                frozen !== undefined &&
                frozen.durationDays !== milestone.durationDays;
              const hasDiff =
                snapshotCostDiff || snapshotStartDiff || snapshotDurationDiff;

              return (
                <TableRow
                  data-testid={`proposal-milestone-adjustment-${milestone.milestoneKey}`}
                  key={milestone.milestoneKey}
                >
                  <TableCell className="min-w-40 font-medium">
                    <div className="flex items-center gap-2">
                      <span>{milestone.name}</span>
                      {hasDiff ? (
                        <Badge
                          className="shrink-0"
                          data-ixc-ref="UI-DIFF-PILL"
                          variant="warning"
                        >
                          diff
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-44 text-muted-foreground text-sm">
                    {frozen ? (
                      <div className="grid gap-0.5">
                        <span>{formatCents(frozen.budgetCents)}</span>
                        <span>Day {frozen.dayStart}</span>
                        <span>{frozen.durationDays} days</span>
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <AdjustmentNumberInput
                      ariaLabel={`Edit ${milestone.name} planned cost`}
                      diff={snapshotCostDiff}
                      onCommit={(value) =>
                        onCommit(milestone.milestoneKey, { amount: value })
                      }
                      testId={`proposal-adjust-cost-${milestone.milestoneKey}`}
                      value={Math.round(milestone.budgetCents / 100)}
                    />
                  </TableCell>
                  <TableCell>
                    <AdjustmentNumberInput
                      ariaLabel={`Edit ${milestone.name} start day`}
                      diff={snapshotStartDiff}
                      min={0}
                      onCommit={(value) =>
                        onCommit(milestone.milestoneKey, { x: value })
                      }
                      prefix="Day "
                      testId={`proposal-adjust-start-${milestone.milestoneKey}`}
                      value={workingStart}
                    />
                  </TableCell>
                  <TableCell>
                    <AdjustmentNumberInput
                      ariaLabel={`Edit ${milestone.name} duration`}
                      diff={snapshotDurationDiff}
                      min={1}
                      onCommit={(value) =>
                        onCommit(milestone.milestoneKey, {
                          durationDays: value,
                        })
                      }
                      suffix=" days"
                      testId={`proposal-adjust-duration-${milestone.milestoneKey}`}
                      value={milestone.durationDays}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AdjustmentNumberInput({
  ariaLabel,
  diff = false,
  min,
  onCommit,
  prefix,
  suffix,
  testId,
  value,
}: {
  ariaLabel: string;
  diff?: boolean;
  min?: number;
  onCommit: (value: number) => void;
  prefix?: string;
  suffix?: string;
  testId: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2">
      {prefix ? (
        <span className="text-muted-foreground text-xs">{prefix}</span>
      ) : null}
      <Input
        aria-label={ariaLabel}
        className="max-w-28"
        data-testid={testId}
        defaultValue={value}
        key={`${testId}-${value}`}
        min={min}
        onBlur={(event) => {
          const nextValue = Math.round(Number(event.currentTarget.value));
          if (!Number.isFinite(nextValue)) {
            return;
          }
          if (min !== undefined && nextValue < min) {
            return;
          }
          if (nextValue !== value) {
            onCommit(nextValue);
          }
        }}
        step={1}
        type="number"
      />
      {suffix ? (
        <span className="text-muted-foreground text-xs">{suffix}</span>
      ) : null}
      {diff ? (
        <Badge
          className="shrink-0"
          data-ixc-ref="UI-DIFF-PILL"
          variant="warning"
        >
          diff
        </Badge>
      ) : null}
    </div>
  );
}

function ComparisonTable({
  label,
  rows,
}: {
  label: string;
  rows: {
    id: string;
    name: string;
    onCommit: (value: number) => Promise<unknown>;
    snapshot?: number;
    working: number;
  }[];
}) {
  return (
    <Card>
      <CardHeader className="border-b p-4">
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Snapshot</TableHead>
              <TableHead>Working copy</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.name}</TableCell>
                <TableCell>{formatCents(row.snapshot ?? 0)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={`Edit ${row.name}`}
                      className="max-w-36"
                      defaultValue={Math.round(row.working / 100)}
                      onBlur={(event) => {
                        const nextValue = Math.round(
                          Number(event.currentTarget.value) * 100
                        );
                        if (Number.isFinite(nextValue)) {
                          void row.onCommit(nextValue);
                        }
                      }}
                      type="number"
                    />
                    {row.snapshot === row.working ? null : (
                      <Badge
                        className={cn("shrink-0")}
                        data-ixc-ref="UI-DIFF-PILL"
                        variant="warning"
                      >
                        diff
                      </Badge>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
