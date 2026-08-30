import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";

export function useTimelineWorkspaceMutations(
  timelineSettingsProjection: unknown
) {
  const timelineDemoSettings = useQuery(
    api.demo_settings.getTimelineDemoSettings,
    timelineSettingsProjection === undefined ? {} : "skip"
  );
  const createTimelinePlan = useMutation(
    api.demo_timeline_plans.demo_createTimelinePlanFromSetup
  );
  const submitTimelinePlan = useMutation(
    api.demo_timeline_plans.demo_submitTimelinePlan
  );
  const approveTimelinePlan = useMutation(
    api.demo_timeline_plans.demo_approveTimelinePlan
  );
  const createTimelineDraw = useMutation(
    api.demo_timeline_plans.demo_createTimelineDraw
  );
  const updateTimelineDraw = useMutation(
    api.demo_timeline_plans.demo_updateTimelineDraw
  );
  const deleteTimelineDraw = useMutation(
    api.demo_timeline_plans.demo_deleteTimelineDraw
  );
  const submitTimelineDrawRequest = useMutation(
    api.demo_timeline_plans.demo_submitTimelineDrawRequest
  );
  const reviewTimelineDrawRequest = useMutation(
    api.demo_timeline_plans.demo_reviewTimelineDrawRequest
  );
  const createTimelineCapitalEvent = useMutation(
    api.demo_timeline_plans.demo_createTimelineCapitalEvent
  );
  const updateTimelineCapitalEvent = useMutation(
    api.demo_timeline_plans.demo_updateTimelineCapitalEvent
  );
  const deleteTimelineCapitalEvent = useMutation(
    api.demo_timeline_plans.demo_deleteTimelineCapitalEvent
  );
  const createTimelineMilestone = useMutation(
    api.demo_timeline_plans.demo_createTimelineMilestone
  );
  const requestTimelineModification = useMutation(
    api.demo_timeline_plans.demo_requestTimelineModification
  );
  const reviewTimelineModificationRequest = useMutation(
    api.demo_timeline_plans.demo_reviewTimelineModificationRequest
  );
  const createTimelineCashInfusion = useMutation(
    api.demo_timeline_plans.demo_createTimelineCashInfusion
  );
  const updateTimelineMilestone = useMutation(
    api.demo_timeline_plans.demo_updateTimelineMilestone
  );
  const deleteTimelineMilestone = useMutation(
    api.demo_timeline_plans.demo_deleteTimelineMilestone
  );
  const submitTimelineMilestoneCompletion = useMutation(
    api.demo_timeline_plans.demo_submitTimelineMilestoneCompletion
  );
  const reviewTimelineMilestoneCompletion = useMutation(
    api.demo_timeline_plans.demo_reviewTimelineMilestoneCompletion
  );
  const updateTimelinePlanState = useMutation(
    api.demo_timeline_plans.demo_updateTimelinePlanState
  );
  const generateTimelineEvidenceUploadUrl = useMutation(
    api.demo_timeline_plans.demo_generateTimelineEvidenceUploadUrl
  );
  const createTimelineEvidenceAsset = useMutation(
    api.demo_timeline_plans.demo_createTimelineEvidenceAsset
  );
  const updateTimelineEvidenceAssetMutation = useMutation(
    api.demo_timeline_plans.demo_updateTimelineEvidenceAsset
  );
  const deleteTimelineEvidenceAsset = useMutation(
    api.demo_timeline_plans.demo_deleteTimelineEvidenceAsset
  );

  return {
    approveTimelinePlan,
    createTimelineCapitalEvent,
    createTimelineCashInfusion,
    createTimelineDraw,
    createTimelineEvidenceAsset,
    createTimelineMilestone,
    createTimelinePlan,
    deleteTimelineCapitalEvent,
    deleteTimelineDraw,
    deleteTimelineEvidenceAsset,
    deleteTimelineMilestone,
    generateTimelineEvidenceUploadUrl,
    reviewTimelineDrawRequest,
    reviewTimelineMilestoneCompletion,
    reviewTimelineModificationRequest,
    submitTimelineDrawRequest,
    submitTimelineMilestoneCompletion,
    submitTimelinePlan,
    timelineDemoSettings,
    updateTimelineCapitalEvent,
    updateTimelineDraw,
    updateTimelineMilestone,
    updateTimelinePlanState,
    updateTimelineEvidenceAssetMutation,
    requestTimelineModification,
  };
}
