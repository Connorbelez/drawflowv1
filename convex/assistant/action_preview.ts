import type { Doc, Id, MutationCtx } from "../types";
import type { RoleSlug } from "../authz";
import {
  authorizeProposal,
  authorizeActiveBuild,
  requireProposalWrite,
  requireBackofficeWrite,
  denyContractorMutationBatch,
  previewItem,
  getProposalMilestone,
  getProposalMilestoneByKey,
  getBuildMilestone,
  findProposalDraw,
  getProposalDraw,
  findBuildDraw,
  writeActiveBuildAudit,
  collectByIndex,
  genericProposalPreviewBefore,
  genericActiveBuildPreviewBefore,
  genericPreviewLabel,
  genericEntityType,
  genericReasonRequired,
  genericMutationWarnings,
} from "../assistant";
import {
  arrayInput,
  parseActionKey,
  isMutationActionKey,
  isReadonlyActionKey,
  calculateDrawAvailability,
  validateDayRange,
  requiredId,
  requiredString,
  optionalString,
  requiredNumber,
  requiredPositiveCents,
  requiredNonNegativeDay,
  requiredReason,
  requireReason,
  sanitizeForPersistence,
  errorMessage,
} from "./inputs";
import {
  TRUSTED_FILE_ACTION_KEYS,
  type AssistantActionInput,
  type AssistantActionKey,
  type AssistantAuth,
  type AssistantPlanItem,
  type ValidationResult,
} from "./contracts";
import {
  previewReminderAction,
  previewTargetDateAction,
} from "./action_mutations";

export async function validateActionForPreview(
  ctx: MutationCtx,
  auth: AssistantAuth,
  action: {
    actionKey: string;
    clientRequestId: string;
    input: AssistantActionInput;
  }
): Promise<AssistantPlanItem> {
  const actionKey = parseActionKey(action.actionKey);
  if (isReadonlyActionKey(actionKey)) {
    return {
      actionKey,
      after: action.input,
      before: null,
      clientRequestId: action.clientRequestId,
      entityLabel: actionKey,
      entityType: "navigation",
      input: action.input,
      reasonRequired: false,
      status: "preview",
      validation: { errors: [], warnings: [] },
    };
  }
  denyContractorMutationBatch(auth.roles);
  return await buildMutationPreviewItem(ctx, auth, {
    actionKey,
    clientRequestId: action.clientRequestId,
    input: action.input,
  });
}

export async function validateActionForCommit(
  ctx: MutationCtx,
  auth: AssistantAuth,
  item: AssistantPlanItem
): Promise<ValidationResult> {
  try {
    if (isReadonlyActionKey(item.actionKey)) {
      return {
        actionKey: item.actionKey,
        clientRequestId: item.clientRequestId,
        errors: [],
        warnings: [],
      };
    }
    const preview = await buildMutationPreviewItem(ctx, auth, item);
    return {
      actionKey: item.actionKey,
      clientRequestId: item.clientRequestId,
      errors: preview.validation.errors,
      warnings: preview.validation.warnings,
    };
  } catch (error) {
    return {
      actionKey: item.actionKey,
      clientRequestId: item.clientRequestId,
      errors: [errorMessage(error)],
      warnings: [],
    };
  }
}

