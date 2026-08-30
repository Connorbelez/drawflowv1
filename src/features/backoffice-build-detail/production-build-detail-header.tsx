"use client";

import { CatchBoundary } from "@tanstack/react-router";
import {
  MapPin,
  RefreshCw,
  ScrollText,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useEffect,
  useState,
} from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import {
  type BuildDetailSheetHostState,
} from "#/features/build-detail-targets/BuildDetailSheetHost.tsx";
import type { BuildSubmilestoneDetailTab } from "#/features/build-detail-targets/buildDetailTab.ts";
import type { BuildDetailTarget } from "#/features/build-detail-targets/buildDetailTarget.ts";
import type { BuildDetailTargetContext } from "#/features/build-detail-targets/useBuildDetailTargetController.ts";
import {
  type FundingRejectDecision,
  type FundingRequestRecord,
} from "#/features/build-funding/BuildFundingWorkspace.tsx";
import {
  BuildPermitViewerDrawer,
  firstPermitDocument,
} from "#/features/build-permit-viewer/BuildPermitViewerDrawer.tsx";
import {
  type DrawWorkflowCapabilities,
} from "#/features/draw-workflow/drawWorkflow.ts";
import { cn } from "#/lib/utils.ts";
import {
  type BuildDetailSubTab,
} from "./BuildDetailTabs";
import {
  BuildDetailTabFallback,
  DeferredBuildCollaborationWorkspace,
} from "./lazy-build-detail-tabs.tsx";

const LazyFieldRichTextPreview = lazy(() =>
  import("#/components/rich-text/field-rich-text.tsx").then((m) => ({
    default: m.FieldRichTextPreview,
  }))
);

import { formatCents, formatDate, } from "./format";
import { SitePhotoCarousel } from "./SitePhotoCarousel";
import type {
  ProductionBuildDetail,
  ProductionBuildDetailActions,
  ProductionBuildProjection,
  ProductionDraw,
  ProductionViewerCapacity,
} from "./production-build-detail-contracts.ts";
import { ProductionBuildDetailsCard } from "./production-build-detail-overview-card.tsx";
import { statusBadgeVariant } from "./production-build-detail-evidence-utils.ts";
import { statusLabel } from "./production-build-detail-projection.ts";

export function ProductionBuildHeader({
  breadcrumbRootHref,
  breadcrumbRootLabel,
  breadcrumbSectionHref,
  breadcrumbSectionLabel,
  detail,
  eventCount,
  onOpenEvents,
  permit,
}: {
  breadcrumbRootHref: string;
  breadcrumbRootLabel: string;
  breadcrumbSectionHref: string;
  breadcrumbSectionLabel: string;
  detail: ProductionBuildDetail;
  eventCount: number;
  onOpenEvents: () => void;
  permit: ReturnType<typeof firstPermitDocument>;
}) {
  return (
    <Frame>
      <FramePanel className="flex flex-col gap-4 p-3 sm:p-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <nav
            aria-label="Breadcrumbs"
            className="mb-3 flex min-w-0 items-center gap-2 overflow-x-auto text-muted-foreground text-xs"
          >
            <a className="hover:text-foreground" href={breadcrumbRootHref}>
              {breadcrumbRootLabel}
            </a>
            <span>/</span>
            <a className="hover:text-foreground" href={breadcrumbSectionHref}>
              {breadcrumbSectionLabel}
            </a>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusBadgeVariant(detail.build.status)}>
              {statusLabel(detail.build.status)}
            </Badge>
            <span className="text-muted-foreground text-xs">
              Production active Build
            </span>
          </div>
          <h1 className="mt-2 max-w-full text-wrap break-words font-semibold text-xl tracking-tight sm:text-2xl">
            {detail.build.buildName}
          </h1>
          <p className="mt-1 flex min-w-0 items-start gap-1.5 text-muted-foreground text-sm">
            <MapPin className="size-4" />
            <span className="min-w-0 text-wrap break-words">
              {detail.build.location}
            </span>
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 md:min-w-72 md:max-w-sm">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <BuildPermitViewerDrawer permit={permit} size="sm" />
            <Button
              data-testid="build-detail-events-trigger"
              onClick={onOpenEvents}
              size="sm"
              type="button"
              variant="outline"
            >
              <ScrollText aria-hidden="true" className="size-4" />
              Events
              {eventCount > 0 ? (
                <Badge
                  className="ml-1 tabular-nums"
                  size="sm"
                  variant="secondary"
                >
                  {eventCount}
                </Badge>
              ) : null}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <HeaderStat
              label="Start"
              value={formatDate(detail.build.startDate)}
            />
            <HeaderStat
              label="Budget"
              value={formatCents(detail.build.totalBudgetCents)}
            />
          </div>
        </div>
      </FramePanel>
    </Frame>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-background/60 px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="truncate font-medium tabular-nums">{value}</p>
    </div>
  );
}

