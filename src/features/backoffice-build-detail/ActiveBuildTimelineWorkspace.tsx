"use client";

import { useMutation } from "convex/react";
import { useMemo } from "react";

import {
  convexWorkspaceToTimelineState,
  type ConvexTimelineWorkspace,
} from "#/features/timeline-workspace/-timeline-convex-adapter.ts";
import {
  TimelineWorkspace,
  type TimelineModificationRequestView,
  type TimelineWorkspacePersistence,
} from "#/features/timeline-workspace/index.tsx";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export interface ActiveBuildTimelineWorkspaceProps {
  backofficeHref: string;
  buildHref: string;
  buildId: Id<"activeBuilds">;
  initialRole?: "builder" | "lender";
  workspace: ConvexTimelineWorkspace & {
    modificationRequests?: TimelineModificationRequestView[];
    proposal: {
      buildName: string;
      location: string;
      reviewOutcome?: string;
      status: string;
      totalBudgetCents: number;
    };
  };
  workosOrganizationId: string;
}

export function ActiveBuildTimelineWorkspace({
  backofficeHref,
  buildHref,
  buildId,
  initialRole = "lender",
  workspace,
  workosOrganizationId,
}: ActiveBuildTimelineWorkspaceProps) {
  const productionApi = (api as any).production_proposals;
  const updatePlanState = useMutation(
    productionApi.updateActiveBuildTimelinePlanState,
  );
  const createMilestone = useMutation(
    productionApi.createActiveBuildTimelineMilestone,
  );
  const updateMilestone = useMutation(
    productionApi.updateActiveBuildTimelineMilestone,
  );
  const deleteMilestone = useMutation(
    productionApi.deleteActiveBuildTimelineMilestone,
  );
  const createDraw = useMutation(productionApi.createActiveBuildTimelineDraw);
  const updateDraw = useMutation(productionApi.updateActiveBuildTimelineDraw);
  const deleteDraw = useMutation(productionApi.deleteActiveBuildTimelineDraw);
  const createCapitalEvent = useMutation(
    productionApi.createActiveBuildTimelineCapitalEvent,
  );
  const createCashInfusion = useMutation(
    productionApi.createActiveBuildTimelineCashInfusion,
  );
  const updateCapitalEvent = useMutation(
    productionApi.updateActiveBuildTimelineCapitalEvent,
  );
  const deleteCapitalEvent = useMutation(
    productionApi.deleteActiveBuildTimelineCapitalEvent,
  );
  const generateEvidenceUploadUrl = useMutation(
    productionApi.generateActiveBuildEvidenceUploadUrl,
  );
  const createEvidenceAsset = useMutation(
    productionApi.createActiveBuildTimelineEvidenceAsset,
  );
  const updateEvidenceAsset = useMutation(
    productionApi.updateActiveBuildTimelineEvidenceAsset,
  );
  const deleteEvidenceAsset = useMutation(
    productionApi.deleteActiveBuildTimelineEvidenceAsset,
  );
  const submitMilestoneCompletion = useMutation(
    productionApi.submitActiveBuildMilestoneCompletion,
  );
  const approveMilestone = useMutation(productionApi.approveActiveBuildMilestone);
  const requestMilestoneInfo = useMutation(
    productionApi.requestActiveBuildMilestoneInfo,
  );
  const requestDraw = useMutation(productionApi.requestActiveBuildDraw);
  const approveDraw = useMutation(productionApi.approveActiveBuildDraw);
  const rejectDraw = useMutation(productionApi.rejectActiveBuildDraw);
  const requestMilestoneSiteVisit = useMutation(
    productionApi.assignActiveBuildSiteVisit,
  );
  const recordMilestoneSiteVisit = useMutation(
    productionApi.recordActiveBuildSiteVisit,
  );

  const initialState = useMemo(
    () => convexWorkspaceToTimelineState(workspace),
    [workspace],
  );
  const persistence = useMemo<TimelineWorkspacePersistence>(
    () => ({
      createCapitalEvent: (input) =>
        createCapitalEvent({
          ...input,
          buildId,
          workosOrganizationId,
        }),
      createCashInfusion: (input) =>
        createCashInfusion({
          ...input,
          buildId,
          cashInfusionKey: input.cashInfusionKey ?? input.capitalEventKey,
          workosOrganizationId,
        }),
      createDraw: (input) =>
        createDraw({
          ...input,
          buildId,
          itemMilestoneKey: input.itemMilestoneKey ?? input.milestoneKey,
          workosOrganizationId,
        }),
      createEvidenceAsset: (input) =>
        createEvidenceAsset({
          ...input,
          asset: normalizeEvidenceAssetInput(input.asset),
          buildId,
          workosOrganizationId,
        }),
      createMilestone: (input) =>
        createMilestone({
          buildId,
          milestone: normalizeTimelineMilestoneInput(input.milestone),
          workosOrganizationId,
        }),
      deleteCapitalEvent: (input) =>
        deleteCapitalEvent({
          ...input,
          buildId,
          workosOrganizationId,
        }),
      deleteDraw: (input) =>
        deleteDraw({
          ...input,
          buildId,
          workosOrganizationId,
        }),
      deleteEvidenceAsset: (input) =>
        deleteEvidenceAsset({
          ...input,
          buildId,
          workosOrganizationId,
        }),
      deleteMilestone: (input) =>
        deleteMilestone({
          ...input,
          buildId,
          workosOrganizationId,
        }),
      generateEvidenceUploadUrl: () =>
        generateEvidenceUploadUrl({
          buildId,
          workosOrganizationId,
        }),
      requestModification: (input) =>
        applyActiveBuildModification(input, {
          buildId,
          createMilestone,
          deleteMilestone,
          updateMilestone,
          workosOrganizationId,
        }),
      requestMilestoneSiteVisit: (input) =>
        requestMilestoneSiteVisit({
          buildId,
          milestoneKey: input.milestoneKey,
          note: input.note ?? input.reason,
          requestedDay: input.requestedDay,
          workosOrganizationId,
        }),
      recordMilestoneSiteVisit: (input) =>
        recordMilestoneSiteVisit({
          buildId,
          milestoneKey: input.milestoneKey,
          note: input.note,
          status: input.status ?? "complete",
          visitId: input.visitId,
          workosOrganizationId,
        }),
      reviewDrawRequest: (input) =>
        input.status === "rejected"
          ? rejectDraw({
              buildId,
              drawKey: input.drawKey,
              note: input.note,
              workosOrganizationId,
            })
          : approveDraw({
              buildId,
              drawKey: input.drawKey,
              note: input.note,
              workosOrganizationId,
            }),
      reviewMilestoneCompletion: (input) =>
        input.status === "approved"
          ? approveMilestone({
              buildId,
              milestoneKey: input.milestoneKey,
              note: input.note,
              workosOrganizationId,
            })
          : requestMilestoneInfo({
              buildId,
              milestoneKey: input.milestoneKey,
              note: input.note ?? "More information requested.",
              workosOrganizationId,
            }),
      submitDrawRequest: (input) =>
        requestDraw({
          amountCents: input.amountCents,
          buildId,
          drawKey: input.drawKey,
          note: input.note,
          workosOrganizationId,
        }),
      submitMilestoneCompletion: (input) =>
        submitMilestoneCompletion({
          ...input,
          buildId,
          workosOrganizationId,
        }),
      updateCapitalEvent: (input) =>
        updateCapitalEvent({
          ...input,
          buildId,
          workosOrganizationId,
        }),
      updateDraw: (input) =>
        updateDraw({
          ...input,
          buildId,
          itemMilestoneKey: input.itemMilestoneKey ?? input.milestoneKey,
          workosOrganizationId,
        }),
      updateEvidenceAsset: (input) =>
        updateEvidenceAsset({
          ...input,
          buildId,
          workosOrganizationId,
        }),
      updateMilestone: (input) =>
        updateMilestone({
          ...normalizeTimelineMilestonePatch(input),
          buildId,
          workosOrganizationId,
        }),
      updatePlanState: (input) =>
        updatePlanState({
          ...input,
          buildId,
          workosOrganizationId,
        }),
    }),
    [
      approveDraw,
      approveMilestone,
      buildId,
      createCapitalEvent,
      createCashInfusion,
      createDraw,
      createEvidenceAsset,
      createMilestone,
      deleteCapitalEvent,
      deleteDraw,
      deleteEvidenceAsset,
      deleteMilestone,
      generateEvidenceUploadUrl,
      recordMilestoneSiteVisit,
      rejectDraw,
      requestDraw,
      requestMilestoneInfo,
      requestMilestoneSiteVisit,
      submitMilestoneCompletion,
      updateCapitalEvent,
      updateDraw,
      updateEvidenceAsset,
      updateMilestone,
      updatePlanState,
      workosOrganizationId,
    ],
  );

  return (
    <TimelineWorkspace
      allowRoleSwitching={false}
      durableMeta={{
        backofficeHref,
        liveBuildHref: buildHref,
        proposalHref: buildHref,
        proposalSlug: String(buildId),
        status: "approved",
      }}
      durablePlanId={String(buildId)}
      initialRole={initialRole}
      initialState={initialState}
      modificationRequests={workspace.modificationRequests ?? []}
      persistence={persistence}
      timelineSettingsProjection={null}
      workspaceMode="live"
    />
  );
}

