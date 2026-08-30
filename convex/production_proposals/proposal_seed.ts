/**
 * Production proposals proposal seed bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { ConvexError, v } from "convex/values";
import { authenticatedMutation, normalizeRoleSlugs } from "../authz";
import { getBuilderBrokerAssignmentHealth, requireDefaultBrokerMember, requireEligibleBrokerMember } from "../brokerAssignments";
import { FAIRLEND_BROKERAGE_NAME, FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID, FAIRLEND_WORKOS_ORGANIZATION_ID } from "../fairLendConfig";
import { authorizeBrokerage, authorizeProposal, assertBuilderProfileScope, assignedBuilderProfileIdOrThrow, assertBuilderOwnership } from "./authorization_core.js";
import { requireProposalAppPermission } from "./builder_staff_access.js";
import { requireAnyRole, normalizeIsoDateOnly } from "./contractor_policy_helpers.js";
import { BACKOFFICE_ROLES, BUILDER_ROLES, milestoneInput, documentInput, proposalCapitalSourceInput } from "./contracts_foundation.js";
import { MAX_PROPOSAL_MILESTONES, proposalDraftDrawInput, proposalDraftCostItemInput, proposalDraftContractorAssignmentInput } from "./contracts_workflow.js";
import { ensureSeedContractorProfile } from "./legacy_seed.js";
import { assertNoArchivingProposalLenderAssignment } from "./lender_assignment_auth.js";
import { isBackoffice } from "./proposal_claim.js";
import { deleteProposalPlanChildren, upsertKanbanCard, writeProposalEvent } from "./proposal_copy_audit.js";
import { normalizeCostItemCost, normalizeCostItemQuantity, normalizeCostItemBudgetTreatment } from "./proposal_cost_validation.js";
import { insertDraftProposalPlanRows, insertDraftProposalCostItems, insertDraftProposalContractorAssignments } from "./proposal_draft_persistence.js";
import { calculateDrawAvailability } from "./proposal_lender_approval.js";
import { projectDevelopmentProductionFoundationWorkosFixtures, requireProductionSeedOrganization, ensureBrokerage, ensureBuilderProfile, ensureBuilderAccountLink, ensureSeedBuilderBrokerAssignment } from "./seed_foundation.js";
import { ensureSeedScenarioProposal } from "./seed_scenario.js";
import { seedProductionDefaultTemplates, ensureProductionSettingsRows, ensureWorkflowRule } from "./seed_template_writer.js";
import { ensureProposalTemplate } from "./settings_helpers.js";
import { buildProductionSettingsProjection, collectByIndex } from "./storage_helpers.js";

export const dev_seedProductionFoundation = authenticatedMutation
  .input({ workosOrganizationId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    requireAnyRole(ctx.viewer.roles, ["admin"]);
    const now = Date.now();

    await projectDevelopmentProductionFoundationWorkosFixtures(ctx, {
      now,
      workosOrganizationId: args.workosOrganizationId,
    });
    const isFairLendBootstrapOrg =
      args.workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID;

    const brokerageId = await ensureBrokerage(ctx, {
      displayName: FAIRLEND_BROKERAGE_NAME,
      legalName: FAIRLEND_BROKERAGE_NAME,
      now,
      principalBrokerWorkosUserId: isFairLendBootstrapOrg
        ? FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID
        : ctx.viewer.subject,
      workosOrganizationId: args.workosOrganizationId,
    });
    const builderProfileId = await ensureBuilderProfile(ctx, {
      brokerageId,
      displayName: "Production Builder",
      now,
      organizationId: args.workosOrganizationId,
    });
    await ensureBuilderAccountLink(ctx, {
      brokerageId,
      builderProfileId,
      now,
      role: "owner",
      workosUserId: "user_builder",
    });
    await ensureSeedBuilderBrokerAssignment(ctx, {
      assignedBrokerWorkosUserId: isFairLendBootstrapOrg
        ? FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID
        : "user_broker",
      brokerageId,
      builderProfileId,
      now,
      organizationId: args.workosOrganizationId,
    });
    const templateId = await ensureProposalTemplate(ctx, {
      brokerageId,
      now,
      organizationId: args.workosOrganizationId,
    });
    await ensureProductionSettingsRows(ctx, {
      brokerageId,
      now,
      organizationId: args.workosOrganizationId,
      templateId,
    });
    const workflowRuleId = await ensureWorkflowRule(ctx, {
      brokerageId,
      now,
      organizationId: args.workosOrganizationId,
    });

    return {
      brokerageId,
      builderProfileId,
      templateId,
      workflowRuleId,
    };
  })
  .internal();

export const seedProductionDefaultsToProd = authenticatedMutation
  .input({})
  .returns(v.any())
  .handler(async (ctx) => {
    requireAnyRole(ctx.viewer.roles, ["admin"]);
    const workosOrganizationId = await requireProductionSeedOrganization(ctx);
    const now = Date.now();
    const isFairLendBootstrapOrg =
      workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID;
    const brokerageId = await ensureBrokerage(ctx, {
      displayName: FAIRLEND_BROKERAGE_NAME,
      legalName: FAIRLEND_BROKERAGE_NAME,
      now,
      principalBrokerWorkosUserId: isFairLendBootstrapOrg
        ? FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID
        : ctx.viewer.subject,
      workosOrganizationId,
    });
    const templateResult = await seedProductionDefaultTemplates(ctx, {
      brokerageId,
      now,
      organizationId: workosOrganizationId,
    });
    const workflowRuleId = await ensureWorkflowRule(ctx, {
      brokerageId,
      now,
      organizationId: workosOrganizationId,
    });
    const brokerage = await ctx.db.get(brokerageId);

    return {
      brokerageId,
      settings: brokerage
        ? await buildProductionSettingsProjection(ctx, brokerage)
        : null,
      workflowRuleId,
      ...templateResult,
    };
  })
  .public();

export const dev_seedProductionProposalScenarios = authenticatedMutation
  .input({ workosOrganizationId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    requireAnyRole(ctx.viewer.roles, ["admin"]);
    const now = Date.now();

    await projectDevelopmentProductionFoundationWorkosFixtures(ctx, {
      now,
      workosOrganizationId: args.workosOrganizationId,
    });
    const isFairLendBootstrapOrg =
      args.workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID;

    const brokerageId = await ensureBrokerage(ctx, {
      displayName: FAIRLEND_BROKERAGE_NAME,
      legalName: FAIRLEND_BROKERAGE_NAME,
      now,
      principalBrokerWorkosUserId: isFairLendBootstrapOrg
        ? FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID
        : ctx.viewer.subject,
      workosOrganizationId: args.workosOrganizationId,
    });
    const brokerage = await ctx.db.get(brokerageId);
    if (!brokerage) {
      throw new Error("Missing seeded brokerage.");
    }
    const builderProfileId = await ensureBuilderProfile(ctx, {
      brokerageId,
      displayName: "Production Builder",
      now,
      organizationId: args.workosOrganizationId,
    });
    await ensureBuilderAccountLink(ctx, {
      brokerageId,
      builderProfileId,
      now,
      role: "owner",
      workosUserId: "user_builder",
    });
    await ensureSeedBuilderBrokerAssignment(ctx, {
      assignedBrokerWorkosUserId: isFairLendBootstrapOrg
        ? FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID
        : "user_broker",
      brokerageId,
      builderProfileId,
      now,
      organizationId: args.workosOrganizationId,
    });
    const templateId = await ensureProposalTemplate(ctx, {
      brokerageId,
      now,
      organizationId: args.workosOrganizationId,
    });
    await ensureProductionSettingsRows(ctx, {
      brokerageId,
      now,
      organizationId: args.workosOrganizationId,
      templateId,
    });
    await ensureWorkflowRule(ctx, {
      brokerageId,
      now,
      organizationId: args.workosOrganizationId,
    });

    const auth = {
      brokerage,
      roles: normalizeRoleSlugs(ctx.viewer.roles),
      subject: ctx.viewer.subject,
    };
    const common = {
      auth,
      brokerageId,
      builderProfileId,
      now,
      organizationId: args.workosOrganizationId,
      templateId,
    };

    const proposals = {
      draft: await ensureSeedScenarioProposal(ctx, {
        ...common,
        buildName: "Seed Scenario - Draft",
        scenario: "draft",
      }),
      submitted: await ensureSeedScenarioProposal(ctx, {
        ...common,
        buildName: "Seed Scenario - Submitted",
        scenario: "submitted",
      }),
      approvedWithPermit: await ensureSeedScenarioProposal(ctx, {
        ...common,
        buildName: "Seed Scenario - Approved With Permit",
        scenario: "approved_with_permit",
      }),
      approvedWithWaiver: await ensureSeedScenarioProposal(ctx, {
        ...common,
        buildName: "Seed Scenario - Approved With Waiver",
        scenario: "approved_with_waiver",
      }),
      requestedChanges: await ensureSeedScenarioProposal(ctx, {
        ...common,
        buildName: "Seed Scenario - Requested Changes",
        scenario: "requested_changes",
      }),
      rejected: await ensureSeedScenarioProposal(ctx, {
        ...common,
        buildName: "Seed Scenario - Rejected",
        scenario: "rejected",
      }),
      closed: await ensureSeedScenarioProposal(ctx, {
        ...common,
        buildName: "Seed Scenario - Closed",
        scenario: "closed",
      }),
    };
    const contractorProfileId = await ensureSeedContractorProfile(ctx, {
      brokerageId,
      now,
      organizationId: args.workosOrganizationId,
    });

    return {
      brokerageId,
      builderProfileId,
      contractorProfileId,
      proposals,
      templateId,
    };
  })
  .internal();

export const generateProposalDocumentUploadUrl = authenticatedMutation
  .input({
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.string())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    if (auth.proposal.status === "closed") {
      throw new Error("Closed proposals cannot receive document uploads.");
    }
    await assertNoArchivingProposalLenderAssignment(ctx, args.proposalId);
    await requireProposalAppPermission(ctx, auth, "evidence", "create");
    return await ctx.storage.generateUploadUrl();
  })
  .public();

export const addProposalDocument = authenticatedMutation
  .input({
    documentType: v.union(
      v.literal("permit"),
      v.literal("budget"),
      v.literal("plan"),
      v.literal("supporting"),
    ),
    fileName: v.string(),
    mimeType: v.string(),
    proposalId: v.id("buildProposals"),
    sizeBytes: v.number(),
    storageId: v.optional(v.id("_storage")),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    if (auth.proposal.status === "closed") {
      throw new Error("Closed proposals cannot receive document uploads.");
    }
    await assertNoArchivingProposalLenderAssignment(ctx, args.proposalId);
    await requireProposalAppPermission(ctx, auth, "evidence", "create");
    const fileName = args.fileName.trim();
    if (!fileName) {
      throw new Error("Document file name is required.");
    }
    const now = Date.now();
    const document = {
      brokerageId: auth.brokerage._id,
      createdAt: now,
      documentType: args.documentType,
      fileName,
      mimeType: args.mimeType || "application/octet-stream",
      organizationId: args.workosOrganizationId,
      proposalId: args.proposalId,
      sizeBytes: Math.max(0, Math.round(args.sizeBytes)),
      status: "uploaded" as const,
      storageId: args.storageId,
      updatedAt: now,
      uploadedByWorkosUserId: auth.subject,
    };
    await ctx.db.insert("proposalDocuments", document);
    await writeProposalEvent(ctx, {
      auth,
      command: "addProposalDocument",
      eventType: "proposal.document.created",
      newState: JSON.stringify(document),
      proposalId: args.proposalId,
    });
    return null;
  })
  .public();

export const createDraftProposal = authenticatedMutation
  .input({
    assignedBrokerWorkosUserId: v.optional(v.string()),
    brokerageId: v.id("brokerages"),
    capitalSource: v.optional(proposalCapitalSourceInput),
    builderProfileId: v.id("builderProfiles"),
    buildName: v.string(),
    location: v.string(),
    locationLatitude: v.optional(v.number()),
    locationLongitude: v.optional(v.number()),
    locationPlaceId: v.optional(v.string()),
    proposedStartDate: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("buildProposals"))
  .handler(async (ctx, args) => {
    if (
      (args.locationLatitude === undefined) !==
      (args.locationLongitude === undefined)
    ) {
      throw new Error("Latitude and longitude must be provided together.");
    }
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    const builderProfile = await assertBuilderProfileScope(
      ctx,
      args.builderProfileId,
      auth.brokerage._id,
    );
    if (!isBackoffice(auth.roles)) {
      await assertBuilderOwnership(ctx, args.builderProfileId, auth.subject);
      requireAnyRole(auth.roles, BUILDER_ROLES);
      const assignmentHealth = await getBuilderBrokerAssignmentHealth(ctx, {
        brokerage: auth.brokerage,
        builderProfile,
      });
      if (!assignmentHealth.healthy) {
        throw new ConvexError({
          code: "BUILDER_BROKER_ASSIGNMENT_REQUIRED",
          reason: assignmentHealth.reason,
          recoverable: true,
          safeMessage:
            "An active broker assignment is required before creating a proposal.",
        });
      }
    }

    const now = Date.now();
    const assignedBrokerWorkosUserId =
      args.assignedBrokerWorkosUserId ??
      (await requireDefaultBrokerMember(ctx, auth.brokerage)).workosUserId;
    await requireEligibleBrokerMember(ctx, {
      workosOrganizationId: auth.brokerage.workosOrganizationId,
      workosUserId: assignedBrokerWorkosUserId,
    });
    const proposalId = await ctx.db.insert("buildProposals", {
      brokerageId: auth.brokerage._id,
      assignedBrokerWorkosUserId,
      borrowerCoPayBps: 2000,
      borrowerCoPayCents: 0,
      borrowerStartingCashCents: 0,
      borrowerWorkingCapitalLimitCents: 0,
      buildName: args.buildName,
      builderProfileId: args.builderProfileId,
      capitalSource: args.capitalSource ?? "internal",
      createdAt: now,
      createdByWorkosUserId: auth.subject,
      interestAnnualBps: 925,
      lenderDrawPolicyLimitCents: 0,
      location: args.location,
      ...(args.locationLatitude === undefined
        ? {}
        : {
            locationLatitude: args.locationLatitude,
            locationLongitude: args.locationLongitude,
          }),
      ...(args.locationPlaceId?.trim()
        ? { locationPlaceId: args.locationPlaceId.trim() }
        : {}),
      organizationId: args.workosOrganizationId,
      ...(args.proposedStartDate === undefined
        ? {}
        : {
            proposedStartDate: normalizeIsoDateOnly(
              args.proposedStartDate,
              "proposedStartDate",
            ),
          }),
      reviewOutcome: "none",
      status: "draft",
      totalBudgetCents: 0,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await upsertKanbanCard(ctx, proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "createDraftProposal",
      eventType: "proposal.created",
      newState: JSON.stringify({
        assignedBrokerWorkosUserId,
        status: "draft",
      }),
      proposalId,
    });
    return proposalId;
  })
  .public();

export const createBrokerDraftProposal = authenticatedMutation
  .input({
    assignedBrokerWorkosUserId: v.optional(v.string()),
    capitalSource: v.optional(proposalCapitalSourceInput),
    buildName: v.optional(v.string()),
    location: v.optional(v.string()),
    locationLatitude: v.optional(v.number()),
    locationLongitude: v.optional(v.number()),
    locationPlaceId: v.optional(v.string()),
    proposedStartDate: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("buildProposals"))
  .handler(async (ctx, args) => {
    if (
      (args.locationLatitude === undefined) !==
      (args.locationLongitude === undefined)
    ) {
      throw new Error("Latitude and longitude must be provided together.");
    }
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    const assignedBrokerWorkosUserId =
      args.assignedBrokerWorkosUserId ??
      (await requireDefaultBrokerMember(ctx, auth.brokerage)).workosUserId;
    await requireEligibleBrokerMember(ctx, {
      workosOrganizationId: auth.brokerage.workosOrganizationId,
      workosUserId: assignedBrokerWorkosUserId,
    });

    const now = Date.now();
    const proposalId = await ctx.db.insert("buildProposals", {
      brokerageId: auth.brokerage._id,
      assignedBrokerWorkosUserId,
      borrowerCoPayBps: 2000,
      borrowerCoPayCents: 0,
      borrowerStartingCashCents: 0,
      borrowerWorkingCapitalLimitCents: 0,
      buildName: args.buildName?.trim() || "Unassigned broker draft",
      capitalSource: args.capitalSource ?? "internal",
      createdAt: now,
      createdByWorkosUserId: auth.subject,
      interestAnnualBps: 925,
      lenderDrawPolicyLimitCents: 0,
      location: args.location?.trim() || "Unassigned site",
      ...(args.locationLatitude === undefined
        ? {}
        : {
            locationLatitude: args.locationLatitude,
            locationLongitude: args.locationLongitude,
          }),
      ...(args.locationPlaceId?.trim()
        ? { locationPlaceId: args.locationPlaceId.trim() }
        : {}),
      organizationId: args.workosOrganizationId,
      ...(args.proposedStartDate === undefined
        ? {}
        : {
            proposedStartDate: normalizeIsoDateOnly(
              args.proposedStartDate,
              "proposedStartDate",
            ),
          }),
      reviewOutcome: "none",
      status: "draft",
      totalBudgetCents: 0,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await upsertKanbanCard(ctx, proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "createBrokerDraftProposal",
      eventType: "proposal.created",
      newState: JSON.stringify({
        assignedBrokerWorkosUserId,
        assignment: "unassigned",
        status: "draft",
      }),
      proposalId,
    });
    return proposalId;
  })
  .public();

export const saveDraftProposalPackage = authenticatedMutation
  .input({
    borrowerCoPayBps: v.number(),
    borrowerStartingCashCents: v.optional(v.number()),
    // Deprecated compatibility input for clients deployed before the cutover.
    borrowerWorkingCapitalLimitCents: v.optional(v.number()),
    buildName: v.optional(v.string()),
    capitalSource: v.optional(proposalCapitalSourceInput),
    contractorAssignments: v.optional(
      v.array(proposalDraftContractorAssignmentInput),
    ),
    costItems: v.optional(v.array(proposalDraftCostItemInput)),
    documents: v.optional(v.array(documentInput)),
    draws: v.optional(v.array(proposalDraftDrawInput)),
    lenderDrawPolicyLimitCents: v.number(),
    location: v.optional(v.string()),
    milestones: v.array(milestoneInput),
    proposalId: v.id("buildProposals"),
    proposedStartDate: v.optional(v.string()),
    templateId: v.optional(v.id("proposalTemplates")),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      warnings: v.array(v.string()),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    if (auth.proposal.status !== "draft") {
      throw new Error("Only draft proposals can be edited.");
    }
    const borrowerStartingCashCents =
      args.borrowerStartingCashCents ?? args.borrowerWorkingCapitalLimitCents;
    if (
      borrowerStartingCashCents === undefined ||
      !Number.isFinite(borrowerStartingCashCents) ||
      borrowerStartingCashCents < 0
    ) {
      throw new Error("Borrower starting cash must be a non-negative amount.");
    }
    const normalizedBorrowerStartingCashCents = Math.round(
      borrowerStartingCashCents,
    );
    if (!isBackoffice(auth.roles)) {
      await assertBuilderOwnership(
        ctx,
        assignedBuilderProfileIdOrThrow(auth.proposal),
        auth.subject,
      );
    }
    if (args.milestones.length === 0) {
      throw new Error("At least one milestone is required.");
    }
    if (args.milestones.length > MAX_PROPOSAL_MILESTONES) {
      throw new Error(`A proposal supports at most ${MAX_PROPOSAL_MILESTONES} milestones.`);
    }
    if (
      args.milestones.some(
        (milestone) => milestone.dependencyKeys.length > MAX_PROPOSAL_MILESTONES,
      )
    ) {
      throw new Error(
        `A milestone supports at most ${MAX_PROPOSAL_MILESTONES} dependencies.`,
      );
    }
    if (args.borrowerCoPayBps < 0 || args.borrowerCoPayBps > 10_000) {
      throw new Error(
        "Proposal capital share must be between 0 and 10000 bps.",
      );
    }
    const draftWarnings: string[] = [];
    const lenderFacilityCents = Math.max(
      0,
      Math.round(args.lenderDrawPolicyLimitCents),
    );
    const plannedDrawsCents = (args.draws ?? []).reduce(
      (total, draw) => total + Math.max(0, Math.round(draw.amountCents)),
      0,
    );
    // Draft generation should warn, not hard-fail: template draw shares can
    // temporarily disagree with facility / completed-work eligibility while
    // the borrower is still shaping the schedule.
    if (plannedDrawsCents > lenderFacilityCents) {
      draftWarnings.push(
        "Planned draws exceed the lender facility. Revise the draw schedule or obtain an approved facility change.",
      );
    }
    const milestoneByKey = new Map(
      args.milestones.map((milestone) => [milestone.key, milestone]),
    );
    const additiveCostCentsByMilestoneKey = new Map<string, number>();
    for (const costItem of args.costItems ?? []) {
      if (
        normalizeCostItemBudgetTreatment(costItem.budgetTreatment) !== "add"
      ) {
        continue;
      }
      const itemTotalCents = Math.round(
        normalizeCostItemCost(costItem.costCents) *
          normalizeCostItemQuantity(costItem.quantity),
      );
      additiveCostCentsByMilestoneKey.set(
        costItem.milestoneKey,
        (additiveCostCentsByMilestoneKey.get(costItem.milestoneKey) ?? 0) +
          itemTotalCents,
      );
    }
    if (
      (args.draws ?? []).some((draw) => {
        const milestone = draw.milestoneKey
          ? milestoneByKey.get(draw.milestoneKey)
          : undefined;
        return milestone !== undefined && draw.timingDay < milestone.dayEnd;
      })
    ) {
      draftWarnings.push(
        "Planned reimbursements are scheduled before their milestone is complete.",
      );
    }
    let cumulativePlannedDrawsCents = 0;
    for (const draw of [...(args.draws ?? [])].sort(
      (left, right) =>
        left.timingDay - right.timingDay ||
        (left.order ?? 0) - (right.order ?? 0) ||
        left.drawKey.localeCompare(right.drawKey),
    )) {
      cumulativePlannedDrawsCents += Math.max(0, Math.round(draw.amountCents));
      const cumulativeEligibleCents = args.milestones.reduce(
        (total, milestone) =>
          milestone.dayEnd <= draw.timingDay
            ? total +
              calculateDrawAvailability(
                milestone.budgetCents +
                  (additiveCostCentsByMilestoneKey.get(milestone.key) ?? 0),
                args.borrowerCoPayBps,
              )
            : total,
        0,
      );
      if (cumulativePlannedDrawsCents > cumulativeEligibleCents) {
        draftWarnings.push(
          "Planned draws exceed cumulative completed-work eligibility.",
        );
        break;
      }
    }

    const now = Date.now();
    const retainedPlanKeys = args.milestones.map((milestone) => ({
      milestoneKey: milestone.key,
      submilestoneKeys: milestone.submilestones.map(
        (submilestone) => submilestone.key,
      ),
    }));
    await deleteProposalPlanChildren(ctx, args.proposalId, {
      preserveCanonicalLineage: true,
      retainedPlanKeys,
    });
    const planRows = await insertDraftProposalPlanRows(ctx, {
      auth,
      borrowerCoPayBps: args.borrowerCoPayBps,
      draws: args.draws,
      lenderDrawPolicyLimitCents: args.lenderDrawPolicyLimitCents,
      milestones: args.milestones,
      now,
      proposalId: args.proposalId,
      workosOrganizationId: args.workosOrganizationId,
    });
    const costDeltaCents = await insertDraftProposalCostItems(ctx, {
      auth,
      borrowerCoPayBps: args.borrowerCoPayBps,
      costItems: args.costItems ?? [],
      now,
      planRows,
      proposalId: args.proposalId,
      workosOrganizationId: args.workosOrganizationId,
    });
    const contractorMilestoneAssignmentCount =
      await insertDraftProposalContractorAssignments(ctx, {
        auth,
        contractorAssignments: args.contractorAssignments ?? [],
        now,
        planRows,
        proposalId: args.proposalId,
        workosOrganizationId: args.workosOrganizationId,
      });
    const totalBudgetCents = planRows.totalBudgetCents + costDeltaCents;

    if (args.documents !== undefined) {
      const documents = await collectByIndex(
        ctx,
        "proposalDocuments",
        "by_proposal",
        args.proposalId,
      );
      for (const document of documents) {
        await ctx.db.delete(document._id);
      }
      for (const document of args.documents) {
        await ctx.db.insert("proposalDocuments", {
          brokerageId: auth.brokerage._id,
          createdAt: now,
          documentType: document.documentType,
          fileName: document.fileName,
          mimeType: document.mimeType,
          organizationId: args.workosOrganizationId,
          proposalId: args.proposalId,
          sizeBytes: document.sizeBytes,
          status: "uploaded",
          storageId: document.storageId,
          updatedAt: now,
          uploadedByWorkosUserId: auth.subject,
        });
      }
    }

    await ctx.db.patch(args.proposalId, {
      borrowerCoPayBps: args.borrowerCoPayBps,
      borrowerCoPayCents: Math.round(
        (totalBudgetCents * args.borrowerCoPayBps) / 10_000,
      ),
      borrowerStartingCashCents: normalizedBorrowerStartingCashCents,
      // Dual-write until the legacy field is narrowed out after backfill.
      borrowerWorkingCapitalLimitCents: normalizedBorrowerStartingCashCents,
      buildName: args.buildName?.trim() || auth.proposal.buildName,
      ...(args.capitalSource === undefined
        ? {}
        : { capitalSource: args.capitalSource }),
      lenderDrawPolicyLimitCents: args.lenderDrawPolicyLimitCents,
      location: args.location?.trim() || auth.proposal.location,
      ...(args.proposedStartDate === undefined
        ? {}
        : {
            proposedStartDate: normalizeIsoDateOnly(
              args.proposedStartDate,
              "Proposed start date",
            ),
          }),
      templateId: args.templateId,
      totalBudgetCents,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await upsertKanbanCard(ctx, args.proposalId, now);
    if ((args.costItems?.length ?? 0) > 0) {
      await writeProposalEvent(ctx, {
        auth,
        command: "saveDraftProposalPackage",
        eventType: "proposal.cost_items.saved",
        newState: JSON.stringify({
          costItemCount: args.costItems?.length ?? 0,
        }),
        proposalId: args.proposalId,
      });
    }
    if (contractorMilestoneAssignmentCount > 0) {
      await writeProposalEvent(ctx, {
        auth,
        command: "saveDraftProposalPackage",
        eventType: "proposal.contractor.milestone_assignments_saved",
        newState: JSON.stringify({
          contractorAssignmentCount: args.contractorAssignments?.length ?? 0,
          milestoneAssignmentCount: contractorMilestoneAssignmentCount,
        }),
        proposalId: args.proposalId,
      });
    }
    if (draftWarnings.length > 0) {
      await writeProposalEvent(ctx, {
        auth,
        command: "saveDraftProposalPackage",
        eventType: "proposal.draft.schedule_warnings",
        newState: JSON.stringify({
          lenderFacilityCents,
          plannedDrawsCents,
          warningCount: draftWarnings.length,
        }),
        proposalId: args.proposalId,
        warnings: draftWarnings,
      });
    }
    return { warnings: draftWarnings };
  })
  .public();
