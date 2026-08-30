/**
 * Production proposals active build contractors bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { ConvexError, v } from "convex/values";
import { authenticatedMutation, type RoleSlug } from "../authz";
import { createContractorProfileInviteClaim } from "../contractorOnboarding";
import { synchronizeMilestoneSystemPostPlanning } from "../build_collaboration_system_posts";
import { ensureActiveBuildPlanningActivationRevision, recordApprovedActiveBuildPlanningRevision } from "../build_collaboration_planning_reconciliation";
import { type Doc, type Id, type MutationCtx } from "../types";
import { getActiveBuildMilestoneOrThrow, activeBuildStartTarget } from "./active_planning.js";
import { authorizeActiveBuildOrThrow, requireBackofficeActiveBuildWrite } from "./authorization_core.js";
import { requireActiveBuildAppPermission } from "./builder_staff_access.js";
import { ensureBuildContractorAssignment, resolveAssignmentSubmilestones, findMilestoneContractorAssignment, ensurePendingBuildAssignmentAcknowledgement, resolveBuildAssignmentAcknowledgement, upsertContractorAssignmentDelivery, insertContractorQualityRating } from "./contractor_active_helpers.js";
import { normalizeOptionalString, normalizeOptionalMoneyCents, normalizeOptionalHours, deriveContractorAssignmentCost, normalizeQualityRating, getScopedContractorOrThrow } from "./contractor_policy_helpers.js";
import { createOrReuseContractorProfile } from "./contractor_profiles.js";
import { contractorPayRateUnitInput, contractorProfileCreateInput, contractorQualityRatingSourceInput } from "./contracts_workflow.js";
import { writeActiveBuildEvent } from "./proposal_copy_audit.js";
import { assertExpectedSubmilestoneRevision, requireScopedAssignmentCommandInput, canonicalAssignmentExpectedRevisions, expectedAssignmentRevisionForTarget, canonicalStringKeyList, replayScopedAssignmentCommand, canonicalCommandFingerprint, insertSubmilestoneCommandReceipt } from "./submilestone_commands.js";

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
    await requireActiveBuildAppPermission(ctx, auth, "contractor", "update");
    await ensureActiveBuildPlanningActivationRevision(ctx, {
      actor: { actorRoles: auth.roles, actorWorkosUserId: auth.subject },
      build: auth.build,
    });
    await upsertActiveBuildContractorAssignment(ctx, {
      auth,
      command: "attachActiveBuildContractor",
      input: args,
    });
    return null;
  })
  .public();

export const attachAndInviteActiveBuildContractor = authenticatedMutation
  .input({
    agreedRateCents: v.optional(v.number()),
    agreedRateUnit: v.optional(contractorPayRateUnitInput),
    buildId: v.id("activeBuilds"),
    contractorId: v.id("contractorProfiles"),
    endDate: v.optional(v.string()),
    expiresInDays: v.optional(v.number()),
    notes: v.optional(v.string()),
    role: v.string(),
    startDate: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      buildContractorAssignmentId: v.id("buildContractorAssignments"),
      contractorInviteClaimId: v.id("contractorInviteClaims"),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    await requireActiveBuildAppPermission(ctx, auth, "contractor", "create");
    await requireActiveBuildAppPermission(ctx, auth, "contractor", "update");
    const buildContractorAssignmentId =
      await upsertActiveBuildContractorAssignment(ctx, {
        auth,
        command: "attachAndInviteActiveBuildContractor",
        input: args,
      });
    const contractor = await ctx.db.get(args.contractorId);
    if (
      !contractor ||
      contractor.brokerageId !== auth.brokerage._id ||
      contractor.status !== "active"
    ) {
      throw new Error("Production contractor not found.");
    }
    const contractorInviteClaimId = await createContractorProfileInviteClaim(
      ctx,
      {
        actorRoles: auth.roles,
        actorSubject: auth.subject,
        brokerageId: auth.brokerage._id,
        contractor,
        expiresInDays: args.expiresInDays,
        workosOrganizationId: args.workosOrganizationId,
      },
    );
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "attachAndInviteActiveBuildContractor",
      eventType: "active_build.contractor.invited",
      newState: JSON.stringify({
        buildContractorAssignmentId,
        contractorId: args.contractorId,
        contractorInviteClaimId,
        role: args.role,
      }),
    });
    return { buildContractorAssignmentId, contractorInviteClaimId };
  })
  .public();

export const createAndAttachActiveBuildContractor = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    contractor: v.object(contractorProfileCreateInput),
    role: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.object({ contractorId: v.id("contractorProfiles") }))
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    await requireActiveBuildAppPermission(ctx, auth, "contractor", "create");
    await requireActiveBuildAppPermission(ctx, auth, "contractor", "update");
    const contractorId = await createOrReuseContractorProfile(ctx, {
      auth,
      command: "createAndAttachActiveBuildContractor",
      contractor: args.contractor,
      workosOrganizationId: args.workosOrganizationId,
    });
    await upsertActiveBuildContractorAssignment(ctx, {
      auth,
      command: "createAndAttachActiveBuildContractor",
      input: {
        buildId: args.buildId,
        contractorId,
        role: args.role,
        workosOrganizationId: args.workosOrganizationId,
      },
    });
    return { contractorId };
  })
  .public();

async function upsertActiveBuildContractorAssignment(
  ctx: MutationCtx,
  {
    auth,
    command,
    input,
  }: {
    auth: {
      brokerage: Doc<"brokerages">;
      build: Doc<"activeBuilds">;
      proposal: Doc<"buildProposals">;
      roles: RoleSlug[];
      subject: string;
    };
    command: string;
    input: {
      agreedRateCents?: number;
      agreedRateUnit?: "hour" | "day" | "fixed";
      buildId: Id<"activeBuilds">;
      contractorId: Id<"contractorProfiles">;
      endDate?: string;
      notes?: string;
      role: string;
      startDate?: string;
      workosOrganizationId: string;
    };
  },
) {
  const contractor = await ctx.db.get(input.contractorId);
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
      q.eq("buildId", input.buildId).eq("contractorId", input.contractorId),
    )
    .unique();
  const now = Date.now();
  const agreedRateCents =
    normalizeOptionalMoneyCents(input.agreedRateCents) ??
    contractor.defaultPayRateCents;
  const agreedRateUnit =
    input.agreedRateUnit ?? contractor.defaultPayRateUnit ?? "hour";
  let assignmentId: Id<"buildContractorAssignments">;
  if (existing) {
    await ctx.db.patch(existing._id, {
      agreedRateCents,
      agreedRateUnit,
      endDate: input.endDate,
      notes: input.notes,
      role: input.role.trim() || existing.role,
      startDate: input.startDate,
      status: "active",
      updatedAt: now,
    });
    assignmentId = existing._id;
  } else {
    assignmentId = await ctx.db.insert("buildContractorAssignments", {
      brokerageId: auth.brokerage._id,
      buildId: input.buildId,
      contractorId: input.contractorId,
      createdAt: now,
      agreedRateCents,
      agreedRateUnit,
      endDate: input.endDate,
      notes: input.notes,
      organizationId: input.workosOrganizationId,
      role: input.role.trim() || "Contractor",
      startDate: input.startDate,
      status: "active",
      updatedAt: now,
    });
  }
  await writeActiveBuildEvent(ctx, {
    auth,
    build: auth.build,
    command,
    eventType: "active_build.contractor.attached",
    newState: JSON.stringify({
      assignmentId,
      contractorId: input.contractorId,
      role: input.role,
    }),
  });
  return assignmentId;
}

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
    expectedRevision: v.optional(v.number()),
    expectedRevisions: v.optional(v.record(v.string(), v.number())),
    idempotencyKey: v.optional(v.string()),
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
    await requireActiveBuildAppPermission(ctx, auth, "contractor", "update");
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
    const requestedSubmilestoneKeys = args.submilestoneKeys ?? [];
    if (requestedSubmilestoneKeys.some((key) => key.trim().length === 0)) {
      throw new ConvexError({
        code: "SUBMILESTONE_NOT_FOUND",
        message: "Assignment target Sub-milestone keys must be non-empty.",
      });
    }
    const submilestoneKeys = canonicalStringKeyList(requestedSubmilestoneKeys);
    const targetSubmilestones = await resolveAssignmentSubmilestones(ctx, {
      buildId: args.buildId,
      milestoneKey: args.milestoneKey,
      submilestoneKeys,
    });
    const targets =
      targetSubmilestones.length > 0
        ? targetSubmilestones
        : [{ id: undefined, key: undefined }];
    const scopedAssignment = targetSubmilestones.length > 0;
    const command = "assignActiveBuildContractorToMilestone";
    const idempotencyKey = scopedAssignment
      ? requireScopedAssignmentCommandInput(args)
      : undefined;
    const expectedRevisions = scopedAssignment
      ? canonicalAssignmentExpectedRevisions(
          args.expectedRevisions,
          targetSubmilestones.map((target) => target.key),
        )
      : undefined;
    if (
      scopedAssignment &&
      targetSubmilestones.length > 1 &&
      expectedRevisions === undefined
    ) {
      throw new ConvexError({
        code: "EXPECTED_REVISION_MAP_REQUIRED",
        message:
          "Multi-target scoped assignments require one expected workflow revision per target.",
        submilestoneKeys: targetSubmilestones.map((target) => target.key),
      });
    }
    const fingerprint = scopedAssignment
      ? await canonicalCommandFingerprint(command, {
          ...args,
          expectedRevisions,
          submilestoneKeys,
          idempotencyKey,
        })
      : undefined;
    const scopedSubmilestoneRows = scopedAssignment
      ? await Promise.all(
          targetSubmilestones.map((target) => ctx.db.get(target.id)),
        )
      : [];
    if (scopedAssignment) {
      for (const submilestone of scopedSubmilestoneRows) {
        if (!submilestone) {
          throw new ConvexError({
            code: "SUBMILESTONE_NOT_FOUND",
            message: "Sub-milestone is unavailable for this assignment.",
          });
        }
      }
      const replay = await replayScopedAssignmentCommand(ctx, {
        command,
        fingerprint: fingerprint!,
        idempotencyKey: idempotencyKey!,
        submilestoneIds: targetSubmilestones.map((target) => target.id),
      });
      if (replay) {
        return replay;
      }
      for (const [index, submilestone] of scopedSubmilestoneRows.entries()) {
        // The replay lookup must happen before this stale check so a retry
        // returns its committed result even when the caller's revision is no
        // longer current.
        assertExpectedSubmilestoneRevision(
          submilestone!,
          expectedAssignmentRevisionForTarget({
            expectedRevision: args.expectedRevision,
            expectedRevisions,
            submilestoneKey: targetSubmilestones[index]?.key ?? "",
            targetKeys: targetSubmilestones.map((target) => target.key),
          }),
        );
      }
    }
    await ensureActiveBuildPlanningActivationRevision(ctx, {
      actor: { actorRoles: auth.roles, actorWorkosUserId: auth.subject },
      build: auth.build,
    });
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
    const now = Date.now();
    const assignmentIds: Id<"milestoneContractorAssignments">[] = [];
    const assignmentOperations = new Set<"created" | "updated" | "removed">();
    const priorAssignments: Array<Record<string, unknown>> = [];
    const nextAssignments: Array<Record<string, unknown>> = [];
    const nextWorkflowRevisionBySubmilestoneKey = new Map(
      scopedSubmilestoneRows
        .filter(
          (submilestone): submilestone is Doc<"buildSubmilestones"> =>
            submilestone !== null,
        )
        .map((submilestone) => [
          submilestone.key,
          (submilestone.workflowRevision ?? 0) + 1,
        ]),
    );
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
      if (existing) {
        priorAssignments.push({
          ...existing,
          assignmentId: existing._id,
        });
      }
      const nextStatus =
        args.status ??
        existing?.status ??
        (milestone.status === "complete" ? "completed" : "active");
      const row = {
        actualCostCents:
          args.actualCostCents === undefined
            ? existing?.actualCostCents
            : actualCostCents,
        actualHours:
          args.actualHours === undefined ? existing?.actualHours : actualHours,
        assignedAt: existing?.assignedAt ?? now,
        assignedByWorkosUserId:
          existing?.assignedByWorkosUserId ?? auth.subject,
        agreedRateCents:
          args.agreedRateCents === undefined
            ? (existing?.agreedRateCents ?? agreedRateCents)
            : agreedRateCents,
        agreedRateUnit:
          args.agreedRateUnit === undefined
            ? (existing?.agreedRateUnit ?? agreedRateUnit)
            : agreedRateUnit,
        buildContractorAssignmentId: buildAssignmentId,
        buildMilestoneId: milestone._id,
        buildSubmilestoneId: target.id,
        contractorId: args.contractorId,
        costNotes:
          args.costNotes === undefined
            ? existing?.costNotes
            : normalizeOptionalString(args.costNotes),
        estimatedCostCents:
          args.estimatedCostCents === undefined &&
          args.estimatedHours === undefined &&
          args.agreedRateCents === undefined
            ? existing?.estimatedCostCents
            : estimatedCostCents,
        estimatedHours:
          args.estimatedHours === undefined
            ? existing?.estimatedHours
            : estimatedHours,
        milestoneKey: args.milestoneKey,
        note:
          args.note === undefined
            ? existing?.note
            : normalizeOptionalString(args.note),
        postHoc: args.postHoc ?? existing?.postHoc ?? false,
        role: args.role.trim() || existing?.role || "Contractor",
        status: nextStatus,
        submilestoneKey: target.key,
        updatedAt: now,
      };
      const workflowRevision =
        target.id && target.key !== undefined
          ? nextWorkflowRevisionBySubmilestoneKey.get(target.key)
          : undefined;
      let assignmentId: Id<"milestoneContractorAssignments">;
      if (existing) {
        await ctx.db.patch(existing._id, row);
        assignmentId = existing._id;
      } else {
        assignmentId = await ctx.db.insert("milestoneContractorAssignments", {
          ...row,
          brokerageId: auth.brokerage._id,
          buildId: args.buildId,
          createdAt: now,
          organizationId: args.workosOrganizationId,
        });
      }
      assignmentIds.push(assignmentId);
      if (target.id && workflowRevision !== undefined) {
        await ctx.db.patch(target.id, {
          updatedAt: now,
          workflowRevision,
        });
      }
      // Persist the complete post-command assignment snapshot in the
      // immutable audit event. People history must not reconstruct prior
      // states from the mutable assignment row.
      nextAssignments.push({
        assignmentId,
        ...row,
        ...(workflowRevision === undefined ? {} : { workflowRevision }),
      });
      const operation =
        nextStatus === "removed" ? "removed" : existing ? "updated" : "created";
      assignmentOperations.add(operation);
      if (operation === "removed") {
        await resolveBuildAssignmentAcknowledgement(ctx, assignmentId, now);
      } else {
        await ensurePendingBuildAssignmentAcknowledgement(ctx, {
          assignmentId,
          brokerageId: auth.brokerage._id,
          contractorId: args.contractorId,
          now,
          organizationId: args.workosOrganizationId,
        });
      }
      await upsertContractorAssignmentDelivery(ctx, {
        assignmentId,
        auth,
        contractor,
        milestone,
        operation,
      });
    }
    const assignmentEvent = {
      auth,
      build: auth.build,
      command: "assignActiveBuildContractorToMilestone",
      eventType:
        assignmentOperations.size === 1
          ? `active_build.contractor.milestone_assignment_${[...assignmentOperations][0]}`
          : "active_build.contractor.milestone_assignment_updated",
      newState: JSON.stringify({
        assignmentIds,
        assignments: nextAssignments,
        contractorId: args.contractorId,
        estimatedCostCents,
        actualCostCents,
        milestoneKey: args.milestoneKey,
        postHoc: Boolean(args.postHoc),
        ...(nextAssignments.length === 1
          ? {
              role: nextAssignments[0]?.role,
              status: nextAssignments[0]?.status,
              submilestoneKey: nextAssignments[0]?.submilestoneKey,
            }
          : {}),
        submilestoneKeys,
        ...(scopedAssignment
          ? {
              workflowRevisions: Object.fromEntries(
                [...nextWorkflowRevisionBySubmilestoneKey.entries()],
              ),
            }
          : {}),
      }),
      priorState:
        priorAssignments.length > 0
          ? JSON.stringify(priorAssignments)
          : undefined,
      reason: args.note,
    };
    if (targetSubmilestones.length === 0) {
      await writeActiveBuildEvent(ctx, assignmentEvent);
    } else {
      for (const target of targetSubmilestones) {
        await writeActiveBuildEvent(ctx, {
          ...assignmentEvent,
          entityId: String(target.id),
          entityType: "buildSubmilestone",
          resourceType: "contractor",
        });
      }
    }
    await recordApprovedActiveBuildPlanningRevision(ctx, {
      actor: { actorRoles: auth.roles, actorWorkosUserId: auth.subject },
      build: auth.build,
      reason: args.note?.trim() || "Approved Work Allocation update.",
      sourceCommand: "assignActiveBuildContractorToMilestone",
      now,
    });
    const currentMilestone = await ctx.db.get(milestone._id);
    if (currentMilestone) {
      await synchronizeMilestoneSystemPostPlanning(ctx, {
        actor: { roles: auth.roles, workosUserId: auth.subject },
        build: auth.build,
        milestone: currentMilestone,
      });
    }
    if (scopedAssignment) {
      const result = {
        assignmentIds,
        workflowRevisions: Object.fromEntries(
          [...nextWorkflowRevisionBySubmilestoneKey.entries()],
        ),
      };
      for (const target of targetSubmilestones) {
        await insertSubmilestoneCommandReceipt(ctx, {
          buildId: args.buildId,
          command,
          fingerprint: fingerprint!,
          idempotencyKey: idempotencyKey!,
          organizationId: auth.build.organizationId,
          result,
          submilestoneId: target.id,
        });
      }
    }
    return assignmentIds;
  })
  .public();

export const removeActiveBuildContractorFromMilestone = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    contractorId: v.id("contractorProfiles"),
    expectedRevision: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
    milestoneKey: v.string(),
    reason: v.string(),
    submilestoneKey: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.array(v.id("milestoneContractorAssignments")))
  .handler(async (ctx, args) => {
    const reason = args.reason.trim();
    if (!reason) {
      throw new Error("A removal reason is required.");
    }
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    await requireActiveBuildAppPermission(ctx, auth, "contractor", "update");
    const contractor = await getScopedContractorOrThrow(
      ctx,
      args.contractorId,
      auth.brokerage._id,
    );
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    const canonicalSubmilestoneKey = args.submilestoneKey?.trim();
    if (args.submilestoneKey !== undefined && !canonicalSubmilestoneKey) {
      throw new ConvexError({
        code: "SUBMILESTONE_NOT_FOUND",
        message: "A non-empty Sub-milestone key is required for removal.",
      });
    }
    const scopedAssignment = canonicalSubmilestoneKey !== undefined;
    const command = "removeActiveBuildContractorFromMilestone";
    const scopedSubmilestone = scopedAssignment
      ? (
          await resolveAssignmentSubmilestones(ctx, {
            buildId: args.buildId,
            milestoneKey: args.milestoneKey,
            submilestoneKeys: [canonicalSubmilestoneKey!],
          })
        )[0]
      : undefined;
    const idempotencyKey = scopedAssignment
      ? requireScopedAssignmentCommandInput(args)
      : undefined;
    const fingerprint = scopedAssignment
      ? await canonicalCommandFingerprint(command, {
          ...args,
          submilestoneKey: canonicalSubmilestoneKey,
          idempotencyKey,
        })
      : undefined;
    let currentScopedSubmilestone: Doc<"buildSubmilestones"> | null = null;
    if (scopedAssignment && scopedSubmilestone) {
      const replay = await replayScopedAssignmentCommand(ctx, {
        command,
        fingerprint: fingerprint!,
        idempotencyKey: idempotencyKey!,
        submilestoneIds: [scopedSubmilestone.id],
      });
      if (replay) {
        return replay;
      }
      currentScopedSubmilestone = await ctx.db.get(scopedSubmilestone.id);
      if (!currentScopedSubmilestone) {
        throw new ConvexError({
          code: "SUBMILESTONE_NOT_FOUND",
          message: "Sub-milestone is unavailable for this assignment.",
        });
      }
      // Replay lookup intentionally precedes this stale check. A retry of a
      // committed command must return its receipt even after later writes
      // have advanced the canonical workflow revision.
      assertExpectedSubmilestoneRevision(
        currentScopedSubmilestone,
        args.expectedRevision!,
      );
    }
    const assignments = await ctx.db
      .query("milestoneContractorAssignments")
      .withIndex("by_contractor_build", (q) =>
        q.eq("contractorId", args.contractorId).eq("buildId", args.buildId),
      )
      .collect();
    const scopedAssignments = assignments.filter(
      (assignment) =>
        assignment.milestoneKey === args.milestoneKey &&
        (canonicalSubmilestoneKey === undefined ||
          assignment.submilestoneKey === canonicalSubmilestoneKey),
    );
    const targets = scopedAssignments.filter(
      (assignment) => assignment.status !== "removed",
    );
    if (targets.length === 0) {
      throw new Error(
        "No active contractor assignment was found for this scope.",
      );
    }
    await ensureActiveBuildPlanningActivationRevision(ctx, {
      actor: { actorRoles: auth.roles, actorWorkosUserId: auth.subject },
      build: auth.build,
    });
    const now = Date.now();
    const nextWorkflowRevision = currentScopedSubmilestone
      ? (currentScopedSubmilestone.workflowRevision ?? 0) + 1
      : undefined;
    for (const assignment of targets) {
      await ctx.db.patch(assignment._id, {
        note: reason,
        status: "removed",
        updatedAt: now,
      });
      await resolveBuildAssignmentAcknowledgement(ctx, assignment._id, now);
      await upsertContractorAssignmentDelivery(ctx, {
        assignmentId: assignment._id,
        auth,
        contractor,
        milestone,
        operation: "removed",
      });
    }
    if (scopedAssignment && scopedSubmilestone && nextWorkflowRevision !== undefined) {
      await ctx.db.patch(scopedSubmilestone.id, {
        updatedAt: now,
        workflowRevision: nextWorkflowRevision,
      });
    }
    const activeAssignments = assignments.filter(
      (assignment) =>
        !targets.some((target) => target._id === assignment._id) &&
        assignment.status !== "removed",
    );
    if (activeAssignments.length === 0) {
      const buildAssignment = await ctx.db
        .query("buildContractorAssignments")
        .withIndex("by_build_contractor", (q) =>
          q.eq("buildId", args.buildId).eq("contractorId", args.contractorId),
        )
        .unique();
      if (buildAssignment) {
        await ctx.db.patch(buildAssignment._id, {
          status: "inactive",
          updatedAt: now,
        });
      }
    }
    const removalEvent = {
      auth,
      build: auth.build,
      command: "removeActiveBuildContractorFromMilestone",
      eventType: "active_build.contractor.milestone_assignment_removed",
      newState: JSON.stringify({
        assignments: targets.map((assignment) => ({
          ...assignment,
          assignmentId: assignment._id,
          status: "removed",
          updatedAt: now,
        })),
        assignmentIds: targets.map((assignment) => assignment._id),
        contractorId: args.contractorId,
        milestoneKey: args.milestoneKey,
        status: "removed",
        submilestoneKey: canonicalSubmilestoneKey,
        ...(nextWorkflowRevision === undefined
          ? {}
          : { workflowRevision: nextWorkflowRevision }),
      }),
      priorState: JSON.stringify(
        targets.map((assignment) => ({
          ...assignment,
          assignmentId: assignment._id,
        })),
      ),
      reason,
    };
    if (scopedSubmilestone) {
      await writeActiveBuildEvent(ctx, {
        ...removalEvent,
        entityId: String(scopedSubmilestone.id),
        entityType: "buildSubmilestone",
        resourceType: "contractor",
      });
    } else {
      await writeActiveBuildEvent(ctx, removalEvent);
    }
    await recordApprovedActiveBuildPlanningRevision(ctx, {
      actor: { actorRoles: auth.roles, actorWorkosUserId: auth.subject },
      build: auth.build,
      reason,
      sourceCommand: "removeActiveBuildContractorFromMilestone",
      now,
    });
    const currentMilestone = await ctx.db.get(milestone._id);
    if (currentMilestone) {
      await synchronizeMilestoneSystemPostPlanning(ctx, {
        actor: { roles: auth.roles, workosUserId: auth.subject },
        build: auth.build,
        milestone: currentMilestone,
      });
    }
    if (scopedAssignment && scopedSubmilestone) {
      await insertSubmilestoneCommandReceipt(ctx, {
        buildId: args.buildId,
        command,
        fingerprint: fingerprint!,
        idempotencyKey: idempotencyKey!,
        organizationId: auth.build.organizationId,
        result: {
          assignmentIds: targets.map((assignment) => assignment._id),
          workflowRevisions: {
            [scopedSubmilestone.key]: nextWorkflowRevision,
          },
        },
        submilestoneId: scopedSubmilestone.id,
      });
    }
    return targets.map((assignment) => assignment._id);
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
    await requireActiveBuildAppPermission(ctx, auth, "contractor", "update");
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
    const ratingSubmilestone = args.submilestoneKey
      ? (
          await activeBuildStartTarget(ctx, {
            buildId: args.buildId,
            milestoneKey: args.milestoneKey,
            submilestoneKey: args.submilestoneKey,
          })
        ).submilestone
      : undefined;
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "recordContractorQualityRating",
      ...(ratingSubmilestone
        ? {
            entityId: String(ratingSubmilestone._id),
            entityType: "buildSubmilestone",
          }
        : {}),
      eventType: "active_build.contractor.quality_rated",
      resourceType: "contractor",
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
