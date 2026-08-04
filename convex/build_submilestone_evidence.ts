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
  input: EvidenceContext & { actorWorkosUserId: string }
) {
  const latest = await ctx.db
    .query("buildSubmilestoneEvidencePackageRevisions")
    .withIndex("by_submilestone_revision", (query) =>
      query.eq("buildSubmilestoneId", input.submilestone._id)
    )
    .order("desc")
    .first();
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
    actorWorkosUserId: string;
    asset: Doc<"buildEvidenceAssets">;
    sourceKind: "canonical_upload" | "discussion_promotion" | "site_visit";
    sourceDiscussionAsset?: Doc<"buildCollaborationAssets">;
    sourceDiscussionPostId?: Id<"buildCollaborationPosts">;
    requirementKey?: string;
  }
) {
  const packageRevision = await ensureActiveSubmilestoneEvidencePackageDraft(
    ctx,
    input
  );
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
  const explicitlyRequestedRequirement = input.requirementKey
    ? requirements.find(
        (candidate) => candidate.requirementKey === input.requirementKey,
      )
    : undefined;
  if (input.requirementKey && !explicitlyRequestedRequirement) {
    throw new Error(
      `Evidence requirement ${input.requirementKey} is not active for this sub-milestone.`,
    );
  }
  const requirement =
    explicitlyRequestedRequirement ??
    requirements.find((candidate) => candidate.required) ??
    requirements[0];
  const requirementKey = requirement?.requirementKey ?? "completion-evidence";
  const existing = await ctx.db
    .query("buildSubmilestoneEvidencePackageItems")
    .withIndex("by_package_revision", (query) =>
      query.eq("packageRevisionId", packageRevision._id)
    )
    .collect();
  const alreadyIncluded = existing.find(
    (item) => item.evidenceAssetId === input.asset._id
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
    expectedRevision?: number;
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
  return await ctx.db.get(current._id);
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
  return scopedRows
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
    latestRevision &&
    (latestRevision.buildId !== input.build._id ||
      latestRevision.organizationId !== input.build.organizationId ||
      latestRevision.buildMilestoneId !== input.milestone._id ||
      latestRevision.buildSubmilestoneId !== input.submilestone._id ||
      latestRevision.proposalId !== input.build.proposalId)
  ) {
    throw new Error("Evidence Package revision does not belong to the target sub-milestone.");
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
    const matchingAssets = matchingItems
      .map((item) => assetById.get(String(item.evidenceAssetId)))
      .filter((asset): asset is Doc<"buildEvidenceAssets"> => Boolean(asset));
    if (matchingAssets.length === 0) {
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
