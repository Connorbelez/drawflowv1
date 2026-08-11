import { ConvexError } from "convex/values";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

export type ActiveSubmilestoneEvidenceRequirement = {
  active: boolean;
  buildId: Id<"activeBuilds">;
  buildMilestoneId: Id<"buildMilestones">;
  buildSubmilestoneId: Id<"buildSubmilestones">;
  description?: string;
  kind: "photo" | "document" | "site_visit" | "any";
  label: string;
  locationRequired: boolean;
  organizationId: string;
  proposalId: Id<"buildProposals">;
  required: boolean;
  requirementKey: string;
  revision: number;
  submilestoneKey: string;
};

export type ActiveSubmilestoneEvidenceSourceKind =
  | "canonical_upload"
  | "discussion_promotion"
  | "site_visit";

type EvidenceAssetMetadataInput = Pick<
  Doc<"buildEvidenceAssets">,
  "fileName" | "mimeType"
> & {
  tag?: string;
};

export function normalizeActiveSubmilestoneEvidenceAssetMetadata(
  asset: EvidenceAssetMetadataInput,
) {
  return {
    fileName: asset.fileName.trim().toLowerCase(),
    mimeType: asset.mimeType.trim().toLowerCase(),
    tag: asset.tag?.trim().toLowerCase() ?? "",
  };
}

// Active evidence currently supports the same document format as the
// contractor evidence contract. Keep this explicit so a document requirement
// cannot be satisfied by an arbitrary asset (or by a photo).
const DOCUMENT_EVIDENCE_MIME_TYPES = new Set(["application/pdf"]);

export function activeSubmilestoneEvidenceAssetSatisfiesRequirementKind(input: {
  asset: EvidenceAssetMetadataInput;
  requirement: Pick<ActiveSubmilestoneEvidenceRequirement, "kind">;
  sourceKind: ActiveSubmilestoneEvidenceSourceKind;
}) {
  if (input.requirement.kind === "any") {
    return true;
  }
  if (input.requirement.kind === "site_visit") {
    return input.sourceKind === "site_visit";
  }
  const metadata = normalizeActiveSubmilestoneEvidenceAssetMetadata(input.asset);
  if (input.requirement.kind === "photo") {
    return metadata.mimeType.startsWith("image/");
  }
  return (
    !metadata.mimeType.startsWith("image/") &&
    DOCUMENT_EVIDENCE_MIME_TYPES.has(metadata.mimeType)
  );
}

export function assertActiveSubmilestoneEvidenceRequirementKind(input: {
  asset: EvidenceAssetMetadataInput;
  requirement: Pick<
    ActiveSubmilestoneEvidenceRequirement,
    "kind" | "label" | "requirementKey"
  >;
  sourceKind: ActiveSubmilestoneEvidenceSourceKind;
}) {
  if (
    activeSubmilestoneEvidenceAssetSatisfiesRequirementKind({
      asset: input.asset,
      requirement: input.requirement,
      sourceKind: input.sourceKind,
    })
  ) {
    return;
  }
  throw new ConvexError({
    code: "EVIDENCE_REQUIREMENT_KIND_MISMATCH",
    kind: input.requirement.kind,
    message: `Evidence does not satisfy the ${input.requirement.kind} requirement ${input.requirement.requirementKey}.`,
    requirementKey: input.requirement.requirementKey,
  });
}

const DEFAULT_REQUIREMENT: Omit<
  ActiveSubmilestoneEvidenceRequirement,
  | "buildId"
  | "buildMilestoneId"
  | "buildSubmilestoneId"
  | "organizationId"
  | "proposalId"
  | "submilestoneKey"
> = {
  active: true,
  kind: "any",
  label: "Completion evidence",
  locationRequired: false,
  // A package is still created and frozen for a sub-milestone with no
  // configured requirements, but legacy builds must not acquire an implicit
  // evidence gate merely because this projection was introduced. Product
  // requirements are explicit rows in buildSubmilestoneEvidenceRequirements.
  required: false,
  requirementKey: "completion-evidence",
  revision: 1,
};

type EvidenceContext = {
  build: Doc<"activeBuilds">;
  milestone: Doc<"buildMilestones">;
  submilestone: Doc<"buildSubmilestones">;
};

