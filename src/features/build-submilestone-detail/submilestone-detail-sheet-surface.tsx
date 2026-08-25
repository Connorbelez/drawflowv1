"use client";

import { CalendarDays, UserRound } from "lucide-react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  SheetDescription,
  SheetPanel,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs.tsx";
import { BuildDetailTargetHeader } from "../build-detail-targets/BuildDetailTargetHeader.tsx";
import {
  BUILD_SUBMILESTONE_DETAIL_TABS,
  normalizeBuildSubmilestoneDetailTab,
} from "../build-detail-targets/buildDetailTab.ts";
import { SubmilestoneCollaborationPanel } from "./SubmilestoneCollaborationPanel.tsx";
import {
  CanonicalSubmilestoneTabPanel,
  type CanonicalWorkspaceBootstrap,
  type CanonicalWorkspaceCollection,
  isCanonicalSubmilestoneSuperseded,
} from "./SubmilestoneDetailCanonical.tsx";
import { SubmilestoneReviewTab } from "./SubmilestoneReviewTab.tsx";
import type {
  BuildCollaborationRole,
  BuildSubmilestoneDetailTab,
  CanonicalDirtySection,
  CostDocumentSummary,
  Id,
  NavigationProps,
  SubmilestoneDetailSheetProps,
  VisibleWorkspaceBootstrap,
  WorkspaceCollectionResult,
} from "./submilestone-detail-sheet-contracts.ts";
import {
  formatCents,
  isVisibleWorkspaceCollection,
  scheduleLabel,
  statusBadgeVariant,
  statusLabel,
  TAB_LABELS,
} from "./submilestone-detail-sheet-contracts.ts";

interface ActiveTabContentProps {
  activeTab: BuildSubmilestoneDetailTab;
  bootstrap: VisibleWorkspaceBootstrap;
  buildId: Id<"activeBuilds">;
  buildSubmilestoneId: Id<"buildSubmilestones">;
  collection: WorkspaceCollectionResult | undefined;
  companionActionItemId?: Id<"buildActionItems">;
  costDocuments: CostDocumentSummary[];
  historyCollection: WorkspaceCollectionResult | undefined;
  loadingMore: boolean;
  onDirtyChange?: (section: CanonicalDirtySection, dirty: boolean) => void;
  onLoadMore: () => void;
  onOpenCostDocument?: SubmilestoneDetailSheetProps["onOpenCostDocument"];
  onOpenScopeAndGuidance: () => void;
  onOpenTarget?: SubmilestoneDetailSheetProps["onOpenTarget"];
  onReferenceOpen?: SubmilestoneDetailSheetProps["onReferenceOpen"];
  onRetry?: () => void;
  organizationId: string;
  readOnly: boolean;
  requirementsCollection: WorkspaceCollectionResult | undefined;
  superseded: boolean;
  tab: BuildSubmilestoneDetailTab;
  viewerCapacity?: BuildCollaborationRole;
}

