"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CalendarDays, RotateCcw, ShieldAlert, UserRound } from "lucide-react";
import { type ComponentProps, useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BuildCollaborationRole } from "../../../convex/build_collaboration_model";
import type { BuildDetailTarget } from "../build-detail-targets/buildDetailTarget.ts";
import {
  CanonicalSubmilestoneTabPanel,
  type CanonicalDirtySection,
  isCanonicalSubmilestoneSuperseded,
  type CanonicalWorkspaceBootstrap,
  type CanonicalWorkspaceCollection,
} from "./SubmilestoneDetailCanonical.tsx";
import { SubmilestoneCollaborationPanel } from "./SubmilestoneCollaborationPanel.tsx";
import { SubmilestoneReviewTab } from "./SubmilestoneReviewTab.tsx";
import {
  BUILD_SUBMILESTONE_DETAIL_TABS,
  type BuildSubmilestoneDetailTab,
  normalizeBuildSubmilestoneDetailTab,
} from "../build-detail-targets/buildDetailTab.ts";
import { BuildDetailTargetHeader } from "../build-detail-targets/BuildDetailTargetHeader.tsx";

type WorkspaceBootstrap = FunctionReturnType<
  typeof api.build_submilestone_workspace.getBuildSubmilestoneWorkspaceBootstrap
>;
type VisibleWorkspaceBootstrap = Extract<
  WorkspaceBootstrap,
  { submilestone: unknown }
>;
type WorkspaceCollectionResult = FunctionReturnType<
  typeof api.build_submilestone_workspace.getBuildSubmilestoneWorkspaceCollection
>;
type VisibleWorkspaceCollection = Extract<
  WorkspaceCollectionResult,
  { page: unknown[] }
>;
type WorkspaceCollectionRow = VisibleWorkspaceCollection["page"][number];

type WorkspaceCollection =
  | "evidence_requirements"
  | "evidence_assets"
  | "people_assignments"
  | "people_history"
  | "materials"
  | "collaboration_comments"
  | "review_decisions";

interface CollectionPaginationState {
  accumulatedRows: WorkspaceCollectionRow[];
  cursor?: string;
  previousPage?: VisibleWorkspaceCollection;
}

interface CollectionPaginationStore {
  byCollection: Partial<Record<WorkspaceCollection, CollectionPaginationState>>;
  targetKey: string;
}

interface PendingCanonicalNavigation {
  action: () => void;
  label: string;
}

type SheetFocusTarget =
  | ComponentProps<typeof SheetPopup>["initialFocus"]
  | undefined;

const TAB_LABELS: Record<BuildSubmilestoneDetailTab, string> = {
  collaboration: "Collaboration",
  evidence: "Evidence",
  materials: "Materials",
  overview: "Overview",
  people: "People",
  review: "Review",
};

const COLLECTION_FOR_TAB: Partial<
  Record<BuildSubmilestoneDetailTab, WorkspaceCollection>
> = {
  collaboration: "collaboration_comments",
  evidence: "evidence_assets",
  materials: "materials",
  people: "people_assignments",
};

const ACTIVE_REVIEW_STATES = new Set([
  "changes_requested",
  "in_review",
  "reopened",
]);

const LENDER_REVIEW_ROLES = new Set<BuildCollaborationRole>([
  "admin",
  "broker",
  "broker-staff",
  "principle-broker",
]);

export interface SubmilestoneDetailSheetProps {
  buildId: Id<"activeBuilds">;
  buildSubmilestoneId: Id<"buildSubmilestones">;
  canGoBack?: boolean;
  canGoForward?: boolean;
  companionActionItemId?: Id<"buildActionItems">;
  finalFocus?: SheetFocusTarget;
  initialFocus?: SheetFocusTarget;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onOpenChange: (open: boolean) => void;
  onOpenTarget?: (
    target: BuildDetailTarget,
    context?: { selectedTab?: string },
  ) => void;
  onReferenceOpen?: (reference: {
    entityId: string;
    entityKind: string;
    href: string;
  }) => void;
  onRetry?: () => void;
  onSelectedTabChange?: (tab: BuildSubmilestoneDetailTab) => void;
  open: boolean;
  organizationId: string;
  readOnly?: boolean;
  selectedTab?: BuildSubmilestoneDetailTab;
  viewerCapacity?: BuildCollaborationRole;
}

