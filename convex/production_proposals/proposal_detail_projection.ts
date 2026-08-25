/**
 * Production proposals proposal detail projection bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { authenticatedAction, authenticatedMutation, authenticatedQuery } from "../authz";
import { internalMutation } from "../fluent";
import { projectProposalLifecycle } from "../production_proposal_lifecycle";
import { productionProposalDetailValidator } from "../production_proposal_detail";
import { type Doc, type QueryCtx } from "../types";
import { authorizeProposal, authorizeProposalForViewer, assignedBuilderProfileIdOrThrow } from "./authorization_core.js";
import { proposalAppPermissionProjection, canUseAppPermission, viewerFromBuilderStaffProvisionActor, normalizeBuilderStaffEmail, requireBuilderStaffManagementAllowed } from "./builder_staff_access.js";
import { buildStaffPermissionDirectory, saveBuilderStaffPermissionScope, removeBuilderStaffMember } from "./builder_staff_persistence.js";
import { type BuilderStaffProvisionResult } from "./contracts_foundation.js";
import { PROPOSAL_LENDER_ASSIGNMENT_HISTORY_LIMIT, builderStaffPermissionGrantInput, builderStaffProvisionActorInput, builderStaffProvisionResult } from "./contracts_workflow.js";
import { resolveBorrowerStartingCashCents } from "./directory_cards.js";
import { getCurrentProposalLenderAssignment, getLenderApprovalForCurrentProposalRevision, projectProposalLenderAssignment, projectProposalLenderApproval } from "./lender_assignment_auth.js";
import { buildProposalIdentityProjection, isBackoffice } from "./proposal_claim.js";
import { getPermitWaiver, withDocumentStorageUrls, collectByIndex } from "./storage_helpers.js";

export function projectProposalDetailProposal(
  proposal: Doc<"buildProposals">,
  includeInternal: boolean,
) {
  const selectedPlan = proposal.selectedPlan
    ? {
        metrics: proposal.selectedPlan.metrics,
        name: proposal.selectedPlan.name,
        planKey: proposal.selectedPlan.planKey,
        recommendationReason: proposal.selectedPlan.recommendationReason,
        selectedAt: proposal.selectedPlan.selectedAt,
        ...(includeInternal
          ? {
              selectedByWorkosUserId:
                proposal.selectedPlan.selectedByWorkosUserId,
            }
          : {}),
      }
    : undefined;
  return {
    _id: proposal._id,
    activeBuildId: proposal.activeBuildId,
    approvedAt: proposal.approvedAt,
    borrowerCoPayBps: proposal.borrowerCoPayBps,
    borrowerCoPayCents: proposal.borrowerCoPayCents,
    borrowerStartingCashCents: resolveBorrowerStartingCashCents(proposal),
    borrowerWorkingCapitalLimitCents:
      proposal.borrowerWorkingCapitalLimitCents,
    builderProfileId: proposal.builderProfileId,
    buildName: proposal.buildName,
    capitalSource: proposal.capitalSource,
    closedAt: proposal.closedAt,
    createdAt: proposal.createdAt,
    interestAnnualBps: proposal.interestAnnualBps,
    lenderDrawPolicyLimitCents: proposal.lenderDrawPolicyLimitCents,
    location: proposal.location,
    locationLatitude: proposal.locationLatitude,
    locationLongitude: proposal.locationLongitude,
    locationPlaceId: proposal.locationPlaceId,
    proposedStartDate: proposal.proposedStartDate,
    reviewOutcome: proposal.reviewOutcome,
    selectedPlan,
    status: proposal.status,
    submittedAt: proposal.submittedAt,
    templateId: proposal.templateId,
    timelineMinimumCashReserveCents:
      proposal.timelineMinimumCashReserveCents,
    timelineRangeMax: proposal.timelineRangeMax,
    timelineRangeMin: proposal.timelineRangeMin,
    timelineStartingCashCents: proposal.timelineStartingCashCents,
    totalBudgetCents: proposal.totalBudgetCents,
    updatedAt: proposal.updatedAt,
    workflowRuleSnapshotId: proposal.workflowRuleSnapshotId,
    ...(includeInternal
      ? {
          assignedBrokerWorkosUserId: proposal.assignedBrokerWorkosUserId,
          backOfficeApprovedByWorkosUserId:
            proposal.backOfficeApprovedByWorkosUserId,
          createdByWorkosUserId: proposal.createdByWorkosUserId,
          currentProposalRevisionId: proposal.currentProposalRevisionId,
          currentProposalRevisionNumber: proposal.currentProposalRevisionNumber,
          currentReviewPolicyVersionId: proposal.currentReviewPolicyVersionId,
          lockedReviewPolicyId: proposal.lockedReviewPolicyId,
          updatedByWorkosUserId: proposal.updatedByWorkosUserId,
        }
      : {}),
  };
}

export function projectProposalDetailMilestone(
  milestone: Doc<"proposalMilestones">,
) {
  return {
    _id: milestone._id,
    budgetCents: milestone.budgetCents,
    createdAt: milestone.createdAt,
    dayEnd: milestone.dayEnd,
    dayStart: milestone.dayStart,
    dependencyKeys: milestone.dependencyKeys,
    drawAvailabilityCents: milestone.drawAvailabilityCents,
    durationDays: milestone.durationDays,
    evidenceState: milestone.evidenceState,
    icon: milestone.icon,
    key: milestone.key,
    lane: milestone.lane,
    markerLabel: milestone.markerLabel,
    name: milestone.name,
    order: milestone.order,
    policyState: milestone.policyState,
    timelineStatus: milestone.timelineStatus,
    tone: milestone.tone,
    updatedAt: milestone.updatedAt,
  };
}

export function projectProposalDetailSubmilestone(
  submilestone: Doc<"proposalSubmilestones">,
) {
  return {
    _id: submilestone._id,
    budgetCents: submilestone.budgetCents,
    createdAt: submilestone.createdAt,
    durationDays: submilestone.durationDays,
    key: submilestone.key,
    milestoneKey: submilestone.milestoneKey,
    name: submilestone.name,
    order: submilestone.order,
    proposalMilestoneId: submilestone.proposalMilestoneId,
    startDay: submilestone.startDay,
    updatedAt: submilestone.updatedAt,
  };
}

function projectProposalDetailBuildMilestone(
  milestone: Doc<"buildMilestones">,
) {
  return {
    _id: milestone._id,
    budgetCents: milestone.budgetCents,
    dayEnd: milestone.dayEnd,
    dayStart: milestone.dayStart,
    dependencyKeys: milestone.dependencyKeys,
    drawAvailabilityCents: milestone.drawAvailabilityCents,
    durationDays: milestone.durationDays,
    evidenceState: milestone.evidenceState,
    key: milestone.key,
    name: milestone.name,
    order: milestone.order,
    planningState: milestone.planningState,
    policyState: milestone.policyState,
    progressPercent: milestone.progressPercent,
    proposalMilestoneId: milestone.proposalMilestoneId,
    status: milestone.status,
    updatedAt: milestone.updatedAt,
    workflowRevision: milestone.workflowRevision,
  };
}

function projectProposalDetailBuildSubmilestone(
  submilestone: Doc<"buildSubmilestones">,
) {
  return {
    _id: submilestone._id,
    actualCostCents: submilestone.actualCostCents,
    budgetCents: submilestone.budgetCents,
    buildMilestoneId: submilestone.buildMilestoneId,
    completionForecastDate: submilestone.completionForecastDate,
    durationDays: submilestone.durationDays,
    evidenceReviewRound: submilestone.evidenceReviewRound,
    evidenceReviewState: submilestone.evidenceReviewState,
    fieldNote: submilestone.fieldNote,
    key: submilestone.key,
    milestoneKey: submilestone.milestoneKey,
    name: submilestone.name,
    order: submilestone.order,
    planningState: submilestone.planningState,
    progressPercent: submilestone.progressPercent,
    proposalSubmilestoneId: submilestone.proposalSubmilestoneId,
    startDay: submilestone.startDay,
    status: submilestone.status,
    updatedAt: submilestone.updatedAt,
    workflowRevision: submilestone.workflowRevision,
  };
}

export function projectProposalDetailCostItem(
  item: Doc<"proposalCostItems">,
  includeInternal: boolean,
) {
  return {
    _id: item._id,
    budgetSubmilestoneKey: item.budgetSubmilestoneKey,
    budgetTreatment: item.budgetTreatment,
    costCents: item.costCents,
    createdAt: item.createdAt,
    deliveryEndDay: item.deliveryEndDay,
    deliveryInstructions: item.deliveryInstructions,
    deliveryLocation: item.deliveryLocation,
    deliveryStartDay: item.deliveryStartDay,
    description: item.description,
    itemKey: item.itemKey,
    itemType: item.itemType,
    milestoneKey: item.milestoneKey,
    proposalMilestoneId: item.proposalMilestoneId,
    quantity: item.quantity,
    relevantSubmilestoneKeys: item.relevantSubmilestoneKeys,
    specificationTiptapJson: item.specificationTiptapJson,
    supplier: item.supplier,
    title: item.title,
    unit: item.unit,
    updatedAt: item.updatedAt,
    ...(includeInternal
      ? {
          createdByWorkosUserId: item.createdByWorkosUserId,
          updatedByWorkosUserId: item.updatedByWorkosUserId,
        }
      : {}),
  };
}

export function projectProposalDetailDraw(
  draw: Doc<"proposalDrawScheduleRows">,
  includeInternal: boolean,
) {
  return {
    _id: draw._id,
    amountCents: draw.amountCents,
    createdAt: draw.createdAt,
    customDate: draw.customDate,
    drawKey: draw.drawKey,
    label: draw.label,
    milestoneKey: draw.milestoneKey,
    order: draw.order,
    requestNote: draw.requestNote,
    requestStatus: draw.requestStatus,
    requestedAt: draw.requestedAt,
    reviewedAt: draw.reviewedAt,
    source: draw.source,
    timingDay: draw.timingDay,
    updatedAt: draw.updatedAt,
    ...(includeInternal ? { requestReviewNote: draw.requestReviewNote } : {}),
  };
}

export function projectProposalDetailPlannedDraw(
  draw: Doc<"plannedDrawScheduleRows">,
) {
  return {
    _id: draw._id,
    amountCents: draw.amountCents,
    createdAt: draw.createdAt,
    drawKey: draw.drawKey,
    label: draw.label,
    milestoneKey: draw.milestoneKey,
    order: draw.order,
    releaseDate: draw.releaseDate,
    releasedAt: draw.releasedAt,
    requestedAt: draw.requestedAt,
    reviewedAt: draw.reviewedAt,
    status: draw.status,
    timingDay: draw.timingDay,
    updatedAt: draw.updatedAt,
  };
}

export async function projectProposalDetailDocuments(
  ctx: QueryCtx,
  documents: Doc<"proposalDocuments">[],
  includeInternal: boolean,
) {
  const hydrated = await withDocumentStorageUrls(ctx, documents);
  return hydrated.map((document) => ({
    _id: document._id,
    contractorVisible: document.contractorVisible,
    createdAt: document.createdAt,
    documentType: document.documentType,
    fileName: document.fileName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    status: document.status,
    storageId: document.storageId,
    storageUrl: document.storageUrl,
    updatedAt: document.updatedAt,
    ...(includeInternal
      ? { uploadedByWorkosUserId: document.uploadedByWorkosUserId }
      : {}),
  }));
}

export function projectProposalDetailAssignment(
  assignment: Awaited<ReturnType<typeof buildProposalIdentityProjection>>,
  includeInternal: boolean,
) {
  if (includeInternal) return assignment;
  return {
    builder: assignment.builder
      ? {
          _id: assignment.builder._id,
          displayName: assignment.builder.displayName,
          legalName: assignment.builder.legalName,
          status: assignment.builder.status,
        }
      : null,
    builderAssigned: assignment.builderAssigned,
    claimLinkActive: assignment.claimLinkActive,
    initiatedFromBackoffice: assignment.initiatedFromBackoffice,
  };
}

function projectProposalDetailAuditEvents(
  events: Doc<"auditEvents">[],
  includeInternal: boolean,
) {
  if (!includeInternal) return [];
  return events.map((event) => ({
    _id: event._id,
    actorRoles: event.actorRoles,
    actorWorkosUserId: event.actorWorkosUserId,
    command: event.command,
    createdAt: event.createdAt,
    entityId: event.entityId,
    entityType: event.entityType,
    eventType: event.eventType,
    newState: event.newState,
    priorState: event.priorState,
    reason: event.reason,
    warnings: event.warnings,
  }));
}

function projectProposalDetailEvents(
  events: Doc<"proposalEvents">[],
  includeInternal: boolean,
) {
  if (!includeInternal) return [];
  return events.map((event) => ({
    _id: event._id,
    actorRoles: event.actorRoles,
    actorWorkosUserId: event.actorWorkosUserId,
    command: event.command,
    createdAt: event.createdAt,
    eventType: event.eventType,
    newState: event.newState,
    priorState: event.priorState,
    reason: event.reason,
    warnings: event.warnings,
  }));
}

export function projectProposalDetailPermitWaiver(
  waiver: Doc<"documentWaivers"> | null,
  includeInternal: boolean,
) {
  if (!waiver) return null;
  return {
    _id: waiver._id,
    createdAt: waiver.createdAt,
    documentType: waiver.documentType,
    reason: waiver.reason,
    ...(includeInternal
      ? {
          grantedByRole: waiver.grantedByRole,
          grantedByWorkosUserId: waiver.grantedByWorkosUserId,
        }
      : {}),
  };
}

export function projectProposalDetailActiveBuild(build: Doc<"activeBuilds"> | null) {
  return build
    ? {
        _id: build._id,
        startDate: build.startDate,
        status: build.status,
        timezone: build.timezone,
      }
    : null;
}

export const getProposalDetail = authenticatedQuery
  .input({
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(productionProposalDetailValidator)
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    const [
      documents,
      milestones,
      submilestones,
      costItems,
      draws,
      events,
      auditEvents,
      permitWaiver,
    ] = await Promise.all([
      collectByIndex(ctx, "proposalDocuments", "by_proposal", args.proposalId),
      collectByIndex(ctx, "proposalMilestones", "by_proposal", args.proposalId),
      collectByIndex(
        ctx,
        "proposalSubmilestones",
        "by_proposal",
        args.proposalId,
      ),
      collectByIndex(ctx, "proposalCostItems", "by_proposal", args.proposalId),
      collectByIndex(
        ctx,
        "proposalDrawScheduleRows",
        "by_proposal",
        args.proposalId,
      ),
      collectByIndex(ctx, "proposalEvents", "by_proposal", args.proposalId),
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "buildProposal").eq("entityId", args.proposalId),
        )
        .collect(),
      getPermitWaiver(ctx, args.proposalId),
    ]);
    const activeBuild = auth.proposal.activeBuildId
      ? await ctx.db.get(auth.proposal.activeBuildId)
      : null;
    const [plannedDraws, buildMilestones, buildSubmilestones] = activeBuild
      ? await Promise.all([
          collectByIndex(
            ctx,
            "plannedDrawScheduleRows",
            "by_build",
            activeBuild._id,
          ),
          collectByIndex(ctx, "buildMilestones", "by_build", activeBuild._id),
          collectByIndex(
            ctx,
            "buildSubmilestones",
            "by_build",
            activeBuild._id,
          ),
        ])
      : [[], [], []];

    const currentLenderAssignment = await getCurrentProposalLenderAssignment(
      ctx,
      args.proposalId,
    );
    const currentLenderApproval = currentLenderAssignment
      ? await getLenderApprovalForCurrentProposalRevision(
          ctx,
          auth.proposal,
          currentLenderAssignment,
        )
      : null;
    const latestLenderAssignment = await ctx.db
      .query("proposalLenderAssignments")
      .withIndex("by_proposal", (query) =>
        query.eq("proposalId", args.proposalId),
      )
      .order("desc")
      .take(1);
    const lenderAssignmentHistory = isBackoffice(auth.roles)
      ? await ctx.db
          .query("proposalLenderAssignments")
          .withIndex("by_proposal", (query) =>
            query.eq("proposalId", args.proposalId),
          )
          .order("desc")
          .take(PROPOSAL_LENDER_ASSIGNMENT_HISTORY_LIMIT)
      : [];
    const lenderAssignmentState =
      currentLenderAssignment !== null
        ? {
            state: "assigned" as const,
            lenderConfirmation: currentLenderApproval
              ? ("approved" as const)
              : ("pending" as const),
          }
        : latestLenderAssignment[0]?.status !== undefined &&
            latestLenderAssignment[0].status !== "current"
          ? {
              state: "withdrawn" as const,
              lenderConfirmation: "pending" as const,
            }
          : {
              state: "unassigned" as const,
              lenderConfirmation: "pending" as const,
            };

    const appPermissions = await proposalAppPermissionProjection(ctx, auth);

    const includeInternal = isBackoffice(auth.roles);
    const assignmentProjection = await buildProposalIdentityProjection(
      ctx,
      auth.proposal,
      auth.brokerage,
    );
    return {
      activeBuild: projectProposalDetailActiveBuild(activeBuild),
      assignment: projectProposalDetailAssignment(
        assignmentProjection,
        includeInternal,
      ),
      appPermissions,
      auditEvents: projectProposalDetailAuditEvents(
        auditEvents,
        includeInternal,
      ),
      buildMilestones: canUseAppPermission(
        appPermissions,
        "milestone",
        "view",
      )
        ? buildMilestones.map(projectProposalDetailBuildMilestone)
        : [],
      buildSubmilestones: canUseAppPermission(
        appPermissions,
        "submilestone",
        "view",
      )
        ? buildSubmilestones.map(projectProposalDetailBuildSubmilestone)
        : [],
      costItems: canUseAppPermission(appPermissions, "material", "view")
        ? costItems.map((item: Doc<"proposalCostItems">) =>
            projectProposalDetailCostItem(item, includeInternal),
          )
        : [],
      documents: await projectProposalDetailDocuments(
        ctx,
        documents,
        includeInternal,
      ),
      events: projectProposalDetailEvents(events, includeInternal),
      lifecycle: projectProposalLifecycle(auth.proposal, lenderAssignmentState),
      lenderApproval: currentLenderApproval
        ? projectProposalLenderApproval(currentLenderApproval)
        : null,
      lenderAssignment:
        isBackoffice(auth.roles) && latestLenderAssignment[0]
          ? projectProposalLenderAssignment(latestLenderAssignment[0])
          : null,
      lenderAssignmentHistory: isBackoffice(auth.roles)
        ? lenderAssignmentHistory.map(projectProposalLenderAssignment)
        : [],
      milestones: canUseAppPermission(appPermissions, "milestone", "view")
        ? milestones.map(projectProposalDetailMilestone)
        : [],
      permitWaiver: projectProposalDetailPermitWaiver(
        permitWaiver,
        includeInternal,
      ),
      plannedDraws: canUseAppPermission(appPermissions, "draw", "view")
        ? plannedDraws.map(projectProposalDetailPlannedDraw)
        : [],
      proposal: projectProposalDetailProposal(auth.proposal, includeInternal),
      submilestones: canUseAppPermission(appPermissions, "submilestone", "view")
        ? submilestones.map(projectProposalDetailSubmilestone)
        : [],
      draws: canUseAppPermission(appPermissions, "draw", "view")
        ? draws.map((draw: Doc<"proposalDrawScheduleRows">) =>
            projectProposalDetailDraw(draw, includeInternal),
          )
        : [],
    };
  })
  .public();

export const listProposalBuilderStaffPermissions = authenticatedQuery
  .input({
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    const builderProfileId = assignedBuilderProfileIdOrThrow(auth.proposal);
    await requireBuilderStaffManagementAllowed(ctx, auth, builderProfileId);
    return await buildStaffPermissionDirectory(ctx, {
      auth,
      builderProfileId,
      proposalId: args.proposalId,
      scope: "proposal",
      workosOrganizationId: args.workosOrganizationId,
    });
  })
  .public();

export const saveProposalBuilderStaffPermissions = authenticatedMutation
  .input({
    permissions: v.array(builderStaffPermissionGrantInput),
    proposalId: v.id("buildProposals"),
    staffEmail: v.optional(v.string()),
    staffWorkosUserId: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    const builderProfileId = assignedBuilderProfileIdOrThrow(auth.proposal);
    await requireBuilderStaffManagementAllowed(ctx, auth, builderProfileId);
    await saveBuilderStaffPermissionScope(ctx, {
      auth,
      builderProfileId,
      permissions: args.permissions,
      proposalId: args.proposalId,
      scope: "proposal",
      staffEmail: args.staffEmail,
      staffWorkosUserId: args.staffWorkosUserId,
      workosOrganizationId: args.workosOrganizationId,
    });
    return null;
  })
  .public();

export const provisionProposalBuilderStaffPermissions = authenticatedAction
  .input({
    permissions: v.array(builderStaffPermissionGrantInput),
    proposalId: v.id("buildProposals"),
    staffEmail: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(builderStaffProvisionResult)
  .handler(async (ctx, args): Promise<BuilderStaffProvisionResult> => {
    const staffEmail = normalizeBuilderStaffEmail(args.staffEmail);
    if (!staffEmail) {
      throw new Error("A valid staff email is required.");
    }
    const provisioning: {
      adapter: string;
      invitationId?: string;
      membershipId: string;
      operation: "provisionBuilderStaffUser";
      status: string;
      sync: string;
      userId: string;
    } = await ctx.runAction(
      internal.workosManagement.provisionBuilderStaffUser,
      {
        email: staffEmail,
        organizationId: args.workosOrganizationId,
      },
    );
    const staffWorkosUserId: string = await ctx.runMutation(
      internal.production_proposals.finalizeProposalBuilderStaffProvisioning,
      {
        actor: {
          organizationId: ctx.viewer.organizationId,
          roles: ctx.viewer.roles,
          subject: ctx.viewer.subject,
        },
        permissions: args.permissions,
        proposalId: args.proposalId,
        staffEmail,
        staffWorkosUserId: provisioning.userId,
        workosMembershipId: provisioning.membershipId,
        workosOrganizationId: args.workosOrganizationId,
      },
    );
    return {
      provisioning,
      staffWorkosUserId,
      workosMembershipId: provisioning.membershipId,
    };
  })
  .public();

export const finalizeProposalBuilderStaffProvisioning = internalMutation
  .input({
    actor: builderStaffProvisionActorInput,
    permissions: v.array(builderStaffPermissionGrantInput),
    proposalId: v.id("buildProposals"),
    staffEmail: v.string(),
    staffWorkosUserId: v.string(),
    workosMembershipId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.string())
  .handler(async (ctx, args) => {
    const actor = viewerFromBuilderStaffProvisionActor(args.actor);
    const auth = await authorizeProposalForViewer(
      ctx,
      actor,
      args.proposalId,
      args.workosOrganizationId,
    );
    const builderProfileId = assignedBuilderProfileIdOrThrow(auth.proposal);
    await requireBuilderStaffManagementAllowed(ctx, auth, builderProfileId);
    return await saveBuilderStaffPermissionScope(ctx, {
      allowPendingEmail: true,
      auth,
      builderProfileId,
      permissions: args.permissions,
      proposalId: args.proposalId,
      scope: "proposal",
      staffEmail: args.staffEmail,
      staffWorkosUserId: args.staffWorkosUserId,
      workosMembershipId: args.workosMembershipId,
      workosOrganizationId: args.workosOrganizationId,
    });
  })
  .internal();

export const removeProposalBuilderStaffMember = authenticatedMutation
  .input({
    proposalId: v.id("buildProposals"),
    staffWorkosUserId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    const builderProfileId = assignedBuilderProfileIdOrThrow(auth.proposal);
    await requireBuilderStaffManagementAllowed(ctx, auth, builderProfileId);
    await removeBuilderStaffMember(ctx, {
      auth,
      builderProfileId,
      staffWorkosUserId: args.staffWorkosUserId,
    });
    return null;
  })
  .public();
