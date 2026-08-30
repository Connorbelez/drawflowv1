import { Banknote, ReceiptText, ShieldCheck, UserRound } from "lucide-react";

import type { Id } from "../../../convex/_generated/dataModel";
import type { ContractorPlanningModel } from "#/features/contractors/ContractorPlanningPanel.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Drawer,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
} from "#/components/ui/drawer.tsx";
import { EditableNumberChip } from "#/components/ui/editable-chip.tsx";
import { TimelineMilestoneSubmilestoneList } from "./-TimelineMilestoneSubmilestoneList.tsx";
import { TimelineMilestoneContractorList } from "./TimelineMilestoneContractorList.tsx";
import { cn } from "#/lib/utils.ts";
import { getMilestoneEndX } from "./-timeline-milestone-schedule.ts";
import {
  DEFAULT_BORROWER_CO_PAY_BPS,
  getMilestoneDrawAvailabilityAmount,
} from "./-timeline-share-snapshot.ts";
import { resolveMilestoneSubmilestones } from "./-timeline-milestone-submilestones.ts";
import { dollarsToCents, money } from "./TimelineWorkspaceDefaults.ts";
import {
  formatTimelineDay,
  resolveSelectedDrawDate,
} from "./TimelineWorkspaceDrawUtils.ts";
import { resolveMilestoneCumulativeDrawPosition } from "./TimelineWorkspaceChartMath.ts";
import type {
  DemoDraw,
  DemoEvidenceAsset,
  DemoMilestone,
} from "./-timeline-share-snapshot.ts";
import type {
  DrawAvailabilityDatum,
  FinancialOverview,
  TimelineCompletionClaimInput,
  TimelineDemoRole,
  TimelineModificationRequestView,
  TimelineSiteVisitRequestInput,
} from "./TimelineWorkspaceTypes.ts";
import {
  LenderMilestoneReviewPanel,
  MilestoneOperationsPanel,
} from "./TimelineWorkspaceReviewPanels.tsx";
import {
  DrawRequestPanel,
  LenderDrawReviewPanel,
} from "./TimelineWorkspaceRequestPanels.tsx";
import { FinancialOverviewCard } from "./TimelineWorkspaceMarkers.tsx";
import type {
  TimelineItem,
  TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";

export function SelectedDrawMobileDrawer({
  activeDraw,
  activePanelDraw,
  activePanelDrawItem,
  approvedDrawLimit,
  canApproveMilestoneCompletion,
  addEvidenceFiles,
  activeItem,
  contractorPlanning,
  drawAvailabilityData,
  draws,
  items,
  onOpenChange,
  onCompleteMilestone,
  onCreateMilestoneSiteVisit,
  onRequestMilestoneSiteVisit,
  onRecordMilestoneSiteVisit,
  onRemoveEvidenceAsset,
  onOpenSubmilestone,
  onReviewDrawRequest,
  modificationRequests,
  onReviewModificationRequest,
  onReviewMilestoneCompletion,
  onSubmitDrawRequest,
  onUpdateEvidenceAsset,
  onUpdateMilestoneDrawAvailability,
  onUpdatePlannedDraw,
  onUpdateSubmilestoneBudget,
  onUpdateSubmilestoneDuration,
  liveExecutionEnabled,
  open,
  overview,
  range,
  requiresApprovedDrawMilestones,
  role,
}: {
  activeDraw: DemoDraw | null;
  activePanelDraw: DemoDraw | null;
  activePanelDrawItem: TimelineItem<DemoMilestone> | null;
  approvedDrawLimit?: number;
  canApproveMilestoneCompletion: boolean;
  addEvidenceFiles: (itemId: string, files: File[]) => void;
  activeItem: TimelineItem<DemoMilestone> | null;
  contractorPlanning?: ContractorPlanningModel | null;
  drawAvailabilityData: DrawAvailabilityDatum[];
  draws: DemoDraw[];
  items: TimelineItem<DemoMilestone>[];
  modificationRequests: TimelineModificationRequestView[];
  onOpenChange: (open: boolean) => void;
  onOpenSubmilestone?: (submilestoneId: Id<"buildSubmilestones">) => void;
  onCompleteMilestone: (
    itemId: string,
    claim: TimelineCompletionClaimInput
  ) => void;
  onCreateMilestoneSiteVisit?: (
    itemId: string,
    request: TimelineSiteVisitRequestInput
  ) => Promise<TimelineSiteVisitRequestInput | void> | undefined;
  onRequestMilestoneSiteVisit: (
    itemId: string,
    request: TimelineSiteVisitRequestInput
  ) => void;
  onRecordMilestoneSiteVisit?: (
    itemId: string,
    request: TimelineSiteVisitRequestInput
  ) => Promise<unknown> | undefined;
  onRemoveEvidenceAsset: (itemId: string, assetId: string) => void;
  onReviewDrawRequest: (
    drawId: string,
    review: { note?: string; status: "approved" | "rejected" }
  ) => void;
  onReviewModificationRequest: (
    request: TimelineModificationRequestView,
    review: { note?: string; status: "approved" | "rejected" }
  ) => void;
  onReviewMilestoneCompletion: (
    itemId: string,
    review: { note?: string; status: "approved" | "revisionRequested" }
  ) => void;
  onSubmitDrawRequest: (
    drawId: string,
    request: { amount: number; note?: string; x?: number }
  ) => void;
  onUpdatePlannedDraw: (
    drawId: string,
    patch: { amount?: number; x?: number }
  ) => void;
  onUpdateEvidenceAsset: (
    itemId: string,
    assetId: string,
    patch: Partial<Pick<DemoEvidenceAsset, "label" | "tag">>
  ) => void;
  onUpdateMilestoneDrawAvailability?: (itemId: string, amount: number) => void;
  onUpdateSubmilestoneBudget?: (
    itemId: string,
    submilestoneKey: string,
    budgetCents: number
  ) => void;
  onUpdateSubmilestoneDuration?: (
    itemId: string,
    submilestoneKey: string,
    durationDays: number
  ) => void;
  liveExecutionEnabled: boolean;
  open: boolean;
  overview: FinancialOverview;
  range: Required<TimelineRange>;
  requiresApprovedDrawMilestones: boolean;
  role: TimelineDemoRole;
}) {
  return (
    <Drawer onOpenChange={onOpenChange} open={open} position="bottom">
      <DrawerPopup
        className="max-h-[86svh] overflow-x-hidden max-sm:w-full max-sm:max-w-none"
        data-testid="selected-draw-mobile-drawer"
        showBar
      >
        <DrawerPanel
          className="min-w-0 overflow-x-hidden px-4 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]"
          scrollFade
        >
          <DrawerTitle className="sr-only">
            Selected timeline action
          </DrawerTitle>
          {activeItem ? (
            <SelectedContextPanel
              activeDraw={activeDraw}
              activeItem={activeItem}
              activePanelDraw={activePanelDraw}
              activePanelDrawItem={activePanelDrawItem}
              approvedDrawLimit={approvedDrawLimit}
              addEvidenceFiles={addEvidenceFiles}
              canApproveMilestoneCompletion={canApproveMilestoneCompletion}
              contractorPlanning={contractorPlanning}
              drawAvailabilityData={drawAvailabilityData}
              draws={draws}
              items={items}
              liveExecutionEnabled={liveExecutionEnabled}
              modificationRequests={modificationRequests}
              onCompleteMilestone={onCompleteMilestone}
              onCreateMilestoneSiteVisit={onCreateMilestoneSiteVisit}
              onRecordMilestoneSiteVisit={onRecordMilestoneSiteVisit}
              onRemoveEvidenceAsset={onRemoveEvidenceAsset}
              onOpenSubmilestone={onOpenSubmilestone}
              onRequestMilestoneSiteVisit={onRequestMilestoneSiteVisit}
              onReviewDrawRequest={onReviewDrawRequest}
              onReviewMilestoneCompletion={onReviewMilestoneCompletion}
              onReviewModificationRequest={onReviewModificationRequest}
              onSubmitDrawRequest={onSubmitDrawRequest}
              onUpdateEvidenceAsset={onUpdateEvidenceAsset}
              onUpdateMilestoneDrawAvailability={
                onUpdateMilestoneDrawAvailability
              }
              onUpdatePlannedDraw={onUpdatePlannedDraw}
              onUpdateSubmilestoneBudget={onUpdateSubmilestoneBudget}
              onUpdateSubmilestoneDuration={onUpdateSubmilestoneDuration}
              overview={overview}
              range={range}
              requiresApprovedDrawMilestones={requiresApprovedDrawMilestones}
              role={role}
            />
          ) : null}
        </DrawerPanel>
      </DrawerPopup>
    </Drawer>
  );
}

export function SelectedContextPanel({
  activeDraw,
  activePanelDraw,
  activePanelDrawItem,
  approvedDrawLimit,
  canApproveMilestoneCompletion,
  addEvidenceFiles,
  activeItem,
  contractorPlanning,
  drawAvailabilityData,
  draws,
  items,
  onCompleteMilestone,
  onCreateMilestoneSiteVisit,
  onRequestMilestoneSiteVisit,
  onRecordMilestoneSiteVisit,
  onRemoveEvidenceAsset,
  onOpenSubmilestone,
  onReviewDrawRequest,
  modificationRequests,
  onReviewModificationRequest,
  onReviewMilestoneCompletion,
  onSubmitDrawRequest,
  onUpdateEvidenceAsset,
  onUpdateMilestoneDrawAvailability,
  onUpdatePlannedDraw,
  onUpdateSubmilestoneBudget,
  onUpdateSubmilestoneDuration,
  liveExecutionEnabled,
  overview,
  range,
  requiresApprovedDrawMilestones,
  role,
}: {
  activeDraw: DemoDraw | null;
  activePanelDraw: DemoDraw | null;
  activePanelDrawItem: TimelineItem<DemoMilestone> | null;
  approvedDrawLimit?: number;
  canApproveMilestoneCompletion: boolean;
  addEvidenceFiles: (itemId: string, files: File[]) => void;
  activeItem: TimelineItem<DemoMilestone>;
  contractorPlanning?: ContractorPlanningModel | null;
  drawAvailabilityData: DrawAvailabilityDatum[];
  draws: DemoDraw[];
  items: TimelineItem<DemoMilestone>[];
  modificationRequests: TimelineModificationRequestView[];
  onCompleteMilestone: (
    itemId: string,
    claim: TimelineCompletionClaimInput
  ) => void;
  onCreateMilestoneSiteVisit?: (
    itemId: string,
    request: TimelineSiteVisitRequestInput
  ) => Promise<TimelineSiteVisitRequestInput | void> | undefined;
  onRequestMilestoneSiteVisit: (
    itemId: string,
    request: TimelineSiteVisitRequestInput
  ) => void;
  onRecordMilestoneSiteVisit?: (
    itemId: string,
    request: TimelineSiteVisitRequestInput
  ) => Promise<unknown> | undefined;
  onRemoveEvidenceAsset: (itemId: string, assetId: string) => void;
  onOpenSubmilestone?: (submilestoneId: Id<"buildSubmilestones">) => void;
  onReviewDrawRequest: (
    drawId: string,
    review: { note?: string; status: "approved" | "rejected" }
  ) => void;
  onReviewModificationRequest: (
    request: TimelineModificationRequestView,
    review: { note?: string; status: "approved" | "rejected" }
  ) => void;
  onReviewMilestoneCompletion: (
    itemId: string,
    review: { note?: string; status: "approved" | "revisionRequested" }
  ) => void;
  onSubmitDrawRequest: (
    drawId: string,
    request: { amount: number; note?: string; x?: number }
  ) => void;
  onUpdatePlannedDraw: (
    drawId: string,
    patch: { amount?: number; x?: number }
  ) => void;
  onUpdateEvidenceAsset: (
    itemId: string,
    assetId: string,
    patch: Partial<Pick<DemoEvidenceAsset, "label" | "tag">>
  ) => void;
  onUpdateMilestoneDrawAvailability?: (itemId: string, amount: number) => void;
  onUpdateSubmilestoneBudget?: (
    itemId: string,
    submilestoneKey: string,
    budgetCents: number
  ) => void;
  onUpdateSubmilestoneDuration?: (
    itemId: string,
    submilestoneKey: string,
    durationDays: number
  ) => void;
  liveExecutionEnabled: boolean;
  overview: FinancialOverview;
  range: Required<TimelineRange>;
  requiresApprovedDrawMilestones: boolean;
  role: TimelineDemoRole;
}) {
  if (!liveExecutionEnabled) {
    if (activePanelDraw) {
      return (
        <DrawPlanSummaryPanel
          draw={activePanelDraw}
          drawItem={activePanelDrawItem}
          overview={overview}
        />
      );
    }

    return (
      <MilestonePlanSummaryPanel
        activeDraw={activeDraw}
        activeItem={activeItem}
        contractorPlanning={contractorPlanning}
        drawAvailabilityData={drawAvailabilityData}
        onUpdateMilestoneDrawAvailability={onUpdateMilestoneDrawAvailability}
        onUpdateSubmilestoneBudget={onUpdateSubmilestoneBudget}
        onUpdateSubmilestoneDuration={onUpdateSubmilestoneDuration}
        onOpenSubmilestone={onOpenSubmilestone}
        overview={overview}
        range={range}
      />
    );
  }

  if (activePanelDraw) {
    if (role === "lender") {
      return (
        <LenderDrawReviewPanel
          approvedDrawLimit={approvedDrawLimit}
          draw={activePanelDraw}
          drawItem={activePanelDrawItem}
          draws={draws}
          items={items}
          onReviewDrawRequest={onReviewDrawRequest}
        />
      );
    }

    return (
      <DrawRequestPanel
        approvedDrawLimit={approvedDrawLimit}
        draw={activePanelDraw}
        drawItem={activePanelDrawItem}
        draws={draws}
        items={items}
        onSubmitDrawRequest={onSubmitDrawRequest}
        onUpdatePlannedDraw={onUpdatePlannedDraw}
        requiresApprovedMilestones={requiresApprovedDrawMilestones}
      />
    );
  }

  if (role === "lender") {
    return (
      <div className="grid gap-4">
        <TimelineModificationRequestsPanel
          onReviewModificationRequest={onReviewModificationRequest}
          requests={modificationRequests}
        />
        <LenderMilestoneReviewPanel
          activeItem={activeItem}
          canApproveMilestoneCompletion={canApproveMilestoneCompletion}
          contractorPlanning={contractorPlanning}
          items={items}
          onCreateMilestoneSiteVisit={onCreateMilestoneSiteVisit}
          onRecordMilestoneSiteVisit={onRecordMilestoneSiteVisit}
          onRequestMilestoneSiteVisit={onRequestMilestoneSiteVisit}
          onReviewMilestoneCompletion={onReviewMilestoneCompletion}
          onOpenSubmilestone={onOpenSubmilestone}
          overview={overview}
        />
      </div>
    );
  }

  return (
    <MilestoneOperationsPanel
      activeDraw={activeDraw}
      activeItem={activeItem}
      addEvidenceFiles={addEvidenceFiles}
      contractorPlanning={contractorPlanning}
      onCompleteMilestone={onCompleteMilestone}
      onRemoveEvidenceAsset={onRemoveEvidenceAsset}
      onUpdateEvidenceAsset={onUpdateEvidenceAsset}
      onUpdateSubmilestoneBudget={onUpdateSubmilestoneBudget}
      onUpdateSubmilestoneDuration={onUpdateSubmilestoneDuration}
      onOpenSubmilestone={onOpenSubmilestone}
      overview={overview}
      range={range}
    />
  );
}

export function DrawPlanSummaryPanel({
  draw,
  drawItem,
  overview,
}: {
  draw: DemoDraw;
  drawItem: TimelineItem<DemoMilestone> | null;
  overview: FinancialOverview;
}) {
  return (
    <div className="grid gap-4" data-testid="selected-draw-plan-summary">
      <div>
        <div className="mb-3 grid size-10 place-items-center rounded-md bg-sky-500/10 text-sky-600">
          <Banknote className="size-5" />
        </div>
        <p className="font-semibold text-[10px] text-muted-foreground uppercase">
          Planned draw
        </p>
        <h2 className="mt-1 font-semibold text-lg">{draw.label}</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {drawItem?.data?.name ?? "Reimbursement draw event"} ·{" "}
          {formatTimelineDay(draw.x)}
        </p>
      </div>

      <dl className="grid gap-2 border-border border-t pt-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Planned amount</dt>
          <dd className="font-semibold tabular-nums">{money(draw.amount)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Timing</dt>
          <dd className="font-medium tabular-nums">
            {formatTimelineDay(draw.x)}
          </dd>
        </div>
        {draw.requestStatus ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Request status</dt>
            <dd className="font-medium capitalize">{draw.requestStatus}</dd>
          </div>
        ) : null}
      </dl>

      <FinancialOverviewCard overview={overview} />
    </div>
  );
}

export function MilestonePlanSummaryPanel({
  activeDraw,
  activeItem,
  contractorPlanning,
  drawAvailabilityData,
  onOpenSubmilestone,
  onUpdateMilestoneDrawAvailability,
  onUpdateSubmilestoneBudget,
  onUpdateSubmilestoneDuration,
  overview,
  range,
}: {
  activeDraw: DemoDraw | null;
  activeItem: TimelineItem<DemoMilestone>;
  contractorPlanning?: ContractorPlanningModel | null;
  drawAvailabilityData: DrawAvailabilityDatum[];
  onOpenSubmilestone?: (submilestoneId: Id<"buildSubmilestones">) => void;
  onUpdateMilestoneDrawAvailability?: (itemId: string, amount: number) => void;
  onUpdateSubmilestoneBudget?: (
    itemId: string,
    submilestoneKey: string,
    budgetCents: number
  ) => void;
  onUpdateSubmilestoneDuration?: (
    itemId: string,
    submilestoneKey: string,
    durationDays: number
  ) => void;
  overview: FinancialOverview;
  range: Required<TimelineRange>;
}) {
  const milestone = activeItem.data;

  if (!milestone) {
    return null;
  }
  const drawAvailabilityAmount = getMilestoneDrawAvailabilityAmount(
    milestone,
    DEFAULT_BORROWER_CO_PAY_BPS
  );
  const cumulativeDrawPosition = resolveMilestoneCumulativeDrawPosition(
    activeItem,
    drawAvailabilityData,
    range
  );

  return (
    <div className="grid gap-4" data-testid="selected-milestone-plan-summary">
      <div>
        <div className="mb-3 grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
          <ReceiptText className="size-5" />
        </div>
        <p className="font-semibold text-[10px] text-muted-foreground uppercase">
          Planned milestone
        </p>
        <h2 className="mt-1 font-semibold text-lg">{milestone.name}</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Scheduled from {formatTimelineDay(activeItem.x)} to{" "}
          {formatTimelineDay(getMilestoneEndX(activeItem))}
        </p>
        <Badge className="mt-3" variant="outline">
          Proposal planning
        </Badge>
      </div>

      <dl className="grid gap-2 border-border border-t pt-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Milestone cost</dt>
          <dd className="font-semibold tabular-nums">
            {money(milestone.amount)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Draw availability unlocked</dt>
          <dd className="font-semibold tabular-nums">
            <EditableNumberChip
              ariaLabel="Draw availability unlocked"
              disabled={!onUpdateMilestoneDrawAvailability}
              formatDisplay={(value) => money(value)}
              inputWidth="5.75rem"
              min={0}
              onCommit={(amount) =>
                onUpdateMilestoneDrawAvailability?.(activeItem.id, amount)
              }
              prefix="$"
              reserveWidth="7.25rem"
              size="metric-sm"
              step={1000}
              testId={`timeline-selected-milestone-draw-availability-${activeItem.id}`}
              value={drawAvailabilityAmount}
              weight="semibold"
            />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Duration</dt>
          <dd className="font-medium tabular-nums">
            {milestone.durationDays} days
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Draw date</dt>
          <dd className="font-medium tabular-nums">
            {formatTimelineDay(
              resolveSelectedDrawDate(activeItem, activeDraw, range)
            )}
          </dd>
        </div>
      </dl>

      <section
        aria-label="Cumulative draw position at milestone unlock"
        className="grid gap-2 rounded-lg border border-sky-500/25 bg-sky-500/10 p-3"
        data-testid="selected-milestone-cumulative-draw-position"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-[10px] text-sky-700 uppercase dark:text-sky-200">
              Cumulative through unlock
            </p>
            <p className="mt-0.5 text-muted-foreground text-xs">
              As of {formatTimelineDay(cumulativeDrawPosition.day)} (includes
              this milestone&apos;s unlock)
            </p>
          </div>
        </div>
        <dl className="grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Total unlocked</dt>
            <dd
              className="font-semibold tabular-nums"
              data-testid="selected-milestone-total-unlocked"
            >
              {money(cumulativeDrawPosition.totalUnlocked)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Total drawn</dt>
            <dd
              className="font-semibold tabular-nums"
              data-testid="selected-milestone-total-drawn"
            >
              {money(cumulativeDrawPosition.totalDrawn)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Available to draw</dt>
            <dd
              className="font-semibold tabular-nums"
              data-testid="selected-milestone-available-to-draw"
            >
              {money(cumulativeDrawPosition.availableToDraw)}
            </dd>
          </div>
        </dl>
      </section>

      <TimelineMilestoneSubmilestoneList
        fallbackBudgetCents={dollarsToCents(milestone.amount)}
        milestoneKey={activeItem.id}
        onOpenSubmilestone={onOpenSubmilestone}
        onUpdateBudget={
          onUpdateSubmilestoneBudget
            ? (submilestoneKey, budgetCents) =>
                onUpdateSubmilestoneBudget(
                  activeItem.id,
                  submilestoneKey,
                  budgetCents
                )
            : undefined
        }
        onUpdateDuration={
          onUpdateSubmilestoneDuration
            ? (submilestoneKey, durationDays) =>
                onUpdateSubmilestoneDuration(
                  activeItem.id,
                  submilestoneKey,
                  durationDays
                )
            : undefined
        }
        submilestones={resolveMilestoneSubmilestones(milestone, activeItem.id)}
        testIdPrefix="timeline-selected-milestone-submilestone"
      />

      <TimelineMilestoneContractorList
        milestoneKey={activeItem.id}
        planning={contractorPlanning}
        testIdPrefix="timeline-selected-milestone-contractor"
      />

      <FinancialOverviewCard overview={overview} />
    </div>
  );
}

export function TimelineModificationRequestsPanel({
  onReviewModificationRequest,
  requests,
}: {
  onReviewModificationRequest: (
    request: TimelineModificationRequestView,
    review: { note?: string; status: "approved" | "rejected" }
  ) => void;
  requests: TimelineModificationRequestView[];
}) {
  const pendingRequests = requests.filter(
    (request) => request.status === "requested"
  );

  if (pendingRequests.length === 0) {
    return null;
  }

  return (
    <section
      className="grid gap-3 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3"
      data-testid="timeline-modification-requests-panel"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-[10px] text-amber-800 uppercase dark:text-amber-100">
            Requested timeline changes
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            Structural edits apply only after lender admin approval.
          </p>
        </div>
        <Badge variant="warning">{pendingRequests.length}</Badge>
      </div>
      <div className="grid gap-2">
        {pendingRequests.map((request, index) => (
          <div
            className="grid gap-2 rounded-md border border-border bg-background/80 p-2"
            data-testid={`timeline-modification-request-${request._id ?? index}`}
            key={request._id ?? `${request.requestType}-${index}`}
          >
            <div>
              <p className="font-medium text-sm">
                {getTimelineModificationRequestTitle(request)}
              </p>
              <p className="mt-0.5 text-muted-foreground text-xs">
                {getTimelineModificationRequestDetail(request)}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                disabled={!request._id}
                onClick={() =>
                  onReviewModificationRequest(request, {
                    status: "rejected",
                  })
                }
                size="xs"
                type="button"
                variant="outline"
              >
                Reject
              </Button>
              <Button
                disabled={!request._id}
                onClick={() =>
                  onReviewModificationRequest(request, {
                    status: "approved",
                  })
                }
                size="xs"
                type="button"
              >
                Approve
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function getTimelineModificationRequestTitle(
  request: TimelineModificationRequestView
) {
  if (request.requestType === "createMilestone") {
    return "Request milestone";
  }

  if (request.requestType === "deleteMilestone") {
    return "Request deletion";
  }

  return "Request budget change";
}

export function getTimelineModificationRequestDetail(
  request: TimelineModificationRequestView
) {
  if (request.requestType === "createMilestone") {
    return request.requestedPayload?.milestone?.name ?? "New milestone";
  }

  if (request.requestType === "deleteMilestone") {
    return request.milestoneKey ?? "Milestone deletion";
  }

  const requestedBudget =
    typeof request.requestedPayload?.budgetCents === "number"
      ? money(request.requestedPayload.budgetCents / 100)
      : "requested budget";
  return `${request.milestoneKey ?? "Milestone"} to ${requestedBudget}`;
}

export function TimelineRoleSwitcher({
  onRoleChange,
  role,
}: {
  onRoleChange: (role: TimelineDemoRole) => void;
  role: TimelineDemoRole;
}) {
  const options = [
    {
      icon: UserRound,
      id: "builder" as const,
      label: "Builder",
      sublabel: "Borrower",
    },
    {
      icon: ShieldCheck,
      id: "lender" as const,
      label: "Lender",
      sublabel: "Backoffice",
    },
  ];

  return (
    <div
      aria-label="Timeline role"
      className="grid grid-cols-2 rounded-lg border border-border bg-background p-0.5 shadow-xs"
      data-testid="timeline-role-switcher"
      role="group"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = role === option.id;

        return (
          <button
            aria-pressed={active}
            className={cn(
              "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-left font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-foreground text-background shadow-xs"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            )}
            data-testid={`timeline-role-${option.id}`}
            key={option.id}
            onClick={() => onRoleChange(option.id)}
            type="button"
          >
            <Icon className="size-3.5" />
            <span className="grid leading-tight">
              <span>{option.label}</span>
              <span className="hidden text-[9px] opacity-70 xl:block">
                {option.sublabel}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
