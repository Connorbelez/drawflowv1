/**
 * Production proposals submilestone commands bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { ConvexError } from "convex/values";
import { type AuthorizedViewer, type RoleSlug } from "../authz";
import { resolveCanonicalMilestoneExecutionOwnership } from "../build_collaboration_system_event_access";
import { operateDenialMessage, resolveSubmilestoneOperateAuthority } from "../build_submilestone_operate_authority";
import { ensureActiveSubmilestoneEvidencePackageDraft } from "../build_submilestone_evidence";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { sha256Hex } from "./active_build_draws.js";
import { activeBuildStartTarget } from "./active_planning.js";
import { authorizeActiveBuildOrThrow, authorizeActiveBuildForStart } from "./authorization_core.js";
import { requireActiveBuildAppPermission } from "./builder_staff_access.js";
import { isBackoffice, hasBuilderExecutionRole } from "./proposal_claim.js";

export function canOriginateParentMilestoneStart(roles: readonly RoleSlug[]) {
  if (roles.includes("admin")) {
    return true;
  }
  if (hasBuilderExecutionRole(roles)) {
    return true;
  }
  return !isBackoffice(roles);
}

type CanonicalSubmilestoneCommandInput = {
  buildId: Id<"activeBuilds">;
  milestoneKey: string;
  submilestoneKey: string;
  workosOrganizationId: string;
};

type CanonicalSubmilestoneAuth = Awaited<
  ReturnType<typeof authorizeActiveBuildOrThrow>
>;

export async function authorizeCanonicalSubmilestoneOperator(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  input: CanonicalSubmilestoneCommandInput,
): Promise<CanonicalSubmilestoneAuth> {
  const auth = await authorizeActiveBuildForStart(
    ctx,
    input.buildId,
    input.workosOrganizationId,
  );
  const { milestone, submilestone } = await activeBuildStartTarget(ctx, {
    buildId: input.buildId,
    milestoneKey: input.milestoneKey,
    submilestoneKey: input.submilestoneKey,
  });
  const ownership = await resolveCanonicalMilestoneExecutionOwnership(ctx, {
    build: auth.build,
    milestone,
    submilestone,
  });
  const operate = await resolveSubmilestoneOperateAuthority(ctx, {
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
  if (!operate.allowed) {
    throw new ConvexError({
      code:
        operate.denial === "assignment_required"
          ? "ASSIGNMENT_REQUIRED"
          : operate.denial === "lender_review_only"
            ? "LENDER_EXECUTION_FORBIDDEN"
            : "OPERATE_FORBIDDEN",
      message: operateDenialMessage(operate.denial),
    });
  }
  if (
    !(
      auth.roles.includes("admin") ||
      auth.roles.includes("contractor")
    )
  ) {
    await requireActiveBuildAppPermission(ctx, auth, "submilestone", "update");
  }
  return auth;
}

export function assertProgressPercent(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new ConvexError({
      code: "INVALID_PROGRESS_PERCENT",
      message: "Progress must be between 0 and 100 percent.",
    });
  }
}

export function assertExpectedSubmilestoneRevision(
  submilestone: Doc<"buildSubmilestones">,
  expectedRevision: number,
) {
  if (expectedRevision !== (submilestone.workflowRevision ?? 0)) {
    throw new ConvexError({
      code: "STALE_SUBMILESTONE_REVISION",
      message: "Sub-milestone changed; refresh before retrying the command.",
      actualRevision: submilestone.workflowRevision ?? 0,
      expectedRevision,
    });
  }
}

export function assertExpectedMilestoneRevision(
  milestone: Doc<"buildMilestones">,
  expectedRevision: number,
) {
  if (expectedRevision !== (milestone.workflowRevision ?? 0)) {
    throw new ConvexError({
      code: "STALE_MILESTONE_REVISION",
      message: "Milestone changed; refresh before retrying the command.",
      actualRevision: milestone.workflowRevision ?? 0,
      expectedRevision,
    });
  }
}

export function requireScopedAssignmentCommandInput(input: {
  expectedRevision?: number;
  expectedRevisions?: Record<string, number>;
  idempotencyKey?: string;
}) {
  if (
    (input.expectedRevision === undefined &&
      input.expectedRevisions === undefined) ||
    (input.expectedRevision !== undefined &&
      (!Number.isSafeInteger(input.expectedRevision) ||
        input.expectedRevision < 0))
  ) {
    throw new ConvexError({
      code: "EXPECTED_REVISION_REQUIRED",
      message:
        "Sub-milestone-scoped assignment commands require the current canonical workflow revision.",
    });
  }
  if (input.expectedRevisions !== undefined) {
    for (const revision of Object.values(input.expectedRevisions)) {
      if (!Number.isSafeInteger(revision) || revision < 0) {
        throw new ConvexError({
          code: "EXPECTED_REVISION_REQUIRED",
          message:
            "Sub-milestone-scoped assignment commands require safe canonical workflow revisions.",
        });
      }
    }
  }
  const idempotencyKey = input.idempotencyKey?.trim();
  if (!idempotencyKey) {
    throw new ConvexError({
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message:
        "Sub-milestone-scoped assignment commands require an idempotency key.",
    });
  }
  return idempotencyKey;
}

export function canonicalAssignmentExpectedRevisions(
  expectedRevisions: Record<string, number> | undefined,
  targetKeys: readonly string[],
) {
  if (expectedRevisions === undefined) {
    return undefined;
  }
  const normalized = Object.entries(expectedRevisions).map(
    ([key, revision]) => [key.trim(), revision] as const,
  );
  const normalizedKeys = normalized.map(([key]) => key);
  if (
    normalized.some(([key]) => key.length === 0) ||
    new Set(normalizedKeys).size !== normalizedKeys.length
  ) {
    throw new ConvexError({
      code: "EXPECTED_REVISION_MAP_REQUIRED",
      message:
        "Each scoped assignment target must have one canonical workflow revision.",
    });
  }
  const expectedKeys = canonicalStringKeyList(targetKeys);
  const actualKeys = canonicalStringKeyList(normalizedKeys);
  const missingKeys = expectedKeys.filter((key) => !actualKeys.includes(key));
  const unknownKeys = actualKeys.filter((key) => !expectedKeys.includes(key));
  if (missingKeys.length > 0 || unknownKeys.length > 0) {
    throw new ConvexError({
      code: "EXPECTED_REVISION_MAP_REQUIRED",
      message:
        "Provide an expected workflow revision for every scoped assignment target.",
      missingSubmilestoneKeys: missingKeys,
      unknownSubmilestoneKeys: unknownKeys,
    });
  }
  return Object.fromEntries(
    normalized
      .sort(([left], [right]) => compareCanonicalStringKeys(left, right))
      .map(([key, revision]) => [key, revision]),
  ) as Record<string, number>;
}

export function expectedAssignmentRevisionForTarget(input: {
  expectedRevision?: number;
  expectedRevisions?: Record<string, number>;
  submilestoneKey: string;
  targetKeys: readonly string[];
}) {
  const expectedRevisions = canonicalAssignmentExpectedRevisions(
    input.expectedRevisions,
    input.targetKeys,
  );
  const revision =
    expectedRevisions?.[input.submilestoneKey] ?? input.expectedRevision;
  if (
    revision === undefined ||
    !Number.isSafeInteger(revision) ||
    revision < 0
  ) {
    throw new ConvexError({
      code: "EXPECTED_REVISION_REQUIRED",
      message:
        "Sub-milestone-scoped assignment commands require the current canonical workflow revision.",
      submilestoneKey: input.submilestoneKey,
    });
  }
  return revision;
}

export function requireScopedMaterialCommandInput(input: {
  expectedRevision?: number;
  idempotencyKey?: string;
}) {
  if (
    input.expectedRevision === undefined ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0
  ) {
    throw new ConvexError({
      code: "EXPECTED_REVISION_REQUIRED",
      message:
        "Sub-milestone-scoped material commands require the current canonical workflow revision.",
    });
  }
  const idempotencyKey = input.idempotencyKey?.trim();
  if (!idempotencyKey) {
    throw new ConvexError({
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message:
        "Sub-milestone-scoped material commands require an idempotency key.",
    });
  }
  return idempotencyKey;
}

function compareCanonicalStringKeys(left: string, right: string) {
  return left === right ? 0 : left < right ? -1 : 1;
}

export function canonicalStringKeyList(keys: readonly string[]) {
  return [...new Set(
    keys
      .map((key) => key.trim())
      .filter((key) => key.length > 0),
  )].sort(compareCanonicalStringKeys);
}

export function canonicalOptionalSubmilestoneKey(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new ConvexError({
      code: "SUBMILESTONE_NOT_FOUND",
      message: "A non-empty Sub-milestone key is required for a scoped command.",
    });
  }
  return normalized;
}

export function materialScopedMutationReplay(
  existing: Doc<"buildSubmilestoneCommandReceipts">,
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(existing.resultJson);
  } catch {
    throw new ConvexError({
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "The stored material command receipt is invalid.",
    });
  }
  if (!parsed || typeof parsed !== "object") {
    throw new ConvexError({
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "The stored material command receipt is invalid.",
    });
  }
  const result = parsed as {
    itemId?: unknown;
    revision?: unknown;
  };
  if (
    typeof result.itemId !== "string" ||
    !Number.isSafeInteger(result.revision) ||
    (result.revision as number) < 0
  ) {
    throw new ConvexError({
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "The stored material command receipt has an invalid result.",
    });
  }
  return {
    itemId: result.itemId as Id<"buildCostItems">,
    replayed: true,
    revision: result.revision as number,
  };
}

export async function replayScopedAssignmentCommand(
  ctx: MutationCtx,
  input: {
    command: string;
    fingerprint: string;
    idempotencyKey: string;
    submilestoneIds: Id<"buildSubmilestones">[];
  },
) {
  const receipts = await Promise.all(
    input.submilestoneIds.map((submilestoneId) =>
      findSubmilestoneIdempotentAudit(ctx, {
        command: input.command,
        fingerprint: input.fingerprint,
        idempotencyKey: input.idempotencyKey,
        submilestoneId,
      }),
    ),
  );
  const existing = receipts.filter(
    (receipt): receipt is NonNullable<typeof receipt> => receipt !== null,
  );
  if (existing.length === 0) return null;
  if (existing.length !== receipts.length) {
    throw new ConvexError({
      code: "IDEMPOTENCY_KEY_REUSED",
      message:
        "This idempotency key has an incomplete Sub-milestone assignment receipt; refresh before retrying.",
    });
  }
  const result = JSON.parse(existing[0]!.resultJson) as {
    assignmentIds?: unknown;
  };
  if (
    !Array.isArray(result.assignmentIds) ||
    result.assignmentIds.some((assignmentId) => typeof assignmentId !== "string")
  ) {
    throw new ConvexError({
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "The stored assignment receipt has an invalid result.",
    });
  }
  return result.assignmentIds as Id<"milestoneContractorAssignments">[];
}

export function normalizeEvidenceRequirementInputs(
  requirements: Array<{
    description?: string;
    kind: "photo" | "document" | "site_visit" | "any";
    label: string;
    locationRequired?: boolean;
    required: boolean;
    requirementKey: string;
  }>,
) {
  if (requirements.length === 0) {
    throw new ConvexError({
      code: "EVIDENCE_REQUIREMENT_EMPTY",
      message: "At least one Evidence requirement is required.",
    });
  }
  const seen = new Set<string>();
  return requirements.map((requirement) => {
    const requirementKey = requirement.requirementKey.trim();
    const label = requirement.label.trim();
    if (!requirementKey || !label) {
      throw new ConvexError({
        code: "EVIDENCE_REQUIREMENT_INVALID",
        message: "Evidence requirements need a non-empty key and label.",
      });
    }
    if (seen.has(requirementKey)) {
      throw new ConvexError({
        code: "EVIDENCE_REQUIREMENT_DUPLICATE",
        message: `Evidence requirement key ${requirementKey} is duplicated.`,
        requirementKey,
      });
    }
    seen.add(requirementKey);
    return {
      ...(requirement.description?.trim()
        ? { description: requirement.description.trim() }
        : {}),
      kind: requirement.kind,
      label,
      locationRequired: requirement.locationRequired === true,
      required: requirement.required,
      requirementKey,
    };
  });
}

function canonicalCommandPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalCommandPayload(item));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalCommandPayload(record[key])]),
    );
  }
  return value;
}

export async function canonicalCommandFingerprint(command: string, payload: unknown) {
  const commandPayload =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? Object.fromEntries(
          Object.entries(payload as Record<string, unknown>).filter(
            ([key]) =>
              key !== "expectedRevision" && key !== "expectedRevisions",
          ),
        )
      : payload;
  return await sha256Hex(
    JSON.stringify({
      command,
      payload: canonicalCommandPayload(commandPayload),
    }),
  );
}

function assertSubmilestoneReceiptIdentity(
  existing: Doc<"buildSubmilestoneCommandReceipts">,
  input: { command: string; fingerprint: string },
) {
  if (
    existing.command !== input.command ||
    existing.fingerprint === undefined ||
    existing.fingerprint !== input.fingerprint
  ) {
    throw new ConvexError({
      code: "IDEMPOTENCY_KEY_REUSED",
      message:
        "This idempotency key already belongs to a different canonical command or payload.",
      command: input.command,
    });
  }
}

export async function findSubmilestoneIdempotentAudit(
  ctx: MutationCtx,
  input: {
    command: string;
    fingerprint: string;
    idempotencyKey: string;
    submilestoneId: Id<"buildSubmilestones">;
  },
) {
  const existing = await ctx.db
    .query("buildSubmilestoneCommandReceipts")
    .withIndex("by_submilestone_idempotency", (query) =>
      query
        .eq("buildSubmilestoneId", input.submilestoneId)
        .eq("idempotencyKey", input.idempotencyKey),
    )
    .first();
  if (existing) {
    assertSubmilestoneReceiptIdentity(existing, input);
  }
  return existing;
}

export async function insertSubmilestoneCommandReceipt(
  ctx: MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    command: string;
    fingerprint: string;
    idempotencyKey: string;
    organizationId: string;
    result: Record<string, unknown>;
    submilestoneId: Id<"buildSubmilestones">;
  },
) {
  const existing = await findSubmilestoneIdempotentAudit(ctx, {
    command: input.command,
    fingerprint: input.fingerprint,
    idempotencyKey: input.idempotencyKey,
    submilestoneId: input.submilestoneId,
  });
  if (existing) {
    assertSubmilestoneReceiptIdentity(existing, input);
    return existing._id;
  }
  return await ctx.db.insert("buildSubmilestoneCommandReceipts", {
    buildId: input.buildId,
    command: input.command,
    createdAt: Date.now(),
    fingerprint: input.fingerprint,
    idempotencyKey: input.idempotencyKey,
    organizationId: input.organizationId,
    resultJson: JSON.stringify(input.result),
    buildSubmilestoneId: input.submilestoneId,
  });
}

export async function ensureDraftSubmilestoneEvidencePackage(
  ctx: MutationCtx,
  input: {
    auth: CanonicalSubmilestoneAuth;
    milestone: Doc<"buildMilestones">;
    submilestone: Doc<"buildSubmilestones">;
  },
) {
  return await ensureActiveSubmilestoneEvidencePackageDraft(ctx, {
    actorRoles: input.auth.roles,
    actorWorkosUserId: input.auth.subject,
    build: input.auth.build,
    milestone: input.milestone,
    submilestone: input.submilestone,
  });
}

export async function getScopedSubmilestonePackageRevision(
  ctx: MutationCtx,
  input: {
    auth: CanonicalSubmilestoneAuth;
    milestone: Doc<"buildMilestones">;
    packageRevisionId: Id<"buildSubmilestoneEvidencePackageRevisions">;
    submilestone: Doc<"buildSubmilestones">;
  },
) {
  const packageRevision = await ctx.db.get(input.packageRevisionId);
  if (
    !packageRevision ||
    packageRevision.buildId !== input.auth.build._id ||
    packageRevision.organizationId !== input.auth.build.organizationId ||
    packageRevision.brokerageId !== input.auth.brokerage._id ||
    packageRevision.proposalId !== input.auth.proposal._id ||
    packageRevision.buildMilestoneId !== input.milestone._id ||
    packageRevision.buildSubmilestoneId !== input.submilestone._id
  ) {
    throw new ConvexError({
      code: "EVIDENCE_PACKAGE_NOT_FOUND",
      message: "Evidence Package revision is unavailable for this Sub-milestone.",
    });
  }
  return packageRevision;
}