/**
 * Return the mutable package revision for a sub-milestone. Frozen revisions
 * are immutable: the first subsequent evidence write creates a new draft
 * revision which explicitly supersedes the frozen one.
 */
export async function ensureActiveSubmilestoneEvidencePackageDraft(
  ctx: MutationCtx,
  input: EvidenceContext & {
    actorRoles: string[];
    actorWorkosUserId: string;
    reason?: string;
  }
) {
  const latest = await ctx.db
    .query("buildSubmilestoneEvidencePackageRevisions")
    .withIndex("by_submilestone_revision", (query) =>
      query.eq("buildSubmilestoneId", input.submilestone._id)
    )
    .order("desc")
    .first();
  if (latest) {
    assertActiveSubmilestoneEvidencePackageRevisionScope(latest, input);
  }
  if (latest?.status === "draft") {
    return latest;
  }
  const requirements = await resolveActiveSubmilestoneEvidenceRequirements(
    ctx,
    input
  );
  const now = Date.now();
  const packageRevisionId = await ctx.db.insert(
    "buildSubmilestoneEvidencePackageRevisions",
    {
      brokerageId: input.build.brokerageId,
      buildId: input.build._id,
      buildMilestoneId: input.milestone._id,
      buildSubmilestoneId: input.submilestone._id,
      createdAt: now,
      createdByWorkosUserId: input.actorWorkosUserId,
      organizationId: input.build.organizationId,
      proposalId: input.build.proposalId,
      milestoneKey: input.milestone.key,
      requirementsRevision: requirements.reduce(
        (revision, requirement) => Math.max(revision, requirement.revision),
        1
      ),
      revision: (latest?.revision ?? 0) + 1,
      status: "draft",
      submilestoneKey: input.submilestone.key,
      ...(latest ? { supersedesRevisionId: latest._id } : {}),
      updatedAt: now,
    }
  );
  if (latest) {
    const priorItems = await ctx.db
      .query("buildSubmilestoneEvidencePackageItems")
      .withIndex("by_package_revision", (query) =>
        query.eq("packageRevisionId", latest._id)
      )
      .collect();
    for (const item of priorItems) {
      await ctx.db.insert("buildSubmilestoneEvidencePackageItems", {
        brokerageId: item.brokerageId,
        buildId: item.buildId,
        buildMilestoneId: item.buildMilestoneId,
        buildSubmilestoneId: item.buildSubmilestoneId,
        createdAt: now,
        evidenceAssetId: item.evidenceAssetId,
        locationVerified: item.locationVerified,
        organizationId: item.organizationId,
        packageRevisionId,
        requirementKey: item.requirementKey,
        sourceKind: item.sourceKind,
        sourceUploaderWorkosUserId: item.sourceUploaderWorkosUserId,
        ...(item.sourceAssetVersion === undefined
          ? {}
          : { sourceAssetVersion: item.sourceAssetVersion }),
        ...(item.sourceCapturedAt === undefined
          ? {}
          : { sourceCapturedAt: item.sourceCapturedAt }),
        ...(item.sourceDiscussionAssetId
          ? { sourceDiscussionAssetId: item.sourceDiscussionAssetId }
          : {}),
        ...(item.sourceDiscussionPostId
          ? { sourceDiscussionPostId: item.sourceDiscussionPostId }
          : {}),
        ...(item.sourcePublishedAt === undefined
          ? {}
          : { sourcePublishedAt: item.sourcePublishedAt }),
      });
      const carriedAsset = await ctx.db.get(item.evidenceAssetId);
      if (
        carriedAsset &&
        carriedAsset.buildId === input.build._id &&
        carriedAsset.organizationId === input.build.organizationId
      ) {
        await ctx.db.patch(carriedAsset._id, {
          evidencePackageRevisionId: packageRevisionId,
          updatedAt: now,
        });
      }
    }
  }
  const created = await ctx.db.get(packageRevisionId);
  if (!created) {
    throw new Error("Evidence Package revision became unavailable.");
  }
  if (latest?.status === "frozen") {
    await recordActiveSubmilestoneEvidencePackageSupersessionAudit(ctx, {
      actorRoles: input.actorRoles,
      actorWorkosUserId: input.actorWorkosUserId,
      build: input.build,
      milestone: input.milestone,
      newRevision: created,
      priorRevision: latest,
      reason:
        input.reason ??
        "A new Evidence Package draft superseded the frozen revision.",
      submilestone: input.submilestone,
      timestamp: now,
    });
  }
  return created;
}