function normalizeTimelineMilestoneInput(input: any) {
  const dayStart = Math.max(0, Math.round(input.dayStart ?? input.x ?? 0));
  const durationDays = Math.max(1, Math.round(input.durationDays ?? 1));
  return {
    budgetCents: Math.max(0, Math.round(input.budgetCents ?? 0)),
    dayEnd: Math.max(dayStart, Math.round(input.dayEnd ?? dayStart + durationDays)),
    dayStart,
    dependencyKeys: input.dependencyKeys ?? [],
    drawAvailabilityCents:
      input.drawAvailabilityCents === undefined
        ? undefined
        : Math.max(0, Math.round(input.drawAvailabilityCents)),
    durationDays,
    evidenceState: input.evidenceState ?? "Draft package",
    icon: input.icon,
    lane: input.lane,
    markerLabel: input.markerLabel,
    milestoneKey: input.milestoneKey,
    name: input.name ?? "Timeline milestone",
    order: Math.max(1, Math.round(input.order ?? 1)),
    policyState: input.policyState ?? "Approved reimbursement policy",
    status: input.status,
    submilestones: (input.submilestones ?? []).map(normalizeSubmilestoneInput),
    tone: input.tone,
    x: dayStart,
  };
}

function normalizeTimelineMilestonePatch(input: any) {
  const normalized = normalizeTimelineMilestoneInput({
    ...input,
    dayStart: input.dayStart ?? input.x,
  });
  return {
    budgetCents: normalized.budgetCents,
    dayEnd: normalized.dayEnd,
    dayStart: normalized.dayStart,
    dependencyKeys: normalized.dependencyKeys,
    drawAvailabilityCents: normalized.drawAvailabilityCents,
    durationDays: normalized.durationDays,
    evidenceState: normalized.evidenceState,
    milestoneKey: normalized.milestoneKey,
    name: normalized.name,
    order: normalized.order,
    policyState: normalized.policyState,
    submilestones: normalized.submilestones,
  };
}