export async function buildMutationPreviewItem(
  ctx: MutationCtx,
  auth: AssistantAuth,
  action: {
    actionKey: AssistantActionKey;
    clientRequestId: string;
    input: AssistantActionInput;
  }
): Promise<AssistantPlanItem> {
  if (!isMutationActionKey(action.actionKey)) {
    throw new Error(
      `Assistant action is not in the mutation catalog: ${action.actionKey}`
    );
  }
  switch (action.actionKey) {
    case "create_build_proposal_from_setup":
      return previewBuildProposalFromSetup(action);
    case "add_proposal_document":
    case "create_proposal_evidence_asset":
    case "add_active_build_document":
    case "create_active_build_evidence_asset":
      return await previewTrustedFileBlockedAction(ctx, auth, action);
    case "update_proposal_milestone_schedule": {
      const proposalAuth = await authorizeProposal(ctx, auth, action.input);
      requireProposalWrite(proposalAuth);
      const milestone = await getProposalMilestone(
        ctx,
        action.input,
        proposalAuth.proposal._id
      );
      const dayStart = requiredNumber(action.input.dayStart, "dayStart");
      const dayEnd = requiredNumber(action.input.dayEnd, "dayEnd");
      validateDayRange(dayStart, dayEnd);
      return previewItem(action, {
        after: { dayEnd: Math.round(dayEnd), dayStart: Math.round(dayStart) },
        before: {
          dayEnd: milestone.dayEnd,
          dayStart: milestone.dayStart,
          durationDays: milestone.durationDays,
        },
        entityLabel: milestone.name,
        entityType: "proposalMilestone",
        mutationName: "assistant.updateProposalMilestoneSchedule",
        reasonRequired: proposalAuth.proposal.status !== "draft",
      });
    }
    case "update_proposal_milestone_budget": {
      const proposalAuth = await authorizeProposal(ctx, auth, action.input);
      requireProposalWrite(proposalAuth);
      const milestone = await getProposalMilestone(
        ctx,
        action.input,
        proposalAuth.proposal._id
      );
      const budgetCents = requiredPositiveCents(
        action.input.budgetCents,
        "Milestone budget must be greater than zero."
      );
      return previewItem(action, {
        after: {
          budgetCents,
          drawAvailabilityCents: calculateDrawAvailability(
            budgetCents,
            proposalAuth.proposal.borrowerCoPayBps
          ),
        },
        before: {
          budgetCents: milestone.budgetCents,
          drawAvailabilityCents: milestone.drawAvailabilityCents,
        },
        entityLabel: milestone.name,
        entityType: "proposalMilestone",
        mutationName: "assistant.updateProposalMilestoneBudget",
        reasonRequired: proposalAuth.proposal.status !== "draft",
      });
    }
    case "create_proposal_planned_draw": {
      const proposalAuth = await authorizeProposal(ctx, auth, action.input);
      requireProposalWrite(proposalAuth);
      const drawKey = requiredString(action.input.drawKey, "drawKey");
      const existing = await findProposalDraw(
        ctx,
        proposalAuth.proposal._id,
        drawKey
      );
      if (existing) {
        throw new Error("Proposal draw already exists.");
      }
      const amountCents = requiredPositiveCents(
        action.input.amountCents,
        "Draw amount must be greater than zero."
      );
      const timingDay = requiredNonNegativeDay(
        action.input.timingDay,
        "timingDay"
      );
      const milestoneKey = optionalString(action.input.milestoneKey);
      if (milestoneKey) {
        await getProposalMilestoneByKey(
          ctx,
          proposalAuth.proposal._id,
          milestoneKey
        );
      }
      return previewItem(action, {
        after: { amountCents, drawKey, milestoneKey, timingDay },
        before: null,
        entityLabel: optionalString(action.input.label) ?? drawKey,
        entityType: "proposalDrawScheduleRow",
        mutationName: "assistant.createProposalDraw",
        reasonRequired: false,
      });
    }
    case "update_proposal_planned_draw": {
      const proposalAuth = await authorizeProposal(ctx, auth, action.input);
      requireProposalWrite(proposalAuth);
      const draw = await getProposalDraw(
        ctx,
        action.input,
        proposalAuth.proposal._id
      );
      const amountCents =
        action.input.amountCents === undefined
          ? draw.amountCents
          : requiredPositiveCents(
              action.input.amountCents,
              "Draw amount must be greater than zero."
            );
      const timingDay =
        action.input.timingDay === undefined
          ? draw.timingDay
          : requiredNonNegativeDay(action.input.timingDay, "timingDay");
      return previewItem(action, {
        after: { amountCents, timingDay },
        before: {
          amountCents: draw.amountCents,
          timingDay: draw.timingDay,
        },
        entityLabel: draw.label,
        entityType: "proposalDrawScheduleRow",
        mutationName: "assistant.updateProposalDraw",
        reasonRequired: proposalAuth.proposal.status !== "draft",
      });
    }
    case "delete_proposal_planned_draw": {
      const proposalAuth = await authorizeProposal(ctx, auth, action.input);
      requireProposalWrite(proposalAuth);
      const draw = await getProposalDraw(
        ctx,
        action.input,
        proposalAuth.proposal._id
      );
      return previewItem(action, {
        after: null,
        before: draw,
        entityLabel: draw.label,
        entityType: "proposalDrawScheduleRow",
        mutationName: "assistant.deleteProposalDraw",
        reasonRequired: true,
      });
    }
    case "create_proposal_reminder":
    case "update_proposal_reminder":
    case "cancel_proposal_reminder": {
      return await previewReminderAction(ctx, auth, action);
    }
    case "set_calendar_target_date": {
      return await previewTargetDateAction(ctx, auth, action);
    }
    case "start_active_build_milestone": {
      const buildAuth = await authorizeActiveBuild(ctx, auth, action.input);
      if (
        !buildAuth.roles.some((role) =>
          (["builder", "builder-staff"] as readonly RoleSlug[]).includes(role)
        )
      ) {
        throw new Error(
          "Only Builder users may originate a milestone work start."
        );
      }
      const milestone = await getBuildMilestone(
        ctx,
        action.input,
        buildAuth.build._id
      );
      const actualStartedAt = requiredNumber(
        action.input.actualStartedAt,
        "actualStartedAt"
      );
      const expectedRevision = requiredNumber(
        action.input.expectedRevision,
        "expectedRevision"
      );
      if (actualStartedAt > Date.now()) {
        throw new Error("Actual start must be now or earlier.");
      }
      requiredString(action.input.idempotencyKey, "idempotencyKey");
      const milestones = await collectByIndex(
        ctx,
        "buildMilestones",
        "by_build",
        buildAuth.build._id
      );
      const blockers = (milestone.dependencyKeys ?? [])
        .map((key) =>
          milestones.find(
            (candidate: Doc<"buildMilestones">) => candidate.key === key
          )
        )
        .filter((candidate) => candidate && candidate.status !== "complete");
      if (blockers.length > 0) {
        requireReason(action.input.dependencyOverrideReason);
      }
      return previewItem(action, {
        after: {
          actualStartedAt,
          expectedRevision,
          dependencyOverrideReason: optionalString(
            action.input.dependencyOverrideReason
          ),
          source: "assistant",
          status: "in_progress",
        },
        before: {
          actualStartedAt: milestone.actualStartedAt ?? null,
          status: milestone.status,
        },
        entityLabel: milestone.name,
        entityType: "buildMilestone",
        mutationName: "production_proposals.startActiveBuildMilestone",
        reasonRequired: blockers.length > 0,
        warnings: blockers.map(
          (candidate) => `${candidate?.name ?? candidate?.key} is not complete.`
        ),
      });
    }
    case "schedule_active_build_site_visit":
    case "reschedule_active_build_site_visit":
    case "cancel_active_build_site_visit": {
      const buildAuth = await authorizeActiveBuild(ctx, auth, action.input);
      requireBackofficeWrite(buildAuth.roles);
      const milestone = await getBuildMilestone(
        ctx,
        action.input,
        buildAuth.build._id
      );
      return previewItem(action, {
        after: action.input,
        before: milestone.completionReview?.siteVisit ?? null,
        entityLabel: milestone.name,
        entityType: "buildSiteVisit",
        mutationName: `assistant.${action.actionKey}`,
        reasonRequired: action.actionKey !== "schedule_active_build_site_visit",
      });
    }
    case "request_active_build_milestone_schedule_revision":
    case "request_active_build_milestone_budget_revision":
    case "request_active_build_draw_plan_revision": {
      const buildAuth = await authorizeActiveBuild(ctx, auth, action.input);
      requireBackofficeWrite(buildAuth.roles);
      requireReason(action.input.reason);
      const entity =
        action.actionKey === "request_active_build_draw_plan_revision"
          ? await findBuildDraw(
              ctx,
              buildAuth.build._id,
              optionalString(action.input.drawKey) ?? ""
            )
          : await getBuildMilestone(ctx, action.input, buildAuth.build._id);
      if (
        action.actionKey === "request_active_build_draw_plan_revision" &&
        action.input.amountCents !== undefined
      ) {
        requiredPositiveCents(
          action.input.amountCents,
          "Draw amount must be greater than zero."
        );
      }
      if (
        action.actionKey === "request_active_build_milestone_budget_revision" &&
        action.input.budgetCents !== undefined
      ) {
        requiredPositiveCents(
          action.input.budgetCents,
          "Milestone budget must be greater than zero."
        );
      }
      if (
        action.actionKey === "request_active_build_milestone_schedule_revision"
      ) {
        validateDayRange(
          requiredNumber(action.input.dayStart, "dayStart"),
          requiredNumber(action.input.dayEnd, "dayEnd")
        );
      }
      return previewItem(action, {
        after: action.input,
        before: entity ?? null,
        entityLabel:
          entity && "label" in entity
            ? String(entity.label)
            : entity && "name" in entity
              ? String(entity.name)
              : (optionalString(action.input.drawKey) ?? "Requested draw plan"),
        entityType:
          action.actionKey === "request_active_build_draw_plan_revision"
            ? "plannedDrawScheduleRow"
            : "buildMilestone",
        mutationName: `assistant.${action.actionKey}`,
        reasonRequired: true,
        warnings: ["active-build-request-only"],
      });
    }
    default:
      return await previewGenericCatalogAction(ctx, auth, action);
  }
}

