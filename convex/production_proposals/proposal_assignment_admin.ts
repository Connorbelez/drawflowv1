/**
 * Production proposals proposal assignment admin bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { ConvexError, v } from "convex/values";
import { type AuthorizedViewer, authenticatedMutation, authenticatedQuery } from "../authz";
import { assignBuilderBrokerAssignment, ensureBuilderBrokerAssignment, getBuilderBrokerAssignmentHealth, requireDefaultBrokerMember, requireEligibleBrokerMember } from "../brokerAssignments";
import { withQueryTiming } from "../fluent";
import { type Doc, type Id, type MutationCtx } from "../types";
import { hasProjectedWorkosPermission as hasPermission } from "../workos_permission_access";
import { deleteActiveBuildCascade } from "./active_planning.js";
import { authorizeBrokerage, authorizeActiveBuildOrThrow, requireBackofficeActiveBuildWrite, authorizeProposal, assertBuilderProfileScope } from "./authorization_core.js";
import { canReadBackofficeProposal, requireBackofficeProposalWrite, requireAnyRole } from "./contractor_policy_helpers.js";
import { BACKOFFICE_ROLES, APPROVER_ROLES, BACKOFFICE_BUILDER_OPTIONS_LIMIT } from "./contracts_foundation.js";
import { productionDashboardProposalCard } from "./directory_cards.js";
import { builderAccountSummaries, preferredBuilderAccountEmail } from "./proposal_claim.js";
import { deleteProposalPlanChildren, upsertKanbanCard, writeProposalEvent, writeActiveBuildEvent } from "./proposal_copy_audit.js";
import { requireReason } from "./proposal_lender_approval.js";
import { collectByIndex } from "./storage_helpers.js";

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
      const email = preferredBuilderAccountEmail(accounts);
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

export const listActiveBrokerageBuilderOptions = authenticatedQuery
  .use(
    withQueryTiming("production_proposals.listActiveBrokerageBuilderOptions"),
  )
  .input({ workosOrganizationId: v.string() })
  .returns(
    v.array(
      v.object({
        _id: v.id("builderProfiles"),
        displayName: v.string(),
      }),
    ),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeBrokerage(ctx, args.workosOrganizationId);
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    const builders = await ctx.db
      .query("builderProfiles")
      .withIndex("by_brokerage_and_status", (q) =>
        q.eq("brokerageId", auth.brokerage._id).eq("status", "active"),
      )
      .take(BACKOFFICE_BUILDER_OPTIONS_LIMIT);
    return builders
      .map((builder) => ({
        _id: builder._id,
        displayName: builder.displayName,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  })
  .public();

const proposalBrokerAssignmentOperationValidator = v.union(
  v.literal("assigned"),
  v.literal("reassigned"),
  v.literal("repaired"),
  v.literal("unchanged"),
);

export const assignProposalBroker = authenticatedMutation
  .input({
    assignedBrokerWorkosUserId: v.string(),
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      operation: proposalBrokerAssignmentOperationValidator,
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, APPROVER_ROLES);
    if (auth.proposal.status === "closed" || auth.proposal.activeBuildId) {
      throw new Error(
        "Closed proposals must be reassigned from the active Build workspace.",
      );
    }

    const reason = args.reason.trim();
    if (reason.length < 10) {
      throw new Error(
        "An assignment reason of at least 10 characters is required.",
      );
    }

    const priorAssignedBrokerWorkosUserId =
      auth.proposal.assignedBrokerWorkosUserId;
    const proposalOperation = priorAssignedBrokerWorkosUserId
      ? priorAssignedBrokerWorkosUserId === args.assignedBrokerWorkosUserId
        ? "unchanged"
        : "reassigned"
      : "assigned";
    let relationshipOperation:
      | "assigned"
      | "reassigned"
      | "repaired"
      | "unchanged" = "unchanged";

    if (auth.proposal.builderProfileId) {
      const builderProfile = await assertBuilderProfileScope(
        ctx,
        auth.proposal.builderProfileId,
        auth.brokerage._id,
      );
      const result = await assignBuilderBrokerAssignment(ctx, {
        actorRoles: auth.roles,
        actorWorkosUserId: auth.subject,
        assignedBrokerWorkosUserId: args.assignedBrokerWorkosUserId,
        brokerage: auth.brokerage,
        builderProfile,
        command: "assignProposalBroker",
        now: Date.now(),
        reason,
      });
      relationshipOperation = result.operation;
    } else {
      await requireEligibleBrokerMember(ctx, {
        workosOrganizationId: auth.brokerage.workosOrganizationId,
        workosUserId: args.assignedBrokerWorkosUserId,
      });
    }

    const operation =
      proposalOperation === "unchanged"
        ? relationshipOperation
        : proposalOperation;
    if (proposalOperation !== "unchanged") {
      const now = Date.now();
      await ctx.db.patch(args.proposalId, {
        assignedBrokerWorkosUserId: args.assignedBrokerWorkosUserId,
        updatedAt: now,
        updatedByWorkosUserId: auth.subject,
      });
      await upsertKanbanCard(ctx, args.proposalId, now);
    }

    if (operation !== "unchanged") {
      await writeProposalEvent(ctx, {
        auth,
        command: "assignProposalBroker",
        eventType: `proposal.broker_${operation}`,
        newState: JSON.stringify({
          assignedBrokerWorkosUserId: args.assignedBrokerWorkosUserId,
          builderProfileId: auth.proposal.builderProfileId,
        }),
        priorState: JSON.stringify({
          assignedBrokerWorkosUserId: priorAssignedBrokerWorkosUserId ?? null,
          builderProfileId: auth.proposal.builderProfileId,
        }),
        proposalId: args.proposalId,
        reason,
        warnings:
          relationshipOperation === "repaired"
            ? ["The attached Builder assignment required repair."]
            : [],
      });
    }

    return { operation };
  })
  .public();

type ProposalBuilderAssignmentArgs = {
  builderProfileId: Id<"builderProfiles">;
  proposalId: Id<"buildProposals">;
  workosOrganizationId: string;
};

async function assignBuilderToProposal(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  args: ProposalBuilderAssignmentArgs,
  options: {
    allowedStatuses: ReadonlySet<Doc<"buildProposals">["status"]>;
    command: "assignDraftBuilder" | "assignProposalBuilder";
    invalidStatusMessage: string;
  },
) {
  const auth = await authorizeProposal(
    ctx,
    args.proposalId,
    args.workosOrganizationId,
  );
  requireAnyRole(auth.roles, BACKOFFICE_ROLES);
  requireBackofficeProposalWrite(auth, auth.proposal);
  if (!options.allowedStatuses.has(auth.proposal.status)) {
    throw new Error(options.invalidStatusMessage);
  }
  if (auth.proposal.builderProfileId) {
    throw new Error("Proposal is already assigned to a builder.");
  }
  const builderProfile = await assertBuilderProfileScope(
    ctx,
    args.builderProfileId,
    auth.brokerage._id,
  );

  const now = Date.now();
  const assignmentHealth = await getBuilderBrokerAssignmentHealth(ctx, {
    brokerage: auth.brokerage,
    builderProfile,
  });
  if (!assignmentHealth.healthy) {
    if (assignmentHealth.reason !== "assignment_missing") {
      throw new ConvexError({
        code: "BUILDER_BROKER_ASSIGNMENT_INVALID",
        reason: assignmentHealth.reason,
        recoverable: true,
        safeMessage:
          "Repair the builder's broker relationship before attaching this Build Proposal.",
      });
    }
    const { workosUserId: assignedBrokerWorkosUserId } =
      await requireDefaultBrokerMember(ctx, auth.brokerage);
    await ensureBuilderBrokerAssignment(ctx, {
      actorRoles: auth.roles,
      actorWorkosUserId: auth.subject,
      assignedBrokerWorkosUserId,
      brokerage: auth.brokerage,
      builderProfile,
      command: options.command,
      now,
      reason:
        "Creating the missing builder broker relationship before assigning the Build Proposal.",
    });
  }
  await ctx.db.patch(args.proposalId, {
    builderProfileId: args.builderProfileId,
    updatedAt: now,
    updatedByWorkosUserId: auth.subject,
  });
  await upsertKanbanCard(ctx, args.proposalId, now);
  await writeProposalEvent(ctx, {
    auth,
    command: options.command,
    eventType: "proposal.builder_assigned",
    newState: JSON.stringify({ builderProfileId: args.builderProfileId }),
    priorState: JSON.stringify({ assignment: "unassigned" }),
    proposalId: args.proposalId,
  });
  return null;
}

export const assignDraftBuilder = authenticatedMutation
  .input({
    builderProfileId: v.id("builderProfiles"),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler((ctx, args) =>
    assignBuilderToProposal(ctx, args, {
      allowedStatuses: new Set(["draft"]),
      command: "assignDraftBuilder",
      invalidStatusMessage:
        "Only draft proposals can be assigned to a builder.",
    }),
  )
  .public();

export const assignProposalBuilder = authenticatedMutation
  .input({
    builderProfileId: v.id("builderProfiles"),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler((ctx, args) =>
    assignBuilderToProposal(ctx, args, {
      allowedStatuses: new Set(["draft", "submitted", "approved"]),
      command: "assignProposalBuilder",
      invalidStatusMessage:
        "Only draft, submitted, or approved proposals can be assigned to a builder.",
    }),
  )
  .public();

export const unassignDraftBuilder = authenticatedMutation
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
      throw new Error("Only draft proposals can be unassigned.");
    }
    if (!auth.proposal.builderProfileId) {
      throw new Error("Proposal is not assigned to a builder.");
    }

    const now = Date.now();
    await ctx.db.patch(args.proposalId, {
      builderProfileId: undefined,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await upsertKanbanCard(ctx, args.proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "unassignDraftBuilder",
      eventType: "proposal.builder_unassigned",
      newState: JSON.stringify({ assignment: "unassigned" }),
      priorState: JSON.stringify({
        builderProfileId: auth.proposal.builderProfileId,
      }),
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