function normalizeSubmilestoneInput(input: any, index: number) {
  return {
    ...(input.budgetCents === undefined
      ? {}
      : { budgetCents: Math.max(0, Math.round(input.budgetCents)) }),
    ...(input.durationDays === undefined
      ? {}
      : { durationDays: Math.max(1, Math.round(input.durationDays)) }),
    key: input.key ?? `sub-${index + 1}`,
    name: input.name ?? "Submilestone",
    order: Math.max(1, Math.round(input.order ?? index + 1)),
  };
}

function normalizeEvidenceAssetInput(input: any) {
  return {
    contractorIds: input.contractorIds,
    evidenceKey: input.evidenceKey,
    fileName: input.fileName,
    label: input.label,
    locationVerified: input.locationVerified,
    milestoneKey: input.milestoneKey,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    source: input.source,
    storageId: input.storageId as Id<"_storage"> | undefined,
    submilestoneKey: input.submilestoneKey,
    tag: input.tag,
  };
}

function applyActiveBuildModification(
  input: any,
  mutations: {
    buildId: Id<"activeBuilds">;
    createMilestone: (args: any) => Promise<unknown>;
    deleteMilestone: (args: any) => Promise<unknown>;
    updateMilestone: (args: any) => Promise<unknown>;
    workosOrganizationId: string;
  },
) {
  if (input.requestType === "createMilestone") {
    return mutations.createMilestone({
      buildId: mutations.buildId,
      milestone: normalizeTimelineMilestoneInput(input.requestedPayload?.milestone),
      workosOrganizationId: mutations.workosOrganizationId,
    });
  }
  if (input.requestType === "deleteMilestone") {
    return mutations.deleteMilestone({
      buildId: mutations.buildId,
      milestoneKey: input.milestoneKey,
      workosOrganizationId: mutations.workosOrganizationId,
    });
  }
  if (input.requestType === "updateMilestoneBudget") {
    return mutations.updateMilestone({
      buildId: mutations.buildId,
      budgetCents: input.requestedPayload?.budgetCents,
      milestoneKey: input.milestoneKey,
      workosOrganizationId: mutations.workosOrganizationId,
    });
  }
  return Promise.resolve();
}

function centsToDollars(value: number) {
  return Math.round(value / 100);
}
