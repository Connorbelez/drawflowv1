"use client";

import { useMutation } from "convex/react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import { BuildWorkspaceDemo } from "#/features/build-workspace-demo/BuildWorkspaceDemo.tsx";
import {
  contractorPlanningFromProductionDetail,
  parseGanttMilestoneScopeId,
} from "#/features/build-workspace-demo/build-workspace-contractor-planning.ts";
import type {
  AddMilestoneInput,
  BuildWorkspaceAdapter,
  DependencyHardness,
  MilestonePatch,
  OptimizationPlanId,
  SiteVisitReportDraft,
  WorkspaceRole,
} from "#/features/build-workspace-demo/types.ts";
import { BuildWorkspaceProvider } from "#/features/build-workspace-demo/workspace-adapter.tsx";
import { normalizeEvidenceFileForUpload } from "#/lib/evidence-image-normalization.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BuildDetailTarget } from "#/features/build-detail-targets/buildDetailTarget.ts";
import type { BuildDetailTargetContext } from "#/features/build-detail-targets/useBuildDetailTargetController.ts";
import type { ProductionBuildDetail } from "./ProductionBuildDetailSurface";
import type { SiteVisitOrderRequest } from "./SiteVisitOrderDialog.tsx";
import {
  cents,
  dayFromDate,
  evidenceStateLabel,
  mapActiveBuildWorkspace,
  slugifyMilestone,
} from "./active-build-gantt-mapper.ts";

export interface ActiveBuildGanttWorkspaceProps {
  buildId: Id<"activeBuilds">;
  canApproveMilestones?: boolean;
  canRejectMilestones?: boolean;
  detail: ProductionBuildDetail;
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext,
  ) => void;
  onRequestSiteVisit: (request: SiteVisitOrderRequest) => void;
  onStartWork?: (milestoneKey: string) => void;
  timelineWorkspace?: {
    evidenceAssets?: {
      evidenceKey: string;
      fileName: string;
      label: string;
      milestoneKey: string;
      mimeType: string;
      previewUrl?: string | null;
      sizeBytes: number;
      tag: string;
    }[];
    plan?: {
      currentDay: number;
    };
  } | null;
  viewerRole?: "builder" | "lender";
  workosOrganizationId: string;
}

