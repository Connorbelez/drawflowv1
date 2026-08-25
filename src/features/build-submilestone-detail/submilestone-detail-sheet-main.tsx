"use client";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Sheet, SheetPopup } from "#/components/ui/sheet.tsx";
import type { SubmilestoneDetailSheetProps } from "./submilestone-detail-sheet-contracts.ts";
import { isVisibleWorkspaceBootstrap } from "./submilestone-detail-sheet-contracts.ts";
import { useSheetNavigation } from "./submilestone-detail-sheet-navigation.ts";
import {
  ScopeFieldGuidanceCompanion,
  SheetContent,
} from "./submilestone-detail-sheet-states.tsx";
import { useSheetWorkspace } from "./submilestone-detail-sheet-workspace.ts";

export function SubmilestoneDetailSheet({
  buildId,
  buildSubmilestoneId,
  canGoBack = false,
  canGoForward = false,
  companionActionItemId,
  costDocuments = [],
  finalFocus,
  initialFocus,
  onGoBack = () => undefined,
  onGoForward = () => undefined,
  onOpenChange,
  onOpenCostDocument,
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
  const navigation = useSheetNavigation({
    onGoBack,
    onGoForward,
    onOpenChange,
    open,
  });
  const workspace = useSheetWorkspace({
    buildId,
    buildSubmilestoneId,
    companionActionItemId,
    onSelectedTabChange,
    open,
    organizationId,
    requestNavigation: navigation.requestNavigation,
    selectedTab,
    viewerCapacity,
  });
  const {
    activeTab,
    bootstrap,
    collection,
    evidenceRequirementsCollection,
    handleTabChange,
    historyCollection,
    loadMore,
    loadingMore,
  } = workspace;
  const {
    discardCanonicalChangesAndContinue,
    handleClose,
    handleGoBack,
    handleGoForward,
    onCanonicalDirtyChange,
    pendingNavigation,
    scopeGuidanceOpen,
    setPendingNavigation,
    setScopeGuidanceOpen,
  } = navigation;

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    handleClose();
  };

  return (
    <>
      <Sheet
        disablePointerDismissal={scopeGuidanceOpen}
        modal={!scopeGuidanceOpen}
        onOpenChange={handleOpenChange}
        open={open}
      >
        <SheetPopup
          aria-modal={!scopeGuidanceOpen}
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
          <SheetContent
            activeTab={activeTab}
            bootstrap={bootstrap}
            buildId={buildId}
            buildSubmilestoneId={buildSubmilestoneId}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            collection={collection}
            companionActionItemId={companionActionItemId}
            costDocuments={costDocuments}
            historyCollection={historyCollection}
            loadingMore={loadingMore}
            onClose={handleClose}
            onDirtyChange={onCanonicalDirtyChange}
            onGoBack={handleGoBack}
            onGoForward={handleGoForward}
            onLoadMore={loadMore}
            onOpenCostDocument={onOpenCostDocument}
            onOpenScopeAndGuidance={() => setScopeGuidanceOpen(true)}
            onOpenTarget={onOpenTarget}
            onReferenceOpen={onReferenceOpen}
            onRetry={onRetry}
            onTabChange={handleTabChange}
            organizationId={organizationId}
            readOnly={readOnly}
            requirementsCollection={evidenceRequirementsCollection}
            viewerCapacity={viewerCapacity}
          />
        </SheetPopup>
      </Sheet>
      {isVisibleWorkspaceBootstrap(bootstrap) ? (
        <ScopeFieldGuidanceCompanion
          bootstrap={bootstrap}
          buildSubmilestoneId={buildSubmilestoneId}
          onOpenChange={setScopeGuidanceOpen}
          open={open && scopeGuidanceOpen}
          organizationId={organizationId}
          viewerCapacity={viewerCapacity}
        />
      ) : null}
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