function BuildCollaborationErrorFallback({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <Frame data-testid="build-collaboration-error">
      <FramePanel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium text-sm">
            Collaboration is temporarily unavailable
          </p>
          <p className="mt-1 text-muted-foreground text-sm">
            Build Overview is still available. Retry this workspace without
            reloading the Build.
          </p>
        </div>
        <Button onClick={reset} size="sm" type="button" variant="outline">
          <RefreshCw aria-hidden="true" className="size-4" />
          Retry collaboration
        </Button>
      </FramePanel>
    </Frame>
  );
}

export function ProductionDetailsTab({
  actions,
  currentDay,
  detail,
  detailSheetHost,
  detailTab,
  drawCapabilities,
  focusedReference,
  fundingWorkspaceEnabled,
  onChangeTab,
  onFocusReference,
  onOpenCanonicalTarget,
  onOpenMilestone,
  projection,
  viewerCapacity,
  viewerRole,
  workosOrganizationId,
}: {
  actions?: ProductionBuildDetailActions;
  currentDay: number;
  detail: ProductionBuildDetail;
  detailSheetHost?: BuildDetailSheetHostState;
  detailTab?: BuildSubmilestoneDetailTab;
  drawCapabilities: DrawWorkflowCapabilities;
  focusedReference?: string;
  fundingWorkspaceEnabled: boolean;
  onChangeTab: (tab: BuildDetailSubTab, focus?: string) => void;
  onFocusReference: (focus?: string) => void;
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext
  ) => void;
  onOpenMilestone: (milestoneKey: string) => void;
  projection: ProductionBuildProjection;
  viewerCapacity?: ProductionViewerCapacity;
  viewerRole: "builder" | "lender";
  workosOrganizationId?: string;
}) {
  const [activeOverviewSection, setActiveOverviewSection] =
    useState<BuildOverviewSection>("current");
  useEffect(() => {
    if (focusedReference?.startsWith("draw:")) {
      setActiveOverviewSection("draws");
    }
  }, [focusedReference]);

  const showSitePhotos = activeOverviewSection !== "draws";

  return (
    <div className="flex flex-col gap-6" data-testid="production-build-details">
      <section
        className={cn(
          "grid items-stretch",
          showSitePhotos &&
            "xl:grid-cols-[minmax(0,2fr)_auto_minmax(320px,1fr)]"
        )}
        data-testid="build-overview-layout"
      >
        <ProductionBuildDetailsCard
          actions={actions}
          activeSection={activeOverviewSection}
          currentDay={currentDay}
          detail={detail}
          drawCapabilities={drawCapabilities}
          fundingWorkspaceEnabled={fundingWorkspaceEnabled}
          onChangeTab={onChangeTab}
          onOpenCanonicalTarget={onOpenCanonicalTarget}
          onOpenMilestone={onOpenMilestone}
          onSectionChange={setActiveOverviewSection}
          projection={projection}
          viewerRole={viewerRole}
        />
        {showSitePhotos ? (
          <>
            <Separator className="my-5 xl:hidden" />
            <Separator
              className="mx-5 hidden xl:block"
              orientation="vertical"
            />
            <SitePhotoCarousel
              buildName={detail.build.buildName}
              photos={detail.sitePhotos ?? []}
              siteAddress={detail.build.location}
              siteLatitude={detail.build.locationLatitude}
              siteLongitude={detail.build.locationLongitude}
            />
          </>
        ) : null}
      </section>

      <header className="scroll-mt-24 space-y-1" id="build-collaboration">
        <h2 className="font-semibold text-xl leading-snug">
          Build collaboration
        </h2>
        <p className="text-muted-foreground text-sm">
          Coordinate updates, linked Build work, decisions, and Action Items
          with every authorized participant.
        </p>
      </header>

      <CatchBoundary
        errorComponent={BuildCollaborationErrorFallback}
        getResetKey={() =>
          `${detail.build._id}:${workosOrganizationId ?? "unscoped"}`
        }
      >
        <Suspense fallback={<BuildDetailTabFallback label="collaboration" />}>
          <DeferredBuildCollaborationWorkspace
            buildId={detail.build._id}
            detailSheetHost={detailSheetHost}
            detailTab={detailTab}
            drawCapabilities={drawCapabilities}
            eager={Boolean(focusedReference)}
            focusedReference={focusedReference}
            onOpenReference={(reference) => {
              const nextFocus = `${reference.entityKind}:${reference.entityId}`;
              onFocusReference(nextFocus);
              if (reference.entityKind === "milestone") {
                const milestone = detail.milestones.find(
                  (candidate) => candidate._id === reference.entityId
                );
                onChangeTab("details", nextFocus);
                if (milestone) {
                  onOpenMilestone(milestone.key);
                }
                return;
              }
              if (reference.entityKind === "submilestone") {
                const submilestone = detail.submilestones.find(
                  (candidate) => candidate._id === reference.entityId
                );
                if (onOpenCanonicalTarget && submilestone) {
                  onOpenCanonicalTarget(
                    {
                      kind: "submilestone",
                      submilestoneId: submilestone._id,
                    },
                    { selectedTab: "collaboration" }
                  );
                  return;
                }
                if (!onOpenCanonicalTarget) {
                  onChangeTab("details", nextFocus);
                }
                return;
              }
              if (reference.entityKind === "draw") {
                setActiveOverviewSection("draws");
                document
                  .querySelector(
                    '[data-testid="production-build-details-card"]'
                  )
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
              }
              const tabByKind: Partial<Record<string, BuildDetailSubTab>> = {
                actionItem: "details",
                document: "documents",
                evidenceAsset: "evidence",
                evidencePackage: "evidence",
                material: "materials",
                participant: "details",
                siteVisit: "calendar",
              };
              const tab = tabByKind[reference.entityKind];
              if (tab) {
                onChangeTab(tab, nextFocus);
              }
            }}
            organizationId={workosOrganizationId}
            viewerCapacity={viewerCapacity}
          />
        </Suspense>
      </CatchBoundary>
    </div>
  );
}

type BuildOverviewSection = "current" | "draws" | "build" | "loan";

export function fundingRequestAction(
  draws: ProductionDraw[],
  action?: (draw: ProductionDraw) => Promise<unknown> | unknown
) {
  if (!action) {
    return;
  }
  return (request: FundingRequestRecord) => {
    const draw = draws.find((row) => row.drawKey === request.drawKey);
    if (!draw) {
      throw new Error("This draw request is no longer available.");
    }
    return action(draw);
  };
}

export function fundingRejectAction(
  draws: ProductionDraw[],
  action?: ProductionBuildDetailActions["rejectDraw"]
) {
  if (!action) {
    return;
  }
  return (decision: FundingRejectDecision) => {
    const draw = draws.find((row) => row.drawKey === decision.request.drawKey);
    if (!draw) {
      throw new Error("This draw request is no longer available.");
    }
    return action({ draw, reason: decision.reason });
  };
}