export function previewBuildProposalFromSetup(action: {
  actionKey: AssistantActionKey;
  clientRequestId: string;
  input: AssistantActionInput;
}) {
  const buildName = requiredString(
    action.input.buildName ?? action.input.title,
    "buildName"
  );
  requiredString(
    action.input.location ?? action.input.projectAddress,
    "location"
  );
  const milestones = arrayInput(
    action.input.milestones ?? action.input.items,
    "milestones"
  );
  if (milestones.length === 0) {
    throw new Error("At least one setup milestone is required.");
  }
  return previewItem(action, {
    after: {
      buildName,
      location: action.input.location ?? action.input.projectAddress,
      milestoneCount: milestones.length,
      redirectTo: optionalString(action.input.redirectTo) ?? "proposal",
    },
    before: null,
    entityLabel: buildName,
    entityType: "buildProposalSetup",
    mutationName: "assistant.create_build_proposal_from_setup",
    reasonRequired: false,
    warnings: action.input.documents
      ? ["prompt-document-metadata-ignored-without-trusted-file-provenance"]
      : [],
  });
}

export async function previewTrustedFileBlockedAction(
  ctx: MutationCtx,
  auth: AssistantAuth,
  action: {
    actionKey: AssistantActionKey;
    clientRequestId: string;
    input: AssistantActionInput;
  }
) {
  let label: string = action.actionKey;
  let before: unknown = null;
  if (action.input.buildId) {
    const buildAuth = await authorizeActiveBuild(ctx, auth, action.input);
    label = buildAuth.build.buildName;
    before = buildAuth.build;
  } else if (action.input.proposalId) {
    const proposalAuth = await authorizeProposal(ctx, auth, action.input);
    label = proposalAuth.proposal.buildName;
    before = proposalAuth.proposal;
  }
  return previewItem(action, {
    after: action.input,
    before,
    entityLabel: label,
    entityType: "trustedFileAttachment",
    errors: [
      "This action requires a trusted file attachment selected by the user; prompt-only file mutations are blocked.",
    ],
    mutationName: `assistant.${action.actionKey}`,
    reasonRequired: true,
    warnings: ["trusted-file-required"],
  });
}

