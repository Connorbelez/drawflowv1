import { TimelineMilestoneWorksheetView } from "./TimelineMilestoneWorksheetView.tsx";
import { useTimelineMilestoneWorksheetRuntime } from "./TimelineMilestoneWorksheetRuntime.ts";
import type { TimelineMilestoneWorksheetProps } from "./TimelineMilestoneWorksheetContracts.tsx";
import "./-timeline-setup-flow.css";

export function TimelineMilestoneWorksheetTable(
  props: TimelineMilestoneWorksheetProps
) {
  const runtime = useTimelineMilestoneWorksheetRuntime(props);
  return <TimelineMilestoneWorksheetView {...runtime} />;
}
