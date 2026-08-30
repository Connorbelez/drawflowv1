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
  contractorRoleQuery,
  authorizeAssignmentScope,
  writeEvidenceEvent,
  viewerSubject,
  viewerRoles,
  resolveBrokerageScopeOrThrow,
} from "./access";
import {
  findAcknowledgement,
  completeContractorAssignmentHandoff,
} from "./handoffs";
// ---------------------------------------------------------------------------
// Scope clarification + disputes (PRD §13.6, §14.3, user stories 27-29)
// ---------------------------------------------------------------------------

/**
 * Request a scope clarification (PRD user story 28). Opens a clarification
 * issue against an assigned scope; routes to builder/backoffice for response.
 */
export const requestContractorScopeClarification = contractorRoleMutation
  .input({
    assignmentType: v.union(v.literal("proposal"), v.literal("build")),
    proposalAssignmentId: v.optional(
      v.id("proposalMilestoneContractorAssignments")
    ),
    buildAssignmentId: v.optional(v.id("milestoneContractorAssignments")),
    milestoneKey: v.string(),
    submilestoneKey: v.optional(v.string()),
    summary: v.string(),
    detail: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorScopeIssues"))
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    const { proposalId, buildId } = await authorizeAssignmentScope(
      ctx,
      contractor._id,
      args
    );
    return await createScopeIssue(ctx, {
      args,
      buildId,
      contractorId: contractor._id,
      kind: "clarification",
      proposalId,
      raisedByRole: "contractor",
      raisedBySubject: viewerSubject(ctx),
      roles: viewerRoles(ctx),
      scopeBrokerageId: contractor.brokerageId,
    });
  })
  .public();
/**
 * Flag a scope mismatch (PRD user story 27). Surfaces scope risk as an
 * attention flag visible to backoffice (PRD user story 66).
 */
export const flagContractorScopeMismatch = contractorRoleMutation
  .input({
    assignmentType: v.union(v.literal("proposal"), v.literal("build")),
    proposalAssignmentId: v.optional(
      v.id("proposalMilestoneContractorAssignments")
    ),
    buildAssignmentId: v.optional(v.id("milestoneContractorAssignments")),
    milestoneKey: v.string(),
    submilestoneKey: v.optional(v.string()),
    summary: v.string(),
    detail: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorScopeIssues"))
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    const { proposalId, buildId } = await authorizeAssignmentScope(
      ctx,
      contractor._id,
      args
    );
    return await createScopeIssue(ctx, {
      args,
      buildId,
      contractorId: contractor._id,
      kind: "mismatch",
      proposalId,
      raisedByRole: "contractor",
      raisedBySubject: viewerSubject(ctx),
      roles: viewerRoles(ctx),
      scopeBrokerageId: contractor.brokerageId,
    });
  })
  .public();

export async function createScopeIssue(
  ctx: MutationCtx,
  input: {
    args: {
      assignmentType: "proposal" | "build";
      milestoneKey: string;
      submilestoneKey?: string;
      summary: string;
      detail?: string;
      workosOrganizationId: string;
      proposalAssignmentId?: Id<"proposalMilestoneContractorAssignments">;
      buildAssignmentId?: Id<"milestoneContractorAssignments">;
    };
    buildId: Id<"activeBuilds"> | null;
    contractorId: Id<"contractorProfiles">;
    kind: "clarification" | "mismatch" | "schedule_conflict";
    proposalId: Id<"buildProposals"> | null;
    raisedByRole: string;
    raisedBySubject: string;
    roles: readonly RoleSlug[];
    scopeBrokerageId: Id<"brokerages">;
  }
) {
  const now = Date.now();
  const issueId = await ctx.db.insert("contractorScopeIssues", {
    assignmentType: input.args.assignmentType,
    brokerageId: input.scopeBrokerageId,
    buildAssignmentId: input.args.buildAssignmentId,
    buildId: input.buildId ?? undefined,
    contractorId: input.contractorId,
    createdAt: now,
    detail: input.args.detail,
    kind: input.kind,
    milestoneKey: input.args.milestoneKey,
    organizationId: input.args.workosOrganizationId,
    proposalAssignmentId: input.args.proposalAssignmentId,
    proposalId: input.proposalId ?? undefined,
    raisedByRole: input.raisedByRole,
    raisedByWorkosUserId: input.raisedBySubject,
    status: "open",
    submilestoneKey: input.args.submilestoneKey,
    summary: input.args.summary,
    updatedAt: now,
  });
  const acknowledgementState =
    input.kind === "mismatch" ? "scope_disputed" : "clarification_requested";
  const acknowledgement = await findAcknowledgement(ctx, input.contractorId, {
    assignmentType: input.args.assignmentType,
    buildAssignmentId: input.args.buildAssignmentId,
    kind: "assignment",
    proposalAssignmentId: input.args.proposalAssignmentId,
  });
  if (acknowledgement) {
    await ctx.db.patch(acknowledgement._id, {
      acknowledgedAt: undefined,
      state: acknowledgementState,
      updatedAt: now,
    });
  }
  const contractor = await ctx.db.get(input.contractorId);
  if (contractor) {
    await completeContractorAssignmentHandoff(ctx, {
      assignmentScope: {
        buildId: input.buildId,
        proposalId: input.proposalId,
      },
      buildAssignmentId: input.args.buildAssignmentId,
      contractor,
      now,
      proposalAssignmentId: input.args.proposalAssignmentId,
      response: acknowledgementState,
    });
  }
  await writeEvidenceEvent(ctx, {
    actorRoles: input.roles,
    actorSubject: input.raisedBySubject,
    brokerageId: input.scopeBrokerageId,
    command:
      input.kind === "mismatch"
        ? "flagContractorScopeMismatch"
        : "requestContractorScopeClarification",
    contractorId: input.contractorId,
    eventType:
      input.kind === "mismatch"
        ? "contractor.scope.mismatch_flagged"
        : "contractor.scope.clarification_requested",
    newState: JSON.stringify({
      issueId,
      milestoneKey: input.args.milestoneKey,
    }),
    organizationId: input.args.workosOrganizationId,
  });
  return issueId;
}