export async function previewGenericCatalogAction(
  ctx: MutationCtx,
  auth: AssistantAuth,
  action: {
    actionKey: AssistantActionKey;
    clientRequestId: string;
    input: AssistantActionInput;
  }
) {
  if (!isMutationActionKey(action.actionKey)) {
    throw new Error(
      `Assistant action is not in the mutation catalog: ${action.actionKey}`
    );
  }

  if (
    (TRUSTED_FILE_ACTION_KEYS as readonly string[]).includes(action.actionKey)
  ) {
    return await previewTrustedFileBlockedAction(ctx, auth, action);
  }

  if (action.input.buildId) {
    const buildAuth = await authorizeActiveBuild(ctx, auth, action.input);
    const before = await genericActiveBuildPreviewBefore(
      ctx,
      buildAuth,
      action
    );
    return previewItem(action, {
      after: action.input,
      before,
      entityLabel: genericPreviewLabel(before, buildAuth.build.buildName),
      entityType: genericEntityType(action.actionKey, "activeBuild"),
      mutationName: `assistant.${action.actionKey}`,
      reasonRequired: genericReasonRequired(action.actionKey),
      warnings: genericMutationWarnings(action.actionKey),
    });
  }

  if (action.input.proposalId) {
    const proposalAuth = await authorizeProposal(ctx, auth, action.input);
    const before = await genericProposalPreviewBefore(
      ctx,
      proposalAuth,
      action
    );
    return previewItem(action, {
      after: action.input,
      before,
      entityLabel: genericPreviewLabel(before, proposalAuth.proposal.buildName),
      entityType: genericEntityType(action.actionKey, "buildProposal"),
      mutationName: `assistant.${action.actionKey}`,
      reasonRequired: genericReasonRequired(action.actionKey),
      warnings: genericMutationWarnings(action.actionKey),
    });
  }

  if (action.input.sessionId) {
    const sessionId = requiredId<"proposalCollaborationSessions">(
      ctx,
      "proposalCollaborationSessions",
      action.input.sessionId,
      "sessionId"
    );
    const session = await ctx.db.get(sessionId);
    if (!session || session.organizationId !== auth.organizationId) {
      throw new Error("Collaboration session not found.");
    }
    return previewItem(action, {
      after: action.input,
      before: session,
      entityLabel: `Collaboration ${String(session._id)}`,
      entityType: "proposalCollaborationSession",
      mutationName: `assistant.${action.actionKey}`,
      reasonRequired: genericReasonRequired(action.actionKey),
      warnings: genericMutationWarnings(action.actionKey),
    });
  }

  if (
    action.actionKey === "save_calendar_view" ||
    action.actionKey === "create_calendar_sync_subscription" ||
    action.actionKey === "join_proposal_collaboration"
  ) {
    return previewItem(action, {
      after: action.input,
      before: null,
      entityLabel: action.actionKey,
      entityType: "organizationScopedAction",
      mutationName: `assistant.${action.actionKey}`,
      reasonRequired: genericReasonRequired(action.actionKey),
      warnings: genericMutationWarnings(action.actionKey),
    });
  }

  throw new Error(
    `${action.actionKey} requires proposalId, buildId, or sessionId.`
  );
}

