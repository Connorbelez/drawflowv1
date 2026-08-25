import { toast } from "sonner";

import { canUseAppPermission } from "#/features/builder-staff/app-permissions.ts";
import type {
  ProductionBuildDetail,
  ProductionBuildDetailActions,
} from "#/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx";
import { DocumentOperationIntentRegistry } from "#/features/backoffice-build-detail/documentOperationIntent.ts";
import { SiteVisitScheduleIntentRegistry } from "#/features/backoffice-build-detail/siteVisitScheduleIntent.ts";
import type { Id } from "../../../../../convex/_generated/dataModel";

type Operation = (...args: any[]) => any;

type BackofficeBuildDetailOperations = {
  addDocument: Operation;
  approveDraw: Operation;
  approveMilestone: Operation;
  assignContractorToMilestone: Operation;
  assignSiteVisit: Operation;
  attachAndInviteContractor: Operation;
  attachContractor: Operation;
  cancelActiveBuildSiteVisit: Operation;
  correctMilestoneStart: Operation;
  createContractor: Operation;
  createCalendarSyncSubscription: Operation;
  generateSiteVisitGuidance: Operation;
  rejectDraw: Operation;
  rejectMilestone: Operation;
  recordExternalCalendarSyncChange: Operation;
  releaseDraw: Operation;
  requestBudgetRevision: Operation;
  requestFacilityChange: Operation;
  requestLoanFacilityDateChange: Operation;
  requestMilestoneInfo: Operation;
  rescheduleActiveBuildSiteVisit: Operation;
  reviewBudgetRevision: Operation;
  reviewEvidence: Operation;
  reviewFacilityChangeRequest: Operation;
  reviseActiveBuildMilestoneSchedule: Operation;
  saveCalendarView: Operation;
  scheduleActiveBuildSiteVisit: Operation;
  sendContractorInvite: Operation;
  setAdminDecisionTargetDate: Operation;
  setDrawReleaseTargetDate: Operation;
  setEvidenceDueDate: Operation;
  setReviewTargetDate: Operation;
  startDrawReview: Operation;
  submitDrawForAdmin: Operation;
  updateActiveBuildNonFinancialDetails: Operation;
  removeContractorFromMilestone: Operation;
  retractMilestoneStart: Operation;
};