function ActiveTabContent({
  activeTab,
  bootstrap,
  buildId,
  buildSubmilestoneId,
  collection,
  companionActionItemId,
  costDocuments,
  historyCollection,
  loadingMore,
  onDirtyChange,
  onLoadMore,
  onOpenCostDocument,
  onOpenScopeAndGuidance,
  onOpenTarget,
  onReferenceOpen,
  onRetry,
  organizationId,
  readOnly,
  requirementsCollection,
  superseded,
  tab,
  viewerCapacity,
}: ActiveTabContentProps) {
  if (activeTab !== tab) {
    return null;
  }
  if (tab === "overview") {
    return (
      <CanonicalSubmilestoneTabPanel
        bootstrap={bootstrap as unknown as CanonicalWorkspaceBootstrap}
        buildId={buildId}
        buildSubmilestoneId={buildSubmilestoneId}
        collection={undefined}
        companionActionItemId={companionActionItemId}
        onDirtyChange={onDirtyChange}
        onRetry={onRetry}
        organizationId={organizationId}
        readOnly={readOnly}
        tab="overview"
        viewerCapacity={viewerCapacity}
      />
    );
  }
  if (tab === "evidence" || tab === "people" || tab === "materials") {
    return (
      <CanonicalCollectionSurface
        bootstrap={bootstrap as unknown as CanonicalWorkspaceBootstrap}
        buildId={buildId}
        buildSubmilestoneId={buildSubmilestoneId}
        collection={collection}
        companionActionItemId={companionActionItemId}
        historyCollection={historyCollection}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        onRetry={onRetry}
        organizationId={organizationId}
        readOnly={readOnly}
        requirementsCollection={requirementsCollection}
        tab={tab}
        viewerCapacity={viewerCapacity}
      />
    );
  }
  if (tab === "collaboration") {
    return (
      <SubmilestoneCollaborationPanel
        buildId={buildId}
        buildSubmilestoneId={buildSubmilestoneId}
        canonicalWorkflowRevision={
          bootstrap.revisions.canonicalWorkflowRevision
        }
        collaboration={bootstrap.collaboration}
        collaborationCapabilities={{
          addAttachment:
            bootstrap.capabilities.collaboration.addAttachment.allowed,
          comment: bootstrap.capabilities.collaboration.comment.allowed,
        }}
        companionActionItemId={
          companionActionItemId ?? bootstrap.companion?.actionItemId
        }
        evidencePackageRevision={bootstrap.evidence.evidencePackageRevision}
        evidenceRequirements={bootstrap.evidence.requirements.map(
          (requirement) => ({
            label: requirement.label,
            requirementKey: requirement.requirementKey,
          })
        )}
        expectedReviewRound={bootstrap.review.reviewRound}
        milestoneKey={bootstrap.milestone.key}
        onOpenCanonicalTarget={onOpenTarget}
        onReferenceOpen={onReferenceOpen}
        organizationId={organizationId}
        promoteEvidenceAllowed={
          bootstrap.capabilities.canonical.promoteEvidence.allowed
        }
        readOnly={readOnly}
        structureCapabilities={{
          addChecklist:
            bootstrap.capabilities.collaboration.addChecklist.allowed,
          createChild: bootstrap.capabilities.collaboration.createChild.allowed,
          linkRelation:
            bootstrap.capabilities.collaboration.linkRelation.allowed,
          repairRelation:
            bootstrap.capabilities.collaboration.repairRelation.allowed,
          toggleChecklist:
            bootstrap.capabilities.collaboration.toggleChecklist.allowed,
          unlinkRelation:
            bootstrap.capabilities.collaboration.unlinkRelation.allowed,
        }}
        submilestoneKey={bootstrap.submilestone.key}
        superseded={superseded}
      />
    );
  }
  if (tab === "review") {
    return (
      <SubmilestoneReviewTab
        bootstrap={bootstrap}
        buildId={buildId}
        collection={collection as CanonicalWorkspaceCollection}
        costDocuments={costDocuments}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        onOpenCostDocument={onOpenCostDocument}
        onOpenScopeAndGuidance={onOpenScopeAndGuidance}
        onOpenTarget={onOpenTarget}
        onRetry={onRetry}
        organizationId={organizationId}
        readOnly={readOnly || superseded}
      />
    );
  }
  return (
    <CollectionPanel
      collection={collection}
      loadingMore={loadingMore}
      onLoadMore={onLoadMore}
      tab={tab}
    />
  );
}