/**
 * Associate a canonical Evidence Asset with the current draft package. This
 * is deliberately separate from discussion attachments: only this explicit
 * package membership can satisfy a review requirement.
 */
export async function appendActiveSubmilestoneEvidenceAssetToDraft(
  ctx: MutationCtx,
  input: EvidenceContext & {
    actorRoles: string[];
    actorWorkosUserId: string;
    asset: Doc<"buildEvidenceAssets">;
    sourceKind: ActiveSubmilestoneEvidenceSourceKind;
    sourceDiscussionAsset?: Doc<"buildCollaborationAssets">;
    sourceDiscussionPostId?: Id<"buildCollaborationPosts">;
    requirementKey?: string;
  }
) {
  if (!input.asset.storageId) {
    throw new ConvexError({
      code: "EVIDENCE_STORAGE_REQUIRED",
      message: "Evidence must reference a stored file before package membership.",
    });
  }
  if (
    input.asset.buildId !== input.build._id ||
    input.asset.organizationId !== input.build.organizationId ||
    input.asset.milestoneKey !== input.milestone.key ||
    input.asset.submilestoneKey !== input.submilestone.key
  ) {
    throw new Error("Evidence Asset does not belong to the target sub-milestone.");
  }
  const requirements = await resolveActiveSubmilestoneEvidenceRequirements(
    ctx,
    input
  );
  const requestedRequirementKey = input.requirementKey?.trim();
  if (!requestedRequirementKey && requirements.length > 1) {
    throw new ConvexError({
      code: "EVIDENCE_REQUIREMENT_KEY_REQUIRED",
      message:
        "A requirementKey is required when a sub-milestone has multiple evidence requirements.",
    });
  }
  const explicitlyRequestedRequirement = requestedRequirementKey
    ? requirements.find(
        (candidate) => candidate.requirementKey === requestedRequirementKey,
      )
    : undefined;
  if (requestedRequirementKey && !explicitlyRequestedRequirement) {
    throw new Error(
      `Evidence requirement ${requestedRequirementKey} is not active for this sub-milestone.`,
    );
  }
  const requirement =
    explicitlyRequestedRequirement ?? requirements[0];
  const requirementKey = requirement?.requirementKey ?? "completion-evidence";
  if (requirement) {
    assertActiveSubmilestoneEvidenceRequirementKind({
      asset: input.asset,
      requirement,
      sourceKind: input.sourceKind,
    });
  }
  const packageRevision = await ensureActiveSubmilestoneEvidencePackageDraft(
    ctx,
    input
  );
  const existing = await ctx.db
    .query("buildSubmilestoneEvidencePackageItems")
    .withIndex("by_package_revision", (query) =>
      query.eq("packageRevisionId", packageRevision._id)
    )
    .collect();
  const alreadyIncluded = existing.find(
    (item) =>
      item.evidenceAssetId === input.asset._id &&
      item.requirementKey === requirementKey,
  );
  if (alreadyIncluded) {
    return { packageRevision, item: alreadyIncluded };
  }
  const now = Date.now();
  const sourceDiscussionAsset = input.sourceDiscussionAsset;
  const itemId = await ctx.db.insert("buildSubmilestoneEvidencePackageItems", {
    brokerageId: input.build.brokerageId,
    buildId: input.build._id,
    buildMilestoneId: input.milestone._id,
    buildSubmilestoneId: input.submilestone._id,
    createdAt: now,
    evidenceAssetId: input.asset._id,
    locationVerified: input.asset.locationVerified,
    organizationId: input.build.organizationId,
    packageRevisionId: packageRevision._id,
    requirementKey,
    sourceKind: input.sourceKind,
    sourceUploaderWorkosUserId:
      sourceDiscussionAsset?.uploadedByWorkosUserId ?? input.actorWorkosUserId,
    ...(sourceDiscussionAsset
      ? {
          sourceAssetVersion: sourceDiscussionAsset.version,
          sourceCapturedAt: sourceDiscussionAsset.sourceCapturedAt,
          sourceDiscussionAssetId: sourceDiscussionAsset._id,
          sourcePublishedAt: sourceDiscussionAsset.publishedAt,
        }
      : {}),
    ...(input.sourceDiscussionPostId
      ? { sourceDiscussionPostId: input.sourceDiscussionPostId }
      : {}),
  });
  await ctx.db.patch(input.asset._id, {
    evidencePackageRevisionId: packageRevision._id,
    updatedAt: now,
  });
  return { packageRevision, item: await ctx.db.get(itemId) };
}

