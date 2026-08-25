"use client";

import { RotateCcw, ShieldAlert } from "lucide-react";

import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { BuildDetailTargetHeader } from "../build-detail-targets/BuildDetailTargetHeader.tsx";
import { ActiveBuildSubmilestoneGuidanceController } from "../submilestone-guidance/ActiveBuildSubmilestoneGuidanceController.tsx";
import { ProposalSubmilestoneScopeController } from "../submilestone-scope/ProposalSubmilestoneScopeController.tsx";
import type {
  BuildCollaborationRole,
  BuildSubmilestoneDetailTab,
  CanonicalDirtySection,
  Id,
  NavigationProps,
  SubmilestoneDetailSheetProps,
  VisibleWorkspaceBootstrap,
  WorkspaceBootstrap,
  WorkspaceCollectionResult,
} from "./submilestone-detail-sheet-contracts.ts";
import { VisibleState } from "./submilestone-detail-sheet-surface.tsx";

interface SheetContentProps extends NavigationProps {
  activeTab: BuildSubmilestoneDetailTab;
  bootstrap: WorkspaceBootstrap | undefined;
  buildId: Id<"activeBuilds">;
  buildSubmilestoneId: Id<"buildSubmilestones">;
  collection: WorkspaceCollectionResult | undefined;
  companionActionItemId?: Id<"buildActionItems">;
  costDocuments: SubmilestoneDetailSheetProps["costDocuments"];
  historyCollection: WorkspaceCollectionResult | undefined;
  loadingMore: boolean;
  onDirtyChange: (section: CanonicalDirtySection, dirty: boolean) => void;
  onLoadMore: () => void;
  onOpenCostDocument?: SubmilestoneDetailSheetProps["onOpenCostDocument"];
  onOpenScopeAndGuidance: () => void;
  onOpenTarget?: SubmilestoneDetailSheetProps["onOpenTarget"];
  onReferenceOpen?: SubmilestoneDetailSheetProps["onReferenceOpen"];
  onRetry?: () => void;
  onTabChange: (tab: BuildSubmilestoneDetailTab) => void;
  organizationId: string;
  readOnly: boolean;
  requirementsCollection: WorkspaceCollectionResult | undefined;
  viewerCapacity?: BuildCollaborationRole;
}

export function SheetContent({
  activeTab,
  bootstrap,
  buildId,
  buildSubmilestoneId,
  canGoBack,
  canGoForward,
  collection,
  companionActionItemId,
  costDocuments,
  historyCollection,
  loadingMore,
  onClose,
  onDirtyChange,
  onGoBack,
  onGoForward,
  onLoadMore,
  onOpenCostDocument,
  onOpenScopeAndGuidance,
  onOpenTarget,
  onReferenceOpen,
  onRetry,
  onTabChange,
  organizationId,
  readOnly,
  requirementsCollection,
  viewerCapacity,
}: SheetContentProps) {
  if (bootstrap === undefined) {
    return (
      <LoadingState
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onClose={onClose}
        onGoBack={onGoBack}
        onGoForward={onGoForward}
      />
    );
  }
  if (bootstrap.state === "revoked") {
    return (
      <UnavailableState
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onClose={onClose}
        onGoBack={onGoBack}
        onGoForward={onGoForward}
      />
    );
  }
  if (bootstrap.state === "integrity_error") {
    return (
      <IntegrityState
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        error={bootstrap}
        onClose={onClose}
        onGoBack={onGoBack}
        onGoForward={onGoForward}
        onRetry={onRetry}
      />
    );
  }
  return (
    <VisibleState
      activeTab={activeTab}
      bootstrap={bootstrap}
      buildId={buildId}
      buildSubmilestoneId={buildSubmilestoneId}
      canGoBack={canGoBack}
      canGoForward={canGoForward}
      collection={collection}
      companionActionItemId={companionActionItemId}
      costDocuments={costDocuments ?? []}
      historyCollection={historyCollection}
      loadingMore={loadingMore}
      onClose={onClose}
      onDirtyChange={onDirtyChange}
      onGoBack={onGoBack}
      onGoForward={onGoForward}
      onLoadMore={onLoadMore}
      onOpenCostDocument={onOpenCostDocument}
      onOpenScopeAndGuidance={onOpenScopeAndGuidance}
      onOpenTarget={onOpenTarget}
      onReferenceOpen={onReferenceOpen}
      onRetry={onRetry}
      onTabChange={onTabChange}
      organizationId={organizationId}
      readOnly={readOnly}
      requirementsCollection={requirementsCollection}
      viewerCapacity={viewerCapacity}
    />
  );
}

export function ScopeFieldGuidanceCompanion({
  bootstrap,
  buildSubmilestoneId,
  onOpenChange,
  open,
  organizationId,
  viewerCapacity,
}: {
  bootstrap: VisibleWorkspaceBootstrap;
  buildSubmilestoneId: Id<"buildSubmilestones">;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string;
  viewerCapacity?: BuildCollaborationRole;
}) {
  return (
    <Sheet
      disablePointerDismissal
      modal={false}
      onOpenChange={onOpenChange}
      open={open}
    >
      <SheetPopup
        aria-modal="false"
        className="pointer-events-auto min-w-0 overflow-x-hidden motion-reduce:transform-none motion-reduce:transition-none max-sm:h-svh max-sm:max-h-svh max-sm:w-full max-sm:max-w-none max-sm:rounded-none sm:h-[calc(100svh-2rem)] sm:max-h-[calc(100svh-2rem)] sm:w-[min(34rem,calc(100vw-2rem))] sm:max-w-[34rem]"
        data-testid="scope-field-guidance-companion"
        showBackdrop={false}
        side="left"
        variant="inset"
        viewportClassName="pointer-events-none z-[60]"
      >
        <SheetHeader className="border-b pr-14">
          <SheetTitle>Scope &amp; Field Guidance</SheetTitle>
          <SheetDescription>
            Canonical instructions for {bootstrap.submilestone.name}. Keep this
            panel open while completing the Review.
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="space-y-5 pb-[env(safe-area-inset-bottom)]">
          <ProposalSubmilestoneScopeController
            proposalSubmilestoneId={
              bootstrap.submilestone.proposalSubmilestoneId
            }
            readOnly
            scopeRoute="active-build"
            viewerCapacity={viewerCapacity}
            workosOrganizationId={organizationId}
          />
          <Separator />
          <ActiveBuildSubmilestoneGuidanceController
            buildSubmilestoneId={String(buildSubmilestoneId)}
            proposalSubmilestoneId={
              bootstrap.submilestone.proposalSubmilestoneId
            }
            readOnly
            rowName={bootstrap.milestone.name}
            subMilestoneName={bootstrap.submilestone.name}
            viewerCapacity={viewerCapacity}
            workosOrganizationId={organizationId}
          />
        </SheetPanel>
      </SheetPopup>
    </Sheet>
  );
}

export function LoadingState({
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

export function UnavailableState({
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

export function IntegrityState({
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
