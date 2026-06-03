import { v } from "convex/values";

import {
  type AuthorizedViewer,
  authenticatedMutation,
  authenticatedQuery,
  normalizeRoleSlugs,
  type RoleSlug,
} from "./authz";
import {
  coerceSiteVisitGuidanceInput,
  defaultSiteVisitGuidance,
  guidanceHtmlExceedsMaxLength,
  guidanceLinesToHtml,
  normalizeSiteVisitGuidance,
  SITE_VISIT_GUIDANCE_HTML_MAX_LENGTH,
  type SiteVisitGuidance,
} from "./demo_site_visit_guidance";
import {
  normalizeSiteVisitReportNotes,
  siteVisitReportNotesPlainText,
} from "./demo_site_visit_tokens";
import { publicMutation, publicQuery } from "./fluent";
import {
  assertProposalCollaborationEditAllowed,
  generateShareToken,
  hasActiveCollaborationParticipant,
  pushProposalPlanningSnapshot,
  shareTokenHash,
} from "./proposal_collaboration_model";

type ProductionSettingsSiteVisitGuidanceInput = Parameters<
  typeof coerceSiteVisitGuidanceInput
>[0];

import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const PROPOSAL_COLUMNS = ["draft", "submitted", "approved", "closed"] as const;
const BACKOFFICE_ROLES = [
  "admin",
  "principle-broker",
  "broker",
  "broker-staff",
] as const satisfies readonly RoleSlug[];
const APPROVER_ROLES = ["admin", "principle-broker"] as const;
const BUILDER_ROLES = ["builder", "builder-staff"] as const;
const DEFAULT_WORKFLOW_RULE_KEY = "proposal-foundation-v1";
const FAIRLEND_BROKERAGE_NAME = "FairLendBrokerage";
const FAIRLEND_WORKOS_ORGANIZATION_ID = "org_01KSNW6JHW9P9YS41DZX1YHHGS";
const FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID =
  "user_01KR207FRFHQT46EV9N538XBF3";
const TOTAL_BPS = 10_000;
const PRODUCTION_SETTINGS_HANDOFF_GAP_DAYS = 5;

const submilestoneInput = v.object({
  budgetCents: v.optional(v.number()),
  durationDays: v.optional(v.number()),
  key: v.string(),
  name: v.string(),
  order: v.number(),
  startDay: v.optional(v.number()),
});

const milestoneInput = v.object({
  budgetCents: v.number(),
  dayEnd: v.number(),
  dayStart: v.number(),
  dependencyKeys: v.array(v.string()),
  durationDays: v.number(),
  icon: v.optional(v.string()),
  key: v.string(),
  name: v.string(),
  order: v.number(),
  submilestones: v.array(submilestoneInput),
});

const documentInput = v.object({
  documentType: v.union(
    v.literal("permit"),
    v.literal("budget"),
    v.literal("plan"),
    v.literal("supporting"),
  ),
  fileName: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  storageId: v.optional(v.id("_storage")),
});

const proposalDraftDrawInput = v.object({
  amountCents: v.number(),
  drawKey: v.string(),
  label: v.string(),
  milestoneKey: v.optional(v.string()),
  order: v.optional(v.number()),
  timingDay: v.number(),
});

const productionSettingsSiteVisitGuidanceFieldInput = v.union(
  v.string(),
  v.array(v.string()),
);

const productionSettingsSiteVisitGuidanceInput = v.object({
  cameraAngles: productionSettingsSiteVisitGuidanceFieldInput,
  whatToVerify: productionSettingsSiteVisitGuidanceFieldInput,
});

const productionSettingsSubmilestoneInput = v.object({
  description: v.string(),
  durationDays: v.number(),
  name: v.string(),
  order: v.number(),
  percentageBps: v.number(),
  submilestoneKey: v.string(),
});

const productionSettingsMilestoneInput = v.object({
  dependencyKeys: v.array(v.string()),
  durationDays: v.number(),
  icon: v.string(),
  included: v.boolean(),
  milestoneKey: v.string(),
  name: v.string(),
  order: v.number(),
  percentageBps: v.number(),
  siteVisitGuidance: v.optional(productionSettingsSiteVisitGuidanceInput),
  submilestones: v.array(productionSettingsSubmilestoneInput),
  type: v.string(),
});

const productionSettingsScenarioDrawInput = v.object({
  amountBps: v.number(),
  drawKey: v.string(),
  label: v.string(),
  order: v.number(),
  reviewNote: v.string(),
  timingDay: v.number(),
});

const productionSettingsScenarioInput = v.object({
  description: v.string(),
  draws: v.array(productionSettingsScenarioDrawInput),
  isActive: v.boolean(),
  isDefault: v.boolean(),
  name: v.string(),
  scenarioKey: v.string(),
  sortOrder: v.number(),
});

const evidenceAssetInput = v.object({
  contractorIds: v.optional(v.array(v.id("contractorProfiles"))),
  evidenceKey: v.string(),
  fileName: v.string(),
  label: v.string(),
  locationVerified: v.optional(v.boolean()),
  milestoneKey: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  source: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  submilestoneKey: v.optional(v.string()),
  tag: v.string(),
});

const contractorKindInput = v.union(
  v.literal("company"),
  v.literal("individual"),
);

const contractorPayRateUnitInput = v.union(
  v.literal("hour"),
  v.literal("day"),
  v.literal("fixed"),
);

const contractorCapabilityInput = v.object({
  capabilityKey: v.string(),
  label: v.string(),
  milestoneArchetypeKey: v.optional(v.string()),
  notes: v.optional(v.string()),
  trade: v.optional(v.string()),
});

const contractorEquipmentInput = v.object({
  equipmentKey: v.string(),
  name: v.string(),
  notes: v.optional(v.string()),
  quantity: v.number(),
});

const contractorAvailabilityWindowInput = v.object({
  dayOfWeek: v.number(),
  effectiveEndDate: v.optional(v.string()),
  effectiveStartDate: v.optional(v.string()),
  endMinute: v.number(),
  startMinute: v.number(),
  timezone: v.string(),
});

const contractorQualityRatingSourceInput = v.union(
  v.literal("builder_evidence"),
  v.literal("site_visit"),
  v.literal("backoffice"),
);

const contractorQualityRatingInput = v.object({
  contractorId: v.id("contractorProfiles"),
  milestoneKey: v.optional(v.string()),
  note: v.optional(v.string()),
  rating: v.number(),
  sourceEvidenceKey: v.optional(v.string()),
  sourceVisitId: v.optional(v.string()),
  submilestoneKey: v.optional(v.string()),
});

const contractorIdentityLinkStatusInput = v.union(
  v.literal("suggested"),
  v.literal("verified"),
  v.literal("rejected"),
);

const activeBuildNoteVisibility = v.union(
  v.literal("internal"),
  v.literal("public"),
);

const timelineCapitalEventKind = v.union(
  v.literal("cost"),
  v.literal("cashInfusion"),
);

const timelineModificationRequestType = v.union(
  v.literal("createMilestone"),
  v.literal("deleteMilestone"),
  v.literal("updateMilestoneBudget"),
);

const activeBuildFacilityChangeRequestType = v.union(
  v.literal("principalIncrease"),
  v.literal("paybackExtension"),
);

const productionTimelineMilestoneInput = v.object({
  budgetCents: v.number(),
  dayEnd: v.number(),
  dayStart: v.number(),
  dependencyKeys: v.optional(v.array(v.string())),
  drawAvailabilityCents: v.optional(v.number()),
  drawKey: v.optional(v.string()),
  durationDays: v.number(),
  evidenceState: v.string(),
  icon: v.optional(v.string()),
  lane: v.optional(v.number()),
  markerLabel: v.optional(v.string()),
  milestoneKey: v.string(),
  name: v.string(),
  order: v.number(),
  policyState: v.string(),
  status: v.optional(v.string()),
  submilestones: v.optional(v.array(submilestoneInput)),
  tone: v.optional(v.string()),
  x: v.number(),
});

const productionCostItemType = v.union(
  v.literal("material"),
  v.literal("equipment"),
);

const productionCostItemCreateInput = {
  costCents: v.number(),
  description: v.optional(v.string()),
  itemType: productionCostItemType,
  milestoneKey: v.string(),
  quantity: v.number(),
  reason: v.optional(v.string()),
  relevantSubmilestoneKeys: v.array(v.string()),
  supplier: v.optional(v.string()),
  title: v.string(),
};

const proposalDraftCostItemInput = v.object(productionCostItemCreateInput);

const proposalDraftContractorAssignmentInput = v.object({
  contractorId: v.optional(v.id("contractorProfiles")),
  contractorName: v.string(),
  estimatedCostCents: v.optional(v.number()),
  estimatedHours: v.optional(v.number()),
  milestoneKey: v.string(),
  role: v.string(),
  submilestoneKeys: v.array(v.string()),
});

const productionCostItemUpdateInput = {
  costCents: v.optional(v.number()),
  description: v.optional(v.string()),
  itemId: v.id("proposalCostItems"),
  itemType: v.optional(productionCostItemType),
  milestoneKey: v.optional(v.string()),
  quantity: v.optional(v.number()),
  reason: v.optional(v.string()),
  relevantSubmilestoneKeys: v.optional(v.array(v.string())),
  supplier: v.optional(v.string()),
  title: v.optional(v.string()),
};

const productionBuildCostItemUpdateInput = {
  costCents: v.optional(v.number()),
  description: v.optional(v.string()),
  itemId: v.id("buildCostItems"),
  itemType: v.optional(productionCostItemType),
  milestoneKey: v.optional(v.string()),
  quantity: v.optional(v.number()),
  reason: v.optional(v.string()),
  relevantSubmilestoneKeys: v.optional(v.array(v.string())),
  supplier: v.optional(v.string()),
  title: v.optional(v.string()),
};

export const dev_seedProductionFoundation = authenticatedMutation
  .input({ workosOrganizationId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    requireAnyRole(ctx.viewer.roles, ["admin"]);
    const now = Date.now();

    await upsertWorkosProjection(ctx, args.workosOrganizationId, now);
    const isFairLendBootstrapOrg =
      args.workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID;
    await upsertWorkosUserAndMembership(ctx, {
      email: ctx.viewer.email ?? "admin@example.com",
      now,
      roleSlugs: isFairLendBootstrapOrg
        ? ["admin", "principle-broker"]
        : ["admin"],
      workosOrganizationId: args.workosOrganizationId,
      workosUserId: isFairLendBootstrapOrg
        ? FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID
        : ctx.viewer.subject,
    });
    await upsertWorkosUserAndMembership(ctx, {
      email: "builder@example.com",
      now,
      roleSlugs: ["builder"],
      workosOrganizationId: args.workosOrganizationId,
      workosUserId: "user_builder",
    });
    await upsertWorkosUserAndMembership(ctx, {
      email: "broker@example.com",
      now,
      roleSlugs: ["broker"],
      workosOrganizationId: args.workosOrganizationId,
      workosUserId: "user_broker",
    });

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
  .public();

export const seedProductionDefaultsToProd = authenticatedMutation
  .input({ workosOrganizationId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    requireAnyRole(ctx.viewer.roles, ["admin"]);
    const now = Date.now();

    await upsertWorkosProjection(ctx, args.workosOrganizationId, now);
    await upsertWorkosUserAndMembership(ctx, {
      email: ctx.viewer.email ?? "admin@example.com",
      now,
      roleSlugs: ["admin"],
      workosOrganizationId: args.workosOrganizationId,
      workosUserId: ctx.viewer.subject,
    });
    const brokerageId = await ensureBrokerage(ctx, {
      displayName: FAIRLEND_BROKERAGE_NAME,
      legalName: FAIRLEND_BROKERAGE_NAME,
      now,
      principalBrokerWorkosUserId: ctx.viewer.subject,
      workosOrganizationId: args.workosOrganizationId,
    });
    const templateResult = await seedProductionDefaultTemplates(ctx, {
      brokerageId,
      now,
      organizationId: args.workosOrganizationId,
    });
    const workflowRuleId = await ensureWorkflowRule(ctx, {
      brokerageId,
      now,
      organizationId: args.workosOrganizationId,
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

    await upsertWorkosProjection(ctx, args.workosOrganizationId, now);
    const isFairLendBootstrapOrg =
      args.workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID;
    await upsertWorkosUserAndMembership(ctx, {
      email: ctx.viewer.email ?? "admin@example.com",
      now,
      roleSlugs: isFairLendBootstrapOrg
        ? ["admin", "principle-broker"]
        : ["admin"],
      workosOrganizationId: args.workosOrganizationId,
      workosUserId: isFairLendBootstrapOrg
        ? FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID
        : ctx.viewer.subject,
    });
    await upsertWorkosUserAndMembership(ctx, {
      email: "builder@example.com",
      now,
      roleSlugs: ["builder"],
      workosOrganizationId: args.workosOrganizationId,
      workosUserId: "user_builder",
    });
    await upsertWorkosUserAndMembership(ctx, {
      email: "broker@example.com",
      now,
      roleSlugs: ["broker"],
      workosOrganizationId: args.workosOrganizationId,
      workosUserId: "user_broker",
    });

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
  .public();

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
    if (auth.proposal.status !== "draft") {
      throw new Error("Only draft proposals can receive document uploads.");
    }
    if (!isBackoffice(auth.roles)) {
      await assertBuilderOwnership(
        ctx,
        assignedBuilderProfileIdOrThrow(auth.proposal),
        auth.subject,
      );
    }
    return await ctx.storage.generateUploadUrl();
  })
  .public();

export const createDraftProposal = authenticatedMutation
  .input({
    brokerageId: v.id("brokerages"),
    builderProfileId: v.id("builderProfiles"),
    buildName: v.string(),
    location: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("buildProposals"))
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    await assertBuilderProfileScope(
      ctx,
      args.builderProfileId,
      auth.brokerage._id,
    );
    if (!isBackoffice(auth.roles)) {
      await assertBuilderOwnership(ctx, args.builderProfileId, auth.subject);
      requireAnyRole(auth.roles, BUILDER_ROLES);
    }

    const now = Date.now();
    const proposalId = await ctx.db.insert("buildProposals", {
      brokerageId: auth.brokerage._id,
      ...(isBackoffice(auth.roles)
        ? { assignedBrokerWorkosUserId: auth.subject }
        : {}),
      borrowerCoPayBps: 2000,
      borrowerCoPayCents: 0,
      borrowerWorkingCapitalLimitCents: 0,
      buildName: args.buildName,
      builderProfileId: args.builderProfileId,
      createdAt: now,
      createdByWorkosUserId: auth.subject,
      interestAnnualBps: 925,
      lenderDrawPolicyLimitCents: 0,
      location: args.location,
      organizationId: args.workosOrganizationId,
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
      newState: "draft",
      proposalId,
    });
    return proposalId;
  })
  .public();

export const createBrokerDraftProposal = authenticatedMutation
  .input({
    buildName: v.optional(v.string()),
    location: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("buildProposals"))
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);

    const now = Date.now();
    const proposalId = await ctx.db.insert("buildProposals", {
      brokerageId: auth.brokerage._id,
      assignedBrokerWorkosUserId: auth.subject,
      borrowerCoPayBps: 2000,
      borrowerCoPayCents: 0,
      borrowerWorkingCapitalLimitCents: 0,
      buildName: args.buildName?.trim() || "Unassigned broker draft",
      createdAt: now,
      createdByWorkosUserId: auth.subject,
      interestAnnualBps: 925,
      lenderDrawPolicyLimitCents: 0,
      location: args.location?.trim() || "Unassigned site",
      organizationId: args.workosOrganizationId,
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
    borrowerWorkingCapitalLimitCents: v.number(),
    buildName: v.optional(v.string()),
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
    templateId: v.optional(v.id("proposalTemplates")),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    if (auth.proposal.status !== "draft") {
      throw new Error("Only draft proposals can be edited.");
    }
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
    if (args.borrowerCoPayBps < 0 || args.borrowerCoPayBps > 10_000) {
      throw new Error(
        "Proposal capital share must be between 0 and 10000 bps.",
      );
    }

    const now = Date.now();
    await deleteProposalPlanChildren(ctx, args.proposalId);
    const planRows = await insertDraftProposalPlanRows(ctx, {
      auth,
      borrowerCoPayBps: args.borrowerCoPayBps,
      draws: args.draws,
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
      borrowerWorkingCapitalLimitCents: args.borrowerWorkingCapitalLimitCents,
      buildName: args.buildName?.trim() || auth.proposal.buildName,
      lenderDrawPolicyLimitCents: args.lenderDrawPolicyLimitCents,
      location: args.location?.trim() || auth.proposal.location,
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
    return null;
  })
  .public();

interface DraftProposalSaveAuth {
  brokerage: Doc<"brokerages">;
  proposal: Doc<"buildProposals">;
  roles: RoleSlug[];
  subject: string;
}

interface DraftProposalSubmilestoneInput {
  budgetCents?: number;
  durationDays?: number;
  key: string;
  name: string;
  order: number;
  startDay?: number;
}

interface DraftProposalMilestoneInput {
  budgetCents: number;
  dayEnd: number;
  dayStart: number;
  dependencyKeys: string[];
  durationDays: number;
  icon?: string;
  key: string;
  name: string;
  order: number;
  submilestones: DraftProposalSubmilestoneInput[];
}

type ProductionSubmilestoneScheduleInput = {
  budgetCents?: number;
  durationDays?: number;
  key: string;
  name: string;
  order: number;
  startDay?: number;
};

function normalizeProductionMilestoneSchedule<
  T extends {
    dayEnd?: number;
    dayStart?: number;
    durationDays?: number;
    submilestones?: ProductionSubmilestoneScheduleInput[];
  },
>(milestone: T) {
  const dayStart = Math.max(0, Math.round(milestone.dayStart ?? 0));
  const fallbackEnd = Math.max(
    dayStart,
    Math.round(
      milestone.dayEnd ?? dayStart + Math.max(1, milestone.durationDays ?? 1),
    ),
  );
  const requestedDurationDays = Math.max(
    1,
    Math.round(milestone.durationDays ?? fallbackEnd - dayStart),
  );
  let cursor = dayStart;
  let largestSubmilestoneEnd = dayStart;
  const submilestones = [...(milestone.submilestones ?? [])]
    .sort(
      (left, right) =>
        left.order - right.order || left.key.localeCompare(right.key),
    )
    .map((submilestone, index) => {
      const startDay = Math.max(0, Math.round(submilestone.startDay ?? cursor));
      const durationDays = Math.max(
        1,
        Math.round(submilestone.durationDays ?? 1),
      );
      const endDay = startDay + durationDays;
      cursor = endDay;
      largestSubmilestoneEnd = Math.max(largestSubmilestoneEnd, endDay);
      return {
        ...submilestone,
        durationDays,
        order: Math.max(1, Math.round(submilestone.order ?? index + 1)),
        startDay,
      };
    });
  const durationDays = Math.max(
    requestedDurationDays,
    largestSubmilestoneEnd - dayStart,
  );
  return {
    dayEnd: dayStart + durationDays,
    dayStart,
    durationDays,
    submilestones,
  };
}

interface DraftProposalDrawInput {
  amountCents: number;
  drawKey: string;
  label: string;
  milestoneKey?: string;
  order?: number;
  timingDay: number;
}

interface DraftProposalCostItemInput {
  costCents: number;
  description?: string;
  itemType: "equipment" | "material";
  milestoneKey: string;
  quantity: number;
  relevantSubmilestoneKeys: string[];
  supplier?: string;
  title: string;
}

interface DraftProposalContractorAssignmentInput {
  contractorId?: Id<"contractorProfiles">;
  contractorName: string;
  estimatedCostCents?: number;
  estimatedHours?: number;
  milestoneKey: string;
  role: string;
  submilestoneKeys: string[];
}

interface DraftProposalSavedMilestone {
  _id: Id<"proposalMilestones">;
  budgetCents: number;
  drawAvailabilityCents: number;
  key: string;
}

interface DraftProposalPlanRows {
  drawIdByMilestoneKey: Map<string, Id<"proposalDrawScheduleRows">>;
  milestoneByKey: Map<string, DraftProposalSavedMilestone>;
  submilestoneByMilestoneAndKey: Map<string, Id<"proposalSubmilestones">>;
  totalBudgetCents: number;
}

async function insertDraftProposalPlanRows(
  ctx: MutationCtx,
  input: {
    auth: DraftProposalSaveAuth;
    borrowerCoPayBps: number;
    draws?: DraftProposalDrawInput[];
    milestones: DraftProposalMilestoneInput[];
    now: number;
    proposalId: Id<"buildProposals">;
    workosOrganizationId: string;
  },
): Promise<DraftProposalPlanRows> {
  const planRows: DraftProposalPlanRows = {
    drawIdByMilestoneKey: new Map(),
    milestoneByKey: new Map(),
    submilestoneByMilestoneAndKey: new Map(),
    totalBudgetCents: 0,
  };

  for (const rawRow of [...input.milestones].sort(
    (a, b) => a.order - b.order,
  )) {
    const schedule = normalizeProductionMilestoneSchedule(rawRow);
    const row = {
      ...rawRow,
      ...schedule,
    };
    const drawAvailabilityCents = calculateDrawAvailability(
      row.budgetCents,
      input.borrowerCoPayBps,
    );
    const milestoneId = await insertDraftProposalMilestone(ctx, input, {
      drawAvailabilityCents,
      row,
    });
    planRows.totalBudgetCents += row.budgetCents;
    planRows.milestoneByKey.set(row.key, {
      _id: milestoneId,
      budgetCents: row.budgetCents,
      drawAvailabilityCents,
      key: row.key,
    });
    for (const submilestone of row.submilestones) {
      const submilestoneId = await insertDraftProposalSubmilestone(ctx, input, {
        milestoneId,
        row,
        submilestone,
      });
      planRows.submilestoneByMilestoneAndKey.set(
        `${row.key}:${submilestone.key}`,
        submilestoneId,
      );
    }
    if (input.draws === undefined) {
      const drawId = await insertDraftProposalMilestoneDraw(ctx, input, {
        drawAvailabilityCents,
        milestoneId,
        row,
      });
      planRows.drawIdByMilestoneKey.set(row.key, drawId);
    }
  }

  if (input.draws !== undefined) {
    await insertDraftProposalDrawRows(ctx, input, planRows);
  }

  return planRows;
}

async function insertDraftProposalMilestone(
  ctx: MutationCtx,
  input: {
    auth: DraftProposalSaveAuth;
    now: number;
    proposalId: Id<"buildProposals">;
    workosOrganizationId: string;
  },
  milestone: {
    drawAvailabilityCents: number;
    row: DraftProposalMilestoneInput;
  },
) {
  return await ctx.db.insert("proposalMilestones", {
    brokerageId: input.auth.brokerage._id,
    budgetCents: milestone.row.budgetCents,
    createdAt: input.now,
    dayEnd: milestone.row.dayEnd,
    dayStart: milestone.row.dayStart,
    dependencyKeys: milestone.row.dependencyKeys,
    drawAvailabilityCents: milestone.drawAvailabilityCents,
    durationDays: milestone.row.durationDays,
    icon: milestone.row.icon,
    key: milestone.row.key,
    name: milestone.row.name,
    order: milestone.row.order,
    organizationId: input.workosOrganizationId,
    proposalId: input.proposalId,
    updatedAt: input.now,
  });
}

async function insertDraftProposalSubmilestone(
  ctx: MutationCtx,
  input: {
    auth: DraftProposalSaveAuth;
    now: number;
    proposalId: Id<"buildProposals">;
    workosOrganizationId: string;
  },
  milestone: {
    milestoneId: Id<"proposalMilestones">;
    row: DraftProposalMilestoneInput;
    submilestone: DraftProposalSubmilestoneInput;
  },
) {
  return await ctx.db.insert("proposalSubmilestones", {
    brokerageId: input.auth.brokerage._id,
    budgetCents: milestone.submilestone.budgetCents,
    createdAt: input.now,
    durationDays: milestone.submilestone.durationDays,
    key: milestone.submilestone.key,
    milestoneKey: milestone.row.key,
    name: milestone.submilestone.name,
    order: milestone.submilestone.order,
    organizationId: input.workosOrganizationId,
    proposalId: input.proposalId,
    proposalMilestoneId: milestone.milestoneId,
    startDay: milestone.submilestone.startDay,
    updatedAt: input.now,
  });
}

async function insertDraftProposalMilestoneDraw(
  ctx: MutationCtx,
  input: {
    auth: DraftProposalSaveAuth;
    now: number;
    proposalId: Id<"buildProposals">;
    workosOrganizationId: string;
  },
  milestone: {
    drawAvailabilityCents: number;
    milestoneId: Id<"proposalMilestones">;
    row: DraftProposalMilestoneInput;
  },
) {
  return await ctx.db.insert("proposalDrawScheduleRows", {
    amountCents: milestone.drawAvailabilityCents,
    brokerageId: input.auth.brokerage._id,
    createdAt: input.now,
    drawKey: `draw-${String(milestone.row.order).padStart(2, "0")}`,
    label: `${milestone.row.name} reimbursement draw`,
    milestoneKey: milestone.row.key,
    order: milestone.row.order,
    organizationId: input.workosOrganizationId,
    proposalId: input.proposalId,
    proposalMilestoneId: milestone.milestoneId,
    source: "milestone",
    timingDay: milestone.row.dayEnd,
    updatedAt: input.now,
  });
}

async function insertDraftProposalDrawRows(
  ctx: MutationCtx,
  input: {
    auth: DraftProposalSaveAuth;
    draws?: DraftProposalDrawInput[];
    now: number;
    proposalId: Id<"buildProposals">;
    workosOrganizationId: string;
  },
  planRows: DraftProposalPlanRows,
) {
  const draws = [...(input.draws ?? [])].sort(
    (a, b) =>
      (a.order ?? 0) - (b.order ?? 0) ||
      a.timingDay - b.timingDay ||
      a.drawKey.localeCompare(b.drawKey),
  );
  for (const [index, draw] of draws.entries()) {
    const milestoneKey = draw.milestoneKey?.trim();
    const milestone = milestoneKey
      ? planRows.milestoneByKey.get(milestoneKey)
      : undefined;
    if (milestoneKey && !milestone) {
      throw new Error(
        `Draw ${draw.drawKey} references missing milestone ${milestoneKey}.`,
      );
    }
    const drawId = await ctx.db.insert("proposalDrawScheduleRows", {
      amountCents: Math.max(0, Math.round(draw.amountCents)),
      brokerageId: input.auth.brokerage._id,
      createdAt: input.now,
      drawKey:
        draw.drawKey.trim() || `draw-${String(index + 1).padStart(2, "0")}`,
      label:
        draw.label.trim() ||
        `${milestone?.key ?? `Draw ${index + 1}`} reimbursement draw`,
      milestoneKey: milestone?.key,
      order: draw.order ?? index + 1,
      organizationId: input.workosOrganizationId,
      proposalId: input.proposalId,
      proposalMilestoneId: milestone?._id,
      source: "milestone",
      timingDay: Math.max(0, Math.round(draw.timingDay)),
      updatedAt: input.now,
    });
    if (milestone) {
      planRows.drawIdByMilestoneKey.set(milestone.key, drawId);
    }
  }
}

async function insertDraftProposalCostItems(
  ctx: MutationCtx,
  input: {
    auth: DraftProposalSaveAuth;
    borrowerCoPayBps: number;
    costItems: DraftProposalCostItemInput[];
    now: number;
    planRows: DraftProposalPlanRows;
    proposalId: Id<"buildProposals">;
    workosOrganizationId: string;
  },
) {
  const costDeltaByMilestoneKey = new Map<string, number>();
  for (const costItem of input.costItems) {
    const { milestone, totalCents } = await insertDraftProposalCostItem(
      ctx,
      input,
      costItem,
    );
    costDeltaByMilestoneKey.set(
      milestone.key,
      (costDeltaByMilestoneKey.get(milestone.key) ?? 0) + totalCents,
    );
  }
  return await applyDraftProposalCostItemDeltas(ctx, input, {
    costDeltaByMilestoneKey,
  });
}

async function insertDraftProposalCostItem(
  ctx: MutationCtx,
  input: {
    auth: DraftProposalSaveAuth;
    now: number;
    planRows: DraftProposalPlanRows;
    proposalId: Id<"buildProposals">;
    workosOrganizationId: string;
  },
  costItem: DraftProposalCostItemInput,
) {
  const milestone = getDraftProposalSavedMilestone(
    input.planRows,
    costItem.milestoneKey,
  );
  const relevantSubmilestoneKeys = await validateProposalCostItemSubmilestones(
    ctx,
    milestone,
    costItem.relevantSubmilestoneKeys,
  );
  const costCents = normalizeCostItemCost(costItem.costCents);
  const quantity = normalizeCostItemQuantity(costItem.quantity);
  const title = normalizeRequiredText(costItem.title, "Cost item title");
  const item = {
    brokerageId: input.auth.brokerage._id,
    costCents,
    createdAt: input.now,
    createdByWorkosUserId: input.auth.subject,
    description: normalizeOptionalText(costItem.description),
    itemKey: await nextProposalCostItemKey(
      ctx,
      input.proposalId,
      title,
      input.now,
    ),
    itemType: costItem.itemType,
    milestoneKey: milestone.key,
    organizationId: input.workosOrganizationId,
    proposalId: input.proposalId,
    proposalMilestoneId: milestone._id,
    quantity,
    relevantSubmilestoneKeys,
    supplier: normalizeOptionalText(costItem.supplier),
    title,
    updatedAt: input.now,
    updatedByWorkosUserId: input.auth.subject,
  };
  await ctx.db.insert("proposalCostItems", item);
  return { milestone, totalCents: costItemTotalCents(item) };
}

async function applyDraftProposalCostItemDeltas(
  ctx: MutationCtx,
  input: {
    borrowerCoPayBps: number;
    now: number;
    planRows: DraftProposalPlanRows;
  },
  deltas: {
    costDeltaByMilestoneKey: Map<string, number>;
  },
) {
  let totalDeltaCents = 0;
  for (const [milestoneKey, deltaCents] of deltas.costDeltaByMilestoneKey) {
    if (deltaCents === 0) {
      continue;
    }
    const milestone = getDraftProposalSavedMilestone(
      input.planRows,
      milestoneKey,
    );
    const nextBudgetCents = milestone.budgetCents + deltaCents;
    const nextDrawAvailabilityCents = calculateDrawAvailability(
      nextBudgetCents,
      input.borrowerCoPayBps,
    );
    await ctx.db.patch(milestone._id, {
      budgetCents: nextBudgetCents,
      drawAvailabilityCents: nextDrawAvailabilityCents,
      updatedAt: input.now,
    });
    totalDeltaCents += deltaCents;
  }
  return totalDeltaCents;
}

async function insertDraftProposalContractorAssignments(
  ctx: MutationCtx,
  input: {
    auth: DraftProposalSaveAuth;
    contractorAssignments: DraftProposalContractorAssignmentInput[];
    now: number;
    planRows: DraftProposalPlanRows;
    proposalId: Id<"buildProposals">;
    workosOrganizationId: string;
  },
) {
  let contractorMilestoneAssignmentCount = 0;
  for (const assignment of input.contractorAssignments) {
    contractorMilestoneAssignmentCount +=
      await insertDraftProposalContractorAssignment(ctx, input, assignment);
  }
  return contractorMilestoneAssignmentCount;
}

async function insertDraftProposalContractorAssignment(
  ctx: MutationCtx,
  input: {
    auth: DraftProposalSaveAuth;
    now: number;
    planRows: DraftProposalPlanRows;
    proposalId: Id<"buildProposals">;
    workosOrganizationId: string;
  },
  assignment: DraftProposalContractorAssignmentInput,
) {
  const milestone = getDraftProposalSavedMilestone(
    input.planRows,
    assignment.milestoneKey,
  );
  const role = normalizeOptionalString(assignment.role) ?? "Contractor";
  const contractor = await resolveDraftProposalAssignmentContractor(
    ctx,
    input,
    {
      assignment,
      role,
    },
  );
  const proposalContractorAssignmentId =
    await ensureProposalContractorAssignment(ctx, {
      agreedRateCents: contractor.defaultPayRateCents,
      agreedRateUnit: contractor.defaultPayRateUnit ?? "hour",
      auth: input.auth,
      contractorId: contractor._id,
      proposalId: input.proposalId,
      preserveExistingRole: true,
      role,
      workosOrganizationId: input.workosOrganizationId,
    });
  const targets = resolveDraftProposalAssignmentTargets(input.planRows, {
    assignment,
    milestone,
  });
  const estimatedHours = normalizeOptionalHours(assignment.estimatedHours);
  const estimatedCostCents = normalizeOptionalMoneyCents(
    assignment.estimatedCostCents,
  );
  for (const target of targets) {
    await ctx.db.insert("proposalMilestoneContractorAssignments", {
      assignedAt: input.now,
      assignedByWorkosUserId: input.auth.subject,
      brokerageId: input.auth.brokerage._id,
      contractorId: contractor._id,
      createdAt: input.now,
      estimatedCostCents,
      estimatedHours,
      milestoneKey: milestone.key,
      organizationId: input.workosOrganizationId,
      proposalContractorAssignmentId,
      proposalId: input.proposalId,
      proposalMilestoneId: milestone._id,
      proposalSubmilestoneId: target.id,
      role,
      status: "planned",
      submilestoneKey: target.key,
      updatedAt: input.now,
    });
  }
  return targets.length;
}

async function resolveDraftProposalAssignmentContractor(
  ctx: MutationCtx,
  input: {
    auth: DraftProposalSaveAuth;
    now: number;
    workosOrganizationId: string;
  },
  contractorInput: {
    assignment: DraftProposalContractorAssignmentInput;
    role: string;
  },
) {
  const contractorId = await resolveDraftProposalContractorProfile(ctx, {
    auth: input.auth,
    contractorId: contractorInput.assignment.contractorId,
    contractorName: contractorInput.assignment.contractorName,
    now: input.now,
    role: contractorInput.role,
    workosOrganizationId: input.workosOrganizationId,
  });
  const contractor = await getScopedContractorOrThrow(
    ctx,
    contractorId,
    input.auth.brokerage._id,
  );
  if (contractor.status !== "active") {
    throw new Error("Production contractor is inactive.");
  }
  return contractor;
}

function resolveDraftProposalAssignmentTargets(
  planRows: DraftProposalPlanRows,
  input: {
    assignment: DraftProposalContractorAssignmentInput;
    milestone: DraftProposalSavedMilestone;
  },
) {
  const submilestoneKeys = [
    ...new Set(
      input.assignment.submilestoneKeys
        .map((key) => key.trim())
        .filter((key) => key.length > 0),
    ),
  ];
  const invalidSubmilestoneKeys = submilestoneKeys.filter(
    (key) =>
      !planRows.submilestoneByMilestoneAndKey.has(
        `${input.milestone.key}:${key}`,
      ),
  );
  if (invalidSubmilestoneKeys.length > 0) {
    throw new Error(
      `Contractor sub-milestones must belong to ${input.milestone.key}: ${invalidSubmilestoneKeys.join(", ")}.`,
    );
  }
  if (submilestoneKeys.length === 0) {
    return [{ id: undefined, key: undefined }];
  }
  return submilestoneKeys.map((key) => ({
    id: planRows.submilestoneByMilestoneAndKey.get(
      `${input.milestone.key}:${key}`,
    ),
    key,
  }));
}

function getDraftProposalSavedMilestone(
  planRows: DraftProposalPlanRows,
  milestoneKey: string,
) {
  const milestone = planRows.milestoneByKey.get(milestoneKey);
  if (!milestone) {
    throw new Error(`Production milestone not found: ${milestoneKey}`);
  }
  return milestone;
}

export const submitProposal = authenticatedMutation
  .input({
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("workflowRuleSnapshots"))
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireState(auth.proposal, "draft");
    if (!isBackoffice(auth.roles)) {
      await assertBuilderOwnership(
        ctx,
        assignedBuilderProfileIdOrThrow(auth.proposal),
        auth.subject,
      );
    }
    const milestones = await collectByIndex(
      ctx,
      "proposalMilestones",
      "by_proposal",
      args.proposalId,
    );
    if (milestones.length === 0) {
      throw new Error("At least one milestone is required before submission.");
    }

    const now = Date.now();
    const workflowRule = await getActiveWorkflowRule(ctx, auth.brokerage._id);
    const snapshotId = await ctx.db.insert("workflowRuleSnapshots", {
      allowPermitWaiverByRoles: workflowRule.allowPermitWaiverByRoles,
      brokerageId: auth.brokerage._id,
      createdAt: now,
      organizationId: args.workosOrganizationId,
      proposalId: args.proposalId,
      proposalStates: workflowRule.proposalStates,
      requirePermitForApproval: workflowRule.requirePermitForApproval,
      ruleKey: workflowRule.ruleKey,
      settings: workflowRule.settings,
      version: workflowRule.version,
      workflowRuleId: workflowRule._id,
    });
    await ctx.db.patch(args.proposalId, {
      reviewOutcome: "none",
      status: "submitted",
      submittedAt: now,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
      workflowRuleSnapshotId: snapshotId,
    });
    await upsertKanbanCard(ctx, args.proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "submitProposal",
      eventType: "proposal.submitted",
      newState: "submitted",
      priorState: "draft",
      proposalId: args.proposalId,
    });
    return snapshotId;
  })
  .public();

export const requestChanges = authenticatedMutation
  .input({
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    requireState(auth.proposal, "submitted");
    requireReason(args.reason);
    const now = Date.now();
    await ctx.db.patch(args.proposalId, {
      reviewOutcome: "requested_changes",
      status: "draft",
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await upsertKanbanCard(ctx, args.proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "requestChanges",
      eventType: "proposal.changes_requested",
      newState: "draft",
      priorState: "submitted",
      proposalId: args.proposalId,
      reason: args.reason,
    });
    return null;
  })
  .public();

export const rejectProposal = authenticatedMutation
  .input({
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    requireState(auth.proposal, "submitted");
    requireReason(args.reason);
    const now = Date.now();
    await ctx.db.patch(args.proposalId, {
      reviewOutcome: "rejected",
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "rejectProposal",
      eventType: "proposal.rejected",
      newState: "submitted",
      priorState: "submitted",
      proposalId: args.proposalId,
      reason: args.reason,
    });
    return null;
  })
  .public();

export const approveProposal = authenticatedMutation
  .input({
    permitWaiverReason: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, APPROVER_ROLES);
    requireState(auth.proposal, "submitted");
    requireReason(args.reason);
    const snapshot = await getWorkflowSnapshot(ctx, auth.proposal);
    const permit = await getPermitDocument(ctx, args.proposalId);
    let waiverId: Id<"documentWaivers"> | undefined;
    if (!permit && snapshot.requirePermitForApproval) {
      if (!args.permitWaiverReason?.trim()) {
        throw new Error(
          "A permit waiver reason is required when no permit waiver exists.",
        );
      }
      const actorRole = auth.roles.find((role) =>
        snapshot.allowPermitWaiverByRoles.includes(role),
      );
      if (!actorRole) {
        throw new Error("Forbidden: permit waiver");
      }
      waiverId = await ctx.db.insert("documentWaivers", {
        brokerageId: auth.brokerage._id,
        createdAt: Date.now(),
        documentType: "permit",
        grantedByRole: actorRole,
        grantedByWorkosUserId: auth.subject,
        organizationId: args.workosOrganizationId,
        proposalId: args.proposalId,
        reason: args.permitWaiverReason.trim(),
      });
    }

    const now = Date.now();
    await ctx.db.patch(args.proposalId, {
      approvedAt: now,
      reviewOutcome: "approved",
      status: "approved",
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await upsertKanbanCard(ctx, args.proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "approveProposal",
      eventType: "proposal.approved",
      newState: "approved",
      priorState: "submitted",
      proposalId: args.proposalId,
      reason: args.reason,
      warnings: waiverId ? ["permit-waived"] : [],
    });
    return null;
  })
  .public();

export const updateSubmittedProposalDrawScheduleRow = authenticatedMutation
  .input({
    amountCents: v.optional(v.number()),
    drawKey: v.string(),
    label: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    timingDay: v.optional(v.number()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    await assertProposalCollaborationEditAllowed(ctx, auth);
    requireReason(args.reason);
    if (!["submitted", "approved"].includes(auth.proposal.status)) {
      throw new Error(
        "Only submitted or approved proposal draw schedules can be edited.",
      );
    }
    if (args.amountCents !== undefined && args.amountCents < 0) {
      throw new Error("Draw amount cannot be negative.");
    }
    if (args.timingDay !== undefined && args.timingDay < 0) {
      throw new Error("Draw timing day cannot be negative.");
    }

    const draw = await ctx.db
      .query("proposalDrawScheduleRows")
      .withIndex("by_proposal_key", (q) =>
        q.eq("proposalId", args.proposalId).eq("drawKey", args.drawKey),
      )
      .unique();
    if (!draw) {
      throw new Error("Draw schedule row not found.");
    }

    const priorState = JSON.stringify({
      amountCents: draw.amountCents,
      label: draw.label,
      timingDay: draw.timingDay,
    });
    const now = Date.now();
    const patch = {
      amountCents: args.amountCents ?? draw.amountCents,
      label: args.label?.trim() || draw.label,
      timingDay: args.timingDay ?? draw.timingDay,
      updatedAt: now,
    };
    await ctx.db.patch(draw._id, patch);
    await ctx.db.patch(args.proposalId, {
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await ensureProposalApprovedAmountCoversDrawSchedule(ctx, auth.proposal, {
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "updateSubmittedProposalDrawScheduleRow",
      eventType: "proposal.draw_schedule.updated",
      newState: JSON.stringify({
        amountCents: patch.amountCents,
        label: patch.label,
        timingDay: patch.timingDay,
      }),
      priorState,
      proposalId: args.proposalId,
      reason: args.reason,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const createProductionTimelineMilestone = authenticatedMutation
  .input({
    milestone: productionTimelineMilestoneInput,
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineDraftStructureWrite(ctx, auth);
    const milestoneId = await insertProductionMilestoneFromInput(
      ctx,
      auth,
      args.milestone,
    );
    const milestone = await ctx.db.get(milestoneId);
    if (milestone) {
      await upsertProposalMilestoneDrawAvailability(ctx, auth, {
        amountCents: milestone.drawAvailabilityCents,
        drawKey: args.milestone.drawKey,
        milestone,
        proposalId: args.proposalId,
        timingDay: Math.max(
          Math.round(args.milestone.dayEnd),
          Math.round(args.milestone.dayStart),
        ),
      });
    }
    await recalculateProposalBudget(ctx, auth, args.proposalId);
    await writeProposalEvent(ctx, {
      auth,
      command: "createProductionTimelineMilestone",
      eventType: "proposal.milestone.created",
      newState: JSON.stringify(args.milestone),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const updateProductionTimelineMilestone = authenticatedMutation
  .input({
    budgetCents: v.optional(v.number()),
    dayEnd: v.optional(v.number()),
    dayStart: v.optional(v.number()),
    dependencyKeys: v.optional(v.array(v.string())),
    drawAvailabilityCents: v.optional(v.number()),
    durationDays: v.optional(v.number()),
    evidenceState: v.optional(v.string()),
    icon: v.optional(v.string()),
    lane: v.optional(v.number()),
    markerLabel: v.optional(v.string()),
    milestoneKey: v.string(),
    name: v.optional(v.string()),
    order: v.optional(v.number()),
    policyState: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    status: v.optional(v.string()),
    submilestones: v.optional(v.array(submilestoneInput)),
    tone: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineDraftStructureWrite(ctx, auth);
    const milestone = await getProductionMilestoneOrThrow(
      ctx,
      args.proposalId,
      args.milestoneKey,
    );
    const nextDayStart = Math.round(args.dayStart ?? milestone.dayStart);
    const existingDurationDays = Math.max(
      1,
      Math.round(
        milestone.durationDays ?? milestone.dayEnd - milestone.dayStart,
      ),
    );
    const nextRequestedDurationDays =
      args.durationDays ??
      (args.dayStart !== undefined && args.dayEnd === undefined
        ? existingDurationDays
        : undefined);
    const nextDayEnd = Math.round(
      args.dayEnd ??
        (nextRequestedDurationDays === undefined
          ? milestone.dayEnd
          : nextDayStart + nextRequestedDurationDays),
    );
    if (nextDayEnd < nextDayStart && nextRequestedDurationDays === undefined) {
      throw new Error("Milestone end day must be after start day.");
    }
    const dayStartDelta = nextDayStart - Math.round(milestone.dayStart);
    const existingSubmilestones = (await ctx.db
      .query("proposalSubmilestones")
      .withIndex("by_milestone", (q) =>
        q.eq("proposalMilestoneId", milestone._id),
      )
      .collect()) as Doc<"proposalSubmilestones">[];
    const schedule = normalizeProductionMilestoneSchedule({
      dayEnd: nextDayEnd,
      dayStart: nextDayStart,
      durationDays: nextRequestedDurationDays,
      submilestones:
        args.submilestones === undefined
          ? existingSubmilestones.map((submilestone) => ({
              budgetCents: submilestone.budgetCents,
              durationDays: submilestone.durationDays,
              key: submilestone.key,
              name: submilestone.name,
              order: submilestone.order,
              startDay:
                submilestone.startDay === undefined
                  ? undefined
                  : Math.max(
                      0,
                      Math.round(submilestone.startDay + dayStartDelta),
                    ),
            }))
          : args.submilestones,
    });
    const nextBudgetCents =
      args.budgetCents === undefined
        ? milestone.budgetCents
        : Math.max(0, Math.round(args.budgetCents));
    const now = Date.now();
    const nextDrawAvailabilityCents =
      args.drawAvailabilityCents === undefined
        ? calculateDrawAvailability(
            nextBudgetCents,
            auth.proposal.borrowerCoPayBps,
          )
        : Math.max(0, Math.round(args.drawAvailabilityCents));
    const patch = {
      ...(args.budgetCents === undefined
        ? {}
        : { budgetCents: nextBudgetCents }),
      ...(args.dayEnd === undefined ? {} : { dayEnd: Math.round(args.dayEnd) }),
      ...(args.dayStart === undefined
        ? {}
        : { dayStart: Math.round(args.dayStart) }),
      ...(args.dependencyKeys === undefined
        ? {}
        : { dependencyKeys: args.dependencyKeys }),
      ...(args.drawAvailabilityCents === undefined &&
      args.budgetCents === undefined
        ? {}
        : { drawAvailabilityCents: nextDrawAvailabilityCents }),
      ...(args.durationDays === undefined
        ? {}
        : { durationDays: Math.max(1, Math.round(args.durationDays)) }),
      ...(args.evidenceState === undefined
        ? {}
        : { evidenceState: args.evidenceState }),
      ...(args.icon === undefined ? {} : { icon: args.icon }),
      ...(args.lane === undefined ? {} : { lane: args.lane }),
      ...(args.markerLabel === undefined
        ? {}
        : { markerLabel: args.markerLabel }),
      ...(args.name === undefined
        ? {}
        : { name: args.name.trim() || milestone.name }),
      ...(args.order === undefined
        ? {}
        : { order: Math.max(1, Math.round(args.order)) }),
      ...(args.policyState === undefined
        ? {}
        : { policyState: args.policyState }),
      ...(args.status === undefined ? {} : { timelineStatus: args.status }),
      ...(args.tone === undefined ? {} : { tone: args.tone }),
      updatedAt: now,
    };
    Object.assign(patch, {
      dayEnd: schedule.dayEnd,
      dayStart: schedule.dayStart,
      durationDays: schedule.durationDays,
    });
    await ctx.db.patch(milestone._id, patch);
    if (args.submilestones !== undefined || dayStartDelta !== 0) {
      await replaceProductionSubmilestones(ctx, auth, {
        milestone,
        proposalId: args.proposalId,
        rows: schedule.submilestones,
      });
    }
    await recalculateProposalBudget(ctx, auth, args.proposalId);
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProductionTimelineMilestone",
      eventType: "proposal.milestone.updated",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(milestone),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const deleteProductionTimelineMilestone = authenticatedMutation
  .input({
    milestoneKey: v.string(),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineDraftStructureWrite(ctx, auth);
    const milestone = await getProductionMilestoneOrThrow(
      ctx,
      args.proposalId,
      args.milestoneKey,
    );
    await deleteProductionMilestoneCascade(ctx, args.proposalId, milestone);
    await recalculateProposalBudget(ctx, auth, args.proposalId);
    await writeProposalEvent(ctx, {
      auth,
      command: "deleteProductionTimelineMilestone",
      eventType: "proposal.milestone.deleted",
      priorState: JSON.stringify(milestone),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const createProposalCostItem = authenticatedMutation
  .input({
    ...productionCostItemCreateInput,
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("proposalCostItems"))
  .handler(async (ctx, args) => {
    const auth = await authorizeProposalCostItemWrite(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
      args.reason,
    );
    const milestone = await getProductionMilestoneOrThrow(
      ctx,
      args.proposalId,
      args.milestoneKey,
    );
    const relevantSubmilestoneKeys =
      await validateProposalCostItemSubmilestones(
        ctx,
        milestone,
        args.relevantSubmilestoneKeys,
      );
    const now = Date.now();
    const costCents = normalizeCostItemCost(args.costCents);
    const quantity = normalizeCostItemQuantity(args.quantity);
    const item = {
      brokerageId: auth.brokerage._id,
      costCents,
      createdAt: now,
      createdByWorkosUserId: auth.subject,
      description: normalizeOptionalText(args.description),
      itemKey: await nextProposalCostItemKey(
        ctx,
        args.proposalId,
        args.title,
        now,
      ),
      itemType: args.itemType,
      milestoneKey: milestone.key,
      organizationId: args.workosOrganizationId,
      proposalId: args.proposalId,
      proposalMilestoneId: milestone._id,
      quantity,
      relevantSubmilestoneKeys,
      supplier: normalizeOptionalText(args.supplier),
      title: normalizeRequiredText(args.title, "Cost item title"),
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    };
    const itemId = await ctx.db.insert("proposalCostItems", item);
    await applyProposalCostItemBudgetDelta(ctx, auth, {
      deltaCents: costItemTotalCents(item),
      milestone,
      proposalId: args.proposalId,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "createProposalCostItem",
      eventType: "proposal.cost_item.created",
      newState: JSON.stringify({ ...item, _id: itemId }),
      proposalId: args.proposalId,
      reason: args.reason,
      warnings: proposalCostItemAuditWarnings(auth.proposal),
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return itemId;
  })
  .public();

export const updateProposalCostItem = authenticatedMutation
  .input({
    ...productionCostItemUpdateInput,
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposalCostItemWrite(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
      args.reason,
    );
    const item = await getProposalCostItemOrThrow(
      ctx,
      args.proposalId,
      args.itemId,
    );
    const milestone =
      args.milestoneKey === undefined || args.milestoneKey === item.milestoneKey
        ? await getProposalMilestoneByIdOrThrow(ctx, item.proposalMilestoneId)
        : await getProductionMilestoneOrThrow(
            ctx,
            args.proposalId,
            args.milestoneKey,
          );
    const milestoneChanged = milestone._id !== item.proposalMilestoneId;
    const relevantSubmilestoneKeys =
      args.relevantSubmilestoneKeys === undefined && !milestoneChanged
        ? item.relevantSubmilestoneKeys
        : await validateProposalCostItemSubmilestones(
            ctx,
            milestone,
            args.relevantSubmilestoneKeys ?? [],
          );
    const now = Date.now();
    const patch = {
      ...(args.costCents === undefined
        ? {}
        : { costCents: normalizeCostItemCost(args.costCents) }),
      ...(args.description === undefined
        ? {}
        : { description: normalizeOptionalText(args.description) }),
      ...(args.itemType === undefined ? {} : { itemType: args.itemType }),
      ...(milestoneChanged
        ? {
            milestoneKey: milestone.key,
            proposalMilestoneId: milestone._id,
          }
        : {}),
      ...(args.quantity === undefined
        ? {}
        : { quantity: normalizeCostItemQuantity(args.quantity) }),
      relevantSubmilestoneKeys,
      ...(args.supplier === undefined
        ? {}
        : { supplier: normalizeOptionalText(args.supplier) }),
      ...(args.title === undefined
        ? {}
        : { title: normalizeRequiredText(args.title, "Cost item title") }),
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    };
    const nextItem = { ...item, ...patch };
    await ctx.db.patch(item._id, patch);
    const priorTotal = costItemTotalCents(item);
    const nextTotal = costItemTotalCents(nextItem);
    if (milestoneChanged) {
      const priorMilestone = await getProposalMilestoneByIdOrThrow(
        ctx,
        item.proposalMilestoneId,
      );
      await applyProposalCostItemBudgetDelta(ctx, auth, {
        deltaCents: -priorTotal,
        milestone: priorMilestone,
        proposalId: args.proposalId,
      });
      await applyProposalCostItemBudgetDelta(ctx, auth, {
        deltaCents: nextTotal,
        milestone,
        proposalId: args.proposalId,
      });
    } else {
      await applyProposalCostItemBudgetDelta(ctx, auth, {
        deltaCents: nextTotal - priorTotal,
        milestone,
        proposalId: args.proposalId,
      });
    }
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProposalCostItem",
      eventType: "proposal.cost_item.updated",
      newState: JSON.stringify(nextItem),
      priorState: JSON.stringify(item),
      proposalId: args.proposalId,
      reason: args.reason,
      warnings: proposalCostItemAuditWarnings(auth.proposal),
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const deleteProposalCostItem = authenticatedMutation
  .input({
    itemId: v.id("proposalCostItems"),
    proposalId: v.id("buildProposals"),
    reason: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposalCostItemWrite(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
      args.reason,
    );
    const item = await getProposalCostItemOrThrow(
      ctx,
      args.proposalId,
      args.itemId,
    );
    const milestone = await getProposalMilestoneByIdOrThrow(
      ctx,
      item.proposalMilestoneId,
    );
    await ctx.db.delete(item._id);
    await applyProposalCostItemBudgetDelta(ctx, auth, {
      deltaCents: -costItemTotalCents(item),
      milestone,
      proposalId: args.proposalId,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "deleteProposalCostItem",
      eventType: "proposal.cost_item.deleted",
      priorState: JSON.stringify(item),
      proposalId: args.proposalId,
      reason: args.reason,
      warnings: proposalCostItemAuditWarnings(auth.proposal),
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const createActiveBuildCostItem = authenticatedMutation
  .input({
    ...productionCostItemCreateInput,
    buildId: v.id("activeBuilds"),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("buildCostItems"))
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildCostItemWrite(
      ctx,
      args.buildId,
      args.workosOrganizationId,
      args.reason,
      { requireReason: false },
    );
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    const relevantSubmilestoneKeys = await validateBuildCostItemSubmilestones(
      ctx,
      milestone,
      args.relevantSubmilestoneKeys,
    );
    const now = Date.now();
    const costCents = normalizeCostItemCost(args.costCents);
    const quantity = normalizeCostItemQuantity(args.quantity);
    const item = {
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      buildMilestoneId: milestone._id,
      costCents,
      createdAt: now,
      createdByWorkosUserId: auth.subject,
      description: normalizeOptionalText(args.description),
      itemKey: await nextBuildCostItemKey(ctx, args.buildId, args.title, now),
      itemType: args.itemType,
      milestoneKey: milestone.key,
      organizationId: args.workosOrganizationId,
      proposalId: auth.proposal._id,
      quantity,
      relevantSubmilestoneKeys,
      supplier: normalizeOptionalText(args.supplier),
      title: normalizeRequiredText(args.title, "Cost item title"),
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    };
    const itemId = await ctx.db.insert("buildCostItems", item);
    await applyActiveBuildCostItemBudgetDelta(ctx, auth, {
      buildId: args.buildId,
      deltaCents: costItemTotalCents(item),
      milestone,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "createActiveBuildCostItem",
      eventType: "active_build.cost_item.created",
      newState: JSON.stringify({ ...item, _id: itemId }),
      reason: args.reason,
    });
    return itemId;
  })
  .public();

export const updateActiveBuildCostItem = authenticatedMutation
  .input({
    ...productionBuildCostItemUpdateInput,
    buildId: v.id("activeBuilds"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildCostItemWrite(
      ctx,
      args.buildId,
      args.workosOrganizationId,
      args.reason,
    );
    const item = await getBuildCostItemOrThrow(ctx, args.buildId, args.itemId);
    const milestone =
      args.milestoneKey === undefined || args.milestoneKey === item.milestoneKey
        ? await ctx.db.get(item.buildMilestoneId)
        : await getActiveBuildMilestoneOrThrow(
            ctx,
            args.buildId,
            args.milestoneKey,
          );
    if (!milestone) {
      throw new Error("Production active-build milestone not found.");
    }
    const milestoneChanged = milestone._id !== item.buildMilestoneId;
    const relevantSubmilestoneKeys =
      args.relevantSubmilestoneKeys === undefined && !milestoneChanged
        ? item.relevantSubmilestoneKeys
        : await validateBuildCostItemSubmilestones(
            ctx,
            milestone,
            args.relevantSubmilestoneKeys ?? [],
          );
    const now = Date.now();
    const patch = {
      ...(args.costCents === undefined
        ? {}
        : { costCents: normalizeCostItemCost(args.costCents) }),
      ...(args.description === undefined
        ? {}
        : { description: normalizeOptionalText(args.description) }),
      ...(args.itemType === undefined ? {} : { itemType: args.itemType }),
      ...(milestoneChanged
        ? {
            buildMilestoneId: milestone._id,
            milestoneKey: milestone.key,
          }
        : {}),
      ...(args.quantity === undefined
        ? {}
        : { quantity: normalizeCostItemQuantity(args.quantity) }),
      relevantSubmilestoneKeys,
      ...(args.supplier === undefined
        ? {}
        : { supplier: normalizeOptionalText(args.supplier) }),
      ...(args.title === undefined
        ? {}
        : { title: normalizeRequiredText(args.title, "Cost item title") }),
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    };
    const nextItem = { ...item, ...patch };
    await ctx.db.patch(item._id, patch);
    const priorTotal = costItemTotalCents(item);
    const nextTotal = costItemTotalCents(nextItem);
    if (milestoneChanged) {
      const priorMilestone = await ctx.db.get(item.buildMilestoneId);
      if (!priorMilestone) {
        throw new Error("Production active-build milestone not found.");
      }
      await applyActiveBuildCostItemBudgetDelta(ctx, auth, {
        buildId: args.buildId,
        deltaCents: -priorTotal,
        milestone: priorMilestone,
      });
      await applyActiveBuildCostItemBudgetDelta(ctx, auth, {
        buildId: args.buildId,
        deltaCents: nextTotal,
        milestone,
      });
    } else {
      await applyActiveBuildCostItemBudgetDelta(ctx, auth, {
        buildId: args.buildId,
        deltaCents: nextTotal - priorTotal,
        milestone,
      });
    }
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "updateActiveBuildCostItem",
      eventType: "active_build.cost_item.updated",
      newState: JSON.stringify(nextItem),
      priorState: JSON.stringify(item),
      reason: args.reason,
    });
    return null;
  })
  .public();

export const deleteActiveBuildCostItem = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    itemId: v.id("buildCostItems"),
    reason: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildCostItemWrite(
      ctx,
      args.buildId,
      args.workosOrganizationId,
      args.reason,
    );
    const item = await getBuildCostItemOrThrow(ctx, args.buildId, args.itemId);
    const milestone = await ctx.db.get(item.buildMilestoneId);
    if (!milestone) {
      throw new Error("Production active-build milestone not found.");
    }
    await ctx.db.delete(item._id);
    await applyActiveBuildCostItemBudgetDelta(ctx, auth, {
      buildId: args.buildId,
      deltaCents: -costItemTotalCents(item),
      milestone,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "deleteActiveBuildCostItem",
      eventType: "active_build.cost_item.deleted",
      priorState: JSON.stringify(item),
      reason: args.reason,
    });
    return null;
  })
  .public();

export const createProductionTimelineDraw = authenticatedMutation
  .input({
    amountCents: v.number(),
    customDate: v.optional(v.boolean()),
    drawKey: v.string(),
    itemMilestoneKey: v.optional(v.string()),
    label: v.string(),
    order: v.optional(v.number()),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
    x: v.number(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineEditable(ctx, auth);
    const existing = await ctx.db
      .query("proposalDrawScheduleRows")
      .withIndex("by_proposal_key", (q) =>
        q.eq("proposalId", args.proposalId).eq("drawKey", args.drawKey),
      )
      .unique();
    if (existing) {
      throw new Error("Production draw already exists.");
    }
    const draws = await collectByIndex(
      ctx,
      "proposalDrawScheduleRows",
      "by_proposal",
      args.proposalId,
    );
    const milestone =
      args.itemMilestoneKey === undefined
        ? null
        : await getProductionMilestoneOrThrow(
            ctx,
            args.proposalId,
            args.itemMilestoneKey,
          );
    const now = Date.now();
    await ctx.db.insert("proposalDrawScheduleRows", {
      amountCents: Math.max(0, Math.round(args.amountCents)),
      brokerageId: auth.brokerage._id,
      createdAt: now,
      customDate: args.customDate ?? true,
      drawKey: args.drawKey,
      label: args.label.trim() || "Reimbursement draw",
      ...(args.itemMilestoneKey === undefined
        ? {}
        : { milestoneKey: args.itemMilestoneKey }),
      order: args.order ?? draws.length + 1,
      organizationId: auth.proposal.organizationId,
      proposalId: args.proposalId,
      ...(milestone === null ? {} : { proposalMilestoneId: milestone._id }),
      source: "manual",
      timingDay: Math.max(0, Math.round(args.x)),
      updatedAt: now,
    });
    await ensureProposalApprovedAmountCoversDrawSchedule(ctx, auth.proposal, {
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "createProductionTimelineDraw",
      eventType: "proposal.draw.created",
      newState: JSON.stringify(args),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const updateProductionTimelineDraw = authenticatedMutation
  .input({
    amountCents: v.optional(v.number()),
    customDate: v.optional(v.boolean()),
    drawKey: v.string(),
    itemMilestoneKey: v.optional(v.string()),
    label: v.optional(v.string()),
    order: v.optional(v.number()),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
    x: v.optional(v.number()),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineEditable(ctx, auth);
    const draw = await getProductionDrawOrThrow(
      ctx,
      args.proposalId,
      args.drawKey,
    );
    const milestone =
      args.itemMilestoneKey === undefined
        ? undefined
        : await getProductionMilestoneOrThrow(
            ctx,
            args.proposalId,
            args.itemMilestoneKey,
          );
    const now = Date.now();
    const patch = {
      ...(args.amountCents === undefined
        ? {}
        : { amountCents: Math.max(0, Math.round(args.amountCents)) }),
      ...(args.customDate === undefined ? {} : { customDate: args.customDate }),
      ...(milestone === undefined
        ? {}
        : {
            milestoneKey: args.itemMilestoneKey,
            proposalMilestoneId: milestone._id,
          }),
      ...(args.label === undefined
        ? {}
        : { label: args.label.trim() || draw.label }),
      ...(args.order === undefined
        ? {}
        : { order: Math.max(1, Math.round(args.order)) }),
      ...(args.x === undefined
        ? {}
        : { customDate: true, timingDay: Math.max(0, Math.round(args.x)) }),
      updatedAt: now,
    };
    await ctx.db.patch(draw._id, patch);
    await ensureProposalApprovedAmountCoversDrawSchedule(ctx, auth.proposal, {
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProductionTimelineDraw",
      eventType: "proposal.draw.updated",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(draw),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const deleteProductionTimelineDraw = authenticatedMutation
  .input({
    drawKey: v.string(),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineEditable(ctx, auth);
    const draw = await getProductionDrawOrThrow(
      ctx,
      args.proposalId,
      args.drawKey,
    );
    if (draw.requestStatus === "approved") {
      throw new Error("Approved reimbursement draws cannot be deleted.");
    }
    const now = Date.now();
    await ctx.db.delete(draw._id);
    await ensureProposalApprovedAmountCoversDrawSchedule(ctx, auth.proposal, {
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "deleteProductionTimelineDraw",
      eventType: "proposal.draw.deleted",
      priorState: JSON.stringify(draw),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const requestProductionTimelineModification = authenticatedMutation
  .input({
    milestoneKey: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    reason: v.optional(v.string()),
    requestedPayload: v.any(),
    requestType: timelineModificationRequestType,
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({ requestId: v.id("proposalTimelineModificationRequests") }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    if (auth.proposal.status !== "approved") {
      throw new Error("Live-build modification requests require approval.");
    }
    let priorState: unknown;
    if (
      args.requestType === "deleteMilestone" ||
      args.requestType === "updateMilestoneBudget"
    ) {
      if (!args.milestoneKey) {
        throw new Error("milestoneKey is required for this request.");
      }
      priorState = await getProductionMilestoneOrThrow(
        ctx,
        args.proposalId,
        args.milestoneKey,
      );
    }
    const now = Date.now();
    const requestId = await ctx.db.insert(
      "proposalTimelineModificationRequests",
      {
        brokerageId: auth.brokerage._id,
        createdAt: now,
        milestoneKey: args.milestoneKey,
        organizationId: auth.proposal.organizationId,
        priorState,
        proposalId: args.proposalId,
        reason: args.reason,
        requestedByWorkosUserId: auth.subject,
        requestedPayload: args.requestedPayload,
        requestType: args.requestType,
        status: "requested",
        updatedAt: now,
      },
    );
    await writeProposalEvent(ctx, {
      auth,
      command: "requestProductionTimelineModification",
      eventType: "proposal.modification.requested",
      newState: JSON.stringify({ requestId, requestType: args.requestType }),
      proposalId: args.proposalId,
      reason: args.reason,
    });
    return { requestId };
  })
  .public();

export const reviewProductionTimelineModificationRequest = authenticatedMutation
  .input({
    note: v.optional(v.string()),
    requestId: v.id("proposalTimelineModificationRequests"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Production timeline modification request not found.");
    }
    const auth = await authorizeProposal(
      ctx,
      request.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    await assertProposalCollaborationEditAllowed(ctx, auth);

    if (request.status !== "requested") {
      return null;
    }
    if (args.status === "approved") {
      await applyProductionTimelineModificationRequest(ctx, auth, request);
    }
    await ctx.db.patch(request._id, {
      reviewNote: args.note,
      reviewedAt: Date.now(),
      reviewerWorkosUserId: auth.subject,
      status: args.status,
      updatedAt: Date.now(),
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "reviewProductionTimelineModificationRequest",
      eventType: "proposal.modification.reviewed",
      newState: JSON.stringify({
        requestId: args.requestId,
        status: args.status,
      }),
      priorState: JSON.stringify(request),
      proposalId: request.proposalId,
      reason: args.note,
    });
    await pushProposalPlanningSnapshot(ctx, request.proposalId);
    return null;
  })
  .public();

export const updateProductionTimelinePlanState = authenticatedMutation
  .input({
    currentDay: v.number(),
    progressValue: v.number(),
    proposalId: v.id("buildProposals"),
    rangeMax: v.number(),
    rangeMin: v.number(),
    routeState: v.object({
      activeCapitalSpikeId: v.optional(v.string()),
      activeDrawId: v.optional(v.string()),
      activeMilestoneKey: v.optional(v.string()),
      selectedPanelOpen: v.boolean(),
      straightLine: v.boolean(),
    }),
    minimumCashReserveCents: v.optional(v.number()),
    startingCashCents: v.number(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineEditable(ctx, auth);
    const priorState = JSON.stringify({
      currentDay: auth.proposal.timelineCurrentDay,
      progressValue: auth.proposal.timelineProgressValue,
      rangeMax: auth.proposal.timelineRangeMax,
      rangeMin: auth.proposal.timelineRangeMin,
      routeState: auth.proposal.timelineRouteState,
      minimumCashReserveCents: auth.proposal.timelineMinimumCashReserveCents,
      startingCashCents: auth.proposal.timelineStartingCashCents,
    });
    const now = Date.now();
    await ctx.db.patch(args.proposalId, {
      borrowerWorkingCapitalLimitCents: Math.max(
        0,
        Math.round(args.startingCashCents),
      ),
      timelineCurrentDay: Math.round(args.currentDay),
      timelineProgressValue: Math.round(args.progressValue),
      timelineRangeMax: Math.round(args.rangeMax),
      timelineRangeMin: Math.round(args.rangeMin),
      timelineRouteState: args.routeState,
      timelineMinimumCashReserveCents: Math.max(
        0,
        Math.round(args.minimumCashReserveCents ?? 0),
      ),
      timelineStartingCashCents: Math.max(
        0,
        Math.round(args.startingCashCents),
      ),
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProductionTimelinePlanState",
      eventType: "proposal.timeline_state.updated",
      newState: JSON.stringify({
        currentDay: Math.round(args.currentDay),
        progressValue: Math.round(args.progressValue),
        rangeMax: Math.round(args.rangeMax),
        rangeMin: Math.round(args.rangeMin),
        routeState: args.routeState,
        minimumCashReserveCents: Math.max(
          0,
          Math.round(args.minimumCashReserveCents ?? 0),
        ),
        startingCashCents: Math.max(0, Math.round(args.startingCashCents)),
      }),
      priorState,
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const updateProductionProposalCoPayAmount = authenticatedMutation
  .input({
    borrowerCoPayCents: v.number(),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionProposalPreLiveCapitalWrite(ctx, auth);
    const totalBudgetCents = await recalculateProposalBudget(
      ctx,
      auth,
      args.proposalId,
    );
    if (totalBudgetCents <= 0) {
      throw new Error("Add proposal budget before editing approved amount.");
    }
    const borrowerCoPayCents = Math.max(
      0,
      Math.min(totalBudgetCents, Math.round(args.borrowerCoPayCents)),
    );
    const borrowerCoPayBps = Math.max(
      0,
      Math.min(
        10_000,
        Math.round((borrowerCoPayCents * 10_000) / totalBudgetCents),
      ),
    );
    const approvedAmountCents = calculateDrawAvailability(
      totalBudgetCents,
      borrowerCoPayBps,
    );
    const priorBorrowerCoPayCents =
      auth.proposal.borrowerCoPayCents ??
      Math.round((totalBudgetCents * auth.proposal.borrowerCoPayBps) / 10_000);
    const priorState = JSON.stringify({
      borrowerCoPayBps: auth.proposal.borrowerCoPayBps,
      borrowerCoPayCents: priorBorrowerCoPayCents,
      lenderDrawPolicyLimitCents: auth.proposal.lenderDrawPolicyLimitCents,
      totalBudgetCents,
    });
    const now = Date.now();

    await ctx.db.patch(args.proposalId, {
      borrowerCoPayBps,
      borrowerCoPayCents,
      lenderDrawPolicyLimitCents: approvedAmountCents,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await refreshProposalMilestoneDrawAvailability(ctx, args.proposalId, {
      borrowerCoPayBps,
      updatedAt: now,
    });
    await upsertKanbanCard(ctx, args.proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProductionProposalCoPayAmount",
      eventType: "proposal.borrower_copay.updated",
      newState: JSON.stringify({
        approvedAmountCents,
        borrowerCoPayBps,
        borrowerCoPayCents,
        totalBudgetCents,
      }),
      priorState,
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const updateProductionProposalApprovedAmount = authenticatedMutation
  .input({
    approvedAmountCents: v.number(),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionProposalPreLiveCapitalWrite(ctx, auth);
    const totalBudgetCents = await recalculateProposalBudget(
      ctx,
      auth,
      args.proposalId,
    );
    if (totalBudgetCents <= 0) {
      throw new Error("Add proposal budget before editing approved amount.");
    }
    const totalDrawAmountCents = await sumProposalDrawScheduleAmountCents(
      ctx,
      args.proposalId,
    );
    const approvedAmountCents = normalizeProposalApprovedAmountCents({
      requestedApprovedAmountCents: args.approvedAmountCents,
      totalDrawAmountCents,
    });
    const borrowerCoPayCents = Math.max(
      0,
      totalBudgetCents - approvedAmountCents,
    );
    const borrowerCoPayBps = Math.max(
      0,
      Math.min(
        10_000,
        Math.round((borrowerCoPayCents * 10_000) / totalBudgetCents),
      ),
    );
    const priorState = JSON.stringify({
      approvedAmountCents: auth.proposal.lenderDrawPolicyLimitCents,
      borrowerCoPayBps: auth.proposal.borrowerCoPayBps,
      borrowerCoPayCents: auth.proposal.borrowerCoPayCents,
      totalBudgetCents,
      totalDrawAmountCents,
    });
    const now = Date.now();

    await ctx.db.patch(args.proposalId, {
      borrowerCoPayBps,
      borrowerCoPayCents,
      lenderDrawPolicyLimitCents: approvedAmountCents,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await upsertKanbanCard(ctx, args.proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProductionProposalApprovedAmount",
      eventType: "proposal.approved_amount.updated",
      newState: JSON.stringify({
        approvedAmountCents,
        borrowerCoPayBps,
        borrowerCoPayCents,
        totalBudgetCents,
        totalDrawAmountCents,
      }),
      priorState,
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const updateProductionProposalInterestRate = authenticatedMutation
  .input({
    interestAnnualBps: v.number(),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionProposalPreLiveCapitalWrite(ctx, auth);
    const interestAnnualBps = Math.max(
      0,
      Math.min(10_000, Math.round(args.interestAnnualBps)),
    );
    const now = Date.now();
    await ctx.db.patch(args.proposalId, {
      interestAnnualBps,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await upsertKanbanCard(ctx, args.proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProductionProposalInterestRate",
      eventType: "proposal.interest_rate.updated",
      newState: JSON.stringify({ interestAnnualBps }),
      priorState: JSON.stringify({
        interestAnnualBps: auth.proposal.interestAnnualBps ?? 925,
      }),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const createProductionTimelineCapitalEvent = authenticatedMutation
  .input({
    amountCents: v.number(),
    capitalEventKey: v.string(),
    eventKind: timelineCapitalEventKind,
    label: v.string(),
    order: v.optional(v.number()),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
    x: v.number(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineEditable(ctx, auth);
    await insertProductionCapitalEvent(ctx, auth, {
      amountCents: args.amountCents,
      capitalEventKey: args.capitalEventKey,
      eventKind: args.eventKind,
      label: args.label,
      order: args.order,
      proposalId: args.proposalId,
      x: args.x,
    });
    await recalculateProposalBudget(ctx, auth, args.proposalId);
    await writeProposalEvent(ctx, {
      auth,
      command: "createProductionTimelineCapitalEvent",
      eventType: "proposal.capital_event.created",
      newState: JSON.stringify(args),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const createProductionTimelineCashInfusion = authenticatedMutation
  .input({
    amountCents: v.number(),
    cashInfusionKey: v.string(),
    label: v.string(),
    order: v.optional(v.number()),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
    x: v.number(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineEditable(ctx, auth);
    await insertProductionCapitalEvent(ctx, auth, {
      amountCents: args.amountCents,
      capitalEventKey: args.cashInfusionKey,
      eventKind: "cashInfusion",
      label: args.label,
      order: args.order,
      proposalId: args.proposalId,
      x: args.x,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "createProductionTimelineCashInfusion",
      eventType: "proposal.cash_infusion.created",
      newState: JSON.stringify(args),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const updateProductionTimelineCapitalEvent = authenticatedMutation
  .input({
    amountCents: v.optional(v.number()),
    capitalEventKey: v.string(),
    eventKind: v.optional(timelineCapitalEventKind),
    label: v.optional(v.string()),
    order: v.optional(v.number()),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
    x: v.optional(v.number()),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineEditable(ctx, auth);
    const event = await getProductionCapitalEventOrThrow(
      ctx,
      args.proposalId,
      args.capitalEventKey,
    );
    const patch = {
      ...(args.amountCents === undefined
        ? {}
        : { amountCents: Math.max(0, Math.round(args.amountCents)) }),
      ...(args.eventKind === undefined ? {} : { eventKind: args.eventKind }),
      ...(args.label === undefined
        ? {}
        : { label: args.label.trim() || event.label }),
      ...(args.order === undefined ? {} : { order: Math.max(1, args.order) }),
      ...(args.x === undefined ? {} : { x: Math.max(0, Math.round(args.x)) }),
      updatedAt: Date.now(),
    };
    await ctx.db.patch(event._id, patch);
    await recalculateProposalBudget(ctx, auth, args.proposalId);
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProductionTimelineCapitalEvent",
      eventType: "proposal.capital_event.updated",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(event),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const deleteProductionTimelineCapitalEvent = authenticatedMutation
  .input({
    capitalEventKey: v.string(),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineEditable(ctx, auth);
    const event = await getProductionCapitalEventOrThrow(
      ctx,
      args.proposalId,
      args.capitalEventKey,
    );
    await ctx.db.delete(event._id);
    await recalculateProposalBudget(ctx, auth, args.proposalId);
    await writeProposalEvent(ctx, {
      auth,
      command: "deleteProductionTimelineCapitalEvent",
      eventType: "proposal.capital_event.deleted",
      priorState: JSON.stringify(event),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const generateProductionEvidenceUploadUrl = authenticatedMutation
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
    await requireProductionTimelineEditable(ctx, auth);
    return await ctx.storage.generateUploadUrl();
  })
  .public();

export const createProductionTimelineEvidenceAsset = authenticatedMutation
  .input({
    asset: evidenceAssetInput,
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineEditable(ctx, auth);
    const milestone = await getProductionMilestoneOrThrow(
      ctx,
      args.proposalId,
      args.asset.milestoneKey,
    );
    const existing = await ctx.db
      .query("proposalEvidenceAssets")
      .withIndex("by_proposal_key", (q) =>
        q
          .eq("proposalId", args.proposalId)
          .eq("evidenceKey", args.asset.evidenceKey),
      )
      .unique();
    if (existing) {
      throw new Error("Production evidence asset already exists.");
    }
    const now = Date.now();
    await ctx.db.insert("proposalEvidenceAssets", {
      brokerageId: auth.brokerage._id,
      createdAt: now,
      evidenceKey: args.asset.evidenceKey,
      fileName: args.asset.fileName,
      label: args.asset.label.trim() || args.asset.fileName,
      locationVerified: args.asset.locationVerified ?? false,
      milestoneKey: args.asset.milestoneKey,
      mimeType: args.asset.mimeType,
      organizationId: auth.proposal.organizationId,
      proposalId: args.proposalId,
      sizeBytes: Math.max(0, Math.round(args.asset.sizeBytes)),
      source: args.asset.source ?? "production_timeline_upload",
      storageId: args.asset.storageId,
      tag: args.asset.tag.trim() || milestone.name,
      updatedAt: now,
    });
    await ctx.db.patch(milestone._id, {
      evidenceState: "Submitted package",
      updatedAt: now,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "createProductionTimelineEvidenceAsset",
      eventType: "proposal.evidence.created",
      newState: JSON.stringify(args.asset),
      proposalId: args.proposalId,
    });
    return null;
  })
  .public();

export const updateProductionTimelineEvidenceAsset = authenticatedMutation
  .input({
    evidenceKey: v.string(),
    label: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    tag: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineEditable(ctx, auth);
    const asset = await getProductionEvidenceAssetOrThrow(
      ctx,
      args.proposalId,
      args.evidenceKey,
    );
    const patch = {
      ...(args.label === undefined
        ? {}
        : { label: args.label.trim() || asset.label }),
      ...(args.tag === undefined ? {} : { tag: args.tag.trim() || asset.tag }),
      updatedAt: Date.now(),
    };
    await ctx.db.patch(asset._id, patch);
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProductionTimelineEvidenceAsset",
      eventType: "proposal.evidence.updated",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(asset),
      proposalId: args.proposalId,
    });
    return null;
  })
  .public();

export const deleteProductionTimelineEvidenceAsset = authenticatedMutation
  .input({
    evidenceKey: v.string(),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineEditable(ctx, auth);
    const asset = await getProductionEvidenceAssetOrThrow(
      ctx,
      args.proposalId,
      args.evidenceKey,
    );
    if (asset.storageId) {
      await ctx.storage.delete(asset.storageId);
    }
    await ctx.db.delete(asset._id);
    await writeProposalEvent(ctx, {
      auth,
      command: "deleteProductionTimelineEvidenceAsset",
      eventType: "proposal.evidence.deleted",
      priorState: JSON.stringify(asset),
      proposalId: args.proposalId,
    });
    return null;
  })
  .public();

export const submitProductionMilestoneCompletion = authenticatedMutation
  .input({
    actualCostCents: v.optional(v.number()),
    completedDay: v.number(),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineLiveWrite(ctx, auth);
    const milestone = await getProductionMilestoneOrThrow(
      ctx,
      args.proposalId,
      args.milestoneKey,
    );
    const completionClaim = {
      ...(args.actualCostCents === undefined
        ? {}
        : { actualCostCents: Math.max(0, Math.round(args.actualCostCents)) }),
      completedDay: Math.max(0, Math.round(args.completedDay)),
      ...(args.note ? { note: args.note } : {}),
      submittedAt: new Date().toISOString(),
    };
    const now = Date.now();
    await ctx.db.patch(milestone._id, {
      completionClaim,
      evidenceState: milestone.evidenceState ?? "Completion claimed",
      timelineStatus: "complete",
      tone: "complete",
      updatedAt: now,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "submitProductionMilestoneCompletion",
      eventType: "proposal.milestone_completion.submitted",
      newState: JSON.stringify(completionClaim),
      priorState: JSON.stringify(milestone.completionClaim),
      proposalId: args.proposalId,
    });
    return null;
  })
  .public();

export const reviewProductionMilestoneCompletion = authenticatedMutation
  .input({
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    status: v.union(v.literal("approved"), v.literal("revisionRequested")),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    await assertProposalCollaborationEditAllowed(ctx, auth);
    const milestone = await getProductionMilestoneOrThrow(
      ctx,
      args.proposalId,
      args.milestoneKey,
    );
    const completionReview = {
      ...(args.note ? { note: args.note } : {}),
      reviewedAt: new Date().toISOString(),
      status: args.status,
    };
    await ctx.db.patch(milestone._id, {
      completionReview,
      completionClaim: {
        ...(milestone.completionClaim ?? {}),
        completionReview,
      },
      timelineStatus:
        args.status === "approved" ? "complete" : milestone.timelineStatus,
      tone: args.status === "approved" ? "complete" : "warning",
      updatedAt: Date.now(),
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "reviewProductionMilestoneCompletion",
      eventType: "proposal.milestone_completion.reviewed",
      newState: JSON.stringify(completionReview),
      priorState: JSON.stringify(milestone.completionReview),
      proposalId: args.proposalId,
    });
    return null;
  })
  .public();

export const requestProductionMilestoneSiteVisit = authenticatedMutation
  .input({
    includedMilestoneKeys: v.optional(v.array(v.string())),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    requestedDay: v.number(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      includedItemIds: v.optional(v.array(v.string())),
      note: v.optional(v.string()),
      requestedAt: v.string(),
      requestedDay: v.number(),
      status: v.string(),
      tokenExpiresAt: v.number(),
      url: v.string(),
      visitId: v.string(),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    if (auth.proposal.status !== "approved") {
      throw new Error("Site visit requests require an approved proposal.");
    }
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    await assertProposalCollaborationEditAllowed(ctx, auth);
    const milestone = await getProductionMilestoneOrThrow(
      ctx,
      args.proposalId,
      args.milestoneKey,
    );
    const now = Date.now();
    const visitId = `site_visit_${args.milestoneKey}_${now}`;
    const siteVisit = {
      includedItemIds:
        args.includedMilestoneKeys && args.includedMilestoneKeys.length > 0
          ? args.includedMilestoneKeys
          : [args.milestoneKey],
      ...(args.note ? { note: args.note } : {}),
      requestedAt: new Date(now).toISOString(),
      requestedDay: Math.max(0, Math.round(args.requestedDay)),
      status: "requested",
      tokenExpiresAt: now + 60 * 60 * 1000,
      url: `/newsitevisit/${String(args.proposalId)}/${visitId}`,
      visitId,
    };
    const completionReview = {
      ...(milestone.completionReview ?? {}),
      reviewedAt:
        milestone.completionReview?.reviewedAt ?? siteVisit.requestedAt,
      siteVisit,
      status: milestone.completionReview?.status ?? "revisionRequested",
    };
    await ctx.db.patch(milestone._id, {
      completionReview,
      tone: "warning",
      updatedAt: now,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "requestProductionMilestoneSiteVisit",
      eventType: "proposal.site_visit.requested",
      newState: JSON.stringify(siteVisit),
      priorState: JSON.stringify(milestone.completionReview),
      proposalId: args.proposalId,
      reason: args.note,
    });
    return siteVisit;
  })
  .public();

export const recordProductionMilestoneSiteVisit = authenticatedMutation
  .input({
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    status: v.union(v.literal("complete"), v.literal("cancelled")),
    visitId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    if (auth.proposal.status !== "approved") {
      throw new Error("Site visit records require an approved proposal.");
    }
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    await assertProposalCollaborationEditAllowed(ctx, auth);
    const milestone = await getProductionMilestoneOrThrow(
      ctx,
      args.proposalId,
      args.milestoneKey,
    );
    const existingReview = milestone.completionReview ?? {};
    const existingSiteVisit = existingReview.siteVisit;
    if (!existingSiteVisit || existingSiteVisit.visitId !== args.visitId) {
      throw new Error("Production site visit request not found.");
    }
    const now = Date.now();
    const siteVisit = {
      ...existingSiteVisit,
      completedAt:
        args.status === "complete"
          ? new Date(now).toISOString()
          : existingSiteVisit.completedAt,
      ...(args.note ? { recordNote: args.note } : {}),
      status: args.status,
    };
    const completionReview = {
      ...existingReview,
      reviewedAt: existingReview.reviewedAt ?? new Date(now).toISOString(),
      siteVisit,
      status: existingReview.status ?? "revisionRequested",
    };
    await ctx.db.patch(milestone._id, {
      completionReview,
      updatedAt: now,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "recordProductionMilestoneSiteVisit",
      eventType: "proposal.site_visit.recorded",
      newState: JSON.stringify(siteVisit),
      priorState: JSON.stringify(existingSiteVisit),
      proposalId: args.proposalId,
      reason: args.note,
    });
    return null;
  })
  .public();

export const submitProductionDrawRequest = authenticatedMutation
  .input({
    amountCents: v.number(),
    drawKey: v.string(),
    note: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
    x: v.optional(v.number()),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineLiveWrite(ctx, auth);
    const draw = await getProductionDrawOrThrow(
      ctx,
      args.proposalId,
      args.drawKey,
    );
    const patch = {
      amountCents: Math.max(0, Math.round(args.amountCents)),
      customDate: args.x === undefined ? draw.customDate : true,
      requestNote: args.note,
      requestStatus: "requested" as const,
      requestedAt: new Date().toISOString(),
      timingDay:
        args.x === undefined ? draw.timingDay : Math.max(0, Math.round(args.x)),
      updatedAt: Date.now(),
    };
    await ctx.db.patch(draw._id, patch);
    await writeProposalEvent(ctx, {
      auth,
      command: "submitProductionDrawRequest",
      eventType: "proposal.draw_request.submitted",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(draw),
      proposalId: args.proposalId,
    });
    return null;
  })
  .public();

export const reviewProductionDrawRequest = authenticatedMutation
  .input({
    drawKey: v.string(),
    note: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    await assertProposalCollaborationEditAllowed(ctx, auth);
    const draw = await getProductionDrawOrThrow(
      ctx,
      args.proposalId,
      args.drawKey,
    );
    const patch = {
      requestReviewNote: args.note,
      requestStatus: args.status,
      reviewedAt: new Date().toISOString(),
      updatedAt: Date.now(),
    };
    await ctx.db.patch(draw._id, patch);
    await writeProposalEvent(ctx, {
      auth,
      command: "reviewProductionDrawRequest",
      eventType: "proposal.draw_request.reviewed",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(draw),
      proposalId: args.proposalId,
    });
    return null;
  })
  .public();

export const recordOfflineClosing = authenticatedMutation
  .input({
    buildStartDate: v.string(),
    loanFacility: v.object({
      interestAnnualBps: v.number(),
      principalCents: v.number(),
    }),
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.object({ buildId: v.id("activeBuilds") }))
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, APPROVER_ROLES);
    requireState(auth.proposal, "approved");
    requireReason(args.reason);
    if (!args.buildStartDate.trim()) {
      throw new Error("Closing requires a build start date.");
    }
    if (!auth.proposal.workflowRuleSnapshotId) {
      throw new Error("Approved proposal is missing workflow rule snapshot.");
    }
    const assignedBuilderProfileId = assignedBuilderProfileIdOrThrow(
      auth.proposal,
      "Closing requires an assigned builder.",
    );

    const now = Date.now();
    const permit = await getPermitDocument(ctx, args.proposalId);
    const permitWaiver = await getPermitWaiver(ctx, args.proposalId);
    const buildId = await ctx.db.insert("activeBuilds", {
      brokerageId: auth.brokerage._id,
      buildName: auth.proposal.buildName,
      builderProfileId: assignedBuilderProfileId,
      createdAt: now,
      location: auth.proposal.location,
      organizationId: args.workosOrganizationId,
      permitDocumentId: permit?._id,
      permitWaiverId: permitWaiver?._id,
      proposalId: args.proposalId,
      startDate: args.buildStartDate,
      status:
        new Date(`${args.buildStartDate}T00:00:00Z`).getTime() > now
          ? "future_start"
          : "active",
      timelineMinimumCashReserveCents:
        auth.proposal.timelineMinimumCashReserveCents,
      timelineStartingCashCents: auth.proposal.timelineStartingCashCents,
      totalBudgetCents: auth.proposal.totalBudgetCents,
      updatedAt: now,
      workflowRuleSnapshotId: auth.proposal.workflowRuleSnapshotId,
    });
    await ctx.db.insert("buildBrokerAssignments", {
      assignedBrokerWorkosUserId:
        auth.proposal.assignedBrokerWorkosUserId ?? auth.subject,
      brokerageId: auth.brokerage._id,
      buildId,
      createdAt: now,
      organizationId: args.workosOrganizationId,
      role: "primary",
    });
    await ctx.db.insert("loanFacilities", {
      brokerageId: auth.brokerage._id,
      buildId,
      createdAt: now,
      interestAnnualBps: args.loanFacility.interestAnnualBps,
      interestStartsOn: "funds_released",
      organizationId: args.workosOrganizationId,
      paybackDate: addDaysIso(
        args.buildStartDate,
        auth.proposal.timelineRangeMax ?? 365,
      ),
      principalCents: args.loanFacility.principalCents,
      proposalId: args.proposalId,
      status: "active",
      updatedAt: now,
    });
    await ctx.db.insert("buildCapitalPlans", {
      borrowerCoPayBps: auth.proposal.borrowerCoPayBps,
      borrowerWorkingCapitalLimitCents:
        auth.proposal.borrowerWorkingCapitalLimitCents,
      brokerageId: auth.brokerage._id,
      buildId,
      createdAt: now,
      lenderDrawPolicyLimitCents: auth.proposal.lenderDrawPolicyLimitCents,
      organizationId: args.workosOrganizationId,
      proposalId: args.proposalId,
      source: "proposal_closing_copy",
      updatedAt: now,
      version: 1,
    });

    const milestoneIdByProposalMilestone = new Map<
      string,
      Id<"buildMilestones">
    >();
    const milestoneIdByKey = new Map<string, Id<"buildMilestones">>();
    const submilestoneIdByProposalSubmilestone = new Map<
      string,
      Id<"buildSubmilestones">
    >();
    const milestones = await collectByIndex(
      ctx,
      "proposalMilestones",
      "by_proposal",
      args.proposalId,
    );
    for (const milestone of milestones) {
      const buildMilestoneId = await ctx.db.insert("buildMilestones", {
        brokerageId: auth.brokerage._id,
        budgetCents: milestone.budgetCents,
        buildId,
        completionClaim: milestone.completionClaim,
        completionReview: milestone.completionReview,
        createdAt: now,
        dayEnd: milestone.dayEnd,
        dayStart: milestone.dayStart,
        dependencyKeys: milestone.dependencyKeys,
        drawAvailabilityCents: milestone.drawAvailabilityCents,
        durationDays: milestone.durationDays,
        evidenceState: milestone.evidenceState,
        key: milestone.key,
        name: milestone.name,
        order: milestone.order,
        organizationId: args.workosOrganizationId,
        policyState: milestone.policyState,
        proposalMilestoneId: milestone._id,
        status:
          milestone.completionReview?.status === "approved"
            ? "complete"
            : "planned",
        updatedAt: now,
      });
      milestoneIdByProposalMilestone.set(milestone._id, buildMilestoneId);
      milestoneIdByKey.set(milestone.key, buildMilestoneId);
    }

    const submilestones = await collectByIndex(
      ctx,
      "proposalSubmilestones",
      "by_proposal",
      args.proposalId,
    );
    for (const submilestone of submilestones) {
      const buildMilestoneId = milestoneIdByProposalMilestone.get(
        submilestone.proposalMilestoneId,
      );
      if (!buildMilestoneId) {
        continue;
      }
      const buildSubmilestoneId = await ctx.db.insert("buildSubmilestones", {
        brokerageId: auth.brokerage._id,
        budgetCents: submilestone.budgetCents,
        buildId,
        buildMilestoneId,
        createdAt: now,
        durationDays: submilestone.durationDays,
        key: submilestone.key,
        milestoneKey: submilestone.milestoneKey,
        name: submilestone.name,
        order: submilestone.order,
        organizationId: args.workosOrganizationId,
        proposalSubmilestoneId: submilestone._id,
        startDay: submilestone.startDay,
        status: "planned",
        updatedAt: now,
      });
      submilestoneIdByProposalSubmilestone.set(
        submilestone._id,
        buildSubmilestoneId,
      );
    }

    const draws = await collectByIndex(
      ctx,
      "proposalDrawScheduleRows",
      "by_proposal",
      args.proposalId,
    );
    for (const draw of draws) {
      const buildMilestoneId = draw.proposalMilestoneId
        ? milestoneIdByProposalMilestone.get(draw.proposalMilestoneId)
        : undefined;
      await ctx.db.insert("plannedDrawScheduleRows", {
        amountCents: draw.amountCents,
        brokerageId: auth.brokerage._id,
        buildId,
        buildMilestoneId,
        createdAt: now,
        drawKey: draw.drawKey,
        label: draw.label,
        milestoneKey: draw.milestoneKey,
        order: draw.order,
        organizationId: args.workosOrganizationId,
        proposalDrawScheduleRowId: draw._id,
        requestNote: draw.requestNote,
        requestReviewNote: draw.requestReviewNote,
        requestedAt: draw.requestedAt,
        reviewedAt: draw.reviewedAt,
        status: activeBuildDrawStatusFromProposal(draw.requestStatus),
        timingDay: draw.timingDay,
        updatedAt: now,
      });
    }
    const proposalContractors = await collectByIndex(
      ctx,
      "proposalContractorAssignments",
      "by_proposal",
      args.proposalId,
    );
    const buildContractorAssignmentByProposalAssignment = new Map<
      string,
      Id<"buildContractorAssignments">
    >();
    for (const assignment of proposalContractors) {
      if (assignment.status !== "active") {
        continue;
      }
      const contractor = (await ctx.db.get(
        assignment.contractorId,
      )) as Doc<"contractorProfiles"> | null;
      if (
        !contractor ||
        contractor.brokerageId !== auth.brokerage._id ||
        contractor.status !== "active"
      ) {
        continue;
      }
      const buildContractorAssignmentId = await ctx.db.insert(
        "buildContractorAssignments",
        {
          agreedRateCents:
            assignment.agreedRateCents ?? contractor.defaultPayRateCents,
          agreedRateUnit:
            assignment.agreedRateUnit ??
            contractor.defaultPayRateUnit ??
            "hour",
          brokerageId: auth.brokerage._id,
          buildId,
          contractorId: assignment.contractorId,
          createdAt: now,
          endDate: undefined,
          notes: assignment.notes,
          organizationId: args.workosOrganizationId,
          role: assignment.role,
          startDate: args.buildStartDate,
          status: "active",
          updatedAt: now,
        },
      );
      buildContractorAssignmentByProposalAssignment.set(
        String(assignment._id),
        buildContractorAssignmentId,
      );
    }
    const proposalMilestoneContractors = await collectByIndex(
      ctx,
      "proposalMilestoneContractorAssignments",
      "by_proposal",
      args.proposalId,
    );
    for (const assignment of proposalMilestoneContractors) {
      if (assignment.status === "removed") {
        continue;
      }
      const buildMilestoneId =
        milestoneIdByProposalMilestone.get(
          String(assignment.proposalMilestoneId),
        ) ?? milestoneIdByKey.get(assignment.milestoneKey);
      if (!buildMilestoneId) {
        continue;
      }
      const buildContractorAssignmentId =
        buildContractorAssignmentByProposalAssignment.get(
          String(assignment.proposalContractorAssignmentId),
        );
      if (!buildContractorAssignmentId) {
        continue;
      }
      await ctx.db.insert("milestoneContractorAssignments", {
        actualCostCents: undefined,
        actualHours: undefined,
        agreedRateCents: assignment.agreedRateCents,
        agreedRateUnit: assignment.agreedRateUnit,
        assignedAt: now,
        assignedByWorkosUserId: assignment.assignedByWorkosUserId,
        brokerageId: auth.brokerage._id,
        buildContractorAssignmentId,
        buildId,
        buildMilestoneId,
        buildSubmilestoneId: assignment.proposalSubmilestoneId
          ? submilestoneIdByProposalSubmilestone.get(
              String(assignment.proposalSubmilestoneId),
            )
          : undefined,
        contractorId: assignment.contractorId,
        costNotes: assignment.note,
        createdAt: now,
        estimatedCostCents: assignment.estimatedCostCents,
        estimatedHours: assignment.estimatedHours,
        milestoneKey: assignment.milestoneKey,
        note: assignment.note,
        organizationId: args.workosOrganizationId,
        postHoc: false,
        role: assignment.role,
        status:
          assignment.status === "completed"
            ? "completed"
            : new Date(`${args.buildStartDate}T00:00:00Z`).getTime() > now
              ? "planned"
              : "active",
        submilestoneKey: assignment.submilestoneKey,
        updatedAt: now,
      });
    }
    await copyProposalOperationalRowsToActiveBuild(ctx, {
      auth: {
        brokerage: auth.brokerage,
        roles: auth.roles,
        subject: auth.subject,
      },
      buildId,
      organizationId: args.workosOrganizationId,
      proposalId: args.proposalId,
      now,
    });
    await ctx.db.insert("capitalEvents", {
      amountCents: 0,
      brokerageId: auth.brokerage._id,
      buildId,
      createdAt: now,
      eventDate: args.buildStartDate,
      eventType: "borrower_copay",
      label: "Capital plan opened at loan closing",
      organizationId: args.workosOrganizationId,
    });

    await ctx.db.patch(args.proposalId, {
      activeBuildId: buildId,
      closedAt: now,
      status: "closed",
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await upsertKanbanCard(ctx, args.proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "recordOfflineClosing",
      eventType: "proposal.closed",
      newState: "closed",
      priorState: "approved",
      proposalId: args.proposalId,
      reason: args.reason,
    });
    const build = await ctx.db.get(buildId);
    if (build) {
      await writeActiveBuildEvent(ctx, {
        auth: {
          brokerage: auth.brokerage,
          proposal: auth.proposal,
          roles: auth.roles,
          subject: auth.subject,
        },
        build,
        command: "recordOfflineClosing",
        eventType: "active_build.created",
        newState: JSON.stringify({ buildId, proposalId: args.proposalId }),
        reason: args.reason,
      });
    }
    await ctx.db.insert("eventOutbox", {
      brokerageId: auth.brokerage._id,
      createdAt: now,
      eventType: "active_build.created",
      organizationId: args.workosOrganizationId,
      payloadPreview: JSON.stringify({
        buildId,
        proposalId: args.proposalId,
        startDate: args.buildStartDate,
      }),
      relatedEntityId: buildId,
      relatedEntityType: "activeBuild",
      status: "pending",
    });

    return { buildId };
  })
  .public();

export const createContractorProfile = authenticatedMutation
  .input({
    accountWorkosUserId: v.optional(v.string()),
    availabilityWindows: v.optional(v.array(contractorAvailabilityWindowInput)),
    brokerageId: v.id("brokerages"),
    capabilities: v.optional(v.array(contractorCapabilityInput)),
    city: v.optional(v.string()),
    defaultPayRateCents: v.optional(v.number()),
    defaultPayRateUnit: v.optional(contractorPayRateUnitInput),
    email: v.optional(v.string()),
    equipment: v.optional(v.array(contractorEquipmentInput)),
    kind: v.optional(contractorKindInput),
    name: v.string(),
    phone: v.optional(v.string()),
    trades: v.array(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorProfiles"))
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    if (auth.brokerage._id !== args.brokerageId) {
      throw new Error("Forbidden: brokerage scope");
    }
    const now = Date.now();
    const contractorId = await ctx.db.insert("contractorProfiles", {
      accountWorkosUserId: args.accountWorkosUserId,
      brokerageId: auth.brokerage._id,
      city: normalizeOptionalString(args.city),
      createdAt: now,
      defaultPayRateCents:
        args.defaultPayRateCents === undefined
          ? undefined
          : Math.max(0, Math.round(args.defaultPayRateCents)),
      defaultPayRateUnit: args.defaultPayRateUnit,
      email: args.email,
      kind: args.kind ?? "company",
      name: args.name,
      onboardingStatus: args.accountWorkosUserId
        ? "account_linked"
        : "profile_only",
      organizationId: args.workosOrganizationId,
      phone: args.phone,
      status: "active",
      trades: args.trades,
      updatedAt: now,
    });
    await replaceContractorOperatingRows(ctx, {
      availabilityWindows: args.availabilityWindows ?? [],
      brokerageId: auth.brokerage._id,
      capabilities: args.capabilities ?? [],
      contractorId,
      equipment: args.equipment ?? [],
      now,
      organizationId: args.workosOrganizationId,
    });
    await writeContractorProfileEvent(ctx, {
      auth,
      command: "createContractorProfile",
      contractorId,
      eventType: "contractor.profile.created",
      newState: JSON.stringify({
        accountLinked: Boolean(args.accountWorkosUserId),
        capabilities: args.capabilities?.length ?? 0,
        equipment: args.equipment?.length ?? 0,
        name: args.name,
      }),
      organizationId: args.workosOrganizationId,
    });
    return contractorId;
  })
  .public();

export const updateContractorProfile = authenticatedMutation
  .input({
    accountWorkosUserId: v.optional(v.string()),
    availabilityWindows: v.array(contractorAvailabilityWindowInput),
    capabilities: v.array(contractorCapabilityInput),
    city: v.optional(v.string()),
    contractorId: v.id("contractorProfiles"),
    defaultPayRateCents: v.optional(v.number()),
    defaultPayRateUnit: v.optional(contractorPayRateUnitInput),
    email: v.optional(v.string()),
    equipment: v.array(contractorEquipmentInput),
    kind: v.optional(contractorKindInput),
    name: v.string(),
    phone: v.optional(v.string()),
    trades: v.array(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    const contractor = await getScopedContractorOrThrow(
      ctx,
      args.contractorId,
      auth.brokerage._id,
    );
    const now = Date.now();
    await ctx.db.patch(args.contractorId, {
      accountWorkosUserId: normalizeOptionalString(args.accountWorkosUserId),
      city: normalizeOptionalString(args.city),
      defaultPayRateCents:
        args.defaultPayRateCents === undefined
          ? undefined
          : Math.max(0, Math.round(args.defaultPayRateCents)),
      defaultPayRateUnit: args.defaultPayRateUnit,
      email: normalizeOptionalString(args.email),
      kind: args.kind ?? contractor.kind ?? "company",
      name: args.name.trim() || contractor.name,
      onboardingStatus: args.accountWorkosUserId
        ? "account_linked"
        : contractor.onboardingStatus,
      phone: normalizeOptionalString(args.phone),
      trades: args.trades.map((trade) => trade.trim()).filter(Boolean),
      updatedAt: now,
    });
    await replaceContractorOperatingRows(ctx, {
      availabilityWindows: args.availabilityWindows,
      brokerageId: auth.brokerage._id,
      capabilities: args.capabilities,
      contractorId: args.contractorId,
      equipment: args.equipment,
      now,
      organizationId: args.workosOrganizationId,
    });
    await writeContractorProfileEvent(ctx, {
      auth,
      command: "updateContractorProfile",
      contractorId: args.contractorId,
      eventType: "contractor.profile.updated",
      newState: JSON.stringify({
        capabilities: args.capabilities.length,
        equipment: args.equipment.length,
        name: args.name,
        trades: args.trades,
      }),
      organizationId: args.workosOrganizationId,
      priorState: JSON.stringify({
        accountWorkosUserId: contractor.accountWorkosUserId,
        city: contractor.city,
        defaultPayRateCents: contractor.defaultPayRateCents,
        defaultPayRateUnit: contractor.defaultPayRateUnit,
        email: contractor.email,
        name: contractor.name,
        phone: contractor.phone,
        trades: contractor.trades,
      }),
    });
    return null;
  })
  .public();

export const setContractorProfileStatus = authenticatedMutation
  .input({
    contractorId: v.id("contractorProfiles"),
    reason: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    const contractor = await getScopedContractorOrThrow(
      ctx,
      args.contractorId,
      auth.brokerage._id,
    );
    await ctx.db.patch(args.contractorId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    await writeContractorProfileEvent(ctx, {
      auth,
      command: "setContractorProfileStatus",
      contractorId: args.contractorId,
      eventType:
        args.status === "active"
          ? "contractor.profile.activated"
          : "contractor.profile.deactivated",
      newState: JSON.stringify({ status: args.status }),
      organizationId: args.workosOrganizationId,
      priorState: JSON.stringify({ status: contractor.status }),
      reason: args.reason,
    });
    return null;
  })
  .public();

export const linkContractorIdentity = authenticatedMutation
  .input({
    confidence: v.optional(v.number()),
    linkedContractorId: v.id("contractorProfiles"),
    primaryContractorId: v.id("contractorProfiles"),
    reason: v.optional(v.string()),
    status: contractorIdentityLinkStatusInput,
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorIdentityLinks"))
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    requireAnyRole(auth.roles, APPROVER_ROLES);
    if (args.primaryContractorId === args.linkedContractorId) {
      throw new Error("Contractor identity links require two profiles.");
    }
    const primary = await ctx.db.get(args.primaryContractorId);
    const linked = await ctx.db.get(args.linkedContractorId);
    if (!(primary && linked)) {
      throw new Error("Contractor profile not found for identity link.");
    }
    if (primary.brokerageId !== auth.brokerage._id) {
      throw new Error("Forbidden: primary contractor brokerage scope");
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("contractorIdentityLinks")
      .withIndex("by_primary_linked", (q) =>
        q
          .eq("primaryContractorId", args.primaryContractorId)
          .eq("linkedContractorId", args.linkedContractorId),
      )
      .unique();
    const row = {
      confidence:
        args.confidence === undefined
          ? undefined
          : Math.max(0, Math.min(1, args.confidence)),
      linkedBrokerageId: linked.brokerageId,
      linkedContractorId: args.linkedContractorId,
      linkedOrganizationId: linked.organizationId,
      organizationId: args.workosOrganizationId,
      primaryBrokerageId: primary.brokerageId,
      primaryContractorId: args.primaryContractorId,
      primaryOrganizationId: primary.organizationId,
      reason: normalizeOptionalString(args.reason),
      status: args.status,
      updatedAt: now,
    };
    const linkId = existing
      ? existing._id
      : await ctx.db.insert("contractorIdentityLinks", {
          ...row,
          createdAt: now,
          createdByWorkosUserId: auth.subject,
        });
    if (existing) {
      await ctx.db.patch(existing._id, row);
    }
    await writeContractorProfileEvent(ctx, {
      auth,
      command: "linkContractorIdentity",
      contractorId: args.primaryContractorId,
      eventType: "contractor.identity.linked",
      newState: JSON.stringify({
        linkedContractorId: args.linkedContractorId,
        linkedBrokerageId: linked.brokerageId,
        status: args.status,
      }),
      organizationId: args.workosOrganizationId,
      reason: args.reason,
    });
    return linkId;
  })
  .public();

export const linkContractorProfileToWorkosUser = authenticatedMutation
  .input({
    contractorId: v.id("contractorProfiles"),
    workosOrganizationId: v.string(),
    workosUserId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    const contractor = await getScopedContractorOrThrow(
      ctx,
      args.contractorId,
      auth.brokerage._id,
    );
    const now = Date.now();
    await ctx.db.patch(args.contractorId, {
      accountWorkosUserId: args.workosUserId,
      onboardingStatus: "account_linked",
      updatedAt: now,
    });
    await addContractorRoleToExistingMembership(ctx, {
      now,
      workosOrganizationId: args.workosOrganizationId,
      workosUserId: args.workosUserId,
    });
    await writeContractorProfileEvent(ctx, {
      auth,
      command: "linkContractorProfileToWorkosUser",
      contractorId: args.contractorId,
      eventType: "contractor.profile.account_linked",
      newState: JSON.stringify({ workosUserId: args.workosUserId }),
      organizationId: args.workosOrganizationId,
      priorState: JSON.stringify({
        accountWorkosUserId: contractor.accountWorkosUserId,
      }),
    });
    return null;
  })
  .public();

export const listContractors = authenticatedQuery
  .input({
    capabilityKey: v.optional(v.string()),
    includeInactive: v.optional(v.boolean()),
    search: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    const profiles = await ctx.db
      .query("contractorProfiles")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", auth.brokerage._id))
      .collect();
    const enriched = await hydrateContractorProfiles(
      ctx,
      profiles.filter((profile) =>
        args.includeInactive ? true : profile.status === "active",
      ),
    );
    const search = args.search?.trim().toLowerCase();
    const contractors = enriched
      .filter((contractor) =>
        args.capabilityKey
          ? contractor.capabilities.some(
              (capability: any) =>
                capability.capabilityKey === args.capabilityKey,
            )
          : true,
      )
      .filter((contractor) =>
        search
          ? [
              contractor.name,
              contractor.city,
              contractor.email,
              ...(contractor.trades ?? []),
              ...contractor.capabilities.map(
                (capability: any) => capability.label,
              ),
              ...contractor.equipment.map((equipment: any) => equipment.name),
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(search)
          : true,
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      brokerage: auth.brokerage,
      contractors,
      summary: {
        activeCount: contractors.filter(
          (contractor) => contractor.status === "active",
        ).length,
        capabilityKeys: [
          ...new Set(
            enriched.flatMap((contractor) =>
              contractor.capabilities.map(
                (capability: any) => capability.capabilityKey,
              ),
            ),
          ),
        ].sort(),
        totalCount: contractors.length,
      },
    };
  })
  .public();

export const getContractorDetail = authenticatedQuery
  .input({
    contractorId: v.id("contractorProfiles"),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    const contractor = await getScopedContractorOrThrow(
      ctx,
      args.contractorId,
      auth.brokerage._id,
    );
    if (!isBackoffice(auth.roles)) {
      await assertContractorDetailReadAllowed(ctx, {
        contractor,
        roles: auth.roles,
        subject: auth.subject,
      });
    }
    const [profile] = await hydrateContractorProfiles(ctx, [contractor]);
    const assignments = await ctx.db
      .query("milestoneContractorAssignments")
      .withIndex("by_contractor", (q) =>
        q.eq("contractorId", args.contractorId),
      )
      .collect();
    const proposalAssignments = await ctx.db
      .query("proposalMilestoneContractorAssignments")
      .withIndex("by_contractor", (q) =>
        q.eq("contractorId", args.contractorId),
      )
      .collect();
    const openProposalAssignments = [];
    for (const assignment of proposalAssignments) {
      const proposal = await ctx.db.get(assignment.proposalId);
      if (proposal?.status !== "closed") {
        openProposalAssignments.push(assignment);
      }
    }
    const ratings = await ctx.db
      .query("contractorQualityRatings")
      .withIndex("by_contractor", (q) =>
        q.eq("contractorId", args.contractorId),
      )
      .collect();
    const identityLinks = await contractorIdentityLinkViews(ctx, {
      brokerageId: auth.brokerage._id,
      contractorId: args.contractorId,
    });
    const workHistory = await contractorWorkHistory(ctx, {
      assignments,
      brokerageId: auth.brokerage._id,
      contractorId: args.contractorId,
    });
    return {
      identityLinks,
      intelligence: contractorDetailIntelligence({
        assignments,
        profile,
        proposalAssignments: openProposalAssignments,
        ratings,
      }),
      performance: contractorPerformanceSummary(ratings, assignments),
      profile,
      ratings: ratings
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((rating) => ({
          _id: rating._id,
          buildId: rating.buildId,
          createdAt: rating.createdAt,
          milestoneKey: rating.milestoneKey,
          note: rating.note,
          rating: rating.rating,
          source: rating.source,
          submilestoneKey: rating.submilestoneKey,
        })),
      workHistory,
    };
  })
  .public();

export const attachProposalContractor = authenticatedMutation
  .input({
    agreedRateCents: v.optional(v.number()),
    agreedRateUnit: v.optional(contractorPayRateUnitInput),
    contractorId: v.id("contractorProfiles"),
    endDay: v.optional(v.number()),
    notes: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    role: v.string(),
    startDay: v.optional(v.number()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("proposalContractorAssignments"))
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProposalContractorPlanningWrite(ctx, auth);
    const contractor = await getScopedContractorOrThrow(
      ctx,
      args.contractorId,
      auth.brokerage._id,
    );
    if (contractor.status !== "active") {
      throw new Error("Production contractor is inactive.");
    }
    const assignmentId = await ensureProposalContractorAssignment(ctx, {
      agreedRateCents:
        normalizeOptionalMoneyCents(args.agreedRateCents) ??
        contractor.defaultPayRateCents,
      agreedRateUnit:
        args.agreedRateUnit ?? contractor.defaultPayRateUnit ?? "hour",
      auth,
      contractorId: args.contractorId,
      endDay: args.endDay,
      notes: args.notes,
      proposalId: args.proposalId,
      role: args.role,
      startDay: args.startDay,
      workosOrganizationId: args.workosOrganizationId,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "attachProposalContractor",
      eventType: "proposal.contractor.attached",
      newState: JSON.stringify({
        contractorId: args.contractorId,
        proposalContractorAssignmentId: assignmentId,
        role: args.role,
      }),
      proposalId: args.proposalId,
      reason: args.notes,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return assignmentId;
  })
  .public();

export const createAndAttachProposalContractor = authenticatedMutation
  .input({
    contractor: v.object({
      availabilityWindows: v.optional(
        v.array(contractorAvailabilityWindowInput),
      ),
      capabilities: v.optional(v.array(contractorCapabilityInput)),
      city: v.optional(v.string()),
      defaultPayRateCents: v.optional(v.number()),
      defaultPayRateUnit: v.optional(contractorPayRateUnitInput),
      email: v.optional(v.string()),
      equipment: v.optional(v.array(contractorEquipmentInput)),
      kind: v.optional(contractorKindInput),
      name: v.string(),
      phone: v.optional(v.string()),
      trades: v.array(v.string()),
    }),
    proposalId: v.id("buildProposals"),
    role: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      contractorId: v.id("contractorProfiles"),
      proposalContractorAssignmentId: v.id("proposalContractorAssignments"),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProposalContractorPlanningWrite(ctx, auth);
    const now = Date.now();
    const contractorId = await ctx.db.insert("contractorProfiles", {
      brokerageId: auth.brokerage._id,
      city: normalizeOptionalString(args.contractor.city),
      createdAt: now,
      defaultPayRateCents:
        args.contractor.defaultPayRateCents === undefined
          ? undefined
          : Math.max(0, Math.round(args.contractor.defaultPayRateCents)),
      defaultPayRateUnit: args.contractor.defaultPayRateUnit,
      email: normalizeOptionalString(args.contractor.email),
      kind: args.contractor.kind ?? "company",
      name: args.contractor.name.trim(),
      onboardingStatus: "profile_only",
      organizationId: args.workosOrganizationId,
      phone: normalizeOptionalString(args.contractor.phone),
      status: "active",
      trades: args.contractor.trades
        .map((trade) => trade.trim())
        .filter(Boolean),
      updatedAt: now,
    });
    await replaceContractorOperatingRows(ctx, {
      availabilityWindows: args.contractor.availabilityWindows ?? [],
      brokerageId: auth.brokerage._id,
      capabilities: args.contractor.capabilities ?? [],
      contractorId,
      equipment: args.contractor.equipment ?? [],
      now,
      organizationId: args.workosOrganizationId,
    });
    const role =
      normalizeOptionalString(args.role) ??
      args.contractor.trades[0] ??
      "Contractor";
    const proposalContractorAssignmentId =
      await ensureProposalContractorAssignment(ctx, {
        agreedRateCents: args.contractor.defaultPayRateCents,
        agreedRateUnit: args.contractor.defaultPayRateUnit ?? "hour",
        auth,
        contractorId,
        proposalId: args.proposalId,
        role,
        workosOrganizationId: args.workosOrganizationId,
      });
    await writeContractorProfileEvent(ctx, {
      auth,
      command: "createAndAttachProposalContractor",
      contractorId,
      eventType: "contractor.profile.created",
      newState: JSON.stringify({
        capabilities: args.contractor.capabilities?.length ?? 0,
        createdFromProposalId: args.proposalId,
        equipment: args.contractor.equipment?.length ?? 0,
        name: args.contractor.name,
      }),
      organizationId: args.workosOrganizationId,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "createAndAttachProposalContractor",
      eventType: "proposal.contractor.created_attached",
      newState: JSON.stringify({
        contractorId,
        proposalContractorAssignmentId,
        role,
      }),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return { contractorId, proposalContractorAssignmentId };
  })
  .public();

export const assignProposalContractorToMilestone = authenticatedMutation
  .input({
    agreedRateCents: v.optional(v.number()),
    agreedRateUnit: v.optional(contractorPayRateUnitInput),
    contractorId: v.id("contractorProfiles"),
    estimatedCostCents: v.optional(v.number()),
    estimatedHours: v.optional(v.number()),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    role: v.string(),
    status: v.optional(
      v.union(
        v.literal("planned"),
        v.literal("active"),
        v.literal("completed"),
        v.literal("removed"),
      ),
    ),
    submilestoneKeys: v.optional(v.array(v.string())),
    workosOrganizationId: v.string(),
  })
  .returns(v.array(v.id("proposalMilestoneContractorAssignments")))
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProposalContractorPlanningWrite(ctx, auth);
    const contractor = await getScopedContractorOrThrow(
      ctx,
      args.contractorId,
      auth.brokerage._id,
    );
    if (contractor.status !== "active") {
      throw new Error("Production contractor is inactive.");
    }
    const milestone = await getProductionMilestoneOrThrow(
      ctx,
      args.proposalId,
      args.milestoneKey,
    );
    const proposalContractorAssignmentId =
      await ensureProposalContractorAssignment(ctx, {
        agreedRateCents: args.agreedRateCents ?? contractor.defaultPayRateCents,
        agreedRateUnit:
          args.agreedRateUnit ?? contractor.defaultPayRateUnit ?? "hour",
        auth,
        contractorId: args.contractorId,
        proposalId: args.proposalId,
        preserveExistingRole: true,
        role: args.role,
        workosOrganizationId: args.workosOrganizationId,
      });
    const submilestoneKeys = [...new Set(args.submilestoneKeys ?? [])];
    const targetSubmilestones = await resolveProposalAssignmentSubmilestones(
      ctx,
      {
        milestoneKey: args.milestoneKey,
        proposalId: args.proposalId,
        submilestoneKeys,
      },
    );
    const targets =
      targetSubmilestones.length > 0
        ? targetSubmilestones
        : [{ id: undefined, key: undefined }];
    const now = Date.now();
    const assignmentIds: Id<"proposalMilestoneContractorAssignments">[] = [];
    const agreedRateCents =
      normalizeOptionalMoneyCents(args.agreedRateCents) ??
      contractor.defaultPayRateCents;
    const agreedRateUnit =
      args.agreedRateUnit ?? contractor.defaultPayRateUnit ?? "hour";
    const estimatedHours = normalizeOptionalHours(args.estimatedHours);
    const estimatedCostCents =
      normalizeOptionalMoneyCents(args.estimatedCostCents) ??
      deriveContractorAssignmentCost({
        hours: estimatedHours,
        rateCents: agreedRateCents,
        rateUnit: agreedRateUnit,
      });
    for (const target of targets) {
      const existing = await findProposalMilestoneContractorAssignment(ctx, {
        contractorId: args.contractorId,
        milestoneKey: args.milestoneKey,
        proposalId: args.proposalId,
        submilestoneKey: target.key,
      });
      const row = {
        agreedRateCents,
        agreedRateUnit,
        assignedAt: now,
        assignedByWorkosUserId: auth.subject,
        contractorId: args.contractorId,
        estimatedCostCents,
        estimatedHours,
        milestoneKey: args.milestoneKey,
        note: normalizeOptionalString(args.note),
        proposalContractorAssignmentId,
        proposalMilestoneId: milestone._id,
        proposalSubmilestoneId: target.id,
        role: args.role.trim() || "Contractor",
        status: args.status ?? "planned",
        submilestoneKey: target.key,
        updatedAt: now,
      };
      if (existing) {
        await ctx.db.patch(existing._id, row);
        assignmentIds.push(existing._id);
      } else {
        assignmentIds.push(
          await ctx.db.insert("proposalMilestoneContractorAssignments", {
            ...row,
            brokerageId: auth.brokerage._id,
            createdAt: now,
            organizationId: args.workosOrganizationId,
            proposalId: args.proposalId,
          }),
        );
      }
    }
    await writeProposalEvent(ctx, {
      auth,
      command: "assignProposalContractorToMilestone",
      eventType: "proposal.contractor.milestone_assigned",
      newState: JSON.stringify({
        assignmentIds,
        contractorId: args.contractorId,
        estimatedCostCents,
        milestoneKey: args.milestoneKey,
        submilestoneKeys,
      }),
      proposalId: args.proposalId,
      reason: args.note,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return assignmentIds;
  })
  .public();

export const getBuilderProposalCreateContext = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    if (!isBackoffice(auth.roles)) {
      requireAnyRole(auth.roles, BUILDER_ROLES);
    }

    const builderProfile = isBackoffice(auth.roles)
      ? await ctx.db
          .query("builderProfiles")
          .withIndex("by_brokerage", (q) =>
            q.eq("brokerageId", auth.brokerage._id),
          )
          .filter((q) => q.eq(q.field("status"), "active"))
          .first()
      : await getOwnedBuilderProfile(ctx, auth.brokerage._id, auth.subject);
    if (!builderProfile) {
      throw new Error("Forbidden: builder ownership");
    }

    return {
      availableContractors: await listAvailableContractorOptions(
        ctx,
        auth.brokerage._id,
      ),
      brokerage: auth.brokerage,
      builderProfile,
      templates: await collectProposalTemplateDetails(ctx, auth.brokerage._id),
    };
  })
  .public();

export const getBrokerProposalCreateContext = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);

    return {
      availableContractors: await listAvailableContractorOptions(
        ctx,
        auth.brokerage._id,
      ),
      brokerage: auth.brokerage,
      templates: await collectProposalTemplateDetails(ctx, auth.brokerage._id),
    };
  })
  .public();

export const getBuilderOnboardingState = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(
    v.object({
      builderProfile: v.union(
        v.object({
          _id: v.id("builderProfiles"),
          displayName: v.string(),
        }),
        v.null(),
      ),
      complete: v.boolean(),
      dismissed: v.boolean(),
      hasProfile: v.boolean(),
      hasProposals: v.boolean(),
      isBuilder: v.boolean(),
      proposalCount: v.number(),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    const isBuilder =
      auth.roles.includes("builder") || auth.roles.includes("builder-staff");

    // First-run is a builder concept. Backoffice/admin viewers are never gated.
    const builderProfile = isBuilder
      ? await getOwnedBuilderProfile(ctx, auth.brokerage._id, auth.subject)
      : null;
    const hasProfile = Boolean(builderProfile);

    let proposalCount = 0;
    if (builderProfile) {
      const proposals = await ctx.db
        .query("buildProposals")
        .withIndex("by_builder", (q) =>
          q.eq("builderProfileId", builderProfile._id),
        )
        .collect();
      proposalCount = proposals.length;
    }
    const hasProposals = proposalCount > 0;

    const dismissal = await ctx.db
      .query("builderOnboardingDismissals")
      .withIndex("by_user_org", (q) =>
        q
          .eq("workosUserId", auth.subject)
          .eq("organizationId", args.workosOrganizationId),
      )
      .unique();

    return {
      builderProfile: builderProfile
        ? {
            _id: builderProfile._id,
            displayName: builderProfile.displayName,
          }
        : null,
      // Onboarding is "complete" once the builder has reached first value
      // (a submitted/started proposal) or is not a builder at all.
      complete: !isBuilder || hasProposals,
      dismissed: Boolean(dismissal),
      hasProfile,
      hasProposals,
      isBuilder,
      proposalCount,
    };
  })
  .public();

export const dismissBuilderOnboarding = authenticatedMutation
  .input({ workosOrganizationId: v.string() })
  .returns(v.object({ dismissed: v.literal(true) }))
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    const existing = await ctx.db
      .query("builderOnboardingDismissals")
      .withIndex("by_user_org", (q) =>
        q
          .eq("workosUserId", auth.subject)
          .eq("organizationId", args.workosOrganizationId),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("builderOnboardingDismissals", {
        dismissedAt: Date.now(),
        organizationId: args.workosOrganizationId,
        workosUserId: auth.subject,
      });
    }
    return { dismissed: true as const };
  })
  .public();

export const createDraftProposalClaimLink = authenticatedMutation
  .input({
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      claimPath: v.string(),
      claimToken: v.string(),
      expiresAt: v.number(),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    if (auth.proposal.status !== "draft") {
      throw new Error("Only draft proposals can receive builder claim links.");
    }
    if (auth.proposal.builderProfileId) {
      throw new Error("Proposal is already assigned to a builder.");
    }

    const now = Date.now();
    const activeLinks = await ctx.db
      .query("proposalClaimLinks")
      .withIndex("by_proposal_status", (q) =>
        q.eq("proposalId", args.proposalId).eq("status", "active"),
      )
      .collect();
    for (const link of activeLinks) {
      await ctx.db.patch(link._id, {
        status: "revoked",
        updatedAt: now,
      });
    }

    const claimToken = generateShareToken();
    const expiresAt = now + 1000 * 60 * 60 * 24 * 30;
    await ctx.db.insert("proposalClaimLinks", {
      brokerageId: auth.brokerage._id,
      createdAt: now,
      createdByWorkosUserId: auth.subject,
      expiresAt,
      organizationId: args.workosOrganizationId,
      proposalId: args.proposalId,
      shareTokenHash: await shareTokenHash(claimToken),
      status: "active",
      updatedAt: now,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "createDraftProposalClaimLink",
      eventType: "proposal.claim_link_created",
      newState: JSON.stringify({ expiresAt }),
      proposalId: args.proposalId,
    });

    return {
      claimPath: `/proposal-claim/${claimToken}`,
      claimToken,
      expiresAt,
    };
  })
  .public();

export const getProposalClaimPreview = publicQuery
  .input({ claimToken: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const link = await getProposalClaimLinkByToken(ctx, args.claimToken);
    if (!link) {
      return null;
    }
    const proposal = await ctx.db.get(link.proposalId);
    const brokerage = await ctx.db.get(link.brokerageId);
    if (!proposal || !brokerage) {
      return null;
    }

    const now = Date.now();
    const expired = Boolean(link.expiresAt && link.expiresAt < now);
    const milestones = await collectByIndex(
      ctx,
      "proposalMilestones",
      "by_proposal",
      proposal._id,
    );
    const draws = await collectByIndex(
      ctx,
      "proposalDrawScheduleRows",
      "by_proposal",
      proposal._id,
    );

    return {
      brokerage: {
        displayName: brokerage.displayName,
        legalName: brokerage.legalName,
        workosOrganizationId: brokerage.workosOrganizationId,
      },
      claimStatus: expired ? "expired" : link.status,
      createdAt: link.createdAt,
      drawCount: draws.length,
      expiresAt: link.expiresAt ?? null,
      milestoneCount: milestones.length,
      proposal: {
        borrowerCoPayBps: proposal.borrowerCoPayBps,
        borrowerWorkingCapitalLimitCents:
          proposal.borrowerWorkingCapitalLimitCents,
        buildName: proposal.buildName,
        lenderDrawPolicyLimitCents: proposal.lenderDrawPolicyLimitCents,
        location: proposal.location,
        status: proposal.status,
        totalBudgetCents: proposal.totalBudgetCents,
      },
      workosOrganizationId: link.organizationId,
    };
  })
  .public();

export const claimDraftProposalLink = authenticatedMutation
  .input({
    claimToken: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      builderProfileId: v.id("builderProfiles"),
      proposalId: v.id("buildProposals"),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    if (!canClaimDraftProposal(auth.roles)) {
      throw new Error("Sign in with a builder account to claim this proposal.");
    }

    const link = await getProposalClaimLinkByToken(ctx, args.claimToken);
    if (!link || link.organizationId !== args.workosOrganizationId) {
      throw new Error("Proposal claim link was not found.");
    }
    if (link.status !== "active") {
      throw new Error("Proposal claim link is no longer active.");
    }
    if (link.expiresAt && link.expiresAt < Date.now()) {
      throw new Error("Proposal claim link has expired.");
    }
    if (link.brokerageId !== auth.brokerage._id) {
      throw new Error("Forbidden: proposal claim scope");
    }

    const proposal = await ctx.db.get(link.proposalId);
    if (!proposal || proposal.brokerageId !== auth.brokerage._id) {
      throw new Error("Proposal claim link was not found.");
    }
    if (proposal.status !== "draft") {
      throw new Error("Only draft proposals can be claimed.");
    }
    if (proposal.builderProfileId) {
      throw new Error("Proposal is already assigned to a builder.");
    }

    const now = Date.now();
    const builderProfile = await getOrCreateClaimantBuilderProfile(ctx, {
      auth,
      now,
      proposal,
      workosOrganizationId: args.workosOrganizationId,
    });
    await ensureBuilderRoleProjection(ctx, {
      now,
      workosOrganizationId: args.workosOrganizationId,
      workosUserId: auth.subject,
    });
    await ctx.db.patch(proposal._id, {
      builderProfileId: builderProfile._id,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await ctx.db.patch(link._id, {
      claimedAt: now,
      claimedBuilderProfileId: builderProfile._id,
      claimedByWorkosUserId: auth.subject,
      status: "claimed",
      updatedAt: now,
    });
    await upsertKanbanCard(ctx, proposal._id, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "claimDraftProposalLink",
      eventType: "proposal.builder_claimed",
      newState: JSON.stringify({ builderProfileId: builderProfile._id }),
      priorState: JSON.stringify({ assignment: "unassigned" }),
      proposalId: proposal._id,
    });

    return {
      builderProfileId: builderProfile._id,
      proposalId: proposal._id,
    };
  })
  .public();

export const getProposalDetail = authenticatedQuery
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
    const buildMilestones = activeBuild
      ? await collectByIndex(
          ctx,
          "buildMilestones",
          "by_build",
          activeBuild._id,
        )
      : [];
    const buildSubmilestones = activeBuild
      ? await collectByIndex(
          ctx,
          "buildSubmilestones",
          "by_build",
          activeBuild._id,
        )
      : [];
    const plannedDraws = activeBuild
      ? await collectByIndex(
          ctx,
          "plannedDrawScheduleRows",
          "by_build",
          activeBuild._id,
        )
      : [];

    return {
      activeBuild,
      assignment: await buildProposalIdentityProjection(
        ctx,
        auth.proposal,
        auth.brokerage,
      ),
      auditEvents,
      buildMilestones,
      buildSubmilestones,
      costItems,
      documents: await withDocumentStorageUrls(ctx, documents),
      events,
      milestones,
      permitWaiver,
      plannedDraws,
      proposal: auth.proposal,
      submilestones,
      draws,
    };
  })
  .public();

export const getProductionTimelineWorkspace = authenticatedQuery
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
    const [
      milestoneRows,
      submilestones,
      costItemRows,
      drawRows,
      capitalEventRows,
      documentRows,
      evidenceRows,
      modificationRequests,
      permitWaiver,
    ] = await Promise.all([
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
      collectByIndex(
        ctx,
        "proposalCapitalEvents",
        "by_proposal",
        args.proposalId,
      ),
      collectByIndex(ctx, "proposalDocuments", "by_proposal", args.proposalId),
      collectByIndex(
        ctx,
        "proposalEvidenceAssets",
        "by_proposal",
        args.proposalId,
      ),
      collectByIndex(
        ctx,
        "proposalTimelineModificationRequests",
        "by_proposal",
        args.proposalId,
      ),
      getPermitWaiver(ctx, args.proposalId),
    ]);

    const milestones = [...milestoneRows].sort(
      (a, b) => a.order - b.order || a.key.localeCompare(b.key),
    );
    const draws = [...drawRows].sort(
      (a, b) => a.order - b.order || a.drawKey.localeCompare(b.drawKey),
    );
    const drawByMilestoneKey = new Map(
      draws
        .filter((draw) => draw.milestoneKey)
        .map((draw) => [draw.milestoneKey as string, draw]),
    );
    const maxDay = Math.max(
      60,
      ...milestones.map((milestone) => milestone.dayEnd + 10),
      ...draws.map((draw) => draw.timingDay + 10),
    );
    const currentDay =
      auth.proposal.status === "draft"
        ? (milestones[0]?.dayStart ?? 0)
        : Math.max(
            milestones[0]?.dayStart ?? 0,
            Math.min(
              maxDay,
              Math.round(
                ((auth.proposal.submittedAt ?? auth.proposal.updatedAt) -
                  auth.proposal.createdAt) /
                  86_400_000,
              ),
            ),
          );
    const activeMilestone = firstActiveMilestoneForWorkspace(milestones);

    return {
      activeBuild: auth.proposal.activeBuildId
        ? await ctx.db.get(auth.proposal.activeBuildId)
        : null,
      capitalEvents: [
        {
          amountCents:
            auth.proposal.timelineStartingCashCents ??
            auth.proposal.borrowerWorkingCapitalLimitCents,
          capitalEventKey: "borrower-reserve",
          eventKind: "cashInfusion",
          label: "Borrower reserve",
          x: 0,
        },
        ...[...capitalEventRows]
          .sort((a, b) => a.order - b.order || a.x - b.x)
          .map((event) => ({
            amountCents: event.amountCents,
            capitalEventKey: event.capitalEventKey,
            eventKind: event.eventKind,
            label: event.label,
            x: event.x,
          })),
      ],
      contractorPlanning: await proposalContractorPlanningProjection(ctx, {
        auth,
        documents: documentRows,
        milestones,
        proposalId: args.proposalId,
        submilestones,
      }),
      costItems: [...costItemRows]
        .sort(
          (a, b) =>
            a.milestoneKey.localeCompare(b.milestoneKey) ||
            a.createdAt - b.createdAt,
        )
        .map((item) => ({
          _id: item._id,
          costCents: item.costCents,
          description: item.description,
          itemKey: item.itemKey,
          itemType: item.itemType,
          milestoneKey: item.milestoneKey,
          quantity: item.quantity,
          relevantSubmilestoneKeys: item.relevantSubmilestoneKeys,
          supplier: item.supplier,
          title: item.title,
          totalCents: costItemTotalCents(item),
          updatedAt: item.updatedAt,
        })),
      draws: draws.map((draw) => ({
        amountCents: draw.amountCents,
        customDate: draw.customDate ?? draw.source === "manual",
        drawKey: draw.drawKey,
        itemMilestoneKey: draw.milestoneKey,
        label: draw.label,
        requestNote: draw.requestNote,
        requestReviewNote: draw.requestReviewNote,
        requestStatus: draw.requestStatus,
        reviewedAt: draw.reviewedAt,
        requestedAt: draw.requestedAt,
        x: draw.timingDay,
      })),
      evidenceAssets: await Promise.all(
        [...evidenceRows]
          .sort((a, b) => a.createdAt - b.createdAt)
          .map(async (asset) => ({
            evidenceKey: asset.evidenceKey,
            fileName: asset.fileName,
            label: asset.label,
            milestoneKey: asset.milestoneKey,
            mimeType: asset.mimeType,
            previewUrl: asset.storageId
              ? await ctx.storage.getUrl(asset.storageId)
              : null,
            sizeBytes: asset.sizeBytes,
            submilestoneKey: asset.submilestoneKey,
            tag: asset.tag,
          })),
      ),
      milestones: milestones.map((milestone, index) => {
        const draw = drawByMilestoneKey.get(milestone.key);
        const evidenceState =
          milestone.evidenceState ??
          (evidenceRows.some(
            (asset: any) => asset.milestoneKey === milestone.key,
          )
            ? "Submitted package"
            : milestone.completionClaim
              ? "Completion claimed"
              : "Draft package");
        return {
          budgetCents: milestone.budgetCents,
          completionClaim: productionCompletionClaimView(
            milestone.completionClaim,
          ),
          completionReview: productionCompletionReviewView(
            milestone.completionReview ??
              milestone.completionClaim?.completionReview,
          ),
          dependencyKeys: milestone.dependencyKeys ?? [],
          drawAvailabilityCents: milestone.drawAvailabilityCents,
          drawKey: draw?.label ?? "Reimbursement draw",
          durationDays: milestone.durationDays,
          evidenceState,
          icon:
            milestone.icon ??
            iconForProductionMilestone(milestone.key, milestone.name),
          lane:
            milestone.lane ?? (index % 3 === 1 ? -1 : index % 3 === 2 ? 1 : 0),
          markerLabel: milestone.markerLabel ?? String(index + 1),
          milestoneKey: milestone.key,
          name: milestone.name,
          order: index + 1,
          policyState:
            milestone.policyState ??
            productionPolicyState(auth.proposal, permitWaiver),
          status: productionTimelineStatusForMilestone(
            index,
            auth.proposal,
            milestone,
          ),
          submilestoneSnapshot: submilestones
            .filter(
              (submilestone: any) =>
                submilestone.milestoneKey === milestone.key,
            )
            .sort(
              (a: any, b: any) =>
                a.order - b.order || a.key.localeCompare(b.key),
            )
            .map((submilestone: any) => ({
              ...(submilestone.budgetCents === undefined
                ? {}
                : { budgetCents: submilestone.budgetCents }),
              ...(submilestone.durationDays === undefined
                ? {}
                : { durationDays: submilestone.durationDays }),
              key: submilestone.key,
              name: submilestone.name,
              order: submilestone.order,
              ...(submilestone.startDay === undefined
                ? {}
                : { startDay: submilestone.startDay }),
            })),
          tone: productionTimelineToneForMilestone(
            index,
            auth.proposal,
            milestone,
          ),
          x: milestone.dayStart,
        };
      }),
      modificationRequests: [...modificationRequests]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((request) => ({
          _id: request._id,
          milestoneKey: request.milestoneKey,
          reason: request.reason,
          requestedPayload: request.requestedPayload,
          requestType: request.requestType,
          reviewNote: request.reviewNote,
          status: request.status,
        })),
      permissions: productionTimelinePermissions(auth),
      plan: {
        borrowerCoPayBps: auth.proposal.borrowerCoPayBps,
        borrowerCoPayCents:
          auth.proposal.borrowerCoPayCents ??
          Math.round(
            (auth.proposal.totalBudgetCents * auth.proposal.borrowerCoPayBps) /
              10_000,
          ),
        currentDay: auth.proposal.timelineCurrentDay ?? currentDay,
        progressValue: auth.proposal.timelineProgressValue ?? currentDay,
        rangeMax: auth.proposal.timelineRangeMax ?? maxDay,
        rangeMin: auth.proposal.timelineRangeMin ?? 0,
        routeState: {
          activeMilestoneKey:
            auth.proposal.timelineRouteState?.activeMilestoneKey ??
            activeMilestone?.key,
          selectedPanelOpen:
            auth.proposal.timelineRouteState?.selectedPanelOpen ??
            Boolean(activeMilestone),
          straightLine: auth.proposal.timelineRouteState?.straightLine ?? true,
        },
        minimumCashReserveCents:
          auth.proposal.timelineMinimumCashReserveCents ?? 0,
        startingCashCents:
          auth.proposal.timelineStartingCashCents ??
          auth.proposal.borrowerWorkingCapitalLimitCents,
      },
      planSummary: {
        address: auth.proposal.location,
        includedCount: milestones.length,
        templateTitle: auth.proposal.buildName,
        totalBudget: auth.proposal.totalBudgetCents,
      },
      proposal: auth.proposal,
    };
  })
  .public();

const calendarTimeframeValues = [
  "day",
  "week",
  "month",
  "quarter",
  "agenda",
] as const;

const calendarProviderInput = v.union(
  v.literal("ics"),
  v.literal("google"),
  v.literal("outlook"),
);

const calendarSurfaceInput = v.union(
  v.literal("proposal"),
  v.literal("activeBuild"),
);

const calendarTimeframeInput = v.union(
  v.literal("day"),
  v.literal("week"),
  v.literal("month"),
  v.literal("quarter"),
  v.literal("agenda"),
);

function calendarDateFromMs(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function proposalCalendarBaseDate(proposal: Doc<"buildProposals">) {
  return calendarDateFromMs(proposal.submittedAt ?? proposal.createdAt);
}

function calendarEventId(...parts: Array<number | string | undefined>) {
  return parts.filter((part) => part !== undefined).join(":");
}

function calendarStatusForProposalMilestone(
  proposal: Doc<"buildProposals">,
  milestone: Doc<"proposalMilestones">,
) {
  if (milestone.completionReview?.status === "rejected") {
    return "rejected";
  }
  if (milestone.completionReview?.status === "approved") {
    return "approved";
  }
  if (proposal.status === "draft") {
    return "proposed";
  }
  return "planned";
}

function calendarStatusForActiveMilestone(milestone: Doc<"buildMilestones">) {
  if (milestone.completionReview?.status === "rejected") {
    return "rejected";
  }
  if (milestone.completionReview?.status === "approved") {
    return "approved";
  }
  if (milestone.status === "complete") {
    return "completed";
  }
  if (milestone.status === "in_progress") {
    return "inProgress";
  }
  return "planned";
}

function defaultCalendarSavedViews(surface: "activeBuild" | "proposal") {
  const base = [
    {
      filters: { needsAction: true },
      id: "my-week",
      isDefault: false,
      label: "My week",
      timeframe: "week",
    },
    {
      filters: { eventKinds: ["draw", "drawGroup", "loan"] },
      id: "capital-release",
      isDefault: false,
      label: "Capital release",
      timeframe: "month",
    },
    {
      filters: { eventKinds: ["evidence", "review", "adminDecision"] },
      id: "evidence-review",
      isDefault: false,
      label: "Evidence and review",
      timeframe: "agenda",
    },
    {
      filters: { statuses: ["overdue", "blocked"] },
      id: "overdue-blocked",
      isDefault: false,
      label: "Overdue and blocked",
      timeframe: "agenda",
    },
  ];
  if (surface === "proposal") {
    return [
      {
        filters: { surface: "proposal" },
        id: "proposal-feasibility",
        isDefault: true,
        label: "Proposal feasibility",
        timeframe: "month",
      },
      ...base,
    ];
  }
  return [
    {
      filters: { eventKinds: ["siteVisit"] },
      id: "site-visits",
      isDefault: true,
      label: "Site visits",
      timeframe: "week",
    },
    ...base,
  ];
}

async function userCalendarSavedViews(
  ctx: QueryCtx,
  input: {
    organizationId: string;
    subject: string;
    surface: "activeBuild" | "proposal";
  },
) {
  const savedRows = await ctx.db
    .query("calendarSavedViews")
    .withIndex("by_user_surface", (q) =>
      q
        .eq("organizationId", input.organizationId)
        .eq("workosUserId", input.subject)
        .eq("surface", input.surface),
    )
    .collect();
  const customViews = savedRows.map((view) => ({
    filters: view.filters,
    id: view.viewKey,
    isDefault: view.isDefault,
    label: view.label,
    timeframe: view.timeframe,
  }));
  return [...defaultCalendarSavedViews(input.surface), ...customViews];
}

function proposalCalendarMilestoneEvent(input: {
  baseDate: string;
  milestone: Doc<"proposalMilestones">;
  proposal: Doc<"buildProposals">;
}) {
  const status = calendarStatusForProposalMilestone(
    input.proposal,
    input.milestone,
  );
  return {
    allDay: true,
    auditRequired: input.proposal.status !== "draft",
    editable: {
      canChangeAssignee: false,
      canChangeStatus: false,
      canMove: input.proposal.status !== "closed",
      canResizeEnd: input.proposal.status !== "closed",
      canResizeStart: input.proposal.status !== "closed",
      requiredReason:
        input.proposal.status === "draft" ? "none" : "scheduleChange",
    },
    endsAt: addDaysIso(input.baseDate, input.milestone.dayEnd),
    entity: {
      id: String(input.milestone._id),
      key: input.milestone.key,
      type: "milestone",
    },
    id: calendarEventId("proposal", "milestone", input.milestone.key),
    kind: "milestone",
    metrics: {
      amountCents: input.milestone.drawAvailabilityCents,
      budgetCents: input.milestone.budgetCents,
    },
    milestoneKey: input.milestone.key,
    organizationId: input.milestone.organizationId,
    relatedEntityIds: [String(input.proposal._id)],
    startsAt: addDaysIso(input.baseDate, input.milestone.dayStart),
    status,
    subtitle: `Day ${input.milestone.dayStart} to ${input.milestone.dayEnd}`,
    surface: "proposal",
    timeBucket: "allDay",
    timezone: "America/Toronto",
    title: input.milestone.name,
    warnings:
      input.milestone.dependencyKeys.length > 0
        ? [`Depends on ${input.milestone.dependencyKeys.join(", ")}`]
        : [],
  };
}

function activeBuildCalendarMilestoneEvent(input: {
  build: Doc<"activeBuilds">;
  milestone: Doc<"buildMilestones">;
}) {
  const status = calendarStatusForActiveMilestone(input.milestone);
  return {
    allDay: true,
    auditRequired: true,
    editable: {
      canChangeAssignee: false,
      canChangeStatus: true,
      canMove: status !== "approved" && status !== "completed",
      canResizeEnd: status !== "approved" && status !== "completed",
      canResizeStart: status !== "approved" && status !== "completed",
      requiredReason: "scheduleChange",
    },
    endsAt: addDaysIso(input.build.startDate, input.milestone.dayEnd),
    entity: {
      id: String(input.milestone._id),
      key: input.milestone.key,
      type: "milestone",
    },
    id: calendarEventId("activeBuild", "milestone", input.milestone.key),
    kind: "milestone",
    metrics: {
      amountCents: input.milestone.drawAvailabilityCents,
      budgetCents: input.milestone.budgetCents,
      progressPercent: input.milestone.progressPercent ?? 0,
    },
    milestoneKey: input.milestone.key,
    organizationId: input.milestone.organizationId,
    relatedEntityIds: [String(input.build._id)],
    startsAt: addDaysIso(input.build.startDate, input.milestone.dayStart),
    status,
    subtitle: `Day ${input.milestone.dayStart} to ${input.milestone.dayEnd}`,
    surface: "activeBuild",
    timeBucket: "allDay",
    timezone: "America/Toronto",
    title: input.milestone.name,
    warnings:
      input.milestone.dependencyKeys.length > 0
        ? [`Depends on ${input.milestone.dependencyKeys.join(", ")}`]
        : [],
  };
}

function calendarDrawStatus(status?: string) {
  if (status === "released") {
    return "released";
  }
  if (status === "approved") {
    return "approved";
  }
  if (status === "rejected") {
    return "rejected";
  }
  if (status === "requested") {
    return "submitted";
  }
  return "proposed";
}

function proposalCalendarDrawEvent(input: {
  baseDate: string;
  draw: Doc<"proposalDrawScheduleRows">;
  proposal: Doc<"buildProposals">;
}) {
  return {
    allDay: false,
    auditRequired: input.proposal.status !== "draft",
    drawGroupKey: input.draw.drawKey,
    editable: {
      canChangeAssignee: false,
      canChangeStatus: false,
      canMove: input.proposal.status !== "closed",
      canResizeEnd: false,
      canResizeStart: false,
      requiredReason:
        input.proposal.status === "draft" ? "none" : "scheduleChange",
    },
    entity: {
      id: String(input.draw._id),
      key: input.draw.drawKey,
      type: "draw",
    },
    id: calendarEventId("proposal", "draw", input.draw.drawKey),
    kind: "draw",
    metrics: { amountCents: input.draw.amountCents },
    milestoneKey: input.draw.milestoneKey,
    organizationId: input.draw.organizationId,
    relatedEntityIds: [String(input.proposal._id)],
    startsAt: addDaysIso(input.baseDate, input.draw.timingDay),
    status: calendarDrawStatus(input.draw.requestStatus),
    subtitle: `Draw availability, day ${input.draw.timingDay}`,
    surface: "proposal",
    timeBucket: "endOfDay",
    timezone: "America/Toronto",
    title: input.draw.label,
    warnings: [],
  };
}

function activeBuildCalendarDrawEvent(input: {
  build: Doc<"activeBuilds">;
  draw: Doc<"plannedDrawScheduleRows">;
}) {
  const releaseDate =
    input.draw.releaseDate ??
    input.draw.releasedAt?.slice(0, 10) ??
    addDaysIso(input.build.startDate, input.draw.timingDay);
  return {
    allDay: false,
    auditRequired: input.draw.status !== "planned",
    drawGroupKey: input.draw.drawKey,
    editable: {
      canChangeAssignee: false,
      canChangeStatus: true,
      canMove: input.draw.status !== "released",
      canResizeEnd: false,
      canResizeStart: false,
      immutableReason:
        input.draw.status === "released"
          ? "Released draw timestamps are immutable."
          : undefined,
      requiredReason:
        input.draw.status === "released" ? "none" : "materialDecision",
    },
    entity: {
      id: String(input.draw._id),
      key: input.draw.drawKey,
      type: "draw",
    },
    id: calendarEventId("activeBuild", "draw", input.draw.drawKey),
    kind: "draw",
    metrics: { amountCents: input.draw.amountCents },
    milestoneKey: input.draw.milestoneKey,
    organizationId: input.draw.organizationId,
    relatedEntityIds: [String(input.build._id)],
    startsAt: releaseDate,
    status: calendarDrawStatus(input.draw.status),
    subtitle: `Reimbursement draw, day ${input.draw.timingDay}`,
    surface: "activeBuild",
    timeBucket: "endOfDay",
    timezone: "America/Toronto",
    title: input.draw.label,
    warnings: [],
  };
}

export const getProposalCalendarWorkspace = authenticatedQuery
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
    const [
      milestones,
      submilestones,
      draws,
      evidenceAssets,
      contractorAssignments,
      targetDates,
    ] = await Promise.all([
      collectByIndex(ctx, "proposalMilestones", "by_proposal", args.proposalId),
      collectByIndex(
        ctx,
        "proposalSubmilestones",
        "by_proposal",
        args.proposalId,
      ),
      collectByIndex(
        ctx,
        "proposalDrawScheduleRows",
        "by_proposal",
        args.proposalId,
      ),
      collectByIndex(
        ctx,
        "proposalEvidenceAssets",
        "by_proposal",
        args.proposalId,
      ),
      collectByIndex(
        ctx,
        "proposalContractorAssignments",
        "by_proposal",
        args.proposalId,
      ),
      collectByIndex(
        ctx,
        "calendarTargetDates",
        "by_proposal",
        args.proposalId,
      ),
    ]);
    const baseDate = proposalCalendarBaseDate(auth.proposal);
    const events: any[] = [];
    const sortedMilestones = [...milestones].sort(
      (a, b) => a.order - b.order || a.key.localeCompare(b.key),
    );
    for (const milestone of sortedMilestones) {
      events.push(
        proposalCalendarMilestoneEvent({
          baseDate,
          milestone,
          proposal: auth.proposal,
        }),
      );
    }
    for (const submilestone of submilestones) {
      const parent = sortedMilestones.find(
        (milestone) => milestone.key === submilestone.milestoneKey,
      );
      const startsAt = addDaysIso(baseDate, parent?.dayStart ?? 0);
      events.push({
        allDay: true,
        auditRequired: auth.proposal.status !== "draft",
        editable: {
          canChangeAssignee: false,
          canChangeStatus: false,
          canMove: auth.proposal.status !== "closed",
          canResizeEnd: auth.proposal.status !== "closed",
          canResizeStart: false,
          requiredReason:
            auth.proposal.status === "draft" ? "none" : "scheduleChange",
        },
        endsAt: addDaysIso(
          startsAt,
          Math.max(1, submilestone.durationDays ?? 1),
        ),
        entity: {
          id: String(submilestone._id),
          key: submilestone.key,
          type: "milestone",
        },
        id: calendarEventId("proposal", "submilestone", submilestone.key),
        kind: "submilestone",
        metrics: { budgetCents: submilestone.budgetCents },
        milestoneKey: submilestone.milestoneKey,
        organizationId: submilestone.organizationId,
        relatedEntityIds: [String(args.proposalId)],
        startsAt,
        status: "proposed",
        subtitle: submilestone.milestoneKey,
        surface: "proposal",
        timeBucket: "allDay",
        timezone: "America/Toronto",
        title: submilestone.name,
        warnings: [],
      });
    }
    for (const draw of draws) {
      events.push(
        proposalCalendarDrawEvent({ baseDate, draw, proposal: auth.proposal }),
      );
    }
    for (const event of evidenceAssets) {
      events.push({
        allDay: false,
        auditRequired: false,
        editable: {
          canChangeAssignee: false,
          canChangeStatus: false,
          canMove: false,
          canResizeEnd: false,
          canResizeStart: false,
          requiredReason: "none",
        },
        entity: { id: String(event._id), type: "proposal" },
        id: calendarEventId("proposal", "supporting", String(event._id)),
        kind: "evidence",
        milestoneKey: event.milestoneKey,
        organizationId: event.organizationId,
        relatedEntityIds: [String(args.proposalId)],
        startsAt: baseDate,
        status: "planned",
        subtitle: event.label,
        surface: "proposal",
        timeBucket: "midday",
        timezone: "America/Toronto",
        title: event.fileName,
        warnings: !event.locationVerified ? ["Location unverified"] : [],
      });
    }
    for (const assignment of contractorAssignments) {
      if (
        assignment.startDay === undefined &&
        assignment.endDay === undefined
      ) {
        continue;
      }
      events.push({
        allDay: true,
        auditRequired: false,
        editable: {
          canChangeAssignee: true,
          canChangeStatus: false,
          canMove: true,
          canResizeEnd: true,
          canResizeStart: true,
          requiredReason: "scheduleChange",
        },
        endsAt: addDaysIso(
          baseDate,
          assignment.endDay ?? assignment.startDay ?? 0,
        ),
        entity: { id: String(assignment._id), type: "proposal" },
        id: calendarEventId("proposal", "contractor", String(assignment._id)),
        kind: "contractor",
        organizationId: assignment.organizationId,
        relatedEntityIds: [
          String(args.proposalId),
          String(assignment.contractorId),
        ],
        startsAt: addDaysIso(
          baseDate,
          assignment.startDay ?? assignment.endDay ?? 0,
        ),
        status: assignment.status === "active" ? "planned" : "cancelled",
        subtitle: assignment.role,
        surface: "proposal",
        timeBucket: "allDay",
        timezone: "America/Toronto",
        title: `${assignment.role} contractor window`,
        warnings: [],
      });
    }
    for (const target of targetDates) {
      events.push(calendarTargetDateEvent(target, "proposal"));
    }
    return {
      defaultTimeframe: "month",
      events,
      savedViews: await userCalendarSavedViews(ctx, {
        organizationId: args.workosOrganizationId,
        subject: auth.subject,
        surface: "proposal",
      }),
      source: {
        id: args.proposalId,
        title: auth.proposal.buildName,
        location: auth.proposal.location,
        status: auth.proposal.status,
      },
      surface: "proposal",
      timeframes: calendarTimeframeValues,
      warnings: events.flatMap((event) => event.warnings ?? []),
    };
  })
  .public();

export const getActiveBuildCalendarWorkspace = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    const [
      milestones,
      submilestones,
      draws,
      siteVisits,
      evidenceAssets,
      loanFacilities,
      targetDates,
      auditEvents,
    ] = await Promise.all([
      collectByIndex(ctx, "buildMilestones", "by_build", args.buildId),
      collectByIndex(ctx, "buildSubmilestones", "by_build", args.buildId),
      collectByIndex(ctx, "plannedDrawScheduleRows", "by_build", args.buildId),
      collectByIndex(ctx, "buildSiteVisits", "by_build", args.buildId),
      collectByIndex(ctx, "buildEvidenceAssets", "by_build", args.buildId),
      collectByIndex(ctx, "loanFacilities", "by_build", args.buildId),
      collectByIndex(ctx, "calendarTargetDates", "by_build", args.buildId),
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(args.buildId)),
        )
        .collect(),
    ]);
    const events: any[] = [];
    const sortedMilestones = [...milestones].sort(
      (a, b) => a.order - b.order || a.key.localeCompare(b.key),
    );
    for (const milestone of sortedMilestones) {
      events.push(
        activeBuildCalendarMilestoneEvent({ build: auth.build, milestone }),
      );
    }
    for (const submilestone of submilestones) {
      const parent = sortedMilestones.find(
        (milestone) => milestone.key === submilestone.milestoneKey,
      );
      const startDay = parent?.dayStart ?? 0;
      events.push({
        allDay: true,
        auditRequired: true,
        editable: {
          canChangeAssignee: false,
          canChangeStatus: true,
          canMove: submilestone.status !== "complete",
          canResizeEnd: submilestone.status !== "complete",
          canResizeStart: false,
          requiredReason: "scheduleChange",
        },
        endsAt: addDaysIso(
          auth.build.startDate,
          startDay + Math.max(1, submilestone.durationDays ?? 1),
        ),
        entity: {
          id: String(submilestone._id),
          key: submilestone.key,
          type: "milestone",
        },
        id: calendarEventId("activeBuild", "submilestone", submilestone.key),
        kind: "submilestone",
        metrics: { budgetCents: submilestone.budgetCents },
        milestoneKey: submilestone.milestoneKey,
        organizationId: submilestone.organizationId,
        relatedEntityIds: [String(args.buildId)],
        startsAt: addDaysIso(auth.build.startDate, startDay),
        status:
          submilestone.status === "complete"
            ? "completed"
            : submilestone.status === "in_progress"
              ? "inProgress"
              : "planned",
        subtitle: submilestone.milestoneKey,
        surface: "activeBuild",
        timeBucket: "allDay",
        timezone: "America/Toronto",
        title: submilestone.name,
        warnings: [],
      });
    }
    for (const draw of draws) {
      events.push(activeBuildCalendarDrawEvent({ build: auth.build, draw }));
    }
    for (const visit of siteVisits) {
      events.push({
        allDay: false,
        auditRequired: visit.status !== "requested",
        editable: {
          canChangeAssignee: true,
          canChangeStatus: true,
          canMove: visit.status !== "complete",
          canResizeEnd: false,
          canResizeStart: false,
          requiredReason:
            visit.status === "requested" ? "scheduleChange" : "override",
        },
        entity: { id: String(visit._id), type: "siteVisit" },
        id: calendarEventId("activeBuild", "siteVisit", visit.visitId),
        kind: "siteVisit",
        milestoneKey: visit.milestoneKey,
        organizationId: visit.organizationId,
        relatedEntityIds: [
          String(args.buildId),
          String(visit.buildMilestoneId),
        ],
        startsAt: addDaysIso(auth.build.startDate, visit.requestedDay),
        status:
          visit.status === "complete"
            ? "completed"
            : visit.status === "cancelled"
              ? "cancelled"
              : "planned",
        subtitle: visit.note ?? "Site visit",
        surface: "activeBuild",
        timeBucket: "morning",
        timezone: "America/Toronto",
        title: `Site visit: ${visit.milestoneKey}`,
        warnings:
          visit.tokenExpiresAt < Date.now() && visit.status === "requested"
            ? ["Token expired"]
            : [],
      });
    }
    for (const asset of evidenceAssets) {
      events.push({
        allDay: false,
        auditRequired: !asset.locationVerified,
        editable: {
          canChangeAssignee: false,
          canChangeStatus: !asset.locationVerified,
          canMove: false,
          canResizeEnd: false,
          canResizeStart: false,
          immutableReason: "Evidence upload timestamps are immutable.",
          requiredReason: !asset.locationVerified ? "override" : "none",
        },
        entity: { id: String(asset._id), type: "evidencePackage" },
        id: calendarEventId("activeBuild", "evidence", asset.evidenceKey),
        kind: "evidence",
        milestoneKey: asset.milestoneKey,
        organizationId: asset.organizationId,
        relatedEntityIds: [String(args.buildId)],
        startsAt: calendarDateFromMs(asset.createdAt),
        status: asset.locationVerified ? "submitted" : "inReview",
        subtitle: asset.label,
        surface: "activeBuild",
        timeBucket: "midday",
        timezone: "America/Toronto",
        title: asset.fileName,
        warnings: asset.locationVerified ? [] : ["Location unverified"],
      });
    }
    for (const loan of loanFacilities) {
      if (!loan.paybackDate) {
        continue;
      }
      events.push({
        allDay: true,
        auditRequired: true,
        editable: {
          canChangeAssignee: false,
          canChangeStatus: false,
          canMove: false,
          canResizeEnd: false,
          canResizeStart: false,
          immutableReason: "Payback changes require a facility change request.",
          requiredReason: "materialDecision",
        },
        entity: { id: String(loan._id), type: "loanFacility" },
        id: calendarEventId("activeBuild", "loan", String(loan._id)),
        kind: "loan",
        metrics: { amountCents: loan.principalCents },
        organizationId: loan.organizationId,
        relatedEntityIds: [String(args.buildId)],
        startsAt: loan.paybackDate,
        status: loan.status === "closed" ? "completed" : "planned",
        subtitle: "Loan payback date",
        surface: "activeBuild",
        timeBucket: "endOfDay",
        timezone: "America/Toronto",
        title: "Loan payback",
        warnings: [],
      });
    }
    for (const target of targetDates) {
      events.push(calendarTargetDateEvent(target, "activeBuild"));
    }
    return {
      auditEvents: auditEvents
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((event) => ({
          command: event.command,
          createdAt: event.createdAt,
          eventType: event.eventType,
          reason: event.reason,
        })),
      defaultTimeframe: "week",
      events,
      savedViews: await userCalendarSavedViews(ctx, {
        organizationId: args.workosOrganizationId,
        subject: auth.subject,
        surface: "activeBuild",
      }),
      source: {
        id: args.buildId,
        location: auth.build.location,
        status: auth.build.status,
        title: auth.build.buildName,
      },
      surface: "activeBuild",
      timeframes: calendarTimeframeValues,
      warnings: events.flatMap((event) => event.warnings ?? []),
    };
  })
  .public();

function calendarTargetDateEvent(
  target: Doc<"calendarTargetDates">,
  surface: "activeBuild" | "proposal",
) {
  const kind =
    target.dateKind === "evidenceDue"
      ? "evidence"
      : target.dateKind === "drawReleaseTarget"
        ? "draw"
        : target.dateKind === "adminDecisionTarget"
          ? "adminDecision"
          : "review";
  return {
    allDay: !target.targetTime,
    auditRequired: true,
    drawGroupKey: target.drawKey,
    editable: {
      canChangeAssignee: false,
      canChangeStatus: false,
      canMove: true,
      canResizeEnd: false,
      canResizeStart: false,
      requiredReason: "scheduleChange",
    },
    entity:
      surface === "proposal"
        ? { id: String(target.proposalId), type: "proposal" }
        : { id: String(target.buildId), type: "activeBuild" },
    id: calendarEventId(surface, "target", String(target._id)),
    kind,
    milestoneKey: target.milestoneKey,
    organizationId: target.organizationId,
    relatedEntityIds: [
      target.buildId ? String(target.buildId) : "",
      target.proposalId ? String(target.proposalId) : "",
    ].filter(Boolean),
    startsAt: target.targetDate,
    status: "planned",
    subtitle: target.reason,
    surface,
    timeBucket: target.targetTime ? "afternoon" : "allDay",
    timezone: "America/Toronto",
    title: target.dateKind.replace(
      /[A-Z]/g,
      (letter) => ` ${letter.toLowerCase()}`,
    ),
    warnings: [],
  };
}

async function getProposalMilestoneByKeyOrThrow(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  milestoneKey: string,
) {
  const milestone = await ctx.db
    .query("proposalMilestones")
    .withIndex("by_proposal_key", (q) =>
      q.eq("proposalId", proposalId).eq("key", milestoneKey),
    )
    .unique();
  if (!milestone) {
    throw new Error("Production proposal milestone not found.");
  }
  return milestone;
}

export const reviseProposalMilestoneSchedule = authenticatedMutation
  .input({
    dayEnd: v.number(),
    dayStart: v.number(),
    milestoneKey: v.string(),
    proposalId: v.id("buildProposals"),
    reason: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    if (isBackoffice(auth.roles)) {
      requireBackofficeProposalWrite(auth, auth.proposal);
    } else if (auth.proposal.status !== "draft") {
      throw new Error("Builder proposal calendar edits require a draft.");
    }
    if (auth.proposal.status !== "draft") {
      requireReason(args.reason ?? "");
    }
    if (args.dayStart < 0 || args.dayEnd < args.dayStart) {
      throw new Error("Milestone schedule range is invalid.");
    }
    const milestone = await getProposalMilestoneByKeyOrThrow(
      ctx,
      args.proposalId,
      args.milestoneKey,
    );
    const priorState = {
      dayEnd: milestone.dayEnd,
      dayStart: milestone.dayStart,
      durationDays: milestone.durationDays,
    };
    const newState = {
      dayEnd: Math.round(args.dayEnd),
      dayStart: Math.round(args.dayStart),
      durationDays: Math.max(1, Math.round(args.dayEnd - args.dayStart)),
    };
    const now = Date.now();
    await ctx.db.patch(milestone._id, { ...newState, updatedAt: now });
    await ctx.db.patch(args.proposalId, {
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await ctx.db.insert("scheduleRevisionRecords", {
      brokerageId: auth.brokerage._id,
      createdAt: now,
      entityKey: args.milestoneKey,
      entityType: "proposalMilestone",
      newState,
      organizationId: args.workosOrganizationId,
      priorState,
      proposalId: args.proposalId,
      reason: args.reason ?? "Draft proposal calendar edit.",
      revisedByWorkosUserId: auth.subject,
      revisionType: "proposal.milestone.schedule",
      warnings: [],
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "reviseProposalMilestoneSchedule",
      eventType: "proposal.milestone.schedule_revised",
      newState: JSON.stringify(newState),
      priorState: JSON.stringify(priorState),
      proposalId: args.proposalId,
      reason: args.reason,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const reviseProposalDrawTiming = authenticatedMutation
  .input({
    drawKey: v.string(),
    proposalId: v.id("buildProposals"),
    reason: v.optional(v.string()),
    timingDay: v.number(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    if (isBackoffice(auth.roles)) {
      requireBackofficeProposalWrite(auth, auth.proposal);
    } else if (auth.proposal.status !== "draft") {
      throw new Error("Builder proposal draw timing edits require a draft.");
    }
    if (auth.proposal.status !== "draft") {
      requireReason(args.reason ?? "");
    }
    if (args.timingDay < 0) {
      throw new Error("Draw timing day cannot be negative.");
    }
    const draw = await ctx.db
      .query("proposalDrawScheduleRows")
      .withIndex("by_proposal_key", (q) =>
        q.eq("proposalId", args.proposalId).eq("drawKey", args.drawKey),
      )
      .unique();
    if (!draw) {
      throw new Error("Draw schedule row not found.");
    }
    const now = Date.now();
    const priorState = { timingDay: draw.timingDay };
    const newState = { timingDay: Math.round(args.timingDay) };
    await ctx.db.patch(draw._id, { ...newState, updatedAt: now });
    await writeProposalEvent(ctx, {
      auth,
      command: "reviseProposalDrawTiming",
      eventType: "proposal.draw_timing.revised",
      newState: JSON.stringify(newState),
      priorState: JSON.stringify(priorState),
      proposalId: args.proposalId,
      reason: args.reason,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const reviseActiveBuildMilestoneSchedule = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    dayEnd: v.number(),
    dayStart: v.number(),
    milestoneKey: v.string(),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    requireReason(args.reason);
    if (args.dayStart < 0 || args.dayEnd < args.dayStart) {
      throw new Error("Milestone schedule range is invalid.");
    }
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    const priorState = {
      dayEnd: milestone.dayEnd,
      dayStart: milestone.dayStart,
      durationDays: milestone.durationDays,
    };
    const newState = {
      dayEnd: Math.round(args.dayEnd),
      dayStart: Math.round(args.dayStart),
      durationDays: Math.max(1, Math.round(args.dayEnd - args.dayStart)),
    };
    const now = Date.now();
    await ctx.db.patch(milestone._id, { ...newState, updatedAt: now });
    await ctx.db.insert("scheduleRevisionRecords", {
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      createdAt: now,
      entityKey: args.milestoneKey,
      entityType: "buildMilestone",
      newState,
      organizationId: args.workosOrganizationId,
      priorState,
      proposalId: auth.proposal._id,
      reason: args.reason,
      revisedByWorkosUserId: auth.subject,
      revisionType: "active_build.milestone.schedule",
      warnings: [],
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "reviseActiveBuildMilestoneSchedule",
      eventType: "active_build.milestone.schedule_revised",
      newState: JSON.stringify(newState),
      priorState: JSON.stringify(priorState),
      reason: args.reason,
    });
    return null;
  })
  .public();

async function upsertCalendarTargetDate(
  ctx: MutationCtx,
  input: {
    auth: {
      brokerage: Doc<"brokerages">;
      build?: Doc<"activeBuilds">;
      proposal: Doc<"buildProposals">;
      roles: RoleSlug[];
      subject: string;
    };
    buildId?: Id<"activeBuilds">;
    dateKind:
      | "adminDecisionTarget"
      | "drawReleaseTarget"
      | "evidenceDue"
      | "reviewTarget";
    drawKey?: string;
    entityKey: string;
    entityType: string;
    milestoneKey?: string;
    proposalId?: Id<"buildProposals">;
    reason?: string;
    targetDate: string;
    targetTime?: string;
    workosOrganizationId: string;
  },
) {
  const existing = await ctx.db
    .query("calendarTargetDates")
    .withIndex("by_entity", (q) =>
      q
        .eq("entityType", input.entityType)
        .eq("entityKey", input.entityKey)
        .eq("dateKind", input.dateKind),
    )
    .collect()
    .then((rows) =>
      rows.find(
        (row) =>
          String(row.buildId ?? "") === String(input.buildId ?? "") &&
          String(row.proposalId ?? "") === String(input.proposalId ?? ""),
      ),
    );
  const now = Date.now();
  const payload = {
    brokerageId: input.auth.brokerage._id,
    buildId: input.buildId,
    dateKind: input.dateKind,
    drawKey: input.drawKey,
    entityKey: input.entityKey,
    entityType: input.entityType,
    milestoneKey: input.milestoneKey,
    organizationId: input.workosOrganizationId,
    proposalId: input.proposalId,
    reason: input.reason,
    targetDate: normalizeIsoDate(input.targetDate, "Target date is invalid."),
    targetTime: normalizeOptionalString(input.targetTime),
    updatedAt: now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }
  return await ctx.db.insert("calendarTargetDates", {
    ...payload,
    createdAt: now,
  });
}

const targetDateMutationInput = {
  buildId: v.optional(v.id("activeBuilds")),
  drawKey: v.optional(v.string()),
  milestoneKey: v.optional(v.string()),
  proposalId: v.optional(v.id("buildProposals")),
  reason: v.optional(v.string()),
  targetDate: v.string(),
  targetTime: v.optional(v.string()),
  workosOrganizationId: v.string(),
};

async function authorizeCalendarTargetMutation(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  args: {
    buildId?: Id<"activeBuilds">;
    proposalId?: Id<"buildProposals">;
    workosOrganizationId: string;
  },
) {
  if (args.buildId) {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    return { ...auth, buildId: args.buildId, proposalId: auth.proposal._id };
  }
  if (args.proposalId) {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    if (isBackoffice(auth.roles)) {
      requireBackofficeProposalWrite(auth, auth.proposal);
    }
    return { ...auth, proposalId: args.proposalId };
  }
  throw new Error("Calendar target requires proposalId or buildId.");
}

export const setEvidenceDueDate = authenticatedMutation
  .input(targetDateMutationInput)
  .returns(v.id("calendarTargetDates"))
  .handler(async (ctx, args) => {
    const auth = await authorizeCalendarTargetMutation(ctx, args);
    return await upsertCalendarTargetDate(ctx, {
      auth,
      buildId: args.buildId,
      dateKind: "evidenceDue",
      entityKey: args.milestoneKey ?? "evidence",
      entityType: "evidencePackage",
      milestoneKey: args.milestoneKey,
      proposalId: auth.proposalId,
      reason: args.reason,
      targetDate: args.targetDate,
      targetTime: args.targetTime,
      workosOrganizationId: args.workosOrganizationId,
    });
  })
  .public();

export const setReviewTargetDate = authenticatedMutation
  .input(targetDateMutationInput)
  .returns(v.id("calendarTargetDates"))
  .handler(async (ctx, args) => {
    const auth = await authorizeCalendarTargetMutation(ctx, args);
    return await upsertCalendarTargetDate(ctx, {
      auth,
      buildId: args.buildId,
      dateKind: "reviewTarget",
      entityKey: args.milestoneKey ?? "review",
      entityType: "review",
      milestoneKey: args.milestoneKey,
      proposalId: auth.proposalId,
      reason: args.reason,
      targetDate: args.targetDate,
      targetTime: args.targetTime,
      workosOrganizationId: args.workosOrganizationId,
    });
  })
  .public();

export const setAdminDecisionTargetDate = authenticatedMutation
  .input(targetDateMutationInput)
  .returns(v.id("calendarTargetDates"))
  .handler(async (ctx, args) => {
    const auth = await authorizeCalendarTargetMutation(ctx, args);
    return await upsertCalendarTargetDate(ctx, {
      auth,
      buildId: args.buildId,
      dateKind: "adminDecisionTarget",
      entityKey: args.milestoneKey ?? "adminDecision",
      entityType: "adminDecision",
      milestoneKey: args.milestoneKey,
      proposalId: auth.proposalId,
      reason: args.reason,
      targetDate: args.targetDate,
      targetTime: args.targetTime,
      workosOrganizationId: args.workosOrganizationId,
    });
  })
  .public();

export const setDrawReleaseTargetDate = authenticatedMutation
  .input(targetDateMutationInput)
  .returns(v.id("calendarTargetDates"))
  .handler(async (ctx, args) => {
    const auth = await authorizeCalendarTargetMutation(ctx, args);
    requireReason(args.reason ?? "");
    return await upsertCalendarTargetDate(ctx, {
      auth,
      buildId: args.buildId,
      dateKind: "drawReleaseTarget",
      drawKey: args.drawKey,
      entityKey: args.drawKey ?? "draw",
      entityType: "draw",
      proposalId: auth.proposalId,
      reason: args.reason,
      targetDate: args.targetDate,
      targetTime: args.targetTime,
      workosOrganizationId: args.workosOrganizationId,
    });
  })
  .public();

export const scheduleActiveBuildSiteVisit = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    requestedDay: v.number(),
    requestedTime: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    const now = Date.now();
    const requestedDay = Math.max(0, Math.round(args.requestedDay));
    const visitId = `active_visit_${args.milestoneKey}_${now}`;
    const siteVisit = {
      note: args.note,
      requestedAt: new Date(now).toISOString(),
      requestedDay,
      requestedTime: normalizeOptionalString(args.requestedTime),
      status: "requested",
      tokenExpiresAt: now + 60 * 60 * 1000,
      url: `/newsitevisit/${String(args.buildId)}/${visitId}`,
      visitId,
    };
    await ctx.db.insert("buildSiteVisits", {
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      buildMilestoneId: milestone._id,
      createdAt: now,
      milestoneKey: args.milestoneKey,
      note: args.note,
      organizationId: args.workosOrganizationId,
      requestedAt: siteVisit.requestedAt,
      requestedDay,
      status: "requested",
      tokenExpiresAt: siteVisit.tokenExpiresAt,
      updatedAt: now,
      url: siteVisit.url,
      visitId,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "scheduleActiveBuildSiteVisit",
      eventType: "site_visit.scheduled",
      newState: JSON.stringify(siteVisit),
      priorState: JSON.stringify(milestone.completionReview),
      reason: args.note,
    });
    return siteVisit;
  })
  .public();

export const rescheduleActiveBuildSiteVisit = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    note: v.optional(v.string()),
    reason: v.string(),
    requestedDay: v.number(),
    requestedTime: v.optional(v.string()),
    visitId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    requireReason(args.reason);
    const visit = await ctx.db
      .query("buildSiteVisits")
      .withIndex("by_visit", (q) => q.eq("visitId", args.visitId))
      .unique();
    if (!visit || visit.buildId !== args.buildId) {
      throw new Error("Site visit not found.");
    }
    const priorState = JSON.stringify(visit);
    const requestedDay = Math.max(0, Math.round(args.requestedDay));
    await ctx.db.patch(visit._id, {
      note: args.note ?? visit.note,
      requestedDay,
      updatedAt: Date.now(),
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "rescheduleActiveBuildSiteVisit",
      eventType: "site_visit.rescheduled",
      newState: JSON.stringify({
        requestedDay,
        requestedTime: args.requestedTime,
        visitId: args.visitId,
      }),
      priorState,
      reason: args.reason,
    });
    return null;
  })
  .public();

export const cancelActiveBuildSiteVisit = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    reason: v.string(),
    visitId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    requireReason(args.reason);
    const visit = await ctx.db
      .query("buildSiteVisits")
      .withIndex("by_visit", (q) => q.eq("visitId", args.visitId))
      .unique();
    if (!visit || visit.buildId !== args.buildId) {
      throw new Error("Site visit not found.");
    }
    await ctx.db.patch(visit._id, {
      status: "cancelled",
      updatedAt: Date.now(),
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "cancelActiveBuildSiteVisit",
      eventType: "calendar.event.cancelled",
      newState: JSON.stringify({ status: "cancelled", visitId: args.visitId }),
      priorState: JSON.stringify(visit),
      reason: args.reason,
    });
    return null;
  })
  .public();

export const requestLoanFacilityDateChange = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    reason: v.string(),
    requestedPaybackDate: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("activeBuildFacilityChangeRequests"))
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireReason(args.reason);
    const loanFacility = await getPrimaryLoanFacility(ctx, args.buildId);
    if (!loanFacility) {
      throw new Error("Active build loan facility is missing.");
    }
    const requestedPaybackDate = normalizeIsoDate(
      args.requestedPaybackDate,
      "Requested payback date is required.",
    );
    const now = Date.now();
    const requestId = await ctx.db.insert("activeBuildFacilityChangeRequests", {
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      createdAt: now,
      organizationId: args.workosOrganizationId,
      priorState: {
        paybackDate: loanFacility.paybackDate,
        principalCents: loanFacility.principalCents,
      },
      proposalId: auth.proposal._id,
      reason: args.reason,
      requestedByWorkosUserId: auth.subject,
      requestedPayload: { requestedPaybackDate },
      requestType: "paybackExtension",
      status: "requested",
      updatedAt: now,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "requestLoanFacilityDateChange",
      eventType: "active_build.facility_change.requested",
      newState: JSON.stringify({ requestId, requestedPaybackDate }),
      priorState: JSON.stringify({
        paybackDate: loanFacility.paybackDate,
        principalCents: loanFacility.principalCents,
      }),
      reason: args.reason,
    });
    return requestId;
  })
  .public();

export const saveCalendarView = authenticatedMutation
  .input({
    filters: v.any(),
    isDefault: v.optional(v.boolean()),
    label: v.string(),
    surface: calendarSurfaceInput,
    timeframe: calendarTimeframeInput,
    viewKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("calendarSavedViews"))
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    const now = Date.now();
    const existing = await ctx.db
      .query("calendarSavedViews")
      .withIndex("by_view_key", (q) =>
        q
          .eq("organizationId", args.workosOrganizationId)
          .eq("workosUserId", auth.subject)
          .eq("viewKey", args.viewKey),
      )
      .unique();
    const payload = {
      filters: args.filters,
      isDefault: args.isDefault ?? false,
      label: args.label.trim() || args.viewKey,
      surface: args.surface,
      timeframe: args.timeframe,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("calendarSavedViews", {
      ...payload,
      brokerageId: auth.brokerage._id,
      createdAt: now,
      organizationId: args.workosOrganizationId,
      viewKey: args.viewKey,
      workosUserId: auth.subject,
    });
  })
  .public();

export const createCalendarSyncSubscription = authenticatedMutation
  .input({
    direction: v.optional(
      v.union(v.literal("outbound"), v.literal("bidirectional")),
    ),
    filters: v.any(),
    provider: calendarProviderInput,
    surface: calendarSurfaceInput,
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      feedUrl: v.string(),
      subscriptionId: v.id("calendarSyncSubscriptions"),
      subscriptionKey: v.string(),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    const now = Date.now();
    const subscriptionKey = `cal_${args.provider}_${auth.subject.replace(/[^a-zA-Z0-9]/g, "_")}_${now}`;
    const subscriptionId = await ctx.db.insert("calendarSyncSubscriptions", {
      brokerageId: auth.brokerage._id,
      createdAt: now,
      direction: args.direction ?? "outbound",
      filters: args.filters,
      organizationId: args.workosOrganizationId,
      provider: args.provider,
      status: "active",
      subscriptionKey,
      surface: args.surface,
      updatedAt: now,
      workosUserId: auth.subject,
    });
    await ctx.db.insert("eventOutbox", {
      brokerageId: auth.brokerage._id,
      createdAt: now,
      eventType: "calendar.sync_subscription.created",
      organizationId: args.workosOrganizationId,
      payloadPreview: JSON.stringify({
        provider: args.provider,
        subscriptionKey,
        surface: args.surface,
      }),
      relatedEntityId: String(subscriptionId),
      relatedEntityType: "calendarSyncSubscription",
      status: "pending",
    });
    return {
      feedUrl: `/api/calendar/${subscriptionKey}.ics`,
      subscriptionId,
      subscriptionKey,
    };
  })
  .public();

export const recordExternalCalendarSyncChange = authenticatedMutation
  .input({
    changeKey: v.string(),
    externalEventId: v.optional(v.string()),
    payload: v.any(),
    provider: calendarProviderInput,
    subscriptionKey: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("calendarSyncChanges"))
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    const subscription = args.subscriptionKey
      ? await ctx.db
          .query("calendarSyncSubscriptions")
          .withIndex("by_subscription_key", (q) =>
            q.eq("subscriptionKey", args.subscriptionKey as string),
          )
          .unique()
      : null;
    const now = Date.now();
    return await ctx.db.insert("calendarSyncChanges", {
      brokerageId: auth.brokerage._id,
      changeKey: args.changeKey,
      createdAt: now,
      externalEventId: args.externalEventId,
      organizationId: args.workosOrganizationId,
      payload: args.payload,
      provider: args.provider,
      status: "pendingReview",
      subscriptionId: subscription?._id,
      updatedAt: now,
      workosUserId: auth.subject,
    });
  })
  .public();

export const getProposalDetailByString = authenticatedQuery
  .input({
    proposalId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const proposalId = ctx.db.normalizeId("buildProposals", args.proposalId);
    if (!proposalId) {
      return null;
    }
    const auth = await authorizeProposal(
      ctx,
      proposalId,
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
      collectByIndex(ctx, "proposalDocuments", "by_proposal", proposalId),
      collectByIndex(ctx, "proposalMilestones", "by_proposal", proposalId),
      collectByIndex(ctx, "proposalSubmilestones", "by_proposal", proposalId),
      collectByIndex(ctx, "proposalCostItems", "by_proposal", proposalId),
      collectByIndex(
        ctx,
        "proposalDrawScheduleRows",
        "by_proposal",
        proposalId,
      ),
      collectByIndex(ctx, "proposalEvents", "by_proposal", proposalId),
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "buildProposal").eq("entityId", proposalId),
        )
        .collect(),
      getPermitWaiver(ctx, proposalId),
    ]);
    const activeBuild = auth.proposal.activeBuildId
      ? await ctx.db.get(auth.proposal.activeBuildId)
      : null;
    const buildMilestones = activeBuild
      ? await collectByIndex(
          ctx,
          "buildMilestones",
          "by_build",
          activeBuild._id,
        )
      : [];
    const buildSubmilestones = activeBuild
      ? await collectByIndex(
          ctx,
          "buildSubmilestones",
          "by_build",
          activeBuild._id,
        )
      : [];
    const plannedDraws = activeBuild
      ? await collectByIndex(
          ctx,
          "plannedDrawScheduleRows",
          "by_build",
          activeBuild._id,
        )
      : [];

    return {
      activeBuild,
      assignment: await buildProposalIdentityProjection(
        ctx,
        auth.proposal,
        auth.brokerage,
      ),
      auditEvents,
      buildMilestones,
      buildSubmilestones,
      costItems,
      documents: await withDocumentStorageUrls(ctx, documents),
      draws,
      events,
      milestones,
      permitWaiver,
      plannedDraws,
      proposal: auth.proposal,
      submilestones,
    };
  })
  .public();

export const listProposalKanban = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScope(ctx, args.workosOrganizationId);
    if (!scope.brokerage) {
      requireAnyRole(scope.roles, BACKOFFICE_ROLES);
      return {
        columns: emptyProposalKanbanColumns(),
        provisioningRequired: true,
      };
    }
    const auth = {
      brokerage: scope.brokerage,
      roles: scope.roles,
      subject: scope.subject,
    };
    const cards = isBackoffice(auth.roles)
      ? await visibleBackofficeCards(ctx, auth)
      : await visibleBuilderCards(ctx, auth);
    const enriched = await Promise.all(
      cards.map(async (card) => {
        const proposal = await ctx.db.get(card.proposalId);
        return {
          ...card,
          activeBuildId: proposal?.activeBuildId,
          builderAssigned: Boolean(proposal?.builderProfileId),
        };
      }),
    );
    return {
      columns: PROPOSAL_COLUMNS.map((id) => ({
        cards: enriched.filter((card) => card.column === id),
        id,
        name: titleCase(id),
      })),
    };
  })
  .public();

export const getBackofficeDashboard = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScope(ctx, args.workosOrganizationId);
    if (!isBackoffice(scope.roles)) {
      throw new Error("Forbidden: backoffice");
    }
    if (!scope.brokerage) {
      throw new Error("Forbidden: brokerage");
    }
    const auth = {
      brokerage: scope.brokerage,
      roles: scope.roles,
      subject: scope.subject,
    };
    const staffCanRead =
      auth.roles.includes("broker-staff") &&
      (await hasPermission(
        ctx,
        auth.brokerage.workosOrganizationId,
        auth.roles,
        "proposals:read",
      ));

    const proposalCards = await visibleBackofficeCards(ctx, auth);
    const proposalRows: Array<{
      card: Awaited<ReturnType<typeof visibleBackofficeCards>>[number];
      proposal: Doc<"buildProposals">;
    }> = [];
    for (const card of proposalCards) {
      const proposal = await ctx.db.get(card.proposalId);
      if (!proposal) {
        continue;
      }
      proposalRows.push({ card, proposal });
    }

    const activeBuildRows = await ctx.db
      .query("activeBuilds")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", auth.brokerage._id))
      .take(50);
    const visibleActiveBuilds: Array<{
      build: Doc<"activeBuilds">;
      builder: Doc<"builderProfiles"> | null;
      draws: Doc<"plannedDrawScheduleRows">[];
      milestones: Doc<"buildMilestones">[];
      proposal: Doc<"buildProposals">;
    }> = [];
    for (const build of activeBuildRows) {
      const proposal = await ctx.db.get(build.proposalId);
      if (!proposal) {
        continue;
      }
      if (!(canReadBackofficeProposal(auth, proposal) || staffCanRead)) {
        continue;
      }
      const [builder, milestones, draws] = await Promise.all([
        ctx.db.get(build.builderProfileId),
        ctx.db
          .query("buildMilestones")
          .withIndex("by_build_order", (q) => q.eq("buildId", build._id))
          .take(100),
        ctx.db
          .query("plannedDrawScheduleRows")
          .withIndex("by_build_order", (q) => q.eq("buildId", build._id))
          .take(100),
      ]);
      visibleActiveBuilds.push({
        build,
        builder,
        draws,
        milestones,
        proposal,
      });
    }

    const activeBuilds = visibleActiveBuilds.map(
      ({ build, builder, milestones }) => {
        const activeMilestone =
          milestones.find((milestone) => milestone.status !== "complete") ??
          milestones[0];
        return {
          activeMilestone:
            activeMilestone?.name ?? `${milestones.length} milestones`,
          address: build.location,
          buildKey: String(build._id),
          builder: builder?.displayName ?? "Builder",
          daysActive: productionDaysActive(build.startDate),
          href: `/backoffice/builds/${build._id}`,
          id: productionBuildDisplayId(build),
          milestoneState: activeMilestone
            ? productionMilestoneState(activeMilestone.status)
            : "backlog",
          status: productionBuildDashboardStatus(build.status),
          statusLabel: productionBuildStatusLabel(build.status),
        };
      },
    );

    const drawRequests = visibleActiveBuilds.flatMap(({ build, draws }) =>
      draws
        .filter((draw) => draw.status === "requested")
        .map((draw) => ({
          address: build.location,
          buildId: productionBuildDisplayId(build),
          buildKey: String(build._id),
          eligibleDate: `Day ${draw.timingDay}`,
          href: `/backoffice/builds/${build._id}`,
          id: String(draw._id),
          label: draw.label,
          requestedAmount: centsToCurrency(draw.amountCents),
          statusLabel: "Requested",
        })),
    );

    const milestones = visibleActiveBuilds.flatMap(({ build, milestones }) =>
      milestones
        .filter(productionMilestoneNeedsBackofficeReview)
        .map((milestone) => ({
          address: build.location,
          buildId: productionBuildDisplayId(build),
          buildKey: String(build._id),
          column: productionMilestoneColumn(milestone),
          dueLabel: `Day ${milestone.dayEnd}`,
          href: `/backoffice/builds/${build._id}?milestone=${milestone.key}`,
          id: String(milestone._id),
          milestoneKey: milestone.key,
          name: milestone.name,
          priority: productionMilestonePriority(milestone),
        })),
    );

    const proposals = proposalRows.map(({ card, proposal }) =>
      productionDashboardProposalCard(card, proposal),
    );
    const submittedProposals = proposalRows
      .filter(
        ({ proposal }) =>
          proposal.status === "submitted" &&
          proposal.reviewOutcome !== "rejected",
      )
      .map(({ card, proposal }) =>
        productionDashboardProposalCard(card, proposal),
      );
    const approvedPendingClosing = proposalRows
      .filter(
        ({ proposal }) =>
          proposal.status === "approved" &&
          proposal.activeBuildId === undefined,
      )
      .map(({ card, proposal }) =>
        productionDashboardProposalCard(card, proposal),
      );

    const proposalColumns = PROPOSAL_COLUMNS.map((id) => ({
      description: productionProposalColumnDescription(id, proposals),
      id,
      name: titleCase(id),
    }));
    const milestoneColumns = [
      {
        description: "Builder marked complete; triage",
        id: "backlog",
        name: "Backlog",
      },
      {
        description: "Visit ordered or requested",
        id: "needsSiteVisit",
        name: "Needs site visit",
      },
      {
        description: "Visit picked up and scheduled",
        id: "inProgress",
        name: "In progress",
      },
      {
        description: "Pending staff approval",
        id: "inReview",
        name: "In review",
      },
    ];

    return {
      activeBuilds,
      approvedPendingClosing,
      drawRequests,
      metrics: [
        {
          detail: `${drawRequests.length} production draw requests awaiting review`,
          id: "draw-requests",
          label: "Draw requests",
          tone: drawRequests.length > 0 ? "warning" : "success",
          trend: "Production plannedDrawScheduleRows",
          value: drawRequests.length,
        },
        {
          detail: `${activeBuilds.length} production active builds after closing`,
          id: "active-builds",
          label: "Active builds",
          tone: activeBuilds.length > 0 ? "success" : "default",
          trend: "Only activeBuilds created by loan closing",
          value: activeBuilds.length,
        },
        {
          detail: `${proposals.length} production Build Proposals`,
          id: "proposals",
          label: "Proposals",
          tone: "default",
          trend: `${approvedPendingClosing.length} approved pending closing`,
          value: proposals.length,
        },
        {
          detail: `${milestones.length} production active-build milestones`,
          id: "milestones",
          label: "Milestones",
          tone: "success",
          trend: "Only buildMilestones from active builds",
          value: milestones.length,
        },
      ],
      milestoneColumns,
      milestones,
      proposalColumns,
      proposals,
      quickActions: [],
      scheduleDate: new Date().toISOString(),
      scheduleEvents: [],
      submittedProposals,
    };
  })
  .public();

const siteVisitOperationalStatusValidator = v.union(
  v.literal("open"),
  v.literal("in_field"),
  v.literal("expired"),
  v.literal("complete"),
  v.literal("cancelled"),
);

export const listBrokerageSiteVisits = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(
    v.object({
      builds: v.array(
        v.object({
          activeVisitCount: v.number(),
          buildDisplayId: v.string(),
          buildId: v.id("activeBuilds"),
          buildName: v.string(),
          builderName: v.string(),
          href: v.string(),
          location: v.string(),
          visits: v.array(
            v.object({
              buildDisplayId: v.string(),
              buildHref: v.string(),
              buildId: v.id("activeBuilds"),
              buildName: v.string(),
              builderName: v.string(),
              completedAt: v.optional(v.string()),
              geofenceFlagged: v.boolean(),
              location: v.string(),
              milestoneKey: v.string(),
              milestoneName: v.string(),
              milestoneReviewStatus: v.optional(v.string()),
              note: v.optional(v.string()),
              operationalStatus: siteVisitOperationalStatusValidator,
              recordNote: v.optional(v.string()),
              recordNoteFormat: v.optional(
                v.union(v.literal("plain_text"), v.literal("html")),
              ),
              recommendedOutcome: v.optional(v.string()),
              requestedAt: v.string(),
              requestedDay: v.number(),
              scheduledDateLabel: v.string(),
              tokenExpiresAt: v.number(),
              tokenMsRemaining: v.number(),
              tokenOpenedAt: v.optional(v.number()),
              tokenState: v.union(
                v.literal("not_sent"),
                v.literal("live"),
                v.literal("opened"),
                v.literal("consumed"),
                v.literal("expired"),
              ),
              updatedAt: v.number(),
              url: v.string(),
              visitId: v.string(),
            }),
          ),
        }),
      ),
      summary: v.object({
        cancelled: v.number(),
        complete: v.number(),
        expiringWithin15Min: v.number(),
        expired: v.number(),
        geofenceFlagged: v.number(),
        inField: v.number(),
        open: v.number(),
        total: v.number(),
      }),
      visits: v.array(
        v.object({
          buildDisplayId: v.string(),
          buildHref: v.string(),
          buildId: v.id("activeBuilds"),
          buildName: v.string(),
          builderName: v.string(),
          completedAt: v.optional(v.string()),
          geofenceFlagged: v.boolean(),
          location: v.string(),
          milestoneKey: v.string(),
          milestoneName: v.string(),
          milestoneReviewStatus: v.optional(v.string()),
          note: v.optional(v.string()),
          operationalStatus: siteVisitOperationalStatusValidator,
          recordNote: v.optional(v.string()),
          recordNoteFormat: v.optional(
            v.union(v.literal("plain_text"), v.literal("html")),
          ),
          recommendedOutcome: v.optional(v.string()),
          requestedAt: v.string(),
          requestedDay: v.number(),
          scheduledDateLabel: v.string(),
          tokenExpiresAt: v.number(),
          tokenMsRemaining: v.number(),
          tokenOpenedAt: v.optional(v.number()),
          tokenState: v.union(
            v.literal("not_sent"),
            v.literal("live"),
            v.literal("opened"),
            v.literal("consumed"),
            v.literal("expired"),
          ),
          updatedAt: v.number(),
          url: v.string(),
          visitId: v.string(),
        }),
      ),
    }),
  )
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScope(ctx, args.workosOrganizationId);
    if (!isBackoffice(scope.roles)) {
      throw new Error("Forbidden: backoffice");
    }
    if (!scope.brokerage) {
      throw new Error("Forbidden: brokerage");
    }
    const brokerageId = scope.brokerage._id;
    const now = Date.now();
    const visitRows = await ctx.db
      .query("buildSiteVisits")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", brokerageId))
      .collect();
    const scopedVisits = visitRows.filter(
      (visit) => visit.organizationId === args.workosOrganizationId,
    );
    scopedVisits.sort((a, b) => b.updatedAt - a.updatedAt);

    const buildIds = [...new Set(scopedVisits.map((visit) => visit.buildId))];
    const builds = new Map<Id<"activeBuilds">, Doc<"activeBuilds"> | null>();
    const builders = new Map<
      Id<"builderProfiles">,
      Doc<"builderProfiles"> | null
    >();
    const milestones = new Map<string, Doc<"buildMilestones"> | null>();
    const geofenceByMilestone = new Map<string, boolean>();

    await Promise.all(
      buildIds.map(async (buildId) => {
        const build = await ctx.db.get(buildId);
        builds.set(buildId, build);
        if (build?.builderProfileId) {
          if (!builders.has(build.builderProfileId)) {
            builders.set(
              build.builderProfileId,
              await ctx.db.get(build.builderProfileId),
            );
          }
        }
        const evidenceAssets = await ctx.db
          .query("buildEvidenceAssets")
          .withIndex("by_build", (q) => q.eq("buildId", buildId))
          .collect();
        for (const asset of evidenceAssets) {
          if (asset.locationVerified) {
            continue;
          }
          const key = `${String(buildId)}:${asset.milestoneKey}`;
          geofenceByMilestone.set(key, true);
        }
      }),
    );

    await Promise.all(
      scopedVisits.map(async (visit) => {
        const milestoneKey = `${String(visit.buildId)}:${visit.milestoneKey}`;
        if (milestones.has(milestoneKey)) {
          return;
        }
        milestones.set(milestoneKey, await ctx.db.get(visit.buildMilestoneId));
      }),
    );

    const visits = scopedVisits.map((visit) => {
      const build = builds.get(visit.buildId);
      const builder =
        build?.builderProfileId != null
          ? builders.get(build.builderProfileId)
          : null;
      const milestone =
        milestones.get(`${String(visit.buildId)}:${visit.milestoneKey}`) ??
        null;
      const tokenState = productionSiteVisitTokenState(visit, now);
      const operationalStatus = productionSiteVisitOperationalStatus(
        visit,
        now,
      );
      const geofenceFlagged =
        geofenceByMilestone.get(
          `${String(visit.buildId)}:${visit.milestoneKey}`,
        ) ?? false;
      const scheduledDateLabel = build
        ? productionSiteVisitScheduledLabel(build.startDate, visit.requestedDay)
        : `Day ${visit.requestedDay}`;
      return {
        buildDisplayId: build ? productionBuildDisplayId(build) : "Build",
        buildHref: `/backoffice/builds/${String(visit.buildId)}`,
        buildId: visit.buildId,
        buildName: build?.buildName ?? "Unknown build",
        builderName: builder?.displayName ?? "Builder",
        completedAt: visit.completedAt,
        geofenceFlagged,
        location: build?.location ?? "",
        milestoneKey: visit.milestoneKey,
        milestoneName: milestone?.name ?? visit.milestoneKey,
        milestoneReviewStatus: milestone?.completionReview?.status,
        note: visit.note,
        operationalStatus,
        recordNote: visit.recordNote,
        recordNoteFormat: visit.recordNoteFormat,
        recommendedOutcome:
          milestone?.completionReview?.siteVisit?.recommendedOutcome,
        requestedAt: visit.requestedAt,
        requestedDay: visit.requestedDay,
        scheduledDateLabel,
        tokenExpiresAt: visit.tokenExpiresAt,
        tokenMsRemaining: Math.max(0, visit.tokenExpiresAt - now),
        tokenOpenedAt: visit.tokenOpenedAt,
        tokenState,
        updatedAt: visit.updatedAt,
        url: visit.url,
        visitId: visit.visitId,
      };
    });

    visits.sort((a, b) => {
      const urgency = productionSiteVisitUrgencyRank(a.operationalStatus);
      const urgencyB = productionSiteVisitUrgencyRank(b.operationalStatus);
      if (urgency !== urgencyB) {
        return urgency - urgencyB;
      }
      if (a.operationalStatus === "expired" || a.operationalStatus === "open") {
        return a.tokenMsRemaining - b.tokenMsRemaining;
      }
      return b.updatedAt - a.updatedAt;
    });

    const summary = {
      cancelled: visits.filter(
        (visit) => visit.operationalStatus === "cancelled",
      ).length,
      complete: visits.filter((visit) => visit.operationalStatus === "complete")
        .length,
      expiringWithin15Min: visits.filter(
        (visit) =>
          visit.operationalStatus === "open" &&
          visit.tokenMsRemaining > 0 &&
          visit.tokenMsRemaining <= 15 * 60 * 1000,
      ).length,
      expired: visits.filter((visit) => visit.operationalStatus === "expired")
        .length,
      geofenceFlagged: visits.filter((visit) => visit.geofenceFlagged).length,
      inField: visits.filter((visit) => visit.operationalStatus === "in_field")
        .length,
      open: visits.filter((visit) => visit.operationalStatus === "open").length,
      total: visits.length,
    };

    const buildsGrouped = new Map<
      string,
      {
        activeVisitCount: number;
        buildDisplayId: string;
        buildId: Id<"activeBuilds">;
        buildName: string;
        builderName: string;
        href: string;
        location: string;
        visits: typeof visits;
      }
    >();
    for (const visit of visits) {
      const key = String(visit.buildId);
      const existing = buildsGrouped.get(key);
      const isActive =
        visit.operationalStatus === "open" ||
        visit.operationalStatus === "in_field" ||
        visit.operationalStatus === "expired";
      if (existing) {
        existing.visits.push(visit);
        if (isActive) {
          existing.activeVisitCount += 1;
        }
        continue;
      }
      buildsGrouped.set(key, {
        activeVisitCount: isActive ? 1 : 0,
        buildDisplayId: visit.buildDisplayId,
        buildId: visit.buildId,
        buildName: visit.buildName,
        builderName: visit.builderName,
        href: visit.buildHref,
        location: visit.location,
        visits: [visit],
      });
    }

    const buildsOut = [...buildsGrouped.values()].sort((a, b) => {
      if (a.activeVisitCount !== b.activeVisitCount) {
        return b.activeVisitCount - a.activeVisitCount;
      }
      return a.buildName.localeCompare(b.buildName);
    });

    return { builds: buildsOut, summary, visits };
  })
  .public();

const productionBuildDrawStatusValidator = v.union(
  v.literal("planned"),
  v.literal("requested"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("released"),
);

const brokerageDrawRowValidator = v.object({
  amountCents: v.number(),
  buildDisplayId: v.string(),
  buildHref: v.string(),
  buildId: v.id("activeBuilds"),
  buildName: v.string(),
  builderName: v.string(),
  drawId: v.id("plannedDrawScheduleRows"),
  drawKey: v.string(),
  label: v.string(),
  location: v.string(),
  milestoneKey: v.optional(v.string()),
  milestoneName: v.optional(v.string()),
  requestNote: v.optional(v.string()),
  requestReviewNote: v.optional(v.string()),
  requestedAt: v.optional(v.string()),
  reviewedAt: v.optional(v.string()),
  releaseDate: v.optional(v.string()),
  releasedAt: v.optional(v.string()),
  scheduledDateIso: v.string(),
  scheduledDateLabel: v.string(),
  status: productionBuildDrawStatusValidator,
  timingDay: v.number(),
  updatedAt: v.number(),
});

export const listBrokerageDraws = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(
    v.object({
      builds: v.array(
        v.object({
          buildDisplayId: v.string(),
          buildId: v.id("activeBuilds"),
          buildName: v.string(),
          builderName: v.string(),
          draws: v.array(brokerageDrawRowValidator),
          href: v.string(),
          location: v.string(),
          openDrawCount: v.number(),
        }),
      ),
      chartSeries: v.array(
        v.object({
          approvedCents: v.number(),
          periodKey: v.string(),
          periodLabel: v.string(),
          plannedCents: v.number(),
          releasedCents: v.number(),
          requestedCents: v.number(),
        }),
      ),
      draws: v.array(brokerageDrawRowValidator),
      exposureSnapshot: v.array(
        v.object({
          amountCents: v.number(),
          label: v.string(),
          status: productionBuildDrawStatusValidator,
        }),
      ),
      summary: v.object({
        approved: v.number(),
        exposureApprovedCents: v.number(),
        exposureRequestedCents: v.number(),
        planned: v.number(),
        rejected: v.number(),
        released: v.number(),
        releasedCents: v.number(),
        requested: v.number(),
        total: v.number(),
        upcomingPlannedCents: v.number(),
      }),
    }),
  )
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScope(ctx, args.workosOrganizationId);
    if (!isBackoffice(scope.roles)) {
      throw new Error("Forbidden: backoffice");
    }
    if (!scope.brokerage) {
      throw new Error("Forbidden: brokerage");
    }
    const auth = {
      brokerage: scope.brokerage,
      roles: scope.roles,
      subject: scope.subject,
    };
    const staffCanRead =
      auth.roles.includes("broker-staff") &&
      (await hasPermission(
        ctx,
        auth.brokerage.workosOrganizationId,
        auth.roles,
        "proposals:read",
      ));

    const activeBuildRows = await ctx.db
      .query("activeBuilds")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", auth.brokerage._id))
      .collect();
    const scopedBuilds = activeBuildRows.filter(
      (build) => build.organizationId === args.workosOrganizationId,
    );

    const builders = new Map<
      Id<"builderProfiles">,
      Doc<"builderProfiles"> | null
    >();
    const milestones = new Map<string, Doc<"buildMilestones"> | null>();
    const draws: Array<{
      amountCents: number;
      buildDisplayId: string;
      buildHref: string;
      buildId: Id<"activeBuilds">;
      buildName: string;
      builderName: string;
      drawId: Id<"plannedDrawScheduleRows">;
      drawKey: string;
      label: string;
      location: string;
      milestoneKey?: string;
      milestoneName?: string;
      requestNote?: string;
      requestReviewNote?: string;
      requestedAt?: string;
      reviewedAt?: string;
      releaseDate?: string;
      releasedAt?: string;
      scheduledDateIso: string;
      scheduledDateLabel: string;
      status: Doc<"plannedDrawScheduleRows">["status"];
      timingDay: number;
      updatedAt: number;
    }> = [];

    for (const build of scopedBuilds) {
      const proposal = await ctx.db.get(build.proposalId);
      if (!proposal) {
        continue;
      }
      if (!(canReadBackofficeProposal(auth, proposal) || staffCanRead)) {
        continue;
      }
      if (!builders.has(build.builderProfileId)) {
        builders.set(
          build.builderProfileId,
          await ctx.db.get(build.builderProfileId),
        );
      }
      const builder = builders.get(build.builderProfileId);
      const drawRows = await ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build_order", (q) => q.eq("buildId", build._id))
        .collect();

      for (const draw of drawRows) {
        const milestoneKey = draw.milestoneKey;
        let milestone: Doc<"buildMilestones"> | null = null;
        if (milestoneKey) {
          const milestoneCacheKey = `${String(build._id)}:${milestoneKey}`;
          if (!milestones.has(milestoneCacheKey)) {
            const milestoneRows = await ctx.db
              .query("buildMilestones")
              .withIndex("by_build_key", (q) =>
                q.eq("buildId", build._id).eq("key", milestoneKey),
              )
              .take(1);
            milestones.set(milestoneCacheKey, milestoneRows[0] ?? null);
          }
          milestone = milestones.get(milestoneCacheKey) ?? null;
        }
        const scheduledDateIso =
          draw.releaseDate ??
          draw.releasedAt?.slice(0, 10) ??
          addDaysIso(build.startDate, draw.timingDay);
        draws.push({
          amountCents: draw.amountCents,
          buildDisplayId: productionBuildDisplayId(build),
          buildHref: `/backoffice/builds/${String(build._id)}?tab=timeline&draw=${draw.drawKey}`,
          buildId: build._id,
          buildName: build.buildName,
          builderName: builder?.displayName ?? "Builder",
          drawId: draw._id,
          drawKey: draw.drawKey,
          label: draw.label,
          location: build.location,
          milestoneKey,
          milestoneName: milestone?.name,
          requestNote: draw.requestNote,
          requestReviewNote: draw.requestReviewNote,
          requestedAt: draw.requestedAt,
          reviewedAt: draw.reviewedAt,
          releaseDate: draw.releaseDate,
          releasedAt: draw.releasedAt,
          scheduledDateIso,
          scheduledDateLabel: scheduledDateIso,
          status: draw.status,
          timingDay: draw.timingDay,
          updatedAt: draw.updatedAt,
        });
      }
    }

    draws.sort((a, b) => {
      const urgency = productionDrawUrgencyRank(a.status);
      const urgencyB = productionDrawUrgencyRank(b.status);
      if (urgency !== urgencyB) {
        return urgency - urgencyB;
      }
      if (a.status === "requested" || a.status === "approved") {
        return b.updatedAt - a.updatedAt;
      }
      return a.scheduledDateIso.localeCompare(b.scheduledDateIso);
    });

    const summary = {
      approved: draws.filter((draw) => draw.status === "approved").length,
      exposureApprovedCents: draws
        .filter((draw) => draw.status === "approved")
        .reduce((sum, draw) => sum + draw.amountCents, 0),
      exposureRequestedCents: draws
        .filter((draw) => draw.status === "requested")
        .reduce((sum, draw) => sum + draw.amountCents, 0),
      planned: draws.filter((draw) => draw.status === "planned").length,
      rejected: draws.filter((draw) => draw.status === "rejected").length,
      released: draws.filter((draw) => draw.status === "released").length,
      releasedCents: draws
        .filter((draw) => draw.status === "released")
        .reduce((sum, draw) => sum + draw.amountCents, 0),
      requested: draws.filter((draw) => draw.status === "requested").length,
      total: draws.length,
      upcomingPlannedCents: draws
        .filter((draw) => draw.status === "planned")
        .reduce((sum, draw) => sum + draw.amountCents, 0),
    };

    const exposureSnapshot = (
      [
        ["requested", "Under review"],
        ["approved", "Approved to release"],
        ["planned", "Upcoming planned"],
        ["released", "Released"],
        ["rejected", "Rejected"],
      ] as const
    ).map(([status, label]) => ({
      amountCents: draws
        .filter((draw) => draw.status === status)
        .reduce((sum, draw) => sum + draw.amountCents, 0),
      label,
      status,
    }));

    const chartSeries = buildBrokerageDrawChartSeries(draws);

    const buildsGrouped = new Map<
      string,
      {
        buildDisplayId: string;
        buildId: Id<"activeBuilds">;
        buildName: string;
        builderName: string;
        draws: typeof draws;
        href: string;
        location: string;
        openDrawCount: number;
      }
    >();
    for (const draw of draws) {
      const key = String(draw.buildId);
      const isOpen =
        draw.status === "requested" ||
        draw.status === "approved" ||
        draw.status === "planned";
      const existing = buildsGrouped.get(key);
      if (existing) {
        existing.draws.push(draw);
        if (isOpen) {
          existing.openDrawCount += 1;
        }
        continue;
      }
      buildsGrouped.set(key, {
        buildDisplayId: draw.buildDisplayId,
        buildId: draw.buildId,
        buildName: draw.buildName,
        builderName: draw.builderName,
        draws: [draw],
        href: `/backoffice/builds/${String(draw.buildId)}?tab=timeline`,
        location: draw.location,
        openDrawCount: isOpen ? 1 : 0,
      });
    }

    const buildsOut = [...buildsGrouped.values()].sort((a, b) => {
      if (a.openDrawCount !== b.openDrawCount) {
        return b.openDrawCount - a.openDrawCount;
      }
      return a.buildName.localeCompare(b.buildName);
    });

    return {
      builds: buildsOut,
      chartSeries,
      draws,
      exposureSnapshot,
      summary,
    };
  })
  .public();

const buildRosterPhaseValidator = v.union(
  v.literal("scheduled"),
  v.literal("active"),
  v.literal("attention"),
  v.literal("completed"),
);

export const listBackofficeBuildRoster = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(
    v.object({
      builds: v.array(
        v.object({
          buildId: v.id("activeBuilds"),
          buildName: v.string(),
          buildStatus: v.union(v.literal("active"), v.literal("future_start")),
          buildStatusLabel: v.string(),
          builderName: v.string(),
          closedAt: v.optional(v.number()),
          daysActive: v.number(),
          displayId: v.string(),
          drawRequestsPending: v.number(),
          href: v.string(),
          loanStatus: v.optional(
            v.union(v.literal("active"), v.literal("closed")),
          ),
          location: v.string(),
          milestonesComplete: v.number(),
          milestonesInReview: v.number(),
          milestonesTotal: v.number(),
          activeMilestoneName: v.string(),
          phase: buildRosterPhaseValidator,
          proposalStatus: v.union(
            v.literal("approved"),
            v.literal("closed"),
            v.literal("draft"),
            v.literal("submitted"),
          ),
          siteVisitsExpired: v.number(),
          siteVisitsOpen: v.number(),
          startDate: v.string(),
          totalBudgetCents: v.number(),
          updatedAt: v.number(),
        }),
      ),
      summary: v.object({
        active: v.number(),
        attention: v.number(),
        completed: v.number(),
        scheduled: v.number(),
        total: v.number(),
      }),
    }),
  )
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScope(ctx, args.workosOrganizationId);
    if (!isBackoffice(scope.roles)) {
      throw new Error("Forbidden: backoffice");
    }
    if (!scope.brokerage) {
      throw new Error("Forbidden: brokerage");
    }
    const auth = {
      brokerage: scope.brokerage,
      roles: scope.roles,
      subject: scope.subject,
    };
    const staffCanRead =
      auth.roles.includes("broker-staff") &&
      (await hasPermission(
        ctx,
        auth.brokerage.workosOrganizationId,
        auth.roles,
        "proposals:read",
      ));
    const now = Date.now();
    const brokerageId = auth.brokerage._id;

    const [buildRows, visitRows] = await Promise.all([
      ctx.db
        .query("activeBuilds")
        .withIndex("by_brokerage", (q) => q.eq("brokerageId", brokerageId))
        .collect(),
      ctx.db
        .query("buildSiteVisits")
        .withIndex("by_brokerage", (q) => q.eq("brokerageId", brokerageId))
        .collect(),
    ]);

    const visitsByBuild = new Map<
      string,
      {
        expired: number;
        open: number;
      }
    >();
    for (const visit of visitRows) {
      if (visit.organizationId !== args.workosOrganizationId) {
        continue;
      }
      const key = String(visit.buildId);
      const bucket = visitsByBuild.get(key) ?? { expired: 0, open: 0 };
      const operationalStatus = productionSiteVisitOperationalStatus(
        visit,
        now,
      );
      if (operationalStatus === "expired") {
        bucket.expired += 1;
      }
      if (operationalStatus === "open" || operationalStatus === "in_field") {
        bucket.open += 1;
      }
      visitsByBuild.set(key, bucket);
    }

    const rosterBuilds: Array<{
      buildId: Id<"activeBuilds">;
      buildName: string;
      buildStatus: Doc<"activeBuilds">["status"];
      buildStatusLabel: string;
      builderName: string;
      closedAt?: number;
      daysActive: number;
      displayId: string;
      drawRequestsPending: number;
      href: string;
      loanStatus?: "active" | "closed";
      location: string;
      milestonesComplete: number;
      milestonesInReview: number;
      milestonesTotal: number;
      activeMilestoneName: string;
      phase: "scheduled" | "active" | "attention" | "completed";
      proposalStatus: Doc<"buildProposals">["status"];
      siteVisitsExpired: number;
      siteVisitsOpen: number;
      startDate: string;
      totalBudgetCents: number;
      updatedAt: number;
    }> = [];

    for (const build of buildRows) {
      if (build.organizationId !== args.workosOrganizationId) {
        continue;
      }
      const proposal = await ctx.db.get(build.proposalId);
      if (!proposal) {
        continue;
      }
      if (!(canReadBackofficeProposal(auth, proposal) || staffCanRead)) {
        continue;
      }

      const [builder, milestones, draws, loan] = await Promise.all([
        ctx.db.get(build.builderProfileId),
        ctx.db
          .query("buildMilestones")
          .withIndex("by_build_order", (q) => q.eq("buildId", build._id))
          .take(100),
        ctx.db
          .query("plannedDrawScheduleRows")
          .withIndex("by_build_order", (q) => q.eq("buildId", build._id))
          .take(100),
        ctx.db
          .query("loanFacilities")
          .withIndex("by_build", (q) => q.eq("buildId", build._id))
          .unique(),
      ]);

      const visitCounts = visitsByBuild.get(String(build._id)) ?? {
        expired: 0,
        open: 0,
      };
      const milestonesComplete = milestones.filter(
        (milestone) => milestone.status === "complete",
      ).length;
      const milestonesInReview = milestones.filter(
        productionMilestoneNeedsBackofficeReview,
      ).length;
      const drawRequestsPending = draws.filter(
        (draw) => draw.status === "requested",
      ).length;
      const activeMilestone =
        milestones.find((milestone) => milestone.status !== "complete") ??
        milestones[0];

      const phase = productionBuildRosterPhase({
        build,
        drawRequestsPending,
        expiredSiteVisits: visitCounts.expired,
        loan,
        milestones,
        milestonesInReview,
      });

      rosterBuilds.push({
        activeMilestoneName:
          activeMilestone?.name ?? `${milestones.length} milestones`,
        buildId: build._id,
        buildName: build.buildName,
        buildStatus: build.status,
        buildStatusLabel: productionBuildStatusLabel(build.status),
        builderName: builder?.displayName ?? "Builder",
        ...(proposal.closedAt !== undefined
          ? { closedAt: proposal.closedAt }
          : {}),
        daysActive: productionDaysActive(build.startDate),
        displayId: productionBuildDisplayId(build),
        drawRequestsPending,
        href: `/backoffice/builds/${build._id}`,
        ...(loan ? { loanStatus: loan.status } : {}),
        location: build.location,
        milestonesComplete,
        milestonesInReview,
        milestonesTotal: milestones.length,
        phase,
        proposalStatus: proposal.status,
        siteVisitsExpired: visitCounts.expired,
        siteVisitsOpen: visitCounts.open,
        startDate: build.startDate,
        totalBudgetCents: build.totalBudgetCents,
        updatedAt: build.updatedAt,
      });
    }

    rosterBuilds.sort((a, b) => b.updatedAt - a.updatedAt);

    const summary = {
      active: rosterBuilds.filter((row) => row.phase === "active").length,
      attention: rosterBuilds.filter((row) => row.phase === "attention").length,
      completed: rosterBuilds.filter((row) => row.phase === "completed").length,
      scheduled: rosterBuilds.filter((row) => row.phase === "scheduled").length,
      total: rosterBuilds.length,
    };

    return { builds: rosterBuilds, summary };
  })
  .public();

export const listUnassignedDraftProposals = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);

    const staffCanRead =
      auth.roles.includes("broker-staff") &&
      (await hasPermission(
        ctx,
        auth.brokerage.workosOrganizationId,
        auth.roles,
        "proposals:read",
      ));
    const proposals = await ctx.db
      .query("buildProposals")
      .withIndex("by_brokerage_status_builder", (q) =>
        q
          .eq("brokerageId", auth.brokerage._id)
          .eq("status", "draft")
          .eq("builderProfileId", undefined),
      )
      .order("desc")
      .take(100);
    const visible = [];

    for (const proposal of proposals) {
      if (!(canReadBackofficeProposal(auth, proposal) || staffCanRead)) {
        continue;
      }
      const card = await ctx.db
        .query("proposalKanbanCards")
        .withIndex("by_proposal", (q) => q.eq("proposalId", proposal._id))
        .unique();
      visible.push(productionDashboardProposalCard(card, proposal));
    }

    return {
      drafts: visible,
      total: visible.length,
    };
  })
  .public();

export const listBrokerageBuilders = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(
    v.array(
      v.object({
        _id: v.id("builderProfiles"),
        displayName: v.string(),
        email: v.optional(v.string()),
        workosUserIds: v.array(v.string()),
      }),
    ),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    const builders = await ctx.db
      .query("builderProfiles")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", auth.brokerage._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
    const options = [];
    for (const builder of builders) {
      const accounts = await builderAccountSummaries(ctx, builder._id);
      const email =
        accounts.find((account) => account.role === "owner")?.email ??
        accounts[0]?.email;
      options.push({
        _id: builder._id,
        displayName: builder.displayName,
        ...(email ? { email } : {}),
        workosUserIds: accounts.map((account) => account.workosUserId),
      });
    }
    return options.sort((a, b) => a.displayName.localeCompare(b.displayName));
  })
  .public();

export const assignDraftBuilder = authenticatedMutation
  .input({
    builderProfileId: v.id("builderProfiles"),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    if (auth.proposal.status !== "draft") {
      throw new Error("Only draft proposals can be assigned to a builder.");
    }
    if (auth.proposal.builderProfileId) {
      throw new Error("Proposal is already assigned to a builder.");
    }
    await assertBuilderProfileScope(
      ctx,
      args.builderProfileId,
      auth.brokerage._id,
    );

    const now = Date.now();
    await ctx.db.patch(args.proposalId, {
      builderProfileId: args.builderProfileId,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await upsertKanbanCard(ctx, args.proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "assignDraftBuilder",
      eventType: "proposal.builder_assigned",
      newState: JSON.stringify({ builderProfileId: args.builderProfileId }),
      priorState: JSON.stringify({ assignment: "unassigned" }),
      proposalId: args.proposalId,
    });
    return null;
  })
  .public();

export const deleteDraftProposal = authenticatedMutation
  .input({
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    if (auth.proposal.status !== "draft") {
      throw new Error("Only draft proposals can be deleted.");
    }

    await writeProposalEvent(ctx, {
      auth,
      command: "deleteDraftProposal",
      eventType: "proposal.deleted",
      priorState: JSON.stringify({
        builderProfileId: auth.proposal.builderProfileId ?? null,
        buildName: auth.proposal.buildName,
        status: auth.proposal.status,
      }),
      proposalId: args.proposalId,
    });

    await deleteProposalPlanChildren(ctx, args.proposalId);
    for (const table of ["proposalDocuments", "documentWaivers"] as const) {
      const rows = await collectByIndex(
        ctx,
        table,
        "by_proposal",
        args.proposalId,
      );
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
    }
    const participants = await collectByIndex(
      ctx,
      "proposalCollaborationParticipants",
      "by_proposal",
      args.proposalId,
    );
    for (const participant of participants) {
      await ctx.db.delete(participant._id);
    }
    const sessions = await collectByIndex(
      ctx,
      "proposalCollaborationSessions",
      "by_proposal",
      args.proposalId,
    );
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }
    const card = await ctx.db
      .query("proposalKanbanCards")
      .withIndex("by_proposal", (q) => q.eq("proposalId", args.proposalId))
      .unique();
    if (card) {
      await ctx.db.delete(card._id);
    }
    await ctx.db.delete(args.proposalId);
    return null;
  })
  .public();

export const deleteActiveBuild = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    requireReason(args.reason);
    const priorState = JSON.stringify({
      buildName: auth.build.buildName,
      location: auth.build.location,
      proposalId: auth.build.proposalId,
      status: auth.build.status,
    });
    await deleteActiveBuildCascade(ctx, args.buildId);
    const now = Date.now();
    if (auth.proposal.activeBuildId === args.buildId) {
      await ctx.db.patch(auth.proposal._id, {
        activeBuildId: undefined,
        updatedAt: now,
        updatedByWorkosUserId: auth.subject,
      });
    }
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "deleteActiveBuild",
      eventType: "active_build.deleted",
      priorState,
      reason: args.reason,
    });
    return null;
  })
  .public();

export const getProductionProposalSettings = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScope(ctx, args.workosOrganizationId);
    requireAnyRole(scope.roles, BACKOFFICE_ROLES);

    if (!scope.brokerage) {
      return {
        archetypes: [],
        brokerage: null,
        provisioningRequired: true,
        templates: [],
        workflowRules: [],
      };
    }

    return await buildProductionSettingsProjection(ctx, scope.brokerage);
  })
  .public();

export const saveProductionProposalTemplateConfiguration = authenticatedMutation
  .input({
    milestones: v.array(productionSettingsMilestoneInput),
    scenarios: v.array(productionSettingsScenarioInput),
    template: v.object({
      description: v.string(),
      isDefault: v.boolean(),
      summary: v.string(),
      templateKey: v.string(),
      title: v.string(),
    }),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeProductionSettingsMutation(
      ctx,
      args.workosOrganizationId,
    );
    validateProductionTemplateRows(args.milestones);
    validateProductionScenarios(args.scenarios, args.milestones);

    const priorState = JSON.stringify(
      await collectProposalTemplateDetails(ctx, auth.brokerage._id),
    );
    const now = Date.now();
    const templateId = await upsertProductionSettingsTemplate(ctx, {
      brokerageId: auth.brokerage._id,
      description: args.template.description,
      isDefault: args.template.isDefault,
      now,
      organizationId: args.workosOrganizationId,
      summary: args.template.summary,
      templateKey: args.template.templateKey,
      title: args.template.title,
    });
    await replaceProductionSettingsMilestones(ctx, {
      brokerageId: auth.brokerage._id,
      milestones: args.milestones,
      now,
      organizationId: args.workosOrganizationId,
      templateId,
    });
    await replaceProductionSettingsScenarios(ctx, {
      brokerageId: auth.brokerage._id,
      now,
      organizationId: args.workosOrganizationId,
      scenarios: args.scenarios,
      templateId,
    });
    await writeProductionSettingsEvent(ctx, {
      auth,
      command: "saveProductionProposalTemplateConfiguration",
      entityId: args.template.templateKey,
      eventType: "production_settings.template_configuration_saved",
      newState: JSON.stringify({
        milestoneCount: args.milestones.filter((row) => row.included).length,
        scenarioCount: args.scenarios.length,
      }),
      organizationId: args.workosOrganizationId,
      priorState,
    });
    return await buildProductionSettingsProjection(ctx, auth.brokerage);
  })
  .public();

export const createProductionProposalTemplate = authenticatedMutation
  .input({
    milestones: v.array(productionSettingsMilestoneInput),
    scenarios: v.array(productionSettingsScenarioInput),
    template: v.object({
      description: v.string(),
      isDefault: v.boolean(),
      summary: v.string(),
      templateKey: v.string(),
      title: v.string(),
    }),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeProductionSettingsMutation(
      ctx,
      args.workosOrganizationId,
    );
    const templateKey = normalizeProductionTemplateKey(
      args.template.templateKey,
    );
    if (templateKey !== args.template.templateKey.trim()) {
      throw new Error(
        "Template key must be a lowercase slug using letters, numbers, and hyphens.",
      );
    }
    if (!args.template.title.trim()) {
      throw new Error("Template title is required.");
    }
    validateProductionTemplateRows(args.milestones);
    validateProductionScenarios(args.scenarios, args.milestones);

    const existing = await getProductionSettingsTemplate(
      ctx,
      auth.brokerage._id,
      templateKey,
    );
    if (existing) {
      throw new Error("Production template key already exists.");
    }

    const priorState = JSON.stringify({
      templateCount: (
        await collectProposalTemplateDetails(ctx, auth.brokerage._id)
      ).length,
    });
    const now = Date.now();
    const templateId = await upsertProductionSettingsTemplate(ctx, {
      brokerageId: auth.brokerage._id,
      description: args.template.description,
      isDefault: args.template.isDefault,
      now,
      organizationId: args.workosOrganizationId,
      summary: args.template.summary,
      templateKey,
      title: args.template.title,
    });
    await replaceProductionSettingsMilestones(ctx, {
      brokerageId: auth.brokerage._id,
      milestones: args.milestones,
      now,
      organizationId: args.workosOrganizationId,
      templateId,
    });
    await replaceProductionSettingsScenarios(ctx, {
      brokerageId: auth.brokerage._id,
      now,
      organizationId: args.workosOrganizationId,
      scenarios: args.scenarios,
      templateId,
    });
    await writeProductionSettingsEvent(ctx, {
      auth,
      command: "createProductionProposalTemplate",
      entityId: templateKey,
      eventType: "production_settings.template_created",
      newState: JSON.stringify({
        milestoneCount: args.milestones.filter((row) => row.included).length,
        scenarioCount: args.scenarios.length,
        templateKey,
        title: args.template.title.trim(),
      }),
      organizationId: args.workosOrganizationId,
      priorState,
    });
    return await buildProductionSettingsProjection(ctx, auth.brokerage);
  })
  .public();

export const deleteProductionDrawScenario = authenticatedMutation
  .input({
    scenarioKey: v.string(),
    templateKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeProductionSettingsMutation(
      ctx,
      args.workosOrganizationId,
    );
    const template = await getProductionSettingsTemplate(
      ctx,
      auth.brokerage._id,
      args.templateKey,
    );
    if (!template) {
      return await buildProductionSettingsProjection(ctx, auth.brokerage);
    }
    const scenario = await getProductionSettingsScenario(
      ctx,
      template._id,
      args.scenarioKey,
    );
    if (!scenario) {
      return await buildProductionSettingsProjection(ctx, auth.brokerage);
    }
    if (scenario.isActive) {
      throw new Error("Active scenario cannot be deleted.");
    }
    await deleteProductionScenarioDraws(ctx, template._id, args.scenarioKey);
    await ctx.db.patch(scenario._id, {
      status: "inactive",
      updatedAt: Date.now(),
    });
    await writeProductionSettingsEvent(ctx, {
      auth,
      command: "deleteProductionDrawScenario",
      entityId: args.templateKey,
      eventType: "production_settings.scenario_deleted",
      organizationId: args.workosOrganizationId,
      priorState: JSON.stringify(scenario),
    });
    return await buildProductionSettingsProjection(ctx, auth.brokerage);
  })
  .public();

export const resetProductionTemplateToDefaults = authenticatedMutation
  .input({ templateKey: v.string(), workosOrganizationId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeProductionSettingsMutation(
      ctx,
      args.workosOrganizationId,
    );
    const seed = requiredProductionDefaultTemplate(args.templateKey);
    const priorState = JSON.stringify(
      await collectProposalTemplateDetails(ctx, auth.brokerage._id),
    );
    const now = Date.now();
    const templateId = await ensureProductionDefaultTemplate(ctx, {
      brokerageId: auth.brokerage._id,
      now,
      organizationId: args.workosOrganizationId,
      template: seed,
    });
    await replaceProductionDefaultMilestones(ctx, {
      brokerageId: auth.brokerage._id,
      now,
      organizationId: args.workosOrganizationId,
      template: seed,
      templateId,
    });
    await writeProductionSettingsEvent(ctx, {
      auth,
      command: "resetProductionTemplateToDefaults",
      entityId: args.templateKey,
      eventType: "production_settings.template_reset",
      organizationId: args.workosOrganizationId,
      priorState,
    });
    return await buildProductionSettingsProjection(ctx, auth.brokerage);
  })
  .public();

export const resetProductionDrawScenarioToDefaults = authenticatedMutation
  .input({
    scenarioKey: v.string(),
    templateKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeProductionSettingsMutation(
      ctx,
      args.workosOrganizationId,
    );
    const seed = requiredProductionDefaultTemplate(args.templateKey);
    const scenario = seed.scenarios.find(
      (row) => row.scenarioKey === args.scenarioKey,
    );
    if (!scenario) {
      throw new Error("No default scenario exists for reset.");
    }
    const template = await getProductionSettingsTemplate(
      ctx,
      auth.brokerage._id,
      args.templateKey,
    );
    if (!template) {
      throw new Error("Production template is not provisioned.");
    }
    const now = Date.now();
    await ensureDrawScheduleScenario(ctx, {
      brokerageId: auth.brokerage._id,
      description: scenario.description,
      isActive: scenario.isActive,
      isDefault: scenario.isDefault,
      name: scenario.name,
      now,
      organizationId: args.workosOrganizationId,
      scenarioKey: scenario.scenarioKey,
      sortOrder: seed.scenarios.indexOf(scenario),
      templateId: template._id,
    });
    await replaceProductionScenarioDraws(ctx, {
      brokerageId: auth.brokerage._id,
      draws: scenario.draws,
      now,
      organizationId: args.workosOrganizationId,
      scenarioKey: scenario.scenarioKey,
      templateId: template._id,
    });
    await writeProductionSettingsEvent(ctx, {
      auth,
      command: "resetProductionDrawScenarioToDefaults",
      entityId: args.templateKey,
      eventType: "production_settings.scenario_reset",
      organizationId: args.workosOrganizationId,
      newState: JSON.stringify({ scenarioKey: scenario.scenarioKey }),
    });
    return await buildProductionSettingsProjection(ctx, auth.brokerage);
  })
  .public();

export const getActiveBuildDetailByString = authenticatedQuery
  .input({
    buildId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const buildId = ctx.db.normalizeId("activeBuilds", args.buildId);
    if (!buildId) {
      return null;
    }
    const auth = await authorizeActiveBuild(
      ctx,
      buildId,
      args.workosOrganizationId,
    );
    if (!auth) {
      return null;
    }
    const { build } = auth;
    const [
      loanFacilities,
      capitalPlans,
      milestones,
      submilestones,
      costItems,
      draws,
      facilityChangeRequests,
    ] = await Promise.all([
      collectByIndex(ctx, "loanFacilities", "by_build", buildId),
      collectByIndex(ctx, "buildCapitalPlans", "by_build", buildId),
      collectByIndex(ctx, "buildMilestones", "by_build", buildId),
      collectByIndex(ctx, "buildSubmilestones", "by_build", buildId),
      collectByIndex(ctx, "buildCostItems", "by_build", buildId),
      collectByIndex(ctx, "plannedDrawScheduleRows", "by_build", buildId),
      collectByIndex(
        ctx,
        "activeBuildFacilityChangeRequests",
        "by_build",
        buildId,
      ),
    ]);
    const [
      documents,
      evidenceAssets,
      notes,
      assignments,
      milestoneAssignments,
      siteVisits,
      auditEvents,
      contractorProfiles,
    ] = await Promise.all([
      collectByIndex(ctx, "buildDocuments", "by_build", buildId),
      collectByIndex(ctx, "buildEvidenceAssets", "by_build", buildId),
      collectByIndex(ctx, "buildNotes", "by_build", buildId),
      collectByIndex(ctx, "buildContractorAssignments", "by_build", buildId),
      collectByIndex(
        ctx,
        "milestoneContractorAssignments",
        "by_build",
        buildId,
      ),
      collectByIndex(ctx, "buildSiteVisits", "by_build", buildId),
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "activeBuild").eq("entityId", String(buildId)),
        )
        .collect(),
      ctx.db
        .query("contractorProfiles")
        .withIndex("by_brokerage", (q) =>
          q.eq("brokerageId", build.brokerageId),
        )
        .collect(),
    ]);
    const buildDocuments = documents as Doc<"buildDocuments">[];
    const buildEvidenceAssets = evidenceAssets as Doc<"buildEvidenceAssets">[];
    const buildNotes = notes as Doc<"buildNotes">[];
    const buildContractorAssignments =
      assignments as Doc<"buildContractorAssignments">[];
    const buildMilestoneContractorAssignments =
      milestoneAssignments as Doc<"milestoneContractorAssignments">[];
    const buildSiteVisits = siteVisits as Doc<"buildSiteVisits">[];
    const contractorById = new Map(
      contractorProfiles.map((contractor) => [
        String(contractor._id),
        contractor,
      ]),
    );
    const attachedContractorIds = new Set(
      buildContractorAssignments.map((assignment) =>
        String(assignment.contractorId),
      ),
    );
    const mappedAuditEvents = auditEvents
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((event) => ({
        _id: String(event._id),
        actorPersona: event.actorWorkosUserId,
        afterSummary: event.newState,
        beforeSummary: event.priorState,
        createdAt: event.createdAt,
        entityLabel: build.buildName,
        entityType: event.entityType,
        eventType: event.eventType,
      }));
    return {
      build,
      capitalPlan: capitalPlans[0] ?? null,
      displayId: productionBuildDisplayId(build),
      documents: await withBuildDocumentStorageUrls(ctx, buildDocuments),
      draws,
      evidenceAssets: await withBuildEvidenceAssetStorageUrls(
        ctx,
        buildEvidenceAssets,
      ),
      facilityChangeRequests: (
        facilityChangeRequests as Doc<"activeBuildFacilityChangeRequests">[]
      )
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((request) => ({
          _id: request._id,
          createdAt: request.createdAt,
          priorState: request.priorState,
          reason: request.reason,
          requestedByWorkosUserId: request.requestedByWorkosUserId,
          requestedPayload: request.requestedPayload,
          requestType: request.requestType,
          reviewNote: request.reviewNote,
          reviewedAt: request.reviewedAt,
          reviewerWorkosUserId: request.reviewerWorkosUserId,
          status: request.status,
          updatedAt: request.updatedAt,
        })),
      auditEvents: mappedAuditEvents,
      availableContractors: contractorProfiles
        .filter(
          (contractor) => !attachedContractorIds.has(String(contractor._id)),
        )
        .map((contractor) => ({
          _id: contractor._id,
          city: contractor.city,
          defaultPayRateCents: contractor.defaultPayRateCents,
          defaultPayRateUnit: contractor.defaultPayRateUnit ?? "hour",
          name: contractor.name,
          skills: contractor.trades,
          trades: contractor.trades,
        })),
      contractors: buildContractorAssignments
        .map((assignment) => {
          const contractor = contractorById.get(
            String(assignment.contractorId),
          );
          if (!contractor) {
            return null;
          }
          return {
            _id: String(assignment._id),
            agreedRateCents:
              assignment.agreedRateCents ?? contractor.defaultPayRateCents,
            agreedRateUnit:
              assignment.agreedRateUnit ??
              contractor.defaultPayRateUnit ??
              "hour",
            contractorId: contractor._id,
            city: contractor.city,
            email: contractor.email,
            hourlyRateCents: contractor.defaultPayRateCents,
            payRateCents:
              assignment.agreedRateCents ?? contractor.defaultPayRateCents,
            payRateUnit:
              assignment.agreedRateUnit ??
              contractor.defaultPayRateUnit ??
              "hour",
            name: contractor.name,
            role: assignment.role,
            trades: contractor.trades,
          };
        })
        .filter(Boolean),
      milestoneContractorAssignments: buildMilestoneContractorAssignments
        .map((assignment) => {
          const contractor = contractorById.get(
            String(assignment.contractorId),
          );
          if (!contractor) {
            return null;
          }
          return {
            _id: assignment._id,
            actualCostCents: assignment.actualCostCents,
            actualHours: assignment.actualHours,
            agreedRateCents: assignment.agreedRateCents,
            agreedRateUnit: assignment.agreedRateUnit,
            contractorId: assignment.contractorId,
            contractor: {
              _id: contractor._id,
              name: contractor.name,
              trades: contractor.trades,
            },
            costNotes: assignment.costNotes,
            estimatedCostCents: assignment.estimatedCostCents,
            estimatedHours: assignment.estimatedHours,
            milestoneKey: assignment.milestoneKey,
            postHoc: assignment.postHoc,
            role: assignment.role,
            status: assignment.status,
            submilestoneKey: assignment.submilestoneKey,
          };
        })
        .filter(Boolean),
      quickActionEvents: mappedAuditEvents.slice(0, 8).map((event) => ({
        _id: event._id,
        createdAt: event.createdAt,
        eventType: event.eventType,
        payloadPreview:
          event.afterSummary ?? event.beforeSummary ?? event.eventType,
      })),
      loanFacility: loanFacilities[0] ?? null,
      milestones,
      notes: {
        internal: buildNotes
          .filter((note) => note.visibility === "internal")
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(formatActiveBuildNote),
        public: buildNotes
          .filter((note) => note.visibility === "public")
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(formatActiveBuildNote),
      },
      sitePhotos: await productionSitePhotosForBuild(
        ctx,
        build,
        buildEvidenceAssets,
      ),
      siteVisits: buildSiteVisits,
      submilestones,
      costItems,
    };
  })
  .public();

export const getActiveBuildTimelineWorkspace = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    const { build, proposal } = auth;
    const [
      milestones,
      submilestones,
      draws,
      evidenceAssets,
      capitalPlanRows,
      siteVisits,
      capitalEvents,
      auditEvents,
      permitWaiver,
    ] = await Promise.all([
      collectByIndex(ctx, "buildMilestones", "by_build", args.buildId),
      collectByIndex(ctx, "buildSubmilestones", "by_build", args.buildId),
      collectByIndex(ctx, "plannedDrawScheduleRows", "by_build", args.buildId),
      collectByIndex(ctx, "buildEvidenceAssets", "by_build", args.buildId),
      collectByIndex(ctx, "buildCapitalPlans", "by_build", args.buildId),
      collectByIndex(ctx, "buildSiteVisits", "by_build", args.buildId),
      collectByIndex(ctx, "capitalEvents", "by_build", args.buildId),
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(args.buildId)),
        )
        .collect(),
      build.permitWaiverId ? ctx.db.get(build.permitWaiverId) : null,
    ]);
    const sortedMilestones = [...milestones].sort(
      (a, b) => a.order - b.order || a.key.localeCompare(b.key),
    );
    const sortedDraws = [...draws].sort(
      (a, b) => a.order - b.order || a.drawKey.localeCompare(b.drawKey),
    );
    const maxDay = Math.max(
      60,
      ...sortedMilestones.map((milestone) => milestone.dayEnd + 10),
      ...sortedDraws.map((draw) => draw.timingDay + 10),
    );
    const computedCurrentDay = Math.max(
      0,
      Math.min(
        maxDay,
        daysBetweenIso(build.startDate, new Date().toISOString()),
      ),
    );
    const currentDay = build.timelineCurrentDay ?? computedCurrentDay;
    const activeMilestone =
      sortedMilestones.find((milestone) => milestone.status !== "complete") ??
      sortedMilestones[0];
    const drawByMilestoneKey = new Map(
      sortedDraws
        .filter((draw) => draw.milestoneKey)
        .map((draw) => [draw.milestoneKey as string, draw]),
    );
    const capitalPlan = capitalPlanRows[0] ?? null;
    const siteVisitsByMilestone = new Map<string, any[]>();
    for (const visit of siteVisits) {
      const list = siteVisitsByMilestone.get(visit.milestoneKey) ?? [];
      list.push(visit);
      siteVisitsByMilestone.set(visit.milestoneKey, list);
    }
    const activeCapitalEvents = capitalEvents as Doc<"capitalEvents">[];
    const activeSubmilestones = submilestones as Doc<"buildSubmilestones">[];

    return {
      activeBuild: build,
      auditEvents: auditEvents
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((event) => ({
          _id: event._id,
          actorPersona: event.actorWorkosUserId,
          command: event.command,
          createdAt: event.createdAt,
          entityType: event.entityType,
          eventType: event.eventType,
          reason: event.reason,
        })),
      capitalEvents: [
        {
          amountCents:
            capitalPlan?.borrowerWorkingCapitalLimitCents ??
            proposal.borrowerWorkingCapitalLimitCents,
          capitalEventKey: "borrower-reserve",
          eventKind: "cashInfusion",
          label: "Borrower reserve",
          x: 0,
        },
        ...activeCapitalEvents
          .filter((event) => event.eventType !== "draw_release")
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((event) => ({
            amountCents: event.amountCents,
            capitalEventKey: event.capitalEventKey ?? String(event._id),
            eventKind:
              event.eventType === "borrower_copay" ? "cashInfusion" : "cost",
            label: event.label,
            x: daysBetweenIso(build.startDate, event.eventDate),
          })),
      ],
      draws: sortedDraws.map((draw) => {
        const drawMilestone = draw.milestoneKey
          ? sortedMilestones.find(
              (milestone) => milestone.key === draw.milestoneKey,
            )
          : undefined;
        const amountCents =
          draw.status === "planned" && drawMilestone
            ? Math.min(
                draw.amountCents,
                activeBuildMilestoneEffectiveDrawAvailabilityCents(
                  drawMilestone as Doc<"buildMilestones">,
                ),
              )
            : draw.amountCents;

        return {
          amountCents,
          customDate: false,
          drawKey: draw.drawKey,
          itemMilestoneKey: draw.milestoneKey,
          label: draw.label,
          requestNote: draw.requestNote,
          requestReviewNote: draw.requestReviewNote ?? draw.releaseNote,
          requestStatus: activeBuildTimelineDrawStatus(draw.status),
          reviewedAt: draw.reviewedAt ?? draw.releasedAt,
          requestedAt: draw.requestedAt,
          x: draw.timingDay,
        };
      }),
      evidenceAssets: await Promise.all(
        [...evidenceAssets]
          .sort((a, b) => a.createdAt - b.createdAt)
          .map(async (asset) => ({
            evidenceKey: asset.evidenceKey,
            fileName: asset.fileName,
            label: asset.label,
            milestoneKey: asset.milestoneKey,
            mimeType: asset.mimeType,
            previewUrl: asset.storageId
              ? await ctx.storage.getUrl(asset.storageId)
              : null,
            sizeBytes: asset.sizeBytes,
            tag: asset.tag,
          })),
      ),
      milestones: sortedMilestones.map((milestone, index) => {
        const draw = drawByMilestoneKey.get(milestone.key);
        const visits = siteVisitsByMilestone.get(milestone.key) ?? [];
        const completionReview = productionCompletionReviewView(
          milestone.completionReview,
        );
        const status = activeBuildTimelineMilestoneStatus(milestone, {
          currentDay,
          milestones: sortedMilestones,
        });
        return {
          budgetCents: milestone.budgetCents,
          completionClaim: productionCompletionClaimView(
            milestone.completionClaim,
          ),
          completionReview:
            completionReview ??
            activeBuildSiteVisitCompletionReviewView(visits.at(-1)),
          drawAvailabilityCents: milestone.drawAvailabilityCents,
          drawKey: draw?.label ?? "Reimbursement draw",
          durationDays: milestone.durationDays,
          evidenceState:
            milestone.evidenceState ??
            (milestone.completionClaim
              ? "Completion claimed"
              : "Draft package"),
          icon: iconForProductionMilestone(milestone.key, milestone.name),
          lane: index % 3 === 1 ? -1 : index % 3 === 2 ? 1 : 0,
          markerLabel: String(index + 1),
          milestoneKey: milestone.key,
          name: milestone.name,
          order: index + 1,
          policyState:
            milestone.policyState ??
            productionPolicyState(proposal, permitWaiver),
          status,
          submilestoneSnapshot: activeSubmilestones
            .filter(
              (submilestone) => submilestone.milestoneKey === milestone.key,
            )
            .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
            .map((submilestone) => ({
              ...(submilestone.budgetCents === undefined
                ? {}
                : { budgetCents: submilestone.budgetCents }),
              ...(submilestone.durationDays === undefined
                ? {}
                : { durationDays: submilestone.durationDays }),
              key: submilestone.key,
              name: submilestone.name,
              order: submilestone.order,
              ...(submilestone.startDay === undefined
                ? {}
                : { startDay: submilestone.startDay }),
            })),
          tone: activeBuildTimelineMilestoneTone(milestone, status, currentDay),
          x: milestone.dayStart,
        };
      }),
      modificationRequests: [],
      permissions: {
        reviewDrawRequests: isBackoffice(auth.roles),
        reviewMilestones: isBackoffice(auth.roles),
        submitDrawRequests: !isBackoffice(auth.roles),
        submitMilestoneCompletion: !isBackoffice(auth.roles),
      },
      plan: {
        borrowerCoPayBps:
          capitalPlan?.borrowerCoPayBps ?? proposal.borrowerCoPayBps,
        borrowerCoPayCents: Math.round(
          (build.totalBudgetCents *
            (capitalPlan?.borrowerCoPayBps ?? proposal.borrowerCoPayBps)) /
            10_000,
        ),
        currentDay,
        progressValue:
          build.timelineProgressValue ??
          activeMilestone?.dayStart ??
          currentDay,
        rangeMax: build.timelineRangeMax ?? maxDay,
        rangeMin: build.timelineRangeMin ?? 0,
        routeState: build.timelineRouteState ?? {
          activeMilestoneKey: activeMilestone?.key,
          selectedPanelOpen: Boolean(activeMilestone),
          straightLine: true,
        },
        minimumCashReserveCents: build.timelineMinimumCashReserveCents ?? 0,
        startingCashCents:
          build.timelineStartingCashCents ??
          capitalPlan?.borrowerWorkingCapitalLimitCents ??
          proposal.borrowerWorkingCapitalLimitCents,
      },
      planSummary: {
        address: build.location,
        includedCount: sortedMilestones.length,
        templateTitle: build.buildName,
        totalBudget: build.totalBudgetCents,
      },
      proposal: {
        buildName: build.buildName,
        location: build.location,
        reviewOutcome: proposal.reviewOutcome,
        status: "approved",
        totalBudgetCents: build.totalBudgetCents,
      },
    };
  })
  .public();

export const updateActiveBuildTimelinePlanState = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    currentDay: v.number(),
    progressValue: v.number(),
    rangeMax: v.number(),
    rangeMin: v.number(),
    routeState: v.object({
      activeCapitalSpikeId: v.optional(v.string()),
      activeDrawId: v.optional(v.string()),
      activeMilestoneKey: v.optional(v.string()),
      selectedPanelOpen: v.boolean(),
      straightLine: v.boolean(),
    }),
    minimumCashReserveCents: v.optional(v.number()),
    startingCashCents: v.number(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    const priorState = JSON.stringify({
      currentDay: auth.build.timelineCurrentDay,
      progressValue: auth.build.timelineProgressValue,
      rangeMax: auth.build.timelineRangeMax,
      rangeMin: auth.build.timelineRangeMin,
      routeState: auth.build.timelineRouteState,
      minimumCashReserveCents: auth.build.timelineMinimumCashReserveCents,
      startingCashCents: auth.build.timelineStartingCashCents,
    });
    const patch = {
      timelineCurrentDay: Math.round(args.currentDay),
      timelineProgressValue: Math.round(args.progressValue),
      timelineRangeMax: Math.round(args.rangeMax),
      timelineRangeMin: Math.round(args.rangeMin),
      timelineRouteState: args.routeState,
      timelineMinimumCashReserveCents: Math.max(
        0,
        Math.round(args.minimumCashReserveCents ?? 0),
      ),
      timelineStartingCashCents: Math.max(
        0,
        Math.round(args.startingCashCents),
      ),
      updatedAt: Date.now(),
    };
    await ctx.db.patch(args.buildId, patch);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "updateActiveBuildTimelinePlanState",
      eventType: "active_build.timeline_state.updated",
      newState: JSON.stringify(patch),
      priorState,
    });
    return null;
  })
  .public();

export const requestActiveBuildFacilityChange = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    reason: v.optional(v.string()),
    requestedPaybackDate: v.optional(v.string()),
    requestedPrincipalCents: v.optional(v.number()),
    requestType: activeBuildFacilityChangeRequestType,
    workosOrganizationId: v.string(),
  })
  .returns(v.id("activeBuildFacilityChangeRequests"))
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, BUILDER_ROLES);
    const loanFacility = await getPrimaryLoanFacility(ctx, args.buildId);
    if (!loanFacility) {
      throw new Error("Active build loan facility is missing.");
    }
    const priorState = {
      paybackDate: loanFacility.paybackDate,
      principalCents: loanFacility.principalCents,
    };
    let requestedPayload:
      | { requestedPrincipalCents: number }
      | { requestedPaybackDate: string };
    if (args.requestType === "principalIncrease") {
      const requestedPrincipalCents = normalizePositiveCents(
        args.requestedPrincipalCents,
        "Requested principal is required.",
      );
      if (requestedPrincipalCents <= loanFacility.principalCents) {
        throw new Error("Requested principal must exceed current principal.");
      }
      requestedPayload = { requestedPrincipalCents };
    } else {
      requestedPayload = {
        requestedPaybackDate: normalizeIsoDate(
          args.requestedPaybackDate,
          "Requested payback date is required.",
        ),
      };
    }
    if (args.requestType === "paybackExtension") {
      if (!("requestedPaybackDate" in requestedPayload)) {
        throw new Error("Requested payback date is required.");
      }
      const currentPaybackDate =
        loanFacility.paybackDate ??
        addDaysIso(
          auth.build.startDate,
          auth.build.timelineRangeMax ?? auth.proposal.timelineRangeMax ?? 365,
        );
      if (
        daysBetweenIso(
          currentPaybackDate,
          requestedPayload.requestedPaybackDate,
        ) <= 0
      ) {
        throw new Error("Requested payback date must extend the current date.");
      }
    }
    const now = Date.now();
    const requestId = await ctx.db.insert("activeBuildFacilityChangeRequests", {
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      createdAt: now,
      organizationId: args.workosOrganizationId,
      priorState,
      proposalId: auth.proposal._id,
      reason: args.reason,
      requestedByWorkosUserId: auth.subject,
      requestedPayload,
      requestType: args.requestType,
      status: "requested",
      updatedAt: now,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "requestActiveBuildFacilityChange",
      eventType: "active_build.facility_change.requested",
      newState: JSON.stringify({
        requestId,
        requestType: args.requestType,
        requestedPayload,
      }),
      priorState: JSON.stringify(priorState),
      reason: args.reason,
    });
    return requestId;
  })
  .public();

export const reviewActiveBuildFacilityChangeRequest = authenticatedMutation
  .input({
    note: v.optional(v.string()),
    requestId: v.id("activeBuildFacilityChangeRequests"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.organizationId !== args.workosOrganizationId) {
      throw new Error("Facility change request not found.");
    }
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      request.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    if (request.status !== "requested") {
      throw new Error("Facility change request has already been reviewed.");
    }
    const loanFacility = await getPrimaryLoanFacility(ctx, request.buildId);
    if (!loanFacility) {
      throw new Error("Active build loan facility is missing.");
    }
    const priorState = {
      paybackDate: loanFacility.paybackDate,
      principalCents: loanFacility.principalCents,
    };
    let newState: Record<string, unknown> = {
      status: args.status,
      requestId: args.requestId,
      requestType: request.requestType,
    };
    if (args.status === "approved") {
      if (request.requestType === "principalIncrease") {
        const requestedPrincipalCents = normalizePositiveCents(
          request.requestedPayload?.requestedPrincipalCents,
          "Requested principal is required.",
        );
        if (requestedPrincipalCents <= loanFacility.principalCents) {
          throw new Error("Requested principal must exceed current principal.");
        }
        await ctx.db.patch(loanFacility._id, {
          principalCents: requestedPrincipalCents,
          updatedAt: Date.now(),
        });
        newState = {
          ...newState,
          principalCents: requestedPrincipalCents,
        };
      } else {
        const requestedPaybackDate = normalizeIsoDate(
          request.requestedPayload?.requestedPaybackDate,
          "Requested payback date is required.",
        );
        await ctx.db.patch(loanFacility._id, {
          paybackDate: requestedPaybackDate,
          updatedAt: Date.now(),
        });
        const newEndDay = daysBetweenIso(
          auth.build.startDate,
          requestedPaybackDate,
        );
        if (newEndDay > (auth.build.timelineRangeMax ?? 0)) {
          await ctx.db.patch(auth.build._id, {
            timelineRangeMax: newEndDay,
            updatedAt: Date.now(),
          });
        }
        newState = {
          ...newState,
          paybackDate: requestedPaybackDate,
          timelineRangeMax: Math.max(
            auth.build.timelineRangeMax ?? 0,
            newEndDay,
          ),
        };
      }
    }
    await ctx.db.patch(args.requestId, {
      reviewedAt: Date.now(),
      reviewerWorkosUserId: auth.subject,
      reviewNote: args.note,
      status: args.status,
      updatedAt: Date.now(),
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "reviewActiveBuildFacilityChangeRequest",
      eventType: "active_build.facility_change.reviewed",
      newState: JSON.stringify(newState),
      priorState: JSON.stringify(priorState),
      reason: args.note,
    });
    return null;
  })
  .public();

export const createActiveBuildTimelineMilestone = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    milestone: productionTimelineMilestoneInput,
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    await insertActiveBuildMilestoneFromInput(ctx, auth, args.milestone);
    await recalculateActiveBuildBudget(ctx, args.buildId);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "createActiveBuildTimelineMilestone",
      eventType: "active_build.milestone.created",
      newState: JSON.stringify(args.milestone),
    });
    return null;
  })
  .public();

export const updateActiveBuildTimelineMilestone = authenticatedMutation
  .input({
    budgetCents: v.optional(v.number()),
    buildId: v.id("activeBuilds"),
    dayEnd: v.optional(v.number()),
    dayStart: v.optional(v.number()),
    dependencyKeys: v.optional(v.array(v.string())),
    drawAvailabilityCents: v.optional(v.number()),
    durationDays: v.optional(v.number()),
    evidenceState: v.optional(v.string()),
    isDragLocked: v.optional(v.boolean()),
    milestoneKey: v.string(),
    name: v.optional(v.string()),
    order: v.optional(v.number()),
    policyState: v.optional(v.string()),
    progressPercent: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("planned"),
        v.literal("in_progress"),
        v.literal("complete"),
      ),
    ),
    submilestones: v.optional(v.array(submilestoneInput)),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    const nextDayStart = Math.round(args.dayStart ?? milestone.dayStart);
    const existingDurationDays = Math.max(
      1,
      Math.round(
        milestone.durationDays ?? milestone.dayEnd - milestone.dayStart,
      ),
    );
    const nextRequestedDurationDays =
      args.durationDays ??
      (args.dayStart !== undefined && args.dayEnd === undefined
        ? existingDurationDays
        : undefined);
    const nextDayEnd = Math.round(
      args.dayEnd ??
        (nextRequestedDurationDays === undefined
          ? milestone.dayEnd
          : nextDayStart + nextRequestedDurationDays),
    );
    if (nextDayEnd < nextDayStart && nextRequestedDurationDays === undefined) {
      throw new Error("Milestone end day must be after start day.");
    }
    const dayStartDelta = nextDayStart - Math.round(milestone.dayStart);
    const existingSubmilestones = (await ctx.db
      .query("buildSubmilestones")
      .withIndex("by_milestone", (q) => q.eq("buildMilestoneId", milestone._id))
      .collect()) as Doc<"buildSubmilestones">[];
    const schedule = normalizeProductionMilestoneSchedule({
      dayEnd: nextDayEnd,
      dayStart: nextDayStart,
      durationDays: nextRequestedDurationDays,
      submilestones:
        args.submilestones === undefined
          ? existingSubmilestones.map((submilestone) => ({
              budgetCents: submilestone.budgetCents,
              durationDays: submilestone.durationDays,
              key: submilestone.key,
              name: submilestone.name,
              order: submilestone.order,
              startDay:
                submilestone.startDay === undefined
                  ? undefined
                  : Math.max(
                      0,
                      Math.round(submilestone.startDay + dayStartDelta),
                    ),
            }))
          : args.submilestones,
    });
    const nextBudgetCents =
      args.budgetCents === undefined
        ? milestone.budgetCents
        : Math.max(0, Math.round(args.budgetCents));
    const capitalPlan = (
      await collectByIndex(ctx, "buildCapitalPlans", "by_build", args.buildId)
    )[0] as Doc<"buildCapitalPlans"> | undefined;
    const borrowerCoPayBps =
      capitalPlan?.borrowerCoPayBps ?? auth.proposal.borrowerCoPayBps;
    const patch = {
      ...(args.budgetCents === undefined
        ? {}
        : { budgetCents: nextBudgetCents }),
      ...(args.dayEnd === undefined ? {} : { dayEnd: Math.round(args.dayEnd) }),
      ...(args.dayStart === undefined
        ? {}
        : { dayStart: Math.round(args.dayStart) }),
      ...(args.dependencyKeys === undefined
        ? {}
        : { dependencyKeys: args.dependencyKeys }),
      ...(args.drawAvailabilityCents === undefined &&
      args.budgetCents === undefined
        ? {}
        : {
            drawAvailabilityCents:
              args.drawAvailabilityCents === undefined
                ? calculateDrawAvailability(nextBudgetCents, borrowerCoPayBps)
                : Math.max(0, Math.round(args.drawAvailabilityCents)),
          }),
      ...(args.durationDays === undefined
        ? {}
        : { durationDays: Math.max(1, Math.round(args.durationDays)) }),
      ...(args.evidenceState === undefined
        ? {}
        : { evidenceState: args.evidenceState }),
      ...(args.isDragLocked === undefined
        ? {}
        : { isDragLocked: args.isDragLocked }),
      ...(args.name === undefined
        ? {}
        : { name: args.name.trim() || milestone.name }),
      ...(args.order === undefined
        ? {}
        : { order: Math.max(1, Math.round(args.order)) }),
      ...(args.policyState === undefined
        ? {}
        : { policyState: args.policyState }),
      ...(args.progressPercent === undefined
        ? {}
        : {
            progressPercent: Math.max(
              0,
              Math.min(100, Math.round(args.progressPercent)),
            ),
          }),
      ...(args.status === undefined ? {} : { status: args.status }),
      updatedAt: Date.now(),
    };
    Object.assign(patch, {
      dayEnd: schedule.dayEnd,
      dayStart: schedule.dayStart,
      durationDays: schedule.durationDays,
    });
    await ctx.db.patch(milestone._id, patch);
    if (args.submilestones !== undefined || dayStartDelta !== 0) {
      await replaceActiveBuildSubmilestones(ctx, auth, {
        buildId: args.buildId,
        milestone,
        rows: schedule.submilestones,
      });
    }
    await recalculateActiveBuildBudget(ctx, args.buildId);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "updateActiveBuildTimelineMilestone",
      eventType: "active_build.milestone.updated",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(milestone),
    });
    return null;
  })
  .public();

export const deleteActiveBuildTimelineMilestone = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    milestoneKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    await deleteActiveBuildMilestoneCascade(ctx, args.buildId, milestone);
    await recalculateActiveBuildBudget(ctx, args.buildId);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "deleteActiveBuildTimelineMilestone",
      eventType: "active_build.milestone.deleted",
      priorState: JSON.stringify(milestone),
    });
    return null;
  })
  .public();

export const createActiveBuildTimelineDraw = authenticatedMutation
  .input({
    amountCents: v.number(),
    buildId: v.id("activeBuilds"),
    customDate: v.optional(v.boolean()),
    drawKey: v.string(),
    itemMilestoneKey: v.optional(v.string()),
    label: v.string(),
    order: v.optional(v.number()),
    workosOrganizationId: v.string(),
    x: v.number(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const existing = await ctx.db
      .query("plannedDrawScheduleRows")
      .withIndex("by_build_order", (q) => q.eq("buildId", args.buildId))
      .collect()
      .then((rows) => rows.find((row) => row.drawKey === args.drawKey));
    if (existing) {
      throw new Error("Production active-build draw already exists.");
    }
    const draws = await collectByIndex(
      ctx,
      "plannedDrawScheduleRows",
      "by_build",
      args.buildId,
    );
    const milestone =
      args.itemMilestoneKey === undefined
        ? null
        : await getActiveBuildMilestoneOrThrow(
            ctx,
            args.buildId,
            args.itemMilestoneKey,
          );
    const now = Date.now();
    const proposalDrawScheduleRowId = await ctx.db.insert(
      "proposalDrawScheduleRows",
      {
        amountCents: Math.max(0, Math.round(args.amountCents)),
        brokerageId: auth.brokerage._id,
        createdAt: now,
        customDate: args.customDate ?? true,
        drawKey: args.drawKey,
        label: args.label.trim() || "Reimbursement draw",
        milestoneKey: args.itemMilestoneKey,
        order: args.order ?? draws.length + 1,
        organizationId: args.workosOrganizationId,
        proposalId: auth.proposal._id,
        proposalMilestoneId: milestone?.proposalMilestoneId,
        source: "manual",
        timingDay: Math.max(0, Math.round(args.x)),
        updatedAt: now,
      },
    );
    await ctx.db.insert("plannedDrawScheduleRows", {
      amountCents: Math.max(0, Math.round(args.amountCents)),
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      buildMilestoneId: milestone?._id,
      createdAt: now,
      drawKey: args.drawKey,
      label: args.label.trim() || "Reimbursement draw",
      milestoneKey: args.itemMilestoneKey,
      order: args.order ?? draws.length + 1,
      organizationId: args.workosOrganizationId,
      proposalDrawScheduleRowId,
      status: "planned",
      timingDay: Math.max(0, Math.round(args.x)),
      updatedAt: now,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "createActiveBuildTimelineDraw",
      eventType: "active_build.draw.created",
      newState: JSON.stringify(args),
    });
    return null;
  })
  .public();

export const updateActiveBuildTimelineDraw = authenticatedMutation
  .input({
    amountCents: v.optional(v.number()),
    buildId: v.id("activeBuilds"),
    customDate: v.optional(v.boolean()),
    drawKey: v.string(),
    itemMilestoneKey: v.optional(v.string()),
    label: v.optional(v.string()),
    order: v.optional(v.number()),
    workosOrganizationId: v.string(),
    x: v.optional(v.number()),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const draw = await getActiveBuildDrawOrThrow(
      ctx,
      args.buildId,
      args.drawKey,
    );
    const milestone =
      args.itemMilestoneKey === undefined
        ? undefined
        : await getActiveBuildMilestoneOrThrow(
            ctx,
            args.buildId,
            args.itemMilestoneKey,
          );
    const patch = {
      ...(args.amountCents === undefined
        ? {}
        : { amountCents: Math.max(0, Math.round(args.amountCents)) }),
      ...(args.itemMilestoneKey === undefined
        ? {}
        : {
            buildMilestoneId: milestone?._id,
            milestoneKey: args.itemMilestoneKey,
          }),
      ...(args.label === undefined
        ? {}
        : { label: args.label.trim() || draw.label }),
      ...(args.order === undefined
        ? {}
        : { order: Math.max(1, Math.round(args.order)) }),
      ...(args.x === undefined
        ? {}
        : { timingDay: Math.max(0, Math.round(args.x)) }),
      updatedAt: Date.now(),
    };
    await ctx.db.patch(draw._id, patch);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "updateActiveBuildTimelineDraw",
      eventType: "active_build.draw.updated",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(draw),
    });
    return null;
  })
  .public();

export const deleteActiveBuildTimelineDraw = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    drawKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const draw = await getActiveBuildDrawOrThrow(
      ctx,
      args.buildId,
      args.drawKey,
    );
    if (draw.status === "approved" || draw.status === "released") {
      throw new Error(
        "Approved or released reimbursement draws cannot be deleted.",
      );
    }
    await ctx.db.delete(draw._id);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "deleteActiveBuildTimelineDraw",
      eventType: "active_build.draw.deleted",
      priorState: JSON.stringify(draw),
    });
    return null;
  })
  .public();

export const createActiveBuildTimelineCapitalEvent = authenticatedMutation
  .input({
    amountCents: v.number(),
    buildId: v.id("activeBuilds"),
    capitalEventKey: v.string(),
    eventKind: timelineCapitalEventKind,
    label: v.string(),
    workosOrganizationId: v.string(),
    x: v.number(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    await insertActiveBuildCapitalEvent(ctx, auth, {
      amountCents: args.amountCents,
      capitalEventKey: args.capitalEventKey,
      eventKind: args.eventKind,
      label: args.label,
      x: args.x,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "createActiveBuildTimelineCapitalEvent",
      eventType: "active_build.capital_event.created",
      newState: JSON.stringify(args),
    });
    return null;
  })
  .public();

export const createActiveBuildTimelineCashInfusion = authenticatedMutation
  .input({
    amountCents: v.number(),
    buildId: v.id("activeBuilds"),
    cashInfusionKey: v.string(),
    label: v.string(),
    workosOrganizationId: v.string(),
    x: v.number(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    await insertActiveBuildCapitalEvent(ctx, auth, {
      amountCents: args.amountCents,
      capitalEventKey: args.cashInfusionKey,
      eventKind: "cashInfusion",
      label: args.label,
      x: args.x,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "createActiveBuildTimelineCashInfusion",
      eventType: "active_build.cash_infusion.created",
      newState: JSON.stringify(args),
    });
    return null;
  })
  .public();

export const updateActiveBuildTimelineCapitalEvent = authenticatedMutation
  .input({
    amountCents: v.optional(v.number()),
    buildId: v.id("activeBuilds"),
    capitalEventKey: v.string(),
    eventKind: v.optional(timelineCapitalEventKind),
    label: v.optional(v.string()),
    workosOrganizationId: v.string(),
    x: v.optional(v.number()),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const event = await getActiveBuildCapitalEventOrThrow(
      ctx,
      args.buildId,
      args.capitalEventKey,
    );
    const patch = {
      ...(args.amountCents === undefined
        ? {}
        : { amountCents: Math.max(0, Math.round(args.amountCents)) }),
      ...(args.eventKind === undefined
        ? {}
        : {
            eventType:
              args.eventKind === "cashInfusion"
                ? ("borrower_copay" as const)
                : ("cost" as const),
          }),
      ...(args.label === undefined
        ? {}
        : { label: args.label.trim() || event.label }),
      ...(args.x === undefined
        ? {}
        : { eventDate: addDaysIso(auth.build.startDate, args.x) }),
    };
    await ctx.db.patch(event._id, patch);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "updateActiveBuildTimelineCapitalEvent",
      eventType: "active_build.capital_event.updated",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(event),
    });
    return null;
  })
  .public();

export const deleteActiveBuildTimelineCapitalEvent = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    capitalEventKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const event = await getActiveBuildCapitalEventOrThrow(
      ctx,
      args.buildId,
      args.capitalEventKey,
    );
    await ctx.db.delete(event._id);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "deleteActiveBuildTimelineCapitalEvent",
      eventType: "active_build.capital_event.deleted",
      priorState: JSON.stringify(event),
    });
    return null;
  })
  .public();

export const generateActiveBuildEvidenceUploadUrl = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    workosOrganizationId: v.string(),
  })
  .returns(v.string())
  .handler(async (ctx, args) => {
    await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    return await ctx.storage.generateUploadUrl();
  })
  .public();

export const createActiveBuildTimelineEvidenceAsset = authenticatedMutation
  .input({
    asset: evidenceAssetInput,
    buildId: v.id("activeBuilds"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.asset.milestoneKey,
    );
    const existing = await ctx.db
      .query("buildEvidenceAssets")
      .withIndex("by_build_key", (q) =>
        q.eq("buildId", args.buildId).eq("evidenceKey", args.asset.evidenceKey),
      )
      .unique();
    if (existing) {
      throw new Error("Production active-build evidence asset already exists.");
    }
    const now = Date.now();
    await ctx.db.insert("buildEvidenceAssets", {
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      contractorIds: args.asset.contractorIds,
      createdAt: now,
      evidenceKey: args.asset.evidenceKey,
      fileName: args.asset.fileName,
      label: args.asset.label.trim() || args.asset.fileName,
      locationVerified: args.asset.locationVerified ?? false,
      milestoneKey: args.asset.milestoneKey,
      mimeType: args.asset.mimeType,
      organizationId: args.workosOrganizationId,
      proposalId: auth.proposal._id,
      sizeBytes: Math.max(0, Math.round(args.asset.sizeBytes)),
      source: args.asset.source ?? "active_build_timeline_upload",
      storageId: args.asset.storageId,
      submilestoneKey: args.asset.submilestoneKey,
      tag: args.asset.tag.trim() || milestone.name,
      updatedAt: now,
    });
    await ctx.db.patch(milestone._id, {
      evidenceState: args.asset.locationVerified
        ? "Submitted package"
        : "Location unverified",
      status: milestone.status === "planned" ? "in_progress" : milestone.status,
      updatedAt: now,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "createActiveBuildTimelineEvidenceAsset",
      eventType: "active_build.evidence.created",
      newState: JSON.stringify(args.asset),
    });
    return null;
  })
  .public();

export const updateActiveBuildTimelineEvidenceAsset = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    evidenceKey: v.string(),
    label: v.optional(v.string()),
    tag: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    const asset = await getActiveBuildEvidenceAssetOrThrow(
      ctx,
      args.buildId,
      args.evidenceKey,
    );
    const patch = {
      ...(args.label === undefined
        ? {}
        : { label: args.label.trim() || asset.label }),
      ...(args.tag === undefined ? {} : { tag: args.tag.trim() || asset.tag }),
      updatedAt: Date.now(),
    };
    await ctx.db.patch(asset._id, patch);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "updateActiveBuildTimelineEvidenceAsset",
      eventType: "active_build.evidence.updated",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(asset),
    });
    return null;
  })
  .public();

export const deleteActiveBuildTimelineEvidenceAsset = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    evidenceKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    const asset = await getActiveBuildEvidenceAssetOrThrow(
      ctx,
      args.buildId,
      args.evidenceKey,
    );
    if (asset.storageId) {
      await ctx.storage.delete(asset.storageId);
    }
    await ctx.db.delete(asset._id);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "deleteActiveBuildTimelineEvidenceAsset",
      eventType: "active_build.evidence.deleted",
      priorState: JSON.stringify(asset),
    });
    return null;
  })
  .public();

export const startActiveBuildMilestone = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    if (isBackoffice(auth.roles)) {
      requireBackofficeActiveBuildWrite(auth);
    }
    const [milestone, milestones] = await Promise.all([
      getActiveBuildMilestoneOrThrow(ctx, args.buildId, args.milestoneKey),
      collectByIndex(ctx, "buildMilestones", "by_build", args.buildId),
    ]);
    if (milestone.status === "complete") {
      throw new Error("Completed milestones cannot be restarted.");
    }
    const blockers = activeBuildMilestoneDependencyBlockers(
      milestone,
      milestones as Doc<"buildMilestones">[],
    );
    if (blockers.length > 0) {
      throw new Error(
        `Cannot start milestone until dependencies are complete: ${blockers.join(", ")}.`,
      );
    }
    const currentDay = daysBetweenIso(
      auth.build.startDate,
      new Date().toISOString(),
    );
    if (currentDay < milestone.dayStart) {
      throw new Error("Milestone is not scheduled to start yet.");
    }
    if (milestone.status === "in_progress" && milestone.startedAt) {
      return null;
    }

    const now = Date.now();
    const patch = {
      evidenceState:
        milestone.evidenceState &&
        !["draft package", "not started", "planned"].includes(
          milestone.evidenceState.toLowerCase(),
        )
          ? milestone.evidenceState
          : "Work started",
      progressPercent: Math.max(milestone.progressPercent ?? 0, 5),
      startedAt: milestone.startedAt ?? now,
      status: "in_progress" as const,
      updatedAt: now,
    };
    await ctx.db.patch(milestone._id, patch);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "startActiveBuildMilestone",
      eventType: "active_build.milestone.started",
      newState: JSON.stringify({
        milestoneKey: milestone.key,
        note: args.note,
        ...patch,
      }),
      priorState: JSON.stringify({
        evidenceState: milestone.evidenceState,
        progressPercent: milestone.progressPercent,
        startedAt: milestone.startedAt,
        status: milestone.status,
      }),
      reason: args.note,
    });
    return null;
  })
  .public();

export const submitActiveBuildMilestoneCompletion = authenticatedMutation
  .input({
    actualCostCents: v.optional(v.number()),
    buildId: v.id("activeBuilds"),
    completedDay: v.number(),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    qualityNote: v.optional(v.string()),
    qualityRating: v.optional(v.number()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    const completionClaim = {
      ...(args.actualCostCents === undefined
        ? {}
        : { actualCostCents: Math.max(0, Math.round(args.actualCostCents)) }),
      completedDay: Math.max(0, Math.round(args.completedDay)),
      ...(args.note ? { note: args.note } : {}),
      ...(args.qualityRating === undefined
        ? {}
        : { qualityRating: normalizeQualityRating(args.qualityRating) }),
      ...(args.qualityNote ? { qualityNote: args.qualityNote } : {}),
      submittedAt: new Date().toISOString(),
    };
    await ctx.db.patch(milestone._id, {
      completionClaim,
      evidenceState: milestone.evidenceState ?? "Completion claimed",
      progressPercent: 100,
      status: "in_progress",
      updatedAt: Date.now(),
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "submitActiveBuildMilestoneCompletion",
      eventType: "active_build.milestone_completion.submitted",
      newState: JSON.stringify(completionClaim),
      priorState: JSON.stringify(milestone.completionClaim),
    });
    if (args.qualityRating !== undefined) {
      await recordQualityRatingForMilestoneAssignments(ctx, {
        auth,
        buildId: args.buildId,
        milestone,
        note: args.qualityNote ?? args.note,
        rating: args.qualityRating,
        source: "builder_evidence",
        workosOrganizationId: args.workosOrganizationId,
      });
    }
    return null;
  })
  .public();

export const recordActiveBuildSiteVisit = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    status: v.union(v.literal("complete"), v.literal("cancelled")),
    visitId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    const visit = await ctx.db
      .query("buildSiteVisits")
      .withIndex("by_visit", (q) => q.eq("visitId", args.visitId))
      .unique();
    if (!visit || visit.buildId !== args.buildId) {
      throw new Error("Production active-build site visit request not found.");
    }
    const now = Date.now();
    const note = args.note?.trim();
    const siteVisit = {
      ...(visit.note ? { note: visit.note } : {}),
      ...(note
        ? { recordNote: note, recordNoteFormat: "plain_text" as const }
        : {}),
      completedAt:
        args.status === "complete"
          ? new Date(now).toISOString()
          : visit.completedAt,
      requestedAt: visit.requestedAt,
      requestedDay: visit.requestedDay,
      status: args.status,
      tokenExpiresAt: visit.tokenExpiresAt,
      url: visit.url,
      visitId: visit.visitId,
    };
    const completionReview = {
      ...(milestone.completionReview ?? {}),
      reviewedAt:
        milestone.completionReview?.reviewedAt ?? new Date(now).toISOString(),
      siteVisit,
      status: milestone.completionReview?.status ?? "revisionRequested",
    };
    await ctx.db.patch(visit._id, {
      completedAt: siteVisit.completedAt,
      recordNote: note,
      recordNoteFormat: note ? ("plain_text" as const) : undefined,
      status: args.status,
      updatedAt: now,
    });
    await ctx.db.patch(milestone._id, {
      completionReview,
      updatedAt: now,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "recordActiveBuildSiteVisit",
      eventType: "active_build.site_visit.recorded",
      newState: JSON.stringify(siteVisit),
      priorState: JSON.stringify(visit),
      reason: note,
    });
    return null;
  })
  .public();

export const getActiveBuildSiteVisitByToken = publicQuery
  .input({ buildId: v.string(), token: v.string() })
  .returns(v.any())
  .handler(
    async (ctx, args) =>
      await getActiveBuildSiteVisitTokenState(ctx, args.buildId, args.token),
  )
  .public();

export const generateActiveBuildSiteVisitUploadUrl = publicMutation
  .input({ buildId: v.string(), token: v.string() })
  .returns(v.string())
  .handler(async (ctx, args) => {
    const state = await getActiveBuildSiteVisitTokenState(
      ctx,
      args.buildId,
      args.token,
    );
    if (!state.available) {
      throw new Error("Site visit token is not active.");
    }
    return await ctx.storage.generateUploadUrl();
  })
  .public();

export const registerActiveBuildSiteVisitFile = publicMutation
  .input({
    buildId: v.string(),
    contractorIds: v.optional(v.array(v.id("contractorProfiles"))),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    storageId: v.id("_storage"),
    targetMilestoneKey: v.optional(v.string()),
    targetSubmilestoneKey: v.optional(v.string()),
    token: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const state = await getActiveBuildSiteVisitTokenState(
      ctx,
      args.buildId,
      args.token,
    );
    if (!state.available) {
      throw new Error("Site visit token is not active.");
    }
    const buildId = ctx.db.normalizeId("activeBuilds", args.buildId);
    if (!buildId) {
      throw new Error("Site visit token is invalid.");
    }
    const build = await ctx.db.get(buildId);
    const visit = await ctx.db
      .query("buildSiteVisits")
      .withIndex("by_visit", (q) => q.eq("visitId", args.token))
      .unique();
    if (!(build && visit) || visit.buildId !== buildId) {
      throw new Error("Site visit token is invalid.");
    }
    const now = Date.now();
    await ctx.db.insert("buildEvidenceAssets", {
      brokerageId: build.brokerageId,
      buildId,
      contractorIds: args.contractorIds,
      createdAt: now,
      evidenceKey: `site-visit-${args.token}-${now}`,
      fileName: args.fileName,
      label: args.fileName,
      locationVerified: true,
      milestoneKey: args.targetMilestoneKey ?? visit.milestoneKey,
      mimeType: args.mimeType,
      organizationId: build.organizationId,
      proposalId: build.proposalId,
      sizeBytes: Math.max(0, Math.round(args.sizeBytes)),
      source: `active_build_site_visit:${args.token}:${args.targetSubmilestoneKey ?? ""}`,
      storageId: args.storageId,
      submilestoneKey: args.targetSubmilestoneKey,
      tag: "Site visit evidence",
      updatedAt: now,
    });
    await ctx.db.patch(visit.buildMilestoneId, {
      evidenceState: "Site visit evidence submitted",
      updatedAt: now,
    });
    return null;
  })
  .public();

export const markActiveBuildSiteVisitTokenOpened = publicMutation
  .input({ buildId: v.string(), token: v.string() })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const buildId = ctx.db.normalizeId("activeBuilds", args.buildId);
    if (!buildId) {
      return null;
    }
    const visit = await ctx.db
      .query("buildSiteVisits")
      .withIndex("by_visit", (q) => q.eq("visitId", args.token))
      .unique();
    if (!visit || visit.buildId !== buildId || visit.status !== "requested") {
      return null;
    }
    await ctx.db.patch(visit._id, {
      tokenOpenedAt: visit.tokenOpenedAt ?? Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  })
  .public();

export const submitActiveBuildTokenizedSiteVisitReport = publicMutation
  .input({
    buildId: v.string(),
    completionObserved: v.boolean(),
    contractorRatings: v.optional(v.array(contractorQualityRatingInput)),
    recommendedOutcome: v.string(),
    reportNotes: v.string(),
    token: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const state = await getActiveBuildSiteVisitTokenState(
      ctx,
      args.buildId,
      args.token,
    );
    if (!state.available) {
      throw new Error("Site visit token is not active.");
    }
    const reportNotes = normalizeSiteVisitReportNotes(args.reportNotes);
    const reportNotesText = siteVisitReportNotesPlainText(reportNotes);
    const buildId = ctx.db.normalizeId("activeBuilds", args.buildId);
    if (!buildId) {
      throw new Error("Site visit token is invalid.");
    }
    const build = await ctx.db.get(buildId);
    const visit = await ctx.db
      .query("buildSiteVisits")
      .withIndex("by_visit", (q) => q.eq("visitId", args.token))
      .unique();
    if (!(build && visit) || visit.buildId !== buildId) {
      throw new Error("Site visit token is invalid.");
    }
    const milestone = await ctx.db.get(visit.buildMilestoneId);
    if (!milestone) {
      throw new Error("Site visit milestone was not found.");
    }
    const now = Date.now();
    const completedAt = new Date(now).toISOString();
    const siteVisit = {
      ...(visit.note ? { note: visit.note } : {}),
      completedAt,
      recordNote: reportNotes,
      recordNoteFormat: "html" as const,
      recommendedOutcome: args.recommendedOutcome,
      requestedAt: visit.requestedAt,
      requestedDay: visit.requestedDay,
      status: args.completionObserved ? "complete" : "cancelled",
      tokenExpiresAt: visit.tokenExpiresAt,
      url: visit.url,
      visitId: visit.visitId,
    };
    const completionReview = {
      ...(milestone.completionReview ?? {}),
      reviewedAt: completedAt,
      siteVisit,
      status:
        args.recommendedOutcome === "approve"
          ? "approved"
          : "revisionRequested",
    };
    await ctx.db.patch(visit._id, {
      completedAt,
      recordNote: reportNotes,
      recordNoteFormat: "html" as const,
      status: args.completionObserved ? "complete" : "cancelled",
      tokenConsumedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(milestone._id, {
      completionReview,
      evidenceState: "Site visit report submitted",
      status:
        args.completionObserved && args.recommendedOutcome === "approve"
          ? "complete"
          : milestone.status,
      updatedAt: now,
    });
    const tokenAuth = {
      brokerage: { _id: build.brokerageId },
      build,
      proposal: { _id: build.proposalId },
      roles: ["contractor"] as RoleSlug[],
      subject: "tokenized_site_visitor",
    };
    for (const rating of args.contractorRatings ?? []) {
      await insertContractorQualityRating(ctx, {
        auth: tokenAuth as any,
        buildId,
        contractorId: rating.contractorId,
        milestoneKey: rating.milestoneKey ?? visit.milestoneKey,
        note: rating.note,
        rating: rating.rating,
        source: "site_visit",
        sourceEvidenceKey: rating.sourceEvidenceKey,
        sourceVisitId: rating.sourceVisitId ?? visit.visitId,
        submilestoneKey: rating.submilestoneKey,
        workosOrganizationId: build.organizationId,
      });
    }
    await ctx.db.insert("auditEvents", {
      actorRoles: ["contractor"],
      actorWorkosUserId: "tokenized_site_visitor",
      brokerageId: build.brokerageId,
      command: "submitActiveBuildTokenizedSiteVisitReport",
      createdAt: now,
      entityId: String(build._id),
      entityType: "activeBuild",
      eventType: "active_build.site_visit.token_report_submitted",
      newState: JSON.stringify(siteVisit),
      organizationId: build.organizationId,
      priorState: JSON.stringify(visit),
      reason: reportNotesText,
      warnings: [],
    });
    await ctx.db.insert("eventOutbox", {
      brokerageId: build.brokerageId,
      createdAt: now,
      eventType: "active_build.site_visit.token_report_submitted",
      organizationId: build.organizationId,
      payloadPreview: JSON.stringify(siteVisit),
      relatedEntityId: build._id,
      relatedEntityType: "activeBuild",
      status: "pending",
    });
    return null;
  })
  .public();

export const reviewActiveBuildEvidence = authenticatedMutation
  .input({
    accepted: v.boolean(),
    buildId: v.id("activeBuilds"),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    const completionReview = {
      ...(milestone.completionReview ?? {}),
      ...(args.note ? { note: args.note } : {}),
      reviewedAt: new Date().toISOString(),
      status: args.accepted ? "approved" : "revisionRequested",
    };
    await ctx.db.patch(milestone._id, {
      completionReview,
      evidenceState: args.accepted ? "Accepted" : "Info requested",
      status: args.accepted ? "complete" : "in_progress",
      updatedAt: Date.now(),
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "reviewActiveBuildEvidence",
      eventType: "active_build.evidence.reviewed",
      newState: JSON.stringify(completionReview),
      priorState: JSON.stringify(milestone.completionReview),
      reason: args.note,
    });
    return null;
  })
  .public();

export const addActiveBuildNote = authenticatedMutation
  .input({
    body: v.string(),
    buildId: v.id("activeBuilds"),
    visibility: activeBuildNoteVisibility,
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    if (args.visibility === "internal") {
      requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    }
    const body = args.body.trim();
    if (!body) {
      throw new Error("Note body is required.");
    }
    const now = Date.now();
    await ctx.db.insert("buildNotes", {
      authorRoles: auth.roles,
      authorWorkosUserId: auth.subject,
      body,
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      createdAt: now,
      organizationId: args.workosOrganizationId,
      updatedAt: now,
      visibility: args.visibility,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "addActiveBuildNote",
      eventType: "active_build.note.created",
      newState: JSON.stringify({ body, visibility: args.visibility }),
    });
    return null;
  })
  .public();

export const addActiveBuildDocument = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    documentType: v.union(
      v.literal("permit"),
      v.literal("budget"),
      v.literal("plan"),
      v.literal("supporting"),
    ),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    storageId: v.optional(v.id("_storage")),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const now = Date.now();
    const document = {
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      createdAt: now,
      documentType: args.documentType,
      fileName: args.fileName.trim(),
      mimeType: args.mimeType,
      organizationId: args.workosOrganizationId,
      proposalId: auth.proposal._id,
      sizeBytes: Math.max(0, Math.round(args.sizeBytes)),
      status: "uploaded" as const,
      storageId: args.storageId,
      updatedAt: now,
      uploadedByWorkosUserId: auth.subject,
    };
    if (!document.fileName) {
      throw new Error("Document file name is required.");
    }
    await ctx.db.insert("buildDocuments", document);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "addActiveBuildDocument",
      eventType: "active_build.document.created",
      newState: JSON.stringify(document),
    });
    return null;
  })
  .public();

export const attachActiveBuildContractor = authenticatedMutation
  .input({
    agreedRateCents: v.optional(v.number()),
    agreedRateUnit: v.optional(contractorPayRateUnitInput),
    buildId: v.id("activeBuilds"),
    contractorId: v.id("contractorProfiles"),
    endDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    role: v.string(),
    startDate: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const contractor = await ctx.db.get(args.contractorId);
    if (
      !contractor ||
      contractor.brokerageId !== auth.brokerage._id ||
      contractor.status !== "active"
    ) {
      throw new Error("Production contractor not found.");
    }
    const existing = await ctx.db
      .query("buildContractorAssignments")
      .withIndex("by_build_contractor", (q) =>
        q.eq("buildId", args.buildId).eq("contractorId", args.contractorId),
      )
      .unique();
    const now = Date.now();
    const agreedRateCents =
      normalizeOptionalMoneyCents(args.agreedRateCents) ??
      contractor.defaultPayRateCents;
    const agreedRateUnit =
      args.agreedRateUnit ?? contractor.defaultPayRateUnit ?? "hour";
    if (existing) {
      await ctx.db.patch(existing._id, {
        agreedRateCents,
        agreedRateUnit,
        endDate: args.endDate,
        notes: args.notes,
        role: args.role.trim() || existing.role,
        startDate: args.startDate,
        status: "active",
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("buildContractorAssignments", {
        brokerageId: auth.brokerage._id,
        buildId: args.buildId,
        contractorId: args.contractorId,
        createdAt: now,
        agreedRateCents,
        agreedRateUnit,
        endDate: args.endDate,
        notes: args.notes,
        organizationId: args.workosOrganizationId,
        role: args.role.trim() || "Contractor",
        startDate: args.startDate,
        status: "active",
        updatedAt: now,
      });
    }
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "attachActiveBuildContractor",
      eventType: "active_build.contractor.attached",
      newState: JSON.stringify({
        contractorId: args.contractorId,
        role: args.role,
      }),
    });
    return null;
  })
  .public();

export const assignActiveBuildContractorToMilestone = authenticatedMutation
  .input({
    actualCostCents: v.optional(v.number()),
    actualHours: v.optional(v.number()),
    agreedRateCents: v.optional(v.number()),
    agreedRateUnit: v.optional(contractorPayRateUnitInput),
    buildId: v.id("activeBuilds"),
    costNotes: v.optional(v.string()),
    contractorId: v.id("contractorProfiles"),
    estimatedCostCents: v.optional(v.number()),
    estimatedHours: v.optional(v.number()),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    postHoc: v.optional(v.boolean()),
    role: v.string(),
    status: v.optional(
      v.union(
        v.literal("planned"),
        v.literal("active"),
        v.literal("completed"),
        v.literal("removed"),
      ),
    ),
    submilestoneKeys: v.optional(v.array(v.string())),
    workosOrganizationId: v.string(),
  })
  .returns(v.array(v.id("milestoneContractorAssignments")))
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const contractor = await getScopedContractorOrThrow(
      ctx,
      args.contractorId,
      auth.brokerage._id,
    );
    if (contractor.status !== "active") {
      throw new Error("Production contractor is inactive.");
    }
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    const buildAssignmentId = await ensureBuildContractorAssignment(ctx, {
      agreedRateCents: args.agreedRateCents ?? contractor.defaultPayRateCents,
      agreedRateUnit:
        args.agreedRateUnit ?? contractor.defaultPayRateUnit ?? "hour",
      auth,
      buildId: args.buildId,
      contractorId: args.contractorId,
      role: args.role,
      workosOrganizationId: args.workosOrganizationId,
    });
    const submilestoneKeys = [...new Set(args.submilestoneKeys ?? [])];
    const targetSubmilestones = await resolveAssignmentSubmilestones(ctx, {
      buildId: args.buildId,
      milestoneKey: args.milestoneKey,
      submilestoneKeys,
    });
    const targets =
      targetSubmilestones.length > 0
        ? targetSubmilestones
        : [{ id: undefined, key: undefined }];
    const now = Date.now();
    const assignmentIds: Id<"milestoneContractorAssignments">[] = [];
    const agreedRateCents =
      normalizeOptionalMoneyCents(args.agreedRateCents) ??
      contractor.defaultPayRateCents;
    const agreedRateUnit =
      args.agreedRateUnit ?? contractor.defaultPayRateUnit ?? "hour";
    const estimatedHours = normalizeOptionalHours(args.estimatedHours);
    const actualHours = normalizeOptionalHours(args.actualHours);
    const estimatedCostCents =
      normalizeOptionalMoneyCents(args.estimatedCostCents) ??
      deriveContractorAssignmentCost({
        hours: estimatedHours,
        rateCents: agreedRateCents,
        rateUnit: agreedRateUnit,
      });
    const actualCostCents =
      normalizeOptionalMoneyCents(args.actualCostCents) ??
      deriveContractorAssignmentCost({
        hours: actualHours,
        rateCents: agreedRateCents,
        rateUnit: agreedRateUnit,
      });
    for (const target of targets) {
      const existing = await findMilestoneContractorAssignment(ctx, {
        buildId: args.buildId,
        contractorId: args.contractorId,
        milestoneKey: args.milestoneKey,
        submilestoneKey: target.key,
      });
      const row = {
        actualCostCents,
        actualHours,
        assignedAt: now,
        assignedByWorkosUserId: auth.subject,
        agreedRateCents,
        agreedRateUnit,
        buildContractorAssignmentId: buildAssignmentId,
        buildMilestoneId: milestone._id,
        buildSubmilestoneId: target.id,
        contractorId: args.contractorId,
        costNotes: normalizeOptionalString(args.costNotes),
        estimatedCostCents,
        estimatedHours,
        milestoneKey: args.milestoneKey,
        note: normalizeOptionalString(args.note),
        postHoc: Boolean(args.postHoc),
        role: args.role.trim() || "Contractor",
        status:
          args.status ??
          (milestone.status === "complete" ? "completed" : "active"),
        submilestoneKey: target.key,
        updatedAt: now,
      };
      if (existing) {
        await ctx.db.patch(existing._id, row);
        assignmentIds.push(existing._id);
      } else {
        assignmentIds.push(
          await ctx.db.insert("milestoneContractorAssignments", {
            ...row,
            brokerageId: auth.brokerage._id,
            buildId: args.buildId,
            createdAt: now,
            organizationId: args.workosOrganizationId,
          }),
        );
      }
    }
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "assignActiveBuildContractorToMilestone",
      eventType: "active_build.contractor.milestone_assigned",
      newState: JSON.stringify({
        assignmentIds,
        contractorId: args.contractorId,
        estimatedCostCents,
        actualCostCents,
        milestoneKey: args.milestoneKey,
        postHoc: Boolean(args.postHoc),
        submilestoneKeys,
      }),
      reason: args.note,
    });
    return assignmentIds;
  })
  .public();

export const recordContractorQualityRating = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    contractorId: v.id("contractorProfiles"),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    rating: v.number(),
    source: contractorQualityRatingSourceInput,
    sourceEvidenceKey: v.optional(v.string()),
    sourceVisitId: v.optional(v.string()),
    submilestoneKey: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorQualityRatings"))
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const ratingId = await insertContractorQualityRating(ctx, {
      auth,
      buildId: args.buildId,
      contractorId: args.contractorId,
      milestoneKey: args.milestoneKey,
      note: args.note,
      rating: args.rating,
      source: args.source,
      sourceEvidenceKey: args.sourceEvidenceKey,
      sourceVisitId: args.sourceVisitId,
      submilestoneKey: args.submilestoneKey,
      workosOrganizationId: args.workosOrganizationId,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "recordContractorQualityRating",
      eventType: "active_build.contractor.quality_rated",
      newState: JSON.stringify({
        contractorId: args.contractorId,
        milestoneKey: args.milestoneKey,
        rating: normalizeQualityRating(args.rating),
        source: args.source,
        submilestoneKey: args.submilestoneKey,
      }),
      reason: args.note,
    });
    return ratingId;
  })
  .public();

export const requestActiveBuildDraw = authenticatedMutation
  .input({
    amountCents: v.number(),
    buildId: v.id("activeBuilds"),
    drawKey: v.string(),
    note: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    const draw = await getActiveBuildDrawOrThrow(
      ctx,
      args.buildId,
      args.drawKey,
    );
    const availableLimitCents =
      await calculateActiveBuildDrawAvailableLimitCents(
        ctx,
        args.buildId,
        draw,
      );
    const patch = {
      amountCents: Math.min(
        Math.max(0, Math.round(args.amountCents)),
        availableLimitCents,
      ),
      requestNote: args.note,
      requestedAt: new Date().toISOString(),
      status: "requested" as const,
      updatedAt: Date.now(),
    };
    await ctx.db.patch(draw._id, patch);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "requestActiveBuildDraw",
      eventType: "active_build.draw.requested",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(draw),
      reason: args.note,
    });
    return null;
  })
  .public();

export const approveActiveBuildDraw = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    drawKey: v.string(),
    note: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const draw = await getActiveBuildDrawOrThrow(
      ctx,
      args.buildId,
      args.drawKey,
    );
    const availableLimitCents =
      await calculateActiveBuildDrawAvailableLimitCents(
        ctx,
        args.buildId,
        draw,
      );
    if (Math.max(0, Math.round(draw.amountCents)) > availableLimitCents) {
      throw new Error(
        `Requested draw exceeds the available draw limit of ${availableLimitCents} cents.`,
      );
    }
    const patch = {
      requestReviewNote: args.note,
      reviewedAt: new Date().toISOString(),
      status: "approved" as const,
      updatedAt: Date.now(),
    };
    await ctx.db.patch(draw._id, patch);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "approveActiveBuildDraw",
      eventType: "active_build.draw.approved",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(draw),
      reason: args.note,
    });
    return null;
  })
  .public();

export const rejectActiveBuildDraw = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    drawKey: v.string(),
    note: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const draw = await getActiveBuildDrawOrThrow(
      ctx,
      args.buildId,
      args.drawKey,
    );
    const patch = {
      requestReviewNote: args.note,
      reviewedAt: new Date().toISOString(),
      status: "rejected" as const,
      updatedAt: Date.now(),
    };
    await ctx.db.patch(draw._id, patch);
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "rejectActiveBuildDraw",
      eventType: "active_build.draw.rejected",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(draw),
      reason: args.note,
    });
    return null;
  })
  .public();

export const releaseActiveBuildDraw = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    drawKey: v.string(),
    note: v.optional(v.string()),
    releaseDate: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const draw = await getActiveBuildDrawOrThrow(
      ctx,
      args.buildId,
      args.drawKey,
    );
    const patch = {
      releaseDate: args.releaseDate,
      releaseNote: args.note,
      releasedAt: new Date().toISOString(),
      status: "released" as const,
      updatedAt: Date.now(),
    };
    await ctx.db.patch(draw._id, patch);
    await ctx.db.insert("capitalEvents", {
      amountCents: draw.amountCents,
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      createdAt: Date.now(),
      eventDate: args.releaseDate,
      eventType: "draw_release",
      label: draw.label,
      organizationId: args.workosOrganizationId,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "releaseActiveBuildDraw",
      eventType: "active_build.draw.released",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(draw),
      reason: args.note,
    });
    return null;
  })
  .public();

export const requestActiveBuildMilestoneInfo = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    milestoneKey: v.string(),
    note: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    const completionReview = {
      ...(milestone.completionReview ?? {}),
      note: args.note,
      reviewedAt: new Date().toISOString(),
      status: "revisionRequested",
    };
    await ctx.db.patch(milestone._id, {
      completionReview,
      evidenceState: "Info requested",
      status: milestone.status === "planned" ? "in_progress" : milestone.status,
      updatedAt: Date.now(),
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "requestActiveBuildMilestoneInfo",
      eventType: "active_build.milestone.info_requested",
      newState: JSON.stringify(completionReview),
      priorState: JSON.stringify(milestone.completionReview),
      reason: args.note,
    });
    return null;
  })
  .public();

export const assignActiveBuildSiteVisit = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    requestedDay: v.number(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      note: v.optional(v.string()),
      requestedAt: v.string(),
      requestedDay: v.number(),
      status: v.string(),
      tokenExpiresAt: v.number(),
      url: v.string(),
      visitId: v.string(),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    const now = Date.now();
    const visitId = `active_visit_${args.milestoneKey}_${now}`;
    const siteVisit = {
      ...(args.note ? { note: args.note } : {}),
      requestedAt: new Date(now).toISOString(),
      requestedDay: Math.max(0, Math.round(args.requestedDay)),
      status: "requested",
      tokenExpiresAt: now + 60 * 60 * 1000,
      url: `/newsitevisit/${String(args.buildId)}/${visitId}`,
      visitId,
    };
    await ctx.db.insert("buildSiteVisits", {
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      buildMilestoneId: milestone._id,
      createdAt: now,
      milestoneKey: args.milestoneKey,
      note: args.note,
      organizationId: args.workosOrganizationId,
      requestedAt: siteVisit.requestedAt,
      requestedDay: siteVisit.requestedDay,
      status: "requested",
      tokenExpiresAt: siteVisit.tokenExpiresAt,
      updatedAt: now,
      url: siteVisit.url,
      visitId,
    });
    const completionReview = {
      ...(milestone.completionReview ?? {}),
      reviewedAt:
        milestone.completionReview?.reviewedAt ?? siteVisit.requestedAt,
      siteVisit,
      status: milestone.completionReview?.status ?? "revisionRequested",
    };
    await ctx.db.patch(milestone._id, {
      completionReview,
      evidenceState: milestone.evidenceState ?? "Site visit requested",
      status: milestone.status === "planned" ? "in_progress" : milestone.status,
      updatedAt: now,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "assignActiveBuildSiteVisit",
      eventType: "active_build.site_visit.requested",
      newState: JSON.stringify(siteVisit),
      priorState: JSON.stringify(milestone.completionReview),
      reason: args.note,
    });
    return siteVisit;
  })
  .public();

export const approveActiveBuildMilestone = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    const completionReview = {
      ...(milestone.completionReview ?? {}),
      ...(args.note ? { note: args.note } : {}),
      reviewedAt: new Date().toISOString(),
      status: "approved",
    };
    await ctx.db.patch(milestone._id, {
      completionReview,
      evidenceState: "Approved",
      status: "complete",
      updatedAt: Date.now(),
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "approveActiveBuildMilestone",
      eventType: "active_build.milestone.approved",
      newState: JSON.stringify(completionReview),
      priorState: JSON.stringify(milestone.completionReview),
      reason: args.note,
    });
    return null;
  })
  .public();

export const rejectActiveBuildMilestone = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    const completionReview = {
      ...(milestone.completionReview ?? {}),
      ...(args.note ? { note: args.note } : {}),
      reviewedAt: new Date().toISOString(),
      status: "rejected",
    };
    await ctx.db.patch(milestone._id, {
      completionReview,
      evidenceState: "Rejected",
      status:
        milestone.status === "complete" ? "in_progress" : milestone.status,
      updatedAt: Date.now(),
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "rejectActiveBuildMilestone",
      eventType: "active_build.milestone.rejected",
      newState: JSON.stringify(completionReview),
      priorState: JSON.stringify(milestone.completionReview),
      reason: args.note,
    });
    return null;
  })
  .public();

async function authorizeBrokerage(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  workosOrganizationId: string,
) {
  const scope = await resolveBrokerageScope(ctx, workosOrganizationId);
  if (!scope.brokerage) {
    throw new Error("Forbidden: brokerage");
  }

  return {
    brokerage: scope.brokerage,
    roles: scope.roles,
    subject: scope.subject,
  };
}

async function resolveBrokerageScope(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  workosOrganizationId: string,
) {
  const roles = normalizeRoleSlugs(ctx.viewer.roles);
  const subject = ctx.viewer.subject;
  const membership = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (q) => q.eq("workosUserId", subject))
    .filter((q) => q.eq(q.field("workosOrganizationId"), workosOrganizationId))
    .first();
  if (!membership || membership.status !== "active") {
    throw new Error("Forbidden: WorkOS membership");
  }

  const brokerage = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (q) =>
      q.eq("workosOrganizationId", workosOrganizationId),
    )
    .unique();
  const activeBrokerage = brokerage?.status === "active" ? brokerage : null;

  return { brokerage: activeBrokerage, roles, subject };
}

async function authorizeActiveBuild(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  buildId: Id<"activeBuilds">,
  workosOrganizationId: string,
) {
  const auth = await authorizeBrokerage(ctx, workosOrganizationId);
  const build = await ctx.db.get(buildId);
  if (!build || build.brokerageId !== auth.brokerage._id) {
    return null;
  }
  const proposal = await ctx.db.get(build.proposalId);
  if (!proposal || proposal.brokerageId !== auth.brokerage._id) {
    return null;
  }
  if (isBackoffice(auth.roles)) {
    await assertBackofficeProposalRead(ctx, auth, proposal);
  } else {
    await assertBuilderOwnership(
      ctx,
      assignedBuilderProfileIdOrThrow(proposal),
      auth.subject,
    );
  }
  return { ...auth, build, proposal };
}

async function authorizeActiveBuildOrThrow(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  buildId: Id<"activeBuilds">,
  workosOrganizationId: string,
) {
  const auth = await authorizeActiveBuild(ctx, buildId, workosOrganizationId);
  if (!auth) {
    throw new Error("Forbidden: active build scope");
  }
  return auth;
}

function requireBackofficeActiveBuildWrite(auth: {
  proposal: Doc<"buildProposals">;
  roles: RoleSlug[];
  subject: string;
}) {
  requireAnyRole(auth.roles, BACKOFFICE_ROLES);
  requireBackofficeProposalWrite(auth, auth.proposal);
}

async function getPrimaryLoanFacility(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
) {
  const facilities = await collectByIndex(
    ctx,
    "loanFacilities",
    "by_build",
    buildId,
  );
  return facilities[0] ?? null;
}

async function authorizeProposal(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  proposalId: Id<"buildProposals">,
  workosOrganizationId: string,
) {
  const auth = await authorizeBrokerage(ctx, workosOrganizationId);
  const proposal = await ctx.db.get(proposalId);
  if (!proposal || proposal.brokerageId !== auth.brokerage._id) {
    throw new Error("Forbidden: proposal scope");
  }
  if (isBackoffice(auth.roles)) {
    try {
      await assertBackofficeProposalRead(ctx, auth, proposal);
    } catch (error) {
      if (
        await hasActiveCollaborationParticipant(ctx, proposal._id, auth.subject)
      ) {
        return { ...auth, proposal };
      }
      throw error;
    }
  } else {
    try {
      await assertBuilderOwnership(
        ctx,
        assignedBuilderProfileIdOrThrow(proposal),
        auth.subject,
      );
    } catch (error) {
      if (
        await hasActiveCollaborationParticipant(ctx, proposal._id, auth.subject)
      ) {
        return { ...auth, proposal };
      }
      throw error;
    }
  }
  return { ...auth, proposal };
}

async function assertBuilderProfileScope(
  ctx: QueryCtx | MutationCtx,
  builderProfileId: Id<"builderProfiles">,
  brokerageId: Id<"brokerages">,
) {
  const builder = await ctx.db.get(builderProfileId);
  if (
    !builder ||
    builder.brokerageId !== brokerageId ||
    builder.status !== "active"
  ) {
    throw new Error("Forbidden: builder scope");
  }
}

function assignedBuilderProfileIdOrThrow(
  proposal: Pick<Doc<"buildProposals">, "builderProfileId">,
  message = "Proposal is not assigned to a builder.",
) {
  if (!proposal.builderProfileId) {
    throw new Error(message);
  }
  return proposal.builderProfileId;
}

async function assertBuilderOwnership(
  ctx: QueryCtx | MutationCtx,
  builderProfileId: Id<"builderProfiles">,
  workosUserId: string,
) {
  const link = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder_user", (q) =>
      q
        .eq("builderProfileId", builderProfileId)
        .eq("workosUserId", workosUserId),
    )
    .unique();
  if (!link || link.status !== "active") {
    throw new Error("Forbidden: builder ownership");
  }
}

async function getOwnedBuilderProfile(
  ctx: QueryCtx | MutationCtx,
  brokerageId: Id<"brokerages">,
  workosUserId: string,
) {
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_user", (q) => q.eq("workosUserId", workosUserId))
    .collect();
  for (const link of links.filter((row) => row.status === "active")) {
    const builderProfile = await ctx.db.get(link.builderProfileId);
    if (
      builderProfile &&
      builderProfile.brokerageId === brokerageId &&
      builderProfile.status === "active"
    ) {
      return builderProfile;
    }
  }
  return null;
}

async function getWorkosUserById(
  ctx: QueryCtx | MutationCtx,
  workosUserId: string,
) {
  return await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (q) => q.eq("workosUserId", workosUserId))
    .first();
}

async function getProposalClaimLinkByToken(
  ctx: QueryCtx | MutationCtx,
  claimToken: string,
) {
  const trimmed = claimToken.trim();
  if (!trimmed) {
    return null;
  }
  const hashedToken = await shareTokenHash(trimmed);
  return await ctx.db
    .query("proposalClaimLinks")
    .withIndex("by_share_token_hash", (q) =>
      q.eq("shareTokenHash", hashedToken),
    )
    .unique();
}

function canClaimDraftProposal(roles: readonly RoleSlug[]) {
  return (
    roles.length === 0 ||
    roles.includes("member") ||
    roles.includes("admin") ||
    roles.some((role) => (BUILDER_ROLES as readonly RoleSlug[]).includes(role))
  );
}

async function getOrCreateClaimantBuilderProfile(
  ctx: MutationCtx,
  input: {
    auth: {
      brokerage: Doc<"brokerages">;
      subject: string;
    };
    now: number;
    proposal: Doc<"buildProposals">;
    workosOrganizationId: string;
  },
) {
  const existing = await getOwnedBuilderProfile(
    ctx,
    input.auth.brokerage._id,
    input.auth.subject,
  );
  if (existing) {
    return existing;
  }

  const user = await getWorkosUserById(ctx, input.auth.subject);
  const displayName = claimBuilderDisplayName(user, input.proposal);
  const builderProfileId = await ctx.db.insert("builderProfiles", {
    brokerageId: input.auth.brokerage._id,
    createdAt: input.now,
    displayName,
    legalName: displayName,
    organizationId: input.workosOrganizationId,
    status: "active",
    updatedAt: input.now,
  });
  await ctx.db.insert("builderAccountLinks", {
    brokerageId: input.auth.brokerage._id,
    builderProfileId,
    createdAt: input.now,
    role: "owner",
    status: "active",
    updatedAt: input.now,
    workosUserId: input.auth.subject,
  });
  const builderProfile = await ctx.db.get(builderProfileId);
  if (!builderProfile) {
    throw new Error("Builder profile creation failed.");
  }
  return builderProfile;
}

function claimBuilderDisplayName(
  user: Doc<"users"> | null,
  proposal: Doc<"buildProposals">,
) {
  const name = user?.name?.trim();
  if (name && name !== user?.email) {
    return name;
  }
  const email = user?.email?.trim();
  if (email) {
    return email.split("@")[0] || email;
  }
  return `${proposal.buildName} builder`;
}

async function ensureBuilderRoleProjection(
  ctx: MutationCtx,
  input: {
    now: number;
    workosOrganizationId: string;
    workosUserId: string;
  },
) {
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (q) => q.eq("workosUserId", input.workosUserId))
    .collect();
  const membership = memberships.find(
    (row) => row.workosOrganizationId === input.workosOrganizationId,
  );
  if (!membership) {
    return;
  }
  const roleSlugs = new Set(membership.roleSlugs ?? []);
  roleSlugs.add("builder");
  const roleSlug =
    !membership.roleSlug || membership.roleSlug === "member"
      ? "builder"
      : membership.roleSlug;
  await ctx.db.patch(membership._id, {
    roleSlug,
    roleSlugs: [...roleSlugs],
    updatedAt: input.now,
  });
}

async function builderAccountSummaries(
  ctx: QueryCtx | MutationCtx,
  builderProfileId: Id<"builderProfiles">,
) {
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder", (q) => q.eq("builderProfileId", builderProfileId))
    .collect();
  const activeLinks = links.filter((link) => link.status === "active");
  const summaries = [];
  for (const link of activeLinks) {
    const user = await getWorkosUserById(ctx, link.workosUserId);
    summaries.push({
      ...(user?.email ? { email: user.email } : {}),
      ...(user?.name ? { name: user.name } : {}),
      role: link.role,
      workosUserId: link.workosUserId,
    });
  }
  return summaries;
}

function workosUserSummary(
  workosUserId: string | undefined,
  user: Doc<"users"> | null,
) {
  if (!workosUserId) {
    return null;
  }
  return {
    ...(user?.email ? { email: user.email } : {}),
    ...(user?.name ? { name: user.name } : {}),
    workosUserId,
  };
}

async function buildProposalIdentityProjection(
  ctx: QueryCtx | MutationCtx,
  proposal: Doc<"buildProposals">,
  brokerage: Doc<"brokerages">,
) {
  const builderProfile = proposal.builderProfileId
    ? await ctx.db.get(proposal.builderProfileId)
    : null;
  const builderAccounts = builderProfile
    ? await builderAccountSummaries(ctx, builderProfile._id)
    : [];
  const assignedBrokerUser = proposal.assignedBrokerWorkosUserId
    ? await getWorkosUserById(ctx, proposal.assignedBrokerWorkosUserId)
    : null;
  const createdByUser = await getWorkosUserById(
    ctx,
    proposal.createdByWorkosUserId,
  );
  const activeClaimLink = await ctx.db
    .query("proposalClaimLinks")
    .withIndex("by_proposal_status", (q) =>
      q.eq("proposalId", proposal._id).eq("status", "active"),
    )
    .first();
  const claimLinkActive = Boolean(
    activeClaimLink &&
    (!activeClaimLink.expiresAt || activeClaimLink.expiresAt >= Date.now()),
  );
  const builderOwnerEmail =
    builderAccounts.find((account) => account.role === "owner")?.email ??
    builderAccounts[0]?.email;

  return {
    broker: workosUserSummary(
      proposal.assignedBrokerWorkosUserId,
      assignedBrokerUser,
    ),
    brokerage: {
      _id: brokerage._id,
      displayName: brokerage.displayName,
      legalName: brokerage.legalName,
      workosOrganizationId: brokerage.workosOrganizationId,
    },
    builder: builderProfile
      ? {
          _id: builderProfile._id,
          accounts: builderAccounts,
          displayName: builderProfile.displayName,
          ...(builderProfile.legalName
            ? { legalName: builderProfile.legalName }
            : {}),
          ...(builderOwnerEmail ? { ownerEmail: builderOwnerEmail } : {}),
          status: builderProfile.status,
        }
      : null,
    builderAssigned: Boolean(builderProfile),
    claimLinkActive,
    createdBy: workosUserSummary(proposal.createdByWorkosUserId, createdByUser),
    initiatedFromBackoffice:
      !proposal.builderProfileId &&
      Boolean(proposal.assignedBrokerWorkosUserId),
  };
}

function isBackoffice(roles: readonly RoleSlug[]) {
  return roles.some((role) =>
    (BACKOFFICE_ROLES as readonly RoleSlug[]).includes(role),
  );
}

function productionDashboardProposalCard(
  card: Doc<"proposalKanbanCards"> | null,
  proposal: Doc<"buildProposals">,
) {
  return {
    address: card?.subtitle ?? proposal.location,
    approvedAt: proposal.approvedAt,
    borrowerWorkingCapitalLimitCents: proposal.borrowerWorkingCapitalLimitCents,
    builderAssigned: Boolean(proposal.builderProfileId),
    builder: card?.builderName ?? "Unassigned builder",
    closeLabel:
      proposal.status === "approved" && !proposal.activeBuildId
        ? "Pending closing"
        : undefined,
    column: card?.column ?? proposal.status,
    createdAt: proposal.createdAt,
    href: card?.href ?? `/backoffice/proposals/${proposal._id}`,
    id: String(proposal._id),
    lenderDrawPolicyLimitCents: proposal.lenderDrawPolicyLimitCents,
    loanAmount: centsToCurrency(
      card?.totalBudgetCents ?? proposal.totalBudgetCents,
    ),
    ltv: 0,
    name: card?.title ?? proposal.buildName,
    proposalId: String(proposal._id),
    reviewOutcome: proposal.reviewOutcome,
    status: proposal.status,
    statusLabel: productionProposalStatusLabel(proposal),
    submittedAt: proposal.submittedAt,
    tag: "production",
    totalBudgetCents: proposal.totalBudgetCents,
    updatedAt: proposal.updatedAt,
  };
}

function productionProposalStatusLabel(proposal: Doc<"buildProposals">) {
  if (proposal.reviewOutcome === "rejected") {
    return "Rejected";
  }
  if (proposal.reviewOutcome === "requested_changes") {
    return "Changes requested";
  }
  if (proposal.status === "approved" && !proposal.activeBuildId) {
    return "Approved - pending closing";
  }
  return titleCase(proposal.status);
}

function productionProposalColumnDescription(
  column: (typeof PROPOSAL_COLUMNS)[number],
  proposals: ReturnType<typeof productionDashboardProposalCard>[],
) {
  const count = proposals.filter(
    (proposal) => proposal.column === column,
  ).length;
  if (column === "approved") {
    return `${count} approved proposals pending or ready for closing`;
  }
  if (column === "submitted") {
    return `${count} submitted proposals in lender review`;
  }
  if (column === "closed") {
    return `${count} proposals converted to active builds`;
  }
  return `${count} draft proposals`;
}

function productionBuildDisplayId(build: Doc<"activeBuilds">) {
  return `B-${String(build._id).slice(-8).toUpperCase()}`;
}

function productionDrawUrgencyRank(
  status: Doc<"plannedDrawScheduleRows">["status"],
): number {
  switch (status) {
    case "requested":
      return 0;
    case "approved":
      return 1;
    case "planned":
      return 2;
    case "released":
      return 3;
  }
  return 4;
}

function productionDrawMonthLabel(monthKey: string) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return monthKey;
  }
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function buildBrokerageDrawChartSeries(
  draws: Array<{
    amountCents: number;
    scheduledDateIso: string;
    status: Doc<"plannedDrawScheduleRows">["status"];
  }>,
) {
  const bucketTotals = new Map<
    string,
    {
      approvedCents: number;
      plannedCents: number;
      releasedCents: number;
      requestedCents: number;
    }
  >();
  for (const draw of draws) {
    if (draw.status === "rejected") {
      continue;
    }
    const periodKey = draw.scheduledDateIso.slice(0, 7);
    const existing = bucketTotals.get(periodKey) ?? {
      approvedCents: 0,
      plannedCents: 0,
      releasedCents: 0,
      requestedCents: 0,
    };
    if (draw.status === "planned") {
      existing.plannedCents += draw.amountCents;
    } else if (draw.status === "requested") {
      existing.requestedCents += draw.amountCents;
    } else if (draw.status === "approved") {
      existing.approvedCents += draw.amountCents;
    } else if (draw.status === "released") {
      existing.releasedCents += draw.amountCents;
    }
    bucketTotals.set(periodKey, existing);
  }
  const periodKeys = [...bucketTotals.keys()].sort();
  if (periodKeys.length === 0) {
    return [];
  }
  return periodKeys.map((periodKey) => {
    const totals = bucketTotals.get(periodKey)!;
    return {
      approvedCents: totals.approvedCents,
      periodKey,
      periodLabel: productionDrawMonthLabel(periodKey),
      plannedCents: totals.plannedCents,
      releasedCents: totals.releasedCents,
      requestedCents: totals.requestedCents,
    };
  });
}

type ProductionSiteVisitOperationalStatus =
  | "open"
  | "in_field"
  | "expired"
  | "complete"
  | "cancelled";

function productionSiteVisitOperationalStatus(
  visit: Pick<
    Doc<"buildSiteVisits">,
    "status" | "tokenConsumedAt" | "tokenExpiresAt" | "tokenOpenedAt"
  >,
  now = Date.now(),
): ProductionSiteVisitOperationalStatus {
  if (visit.status === "complete") {
    return "complete";
  }
  if (visit.status === "cancelled") {
    return "cancelled";
  }
  if (visit.tokenExpiresAt <= now) {
    return "expired";
  }
  if (visit.tokenOpenedAt) {
    return "in_field";
  }
  return "open";
}

function productionSiteVisitTokenState(
  visit: Pick<
    Doc<"buildSiteVisits">,
    "status" | "tokenConsumedAt" | "tokenExpiresAt" | "tokenOpenedAt"
  >,
  now = Date.now(),
): "not_sent" | "live" | "opened" | "consumed" | "expired" {
  if (visit.tokenConsumedAt) {
    return "consumed";
  }
  if (visit.status === "complete") {
    return "consumed";
  }
  if (visit.status === "cancelled") {
    return "expired";
  }
  if (visit.tokenExpiresAt <= now) {
    return "expired";
  }
  if (visit.tokenOpenedAt) {
    return "opened";
  }
  return "live";
}

function productionSiteVisitUrgencyRank(
  status: ProductionSiteVisitOperationalStatus,
) {
  switch (status) {
    case "expired":
      return 0;
    case "open":
      return 1;
    case "in_field":
      return 2;
    case "complete":
      return 3;
    case "cancelled":
      return 4;
    default:
      return 5;
  }
}

function productionSiteVisitScheduledLabel(
  buildStartDate: string,
  requestedDay: number,
) {
  const startMs = Date.parse(`${buildStartDate}T00:00:00Z`);
  if (!Number.isFinite(startMs)) {
    return `Day ${requestedDay}`;
  }
  const scheduled = new Date(startMs + requestedDay * 86_400_000);
  return scheduled.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    weekday: "short",
  });
}

function productionDaysActive(startDate: string) {
  const startMs = Date.parse(`${startDate}T00:00:00Z`);
  if (!Number.isFinite(startMs)) {
    return 0;
  }
  return Math.max(0, Math.floor((Date.now() - startMs) / 86_400_000));
}

function daysBetweenIso(startIso: string, endIso: string) {
  const parseDay = (value: string) => {
    const dayPart = value.includes("T") ? value.slice(0, 10) : value;
    const ms = Date.parse(`${dayPart}T00:00:00Z`);
    return Number.isFinite(ms) ? ms : Date.now();
  };
  return Math.max(
    0,
    Math.round((parseDay(endIso) - parseDay(startIso)) / 86_400_000),
  );
}

function normalizeIsoDate(value: unknown, message: string) {
  if (typeof value !== "string") {
    throw new Error(message);
  }
  const day = value.slice(0, 10);
  const parsed = Date.parse(`${day}T00:00:00Z`);
  if (!(/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(parsed))) {
    throw new Error(message);
  }
  return day;
}

function normalizePositiveCents(value: unknown, message: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(message);
  }
  const rounded = Math.round(value);
  if (rounded <= 0) {
    throw new Error(message);
  }
  return rounded;
}

function activeBuildTimelineDrawStatus(
  status: Doc<"plannedDrawScheduleRows">["status"],
) {
  if (status === "requested") {
    return "requested" as const;
  }
  if (status === "approved" || status === "released") {
    return "approved" as const;
  }
  if (status === "rejected") {
    return "rejected" as const;
  }
  return "draft" as const;
}

function activeBuildTimelineMilestoneStatus(
  milestone: Doc<"buildMilestones">,
  schedule?: {
    currentDay: number;
    milestones: readonly Doc<"buildMilestones">[];
  },
) {
  if (milestone.status === "complete") {
    return "complete" as const;
  }
  if (milestone.completionClaim) {
    return "review" as const;
  }
  if (milestone.status === "in_progress") {
    return "ready" as const;
  }
  if (
    schedule &&
    schedule.currentDay >= milestone.dayStart &&
    activeBuildMilestoneDependencyBlockers(milestone, schedule.milestones)
      .length === 0
  ) {
    return "ready" as const;
  }
  return "upcoming" as const;
}

function activeBuildTimelineMilestoneTone(
  milestone: Doc<"buildMilestones">,
  status: ReturnType<typeof activeBuildTimelineMilestoneStatus>,
  currentDay: number,
) {
  if (status === "complete") {
    return "complete" as const;
  }
  if (currentDay > milestone.dayEnd) {
    return "warning" as const;
  }
  if (status === "ready" || status === "review") {
    return "active" as const;
  }
  return "upcoming" as const;
}

function activeBuildMilestoneDependencyBlockers(
  milestone: Doc<"buildMilestones">,
  milestones: readonly Doc<"buildMilestones">[],
) {
  const byKey = new Map(milestones.map((row) => [row.key, row]));
  return (milestone.dependencyKeys ?? []).filter((key) => {
    const dependency = byKey.get(key);
    return !dependency || dependency.status !== "complete";
  });
}

function activeBuildSiteVisitCompletionReviewView(
  visit?: Doc<"buildSiteVisits">,
) {
  if (!visit) {
    return;
  }
  const siteVisit = {
    ...(visit.completedAt ? { completedAt: visit.completedAt } : {}),
    ...(visit.note ? { note: visit.note } : {}),
    ...(visit.recordNote ? { recordNote: visit.recordNote } : {}),
    ...(visit.recordNoteFormat
      ? { recordNoteFormat: visit.recordNoteFormat }
      : {}),
    requestedAt: visit.requestedAt,
    requestedDay: visit.requestedDay,
    status: visit.status,
    tokenExpiresAt: visit.tokenExpiresAt,
    url: visit.url,
    visitId: visit.visitId,
  };
  return {
    reviewedAt: visit.completedAt ?? visit.requestedAt,
    siteVisit,
    status: "revisionRequested" as const,
  };
}

function productionBuildDashboardStatus(
  _status: Doc<"activeBuilds">["status"],
): "behind" | "onTrack" | "overBudget" {
  return "onTrack";
}

function productionBuildStatusLabel(status: Doc<"activeBuilds">["status"]) {
  return status === "future_start" ? "Future start" : "On track";
}

function productionBuildRosterPhase({
  build,
  drawRequestsPending,
  expiredSiteVisits,
  loan,
  milestones,
  milestonesInReview,
}: {
  build: Doc<"activeBuilds">;
  drawRequestsPending: number;
  expiredSiteVisits: number;
  loan: Doc<"loanFacilities"> | null;
  milestones: Doc<"buildMilestones">[];
  milestonesInReview: number;
}): "scheduled" | "active" | "attention" | "completed" {
  if (build.status === "future_start") {
    return "scheduled";
  }
  const allMilestonesComplete =
    milestones.length > 0 &&
    milestones.every((milestone) => milestone.status === "complete");
  if (loan?.status === "closed" || allMilestonesComplete) {
    return "completed";
  }
  if (
    expiredSiteVisits > 0 ||
    drawRequestsPending > 0 ||
    milestonesInReview > 0
  ) {
    return "attention";
  }
  return "active";
}

function productionMilestoneState(
  status: Doc<"buildMilestones">["status"],
): "backlog" | "inProgress" | "inReview" {
  if (status === "in_progress") {
    return "inProgress";
  }
  if (status === "complete") {
    return "inReview";
  }
  return "backlog";
}

function productionMilestoneNeedsBackofficeReview(
  milestone: Doc<"buildMilestones">,
) {
  if (!milestone.completionClaim) {
    return false;
  }
  if (
    milestone.status === "complete" ||
    milestone.completionReview?.status === "approved"
  ) {
    return false;
  }
  return true;
}

function productionMilestoneColumn(milestone: Doc<"buildMilestones">) {
  const siteVisitStatus = milestone.completionReview?.siteVisit?.status;
  if (siteVisitStatus === "requested") {
    return "needsSiteVisit";
  }
  if (siteVisitStatus === "complete") {
    return "inReview";
  }
  return "backlog";
}

function productionMilestonePriority(milestone: Doc<"buildMilestones">) {
  if (milestone.status === "in_progress") {
    return "high";
  }
  return "medium";
}

function centsToCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

async function assertBackofficeProposalRead(
  ctx: QueryCtx | MutationCtx,
  auth: {
    brokerage: Doc<"brokerages">;
    roles: RoleSlug[];
    subject: string;
  },
  proposal: Doc<"buildProposals">,
) {
  if (canReadBackofficeProposal(auth, proposal)) {
    return;
  }
  if (
    auth.roles.includes("broker-staff") &&
    (await hasPermission(
      ctx,
      auth.brokerage.workosOrganizationId,
      auth.roles,
      "proposals:read",
    ))
  ) {
    return;
  }

  throw new Error("Forbidden: proposal scope");
}

function canReadBackofficeProposal(
  auth: {
    roles: RoleSlug[];
  },
  _proposal: Doc<"buildProposals">,
) {
  if (
    auth.roles.includes("admin") ||
    auth.roles.includes("principle-broker") ||
    auth.roles.includes("broker")
  ) {
    return true;
  }
  return false;
}

function canWriteBackofficeProposal(
  auth: { roles: RoleSlug[]; subject: string },
  proposal: Doc<"buildProposals">,
) {
  if (auth.roles.includes("admin") || auth.roles.includes("principle-broker")) {
    return true;
  }
  return (
    auth.roles.includes("broker") &&
    proposal.assignedBrokerWorkosUserId === auth.subject
  );
}

function requireBackofficeProposalWrite(
  auth: { roles: RoleSlug[]; subject: string },
  proposal: Doc<"buildProposals">,
) {
  if (canWriteBackofficeProposal(auth, proposal)) {
    return;
  }
  throw new Error("Forbidden: proposal write");
}

async function hasPermission(
  ctx: QueryCtx | MutationCtx,
  workosOrganizationId: string,
  roles: readonly RoleSlug[],
  permission: string,
) {
  for (const role of roles) {
    const organizationRole = await ctx.db
      .query("workosOrganizationRoles")
      .withIndex("by_organization_slug", (q) =>
        q.eq("workosOrganizationId", workosOrganizationId).eq("slug", role),
      )
      .unique();
    if (
      organizationRole?.status === "active" &&
      organizationRole.permissionSlugs.includes(permission)
    ) {
      return true;
    }

    const globalRole = await ctx.db
      .query("workosRoles")
      .withIndex("by_slug", (q) => q.eq("slug", role))
      .unique();
    if (
      globalRole?.status === "active" &&
      globalRole.permissionSlugs.includes(permission)
    ) {
      return true;
    }
  }

  return false;
}

function requireAnyRole(
  actual: readonly RoleSlug[],
  allowed: readonly RoleSlug[] | readonly string[],
) {
  const allowedRoles: readonly string[] = allowed;
  if (!actual.some((role) => allowedRoles.includes(role))) {
    throw new Error("Forbidden: role");
  }
}

function normalizeOptionalString(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeOptionalMoneyCents(value?: number) {
  if (value === undefined) {
    return;
  }
  if (!Number.isFinite(value)) {
    throw new Error("Contractor cost value must be a finite number.");
  }
  return Math.max(0, Math.round(value));
}

function normalizeOptionalHours(value?: number) {
  if (value === undefined) {
    return;
  }
  if (!Number.isFinite(value)) {
    throw new Error("Contractor hours value must be a finite number.");
  }
  return Math.max(0, Math.round(value * 100) / 100);
}

function deriveContractorAssignmentCost(input: {
  hours?: number;
  rateCents?: number;
  rateUnit?: "hour" | "day" | "fixed";
}) {
  if (input.rateCents === undefined) {
    return;
  }
  if (input.rateUnit === "fixed") {
    return input.rateCents;
  }
  if (input.rateUnit === "hour" && input.hours !== undefined) {
    return Math.round(input.rateCents * input.hours);
  }
  return;
}

function normalizeQualityRating(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error("Contractor quality rating must be a finite number.");
  }
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 5) {
    throw new Error("Contractor quality rating must be between 1 and 5.");
  }
  return rounded;
}

async function getScopedContractorOrThrow(
  ctx: QueryCtx | MutationCtx,
  contractorId: Id<"contractorProfiles">,
  brokerageId: Id<"brokerages">,
) {
  const contractor = await ctx.db.get(contractorId);
  if (!contractor || contractor.brokerageId !== brokerageId) {
    throw new Error("Production contractor not found.");
  }
  return contractor;
}

async function resolveDraftProposalContractorProfile(
  ctx: MutationCtx,
  input: {
    auth: {
      brokerage: Doc<"brokerages">;
      roles: RoleSlug[];
      subject: string;
    };
    contractorId?: Id<"contractorProfiles">;
    contractorName: string;
    now: number;
    role: string;
    workosOrganizationId: string;
  },
) {
  if (input.contractorId) {
    const contractor = await getScopedContractorOrThrow(
      ctx,
      input.contractorId,
      input.auth.brokerage._id,
    );
    if (contractor.status !== "active") {
      throw new Error("Production contractor is inactive.");
    }
    return input.contractorId;
  }

  const contractorName = normalizeRequiredText(
    input.contractorName,
    "Contractor name",
  );
  const existing = (
    await ctx.db
      .query("contractorProfiles")
      .withIndex("by_brokerage", (q) =>
        q.eq("brokerageId", input.auth.brokerage._id),
      )
      .collect()
  ).find(
    (contractor) =>
      contractor.status === "active" &&
      contractor.name.trim().toLowerCase() === contractorName.toLowerCase(),
  );
  if (existing) {
    return existing._id;
  }

  const contractorId = await ctx.db.insert("contractorProfiles", {
    brokerageId: input.auth.brokerage._id,
    createdAt: input.now,
    kind: "company",
    name: contractorName,
    onboardingStatus: "profile_only",
    organizationId: input.workosOrganizationId,
    status: "active",
    trades: input.role.trim() ? [input.role.trim()] : [],
    updatedAt: input.now,
  });
  await writeContractorProfileEvent(ctx, {
    auth: input.auth,
    command: "saveDraftProposalPackage",
    contractorId,
    eventType: "contractor.profile.created",
    newState: JSON.stringify({
      createdFromDraftPlanning: true,
      name: contractorName,
      trades: input.role.trim() ? [input.role.trim()] : [],
    }),
    organizationId: input.workosOrganizationId,
  });
  return contractorId;
}

async function replaceContractorOperatingRows(
  ctx: MutationCtx,
  input: {
    availabilityWindows: Array<{
      dayOfWeek: number;
      effectiveEndDate?: string;
      effectiveStartDate?: string;
      endMinute: number;
      startMinute: number;
      timezone: string;
    }>;
    brokerageId: Id<"brokerages">;
    capabilities: Array<{
      capabilityKey: string;
      label: string;
      milestoneArchetypeKey?: string;
      notes?: string;
      trade?: string;
    }>;
    contractorId: Id<"contractorProfiles">;
    equipment: Array<{
      equipmentKey: string;
      name: string;
      notes?: string;
      quantity: number;
    }>;
    now: number;
    organizationId: string;
  },
) {
  const [capabilities, equipment, windows] = await Promise.all([
    collectByIndex(
      ctx,
      "contractorCapabilities",
      "by_contractor",
      input.contractorId,
    ),
    collectByIndex(
      ctx,
      "contractorEquipment",
      "by_contractor",
      input.contractorId,
    ),
    collectByIndex(
      ctx,
      "contractorAvailabilityWindows",
      "by_contractor",
      input.contractorId,
    ),
  ]);
  for (const row of capabilities) {
    await ctx.db.delete(row._id);
  }
  for (const row of equipment) {
    await ctx.db.delete(row._id);
  }
  for (const row of windows) {
    await ctx.db.delete(row._id);
  }

  for (const capability of input.capabilities) {
    const key = capability.capabilityKey.trim();
    const label = capability.label.trim();
    if (!(key && label)) {
      continue;
    }
    await ctx.db.insert("contractorCapabilities", {
      brokerageId: input.brokerageId,
      capabilityKey: key,
      contractorId: input.contractorId,
      createdAt: input.now,
      label,
      milestoneArchetypeKey: normalizeOptionalString(
        capability.milestoneArchetypeKey,
      ),
      notes: normalizeOptionalString(capability.notes),
      organizationId: input.organizationId,
      trade: normalizeOptionalString(capability.trade),
      updatedAt: input.now,
    });
  }

  for (const row of input.equipment) {
    const key = row.equipmentKey.trim();
    const name = row.name.trim();
    if (!(key && name)) {
      continue;
    }
    await ctx.db.insert("contractorEquipment", {
      brokerageId: input.brokerageId,
      contractorId: input.contractorId,
      createdAt: input.now,
      equipmentKey: key,
      name,
      notes: normalizeOptionalString(row.notes),
      organizationId: input.organizationId,
      quantity: Math.max(0, Math.round(row.quantity)),
      updatedAt: input.now,
    });
  }

  for (const window of input.availabilityWindows) {
    await ctx.db.insert("contractorAvailabilityWindows", {
      brokerageId: input.brokerageId,
      contractorId: input.contractorId,
      createdAt: input.now,
      dayOfWeek: Math.max(0, Math.min(6, Math.round(window.dayOfWeek))),
      effectiveEndDate: normalizeOptionalString(window.effectiveEndDate),
      effectiveStartDate: normalizeOptionalString(window.effectiveStartDate),
      endMinute: Math.max(0, Math.min(24 * 60, Math.round(window.endMinute))),
      organizationId: input.organizationId,
      startMinute: Math.max(
        0,
        Math.min(24 * 60, Math.round(window.startMinute)),
      ),
      timezone: window.timezone.trim() || "UTC",
      updatedAt: input.now,
    });
  }
}

async function hydrateContractorProfiles(
  ctx: QueryCtx | MutationCtx,
  profiles: Doc<"contractorProfiles">[],
) {
  return await Promise.all(
    profiles.map(async (profile) => {
      const [capabilities, equipment, availabilityWindows] = await Promise.all([
        collectByIndex(
          ctx,
          "contractorCapabilities",
          "by_contractor",
          profile._id,
        ),
        collectByIndex(
          ctx,
          "contractorEquipment",
          "by_contractor",
          profile._id,
        ),
        collectByIndex(
          ctx,
          "contractorAvailabilityWindows",
          "by_contractor",
          profile._id,
        ),
      ]);
      return {
        ...profile,
        availabilityWindows: availabilityWindows.sort(
          (a: any, b: any) =>
            a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute,
        ),
        capabilities: capabilities.sort((a: any, b: any) =>
          a.capabilityKey.localeCompare(b.capabilityKey),
        ),
        defaultPayRateUnit: profile.defaultPayRateUnit ?? "hour",
        equipment: equipment.sort((a: any, b: any) =>
          a.equipmentKey.localeCompare(b.equipmentKey),
        ),
        kind: profile.kind ?? "company",
        onboardingStatus:
          profile.onboardingStatus ??
          (profile.accountWorkosUserId ? "account_linked" : "profile_only"),
      };
    }),
  );
}

async function addContractorRoleToExistingMembership(
  ctx: MutationCtx,
  input: {
    now: number;
    workosOrganizationId: string;
    workosUserId: string;
  },
) {
  const membership = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (q) => q.eq("workosUserId", input.workosUserId))
    .filter((q) =>
      q.eq(q.field("workosOrganizationId"), input.workosOrganizationId),
    )
    .first();
  if (!membership) {
    return;
  }
  const roleSlugs = [...new Set([...membership.roleSlugs, "contractor"])];
  await ctx.db.patch(membership._id, {
    roleSlug: membership.roleSlug ?? "contractor",
    roleSlugs,
    updatedAt: input.now,
  });
}

async function writeContractorProfileEvent(
  ctx: MutationCtx,
  input: {
    auth: { brokerage: Doc<"brokerages">; roles: RoleSlug[]; subject: string };
    command: string;
    contractorId: Id<"contractorProfiles">;
    eventType: string;
    newState?: string;
    organizationId: string;
    priorState?: string;
    reason?: string;
    warnings?: string[];
  },
) {
  const now = Date.now();
  await ctx.db.insert("auditEvents", {
    actorRoles: input.auth.roles,
    actorWorkosUserId: input.auth.subject,
    brokerageId: input.auth.brokerage._id,
    command: input.command,
    createdAt: now,
    entityId: String(input.contractorId),
    entityType: "contractorProfile",
    eventType: input.eventType,
    newState: input.newState,
    organizationId: input.organizationId,
    priorState: input.priorState,
    reason: input.reason,
    warnings: input.warnings ?? [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: input.auth.brokerage._id,
    createdAt: now,
    eventType: input.eventType,
    organizationId: input.organizationId,
    payloadPreview: JSON.stringify({
      contractorId: input.contractorId,
      newState: input.newState,
    }),
    relatedEntityId: input.contractorId,
    relatedEntityType: "contractorProfile",
    status: "pending",
  });
}

async function assertContractorDetailReadAllowed(
  ctx: QueryCtx | MutationCtx,
  input: {
    contractor: Doc<"contractorProfiles">;
    roles: readonly RoleSlug[];
    subject: string;
  },
) {
  if (input.contractor.accountWorkosUserId === input.subject) {
    return;
  }
  requireAnyRole(input.roles, BUILDER_ROLES);
  const builderProfile = await getOwnedBuilderProfile(
    ctx,
    input.contractor.brokerageId,
    input.subject,
  );
  if (!builderProfile) {
    throw new Error("Forbidden: contractor detail");
  }
  const builds = await ctx.db
    .query("activeBuilds")
    .withIndex("by_brokerage", (q) =>
      q.eq("brokerageId", input.contractor.brokerageId),
    )
    .filter((q) => q.eq(q.field("builderProfileId"), builderProfile._id))
    .collect();
  const buildIds = new Set(builds.map((build) => String(build._id)));
  const assignments = await ctx.db
    .query("milestoneContractorAssignments")
    .withIndex("by_contractor", (q) =>
      q.eq("contractorId", input.contractor._id),
    )
    .collect();
  if (
    !assignments.some((assignment) => buildIds.has(String(assignment.buildId)))
  ) {
    throw new Error("Forbidden: contractor detail");
  }
}

async function contractorWorkHistory(
  ctx: QueryCtx | MutationCtx,
  input: {
    assignments: Doc<"milestoneContractorAssignments">[];
    brokerageId: Id<"brokerages">;
    contractorId: Id<"contractorProfiles">;
  },
) {
  const rows = [];
  for (const assignment of input.assignments) {
    const [build, milestone, submilestone] = await Promise.all([
      ctx.db.get(assignment.buildId),
      ctx.db.get(assignment.buildMilestoneId),
      assignment.buildSubmilestoneId
        ? ctx.db.get(assignment.buildSubmilestoneId)
        : Promise.resolve(null),
    ]);
    if (!build || build.brokerageId !== input.brokerageId || !milestone) {
      continue;
    }
    const evidenceAssets = await ctx.db
      .query("buildEvidenceAssets")
      .withIndex("by_build_milestone", (q) =>
        q
          .eq("buildId", assignment.buildId)
          .eq("milestoneKey", assignment.milestoneKey),
      )
      .collect();
    const evidencePhotos = await Promise.all(
      evidenceAssets
        .filter((asset) => asset.mimeType.startsWith("image/"))
        .filter((asset) =>
          assignment.submilestoneKey
            ? asset.submilestoneKey === assignment.submilestoneKey
            : asset.milestoneKey === assignment.milestoneKey,
        )
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(async (asset) => ({
          evidenceKey: asset.evidenceKey,
          fileName: asset.fileName,
          label: asset.label,
          milestoneKey: asset.milestoneKey,
          previewUrl: asset.storageId
            ? await ctx.storage.getUrl(asset.storageId)
            : null,
          source: asset.source,
          submilestoneKey: asset.submilestoneKey,
          tag: asset.tag,
        })),
    );
    rows.push({
      _id: assignment._id,
      buildId: build._id,
      buildName: build.buildName,
      buildStatus: build.status,
      evidencePhotos,
      actualCostCents: assignment.actualCostCents,
      actualHours: assignment.actualHours,
      agreedRateCents: assignment.agreedRateCents,
      agreedRateUnit: assignment.agreedRateUnit,
      costNotes: assignment.costNotes,
      estimatedCostCents: assignment.estimatedCostCents,
      estimatedHours: assignment.estimatedHours,
      location: build.location,
      milestoneKey: assignment.milestoneKey,
      milestoneName: milestone.name,
      postHoc: assignment.postHoc,
      role: assignment.role,
      status: assignment.status,
      submilestones: submilestone
        ? [
            {
              key: submilestone.key,
              name: submilestone.name,
              status: submilestone.status,
            },
          ]
        : [],
      updatedAt: assignment.updatedAt,
    });
  }
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

function contractorPerformanceSummary(
  ratings: Doc<"contractorQualityRatings">[],
  assignments: Doc<"milestoneContractorAssignments">[] = [],
) {
  const averageQualityRating =
    ratings.length === 0
      ? null
      : Math.round(
          (ratings.reduce((sum, rating) => sum + rating.rating, 0) /
            ratings.length) *
            10,
        ) / 10;
  const totalEstimatedCostCents = assignments.reduce(
    (sum, assignment) => sum + (assignment.estimatedCostCents ?? 0),
    0,
  );
  const totalActualCostCents = assignments.reduce(
    (sum, assignment) => sum + (assignment.actualCostCents ?? 0),
    0,
  );
  return {
    averageQualityRating,
    assignmentCount: assignments.length,
    completedAssignmentCount: assignments.filter(
      (assignment) => assignment.status === "completed",
    ).length,
    totalActualCostCents,
    totalActualHours:
      Math.round(
        assignments.reduce(
          (sum, assignment) => sum + (assignment.actualHours ?? 0),
          0,
        ) * 100,
      ) / 100,
    totalEstimatedCostCents,
    totalEstimatedHours:
      Math.round(
        assignments.reduce(
          (sum, assignment) => sum + (assignment.estimatedHours ?? 0),
          0,
        ) * 100,
      ) / 100,
    totalVarianceCents:
      totalActualCostCents || totalEstimatedCostCents
        ? totalActualCostCents - totalEstimatedCostCents
        : 0,
    ratingCount: ratings.length,
  };
}

async function requireProposalContractorPlanningWrite(
  ctx: QueryCtx | MutationCtx,
  auth: {
    proposal: Doc<"buildProposals">;
    roles: RoleSlug[];
    subject: string;
  },
) {
  if (auth.proposal.status === "closed") {
    throw new Error("Closed proposals no longer accept planning contractors.");
  }
  if (isBackoffice(auth.roles)) {
    requireBackofficeProposalWrite(auth, auth.proposal);
  }
  await assertProposalCollaborationEditAllowed(ctx, auth);
}

async function ensureProposalContractorAssignment(
  ctx: MutationCtx,
  input: {
    agreedRateCents?: number;
    agreedRateUnit?: "hour" | "day" | "fixed";
    auth: {
      brokerage: Doc<"brokerages">;
      proposal: Doc<"buildProposals">;
    };
    contractorId: Id<"contractorProfiles">;
    endDay?: number;
    notes?: string;
    proposalId: Id<"buildProposals">;
    preserveExistingRole?: boolean;
    role: string;
    startDay?: number;
    workosOrganizationId: string;
  },
) {
  const existing = await ctx.db
    .query("proposalContractorAssignments")
    .withIndex("by_proposal_contractor", (q) =>
      q
        .eq("proposalId", input.proposalId)
        .eq("contractorId", input.contractorId),
    )
    .unique();
  const now = Date.now();
  const patch = {
    agreedRateCents: normalizeOptionalMoneyCents(input.agreedRateCents),
    agreedRateUnit: input.agreedRateUnit,
    endDay:
      input.endDay === undefined
        ? undefined
        : Math.max(0, Math.round(input.endDay)),
    notes: normalizeOptionalString(input.notes),
    role: input.role.trim() || "Contractor",
    startDay:
      input.startDay === undefined
        ? undefined
        : Math.max(0, Math.round(input.startDay)),
    status: "active" as const,
    updatedAt: now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, patch);
    if (input.preserveExistingRole) {
      await ctx.db.patch(existing._id, { role: existing.role });
    }
    return existing._id;
  }
  return await ctx.db.insert("proposalContractorAssignments", {
    ...patch,
    brokerageId: input.auth.brokerage._id,
    contractorId: input.contractorId,
    createdAt: now,
    organizationId: input.workosOrganizationId,
    proposalId: input.proposalId,
  });
}

async function resolveProposalAssignmentSubmilestones(
  ctx: QueryCtx | MutationCtx,
  input: {
    milestoneKey: string;
    proposalId: Id<"buildProposals">;
    submilestoneKeys: string[];
  },
) {
  if (input.submilestoneKeys.length === 0) {
    return [];
  }
  const submilestones = await ctx.db
    .query("proposalSubmilestones")
    .withIndex("by_proposal", (q) => q.eq("proposalId", input.proposalId))
    .filter((q) => q.eq(q.field("milestoneKey"), input.milestoneKey))
    .collect();
  return input.submilestoneKeys.map((key) => {
    const submilestone = submilestones.find((row) => row.key === key);
    if (!submilestone) {
      throw new Error(`Proposal submilestone not found: ${key}`);
    }
    return { id: submilestone._id, key: submilestone.key };
  });
}

async function findProposalMilestoneContractorAssignment(
  ctx: QueryCtx | MutationCtx,
  input: {
    contractorId: Id<"contractorProfiles">;
    milestoneKey: string;
    proposalId: Id<"buildProposals">;
    submilestoneKey?: string;
  },
) {
  const assignments = await ctx.db
    .query("proposalMilestoneContractorAssignments")
    .withIndex("by_contractor_proposal", (q) =>
      q
        .eq("contractorId", input.contractorId)
        .eq("proposalId", input.proposalId),
    )
    .collect();
  return (
    assignments.find(
      (assignment) =>
        assignment.milestoneKey === input.milestoneKey &&
        assignment.submilestoneKey === input.submilestoneKey,
    ) ?? null
  );
}

async function proposalContractorPlanningProjection(
  ctx: QueryCtx | MutationCtx,
  input: {
    auth: {
      brokerage: Doc<"brokerages">;
      proposal: Doc<"buildProposals">;
      roles: RoleSlug[];
      subject: string;
    };
    documents: Doc<"proposalDocuments">[];
    milestones: Doc<"proposalMilestones">[];
    proposalId: Id<"buildProposals">;
    submilestones: Doc<"proposalSubmilestones">[];
  },
) {
  const [proposalContractors, milestoneAssignments, contractorProfiles] =
    await Promise.all([
      collectByIndex(
        ctx,
        "proposalContractorAssignments",
        "by_proposal",
        input.proposalId,
      ),
      collectByIndex(
        ctx,
        "proposalMilestoneContractorAssignments",
        "by_proposal",
        input.proposalId,
      ),
      ctx.db
        .query("contractorProfiles")
        .withIndex("by_brokerage", (q) =>
          q.eq("brokerageId", input.auth.brokerage._id),
        )
        .collect(),
    ]);
  const proposalContractorRows =
    proposalContractors as Doc<"proposalContractorAssignments">[];
  const milestoneAssignmentRows =
    milestoneAssignments as Doc<"proposalMilestoneContractorAssignments">[];
  const hydrated = await hydrateContractorProfiles(ctx, contractorProfiles);
  const contractorById = new Map(
    hydrated.map((contractor: any) => [String(contractor._id), contractor]),
  );
  const attachedIds = new Set(
    proposalContractorRows.map((assignment) => String(assignment.contractorId)),
  );
  const milestoneByKey = new Map(
    input.milestones.map((milestone) => [milestone.key, milestone]),
  );
  const submilestoneByComposite = new Map(
    input.submilestones.map((submilestone) => [
      `${submilestone.milestoneKey}:${submilestone.key}`,
      submilestone,
    ]),
  );
  const permitSignals = extractPermitMaterialSignals({
    documents: input.documents,
    milestones: input.milestones,
    submilestones: input.submilestones,
  });
  const assignmentViews = milestoneAssignmentRows
    .map((assignment) => {
      const contractor = contractorById.get(String(assignment.contractorId));
      const milestone = milestoneByKey.get(assignment.milestoneKey);
      if (!(contractor && milestone)) {
        return null;
      }
      const submilestone = assignment.submilestoneKey
        ? submilestoneByComposite.get(
            `${assignment.milestoneKey}:${assignment.submilestoneKey}`,
          )
        : null;
      return {
        _id: assignment._id,
        contractorId: assignment.contractorId,
        contractorName: contractor.name,
        dayEnd: milestone.dayEnd,
        dayStart: milestone.dayStart,
        estimatedCostCents: assignment.estimatedCostCents,
        estimatedHours: assignment.estimatedHours,
        milestoneKey: assignment.milestoneKey,
        milestoneName: milestone.name,
        role: assignment.role,
        status: assignment.status,
        submilestoneKey: assignment.submilestoneKey,
        submilestoneName: submilestone?.name,
      };
    })
    .filter(Boolean);
  const allocationCalendar = assignmentViews.map((assignment: any) => ({
    assignmentId: assignment._id,
    contractorId: assignment.contractorId,
    contractorName: assignment.contractorName,
    dayEnd: assignment.dayEnd,
    dayStart: assignment.dayStart,
    label: `${assignment.milestoneName} / ${assignment.role}`,
    milestoneKey: assignment.milestoneKey,
  }));
  const equipmentSchedule = assignmentViews.flatMap((assignment: any) => {
    const contractor = contractorById.get(String(assignment.contractorId));
    return (contractor?.equipment ?? []).map((equipment: any) => ({
      assignmentId: assignment._id,
      contractorId: assignment.contractorId,
      contractorName: assignment.contractorName,
      dayEnd: assignment.dayEnd,
      dayStart: assignment.dayStart,
      equipmentKey: equipment.equipmentKey,
      name: equipment.name,
      quantity: equipment.quantity,
    }));
  });
  const conflicts = detectAssignmentWindowConflicts(allocationCalendar);
  return {
    allocationCalendar,
    availableContractors: hydrated
      .filter(
        (contractor: any) =>
          contractor.status === "active" &&
          !attachedIds.has(String(contractor._id)),
      )
      .map(contractorOptionView),
    conflicts,
    equipmentSchedule,
    materialSignals: permitSignals,
    milestoneAssignments: assignmentViews,
    proposalContractors: proposalContractorRows
      .map((assignment) => {
        const contractor = contractorById.get(String(assignment.contractorId));
        if (!contractor) {
          return null;
        }
        return {
          _id: assignment._id,
          agreedRateCents:
            assignment.agreedRateCents ?? contractor.defaultPayRateCents,
          agreedRateUnit:
            assignment.agreedRateUnit ??
            contractor.defaultPayRateUnit ??
            "hour",
          city: contractor.city,
          contractorId: assignment.contractorId,
          defaultPayRateCents: contractor.defaultPayRateCents,
          defaultPayRateUnit: contractor.defaultPayRateUnit ?? "hour",
          endDay: assignment.endDay,
          name: contractor.name,
          role: assignment.role,
          startDay: assignment.startDay,
          status: assignment.status,
          trades: contractor.trades,
        };
      })
      .filter(Boolean),
    recommendations: rankContractorsForPermitSignals({
      contractors: hydrated.filter(
        (contractor: any) => contractor.status === "active",
      ),
      conflicts,
      permitSignals,
    }),
    utilization: contractorUtilizationSummary({
      assignments: assignmentViews as any[],
      contractorProfiles: hydrated,
      proposalContractors: proposalContractorRows,
    }),
  };
}

function contractorOptionView(contractor: any) {
  return {
    _id: contractor._id,
    contractorId: String(contractor._id),
    city: contractor.city,
    defaultPayRateCents: contractor.defaultPayRateCents,
    defaultPayRateUnit: contractor.defaultPayRateUnit ?? "hour",
    name: contractor.name,
    trades: contractor.trades,
  };
}

async function listAvailableContractorOptions(
  ctx: QueryCtx | MutationCtx,
  brokerageId: Id<"brokerages">,
) {
  const contractors = await ctx.db
    .query("contractorProfiles")
    .withIndex("by_brokerage", (q) => q.eq("brokerageId", brokerageId))
    .collect();

  return contractors
    .filter((contractor) => contractor.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(contractorOptionView);
}

function extractPermitMaterialSignals(input: {
  documents: Array<{ fileName: string; documentType?: string }>;
  milestones: Array<{ key: string; name: string }>;
  submilestones: Array<{ key: string; name: string }>;
}) {
  const haystack = [
    ...input.documents
      .filter((document) => document.documentType === "permit")
      .map((document) => document.fileName),
    ...input.milestones.flatMap((milestone) => [milestone.key, milestone.name]),
    ...input.submilestones.flatMap((submilestone) => [
      submilestone.key,
      submilestone.name,
    ]),
  ]
    .join(" ")
    .toLowerCase();
  const keywords = [
    ["brick", "Brick siding"],
    ["masonry", "Masonry"],
    ["siding", "Siding"],
    ["stone", "Stone veneer"],
    ["stucco", "Stucco"],
    ["roof", "Roofing"],
    ["frame", "Framing"],
    ["foundation", "Foundation"],
    ["concrete", "Concrete"],
    ["plumbing", "Plumbing"],
    ["electrical", "Electrical"],
  ] as const;
  return keywords
    .filter(([key]) => haystack.includes(key))
    .map(([key, label]) => ({ key, label, source: "permit_and_roadmap" }));
}

function rankContractorsForPermitSignals(input: {
  contractors: any[];
  conflicts: Array<{ contractorId: unknown }>;
  permitSignals: Array<{ key: string; label: string }>;
}) {
  const conflictIds = new Set(
    input.conflicts.map((conflict) => String(conflict.contractorId)),
  );
  return input.contractors
    .map((contractor) => {
      const searchable = [
        contractor.name,
        ...(contractor.trades ?? []),
        ...(contractor.capabilities ?? []).flatMap((capability: any) => [
          capability.capabilityKey,
          capability.label,
          capability.trade,
          capability.milestoneArchetypeKey,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matches = input.permitSignals.filter((signal) =>
        searchable.includes(signal.key),
      );
      const score =
        matches.length * 35 +
        (contractor.defaultPayRateCents ? 10 : 0) -
        (conflictIds.has(String(contractor._id)) ? 30 : 0);
      return {
        contractorId: contractor._id,
        matchedSignals: matches,
        name: contractor.name,
        rateCents: contractor.defaultPayRateCents,
        score,
        trades: contractor.trades ?? [],
      };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 6);
}

function contractorUtilizationSummary(input: {
  assignments: Array<{
    contractorId: unknown;
    dayEnd?: number;
    dayStart?: number;
    estimatedHours?: number;
  }>;
  contractorProfiles: any[];
  proposalContractors: Array<{ contractorId: unknown }>;
}) {
  const profileById = new Map(
    input.contractorProfiles.map((profile) => [String(profile._id), profile]),
  );
  return input.proposalContractors.map((proposalContractor) => {
    const contractorId = String(proposalContractor.contractorId);
    const profile = profileById.get(contractorId);
    const assignments = input.assignments.filter(
      (assignment) => String(assignment.contractorId) === contractorId,
    );
    const assignedDays = assignments.reduce(
      (sum, assignment) =>
        sum +
        Math.max(
          1,
          Math.round((assignment.dayEnd ?? 0) - (assignment.dayStart ?? 0)),
        ),
      0,
    );
    const scheduledHours = assignments.reduce(
      (sum, assignment) => sum + (assignment.estimatedHours ?? 0),
      0,
    );
    const weeklyWindowHours = (profile?.availabilityWindows ?? []).reduce(
      (sum: number, window: any) =>
        sum + Math.max(0, window.endMinute - window.startMinute) / 60,
      0,
    );
    const capacityHours = Math.max(weeklyWindowHours, 1) * 4;
    return {
      assignedDays,
      contractorId: proposalContractor.contractorId,
      name: profile?.name ?? "Contractor",
      scheduledHours,
      utilizationPercent: Math.min(
        100,
        Math.round((scheduledHours / capacityHours) * 100),
      ),
      weeklyWindowHours,
    };
  });
}

function detectAssignmentWindowConflicts(
  assignments: Array<{
    assignmentId: unknown;
    contractorId: unknown;
    contractorName: string;
    dayEnd: number;
    dayStart: number;
    label: string;
  }>,
) {
  const conflicts = [];
  for (let i = 0; i < assignments.length; i += 1) {
    for (let j = i + 1; j < assignments.length; j += 1) {
      const left = assignments[i];
      const right = assignments[j];
      if (String(left.contractorId) !== String(right.contractorId)) {
        continue;
      }
      if (left.dayStart <= right.dayEnd && right.dayStart <= left.dayEnd) {
        conflicts.push({
          contractorId: left.contractorId,
          contractorName: left.contractorName,
          leftAssignmentId: left.assignmentId,
          leftLabel: left.label,
          overlapEndDay: Math.min(left.dayEnd, right.dayEnd),
          overlapStartDay: Math.max(left.dayStart, right.dayStart),
          rightAssignmentId: right.assignmentId,
          rightLabel: right.label,
          severity: "conflict" as const,
        });
      }
    }
  }
  return conflicts;
}

async function contractorIdentityLinkViews(
  ctx: QueryCtx | MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    contractorId: Id<"contractorProfiles">;
  },
) {
  const [primaryLinks, linkedLinks] = await Promise.all([
    ctx.db
      .query("contractorIdentityLinks")
      .withIndex("by_primary", (q) =>
        q.eq("primaryContractorId", input.contractorId),
      )
      .collect(),
    ctx.db
      .query("contractorIdentityLinks")
      .withIndex("by_linked", (q) =>
        q.eq("linkedContractorId", input.contractorId),
      )
      .collect(),
  ]);
  const rows = [...primaryLinks, ...linkedLinks].filter(
    (row, index, all) =>
      all.findIndex((candidate) => candidate._id === row._id) === index,
  );
  return await Promise.all(
    rows.map(async (row) => {
      const isPrimary = row.primaryContractorId === input.contractorId;
      const peerId = isPrimary
        ? row.linkedContractorId
        : row.primaryContractorId;
      const peer = (await ctx.db.get(
        peerId,
      )) as Doc<"contractorProfiles"> | null;
      return {
        _id: row._id,
        confidence: row.confidence,
        direction: isPrimary ? "primary" : "linked",
        peerBrokerageId: isPrimary
          ? row.linkedBrokerageId
          : row.primaryBrokerageId,
        peerContractorId: peerId,
        peerName: peer?.name ?? "Linked contractor",
        reason: row.reason,
        status: row.status,
        updatedAt: row.updatedAt,
      };
    }),
  );
}

function contractorDetailIntelligence(input: {
  assignments: Doc<"milestoneContractorAssignments">[];
  profile: any;
  proposalAssignments: Doc<"proposalMilestoneContractorAssignments">[];
  ratings: Doc<"contractorQualityRatings">[];
}) {
  const activeBuildAssignmentCount = input.assignments.filter(
    (assignment) => assignment.status !== "removed",
  ).length;
  const plannedAssignmentCount = input.proposalAssignments.filter(
    (assignment) => assignment.status === "planned",
  ).length;
  const scheduledHours =
    input.assignments.reduce(
      (sum, assignment) => sum + (assignment.estimatedHours ?? 0),
      0,
    ) +
    input.proposalAssignments.reduce(
      (sum, assignment) => sum + (assignment.estimatedHours ?? 0),
      0,
    );
  const weeklyWindowHours = (input.profile.availabilityWindows ?? []).reduce(
    (sum: number, window: any) =>
      sum + Math.max(0, window.endMinute - window.startMinute) / 60,
    0,
  );
  const capabilityPerformance = (input.profile.capabilities ?? []).map(
    (capability: any) => {
      const searchable = [
        capability.capabilityKey,
        capability.label,
        capability.trade,
        capability.milestoneArchetypeKey,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchingAssignments = input.assignments.filter((assignment) =>
        searchable.includes(assignment.milestoneKey.toLowerCase()),
      );
      const matchingRatings = input.ratings.filter((rating) =>
        matchingAssignments.some(
          (assignment) =>
            assignment.buildId === rating.buildId &&
            assignment.milestoneKey === rating.milestoneKey,
        ),
      );
      return {
        averageRating:
          matchingRatings.length === 0
            ? null
            : Math.round(
                (matchingRatings.reduce(
                  (sum, rating) => sum + rating.rating,
                  0,
                ) /
                  matchingRatings.length) *
                  10,
              ) / 10,
        capabilityKey: capability.capabilityKey,
        label: capability.label,
        ratingCount: matchingRatings.length,
        totalActualCostCents: matchingAssignments.reduce(
          (sum, assignment) => sum + (assignment.actualCostCents ?? 0),
          0,
        ),
        totalEstimatedCostCents: matchingAssignments.reduce(
          (sum, assignment) => sum + (assignment.estimatedCostCents ?? 0),
          0,
        ),
      };
    },
  );
  return {
    activeBuildAssignmentCount,
    capabilityPerformance,
    plannedAssignmentCount,
    scheduledHours: Math.round(scheduledHours * 100) / 100,
    utilizationPercent:
      weeklyWindowHours > 0
        ? Math.min(
            100,
            Math.round((scheduledHours / (weeklyWindowHours * 4)) * 100),
          )
        : null,
    weeklyWindowHours,
  };
}

async function ensureBuildContractorAssignment(
  ctx: MutationCtx,
  input: {
    agreedRateCents?: number;
    agreedRateUnit?: "hour" | "day" | "fixed";
    auth: {
      brokerage: Doc<"brokerages">;
      build: Doc<"activeBuilds">;
      proposal: Doc<"buildProposals">;
      roles: RoleSlug[];
      subject: string;
    };
    buildId: Id<"activeBuilds">;
    contractorId: Id<"contractorProfiles">;
    role: string;
    workosOrganizationId: string;
  },
) {
  const existing = await ctx.db
    .query("buildContractorAssignments")
    .withIndex("by_build_contractor", (q) =>
      q.eq("buildId", input.buildId).eq("contractorId", input.contractorId),
    )
    .unique();
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, {
      agreedRateCents:
        normalizeOptionalMoneyCents(input.agreedRateCents) ??
        existing.agreedRateCents,
      agreedRateUnit: input.agreedRateUnit ?? existing.agreedRateUnit,
      role: input.role.trim() || existing.role,
      status: "active",
      updatedAt: now,
    });
    return existing._id;
  }
  return await ctx.db.insert("buildContractorAssignments", {
    brokerageId: input.auth.brokerage._id,
    buildId: input.buildId,
    contractorId: input.contractorId,
    createdAt: now,
    agreedRateCents: normalizeOptionalMoneyCents(input.agreedRateCents),
    agreedRateUnit: input.agreedRateUnit,
    organizationId: input.workosOrganizationId,
    role: input.role.trim() || "Contractor",
    status: "active",
    updatedAt: now,
  });
}

async function resolveAssignmentSubmilestones(
  ctx: QueryCtx | MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    milestoneKey: string;
    submilestoneKeys: string[];
  },
) {
  if (input.submilestoneKeys.length === 0) {
    return [];
  }
  const submilestones = await ctx.db
    .query("buildSubmilestones")
    .withIndex("by_build", (q) => q.eq("buildId", input.buildId))
    .filter((q) => q.eq(q.field("milestoneKey"), input.milestoneKey))
    .collect();
  return input.submilestoneKeys.map((key) => {
    const submilestone = submilestones.find((row) => row.key === key);
    if (!submilestone) {
      throw new Error(`Submilestone not found: ${key}`);
    }
    return { id: submilestone._id, key: submilestone.key };
  });
}

async function findMilestoneContractorAssignment(
  ctx: QueryCtx | MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    contractorId: Id<"contractorProfiles">;
    milestoneKey: string;
    submilestoneKey?: string;
  },
) {
  const assignments = await ctx.db
    .query("milestoneContractorAssignments")
    .withIndex("by_contractor_build", (q) =>
      q.eq("contractorId", input.contractorId).eq("buildId", input.buildId),
    )
    .collect();
  return (
    assignments.find(
      (assignment) =>
        assignment.milestoneKey === input.milestoneKey &&
        assignment.submilestoneKey === input.submilestoneKey,
    ) ?? null
  );
}

async function insertContractorQualityRating(
  ctx: MutationCtx,
  input: {
    auth: {
      brokerage: Pick<Doc<"brokerages">, "_id">;
      build: Doc<"activeBuilds">;
      proposal: Pick<Doc<"buildProposals">, "_id">;
      roles: RoleSlug[];
      subject: string;
    };
    buildId: Id<"activeBuilds">;
    contractorId: Id<"contractorProfiles">;
    milestoneKey: string;
    note?: string;
    rating: number;
    source: "builder_evidence" | "site_visit" | "backoffice";
    sourceEvidenceKey?: string;
    sourceVisitId?: string;
    submilestoneKey?: string;
    workosOrganizationId: string;
  },
) {
  const contractor = await getScopedContractorOrThrow(
    ctx,
    input.contractorId,
    input.auth.brokerage._id as Id<"brokerages">,
  );
  if (contractor.status !== "active") {
    throw new Error("Production contractor is inactive.");
  }
  const milestone = await getActiveBuildMilestoneOrThrow(
    ctx,
    input.buildId,
    input.milestoneKey,
  );
  const submilestone = input.submilestoneKey
    ? (
        await resolveAssignmentSubmilestones(ctx, {
          buildId: input.buildId,
          milestoneKey: input.milestoneKey,
          submilestoneKeys: [input.submilestoneKey],
        })
      )[0]
    : undefined;
  const assignment = await findMilestoneContractorAssignment(ctx, {
    buildId: input.buildId,
    contractorId: input.contractorId,
    milestoneKey: input.milestoneKey,
    submilestoneKey: input.submilestoneKey,
  });
  if (!assignment) {
    throw new Error("Contractor must be assigned before quality is rated.");
  }
  return await ctx.db.insert("contractorQualityRatings", {
    brokerageId: input.auth.brokerage._id as Id<"brokerages">,
    buildId: input.buildId,
    buildMilestoneId: milestone._id,
    buildSubmilestoneId: submilestone?.id,
    contractorId: input.contractorId,
    createdAt: Date.now(),
    createdByWorkosUserId: input.auth.subject,
    milestoneKey: input.milestoneKey,
    note: normalizeOptionalString(input.note),
    organizationId: input.workosOrganizationId,
    rating: normalizeQualityRating(input.rating),
    source: input.source,
    sourceEvidenceKey: normalizeOptionalString(input.sourceEvidenceKey),
    sourceVisitId: normalizeOptionalString(input.sourceVisitId),
    submilestoneKey: normalizeOptionalString(input.submilestoneKey),
  });
}

async function recordQualityRatingForMilestoneAssignments(
  ctx: MutationCtx,
  input: {
    auth: {
      brokerage: Doc<"brokerages">;
      build: Doc<"activeBuilds">;
      proposal: Doc<"buildProposals">;
      roles: RoleSlug[];
      subject: string;
    };
    buildId: Id<"activeBuilds">;
    milestone: Doc<"buildMilestones">;
    note?: string;
    rating: number;
    source: "builder_evidence" | "site_visit" | "backoffice";
    workosOrganizationId: string;
  },
) {
  const assignments = await ctx.db
    .query("milestoneContractorAssignments")
    .withIndex("by_build_milestone", (q) =>
      q.eq("buildId", input.buildId).eq("milestoneKey", input.milestone.key),
    )
    .collect();
  const seen = new Set<string>();
  for (const assignment of assignments) {
    const key = `${assignment.contractorId}:${assignment.submilestoneKey ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    await insertContractorQualityRating(ctx, {
      auth: input.auth,
      buildId: input.buildId,
      contractorId: assignment.contractorId,
      milestoneKey: input.milestone.key,
      note: input.note,
      rating: input.rating,
      source: input.source,
      submilestoneKey: assignment.submilestoneKey,
      workosOrganizationId: input.workosOrganizationId,
    });
  }
}

function requireState(
  proposal: Doc<"buildProposals">,
  expected: Doc<"buildProposals">["status"],
) {
  if (proposal.status !== expected) {
    throw new Error(`Expected proposal state ${expected}.`);
  }
}

function requireReason(reason: string) {
  if (!reason.trim()) {
    throw new Error("A reason is required.");
  }
}

function calculateDrawAvailability(
  budgetCents: number,
  borrowerCoPayBps: number,
) {
  return Math.round((budgetCents * (10_000 - borrowerCoPayBps)) / 10_000);
}

function normalizeProposalApprovedAmountCents(input: {
  requestedApprovedAmountCents: number;
  totalDrawAmountCents: number;
}) {
  const requestedApprovedAmountCents = Math.max(
    0,
    Math.round(input.requestedApprovedAmountCents),
  );
  return Math.max(
    Math.max(0, Math.round(input.totalDrawAmountCents)),
    requestedApprovedAmountCents,
  );
}

async function ensureProposalApprovedAmountCoversDrawSchedule(
  ctx: MutationCtx,
  proposal: Doc<"buildProposals">,
  input: { updatedAt: number; updatedByWorkosUserId: string },
) {
  const totalDrawAmountCents = await sumProposalDrawScheduleAmountCents(
    ctx,
    proposal._id,
  );
  const nextApprovedAmountCents = Math.max(
    proposal.lenderDrawPolicyLimitCents,
    totalDrawAmountCents,
  );

  if (nextApprovedAmountCents === proposal.lenderDrawPolicyLimitCents) {
    return;
  }

  await ctx.db.patch(proposal._id, {
    lenderDrawPolicyLimitCents: nextApprovedAmountCents,
    updatedAt: input.updatedAt,
    updatedByWorkosUserId: input.updatedByWorkosUserId,
  });
}

async function sumProposalDrawScheduleAmountCents(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
) {
  const draws = await collectByIndex(
    ctx,
    "proposalDrawScheduleRows",
    "by_proposal",
    proposalId,
  );
  return draws.reduce(
    (total: number, draw: Doc<"proposalDrawScheduleRows">) =>
      total + Math.max(0, Math.round(draw.amountCents)),
    0,
  );
}

function firstActiveMilestoneForWorkspace(
  milestones: Doc<"proposalMilestones">[],
) {
  return milestones[0] ?? null;
}

function productionTimelineStatusForMilestone(
  index: number,
  proposal: Doc<"buildProposals">,
  milestone?: Doc<"proposalMilestones">,
) {
  if (milestone?.timelineStatus === "complete" || milestone?.completionClaim) {
    return "complete" as const;
  }
  if (proposal.status === "closed") {
    return "complete" as const;
  }
  return index === 0 ? ("ready" as const) : ("upcoming" as const);
}

function productionTimelineToneForMilestone(
  index: number,
  proposal: Doc<"buildProposals">,
  milestone?: Doc<"proposalMilestones">,
) {
  if (milestone?.tone) {
    return milestone.tone;
  }
  if (milestone?.timelineStatus === "complete" || milestone?.completionClaim) {
    return "complete" as const;
  }
  if (proposal.status === "closed") {
    return "complete" as const;
  }
  if (proposal.status === "submitted") {
    return index === 0 ? ("warning" as const) : ("upcoming" as const);
  }
  if (proposal.status === "approved") {
    return index === 0 ? ("active" as const) : ("upcoming" as const);
  }
  return index === 0 ? ("active" as const) : ("upcoming" as const);
}

function productionCompletionClaimView(claim: any) {
  if (!claim) {
    return;
  }
  return {
    ...(typeof claim.actualCostCents === "number"
      ? { actualCost: centsToDollars(claim.actualCostCents) }
      : typeof claim.actualCost === "number"
        ? { actualCost: claim.actualCost }
        : {}),
    completedDay: claim.completedDay,
    ...(claim.note ? { note: claim.note } : {}),
    submittedAt: claim.submittedAt,
  };
}

function productionCompletionReviewView(review: any) {
  if (!review) {
    return;
  }
  return {
    ...(review.note ? { note: review.note } : {}),
    reviewedAt: review.reviewedAt,
    ...(review.siteVisit ? { siteVisit: review.siteVisit } : {}),
    status: review.status,
  };
}

function centsToDollars(cents: number) {
  return Math.round(cents / 100);
}

function productionPolicyState(
  proposal: Doc<"buildProposals">,
  permitWaiver: Doc<"documentWaivers"> | null,
) {
  if (proposal.reviewOutcome === "rejected") {
    return "Rejected by lender review";
  }
  if (proposal.reviewOutcome === "requested_changes") {
    return "Changes requested by lender review";
  }
  if (permitWaiver) {
    return "Permit waiver recorded";
  }
  if (proposal.status === "submitted") {
    return "Locked for lender review";
  }
  if (proposal.status === "approved" || proposal.status === "closed") {
    return "Approved reimbursement policy";
  }
  return "Draft proposal policy";
}

function productionTimelinePermissions(auth: {
  proposal: Doc<"buildProposals">;
  roles: RoleSlug[];
  subject: string;
}) {
  const backoffice = isBackoffice(auth.roles);
  const draft = auth.proposal.status === "draft";
  const liveBuild = auth.proposal.status === "approved";
  const submitted = auth.proposal.status === "submitted";
  return {
    approveProposal: submitted && backoffice,
    closeProposal: auth.proposal.status === "approved" && backoffice,
    editDraftStructure: draft,
    editSubmittedDraws: submitted && backoffice,
    requestLiveModification: liveBuild && !backoffice,
    reviewDraws: liveBuild && backoffice,
    reviewMilestones: liveBuild && backoffice,
    submitDrawRequests: liveBuild && !backoffice,
    submitMilestoneCompletion: liveBuild && !backoffice,
    submitProposal: draft,
  };
}

function iconForProductionMilestone(key: string, name?: string) {
  const normalized = `${key} ${name ?? ""}`.toLowerCase();
  if (normalized.includes("foundation") || normalized.includes("site")) {
    return "foundation";
  }
  if (normalized.includes("kitchen") || normalized.includes("cabinet")) {
    return "kitchen";
  }
  if (
    normalized.includes("plumb") ||
    normalized.includes("mechanical") ||
    normalized.includes("mep")
  ) {
    return "plumbing";
  }
  if (normalized.includes("roof") || normalized.includes("dry-in")) {
    return "roofing";
  }
  if (normalized.includes("shell") || normalized.includes("fram")) {
    return "framing";
  }
  if (normalized.includes("rough")) {
    return "roughIn";
  }
  if (normalized.includes("exterior")) {
    return "exterior";
  }
  if (normalized.includes("dry")) {
    return "drywall";
  }
  if (normalized.includes("finish") || normalized.includes("interior")) {
    return "finishes";
  }
  if (normalized.includes("close")) {
    return "closeout";
  }
  return "change";
}

async function requireProductionTimelineEditable(
  ctx: QueryCtx | MutationCtx,
  auth: {
    proposal: Doc<"buildProposals">;
    roles: RoleSlug[];
    subject: string;
  },
) {
  if (auth.proposal.status === "draft") {
    await assertProposalCollaborationEditAllowed(ctx, auth);
    return;
  }
  if (auth.proposal.status === "approved") {
    await assertProposalCollaborationEditAllowed(ctx, auth);
    return;
  }
  if (auth.proposal.status === "submitted" && isBackoffice(auth.roles)) {
    requireBackofficeProposalWrite(auth, auth.proposal);
    await assertProposalCollaborationEditAllowed(ctx, auth);
    return;
  }
  throw new Error("Timeline is locked in this proposal state.");
}

async function requireProductionProposalPreLiveCapitalWrite(
  ctx: QueryCtx | MutationCtx,
  auth: {
    proposal: Doc<"buildProposals">;
    roles: RoleSlug[];
    subject: string;
  },
) {
  if (auth.proposal.activeBuildId) {
    throw new Error(
      "Proposal capital terms are locked after the build goes live.",
    );
  }
  if (auth.proposal.status === "draft") {
    if (isBackoffice(auth.roles)) {
      requireBackofficeProposalWrite(auth, auth.proposal);
    } else {
      await assertBuilderOwnership(
        ctx,
        assignedBuilderProfileIdOrThrow(auth.proposal),
        auth.subject,
      );
    }
    await assertProposalCollaborationEditAllowed(ctx, auth);
    return;
  }
  if (
    (auth.proposal.status === "submitted" ||
      auth.proposal.status === "approved") &&
    isBackoffice(auth.roles)
  ) {
    requireBackofficeProposalWrite(auth, auth.proposal);
    await assertProposalCollaborationEditAllowed(ctx, auth);
    return;
  }
  throw new Error("Proposal capital terms are locked in this proposal state.");
}

async function requireProductionTimelineDraftStructureWrite(
  ctx: QueryCtx | MutationCtx,
  auth: {
    proposal: Doc<"buildProposals">;
    roles: RoleSlug[];
    subject: string;
  },
) {
  if (auth.proposal.status !== "draft") {
    throw new Error("Proposal structure is locked after submission.");
  }
  if (isBackoffice(auth.roles)) {
    requireBackofficeProposalWrite(auth, auth.proposal);
  }
  await assertProposalCollaborationEditAllowed(ctx, auth);
}

async function authorizeProposalCostItemWrite(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  proposalId: Id<"buildProposals">,
  workosOrganizationId: string,
  reason?: string,
) {
  const auth = await authorizeProposal(ctx, proposalId, workosOrganizationId);
  if (auth.proposal.status === "closed") {
    throw new Error("Closed proposals cannot be edited.");
  }
  if (auth.proposal.status === "draft") {
    if (isBackoffice(auth.roles)) {
      requireBackofficeProposalWrite(auth, auth.proposal);
    } else {
      await assertBuilderOwnership(
        ctx,
        assignedBuilderProfileIdOrThrow(auth.proposal),
        auth.subject,
      );
    }
    await assertProposalCollaborationEditAllowed(ctx, auth);
    return auth;
  }
  requireAnyRole(auth.roles, BACKOFFICE_ROLES);
  requireBackofficeProposalWrite(auth, auth.proposal);
  requireReason(reason ?? "");
  await assertProposalCollaborationEditAllowed(ctx, auth);
  return auth;
}

function normalizeRequiredText(value: string, label: string) {
  const text = value.trim();
  if (!text) {
    throw new Error(`${label} is required.`);
  }
  return text;
}

function normalizeOptionalText(value: string | undefined) {
  const text = value?.trim();
  return text ? text : undefined;
}

function normalizeCostItemCost(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error("Cost item cost must be finite.");
  }
  return Math.max(0, Math.round(value));
}

function normalizeCostItemQuantity(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Cost item quantity must be greater than zero.");
  }
  return Math.round(value * 1000) / 1000;
}

function costItemTotalCents(
  item: Pick<Doc<"proposalCostItems">, "costCents" | "quantity">,
) {
  return Math.round(item.costCents * item.quantity);
}

function proposalCostItemAuditWarnings(proposal: Doc<"buildProposals">) {
  return proposal.status === "draft"
    ? []
    : [`proposal-state:${proposal.status}`];
}

async function validateProposalCostItemSubmilestones(
  ctx: QueryCtx | MutationCtx,
  milestone: Pick<Doc<"proposalMilestones">, "_id" | "key">,
  relevantSubmilestoneKeys: string[],
) {
  const available = await ctx.db
    .query("proposalSubmilestones")
    .withIndex("by_milestone", (q) =>
      q.eq("proposalMilestoneId", milestone._id),
    )
    .collect();
  const availableKeys = new Set(available.map((row) => row.key));
  const normalized = [
    ...new Set(
      relevantSubmilestoneKeys
        .map((key) => key.trim())
        .filter((key) => key.length > 0),
    ),
  ];
  const invalid = normalized.filter((key) => !availableKeys.has(key));
  if (invalid.length > 0) {
    throw new Error(
      `Relevant sub-milestones must belong to ${milestone.key}: ${invalid.join(", ")}.`,
    );
  }
  return normalized;
}

async function nextProposalCostItemKey(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  title: string,
  now: number,
) {
  const base = slugifyKey(title) || "cost-item";
  let candidate = `${base}-${now.toString(36)}`;
  let attempt = 1;
  while (
    await ctx.db
      .query("proposalCostItems")
      .withIndex("by_proposal_key", (q) =>
        q.eq("proposalId", proposalId).eq("itemKey", candidate),
      )
      .unique()
  ) {
    attempt += 1;
    candidate = `${base}-${now.toString(36)}-${attempt}`;
  }
  return candidate;
}

function slugifyKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function getProposalCostItemOrThrow(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  itemId: Id<"proposalCostItems">,
) {
  const item = await ctx.db.get(itemId);
  if (!item || item.proposalId !== proposalId) {
    throw new Error("Proposal cost item not found.");
  }
  return item;
}

async function getProposalMilestoneByIdOrThrow(
  ctx: QueryCtx | MutationCtx,
  milestoneId: Id<"proposalMilestones">,
) {
  const milestone = await ctx.db.get(milestoneId);
  if (!milestone) {
    throw new Error("Production milestone not found.");
  }
  return milestone;
}

async function applyProposalCostItemBudgetDelta(
  ctx: MutationCtx,
  auth: {
    proposal: Doc<"buildProposals">;
    subject: string;
  },
  input: {
    deltaCents: number;
    milestone: Doc<"proposalMilestones">;
    proposalId: Id<"buildProposals">;
  },
) {
  if (input.deltaCents === 0) {
    return;
  }
  const now = Date.now();
  const nextMilestoneBudgetCents = Math.max(
    0,
    input.milestone.budgetCents + input.deltaCents,
  );
  const nextDrawAvailabilityCents = calculateDrawAvailability(
    nextMilestoneBudgetCents,
    auth.proposal.borrowerCoPayBps,
  );
  await ctx.db.patch(input.milestone._id, {
    budgetCents: nextMilestoneBudgetCents,
    drawAvailabilityCents: nextDrawAvailabilityCents,
    updatedAt: now,
  });
  await recalculateProposalBudget(ctx, auth, input.proposalId);
}

async function requireProductionTimelineLiveWrite(
  ctx: QueryCtx | MutationCtx,
  auth: {
    proposal: Doc<"buildProposals">;
    roles: RoleSlug[];
    subject: string;
  },
) {
  if (auth.proposal.status !== "approved") {
    throw new Error(
      "Live-build timeline actions require an approved proposal.",
    );
  }
  if (isBackoffice(auth.roles)) {
    requireBackofficeProposalWrite(auth, auth.proposal);
  }
  await assertProposalCollaborationEditAllowed(ctx, auth);
}

async function insertProductionMilestoneFromInput(
  ctx: MutationCtx,
  auth: {
    brokerage: Doc<"brokerages">;
    proposal: Doc<"buildProposals">;
  },
  milestone: {
    budgetCents: number;
    dayEnd: number;
    dayStart: number;
    dependencyKeys?: string[];
    drawAvailabilityCents?: number;
    durationDays: number;
    evidenceState: string;
    icon?: string;
    lane?: number;
    markerLabel?: string;
    milestoneKey: string;
    name: string;
    order: number;
    policyState: string;
    status?: string;
    submilestones?: {
      budgetCents?: number;
      durationDays?: number;
      key: string;
      name: string;
      order: number;
      startDay?: number;
    }[];
    tone?: string;
    x: number;
  },
) {
  const existing = await ctx.db
    .query("proposalMilestones")
    .withIndex("by_proposal_key", (q) =>
      q.eq("proposalId", auth.proposal._id).eq("key", milestone.milestoneKey),
    )
    .unique();
  if (existing) {
    throw new Error("Production milestone already exists.");
  }
  const schedule = normalizeProductionMilestoneSchedule(milestone);
  const now = Date.now();
  const budgetCents = Math.max(0, Math.round(milestone.budgetCents));
  const milestoneId = await ctx.db.insert("proposalMilestones", {
    brokerageId: auth.brokerage._id,
    budgetCents,
    createdAt: now,
    dayEnd: schedule.dayEnd,
    dayStart: schedule.dayStart,
    dependencyKeys: milestone.dependencyKeys ?? [],
    drawAvailabilityCents:
      milestone.drawAvailabilityCents === undefined
        ? calculateDrawAvailability(budgetCents, auth.proposal.borrowerCoPayBps)
        : Math.max(0, Math.round(milestone.drawAvailabilityCents)),
    durationDays: schedule.durationDays,
    evidenceState: milestone.evidenceState,
    icon: milestone.icon,
    key: milestone.milestoneKey,
    lane: milestone.lane,
    markerLabel: milestone.markerLabel,
    name: milestone.name.trim() || "Requested milestone",
    order: Math.max(1, Math.round(milestone.order)),
    organizationId: auth.proposal.organizationId,
    policyState: milestone.policyState,
    proposalId: auth.proposal._id,
    timelineStatus: milestone.status,
    tone: milestone.tone,
    updatedAt: now,
  });
  await replaceProductionSubmilestones(ctx, auth, {
    milestone: {
      _id: milestoneId,
      key: milestone.milestoneKey,
    },
    proposalId: auth.proposal._id,
    rows: schedule.submilestones,
  });
  return milestoneId;
}

async function replaceProductionSubmilestones(
  ctx: MutationCtx,
  auth: {
    brokerage: Doc<"brokerages">;
    proposal: Doc<"buildProposals">;
  },
  input: {
    milestone: Pick<Doc<"proposalMilestones">, "_id" | "key">;
    proposalId: Id<"buildProposals">;
    rows: {
      budgetCents?: number;
      durationDays?: number;
      key: string;
      name: string;
      order: number;
      startDay?: number;
    }[];
  },
) {
  const existing = await ctx.db
    .query("proposalSubmilestones")
    .withIndex("by_milestone", (q) =>
      q.eq("proposalMilestoneId", input.milestone._id),
    )
    .collect();
  for (const row of existing) {
    await ctx.db.delete(row._id);
  }
  const now = Date.now();
  for (const row of [...input.rows].sort((a, b) => a.order - b.order)) {
    await ctx.db.insert("proposalSubmilestones", {
      brokerageId: auth.brokerage._id,
      budgetCents: row.budgetCents,
      createdAt: now,
      durationDays: row.durationDays,
      key: row.key,
      milestoneKey: input.milestone.key,
      name: row.name.trim() || "Submilestone",
      order: Math.max(1, Math.round(row.order)),
      organizationId: auth.proposal.organizationId,
      proposalId: input.proposalId,
      proposalMilestoneId: input.milestone._id,
      startDay: row.startDay,
      updatedAt: now,
    });
  }
}

async function upsertProposalMilestoneDrawAvailability(
  ctx: MutationCtx,
  auth: {
    brokerage: Doc<"brokerages">;
    proposal: Doc<"buildProposals">;
  },
  input: {
    amountCents: number;
    drawKey?: string;
    milestone: Pick<
      Doc<"proposalMilestones">,
      "_id" | "key" | "name" | "organizationId"
    >;
    proposalId: Id<"buildProposals">;
    timingDay: number;
  },
) {
  const amountCents = Math.max(0, Math.round(input.amountCents));
  const now = Date.now();
  const drawRows = (await collectByIndex(
    ctx,
    "proposalDrawScheduleRows",
    "by_proposal",
    input.proposalId,
  )) as Doc<"proposalDrawScheduleRows">[];
  const requestedDrawKey = normalizeProposalTimelineDrawKey(
    input.drawKey,
    input.milestone.key,
  );
  const existing =
    drawRows.find((row) => row.milestoneKey === input.milestone.key) ??
    drawRows.find((row) => row.drawKey === requestedDrawKey);

  if (existing) {
    await ctx.db.patch(existing._id, {
      amountCents,
      milestoneKey: input.milestone.key,
      proposalMilestoneId: input.milestone._id,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("proposalDrawScheduleRows", {
    amountCents,
    brokerageId: auth.brokerage._id,
    createdAt: now,
    customDate: false,
    drawKey: requestedDrawKey,
    label: `${input.milestone.name} reimbursement draw`,
    milestoneKey: input.milestone.key,
    order: drawRows.length + 1,
    organizationId: input.milestone.organizationId,
    proposalId: input.proposalId,
    proposalMilestoneId: input.milestone._id,
    source: "milestone",
    timingDay: Math.max(0, Math.round(input.timingDay)),
    updatedAt: now,
  });
}

function normalizeProposalTimelineDrawKey(
  drawKey: string | undefined,
  milestoneKey: string,
) {
  const trimmedDrawKey = drawKey?.trim();
  if (trimmedDrawKey && !/^draw\s+\d+$/i.test(trimmedDrawKey)) {
    return trimmedDrawKey;
  }
  return `${milestoneKey}-draw`;
}

async function deleteProductionMilestoneCascade(
  ctx: MutationCtx,
  proposalId: Id<"buildProposals">,
  milestone: Doc<"proposalMilestones">,
) {
  const submilestones = await ctx.db
    .query("proposalSubmilestones")
    .withIndex("by_milestone", (q) =>
      q.eq("proposalMilestoneId", milestone._id),
    )
    .collect();
  for (const row of submilestones) {
    await ctx.db.delete(row._id);
  }
  const costItems = await ctx.db
    .query("proposalCostItems")
    .withIndex("by_milestone", (q) =>
      q.eq("proposalMilestoneId", milestone._id),
    )
    .collect();
  for (const item of costItems) {
    await ctx.db.delete(item._id);
  }
  const evidenceAssets = await ctx.db
    .query("proposalEvidenceAssets")
    .withIndex("by_proposal_milestone", (q) =>
      q.eq("proposalId", proposalId).eq("milestoneKey", milestone.key),
    )
    .collect();
  for (const asset of evidenceAssets) {
    if (asset.storageId) {
      await ctx.storage.delete(asset.storageId);
    }
    await ctx.db.delete(asset._id);
  }
  const draws = await collectByIndex(
    ctx,
    "proposalDrawScheduleRows",
    "by_proposal",
    proposalId,
  );
  for (const draw of draws.filter(
    (row: any) => row.milestoneKey === milestone.key,
  )) {
    await ctx.db.delete(draw._id);
  }
  await ctx.db.delete(milestone._id);
}

async function recalculateProposalBudget(
  ctx: MutationCtx,
  auth: { proposal?: Doc<"buildProposals">; subject: string },
  proposalId: Id<"buildProposals">,
) {
  const proposal = auth.proposal ?? (await ctx.db.get(proposalId));
  if (!proposal) {
    throw new Error("Production proposal not found.");
  }
  const milestones = await collectByIndex(
    ctx,
    "proposalMilestones",
    "by_proposal",
    proposalId,
  );
  const capitalEvents = await collectByIndex(
    ctx,
    "proposalCapitalEvents",
    "by_proposal",
    proposalId,
  );
  const milestoneBudgetCents = milestones.reduce(
    (total: number, milestone: any) => total + milestone.budgetCents,
    0,
  );
  const capitalSpikeBudgetCents = capitalEvents.reduce(
    (total: number, event: any) =>
      event.eventKind === "cost" ? total + event.amountCents : total,
    0,
  );
  const totalBudgetCents = milestoneBudgetCents + capitalSpikeBudgetCents;
  const totalDrawAmountCents = await sumProposalDrawScheduleAmountCents(
    ctx,
    proposalId,
  );
  const lenderDrawPolicyLimitCents = Math.max(
    Math.max(0, Math.round(proposal.lenderDrawPolicyLimitCents)),
    totalDrawAmountCents,
  );
  await ctx.db.patch(proposalId, {
    lenderDrawPolicyLimitCents,
    totalBudgetCents,
    updatedAt: Date.now(),
    updatedByWorkosUserId: auth.subject,
  });
  await upsertKanbanCard(ctx, proposalId, Date.now());
  return totalBudgetCents;
}

async function refreshProposalMilestoneDrawAvailability(
  ctx: MutationCtx,
  proposalId: Id<"buildProposals">,
  input: { borrowerCoPayBps: number; updatedAt: number },
) {
  const milestones = (await collectByIndex(
    ctx,
    "proposalMilestones",
    "by_proposal",
    proposalId,
  )) as Doc<"proposalMilestones">[];

  for (const milestone of milestones) {
    const drawAvailabilityCents = calculateDrawAvailability(
      milestone.budgetCents,
      input.borrowerCoPayBps,
    );
    await ctx.db.patch(milestone._id, {
      drawAvailabilityCents,
      updatedAt: input.updatedAt,
    });
  }
}

async function applyProductionTimelineModificationRequest(
  ctx: MutationCtx,
  auth: {
    brokerage: Doc<"brokerages">;
    proposal: Doc<"buildProposals">;
    roles: RoleSlug[];
    subject: string;
  },
  request: Doc<"proposalTimelineModificationRequests">,
) {
  if (request.requestType === "createMilestone") {
    const milestone = request.requestedPayload?.milestone;
    if (!milestone) {
      throw new Error("milestone payload is required.");
    }
    await insertProductionMilestoneFromInput(ctx, auth, milestone);
    await recalculateProposalBudget(ctx, auth, request.proposalId);
    return;
  }
  if (!request.milestoneKey) {
    throw new Error("milestoneKey is required.");
  }
  const milestone = await getProductionMilestoneOrThrow(
    ctx,
    request.proposalId,
    request.milestoneKey,
  );
  if (request.requestType === "deleteMilestone") {
    await deleteProductionMilestoneCascade(ctx, request.proposalId, milestone);
    await recalculateProposalBudget(ctx, auth, request.proposalId);
    return;
  }
  if (request.requestType === "updateMilestoneBudget") {
    const budgetCents = request.requestedPayload?.budgetCents;
    if (typeof budgetCents !== "number" || budgetCents < 0) {
      throw new Error("budgetCents is required.");
    }
    await ctx.db.patch(milestone._id, {
      budgetCents: Math.round(budgetCents),
      drawAvailabilityCents: calculateDrawAvailability(
        Math.round(budgetCents),
        auth.proposal.borrowerCoPayBps,
      ),
      updatedAt: Date.now(),
    });
    await recalculateProposalBudget(ctx, auth, request.proposalId);
  }
}

async function insertProductionCapitalEvent(
  ctx: MutationCtx,
  auth: {
    brokerage: Doc<"brokerages">;
    proposal: Doc<"buildProposals">;
  },
  input: {
    amountCents: number;
    capitalEventKey: string;
    eventKind: "cashInfusion" | "cost";
    label: string;
    order?: number;
    proposalId: Id<"buildProposals">;
    x: number;
  },
) {
  const existing = await ctx.db
    .query("proposalCapitalEvents")
    .withIndex("by_proposal_key", (q) =>
      q
        .eq("proposalId", input.proposalId)
        .eq("capitalEventKey", input.capitalEventKey),
    )
    .unique();
  if (existing) {
    throw new Error("Production capital event already exists.");
  }
  const rows = await collectByIndex(
    ctx,
    "proposalCapitalEvents",
    "by_proposal",
    input.proposalId,
  );
  const now = Date.now();
  await ctx.db.insert("proposalCapitalEvents", {
    amountCents: Math.max(0, Math.round(input.amountCents)),
    brokerageId: auth.brokerage._id,
    capitalEventKey: input.capitalEventKey,
    createdAt: now,
    eventKind: input.eventKind,
    label:
      input.label.trim() ||
      (input.eventKind === "cashInfusion" ? "Cash infusion" : "Capital spike"),
    order: input.order ?? rows.length + 1,
    organizationId: auth.proposal.organizationId,
    proposalId: input.proposalId,
    updatedAt: now,
    x: Math.max(0, Math.round(input.x)),
  });
}

async function getProductionMilestoneOrThrow(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  milestoneKey: string,
) {
  const milestone = await ctx.db
    .query("proposalMilestones")
    .withIndex("by_proposal_key", (q) =>
      q.eq("proposalId", proposalId).eq("key", milestoneKey),
    )
    .unique();
  if (!milestone) {
    throw new Error("Production milestone not found.");
  }
  return milestone;
}

async function getProductionDrawOrThrow(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  drawKey: string,
) {
  const draw = await ctx.db
    .query("proposalDrawScheduleRows")
    .withIndex("by_proposal_key", (q) =>
      q.eq("proposalId", proposalId).eq("drawKey", drawKey),
    )
    .unique();
  if (!draw) {
    throw new Error("Production draw not found.");
  }
  return draw;
}

async function getProductionCapitalEventOrThrow(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  capitalEventKey: string,
) {
  const event = await ctx.db
    .query("proposalCapitalEvents")
    .withIndex("by_proposal_key", (q) =>
      q.eq("proposalId", proposalId).eq("capitalEventKey", capitalEventKey),
    )
    .unique();
  if (!event) {
    throw new Error("Production capital event not found.");
  }
  return event;
}

async function getProductionEvidenceAssetOrThrow(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  evidenceKey: string,
) {
  const asset = await ctx.db
    .query("proposalEvidenceAssets")
    .withIndex("by_proposal_key", (q) =>
      q.eq("proposalId", proposalId).eq("evidenceKey", evidenceKey),
    )
    .unique();
  if (!asset) {
    throw new Error("Production evidence asset not found.");
  }
  return asset;
}

async function deleteProposalPlanChildren(
  ctx: MutationCtx,
  proposalId: Id<"buildProposals">,
) {
  for (const table of [
    "proposalTimelineModificationRequests",
    "proposalEvidenceAssets",
    "proposalCapitalEvents",
    "proposalCostItems",
    "proposalMilestoneContractorAssignments",
    "proposalDrawScheduleRows",
    "proposalSubmilestones",
    "proposalMilestones",
  ] as const) {
    const rows = await collectByIndex(ctx, table, "by_proposal", proposalId);
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  }
}

async function upsertKanbanCard(
  ctx: MutationCtx,
  proposalId: Id<"buildProposals">,
  now: number,
) {
  const proposal = await ctx.db.get(proposalId);
  if (!proposal) {
    throw new Error("Missing proposal.");
  }
  const builder = proposal.builderProfileId
    ? await ctx.db.get(proposal.builderProfileId)
    : null;
  const existing = await ctx.db
    .query("proposalKanbanCards")
    .withIndex("by_proposal", (q) => q.eq("proposalId", proposalId))
    .unique();
  const card = {
    brokerageId: proposal.brokerageId,
    builderName: builder?.displayName ?? "Unassigned builder",
    column: proposal.status,
    href: `/backoffice/proposals/${proposalId}`,
    organizationId: proposal.organizationId,
    proposalId,
    sortAt: now,
    subtitle: proposal.location,
    title: proposal.buildName,
    totalBudgetCents: proposal.totalBudgetCents,
    updatedAt: now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, card);
  } else {
    await ctx.db.insert("proposalKanbanCards", card);
  }
}

async function writeProposalEvent(
  ctx: MutationCtx,
  input: {
    auth: { brokerage: Doc<"brokerages">; roles: RoleSlug[]; subject: string };
    command: string;
    eventType: string;
    newState?: string;
    priorState?: string;
    proposalId: Id<"buildProposals">;
    reason?: string;
    warnings?: string[];
  },
) {
  const now = Date.now();
  const proposal = await ctx.db.get(input.proposalId);
  if (!proposal) {
    throw new Error("Missing proposal.");
  }
  const event = {
    actorRoles: input.auth.roles,
    actorWorkosUserId: input.auth.subject,
    brokerageId: input.auth.brokerage._id,
    command: input.command,
    createdAt: now,
    eventType: input.eventType,
    newState: input.newState,
    organizationId: proposal.organizationId,
    priorState: input.priorState,
    proposalId: input.proposalId,
    reason: input.reason,
    warnings: input.warnings ?? [],
  };
  await ctx.db.insert("proposalEvents", event);
  await ctx.db.insert("auditEvents", {
    actorRoles: event.actorRoles,
    actorWorkosUserId: event.actorWorkosUserId,
    brokerageId: event.brokerageId,
    command: event.command,
    createdAt: event.createdAt,
    eventType: event.eventType,
    entityId: input.proposalId,
    entityType: "buildProposal",
    newState: event.newState,
    organizationId: event.organizationId,
    priorState: event.priorState,
    reason: event.reason,
    warnings: event.warnings,
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: input.auth.brokerage._id,
    createdAt: now,
    eventType: input.eventType,
    organizationId: proposal.organizationId,
    payloadPreview: JSON.stringify({
      newState: input.newState,
      proposalId: input.proposalId,
    }),
    relatedEntityId: input.proposalId,
    relatedEntityType: "buildProposal",
    status: "pending",
  });
}

async function writeActiveBuildEvent(
  ctx: MutationCtx,
  input: {
    auth: {
      brokerage: Doc<"brokerages">;
      proposal: Doc<"buildProposals">;
      roles: RoleSlug[];
      subject: string;
    };
    build: Doc<"activeBuilds">;
    command: string;
    eventType: string;
    newState?: string;
    priorState?: string;
    reason?: string;
    warnings?: string[];
  },
) {
  const now = Date.now();
  await ctx.db.insert("auditEvents", {
    actorRoles: input.auth.roles,
    actorWorkosUserId: input.auth.subject,
    brokerageId: input.auth.brokerage._id,
    command: input.command,
    createdAt: now,
    entityId: String(input.build._id),
    entityType: "activeBuild",
    eventType: input.eventType,
    newState: input.newState,
    organizationId: input.build.organizationId,
    priorState: input.priorState,
    reason: input.reason,
    warnings: input.warnings ?? [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: input.auth.brokerage._id,
    createdAt: now,
    eventType: input.eventType,
    organizationId: input.build.organizationId,
    payloadPreview: JSON.stringify({
      buildId: input.build._id,
      newState: input.newState,
      priorState: input.priorState,
    }),
    relatedEntityId: input.build._id,
    relatedEntityType: "activeBuild",
    status: "pending",
  });
}

async function writeProductionSettingsEvent(
  ctx: MutationCtx,
  input: {
    auth: { brokerage: Doc<"brokerages">; roles: RoleSlug[]; subject: string };
    command: string;
    entityId: string;
    eventType: string;
    newState?: string;
    organizationId: string;
    priorState?: string;
    reason?: string;
    warnings?: string[];
  },
) {
  const now = Date.now();
  await ctx.db.insert("auditEvents", {
    actorRoles: input.auth.roles,
    actorWorkosUserId: input.auth.subject,
    brokerageId: input.auth.brokerage._id,
    command: input.command,
    createdAt: now,
    entityId: input.entityId,
    entityType: "productionProposalSettings",
    eventType: input.eventType,
    newState: input.newState,
    organizationId: input.organizationId,
    priorState: input.priorState,
    reason: input.reason,
    warnings: input.warnings ?? [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: input.auth.brokerage._id,
    createdAt: now,
    eventType: input.eventType,
    organizationId: input.organizationId,
    payloadPreview: JSON.stringify({
      entityId: input.entityId,
      newState: input.newState,
      priorState: input.priorState,
    }),
    relatedEntityId: input.entityId,
    relatedEntityType: "productionProposalSettings",
    status: "pending",
  });
}

async function copyProposalOperationalRowsToActiveBuild(
  ctx: MutationCtx,
  input: {
    auth: { brokerage: Doc<"brokerages">; roles: RoleSlug[]; subject: string };
    buildId: Id<"activeBuilds">;
    now: number;
    organizationId: string;
    proposalId: Id<"buildProposals">;
  },
) {
  const [documents, evidenceAssets, costItems, buildMilestones] =
    (await Promise.all([
      collectByIndex(ctx, "proposalDocuments", "by_proposal", input.proposalId),
      collectByIndex(
        ctx,
        "proposalEvidenceAssets",
        "by_proposal",
        input.proposalId,
      ),
      collectByIndex(ctx, "proposalCostItems", "by_proposal", input.proposalId),
      collectByIndex(ctx, "buildMilestones", "by_build", input.buildId),
    ])) as [
      Doc<"proposalDocuments">[],
      Doc<"proposalEvidenceAssets">[],
      Doc<"proposalCostItems">[],
      Doc<"buildMilestones">[],
    ];
  const buildMilestoneByProposalId = new Map(
    buildMilestones.map((milestone) => [
      String(milestone.proposalMilestoneId),
      milestone,
    ]),
  );
  for (const document of documents) {
    await ctx.db.insert("buildDocuments", {
      brokerageId: input.auth.brokerage._id,
      buildId: input.buildId,
      createdAt: input.now,
      documentType: document.documentType,
      fileName: document.fileName,
      mimeType: document.mimeType,
      organizationId: input.organizationId,
      proposalId: input.proposalId,
      sizeBytes: document.sizeBytes,
      status: document.status,
      storageId: document.storageId,
      updatedAt: input.now,
      uploadedByWorkosUserId: document.uploadedByWorkosUserId,
    });
  }
  for (const asset of evidenceAssets) {
    await ctx.db.insert("buildEvidenceAssets", {
      brokerageId: input.auth.brokerage._id,
      buildId: input.buildId,
      createdAt: input.now,
      evidenceKey: asset.evidenceKey,
      fileName: asset.fileName,
      label: asset.label,
      locationVerified: asset.locationVerified,
      milestoneKey: asset.milestoneKey,
      mimeType: asset.mimeType,
      organizationId: input.organizationId,
      proposalId: input.proposalId,
      sizeBytes: asset.sizeBytes,
      source: asset.source,
      storageId: asset.storageId,
      tag: asset.tag,
      updatedAt: input.now,
    });
  }
  for (const item of costItems) {
    const buildMilestone = buildMilestoneByProposalId.get(
      String(item.proposalMilestoneId),
    );
    if (!buildMilestone) {
      continue;
    }
    await ctx.db.insert("buildCostItems", {
      brokerageId: input.auth.brokerage._id,
      buildId: input.buildId,
      buildMilestoneId: buildMilestone._id,
      costCents: item.costCents,
      createdAt: input.now,
      createdByWorkosUserId: item.createdByWorkosUserId,
      description: item.description,
      itemKey: item.itemKey,
      itemType: item.itemType,
      milestoneKey: item.milestoneKey,
      organizationId: input.organizationId,
      proposalCostItemId: item._id,
      proposalId: input.proposalId,
      quantity: item.quantity,
      relevantSubmilestoneKeys: item.relevantSubmilestoneKeys,
      supplier: item.supplier,
      title: item.title,
      updatedAt: input.now,
      updatedByWorkosUserId: item.updatedByWorkosUserId,
    });
  }
}

function activeBuildDrawStatusFromProposal(
  status: Doc<"proposalDrawScheduleRows">["requestStatus"],
): Doc<"plannedDrawScheduleRows">["status"] {
  if (
    status === "approved" ||
    status === "rejected" ||
    status === "requested"
  ) {
    return status;
  }
  return "planned";
}

async function getActiveBuildDrawOrThrow(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  drawKey: string,
) {
  const draw = await ctx.db
    .query("plannedDrawScheduleRows")
    .withIndex("by_build_order", (q) => q.eq("buildId", buildId))
    .collect()
    .then((rows) => rows.find((row) => row.drawKey === drawKey));
  if (!draw) {
    throw new Error("Production active-build draw not found.");
  }
  return draw;
}

async function getActiveBuildMilestoneOrThrow(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  milestoneKey: string,
) {
  const milestone = await ctx.db
    .query("buildMilestones")
    .withIndex("by_build_key", (q) =>
      q.eq("buildId", buildId).eq("key", milestoneKey),
    )
    .unique();
  if (!milestone) {
    throw new Error("Production active-build milestone not found.");
  }
  return milestone;
}

function activeBuildMilestoneEffectiveDrawAvailabilityCents(
  milestone: Doc<"buildMilestones">,
) {
  const approvedBudgetCents = Math.max(0, Math.round(milestone.budgetCents));
  const approvedDrawAvailabilityCents = Math.max(
    0,
    Math.round(milestone.drawAvailabilityCents),
  );
  const actualCostCents = (
    milestone.completionClaim as { actualCostCents?: number } | undefined
  )?.actualCostCents;

  if (actualCostCents === undefined || !Number.isFinite(actualCostCents)) {
    return approvedDrawAvailabilityCents;
  }

  if (approvedBudgetCents <= 0) {
    return 0;
  }

  const reimbursableBasisCents = Math.min(
    approvedBudgetCents,
    Math.max(0, Math.round(actualCostCents)),
  );

  return Math.min(
    approvedDrawAvailabilityCents,
    Math.round(
      (approvedDrawAvailabilityCents * reimbursableBasisCents) /
        approvedBudgetCents,
    ),
  );
}

function activeBuildMilestoneEffectiveCompletionDay(
  milestone: Doc<"buildMilestones">,
) {
  const completedDay = (
    milestone.completionClaim as { completedDay?: number } | undefined
  )?.completedDay;

  if (completedDay !== undefined && Number.isFinite(completedDay)) {
    return Math.max(0, Math.round(completedDay));
  }

  return Math.round(milestone.dayEnd);
}

async function calculateActiveBuildDrawAvailableLimitCents(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  targetDraw: Doc<"plannedDrawScheduleRows">,
) {
  const drawDay = Math.round(targetDraw.timingDay);
  const [milestones, draws] = await Promise.all([
    collectByIndex(ctx, "buildMilestones", "by_build", buildId),
    collectByIndex(ctx, "plannedDrawScheduleRows", "by_build", buildId),
  ]);
  const totalUnlockedCents = (milestones as Doc<"buildMilestones">[]).reduce(
    (total, milestone) => {
      if (activeBuildMilestoneEffectiveCompletionDay(milestone) > drawDay) {
        return total;
      }

      return (
        total + activeBuildMilestoneEffectiveDrawAvailabilityCents(milestone)
      );
    },
    0,
  );
  const alreadyDrawnCents = (draws as Doc<"plannedDrawScheduleRows">[]).reduce(
    (total, draw) => {
      if (draw._id === targetDraw._id || draw.timingDay > drawDay) {
        return total;
      }

      if (
        draw.timingDay === drawDay &&
        draw.drawKey.localeCompare(targetDraw.drawKey) > 0
      ) {
        return total;
      }

      return total + Math.max(0, Math.round(draw.amountCents));
    },
    0,
  );

  return Math.max(0, totalUnlockedCents - alreadyDrawnCents);
}

async function insertActiveBuildMilestoneFromInput(
  ctx: MutationCtx,
  auth: {
    brokerage: Doc<"brokerages">;
    build: Doc<"activeBuilds">;
    proposal: Doc<"buildProposals">;
  },
  milestone: {
    budgetCents: number;
    dayEnd: number;
    dayStart: number;
    dependencyKeys?: string[];
    drawAvailabilityCents?: number;
    durationDays: number;
    evidenceState: string;
    milestoneKey: string;
    name: string;
    order: number;
    policyState: string;
    submilestones?: {
      budgetCents?: number;
      durationDays?: number;
      key: string;
      name: string;
      order: number;
      startDay?: number;
    }[];
  },
) {
  const existing = await ctx.db
    .query("buildMilestones")
    .withIndex("by_build_key", (q) =>
      q.eq("buildId", auth.build._id).eq("key", milestone.milestoneKey),
    )
    .unique();
  if (existing) {
    throw new Error("Production active-build milestone already exists.");
  }
  const schedule = normalizeProductionMilestoneSchedule(milestone);
  const now = Date.now();
  const budgetCents = Math.max(0, Math.round(milestone.budgetCents));
  const proposalMilestoneId = await ctx.db.insert("proposalMilestones", {
    brokerageId: auth.brokerage._id,
    budgetCents,
    createdAt: now,
    dayEnd: schedule.dayEnd,
    dayStart: schedule.dayStart,
    dependencyKeys: milestone.dependencyKeys ?? [],
    drawAvailabilityCents:
      milestone.drawAvailabilityCents === undefined
        ? calculateDrawAvailability(budgetCents, auth.proposal.borrowerCoPayBps)
        : Math.max(0, Math.round(milestone.drawAvailabilityCents)),
    durationDays: schedule.durationDays,
    evidenceState: milestone.evidenceState,
    key: milestone.milestoneKey,
    name: milestone.name.trim() || "Active build milestone",
    order: Math.max(1, Math.round(milestone.order)),
    organizationId: auth.build.organizationId,
    policyState: milestone.policyState,
    proposalId: auth.proposal._id,
    timelineStatus: "ready",
    tone: "active",
    updatedAt: now,
  });
  const buildMilestoneId = await ctx.db.insert("buildMilestones", {
    brokerageId: auth.brokerage._id,
    budgetCents,
    buildId: auth.build._id,
    createdAt: now,
    dayEnd: schedule.dayEnd,
    dayStart: schedule.dayStart,
    dependencyKeys: milestone.dependencyKeys ?? [],
    drawAvailabilityCents:
      milestone.drawAvailabilityCents === undefined
        ? calculateDrawAvailability(budgetCents, auth.proposal.borrowerCoPayBps)
        : Math.max(0, Math.round(milestone.drawAvailabilityCents)),
    durationDays: schedule.durationDays,
    evidenceState: milestone.evidenceState,
    key: milestone.milestoneKey,
    name: milestone.name.trim() || "Active build milestone",
    order: Math.max(1, Math.round(milestone.order)),
    organizationId: auth.build.organizationId,
    policyState: milestone.policyState,
    progressPercent: 0,
    proposalMilestoneId,
    status: "planned",
    updatedAt: now,
  });
  await replaceActiveBuildSubmilestones(ctx, auth, {
    buildId: auth.build._id,
    milestone: {
      _id: buildMilestoneId,
      key: milestone.milestoneKey,
      proposalMilestoneId,
    },
    rows: schedule.submilestones,
  });
  return buildMilestoneId;
}

async function replaceActiveBuildSubmilestones(
  ctx: MutationCtx,
  auth: {
    brokerage: Doc<"brokerages">;
    build: Doc<"activeBuilds">;
    proposal: Doc<"buildProposals">;
  },
  input: {
    buildId: Id<"activeBuilds">;
    milestone: Pick<
      Doc<"buildMilestones">,
      "_id" | "key" | "proposalMilestoneId"
    >;
    rows: {
      budgetCents?: number;
      durationDays?: number;
      key: string;
      name: string;
      order: number;
      startDay?: number;
    }[];
  },
) {
  const existing = await ctx.db
    .query("buildSubmilestones")
    .withIndex("by_milestone", (q) =>
      q.eq("buildMilestoneId", input.milestone._id),
    )
    .collect();
  for (const row of existing) {
    await ctx.db.delete(row._id);
  }
  const now = Date.now();
  for (const row of [...input.rows].sort((a, b) => a.order - b.order)) {
    const proposalSubmilestoneId = await ctx.db.insert(
      "proposalSubmilestones",
      {
        brokerageId: auth.brokerage._id,
        budgetCents: row.budgetCents,
        createdAt: now,
        durationDays: row.durationDays,
        key: row.key,
        milestoneKey: input.milestone.key,
        name: row.name.trim() || "Submilestone",
        order: Math.max(1, Math.round(row.order)),
        organizationId: auth.build.organizationId,
        proposalId: auth.proposal._id,
        proposalMilestoneId: input.milestone.proposalMilestoneId,
        startDay: row.startDay,
        updatedAt: now,
      },
    );
    await ctx.db.insert("buildSubmilestones", {
      brokerageId: auth.brokerage._id,
      buildId: input.buildId,
      buildMilestoneId: input.milestone._id,
      budgetCents: row.budgetCents,
      createdAt: now,
      durationDays: row.durationDays,
      key: row.key,
      milestoneKey: input.milestone.key,
      name: row.name.trim() || "Submilestone",
      order: Math.max(1, Math.round(row.order)),
      organizationId: auth.build.organizationId,
      proposalSubmilestoneId,
      startDay: row.startDay,
      status: "planned",
      updatedAt: now,
    });
  }
}

async function deleteActiveBuildStorageRow(
  ctx: MutationCtx,
  row: {
    _id: Id<"buildDocuments"> | Id<"buildEvidenceAssets">;
    storageId?: Id<"_storage">;
  },
) {
  if (row.storageId) {
    await ctx.storage.delete(row.storageId);
  }
  await ctx.db.delete(row._id);
}

async function deleteActiveBuildCascade(
  ctx: MutationCtx,
  buildId: Id<"activeBuilds">,
) {
  const milestones = await collectByIndex(
    ctx,
    "buildMilestones",
    "by_build",
    buildId,
  );
  for (const milestone of milestones) {
    await deleteActiveBuildMilestoneCascade(ctx, buildId, milestone);
  }

  const documents = await collectByIndex(
    ctx,
    "buildDocuments",
    "by_build",
    buildId,
  );
  for (const document of documents) {
    await deleteActiveBuildStorageRow(ctx, document);
  }

  const evidenceAssets = await collectByIndex(
    ctx,
    "buildEvidenceAssets",
    "by_build",
    buildId,
  );
  for (const asset of evidenceAssets) {
    await deleteActiveBuildStorageRow(ctx, asset);
  }

  for (const table of [
    "milestoneContractorAssignments",
    "contractorQualityRatings",
    "buildContractorAssignments",
    "buildBrokerAssignments",
    "activeBuildFacilityChangeRequests",
    "loanFacilities",
    "buildCapitalPlans",
    "plannedDrawScheduleRows",
    "buildCostItems",
    "buildSubmilestones",
    "buildSiteVisits",
    "capitalEvents",
    "buildNotes",
    "calendarTargetDates",
    "scheduleRevisionRecords",
  ] as const) {
    const rows = await collectByIndex(ctx, table, "by_build", buildId);
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  }

  await ctx.db.delete(buildId);
}

async function deleteActiveBuildMilestoneCascade(
  ctx: MutationCtx,
  buildId: Id<"activeBuilds">,
  milestone: Doc<"buildMilestones">,
) {
  const submilestones = await ctx.db
    .query("buildSubmilestones")
    .withIndex("by_milestone", (q) => q.eq("buildMilestoneId", milestone._id))
    .collect();
  for (const row of submilestones) {
    await ctx.db.delete(row._id);
  }
  const costItems = await ctx.db
    .query("buildCostItems")
    .withIndex("by_milestone", (q) => q.eq("buildMilestoneId", milestone._id))
    .collect();
  for (const item of costItems) {
    await ctx.db.delete(item._id);
  }
  const evidenceAssets = await ctx.db
    .query("buildEvidenceAssets")
    .withIndex("by_build_milestone", (q) =>
      q.eq("buildId", buildId).eq("milestoneKey", milestone.key),
    )
    .collect();
  for (const asset of evidenceAssets) {
    if (asset.storageId) {
      await ctx.storage.delete(asset.storageId);
    }
    await ctx.db.delete(asset._id);
  }
  const draws = await collectByIndex(
    ctx,
    "plannedDrawScheduleRows",
    "by_build",
    buildId,
  );
  for (const draw of draws.filter(
    (row: any) => row.milestoneKey === milestone.key,
  )) {
    await ctx.db.delete(draw._id);
  }
  const siteVisits = await ctx.db
    .query("buildSiteVisits")
    .withIndex("by_build_milestone", (q) =>
      q.eq("buildId", buildId).eq("milestoneKey", milestone.key),
    )
    .collect();
  for (const visit of siteVisits) {
    await ctx.db.delete(visit._id);
  }
  await ctx.db.delete(milestone._id);
}

async function authorizeActiveBuildCostItemWrite(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  buildId: Id<"activeBuilds">,
  workosOrganizationId: string,
  reason?: string,
  options?: { requireReason?: boolean },
) {
  const auth = await authorizeActiveBuildOrThrow(
    ctx,
    buildId,
    workosOrganizationId,
  );
  requireBackofficeActiveBuildWrite(auth);
  if (options?.requireReason ?? true) {
    requireReason(reason ?? "");
  }
  return auth;
}

async function validateBuildCostItemSubmilestones(
  ctx: QueryCtx | MutationCtx,
  milestone: Pick<Doc<"buildMilestones">, "_id" | "key">,
  relevantSubmilestoneKeys: string[],
) {
  const available = await ctx.db
    .query("buildSubmilestones")
    .withIndex("by_milestone", (q) => q.eq("buildMilestoneId", milestone._id))
    .collect();
  const availableKeys = new Set(available.map((row) => row.key));
  const normalized = [
    ...new Set(
      relevantSubmilestoneKeys
        .map((key) => key.trim())
        .filter((key) => key.length > 0),
    ),
  ];
  const invalid = normalized.filter((key) => !availableKeys.has(key));
  if (invalid.length > 0) {
    throw new Error(
      `Relevant sub-milestones must belong to ${milestone.key}: ${invalid.join(", ")}.`,
    );
  }
  return normalized;
}

async function nextBuildCostItemKey(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  title: string,
  now: number,
) {
  const base = slugifyKey(title) || "cost-item";
  let candidate = `${base}-${now.toString(36)}`;
  let attempt = 1;
  while (
    await ctx.db
      .query("buildCostItems")
      .withIndex("by_build_key", (q) =>
        q.eq("buildId", buildId).eq("itemKey", candidate),
      )
      .unique()
  ) {
    attempt += 1;
    candidate = `${base}-${now.toString(36)}-${attempt}`;
  }
  return candidate;
}

async function getBuildCostItemOrThrow(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  itemId: Id<"buildCostItems">,
) {
  const item = await ctx.db.get(itemId);
  if (!item || item.buildId !== buildId) {
    throw new Error("Active build cost item not found.");
  }
  return item;
}

async function activeBuildBorrowerCoPayBps(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  proposal: Doc<"buildProposals">,
) {
  const capitalPlan = (
    await collectByIndex(ctx, "buildCapitalPlans", "by_build", buildId)
  )[0] as Doc<"buildCapitalPlans"> | undefined;
  return capitalPlan?.borrowerCoPayBps ?? proposal.borrowerCoPayBps;
}

async function applyActiveBuildCostItemBudgetDelta(
  ctx: MutationCtx,
  auth: {
    build: Doc<"activeBuilds">;
    proposal: Doc<"buildProposals">;
  },
  input: {
    buildId: Id<"activeBuilds">;
    deltaCents: number;
    milestone: Doc<"buildMilestones">;
  },
) {
  if (input.deltaCents === 0) {
    return;
  }
  const now = Date.now();
  const borrowerCoPayBps = await activeBuildBorrowerCoPayBps(
    ctx,
    input.buildId,
    auth.proposal,
  );
  const nextMilestoneBudgetCents = Math.max(
    0,
    input.milestone.budgetCents + input.deltaCents,
  );
  const nextDrawAvailabilityCents = calculateDrawAvailability(
    nextMilestoneBudgetCents,
    borrowerCoPayBps,
  );
  await ctx.db.patch(input.milestone._id, {
    budgetCents: nextMilestoneBudgetCents,
    drawAvailabilityCents: nextDrawAvailabilityCents,
    updatedAt: now,
  });
  await recalculateActiveBuildBudget(ctx, input.buildId);
}

async function recalculateActiveBuildBudget(
  ctx: MutationCtx,
  buildId: Id<"activeBuilds">,
) {
  const milestones = await collectByIndex(
    ctx,
    "buildMilestones",
    "by_build",
    buildId,
  );
  const totalBudgetCents = milestones.reduce(
    (total: number, milestone: any) => total + milestone.budgetCents,
    0,
  );
  await ctx.db.patch(buildId, {
    totalBudgetCents,
    updatedAt: Date.now(),
  });
}

function addDaysIso(startIso: string, days: number) {
  const startMs = Date.parse(`${startIso.slice(0, 10)}T00:00:00Z`);
  const safeStartMs = Number.isFinite(startMs) ? startMs : Date.now();
  return new Date(safeStartMs + Math.round(days) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

async function insertActiveBuildCapitalEvent(
  ctx: MutationCtx,
  auth: {
    brokerage: Doc<"brokerages">;
    build: Doc<"activeBuilds">;
  },
  input: {
    amountCents: number;
    capitalEventKey: string;
    eventKind: "cashInfusion" | "cost";
    label: string;
    x: number;
  },
) {
  const existing = (
    await collectByIndex(ctx, "capitalEvents", "by_build", auth.build._id)
  ).find((event: any) => event.capitalEventKey === input.capitalEventKey);
  if (existing) {
    throw new Error("Production active-build capital event already exists.");
  }
  await ctx.db.insert("capitalEvents", {
    amountCents: Math.max(0, Math.round(input.amountCents)),
    brokerageId: auth.brokerage._id,
    buildId: auth.build._id,
    capitalEventKey: input.capitalEventKey,
    createdAt: Date.now(),
    eventDate: addDaysIso(auth.build.startDate, input.x),
    eventType: input.eventKind === "cashInfusion" ? "borrower_copay" : "cost",
    label:
      input.label.trim() ||
      (input.eventKind === "cashInfusion" ? "Cash infusion" : "Capital spike"),
    organizationId: auth.build.organizationId,
  });
}

async function getActiveBuildCapitalEventOrThrow(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  capitalEventKey: string,
) {
  const event = (
    await collectByIndex(ctx, "capitalEvents", "by_build", buildId)
  ).find(
    (row: any) =>
      row.capitalEventKey === capitalEventKey ||
      String(row._id) === capitalEventKey,
  );
  if (!event) {
    throw new Error("Production active-build capital event not found.");
  }
  return event as Doc<"capitalEvents">;
}

async function getActiveBuildEvidenceAssetOrThrow(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  evidenceKey: string,
) {
  const asset = await ctx.db
    .query("buildEvidenceAssets")
    .withIndex("by_build_key", (q) =>
      q.eq("buildId", buildId).eq("evidenceKey", evidenceKey),
    )
    .unique();
  if (!asset) {
    throw new Error("Production active-build evidence asset not found.");
  }
  return asset;
}

async function getActiveBuildSiteVisitTokenState(
  ctx: QueryCtx | MutationCtx,
  buildIdValue: string,
  token: string,
) {
  const buildId = ctx.db.normalizeId("activeBuilds", buildIdValue);
  if (!buildId) {
    return {
      available: false,
      build: null,
      files: [],
      reason: "not_found",
      status: "invalid",
      targets: [],
      visit: null,
    };
  }
  const build = await ctx.db.get(buildId);
  if (!build) {
    return {
      available: false,
      build: null,
      files: [],
      reason: "not_found",
      status: "invalid",
      targets: [],
      visit: null,
    };
  }
  const visit = await ctx.db
    .query("buildSiteVisits")
    .withIndex("by_visit", (q) => q.eq("visitId", token))
    .unique();
  const buildView = {
    key: String(build._id),
    name: build.buildName,
    subtitle: build.location,
  };
  if (!visit || visit.buildId !== buildId) {
    return {
      available: false,
      build: buildView,
      files: [],
      reason: "not_found",
      status: "invalid",
      targets: [],
      visit: null,
    };
  }
  const [milestone, submilestones, evidenceAssets, contractorAssignments] =
    await Promise.all([
      ctx.db.get(visit.buildMilestoneId),
      ctx.db
        .query("buildSubmilestones")
        .withIndex("by_milestone", (q) =>
          q.eq("buildMilestoneId", visit.buildMilestoneId),
        )
        .collect(),
      ctx.db
        .query("buildEvidenceAssets")
        .withIndex("by_build_milestone", (q) =>
          q.eq("buildId", buildId).eq("milestoneKey", visit.milestoneKey),
        )
        .collect(),
      ctx.db
        .query("milestoneContractorAssignments")
        .withIndex("by_build_milestone", (q) =>
          q.eq("buildId", buildId).eq("milestoneKey", visit.milestoneKey),
        )
        .collect(),
    ]);
  const assignedContractorProfiles = await Promise.all(
    contractorAssignments.map((assignment) =>
      ctx.db.get(assignment.contractorId),
    ),
  );
  const contractorById = new Map(
    assignedContractorProfiles
      .filter((contractor) => contractor !== null)
      .map((contractor) => [String(contractor!._id), contractor!]),
  );
  const files = await Promise.all(
    evidenceAssets
      .filter((asset) =>
        asset.source.startsWith(`active_build_site_visit:${token}`),
      )
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(async (asset) => ({
        _id: String(asset._id),
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        targetMilestoneKey: asset.milestoneKey,
        targetSubmilestoneKey: asset.submilestoneKey,
        uploadedAt: asset.createdAt,
        url: asset.storageId ? await ctx.storage.getUrl(asset.storageId) : null,
      })),
  );
  const targets = milestone
    ? [
        {
          _id: String(milestone._id),
          guidance: {
            cameraAngles: guidanceLinesToHtml([
              "Wide shot of the requested scope.",
              "Close-up of work quality and visible completion details.",
              "Context photo tying the milestone to the build site.",
            ]),
            whatToVerify: guidanceLinesToHtml([
              `${milestone.name} work appears complete enough for reimbursement review.`,
              "Evidence location and site context are visible.",
              "Any exceptions or incomplete work are noted in the report.",
            ]),
          },
          milestoneKey: milestone.key,
          milestoneName: milestone.name,
          milestoneOrder: milestone.order,
          contractors: contractorAssignments
            .map((assignment) => {
              const contractor = contractorById.get(
                String(assignment.contractorId),
              );
              if (!contractor) {
                return null;
              }
              return {
                _id: String(contractor._id),
                assignmentId: String(assignment._id),
                name: contractor.name,
                role: assignment.role,
                submilestoneKey: assignment.submilestoneKey,
              };
            })
            .filter(Boolean),
          submilestones: submilestones
            .sort((a, b) => a.order - b.order)
            .map((submilestone) => ({
              key: submilestone.key,
              name: submilestone.name,
            })),
        },
      ]
    : [];
  const visitView = {
    completedAt: visit.completedAt ? Date.parse(visit.completedAt) : undefined,
    createdAt: visit.createdAt,
    milestoneKey: visit.milestoneKey,
    recommendedOutcome:
      milestone?.completionReview?.siteVisit?.recommendedOutcome,
    requestReason: visit.note,
    status: visit.status,
    tokenConsumedAt: visit.tokenConsumedAt,
    tokenExpiresAt: visit.tokenExpiresAt,
  };
  const now = Date.now();
  if (visit.tokenConsumedAt || visit.status !== "requested") {
    return {
      available: false,
      build: buildView,
      files,
      reason: "consumed",
      status: "completed",
      targets,
      visit: visitView,
    };
  }
  if (visit.tokenExpiresAt <= now) {
    return {
      available: false,
      build: buildView,
      files,
      reason: "expired",
      status: "expired",
      targets,
      visit: visitView,
    };
  }
  return {
    available: true,
    build: buildView,
    files,
    targets,
    visit: visitView,
  };
}

async function withBuildDocumentStorageUrls(
  ctx: QueryCtx,
  documents: Doc<"buildDocuments">[],
) {
  return await Promise.all(
    documents
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(async (document) => ({
        ...document,
        name: document.fileName,
        kind: document.documentType,
        storageUrl: document.storageId
          ? await ctx.storage.getUrl(document.storageId)
          : null,
      })),
  );
}

async function withBuildEvidenceAssetStorageUrls(
  ctx: QueryCtx,
  evidenceAssets: Doc<"buildEvidenceAssets">[],
) {
  return await Promise.all(
    evidenceAssets
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(async (asset) => ({
        _id: String(asset._id),
        contractorIds: asset.contractorIds,
        createdAt: asset.createdAt,
        evidenceKey: asset.evidenceKey,
        fileName: asset.fileName,
        label: asset.label,
        locationVerified: asset.locationVerified,
        milestoneKey: asset.milestoneKey,
        mimeType: asset.mimeType,
        previewUrl: asset.storageId
          ? await ctx.storage.getUrl(asset.storageId)
          : null,
        sizeBytes: asset.sizeBytes,
        source: asset.source,
        submilestoneKey: asset.submilestoneKey,
        tag: asset.tag,
        updatedAt: asset.updatedAt,
      })),
  );
}

async function productionSitePhotosForBuild(
  ctx: QueryCtx,
  build: Doc<"activeBuilds">,
  evidenceAssets: Doc<"buildEvidenceAssets">[],
) {
  const imageAssets = evidenceAssets
    .filter(
      (asset) =>
        asset.mimeType.startsWith("image/") ||
        asset.tag.toLowerCase().includes("photo"),
    )
    .sort((a, b) => a.createdAt - b.createdAt);
  if (imageAssets.length === 0) {
    return [
      {
        caption: "Build site overview",
        evidenceKey: `build-overview-${String(build._id)}`,
        locationVerified: true,
        takenAt: new Date(build.createdAt).toISOString(),
        url: `production-build://${String(build._id)}`,
      },
    ];
  }
  return await Promise.all(
    imageAssets.map(async (asset) => ({
      caption: asset.label,
      evidenceKey: asset.evidenceKey,
      locationVerified: asset.locationVerified,
      takenAt: new Date(asset.createdAt).toISOString(),
      url: asset.storageId
        ? ((await ctx.storage.getUrl(asset.storageId)) ??
          `production-evidence://${asset.evidenceKey}`)
        : `production-evidence://${asset.evidenceKey}`,
    })),
  );
}

function formatActiveBuildNote(note: Doc<"buildNotes">) {
  return {
    ...note,
    _id: String(note._id),
    authorPersona: note.authorWorkosUserId,
  };
}

async function getActiveWorkflowRule(
  ctx: QueryCtx | MutationCtx,
  brokerageId: Id<"brokerages">,
) {
  const rule = await ctx.db
    .query("workflowRules")
    .withIndex("by_brokerage_status", (q) =>
      q.eq("brokerageId", brokerageId).eq("status", "active"),
    )
    .first();
  if (!rule) {
    throw new Error("Missing active workflow rule.");
  }
  return rule;
}

async function getWorkflowSnapshot(
  ctx: QueryCtx | MutationCtx,
  proposal: Doc<"buildProposals">,
) {
  if (!proposal.workflowRuleSnapshotId) {
    throw new Error("Proposal is missing workflow rule snapshot.");
  }
  const snapshot = await ctx.db.get(proposal.workflowRuleSnapshotId);
  if (!snapshot) {
    throw new Error("Proposal workflow rule snapshot was not found.");
  }
  return snapshot;
}

async function getPermitDocument(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
) {
  return await ctx.db
    .query("proposalDocuments")
    .withIndex("by_proposal_type", (q) =>
      q.eq("proposalId", proposalId).eq("documentType", "permit"),
    )
    .first();
}

async function getPermitWaiver(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
) {
  return await ctx.db
    .query("documentWaivers")
    .withIndex("by_proposal_type", (q) =>
      q.eq("proposalId", proposalId).eq("documentType", "permit"),
    )
    .first();
}

async function withDocumentStorageUrls(
  ctx: QueryCtx,
  documents: Doc<"proposalDocuments">[],
) {
  return await Promise.all(
    documents.map(async (document) => ({
      ...document,
      storageUrl: document.storageId
        ? await ctx.storage.getUrl(document.storageId)
        : null,
    })),
  );
}

async function visibleBuilderCards(
  ctx: QueryCtx,
  auth: { brokerage: Doc<"brokerages">; subject: string },
) {
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_user", (q) => q.eq("workosUserId", auth.subject))
    .collect();
  const visible: Doc<"proposalKanbanCards">[] = [];
  for (const link of links.filter((row) => row.status === "active")) {
    const proposals = await ctx.db
      .query("buildProposals")
      .withIndex("by_builder", (q) =>
        q.eq("builderProfileId", link.builderProfileId),
      )
      .collect();
    for (const proposal of proposals) {
      if (proposal.brokerageId !== auth.brokerage._id) {
        continue;
      }
      const card = await ctx.db
        .query("proposalKanbanCards")
        .withIndex("by_proposal", (q) => q.eq("proposalId", proposal._id))
        .unique();
      if (card) {
        visible.push(card);
      }
    }
  }
  return visible;
}

async function visibleBackofficeCards(
  ctx: QueryCtx,
  auth: { brokerage: Doc<"brokerages">; roles: RoleSlug[]; subject: string },
) {
  const cards = await ctx.db
    .query("proposalKanbanCards")
    .withIndex("by_brokerage_column_sort", (q) =>
      q.eq("brokerageId", auth.brokerage._id),
    )
    .collect();
  const staffCanRead =
    auth.roles.includes("broker-staff") &&
    (await hasPermission(
      ctx,
      auth.brokerage.workosOrganizationId,
      auth.roles,
      "proposals:read",
    ));
  const visible: Doc<"proposalKanbanCards">[] = [];

  for (const card of cards) {
    const proposal = await ctx.db.get(card.proposalId);
    if (!proposal) {
      continue;
    }
    if (canReadBackofficeProposal(auth, proposal) || staffCanRead) {
      visible.push(card);
    }
  }

  return visible;
}

async function buildProductionSettingsProjection(
  ctx: QueryCtx | MutationCtx,
  brokerage: Doc<"brokerages">,
) {
  const [archetypes, workflowRules, templates] = await Promise.all([
    ctx.db
      .query("milestoneArchetypes")
      .withIndex("by_brokerage_key", (q) => q.eq("brokerageId", brokerage._id))
      .collect(),
    ctx.db
      .query("workflowRules")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", brokerage._id))
      .collect(),
    collectProposalTemplateDetails(ctx, brokerage._id),
  ]);

  return {
    archetypes,
    brokerage,
    completeness: productionSettingsCompleteness(templates),
    templates,
    workflowRules,
  };
}

async function collectProposalTemplateDetails(
  ctx: QueryCtx | MutationCtx,
  brokerageId: Id<"brokerages">,
) {
  const templates = (
    await ctx.db
      .query("proposalTemplates")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", brokerageId))
      .collect()
  )
    .filter((template) => template.status === "active")
    .sort(
      (a, b) =>
        Number(b.isDefault) - Number(a.isDefault) ||
        productionTemplateSortOrder(a.templateKey) -
          productionTemplateSortOrder(b.templateKey) ||
        a.createdAt - b.createdAt ||
        a.templateKey.localeCompare(b.templateKey),
    );
  const templateDetails = [];
  for (const template of templates) {
    const [milestones, scenarios] = await Promise.all([
      ctx.db
        .query("proposalTemplateMilestones")
        .withIndex("by_template_order", (q) => q.eq("templateId", template._id))
        .collect(),
      ctx.db
        .query("drawScheduleScenarios")
        .withIndex("by_template", (q) => q.eq("templateId", template._id))
        .collect(),
    ]);
    const milestoneDetails = [];
    for (const milestone of milestones) {
      const submilestones = (
        await ctx.db
          .query("proposalTemplateSubmilestones")
          .withIndex("by_template_milestone", (q) =>
            q.eq("templateMilestoneId", milestone._id),
          )
          .collect()
      ).sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
      milestoneDetails.push({
        ...milestone,
        icon: milestone.archetypeKey ?? milestone.key,
        included: true,
        milestoneKey: milestone.key,
        submilestones: submilestones.map((submilestone) => ({
          ...submilestone,
          description: `${submilestone.name} completion target.`,
          submilestoneKey: submilestone.key,
        })),
        type: milestone.archetypeKey ?? milestone.key,
      });
    }
    const scenarioDetails = [];
    for (const scenario of scenarios
      .filter((row) => row.status === "active")
      .sort(
        (a, b) =>
          Number(a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
            Number(b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
          Number(b.isDefault) - Number(a.isDefault) ||
          a.createdAt - b.createdAt ||
          a.scenarioKey.localeCompare(b.scenarioKey),
      )) {
      scenarioDetails.push({
        ...scenario,
        description:
          scenario.description ??
          `${scenario.name} draw timing and reimbursement amount assumptions.`,
        draws: await listProductionScenarioDraws(
          ctx,
          template._id,
          scenario.scenarioKey,
        ),
        isActive: scenario.isActive ?? scenario.isDefault,
        sortOrder: scenario.sortOrder ?? scenarioDetails.length,
      });
    }
    templateDetails.push({
      ...template,
      description: template.summary,
      milestones: milestoneDetails,
      scenarios: scenarioDetails,
    });
  }
  return templateDetails;
}

async function listProductionScenarioDraws(
  ctx: QueryCtx | MutationCtx,
  templateId: Id<"proposalTemplates">,
  scenarioKey: string,
) {
  return await ctx.db
    .query("drawScheduleScenarioRows")
    .withIndex("by_template_scenario_order", (q) =>
      q.eq("templateId", templateId).eq("scenarioKey", scenarioKey),
    )
    .collect()
    .then((rows) =>
      rows.sort(
        (a, b) => a.order - b.order || a.drawKey.localeCompare(b.drawKey),
      ),
    );
}

function productionSettingsCompleteness(
  templates: Array<{
    milestones: unknown[];
    scenarios: Array<{ draws?: unknown[]; isActive?: boolean }>;
    templateKey: string;
  }>,
) {
  const requiredTemplateKeys = PRODUCTION_DEFAULT_TEMPLATES.map(
    (template) => template.templateKey,
  );
  return {
    missingTemplateKeys: requiredTemplateKeys.filter(
      (templateKey) =>
        !templates.some((template) => template.templateKey === templateKey),
    ),
    readyTemplateCount: templates.filter(
      (template) =>
        template.milestones.length > 0 &&
        template.scenarios.some((scenario) => scenario.isActive) &&
        template.scenarios.every(
          (scenario) => (scenario.draws ?? []).length > 0,
        ),
    ).length,
    requiredTemplateCount: requiredTemplateKeys.length,
    templateCount: templates.length,
  };
}

async function collectByIndex<TableName extends keyof any>(
  ctx: QueryCtx | MutationCtx,
  table: TableName,
  indexName: string,
  id: string,
) {
  const fieldName =
    indexName === "by_build"
      ? "buildId"
      : indexName === "by_contractor"
        ? "contractorId"
        : "proposalId";
  return await (ctx.db.query(table as never) as any)
    .withIndex(indexName, (q: any) => q.eq(fieldName, id))
    .collect();
}

async function upsertWorkosProjection(
  ctx: MutationCtx,
  workosOrganizationId: string,
  now: number,
) {
  const name = FAIRLEND_BROKERAGE_NAME;
  const organization = await ctx.db
    .query("workosOrganizations")
    .withIndex("by_workos_organization_id", (q) =>
      q.eq("workosOrganizationId", workosOrganizationId),
    )
    .unique();
  if (organization) {
    await ctx.db.patch(organization._id, {
      name,
      status: "active",
      updatedAt: now,
    });
    return;
  }
  await ctx.db.insert("workosOrganizations", {
    createdAt: now,
    domains: [],
    name,
    sourceEventId: `seed_${workosOrganizationId}`,
    sourceEventType: "seed.production_foundation",
    status: "active",
    updatedAt: now,
    workosOrganizationId,
  });
}

async function upsertWorkosUserAndMembership(
  ctx: MutationCtx,
  input: {
    email: string;
    now: number;
    roleSlugs: string[];
    workosOrganizationId: string;
    workosUserId: string;
  },
) {
  const user = await ctx.db
    .query("users")
    .withIndex("authId", (q) => q.eq("authId", input.workosUserId))
    .unique();
  if (user) {
    await ctx.db.patch(user._id, {
      email: input.email,
      status: "active",
      updatedAt: input.now,
      workosUserId: input.workosUserId,
    });
  } else {
    await ctx.db.insert("users", {
      authId: input.workosUserId,
      createdAt: input.now,
      email: input.email,
      name: input.email.split("@")[0] ?? input.workosUserId,
      sourceEventId: `seed_${input.workosUserId}`,
      sourceEventType: "seed.production_foundation",
      status: "active",
      updatedAt: input.now,
      workosUserId: input.workosUserId,
    });
  }

  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (q) => q.eq("workosUserId", input.workosUserId))
    .collect();
  const membership = memberships.find(
    (row) => row.workosOrganizationId === input.workosOrganizationId,
  );
  const payload = {
    directoryManaged: false,
    roleSlug: input.roleSlugs[0],
    roleSlugs: input.roleSlugs,
    sourceEventId: `seed_membership_${input.workosUserId}`,
    sourceEventType: "seed.production_foundation",
    status: "active" as const,
    updatedAt: input.now,
  };
  if (membership) {
    await ctx.db.patch(membership._id, payload);
  } else {
    await ctx.db.insert("workosOrganizationMemberships", {
      ...payload,
      createdAt: input.now,
      workosMembershipId: `seed_membership_${input.workosUserId}`,
      workosOrganizationId: input.workosOrganizationId,
      workosUserId: input.workosUserId,
    });
  }
}

async function ensureBrokerage(
  ctx: MutationCtx,
  input: {
    displayName: string;
    legalName: string;
    now: number;
    principalBrokerWorkosUserId?: string;
    workosOrganizationId: string;
  },
) {
  const existing = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (q) =>
      q.eq("workosOrganizationId", input.workosOrganizationId),
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      displayName: input.displayName,
      legalName: input.legalName,
      principalBrokerWorkosUserId:
        input.principalBrokerWorkosUserId ??
        existing.principalBrokerWorkosUserId,
      status: "active",
      updatedAt: input.now,
    });
    return existing._id;
  }
  return await ctx.db.insert("brokerages", {
    createdAt: input.now,
    displayName: input.displayName,
    legalName: input.legalName,
    principalBrokerWorkosUserId: input.principalBrokerWorkosUserId,
    status: "active",
    updatedAt: input.now,
    workosOrganizationId: input.workosOrganizationId,
  });
}

async function ensureBuilderProfile(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    displayName: string;
    now: number;
    organizationId: string;
  },
) {
  const existing = await ctx.db
    .query("builderProfiles")
    .withIndex("by_organization", (q) =>
      q.eq("organizationId", input.organizationId),
    )
    .first();
  if (existing) {
    return existing._id;
  }
  return await ctx.db.insert("builderProfiles", {
    brokerageId: input.brokerageId,
    createdAt: input.now,
    displayName: input.displayName,
    organizationId: input.organizationId,
    status: "active",
    updatedAt: input.now,
  });
}

async function ensureBuilderAccountLink(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    builderProfileId: Id<"builderProfiles">;
    now: number;
    role: "owner" | "staff";
    workosUserId: string;
  },
) {
  const existing = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder_user", (q) =>
      q
        .eq("builderProfileId", input.builderProfileId)
        .eq("workosUserId", input.workosUserId),
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      status: "active",
      updatedAt: input.now,
    });
    return existing._id;
  }
  return await ctx.db.insert("builderAccountLinks", {
    brokerageId: input.brokerageId,
    builderProfileId: input.builderProfileId,
    createdAt: input.now,
    role: input.role,
    status: "active",
    updatedAt: input.now,
    workosUserId: input.workosUserId,
  });
}

type ProductionDefaultScenario = {
  description: string;
  draws: ProductionDefaultScenarioDraw[];
  isActive: boolean;
  isDefault: boolean;
  name: string;
  scenarioKey: string;
};

type ProductionDefaultScenarioDraw = {
  amountBps: number;
  drawKey: string;
  label: string;
  order?: number;
  reviewNote: string;
  timingDay: number;
};

type ProductionDefaultMilestone = {
  archetypeDescription: string;
  archetypeKey: string;
  dependencyKeys: string[];
  durationDays: number;
  key: string;
  name: string;
  percentageBps: number;
  siteVisitGuidance: SiteVisitGuidance;
  submilestones: Array<{
    durationDays: number;
    key: string;
    name: string;
    percentageBps: number;
  }>;
};

type ProductionDefaultTemplate = {
  description: string;
  isDefault: boolean;
  milestones: ProductionDefaultMilestone[];
  scenarios: ProductionDefaultScenario[];
  summary: string;
  templateKey: string;
  title: string;
};

const PRODUCTION_DEFAULT_TEMPLATES: ProductionDefaultTemplate[] = [
  {
    description:
      "Ground-up single family construction roadmap for reimbursement draw planning.",
    isDefault: true,
    milestones: [
      productionDefaultMilestone(
        "site-prep",
        "Site prep & foundation",
        1000,
        14,
        "foundation",
        [
          "Permit mobilization",
          "Excavation",
          "Concrete forms",
          "Foundation pour",
        ],
      ),
      productionDefaultMilestone(
        "framing",
        "Framing & structure",
        1280,
        18,
        "framing",
        ["Wall framing", "Roof trusses", "Structural sheathing"],
      ),
      productionDefaultMilestone(
        "rough-in",
        "Rough-in mechanical",
        1960,
        20,
        "roughIn",
        ["Plumbing rough-in", "Electrical rough-in", "HVAC ducts"],
      ),
      productionDefaultMilestone(
        "exterior",
        "Windows & exterior",
        1680,
        18,
        "exterior",
        ["Window install", "Weather barrier", "Exterior doors"],
      ),
      productionDefaultMilestone(
        "drywall",
        "Inspections & drywall",
        1520,
        16,
        "drywall",
        ["Rough-in inspection", "Insulation", "Drywall hang"],
      ),
      productionDefaultMilestone(
        "finishes",
        "Finishes & fixtures",
        1280,
        12,
        "finishes",
        ["Cabinetry", "Flooring", "Fixture set"],
      ),
      productionDefaultMilestone(
        "closeout",
        "Final inspection & closeout",
        1280,
        4,
        "closeout",
        ["Punch list", "Final inspection", "Closeout package"],
      ),
    ],
    scenarios: [
      productionDefaultScenario(
        "standard-reimbursement",
        "Standard reimbursement",
        true,
        [
          productionDefaultDraw(
            "draw-01",
            "Draw 01",
            16,
            2000,
            "Foundation complete",
          ),
          productionDefaultDraw(
            "draw-02",
            "Draw 02",
            39,
            2500,
            "Framing verified",
          ),
          productionDefaultDraw(
            "draw-03",
            "Draw 03",
            64,
            2500,
            "Rough-in approved",
          ),
          productionDefaultDraw(
            "draw-04",
            "Draw 04",
            108,
            2000,
            "Envelope and drywall reviewed",
          ),
          productionDefaultDraw(
            "draw-05",
            "Draw 05",
            125,
            1000,
            "Finishes accepted before closeout",
          ),
        ],
      ),
      productionDefaultScenario(
        "conservative-review-lag",
        "Conservative review lag",
        false,
        [
          productionDefaultDraw(
            "draw-01",
            "Draw 01",
            18,
            1800,
            "Foundation plus review lag",
          ),
          productionDefaultDraw(
            "draw-02",
            "Draw 02",
            41,
            2200,
            "Framing plus review lag",
          ),
          productionDefaultDraw(
            "draw-03",
            "Draw 03",
            66,
            2500,
            "Rough-in plus review lag",
          ),
          productionDefaultDraw(
            "draw-04",
            "Draw 04",
            110,
            2200,
            "Drywall plus review lag",
          ),
          productionDefaultDraw(
            "draw-05",
            "Draw 05",
            127,
            1300,
            "Finishes plus review lag",
          ),
        ],
      ),
    ],
    summary: "7 milestones, 100.00% PoC, 102 field days",
    templateKey: "single-family-full-build",
    title: "Single Family Full Build",
  },
  {
    description:
      "Selective renovation path for quicker inspection cadence and lighter scope.",
    isDefault: false,
    milestones: [
      productionDefaultMilestone(
        "renovation-permits",
        "Permit updates and mobilization",
        800,
        10,
        "foundation",
        ["Permit update", "Site protection"],
      ),
      productionDefaultMilestone(
        "selective-demo",
        "Selective demolition",
        1400,
        16,
        "change",
        ["Interior demo", "Waste removal"],
      ),
      productionDefaultMilestone(
        "structural-repairs",
        "Structural repairs",
        1800,
        18,
        "framing",
        ["Beam repairs", "Blocking"],
      ),
      productionDefaultMilestone(
        "envelope-repairs",
        "Envelope repairs",
        1500,
        12,
        "exterior",
        ["Flashing", "Window repairs"],
      ),
      productionDefaultMilestone(
        "rough-in-refresh",
        "Rough-in refresh",
        1500,
        14,
        "roughIn",
        ["Electrical", "Plumbing"],
      ),
      productionDefaultMilestone(
        "interior-rebuild",
        "Interior rebuild",
        2200,
        14,
        "finishes",
        ["Drywall", "Millwork"],
      ),
      productionDefaultMilestone(
        "renovation-closeout",
        "Inspection closeout",
        800,
        2,
        "closeout",
        ["Deficiency list", "Final signoff"],
      ),
    ],
    scenarios: [
      productionDefaultScenario("quick-inspection", "Quick inspection", true, [
        productionDefaultDraw(
          "draw-01",
          "Draw 01",
          33,
          2200,
          "Demolition complete",
        ),
        productionDefaultDraw(
          "draw-02",
          "Draw 02",
          57,
          2800,
          "Structure reviewed",
        ),
        productionDefaultDraw(
          "draw-03",
          "Draw 03",
          93,
          3000,
          "Rough-in refresh complete",
        ),
        productionDefaultDraw(
          "draw-04",
          "Draw 04",
          111,
          2000,
          "Interior rebuild substantially complete",
        ),
      ]),
    ],
    summary: "7 milestones, 100.00% PoC, 86 days",
    templateKey: "single-family-renovation",
    title: "Single Family Renovation",
  },
  {
    description:
      "Multi-unit build template with heavier envelope and closeout coordination.",
    isDefault: false,
    milestones: [
      productionDefaultMilestone(
        "multiplex-sitework",
        "Sitework and servicing",
        900,
        18,
        "foundation",
        ["Survey", "Civil servicing"],
      ),
      productionDefaultMilestone(
        "multiplex-foundation",
        "Foundation podium",
        1600,
        26,
        "foundation",
        ["Footings", "Foundation walls"],
      ),
      productionDefaultMilestone(
        "multiplex-framing",
        "Multi-plex framing",
        2200,
        30,
        "framing",
        ["Floor framing", "Party walls"],
      ),
      productionDefaultMilestone(
        "multiplex-rough-in",
        "Stacked rough-ins",
        1800,
        28,
        "roughIn",
        ["Electrical stacks", "Mechanical shafts"],
      ),
      productionDefaultMilestone(
        "multiplex-envelope",
        "Envelope and windows",
        1500,
        18,
        "exterior",
        ["Windows", "Cladding"],
      ),
      productionDefaultMilestone(
        "multiplex-finishes",
        "Suite finishes",
        1400,
        20,
        "finishes",
        ["Drywall", "Cabinets"],
      ),
      productionDefaultMilestone(
        "multiplex-closeout",
        "Occupancy closeout",
        600,
        6,
        "closeout",
        ["Life safety", "Occupancy package"],
      ),
    ],
    scenarios: [
      productionDefaultScenario(
        "standard-multiplex",
        "Standard multi-plex",
        true,
        [
          productionDefaultDraw(
            "draw-01",
            "Draw 01",
            51,
            2500,
            "Foundation podium accepted",
          ),
          productionDefaultDraw(
            "draw-02",
            "Draw 02",
            86,
            2500,
            "Framing inspection",
          ),
          productionDefaultDraw(
            "draw-03",
            "Draw 03",
            119,
            2000,
            "Rough-in review",
          ),
          productionDefaultDraw(
            "draw-04",
            "Draw 04",
            143,
            2000,
            "Envelope review",
          ),
          productionDefaultDraw(
            "draw-05",
            "Draw 05",
            167,
            1000,
            "Suite finishes accepted",
          ),
        ],
      ),
    ],
    summary: "7 milestones, 100.00% PoC, 146 days",
    templateKey: "multiplex-build",
    title: "Multi-plex Build",
  },
  {
    description:
      "Luverne 4-plex budget template with exact draw/milestone and line-item breakdown from the 25 Luverne budget.",
    isDefault: false,
    milestones: [
      productionBudgetMilestone(
        "four-plex-draw-01",
        "Draw/Milestone 1 - Permits, demo & foundation",
        1100,
        21,
        "foundation",
        [
          productionBudgetSubmilestone("four-plex-draw-01", "DC/ED", 37, 1),
          productionBudgetSubmilestone("four-plex-draw-01", "PERMITS", 91, 2),
          productionBudgetSubmilestone("four-plex-draw-01", "DRAWINGS", 156, 3),
          productionBudgetSubmilestone("four-plex-draw-01", "DEMO EX", 458, 4),
          productionBudgetSubmilestone(
            "four-plex-draw-01",
            "TEMP FENCE",
            23,
            1,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-01",
            "TREE PROTECTION",
            14,
            1,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-01",
            "FOUNDATION",
            321,
            9,
          ),
        ],
        fourPlexGuidance(
          [
            "Permits and drawings: confirm DC/ED, permits, and construction drawings are uploaded and match the 25 Luverne 4-plex scope.",
            "Site controls: temporary fence and tree protection are installed before exterior demolition or excavation value is counted.",
            "Demolition: demo exterior scope is complete, debris is staged or removed, and any unsafe exposed condition is documented.",
            "Foundation: excavation, forms, reinforcing, concrete placement, anchor points, waterproofing readiness, and survey dimensions align with approved drawings.",
            "Exclusions: do not reimburse staged formwork, unpoured concrete, or permit/drawing fees without documentary evidence.",
          ],
          [
            "Required wide angle: full frontage from street showing fence, tree protection, demo limits, and foundation work area.",
            "Required side angle: left and right property-line views showing excavation/foundation relation to setbacks and adjacent structures.",
            "Required close-up: permits/drawings or permit card, foundation forms/rebar/anchors, and any waterproofing or drainage detail.",
            "Required context: photo tying DC/ED, permits, drawings, demo, fence, tree protection, and foundation areas to the same address.",
          ],
        ),
      ),
      productionBudgetMilestone(
        "four-plex-draw-02",
        "Draw/Milestone 2 - Underground, framing & roof",
        1329,
        28,
        "framing",
        [
          productionBudgetSubmilestone(
            "four-plex-draw-02",
            "UNDERGROUND PIB",
            64,
            4,
          ),
          productionBudgetSubmilestone("four-plex-draw-02", "FRAMING", 458, 7),
          productionBudgetSubmilestone("four-plex-draw-02", "LUMBER", 413, 4),
          productionBudgetSubmilestone("four-plex-draw-02", "CONCRETE", 110, 4),
          productionBudgetSubmilestone(
            "four-plex-draw-02",
            "WATER/SEWER",
            101,
            3,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-02",
            "ROOF FLAT/SHINGLES",
            183,
            6,
          ),
        ],
        fourPlexGuidance(
          [
            "Underground: verify underground PIB, water/sewer, sleeves, trenches, bedding, and backfill are complete before cover-up.",
            "Framing: verify wall, floor, roof, party-wall, opening, and lateral bracing conditions against stamped drawings.",
            "Lumber: count installed framing value only; staged lumber should be photographed but not treated as completed work.",
            "Concrete: confirm any slab, cap, porch, or formed concrete scope is poured, cured enough for inspection, and tied to the approved plan.",
            "Roof: flat roof and shingle areas are dried in with underlayment, flashing, and drainage paths visible.",
          ],
          [
            "Required wide angle: front and rear elevations showing full framed massing and roof planes.",
            "Required side angle: each side elevation showing floor lines, party-wall/shaft alignment, and water/sewer trench locations.",
            "Required close-up: structural connectors, headers, sheathing nailing, roof flashing, underground pipe bedding, and concrete edges.",
            "Required overhead/interior angle: roof or upper-floor view showing roof flat/shingle transition and framing continuity.",
          ],
        ),
      ),
      productionBudgetMilestone(
        "four-plex-draw-03",
        "Draw/Milestone 3 - Service upgrade & envelope",
        1118,
        21,
        "exterior",
        [
          productionBudgetSubmilestone(
            "four-plex-draw-03",
            "400 AMP UPGRADE",
            229,
            4,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-03",
            "UTILITIES CONNECTION",
            46,
            2,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-03",
            "WINDOWS/DOORS",
            321,
            6,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-03",
            "STUCCO/BRICK",
            366,
            6,
          ),
          productionBudgetSubmilestone("four-plex-draw-03", "ALUM", 156, 3),
        ],
        fourPlexGuidance(
          [
            "Electrical service: verify 400 amp upgrade equipment, meter base, panel/service location, grounding, and utility coordination status.",
            "Utility connection: verify completed connections or inspected rough connection points; note any utility-owned work still pending.",
            "Openings: windows and doors are installed, shimmed, fastened, flashed, and protected from water intrusion.",
            "Envelope: stucco/brick and aluminum work are installed in claimed areas with weather barrier, flashing, weeps, and terminations visible.",
            "Unit coverage: inspect representative front, rear, side, and unit-specific envelope conditions so one finished elevation does not mask incomplete areas.",
          ],
          [
            "Required wide angle: all four elevations showing windows/doors and cladding progress.",
            "Required service angle: meter, panel, service mast or conduit route, and utility connection point with address context.",
            "Required close-up: window flashing sill/head/jamb, door threshold, stucco/brick transition, aluminum trim, and penetrations.",
            "Required defect angle: any unflashed opening, missing cladding section, damaged unit, or temporary utility condition.",
          ],
        ),
      ),
      productionBudgetMilestone(
        "four-plex-draw-04",
        "Draw/Milestone 4 - MEP rough-ins",
        1283,
        24,
        "roughIn",
        [
          productionBudgetSubmilestone("four-plex-draw-04", "HVAC", 596, 8),
          productionBudgetSubmilestone("four-plex-draw-04", "PLUMBING", 366, 7),
          productionBudgetSubmilestone(
            "four-plex-draw-04",
            "PLUMBING SUPPLIES",
            0,
            1,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-04",
            "ELECTRICAL",
            321,
            8,
          ),
        ],
        fourPlexGuidance(
          [
            "HVAC: verify duct runs, equipment rough locations, exhaust routes, fire/smoke separations, and shaft penetrations for each unit.",
            "Plumbing: verify supply, DWV, venting, fixture rough locations, test caps/gauges, and floor/wall penetrations before cover-up.",
            "Electrical: verify panel rough-in, homeruns, box layout, smoke/CO locations, exterior circuits, and common-area feeds.",
            "Coordination: document clashes, notched framing, missing firestopping, unsupported pipes/ducts, or rough-in work outside approved locations.",
            "Plumbing supplies: this line is zero budget in the source budget; mark any visible supplies as context only unless moved into an approved revision.",
          ],
          [
            "Required wide angle: representative mechanical/electrical/plumbing rough-in view in every unit and common/service area.",
            "Required close-up: pressure gauge or test cap, panel and box rough layout, duct supports, firestopping, and penetrations.",
            "Required vertical angle: stacked wet wall or shaft view showing alignment across floors/units.",
            "Required exception angle: any failed inspection tag, conflict, unprotected penetration, or missing rough-in area.",
          ],
        ),
      ),
      productionBudgetMilestone(
        "four-plex-draw-05",
        "Draw/Milestone 5 - Insulation, drywall & stairs",
        1099,
        14,
        "drywall",
        [
          productionBudgetSubmilestone(
            "four-plex-draw-05",
            "INSULATION/DRYWALL/TAPING",
            916,
            10,
          ),
          productionBudgetSubmilestone("four-plex-draw-05", "STAIRS", 183, 4),
        ],
        fourPlexGuidance(
          [
            "Inspection prerequisite: rough-in, insulation, and fire separation inspections are complete or documented before drywall/taping reimbursement.",
            "Insulation: verify insulation type, coverage, vapor control, acoustic/fire assemblies, and continuity at exterior walls and demising walls.",
            "Drywall/taping: verify board, taping, corner bead, fire-rated assemblies, ceilings, shafts, and wet-area board match scope.",
            "Stairs: verify stair framing/install, guard/blocking readiness, landings, headroom, and secure temporary protection.",
            "Incomplete areas: identify rooms, units, ceilings, or stair sections not ready for finish work.",
          ],
          [
            "Required wide angle: each unit interior showing drywall/taping progress and stair placement.",
            "Required close-up: insulation/vapor barrier before board where still visible, tape joints, fire-rated board labels, and stair connections.",
            "Required document angle: inspection sticker, report, or deficiency tag tied to the milestone.",
            "Required unit context: one photo per unit entrance or room label to prevent duplicate-room ambiguity.",
          ],
        ),
      ),
      productionBudgetMilestone(
        "four-plex-draw-06",
        "Draw/Milestone 6 - Tile, flooring & trim",
        815,
        18,
        "finishes",
        [
          productionBudgetSubmilestone(
            "four-plex-draw-06",
            "TILES LABOUR",
            137,
            4,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-06",
            "TILES SUPPLY",
            137,
            2,
          ),
          productionBudgetSubmilestone("four-plex-draw-06", "FLOORING", 220, 6),
          productionBudgetSubmilestone(
            "four-plex-draw-06",
            "TRIM CARPENTRY",
            321,
            6,
          ),
        ],
        fourPlexGuidance(
          [
            "Tile labour: verify installed tile in claimed wet areas, cuts, grout, slopes, waterproofing transitions, and incomplete edges.",
            "Tile supply: materials must be delivered to site, matched to installed areas, and protected; staged supply alone should be noted separately.",
            "Flooring: verify installed flooring by unit/room, transitions, stair nosings where applicable, and protected finished surfaces.",
            "Trim carpentry: verify casing, base, doors, shelving/blocking, hardware prep, and continuity through each unit.",
            "Quality exceptions: document cracked tile, missing grout, damaged flooring, incomplete trim, or units skipped.",
          ],
          [
            "Required wide angle: each unit main living area showing flooring and trim coverage.",
            "Required wet-area angle: bathrooms/kitchens showing tile install, corners, slopes, and transitions.",
            "Required close-up: flooring transitions, base/casing joints, tile cuts, grout lines, and protected material labels.",
            "Required comparison angle: at least one completed and one incomplete room if progress differs by unit.",
          ],
        ),
      ),
      productionBudgetMilestone(
        "four-plex-draw-07",
        "Draw/Milestone 7 - Kitchen, appliances, paint & labour",
        1283,
        20,
        "finishes",
        [
          productionBudgetSubmilestone("four-plex-draw-07", "KITCHEN", 366, 6),
          productionBudgetSubmilestone(
            "four-plex-draw-07",
            "APPLIANCES",
            257,
            3,
          ),
          productionBudgetSubmilestone("four-plex-draw-07", "PAINT", 110, 4),
          productionBudgetSubmilestone(
            "four-plex-draw-07",
            "GENERAL LABOUR",
            550,
            7,
          ),
        ],
        fourPlexGuidance(
          [
            "Kitchen: verify cabinets, counters, sink rough/fixture readiness, millwork alignment, and unit-by-unit installation status.",
            "Appliances: verify delivered and installed appliances by unit; staged appliances must be matched to serial/model evidence and protected location.",
            "Paint: verify primer/finish coats, trim touch-ups, ceilings, closets, common areas, and any areas held back for repairs.",
            "General labour: verify reimbursable labour produced completed physical work and is tied to visible milestone progress.",
            "Punch context: document missing doors, panels, fixtures, appliance gaps, paint deficiencies, or labour-only claims with no visible output.",
          ],
          [
            "Required wide angle: each unit kitchen from entry and opposite corner.",
            "Required appliance angle: appliance install/delivery evidence with unit context and model/serial tags where visible.",
            "Required close-up: cabinet fit, counter seams, sink/fixture area, paint finish, and trim touch-ups.",
            "Required punch angle: any incomplete kitchen, missing appliance, paint defect, or labour repair area.",
          ],
        ),
      ),
      productionBudgetMilestone(
        "four-plex-draw-08",
        "Draw/Milestone 8 - Landscaping, misc, insurance & management",
        1973,
        14,
        "closeout",
        [
          productionBudgetSubmilestone(
            "four-plex-draw-08",
            "LANDSCAPING",
            165,
            4,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-08",
            "MISCELLANEOUS",
            367,
            3,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-08",
            "INSURANCE",
            137,
            1,
          ),
          productionBudgetSubmilestone(
            "four-plex-draw-08",
            "MANAGEMENT FEE",
            1304,
            6,
          ),
        ],
        fourPlexGuidance(
          [
            "Landscaping: verify grading, drainage, hardscape/softscape, exterior cleanup, and safe access for all units.",
            "Miscellaneous: require itemized support; tie each miscellaneous cost to visible work, invoice, approved change, or closeout deficiency.",
            "Insurance: verify policy or invoice evidence before reimbursing this soft-cost line.",
            "Management fee: verify fee calculation, approved agreement, and alignment with completed project status before final draw release.",
            "Final readiness: confirm no unresolved site safety, access, occupancy, evidence, or admin exceptions remain before final reimbursement.",
          ],
          [
            "Required wide angle: front, rear, and both side yards showing final grading, landscaping, and safe access.",
            "Required close-up: drainage swales, walkways/steps, exterior deficiencies, and any remaining punch-list items.",
            "Required document angle: insurance invoice/policy, management fee support, and miscellaneous backup in the closeout package.",
            "Required final context: completed exterior plus one representative finished interior per unit for final release readiness.",
          ],
        ),
      ),
    ],
    scenarios: [
      productionDefaultScenario("four-plex-standard", "4-plex", true, [
        productionDefaultDraw(
          "draw-01",
          "Draw/Milestone 1",
          23,
          1100,
          "Permits, demo, temporary controls, tree protection, and foundation verified",
        ),
        productionDefaultDraw(
          "draw-02",
          "Draw/Milestone 2",
          56,
          1329,
          "Underground PIB, framing, lumber, concrete, water/sewer, and roof verified",
        ),
        productionDefaultDraw(
          "draw-03",
          "Draw/Milestone 3",
          82,
          1118,
          "Service upgrade, utility connection, windows/doors, stucco/brick, and aluminum verified",
        ),
        productionDefaultDraw(
          "draw-04",
          "Draw/Milestone 4",
          111,
          1283,
          "HVAC, plumbing, plumbing supplies context, and electrical rough-ins verified",
        ),
        productionDefaultDraw(
          "draw-05",
          "Draw/Milestone 5",
          130,
          1099,
          "Insulation, drywall, taping, and stairs verified",
        ),
        productionDefaultDraw(
          "draw-06",
          "Draw/Milestone 6",
          153,
          815,
          "Tile labour, tile supply, flooring, and trim carpentry verified",
        ),
        productionDefaultDraw(
          "draw-07",
          "Draw/Milestone 7",
          178,
          1283,
          "Kitchen, appliances, paint, and general labour verified",
        ),
        productionDefaultDraw(
          "draw-08",
          "Draw/Milestone 8",
          197,
          1973,
          "Landscaping, miscellaneous, insurance, and management fee closeout verified",
        ),
      ]),
    ],
    summary: "8 milestones, 36 budget line items, 100.00% PoC, 160 field days",
    templateKey: "4-plex",
    title: "4-plex",
  },
];

function productionDefaultScenario(
  scenarioKey: string,
  name: string,
  isActive: boolean,
  draws: ProductionDefaultScenarioDraw[],
): ProductionDefaultScenario {
  return {
    description: `${name} draw timing and reimbursement amount assumptions.`,
    draws: draws.map((draw, order) => ({ ...draw, order })),
    isActive,
    isDefault: true,
    name,
    scenarioKey,
  };
}

function productionDefaultDraw(
  drawKey: string,
  label: string,
  timingDay: number,
  amountBps: number,
  reviewNote: string,
): ProductionDefaultScenarioDraw {
  return { amountBps, drawKey, label, reviewNote, timingDay };
}

function productionDefaultMilestone(
  key: string,
  name: string,
  percentageBps: number,
  durationDays: number,
  archetypeKey: string,
  submilestoneNames: string[],
): ProductionDefaultMilestone {
  const base = Math.floor(percentageBps / submilestoneNames.length);
  const remainder = percentageBps - base * submilestoneNames.length;
  const submilestones = submilestoneNames.map((submilestoneName, index) => ({
    durationDays: Math.max(
      1,
      Math.round(durationDays / submilestoneNames.length),
    ),
    key: `${key}-${slug(submilestoneName)}-${index}`,
    name: submilestoneName,
    percentageBps: base + (index < remainder ? 1 : 0),
  }));

  return {
    archetypeDescription:
      archetypeDescriptionForProductionDefault(archetypeKey),
    archetypeKey,
    dependencyKeys: [],
    durationDays,
    key,
    name,
    percentageBps,
    siteVisitGuidance: productionDefaultGuidance(key, name, submilestoneNames),
    submilestones,
  };
}

function productionBudgetMilestone(
  key: string,
  name: string,
  percentageBps: number,
  durationDays: number,
  archetypeKey: string,
  submilestones: ProductionDefaultMilestone["submilestones"],
  siteVisitGuidance: SiteVisitGuidance,
): ProductionDefaultMilestone {
  return {
    archetypeDescription:
      archetypeDescriptionForProductionDefault(archetypeKey),
    archetypeKey,
    dependencyKeys: [],
    durationDays,
    key,
    name,
    percentageBps,
    siteVisitGuidance,
    submilestones,
  };
}

function productionBudgetSubmilestone(
  milestoneKey: string,
  name: string,
  percentageBps: number,
  durationDays: number,
): ProductionDefaultMilestone["submilestones"][number] {
  return {
    durationDays,
    key: `${milestoneKey}-${slug(name)}`,
    name,
    percentageBps,
  };
}

function fourPlexGuidance(
  whatToVerify: string[],
  cameraAngles: string[],
): SiteVisitGuidance {
  return {
    cameraAngles: guidanceLinesToHtml(cameraAngles),
    whatToVerify: guidanceLinesToHtml(whatToVerify),
  };
}

function productionDefaultGuidance(
  key: string,
  name: string,
  submilestones: string[],
) {
  const normalized = `${key} ${name}`.toLowerCase();

  if (normalized.includes("foundation") || normalized.includes("site-prep")) {
    return {
      cameraAngles: guidanceLinesToHtml([
        "Wide site overview showing excavation limits, access, and completed foundation area.",
        "Close-up of forms, reinforcing, anchors, or embeds before concrete cover is lost.",
        "Drainage, waterproofing, and backfill condition at the most constrained elevation.",
      ]),
      whatToVerify: guidanceLinesToHtml([
        "Permit mobilization and site controls are in place before reimbursable work is counted.",
        "Excavation, forms, reinforcing, and concrete placement match approved plan dimensions.",
        "Waterproofing, drainage, and backfill are complete where required for the draw scope.",
      ]),
    };
  }

  if (normalized.includes("demo")) {
    return {
      cameraAngles: guidanceLinesToHtml([
        "Wide room-by-room overview showing demolition limits and protected areas.",
        "Close-up of capped utilities, shoring, or exposed structural conditions.",
        "Waste staging or haul-off evidence showing removed material left the site.",
      ]),
      whatToVerify: guidanceLinesToHtml([
        "Demolition is limited to the approved scope and retained structure is protected.",
        "Utilities affected by demolition are capped or made safe.",
        "Debris removal is complete enough for the next milestone to start.",
      ]),
    };
  }

  if (normalized.includes("exterior") || normalized.includes("envelope")) {
    return {
      cameraAngles: guidanceLinesToHtml([
        "Full elevation showing windows, doors, weather barrier, and cladding scope.",
        "Close-up of flashing transitions at openings and penetrations.",
        "Corner or roofline detail tying envelope work back to the approved plan.",
      ]),
      whatToVerify: guidanceLinesToHtml([
        "Windows and exterior doors are installed, flashed, and weather-tight.",
        "Weather barrier is continuous at seams, corners, and penetrations.",
        "Exterior cladding or repairs are complete for the draw scope being requested.",
      ]),
    };
  }

  if (normalized.includes("drywall") || normalized.includes("inspection")) {
    return {
      cameraAngles: guidanceLinesToHtml([
        "Wide interior overview showing insulation or board installation progress.",
        "Close-up of inspection stickers, signoff record, or deficiency tag.",
        "Representative ceiling and wall planes before finishes conceal the work.",
      ]),
      whatToVerify: guidanceLinesToHtml([
        "Required rough-in or insulation inspections are complete before close-in value is counted.",
        "Insulation, vapor control, drywall hang, or board scope is complete in the claimed areas.",
        "No unresolved inspection deficiencies block reimbursement for this milestone.",
      ]),
    };
  }

  if (normalized.includes("finish") || normalized.includes("rebuild")) {
    return {
      cameraAngles: guidanceLinesToHtml([
        "Wide view of completed rooms showing flooring, cabinetry, and trim continuity.",
        "Close-up of fixtures, cabinet installation, flooring transitions, or finish quality.",
        "Context photo tying finish work back to the milestone area and unit or room number.",
      ]),
      whatToVerify: guidanceLinesToHtml([
        "Finish materials are installed, not merely delivered or staged.",
        "Fixtures, millwork, flooring, and trim are complete enough to support reimbursement.",
        "Visible damage, missing components, or incomplete punch work is documented for review.",
      ]),
    };
  }

  if (normalized.includes("closeout") || normalized.includes("occupancy")) {
    return {
      cameraAngles: guidanceLinesToHtml([
        "Wide final condition photo of the completed work area or unit.",
        "Close-up of final inspection, occupancy, or closeout document evidence.",
        "Photo of remaining punch-list items, if any, with location context.",
      ]),
      whatToVerify: guidanceLinesToHtml([
        "Final inspection, occupancy, or lender-required closeout document is present.",
        "Punch-list work is complete or exceptions are clearly identified for admin review.",
        "The site is safe, accessible, and ready for final reimbursement review.",
      ]),
    };
  }

  return defaultSiteVisitGuidance(key, name, submilestones);
}

function archetypeDescriptionForProductionDefault(archetypeKey: string) {
  const descriptions: Record<string, string> = {
    change: "Selective demolition and change-scope work.",
    closeout: "Inspection, punch-list, occupancy, and final package work.",
    drywall: "Inspection close-in, insulation, and drywall work.",
    exterior:
      "Envelope, windows, doors, weather barrier, and exterior finishes.",
    finishes: "Interior finish, fixture, millwork, and final surface work.",
    foundation: "Permits, sitework, excavation, concrete, and foundation work.",
    framing: "Structural framing, sheathing, hardware, and dry-in work.",
    roughIn: "Mechanical, electrical, plumbing, and rough-in coordination.",
  };

  return (
    descriptions[archetypeKey] ?? `${titleCase(archetypeKey)} milestone work.`
  );
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "item"
  );
}

function productionTemplateSortOrder(templateKey: string) {
  const index = PRODUCTION_DEFAULT_TEMPLATES.findIndex(
    (template) => template.templateKey === templateKey,
  );
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function normalizeProductionTemplateKey(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "template"
  );
}

async function authorizeProductionSettingsMutation(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  workosOrganizationId: string,
) {
  const auth = await authorizeBrokerage(ctx, workosOrganizationId);
  requireAnyRole(auth.roles, APPROVER_ROLES);
  return auth;
}

async function getProductionSettingsTemplate(
  ctx: QueryCtx | MutationCtx,
  brokerageId: Id<"brokerages">,
  templateKey: string,
) {
  return await ctx.db
    .query("proposalTemplates")
    .withIndex("by_brokerage_template", (q) =>
      q.eq("brokerageId", brokerageId).eq("templateKey", templateKey),
    )
    .unique();
}

async function getProductionSettingsScenario(
  ctx: QueryCtx | MutationCtx,
  templateId: Id<"proposalTemplates">,
  scenarioKey: string,
) {
  return await ctx.db
    .query("drawScheduleScenarios")
    .withIndex("by_template_scenario", (q) =>
      q.eq("templateId", templateId).eq("scenarioKey", scenarioKey),
    )
    .unique();
}

async function upsertProductionSettingsTemplate(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    description: string;
    isDefault: boolean;
    now: number;
    organizationId: string;
    summary: string;
    templateKey: string;
    title: string;
  },
) {
  const existing = await getProductionSettingsTemplate(
    ctx,
    input.brokerageId,
    input.templateKey,
  );
  const payload = {
    isDefault: input.isDefault,
    status: "active" as const,
    summary: input.summary || input.description,
    title: input.title.trim() || "Production template",
    updatedAt: input.now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }
  return await ctx.db.insert("proposalTemplates", {
    ...payload,
    brokerageId: input.brokerageId,
    createdAt: input.now,
    organizationId: input.organizationId,
    templateKey: input.templateKey,
  });
}

async function replaceProductionSettingsMilestones(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    milestones: Array<{
      dependencyKeys: string[];
      durationDays: number;
      included: boolean;
      milestoneKey: string;
      name: string;
      order: number;
      percentageBps: number;
      siteVisitGuidance?: ProductionSettingsSiteVisitGuidanceInput;
      submilestones: Array<{
        durationDays: number;
        name: string;
        order: number;
        percentageBps: number;
        submilestoneKey: string;
      }>;
      type: string;
    }>;
    now: number;
    organizationId: string;
    templateId: Id<"proposalTemplates">;
  },
) {
  const existing = await ctx.db
    .query("proposalTemplateMilestones")
    .withIndex("by_template", (q) => q.eq("templateId", input.templateId))
    .collect();
  for (const milestone of existing) {
    await deleteTemplateSubmilestones(ctx, milestone._id);
    await ctx.db.delete(milestone._id);
  }
  const includedRows = input.milestones
    .filter((row) => row.included)
    .slice()
    .sort(
      (a, b) =>
        a.order - b.order || a.milestoneKey.localeCompare(b.milestoneKey),
    );
  for (const [index, row] of includedRows.entries()) {
    const milestoneId = await ctx.db.insert("proposalTemplateMilestones", {
      archetypeKey: row.type || row.milestoneKey,
      brokerageId: input.brokerageId,
      createdAt: input.now,
      dependencyKeys: row.dependencyKeys.filter((dependencyKey) =>
        includedRows.some(
          (candidate) => candidate.milestoneKey === dependencyKey,
        ),
      ),
      durationDays: Math.max(1, Math.round(row.durationDays)),
      key: row.milestoneKey,
      name: row.name.trim(),
      order: index + 1,
      organizationId: input.organizationId,
      percentageBps: Math.max(0, Math.round(row.percentageBps)),
      siteVisitGuidance: normalizeProductionSettingsGuidance(row),
      templateId: input.templateId,
      updatedAt: input.now,
    });
    for (const [subIndex, submilestone] of row.submilestones.entries()) {
      await ctx.db.insert("proposalTemplateSubmilestones", {
        brokerageId: input.brokerageId,
        createdAt: input.now,
        durationDays: Math.max(1, Math.round(submilestone.durationDays)),
        key: submilestone.submilestoneKey,
        milestoneKey: row.milestoneKey,
        name: submilestone.name.trim(),
        order: subIndex + 1,
        organizationId: input.organizationId,
        percentageBps: Math.max(0, Math.round(submilestone.percentageBps)),
        templateMilestoneId: milestoneId,
        updatedAt: input.now,
      });
    }
  }
}

async function replaceProductionSettingsScenarios(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    now: number;
    organizationId: string;
    scenarios: Array<{
      description: string;
      draws: ProductionDefaultScenarioDraw[];
      isActive: boolean;
      isDefault: boolean;
      name: string;
      scenarioKey: string;
      sortOrder: number;
    }>;
    templateId: Id<"proposalTemplates">;
  },
) {
  const desiredKeys = new Set(input.scenarios.map((row) => row.scenarioKey));
  const existing = await ctx.db
    .query("drawScheduleScenarios")
    .withIndex("by_template", (q) => q.eq("templateId", input.templateId))
    .collect();
  for (const stale of existing.filter(
    (row) => !desiredKeys.has(row.scenarioKey),
  )) {
    await deleteProductionScenarioDraws(
      ctx,
      input.templateId,
      stale.scenarioKey,
    );
    await ctx.db.patch(stale._id, {
      status: "inactive",
      updatedAt: input.now,
    });
  }
  for (const [index, scenario] of input.scenarios.entries()) {
    await ensureDrawScheduleScenario(ctx, {
      ...input,
      description: scenario.description,
      isActive: scenario.isActive,
      isDefault: scenario.isDefault,
      name: scenario.name,
      scenarioKey: scenario.scenarioKey,
      sortOrder: scenario.sortOrder ?? index,
    });
    await replaceProductionScenarioDraws(ctx, {
      ...input,
      draws: scenario.draws,
      scenarioKey: scenario.scenarioKey,
    });
  }
}

async function replaceProductionScenarioDraws(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    draws: ProductionDefaultScenarioDraw[];
    now: number;
    organizationId: string;
    scenarioKey: string;
    templateId: Id<"proposalTemplates">;
  },
) {
  await deleteProductionScenarioDraws(ctx, input.templateId, input.scenarioKey);
  for (const [index, draw] of input.draws.entries()) {
    await ctx.db.insert("drawScheduleScenarioRows", {
      amountBps: Math.max(0, Math.round(draw.amountBps)),
      brokerageId: input.brokerageId,
      createdAt: input.now,
      drawKey: draw.drawKey,
      label: draw.label.trim() || `Draw ${String(index + 1).padStart(2, "0")}`,
      order: draw.order ?? index,
      organizationId: input.organizationId,
      reviewNote: draw.reviewNote,
      scenarioKey: input.scenarioKey,
      templateId: input.templateId,
      timingDay: Math.max(0, Math.round(draw.timingDay)),
      updatedAt: input.now,
    });
  }
}

async function deleteProductionScenarioDraws(
  ctx: MutationCtx,
  templateId: Id<"proposalTemplates">,
  scenarioKey: string,
) {
  const rows = await listProductionScenarioDraws(ctx, templateId, scenarioKey);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

function normalizeProductionSettingsGuidance(row: {
  milestoneKey: string;
  name: string;
  siteVisitGuidance?: ProductionSettingsSiteVisitGuidanceInput;
  submilestones: Array<{ name: string }>;
}) {
  return normalizeSiteVisitGuidance(
    row.siteVisitGuidance,
    defaultSiteVisitGuidance(
      row.milestoneKey,
      row.name,
      row.submilestones.map((submilestone) => submilestone.name),
    ),
  );
}

function validateProductionTemplateRows(
  rows: Array<{
    durationDays: number;
    included: boolean;
    milestoneKey: string;
    name: string;
    order: number;
    percentageBps: number;
    siteVisitGuidance?: ProductionSettingsSiteVisitGuidanceInput;
    submilestones: Array<{ name: string }>;
  }>,
) {
  const included = rows.filter((row) => row.included);
  const total = included.reduce((sum, row) => sum + row.percentageBps, 0);
  if (total !== TOTAL_BPS) {
    throw new Error(
      `Included PoC total must equal 100.00%; received ${(total / 100).toFixed(2)}%.`,
    );
  }
  for (const row of included) {
    if (!row.name.trim()) {
      throw new Error("Included milestones require names.");
    }
    if (row.durationDays <= 0) {
      throw new Error("Included milestones require positive durations.");
    }
    if (row.submilestones.some((submilestone) => !submilestone.name.trim())) {
      throw new Error("Sub-milestones require names.");
    }
    const guidance = normalizeProductionSettingsGuidance(row);
    if (guidanceHtmlExceedsMaxLength(guidance)) {
      throw new Error(
        `Field guidance must be ${SITE_VISIT_GUIDANCE_HTML_MAX_LENGTH} characters or less per section.`,
      );
    }
  }
  validateProductionMilestoneHandoffGaps(rows);
}

function validateProductionScenarios(
  rows: Array<{
    draws: Array<{ amountBps: number; label: string; timingDay: number }>;
    isActive: boolean;
    name: string;
  }>,
  milestones: Array<{
    durationDays: number;
    included: boolean;
    milestoneKey: string;
    name: string;
    order: number;
  }>,
) {
  const names = new Set<string>();
  for (const row of rows) {
    const name = row.name.trim().toLowerCase();
    if (!name) {
      throw new Error("Scenario name is required.");
    }
    if (names.has(name)) {
      throw new Error("Scenario names must be unique within a template.");
    }
    names.add(name);
    validateProductionScenarioDrawRows(row.draws, milestones);
  }
  if (rows.length > 0 && rows.filter((row) => row.isActive).length !== 1) {
    throw new Error("Exactly one active scenario is required.");
  }
}

function validateProductionScenarioDrawRows(
  rows: Array<{ amountBps: number; label: string; timingDay: number }>,
  milestones: Array<{
    durationDays: number;
    included: boolean;
    milestoneKey: string;
    name: string;
    order: number;
  }>,
) {
  if (rows.length === 0) {
    throw new Error("Scenario requires at least one draw.");
  }
  const total = rows.reduce((sum, row) => sum + row.amountBps, 0);
  if (total !== TOTAL_BPS) {
    throw new Error(
      `Draw total must equal 100.00%; received ${(total / 100).toFixed(2)}%.`,
    );
  }
  for (const row of rows) {
    if (!row.label.trim()) {
      throw new Error("Draw labels are required.");
    }
    if (row.timingDay < 0) {
      throw new Error("Draw timing day must be non-negative.");
    }
    if (row.amountBps <= 0) {
      throw new Error("Draw percentage must be positive.");
    }
  }
  const windows = buildProductionMilestoneDrawWindows(milestones);
  if (windows.length === 0) {
    throw new Error(
      "Draw timing requires at least one included milestone to create a reimbursement window.",
    );
  }
  for (const row of rows) {
    const inWindow = windows.some(
      (window) =>
        row.timingDay > window.afterMilestoneEndDay &&
        row.timingDay < window.beforeMilestoneStartDay,
    );
    if (!inWindow) {
      throw new Error(formatProductionDrawTimingWindowError(row, windows));
    }
  }
}

type ProductionMilestoneDrawWindow = {
  afterMilestoneEndDay: number;
  afterMilestoneKey: string;
  afterMilestoneName: string;
  beforeMilestoneKey: string;
  beforeMilestoneName?: string;
  beforeMilestoneStartDay: number;
};

function formatProductionDrawTimingWindowError(
  draw: { label: string; timingDay: number },
  windows: ProductionMilestoneDrawWindow[],
) {
  const nearest = findNearestProductionDrawTimingWindow(
    draw.timingDay,
    windows,
  );
  const label = draw.label.trim() || "Unnamed draw";

  if (!nearest) {
    return `${label}, day ${draw.timingDay}: no valid handoff window exists. Include at least one milestone before saving draw timing.`;
  }

  const { firstValidDay, lastValidDay, nearestValidDay, window } = nearest;
  const validWindow =
    firstValidDay === lastValidDay
      ? `day ${firstValidDay}`
      : `days ${firstValidDay}-${lastValidDay}`;
  const beforeMilestoneText = window.beforeMilestoneName
    ? ` and ${window.beforeMilestoneName} (starts day ${window.beforeMilestoneStartDay})`
    : "";
  const windowLabel = window.beforeMilestoneName
    ? "Valid window"
    : "Valid final draw window";

  return `${label}, day ${draw.timingDay}: conflicts with ${window.afterMilestoneName} (ends day ${window.afterMilestoneEndDay})${beforeMilestoneText}. ${windowLabel}: ${validWindow}. Nearest valid day: ${nearestValidDay}.`;
}

function findNearestProductionDrawTimingWindow(
  timingDay: number,
  windows: ProductionMilestoneDrawWindow[],
) {
  let nearest: {
    distance: number;
    firstValidDay: number;
    lastValidDay: number;
    nearestValidDay: number;
    window: ProductionMilestoneDrawWindow;
  } | null = null;

  for (const window of windows) {
    const firstValidDay = window.afterMilestoneEndDay + 1;
    const lastValidDay = window.beforeMilestoneStartDay - 1;
    if (firstValidDay > lastValidDay) {
      continue;
    }
    const nearestValidDay = Math.min(
      Math.max(timingDay, firstValidDay),
      lastValidDay,
    );
    const distance = Math.abs(timingDay - nearestValidDay);

    if (!nearest || distance < nearest.distance) {
      nearest = {
        distance,
        firstValidDay,
        lastValidDay,
        nearestValidDay,
        window,
      };
    }
  }

  return nearest;
}

function validateProductionMilestoneHandoffGaps(
  rows: Array<{
    durationDays: number;
    included: boolean;
    milestoneKey: string;
    name: string;
    order: number;
  }>,
) {
  const included = sortedProductionIncludedMilestones(rows);
  for (let index = 0; index < included.length - 1; index += 1) {
    const gap =
      productionMilestoneStartDay(included, index + 1) -
      productionMilestoneEndDay(included, index);
    if (gap > PRODUCTION_SETTINGS_HANDOFF_GAP_DAYS) {
      throw new Error(
        `Milestone handoff gap cannot exceed ${PRODUCTION_SETTINGS_HANDOFF_GAP_DAYS} days.`,
      );
    }
  }
}

function buildProductionMilestoneDrawWindows(
  rows: Array<{
    durationDays: number;
    included: boolean;
    milestoneKey: string;
    name: string;
    order: number;
  }>,
): ProductionMilestoneDrawWindow[] {
  const included = sortedProductionIncludedMilestones(rows);
  const windows: ProductionMilestoneDrawWindow[] = [];
  for (let index = 0; index < included.length - 1; index += 1) {
    const current = included[index];
    const next = included[index + 1];
    if (!(current && next)) {
      continue;
    }
    windows.push({
      afterMilestoneEndDay: productionMilestoneEndDay(included, index),
      afterMilestoneKey: current.milestoneKey,
      afterMilestoneName: current.name,
      beforeMilestoneKey: next.milestoneKey,
      beforeMilestoneName: next.name,
      beforeMilestoneStartDay: productionMilestoneStartDay(included, index + 1),
    });
  }
  const final = included.at(-1);
  if (final) {
    const finalIndex = included.length - 1;
    const finalEndDay = productionMilestoneEndDay(included, finalIndex);
    windows.push({
      afterMilestoneEndDay: finalEndDay,
      afterMilestoneKey: final.milestoneKey,
      afterMilestoneName: final.name,
      beforeMilestoneKey: "final-closeout",
      beforeMilestoneStartDay:
        finalEndDay + PRODUCTION_SETTINGS_HANDOFF_GAP_DAYS,
    });
  }
  return windows;
}

function sortedProductionIncludedMilestones(
  rows: Array<{
    durationDays: number;
    included: boolean;
    milestoneKey: string;
    name: string;
    order: number;
  }>,
) {
  return rows
    .filter((row) => row.included)
    .slice()
    .sort(
      (a, b) =>
        a.order - b.order || a.milestoneKey.localeCompare(b.milestoneKey),
    );
}

function productionMilestoneStartDay(
  rows: Array<{ durationDays: number }>,
  index: number,
) {
  return rows
    .slice(0, index)
    .reduce(
      (day, row) =>
        day + row.durationDays + PRODUCTION_SETTINGS_HANDOFF_GAP_DAYS,
      0,
    );
}

function productionMilestoneEndDay(
  rows: Array<{ durationDays: number }>,
  index: number,
) {
  return (
    productionMilestoneStartDay(rows, index) + (rows[index]?.durationDays ?? 0)
  );
}

function assertHardCodedProductionDefaultTemplatesConform() {
  for (const template of PRODUCTION_DEFAULT_TEMPLATES) {
    const milestones = template.milestones.map((milestone, order) => ({
      durationDays: milestone.durationDays,
      included: true,
      milestoneKey: milestone.key,
      name: milestone.name,
      order,
      percentageBps: milestone.percentageBps,
      siteVisitGuidance: milestone.siteVisitGuidance,
      submilestones: milestone.submilestones.map((submilestone) => ({
        name: submilestone.name,
      })),
    }));
    validateProductionTemplateRows(milestones);
    validateProductionScenarios(
      template.scenarios.map((scenario) => ({
        draws: scenario.draws,
        isActive: scenario.isActive,
        name: scenario.name,
      })),
      milestones,
    );
  }
}

assertHardCodedProductionDefaultTemplatesConform();

function requiredProductionDefaultTemplate(templateKey: string) {
  const seed = PRODUCTION_DEFAULT_TEMPLATES.find(
    (template) => template.templateKey === templateKey,
  );
  if (!seed) {
    throw new Error(`Unknown production template: ${templateKey}`);
  }
  return seed;
}

async function ensureProposalTemplate(
  ctx: MutationCtx,
  input: { brokerageId: Id<"brokerages">; now: number; organizationId: string },
) {
  const existing = await ctx.db
    .query("proposalTemplates")
    .withIndex("by_brokerage_template", (q) =>
      q
        .eq("brokerageId", input.brokerageId)
        .eq("templateKey", "single-family-full-build"),
    )
    .unique();
  if (existing) {
    return existing._id;
  }
  return await ctx.db.insert("proposalTemplates", {
    brokerageId: input.brokerageId,
    createdAt: input.now,
    isDefault: true,
    organizationId: input.organizationId,
    status: "active",
    summary: "Production foundation seed template",
    templateKey: "single-family-full-build",
    title: "Single Family Full Build",
    updatedAt: input.now,
  });
}

async function seedProductionDefaultTemplates(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    now: number;
    organizationId: string;
  },
) {
  const result = {
    draws: 0,
    milestones: 0,
    scenarios: 0,
    submilestones: 0,
    templates: 0,
  };

  for (const template of PRODUCTION_DEFAULT_TEMPLATES) {
    const templateId = await ensureProductionDefaultTemplate(ctx, {
      ...input,
      template,
    });
    result.templates += 1;

    for (const milestone of template.milestones) {
      await ensureMilestoneArchetype(ctx, {
        ...input,
        description: milestone.archetypeDescription,
        key: milestone.archetypeKey,
        name: titleCase(milestone.archetypeKey),
        sortOrder: result.milestones + 1,
      });
    }

    await replaceProductionDefaultMilestones(ctx, {
      ...input,
      template,
      templateId,
    });
    result.milestones += template.milestones.length;
    result.submilestones += template.milestones.reduce(
      (sum, milestone) => sum + milestone.submilestones.length,
      0,
    );

    await replaceProductionDefaultScenarios(ctx, {
      ...input,
      scenarios: template.scenarios,
      templateId,
    });
    result.scenarios += template.scenarios.length;
    result.draws += template.scenarios.reduce(
      (sum, scenario) => sum + scenario.draws.length,
      0,
    );
  }

  return result;
}

async function ensureProductionDefaultTemplate(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    now: number;
    organizationId: string;
    template: ProductionDefaultTemplate;
  },
) {
  const existing = await ctx.db
    .query("proposalTemplates")
    .withIndex("by_brokerage_template", (q) =>
      q
        .eq("brokerageId", input.brokerageId)
        .eq("templateKey", input.template.templateKey),
    )
    .unique();
  const payload = {
    isDefault: input.template.isDefault,
    status: "active" as const,
    summary: input.template.summary,
    title: input.template.title,
    updatedAt: input.now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }
  return await ctx.db.insert("proposalTemplates", {
    ...payload,
    brokerageId: input.brokerageId,
    createdAt: input.now,
    organizationId: input.organizationId,
    templateKey: input.template.templateKey,
  });
}

async function replaceProductionDefaultMilestones(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    now: number;
    organizationId: string;
    template: ProductionDefaultTemplate;
    templateId: Id<"proposalTemplates">;
  },
) {
  const desiredKeys = new Set(
    input.template.milestones.map((milestone) => milestone.key),
  );
  const existing = await ctx.db
    .query("proposalTemplateMilestones")
    .withIndex("by_template", (q) => q.eq("templateId", input.templateId))
    .collect();

  for (const staleMilestone of existing.filter(
    (milestone) => !desiredKeys.has(milestone.key),
  )) {
    await deleteTemplateSubmilestones(ctx, staleMilestone._id);
    await ctx.db.delete(staleMilestone._id);
  }

  for (const [index, milestone] of input.template.milestones.entries()) {
    const templateMilestoneId = await ensureTemplateMilestone(ctx, {
      ...input,
      archetypeKey: milestone.archetypeKey,
      dependencyKeys: milestone.dependencyKeys,
      durationDays: milestone.durationDays,
      key: milestone.key,
      name: milestone.name,
      order: index + 1,
      percentageBps: milestone.percentageBps,
      siteVisitGuidance: milestone.siteVisitGuidance,
    });
    await replaceProductionDefaultSubmilestones(ctx, {
      ...input,
      milestone,
      templateMilestoneId,
    });
  }
}

async function replaceProductionDefaultSubmilestones(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    milestone: ProductionDefaultMilestone;
    now: number;
    organizationId: string;
    templateMilestoneId: Id<"proposalTemplateMilestones">;
  },
) {
  const desiredKeys = new Set(
    input.milestone.submilestones.map((submilestone) => submilestone.key),
  );
  const existing = await ctx.db
    .query("proposalTemplateSubmilestones")
    .withIndex("by_template_milestone", (q) =>
      q.eq("templateMilestoneId", input.templateMilestoneId),
    )
    .collect();
  for (const staleSubmilestone of existing.filter(
    (submilestone) => !desiredKeys.has(submilestone.key),
  )) {
    await ctx.db.delete(staleSubmilestone._id);
  }

  for (const [index, submilestone] of input.milestone.submilestones.entries()) {
    await ensureTemplateSubmilestone(ctx, {
      ...input,
      durationDays: submilestone.durationDays,
      key: submilestone.key,
      milestoneKey: input.milestone.key,
      name: submilestone.name,
      order: index + 1,
      percentageBps: submilestone.percentageBps,
    });
  }
}

async function deleteTemplateSubmilestones(
  ctx: MutationCtx,
  templateMilestoneId: Id<"proposalTemplateMilestones">,
) {
  const submilestones = await ctx.db
    .query("proposalTemplateSubmilestones")
    .withIndex("by_template_milestone", (q) =>
      q.eq("templateMilestoneId", templateMilestoneId),
    )
    .collect();
  for (const submilestone of submilestones) {
    await ctx.db.delete(submilestone._id);
  }
}

async function replaceProductionDefaultScenarios(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    now: number;
    organizationId: string;
    scenarios: ProductionDefaultScenario[];
    templateId: Id<"proposalTemplates">;
  },
) {
  const desiredKeys = new Set(
    input.scenarios.map((scenario) => scenario.scenarioKey),
  );
  const existing = await ctx.db
    .query("drawScheduleScenarios")
    .withIndex("by_template", (q) => q.eq("templateId", input.templateId))
    .collect();
  for (const staleScenario of existing.filter(
    (scenario) => !desiredKeys.has(scenario.scenarioKey),
  )) {
    await deleteProductionScenarioDraws(
      ctx,
      input.templateId,
      staleScenario.scenarioKey,
    );
    await ctx.db.patch(staleScenario._id, {
      status: "inactive",
      updatedAt: input.now,
    });
  }

  for (const [index, scenario] of input.scenarios.entries()) {
    await ensureDrawScheduleScenario(ctx, {
      ...input,
      description: scenario.description,
      isActive: scenario.isActive,
      isDefault: scenario.isDefault,
      name: scenario.name,
      scenarioKey: scenario.scenarioKey,
      sortOrder: index,
    });
    await replaceProductionScenarioDraws(ctx, {
      ...input,
      draws: scenario.draws,
      scenarioKey: scenario.scenarioKey,
    });
  }
}

async function ensureProductionSettingsRows(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    now: number;
    organizationId: string;
    templateId: Id<"proposalTemplates">;
  },
) {
  for (const archetype of [
    {
      description:
        "Site prep, excavation, footings, forms, and foundation pour.",
      key: "foundation",
      name: "Foundation",
      sortOrder: 1,
    },
    {
      description: "Framing, roof dry-in, windows, and exterior enclosure.",
      key: "shell",
      name: "Shell and Dry-In",
      sortOrder: 2,
    },
    {
      description: "MEP rough-ins, insulation, drywall, finishes, and punch.",
      key: "interior-finish",
      name: "Interior Finish",
      sortOrder: 3,
    },
  ]) {
    await ensureMilestoneArchetype(ctx, { ...input, ...archetype });
  }

  const foundationMilestoneId = await ensureTemplateMilestone(ctx, {
    ...input,
    archetypeKey: "foundation",
    dependencyKeys: [],
    durationDays: 30,
    key: "foundation",
    name: "Foundation",
    order: 1,
    percentageBps: 2500,
  });
  await ensureTemplateSubmilestone(ctx, {
    ...input,
    durationDays: 12,
    key: "forms-and-pour",
    milestoneKey: "foundation",
    name: "Forms and pour",
    order: 1,
    percentageBps: 1200,
    templateMilestoneId: foundationMilestoneId,
  });
  await ensureTemplateSubmilestone(ctx, {
    ...input,
    durationDays: 8,
    key: "waterproofing",
    milestoneKey: "foundation",
    name: "Waterproofing and backfill",
    order: 2,
    percentageBps: 1300,
    templateMilestoneId: foundationMilestoneId,
  });

  await ensureTemplateMilestone(ctx, {
    ...input,
    archetypeKey: "shell",
    dependencyKeys: ["foundation"],
    durationDays: 45,
    key: "shell-dry-in",
    name: "Shell and Dry-In",
    order: 2,
    percentageBps: 3500,
  });
  await ensureTemplateMilestone(ctx, {
    ...input,
    archetypeKey: "interior-finish",
    dependencyKeys: ["shell-dry-in"],
    durationDays: 60,
    key: "interior-finish",
    name: "Interior Finish",
    order: 3,
    percentageBps: 4000,
  });

  for (const scenario of [
    {
      description:
        "Cheapest feasible draw timing and reimbursement amount assumptions.",
      isActive: true,
      isDefault: true,
      name: "Cheapest Feasible",
      scenarioKey: "cheapest-feasible",
      sortOrder: 0,
    },
    {
      description: "Fastest draw timing and reimbursement amount assumptions.",
      isActive: false,
      isDefault: false,
      name: "Fastest",
      scenarioKey: "fastest",
      sortOrder: 1,
    },
    {
      description:
        "Capital-constrained draw timing and reimbursement amount assumptions.",
      isActive: false,
      isDefault: false,
      name: "Capital-Constrained",
      scenarioKey: "capital-constrained",
      sortOrder: 2,
    },
  ]) {
    await ensureDrawScheduleScenario(ctx, { ...input, ...scenario });
  }
}

async function ensureMilestoneArchetype(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    description: string;
    key: string;
    name: string;
    now: number;
    organizationId: string;
    sortOrder: number;
  },
) {
  const existing = await ctx.db
    .query("milestoneArchetypes")
    .withIndex("by_brokerage_key", (q) =>
      q.eq("brokerageId", input.brokerageId).eq("key", input.key),
    )
    .unique();
  const payload = {
    description: input.description,
    name: input.name,
    sortOrder: input.sortOrder,
    status: "active" as const,
    updatedAt: input.now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }
  return await ctx.db.insert("milestoneArchetypes", {
    ...payload,
    brokerageId: input.brokerageId,
    createdAt: input.now,
    key: input.key,
    organizationId: input.organizationId,
  });
}

async function ensureTemplateMilestone(
  ctx: MutationCtx,
  input: {
    archetypeKey: string;
    brokerageId: Id<"brokerages">;
    dependencyKeys: string[];
    durationDays: number;
    key: string;
    name: string;
    now: number;
    order: number;
    organizationId: string;
    percentageBps: number;
    siteVisitGuidance?: SiteVisitGuidance;
    templateId: Id<"proposalTemplates">;
  },
) {
  const existing = (
    await ctx.db
      .query("proposalTemplateMilestones")
      .withIndex("by_template", (q) => q.eq("templateId", input.templateId))
      .collect()
  ).find((row) => row.key === input.key);
  const payload = {
    archetypeKey: input.archetypeKey,
    dependencyKeys: input.dependencyKeys,
    durationDays: input.durationDays,
    name: input.name,
    order: input.order,
    percentageBps: input.percentageBps,
    ...(input.siteVisitGuidance
      ? { siteVisitGuidance: input.siteVisitGuidance }
      : {}),
    updatedAt: input.now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }
  return await ctx.db.insert("proposalTemplateMilestones", {
    ...payload,
    brokerageId: input.brokerageId,
    createdAt: input.now,
    key: input.key,
    organizationId: input.organizationId,
    templateId: input.templateId,
  });
}

async function ensureTemplateSubmilestone(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    durationDays: number;
    key: string;
    milestoneKey: string;
    name: string;
    now: number;
    order: number;
    organizationId: string;
    percentageBps: number;
    templateMilestoneId: Id<"proposalTemplateMilestones">;
  },
) {
  const existing = (
    await ctx.db
      .query("proposalTemplateSubmilestones")
      .withIndex("by_template_milestone", (q) =>
        q.eq("templateMilestoneId", input.templateMilestoneId),
      )
      .collect()
  ).find((row) => row.key === input.key);
  const payload = {
    durationDays: input.durationDays,
    name: input.name,
    order: input.order,
    percentageBps: input.percentageBps,
    updatedAt: input.now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }
  return await ctx.db.insert("proposalTemplateSubmilestones", {
    ...payload,
    brokerageId: input.brokerageId,
    createdAt: input.now,
    key: input.key,
    milestoneKey: input.milestoneKey,
    organizationId: input.organizationId,
    templateMilestoneId: input.templateMilestoneId,
  });
}

async function ensureDrawScheduleScenario(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    description: string;
    isActive: boolean;
    isDefault: boolean;
    name: string;
    now: number;
    organizationId: string;
    scenarioKey: string;
    sortOrder: number;
    templateId: Id<"proposalTemplates">;
  },
) {
  const existing = await ctx.db
    .query("drawScheduleScenarios")
    .withIndex("by_template_scenario", (q) =>
      q.eq("templateId", input.templateId).eq("scenarioKey", input.scenarioKey),
    )
    .unique();
  const payload = {
    description: input.description,
    isActive: input.isActive,
    isDefault: input.isDefault,
    name: input.name,
    sortOrder: input.sortOrder,
    status: "active" as const,
    updatedAt: input.now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }
  return await ctx.db.insert("drawScheduleScenarios", {
    ...payload,
    brokerageId: input.brokerageId,
    createdAt: input.now,
    organizationId: input.organizationId,
    scenarioKey: input.scenarioKey,
    templateId: input.templateId,
  });
}

async function ensureWorkflowRule(
  ctx: MutationCtx,
  input: { brokerageId: Id<"brokerages">; now: number; organizationId: string },
) {
  const existing = await ctx.db
    .query("workflowRules")
    .withIndex("by_brokerage_rule", (q) =>
      q
        .eq("brokerageId", input.brokerageId)
        .eq("ruleKey", DEFAULT_WORKFLOW_RULE_KEY),
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      status: "active",
      updatedAt: input.now,
    });
    return existing._id;
  }
  return await ctx.db.insert("workflowRules", {
    allowPermitWaiverByRoles: ["admin", "principle-broker"],
    brokerageId: input.brokerageId,
    createdAt: input.now,
    organizationId: input.organizationId,
    proposalStates: [...PROPOSAL_COLUMNS],
    requirePermitForApproval: true,
    ruleKey: DEFAULT_WORKFLOW_RULE_KEY,
    settings: {
      reimbursementOnly: true,
      interestStartsOn: "funds_released",
    },
    status: "active",
    updatedAt: input.now,
    version: 1,
  });
}

type SeedScenario =
  | "draft"
  | "submitted"
  | "approved_with_permit"
  | "approved_with_waiver"
  | "requested_changes"
  | "rejected"
  | "closed";

async function ensureSeedScenarioProposal(
  ctx: MutationCtx,
  input: {
    auth: { brokerage: Doc<"brokerages">; roles: RoleSlug[]; subject: string };
    brokerageId: Id<"brokerages">;
    buildName: string;
    builderProfileId: Id<"builderProfiles">;
    now: number;
    organizationId: string;
    scenario: SeedScenario;
    templateId: Id<"proposalTemplates">;
  },
) {
  const existing = (
    await ctx.db
      .query("buildProposals")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", input.brokerageId))
      .collect()
  ).find((proposal) => proposal.buildName === input.buildName);
  if (existing) {
    return existing._id;
  }

  const proposalId = await ctx.db.insert("buildProposals", {
    assignedBrokerWorkosUserId: "user_broker",
    brokerageId: input.brokerageId,
    borrowerCoPayBps: 2000,
    borrowerWorkingCapitalLimitCents: 40_000_000,
    buildName: input.buildName,
    builderProfileId: input.builderProfileId,
    createdAt: input.now,
    createdByWorkosUserId: "user_builder",
    interestAnnualBps: 925,
    lenderDrawPolicyLimitCents: 55_000_000,
    location: `${input.buildName.replace("Seed Scenario - ", "")} Site, Toronto, ON`,
    organizationId: input.organizationId,
    reviewOutcome: "none",
    status: "draft",
    templateId: input.templateId,
    totalBudgetCents: 0,
    updatedAt: input.now,
    updatedByWorkosUserId: "user_builder",
  });
  await upsertKanbanCard(ctx, proposalId, input.now);
  await writeProposalEvent(ctx, {
    auth: input.auth,
    command: "dev_seedProductionProposalScenarios",
    eventType: "proposal.created",
    newState: "draft",
    proposalId,
  });

  await seedProposalPackage(ctx, {
    ...input,
    includePermit:
      input.scenario === "approved_with_permit" || input.scenario === "closed",
    proposalId,
  });

  if (input.scenario === "draft") {
    return proposalId;
  }

  await seedSubmitProposal(ctx, {
    auth: input.auth,
    now: input.now,
    organizationId: input.organizationId,
    proposalId,
  });
  if (input.scenario === "submitted") {
    return proposalId;
  }

  if (input.scenario === "requested_changes") {
    await ctx.db.patch(proposalId, {
      reviewOutcome: "requested_changes",
      status: "draft",
      updatedAt: input.now,
      updatedByWorkosUserId: input.auth.subject,
    });
    await upsertKanbanCard(ctx, proposalId, input.now);
    await writeProposalEvent(ctx, {
      auth: input.auth,
      command: "dev_seedProductionProposalScenarios",
      eventType: "proposal.changes_requested",
      newState: "draft",
      priorState: "submitted",
      proposalId,
      reason: "Seeded request-changes review path.",
    });
    return proposalId;
  }

  if (input.scenario === "rejected") {
    await ctx.db.patch(proposalId, {
      reviewOutcome: "rejected",
      updatedAt: input.now,
      updatedByWorkosUserId: input.auth.subject,
    });
    await writeProposalEvent(ctx, {
      auth: input.auth,
      command: "dev_seedProductionProposalScenarios",
      eventType: "proposal.rejected",
      newState: "submitted",
      priorState: "submitted",
      proposalId,
      reason: "Seeded rejection review path.",
    });
    return proposalId;
  }

  await seedApproveProposal(ctx, {
    auth: input.auth,
    now: input.now,
    organizationId: input.organizationId,
    permitWaiverReason:
      input.scenario === "approved_with_waiver"
        ? "Seeded waiver: municipal permit follows closing in this scenario."
        : undefined,
    proposalId,
  });
  if (input.scenario !== "closed") {
    return proposalId;
  }

  await seedCloseProposal(ctx, {
    auth: input.auth,
    buildStartDate: "2099-09-01",
    loanFacility: {
      interestAnnualBps: 925,
      principalCents: 55_000_000,
    },
    now: input.now,
    organizationId: input.organizationId,
    proposalId,
  });
  return proposalId;
}

async function seedProposalPackage(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    includePermit: boolean;
    now: number;
    organizationId: string;
    proposalId: Id<"buildProposals">;
  },
) {
  const milestones = [
    {
      budgetCents: 30_000_000,
      dayEnd: 30,
      dayStart: 0,
      dependencyKeys: [] as string[],
      durationDays: 30,
      key: "foundation",
      name: "Foundation",
      order: 1,
      submilestones: [
        {
          budgetCents: 14_000_000,
          durationDays: 12,
          key: "forms-and-pour",
          name: "Forms and pour",
          order: 1,
          startDay: 0,
        },
        {
          budgetCents: 16_000_000,
          durationDays: 8,
          key: "waterproofing",
          name: "Waterproofing and backfill",
          order: 2,
          startDay: 12,
        },
      ],
    },
    {
      budgetCents: 45_000_000,
      dayEnd: 75,
      dayStart: 31,
      dependencyKeys: ["foundation"],
      durationDays: 45,
      key: "shell-dry-in",
      name: "Shell and Dry-In",
      order: 2,
      submilestones: [] as {
        budgetCents: number;
        durationDays: number;
        key: string;
        name: string;
        order: number;
        startDay: number;
      }[],
    },
  ];
  let totalBudgetCents = 0;
  for (const milestone of milestones) {
    totalBudgetCents += milestone.budgetCents;
    const drawAvailabilityCents = calculateDrawAvailability(
      milestone.budgetCents,
      2000,
    );
    const proposalMilestoneId = await ctx.db.insert("proposalMilestones", {
      brokerageId: input.brokerageId,
      budgetCents: milestone.budgetCents,
      createdAt: input.now,
      dayEnd: milestone.dayEnd,
      dayStart: milestone.dayStart,
      dependencyKeys: milestone.dependencyKeys,
      drawAvailabilityCents,
      durationDays: milestone.durationDays,
      key: milestone.key,
      name: milestone.name,
      order: milestone.order,
      organizationId: input.organizationId,
      proposalId: input.proposalId,
      updatedAt: input.now,
    });
    for (const submilestone of milestone.submilestones) {
      await ctx.db.insert("proposalSubmilestones", {
        brokerageId: input.brokerageId,
        budgetCents: submilestone.budgetCents,
        createdAt: input.now,
        durationDays: submilestone.durationDays,
        key: submilestone.key,
        milestoneKey: milestone.key,
        name: submilestone.name,
        order: submilestone.order,
        organizationId: input.organizationId,
        proposalId: input.proposalId,
        proposalMilestoneId,
        startDay: submilestone.startDay,
        updatedAt: input.now,
      });
    }
    await ctx.db.insert("proposalDrawScheduleRows", {
      amountCents: drawAvailabilityCents,
      brokerageId: input.brokerageId,
      createdAt: input.now,
      drawKey: `draw-${String(milestone.order).padStart(2, "0")}`,
      label: `${milestone.name} reimbursement draw`,
      milestoneKey: milestone.key,
      order: milestone.order,
      organizationId: input.organizationId,
      proposalId: input.proposalId,
      proposalMilestoneId,
      source: "milestone",
      timingDay: milestone.dayEnd,
      updatedAt: input.now,
    });
  }

  if (input.includePermit) {
    await ctx.db.insert("proposalDocuments", {
      brokerageId: input.brokerageId,
      createdAt: input.now,
      documentType: "permit",
      fileName: "seed-permit.pdf",
      mimeType: "application/pdf",
      organizationId: input.organizationId,
      proposalId: input.proposalId,
      sizeBytes: 4096,
      status: "uploaded",
      updatedAt: input.now,
      uploadedByWorkosUserId: "user_builder",
    });
  } else {
    await ctx.db.insert("proposalDocuments", {
      brokerageId: input.brokerageId,
      createdAt: input.now,
      documentType: "budget",
      fileName: "seed-budget.pdf",
      mimeType: "application/pdf",
      organizationId: input.organizationId,
      proposalId: input.proposalId,
      sizeBytes: 2048,
      status: "uploaded",
      updatedAt: input.now,
      uploadedByWorkosUserId: "user_builder",
    });
  }

  await ctx.db.insert("proposalEvidenceAssets", {
    brokerageId: input.brokerageId,
    createdAt: input.now,
    evidenceKey: `seed-site-photo-${String(input.proposalId)}`,
    fileName: "seed-site-photo.jpg",
    label: "Seed site photo",
    locationVerified: true,
    milestoneKey: "foundation",
    mimeType: "image/jpeg",
    organizationId: input.organizationId,
    proposalId: input.proposalId,
    sizeBytes: 2048,
    source: "seeded_production_workspace",
    tag: "site-photo",
    updatedAt: input.now,
  });

  await ctx.db.patch(input.proposalId, {
    totalBudgetCents,
    updatedAt: input.now,
  });
}

async function seedSubmitProposal(
  ctx: MutationCtx,
  input: {
    auth: { brokerage: Doc<"brokerages">; roles: RoleSlug[]; subject: string };
    now: number;
    organizationId: string;
    proposalId: Id<"buildProposals">;
  },
) {
  const workflowRule = await getActiveWorkflowRule(
    ctx,
    input.auth.brokerage._id,
  );
  const snapshotId = await ctx.db.insert("workflowRuleSnapshots", {
    allowPermitWaiverByRoles: workflowRule.allowPermitWaiverByRoles,
    brokerageId: input.auth.brokerage._id,
    createdAt: input.now,
    organizationId: input.organizationId,
    proposalId: input.proposalId,
    proposalStates: workflowRule.proposalStates,
    requirePermitForApproval: workflowRule.requirePermitForApproval,
    ruleKey: workflowRule.ruleKey,
    settings: workflowRule.settings,
    version: workflowRule.version,
    workflowRuleId: workflowRule._id,
  });
  await ctx.db.patch(input.proposalId, {
    reviewOutcome: "none",
    status: "submitted",
    submittedAt: input.now,
    updatedAt: input.now,
    updatedByWorkosUserId: input.auth.subject,
    workflowRuleSnapshotId: snapshotId,
  });
  await upsertKanbanCard(ctx, input.proposalId, input.now);
  await writeProposalEvent(ctx, {
    auth: input.auth,
    command: "dev_seedProductionProposalScenarios",
    eventType: "proposal.submitted",
    newState: "submitted",
    priorState: "draft",
    proposalId: input.proposalId,
  });
}

async function seedApproveProposal(
  ctx: MutationCtx,
  input: {
    auth: { brokerage: Doc<"brokerages">; roles: RoleSlug[]; subject: string };
    now: number;
    organizationId: string;
    permitWaiverReason?: string;
    proposalId: Id<"buildProposals">;
  },
) {
  let waiverWarnings: string[] = [];
  if (input.permitWaiverReason) {
    await ctx.db.insert("documentWaivers", {
      brokerageId: input.auth.brokerage._id,
      createdAt: input.now,
      documentType: "permit",
      grantedByRole: "admin",
      grantedByWorkosUserId: input.auth.subject,
      organizationId: input.organizationId,
      proposalId: input.proposalId,
      reason: input.permitWaiverReason,
    });
    waiverWarnings = ["permit-waived"];
  }

  await ctx.db.patch(input.proposalId, {
    approvedAt: input.now,
    reviewOutcome: "approved",
    status: "approved",
    updatedAt: input.now,
    updatedByWorkosUserId: input.auth.subject,
  });
  await upsertKanbanCard(ctx, input.proposalId, input.now);
  await writeProposalEvent(ctx, {
    auth: input.auth,
    command: "dev_seedProductionProposalScenarios",
    eventType: "proposal.approved",
    newState: "approved",
    priorState: "submitted",
    proposalId: input.proposalId,
    reason: input.permitWaiverReason
      ? "Seeded approval with permit waiver."
      : "Seeded approval with uploaded permit.",
    warnings: waiverWarnings,
  });
}

async function seedCloseProposal(
  ctx: MutationCtx,
  input: {
    auth: { brokerage: Doc<"brokerages">; roles: RoleSlug[]; subject: string };
    buildStartDate: string;
    loanFacility: { interestAnnualBps: number; principalCents: number };
    now: number;
    organizationId: string;
    proposalId: Id<"buildProposals">;
  },
) {
  const proposal = await ctx.db.get(input.proposalId);
  if (!proposal?.workflowRuleSnapshotId) {
    throw new Error("Seeded proposal is missing workflow rule snapshot.");
  }
  const permit = await getPermitDocument(ctx, input.proposalId);
  const permitWaiver = await getPermitWaiver(ctx, input.proposalId);
  const assignedBuilderProfileId = assignedBuilderProfileIdOrThrow(proposal);
  const buildId = await ctx.db.insert("activeBuilds", {
    brokerageId: input.auth.brokerage._id,
    buildName: proposal.buildName,
    builderProfileId: assignedBuilderProfileId,
    createdAt: input.now,
    location: proposal.location,
    organizationId: input.organizationId,
    permitDocumentId: permit?._id,
    permitWaiverId: permitWaiver?._id,
    proposalId: input.proposalId,
    startDate: input.buildStartDate,
    status:
      new Date(`${input.buildStartDate}T00:00:00Z`).getTime() > input.now
        ? "future_start"
        : "active",
    timelineMinimumCashReserveCents: proposal.timelineMinimumCashReserveCents,
    timelineStartingCashCents: proposal.timelineStartingCashCents,
    totalBudgetCents: proposal.totalBudgetCents,
    updatedAt: input.now,
    workflowRuleSnapshotId: proposal.workflowRuleSnapshotId,
  });
  await ctx.db.insert("buildBrokerAssignments", {
    assignedBrokerWorkosUserId:
      proposal.assignedBrokerWorkosUserId ?? input.auth.subject,
    brokerageId: input.auth.brokerage._id,
    buildId,
    createdAt: input.now,
    organizationId: input.organizationId,
    role: "primary",
  });
  await ctx.db.insert("loanFacilities", {
    brokerageId: input.auth.brokerage._id,
    buildId,
    createdAt: input.now,
    interestAnnualBps: input.loanFacility.interestAnnualBps,
    interestStartsOn: "funds_released",
    organizationId: input.organizationId,
    paybackDate: addDaysIso(
      input.buildStartDate,
      proposal.timelineRangeMax ?? 365,
    ),
    principalCents: input.loanFacility.principalCents,
    proposalId: input.proposalId,
    status: "active",
    updatedAt: input.now,
  });
  await ctx.db.insert("buildCapitalPlans", {
    borrowerCoPayBps: proposal.borrowerCoPayBps,
    borrowerWorkingCapitalLimitCents: proposal.borrowerWorkingCapitalLimitCents,
    brokerageId: input.auth.brokerage._id,
    buildId,
    createdAt: input.now,
    lenderDrawPolicyLimitCents: proposal.lenderDrawPolicyLimitCents,
    organizationId: input.organizationId,
    proposalId: input.proposalId,
    source: "proposal_closing_copy",
    updatedAt: input.now,
    version: 1,
  });

  const buildMilestoneIds = new Map<string, Id<"buildMilestones">>();
  const milestones = await collectByIndex(
    ctx,
    "proposalMilestones",
    "by_proposal",
    input.proposalId,
  );
  for (const milestone of milestones) {
    const buildMilestoneId = await ctx.db.insert("buildMilestones", {
      brokerageId: input.auth.brokerage._id,
      budgetCents: milestone.budgetCents,
      buildId,
      completionClaim: milestone.completionClaim,
      completionReview: milestone.completionReview,
      createdAt: input.now,
      dayEnd: milestone.dayEnd,
      dayStart: milestone.dayStart,
      dependencyKeys: milestone.dependencyKeys,
      drawAvailabilityCents: milestone.drawAvailabilityCents,
      durationDays: milestone.durationDays,
      evidenceState: milestone.evidenceState,
      key: milestone.key,
      name: milestone.name,
      order: milestone.order,
      organizationId: input.organizationId,
      policyState: milestone.policyState,
      proposalMilestoneId: milestone._id,
      status:
        milestone.completionReview?.status === "approved"
          ? "complete"
          : "planned",
      updatedAt: input.now,
    });
    buildMilestoneIds.set(milestone._id, buildMilestoneId);
  }

  const submilestones = await collectByIndex(
    ctx,
    "proposalSubmilestones",
    "by_proposal",
    input.proposalId,
  );
  for (const submilestone of submilestones) {
    const buildMilestoneId = buildMilestoneIds.get(
      submilestone.proposalMilestoneId,
    );
    if (!buildMilestoneId) {
      continue;
    }
    await ctx.db.insert("buildSubmilestones", {
      brokerageId: input.auth.brokerage._id,
      budgetCents: submilestone.budgetCents,
      buildId,
      buildMilestoneId,
      createdAt: input.now,
      durationDays: submilestone.durationDays,
      key: submilestone.key,
      milestoneKey: submilestone.milestoneKey,
      name: submilestone.name,
      order: submilestone.order,
      organizationId: input.organizationId,
      proposalSubmilestoneId: submilestone._id,
      startDay: submilestone.startDay,
      status: "planned",
      updatedAt: input.now,
    });
  }

  const draws = await collectByIndex(
    ctx,
    "proposalDrawScheduleRows",
    "by_proposal",
    input.proposalId,
  );
  for (const draw of draws) {
    await ctx.db.insert("plannedDrawScheduleRows", {
      amountCents: draw.amountCents,
      brokerageId: input.auth.brokerage._id,
      buildId,
      buildMilestoneId: draw.proposalMilestoneId
        ? buildMilestoneIds.get(draw.proposalMilestoneId)
        : undefined,
      createdAt: input.now,
      drawKey: draw.drawKey,
      label: draw.label,
      milestoneKey: draw.milestoneKey,
      order: draw.order,
      organizationId: input.organizationId,
      proposalDrawScheduleRowId: draw._id,
      requestNote: draw.requestNote,
      requestReviewNote: draw.requestReviewNote,
      requestedAt: draw.requestedAt,
      reviewedAt: draw.reviewedAt,
      status: activeBuildDrawStatusFromProposal(draw.requestStatus),
      timingDay: draw.timingDay,
      updatedAt: input.now,
    });
  }
  await copyProposalOperationalRowsToActiveBuild(ctx, {
    auth: input.auth,
    buildId,
    now: input.now,
    organizationId: input.organizationId,
    proposalId: input.proposalId,
  });
  await ctx.db.insert("capitalEvents", {
    amountCents: 0,
    brokerageId: input.auth.brokerage._id,
    buildId,
    createdAt: input.now,
    eventDate: input.buildStartDate,
    eventType: "borrower_copay",
    label: "Capital plan opened at loan closing",
    organizationId: input.organizationId,
  });
  await ctx.db.patch(input.proposalId, {
    activeBuildId: buildId,
    closedAt: input.now,
    status: "closed",
    updatedAt: input.now,
    updatedByWorkosUserId: input.auth.subject,
  });
  await upsertKanbanCard(ctx, input.proposalId, input.now);
  await writeProposalEvent(ctx, {
    auth: input.auth,
    command: "dev_seedProductionProposalScenarios",
    eventType: "proposal.closed",
    newState: "closed",
    priorState: "approved",
    proposalId: input.proposalId,
    reason: "Seeded offline loan closing.",
  });
  const build = await ctx.db.get(buildId);
  if (build) {
    await writeActiveBuildEvent(ctx, {
      auth: {
        brokerage: input.auth.brokerage,
        proposal,
        roles: input.auth.roles,
        subject: input.auth.subject,
      },
      build,
      command: "dev_seedProductionProposalScenarios",
      eventType: "active_build.created",
      newState: JSON.stringify({ buildId, proposalId: input.proposalId }),
      reason: "Seeded offline loan closing.",
    });
  }
  await ctx.db.insert("eventOutbox", {
    brokerageId: input.auth.brokerage._id,
    createdAt: input.now,
    eventType: "active_build.created",
    organizationId: input.organizationId,
    payloadPreview: JSON.stringify({
      buildId,
      proposalId: input.proposalId,
      startDate: input.buildStartDate,
    }),
    relatedEntityId: buildId,
    relatedEntityType: "activeBuild",
    status: "pending",
  });
}

async function ensureSeedContractorProfile(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    now: number;
    organizationId: string;
  },
) {
  const existing = (
    await ctx.db
      .query("contractorProfiles")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", input.brokerageId))
      .collect()
  ).find((contractor) => contractor.name === "Seed Scenario Contractor LLC");
  if (existing) {
    return existing._id;
  }
  return await ctx.db.insert("contractorProfiles", {
    brokerageId: input.brokerageId,
    createdAt: input.now,
    email: "seed.contractor@example.com",
    name: "Seed Scenario Contractor LLC",
    organizationId: input.organizationId,
    phone: "555-0100",
    status: "active",
    trades: ["foundation", "framing"],
    updatedAt: input.now,
  });
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function emptyProposalKanbanColumns() {
  return PROPOSAL_COLUMNS.map((id) => ({
    cards: [],
    id,
    name: titleCase(id),
  }));
}