export async function freezeActiveSubmilestoneEvidencePackage(
  ctx: MutationCtx,
  input: EvidenceContext & {
    actorWorkosUserId: string;
    actorRoles: string[];
    expectedRevision?: number;
    reason?: string;
  }
) {
  const readiness = await resolveActiveSubmilestoneEvidencePackageReadiness(
    ctx,
    input
  );
  const current = readiness.latestRevision;
  if (
    input.expectedRevision !== undefined &&
    input.expectedRevision !== (current?.revision ?? 0)
  ) {
    throw new Error(
      `Evidence Package revision is stale; expected ${input.expectedRevision}, current ${current?.revision ?? 0}.`
    );
  }
  if (
    readiness.readyExceptFor.some(
      (reason) => reason !== "Evidence Package revision must be frozen"
    )
  ) {
    throw new Error(
      `Evidence Package is not ready: ${readiness.readyExceptFor.join("; ")}.`
    );
  }
  if (!current) {
    const created = await ensureActiveSubmilestoneEvidencePackageDraft(
      ctx,
      input
    );
    const now = Date.now();
    await ctx.db.patch(created._id, {
      frozenAt: now,
      frozenByWorkosUserId: input.actorWorkosUserId,
      status: "frozen",
      updatedAt: now,
    });
    await recordActiveSubmilestoneEvidencePackageFreezeAudit(ctx, {
      actorRoles: input.actorRoles,
      actorWorkosUserId: input.actorWorkosUserId,
      build: input.build,
      milestone: input.milestone,
      packageRevision: created,
      priorStatus: created.status,
      reason: input.reason,
      submilestone: input.submilestone,
      timestamp: now,
    });
    return await ctx.db.get(created._id);
  }
  if (current.status === "frozen") {
    return current;
  }
  const now = Date.now();
  await ctx.db.patch(current._id, {
    frozenAt: now,
    frozenByWorkosUserId: input.actorWorkosUserId,
    status: "frozen",
    updatedAt: now,
  });
  await recordActiveSubmilestoneEvidencePackageFreezeAudit(ctx, {
    actorRoles: input.actorRoles,
    actorWorkosUserId: input.actorWorkosUserId,
    build: input.build,
    milestone: input.milestone,
    packageRevision: current,
    priorStatus: current.status,
    reason: input.reason,
    submilestone: input.submilestone,
    timestamp: now,
  });
  return await ctx.db.get(current._id);
}

async function recordActiveSubmilestoneEvidencePackageFreezeAudit(
  ctx: MutationCtx,
  input: EvidenceContext & {
    actorRoles: string[];
    actorWorkosUserId: string;
    packageRevision: Doc<"buildSubmilestoneEvidencePackageRevisions">;
    priorStatus: Doc<"buildSubmilestoneEvidencePackageRevisions">["status"];
    reason?: string;
    timestamp: number;
  },
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: input.actorRoles,
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: input.build.brokerageId,
    buildId: input.build._id,
    command: "freezeActiveSubmilestoneEvidencePackage",
    createdAt: input.timestamp,
    entityId: String(input.submilestone._id),
    entityType: "buildSubmilestone",
    eventType: "active_build.submilestone.evidence_package_frozen",
    resourceType: "evidence",
    newState: JSON.stringify({
      evidencePackageRevisionId: input.packageRevision._id,
      frozenAt: input.timestamp,
      revision: input.packageRevision.revision,
      status: "frozen",
      submilestoneKey: input.submilestone.key,
    }),
    organizationId: input.build.organizationId,
    priorState: JSON.stringify({
      evidencePackageRevisionId: input.packageRevision._id,
      revision: input.packageRevision.revision,
      status: input.priorStatus,
      submilestoneKey: input.submilestone.key,
    }),
    reason: input.reason,
    warnings: [],
  });
}