/**
 * One route-independent Sub-milestone detail surface for every Build
 * persona. The shell owns read hydration and tab collection reads only;
 * canonical commands remain in the narrow canonical controllers rendered by
 * the Overview, Evidence, People, and Materials tabs.
 */
export function SubmilestoneDetailSheet({
  buildId,
  buildSubmilestoneId,
  canGoBack = false,
  canGoForward = false,
  companionActionItemId,
  finalFocus,
  initialFocus,
  onGoBack = () => undefined,
  onGoForward = () => undefined,
  onOpenChange,
  onOpenTarget,
  onReferenceOpen,
  onRetry,
  onSelectedTabChange,
  open,
  organizationId,
  readOnly = false,
  selectedTab,
  viewerCapacity,
}: SubmilestoneDetailSheetProps) {
  const [uncontrolledTab, setUncontrolledTab] = useState<
    BuildSubmilestoneDetailTab | undefined
  >();
  const paginationTargetKey = `${buildId}:${buildSubmilestoneId}:${companionActionItemId ?? "canonical"}:${open ? "open" : "closed"}`;
  const [paginationStore, setPaginationStore] =
    useState<CollectionPaginationStore>({
      byCollection: {},
      targetKey: paginationTargetKey,
    });
  const [dirtySections, setDirtySections] = useState<
    Record<CanonicalDirtySection, boolean>
  >({
    guidance: false,
    scope: false,
  });
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingCanonicalNavigation | null>(null);
  const hasUnsavedCanonicalChanges =
    dirtySections.scope || dirtySections.guidance;
  const onCanonicalDirtyChange = (
    section: CanonicalDirtySection,
    dirty: boolean,
  ) => {
    setDirtySections((current) =>
      current[section] === dirty ? current : { ...current, [section]: dirty },
    );
  };
  const requestNavigation = (action: () => void, label: string) => {
    if (!hasUnsavedCanonicalChanges) {
      action();
      return;
    }
    setPendingNavigation({ action, label });
  };
  const discardCanonicalChangesAndContinue = () => {
    const action = pendingNavigation?.action;
    setPendingNavigation(null);
    setDirtySections({ guidance: false, scope: false });
    action?.();
  };
  const handleClose = () =>
    requestNavigation(
      () => onOpenChange(false),
      "close this Sub-milestone detail",
    );
  const handleGoBack = () =>
    requestNavigation(onGoBack, "open the previous Sub-milestone");
  const handleGoForward = () =>
    requestNavigation(onGoForward, "open the next Sub-milestone");
  const paginationByCollection =
    paginationStore.targetKey === paginationTargetKey
      ? paginationStore.byCollection
      : {};
  useEffect(() => {
    if (!open) {
      setPaginationStore({
        byCollection: {},
        targetKey: paginationTargetKey,
      });
      setDirtySections({ guidance: false, scope: false });
      setPendingNavigation(null);
    }
  }, [open, paginationTargetKey]);
  const bootstrap = useQuery(
    api.build_submilestone_workspace.getBuildSubmilestoneWorkspaceBootstrap,
    open
      ? {
          buildId,
          buildSubmilestoneId,
          companionActionItemId,
          organizationId,
          viewerCapacity,
        }
      : "skip",
  ) as WorkspaceBootstrap | undefined;

  const normalizedSelectedTab =
    normalizeBuildSubmilestoneDetailTab(selectedTab);
  const inferredTab = defaultTabForWorkspace(bootstrap, viewerCapacity);
  const isControlled = selectedTab !== undefined;
  const activeTab = isControlled
    ? (normalizedSelectedTab ?? inferredTab)
    : (uncontrolledTab ?? inferredTab);
  const workspaceReady = isVisibleWorkspaceBootstrap(bootstrap);
  const selectedCollection = workspaceReady
    ? COLLECTION_FOR_TAB[activeTab]
    : undefined;
  const companionForQuery =
    workspaceReady && bootstrap.collaboration?.state === "available"
      ? (companionActionItemId ?? bootstrap.companion?.actionItemId)
      : undefined;
  const collectionCompanionForQuery =
    selectedCollection?.startsWith("collaboration_")
      ? companionForQuery
      : undefined;
  const pagination = selectedCollection
    ? paginationByCollection[selectedCollection]
    : undefined;
  const collection = useQuery(
    api.build_submilestone_workspace.getBuildSubmilestoneWorkspaceCollection,
    open && workspaceReady && selectedCollection
      ? {
          buildId,
          buildSubmilestoneId,
          collection: selectedCollection,
          companionActionItemId: collectionCompanionForQuery,
          cursor: pagination?.cursor,
          limit: 25,
          organizationId,
          viewerCapacity,
        }
      : "skip",
  ) as WorkspaceCollectionResult | undefined;
  const evidenceRequirementsCollection = useQuery(
    api.build_submilestone_workspace.getBuildSubmilestoneWorkspaceCollection,
    open && workspaceReady && activeTab === "evidence"
      ? {
          buildId,
          buildSubmilestoneId,
          collection: "evidence_requirements" as const,
          cursor: undefined,
          limit: 100,
          organizationId,
          viewerCapacity,
        }
      : "skip",
  ) as WorkspaceCollectionResult | undefined;
  const peopleHistoryCollection = useQuery(
    api.build_submilestone_workspace.getBuildSubmilestoneWorkspaceCollection,
    open && workspaceReady && activeTab === "people"
      ? {
          buildId,
          buildSubmilestoneId,
          collection: "people_history" as const,
          cursor: undefined,
          limit: 25,
          organizationId,
          viewerCapacity,
        }
      : "skip",
  ) as WorkspaceCollectionResult | undefined;
  const visibleCollection = isVisibleWorkspaceCollection(collection)
    ? collection
    : undefined;
  const displayedCollection = visibleCollection
    ? {
        ...visibleCollection,
        page: mergeCollectionRows(
          pagination?.accumulatedRows ?? [],
          visibleCollection.page,
        ),
      }
    : collection === undefined && pagination?.previousPage
      ? {
          ...pagination.previousPage,
          page: pagination.accumulatedRows,
        }
      : collection;
  const loadingMore = Boolean(pagination?.cursor && collection === undefined);

  const loadMore = () => {
    if (!(selectedCollection && visibleCollection?.hasMore)) {
      return;
    }
    const nextCursor = visibleCollection.nextCursor;
    if (!nextCursor) {
      return;
    }
    setPaginationStore((currentStore) => {
      const current =
        currentStore.targetKey === paginationTargetKey
          ? currentStore.byCollection
          : {};
      return {
        byCollection: {
          ...current,
          [selectedCollection]: {
            accumulatedRows: mergeCollectionRows(
              current[selectedCollection]?.accumulatedRows ?? [],
              visibleCollection.page,
            ),
            cursor: nextCursor,
            previousPage: visibleCollection,
          },
        },
        targetKey: paginationTargetKey,
      };
    });
  };

  const handleTabChange = (nextTab: BuildSubmilestoneDetailTab) => {
    if (nextTab === activeTab) {
      return;
    }
    requestNavigation(
      () => {
        if (!isControlled) {
          setUncontrolledTab(nextTab);
        }
        onSelectedTabChange?.(nextTab);
      },
      "leave the Overview draft",
    );
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    handleClose();
  };

  return (
    <>
      <Sheet modal onOpenChange={handleOpenChange} open={open}>
        <SheetPopup
          aria-modal="true"
          className="min-w-0 overflow-x-hidden motion-reduce:transform-none motion-reduce:transition-none max-sm:h-svh max-sm:max-h-svh max-sm:w-full max-sm:max-w-none max-sm:rounded-none max-sm:pb-[env(safe-area-inset-bottom)] sm:h-[calc(100svh-2rem)] sm:max-h-[calc(100svh-2rem)] sm:w-[min(52rem,calc(100vw-2rem))] sm:max-w-[52rem]"
          finalFocus={finalFocus}
          initialFocus={initialFocus}
          onKeyDown={(event) => {
          const historyShortcut =
            event.altKey &&
            !(event.ctrlKey || event.metaKey || event.shiftKey) &&
            (event.key === "ArrowLeft" || event.key === "ArrowRight");
          if (!historyShortcut) {
            return;
          }
          event.preventDefault();
          if (event.key === "ArrowLeft" && canGoBack) {
            handleGoBack();
          }
          if (event.key === "ArrowRight" && canGoForward) {
            handleGoForward();
          }
          }}
          showCloseButton={false}
          side="right"
          variant="inset"
        >
        {bootstrap === undefined ? (
          <LoadingState
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onClose={handleClose}
            onGoBack={handleGoBack}
            onGoForward={handleGoForward}
          />
        ) : bootstrap.state === "revoked" ? (
          <UnavailableState
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onClose={handleClose}
            onGoBack={handleGoBack}
            onGoForward={handleGoForward}
          />
        ) : bootstrap.state === "integrity_error" ? (
          <IntegrityState
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            error={bootstrap}
            onClose={handleClose}
            onGoBack={handleGoBack}
            onGoForward={handleGoForward}
            onRetry={onRetry}
          />
        ) : (
          <VisibleState
            activeTab={activeTab}
            bootstrap={bootstrap}
            buildId={buildId}
            buildSubmilestoneId={buildSubmilestoneId}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            collection={displayedCollection}
            companionActionItemId={companionActionItemId}
            requirementsCollection={evidenceRequirementsCollection}
            historyCollection={peopleHistoryCollection}
            loadingMore={loadingMore}
            onClose={handleClose}
            onDirtyChange={onCanonicalDirtyChange}
            onGoBack={handleGoBack}
            onGoForward={handleGoForward}
            onLoadMore={loadMore}
            onOpenTarget={onOpenTarget}
            onRetry={onRetry}
            onReferenceOpen={onReferenceOpen}
            onTabChange={handleTabChange}
            organizationId={organizationId}
            readOnly={readOnly}
            viewerCapacity={viewerCapacity}
          />
        )}
        </SheetPopup>
      </Sheet>
      <AlertDialog
        onOpenChange={(dialogOpen) => {
          if (!dialogOpen) {
            setPendingNavigation(null);
          }
        }}
        open={pendingNavigation !== null}
      >
        <AlertDialogContent data-testid="submilestone-detail-unsaved-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Discard unsaved Scope and Field Guidance changes?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your Scope or Field Guidance edits have not been saved. Continue
              to {pendingNavigation?.label} and discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose
              render={<Button variant="outline">Keep editing</Button>}
            />
            <Button
              data-testid="submilestone-detail-unsaved-discard"
              onClick={discardCanonicalChangesAndContinue}
              variant="destructive"
            >
              Discard changes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function LoadingState({
  canGoBack,
  canGoForward,
  onClose,
  onGoBack,
  onGoForward,
}: NavigationProps) {
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
        <SheetTitle>Sub-milestone</SheetTitle>
        <SheetDescription>Loading canonical work context…</SheetDescription>
      </BuildDetailTargetHeader>
      <SheetPanel className="space-y-5 pb-[env(safe-area-inset-bottom)]">
        <Frame
          aria-live="polite"
          data-testid="submilestone-detail-loading"
          role="status"
        >
          <FramePanel className="space-y-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Separator />
            <Skeleton className="h-24 w-full" />
          </FramePanel>
        </Frame>
      </SheetPanel>
    </>
  );
}

function UnavailableState({
  canGoBack,
  canGoForward,
  onClose,
  onGoBack,
  onGoForward,
}: NavigationProps) {
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
        <SheetTitle>Sub-milestone unavailable</SheetTitle>
        <SheetDescription>
          This work item was removed or your Build access was revoked.
        </SheetDescription>
      </BuildDetailTargetHeader>
      <SheetPanel className="space-y-5 pb-[env(safe-area-inset-bottom)]">
        <Frame>
          <FramePanel
            aria-live="polite"
            className="flex flex-col items-start gap-3 text-muted-foreground text-sm"
            data-testid="submilestone-detail-revoked"
            role="status"
          >
            <ShieldAlert aria-hidden="true" className="size-5 text-warning" />
            <p>
              This Sub-milestone is unavailable. No canonical details are
              disclosed.
            </p>
          </FramePanel>
        </Frame>
      </SheetPanel>
      <SheetFooter className="pb-[env(safe-area-inset-bottom)]">
        <Button onClick={onClose} variant="outline">
          Close
        </Button>
      </SheetFooter>
    </>
  );
}