export function createBackofficeBuildDetailActions({
  activeBuildId,
  appPermissions,
  canMakeFinalDecision,
  detail,
  documentOperationIntents,
  materialPlanningActions,
  operations,
  siteVisitScheduleIntents,
  workosOrganizationId,
}: {
  activeBuildId: any;
  appPermissions: Parameters<typeof canUseAppPermission>[0];
  canMakeFinalDecision: boolean;
  detail: ProductionBuildDetail;
  documentOperationIntents: { current: DocumentOperationIntentRegistry };
  materialPlanningActions: ProductionBuildDetailActions["materialPlanning"];
  operations: BackofficeBuildDetailOperations;
  siteVisitScheduleIntents: { current: SiteVisitScheduleIntentRegistry };
  workosOrganizationId: string;
}): ProductionBuildDetailActions {
  const {
    addDocument,
    approveDraw,
    approveMilestone,
    assignContractorToMilestone,
    assignSiteVisit,
    attachAndInviteContractor,
    attachContractor,
    cancelActiveBuildSiteVisit,
    correctMilestoneStart,
    createContractor,
    createCalendarSyncSubscription,
    generateSiteVisitGuidance,
    rejectDraw,
    rejectMilestone,
    recordExternalCalendarSyncChange,
    releaseDraw,
    requestBudgetRevision,
    requestFacilityChange,
    requestLoanFacilityDateChange,
    requestMilestoneInfo,
    rescheduleActiveBuildSiteVisit,
    reviewBudgetRevision,
    reviewEvidence,
    reviewFacilityChangeRequest,
    reviseActiveBuildMilestoneSchedule,
    saveCalendarView,
    scheduleActiveBuildSiteVisit,
    sendContractorInvite,
    setAdminDecisionTargetDate,
    setDrawReleaseTargetDate,
    setEvidenceDueDate,
    setReviewTargetDate,
    startDrawReview,
    submitDrawForAdmin,
    updateActiveBuildNonFinancialDetails,
    removeContractorFromMilestone,
    retractMilestoneStart,
  } = operations;
  const actions: ProductionBuildDetailActions = {
    addDocument: canUseAppPermission(appPermissions, "evidence", "create")
      ? async (input) => {
          const clientOperationId =
            documentOperationIntents.current.keyFor(input);
          const result = await addDocument({
            buildId: activeBuildId,
            clientOperationId,
            ...input,
            mimeType: "application/octet-stream",
            sizeBytes: 0,
            workosOrganizationId,
          });
          documentOperationIntents.current.confirm(input);
          toast.success("Document added.");
          return result;
        }
      : undefined,
    approveDraw:
      canMakeFinalDecision &&
      canUseAppPermission(appPermissions, "draw", "update")
        ? (draw) =>
            approveDraw({
              buildId: activeBuildId,
              drawKey: draw.drawKey,
              note: "Approved for release from build detail workspace.",
              workosOrganizationId,
            })
        : undefined,
    approveMilestone:
      canMakeFinalDecision &&
      canUseAppPermission(appPermissions, "milestone", "update")
        ? ({ milestoneKey, note }) =>
            approveMilestone({
              buildId: activeBuildId,
              milestoneKey,
              note,
              workosOrganizationId,
            })
        : undefined,
    assignSiteVisit: canUseAppPermission(appPermissions, "evidence", "update")
      ? async (input) => {
          const intent = { ...input, requestedDay: 0 };
          const idempotencyKey =
            siteVisitScheduleIntents.current.keyFor(intent);
          const result = await assignSiteVisit({
            buildId: activeBuildId,
            idempotencyKey,
            milestoneKey: input.milestoneKey,
            note: input.note ?? "Assigned from build detail workspace.",
            requestedDay: 0,
            requestedTime: input.requestedTime,
            siteVisitGuidance: input.siteVisitGuidance,
            submilestoneGuidanceSections: input.submilestoneGuidanceSections,
            submilestoneKeys: input.submilestoneKeys,
            workosOrganizationId,
          });
          siteVisitScheduleIntents.current.confirm(intent);
          toast.success("Site visit assigned.");
          return result;
        }
      : undefined,
    generateSiteVisitGuidance: canUseAppPermission(
      appPermissions,
      "evidence",
      "update"
    )
      ? (input) =>
          generateSiteVisitGuidance({
            ...input,
            workosOrganizationId,
          })
      : undefined,
    assignContractorToMilestone: canUseAppPermission(
      appPermissions,
      "contractor",
      "update"
    )
      ? ({
          assignmentCost,
          contractorId,
          milestoneKey,
          role,
          submilestoneKeys,
        }) =>
          assignContractorToMilestone({
            ...assignmentCost,
            buildId: activeBuildId,
            contractorId: contractorId as any,
            milestoneKey,
            role,
            submilestoneKeys,
            workosOrganizationId,
          })
      : undefined,
    removeContractorFromMilestone: canUseAppPermission(
      appPermissions,
      "contractor",
      "update"
    )
      ? ({ contractorId, milestoneKey, reason, submilestoneKey }) =>
          removeContractorFromMilestone({
            buildId: activeBuildId,
            contractorId: contractorId as Id<"contractorProfiles">,
            milestoneKey,
            reason,
            submilestoneKey,
            workosOrganizationId,
          })
      : undefined,
    attachAndInviteContractor:
      canUseAppPermission(appPermissions, "contractor", "create") &&
      canUseAppPermission(appPermissions, "contractor", "update")
        ? ({ contractorId, role }) =>
            attachAndInviteContractor({
              buildId: activeBuildId,
              contractorId: contractorId as Id<"contractorProfiles">,
              role,
              workosOrganizationId,
            })
        : undefined,
    attachContractor: canUseAppPermission(
      appPermissions,
      "contractor",
      "update"
    )
      ? ({ contractorId, role }) =>
          attachContractor({
            buildId: activeBuildId,
            contractorId: contractorId as any,
            role,
            workosOrganizationId,
          })
      : undefined,
    createAndAttachContractor: canUseAppPermission(
      appPermissions,
      "contractor",
      "create"
    )
      ? async ({ contractor, role }) => {
          const contractorId = await createContractor({
            ...contractor,
            brokerageId: detail.build.brokerageId as any,
            workosOrganizationId,
          });
          await attachContractor({
            buildId: activeBuildId,
            contractorId,
            role,
            workosOrganizationId,
          });
          return contractorId;
        }
      : undefined,
    createAndAssignContractor: canUseAppPermission(
      appPermissions,
      "contractor",
      "create"
    )
      ? async ({ assignmentCost, contractor, milestoneKey, role }) => {
          const contractorId = await createContractor({
            ...contractor,
            brokerageId: detail.build.brokerageId as any,
            workosOrganizationId,
          });
          await assignContractorToMilestone({
            ...assignmentCost,
            buildId: activeBuildId,
            contractorId,
            milestoneKey,
            role,
            workosOrganizationId,
          });
          return contractorId;
        }
      : undefined,
    inviteContractor: canUseAppPermission(
      appPermissions,
      "contractor",
      "create"
    )
      ? (contractorId) =>
          sendContractorInvite({
            contractorId: contractorId as Id<"contractorProfiles">,
            workosOrganizationId,
          })
      : undefined,
    rejectDraw:
      canMakeFinalDecision &&
      canUseAppPermission(appPermissions, "draw", "update")
        ? ({ draw, reason }) =>
            rejectDraw({
              buildId: activeBuildId,
              drawKey: draw.drawKey,
              note: reason,
              workosOrganizationId,
            })
        : undefined,
    rejectMilestone:
      canMakeFinalDecision &&
      canUseAppPermission(appPermissions, "milestone", "update")
        ? ({ milestoneKey }) =>
            rejectMilestone({
              buildId: activeBuildId,
              milestoneKey,
              note: "Rejected from build detail workspace.",
              workosOrganizationId,
            })
        : undefined,
    releaseDraw:
      canMakeFinalDecision &&
      canUseAppPermission(appPermissions, "draw", "update")
        ? (draw) =>
            releaseDraw({
              buildId: activeBuildId,
              drawKey: draw.drawKey,
              note: "Released from build detail workspace.",
              releaseDate: new Date().toISOString().slice(0, 10),
              workosOrganizationId,
            })
        : undefined,
    startDrawReview: canUseAppPermission(appPermissions, "draw", "update")
      ? (draw) =>
          startDrawReview({
            buildId: activeBuildId,
            drawKey: draw.drawKey,
            note: "Review started from build detail workspace.",
            workosOrganizationId,
          })
      : undefined,
    submitDrawForAdmin: canUseAppPermission(appPermissions, "draw", "update")
      ? (draw) =>
          submitDrawForAdmin({
            buildId: activeBuildId,
            drawKey: draw.drawKey,
            note: "Operations review complete; recommend admin approval.",
            workosOrganizationId,
          })
      : undefined,
    reviseMilestoneSchedule: canUseAppPermission(
      appPermissions,
      "milestone",
      "update"
    )
      ? (input) =>
          reviseActiveBuildMilestoneSchedule({
            ...input,
            buildId: activeBuildId,
            workosOrganizationId,
          }).then(() => toast.success("Milestone schedule revised."))
      : undefined,
    setEvidenceDueDate: canUseAppPermission(
      appPermissions,
      "evidence",
      "update"
    )
      ? (input) =>
          setEvidenceDueDate({
            ...input,
            buildId: activeBuildId,
            workosOrganizationId,
          }).then(() => toast.success("Evidence due date set."))
      : undefined,
    setReviewTargetDate: canUseAppPermission(
      appPermissions,
      "reminder",
      "create"
    )
      ? (input) =>
          setReviewTargetDate({
            ...input,
            buildId: activeBuildId,
            workosOrganizationId,
          }).then(() => toast.success("Review target date set."))
      : undefined,
    setAdminDecisionTargetDate: canUseAppPermission(
      appPermissions,
      "reminder",
      "create"
    )
      ? (input) =>
          setAdminDecisionTargetDate({
            ...input,
            buildId: activeBuildId,
            workosOrganizationId,
          }).then(() => toast.success("Admin decision target set."))
      : undefined,
    setDrawReleaseTargetDate: canUseAppPermission(
      appPermissions,
      "reminder",
      "create"
    )
      ? (input) =>
          setDrawReleaseTargetDate({
            ...input,
            buildId: activeBuildId,
            workosOrganizationId,
          }).then(() => toast.success("Draw release target set."))
      : undefined,
    scheduleSiteVisit: canUseAppPermission(
      appPermissions,
      "evidence",
      "update"
    )
      ? async (input) => {
          const idempotencyKey =
            siteVisitScheduleIntents.current.keyFor(input);
          const result = await scheduleActiveBuildSiteVisit({
            ...input,
            buildId: activeBuildId,
            idempotencyKey,
            workosOrganizationId,
          });
          siteVisitScheduleIntents.current.confirm(input);
          toast.success("Site visit scheduled.");
          return result;
        }
      : undefined,
    rescheduleSiteVisit: canUseAppPermission(
      appPermissions,
      "evidence",
      "update"
    )
      ? (input) =>
          rescheduleActiveBuildSiteVisit({
            ...input,
            buildId: activeBuildId,
            workosOrganizationId,
          }).then(() => toast.success("Site visit rescheduled."))
      : undefined,
    cancelSiteVisit: canUseAppPermission(appPermissions, "evidence", "update")
      ? (input) =>
          cancelActiveBuildSiteVisit({
            ...input,
            buildId: activeBuildId,
            workosOrganizationId,
          }).then(() => toast.success("Site visit cancelled."))
      : undefined,
    requestLoanFacilityDateChange: canUseAppPermission(
      appPermissions,
      "capitalEvent",
      "create"
    )
      ? (input) =>
          requestLoanFacilityDateChange({
            ...input,
            buildId: activeBuildId,
            workosOrganizationId,
          }).then(() => toast.success("Facility date change requested."))
      : undefined,
    saveCalendarView: (input) =>
      saveCalendarView({
        ...input,
        surface: "activeBuild",
        workosOrganizationId,
      }),
    createCalendarSyncSubscription: (input) =>
      createCalendarSyncSubscription({
        ...input,
        buildId:
          input.surface === "activeBuild"
            ? ((input as any).sourceId as Id<"activeBuilds">)
            : undefined,
        workosOrganizationId,
      }),
    recordExternalCalendarSyncChange: (input) =>
      recordExternalCalendarSyncChange({
        ...input,
        workosOrganizationId,
      }),
    requestFacilityChange: canUseAppPermission(
      appPermissions,
      "capitalEvent",
      "create"
    )
      ? (input) =>
          requestFacilityChange({
            ...input,
            buildId: activeBuildId,
            workosOrganizationId,
          })
      : undefined,
    requestBudgetRevision: canUseAppPermission(
      appPermissions,
      "capitalEvent",
      "create"
    )
      ? (input) =>
          requestBudgetRevision({
            ...input,
            buildId: activeBuildId,
            workosOrganizationId,
          })
      : undefined,
    reviewFacilityChangeRequest: canUseAppPermission(
      appPermissions,
      "capitalEvent",
      "update"
    )
      ? (input) =>
          reviewFacilityChangeRequest({
            ...input,
            requestId: input.requestId as any,
            workosOrganizationId,
          })
      : undefined,
    reviewBudgetRevision: canUseAppPermission(
      appPermissions,
      "capitalEvent",
      "update"
    )
      ? (input) =>
          reviewBudgetRevision({
            ...input,
            requestId: input.requestId as any,
            workosOrganizationId,
          })
      : undefined,
    requestMilestoneInfo: canUseAppPermission(
      appPermissions,
      "milestone",
      "update"
    )
      ? ({ milestoneKey, note }) =>
          requestMilestoneInfo({
            buildId: activeBuildId,
            milestoneKey,
            note,
            workosOrganizationId,
          })
      : undefined,
    reviewEvidence: canUseAppPermission(appPermissions, "evidence", "update")
      ? ({ accepted, milestoneKey, note }) =>
          reviewEvidence({
            accepted,
            buildId: activeBuildId,
            milestoneKey,
            note,
            workosOrganizationId,
          })
      : undefined,
    correctMilestoneStart: canUseAppPermission(
      appPermissions,
      "milestone",
      "update"
    )
      ? (input) =>
          correctMilestoneStart({
            ...input,
            buildId: activeBuildId,
            workosOrganizationId,
          })
      : undefined,
    retractMilestoneStart: canUseAppPermission(
      appPermissions,
      "milestone",
      "update"
    )
      ? (input) =>
          retractMilestoneStart({
            ...input,
            buildId: activeBuildId,
            workosOrganizationId,
          })
      : undefined,
    updateNonFinancialDetails: (input) =>
      updateActiveBuildNonFinancialDetails({
        ...input,
        buildId: activeBuildId,
        workosOrganizationId,
      }).then(() => toast.success("Build details updated.")),
    materialPlanning: materialPlanningActions,
  };
  return actions;
}