async function recordActiveSubmilestoneEvidencePackageSupersessionAudit(
  ctx: MutationCtx,
  input: EvidenceContext & {
    actorRoles: string[];
    actorWorkosUserId: string;
    newRevision: Doc<"buildSubmilestoneEvidencePackageRevisions">;
    priorRevision: Doc<"buildSubmilestoneEvidencePackageRevisions">;
    reason: string;
    timestamp: number;
  },
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: input.actorRoles,
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: input.build.brokerageId,
    buildId: input.build._id,
    command: "ensureActiveSubmilestoneEvidencePackageDraft",
    createdAt: input.timestamp,
    entityId: String(input.submilestone._id),
    entityType: "buildSubmilestone",
    eventType:
      "active_build.submilestone.evidence_package_revision_superseded",
    resourceType: "evidence",
    newState: JSON.stringify({
      evidencePackageRevisionId: input.newRevision._id,
      revision: input.newRevision.revision,
      status: input.newRevision.status,
      submilestoneKey: input.submilestone.key,
      supersedesRevisionId: input.priorRevision._id,
    }),
    organizationId: input.build.organizationId,
    priorState: JSON.stringify({
      evidencePackageRevisionId: input.priorRevision._id,
      revision: input.priorRevision.revision,
      status: input.priorRevision.status,
      submilestoneKey: input.submilestone.key,
    }),
    reason: input.reason,
    warnings: ["frozen_revision_superseded"],
  });
}

export async function resolveActiveSubmilestoneEvidenceRequirements(
  ctx: QueryCtx,
  input: {
    build: Doc<"activeBuilds">;
    milestone: Doc<"buildMilestones">;
    submilestone: Doc<"buildSubmilestones">;
  }
): Promise<ActiveSubmilestoneEvidenceRequirement[]> {
  const rows = await ctx.db
    .query("buildSubmilestoneEvidenceRequirements")
    .withIndex("by_submilestone", (query) =>
      query.eq("buildSubmilestoneId", input.submilestone._id).eq("active", true)
    )
    .collect();
  const scopedRows = rows.filter(
    (row) =>
      row.buildId === input.build._id &&
      row.organizationId === input.build.organizationId &&
      row.brokerageId === input.build.brokerageId &&
      row.buildMilestoneId === input.milestone._id &&
      row.proposalId === input.build.proposalId
  );
  if (scopedRows.length === 0) {
    return [
      {
        ...DEFAULT_REQUIREMENT,
        buildId: input.build._id,
        buildMilestoneId: input.milestone._id,
        buildSubmilestoneId: input.submilestone._id,
        organizationId: input.build.organizationId,
        proposalId: input.build.proposalId,
        submilestoneKey: input.submilestone.key,
      },
    ];
  }
  const latestByRequirementKey = new Map<
    string,
    (typeof scopedRows)[number]
  >();
  for (const row of scopedRows) {
    const current = latestByRequirementKey.get(row.requirementKey);
    if (
      !current ||
      row.revision > current.revision ||
      (row.revision === current.revision && row._creationTime > current._creationTime)
    ) {
      latestByRequirementKey.set(row.requirementKey, row);
    }
  }
  return [...latestByRequirementKey.values()]
    .map((row) => ({
      active: row.active,
      buildId: row.buildId,
      buildMilestoneId: row.buildMilestoneId,
      buildSubmilestoneId: row.buildSubmilestoneId,
      ...(row.description ? { description: row.description } : {}),
      kind: row.kind,
      label: row.label.trim() || row.requirementKey,
      locationRequired: row.locationRequired,
      organizationId: row.organizationId,
      proposalId: row.proposalId,
      required: row.required,
      requirementKey: row.requirementKey,
      revision: row.revision,
      submilestoneKey: row.submilestoneKey,
    }))
    .sort(
      (left, right) =>
        left.requirementKey.localeCompare(right.requirementKey) ||
        left.revision - right.revision
    );
}