export function ActiveBuildGanttWorkspace({
  buildId,
  canApproveMilestones = false,
  canRejectMilestones = false,
  detail,
  onOpenCanonicalTarget,
  onRequestSiteVisit,
  onStartWork,
  timelineWorkspace,
  viewerRole = "lender",
  workosOrganizationId,
}: ActiveBuildGanttWorkspaceProps) {
  const productionApi = (api as any).production_proposals;
  const updateMilestoneMutation = useMutation(
    productionApi.updateActiveBuildTimelineMilestone
  );
  const createMilestoneMutation = useMutation(
    productionApi.createActiveBuildTimelineMilestone
  );
  const createEvidenceMutation = useMutation(
    productionApi.createActiveBuildTimelineEvidenceAsset
  );
  const generateEvidenceUploadUrl = useMutation(
    productionApi.generateActiveBuildEvidenceUploadUrl
  );
  const submitCompletionClaim = useMutation(
    productionApi.submitActiveBuildMilestoneCompletion
  );
  const approveMilestone = useMutation(
    productionApi.approveActiveBuildMilestone
  );
  const rejectMilestone = useMutation(productionApi.rejectActiveBuildMilestone);
  const requestMoreInfo = useMutation(
    productionApi.requestActiveBuildMilestoneInfo
  );
  const recordSiteVisit = useMutation(productionApi.recordActiveBuildSiteVisit);
  const reviewEvidence = useMutation(productionApi.reviewActiveBuildEvidence);
  const assignContractorToMilestone = useMutation(
    productionApi.assignActiveBuildContractorToMilestone
  );
  const attachContractor = useMutation(
    productionApi.attachActiveBuildContractor
  );
  const createContractor = useMutation(productionApi.createContractorProfile);
  const createDraw = useMutation(productionApi.createActiveBuildTimelineDraw);
  const updateDraw = useMutation(productionApi.updateActiveBuildTimelineDraw);
  const deleteDraw = useMutation(productionApi.deleteActiveBuildTimelineDraw);

  const preferredRole: WorkspaceRole =
    viewerRole === "builder" ? "builderLead" : "lenderAdmin";
  const [role, setRole] = useState<WorkspaceRole>(preferredRole);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState("");
  const [startMilestoneKey, setStartMilestoneKey] = useState("");
  const [activePlanId, setActivePlanId] =
    useState<OptimizationPlanId>("capitalConstrained");
  const [dismissedIssueKeys, setDismissedIssueKeys] = useState(
    () => new Set<string>()
  );

  useEffect(() => {
    setRole((currentRole) =>
      currentRole === preferredRole ? currentRole : preferredRole
    );
  }, [preferredRole]);

  const mapped = useMemo(
    () =>
      mapActiveBuildWorkspace({
        activePlanId,
        detail,
        dismissedIssueKeys,
        role,
        selectedMilestoneId,
        timelineWorkspace,
      }),
    [
      activePlanId,
      detail,
      dismissedIssueKeys,
      role,
      selectedMilestoneId,
      timelineWorkspace,
    ]
  );
  const selectedId = selectedMilestoneId || mapped.selectedMilestoneId;
  const startableMilestones = detail.milestones.filter(
    (milestone) =>
      milestone.status === "planned" && milestone.actualStartedAt === undefined
  );
  const selectedStartMilestone =
    startableMilestones.find(
      (milestone) => milestone.key === startMilestoneKey
    ) ?? startableMilestones[0];
  const dependencies = mapped.dependencies;

  const contractorPlanning = useMemo(
    () => contractorPlanningFromProductionDetail(detail),
    [detail]
  );

  const adapter = useMemo<BuildWorkspaceAdapter>(
    () => ({
      ...mapped,
      activePlanId,
      assignContractorToMilestone: async ({
        assignmentCost,
        contractorId,
        milestoneId,
        role,
        submilestoneKeys,
      }) => {
        const scope = parseGanttMilestoneScopeId(milestoneId);
        await assignContractorToMilestone({
          ...assignmentCost,
          buildId,
          contractorId: contractorId as Id<"contractorProfiles">,
          milestoneKey: scope.milestoneKey,
          role,
          submilestoneKeys: submilestoneKeys ?? scope.submilestoneKeys,
          workosOrganizationId,
        });
      },
      contractorPlanning,
      createAndAssignContractor: async ({
        assignmentCost,
        contractor,
        milestoneId,
        role,
        submilestoneKeys,
      }) => {
        const scope = parseGanttMilestoneScopeId(milestoneId);
        const contractorId = await createContractor({
          ...contractor,
          brokerageId: detail.build.brokerageId as Id<"brokerages">,
          workosOrganizationId,
        });
        await attachContractor({
          buildId,
          contractorId,
          role,
          workosOrganizationId,
        });
        await assignContractorToMilestone({
          ...assignmentCost,
          buildId,
          contractorId,
          milestoneKey: scope.milestoneKey,
          role,
          submilestoneKeys: submilestoneKeys ?? scope.submilestoneKeys,
          workosOrganizationId,
        });
      },
      isLoading: false,
      mode: "active",
      resolveContractorMilestoneKey: (milestoneId) =>
        parseGanttMilestoneScopeId(milestoneId).milestoneKey,
      needsSeed: false,
      role,
      selectedMilestoneId: selectedId,
      addDependency: async (fromMilestoneId, toMilestoneId) => {
        const target = detail.milestones.find(
          (milestone) => milestone.key === toMilestoneId
        );
        if (!target) {
          return;
        }
        await updateMilestoneMutation({
          buildId,
          dependencyKeys: Array.from(
            new Set([...(target.dependencyKeys ?? []), fromMilestoneId])
          ),
          milestoneKey: toMilestoneId,
          workosOrganizationId,
        });
      },
      addMilestone: async (input: AddMilestoneInput) => {
        const nextOrder = detail.milestones.length + 1;
        const startDay = input.startAt
          ? dayFromDate(detail.build.startDate, input.startAt)
          : nextOrder * 14;
        const durationDays = Math.max(
          1,
          Math.round(input.estimatedDurationDays)
        );
        await createMilestoneMutation({
          buildId,
          milestone: {
            budgetCents: cents(input.estimatedCost),
            dayEnd: startDay + durationDays,
            dayStart: startDay,
            dependencyKeys: [],
            durationDays,
            evidenceState: "Draft package",
            milestoneKey: slugifyMilestone(input.name, nextOrder),
            name: input.name,
            order: nextOrder,
            policyState: "Approved reimbursement policy",
            submilestones: [],
            x: startDay,
          },
          workosOrganizationId,
        });
      },
      addSampleEvidence: async (milestoneId) => {
        await createEvidenceMutation({
          asset: {
            evidenceKey: `sample-${milestoneId}-${Date.now()}`,
            fileName: `${milestoneId}-field-photo.jpg`,
            label: "Field progress photo",
            locationVerified: true,
            milestoneKey: milestoneId,
            mimeType: "image/jpeg",
            sizeBytes: 0,
            source: "active_build_sample_evidence",
            tag: "Site photo",
          },
          buildId,
          workosOrganizationId,
        });
      },
      applyIssueQuickFix: async (issue) => {
        const targetId = issue.quickFix?.targetId ?? issue.milestoneIds[0];
        if (targetId) {
          setSelectedMilestoneId(targetId);
        }
      },
      applyRecommendedPlan: async () => {
        setActivePlanId("capitalConstrained");
      },
      approveMilestone: async (milestoneId, reason) => {
        if (!canApproveMilestones) {
          throw new Error("You do not have permission to approve milestones.");
        }
        await approveMilestone({
          buildId,
          milestoneKey: milestoneId,
          note: reason,
          workosOrganizationId,
        });
      },
      batchMoveMilestoneDates: async (moves, reason) => {
        await Promise.all(
          moves.map((move) =>
            updateMilestoneMutation({
              buildId,
              dayEnd: dayFromDate(
                detail.build.startDate,
                move.endAt ?? move.startAt
              ),
              dayStart: dayFromDate(detail.build.startDate, move.startAt),
              milestoneKey: move.milestoneId,
              workosOrganizationId,
            })
          )
        );
        void reason;
      },
      claimSiteVisit: async () => undefined,
      dismissIssue: async (issue) => {
        setDismissedIssueKeys((current) => {
          const next = new Set(current);
          next.add(`${issue.id}:${issue.conditionHash}`);
          return next;
        });
      },
      mergeDrawGroups: async (sourceDrawGroupId, targetDrawGroupId) => {
        const source = detail.draws.find(
          (draw) => draw.drawKey === sourceDrawGroupId
        );
        const target = detail.draws.find(
          (draw) => draw.drawKey === targetDrawGroupId
        );
        if (!(source && target)) {
          return;
        }
        await updateDraw({
          amountCents: source.amountCents + target.amountCents,
          buildId,
          drawKey: target.drawKey,
          workosOrganizationId,
        });
        await deleteDraw({
          buildId,
          drawKey: source.drawKey,
          workosOrganizationId,
        });
      },
      moveMilestoneDates: async (milestoneId, startAt, endAt) => {
        await updateMilestoneMutation({
          buildId,
          dayEnd: dayFromDate(detail.build.startDate, endAt ?? startAt),
          dayStart: dayFromDate(detail.build.startDate, startAt),
          milestoneKey: milestoneId,
          workosOrganizationId,
        });
      },
      moveMilestoneToDrawGroup: async (milestoneId, drawGroupId) => {
        await updateDraw({
          buildId,
          drawKey: drawGroupId,
          itemMilestoneKey: milestoneId,
          workosOrganizationId,
        });
      },
      recomputeProposalPlan: async () => undefined,
      rejectMilestone: async (milestoneId, reason) => {
        if (!canRejectMilestones) {
          throw new Error("You do not have permission to reject milestones.");
        }
        await rejectMilestone({
          buildId,
          milestoneKey: milestoneId,
          note: reason,
          workosOrganizationId,
        });
      },
      removeDependency: async (dependencyId) => {
        const dependency = dependencies.find(
          (item) => item.id === dependencyId
        );
        const target = detail.milestones.find(
          (milestone) => milestone.key === dependency?.toMilestoneId
        );
        if (!(dependency && target)) {
          return;
        }
        await updateMilestoneMutation({
          buildId,
          dependencyKeys: (target.dependencyKeys ?? []).filter(
            (key) => key !== dependency.fromMilestoneId
          ),
          milestoneKey: target.key,
          workosOrganizationId,
        });
      },
      reorderMilestone: async (milestoneId, direction) => {
        const sorted = [...detail.milestones].sort((a, b) => a.order - b.order);
        const fromIndex = sorted.findIndex(
          (milestone) => milestone.key === milestoneId
        );
        const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
        if (fromIndex < 0 || toIndex < 0 || toIndex >= sorted.length) {
          return;
        }
        await Promise.all([
          updateMilestoneMutation({
            buildId,
            milestoneKey: sorted[fromIndex].key,
            order: sorted[toIndex].order,
            workosOrganizationId,
          }),
          updateMilestoneMutation({
            buildId,
            milestoneKey: sorted[toIndex].key,
            order: sorted[fromIndex].order,
            workosOrganizationId,
          }),
        ]);
      },
      reorderMilestoneAbsolute: async (milestoneId, _fromIndex, toIndex) => {
        await updateMilestoneMutation({
          buildId,
          milestoneKey: milestoneId,
          order: toIndex + 1,
          workosOrganizationId,
        });
      },
      requestMoreInformation: async (milestoneId, reason) => {
        await requestMoreInfo({
          buildId,
          milestoneKey: milestoneId,
          note: reason,
          workosOrganizationId,
        });
      },
      requestSiteVisit: async (milestoneId, reason, includedMilestoneIds) => {
        onRequestSiteVisit({
          milestoneKey: milestoneId,
          note: reason,
          requestedDay: dayFromDate(detail.build.startDate, new Date()),
        });
        void includedMilestoneIds;
        return;
      },
      resetWorkspace: async () => undefined,
      reviewEvidence: async (milestoneId, accepted, reason) => {
        await reviewEvidence({
          accepted,
          buildId,
          milestoneKey: milestoneId,
          note: reason,
          workosOrganizationId,
        });
      },
      selectMilestone: setSelectedMilestoneId,
      setActivePlan: setActivePlanId,
      setDependencyHardness: async (
        dependencyId: string,
        _hardness: DependencyHardness
      ) => {
        const dependency = dependencies.find(
          (item) => item.id === dependencyId
        );
        if (dependency) {
          await updateMilestoneMutation({
            buildId,
            dependencyKeys:
              detail.milestones.find(
                (milestone) => milestone.key === dependency.toMilestoneId
              )?.dependencyKeys ?? [],
            milestoneKey: dependency.toMilestoneId,
            workosOrganizationId,
          });
        }
      },
      setMilestoneDragLocked: async (milestoneId, locked) => {
        await updateMilestoneMutation({
          buildId,
          isDragLocked: locked,
          milestoneKey: milestoneId,
          workosOrganizationId,
        });
      },
      setRole,
      splitDrawGroup: async (drawGroupId, afterMilestoneId) => {
        const source = detail.draws.find(
          (draw) => draw.drawKey === drawGroupId
        );
        const milestone = detail.milestones.find(
          (item) => item.key === afterMilestoneId
        );
        if (!(source && milestone)) {
          return;
        }
        await createDraw({
          amountCents: milestone.drawAvailabilityCents,
          buildId,
          drawKey: `${source.drawKey}-${milestone.key}`,
          itemMilestoneKey: milestone.key,
          label: `${milestone.name} reimbursement draw`,
          order: source.order + 1,
          workosOrganizationId,
          x: milestone.dayEnd,
        });
      },
      submitCompletionClaim: async (milestoneId, requestedAmountCents) => {
        const milestone = detail.milestones.find(
          (item) => item.key === milestoneId
        );
        await submitCompletionClaim({
          actualCostCents: requestedAmountCents,
          ...(milestone?.actualStartedAt
            ? {}
            : { actualStartedAt: Date.now() }),
          buildId,
          completedDay:
            milestone?.dayEnd ??
            dayFromDate(detail.build.startDate, new Date()),
          milestoneKey: milestoneId,
          idempotencyKey: crypto.randomUUID(),
          note: "Completion submitted from build workspace.",
          workosOrganizationId,
        });
      },
      submitProposal: async () => undefined,
      submitSiteVisitReport: async (
        milestoneId: string,
        report: SiteVisitReportDraft
      ) => {
        const visit = detail.siteVisits
          ?.filter((item) => item.milestoneKey === milestoneId)
          .at(-1);
        if (!visit) {
          return;
        }
        await recordSiteVisit({
          buildId,
          milestoneKey: milestoneId,
          note: report.notes,
          status: report.completionObserved ? "complete" : "cancelled",
          visitId: visit.visitId,
          workosOrganizationId,
        });
      },
      updateForecastDates: async (milestoneId, startAt, endAt) => {
        await updateMilestoneMutation({
          buildId,
          dayEnd: dayFromDate(detail.build.startDate, endAt),
          dayStart: dayFromDate(detail.build.startDate, startAt),
          milestoneKey: milestoneId,
          workosOrganizationId,
        });
      },
      updateMilestone: async (milestoneId, patch: MilestonePatch) => {
        await updateMilestoneMutation({
          buildId,
          ...(patch.actualCost === undefined
            ? {}
            : { budgetCents: cents(patch.actualCost) }),
          ...(patch.estimatedCost === undefined
            ? {}
            : { budgetCents: cents(patch.estimatedCost) }),
          ...(patch.estimatedDurationDays === undefined
            ? {}
            : {
                durationDays: Math.max(
                  1,
                  Math.round(patch.estimatedDurationDays)
                ),
              }),
          ...(patch.evidenceStatus === undefined
            ? {}
            : { evidenceState: evidenceStateLabel(patch.evidenceStatus) }),
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.progress === undefined
            ? {}
            : {
                progressPercent: patch.progress,
                status:
                  patch.progress >= 100
                    ? "complete"
                    : patch.progress > 0
                      ? "in_progress"
                      : "planned",
              }),
          milestoneKey: milestoneId,
          workosOrganizationId,
        });
      },
      updateProgress: async (milestoneId, progress) => {
        await updateMilestoneMutation({
          buildId,
          milestoneKey: milestoneId,
          progressPercent: progress,
          status:
            progress >= 100
              ? "complete"
              : progress > 0
                ? "in_progress"
                : "planned",
          workosOrganizationId,
        });
      },
      uploadEvidence: async (milestoneId, file, geofencePassed) => {
        const uploadFile = await normalizeEvidenceFileForUpload(file);
        const uploadUrl = await generateEvidenceUploadUrl({
          buildId,
          workosOrganizationId,
        });
        const response = await fetch(uploadUrl, {
          body: uploadFile,
          headers: {
            "Content-Type": uploadFile.type || "application/octet-stream",
          },
          method: "POST",
        });
        if (!response.ok) {
          throw new Error("Evidence upload failed.");
        }
        const { storageId } = await response.json();
        await createEvidenceMutation({
          asset: {
            evidenceKey: `upload-${milestoneId}-${Date.now()}`,
            fileName: uploadFile.name,
            label: uploadFile.name,
            locationVerified: geofencePassed,
            milestoneKey: milestoneId,
            mimeType: uploadFile.type || "application/octet-stream",
            sizeBytes: uploadFile.size,
            source: "active_build_workspace_upload",
            storageId,
            tag: geofencePassed ? "Evidence" : "Location unverified evidence",
          },
          buildId,
          workosOrganizationId,
        });
      },
    }),
    [
      activePlanId,
      approveMilestone,
      assignContractorToMilestone,
      attachContractor,
      buildId,
      canApproveMilestones,
      canRejectMilestones,
      contractorPlanning,
      createContractor,
      createDraw,
      createEvidenceMutation,
      createMilestoneMutation,
      deleteDraw,
      dependencies,
      detail,
      generateEvidenceUploadUrl,
      mapped,
      onRequestSiteVisit,
      recordSiteVisit,
      rejectMilestone,
      requestMoreInfo,
      reviewEvidence,
      role,
      selectedId,
      submitCompletionClaim,
      updateDraw,
      updateMilestoneMutation,
      workosOrganizationId,
    ]
  );

  return (
    <div className="grid gap-3">
      {viewerRole === "builder" && onStartWork && selectedStartMilestone ? (
        <Frame data-testid="gantt-start-work-controller">
          <FramePanel className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div>
              <p className="font-medium text-sm">Record actual work start</p>
              <p className="text-muted-foreground text-xs">
                Select the exact milestone. The approved Gantt schedule stays
                unchanged.
              </p>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-none">
              <Select
                items={startableMilestones.map((milestone) => ({
                  label: milestone.name,
                  value: milestone.key,
                }))}
                onValueChange={(value) => {
                  if (value) {
                    setStartMilestoneKey(value);
                  }
                }}
                value={selectedStartMilestone.key}
              >
                <SelectTrigger
                  aria-label="Milestone to start"
                  className="min-w-52 flex-1 sm:flex-none"
                  size="sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {startableMilestones.map((milestone) => (
                    <SelectItem key={milestone.key} value={milestone.key}>
                      {milestone.name}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <Button
                onClick={() => onStartWork(selectedStartMilestone.key)}
                size="sm"
                type="button"
              >
                Start work
              </Button>
            </div>
          </FramePanel>
        </Frame>
      ) : null}
      <BuildWorkspaceProvider workspace={adapter}>
        <BuildWorkspaceDemo
          canFinalizeMilestones={canApproveMilestones && canRejectMilestones}
          layout="embedded"
          onOpenSubmilestone={
            onOpenCanonicalTarget
              ? (submilestoneId) =>
                  onOpenCanonicalTarget(
                    {
                      kind: "submilestone",
                      submilestoneId,
                    },
                    { selectedTab: "overview" },
                  )
              : undefined
          }
          showPrimaryAction={false}
          showRoleSelector={false}
          viewer={viewerRole}
        />
      </BuildWorkspaceProvider>
    </div>
  );
}
