/**
 * Production proposals site visit helpers bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { defaultSiteVisitGuidance, guidanceHtmlExceedsMaxLength, normalizeSiteVisitGuidance, SITE_VISIT_GUIDANCE_HTML_MAX_LENGTH } from "../demo_site_visit_guidance";
import { assertCompleteSiteVisitFieldGuidance, upsertSiteVisitFieldGuidance } from "../submilestone_field_guidance";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { authorizeActiveBuildOrThrow } from "./authorization_core.js";
import { type ProductionSettingsSiteVisitGuidanceInput, type SiteVisitGuidanceSectionInput } from "./contracts_foundation.js";

export async function resolveActiveBuildSiteVisitConfiguration(
  ctx: QueryCtx | MutationCtx,
  milestone: Doc<"buildMilestones">,
  guidanceInput: ProductionSettingsSiteVisitGuidanceInput | undefined,
  requestedSubmilestoneKeys: string[] | undefined,
  guidanceSectionsInput: SiteVisitGuidanceSectionInput[] | undefined,
  build: Doc<"activeBuilds">,
) {
  const submilestones = await ctx.db
    .query("buildSubmilestones")
    .withIndex("by_milestone", (q) => q.eq("buildMilestoneId", milestone._id))
    .take(501);
  if (submilestones.length > 500) {
    throw new Error("Site visit has too many Sub-milestones to order.");
  }
  const availableKeys = new Set(submilestones.map((item) => item.key));
  const rawRequestedKeys = (requestedSubmilestoneKeys ?? []).map((key) =>
    key.trim(),
  );
  if (rawRequestedKeys.some((key) => !key)) {
    throw new Error("Site visit scope cannot contain empty Sub-milestone keys.");
  }
  const requestedKeys = rawRequestedKeys;
  if (new Set(requestedKeys).size !== requestedKeys.length) {
    throw new Error("Site visit scope cannot contain duplicate Sub-milestones.");
  }
  const invalidKeys = requestedKeys.filter((key) => !availableKeys.has(key));
  if (invalidKeys.length > 0) {
    throw new Error(
      `Site visit scope contains unknown submilestones: ${invalidKeys.join(", ")}.`,
    );
  }
  const buildSubmilestoneById = new Map(
    submilestones.map((submilestone) => [
      String(submilestone._id),
      submilestone,
    ]),
  );
  const selectedSubmilestones =
    requestedKeys.length > 0
      ? submilestones
          .filter((submilestone) => requestedKeys.includes(submilestone.key))
          .sort(compareSiteVisitSubmilestones)
      : guidanceSectionsInput !== undefined
        ? guidanceSectionsInput
            .map((section) => {
              const submilestone = buildSubmilestoneById.get(
                String(section.buildSubmilestoneId),
              );
              if (!submilestone) {
                throw new Error(
                  "Site visit Guidance references an unknown Sub-milestone.",
                );
              }
              return submilestone;
            })
            .sort(compareSiteVisitSubmilestones)
        : submilestones.slice().sort(compareSiteVisitSubmilestones);
  const guidanceSections = await resolveActiveBuildSiteVisitGuidanceSections(
    ctx,
    {
      build,
      buildSubmilestoneById,
      guidanceSectionsInput,
      milestone,
      selectedSubmilestones,
    },
  );
  const fallback = defaultSiteVisitGuidance(
    milestone.key,
    milestone.name,
    submilestones.map((item) => item.name),
  );
  const siteVisitGuidance = normalizeSiteVisitGuidance(
    guidanceInput ?? milestone.siteVisitGuidance,
    fallback,
  );
  if (
    !(siteVisitGuidance.whatToVerify && siteVisitGuidance.cameraAngles) ||
    guidanceHtmlExceedsMaxLength(siteVisitGuidance)
  ) {
    throw new Error(
      `Site visit guidance requires both fields and each must be at most ${SITE_VISIT_GUIDANCE_HTML_MAX_LENGTH} characters.`,
    );
  }
  return {
    guidanceSections,
    siteVisitGuidance,
    ...(requestedKeys.length === 1
      ? {
          submilestoneId: submilestones.find(
            (submilestone) => submilestone.key === requestedKeys[0],
          )?._id,
        }
      : {}),
    submilestoneKeys:
      requestedKeys.length > 0
        ? requestedKeys
        : selectedSubmilestones.map((item) => item.key),
  };
}

type ActiveBuildSiteVisitGuidanceSection = {
  buildSubmilestone: Doc<"buildSubmilestones">;
  cameraAnglesTiptapJson: string;
  proposalSubmilestoneId: Id<"proposalSubmilestones">;
  whatToVerifyTiptapJson: string;
};

function compareSiteVisitSubmilestones(
  left: Doc<"buildSubmilestones">,
  right: Doc<"buildSubmilestones">,
) {
  return (
    left.order - right.order ||
    left.key.localeCompare(right.key) ||
    String(left._id).localeCompare(String(right._id))
  );
}

async function resolveActiveBuildSiteVisitGuidanceSections(
  ctx: QueryCtx | MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    buildSubmilestoneById: Map<string, Doc<"buildSubmilestones">>;
    guidanceSectionsInput: SiteVisitGuidanceSectionInput[] | undefined;
    milestone: Doc<"buildMilestones">;
    selectedSubmilestones: Doc<"buildSubmilestones">[];
  },
): Promise<ActiveBuildSiteVisitGuidanceSection[]> {
  if (input.guidanceSectionsInput !== undefined) {
    const seenBuildIds = new Set<string>();
    const byBuildId = new Map<string, SiteVisitGuidanceSectionInput>();
    for (const section of input.guidanceSectionsInput) {
      const buildId = String(section.buildSubmilestoneId);
      if (seenBuildIds.has(buildId)) {
        throw new Error("Site visit Guidance sections cannot contain duplicates.");
      }
      seenBuildIds.add(buildId);
      const buildSubmilestone = input.buildSubmilestoneById.get(buildId);
      if (!buildSubmilestone) {
        throw new Error("Site visit Guidance references an unknown Sub-milestone.");
      }
      if (buildSubmilestone.proposalSubmilestoneId !== section.proposalSubmilestoneId) {
        throw new Error("Site visit Guidance Proposal lineage does not match the Build Sub-milestone.");
      }
      if (
        buildSubmilestone.buildId !== input.build._id ||
        buildSubmilestone.buildMilestoneId !== input.milestone._id ||
        buildSubmilestone.organizationId !== input.build.organizationId ||
        buildSubmilestone.brokerageId !== input.build.brokerageId
      ) {
        throw new Error("Site visit Guidance Build lineage is unavailable.");
      }
      const proposalSubmilestone = await ctx.db.get(
        section.proposalSubmilestoneId,
      );
      if (
        !proposalSubmilestone ||
        proposalSubmilestone.proposalId !== input.build.proposalId ||
        proposalSubmilestone.proposalMilestoneId !== input.milestone.proposalMilestoneId ||
        proposalSubmilestone.organizationId !== input.build.organizationId ||
        proposalSubmilestone.brokerageId !== input.build.brokerageId
      ) {
        throw new Error("Site visit Guidance Proposal lineage is unavailable.");
      }
      assertCompleteSiteVisitFieldGuidance(section);
      byBuildId.set(buildId, section);
    }
    const selectedIds = new Set(
      input.selectedSubmilestones.map((submilestone) => String(submilestone._id)),
    );
    const extraIds = [...byBuildId.keys()].filter((id) => !selectedIds.has(id));
    const missingIds = [...selectedIds].filter((id) => !byBuildId.has(id));
    if (extraIds.length > 0 || missingIds.length > 0) {
      throw new Error(
        "Site visit Guidance sections must exactly match the selected Sub-milestones.",
      );
    }
    return input.selectedSubmilestones
      .slice()
      .sort(compareSiteVisitSubmilestones)
      .map((buildSubmilestone) => {
        const section = byBuildId.get(String(buildSubmilestone._id));
        if (!section) {
          throw new Error("Site visit Guidance section is missing.");
        }
        return {
          buildSubmilestone,
          cameraAnglesTiptapJson: section.cameraAnglesTiptapJson,
          proposalSubmilestoneId: section.proposalSubmilestoneId,
          whatToVerifyTiptapJson: section.whatToVerifyTiptapJson,
        };
      });
  }

  const rows: ActiveBuildSiteVisitGuidanceSection[] = [];
  // New Visit commands fail closed when a selected canonical Guidance row is
  // missing or incomplete. Only token reads preserve the pre-cutover
  // milestone-wide legacy shape; they must never invent a new snapshot.
  for (const buildSubmilestone of input.selectedSubmilestones
    .slice()
    .sort(compareSiteVisitSubmilestones)) {
    const guidance = await ctx.db
      .query("submilestoneFieldGuidance")
      .withIndex("by_proposalSubmilestoneId", (query) =>
        query.eq("proposalSubmilestoneId", buildSubmilestone.proposalSubmilestoneId),
      )
      .unique();
    if (!guidance) {
      throw new Error(
        `Site Visit Field Guidance is missing for Sub-milestone ${buildSubmilestone.key}.`,
      );
    }
    if (
      guidance.organizationId !== input.build.organizationId ||
      guidance.brokerageId !== input.build.brokerageId ||
      guidance.proposalId !== input.build.proposalId ||
      guidance.proposalSubmilestoneId !== buildSubmilestone.proposalSubmilestoneId ||
      (guidance.buildId !== undefined && guidance.buildId !== input.build._id) ||
      (guidance.buildSubmilestoneId !== undefined &&
        guidance.buildSubmilestoneId !== buildSubmilestone._id)
    ) {
      throw new Error("Site Visit Field Guidance lineage is unavailable.");
    }
    assertCompleteSiteVisitFieldGuidance(guidance);
    rows.push({
      buildSubmilestone,
      cameraAnglesTiptapJson: guidance.cameraAnglesTiptapJson,
      proposalSubmilestoneId: buildSubmilestone.proposalSubmilestoneId,
      whatToVerifyTiptapJson: guidance.whatToVerifyTiptapJson,
    });
  }
  return rows;
}

export async function saveSiteVisitCanonicalGuidance(
  ctx: MutationCtx,
  input: {
    auth: Awaited<ReturnType<typeof authorizeActiveBuildOrThrow>>;
    guidanceSections: ActiveBuildSiteVisitGuidanceSection[];
    now: number;
    organizationId: string;
  },
) {
  for (const section of input.guidanceSections) {
    await upsertSiteVisitFieldGuidance(ctx, {
      brokerageId: input.auth.brokerage._id,
      buildId: input.auth.build._id,
      buildSubmilestoneId: section.buildSubmilestone._id,
      cameraAnglesTiptapJson: section.cameraAnglesTiptapJson,
      now: input.now,
      organizationId: input.organizationId,
      proposalId: input.auth.build.proposalId,
      proposalSubmilestoneId: section.proposalSubmilestoneId,
      updatedByWorkosUserId: input.auth.subject,
      whatToVerifyTiptapJson: section.whatToVerifyTiptapJson,
    });
  }
}

export async function insertSiteVisitGuidanceSnapshots(
  ctx: MutationCtx,
  input: {
    auth: Awaited<ReturnType<typeof authorizeActiveBuildOrThrow>>;
    buildSiteVisitId: Id<"buildSiteVisits">;
    guidanceSections: ActiveBuildSiteVisitGuidanceSection[];
    milestone: Doc<"buildMilestones">;
    now: number;
    organizationId: string;
  },
) {
  for (const [index, section] of input.guidanceSections.entries()) {
    await ctx.db.insert("buildSiteVisitGuidanceSections", {
      brokerageId: input.auth.brokerage._id,
      buildId: input.auth.build._id,
      buildMilestoneId: input.milestone._id,
      buildSiteVisitId: input.buildSiteVisitId,
      cameraAnglesTiptapJson: section.cameraAnglesTiptapJson,
      capturedAt: input.now,
      milestoneKey: input.milestone.key,
      // Snapshot order is owned by this ordered array. Build roadmap rows can
      // carry duplicate or legacy order values, so they must never become the
      // immutable Visit section identity.
      order: index + 1,
      organizationId: input.organizationId,
      proposalSubmilestoneId: section.proposalSubmilestoneId,
      buildSubmilestoneId: section.buildSubmilestone._id,
      submilestoneKey: section.buildSubmilestone.key,
      submilestoneName: section.buildSubmilestone.name,
      whatToVerifyTiptapJson: section.whatToVerifyTiptapJson,
    });
  }
}

export async function getActiveBuildSiteVisitTokenState(
  ctx: QueryCtx | MutationCtx,
  buildIdValue: string,
  token: string,
  options?: { allowUnassignedTarget?: boolean },
) {
  const buildId = ctx.db.normalizeId("activeBuilds", buildIdValue);
  if (!buildId) {
    return {
      available: false,
      build: null,
      files: [],
      reason: "not_found",
      status: "invalid",
      targets: [],
      visit: null,
    };
  }
  const build = await ctx.db.get(buildId);
  if (!build) {
    return {
      available: false,
      build: null,
      files: [],
      reason: "not_found",
      status: "invalid",
      targets: [],
      visit: null,
    };
  }
  const visit = await ctx.db
    .query("buildSiteVisits")
    .withIndex("by_visit", (q) => q.eq("visitId", token))
    .unique();
  const buildView = {
    address: build.location,
    key: String(build._id),
    locationLatitude: build.locationLatitude,
    locationLongitude: build.locationLongitude,
    name: build.buildName,
    subtitle: build.location,
  };
  if (!visit || visit.buildId !== buildId) {
    return {
      available: false,
      build: buildView,
      files: [],
      reason: "not_found",
      status: "invalid",
      targets: [],
      visit: null,
    };
  }
  const [
    milestone,
    submilestones,
    guidanceSections,
    evidenceAssets,
    contractorAssignments,
    permitDocuments,
  ] = await Promise.all([
    ctx.db.get(visit.buildMilestoneId),
    ctx.db
      .query("buildSubmilestones")
      .withIndex("by_milestone", (q) =>
        q.eq("buildMilestoneId", visit.buildMilestoneId),
      )
      .collect(),
    ctx.db
      .query("buildSiteVisitGuidanceSections")
      .withIndex("by_buildSiteVisitId_and_order", (q) =>
        q.eq("buildSiteVisitId", visit._id),
      )
      .take(501),
    ctx.db
      .query("buildEvidenceAssets")
      .withIndex("by_build_milestone", (q) =>
        q.eq("buildId", buildId).eq("milestoneKey", visit.milestoneKey),
      )
      .collect(),
    ctx.db
      .query("milestoneContractorAssignments")
      .withIndex("by_build_milestone", (q) =>
        q.eq("buildId", buildId).eq("milestoneKey", visit.milestoneKey),
      )
      .collect(),
    ctx.db
      .query("buildDocuments")
      .withIndex("by_build_type", (q) =>
        q.eq("buildId", buildId).eq("documentType", "permit"),
      )
      .collect(),
  ]);
  if (guidanceSections.length > 500) {
    return {
      available: false,
      build: buildView,
      files: [],
      reason: "guidance_sections_overflow" as const,
      status: "invalid" as const,
      targets: [],
      visit: null,
    };
  }
  const expectedWorkOrderId = `WO-${visit.visitId}`;
  const expectedEvidencePackageId = `EP-${String(buildId)}-${visit.milestoneKey}`;
  const guidanceSectionLineageIsInvalid = guidanceSections.some(
    (section) =>
      section.brokerageId !== build.brokerageId ||
      section.organizationId !== build.organizationId ||
      section.buildId !== buildId ||
      section.buildSiteVisitId !== visit._id ||
      section.buildMilestoneId !== visit.buildMilestoneId ||
      section.milestoneKey !== visit.milestoneKey,
  );
  const scopeIdentityIsInvalid =
    (milestone !== null && milestone.buildId !== buildId) ||
    (milestone !== null && milestone.key !== visit.milestoneKey) ||
    visit.brokerageId !== build.brokerageId ||
    visit.organizationId !== build.organizationId ||
    guidanceSectionLineageIsInvalid ||
    (visit.workOrderId !== undefined &&
      visit.workOrderId !== expectedWorkOrderId) ||
    (visit.evidencePackageId !== undefined &&
      visit.evidencePackageId !== expectedEvidencePackageId);
  const targetIsUnavailable =
    milestone === null || milestone.planningState === "superseded";
  const scopeIsInvalid =
    scopeIdentityIsInvalid ||
    (targetIsUnavailable && !options?.allowUnassignedTarget);
  if (scopeIsInvalid) {
    return {
      available: false,
      build: buildView,
      files: [],
      reason: "not_found" as const,
      status: "invalid" as const,
      targets: [],
      visit: null,
    };
  }
  const assignedContractorProfiles = await Promise.all(
    contractorAssignments.map((assignment) =>
      ctx.db.get(assignment.contractorId),
    ),
  );
  const contractorById = new Map(
    assignedContractorProfiles
      .filter((contractor) => contractor !== null)
      .map((contractor) => [String(contractor!._id), contractor!]),
  );
  const files = await Promise.all(
    evidenceAssets
      .filter((asset) =>
        asset.source.startsWith(`active_build_site_visit:${token}`),
      )
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(async (asset) => ({
        _id: String(asset._id),
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        targetMilestoneKey: asset.milestoneKey,
        targetSubmilestoneKey: asset.submilestoneKey,
        uploadedAt: asset.createdAt,
        url: asset.storageId ? await ctx.storage.getUrl(asset.storageId) : null,
      })),
  );
  const permit = await getActiveBuildSiteVisitPermit(ctx, permitDocuments);
  const scopedSubmilestoneKeys = new Set(visit.submilestoneKeys ?? []);
  const visitGuidance = milestone
    ? normalizeSiteVisitGuidance(
        visit.siteVisitGuidance ?? milestone.siteVisitGuidance,
        defaultSiteVisitGuidance(
          milestone.key,
          milestone.name,
          submilestones.map((item) => item.name),
        ),
      )
    : null;
  const targets = milestone
    ? [
        {
          _id: String(milestone._id),
          guidance: visitGuidance,
          ...(guidanceSections.length > 0
            ? {
                guidanceSections: guidanceSections
                  .slice()
                  .sort((left, right) => left.order - right.order)
                  .map((section) => ({
                    buildSubmilestoneId: String(section.buildSubmilestoneId),
                    cameraAnglesTiptapJson: section.cameraAnglesTiptapJson,
                    capturedAt: section.capturedAt,
                    order: section.order,
                    proposalSubmilestoneId: String(
                      section.proposalSubmilestoneId,
                    ),
                    submilestoneKey: section.submilestoneKey,
                    submilestoneName: section.submilestoneName,
                    whatToVerifyTiptapJson: section.whatToVerifyTiptapJson,
                  })),
              }
            : {}),
          milestoneKey: milestone.key,
          milestoneName: milestone.name,
          milestoneOrder: milestone.order,
          contractors: contractorAssignments
            .map((assignment) => {
              const contractor = contractorById.get(
                String(assignment.contractorId),
              );
              if (!contractor) {
                return null;
              }
              return {
                _id: String(contractor._id),
                assignmentId: String(assignment._id),
                name: contractor.name,
                role: assignment.role,
                submilestoneKey: assignment.submilestoneKey,
              };
            })
            .filter(Boolean),
          submilestones: submilestones
            .filter(
              (submilestone) =>
                scopedSubmilestoneKeys.size === 0 ||
                scopedSubmilestoneKeys.has(submilestone.key),
            )
            .sort((a, b) => a.order - b.order)
            .map((submilestone) => ({
              key: submilestone.key,
              name: submilestone.name,
            })),
        },
      ]
    : [];
  const visitView = {
    completedAt: visit.completedAt ? Date.parse(visit.completedAt) : undefined,
    createdAt: visit.createdAt,
    evidencePackageId: visit.evidencePackageId ?? expectedEvidencePackageId,
    organizationId: visit.organizationId,
    workOrderId: visit.workOrderId ?? expectedWorkOrderId,
    locationAttempt: visit.locationAttempt,
    milestoneKey: visit.milestoneKey,
    missingPrerequisites: visit.missingPrerequisites,
    prerequisiteException: visit.prerequisiteException,
    recommendedOutcome:
      milestone?.completionReview?.siteVisit?.recommendedOutcome,
    requestReason: visit.note,
    status: visit.status,
    tokenConsumedAt: visit.tokenConsumedAt,
    tokenExpiresAt: visit.tokenExpiresAt,
  };
  const now = Date.now();
  if (visit.tokenConsumedAt || visit.status !== "requested") {
    return {
      available: false,
      build: buildView,
      files,
      permit,
      reason: "consumed",
      status: "completed",
      targets,
      visit: visitView,
    };
  }
  if (visit.tokenExpiresAt <= now) {
    return {
      available: false,
      build: buildView,
      files,
      permit,
      reason: "expired",
      status: "expired",
      targets,
      visit: visitView,
    };
  }
  return {
    available: true,
    build: buildView,
    files,
    permit,
    targets,
    visit: visitView,
  };
}

async function getActiveBuildSiteVisitPermit(
  ctx: QueryCtx | MutationCtx,
  documents: Doc<"buildDocuments">[],
) {
  const permit = documents
    .filter(
      (document) =>
        document.status !== "superseded" && !document.supersededByDocumentId,
    )
    .sort(
      (left, right) =>
        (right.version ?? 1) - (left.version ?? 1) ||
        right.updatedAt - left.updatedAt ||
        right.createdAt - left.createdAt,
    )[0];
  if (!permit) {
    return null;
  }
  return {
    _id: String(permit._id),
    fileName: permit.fileName,
    kind: permit.documentType,
    mimeType: permit.mimeType,
    name: permit.fileName,
    sizeBytes: permit.sizeBytes,
    storageUrl: permit.storageId
      ? await ctx.storage.getUrl(permit.storageId)
      : null,
    url: null,
  };
}