export async function resolveActiveSubmilestoneEvidencePackageReadiness(
  ctx: QueryCtx,
  input: {
    build: Doc<"activeBuilds">;
    milestone: Doc<"buildMilestones">;
    packageRevisionId?: Id<"buildSubmilestoneEvidencePackageRevisions">;
    submilestone: Doc<"buildSubmilestones">;
    includeFrozenRequirement?: boolean;
  }
) {
  const requirements = await resolveActiveSubmilestoneEvidenceRequirements(
    ctx,
    input
  );
  const latestRevision = input.packageRevisionId
    ? await ctx.db.get(input.packageRevisionId)
    : await ctx.db
        .query("buildSubmilestoneEvidencePackageRevisions")
        .withIndex("by_submilestone_revision", (query) =>
          query.eq("buildSubmilestoneId", input.submilestone._id)
        )
        .order("desc")
        .first();
  if (
    latestRevision
  ) {
    assertActiveSubmilestoneEvidencePackageRevisionScope(latestRevision, input);
  }
  const packageItems = latestRevision
    ? await ctx.db
        .query("buildSubmilestoneEvidencePackageItems")
        .withIndex("by_package_revision", (query) =>
          query.eq("packageRevisionId", latestRevision._id)
        )
        .collect()
    : [];
  const assets = await Promise.all(
    packageItems.map((item) => ctx.db.get(item.evidenceAssetId))
  );
  const assetById = new Map(
    assets
      .filter((asset): asset is Doc<"buildEvidenceAssets"> => Boolean(asset))
      .map((asset) => [String(asset._id), asset])
  );
  const readyExceptFor: string[] = [];
  for (const requirement of requirements.filter(
    (candidate) => candidate.required
  )) {
    const matchingItems = packageItems.filter(
      (item) => item.requirementKey === requirement.requirementKey
    );
    const matchingRecords = matchingItems.map((item) => ({
      asset: assetById.get(String(item.evidenceAssetId)),
      item,
    }));
    const matchingAssets = matchingRecords.reduce<
      Doc<"buildEvidenceAssets">[]
    >((assets, { asset, item }) => {
      if (
        !asset?.storageId ||
        !activeSubmilestoneEvidenceAssetSatisfiesRequirementKind({
          asset,
          requirement,
          sourceKind: item.sourceKind,
        })
      ) {
        return assets;
      }
      assets.push(asset);
      return assets;
    }, []);
    const hasInvalidSiteVisitItem =
      requirement.kind === "site_visit" &&
      matchingItems.some((item) => item.sourceKind !== "site_visit");
    if (matchingAssets.length === 0 || hasInvalidSiteVisitItem) {
      readyExceptFor.push(requirement.label);
      continue;
    }
    if (
      requirement.locationRequired &&
      !matchingAssets.some((asset) => asset.locationVerified)
    ) {
      readyExceptFor.push(`Location verification: ${requirement.label}`);
    }
  }
  if (
    input.includeFrozenRequirement !== false &&
    (!latestRevision || latestRevision.status !== "frozen")
  ) {
    readyExceptFor.push("Evidence Package revision must be frozen");
  }
  return {
    evidenceCount: packageItems.length,
    latestRevision,
    packageItems,
    readyExceptFor,
    requirements,
    requirementsRevision: requirements.reduce(
      (revision, requirement) => Math.max(revision, requirement.revision),
      1
    ),
  };
}

function assertActiveSubmilestoneEvidencePackageRevisionScope(
  revision: Doc<"buildSubmilestoneEvidencePackageRevisions">,
  input: EvidenceContext,
) {
  if (
    revision.brokerageId !== input.build.brokerageId ||
    revision.buildId !== input.build._id ||
    revision.organizationId !== input.build.organizationId ||
    revision.buildMilestoneId !== input.milestone._id ||
    revision.buildSubmilestoneId !== input.submilestone._id ||
    revision.proposalId !== input.build.proposalId
  ) {
    throw new Error(
      "Evidence Package revision does not belong to the target sub-milestone.",
    );
  }
}