export async function applyActiveBuildGenericRevisionRequest(
  ctx: MutationCtx,
  auth: AssistantAuth,
  item: AssistantPlanItem
) {
  const input = item.input;
  const buildAuth = await authorizeActiveBuild(ctx, auth, input);
  requireReason(input.reason);
  const now = Date.now();
  const entityKey =
    optionalString(input.capitalEventKey) ??
    optionalString(input.cashInfusionKey) ??
    optionalString(input.milestoneKey) ??
    item.actionKey;
  const revisionId = await ctx.db.insert("scheduleRevisionRecords", {
    brokerageId: buildAuth.brokerage._id,
    buildId: buildAuth.build._id,
    createdAt: now,
    entityKey,
    entityType:
      item.actionKey === "apply_active_build_modification"
        ? "activeBuildModification"
        : "capitalEvent",
    newState: sanitizeForPersistence(input),
    organizationId: buildAuth.organizationId,
    priorState: null,
    proposalId: buildAuth.proposal._id,
    reason: requiredReason(input.reason),
    revisionType: `assistant.${item.actionKey}`,
    revisedByWorkosUserId: buildAuth.subject,
    warnings: ["assistant-request-only"],
  });
  await writeActiveBuildAudit(ctx, buildAuth, {
    command: `assistant.commit.${item.actionKey}`,
    entityId: String(revisionId),
    entityType:
      item.actionKey === "apply_active_build_modification"
        ? "activeBuildModification"
        : "capitalEvent",
    eventType: `assistant.${item.actionKey}`,
    newState: input,
    reason: requiredReason(input.reason),
    warnings: ["assistant-request-only"],
  });
  return { revisionId };
}
