/**
 * Production proposals seed scenario bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type RoleSlug } from "../authz";
import { requireDefaultBrokerMember } from "../brokerAssignments";
import { upsertSubmilestoneScopeV1Draft } from "../submilestone_scope_contracts";
import { type Doc, type Id, type MutationCtx } from "../types";
import { labeledCanonicalTiptapDocument } from "./contracts_foundation.js";
import { seedCloseProposal } from "./legacy_seed.js";
import { upsertKanbanCard, writeProposalEvent } from "./proposal_copy_audit.js";
import { upsertProposalSubmilestoneFieldGuidance } from "./proposal_draft_persistence.js";
import { calculateDrawAvailability } from "./proposal_lender_approval.js";
import { getActiveWorkflowRule } from "./storage_helpers.js";

type SeedScenario =
  | "draft"
  | "submitted"
  | "approved_with_permit"
  | "approved_with_waiver"
  | "requested_changes"
  | "rejected"
  | "closed";

export async function ensureSeedScenarioProposal(
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

  const { workosUserId: assignedBrokerWorkosUserId } =
    await requireDefaultBrokerMember(ctx, input.auth.brokerage);
  const proposalId = await ctx.db.insert("buildProposals", {
    assignedBrokerWorkosUserId,
    brokerageId: input.brokerageId,
    borrowerCoPayBps: 2000,
    borrowerStartingCashCents: 40_000_000,
    borrowerWorkingCapitalLimitCents: 40_000_000,
    buildName: input.buildName,
    builderProfileId: input.builderProfileId,
    capitalSource: "internal",
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
    ianaTimezone: "America/Toronto",
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
    auth: { brokerage: Doc<"brokerages">; roles: RoleSlug[]; subject: string };
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
      const proposalSubmilestoneId = await ctx.db.insert(
        "proposalSubmilestones",
        {
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
        },
      );
      await upsertSubmilestoneScopeV1Draft(ctx, {
        authoredByWorkosUserId: input.auth.subject,
        brokerageId: input.brokerageId,
        now: input.now,
        organizationId: input.organizationId,
        proposalId: input.proposalId,
        proposalSubmilestoneId,
        scopeOfWorkTiptapJson: labeledCanonicalTiptapDocument(
          `${submilestone.name} contractual Scope.`,
        ),
      });
      await upsertProposalSubmilestoneFieldGuidance(ctx, {
        auth: input.auth,
        fieldGuidance: {
          cameraAnglesTiptapJson: labeledCanonicalTiptapDocument(
            `Capture the work area and completed ${submilestone.name} from multiple angles.`,
          ),
          whatToVerifyTiptapJson: labeledCanonicalTiptapDocument(
            `Verify the completed ${submilestone.name} against its contractual Scope.`,
          ),
        },
        now: input.now,
        proposalId: input.proposalId,
        proposalSubmilestoneId,
        workosOrganizationId: input.organizationId,
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
    backOfficeApprovedByWorkosUserId: undefined,
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
