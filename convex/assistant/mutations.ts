import { api } from "../_generated/api";
import type { RoleSlug } from "../authz";
import {
  ACTIVE_BUILD_REQUEST_ONLY_ACTION_KEYS,
  BACKOFFICE_ROLES,
  BACKOFFICE_WRITE_ROLES,
  BUILDER_ROLES,
  GENERIC_REASON_REQUIRED_ACTION_KEYS,
  MUTATION_ACTION_KEYS,
  READONLY_CLIENT_ACTION_KEYS,
  TOTAL_BPS,
  TRUSTED_FILE_ACTION_KEYS,
  type AssistantActionInput,
  type AssistantActionKey,
  type AssistantAuth,
  type AssistantPlanItem,
  type MutationActionKey,
  type ProposalAuth,
} from "./contracts";
import {
  runDomainMutation,
  runCollaborationMutation,
  stripUndefined,
  optionalNumber,
  reasonOrNote,
  normalizeLoanFacility,
  normalizeTimelineMilestoneInput,
  timelineMilestonePatchInput,
  timelineDrawInput,
  timelineDrawPatchInput,
  capitalEventInput,
  capitalEventPatchInput,
  costItemInput,
  costItemPatchInput,
  contractorAttachmentInput,
  contractorScopeAssignmentInput,
  normalizeContractorInput,
  timelinePlanStateInput,
  normalizeSetupMilestones,
  normalizeSubmilestones,
  normalizeSetupCostItems,
  normalizeSetupContractorAssignments,
  normalizeSetupDraws,
  arrayInput,
  stringArray,
  normalizeBps,
  positiveCentsOrFallback,
  optionalId,
  parseActionKey,
  isMutationActionKey,
  isReadonlyActionKey,
  isBackoffice,
  isBuilder,
  parseTargetDateKind,
  calculateDrawAvailability,
  validateDayRange,
  normalizeIsoDate,
  requiredId,
  maybeId,
  requiredString,
  optionalString,
  optionalStringArray,
  requiredNumber,
  requiredPositiveCents,
  requiredNonNegativeDay,
  requiredProposalTimelineDay,
  requiredReason,
  requireReason,
  normalizeRecord,
  normalizeOptionalString,
  sanitizeForPersistence,
  errorMessage,
} from "./inputs";
import type { Id, MutationCtx } from "../types";
import { applyActiveBuildGenericRevisionRequest } from "./action_preview";
import { writeProposalAudit } from "../assistant";

export async function applyBuildProposalFromSetup(
  ctx: MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
) {
  const buildName = requiredString(input.buildName ?? input.title, "buildName");
  const location = requiredString(
    input.location ?? input.projectAddress,
    "location"
  );
  const proposedStartDate =
    input.proposedStartDate === undefined
      ? undefined
      : normalizeIsoDate(
          input.proposedStartDate,
          "Proposed start date is invalid."
        );
  const builderProfileId = optionalId<"builderProfiles">(
    ctx,
    "builderProfiles",
    input.builderProfileId
  );
  const proposalId: Id<"buildProposals"> = builderProfileId
    ? await (ctx as any).runMutation(
        (api as any).production_proposals.createDraftProposal,
        {
          brokerageId: auth.brokerage._id,
          buildName,
          builderProfileId,
          location,
          ...(proposedStartDate ? { proposedStartDate } : {}),
          workosOrganizationId: auth.organizationId,
        }
      )
    : await (ctx as any).runMutation(
        (api as any).production_proposals.createBrokerDraftProposal,
        {
          buildName,
          location,
          ...(proposedStartDate ? { proposedStartDate } : {}),
          workosOrganizationId: auth.organizationId,
        }
      );

  const milestones = normalizeSetupMilestones(input.milestones ?? input.items);
  const totalBudgetCents = milestones.reduce(
    (sum, milestone) => sum + milestone.budgetCents,
    0
  );
  const borrowerCoPayBps =
    input.loanPercentageBps === undefined
      ? normalizeBps(input.borrowerCoPayBps ?? input.coPayBps ?? 2000)
      : TOTAL_BPS - normalizeBps(input.loanPercentageBps);
  const borrowerStartingCashCents = requiredPositiveCents(
    input.borrowerStartingCashCents ??
      input.borrowerWorkingCapitalLimitCents ??
      input.maxCashOnHandCents ??
      input.startingCashCents,
    "Borrower starting cash must be greater than zero."
  );
  const lenderDrawPolicyLimitCents = positiveCentsOrFallback(
    input.lenderDrawPolicyLimitCents ??
      input.reimbursableBudgetCents ??
      Math.round(
        (totalBudgetCents * (TOTAL_BPS - borrowerCoPayBps)) / TOTAL_BPS
      ),
    totalBudgetCents
  );

  await (ctx as any).runMutation(
    (api as any).production_proposals.saveDraftProposalPackage,
    {
      borrowerCoPayBps,
      borrowerStartingCashCents,
      buildName,
      contractorAssignments: normalizeSetupContractorAssignments(
        input.contractorAssignments
      ),
      costItems: normalizeSetupCostItems(input.costItems),
      draws: normalizeSetupDraws(input.draws),
      lenderDrawPolicyLimitCents,
      location,
      milestones,
      proposalId,
      ...(proposedStartDate ? { proposedStartDate } : {}),
      workosOrganizationId: auth.organizationId,
    }
  );
  await writeProposalAudit(
    ctx,
    { ...auth, proposal: (await ctx.db.get(proposalId))! },
    {
      command: "assistant.commit.create_build_proposal_from_setup",
      entityId: String(proposalId),
      entityType: "buildProposal",
      eventType: "assistant.proposal.created_from_setup",
      newState: {
        buildName,
        location,
        milestoneCount: milestones.length,
        redirectTo: optionalString(input.redirectTo) ?? "proposal",
      },
      reason: optionalString(input.reason),
    }
  );
  return {
    proposalId,
    redirectTo: optionalString(input.redirectTo) ?? "proposal",
  };
}

