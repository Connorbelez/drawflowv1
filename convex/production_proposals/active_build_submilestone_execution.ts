/**
 * Production proposals active build submilestone execution bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { ConvexError, v } from "convex/values";
import { authenticatedMutation } from "../authz";
import { resolveCanonicalMilestoneExecutionOwnership } from "../build_collaboration_system_event_access";
import { operateDenialMessage, resolveSubmilestoneOperateAuthority } from "../build_submilestone_operate_authority";
import { synchronizeMilestoneSystemPostPlanning } from "../build_collaboration_system_posts";
import { ensureActiveBuildPlanningActivationRevision, recordApprovedActiveBuildPlanningRevision } from "../build_collaboration_planning_reconciliation";
import { correctMilestoneStart, recordMilestoneStart, retractMilestoneStart, type MilestoneStartSource } from "../milestone_start";
import { type Doc, type Id } from "../types";
import { getActiveBuildMilestoneOrThrow, assertActiveBuildPlanningTargetActive, findActiveBuildSubmilestoneByKey, activeBuildStartTarget, authorizeStartAmendment } from "./active_planning.js";
import { authorizeActiveBuildOrThrow, authorizeActiveBuildForStart } from "./authorization_core.js";
import { requireActiveBuildAppPermission } from "./builder_staff_access.js";
import { milestoneStartSourceValidator } from "./contracts_foundation.js";
import { writeActiveBuildEvent } from "./proposal_copy_audit.js";
import { collectByIndex } from "./storage_helpers.js";
import { canOriginateParentMilestoneStart, authorizeCanonicalSubmilestoneOperator, assertProgressPercent, assertExpectedSubmilestoneRevision, normalizeEvidenceRequirementInputs, canonicalCommandFingerprint, findSubmilestoneIdempotentAudit, insertSubmilestoneCommandReceipt } from "./submilestone_commands.js";

export const startActiveBuildMilestone = authenticatedMutation
  .input({
    actualStartedAt: v.number(),
    buildId: v.id("activeBuilds"),
    dependencyOverrideReason: v.optional(v.string()),
    expectedRevision: v.number(),
    idempotencyKey: v.string(),
    milestoneKey: v.string(),
    source: milestoneStartSourceValidator,
    startParent: v.optional(v.boolean()),
    submilestoneKey: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildForStart(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    const [milestone, milestones] = await Promise.all([
      getActiveBuildMilestoneOrThrow(ctx, args.buildId, args.milestoneKey),
      collectByIndex(ctx, "buildMilestones", "by_build", args.buildId),
    ]);
    assertActiveBuildPlanningTargetActive(milestone);
    const submilestones = args.submilestoneKey
      ? ((await ctx.db
          .query("buildSubmilestones")
          .withIndex("by_milestone", (query) =>
            query.eq("buildMilestoneId", milestone._id),
          )
          .take(500)) as Doc<"buildSubmilestones">[])
      : [];
    const submilestone = args.submilestoneKey
      ? findActiveBuildSubmilestoneByKey(submilestones, args.submilestoneKey)
      : undefined;
    if (args.submilestoneKey && !submilestone) {
      throw new ConvexError({
        code: "SUBMILESTONE_NOT_FOUND",
        message: "Submilestone is unavailable for this milestone.",
        submilestoneKey: args.submilestoneKey,
      });
    }
    if (submilestone) {
      assertActiveBuildPlanningTargetActive(milestone, submilestone);
    }

    const contractorStart = auth.roles.includes("contractor");
    if (contractorStart) {
      if (!args.submilestoneKey || args.startParent || !submilestone) {
        throw new Error(
          "Assigned Contractors may start only an assigned Sub-milestone."
        );
      }
    }

    if (submilestone) {
      const ownership = await resolveCanonicalMilestoneExecutionOwnership(ctx, {
        build: auth.build,
        milestone,
        submilestone,
      });
      const operate = await resolveSubmilestoneOperateAuthority(ctx, {
        build: auth.build,
        intent: "start",
        milestoneCompleted:
          milestone.status === "complete" ||
          milestone.completionClaim !== undefined,
        ownership,
        submilestone,
        allowReplay: true,
        viewer: {
          roles: auth.roles,
          workosUserId: auth.subject,
        },
      });
      if (!operate.allowed) {
        const effectiveDenial =
          contractorStart && operate.denial === "permission_denied"
            ? "assignment_required"
            : operate.denial;
        throw new ConvexError({
          code:
            effectiveDenial === "assignment_required"
              ? "ASSIGNMENT_REQUIRED"
              : effectiveDenial === "lender_review_only"
                ? "LENDER_EXECUTION_FORBIDDEN"
                : "OPERATE_FORBIDDEN",
          message: operateDenialMessage(effectiveDenial),
        });
      }
    } else if (!canOriginateParentMilestoneStart(auth.roles)) {
      throw new Error(
        "Forbidden: lender roles cannot originate builder milestone starts.",
      );
    }

    if (!(contractorStart || auth.roles.includes("admin"))) {
      await requireActiveBuildAppPermission(ctx, auth, "milestone", "update");
      if (args.submilestoneKey) {
        await requireActiveBuildAppPermission(
          ctx,
          auth,
          "submilestone",
          "update",
        );
      }
    }

    return await recordMilestoneStart(ctx, {
      actor: {
        brokerageId: auth.brokerage._id,
        organizationId: auth.build.organizationId,
        roles: auth.roles,
        workosUserId: auth.subject,
      },
      actualStartedAt: args.actualStartedAt,
      build: auth.build,
      dependencyOverrideReason: args.dependencyOverrideReason,
      expectedRevision: args.expectedRevision,
      idempotencyKey: args.idempotencyKey,
      milestone,
      milestones: milestones as Doc<"buildMilestones">[],
      source: args.source as MilestoneStartSource,
      startParent: args.startParent,
      submilestone,
    });
  })
  .public();

export const correctActiveBuildMilestoneStart = authenticatedMutation
  .input({
    actualStartedAt: v.number(),
    buildId: v.id("activeBuilds"),
    expectedRevision: v.number(),
    idempotencyKey: v.string(),
    milestoneKey: v.string(),
    reason: v.string(),
    source: milestoneStartSourceValidator,
    submilestoneKey: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    const { milestone, submilestone } = await activeBuildStartTarget(ctx, {
      buildId: args.buildId,
      milestoneKey: args.milestoneKey,
      submilestoneKey: args.submilestoneKey,
    });
    await authorizeStartAmendment(ctx, auth, milestone, submilestone);
    return await correctMilestoneStart(ctx, {
      actor: {
        brokerageId: auth.brokerage._id,
        organizationId: auth.build.organizationId,
        roles: auth.roles,
        workosUserId: auth.subject,
      },
      actualStartedAt: args.actualStartedAt,
      build: auth.build,
      expectedRevision: args.expectedRevision,
      idempotencyKey: args.idempotencyKey,
      milestone,
      reason: args.reason,
      source: args.source as MilestoneStartSource,
      submilestone,
    });
  })
  .public();

export const retractActiveBuildMilestoneStart = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedRevision: v.number(),
    idempotencyKey: v.string(),
    milestoneKey: v.string(),
    reason: v.string(),
    source: milestoneStartSourceValidator,
    submilestoneKey: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    const { milestone, submilestone } = await activeBuildStartTarget(ctx, {
      buildId: args.buildId,
      milestoneKey: args.milestoneKey,
      submilestoneKey: args.submilestoneKey,
    });
    await authorizeStartAmendment(ctx, auth, milestone, submilestone);
    return await retractMilestoneStart(ctx, {
      actor: {
        brokerageId: auth.brokerage._id,
        organizationId: auth.build.organizationId,
        roles: auth.roles,
        workosUserId: auth.subject,
      },
      build: auth.build,
      expectedRevision: args.expectedRevision,
      idempotencyKey: args.idempotencyKey,
      milestone,
      reason: args.reason,
      source: args.source as MilestoneStartSource,
      submilestone,
    });
  })
  .public();

export const updateActiveBuildSubmilestoneExecution = authenticatedMutation
  .input({
    actualCostCents: v.optional(v.union(v.number(), v.null())),
    actualStartedAt: v.optional(v.number()),
    buildId: v.id("activeBuilds"),
    completionForecastDate: v.optional(v.union(v.string(), v.null())),
    dependencyOverrideReason: v.optional(v.string()),
    fieldNote: v.optional(v.union(v.string(), v.null())),
    expectedRevision: v.number(),
    idempotencyKey: v.optional(v.string()),
    milestoneKey: v.string(),
    progressPercent: v.optional(v.number()),
    reason: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("planned"),
        v.literal("in_progress"),
        v.literal("complete"),
      ),
    ),
    submilestoneKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    // The canonical start-scope admission is also the only safe admission
    // path for an exact assigned Contractor.  Builder staff still receive
    // their normal app-permission checks below.
    const auth = await authorizeActiveBuildForStart(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    if (
      args.progressPercent !== undefined &&
      (!Number.isFinite(args.progressPercent) ||
        args.progressPercent < 0 ||
        args.progressPercent > 100)
    ) {
      throw new ConvexError({
        code: "INVALID_PROGRESS_PERCENT",
        message: "Progress must be between 0 and 100 percent.",
      });
    }
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    assertActiveBuildPlanningTargetActive(milestone);
    const submilestones = (await ctx.db
      .query("buildSubmilestones")
      .withIndex("by_milestone", (q) => q.eq("buildMilestoneId", milestone._id))
      .collect()) as Doc<"buildSubmilestones">[];
    const submilestone = submilestones.find(
      (row) => row.key === args.submilestoneKey,
    );
    if (!submilestone) {
      throw new ConvexError({
        code: "SUBMILESTONE_NOT_FOUND",
        message: "Submilestone is unavailable for this milestone.",
        submilestoneKey: args.submilestoneKey,
      });
    }
    assertActiveBuildPlanningTargetActive(milestone, submilestone);
    const nextStatus = args.status ?? submilestone.status;
    const priorStatus = submilestone.status as
      | "planned"
      | "in_progress"
      | "complete";
    const nextStatusValue = String(nextStatus);
    const command = "updateActiveBuildSubmilestoneExecution";
    const fingerprint = await canonicalCommandFingerprint(command, args);
    const existing = args.idempotencyKey
      ? await findSubmilestoneIdempotentAudit(ctx, {
          command,
          fingerprint,
          idempotencyKey: args.idempotencyKey,
          submilestoneId: submilestone._id,
        })
      : null;
    if (existing) {
      // Execution updates intentionally retain their historical null return
      // shape; the receipt still carries the committed revision.
      return null;
    }
    const completing =
      nextStatusValue === "complete" && priorStatus !== "complete";
    const reopening =
      priorStatus === "complete" && nextStatusValue !== "complete";
    const completionOrReopen = completing || reopening;
    if (priorStatus === "planned" && !completing) {
      throw new ConvexError({
        code: "USE_CANONICAL_START_COMMAND",
        message:
          "Planned Sub-milestones require the explicit start command before execution updates.",
      });
    }
    if (priorStatus === "complete" && !reopening) {
      throw new ConvexError({
        code: "USE_CANONICAL_REOPEN_COMMAND",
        message:
          "Completed Sub-milestones may only be changed through an explicit reopen command.",
      });
    }
    if (completionOrReopen && !args.idempotencyKey) {
      throw new ConvexError({
        code: "IDEMPOTENCY_KEY_REQUIRED",
        message:
          "Completion and reopen execution commands require an idempotency key.",
      });
    }
    const ownership = completionOrReopen
      ? await resolveCanonicalMilestoneExecutionOwnership(ctx, {
          build: auth.build,
          includeCompleted: true,
          milestone,
          submilestone,
        })
      : undefined;
    let canonicalOperate:
      | Awaited<ReturnType<typeof resolveSubmilestoneOperateAuthority>>
      | undefined;
    if (completionOrReopen && ownership) {
      canonicalOperate = await resolveSubmilestoneOperateAuthority(ctx, {
        allowCompleted: reopening,
        build: auth.build,
        intent: "update",
        milestoneCompleted:
          milestone.status === "complete" ||
          milestone.completionClaim !== undefined,
        ownership,
        submilestone,
        viewer: {
          roles: auth.roles,
          workosUserId: auth.subject,
        },
      });
      if (!canonicalOperate.allowed) {
        const denial = canonicalOperate.denial;
        throw new ConvexError({
          code:
            denial === "assignment_required"
              ? "ASSIGNMENT_REQUIRED"
              : denial === "lender_review_only"
                ? "LENDER_EXECUTION_FORBIDDEN"
                : "OPERATE_FORBIDDEN",
          message: operateDenialMessage(denial),
        });
      }
      if (priorStatus === "planned" && completing) {
        const startOperate = await resolveSubmilestoneOperateAuthority(ctx, {
          build: auth.build,
          intent: "start",
          milestoneCompleted:
            milestone.status === "complete" ||
            milestone.completionClaim !== undefined,
          ownership,
          submilestone,
          viewer: {
            roles: auth.roles,
            workosUserId: auth.subject,
          },
        });
        if (!startOperate.allowed) {
          const denial = startOperate.denial;
          throw new ConvexError({
            code:
              denial === "assignment_required"
                ? "ASSIGNMENT_REQUIRED"
                : denial === "lender_review_only"
                  ? "LENDER_EXECUTION_FORBIDDEN"
                  : "OPERATE_FORBIDDEN",
            message: operateDenialMessage(denial),
          });
        }
      }
    }
    if (
      completionOrReopen &&
      canonicalOperate?.allowed === true &&
      canonicalOperate.basis === "contractor_assignee"
    ) {
      // Exact assigned Contractors are authorized by canonical Work
      // Allocation, never by Builder staff grants.
    } else {
      await requireActiveBuildAppPermission(ctx, auth, "submilestone", "update");
    }
    const exactContractorLifecycleCommand =
      completionOrReopen &&
      canonicalOperate?.allowed === true &&
      canonicalOperate.basis === "contractor_assignee";
    if (
      (args.actualCostCents !== undefined || args.fieldNote !== undefined) &&
      !exactContractorLifecycleCommand
    ) {
      await requireActiveBuildAppPermission(ctx, auth, "milestone", "update");
    }
    assertExpectedSubmilestoneRevision(submilestone, args.expectedRevision);
    if (submilestone.status === "planned" && nextStatus === "in_progress") {
      throw new ConvexError({
        code: "USE_CANONICAL_START_COMMAND",
        message:
          "Starting submilestone work requires the explicit start confirmation.",
      });
    }
    if (
      submilestone.status === "complete" &&
      nextStatus !== "complete" &&
      milestone.completionClaim &&
      !args.reason?.trim()
    ) {
      throw new ConvexError({
        code: "REOPEN_REASON_REQUIRED",
        message:
          "A reason is required to reopen work after milestone completion was submitted.",
        submilestoneKey: submilestone.key,
      });
    }
    let executionRevision = submilestone.workflowRevision ?? 0;
    if (
      nextStatus === "complete" &&
      submilestone.actualStartedAt === undefined
    ) {
      if (args.actualStartedAt === undefined || !args.idempotencyKey) {
        throw new ConvexError({
          code: "MISSING_ACTUAL_START",
          message:
            "Confirm the missing actual start before completing this submilestone.",
        });
      }
      const milestones = (await ctx.db
        .query("buildMilestones")
        .withIndex("by_build", (query) => query.eq("buildId", args.buildId))
        .take(500)) as Doc<"buildMilestones">[];
      const startResult = await recordMilestoneStart(ctx, {
        actor: {
          brokerageId: auth.brokerage._id,
          organizationId: auth.build.organizationId,
          roles: auth.roles,
          workosUserId: auth.subject,
        },
        actualStartedAt: args.actualStartedAt,
        build: auth.build,
        dependencyOverrideReason: args.dependencyOverrideReason,
        expectedRevision: submilestone.workflowRevision ?? 0,
        idempotencyKey: `${args.idempotencyKey}:start`,
        milestone,
        milestones,
        source: "completion_catch_up",
        startParent: true,
        submilestone,
      });
      executionRevision = startResult.revision;
    }
    const now = Date.now();
    const nextWorkflowRevision = executionRevision + 1;
    const patch = {
      ...(args.actualCostCents === undefined
        ? {}
        : {
            actualCostCents:
              args.actualCostCents === null
                ? undefined
                : Math.max(0, Math.round(args.actualCostCents)),
          }),
      ...(args.fieldNote === undefined
        ? {}
        : {
            fieldNote:
              args.fieldNote === null
                ? undefined
                : args.fieldNote.trim() || undefined,
          }),
      ...(args.completionForecastDate === undefined
        ? {}
        : {
            completionForecastDate:
              args.completionForecastDate === null
                ? undefined
                : args.completionForecastDate.trim() || undefined,
          }),
      ...(args.progressPercent === undefined
        ? {}
        : { progressPercent: Math.round(args.progressPercent) }),
      ...(args.status === undefined
        ? {}
        : {
            completedAt:
              nextStatus === "complete"
                ? (submilestone.completedAt ?? now)
                : undefined,
            completedByWorkosUserId:
              nextStatus === "complete"
                ? (submilestone.completedByWorkosUserId ?? auth.subject)
                : undefined,
            status: nextStatus,
          }),
      workflowRevision: nextWorkflowRevision,
      updatedAt: now,
    };
    await ctx.db.patch(submilestone._id, patch);

    const completedCount = submilestones.filter((row) =>
      row._id === submilestone._id
        ? nextStatus === "complete"
        : row.status === "complete",
    ).length;
    const progressPercent =
      submilestones.length === 0
        ? (milestone.progressPercent ?? 0)
        : Math.round((completedCount / submilestones.length) * 100);
    await ctx.db.patch(milestone._id, {
      ...(nextStatus !== "complete" && milestone.completionClaim
        ? {
            completionClaim: undefined,
            completionReview: undefined,
            evidenceState: "Work reopened",
          }
        : {}),
      progressPercent,
      updatedAt: now,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command,
      entityId: String(submilestone._id),
      entityType: "buildSubmilestone",
      eventType: "active_build.submilestone.execution_updated",
      newState: JSON.stringify({
        actualCostCents: patch.actualCostCents,
        completionForecastDate: patch.completionForecastDate,
        fieldNote: patch.fieldNote,
        milestoneKey: milestone.key,
        progressPercent: patch.progressPercent,
        status: nextStatus,
        submilestoneKey: submilestone.key,
        workflowRevision: nextWorkflowRevision,
      }),
      priorState: JSON.stringify({
        actualCostCents: submilestone.actualCostCents,
        completionForecastDate: submilestone.completionForecastDate,
        fieldNote: submilestone.fieldNote,
        progressPercent: submilestone.progressPercent,
        status: submilestone.status,
        workflowRevision: submilestone.workflowRevision ?? 0,
      }),
      reason: args.reason,
    });
    if (args.idempotencyKey) {
      await insertSubmilestoneCommandReceipt(ctx, {
        buildId: args.buildId,
        command,
        fingerprint,
        idempotencyKey: args.idempotencyKey,
        organizationId: auth.build.organizationId,
        result: { revision: nextWorkflowRevision },
        submilestoneId: submilestone._id,
      });
    }
    return null;
  })
  .public();

export const updateActiveBuildSubmilestoneProgress = authenticatedMutation
  .input({
    actualCostCents: v.optional(v.union(v.number(), v.null())),
    buildId: v.id("activeBuilds"),
    completionForecastDate: v.optional(v.union(v.string(), v.null())),
    fieldNote: v.optional(v.union(v.string(), v.null())),
    expectedRevision: v.number(),
    idempotencyKey: v.string(),
    milestoneKey: v.string(),
    progressPercent: v.number(),
    submilestoneKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeCanonicalSubmilestoneOperator(ctx, args);
    const { milestone, submilestone } = await activeBuildStartTarget(ctx, {
      buildId: args.buildId,
      milestoneKey: args.milestoneKey,
      submilestoneKey: args.submilestoneKey,
    });
    const command = "updateActiveBuildSubmilestoneProgress";
    const fingerprint = await canonicalCommandFingerprint(command, args);
    const existing = await findSubmilestoneIdempotentAudit(ctx, {
      command,
      fingerprint,
      submilestoneId: submilestone._id,
      idempotencyKey: args.idempotencyKey,
    });
    if (existing) {
      return {
        ...(JSON.parse(existing.resultJson) as Record<string, unknown>),
        replayed: true,
      };
    }
    if (submilestone.status !== "in_progress") {
      throw new ConvexError({
        code: "SUBMILESTONE_NOT_ACTIVE",
        message: "Progress updates require an active Sub-milestone.",
      });
    }
    if (submilestone.actualStartedAt === undefined) {
      throw new ConvexError({
        code: "MISSING_ACTUAL_START",
        message: "Start the Sub-milestone before recording field progress.",
      });
    }
    assertExpectedSubmilestoneRevision(submilestone, args.expectedRevision);
    assertProgressPercent(args.progressPercent);
    const now = Date.now();
    const patch = {
      ...(args.actualCostCents === undefined
        ? {}
        : {
            actualCostCents:
              args.actualCostCents === null
                ? undefined
                : Math.max(0, Math.round(args.actualCostCents)),
          }),
      ...(args.completionForecastDate === undefined
        ? {}
        : {
            completionForecastDate:
              args.completionForecastDate === null
                ? undefined
                : args.completionForecastDate.trim() || undefined,
          }),
      ...(args.fieldNote === undefined
        ? {}
        : {
            fieldNote:
              args.fieldNote === null
                ? undefined
                : args.fieldNote.trim() || undefined,
          }),
      progressPercent: Math.round(args.progressPercent),
      updatedAt: now,
      workflowRevision: (submilestone.workflowRevision ?? 0) + 1,
    };
    await ctx.db.patch(submilestone._id, patch);
    const submilestones = (await ctx.db
      .query("buildSubmilestones")
      .withIndex("by_milestone", (q) => q.eq("buildMilestoneId", milestone._id))
      .collect()) as Doc<"buildSubmilestones">[];
    const completedCount = submilestones.filter(
      (row) => row.status === "complete",
    ).length;
    const progressPercent =
      submilestones.length === 0
        ? (milestone.progressPercent ?? 0)
        : Math.round((completedCount / submilestones.length) * 100);
    await ctx.db.patch(milestone._id, {
      progressPercent,
      updatedAt: now,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command,
      entityId: String(submilestone._id),
      entityType: "buildSubmilestone",
      eventType: "active_build.submilestone.progress_updated",
      newState: JSON.stringify({
        actualCostCents: patch.actualCostCents,
        completionForecastDate: patch.completionForecastDate,
        fieldNote: patch.fieldNote,
        idempotencyKey: args.idempotencyKey,
        milestoneKey: milestone.key,
        progressPercent: patch.progressPercent,
        submilestoneKey: submilestone.key,
      }),
      priorState: JSON.stringify({
        actualCostCents: submilestone.actualCostCents,
        completionForecastDate: submilestone.completionForecastDate,
        fieldNote: submilestone.fieldNote,
        progressPercent: submilestone.progressPercent ?? 0,
        workflowRevision: submilestone.workflowRevision ?? 0,
      }),
    });
    const result = {
      progressPercent: patch.progressPercent,
      revision: patch.workflowRevision,
      replayed: false,
    };
    await insertSubmilestoneCommandReceipt(ctx, {
      buildId: args.buildId,
      command,
      fingerprint,
      idempotencyKey: args.idempotencyKey,
      organizationId: auth.build.organizationId,
      result,
      submilestoneId: submilestone._id,
    });
    return result;
  })
  .public();

export const configureActiveBuildSubmilestoneEvidenceRequirements =
  authenticatedMutation
    .input({
      buildId: v.id("activeBuilds"),
      milestoneKey: v.string(),
      requirements: v.array(
        v.object({
          description: v.optional(v.string()),
          kind: v.union(
            v.literal("photo"),
            v.literal("document"),
            v.literal("site_visit"),
            v.literal("any"),
          ),
          label: v.string(),
          locationRequired: v.optional(v.boolean()),
          required: v.boolean(),
          requirementKey: v.string(),
        }),
      ),
      submilestoneKey: v.string(),
      workosOrganizationId: v.string(),
    })
    .returns(v.array(v.id("buildSubmilestoneEvidenceRequirements")))
    .handler(async (ctx, args) => {
      const auth = await authorizeActiveBuildOrThrow(
        ctx,
        args.buildId,
        args.workosOrganizationId,
      );
      await requireActiveBuildAppPermission(ctx, auth, "milestone", "update");
      await ensureActiveBuildPlanningActivationRevision(ctx, {
        actor: { actorRoles: auth.roles, actorWorkosUserId: auth.subject },
        build: auth.build,
      });
      const { milestone, submilestone } = await activeBuildStartTarget(ctx, {
        buildId: args.buildId,
        milestoneKey: args.milestoneKey,
        submilestoneKey: args.submilestoneKey,
      });
      const requirements = normalizeEvidenceRequirementInputs(args.requirements);
      const allRequirementRows = await ctx.db
        .query("buildSubmilestoneEvidenceRequirements")
        .withIndex("by_submilestone", (query) =>
          query.eq("buildSubmilestoneId", submilestone._id),
        )
        .collect();
      const prior = allRequirementRows.filter((row) => row.active);
      const revision =
        allRequirementRows.reduce((max, row) => Math.max(max, row.revision), 0) + 1;
      const now = Date.now();
      for (const row of prior) {
        await ctx.db.patch(row._id, { active: false, updatedAt: now });
      }
      const ids: Id<"buildSubmilestoneEvidenceRequirements">[] = [];
      for (const requirement of requirements) {
        ids.push(
          await ctx.db.insert("buildSubmilestoneEvidenceRequirements", {
            active: true,
            brokerageId: auth.brokerage._id,
            buildId: args.buildId,
            buildMilestoneId: milestone._id,
            buildSubmilestoneId: submilestone._id,
            createdAt: now,
            createdByWorkosUserId: auth.subject,
            description: requirement.description,
            kind: requirement.kind,
            label: requirement.label,
            locationRequired: requirement.locationRequired,
            milestoneKey: milestone.key,
            organizationId: auth.build.organizationId,
            proposalId: auth.proposal._id,
            required: requirement.required,
            requirementKey: requirement.requirementKey,
            revision,
            submilestoneKey: submilestone.key,
            updatedAt: now,
          }),
        );
      }
      await writeActiveBuildEvent(ctx, {
        auth,
        build: auth.build,
        command: "configureActiveBuildSubmilestoneEvidenceRequirements",
        entityId: String(submilestone._id),
        entityType: "buildSubmilestone",
        eventType: "active_build.submilestone.evidence_requirements_configured",
        resourceType: "evidence",
        newState: JSON.stringify({
          requirementKeys: requirements.map((requirement) => requirement.requirementKey),
          revision,
          submilestoneKey: submilestone.key,
        }),
        priorState: JSON.stringify({
          requirementKeys: prior.map((requirement) => requirement.requirementKey),
          revision: prior.reduce((max, row) => Math.max(max, row.revision), 0),
        }),
      });
      await recordApprovedActiveBuildPlanningRevision(ctx, {
        actor: { actorRoles: auth.roles, actorWorkosUserId: auth.subject },
        build: auth.build,
        reason: "Approved Evidence requirement revision.",
        sourceCommand: "configureActiveBuildSubmilestoneEvidenceRequirements",
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
      return ids;
    })
    .public();
