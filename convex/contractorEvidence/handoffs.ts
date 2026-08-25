import { v } from "convex/values";

import {
  type AuthorizedViewer,
  type RoleSlug,
  backofficeMutation,
  backofficeQuery,
  contractorMutation,
  contractorQuery,
  normalizeRoleSlugs,
} from "../authz";
import { requireContractorLinkedProfile } from "../contractorAuth";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

import {
  contractorRoleMutation,
  authorizeAssignmentScope,
  writeEvidenceEvent,
  viewerSubject,
  viewerRoles,
} from "./access";
export const acknowledgeContractorAssignment = contractorRoleMutation
  .input({
    assignmentType: v.union(v.literal("proposal"), v.literal("build")),
    proposalAssignmentId: v.optional(
      v.id("proposalMilestoneContractorAssignments")
    ),
    buildAssignmentId: v.optional(v.id("milestoneContractorAssignments")),
    kind: v.union(v.literal("assignment"), v.literal("schedule")),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorAcknowledgements"))
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    const assignmentScope = await authorizeAssignmentScope(
      ctx,
      contractor._id,
      {
        assignmentType: args.assignmentType,
        buildAssignmentId: args.buildAssignmentId,
        milestoneKey: "",
        proposalAssignmentId: args.proposalAssignmentId,
      }
    );
    const now = Date.now();
    const existing = await findAcknowledgement(ctx, contractor._id, args);
    let acknowledgementId: Id<"contractorAcknowledgements">;
    if (existing) {
      await ctx.db.patch(existing._id, {
        acknowledgedAt: now,
        state: "acknowledged",
        updatedAt: now,
      });
      acknowledgementId = existing._id;
    } else {
      acknowledgementId = await ctx.db.insert("contractorAcknowledgements", {
        acknowledgedAt: now,
        assignmentType: args.assignmentType,
        brokerageId: contractor.brokerageId,
        buildAssignmentId: args.buildAssignmentId,
        contractorId: contractor._id,
        kind: args.kind,
        organizationId: args.workosOrganizationId,
        proposalAssignmentId: args.proposalAssignmentId,
        state: "acknowledged",
        createdAt: now,
        updatedAt: now,
      });
    }
    await completeContractorAssignmentHandoff(ctx, {
      assignmentScope,
      contractor,
      now,
      response: "acknowledged",
      buildAssignmentId: args.buildAssignmentId,
      proposalAssignmentId: args.proposalAssignmentId,
    });
    await writeEvidenceEvent(ctx, {
      actorRoles: viewerRoles(ctx),
      actorSubject: viewerSubject(ctx),
      brokerageId: contractor.brokerageId,
      command: "acknowledgeContractorAssignment",
      contractorId: contractor._id,
      eventType: "contractor.assignment.acknowledged",
      newState: JSON.stringify({
        acknowledgementId,
        assignmentType: args.assignmentType,
        buildAssignmentId: args.buildAssignmentId,
        proposalAssignmentId: args.proposalAssignmentId,
      }),
      organizationId: args.workosOrganizationId,
    });
    return acknowledgementId;
  })
  .public();

/**
 * Acknowledge a schedule change specifically (PRD user story 26). Same storage
 * as assignment ack but kind=schedule, so builders/backoffice can distinguish
 * "saw my assignment" from "saw the schedule update".
 */
