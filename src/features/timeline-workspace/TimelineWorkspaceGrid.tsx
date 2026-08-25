import { motion } from "motion/react";
import { routeSectionVariants } from "./TimelineWorkspaceDefaults.ts";
import { useTimelineWorkspaceContext } from "./TimelineWorkspaceContext.tsx";
import { TimelineWorkspaceMainColumn } from "./TimelineWorkspaceMainColumn.tsx";
import { TimelineWorkspaceSelectedPanel } from "./TimelineWorkspaceSelectedPanel.tsx";

export function TimelineWorkspaceGrid() {
  const { isCompactLayout, selectedPanelOpen } =
    useTimelineWorkspaceContext();

  return (
    <motion.div
      animate={{
        gridTemplateColumns:
          isCompactLayout || !selectedPanelOpen
            ? "minmax(0, 1fr) 0px"
            : "minmax(0, 1fr) 320px",
      }}
      className="grid min-w-0 gap-y-1 sm:gap-y-6 lg:items-start"
      data-testid="timeline-workspace-grid"
      style={{
        columnGap: isCompactLayout || !selectedPanelOpen ? 0 : 20,
      }}
      transition={{
        duration: 0.26,
        ease: [0.22, 1, 0.36, 1],
      }}
      variants={routeSectionVariants}
    >
      <TimelineWorkspaceMainColumn />
      <TimelineWorkspaceSelectedPanel />
    </motion.div>
  );
}
