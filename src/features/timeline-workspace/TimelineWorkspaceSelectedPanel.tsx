import { AnimatePresence, motion } from "motion/react";
import { SelectedContextPanel } from "./TimelineWorkspaceDrawPanels.tsx";
import { useTimelineWorkspaceContext } from "./TimelineWorkspaceContext.tsx";

export function TimelineWorkspaceSelectedPanel() {
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
    drawAvailabilityData,
    draws,
    financialOverview,
    isCompactLayout,
    items,
    liveBuildMode,
    modificationRequests,
    onOpenSubmilestone,
    removeEvidenceAsset,
    resolvedRange,
    requestMilestoneSiteVisit,
    recordMilestoneSiteVisit,
    reviewDrawRequest,
    reviewMilestoneCompletion,
    reviewModificationRequest,
    submitDrawRequest,
    updateEvidenceAsset,
    updatePlannedDraw,
    updateSubmilestoneBudget,
    updateSubmilestoneDuration,
    timelineRole,
    selectedPanelOpen,
    updateMilestone,
  } = useTimelineWorkspaceContext();

  return (
          <AnimatePresence initial={false} mode="popLayout">
            {selectedPanelOpen && !isCompactLayout ? (
              <motion.aside
                animate={{
                  filter: "blur(0px)",
                  opacity: 1,
                }}
                className="sticky top-14 z-20 h-[calc(100svh-3.5rem-1rem)] max-h-[calc(100svh-3.5rem-1rem)] min-w-0 self-start overflow-hidden rounded-lg border border-border bg-background/94 shadow-sm backdrop-blur supports-[height:100dvh]:h-[calc(100dvh-3.5rem-1rem)] supports-[height:100dvh]:max-h-[calc(100dvh-3.5rem-1rem)]"
                data-testid="selected-draw-panel"
                exit={{
                  filter: "blur(4px)",
                  opacity: 0,
                }}
                initial={{
                  filter: "blur(4px)",
                  opacity: 0,
                }}
                transition={{
                  duration: 0.24,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <div className="h-full overflow-y-auto p-3 sm:p-4">
                  {activeItem ? (
                    <SelectedContextPanel
                      activeDraw={activeItemDraw}
                      activeItem={activeItem}
                      activePanelDraw={activePanelDraw}
                      activePanelDrawItem={activePanelDrawItem}
                      approvedDrawLimit={approvedDrawLimit}
                      addEvidenceFiles={addEvidenceFiles}
                      canApproveMilestoneCompletion={
                        canApproveMilestoneCompletion
                      }
                      contractorPlanning={contractorPlanning}
                      drawAvailabilityData={drawAvailabilityData}
                      draws={draws}
                      items={items}
                      liveExecutionEnabled={canUseLiveExecution}
                      modificationRequests={modificationRequests}
                      onCompleteMilestone={completeMilestone}
                      onCreateMilestoneSiteVisit={createMilestoneSiteVisit}
                      onRecordMilestoneSiteVisit={recordMilestoneSiteVisit}
                      onRemoveEvidenceAsset={removeEvidenceAsset}
                      onRequestMilestoneSiteVisit={requestMilestoneSiteVisit}
                      onReviewDrawRequest={reviewDrawRequest}
                      onReviewMilestoneCompletion={reviewMilestoneCompletion}
                      onReviewModificationRequest={reviewModificationRequest}
                      onOpenSubmilestone={onOpenSubmilestone}
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
                      overview={financialOverview}
                      range={resolvedRange}
                      requiresApprovedDrawMilestones={liveBuildMode}
                      role={timelineRole}
                    />
                  ) : null}
                </div>
              </motion.aside>
            ) : null}
          </AnimatePresence>

  );
}
