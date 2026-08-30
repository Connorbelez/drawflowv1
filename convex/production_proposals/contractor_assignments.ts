/**
 * Production proposals contractor assignments bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { authenticatedMutation } from "../authz";
import { createCanonicalContractorProfile } from "../contractor_profile_application";
import { createContractorProfileInviteClaim } from "../contractorOnboarding";
import { pushProposalPlanningSnapshot } from "../proposal_collaboration_model";
import type { Id } from "../types";
import { authorizeProposal } from "./authorization_core.js";
import { requireProposalAppPermission } from "./builder_staff_access.js";
import {
  deriveContractorAssignmentCost,
  getScopedContractorOrThrow,
  normalizeOptionalHours,
  normalizeOptionalMoneyCents,
  normalizeOptionalString,
  replaceContractorOperatingRows,
  writeContractorProfileEvent,
} from "./contractor_policy_helpers.js";
import {
  ensureProposalContractorAssignment,
  findProposalMilestoneContractorAssignment,
  resolveProposalAssignmentSubmilestones,
} from "./contractor_proposal_helpers.js";
import { requireProposalContractorPlanningWrite } from "./contractor_relationship_helpers.js";
import {
  contractorAvailabilityWindowInput,
  contractorCapabilityInput,
  contractorEquipmentInput,
  contractorKindInput,
  contractorPayRateUnitInput,
} from "./contracts_workflow.js";
import {
  getProductionMilestoneOrThrow,
  writeProposalEvent,
} from "./proposal_copy_audit.js";

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
      args.workosOrganizationId
    );
    await requireProposalContractorPlanningWrite(ctx, auth);
    const contractor = await getScopedContractorOrThrow(
      ctx,
      args.contractorId,
      auth.brokerage._id
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

export const attachAndInviteProposalContractor = authenticatedMutation
  .input({
    agreedRateCents: v.optional(v.number()),
    agreedRateUnit: v.optional(contractorPayRateUnitInput),
    contractorId: v.id("contractorProfiles"),
    endDay: v.optional(v.number()),
    expiresInDays: v.optional(v.number()),
    notes: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    role: v.string(),
    startDay: v.optional(v.number()),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      contractorInviteClaimId: v.id("contractorInviteClaims"),
      proposalContractorAssignmentId: v.id("proposalContractorAssignments"),
    })
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId
    );
    await requireProposalContractorPlanningWrite(ctx, auth);
    await requireProposalAppPermission(ctx, auth, "contractor", "create");
    const contractor = await getScopedContractorOrThrow(
      ctx,
      args.contractorId,
      auth.brokerage._id
    );
    if (contractor.status !== "active") {
      throw new Error("Production contractor is inactive.");
    }

    const proposalContractorAssignmentId =
      await ensureProposalContractorAssignment(ctx, {
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
    const contractorInviteClaimId = await createContractorProfileInviteClaim(
      ctx,
      {
        actorRoles: auth.roles,
        actorSubject: auth.subject,
        brokerageId: auth.brokerage._id,
        contractor,
        expiresInDays: args.expiresInDays,
        workosOrganizationId: args.workosOrganizationId,
      }
    );
    await writeProposalEvent(ctx, {
      auth,
      command: "attachAndInviteProposalContractor",
      eventType: "proposal.contractor.attached_invited",
      newState: JSON.stringify({
        contractorId: args.contractorId,
        contractorInviteClaimId,
        proposalContractorAssignmentId,
        role: args.role,
      }),
      proposalId: args.proposalId,
      reason: args.notes,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return { contractorInviteClaimId, proposalContractorAssignmentId };
  })
  .public();

export const createAndAttachProposalContractor = authenticatedMutation
  .input({
    contractor: v.object({
      availabilityWindows: v.optional(
        v.array(contractorAvailabilityWindowInput)
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
    })
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId
    );
    await requireProposalContractorPlanningWrite(ctx, auth);
    await requireProposalAppPermission(ctx, auth, "contractor", "create");
    const now = Date.now();
    const contractorId = await createCanonicalContractorProfile(ctx, {
      brokerageId: auth.brokerage._id,
      fields: {
        city: normalizeOptionalString(args.contractor.city),
        defaultPayRateCents:
          args.contractor.defaultPayRateCents === undefined
            ? undefined
            : Math.max(0, Math.round(args.contractor.defaultPayRateCents)),
        defaultPayRateUnit: args.contractor.defaultPayRateUnit,
        email: normalizeOptionalString(args.contractor.email),
        kind: args.contractor.kind ?? "company",
        name: args.contractor.name.trim(),
        onboardingStatus: "profile_only",
        phone: normalizeOptionalString(args.contractor.phone),
        status: "active",
        trades: args.contractor.trades
          .map((trade) => trade.trim())
          .filter(Boolean),
      },
      now,
      organizationId: args.workosOrganizationId,
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
        v.literal("removed")
      )
    ),
    submilestoneKeys: v.optional(v.array(v.string())),
    workosOrganizationId: v.string(),
  })
  .returns(v.array(v.id("proposalMilestoneContractorAssignments")))
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId
    );
    await requireProposalContractorPlanningWrite(ctx, auth);
    const contractor = await getScopedContractorOrThrow(
      ctx,
      args.contractorId,
      auth.brokerage._id
    );
    if (contractor.status !== "active") {
      throw new Error("Production contractor is inactive.");
    }
    const milestone = await getProductionMilestoneOrThrow(
      ctx,
      args.proposalId,
      args.milestoneKey
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
      }
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
          })
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
