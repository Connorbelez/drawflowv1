import { v } from "convex/values";

import {
  authenticatedMutation,
  authenticatedQuery,
  type AuthorizedViewer,
  normalizeRoleSlugs,
  type RoleSlug,
} from "./authz";
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

const submilestoneInput = v.object({
  budgetCents: v.optional(v.number()),
  durationDays: v.optional(v.number()),
  key: v.string(),
  name: v.string(),
  order: v.number(),
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

const evidenceAssetInput = v.object({
  evidenceKey: v.string(),
  fileName: v.string(),
  label: v.string(),
  locationVerified: v.optional(v.boolean()),
  milestoneKey: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  source: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  tag: v.string(),
});

const timelineCapitalEventKind = v.union(
  v.literal("cost"),
  v.literal("cashInfusion"),
);

const timelineModificationRequestType = v.union(
  v.literal("createMilestone"),
  v.literal("deleteMilestone"),
  v.literal("updateMilestoneBudget"),
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
    const auth = await authorizeProposal(ctx, args.proposalId, args.workosOrganizationId);
    if (auth.proposal.status !== "draft") {
      throw new Error("Only draft proposals can receive document uploads.");
    }
    if (!isBackoffice(auth.roles)) {
      await assertBuilderOwnership(ctx, auth.proposal.builderProfileId, auth.subject);
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
    await assertBuilderProfileScope(ctx, args.builderProfileId, auth.brokerage._id);
    if (!isBackoffice(auth.roles)) {
      await assertBuilderOwnership(ctx, args.builderProfileId, auth.subject);
      requireAnyRole(auth.roles, BUILDER_ROLES);
    }

    const now = Date.now();
    const proposalId = await ctx.db.insert("buildProposals", {
      brokerageId: auth.brokerage._id,
      borrowerCoPayBps: 2_000,
      borrowerWorkingCapitalLimitCents: 0,
      buildName: args.buildName,
      builderProfileId: args.builderProfileId,
      createdAt: now,
      createdByWorkosUserId: auth.subject,
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

export const saveDraftProposalPackage = authenticatedMutation
  .input({
    borrowerCoPayBps: v.number(),
    borrowerWorkingCapitalLimitCents: v.number(),
    buildName: v.optional(v.string()),
    documents: v.optional(v.array(documentInput)),
    lenderDrawPolicyLimitCents: v.number(),
    location: v.optional(v.string()),
    milestones: v.array(milestoneInput),
    proposalId: v.id("buildProposals"),
    templateId: v.optional(v.id("proposalTemplates")),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(ctx, args.proposalId, args.workosOrganizationId);
    if (auth.proposal.status !== "draft") {
      throw new Error("Only draft proposals can be edited.");
    }
    if (!isBackoffice(auth.roles)) {
      await assertBuilderOwnership(ctx, auth.proposal.builderProfileId, auth.subject);
    }
    if (args.borrowerCoPayBps < 0 || args.borrowerCoPayBps > 10_000) {
      throw new Error("Borrower co-pay bps must be between 0 and 10000.");
    }
    if (args.milestones.length === 0) {
      throw new Error("At least one milestone is required.");
    }

    const now = Date.now();
    await deleteProposalPlanChildren(ctx, args.proposalId);
    let totalBudgetCents = 0;

    for (const row of [...args.milestones].sort((a, b) => a.order - b.order)) {
      totalBudgetCents += row.budgetCents;
      const drawAvailabilityCents = calculateDrawAvailability(
        row.budgetCents,
        args.borrowerCoPayBps,
      );
      const milestoneId = await ctx.db.insert("proposalMilestones", {
        brokerageId: auth.brokerage._id,
        budgetCents: row.budgetCents,
        createdAt: now,
        dayEnd: row.dayEnd,
        dayStart: row.dayStart,
        dependencyKeys: row.dependencyKeys,
        drawAvailabilityCents,
        durationDays: row.durationDays,
        icon: row.icon,
        key: row.key,
        name: row.name,
        order: row.order,
        organizationId: args.workosOrganizationId,
        proposalId: args.proposalId,
        updatedAt: now,
      });
      for (const sub of row.submilestones) {
        await ctx.db.insert("proposalSubmilestones", {
          brokerageId: auth.brokerage._id,
          budgetCents: sub.budgetCents,
          createdAt: now,
          durationDays: sub.durationDays,
          key: sub.key,
          milestoneKey: row.key,
          name: sub.name,
          order: sub.order,
          organizationId: args.workosOrganizationId,
          proposalId: args.proposalId,
          proposalMilestoneId: milestoneId,
          updatedAt: now,
        });
      }
      await ctx.db.insert("proposalDrawScheduleRows", {
        amountCents: drawAvailabilityCents,
        brokerageId: auth.brokerage._id,
        createdAt: now,
        drawKey: `draw-${String(row.order).padStart(2, "0")}`,
        label: `${row.name} reimbursement draw`,
        milestoneKey: row.key,
        order: row.order,
        organizationId: args.workosOrganizationId,
        proposalId: args.proposalId,
        proposalMilestoneId: milestoneId,
        source: "milestone",
        timingDay: row.dayEnd,
        updatedAt: now,
      });
    }

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
    return null;
  })
  .public();

export const submitProposal = authenticatedMutation
  .input({
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("workflowRuleSnapshots"))
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(ctx, args.proposalId, args.workosOrganizationId);
    requireState(auth.proposal, "draft");
    if (!isBackoffice(auth.roles)) {
      await assertBuilderOwnership(ctx, auth.proposal.builderProfileId, auth.subject);
    }
    const milestones = await collectByIndex(ctx, "proposalMilestones", "by_proposal", args.proposalId);
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
    const auth = await authorizeProposal(ctx, args.proposalId, args.workosOrganizationId);
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
    const auth = await authorizeProposal(ctx, args.proposalId, args.workosOrganizationId);
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
    const auth = await authorizeProposal(ctx, args.proposalId, args.workosOrganizationId);
    requireAnyRole(auth.roles, APPROVER_ROLES);
    requireState(auth.proposal, "submitted");
    requireReason(args.reason);
    const snapshot = await getWorkflowSnapshot(ctx, auth.proposal);
    const permit = await getPermitDocument(ctx, args.proposalId);
    let waiverId: Id<"documentWaivers"> | undefined;
    if (!permit && snapshot.requirePermitForApproval) {
      if (!args.permitWaiverReason?.trim()) {
        throw new Error("A permit waiver reason is required when no permit waiver exists.");
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
    const auth = await authorizeProposal(ctx, args.proposalId, args.workosOrganizationId);
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    requireReason(args.reason);
    if (!["submitted", "approved"].includes(auth.proposal.status)) {
      throw new Error("Only submitted or approved proposal draw schedules can be edited.");
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
    requireProductionTimelineDraftStructureWrite(auth);
    await insertProductionMilestoneFromInput(ctx, auth, args.milestone);
    await recalculateProposalBudget(ctx, auth, args.proposalId);
    await writeProposalEvent(ctx, {
      auth,
      command: "createProductionTimelineMilestone",
      eventType: "proposal.milestone.created",
      newState: JSON.stringify(args.milestone),
      proposalId: args.proposalId,
    });
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
    requireProductionTimelineDraftStructureWrite(auth);
    const milestone = await getProductionMilestoneOrThrow(
      ctx,
      args.proposalId,
      args.milestoneKey,
    );
    const nextDayStart = args.dayStart ?? milestone.dayStart;
    const nextDayEnd = args.dayEnd ?? milestone.dayEnd;
    if (nextDayEnd < nextDayStart) {
      throw new Error("Milestone end day must be after start day.");
    }
    const nextBudgetCents =
      args.budgetCents === undefined
        ? milestone.budgetCents
        : Math.max(0, Math.round(args.budgetCents));
    const now = Date.now();
    const patch = {
      ...(args.budgetCents === undefined ? {} : { budgetCents: nextBudgetCents }),
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
                ? calculateDrawAvailability(
                    nextBudgetCents,
                    auth.proposal.borrowerCoPayBps,
                  )
                : Math.max(0, Math.round(args.drawAvailabilityCents)),
          }),
      ...(args.durationDays === undefined
        ? {}
        : { durationDays: Math.max(1, Math.round(args.durationDays)) }),
      ...(args.evidenceState === undefined
        ? {}
        : { evidenceState: args.evidenceState }),
      ...(args.icon === undefined ? {} : { icon: args.icon }),
      ...(args.lane === undefined ? {} : { lane: args.lane }),
      ...(args.markerLabel === undefined ? {} : { markerLabel: args.markerLabel }),
      ...(args.name === undefined ? {} : { name: args.name.trim() || milestone.name }),
      ...(args.order === undefined ? {} : { order: Math.max(1, Math.round(args.order)) }),
      ...(args.policyState === undefined
        ? {}
        : { policyState: args.policyState }),
      ...(args.status === undefined ? {} : { timelineStatus: args.status }),
      ...(args.tone === undefined ? {} : { tone: args.tone }),
      updatedAt: now,
    };
    await ctx.db.patch(milestone._id, patch);
    if (args.submilestones !== undefined) {
      await replaceProductionSubmilestones(ctx, auth, {
        milestone,
        proposalId: args.proposalId,
        rows: args.submilestones,
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
    requireProductionTimelineDraftStructureWrite(auth);
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
    return null;
  })
  .public();

export const createProductionTimelineDraw = authenticatedMutation
  .input({
    amountCents: v.number(),
    customDate: v.optional(v.boolean()),
    drawKey: v.string(),
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
    requireProductionTimelineEditable(auth);
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
    const now = Date.now();
    await ctx.db.insert("proposalDrawScheduleRows", {
      amountCents: Math.max(0, Math.round(args.amountCents)),
      brokerageId: auth.brokerage._id,
      createdAt: now,
      customDate: args.customDate ?? true,
      drawKey: args.drawKey,
      label: args.label.trim() || "Reimbursement draw",
      order: args.order ?? draws.length + 1,
      organizationId: auth.proposal.organizationId,
      proposalId: args.proposalId,
      source: "manual",
      timingDay: Math.max(0, Math.round(args.x)),
      updatedAt: now,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "createProductionTimelineDraw",
      eventType: "proposal.draw.created",
      newState: JSON.stringify(args),
      proposalId: args.proposalId,
    });
    return null;
  })
  .public();

export const updateProductionTimelineDraw = authenticatedMutation
  .input({
    amountCents: v.optional(v.number()),
    customDate: v.optional(v.boolean()),
    drawKey: v.string(),
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
    requireProductionTimelineEditable(auth);
    const draw = await getProductionDrawOrThrow(
      ctx,
      args.proposalId,
      args.drawKey,
    );
    const patch = {
      ...(args.amountCents === undefined
        ? {}
        : { amountCents: Math.max(0, Math.round(args.amountCents)) }),
      ...(args.customDate === undefined ? {} : { customDate: args.customDate }),
      ...(args.label === undefined
        ? {}
        : { label: args.label.trim() || draw.label }),
      ...(args.order === undefined ? {} : { order: Math.max(1, Math.round(args.order)) }),
      ...(args.x === undefined
        ? {}
        : { customDate: true, timingDay: Math.max(0, Math.round(args.x)) }),
      updatedAt: Date.now(),
    };
    await ctx.db.patch(draw._id, patch);
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProductionTimelineDraw",
      eventType: "proposal.draw.updated",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(draw),
      proposalId: args.proposalId,
    });
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
    requireProductionTimelineEditable(auth);
    const draw = await getProductionDrawOrThrow(
      ctx,
      args.proposalId,
      args.drawKey,
    );
    if (draw.requestStatus === "approved") {
      throw new Error("Approved reimbursement draws cannot be deleted.");
    }
    await ctx.db.delete(draw._id);
    await writeProposalEvent(ctx, {
      auth,
      command: "deleteProductionTimelineDraw",
      eventType: "proposal.draw.deleted",
      priorState: JSON.stringify(draw),
      proposalId: args.proposalId,
    });
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
  .returns(v.object({ requestId: v.id("proposalTimelineModificationRequests") }))
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
    const requestId = await ctx.db.insert("proposalTimelineModificationRequests", {
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
    });
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

export const reviewProductionTimelineModificationRequest =
  authenticatedMutation
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
        newState: JSON.stringify({ requestId: args.requestId, status: args.status }),
        priorState: JSON.stringify(request),
        proposalId: request.proposalId,
        reason: args.note,
      });
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
    requireProductionTimelineEditable(auth);
    const priorState = JSON.stringify({
      currentDay: auth.proposal.timelineCurrentDay,
      progressValue: auth.proposal.timelineProgressValue,
      rangeMax: auth.proposal.timelineRangeMax,
      rangeMin: auth.proposal.timelineRangeMin,
      routeState: auth.proposal.timelineRouteState,
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
      timelineStartingCashCents: Math.max(0, Math.round(args.startingCashCents)),
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
        startingCashCents: Math.max(0, Math.round(args.startingCashCents)),
      }),
      priorState,
      proposalId: args.proposalId,
    });
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
    requireProductionTimelineEditable(auth);
    await insertProductionCapitalEvent(ctx, auth, {
      amountCents: args.amountCents,
      capitalEventKey: args.capitalEventKey,
      eventKind: args.eventKind,
      label: args.label,
      order: args.order,
      proposalId: args.proposalId,
      x: args.x,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "createProductionTimelineCapitalEvent",
      eventType: "proposal.capital_event.created",
      newState: JSON.stringify(args),
      proposalId: args.proposalId,
    });
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
    requireProductionTimelineEditable(auth);
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
    requireProductionTimelineEditable(auth);
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
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProductionTimelineCapitalEvent",
      eventType: "proposal.capital_event.updated",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(event),
      proposalId: args.proposalId,
    });
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
    requireProductionTimelineEditable(auth);
    const event = await getProductionCapitalEventOrThrow(
      ctx,
      args.proposalId,
      args.capitalEventKey,
    );
    await ctx.db.delete(event._id);
    await writeProposalEvent(ctx, {
      auth,
      command: "deleteProductionTimelineCapitalEvent",
      eventType: "proposal.capital_event.deleted",
      priorState: JSON.stringify(event),
      proposalId: args.proposalId,
    });
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
    requireProductionTimelineEditable(auth);
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
    requireProductionTimelineEditable(auth);
    const milestone = await getProductionMilestoneOrThrow(
      ctx,
      args.proposalId,
      args.asset.milestoneKey,
    );
    const existing = await ctx.db
      .query("proposalEvidenceAssets")
      .withIndex("by_proposal_key", (q) =>
        q.eq("proposalId", args.proposalId).eq("evidenceKey", args.asset.evidenceKey),
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
    requireProductionTimelineEditable(auth);
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
    requireProductionTimelineEditable(auth);
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
    requireProductionTimelineLiveWrite(auth);
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
      reviewedAt: milestone.completionReview?.reviewedAt ?? siteVisit.requestedAt,
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
    requireProductionTimelineLiveWrite(auth);
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
    const auth = await authorizeProposal(ctx, args.proposalId, args.workosOrganizationId);
    requireAnyRole(auth.roles, APPROVER_ROLES);
    requireState(auth.proposal, "approved");
    requireReason(args.reason);
    if (!args.buildStartDate.trim()) {
      throw new Error("Closing requires a build start date.");
    }
    if (!auth.proposal.workflowRuleSnapshotId) {
      throw new Error("Approved proposal is missing workflow rule snapshot.");
    }

    const now = Date.now();
    const permit = await getPermitDocument(ctx, args.proposalId);
    const permitWaiver = await getPermitWaiver(ctx, args.proposalId);
    const buildId = await ctx.db.insert("activeBuilds", {
      brokerageId: auth.brokerage._id,
      buildName: auth.proposal.buildName,
      builderProfileId: auth.proposal.builderProfileId,
      createdAt: now,
      location: auth.proposal.location,
      organizationId: args.workosOrganizationId,
      permitDocumentId: permit?._id,
      permitWaiverId: permitWaiver?._id,
      proposalId: args.proposalId,
      startDate: args.buildStartDate,
      status: new Date(`${args.buildStartDate}T00:00:00Z`).getTime() > now ? "future_start" : "active",
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

    const milestoneIdByProposalMilestone = new Map<string, Id<"buildMilestones">>();
    const milestones = await collectByIndex(ctx, "proposalMilestones", "by_proposal", args.proposalId);
    for (const milestone of milestones) {
      const buildMilestoneId = await ctx.db.insert("buildMilestones", {
        brokerageId: auth.brokerage._id,
        budgetCents: milestone.budgetCents,
        buildId,
        createdAt: now,
        dayEnd: milestone.dayEnd,
        dayStart: milestone.dayStart,
        dependencyKeys: milestone.dependencyKeys,
        drawAvailabilityCents: milestone.drawAvailabilityCents,
        durationDays: milestone.durationDays,
        key: milestone.key,
        name: milestone.name,
        order: milestone.order,
        organizationId: args.workosOrganizationId,
        proposalMilestoneId: milestone._id,
        status: "planned",
        updatedAt: now,
      });
      milestoneIdByProposalMilestone.set(milestone._id, buildMilestoneId);
    }

    const submilestones = await collectByIndex(ctx, "proposalSubmilestones", "by_proposal", args.proposalId);
    for (const submilestone of submilestones) {
      const buildMilestoneId = milestoneIdByProposalMilestone.get(
        submilestone.proposalMilestoneId,
      );
      if (!buildMilestoneId) {
        continue;
      }
      await ctx.db.insert("buildSubmilestones", {
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
        status: "planned",
        updatedAt: now,
      });
    }

    const draws = await collectByIndex(ctx, "proposalDrawScheduleRows", "by_proposal", args.proposalId);
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
        status: "planned",
        timingDay: draw.timingDay,
        updatedAt: now,
      });
    }
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
    brokerageId: v.id("brokerages"),
    email: v.optional(v.string()),
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
    return await ctx.db.insert("contractorProfiles", {
      accountWorkosUserId: args.accountWorkosUserId,
      brokerageId: auth.brokerage._id,
      createdAt: now,
      email: args.email,
      name: args.name,
      organizationId: args.workosOrganizationId,
      phone: args.phone,
      status: "active",
      trades: args.trades,
      updatedAt: now,
    });
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
          .withIndex("by_brokerage", (q) => q.eq("brokerageId", auth.brokerage._id))
          .filter((q) => q.eq(q.field("status"), "active"))
          .first()
      : await getOwnedBuilderProfile(ctx, auth.brokerage._id, auth.subject);
    if (!builderProfile) {
      throw new Error("Forbidden: builder ownership");
    }

    return {
      brokerage: auth.brokerage,
      builderProfile,
      templates: await collectProposalTemplateDetails(ctx, auth.brokerage._id),
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
    const auth = await authorizeProposal(ctx, args.proposalId, args.workosOrganizationId);
    const [
      documents,
      milestones,
      submilestones,
      draws,
      events,
      auditEvents,
      permitWaiver,
    ] = await Promise.all([
      collectByIndex(ctx, "proposalDocuments", "by_proposal", args.proposalId),
      collectByIndex(ctx, "proposalMilestones", "by_proposal", args.proposalId),
      collectByIndex(ctx, "proposalSubmilestones", "by_proposal", args.proposalId),
      collectByIndex(ctx, "proposalDrawScheduleRows", "by_proposal", args.proposalId),
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
      ? await collectByIndex(ctx, "buildMilestones", "by_build", activeBuild._id)
      : [];
    const buildSubmilestones = activeBuild
      ? await collectByIndex(ctx, "buildSubmilestones", "by_build", activeBuild._id)
      : [];
    const plannedDraws = activeBuild
      ? await collectByIndex(ctx, "plannedDrawScheduleRows", "by_build", activeBuild._id)
      : [];

    return {
      activeBuild,
      auditEvents,
      buildMilestones,
      buildSubmilestones,
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
      drawRows,
      capitalEventRows,
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
            tag: asset.tag,
          })),
      ),
      milestones: milestones.map((milestone, index) => {
        const draw = drawByMilestoneKey.get(milestone.key);
        const evidenceState =
          milestone.evidenceState ??
          (evidenceRows.some((asset: any) => asset.milestoneKey === milestone.key)
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
          drawAvailabilityCents:
            draw?.amountCents ?? milestone.drawAvailabilityCents,
          drawKey: draw?.label ?? "Reimbursement draw",
          durationDays: milestone.durationDays,
          evidenceState,
          icon:
            milestone.icon ??
            iconForProductionMilestone(milestone.key, milestone.name),
          lane: milestone.lane ?? (index % 3 === 1 ? -1 : index % 3 === 2 ? 1 : 0),
          markerLabel: milestone.markerLabel ?? String(index + 1),
          milestoneKey: milestone.key,
          name: milestone.name,
          order: index + 1,
          policyState:
            milestone.policyState ?? productionPolicyState(auth.proposal, permitWaiver),
          status: productionTimelineStatusForMilestone(index, auth.proposal, milestone),
          submilestoneSnapshot: submilestones
            .filter((submilestone: any) => submilestone.milestoneKey === milestone.key)
            .sort((a: any, b: any) => a.order - b.order || a.key.localeCompare(b.key))
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
            })),
          tone: productionTimelineToneForMilestone(index, auth.proposal, milestone),
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
        borrowerCoPayCents: Math.round(
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
    const auth = await authorizeProposal(ctx, proposalId, args.workosOrganizationId);
    const [
      documents,
      milestones,
      submilestones,
      draws,
      events,
      auditEvents,
      permitWaiver,
    ] = await Promise.all([
      collectByIndex(ctx, "proposalDocuments", "by_proposal", proposalId),
      collectByIndex(ctx, "proposalMilestones", "by_proposal", proposalId),
      collectByIndex(ctx, "proposalSubmilestones", "by_proposal", proposalId),
      collectByIndex(ctx, "proposalDrawScheduleRows", "by_proposal", proposalId),
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
      ? await collectByIndex(ctx, "buildMilestones", "by_build", activeBuild._id)
      : [];
    const buildSubmilestones = activeBuild
      ? await collectByIndex(ctx, "buildSubmilestones", "by_build", activeBuild._id)
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
      auditEvents,
      buildMilestones,
      buildSubmilestones,
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
    return {
      columns: PROPOSAL_COLUMNS.map((id) => ({
        cards: cards.filter((card) => card.column === id),
        id,
        name: titleCase(id),
      })),
    };
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

    const auth = {
      brokerage: scope.brokerage,
      roles: scope.roles,
      subject: scope.subject,
    };

    const [archetypes, templates, workflowRules] = await Promise.all([
      ctx.db
        .query("milestoneArchetypes")
        .withIndex("by_brokerage_key", (q) =>
          q.eq("brokerageId", auth.brokerage._id),
        )
        .collect(),
      ctx.db
        .query("proposalTemplates")
        .withIndex("by_brokerage", (q) => q.eq("brokerageId", auth.brokerage._id))
        .collect(),
      ctx.db
        .query("workflowRules")
        .withIndex("by_brokerage", (q) => q.eq("brokerageId", auth.brokerage._id))
        .collect(),
    ]);

    return {
      archetypes,
      brokerage: auth.brokerage,
      templates: await collectProposalTemplateDetails(ctx, auth.brokerage._id),
      workflowRules,
    };
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
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    const build = await ctx.db.get(buildId);
    if (!build || build.brokerageId !== auth.brokerage._id) {
      return null;
    }
    const [loanFacilities, capitalPlans, milestones, submilestones, draws] =
      await Promise.all([
        collectByIndex(ctx, "loanFacilities", "by_build", buildId),
        collectByIndex(ctx, "buildCapitalPlans", "by_build", buildId),
        collectByIndex(ctx, "buildMilestones", "by_build", buildId),
        collectByIndex(ctx, "buildSubmilestones", "by_build", buildId),
        collectByIndex(ctx, "plannedDrawScheduleRows", "by_build", buildId),
      ]);
    return {
      build,
      capitalPlan: capitalPlans[0] ?? null,
      draws,
      loanFacility: loanFacilities[0] ?? null,
      milestones,
      submilestones,
    };
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
    await assertBackofficeProposalRead(ctx, auth, proposal);
  } else {
    await assertBuilderOwnership(ctx, proposal.builderProfileId, auth.subject);
  }
  return { ...auth, proposal };
}

async function assertBuilderProfileScope(
  ctx: QueryCtx | MutationCtx,
  builderProfileId: Id<"builderProfiles">,
  brokerageId: Id<"brokerages">,
) {
  const builder = await ctx.db.get(builderProfileId);
  if (!builder || builder.brokerageId !== brokerageId || builder.status !== "active") {
    throw new Error("Forbidden: builder scope");
  }
}

async function assertBuilderOwnership(
  ctx: QueryCtx | MutationCtx,
  builderProfileId: Id<"builderProfiles">,
  workosUserId: string,
) {
  const link = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder_user", (q) =>
      q.eq("builderProfileId", builderProfileId).eq("workosUserId", workosUserId),
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

function isBackoffice(roles: readonly RoleSlug[]) {
  return roles.some((role) =>
    (BACKOFFICE_ROLES as readonly RoleSlug[]).includes(role),
  );
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
    (await hasPermission(ctx, auth.brokerage.workosOrganizationId, auth.roles, "proposals:read"))
  ) {
    return;
  }

  throw new Error("Forbidden: proposal scope");
}

function canReadBackofficeProposal(
  auth: {
    roles: RoleSlug[];
    subject: string;
  },
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
  if (auth.roles.includes("admin") || auth.roles.includes("principle-broker")) {
    return;
  }
  if (
    auth.roles.includes("broker") &&
    proposal.assignedBrokerWorkosUserId === auth.subject
  ) {
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

function calculateDrawAvailability(budgetCents: number, borrowerCoPayBps: number) {
  return Math.round((budgetCents * (10_000 - borrowerCoPayBps)) / 10_000);
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
    return undefined;
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
    return undefined;
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

function requireProductionTimelineEditable(auth: {
  proposal: Doc<"buildProposals">;
  roles: RoleSlug[];
  subject: string;
}) {
  if (auth.proposal.status === "draft") {
    return;
  }
  if (auth.proposal.status === "approved") {
    return;
  }
  if (auth.proposal.status === "submitted" && isBackoffice(auth.roles)) {
    requireBackofficeProposalWrite(auth, auth.proposal);
    return;
  }
  throw new Error("Timeline is locked in this proposal state.");
}

function requireProductionTimelineDraftStructureWrite(auth: {
  proposal: Doc<"buildProposals">;
  roles: RoleSlug[];
  subject: string;
}) {
  if (auth.proposal.status !== "draft") {
    throw new Error("Proposal structure is locked after submission.");
  }
  if (isBackoffice(auth.roles)) {
    requireBackofficeProposalWrite(auth, auth.proposal);
  }
}

function requireProductionTimelineLiveWrite(auth: {
  proposal: Doc<"buildProposals">;
  roles: RoleSlug[];
  subject: string;
}) {
  if (auth.proposal.status !== "approved") {
    throw new Error("Live-build timeline actions require an approved proposal.");
  }
  if (isBackoffice(auth.roles)) {
    requireBackofficeProposalWrite(auth, auth.proposal);
  }
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
  if (milestone.dayEnd < milestone.dayStart) {
    throw new Error("Milestone end day must be after start day.");
  }
  const now = Date.now();
  const budgetCents = Math.max(0, Math.round(milestone.budgetCents));
  const milestoneId = await ctx.db.insert("proposalMilestones", {
    brokerageId: auth.brokerage._id,
    budgetCents,
    createdAt: now,
    dayEnd: Math.round(milestone.dayEnd),
    dayStart: Math.round(milestone.dayStart),
    dependencyKeys: milestone.dependencyKeys ?? [],
    drawAvailabilityCents:
      milestone.drawAvailabilityCents === undefined
        ? calculateDrawAvailability(budgetCents, auth.proposal.borrowerCoPayBps)
        : Math.max(0, Math.round(milestone.drawAvailabilityCents)),
    durationDays: Math.max(1, Math.round(milestone.durationDays)),
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
    rows: milestone.submilestones ?? [],
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
    }[];
  },
) {
  const existing = await ctx.db
    .query("proposalSubmilestones")
    .withIndex("by_milestone", (q) => q.eq("proposalMilestoneId", input.milestone._id))
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
      updatedAt: now,
    });
  }
}

async function deleteProductionMilestoneCascade(
  ctx: MutationCtx,
  proposalId: Id<"buildProposals">,
  milestone: Doc<"proposalMilestones">,
) {
  const submilestones = await ctx.db
    .query("proposalSubmilestones")
    .withIndex("by_milestone", (q) => q.eq("proposalMilestoneId", milestone._id))
    .collect();
  for (const row of submilestones) {
    await ctx.db.delete(row._id);
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
  for (const draw of draws.filter((row: any) => row.milestoneKey === milestone.key)) {
    await ctx.db.delete(draw._id);
  }
  await ctx.db.delete(milestone._id);
}

async function recalculateProposalBudget(
  ctx: MutationCtx,
  auth: { subject: string },
  proposalId: Id<"buildProposals">,
) {
  const milestones = await collectByIndex(
    ctx,
    "proposalMilestones",
    "by_proposal",
    proposalId,
  );
  const totalBudgetCents = milestones.reduce(
    (total: number, milestone: any) => total + milestone.budgetCents,
    0,
  );
  await ctx.db.patch(proposalId, {
    totalBudgetCents,
    updatedAt: Date.now(),
    updatedByWorkosUserId: auth.subject,
  });
  await upsertKanbanCard(ctx, proposalId, Date.now());
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

async function deleteProposalPlanChildren(ctx: MutationCtx, proposalId: Id<"buildProposals">) {
  for (const table of [
    "proposalTimelineModificationRequests",
    "proposalEvidenceAssets",
    "proposalCapitalEvents",
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
  const builder = await ctx.db.get(proposal.builderProfileId);
  const existing = await ctx.db
    .query("proposalKanbanCards")
    .withIndex("by_proposal", (q) => q.eq("proposalId", proposalId))
    .unique();
  const card = {
    brokerageId: proposal.brokerageId,
    builderName: builder?.displayName ?? "Builder",
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

async function getActiveWorkflowRule(ctx: QueryCtx | MutationCtx, brokerageId: Id<"brokerages">) {
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

async function getWorkflowSnapshot(ctx: QueryCtx | MutationCtx, proposal: Doc<"buildProposals">) {
  if (!proposal.workflowRuleSnapshotId) {
    throw new Error("Proposal is missing workflow rule snapshot.");
  }
  const snapshot = await ctx.db.get(proposal.workflowRuleSnapshotId);
  if (!snapshot) {
    throw new Error("Proposal workflow rule snapshot was not found.");
  }
  return snapshot;
}

async function getPermitDocument(ctx: QueryCtx | MutationCtx, proposalId: Id<"buildProposals">) {
  return await ctx.db
    .query("proposalDocuments")
    .withIndex("by_proposal_type", (q) =>
      q.eq("proposalId", proposalId).eq("documentType", "permit"),
    )
    .first();
}

async function getPermitWaiver(ctx: QueryCtx | MutationCtx, proposalId: Id<"buildProposals">) {
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
      .withIndex("by_builder", (q) => q.eq("builderProfileId", link.builderProfileId))
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

async function collectProposalTemplateDetails(
  ctx: QueryCtx,
  brokerageId: Id<"brokerages">,
) {
  const templates = await ctx.db
    .query("proposalTemplates")
    .withIndex("by_brokerage", (q) => q.eq("brokerageId", brokerageId))
    .collect();
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
      const submilestones = await ctx.db
        .query("proposalTemplateSubmilestones")
        .withIndex("by_template_milestone", (q) =>
          q.eq("templateMilestoneId", milestone._id),
        )
        .collect();
      milestoneDetails.push({ ...milestone, submilestones });
    }
    templateDetails.push({
      ...template,
      milestones: milestoneDetails,
      scenarios,
    });
  }
  return templateDetails;
}

async function collectByIndex<TableName extends keyof any>(
  ctx: QueryCtx | MutationCtx,
  table: TableName,
  indexName: string,
  id: string,
) {
  return await (ctx.db.query(table as never) as any)
    .withIndex(indexName, (q: any) => q.eq(indexName === "by_build" ? "buildId" : "proposalId", id))
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
    .withIndex("by_organization", (q) => q.eq("organizationId", input.organizationId))
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
      q.eq("builderProfileId", input.builderProfileId).eq("workosUserId", input.workosUserId),
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { status: "active", updatedAt: input.now });
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

async function ensureProposalTemplate(
  ctx: MutationCtx,
  input: { brokerageId: Id<"brokerages">; now: number; organizationId: string },
) {
  const existing = await ctx.db
    .query("proposalTemplates")
    .withIndex("by_brokerage_template", (q) =>
      q.eq("brokerageId", input.brokerageId).eq("templateKey", "single-family-full-build"),
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
      description: "Site prep, excavation, footings, forms, and foundation pour.",
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
    percentageBps: 2_500,
  });
  await ensureTemplateSubmilestone(ctx, {
    ...input,
    durationDays: 12,
    key: "forms-and-pour",
    milestoneKey: "foundation",
    name: "Forms and pour",
    order: 1,
    percentageBps: 1_200,
    templateMilestoneId: foundationMilestoneId,
  });
  await ensureTemplateSubmilestone(ctx, {
    ...input,
    durationDays: 8,
    key: "waterproofing",
    milestoneKey: "foundation",
    name: "Waterproofing and backfill",
    order: 2,
    percentageBps: 1_300,
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
    percentageBps: 3_500,
  });
  await ensureTemplateMilestone(ctx, {
    ...input,
    archetypeKey: "interior-finish",
    dependencyKeys: ["shell-dry-in"],
    durationDays: 60,
    key: "interior-finish",
    name: "Interior Finish",
    order: 3,
    percentageBps: 4_000,
  });

  for (const scenario of [
    {
      isDefault: true,
      name: "Cheapest Feasible",
      scenarioKey: "cheapest-feasible",
    },
    {
      isDefault: false,
      name: "Fastest",
      scenarioKey: "fastest",
    },
    {
      isDefault: false,
      name: "Capital-Constrained",
      scenarioKey: "capital-constrained",
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
    isDefault: boolean;
    name: string;
    now: number;
    organizationId: string;
    scenarioKey: string;
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
    isDefault: input.isDefault,
    name: input.name,
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
      q.eq("brokerageId", input.brokerageId).eq("ruleKey", DEFAULT_WORKFLOW_RULE_KEY),
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { status: "active", updatedAt: input.now });
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
    borrowerCoPayBps: 2_000,
    borrowerWorkingCapitalLimitCents: 40_000_000,
    buildName: input.buildName,
    builderProfileId: input.builderProfileId,
    createdAt: input.now,
    createdByWorkosUserId: "user_builder",
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
        },
        {
          budgetCents: 16_000_000,
          durationDays: 8,
          key: "waterproofing",
          name: "Waterproofing and backfill",
          order: 2,
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
      }[],
    },
  ];
  let totalBudgetCents = 0;
  for (const milestone of milestones) {
    totalBudgetCents += milestone.budgetCents;
    const drawAvailabilityCents = calculateDrawAvailability(
      milestone.budgetCents,
      2_000,
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
  const workflowRule = await getActiveWorkflowRule(ctx, input.auth.brokerage._id);
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
  const buildId = await ctx.db.insert("activeBuilds", {
    brokerageId: input.auth.brokerage._id,
    buildName: proposal.buildName,
    builderProfileId: proposal.builderProfileId,
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
    totalBudgetCents: proposal.totalBudgetCents,
    updatedAt: input.now,
    workflowRuleSnapshotId: proposal.workflowRuleSnapshotId,
  });
  await ctx.db.insert("buildBrokerAssignments", {
    assignedBrokerWorkosUserId: proposal.assignedBrokerWorkosUserId ?? input.auth.subject,
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
      createdAt: input.now,
      dayEnd: milestone.dayEnd,
      dayStart: milestone.dayStart,
      dependencyKeys: milestone.dependencyKeys,
      drawAvailabilityCents: milestone.drawAvailabilityCents,
      durationDays: milestone.durationDays,
      key: milestone.key,
      name: milestone.name,
      order: milestone.order,
      organizationId: input.organizationId,
      proposalMilestoneId: milestone._id,
      status: "planned",
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
    const buildMilestoneId = buildMilestoneIds.get(submilestone.proposalMilestoneId);
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
      status: "planned",
      timingDay: draw.timingDay,
      updatedAt: input.now,
    });
  }
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