export function VisibleState({
  activeTab,
  bootstrap,
  buildId,
  buildSubmilestoneId,
  canGoBack,
  canGoForward,
  collection,
  companionActionItemId,
  costDocuments,
  requirementsCollection,
  historyCollection,
  loadingMore,
  onClose,
  onGoBack,
  onGoForward,
  onLoadMore,
  onRetry,
  onReferenceOpen,
  onOpenCostDocument,
  onOpenScopeAndGuidance,
  onOpenTarget,
  onDirtyChange,
  onTabChange,
  organizationId,
  readOnly,
  viewerCapacity,
}: NavigationProps & {
  activeTab: BuildSubmilestoneDetailTab;
  bootstrap: VisibleWorkspaceBootstrap;
  buildId: Id<"activeBuilds">;
  buildSubmilestoneId: Id<"buildSubmilestones">;
  collection: WorkspaceCollectionResult | undefined;
  companionActionItemId?: Id<"buildActionItems">;
  costDocuments: CostDocumentSummary[];
  requirementsCollection: WorkspaceCollectionResult | undefined;
  historyCollection: WorkspaceCollectionResult | undefined;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRetry?: () => void;
  onReferenceOpen?: SubmilestoneDetailSheetProps["onReferenceOpen"];
  onOpenCostDocument?: SubmilestoneDetailSheetProps["onOpenCostDocument"];
  onOpenScopeAndGuidance: () => void;
  onOpenTarget?: SubmilestoneDetailSheetProps["onOpenTarget"];
  onDirtyChange?: (section: CanonicalDirtySection, dirty: boolean) => void;
  onTabChange: (tab: BuildSubmilestoneDetailTab) => void;
  organizationId: string;
  readOnly: boolean;
  viewerCapacity?: BuildCollaborationRole;
}) {
  const superseded = isCanonicalSubmilestoneSuperseded(bootstrap);
  return (
    <>
      <BuildDetailTargetHeader
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onClose={onClose}
        onGoBack={onGoBack}
        onGoForward={onGoForward}
        targetLabel="Sub-milestone"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            Milestone · {bootstrap.milestone.name}
          </Badge>
          <Badge variant={statusBadgeVariant(bootstrap.submilestone.status)}>
            {statusLabel(bootstrap.submilestone.status)}
          </Badge>
          <Badge variant="secondary">
            Planning · {statusLabel(bootstrap.submilestone.planningState)}
          </Badge>
          {readOnly && !superseded ? (
            <Badge variant="outline">Read-only</Badge>
          ) : null}
        </div>
        <SheetTitle className="min-w-0 break-words pr-8">
          {bootstrap.submilestone.name}
        </SheetTitle>
        <SheetDescription>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <UserRound aria-hidden="true" className="size-3.5" />
              <span title={bootstrap.ownership.reason}>
                {statusLabel(bootstrap.ownership.state)} ·{" "}
                {bootstrap.ownership.reason}
              </span>
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays aria-hidden="true" className="size-3.5" />
              {scheduleLabel(bootstrap)}
            </span>
          </span>
        </SheetDescription>
        {superseded ? (
          <Frame
            aria-live="polite"
            data-testid="submilestone-detail-superseded"
            role="note"
          >
            <FramePanel className="border-warning/35 bg-warning/8 p-3 text-sm">
              <p className="font-medium">Superseded — read-only history</p>
              <p className="mt-1 text-muted-foreground text-xs">
                This Sub-milestone was replaced by an approved planning
                revision. Canonical execution and collaboration commands are
                disabled.
              </p>
            </FramePanel>
          </Frame>
        ) : null}
      </BuildDetailTargetHeader>
      <Tabs
        className="min-h-0 flex-1 gap-0"
        onValueChange={(value) => {
          const nextTab = normalizeBuildSubmilestoneDetailTab(value);
          if (nextTab) {
            onTabChange(nextTab);
          }
        }}
        value={activeTab}
      >
        <div className="shrink-0 border-b px-4 pt-1 sm:px-6">
          <TabsList
            aria-label="Sub-milestone detail sections"
            className="w-full max-w-full justify-start overflow-x-auto motion-reduce:[&_[data-slot=tab-indicator]]:transition-none"
            variant="underline"
          >
            {BUILD_SUBMILESTONE_DETAIL_TABS.map((tab) => (
              <TabsTab key={tab} value={tab}>
                {TAB_LABELS[tab]}
              </TabsTab>
            ))}
          </TabsList>
        </div>
        <SheetPanel className="min-h-0 space-y-5 pb-[env(safe-area-inset-bottom)]">
          {BUILD_SUBMILESTONE_DETAIL_TABS.map((tab) => (
            <TabsPanel className="space-y-4 pt-4" key={tab} value={tab}>
              <ActiveTabContent
                activeTab={activeTab}
                bootstrap={bootstrap}
                buildId={buildId}
                buildSubmilestoneId={buildSubmilestoneId}
                collection={collection}
                companionActionItemId={companionActionItemId}
                costDocuments={costDocuments}
                historyCollection={historyCollection}
                loadingMore={loadingMore}
                onDirtyChange={onDirtyChange}
                onLoadMore={onLoadMore}
                onOpenCostDocument={onOpenCostDocument}
                onOpenScopeAndGuidance={onOpenScopeAndGuidance}
                onOpenTarget={onOpenTarget}
                onReferenceOpen={onReferenceOpen}
                onRetry={onRetry}
                organizationId={organizationId}
                readOnly={readOnly}
                requirementsCollection={requirementsCollection}
                superseded={superseded}
                tab={tab}
                viewerCapacity={viewerCapacity}
              />
            </TabsPanel>
          ))}
        </SheetPanel>
      </Tabs>
    </>
  );
}

