import { DeleteSheet, EditBudgetSheet, EditDatesSheet, EditDrawSheet } from "./MobileTimelineSheets.tsx";
import { SelectedDrawMobileDrawer } from "./TimelineWorkspaceDrawPanels.tsx";
import { useTimelineWorkspaceContext } from "./TimelineWorkspaceContext.tsx";

export function TimelineWorkspaceMobileOverlays() {
  const {
    activeItem,
    activeItemDraw,
    activePanelDraw,
    activePanelDrawItem,
    addEvidenceFiles,
    approvedDrawLimit,
    canApproveMilestoneCompletion,
    canUseLiveExecution,
    canWriteLiveTimeline,
    completeMilestone,
    contractorPlanning,
    createMilestoneSiteVisit,
    deleteDraw,
    deleteMilestone,
    drawAvailabilityData,
    draws,
    financialOverview,
    isMobileDrawerLayout,
    items,
    liveBuildMode,
    mobileDeleteTarget,
    mobileDetailDrawerRequested,
    mobileEditBudgetItem,
    mobileEditDatesItem,
    mobileEditDraw,
    modificationRequests,
    onOpenSubmilestone,
    recordMilestoneSiteVisit,
    removeEvidenceAsset,
    requestMilestoneSiteVisit,
    reviewDrawRequest,
    reviewMilestoneCompletion,
    reviewModificationRequest,
    resolvedRange,
    selectedPanelOpen,
    setMobileDetailDrawerRequested,
    setMobileDeleteTarget,
    setMobileEditBudgetItemId,
    setMobileEditDatesItemId,
    setMobileEditDrawId,
    setSelectedPanelOpen,
    submitDrawRequest,
    timelineRole,
    updateEvidenceAsset,
    updateMilestone,
    updatePlannedDraw,
    updateSubmilestoneBudget,
    updateSubmilestoneDuration,
  } = useTimelineWorkspaceContext();

  return (
    <>
      <SelectedDrawMobileDrawer
        activeDraw={activeItemDraw}
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
        liveExecutionEnabled={canUseLiveExecution}
        modificationRequests={modificationRequests}
        onCompleteMilestone={completeMilestone}
        onCreateMilestoneSiteVisit={createMilestoneSiteVisit}
        onOpenChange={(open) => {
          setSelectedPanelOpen(open);
          if (!open) {
            setMobileDetailDrawerRequested(false);
          }
        }}
        onOpenSubmilestone={onOpenSubmilestone}
        onRecordMilestoneSiteVisit={recordMilestoneSiteVisit}
        onRemoveEvidenceAsset={removeEvidenceAsset}
        onRequestMilestoneSiteVisit={requestMilestoneSiteVisit}
        onReviewDrawRequest={reviewDrawRequest}
        onReviewMilestoneCompletion={reviewMilestoneCompletion}
        onReviewModificationRequest={reviewModificationRequest}
        onSubmitDrawRequest={submitDrawRequest}
        onUpdateEvidenceAsset={updateEvidenceAsset}
        onUpdateMilestoneDrawAvailability={
          canWriteLiveTimeline && !liveBuildMode
            ? (itemId, amount) =>
                updateMilestone(itemId, {
                  drawAvailabilityAmount: amount,
                })
            : undefined
        }
        onUpdatePlannedDraw={updatePlannedDraw}
        onUpdateSubmilestoneBudget={
          canWriteLiveTimeline && !liveBuildMode
            ? updateSubmilestoneBudget
            : undefined
        }
        onUpdateSubmilestoneDuration={
          canWriteLiveTimeline && !liveBuildMode
            ? updateSubmilestoneDuration
            : undefined
        }
        open={
          Boolean(activeItem) &&
          selectedPanelOpen &&
          isMobileDrawerLayout &&
          mobileDetailDrawerRequested
        }
        overview={financialOverview}
        range={resolvedRange}
        requiresApprovedDrawMilestones={liveBuildMode}
        role={timelineRole}
      />
      <EditDatesSheet
        item={mobileEditDatesItem}
        onClose={() => setMobileEditDatesItemId(null)}
        onCommit={(itemId, patch) => updateMilestone(itemId, patch)}
      />
      <EditBudgetSheet
        item={mobileEditBudgetItem}
        onClose={() => setMobileEditBudgetItemId(null)}
        onCommit={(itemId, patch) => updateMilestone(itemId, patch)}
      />
      <EditDrawSheet
        draw={mobileEditDraw}
        onClose={() => setMobileEditDrawId(null)}
        onCommit={(drawId, patch) => updatePlannedDraw(drawId, patch)}
      />
      <DeleteSheet
        description={
          mobileDeleteTarget?.kind === "draw"
            ? "Delete this draw marker."
            : liveBuildMode
              ? "Create an admin-reviewed deletion request for this milestone."
              : "Delete this milestone from the plan."
        }
        onClose={() => setMobileDeleteTarget(null)}
        onConfirm={(id) => {
          if (mobileDeleteTarget?.kind === "draw") {
            deleteDraw(id);
          } else {
            deleteMilestone(id);
          }
        }}
        requireReason={liveBuildMode}
        target={mobileDeleteTarget}
        title={
          mobileDeleteTarget?.kind === "draw"
            ? "Delete draw"
            : liveBuildMode
              ? "Request milestone deletion"
              : "Delete milestone"
        }
      />
    </>
  );
}