export const acknowledgeContractorScheduleChange = contractorRoleMutation
  .input({
    assignmentType: v.union(v.literal("proposal"), v.literal("build")),
    proposalAssignmentId: v.optional(
      v.id("proposalMilestoneContractorAssignments")
    ),
    buildAssignmentId: v.optional(v.id("milestoneContractorAssignments")),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorAcknowledgements"))
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    await authorizeAssignmentScope(ctx, contractor._id, {
      assignmentType: args.assignmentType,
      buildAssignmentId: args.buildAssignmentId,
      milestoneKey: "",
      proposalAssignmentId: args.proposalAssignmentId,
    });
    const now = Date.now();
    const existing = await findAcknowledgement(ctx, contractor._id, {
      ...args,
      kind: "schedule",
    });
    if (existing) {
      await ctx.db.patch(existing._id, {
        acknowledgedAt: now,
        state: "acknowledged",
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("contractorAcknowledgements", {
      acknowledgedAt: now,
      assignmentType: args.assignmentType,
      brokerageId: contractor.brokerageId,
      buildAssignmentId: args.buildAssignmentId,
      contractorId: contractor._id,
      kind: "schedule",
      organizationId: args.workosOrganizationId,
      proposalAssignmentId: args.proposalAssignmentId,
      state: "acknowledged",
      createdAt: now,
      updatedAt: now,
    });
  })
  .public();

export async function findAcknowledgement(
  ctx: QueryCtx,
  contractorId: Id<"contractorProfiles">,
  input: {
    assignmentType: "proposal" | "build";
    proposalAssignmentId?: Id<"proposalMilestoneContractorAssignments">;
    buildAssignmentId?: Id<"milestoneContractorAssignments">;
    kind: "assignment" | "schedule";
  }
): Promise<Doc<"contractorAcknowledgements"> | null> {
  const rows = await ctx.db
    .query("contractorAcknowledgements")
    .withIndex("by_contractor_kind_state", (q) =>
      q.eq("contractorId", contractorId).eq("kind", input.kind)
    )
    .collect();
  return (
    rows.find(
      (row) =>
        row.assignmentType === input.assignmentType &&
        ((input.assignmentType === "proposal" &&
          row.proposalAssignmentId === input.proposalAssignmentId) ||
          (input.assignmentType === "build" &&
            row.buildAssignmentId === input.buildAssignmentId))
    ) ?? null
  );
}

export async function completeContractorAssignmentHandoff(
  ctx: MutationCtx,
  input: {
    assignmentScope: {
      buildId: Id<"activeBuilds"> | null;
      proposalId: Id<"buildProposals"> | null;
    };
    buildAssignmentId?: Id<"milestoneContractorAssignments">;
    contractor: Doc<"contractorProfiles">;
    now: number;
    proposalAssignmentId?: Id<"proposalMilestoneContractorAssignments">;
    response: "acknowledged" | "clarification_requested" | "scope_disputed";
  }
) {
  const assignmentId = input.buildAssignmentId ?? input.proposalAssignmentId;
  if (!assignmentId) {
    return;
  }
  const contractorRecipient = input.contractor.accountWorkosUserId;
  if (contractorRecipient && input.buildAssignmentId) {
    for (const operation of ["created", "updated"] as const) {
      const delivery = await ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient_dedupe", (q) =>
          q
            .eq("organizationId", input.contractor.organizationId)
            .eq("recipientWorkosUserId", contractorRecipient)
            .eq(
              "dedupeKey",
              `contractor-assignment:${input.buildAssignmentId}:${operation}`
            )
        )
        .first();
      if (delivery && delivery.status !== "resolved") {
        await ctx.db.patch(delivery._id, {
          status: "resolved",
          updatedAt: input.now,
        });
      }
    }
  }

  const proposal = input.assignmentScope.proposalId
    ? await ctx.db.get(input.assignmentScope.proposalId)
    : input.assignmentScope.buildId
      ? await ctx.db
          .get(input.assignmentScope.buildId)
          .then((build) => (build ? ctx.db.get(build.proposalId) : null))
      : null;
  if (!proposal?.builderProfileId) {
    return;
  }
  const builderProfileId = proposal.builderProfileId;
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder", (q) => q.eq("builderProfileId", builderProfileId))
    .collect();
  const recipients = new Set(
    links
      .filter(
        (link) =>
          link.status === "active" &&
          link.brokerageId === input.contractor.brokerageId
      )
      .map((link) => link.workosUserId)
  );
  const build = input.assignmentScope.buildId
    ? await ctx.db.get(input.assignmentScope.buildId)
    : null;
  const responseLabel =
    input.response === "acknowledged"
      ? "acknowledged"
      : input.response === "scope_disputed"
        ? "disputed the scope"
        : "requested clarification";
  const actionRequired = input.response !== "acknowledged";
  const dedupeKey = `contractor-assignment-response:${assignmentId}:${input.response}`;
  for (const recipientWorkosUserId of recipients) {
    const existing = await ctx.db
      .query("recipientDeliveries")
      .withIndex("by_recipient_dedupe", (q) =>
        q
          .eq("organizationId", input.contractor.organizationId)
          .eq("recipientWorkosUserId", recipientWorkosUserId)
          .eq("dedupeKey", dedupeKey)
      )
      .first();
    const delivery = {
      actionLabel: actionRequired ? "Review assignment" : "View assignment",
      actionRequired,
      body: `${input.contractor.name} ${responseLabel}.`,
      createdAt: input.now,
      entityId: String(assignmentId),
      entityLabel: build
        ? `${build.buildName} · ${input.contractor.name}`
        : `${proposal.buildName} · ${input.contractor.name}`,
      entityType: "contractorAssignment",
      href: build
        ? `/builder/builds/${build._id}?tab=contractors`
        : `/builder/proposals/${proposal._id}?tab=contractors`,
      resolutionMode: "domain" as const,
      sourceLabel: "Contractor",
      status: "unread" as const,
      title: `Assignment ${responseLabel}`,
      updatedAt: input.now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, delivery);
    } else {
      await ctx.db.insert("recipientDeliveries", {
        ...delivery,
        brokerageId: input.contractor.brokerageId,
        dedupeKey,
        organizationId: input.contractor.organizationId,
        recipientWorkosUserId,
      });
    }
  }
}