function IntegrityState({
  canGoBack,
  canGoForward,
  error,
  onClose,
  onGoBack,
  onGoForward,
  onRetry,
}: NavigationProps & {
  error: Extract<WorkspaceBootstrap, { state: "integrity_error" }>;
  onRetry?: () => void;
}) {
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
        <SheetTitle>Sub-milestone link needs attention</SheetTitle>
        <SheetDescription>
          The canonical work item could not be safely reconciled with its
          collaboration companion.
        </SheetDescription>
      </BuildDetailTargetHeader>
      <SheetPanel className="space-y-5 pb-[env(safe-area-inset-bottom)]">
        <Frame>
          <FramePanel
            aria-live="assertive"
            className="space-y-3"
            data-testid="submilestone-detail-integrity-error"
            role="alert"
          >
            <div className="flex items-center gap-2 text-destructive-text">
              <ShieldAlert aria-hidden="true" className="size-4" />
              <p className="font-medium">Integrity check failed</p>
            </div>
            <p className="text-sm">{error.message}</p>
            <p className="break-all font-mono text-muted-foreground text-xs">
              Reference: {error.code}
            </p>
          </FramePanel>
        </Frame>
      </SheetPanel>
      <SheetFooter className="pb-[env(safe-area-inset-bottom)]">
        <Button onClick={onClose} variant="outline">
          Close
        </Button>
        {onRetry ? (
          <Button aria-label="Retry Sub-milestone workspace" onClick={onRetry}>
            <RotateCcw aria-hidden="true" />
            Retry
          </Button>
        ) : null}
      </SheetFooter>
    </>
  );
}

