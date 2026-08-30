import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import { authorizeGeneratedMilestoneCompanionStructureOperation, type GeneratedMilestoneCompanionStructureOperation } from "../build_action_item_rbac";
import type { BuildCollaborationRole } from "../build_collaboration_model";
import { operateDenialMessage, resolveSubmilestoneOperateAuthority } from "../build_submilestone_operate_authority";
import type { Doc } from "../types";
import type { CollaborationState } from "./types";

function isLenderStaff(role: BuildCollaborationRole) {
  return (
    role === "admin" ||
    role === "principle-broker" ||
    role === "broker" ||
    role === "broker-staff"
  );
}
function allowed(allowedValue: boolean, reason: string) {
  return allowedValue
    ? { allowed: true as const }
    : { allowed: false as const, reason };
}

export function buildCapabilities(input: {
  actualStartedAt?: number;
  authorization: ActiveBuildAuthorization;
  collaboration: CollaborationState;
  evidencePackageStatus?: Doc<"buildSubmilestoneEvidencePackageRevisions">["status"];
  evidenceReviewState: NonNullable<
    Doc<"buildSubmilestones">["evidenceReviewState"]
  >;
  reviewDecisionState: NonNullable<
    Doc<"buildSubmilestones">["reviewDecisionState"]
  >;
  reopenAuthority: Awaited<
    ReturnType<typeof resolveSubmilestoneOperateAuthority>
  >;
  startAuthority: Awaited<
    ReturnType<typeof resolveSubmilestoneOperateAuthority>
  >;
  status: Doc<"buildSubmilestones">["status"];
  siteVisitRequirement?: Pick<
    Doc<"buildSubmilestoneSiteVisitRequirements">,
    "required" | "status"
  >;
  superseded: boolean;
  updateAuthority: Awaited<
    ReturnType<typeof resolveSubmilestoneOperateAuthority>
  >;
}) {
  const role = input.authorization.effectiveRole.role;
  const disabledReason = "Historical Sub-milestones are read-only.";
  const startReason = input.startAuthority.allowed
    ? ""
    : operateDenialMessage(input.startAuthority.denial);
  const updateReason = input.updateAuthority.allowed
    ? ""
    : operateDenialMessage(input.updateAuthority.denial);
  const reopenReason = input.reopenAuthority.allowed
    ? ""
    : operateDenialMessage(input.reopenAuthority.denial);
  const planned = input.status === "planned";
  const inProgress = input.status === "in_progress";
  const complete = input.status === "complete";
  const lenderStaff = isLenderStaff(role);
  const lenderAdmin = role === "admin";
  const lenderApprover = lenderAdmin || role === "principle-broker";
  const fullStructure =
    role === "admin" || role === "builder" || role === "builder-staff";
  const assignedContractor =
    role === "contractor" && input.updateAuthority.allowed;
  const completionAuthority =
    !input.superseded && input.updateAuthority.allowed;
  const canComplete =
    completionAuthority &&
    (inProgress || (planned && input.startAuthority.allowed));
  const canOperate = completionAuthority && inProgress;
  const canReopen =
    !input.superseded && complete && input.reopenAuthority.allowed;
  const canAmendStartedAt =
    !input.superseded &&
    input.actualStartedAt !== undefined &&
    (complete
      ? lenderApprover
      : inProgress &&
        (lenderApprover ||
          (input.updateAuthority.allowed &&
            (role === "builder" || role === "builder-staff"))));
  const canComment =
    !input.superseded &&
    (fullStructure ||
      assignedContractor ||
      role === "homeowner" ||
      lenderStaff);
  const structureCapability = (
    operation: GeneratedMilestoneCompanionStructureOperation
  ) => {
    const decision = authorizeGeneratedMilestoneCompanionStructureOperation({
      activeCompanion:
        !input.superseded && input.collaboration.state === "available",
      actor: {
        role,
        workosUserId: input.authorization.viewer.subject,
      },
      exactExecutionOwner: assignedContractor,
      operation,
    });
    return allowed(
      decision.allowed,
      input.superseded
        ? disabledReason
        : input.collaboration.state === "degraded"
          ? collaborationReason
          : (decision.reason ?? structureReason)
    );
  };
  const reason = input.superseded
    ? disabledReason
    : "Not permitted for this persona.";
  const structureReason = input.superseded
    ? disabledReason
    : "Companion structure editing is not enabled for generated Sub-milestones.";
  const collaborationReason =
    input.collaboration.state === "degraded"
      ? (input.collaboration.message ??
        "Collaboration is temporarily degraded.")
      : reason;
  const canUploadEvidence = canOperate || lenderAdmin || lenderStaff;
  const canPromoteEvidence =
    canOperate &&
    input.collaboration.state === "available" &&
    input.evidenceReviewState !== "in_review" &&
    input.evidenceReviewState !== "approved";
  const childReviewActive = input.evidenceReviewState === "in_review";
  const siteVisitGateEvaluated = input.siteVisitRequirement !== undefined;
  const siteVisitGateSatisfied = Boolean(
    input.siteVisitRequirement &&
      (!input.siteVisitRequirement.required ||
        input.siteVisitRequirement.status === "satisfied" ||
        input.siteVisitRequirement.status === "waived")
  );
  const childApproved = input.reviewDecisionState === "approved";
  const requiredSiteVisitCanBeWaived = Boolean(
    childReviewActive &&
      input.siteVisitRequirement?.required &&
      input.siteVisitRequirement.status === "required"
  );
  const childReviewReason = input.superseded
    ? disabledReason
    : childReviewActive
      ? reason
      : "The Sub-milestone must be In Review.";
  const approveChildReason = input.superseded
    ? disabledReason
    : childReviewActive
      ? siteVisitGateEvaluated
        ? siteVisitGateSatisfied
          ? reason
          : "Complete or waive the required Site Visit before child approval."
        : "Evaluate the current Site Visit requirement before child approval."
      : "Final child approval requires an In Review Sub-milestone.";
  const canAssign = fullStructure || lenderAdmin;
  const canWriteSiteVisits =
    !input.superseded &&
    (role === "admin" ||
      role === "principle-broker" ||
      (role === "broker" &&
        input.authorization.proposal.assignedBrokerWorkosUserId ===
          input.authorization.viewer.subject));
  const siteVisitWriteReason = input.superseded
    ? disabledReason
    : role === "broker"
      ? "Only the assigned Broker can manage Site Visits for this Build."
      : "Only an authorized lender role can manage Site Visits.";
  const plannedLifecycleReason =
    "Start the Sub-milestone before updating execution or evidence.";
  const completeLifecycleReason =
    "Reopen the Sub-milestone before updating execution or evidence.";
  const updateLifecycleReason = planned
    ? plannedLifecycleReason
    : complete
      ? completeLifecycleReason
      : updateReason;
  return {
    canonical: {
      approveChild: allowed(
        !input.superseded &&
          lenderAdmin &&
          childReviewActive &&
          siteVisitGateEvaluated &&
          siteVisitGateSatisfied,
        approveChildReason
      ),
      correctStart: allowed(
        canAmendStartedAt,
        input.superseded
          ? disabledReason
          : input.actualStartedAt === undefined
            ? "An actual start is required before correcting the start."
            : updateReason
      ),
      complete: allowed(
        canComplete,
        input.superseded ? disabledReason : updateLifecycleReason
      ),
      retractChildApproval: allowed(
        !input.superseded && lenderAdmin && childApproved,
        input.superseded
          ? disabledReason
          : childApproved
            ? reason
            : "Only an approved child can be retracted."
      ),
      retractStart: allowed(
        canAmendStartedAt,
        input.superseded
          ? disabledReason
          : input.actualStartedAt === undefined
            ? "An actual start is required before retracting the start."
            : updateReason
      ),
      reopen: allowed(
        canReopen,
        input.superseded ? disabledReason : reopenReason
      ),
      start: allowed(
        !input.superseded && planned && input.startAuthority.allowed,
        input.superseded ? disabledReason : startReason
      ),
      submitCompletion: allowed(
        !input.superseded && inProgress && completionAuthority,
        input.superseded ? disabledReason : updateLifecycleReason
      ),
      updateEvidence: allowed(
        !input.superseded && inProgress && completionAuthority,
        input.superseded ? disabledReason : updateLifecycleReason
      ),
      updateExecution: allowed(
        !input.superseded && inProgress && completionAuthority,
        input.superseded ? disabledReason : updateLifecycleReason
      ),
      waiveSiteVisit: allowed(
        !input.superseded && lenderAdmin && requiredSiteVisitCanBeWaived,
        input.superseded
          ? disabledReason
          : requiredSiteVisitCanBeWaived
            ? reason
            : "Only a required Site Visit in an active review can be waived."
      ),
      uploadEvidence: allowed(
        !input.superseded && canUploadEvidence,
        input.superseded ? disabledReason : updateLifecycleReason
      ),
      promoteEvidence: allowed(
        !input.superseded && canPromoteEvidence,
        input.superseded
          ? disabledReason
          : input.collaboration.state === "degraded"
            ? collaborationReason
            : input.evidenceReviewState === "in_review" ||
                input.evidenceReviewState === "approved"
              ? "Evidence is already in review or approved."
              : updateLifecycleReason
      ),
      addAssignment: allowed(!input.superseded && canAssign, reason),
      removeAssignment: allowed(!input.superseded && canAssign, reason),
      readMaterials: allowed(!input.superseded, reason),
      updateMaterials: allowed(!input.superseded && canAssign, reason),
    },
    collaboration: {
      addAttachment: allowed(
        input.collaboration.state === "available" && canComment,
        collaborationReason
      ),
      addChecklist: structureCapability("add_checklist"),
      comment: allowed(
        input.collaboration.state === "available" && canComment,
        collaborationReason
      ),
      createChild: structureCapability("create_child"),
      linkRelation: structureCapability("link_relation"),
      unlinkRelation: structureCapability("unlink_relation"),
      repairRelation: structureCapability("repair_relation"),
      toggleChecklist: structureCapability("toggle_checklist"),
    },
    review: {
      recommend: allowed(
        !input.superseded && lenderStaff && childReviewActive,
        childReviewReason
      ),
      requestChanges: allowed(
        !input.superseded && lenderStaff && childReviewActive,
        childReviewReason
      ),
    },
    siteVisit: {
      cancel: allowed(canWriteSiteVisits, siteVisitWriteReason),
      order: allowed(canWriteSiteVisits, siteVisitWriteReason),
    },
  };
}
