import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { Tabs, TabsList, TabsTab } from "#/components/ui/tabs.tsx";
import type { BrokerAssignmentBrokerage } from "#/features/broker-assignments/BrokerAssignmentDialog.tsx";
import { firstPermitDocument } from "#/features/build-permit-viewer/BuildPermitViewerDrawer.tsx";
import {
  buildProposalCalendarActions,
  buildProposalCalendarWorkspaceFromDetail,
  createProposalCalendarEditHandler,
  type ProposalCalendarAdapterActions,
} from "#/features/calendar-workspace/adapters/proposalCalendarAdapter.ts";
import type {
  CalendarAssignableParticipant,
  CalendarEditRequest,
  CalendarFilters,
  CalendarReminderEventInput,
  CalendarSyncSubscriptionResult,
  CalendarTimeframe,
  DrawFlowCalendarWorkspaceData,
} from "#/features/calendar-workspace/calendarTypes.ts";
import type { MaterialPlanningActions } from "#/features/material-planning/MaterialPlanningTab.tsx";
import type {
  ProductionProposalDetail,
  ProductionBuilderOption,
  ProductionProposal,
  ProductionReviewTab,
  PacketMilestoneCreatePayload,
  PacketMilestonePatch,
} from "./production-proposal-surface-contracts";
import {
  ApprovedProposalConfirmation,
  ProposalReadinessList,
  ProposalReviewDecisionPanel,
} from "./production-proposal-review-decision.tsx";
import { BuilderAssignmentSection } from "./production-proposal-review-assignment.tsx";
import { ProposalReviewHeaderSummary } from "./production-proposal-review-header.tsx";
import { ProductionProposalReviewPanels } from "./production-proposal-review-panels.tsx";
import {
  DetailGrid,
  ProposalLifecycleSummary,
  Section,
  calculateProposalApprovedAmountCents,
  calculateProposalTotalDrawAmountCents,
  formatCents,
  isValidIanaTimezone,
  productionProposalActionErrorMessage,
  proposalCompactStageState,
  statusLabel,
} from "./production-proposal-surface-shared";