function VisibleState({
  activeTab,
  bootstrap,
  buildId,
  buildSubmilestoneId,
  canGoBack,
  canGoForward,
  collection,
  companionActionItemId,
  requirementsCollection,
  historyCollection,
  loadingMore,
  onClose,
  onGoBack,
  onGoForward,
  onLoadMore,
  onRetry,
  onReferenceOpen,
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
  requirementsCollection: WorkspaceCollectionResult | undefined;
  historyCollection: WorkspaceCollectionResult | undefined;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRetry?: () => void;
  onReferenceOpen?: SubmilestoneDetailSheetProps["onReferenceOpen"];
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
              {activeTab === tab ? (
                tab === "overview" ? (
                  <CanonicalSubmilestoneTabPanel
                    bootstrap={
                      bootstrap as unknown as CanonicalWorkspaceBootstrap
                    }
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
                ) : tab === "evidence" ||
                  tab === "people" ||
                  tab === "materials" ? (
                  <CanonicalCollectionSurface
                    bootstrap={
                      bootstrap as unknown as CanonicalWorkspaceBootstrap
                    }
                    buildId={buildId}
                    buildSubmilestoneId={buildSubmilestoneId}
                    collection={collection}
                    companionActionItemId={companionActionItemId}
                    requirementsCollection={requirementsCollection}
                    historyCollection={historyCollection}
                    loadingMore={loadingMore}
                    onLoadMore={onLoadMore}
                    onRetry={onRetry}
                    organizationId={organizationId}
                    readOnly={readOnly}
                    tab={tab}
                    viewerCapacity={viewerCapacity}
                  />
                ) : tab === "collaboration" ? (
                  <SubmilestoneCollaborationPanel
                    buildId={buildId}
                    buildSubmilestoneId={buildSubmilestoneId}
                    canonicalWorkflowRevision={
                      bootstrap.revisions.canonicalWorkflowRevision
                    }
                    collaboration={bootstrap.collaboration}
                    collaborationCapabilities={{
                      addAttachment:
                        bootstrap.capabilities.collaboration.addAttachment
                          .allowed,
                      comment:
                        bootstrap.capabilities.collaboration.comment.allowed,
                    }}
                    companionActionItemId={
                      companionActionItemId ?? bootstrap.companion?.actionItemId
                    }
                    onOpenCanonicalTarget={onOpenTarget}
                    evidencePackageRevision={
                      bootstrap.evidence.evidencePackageRevision
                    }
                    evidenceRequirements={bootstrap.evidence.requirements.map(
                      (requirement) => ({
                        label: requirement.label,
                        requirementKey: requirement.requirementKey,
                      }),
                    )}
                    expectedReviewRound={bootstrap.review.reviewRound}
                    milestoneKey={bootstrap.milestone.key}
                    organizationId={organizationId}
                    onReferenceOpen={onReferenceOpen}
                    promoteEvidenceAllowed={
                      bootstrap.capabilities.canonical.promoteEvidence.allowed
                    }
                    readOnly={readOnly}
                    structureCapabilities={{
                      addChecklist:
                        bootstrap.capabilities.collaboration.addChecklist
                          .allowed,
                      createChild:
                        bootstrap.capabilities.collaboration.createChild.allowed,
                      linkRelation:
                        bootstrap.capabilities.collaboration.linkRelation
                          .allowed,
                      repairRelation:
                        bootstrap.capabilities.collaboration.repairRelation
                          .allowed,
                      toggleChecklist:
                        bootstrap.capabilities.collaboration.toggleChecklist
                          .allowed,
                      unlinkRelation:
                        bootstrap.capabilities.collaboration.unlinkRelation
                          .allowed,
                    }}
                    submilestoneKey={bootstrap.submilestone.key}
                    superseded={superseded}
                  />
                ) : tab === "review" ? (
                  <SubmilestoneReviewTab
                    bootstrap={bootstrap}
                    buildId={buildId}
                    onOpenTarget={onOpenTarget}
                    onReferenceOpen={onReferenceOpen}
                    onRetry={onRetry}
                    organizationId={organizationId}
                    readOnly={readOnly || superseded}
                  />
                ) : (
                  <CollectionPanel
                    collection={collection}
                    loadingMore={loadingMore}
                    onLoadMore={onLoadMore}
                    tab={tab}
                  />
                )
              ) : null}
            </TabsPanel>
          ))}
        </SheetPanel>
      </Tabs>
    </>
  );
}