/**
 * Builder/backoffice resolve a contractor scope issue (PRD user story 50, §14.3
 * resolved transitions).
 */
export const resolveContractorScopeIssue = backofficeMutation
  .input({
    issueId: v.id("contractorScopeIssues"),
    note: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorScopeIssues"))
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    const issue = await ctx.db.get(args.issueId);
    if (!issue || issue.brokerageId !== scope.brokerage._id) {
      throw new Error("Scope issue not found in brokerage.");
    }
    const now = Date.now();
    await ctx.db.patch(args.issueId, {
      resolutionNote: args.note,
      resolvedAt: now,
      resolvedByWorkosUserId: scope.subject,
      status: "resolved",
      updatedAt: now,
    });
    const acknowledgement = await findAcknowledgement(ctx, issue.contractorId, {
      assignmentType: issue.assignmentType,
      buildAssignmentId: issue.buildAssignmentId,
      kind: "assignment",
      proposalAssignmentId: issue.proposalAssignmentId,
    });
    if (acknowledgement) {
      await ctx.db.patch(acknowledgement._id, {
        state: "resolved",
        updatedAt: now,
      });
    }
    const contractor = await ctx.db.get(issue.contractorId);
    const contractorRecipient = contractor?.accountWorkosUserId;
    if (contractor && contractorRecipient) {
      const dedupeKey = `contractor-scope-resolution:${issue._id}`;
      const existingDelivery = await ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient_dedupe", (q) =>
          q
            .eq("organizationId", issue.organizationId)
            .eq("recipientWorkosUserId", contractorRecipient)
            .eq("dedupeKey", dedupeKey)
        )
        .first();
      const delivery = {
        actionLabel: issue.buildId ? "Review assignment" : "View work",
        actionRequired: false,
        body:
          args.note ?? "The Builder resolved your assignment scope request.",
        createdAt: now,
        entityId: String(issue._id),
        entityLabel: `${contractor.name} · ${issue.milestoneKey}`,
        entityType: "contractorScopeIssue",
        href: issue.buildId
          ? `/contractor/builds/${issue.buildId}?assignmentId=${issue.buildAssignmentId ?? ""}`
          : "/contractor/work",
        resolutionMode: "domain" as const,
        sourceLabel: "Builder",
        status: "unread" as const,
        title: "Assignment scope response ready",
        updatedAt: now,
      };
      if (existingDelivery) {
        await ctx.db.patch(existingDelivery._id, delivery);
      } else {
        await ctx.db.insert("recipientDeliveries", {
          ...delivery,
          brokerageId: issue.brokerageId,
          dedupeKey,
          organizationId: issue.organizationId,
          recipientWorkosUserId: contractorRecipient,
        });
      }
    }
    await ctx.db.insert("contractorNotifications", {
      brokerageId: scope.brokerage._id,
      body: args.note,
      buildId: issue.buildId,
      channel: "in_app",
      contractorId: issue.contractorId,
      kind: "clarification_resolved",
      milestoneKey: issue.milestoneKey,
      organizationId: args.workosOrganizationId,
      proposalId: issue.proposalId,
      scopeIssueId: issue._id,
      title: "Scope issue resolved",
      createdAt: now,
    });
    await ctx.db.insert("auditEvents", {
      actorRoles: scope.roles as RoleSlug[],
      actorWorkosUserId: scope.subject,
      brokerageId: scope.brokerage._id,
      command: "resolveContractorScopeIssue",
      createdAt: now,
      entityId: String(issue._id),
      entityType: "contractorScopeIssue",
      eventType: "contractor.scope.resolved",
      newState: JSON.stringify({ note: args.note }),
      organizationId: args.workosOrganizationId,
      warnings: [],
    });
    return issue._id;
  })
  .public();

/**
 * Contractor-visible scope issues for their profile (PRD user story 29).
 */
export const listContractorScopeIssues = contractorRoleQuery
  .returns(v.any())
  .handler(async (ctx) => {
    const contractor = ctx.contractorProfile;
    const rows = await ctx.db
      .query("contractorScopeIssues")
      .withIndex("by_contractor", (q) => q.eq("contractorId", contractor._id))
      .collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((row) => ({
        _id: row._id,
        assignmentType: row.assignmentType,
        milestoneKey: row.milestoneKey,
        submilestoneKey: row.submilestoneKey ?? null,
        kind: row.kind,
        status: row.status,
        summary: row.summary,
        detail: row.detail ?? null,
        resolutionNote: row.resolutionNote ?? null,
        resolvedAt: row.resolvedAt ?? null,
        createdAt: row.createdAt,
        proposalId: row.proposalId ?? null,
        buildId: row.buildId ?? null,
      }));
  })
  .public();
