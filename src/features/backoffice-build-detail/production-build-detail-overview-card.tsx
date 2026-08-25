"use client";
import {
  Pencil,
} from "lucide-react";
import {
  lazy,
  useCallback,
  useMemo,
  useState,
} from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, } from "#/components/ui/frame.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs.tsx";
import type { BuildDetailTarget } from "#/features/build-detail-targets/buildDetailTarget.ts";
import type { BuildDetailTargetContext } from "#/features/build-detail-targets/useBuildDetailTargetController.ts";
import {
  BuildFundingWorkspace,
  projectBuildFunding,
} from "#/features/build-funding/BuildFundingWorkspace.tsx";
import {
  type DrawWorkflowCapabilities,
} from "#/features/draw-workflow/drawWorkflow.ts";
import {
  type BuildDetailSubTab,
} from "./BuildDetailTabs";

const LazyFieldRichTextPreview = lazy(() =>
  import("#/components/rich-text/field-rich-text.tsx").then((m) => ({
    default: m.FieldRichTextPreview,
  }))
);

import type {
  ProductionBuildDetail,
  ProductionBuildDetailActions,
  ProductionBuildProjection,
  ProductionDraw,
  ProductionDrawId,
  ProductionDrawStatus,
  ProductionMilestone,
} from "./production-build-detail-contracts.ts";
import {
  CurrentActiveDrawRequestsSection,
  CurrentMilestoneHorizonSection,
} from "./production-build-detail-overview-horizon.tsx";
import {
  BuildNonFinancialDetailsSheet,
} from "./production-build-detail-build-sheets.tsx";
import {
  BudgetRevisionCard,
  FacilityChangeRequestsCard,
} from "./production-build-detail-draws.tsx";
import {
  BuildMetadataPanel,
  DrawOverviewPanel,
  LoanMetadataPanel,
} from "./production-build-detail-draw-overview.tsx";
import {
  buildCurrentBuildOverview,
  compareDrawsMostRecentFirst,
} from "./production-build-detail-projection.ts";
import {
  fundingRejectAction,
  fundingRequestAction,
} from "./production-build-detail-header.tsx";

