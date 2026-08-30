import { CalendarClock } from "lucide-react";
import { type Dispatch, type ReactNode, type SetStateAction } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import { TabsPanel } from "#/components/ui/tabs.tsx";
import { CalendarWorkspace } from "#/features/calendar-workspace/CalendarWorkspace.tsx";
import type {
  CalendarAction,
  CalendarAssignableParticipant,
  CalendarEditRequest,
  CalendarFilters,
  CalendarReminderEventInput,
  CalendarSyncSubscriptionResult,
  CalendarTimeframe,
  DrawFlowCalendarWorkspaceData,
} from "#/features/calendar-workspace/calendarTypes.ts";
import type { MaterialPlanningActions } from "#/features/material-planning/MaterialPlanningTab.tsx";
import { MaterialPlanningTab } from "#/features/material-planning/MaterialPlanningTab.tsx";
import { ProductionProposalDrawScheduleEditor } from "./ProductionProposalDrawScheduleEditor.tsx";
import { ProductionProposalMilestoneWorksheet } from "./ProductionProposalMilestoneWorksheet.tsx";
import type {
  PacketMilestoneCreatePayload,
  PacketMilestonePatch,
  ProductionDraw,
  ProductionProposal,
  ProductionProposalDetail,
  ProductionReviewTab,
} from "./production-proposal-surface-contracts";
import {
  ProposalDrawAvailabilityWarning,
  ProposalDrawScheduleSnapshot,
  ProposalPlanMetric,
  Section,
  formatCents,
  materialPlanningMilestones,
  productionProposalActionErrorMessage,
} from "./production-proposal-surface-shared";
import { ProposalPacketSnapshot } from "./production-proposal-packet-snapshot.tsx";

type ReviewOverviewRenderer = (input: {
  idPrefix: string;
  includePermitUpload?: boolean;
}) => ReactNode;

export interface ProductionProposalReviewPanelsProps {
  calendarAssignableParticipants: CalendarAssignableParticipant[];
  calendarTimeframe?: CalendarTimeframe;
  canEditDraws: boolean;
  canRecordClosing: boolean;
  closingPending: boolean;
  closingPolicyReady: boolean;
  closingReason: string;
  contractors?: ReactNode;
  detail: ProductionProposalDetail;
  drawAmounts: Record<string, string>;
  drawEditReasonRequired: boolean;
  drawLabels: Record<string, string>;
  drawTimingDays: Record<string, string>;
  editableDraws: ProductionDraw[];
  effectiveCalendarActions: CalendarAction[];
  effectiveCalendarWorkspace: DrawFlowCalendarWorkspaceData;
  fallbackCalendarEdit: (
    request: CalendarEditRequest
  ) => Promise<unknown> | unknown;
  gantt?: ReactNode;
  ianaTimezone: string;
  ianaTimezoneValid: boolean;
  lifecycleActions?: ReactNode;
  materialPlanningActions?: MaterialPlanningActions;
  milestones?: ReactNode;
  normalizedIanaTimezone: string;
  onChangeCalendarTimeframe?: (timeframe: CalendarTimeframe) => void;
  onCommitCalendarEdit?: (
    request: CalendarEditRequest
  ) => Promise<unknown> | unknown;
  onCreateCalendarReminderEvent?: (
    input: CalendarReminderEventInput
  ) => Promise<unknown> | unknown;
  onCreateCalendarSyncSubscription?: (input: {
    direction: "bidirectional" | "outbound";
    filters: CalendarFilters;
    provider: "google" | "ics" | "outlook";
    sourceId: string;
    surface: "activeBuild" | "proposal";
  }) =>
    | Promise<CalendarSyncSubscriptionResult>
    | CalendarSyncSubscriptionResult
    | void;
  onCreatePacketMilestone?: (
    milestone: PacketMilestoneCreatePayload
  ) => Promise<unknown> | unknown;
  onUploadPermitDocument?: (file: File) => Promise<unknown> | unknown;
  onDeleteCalendarReminderEvent?: (input: {
    eventId: string;
    reason?: string;
  }) => Promise<unknown> | unknown;
  onRecordExternalCalendarSyncChange?: (input: {
    changeKey: string;
    externalEventId?: string;
    payload: unknown;
    provider: "google" | "ics" | "outlook";
    subscriptionKey?: string;
  }) => Promise<unknown> | unknown;
  onSaveCalendarView?: (input: {
    filters: CalendarFilters;
    isDefault?: boolean;
    label: string;
    timeframe: CalendarTimeframe;
    viewKey: string;
  }) => Promise<unknown> | unknown;
  onUpdateCalendarReminderEvent?: (
    input: CalendarReminderEventInput & { eventId: string }
  ) => Promise<unknown> | unknown;
  onUpdateDraw?: (
    drawKey: string,
    patch: {
      amountCents: number;
      label: string;
      reason: string;
      timingDay: number;
    }
  ) => Promise<unknown> | unknown;
  onUpdatePacketMilestone?: (
    milestoneKey: string,
    patch: PacketMilestonePatch
  ) => Promise<unknown> | unknown;
  onUpdateProposedStartDate?: (
    proposedStartDate: string
  ) => Promise<unknown> | unknown;
  proposal: ProductionProposal;
  reason: string;
  renderReviewOverview: ReviewOverviewRenderer;
  reviewPolicySurface?: ReactNode;
  reviewReason: string;
  recordClosing: () => Promise<unknown> | unknown;
  setClosingReason: (value: string) => void;
  setDrawAmounts: Dispatch<SetStateAction<Record<string, string>>>;
  setDrawLabels: Dispatch<SetStateAction<Record<string, string>>>;
  setDrawTimingDays: Dispatch<SetStateAction<Record<string, string>>>;
  setIanaTimezone: (value: string) => void;
  setReason: (value: string) => void;
  setStartDate: (value: string) => void;
  staff?: ReactNode;
  startDate: string;
  timeline?: ReactNode;
}

