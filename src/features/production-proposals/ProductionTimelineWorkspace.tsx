import { useMutation } from "convex/react";
import { useMemo } from "react";

import {
  convexWorkspaceToTimelineState,
  type ConvexTimelineWorkspace,
} from "#/routes/demo/timeline/-timeline-convex-adapter.ts";
import {
  TimelineDemoWorkspace,
  type TimelineModificationRequestView,
  type TimelineWorkspacePersistence,
} from "#/routes/demo/timeline/index.tsx";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export interface ProductionTimelineWorkspaceProps {
  backofficeHref: string;
  initialRole?: "builder" | "lender";
  persistenceMode?: "convex" | "noop";
  proposalHref: string;
  proposalId: Id<"buildProposals">;
  workspace: ConvexTimelineWorkspace & {
    modificationRequests?: TimelineModificationRequestView[];
    planSummary?: {
      address?: string;
      includedCount: number;
      templateTitle: string;
      totalBudget: number;
    };
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

export function ProductionTimelineWorkspace({
  backofficeHref,
  initialRole = "builder",
  persistenceMode = "convex",
  proposalHref,
  proposalId,
  workspace,
  workosOrganizationId,
}: ProductionTimelineWorkspaceProps) {
  const submitProposal = useMutation(api.production_proposals.submitProposal);
  const updatePlanState = useMutation(
    api.production_proposals.updateProductionTimelinePlanState,
  );
  const createMilestone = useMutation(
    api.production_proposals.createProductionTimelineMilestone,
  );
  const updateMilestone = useMutation(
    api.production_proposals.updateProductionTimelineMilestone,
  );
  const deleteMilestone = useMutation(
    api.production_proposals.deleteProductionTimelineMilestone,
  );
  const createDraw = useMutation(
    api.production_proposals.createProductionTimelineDraw,
  );
  const updateDraw = useMutation(
    api.production_proposals.updateProductionTimelineDraw,
  );
  const deleteDraw = useMutation(
    api.production_proposals.deleteProductionTimelineDraw,
  );
  const createCapitalEvent = useMutation(
    api.production_proposals.createProductionTimelineCapitalEvent,
  );
  const createCashInfusion = useMutation(
    api.production_proposals.createProductionTimelineCashInfusion,
  );
  const updateCapitalEvent = useMutation(
    api.production_proposals.updateProductionTimelineCapitalEvent,
  );
  const deleteCapitalEvent = useMutation(
    api.production_proposals.deleteProductionTimelineCapitalEvent,
  );
  const generateEvidenceUploadUrl = useMutation(
    api.production_proposals.generateProductionEvidenceUploadUrl,
  );
  const createEvidenceAsset = useMutation(
    api.production_proposals.createProductionTimelineEvidenceAsset,
  );
  const updateEvidenceAsset = useMutation(
    api.production_proposals.updateProductionTimelineEvidenceAsset,
  );
  const deleteEvidenceAsset = useMutation(
    api.production_proposals.deleteProductionTimelineEvidenceAsset,
  );
  const submitMilestoneCompletion = useMutation(
    api.production_proposals.submitProductionMilestoneCompletion,
  );
  const reviewMilestoneCompletion = useMutation(
    api.production_proposals.reviewProductionMilestoneCompletion,
  );
  const submitDrawRequest = useMutation(
    api.production_proposals.submitProductionDrawRequest,
  );
  const reviewDrawRequest = useMutation(
    api.production_proposals.reviewProductionDrawRequest,
  );
  const requestModification = useMutation(
    api.production_proposals.requestProductionTimelineModification,
  );
  const requestMilestoneSiteVisit = useMutation(
    api.production_proposals.requestProductionMilestoneSiteVisit,
  );
  const recordMilestoneSiteVisit = useMutation(
    api.production_proposals.recordProductionMilestoneSiteVisit,
  );
  const reviewModificationRequest = useMutation(
    api.production_proposals.reviewProductionTimelineModificationRequest,
  );

  const initialState = useMemo(
    () => convexWorkspaceToTimelineState(workspace),
    [workspace],
  );
  const durableStatus = productionTimelineStatus(workspace.proposal);
  const convexPersistence = useMemo<TimelineWorkspacePersistence>(
    () => ({
      createCapitalEvent: (input) =>
        createCapitalEvent({
          ...input,
          proposalId,
          workosOrganizationId,
        }),
      createCashInfusion: (input) =>
        createCashInfusion({
          ...input,
          proposalId,
          workosOrganizationId,
        }),
      createDraw: (input) =>
        createDraw({
          ...input,
          proposalId,
          workosOrganizationId,
        }),
      createEvidenceAsset: (input) =>
        createEvidenceAsset({
          ...input,
          asset: normalizeEvidenceAssetInput(input.asset),
          proposalId,
          workosOrganizationId,
        }),
      createMilestone: (input) =>
        createMilestone({
          milestone: normalizeProductionMilestoneInput(input.milestone),
          proposalId,
          workosOrganizationId,
        }),
      deleteCapitalEvent: (input) =>
        deleteCapitalEvent({
          ...input,
          proposalId,
          workosOrganizationId,
        }),
      deleteDraw: (input) =>
        deleteDraw({
          ...input,
          proposalId,
          workosOrganizationId,
        }),
      deleteEvidenceAsset: (input) =>
        deleteEvidenceAsset({
          ...input,
          proposalId,
          workosOrganizationId,
        }),
      deleteMilestone: (input) =>
        deleteMilestone({
          ...input,
          proposalId,
          workosOrganizationId,
        }),
      generateEvidenceUploadUrl: () =>
        generateEvidenceUploadUrl({
          proposalId,
          workosOrganizationId,
        }),
      requestModification: (input) =>
        requestModification({
          ...input,
          proposalId,
          workosOrganizationId,
        }),
      requestMilestoneSiteVisit: (input) =>
        requestMilestoneSiteVisit({
          ...input,
          proposalId,
          workosOrganizationId,
        }),
      recordMilestoneSiteVisit: (input) =>
        recordMilestoneSiteVisit({
          ...input,
          proposalId,
          workosOrganizationId,
        }),
      reviewDrawRequest: (input) =>
        reviewDrawRequest({
          ...input,
          proposalId,
          workosOrganizationId,
        }),
      reviewMilestoneCompletion: (input) =>
        reviewMilestoneCompletion({
          ...input,
          proposalId,
          workosOrganizationId,
        }),
      reviewModificationRequest: (input) =>
        reviewModificationRequest({
          ...input,
          requestId: input.requestId as Id<"proposalTimelineModificationRequests">,
          workosOrganizationId,
        }),
      submitDrawRequest: (input) =>
        submitDrawRequest({
          ...input,
          proposalId,
          workosOrganizationId,
        }),
      submitMilestoneCompletion: (input) =>
        submitMilestoneCompletion({
          ...input,
          proposalId,
          workosOrganizationId,
        }),
      submitPlan: () =>
        submitProposal({
          proposalId,
          workosOrganizationId,
        }),
      updateCapitalEvent: (input) =>
        updateCapitalEvent({
          ...input,
          proposalId,
          workosOrganizationId,
        }),
      updateDraw: (input) =>
        updateDraw({
          ...input,
          proposalId,
          workosOrganizationId,
        }),
      updateEvidenceAsset: (input) =>
        updateEvidenceAsset({
          ...input,
          proposalId,
          workosOrganizationId,
        }),
      updateMilestone: (input) =>
        updateMilestone({
          ...normalizeProductionMilestonePatch(input),
          proposalId,
          workosOrganizationId,
        }),
      updatePlanState: (input) =>
        updatePlanState({
          ...input,
          proposalId,
          workosOrganizationId,
        }),
    }),
    [
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
      proposalId,
      requestModification,
      requestMilestoneSiteVisit,
      recordMilestoneSiteVisit,
      reviewDrawRequest,
      reviewMilestoneCompletion,
      reviewModificationRequest,
      submitDrawRequest,
      submitMilestoneCompletion,
      submitProposal,
      updateCapitalEvent,
      updateDraw,
      updateEvidenceAsset,
      updateMilestone,
      updatePlanState,
      workosOrganizationId,
    ],
  );
  const persistence =
    persistenceMode === "noop"
      ? noopTimelineWorkspacePersistence
      : convexPersistence;

  return (
    <TimelineDemoWorkspace
      allowRoleSwitching={false}
      durableMeta={{
        backofficeHref,
        proposalHref,
        proposalSlug: String(proposalId),
        status: durableStatus,
      }}
      durablePlanId={proposalId}
      initialRole={initialRole}
      initialState={initialState}
      modificationRequests={workspace.modificationRequests ?? []}
      persistence={persistence}
      planSummary={{
        address: workspace.planSummary?.address ?? workspace.proposal.location,
        includedCount:
          workspace.planSummary?.includedCount ?? workspace.milestones.length,
        templateTitle:
          workspace.planSummary?.templateTitle ?? workspace.proposal.buildName,
        totalBudget: centsToDollars(
          workspace.planSummary?.totalBudget ??
            workspace.proposal.totalBudgetCents,
        ),
      }}
      timelineSettingsProjection={null}
    />
  );
}

const noopTimelineWorkspacePersistence: TimelineWorkspacePersistence = {
  createCapitalEvent: async () => undefined,
  createCashInfusion: async () => undefined,
  createDraw: async () => undefined,
  createEvidenceAsset: async () => undefined,
  createMilestone: async () => undefined,
  deleteCapitalEvent: async () => undefined,
  deleteDraw: async () => undefined,
  deleteEvidenceAsset: async () => undefined,
  deleteMilestone: async () => undefined,
  generateEvidenceUploadUrl: async () => "about:blank",
  requestModification: async () => undefined,
  requestMilestoneSiteVisit: async () => undefined,
  recordMilestoneSiteVisit: async () => undefined,
  reviewDrawRequest: async () => undefined,
  reviewMilestoneCompletion: async () => undefined,
  reviewModificationRequest: async () => undefined,
  submitDrawRequest: async () => undefined,
  submitMilestoneCompletion: async () => undefined,
  submitPlan: async () => undefined,
  updateCapitalEvent: async () => undefined,
  updateDraw: async () => undefined,
  updateEvidenceAsset: async () => undefined,
  updateMilestone: async () => undefined,
  updatePlanState: async () => undefined,
};

function productionTimelineStatus(
  proposal: ProductionTimelineWorkspaceProps["workspace"]["proposal"],
) {
  if (proposal.reviewOutcome === "rejected") {
    return "rejected";
  }
  if (proposal.reviewOutcome === "requested_changes") {
    return "requested_changes";
  }
  return proposal.status;
}

function normalizeProductionMilestoneInput(input: any) {
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
    policyState: input.policyState ?? "Draft proposal policy",
    status: input.status,
    submilestones: (input.submilestones ?? []).map(normalizeSubmilestoneInput),
    tone: input.tone,
    x: dayStart,
  };
}

function normalizeProductionMilestonePatch(input: any) {
  const normalized = normalizeProductionMilestoneInput({
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
    icon: normalized.icon,
    lane: normalized.lane,
    markerLabel: normalized.markerLabel,
    milestoneKey: normalized.milestoneKey,
    name: normalized.name,
    order: normalized.order,
    policyState: normalized.policyState,
    status: normalized.status,
    submilestones: normalized.submilestones,
    tone: normalized.tone,
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
    evidenceKey: input.evidenceKey,
    fileName: input.fileName,
    label: input.label,
    locationVerified: input.locationVerified,
    milestoneKey: input.milestoneKey,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    source: input.source,
    storageId: input.storageId as Id<"_storage"> | undefined,
    tag: input.tag,
  };
}

function centsToDollars(value: number) {
  return Math.round(value / 100);
}