export async function applyCatalogDomainMutation(
  ctx: MutationCtx,
  auth: AssistantAuth,
  item: AssistantPlanItem
) {
  const input = item.input;
  const org = auth.organizationId;
  if (
    (TRUSTED_FILE_ACTION_KEYS as readonly string[]).includes(item.actionKey)
  ) {
    throw new Error(
      "This action requires a trusted file attachment selected by the user."
    );
  }
  if (
    item.actionKey === "provision_proposal_builder_staff" ||
    item.actionKey === "provision_active_build_builder_staff"
  ) {
    throw new Error(
      "Builder staff provisioning uses the WorkOS Management action runtime and is not available from mutation-only assistant commits yet."
    );
  }

  switch (item.actionKey) {
    case "submit_build_proposal":
      return await runDomainMutation(ctx, "submitProposal", {
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "request_proposal_changes":
      return await runDomainMutation(ctx, "requestChanges", {
        proposalId: input.proposalId,
        reason: reasonOrNote(input),
        workosOrganizationId: org,
      });
    case "reject_proposal":
      return await runDomainMutation(ctx, "rejectProposal", {
        proposalId: input.proposalId,
        reason: reasonOrNote(input),
        workosOrganizationId: org,
      });
    case "approve_proposal":
      return await runDomainMutation(ctx, "approveProposal", {
        permitWaiverReason: optionalString(input.permitWaiverReason),
        proposalId: input.proposalId,
        reason: reasonOrNote(input),
        workosOrganizationId: org,
      });
    case "assign_proposal_builder":
      return await runDomainMutation(ctx, "assignDraftBuilder", {
        builderProfileId: input.builderProfileId,
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "unassign_proposal_builder":
      return await runDomainMutation(ctx, "unassignDraftBuilder", {
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "create_proposal_claim_link":
      return await runDomainMutation(ctx, "createDraftProposalClaimLink", {
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "record_proposal_closing":
      return await runDomainMutation(ctx, "recordProposalClosing", {
        buildStartDate: requiredString(
          input.buildStartDate ?? input.startDate,
          "buildStartDate"
        ),
        ianaTimezone: requiredString(input.ianaTimezone, "ianaTimezone"),
        loanFacility: normalizeLoanFacility(input),
        proposalId: input.proposalId,
        reason: reasonOrNote(input),
        workosOrganizationId: org,
      });
    case "delete_draft_proposal":
      return await runDomainMutation(ctx, "deleteDraftProposal", {
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "update_proposal_approved_amount":
      return await runDomainMutation(
        ctx,
        "updateProductionProposalApprovedAmount",
        {
          approvedAmountCents: requiredPositiveCents(
            input.approvedAmountCents ?? input.amountCents,
            "Approved amount must be greater than zero."
          ),
          proposalId: input.proposalId,
          workosOrganizationId: org,
        }
      );
    case "update_proposal_interest_rate":
      return await runDomainMutation(
        ctx,
        "updateProductionProposalInterestRate",
        {
          interestAnnualBps: requiredNumber(
            input.interestAnnualBps ?? input.interestBps,
            "interestAnnualBps"
          ),
          proposalId: input.proposalId,
          workosOrganizationId: org,
        }
      );
    case "update_proposal_start_date":
      return await runDomainMutation(
        ctx,
        "updateProductionProposalProposedStartDate",
        {
          proposalId: input.proposalId,
          proposedStartDate: requiredString(
            input.proposedStartDate ?? input.startDate,
            "proposedStartDate"
          ),
          workosOrganizationId: org,
        }
      );
    case "create_proposal_milestone":
      return await runDomainMutation(ctx, "createProductionTimelineMilestone", {
        milestone: normalizeTimelineMilestoneInput(input),
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "update_proposal_milestone":
      return await runDomainMutation(ctx, "updateProductionTimelineMilestone", {
        ...timelineMilestonePatchInput(input),
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "delete_proposal_milestone":
      return await runDomainMutation(ctx, "deleteProductionTimelineMilestone", {
        milestoneKey: input.milestoneKey,
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "create_proposal_draw":
      return await runDomainMutation(ctx, "createProductionTimelineDraw", {
        ...timelineDrawInput(input),
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "update_proposal_draw":
      return await runDomainMutation(ctx, "updateProductionTimelineDraw", {
        ...timelineDrawPatchInput(input),
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "delete_proposal_draw":
      return await runDomainMutation(ctx, "deleteProductionTimelineDraw", {
        drawKey: input.drawKey,
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "update_submitted_proposal_draw":
      return await runDomainMutation(
        ctx,
        "updateSubmittedProposalDrawScheduleRow",
        {
          amountCents: optionalNumber(input.amountCents),
          drawKey: input.drawKey,
          label: optionalString(input.label),
          proposalId: input.proposalId,
          reason: reasonOrNote(input),
          timingDay: optionalNumber(input.timingDay ?? input.x),
          workosOrganizationId: org,
        }
      );
    case "create_proposal_capital_event":
      return await runDomainMutation(
        ctx,
        "createProductionTimelineCapitalEvent",
        {
          ...capitalEventInput(input),
          proposalId: input.proposalId,
          workosOrganizationId: org,
        }
      );
    case "update_proposal_capital_event":
      return await runDomainMutation(
        ctx,
        "updateProductionTimelineCapitalEvent",
        {
          ...capitalEventPatchInput(input),
          proposalId: input.proposalId,
          workosOrganizationId: org,
        }
      );
    case "delete_proposal_capital_event":
      return await runDomainMutation(
        ctx,
        "deleteProductionTimelineCapitalEvent",
        {
          capitalEventKey: input.capitalEventKey,
          proposalId: input.proposalId,
          workosOrganizationId: org,
        }
      );
    case "create_proposal_cash_infusion":
      return await runDomainMutation(
        ctx,
        "createProductionTimelineCashInfusion",
        {
          amountCents: input.amountCents,
          cashInfusionKey: input.cashInfusionKey ?? input.capitalEventKey,
          label: input.label,
          order: input.order,
          proposalId: input.proposalId,
          workosOrganizationId: org,
          x: input.x ?? input.timingDay,
        }
      );
    case "update_proposal_evidence_asset":
      return await runDomainMutation(
        ctx,
        "updateProductionTimelineEvidenceAsset",
        {
          evidenceKey: input.evidenceKey,
          label: optionalString(input.label),
          proposalId: input.proposalId,
          tag: optionalString(input.tag),
          workosOrganizationId: org,
        }
      );
    case "delete_proposal_evidence_asset":
      return await runDomainMutation(
        ctx,
        "deleteProductionTimelineEvidenceAsset",
        {
          evidenceKey: input.evidenceKey,
          proposalId: input.proposalId,
          workosOrganizationId: org,
        }
      );
    case "request_proposal_timeline_modification":
      return await runDomainMutation(
        ctx,
        "requestProductionTimelineModification",
        {
          milestoneKey: optionalString(input.milestoneKey),
          proposalId: input.proposalId,
          reason: reasonOrNote(input),
          requestType: input.requestType,
          requestedPayload: input.requestedPayload ?? input.payload ?? input,
          workosOrganizationId: org,
        }
      );
    case "review_proposal_timeline_modification":
      return await runDomainMutation(
        ctx,
        "reviewProductionTimelineModificationRequest",
        {
          note: optionalString(input.note ?? input.reason),
          requestId: input.requestId,
          status: input.status,
          workosOrganizationId: org,
        }
      );
    case "update_proposal_timeline_plan_state":
      return await runDomainMutation(ctx, "updateProductionTimelinePlanState", {
        ...timelinePlanStateInput(input),
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "create_proposal_cost_item":
      return await runDomainMutation(ctx, "createProposalCostItem", {
        ...costItemInput(input),
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "update_proposal_cost_item":
      return await runDomainMutation(ctx, "updateProposalCostItem", {
        ...costItemPatchInput(input),
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "delete_proposal_cost_item":
      return await runDomainMutation(ctx, "deleteProposalCostItem", {
        itemId: input.itemId,
        proposalId: input.proposalId,
        reason: optionalString(input.reason),
        workosOrganizationId: org,
      });
    case "attach_proposal_contractor":
      return await runDomainMutation(ctx, "attachProposalContractor", {
        ...contractorAttachmentInput(input),
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "create_and_attach_proposal_contractor":
      return await runDomainMutation(ctx, "createAndAttachProposalContractor", {
        contractor: normalizeContractorInput(input.contractor ?? input),
        proposalId: input.proposalId,
        role: optionalString(input.role),
        workosOrganizationId: org,
      });
    case "assign_proposal_contractor_to_scope":
      return await runDomainMutation(
        ctx,
        "assignProposalContractorToMilestone",
        {
          ...contractorScopeAssignmentInput(input),
          proposalId: input.proposalId,
          workosOrganizationId: org,
        }
      );
    case "update_proposal_builder_staff_permissions":
      return await runDomainMutation(
        ctx,
        "saveProposalBuilderStaffPermissions",
        {
          permissions: input.permissions ?? [],
          proposalId: input.proposalId,
          staffEmail: optionalString(input.staffEmail),
          staffWorkosUserId: optionalString(input.staffWorkosUserId),
          workosOrganizationId: org,
        }
      );
    case "remove_proposal_builder_staff":
      return await runDomainMutation(ctx, "removeProposalBuilderStaffMember", {
        proposalId: input.proposalId,
        staffWorkosUserId: input.staffWorkosUserId,
        workosOrganizationId: org,
      });
    case "save_calendar_view":
      return await runDomainMutation(ctx, "saveCalendarView", {
        filters: input.filters ?? {},
        isDefault: Boolean(input.isDefault),
        label: input.label,
        surface: input.surface,
        timeframe: input.timeframe,
        viewKey: input.viewKey,
        workosOrganizationId: org,
      });
    case "create_calendar_sync_subscription":
      return await runDomainMutation(ctx, "createCalendarSyncSubscription", {
        buildId: input.buildId,
        direction: input.direction,
        filters: input.filters ?? {},
        provider: input.provider,
        proposalId: input.proposalId,
        surface: input.surface,
        workosOrganizationId: org,
      });
    case "start_proposal_collaboration":
      return await runCollaborationMutation(ctx, "startSession", {
        proposalId: input.proposalId,
        workosOrganizationId: org,
      });
    case "stop_proposal_collaboration":
      return await runCollaborationMutation(ctx, "stopSession", {
        reason: optionalString(input.reason),
        sessionId: input.sessionId,
        workosOrganizationId: org,
      });
    case "invite_proposal_collaborator":
      return await runCollaborationMutation(ctx, "inviteParticipant", {
        inviteEmail: optionalString(input.inviteEmail ?? input.email),
        permission: input.permission ?? "view",
        sessionId: input.sessionId,
        targetWorkosUserId: optionalString(input.targetWorkosUserId),
        workosOrganizationId: org,
      });
    case "set_proposal_collaborator_permission":
      return await runCollaborationMutation(ctx, "setParticipantPermission", {
        participantId: input.participantId,
        permission: input.permission,
        reason: optionalString(input.reason),
        sessionId: input.sessionId,
        targetWorkosUserId: optionalString(input.targetWorkosUserId),
        workosOrganizationId: org,
      });
    case "assign_collaboration_to_builder":
      return await runCollaborationMutation(ctx, "assignSessionToBuilder", {
        reason: optionalString(input.reason),
        sessionId: input.sessionId,
        targetWorkosUserId: input.targetWorkosUserId,
        workosOrganizationId: org,
      });
    case "undo_proposal_timeline":
      return await runCollaborationMutation(ctx, "undoProposalTimeline", {
        proposalId: input.proposalId,
        reason: optionalString(input.reason),
        sessionId: input.sessionId,
        workosOrganizationId: org,
      });
    case "redo_proposal_timeline":
      return await runCollaborationMutation(ctx, "redoProposalTimeline", {
        proposalId: input.proposalId,
        reason: optionalString(input.reason),
        sessionId: input.sessionId,
        workosOrganizationId: org,
      });
    case "join_proposal_collaboration":
      return await runCollaborationMutation(ctx, "joinSession", {
        shareToken: input.shareToken,
        workosOrganizationId: org,
      });
    case "update_active_build_details":
      return await runDomainMutation(
        ctx,
        "updateActiveBuildNonFinancialDetails",
        {
          buildId: input.buildId,
          buildName: input.buildName,
          ianaTimezone: input.ianaTimezone,
          location: input.location,
          locationLatitude: input.locationLatitude,
          locationLongitude: input.locationLongitude,
          locationPlaceId: input.locationPlaceId,
          reason: reasonOrNote(input),
          startDate: input.startDate,
          workosOrganizationId: org,
        }
      );
    case "delete_active_build":
      return await runDomainMutation(ctx, "deleteActiveBuild", {
        buildId: input.buildId,
        reason: reasonOrNote(input),
        workosOrganizationId: org,
      });
    case "create_active_build_cost_item":
      return await runDomainMutation(ctx, "createActiveBuildCostItem", {
        ...costItemInput(input),
        buildId: input.buildId,
        workosOrganizationId: org,
      });
    case "update_active_build_cost_item":
      return await runDomainMutation(ctx, "updateActiveBuildCostItem", {
        ...costItemPatchInput(input),
        buildId: input.buildId,
        workosOrganizationId: org,
      });
    case "delete_active_build_cost_item":
      return await runDomainMutation(ctx, "deleteActiveBuildCostItem", {
        buildId: input.buildId,
        itemId: input.itemId,
        reason: optionalString(input.reason),
        workosOrganizationId: org,
      });
    case "attach_active_build_contractor":
      return await runDomainMutation(ctx, "attachActiveBuildContractor", {
        ...contractorAttachmentInput(input),
        buildId: input.buildId,
        workosOrganizationId: org,
      });
    case "create_and_assign_active_build_contractor": {
      const contractorId = await runDomainMutation(
        ctx,
        "createContractorProfile",
        {
          ...normalizeContractorInput(input.contractor ?? input),
          brokerageId: auth.brokerage._id,
          workosOrganizationId: org,
        }
      );
      return await runDomainMutation(
        ctx,
        "assignActiveBuildContractorToMilestone",
        {
          ...contractorScopeAssignmentInput({ ...input, contractorId }),
          buildId: input.buildId,
          workosOrganizationId: org,
        }
      );
    }
    case "assign_active_build_contractor_to_scope":
      return await runDomainMutation(
        ctx,
        "assignActiveBuildContractorToMilestone",
        {
          ...contractorScopeAssignmentInput(input),
          buildId: input.buildId,
          workosOrganizationId: org,
        }
      );
    case "start_active_build_milestone":
      return await runDomainMutation(ctx, "startActiveBuildMilestone", {
        actualStartedAt: requiredNumber(
          input.actualStartedAt,
          "actualStartedAt"
        ),
        buildId: input.buildId,
        dependencyOverrideReason: optionalString(
          input.dependencyOverrideReason
        ),
        expectedRevision: requiredNumber(
          input.expectedRevision,
          "expectedRevision"
        ),
        idempotencyKey: requiredString(input.idempotencyKey, "idempotencyKey"),
        milestoneKey: input.milestoneKey,
        source: "assistant",
        startParent: Boolean(input.startParent),
        submilestoneKey: optionalString(input.submilestoneKey),
        workosOrganizationId: org,
      });
    case "submit_active_build_milestone_completion":
      return await runDomainMutation(
        ctx,
        "submitActiveBuildMilestoneCompletion",
        {
          actualCostCents: optionalNumber(input.actualCostCents),
          actualStartedAt: optionalNumber(input.actualStartedAt),
          buildId: input.buildId,
          completedDay: input.completedDay,
          dependencyOverrideReason: optionalString(
            input.dependencyOverrideReason
          ),
          idempotencyKey: requiredString(
            input.idempotencyKey,
            "idempotencyKey"
          ),
          milestoneKey: input.milestoneKey,
          note: optionalString(input.note),
          qualityNote: optionalString(input.qualityNote),
          qualityRating: optionalNumber(input.qualityRating),
          workosOrganizationId: org,
        }
      );
    case "approve_active_build_milestone":
      return await runDomainMutation(ctx, "approveActiveBuildMilestone", {
        buildId: input.buildId,
        milestoneKey: input.milestoneKey,
        note: optionalString(input.note ?? input.reason),
        workosOrganizationId: org,
      });
    case "reject_active_build_milestone":
      return await runDomainMutation(ctx, "rejectActiveBuildMilestone", {
        buildId: input.buildId,
        milestoneKey: input.milestoneKey,
        note: optionalString(input.note ?? input.reason),
        workosOrganizationId: org,
      });
    case "request_active_build_milestone_info":
      return await runDomainMutation(ctx, "requestActiveBuildMilestoneInfo", {
        buildId: input.buildId,
        milestoneKey: input.milestoneKey,
        note: reasonOrNote(input),
        workosOrganizationId: org,
      });
    case "review_active_build_evidence":
      return await runDomainMutation(ctx, "reviewActiveBuildEvidence", {
        accepted: Boolean(input.accepted),
        buildId: input.buildId,
        milestoneKey: input.milestoneKey,
        note: optionalString(input.note ?? input.reason),
        workosOrganizationId: org,
      });
    case "update_active_build_evidence_asset":
      return await runDomainMutation(
        ctx,
        "updateActiveBuildTimelineEvidenceAsset",
        {
          buildId: input.buildId,
          evidenceKey: input.evidenceKey,
          label: optionalString(input.label),
          tag: optionalString(input.tag),
          workosOrganizationId: org,
        }
      );
    case "delete_active_build_evidence_asset":
      return await runDomainMutation(
        ctx,
        "deleteActiveBuildTimelineEvidenceAsset",
        {
          buildId: input.buildId,
          evidenceKey: input.evidenceKey,
          workosOrganizationId: org,
        }
      );
    case "record_active_build_site_visit":
      return await runDomainMutation(ctx, "recordActiveBuildSiteVisit", {
        buildId: input.buildId,
        milestoneKey: input.milestoneKey,
        note: optionalString(input.note ?? input.reason),
        status: input.status ?? "complete",
        visitId: input.visitId,
        workosOrganizationId: org,
      });
    case "request_active_build_draw":
      return await runDomainMutation(ctx, "requestActiveBuildDraw", {
        amountCents: input.amountCents,
        buildId: input.buildId,
        clientOperationId: optionalString(input.clientOperationId),
        drawKey: input.drawKey,
        note: optionalString(input.note ?? input.reason),
        workosOrganizationId: org,
      });
    case "start_active_build_draw_review":
      return await runDomainMutation(ctx, "startActiveBuildDrawReview", {
        buildId: input.buildId,
        drawKey: input.drawKey,
        note: optionalString(input.note ?? input.reason),
        workosOrganizationId: org,
      });
    case "submit_active_build_draw_for_admin":
      return await runDomainMutation(ctx, "submitActiveBuildDrawForAdmin", {
        buildId: input.buildId,
        drawKey: input.drawKey,
        note: optionalString(input.note ?? input.reason),
        workosOrganizationId: org,
      });
    case "approve_active_build_draw":
      return await runDomainMutation(ctx, "approveActiveBuildDraw", {
        buildId: input.buildId,
        drawKey: input.drawKey,
        note: optionalString(input.note ?? input.reason),
        workosOrganizationId: org,
      });
    case "reject_active_build_draw":
      return await runDomainMutation(ctx, "rejectActiveBuildDraw", {
        buildId: input.buildId,
        drawKey: input.drawKey,
        note: optionalString(input.note ?? input.reason),
        workosOrganizationId: org,
      });
    case "release_active_build_draw":
      return await runDomainMutation(ctx, "releaseActiveBuildDraw", {
        buildId: input.buildId,
        drawKey: input.drawKey,
        note: optionalString(input.note ?? input.reason),
        releaseDate: input.releaseDate,
        workosOrganizationId: org,
      });
    case "request_active_build_facility_change":
      return await runDomainMutation(ctx, "requestActiveBuildFacilityChange", {
        buildId: input.buildId,
        reason: optionalString(input.reason),
        requestedPrincipalCents: input.requestedPrincipalCents,
        requestType: "principalIncrease",
        workosOrganizationId: org,
      });
    case "request_active_build_payback_extension":
      return await runDomainMutation(ctx, "requestActiveBuildFacilityChange", {
        buildId: input.buildId,
        reason: optionalString(input.reason),
        requestedPaybackDate: input.requestedPaybackDate ?? input.paybackDate,
        requestType: "paybackExtension",
        workosOrganizationId: org,
      });
    case "review_active_build_facility_change":
      return await runDomainMutation(
        ctx,
        "reviewActiveBuildFacilityChangeRequest",
        {
          note: optionalString(input.note ?? input.reason),
          requestId: input.requestId,
          status: input.status,
          workosOrganizationId: org,
        }
      );
    case "update_active_build_builder_staff_permissions":
      return await runDomainMutation(
        ctx,
        "saveActiveBuildBuilderStaffPermissions",
        {
          buildId: input.buildId,
          permissions: input.permissions ?? [],
          staffEmail: optionalString(input.staffEmail),
          staffWorkosUserId: optionalString(input.staffWorkosUserId),
          workosOrganizationId: org,
        }
      );
    case "remove_active_build_builder_staff":
      return await runDomainMutation(
        ctx,
        "removeActiveBuildBuilderStaffMember",
        {
          buildId: input.buildId,
          staffWorkosUserId: input.staffWorkosUserId,
          workosOrganizationId: org,
        }
      );
    case "create_active_build_milestone":
      return await runDomainMutation(
        ctx,
        "createActiveBuildTimelineMilestone",
        {
          buildId: input.buildId,
          milestone: normalizeTimelineMilestoneInput(input),
          workosOrganizationId: org,
        }
      );
    case "update_active_build_milestone":
      return await runDomainMutation(
        ctx,
        "updateActiveBuildTimelineMilestone",
        {
          ...timelineMilestonePatchInput(input),
          buildId: input.buildId,
          workosOrganizationId: org,
        }
      );
    case "delete_active_build_milestone":
      return await runDomainMutation(
        ctx,
        "deleteActiveBuildTimelineMilestone",
        {
          buildId: input.buildId,
          milestoneKey: input.milestoneKey,
          workosOrganizationId: org,
        }
      );
    case "create_active_build_draw":
      return await runDomainMutation(ctx, "createActiveBuildTimelineDraw", {
        ...timelineDrawInput(input),
        buildId: input.buildId,
        workosOrganizationId: org,
      });
    case "update_active_build_draw":
      return await runDomainMutation(ctx, "updateActiveBuildTimelineDraw", {
        ...timelineDrawPatchInput(input),
        buildId: input.buildId,
        workosOrganizationId: org,
      });
    case "delete_active_build_draw":
      return await runDomainMutation(ctx, "deleteActiveBuildTimelineDraw", {
        buildId: input.buildId,
        drawKey: input.drawKey,
        workosOrganizationId: org,
      });
    case "create_active_build_capital_event":
      return await runDomainMutation(
        ctx,
        "createActiveBuildTimelineCapitalEvent",
        {
          ...capitalEventInput(input),
          buildId: input.buildId,
          workosOrganizationId: org,
        }
      );
    case "update_active_build_capital_event":
      return await runDomainMutation(
        ctx,
        "updateActiveBuildTimelineCapitalEvent",
        {
          ...capitalEventPatchInput(input),
          buildId: input.buildId,
          workosOrganizationId: org,
        }
      );
    case "delete_active_build_capital_event":
      return await runDomainMutation(
        ctx,
        "deleteActiveBuildTimelineCapitalEvent",
        {
          buildId: input.buildId,
          capitalEventKey: input.capitalEventKey,
          workosOrganizationId: org,
        }
      );
    case "request_active_build_capital_event_revision":
    case "request_active_build_cash_infusion":
    case "apply_active_build_modification":
      return await applyActiveBuildGenericRevisionRequest(ctx, auth, item);
    case "update_active_build_timeline_plan_state":
      return await runDomainMutation(
        ctx,
        "updateActiveBuildTimelinePlanState",
        {
          ...timelinePlanStateInput(input),
          buildId: input.buildId,
          workosOrganizationId: org,
        }
      );
    default:
      throw new Error(`Assistant action is not implemented: ${item.actionKey}`);
  }
}