export function ProductionBuildDetailsCard({
  activeSection,
  actions,
  currentDay,
  detail,
  drawCapabilities,
  fundingWorkspaceEnabled,
  onChangeTab,
  onOpenCanonicalTarget,
  onOpenMilestone,
  onSectionChange,
  projection,
  viewerRole,
}: {
  activeSection: BuildOverviewSection;
  actions?: ProductionBuildDetailActions;
  currentDay: number;
  detail: ProductionBuildDetail;
  drawCapabilities: DrawWorkflowCapabilities;
  fundingWorkspaceEnabled: boolean;
  onChangeTab: (tab: BuildDetailSubTab, focus?: string) => void;
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext
  ) => void;
  onOpenMilestone: (milestoneKey: string) => void;
  onSectionChange: (section: BuildOverviewSection) => void;
  projection: ProductionBuildProjection;
  viewerRole: "builder" | "lender";
}) {
  const currentOverview = useMemo(
    () => buildCurrentBuildOverview(detail, projection, currentDay),
    [currentDay, detail, projection]
  );
  const siteVisitsOpen =
    detail.siteVisits?.filter((visit) => visit.status === "requested").length ??
    0;
  const openWarnings =
    projection.draws.filter((draw) => draw.status === "rejected").length +
    (detail.sitePhotos?.filter((photo) => photo.locationVerified === false)
      .length ?? 0);
  const [editOpen, setEditOpen] = useState(false);
  const openDraw = useCallback(
    (draw: ProductionDraw) => {
      if (!draw._id) {
        return;
      }
      if (onOpenCanonicalTarget) {
        onOpenCanonicalTarget({
          drawId: draw._id as ProductionDrawId,
          kind: "draw",
        });
        return;
      }
      onChangeTab("details", `draw:${draw._id}`);
    },
    [onChangeTab, onOpenCanonicalTarget]
  );
  return (
    <>
      <section
        className="min-w-0"
        data-testid="production-build-details-card"
        id="ui-build-details"
      >
        <header className="mb-1 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-sm">Build Overview</h2>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-muted-foreground text-xs">active_builds</span>
            {actions?.updateNonFinancialDetails ? (
              <Button
                aria-label="Edit build details"
                data-testid="edit-build-details-trigger"
                onClick={() => setEditOpen(true)}
                size="icon-xs"
                type="button"
                variant="outline"
              >
                <Pencil aria-hidden="true" className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </header>
        <Tabs
          onValueChange={(value) =>
            onSectionChange(value as BuildOverviewSection)
          }
          value={activeSection}
        >
          <TabsList
            aria-label="Build overview sections"
            className="mt-2 mb-4"
            variant="underline"
          >
            <TabsTab data-testid="build-overview-tab-current" value="current">
              Current
            </TabsTab>
            <TabsTab data-testid="build-overview-tab-draws" value="draws">
              Draws
            </TabsTab>
            <TabsTab data-testid="build-overview-tab-build" value="build">
              Build
            </TabsTab>
            <TabsTab data-testid="build-overview-tab-loan" value="loan">
              Loan
            </TabsTab>
          </TabsList>

          <TabsPanel value="current">
            <CurrentBuildOverviewPanel
              actions={actions}
              currentDay={currentDay}
              currentOverview={currentOverview}
              detail={detail}
              drawCapabilities={drawCapabilities}
              onOpenDraw={openDraw}
              onReviewMilestone={(milestone) => onOpenMilestone(milestone.key)}
              projection={projection}
              viewerRole={viewerRole}
            />
          </TabsPanel>

          <TabsPanel value="draws">
            <div className="space-y-4">
              {fundingWorkspaceEnabled ||
              (viewerRole === "builder" &&
                (actions?.requestDrawAmount ||
                  detail.plannedDraws !== undefined)) ? (
                <BuildFundingWorkspace
                  drawCapabilities={drawCapabilities}
                  model={projectBuildFunding({
                    availability: detail.drawFunding,
                    builder: detail.builderContact,
                    canRequest: Boolean(actions?.requestDrawAmount),
                    buildLabel: detail.build.buildName,
                    facilityCents: detail.loanFacility?.principalCents,
                    location: detail.build.location,
                    milestones: detail.milestones,
                    plannedDraws:
                      detail.plannedDraws ??
                      detail.draws.filter((draw) => draw.status === "planned"),
                    requests: detail.draws.filter(
                      (
                        draw
                      ): draw is ProductionDraw & {
                        status: Exclude<ProductionDrawStatus, "planned">;
                      } => draw.status !== "planned"
                    ),
                    startDate: detail.build.startDate,
                  })}
                  onApproveDraw={fundingRequestAction(
                    detail.draws,
                    actions?.approveDraw
                  )}
                  onOpenDrawCollaboration={(request) =>
                    onChangeTab(
                      "collaboration",
                      `draw:${request._id ?? request.drawKey}`
                    )
                  }
                  onOpenMilestone={onOpenMilestone}
                  onRejectDraw={fundingRejectAction(
                    detail.draws,
                    actions?.rejectDraw
                  )}
                  onReleaseDraw={fundingRequestAction(
                    detail.draws,
                    actions?.releaseDraw
                  )}
                  onRequestDraw={actions?.requestDrawAmount}
                  onStartDrawReview={fundingRequestAction(
                    detail.draws,
                    actions?.startDrawReview
                  )}
                  onSubmitDrawForAdmin={fundingRequestAction(
                    detail.draws,
                    actions?.submitDrawForAdmin
                  )}
                  onWithdrawDraw={
                    actions?.withdrawDraw
                      ? async (requestKey) =>
                          await actions.withdrawDraw?.(requestKey)
                      : undefined
                  }
                  viewerRole={viewerRole}
                />
              ) : (
                <DrawOverviewPanel
                  actions={actions}
                  currentOverview={currentOverview}
                  detail={detail}
                  drawCapabilities={drawCapabilities}
                  onOpenDraw={openDraw}
                  projection={projection}
                  viewerRole={viewerRole}
                />
              )}
              <FacilityChangeRequestsCard actions={actions} detail={detail} />
              <BudgetRevisionCard
                actions={actions}
                detail={detail}
                viewerRole={viewerRole}
              />
            </div>
          </TabsPanel>

          <TabsPanel value="build">
            <BuildMetadataPanel
              detail={detail}
              openWarnings={openWarnings}
              projection={projection}
              siteVisitsOpen={siteVisitsOpen}
            />
          </TabsPanel>

          <TabsPanel value="loan">
            <LoanMetadataPanel
              currentOverview={currentOverview}
              detail={detail}
              projection={projection}
            />
          </TabsPanel>
        </Tabs>
      </section>
      {actions?.updateNonFinancialDetails ? (
        <BuildNonFinancialDetailsSheet
          detail={detail}
          onOpenChange={setEditOpen}
          onSubmit={actions.updateNonFinancialDetails}
          open={editOpen}
        />
      ) : null}
    </>
  );
}

interface CurrentMilestoneHorizon {
  behindSchedule: ProductionMilestone[];
  current: ProductionMilestone[];
  next: ProductionMilestone | null;
}

interface CurrentBuildOverview {
  committedDrawCents: number;
  currentAvailabilityCents: number;
  drawnCents: number;
  milestoneHorizon: CurrentMilestoneHorizon;
  percentComplete: number;
  requestableAmountCents: number;
  totalApprovedCents: number;
  upcomingDraw: ProductionDraw | null;
}

function CurrentBuildOverviewPanel({
  actions,
  currentDay,
  currentOverview,
  detail,
  drawCapabilities,
  onReviewMilestone,
  onOpenDraw,
  projection,
  viewerRole,
}: {
  actions?: ProductionBuildDetailActions;
  currentDay: number;
  currentOverview: CurrentBuildOverview;
  detail: ProductionBuildDetail;
  drawCapabilities: DrawWorkflowCapabilities;
  onReviewMilestone: (milestone: ProductionMilestone) => void;
  onOpenDraw?: (draw: ProductionDraw) => void;
  projection: ProductionBuildProjection;
  viewerRole: "builder" | "lender";
}) {
  const horizon = currentOverview.milestoneHorizon;
  const activeDrawRequests = useMemo(
    () =>
      projection.draws
        .filter(
          (draw) =>
            draw.status === "requested" ||
            draw.status === "in_review" ||
            draw.status === "ready_for_admin" ||
            draw.status === "approved_for_release"
        )
        .slice()
        .sort(compareDrawsMostRecentFirst),
    [projection.draws]
  );
  const [pendingDrawAction, setPendingDrawAction] = useState<string | null>(
    null
  );
  const [drawActionError, setDrawActionError] = useState("");
  const runDrawAction = async (
    actionKey: string,
    draw: ProductionDraw,
    fn?: (draw: ProductionDraw) => Promise<unknown> | unknown
  ) => {
    if (!fn || pendingDrawAction) {
      return false;
    }
    setPendingDrawAction(`${actionKey}:${draw.drawKey}`);
    setDrawActionError("");
    try {
      await fn(draw);
      return true;
    } catch (cause) {
      setDrawActionError(
        cause instanceof Error ? cause.message : "Unable to update draw."
      );
      return false;
    } finally {
      setPendingDrawAction(null);
    }
  };

  return (
    <div className="grid gap-4" data-testid="build-overview-current-panel">
      <CurrentActiveDrawRequestsSection
        actions={actions}
        activeDrawRequests={activeDrawRequests}
        detail={detail}
        drawActionError={drawActionError}
        drawCapabilities={drawCapabilities}
        onOpenDraw={onOpenDraw}
        onRunAction={runDrawAction}
        pendingActionKey={pendingDrawAction}
        viewerRole={viewerRole}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-semibold text-sm">Schedule horizon</h3>
          <p className="text-muted-foreground text-xs">
            Timing, ownership, and approved budget against the Build roadmap.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge size="sm" variant="outline">
            Build day {currentDay}
          </Badge>
          <Badge size="sm" variant="info">
            {currentOverview.percentComplete}% complete
          </Badge>
        </div>
      </div>

      <Frame data-testid="current-milestone-horizon">
        <CurrentMilestoneHorizonSection
          currentDay={currentDay}
          description="Incomplete work past its planned end date."
          detail={detail}
          emptyMessage="No milestones are behind schedule."
          lane="behind-schedule"
          milestones={horizon.behindSchedule}
          onReviewMilestone={onReviewMilestone}
          projection={projection}
          title="Behind Schedule Milestones"
          viewerRole={viewerRole}
        />
        <CurrentMilestoneHorizonSection
          currentDay={currentDay}
          description="Active work and completion submissions in flight."
          detail={detail}
          emptyMessage="No milestones are currently active."
          lane="current"
          milestones={horizon.current}
          onReviewMilestone={onReviewMilestone}
          projection={projection}
          title="Current Milestones"
          viewerRole={viewerRole}
        />
        <CurrentMilestoneHorizonSection
          currentDay={currentDay}
          description="The next incomplete milestone in the approved roadmap."
          detail={detail}
          emptyMessage="No upcoming milestone remains."
          lane="next-upcoming"
          milestones={horizon.next ? [horizon.next] : []}
          onReviewMilestone={onReviewMilestone}
          projection={projection}
          title="Next Upcoming Milestone"
          viewerRole={viewerRole}
        />
      </Frame>
    </div>
  );
}
