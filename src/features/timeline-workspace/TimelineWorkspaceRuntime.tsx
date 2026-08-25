import {
  AlertTriangle,
  CircleDollarSign,
  ExternalLink,
  Loader2,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { motion } from "motion/react";
import {
  lazy,
  Suspense,
} from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "#/components/ui/alert.tsx";
import { Switch } from "#/components/ui/switch.tsx";
import { TimelineCashflowToolbar } from "./TimelineCashflowToolbar.tsx";
import {
  INITIAL_ITEMS,
  money,
  routeSectionVariants,
} from "./TimelineWorkspaceDefaults.ts";
import { DEFAULT_DRAW_REVIEW_LAG_DAYS } from "./-timeline-milestone-schedule.ts";
import { formatTimelineDay } from "./TimelineWorkspaceDrawUtils.ts";
import { formatCashShortfallMessage } from "./TimelineWorkspaceChartMath.ts";
import { cn } from "#/lib/utils.ts";
import {
  ShareStatusBadges,
  TimelineDemoSettingsNotice,
  TimelineRemoteCursors,
} from "./TimelineWorkspaceSharing.tsx";
import { ShareTimelineMenu } from "./TimelineWorkspaceShareMenu.tsx";
import { TimelineRoleSwitcher } from "./TimelineWorkspaceDrawPanels.tsx";
import { TimelineWorkspaceGrid } from "./TimelineWorkspaceGrid.tsx";
import { useTimelineWorkspaceContext } from "./TimelineWorkspaceContext.tsx";

const TimelineSetupFlow = lazy(() =>
  import("./-TimelineSetupFlow.tsx").then((m) => ({
    default: m.TimelineSetupFlow,
  }))
);

export function TimelineWorkspaceRuntime() {
  const {
    allowRoleSwitching,
    approveAndCloseFromLenderDemo,
    canWriteLiveTimeline,
    canEditPlanStructure,
    cashflowDrawPosition,
    cashShortfalls,
    collaboration,
    completeTimelineSetup,
    durableMeta,
    durableSavePendingCount,
    durableSaveReference,
    durableSaveStatus,
    embedded,
    endingAvailability,
    endingCashOnHand,
    headerActions,
    hasLockedBannerActions,
    lenderApprovalPending,
    lenderLiveBuildHref,
    liveBuildMode,
    lockedBannerActions,
    optimizeCurrentScenario,
    planStatus,
    prefersReducedMotion,
    probeCashOnHand,
    probeInterestPaid,
    probeValue,
    proposalMode,
    readOnly,
    resetCurrentTimeline,
    retryDurableMutation,
    setSetupComplete,
    setStraightLine,
    setSubmitConfirmOpen,
    setSubmitError,
    setTimelineRole,
    share,
    shareMenuProps,
    sharedSnapshotLoading,
    sharedSnapshotMissing,
    settingsFallbackActive,
    setupComplete,
    setupTemplates,
    showLenderApproveCta,
    showLenderLiveBuildLink,
    showWorkspaceHeader,
    straightLine,
    submitConfirmOpen,
    submitCurrentPlan,
    submitError,
    submitPending,
    timelineRole,
    workspaceMode,
    drawAvailabilityViolation,
    cashUseSummary,
  } = useTimelineWorkspaceContext();
  if (!(share || setupComplete)) {
    return (
      <>
        {settingsFallbackActive ? <TimelineDemoSettingsNotice /> : null}
        <Suspense
          fallback={
            <div className="grid min-h-[24rem] place-items-center p-6 text-muted-foreground text-sm">
              Loading setup…
            </div>
          }
        >
          <TimelineSetupFlow
            baseItems={INITIAL_ITEMS}
            onComplete={completeTimelineSetup}
            settingsTemplates={setupTemplates}
          />
        </Suspense>
      </>
    );
  }

  const WorkspaceRoot = embedded ? "section" : "main";

  return (
    <WorkspaceRoot
      aria-label={embedded ? "Proposal timeline preview" : undefined}
      className={cn(
        "min-w-0",
        embedded
          ? "bg-transparent px-0 py-0"
          : "min-h-svh bg-[radial-gradient(circle_at_top_left,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_34%),linear-gradient(180deg,var(--background),var(--bg-base))]",
        !embedded &&
          (workspaceMode === "live" ? "px-0 py-0" : "px-0 py-0 sm:px-2 sm:py-1")
      )}
    >
      <motion.div
        animate="show"
        className={cn(
          "relative flex flex-col gap-1 sm:gap-6",
          embedded ? "w-full min-w-0" : "mx-auto max-w-full"
        )}
        data-testid="timeline-workspace-root"
        initial={prefersReducedMotion ? false : "hidden"}
        variants={{
          hidden: {},
          show: {
            transition: {
              delayChildren: 0.04,
              staggerChildren: 0.08,
            },
          },
        }}
      >
        <TimelineRemoteCursors cursors={collaboration?.cursors ?? []} />
        {settingsFallbackActive ? <TimelineDemoSettingsNotice /> : null}
        {durableMeta && readOnly ? (
          <div
            aria-label={`Timeline proposal is locked in ${planStatus} status`}
            className="rounded-lg border border-amber-300/60 bg-amber-100/80 p-2 text-amber-950 shadow-sm sm:p-4 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-50"
            data-ixc-ref={
              planStatus === "approved"
                ? "UI-APPROVED-BANNER"
                : planStatus === "archived"
                  ? "UI-ARCHIVED-BANNER"
                  : "UI-SUBMITTED-BANNER"
            }
            data-testid="timeline-locked-banner"
            role="status"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="font-semibold">
                  {planStatus === "archived"
                    ? "Proposal archived"
                    : proposalMode &&
                        planStatus === "submitted" &&
                        hasLockedBannerActions
                      ? "Lender review decision"
                      : proposalMode && planStatus === "approved"
                        ? "Proposal approved"
                        : proposalMode && planStatus === "closed"
                          ? "Proposal moved to live build"
                          : "Submitted for lender review"}
                </p>
                <p className="mt-1 text-sm">
                  {proposalMode && planStatus === "approved"
                    ? "This reimbursement draw plan is approved and remains read-only until closing creates the active build."
                    : proposalMode && planStatus === "closed"
                      ? "Live execution now belongs to the active build workspace."
                      : proposalMode &&
                          planStatus === "submitted" &&
                          hasLockedBannerActions
                        ? "Review the reimbursement draw packet, record the audit reason, then approve, reject, or request changes."
                        : "This reimbursement draw plan is read-only while lender-admin review controls live in backoffice."}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-end">
                {lockedBannerActions}
                <Badge className="w-fit" variant="outline">
                  {planStatus}
                </Badge>
              </div>
            </div>
          </div>
        ) : null}
        {drawAvailabilityViolation ? (
          <Alert
            data-testid="timeline-draw-availability-warning"
            variant="warning"
          >
            <AlertTriangle aria-hidden />
            <AlertTitle>
              Generated draw schedule exceeds maximum availability
            </AlertTitle>
            <AlertDescription>
              {drawAvailabilityViolation.draw.label} schedules{" "}
              {money(drawAvailabilityViolation.draw.amount)} on day{" "}
              {drawAvailabilityViolation.draw.x}, but only{" "}
              {money(drawAvailabilityViolation.limit.availableLimit)} is
              unlocked after the {DEFAULT_DRAW_REVIEW_LAG_DAYS}-day review lag.
              Reduce or move this draw by{" "}
              {money(
                drawAvailabilityViolation.draw.amount -
                  drawAvailabilityViolation.limit.availableLimit
              )}
              .
            </AlertDescription>
          </Alert>
        ) : null}
        {showWorkspaceHeader ? (
          <motion.section
            className="timeline-route-header"
            variants={routeSectionVariants}
          >
            <div className="timeline-route-header__meta max-w-3xl">
              <div className="mb-1 flex items-center gap-2 overflow-x-auto pb-0.5 sm:mb-3 sm:flex-wrap sm:overflow-visible sm:pb-0">
                <Badge variant="success">
                  {liveBuildMode
                    ? "Live build"
                    : proposalMode
                      ? "Proposal mode"
                      : "Capital schedule"}
                </Badge>
                {durableMeta ? (
                  <>
                    <Badge
                      data-ixc-ref="UI-PROPOSAL-SHORT-LINK"
                      variant="outline"
                    >
                      ?proposal={durableMeta.proposalSlug}
                    </Badge>
                    <Badge variant="secondary">{durableMeta.status}</Badge>
                    <Badge
                      data-testid="timeline-durable-save-status"
                      variant={
                        durableSaveStatus === "error"
                          ? "destructive"
                          : durableSavePendingCount > 0
                            ? "warning"
                            : "outline"
                      }
                    >
                      {durableSavePendingCount > 0
                        ? "Saving"
                        : durableSaveStatus === "error"
                          ? "Unsaved changes"
                          : durableSaveStatus === "saved"
                            ? "Saved"
                            : "Ready"}
                    </Badge>
                    {durableSaveStatus === "error" ? (
                      <>
                        <Button
                          onClick={retryDurableMutation}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Retry save
                        </Button>
                        <span
                          aria-live="polite"
                          className="text-muted-foreground text-xs"
                          data-testid="timeline-durable-save-reference"
                        >
                          Changes remain local
                          {durableSaveReference
                            ? `. Reference ${durableSaveReference}.`
                            : "."}
                        </span>
                      </>
                    ) : null}
                  </>
                ) : null}
                <ShareStatusBadges
                  loading={sharedSnapshotLoading}
                  missing={sharedSnapshotMissing}
                  share={share}
                />
              </div>
            </div>
            <div className="timeline-route-header__actions">
              {headerActions}
              {collaboration?.toolbar}
              {allowRoleSwitching ? (
                <TimelineRoleSwitcher
                  onRoleChange={setTimelineRole}
                  role={timelineRole}
                />
              ) : null}
              {showLenderApproveCta ? (
                <Button
                  data-testid="timeline-lender-approve-close"
                  disabled={lenderApprovalPending}
                  onClick={() => void approveAndCloseFromLenderDemo()}
                  size="sm"
                >
                  {lenderApprovalPending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <ShieldCheck />
                  )}
                  Approve proposal and close deal
                </Button>
              ) : null}
              {showLenderLiveBuildLink && lenderLiveBuildHref ? (
                <Button
                  data-testid="timeline-lender-live-build-link"
                  render={<a href={lenderLiveBuildHref} />}
                  size="sm"
                  variant="secondary"
                >
                  <ExternalLink />
                  Open live build
                </Button>
              ) : null}
              {durableMeta ? (
                <>
                  {planStatus === "draft" ? (
                    <Button
                      data-ixc-ref="UI-SUBMIT-CTA"
                      data-testid="timeline-submit-proposal"
                      disabled={readOnly}
                      onClick={() => {
                        setSubmitError("");
                        setSubmitConfirmOpen(true);
                      }}
                      size="sm"
                    >
                      <ShieldCheck />
                      Submit Proposal
                    </Button>
                  ) : liveBuildMode ? (
                    <Button
                      aria-disabled="true"
                      disabled
                      size="sm"
                      variant="outline"
                    >
                      Active build
                    </Button>
                  ) : proposalMode && planStatus === "approved" ? (
                    <Button
                      aria-disabled="true"
                      disabled
                      size="sm"
                      variant="outline"
                    >
                      Approved proposal
                    </Button>
                  ) : proposalMode && planStatus === "closed" ? (
                    <Button
                      aria-disabled="true"
                      disabled
                      size="sm"
                      variant="outline"
                    >
                      Closed proposal
                    </Button>
                  ) : (
                    <Button
                      aria-disabled="true"
                      data-ixc-ref="UI-LOCKED-SUBMIT"
                      disabled
                      size="sm"
                      variant="outline"
                    >
                      Submitted
                    </Button>
                  )}
                  <Button
                    render={<a href={durableMeta.backofficeHref} />}
                    size="sm"
                    variant="outline"
                  >
                    <ExternalLink />
                    Backoffice
                  </Button>
                  <Button
                    data-ixc-ref="UI-PROPOSAL-SHORT-LINK"
                    render={<a href={durableMeta.proposalHref} />}
                    size="sm"
                  >
                    {liveBuildMode
                      ? "Build timeline link"
                      : proposalMode
                        ? "Builder proposal link"
                        : "Live proposal link"}
                  </Button>
                </>
              ) : null}
              <Button
                aria-disabled={!(canWriteLiveTimeline && !liveBuildMode)}
                data-testid="timeline-optimize-scenario"
                disabled={!(canWriteLiveTimeline && !liveBuildMode)}
                onClick={() => optimizeCurrentScenario()}
                size="sm"
                variant="secondary"
              >
                <Sparkles />
                Optimize scenario
              </Button>
              <Button
                aria-disabled={!(canWriteLiveTimeline && !liveBuildMode)}
                data-testid="timeline-optimize-three-draw"
                disabled={!(canWriteLiveTimeline && !liveBuildMode)}
                onClick={() => optimizeCurrentScenario(3)}
                size="sm"
                variant="secondary"
              >
                <CircleDollarSign />
                3-draw
              </Button>
              <ShareTimelineMenu {...shareMenuProps} />
              {share || durableMeta ? null : (
                <Button
                  data-testid="timeline-reconfigure-plan"
                  onClick={() => setSetupComplete(false)}
                  size="sm"
                  variant="outline"
                >
                  <ReceiptText />
                  Reconfigure budget
                </Button>
              )}
              <Button
                aria-disabled={!canEditPlanStructure}
                disabled={!canEditPlanStructure}
                onClick={resetCurrentTimeline}
                size="sm"
                variant="outline"
              >
                <RotateCcw />
                Reset
              </Button>
              <div className="flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm shadow-xs">
                <Switch
                  checked={straightLine}
                  disabled={readOnly}
                  onCheckedChange={setStraightLine}
                />
                Straight line
              </div>
              <TimelineCashflowToolbar
                metrics={[
                  {
                    label: "Probe",
                    testId: "timeline-cashflow-probe-day",
                    value:
                      probeValue === null
                        ? "Hover chart"
                        : `Day ${Math.round(probeValue)}`,
                  },
                  {
                    label: "Cash",
                    testId: "timeline-cashflow-probe-cash",
                    value:
                      probeCashOnHand === null ? "-" : money(probeCashOnHand),
                  },
                  {
                    label: "Interest paid",
                    testId: "timeline-cashflow-probe-interest-paid",
                    tone: "interest",
                    value:
                      probeInterestPaid === null
                        ? "-"
                        : money(probeInterestPaid),
                  },
                  {
                    label: "Ending cash",
                    testId: "timeline-cashflow-ending-cash",
                    value: money(endingCashOnHand),
                  },
                  {
                    label: "Total unlocked",
                    testId: "timeline-cashflow-total-unlocked",
                    tone: "info",
                    value: money(cashflowDrawPosition.totalUnlocked),
                  },
                  {
                    label: "Total drawn",
                    testId: "timeline-cashflow-total-drawn",
                    tone: "info",
                    value: money(cashflowDrawPosition.totalDrawn),
                  },
                  {
                    label: "Available",
                    testId: "timeline-cashflow-available-to-draw",
                    tone: "positive",
                    value: money(cashflowDrawPosition.availableToDraw),
                  },
                  {
                    label: "Lender cash",
                    testId: "timeline-cashflow-lender-cash-used",
                    tone: "info",
                    value: money(cashUseSummary.lenderCashUsed),
                  },
                  {
                    label: "Builder cash",
                    testId: "timeline-cashflow-builder-cash-used",
                    tone: "positive",
                    value: money(cashUseSummary.builderCashUsed),
                  },
                  {
                    label: "Construction interest",
                    testId: "timeline-cashflow-construction-interest",
                    tone: "interest",
                    value: money(
                      Number(
                        endingAvailability.constructionInterestAccrued ??
                          endingAvailability.totalInterestAccrued
                      )
                    ),
                  },
                  {
                    label: "Home equity interest",
                    testId: "timeline-cashflow-home-equity-interest",
                    tone: "interest",
                    value: money(
                      Number(endingAvailability.homeEquityInterestAccrued ?? 0)
                    ),
                  },
                  {
                    label: "Total interest",
                    testId: "timeline-cashflow-total-interest-paid",
                    tone: "interest",
                    value: money(endingAvailability.totalInterestAccrued),
                  },
                ]}
                warnings={cashShortfalls.map((point) => ({
                  dayLabel: formatTimelineDay(point.day),
                  id: `${point.day}-${point.milestone}`,
                  message: formatCashShortfallMessage(point),
                }))}
              />
            </div>
          </motion.section>
        ) : null}

        {submitConfirmOpen ? (
          <div
            aria-modal="true"
            className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-sm"
            data-ixc-ref="SCREEN-SUBMIT-MODAL"
            data-testid="timeline-submit-confirm-modal"
            role="dialog"
          >
            <div className="w-full max-w-lg rounded-lg border bg-background p-5 shadow-xl">
              <div className="flex items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-lg">
                    Submit proposal to lender review?
                  </h2>
                  <p className="mt-1 text-muted-foreground text-sm">
                    Submission freezes a review snapshot and locks builder edits
                    while lender staff review the reimbursement plan.
                  </p>
                </div>
              </div>
              {submitError ? (
                <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm">
                  {submitError}
                </p>
              ) : null}
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  data-ixc-ref="UI-SUBMIT-CANCEL"
                  disabled={submitPending}
                  onClick={() => setSubmitConfirmOpen(false)}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  data-ixc-ref="UI-SUBMIT-CONFIRM"
                  data-testid="timeline-submit-confirm"
                  disabled={submitPending}
                  onClick={() => void submitCurrentPlan()}
                >
                  {submitPending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <ShieldCheck />
                  )}
                  Submit to lender
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <TimelineWorkspaceGrid />
      </motion.div>
    </WorkspaceRoot>
  );
}
