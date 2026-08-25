import type { TimelineWorkspaceProps } from "./TimelineWorkspaceTypes.ts";
import {
  useTimelineWorkspaceBaseController,
} from "./TimelineWorkspaceBaseController.ts";
import {
  useTimelineWorkspaceSetupController,
} from "./TimelineWorkspaceSetupController.ts";
import {
  useTimelineWorkspaceAnalyticsController,
} from "./TimelineWorkspaceAnalyticsController.ts";
import { createTimelineWorkspacePlanActions } from "./TimelineWorkspacePlanActions.ts";
import { createTimelineWorkspaceEvidenceActions } from "./TimelineWorkspaceEvidenceActions.ts";
import { useTimelineWorkspaceCapitalActions } from "./TimelineWorkspaceCapitalActions.ts";

export function useTimelineWorkspaceController(
  props: TimelineWorkspaceProps = {}
) {
  const base = useTimelineWorkspaceBaseController(props);
  const setup = useTimelineWorkspaceSetupController(base);
  const analytics = useTimelineWorkspaceAnalyticsController(base);
  const planActions = createTimelineWorkspacePlanActions(base);
  const evidenceActions = createTimelineWorkspaceEvidenceActions(base);
  const capitalActions = useTimelineWorkspaceCapitalActions(base);

  return {
    ...base,
    ...setup,
    ...analytics,
    ...planActions,
    ...evidenceActions,
    ...capitalActions,
  };
}

export type TimelineWorkspaceControllerModel = ReturnType<
  typeof useTimelineWorkspaceController
>;