function CanonicalCollectionSurface({
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
        requirementsCollection={
          isVisibleWorkspaceCollection(requirementsCollection)
            ? (requirementsCollection as unknown as CanonicalWorkspaceCollection)
            : undefined
        }
        historyCollection={
          isVisibleWorkspaceCollection(historyCollection)
            ? (historyCollection as unknown as CanonicalWorkspaceCollection)
            : undefined
        }
        companionActionItemId={companionActionItemId}
        onRetry={onRetry}
        organizationId={organizationId}
        readOnly={readOnly}
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

function CollectionPanel({
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

function UnavailableCollectionPanel() {
  return (
    <Frame>
      <FramePanel className="text-muted-foreground text-sm">
        This collection is unavailable for the current Build access.
      </FramePanel>
    </Frame>
  );
}

function EmptyPanel({ label }: { label: string }) {
  return (
    <Frame>
      <FramePanel className="flex min-h-28 items-center justify-center p-4 text-center text-muted-foreground text-sm">
        No {label} recorded yet.
      </FramePanel>
    </Frame>
  );
}

function isVisibleWorkspaceCollection(
  collection: WorkspaceCollectionResult | undefined,
): collection is VisibleWorkspaceCollection {
  return Boolean(collection && "page" in collection);
}

function mergeCollectionRows(
  accumulated: WorkspaceCollectionRow[],
  page: WorkspaceCollectionRow[],
) {
  const rowsById = new Map(accumulated.map((row) => [row.id, row] as const));
  for (const row of page) {
    rowsById.set(row.id, row);
  }
  return [...rowsById.values()];
}

interface NavigationProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onClose: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
}

function isVisibleWorkspaceBootstrap(
  value: WorkspaceBootstrap | undefined,
): value is VisibleWorkspaceBootstrap {
  return Boolean(value && "submilestone" in value);
}

function defaultTabForWorkspace(
  value: WorkspaceBootstrap | undefined,
  viewerCapacity: BuildCollaborationRole | undefined,
): BuildSubmilestoneDetailTab {
  if (!isVisibleWorkspaceBootstrap(value)) {
    return "overview";
  }
  const role = viewerCapacity ?? value.persona;
  const activeReview =
    value.review.reviewRound > 0 &&
    (ACTIVE_REVIEW_STATES.has(value.review.reviewDecisionState) ||
      ACTIVE_REVIEW_STATES.has(value.review.evidenceReviewState));
  return LENDER_REVIEW_ROLES.has(role) && activeReview ? "review" : "overview";
}

function statusLabel(value: string) {
  const normalized = value.replaceAll("_", " ").trim();
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : "Unknown";
}

function statusBadgeVariant(
  value: string,
): ComponentProps<typeof Badge>["variant"] {
  const normalized = value.toLowerCase();
  if (normalized === "complete" || normalized === "approved") {
    return "success";
  }
  if (
    normalized === "blocked" ||
    normalized === "changes_requested" ||
    normalized === "reopened"
  ) {
    return "warning";
  }
  return "outline";
}

function scheduleLabel(bootstrap: VisibleWorkspaceBootstrap) {
  const { durationDays, parentDayEnd, parentDayStart, startDay } =
    bootstrap.schedule;
  const childWindow =
    startDay === undefined
      ? "Start not set"
      : `Day ${startDay}${durationDays === undefined ? "" : ` · ${durationDays} day${durationDays === 1 ? "" : "s"}`}`;
  return `${childWindow} · Parent ${parentDayStart}–${parentDayEnd}`;
}

function formatCents(value: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value / 100);
}