export function CanonicalCollectionSurface({
  bootstrap,
  buildId,
  buildSubmilestoneId,
  collection,
  companionActionItemId,
  requirementsCollection,
  historyCollection,
  loadingMore,
  onLoadMore,
  onRetry,
  organizationId,
  readOnly,
  tab,
  viewerCapacity,
}: {
  bootstrap: CanonicalWorkspaceBootstrap;
  buildId: Id<"activeBuilds">;
  buildSubmilestoneId: Id<"buildSubmilestones">;
  collection: WorkspaceCollectionResult | undefined;
  companionActionItemId?: Id<"buildActionItems">;
  requirementsCollection: WorkspaceCollectionResult | undefined;
  historyCollection: WorkspaceCollectionResult | undefined;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRetry?: () => void;
  organizationId: string;
  readOnly: boolean;
  tab: "evidence" | "materials" | "people";
  viewerCapacity?: BuildCollaborationRole;
}) {
  if (collection === undefined || !isVisibleWorkspaceCollection(collection)) {
    return (
      <CollectionPanel
        collection={collection}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        tab={tab}
      />
    );
  }
  const auxiliaryCollection =
    tab === "evidence"
      ? requirementsCollection
      : tab === "people"
        ? historyCollection
        : undefined;
  const auxiliaryIssue =
    auxiliaryCollection !== undefined &&
    !isVisibleWorkspaceCollection(auxiliaryCollection)
      ? auxiliaryCollection
      : undefined;
  return (
    <div className="space-y-3">
      {auxiliaryIssue ? (
        <CollectionPanel
          collection={auxiliaryIssue}
          loadingMore={false}
          onLoadMore={() => undefined}
          tab={tab}
        />
      ) : null}
      <CanonicalSubmilestoneTabPanel
        bootstrap={bootstrap}
        buildId={buildId}
        buildSubmilestoneId={buildSubmilestoneId}
        collection={collection as unknown as CanonicalWorkspaceCollection}
        companionActionItemId={companionActionItemId}
        historyCollection={
          isVisibleWorkspaceCollection(historyCollection)
            ? (historyCollection as unknown as CanonicalWorkspaceCollection)
            : undefined
        }
        onRetry={onRetry}
        organizationId={organizationId}
        readOnly={readOnly}
        requirementsCollection={
          isVisibleWorkspaceCollection(requirementsCollection)
            ? (requirementsCollection as unknown as CanonicalWorkspaceCollection)
            : undefined
        }
        tab={tab}
        viewerCapacity={viewerCapacity}
      />
      {collection.hasMore ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            className="text-muted-foreground text-xs"
            data-next-cursor={collection.nextCursor}
          >
            More records are available.
          </p>
          <Button
            disabled={loadingMore}
            onClick={onLoadMore}
            size="sm"
            type="button"
            variant="outline"
          >
            {loadingMore ? "Loading…" : `Load more ${TAB_LABELS[tab]}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function CollectionPanel({
  collection,
  loadingMore,
  onLoadMore,
  tab,
}: {
  collection: WorkspaceCollectionResult | undefined;
  loadingMore: boolean;
  onLoadMore: () => void;
  tab: Exclude<BuildSubmilestoneDetailTab, "overview">;
}) {
  if (collection === undefined) {
    return (
      <Frame
        aria-live="polite"
        data-testid={`submilestone-${tab}-loading`}
        role="status"
      >
        <FramePanel className="space-y-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-5/6" />
        </FramePanel>
      </Frame>
    );
  }
  if (collection.state === "revoked") {
    return <UnavailableCollectionPanel />;
  }
  if (collection.state === "integrity_error") {
    return (
      <Frame data-testid={`submilestone-${tab}-integrity-error`}>
        <FramePanel
          aria-live="assertive"
          className="space-y-2 text-sm"
          role="alert"
        >
          <p className="font-medium text-destructive-text">
            {TAB_LABELS[tab]} unavailable
          </p>
          <p className="text-muted-foreground">{collection.message}</p>
          <p className="font-mono text-muted-foreground text-xs">
            Reference: {collection.code}
          </p>
        </FramePanel>
      </Frame>
    );
  }
  const rows = collection.page;
  return (
    <div className="space-y-3" data-testid={`submilestone-${tab}-collection`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-xs">
        <span>
          {rows.length === 0
            ? `No ${TAB_LABELS[tab].toLowerCase()} recorded yet.`
            : `${rows.length} ${TAB_LABELS[tab].toLowerCase()} shown`}
        </span>
        <span>
          {collection.partial ? "Partial projection" : "Bounded page"}
          {collection.hasMore ? " · More available" : ""}
        </span>
      </div>
      {rows.length === 0 ? (
        <EmptyPanel label={TAB_LABELS[tab].toLowerCase()} />
      ) : (
        <Frame>
          {rows.map((row) => (
            <FramePanel
              className="space-y-1 p-4"
              data-row-id={row.id}
              key={row.id}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-sm">{row.title}</p>
                {row.status ? (
                  <Badge size="sm" variant="outline">
                    {statusLabel(row.status)}
                  </Badge>
                ) : null}
              </div>
              {row.detail ? (
                <p className="text-muted-foreground text-sm">{row.detail}</p>
              ) : null}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
                {row.kind ? <span>{statusLabel(row.kind)}</span> : null}
                {row.amountCents === undefined ? null : (
                  <span>{formatCents(row.amountCents)}</span>
                )}
                {row.locationVerified === false ? (
                  <span>Location unverified</span>
                ) : null}
                {row.required ? <span>Required</span> : null}
              </div>
            </FramePanel>
          ))}
        </Frame>
      )}
      {collection.hasMore ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            className="text-muted-foreground text-xs"
            data-next-cursor={collection.nextCursor}
          >
            More records are available.
          </p>
          <Button
            disabled={loadingMore}
            onClick={onLoadMore}
            size="sm"
            type="button"
            variant="outline"
          >
            {loadingMore ? "Loading…" : `Load more ${TAB_LABELS[tab]}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function UnavailableCollectionPanel() {
  return (
    <Frame>
      <FramePanel className="text-muted-foreground text-sm">
        This collection is unavailable for the current Build access.
      </FramePanel>
    </Frame>
  );
}

export function EmptyPanel({ label }: { label: string }) {
  return (
    <Frame>
      <FramePanel className="flex min-h-28 items-center justify-center p-4 text-center text-muted-foreground text-sm">
        No {label} recorded yet.
      </FramePanel>
    </Frame>
  );
}