export function ProductionProposalReviewSurface({
  approvalStatusSurface,
  assignableBrokerages = [],
  brokerOptionsPending = false,
  builders = [],
  calendarAdapterActions,
  calendarAssignableParticipants = [],
  calendarTimeframe,
  calendarWorkspace,
  closingPolicyReady = true,
  detail,
  initialActiveTab,
  lifecycleActions,
  reviewPolicySurface,
  materialPlanningActions,
  onChangeCalendarTimeframe,
  onChangeReviewTab,
  onApprove,
  onClose,
  onCommitCalendarEdit,
  onCreateCalendarReminderEvent,
  onCreateCalendarSyncSubscription,
  onDeleteCalendarReminderEvent,
  onRecordExternalCalendarSyncChange,
  onReject,
  onRequestChanges,
  onSubmit,
  onAssignBroker,
  onAssignBuilder,
  onOnboardBuilder,
  onUnassignBuilder,
  onCreatePacketMilestone,
  onUploadPermitDocument,
  onUpdateApprovedAmount,
  onUpdateCalendarReminderEvent,
  onUpdateInterestRate,
  onUpdatePacketMilestone,
  onUpdateProposedStartDate,
  onSaveCalendarView,
  onCreateClaimLink,
  onUpdateDraw,
  milestones,
  contractors,
  gantt,
  staff,
  timeline,
}: {
  approvalStatusSurface?: ReactNode;
  assignableBrokerages?: BrokerAssignmentBrokerage[];
  brokerOptionsPending?: boolean;
  builders?: ProductionBuilderOption[];
  contractors?: ReactNode;
  gantt?: ReactNode;
  calendarAdapterActions?: ProposalCalendarAdapterActions;
  calendarAssignableParticipants?: CalendarAssignableParticipant[];
  calendarTimeframe?: CalendarTimeframe;
  calendarWorkspace?: DrawFlowCalendarWorkspaceData | null;
  closingPolicyReady?: boolean;
  detail: ProductionProposalDetail;
  lifecycleActions?: ReactNode;
  materialPlanningActions?: MaterialPlanningActions;
  onChangeCalendarTimeframe?: (timeframe: CalendarTimeframe) => void;
  onChangeReviewTab?: (tab: ProductionReviewTab) => void;
  onApprove?: (
    reason: string,
    permitWaiverReason?: string
  ) => Promise<unknown> | unknown;
  onClose?: (
    startDate: string,
    reason: string,
    ianaTimezone: string
  ) => Promise<unknown> | unknown;
  onCommitCalendarEdit?: (
    request: CalendarEditRequest
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
  onCreateCalendarReminderEvent?: (
    input: CalendarReminderEventInput
  ) => Promise<unknown> | unknown;
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
  onReject?: (reason: string) => Promise<unknown> | unknown;
  onRequestChanges?: (reason: string) => Promise<unknown> | unknown;
  onSubmit?: () => Promise<unknown> | unknown;
  onAssignBroker?: (
    assignedBrokerWorkosUserId: string,
    reason: string
  ) => Promise<unknown> | unknown;
  onAssignBuilder?: (builderProfileId: string) => Promise<unknown> | unknown;
  onOnboardBuilder?: () => void;
  onUnassignBuilder?: () => Promise<unknown> | unknown;
  onCreatePacketMilestone?: (
    milestone: PacketMilestoneCreatePayload
  ) => Promise<unknown> | unknown;
  onUploadPermitDocument?: (file: File) => Promise<unknown> | unknown;
  onUpdateApprovedAmount?: (
    approvedAmountCents: number
  ) => Promise<unknown> | unknown;
  onUpdateCalendarReminderEvent?: (
    input: CalendarReminderEventInput & { eventId: string }
  ) => Promise<unknown> | unknown;
  onUpdateInterestRate?: (
    interestAnnualBps: number
  ) => Promise<unknown> | unknown;
  onUpdatePacketMilestone?: (
    milestoneKey: string,
    patch: PacketMilestonePatch
  ) => Promise<unknown> | unknown;
  onUpdateProposedStartDate?: (
    proposedStartDate: string
  ) => Promise<unknown> | unknown;
  onCreateClaimLink?: () =>
    | Promise<{ claimPath: string; claimToken: string; expiresAt: number }>
    | { claimPath: string; claimToken: string; expiresAt: number };
  onSaveCalendarView?: (input: {
    filters: CalendarFilters;
    isDefault?: boolean;
    label: string;
    timeframe: CalendarTimeframe;
    viewKey: string;
  }) => Promise<unknown> | unknown;
  onUpdateDraw?: (
    drawKey: string,
    patch: {
      amountCents: number;
      label: string;
      reason: string;
      timingDay: number;
    }
  ) => Promise<unknown> | unknown;
  milestones?: ReactNode;
  staff?: ReactNode;
  timeline?: ReactNode;
  initialActiveTab?: ProductionReviewTab;
  reviewPolicySurface?: ReactNode;
}) {
  const [reason, setReason] = useState("");
  const [closingReason, setClosingReason] = useState("");
  const [permitWaiverReason, setPermitWaiverReason] = useState("");
  const [startDate, setStartDate] = useState("");
  const [ianaTimezone, setIanaTimezone] = useState(
    () => detail.activeBuild?.timezone ?? ""
  );
  const [drawAmounts, setDrawAmounts] = useState<Record<string, string>>({});
  const [drawLabels, setDrawLabels] = useState<Record<string, string>>({});
  const [drawTimingDays, setDrawTimingDays] = useState<Record<string, string>>(
    {}
  );
  const [pendingDecision, setPendingDecision] = useState<
    "approve" | "reject" | "requestChanges" | null
  >(null);
  const [submitPending, setSubmitPending] = useState(false);
  const [closingPending, setClosingPending] = useState(false);
  const proposal = detail.proposal;
  const proposedStartDate = proposal.proposedStartDate ?? "";
  const permit = detail.documents?.find((doc) => doc.documentType === "permit");
  const permitViewerDocument = firstPermitDocument(detail.documents);
  const canEditProposalCapitalTerms =
    !detail.activeBuild && proposal.status !== "closed";
  const canEditApprovedAmount =
    Boolean(onUpdateApprovedAmount) && canEditProposalCapitalTerms;
  const canEditInterestRate =
    Boolean(onUpdateInterestRate) && canEditProposalCapitalTerms;
  const reviewReason = reason.trim();
  const permitWaiverReviewReason = permitWaiverReason.trim();
  const normalizedIanaTimezone = ianaTimezone.trim();
  const ianaTimezoneValid = isValidIanaTimezone(normalizedIanaTimezone);
  const editableDraws = detail.draws ?? [];
  const headerApprovedAmountCents = calculateProposalApprovedAmountCents(
    proposal,
    editableDraws
  );
  const headerMinimumApprovedAmountCents =
    calculateProposalTotalDrawAmountCents(editableDraws);
  const canEditDraws =
    !!onUpdateDraw &&
    (proposal.status === "draft" ||
      proposal.status === "submitted" ||
      proposal.status === "approved");
  const drawEditReasonRequired =
    proposal.status === "submitted" || proposal.status === "approved";
  const canRunReviewDecision = Boolean(
    onApprove && onReject && onRequestChanges
  );
  const canSubmitProposal = Boolean(onSubmit);
  const canRenderProposalStatusPanel =
    canRunReviewDecision || canSubmitProposal;
  const canRecordClosing = Boolean(onClose);
  const tabs = useMemo(() => {
    const nextTabs: { label: string; value: ProductionReviewTab }[] = [];
    nextTabs.push({ label: "Packet", value: "packet" });
    if (timeline) {
      nextTabs.push({ label: "Timeline", value: "timeline" });
    }
    if (gantt) {
      nextTabs.push({ label: "Gantt", value: "gantt" });
    }
    nextTabs.push({ label: "Milestones", value: "milestones" });
    nextTabs.push({ label: "Calendar", value: "calendar" });
    if (contractors) {
      nextTabs.push({ label: "Contractors", value: "contractors" });
    }
    nextTabs.push({ label: "Review", value: "review" });
    if (editableDraws.length > 0) {
      nextTabs.push({ label: "Draw schedule", value: "draws" });
    }
    nextTabs.push({ label: "Materials", value: "materials" });
    if (staff) {
      nextTabs.push({ label: "Staff", value: "staff" });
    }
    if (proposal.status === "approved" || proposal.status === "closed") {
      nextTabs.push({ label: "Closing", value: "closing" });
    }
    return nextTabs;
  }, [
    contractors,
    editableDraws.length,
    gantt,
    proposal.status,
    staff,
    timeline,
  ]);
  const proposalCalendarActions = useMemo<ProposalCalendarAdapterActions>(
    () => ({
      ...calendarAdapterActions,
      reviseDrawTiming:
        calendarAdapterActions?.reviseDrawTiming ??
        (onUpdateDraw
          ? (input) => {
              const draw = editableDraws.find(
                (candidate) => candidate.drawKey === input.drawKey
              );
              if (!draw) {
                return;
              }
              onUpdateDraw(input.drawKey, {
                amountCents: draw.amountCents,
                label: draw.label,
                reason: input.reason ?? "Calendar draw timing edit.",
                timingDay: input.timingDay,
              });
            }
          : undefined),
    }),
    [calendarAdapterActions, editableDraws, onUpdateDraw]
  );
  const effectiveCalendarWorkspace = useMemo(
    () =>
      calendarWorkspace ??
      buildProposalCalendarWorkspaceFromDetail(detail, {
        baseDate:
          detail.activeBuild?.startDate ||
          proposal.proposedStartDate ||
          undefined,
      }),
    [calendarWorkspace, detail, proposal.proposedStartDate]
  );
  const effectiveCalendarActions = useMemo(
    () => buildProposalCalendarActions(proposalCalendarActions),
    [proposalCalendarActions]
  );
  const fallbackCalendarEdit = useMemo(
    () =>
      createProposalCalendarEditHandler({
        actions: proposalCalendarActions,
        baseDate:
          detail.activeBuild?.startDate ??
          proposal.proposedStartDate ??
          "2026-06-01",
      }),
    [
      detail.activeBuild?.startDate,
      proposal.proposedStartDate,
      proposalCalendarActions,
    ]
  );
  const [activeTab, setActiveTab] = useState<ProductionReviewTab>(
    initialActiveTab ?? "packet"
  );

  useEffect(() => {
    if (!tabs.some((tab) => tab.value === activeTab)) {
      setActiveTab(tabs[0]?.value ?? "review");
    }
  }, [activeTab, tabs]);
  useEffect(() => {
    if (
      initialActiveTab &&
      tabs.some((tab) => tab.value === initialActiveTab)
    ) {
      setActiveTab(initialActiveTab);
    }
  }, [initialActiveTab, tabs]);

  useEffect(() => {
    if (!detail.activeBuild && proposal.status === "approved") {
      setStartDate((current) => current || proposedStartDate);
    }
  }, [detail.activeBuild, proposal.status, proposedStartDate]);

  const activeTabLabel =
    tabs.find((tab) => tab.value === activeTab)?.label ?? "Proposal stage";
  const compactStageState = proposalCompactStageState(proposal.status);
  const changeReviewTab = (value: string) => {
    const next = value as ProductionReviewTab;
    setActiveTab(next);
    onChangeReviewTab?.(next);
  };

  const runReviewDecision = async (
    decision: "approve" | "reject" | "requestChanges"
  ) => {
    if (!canRunReviewDecision) {
      toast.error("You do not have permission to review this proposal.");
      return;
    }
    if (proposal.status !== "submitted") {
      toast.error("This proposal is no longer awaiting review.");
      return;
    }
    if (!reviewReason) {
      toast.error("Decision reason required.", {
        description:
          "Add the audit reason before requesting changes, rejecting, or approving.",
      });
      return;
    }
    if (
      decision === "approve" &&
      !(permit || detail.permitWaiver) &&
      !permitWaiverReviewReason
    ) {
      toast.error("Permit waiver reason required.", {
        description:
          "No permit PDF is linked, so approval needs a recorded waiver reason.",
      });
      return;
    }

    setPendingDecision(decision);
    try {
      if (decision === "approve") {
        await onApprove?.(reviewReason, permitWaiverReviewReason || undefined);
      } else if (decision === "reject") {
        await onReject?.(reviewReason);
      } else {
        await onRequestChanges?.(reviewReason);
      }
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setPendingDecision(null);
    }
  };

  const submitProposal = async () => {
    if (!canSubmitProposal) {
      toast.error("You do not have permission to submit this proposal.");
      return;
    }
    if (proposal.status !== "draft") {
      toast.error("This proposal is no longer in draft.");
      return;
    }
    setSubmitPending(true);
    try {
      await onSubmit?.();
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setSubmitPending(false);
    }
  };

  const recordClosing = async () => {
    if (!canRecordClosing) {
      toast.error("You do not have permission to record closing.");
      return;
    }
    if (proposal.status !== "approved") {
      toast.error("This proposal is no longer awaiting closing.");
      return;
    }
    if (!(startDate && ianaTimezone.trim())) {
      toast.error("Build start date and IANA timezone are required.");
      return;
    }
    setClosingPending(true);
    try {
      await onClose?.(
        startDate,
        closingReason.trim() || "Loan closed offline.",
        ianaTimezone.trim()
      );
    } catch (error) {
      toast.error(productionProposalActionErrorMessage(error));
    } finally {
      setClosingPending(false);
    }
  };

  const renderReviewDecisionPanel = (idPrefix: string) => (
    <ProposalReviewDecisionPanel
      idPrefix={idPrefix}
      onReasonChange={setReason}
      onReviewDecision={runReviewDecision}
      onSubmit={canSubmitProposal ? submitProposal : undefined}
      pendingDecision={pendingDecision}
      proposal={proposal}
      reason={reason}
      submitPending={submitPending}
    />
  );

  const renderReviewOverview = ({
    idPrefix,
    includePermitUpload = false,
  }: {
    idPrefix: string;
    includePermitUpload?: boolean;
  }) => (
    <div
      className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(22rem,1fr)]"
      data-testid="proposal-review-overview"
    >
      <div
        className="grid min-w-0 gap-4"
        data-testid="proposal-review-primary-column"
      >
        {proposal.status === "approved" ? (
          <ApprovedProposalConfirmation
            approvalStatusSurface={approvalStatusSurface}
            detail={detail}
          />
        ) : canRenderProposalStatusPanel ? (
          renderReviewDecisionPanel(idPrefix)
        ) : (
          <Section title="Review summary">
            <div className="grid gap-3">
              <div>
                <Badge variant="outline">{statusLabel(proposal.status)}</Badge>
                <h2 className="mt-2 font-semibold text-xl tracking-tight">
                  {proposal.buildName}
                </h2>
                <p className="mt-1 text-muted-foreground text-sm">
                  {proposal.location}
                </p>
              </div>
              <p className="text-muted-foreground text-sm">
                Review decisions are limited to authorized lender approval
                surfaces.
              </p>
            </div>
          </Section>
        )}

        {detail.lifecycle ? (
          <ProposalLifecycleSummary lifecycle={detail.lifecycle} />
        ) : null}

        <Section title="Readiness">
          <ProposalReadinessList
            canRecordPermitWaiverReason={canRunReviewDecision}
            detail={detail}
            onPermitWaiverReasonChange={setPermitWaiverReason}
            onUploadPermitDocument={
              includePermitUpload ? onUploadPermitDocument : undefined
            }
            permitFileName={permit?.fileName}
            permitViewerDocument={permitViewerDocument}
            permitWaiverReason={permitWaiverReason}
            proposalStatus={proposal.status}
          />
        </Section>
      </div>

      <div
        className="grid min-w-0 gap-4"
        data-testid="proposal-review-context-column"
      >
        <Section title="Review snapshot">
          <DetailGrid
            rows={[
              ["Total budget", formatCents(proposal.totalBudgetCents)],
              [
                "Borrower starting cash",
                formatCents(proposal.borrowerStartingCashCents),
              ],
              [
                "Approved amount",
                formatCents(
                  calculateProposalApprovedAmountCents(
                    proposal,
                    detail.draws ?? detail.plannedDraws
                  )
                ),
              ],
            ]}
          />
        </Section>

        <BuilderAssignmentSection
          assignableBrokerages={assignableBrokerages}
          assignment={detail.assignment}
          brokerOptionsPending={brokerOptionsPending}
          builders={builders}
          onAssignBroker={onAssignBroker}
          onAssignBuilder={onAssignBuilder}
          onCreateClaimLink={onCreateClaimLink}
          onOnboardBuilder={onOnboardBuilder}
          onUnassignBuilder={onUnassignBuilder}
          proposal={proposal}
        />
      </div>
    </div>
  );

  return (
    <section
      className="flex min-h-[calc(100vh-4rem)] w-full min-w-0 flex-1 flex-col bg-muted/30 p-0 md:p-5"
      data-testid="production-proposal-review-tabs"
    >
      <Tabs
        className="flex w-full min-w-0 flex-col gap-4"
        onValueChange={changeReviewTab}
        value={activeTab}
      >
        <header
          className="grid w-full min-w-0 gap-3 px-3 pt-3 md:px-0 md:pt-0"
          data-testid="proposal-workspace-header"
        >
          <div
            className="grid w-full min-w-0 gap-2 xl:hidden"
            data-testid="proposal-compact-stage-picker"
          >
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs">Current stage</p>
                <p
                  className="break-words font-semibold text-base"
                  data-testid="proposal-compact-active-stage"
                >
                  {activeTabLabel}
                </p>
              </div>
              <Badge variant="outline">{compactStageState}</Badge>
            </div>
            <NativeSelect
              aria-label="Proposal workspace stage"
              className="w-full"
              onChange={(event) => changeReviewTab(event.target.value)}
              value={activeTab}
            >
              {tabs.map((tab) => (
                <NativeSelectOption key={tab.value} value={tab.value}>
                  {tab.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <TabsList
            aria-label="Proposal workspace sections"
            className="hidden w-full max-w-full flex-wrap justify-start overflow-visible xl:flex"
            variant="underline"
          >
            {tabs.map((tab) => (
              <TabsTab key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTab>
            ))}
          </TabsList>
          <ProposalReviewHeaderSummary
            approvedAmountCents={headerApprovedAmountCents}
            canEditApprovedAmount={canEditApprovedAmount}
            canEditInterestRate={canEditInterestRate}
            minimumApprovedAmountCents={headerMinimumApprovedAmountCents}
            onUpdateApprovedAmount={onUpdateApprovedAmount}
            onUpdateInterestRate={onUpdateInterestRate}
            proposal={proposal}
          />
        </header>
        <ProductionProposalReviewPanels
          calendarAssignableParticipants={calendarAssignableParticipants}
          calendarTimeframe={calendarTimeframe}
          canEditDraws={canEditDraws}
          canRecordClosing={canRecordClosing}
          closingPending={closingPending}
          closingPolicyReady={closingPolicyReady}
          closingReason={closingReason}
          contractors={contractors}
          detail={detail}
          drawAmounts={drawAmounts}
          drawEditReasonRequired={drawEditReasonRequired}
          drawLabels={drawLabels}
          drawTimingDays={drawTimingDays}
          editableDraws={editableDraws}
          effectiveCalendarActions={effectiveCalendarActions}
          effectiveCalendarWorkspace={effectiveCalendarWorkspace}
          fallbackCalendarEdit={fallbackCalendarEdit}
          gantt={gantt}
          ianaTimezone={ianaTimezone}
          ianaTimezoneValid={ianaTimezoneValid}
          lifecycleActions={lifecycleActions}
          materialPlanningActions={materialPlanningActions}
          milestones={milestones}
          normalizedIanaTimezone={normalizedIanaTimezone}
          onChangeCalendarTimeframe={onChangeCalendarTimeframe}
          onCommitCalendarEdit={onCommitCalendarEdit}
          onCreateCalendarReminderEvent={onCreateCalendarReminderEvent}
          onCreateCalendarSyncSubscription={onCreateCalendarSyncSubscription}
          onCreatePacketMilestone={onCreatePacketMilestone}
          onDeleteCalendarReminderEvent={onDeleteCalendarReminderEvent}
          onRecordExternalCalendarSyncChange={
            onRecordExternalCalendarSyncChange
          }
          onSaveCalendarView={onSaveCalendarView}
          onUpdateCalendarReminderEvent={onUpdateCalendarReminderEvent}
          onUpdateDraw={onUpdateDraw}
          onUpdatePacketMilestone={onUpdatePacketMilestone}
          onUpdateProposedStartDate={onUpdateProposedStartDate}
          onUploadPermitDocument={onUploadPermitDocument}
          proposal={proposal}
          reason={reason}
          recordClosing={recordClosing}
          renderReviewOverview={renderReviewOverview}
          reviewPolicySurface={reviewPolicySurface}
          reviewReason={reviewReason}
          setClosingReason={setClosingReason}
          setDrawAmounts={setDrawAmounts}
          setDrawLabels={setDrawLabels}
          setDrawTimingDays={setDrawTimingDays}
          setIanaTimezone={setIanaTimezone}
          setReason={setReason}
          setStartDate={setStartDate}
          staff={staff}
          startDate={startDate}
          timeline={timeline}
        />
      </Tabs>
    </section>
  );
}