export function ProductionProposalReviewPanels({
  calendarAssignableParticipants,
  calendarTimeframe,
  canEditDraws,
  canRecordClosing,
  closingPending,
  closingPolicyReady,
  closingReason,
  contractors,
  detail,
  drawAmounts,
  drawEditReasonRequired,
  drawLabels,
  drawTimingDays,
  editableDraws,
  effectiveCalendarActions,
  effectiveCalendarWorkspace,
  fallbackCalendarEdit,
  gantt,
  ianaTimezone,
  ianaTimezoneValid,
  lifecycleActions,
  materialPlanningActions,
  milestones,
  normalizedIanaTimezone,
  onChangeCalendarTimeframe,
  onCommitCalendarEdit,
  onCreateCalendarReminderEvent,
  onCreateCalendarSyncSubscription,
  onCreatePacketMilestone,
  onUploadPermitDocument,
  onDeleteCalendarReminderEvent,
  onRecordExternalCalendarSyncChange,
  onSaveCalendarView,
  onUpdateCalendarReminderEvent,
  onUpdateDraw,
  onUpdatePacketMilestone,
  onUpdateProposedStartDate,
  proposal,
  reason,
  renderReviewOverview,
  reviewPolicySurface,
  reviewReason,
  recordClosing,
  setClosingReason,
  setDrawAmounts,
  setDrawLabels,
  setDrawTimingDays,
  setIanaTimezone,
  setReason,
  setStartDate,
  staff,
  startDate,
  timeline,
}: ProductionProposalReviewPanelsProps) {
  const reviewTabPanelClassName = "w-full min-w-0";
  return (
    <div
      className="w-full min-w-0"
      data-testid="production-proposal-review-tab-panels"
    >
      {timeline ? (
        <TabsPanel
          className={reviewTabPanelClassName}
          data-testid="production-proposal-timeline-tab"
          value="timeline"
        >
          <div className="w-full min-w-0 overflow-x-auto">{timeline}</div>
        </TabsPanel>
      ) : null}

      {gantt ? (
        <TabsPanel
          className={reviewTabPanelClassName}
          data-testid="production-proposal-gantt-tab"
          value="gantt"
        >
          <div className="w-full min-w-0 overflow-x-auto">{gantt}</div>
        </TabsPanel>
      ) : null}

      <TabsPanel
        className={reviewTabPanelClassName}
        data-testid="production-proposal-milestones-tab"
        value="milestones"
      >
        {milestones ?? (
          <ProductionProposalMilestoneWorksheet
            detail={detail}
            footerExtra={
              <div className="timeline-blueprint-metric">
                <span>Proposal budget</span>
                <strong>{formatCents(proposal.totalBudgetCents)}</strong>
              </div>
            }
            showHeading
            templateTitle={proposal.buildName}
          />
        )}
      </TabsPanel>

      {contractors ? (
        <TabsPanel
          className={reviewTabPanelClassName}
          data-testid="production-proposal-contractors-tab"
          value="contractors"
        >
          {contractors}
        </TabsPanel>
      ) : null}

      <TabsPanel
        className={reviewTabPanelClassName}
        data-testid="production-proposal-calendar-tab"
        value="calendar"
      >
        <CalendarWorkspace
          actions={effectiveCalendarActions}
          assignableParticipants={calendarAssignableParticipants}
          initialTimeframe={
            calendarTimeframe ?? effectiveCalendarWorkspace.defaultTimeframe
          }
          onCommitEdit={onCommitCalendarEdit ?? fallbackCalendarEdit}
          onCreateReminderEvent={onCreateCalendarReminderEvent}
          onCreateSyncSubscription={onCreateCalendarSyncSubscription}
          onDeleteReminderEvent={onDeleteCalendarReminderEvent}
          onRecordExternalSyncChange={onRecordExternalCalendarSyncChange}
          onSaveView={onSaveCalendarView}
          onTimeframeChange={onChangeCalendarTimeframe}
          onUpdateReminderEvent={onUpdateCalendarReminderEvent}
          workspace={effectiveCalendarWorkspace}
        />
      </TabsPanel>

      <TabsPanel
        className={reviewTabPanelClassName}
        data-testid="production-proposal-review-tab"
        value="review"
      >
        {renderReviewOverview({ idPrefix: "production-review-tab" })}
      </TabsPanel>

      {editableDraws.length > 0 ? (
        <TabsPanel
          className={reviewTabPanelClassName}
          data-testid="production-proposal-draws-tab"
          value="draws"
        >
          {canEditDraws ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
              <Section title="Backoffice draw schedule">
                <ProductionProposalDrawScheduleEditor
                  canEditDraws={canEditDraws}
                  drawAmounts={drawAmounts}
                  drawLabels={drawLabels}
                  draws={editableDraws}
                  drawTimingDays={drawTimingDays}
                  onAmountChange={(drawKey, value) =>
                    setDrawAmounts((current) => ({
                      ...current,
                      [drawKey]: value,
                    }))
                  }
                  onCommit={(drawKey, patch) => {
                    if (drawEditReasonRequired && !reviewReason) {
                      toast.error("Draw edit reason required.", {
                        description:
                          "Enter a change reason before saving a draw schedule row.",
                      });
                      return;
                    }
                    void Promise.resolve(
                      onUpdateDraw?.(drawKey, {
                        ...patch,
                        reason: drawEditReasonRequired
                          ? reason
                          : reason || "Draft draw schedule edit.",
                      })
                    )
                      .then(() => {
                        setDrawAmounts((current) => {
                          const next = { ...current };
                          delete next[drawKey];
                          return next;
                        });
                        setDrawLabels((current) => {
                          const next = { ...current };
                          delete next[drawKey];
                          return next;
                        });
                        setDrawTimingDays((current) => {
                          const next = { ...current };
                          delete next[drawKey];
                          return next;
                        });
                      })
                      .catch((error) => {
                        toast.error(
                          productionProposalActionErrorMessage(error)
                        );
                      });
                  }}
                  onLabelChange={(drawKey, value) =>
                    setDrawLabels((current) => ({
                      ...current,
                      [drawKey]: value,
                    }))
                  }
                  onTimingChange={(drawKey, value) =>
                    setDrawTimingDays((current) => ({
                      ...current,
                      [drawKey]: value,
                    }))
                  }
                />
              </Section>
              <Section title="Draw edit reason">
                <div className="grid gap-2">
                  <Label htmlFor="production-draw-edit-reason">
                    Change reason
                  </Label>
                  <Input
                    id="production-draw-edit-reason"
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Required before saving draw rows"
                    value={reason}
                  />
                  <p className="text-muted-foreground text-xs">
                    Draw schedule edits are audited with this reason.
                  </p>
                </div>
              </Section>
            </div>
          ) : (
            <Section title="Draw schedule">
              <ProposalDrawScheduleSnapshot draws={editableDraws} />
            </Section>
          )}
        </TabsPanel>
      ) : null}

      <TabsPanel
        className={reviewTabPanelClassName}
        data-testid="production-proposal-materials-tab"
        value="materials"
      >
        <MaterialPlanningTab
          actions={materialPlanningActions}
          budgetImpact={{
            borrowerCoPayBps: proposal.borrowerCoPayBps,
            proposalBudgetCents: proposal.totalBudgetCents,
          }}
          budgetTreatmentEnabled
          defaultBudgetTreatment="logOnly"
          items={detail.costItems ?? []}
          milestones={materialPlanningMilestones(detail)}
          readOnly={!materialPlanningActions}
          scopeLabel="Build Proposal"
        />
      </TabsPanel>

      {staff ? (
        <TabsPanel
          className={reviewTabPanelClassName}
          data-testid="production-proposal-staff-tab"
          value="staff"
        >
          {staff}
        </TabsPanel>
      ) : null}

      <TabsPanel
        className={reviewTabPanelClassName}
        data-testid="production-proposal-packet-tab"
        value="packet"
      >
        <div className="grid gap-4">
          {renderReviewOverview({
            idPrefix: "production-packet-tab",
            includePermitUpload: true,
          })}
          <ProposalDrawAvailabilityWarning detail={detail} />
          {proposal.selectedPlan ? (
            <Section title="Selected plan">
              <div className="grid gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{proposal.selectedPlan.name}</Badge>
                  <span className="text-muted-foreground text-sm">
                    Builder-selected proposal plan
                  </span>
                </div>
                {proposal.selectedPlan.recommendationReason ? (
                  <p className="text-muted-foreground text-sm">
                    {proposal.selectedPlan.recommendationReason}
                  </p>
                ) : null}
                {proposal.selectedPlan.metrics ? (
                  <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                    <ProposalPlanMetric
                      label="Duration"
                      value={`${proposal.selectedPlan.metrics.projectedDurationDays} days`}
                    />
                    <ProposalPlanMetric
                      label="Draw fees"
                      value={formatCents(
                        proposal.selectedPlan.metrics.drawFeesCents
                      )}
                    />
                    <ProposalPlanMetric
                      label="Projected interest"
                      value={formatCents(
                        proposal.selectedPlan.metrics.interestCostCents
                      )}
                    />
                    <ProposalPlanMetric
                      label="Borrower starting cash"
                      value={formatCents(
                        proposal.selectedPlan.metrics.startingCashCents
                      )}
                    />
                    {proposal.selectedPlan.metrics
                      .requiredWorkingCapitalCents === undefined ? null : (
                      <ProposalPlanMetric
                        label="Required working capital"
                        value={formatCents(
                          proposal.selectedPlan.metrics
                            .requiredWorkingCapitalCents
                        )}
                      />
                    )}
                  </dl>
                ) : null}
              </div>
            </Section>
          ) : null}
          <ProposalPacketSnapshot
            detail={detail}
            mergedWithReview
            onCreateMilestone={onCreatePacketMilestone}
            onUpdateMilestone={onUpdatePacketMilestone}
            onUpdatePermitDocument={onUploadPermitDocument}
            onUpdateProposedStartDate={onUpdateProposedStartDate}
          />
        </div>
      </TabsPanel>

      {proposal.status === "approved" || proposal.status === "closed" ? (
        <TabsPanel
          className={reviewTabPanelClassName}
          data-testid="production-proposal-closing-tab"
          value="closing"
        >
          {reviewPolicySurface ? (
            <div className="mb-4">{reviewPolicySurface}</div>
          ) : null}
          <Section title="Offline closing">
            {detail.activeBuild ? (
              <p className="text-sm">
                Active build starts {detail.activeBuild.startDate}.
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                No active build created yet.
              </p>
            )}
            {lifecycleActions ?? (
              <div className="mt-3 grid max-w-sm gap-2">
                <Label htmlFor="production-build-start-date">
                  Build start date
                </Label>
                <Input
                  id="production-build-start-date"
                  onChange={(event) => setStartDate(event.target.value)}
                  type="date"
                  value={startDate}
                />
                <Label htmlFor="production-build-timezone">
                  Build timezone (IANA)
                </Label>
                <Input
                  aria-invalid={Boolean(
                    normalizedIanaTimezone && !ianaTimezoneValid
                  )}
                  id="production-build-timezone"
                  onChange={(event) => setIanaTimezone(event.target.value)}
                  required
                  value={ianaTimezone}
                />
                {normalizedIanaTimezone && !ianaTimezoneValid ? (
                  <p className="text-destructive text-xs" role="alert">
                    Enter a valid IANA timezone such as America/Toronto.
                  </p>
                ) : null}
                <Label htmlFor="production-closing-reason">
                  Closing reason
                </Label>
                <Input
                  id="production-closing-reason"
                  onChange={(event) => setClosingReason(event.target.value)}
                  placeholder="Loan closed offline."
                  value={closingReason}
                />
                <Button
                  disabled={
                    closingPending ||
                    !canRecordClosing ||
                    !closingPolicyReady ||
                    proposal.status !== "approved" ||
                    !startDate ||
                    !ianaTimezoneValid
                  }
                  onClick={() => void recordClosing()}
                  size="sm"
                >
                  <CalendarClock />
                  {closingPending ? "Recording..." : "Record closing"}
                </Button>
                {!closingPolicyReady && proposal.status === "approved" ? (
                  <p
                    className="text-pretty text-muted-foreground text-xs"
                    role="status"
                  >
                    Lock the review policy above before recording closing.
                  </p>
                ) : null}
              </div>
            )}
          </Section>
        </TabsPanel>
      ) : null}
    </div>
  );
}
