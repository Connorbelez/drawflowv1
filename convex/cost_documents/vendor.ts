import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import {
  type AuthorizedViewer,
  authenticatedMutation,
  authenticatedQuery,
  backofficeQuery,
} from "../authz";
import { createCanonicalContractorProfile } from "../contractor_profile_application";
import { normalizeContractorEmail } from "../contractorWorkspace";
import {
  authorizeCostDocumentIntent,
  canCreateCostDocumentVendor,
  requireCurrentContractorCostDocumentScope,
} from "../cost_document_access";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";
import {
  activeBuildScopeFields,
  costDocumentVendorCreateAccessValidator,
  costDocumentVendorCreationResultValidator,
  costDocumentVendorHistorySummaryValidator,
  costDocumentVendorOptionValidator,
  costDocumentVendorPartyTypeValidator,
  MAX_VENDOR_DUPLICATE_CANDIDATES,
  MAX_VENDOR_OPTIONS,
  optionalText,
  requiredText,
} from "./contracts";

export const listCostDocumentSubmilestoneOptions = authenticatedQuery
  .input(activeBuildScopeFields)
  .returns(
    v.array(
      v.object({
        id: v.id("buildSubmilestones"),
        label: v.string(),
        milestoneKey: v.string(),
        milestoneName: v.string(),
        milestoneOrder: v.number(),
        milestoneBudgetCents: v.number(),
        milestoneActualCostCents: v.number(),
        milestoneStatus: v.union(
          v.literal("planned"),
          v.literal("in_progress"),
          v.literal("complete")
        ),
        milestoneDayStart: v.number(),
        milestoneDayEnd: v.number(),
        budgetCents: v.optional(v.number()),
        actualCostCents: v.optional(v.number()),
      })
    )
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeCostDocumentIntent(ctx, {
      ...args,
      intent: "create",
    });
    const [rows, milestones] = await Promise.all([
      ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (query) =>
          query.eq("buildId", authorization.build._id)
        )
        .take(501),
      ctx.db
        .query("buildMilestones")
        .withIndex("by_build", (query) =>
          query.eq("buildId", authorization.build._id)
        )
        .take(501),
    ]);
    if (rows.length > 500) {
      throw new Error("Cost Document allocation options are unavailable.");
    }
    if (milestones.length > 500) {
      throw new Error("Cost Document allocation options are unavailable.");
    }
    if (
      rows.some(
        (row) =>
          row.organizationId !== authorization.organizationId ||
          row.brokerageId !== authorization.brokerage._id ||
          row.buildId !== authorization.build._id
      )
    ) {
      throw new Error("Cost Document allocation options are unavailable.");
    }
    if (
      milestones.some(
        (milestone) =>
          milestone.organizationId !== authorization.organizationId ||
          milestone.brokerageId !== authorization.brokerage._id ||
          milestone.buildId !== authorization.build._id
      )
    ) {
      throw new Error("Cost Document allocation options are unavailable.");
    }
    const milestoneById = new Map(
      milestones.map((milestone) => [String(milestone._id), milestone])
    );
    const rowsWithMilestones = rows.map((row) => {
      const milestone = milestoneById.get(String(row.buildMilestoneId));
      if (!milestone || milestone.key !== row.milestoneKey) {
        throw new Error("Cost Document allocation options are unavailable.");
      }
      return { milestone, row };
    });
    let allowedIds: Set<string> | undefined;
    if (authorization.effectiveRole.role === "contractor") {
      const contractorScope = await requireCurrentContractorCostDocumentScope(
        ctx,
        {
          authorization,
          purpose: "draft.write",
          workosUserId: authorization.viewer.subject,
        }
      );
      allowedIds = new Set(
        contractorScope.qualifyingSubmilestoneIds.map(String)
      );
    }
    const rowsForProjection = rowsWithMilestones.filter(
      ({ row }) => !allowedIds || allowedIds.has(String(row._id))
    );
    const milestoneActualCostByKey = new Map<string, number>();
    for (const { row } of rowsForProjection) {
      milestoneActualCostByKey.set(
        row.milestoneKey,
        (milestoneActualCostByKey.get(row.milestoneKey) ?? 0) +
          Math.max(0, row.actualCostCents ?? 0)
      );
    }
    return rowsForProjection
      .sort(
        (left, right) =>
          left.milestone.order - right.milestone.order ||
          left.row.order - right.row.order ||
          left.row.name.localeCompare(right.row.name)
      )
      .map(({ milestone, row }) => ({
        ...(row.actualCostCents === undefined
          ? {}
          : { actualCostCents: row.actualCostCents }),
        ...(row.budgetCents === undefined
          ? {}
          : { budgetCents: row.budgetCents }),
        id: row._id,
        label: `${milestone.name} · ${row.name}`,
        milestoneActualCostCents:
          milestoneActualCostByKey.get(row.milestoneKey) ?? 0,
        milestoneBudgetCents: milestone.budgetCents,
        milestoneDayEnd: milestone.dayEnd,
        milestoneDayStart: milestone.dayStart,
        milestoneKey: milestone.key,
        milestoneName: milestone.name,
        milestoneOrder: milestone.order,
        milestoneStatus: milestone.status,
      }));
  })
  .public();

/**
 * Organization-scoped party options for Cost Document capture. The Build
 * authorization still gates the route, while the profile lookup stays on the
 * canonical brokerage identity table used by quote recipients and Contractor
 * Workspace assignments.
 */
export const listCostDocumentVendorOptions = authenticatedQuery
  .input({
    ...activeBuildScopeFields,
    search: v.optional(v.string()),
  })
  .returns(v.array(costDocumentVendorOptionValidator))
  .handler(async (ctx, args) => {
    const authorization = await authorizeCostDocumentIntent(ctx, {
      ...args,
      intent: "create",
    });
    const normalizedSearch = args.search?.trim().toLocaleLowerCase("en-CA");
    const profiles = await listCostDocumentVendorProfiles(ctx, authorization);
    return profiles
      .filter(
        (profile) =>
          !normalizedSearch ||
          [profile.name, profile.email, profile.city, ...profile.trades]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("en-CA")
            .includes(normalizedSearch)
      )
      .slice(0, MAX_VENDOR_OPTIONS)
      .map(costDocumentVendorOptionForProfile);
  })
  .public();

export const getCostDocumentVendorCreateAccess = authenticatedQuery
  .input(activeBuildScopeFields)
  .returns(costDocumentVendorCreateAccessValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeCostDocumentIntent(ctx, {
      ...args,
      intent: "submitted.read",
    });
    return { canCreate: canCreateCostDocumentVendor(authorization) };
  })
  .public();

/**
 * Creates a canonical organization party from the Capture & confirm picker.
 * Duplicate candidates are returned before insertion so the UI can keep the
 * current draft open and let the uploader link existing history instead.
 */
export const createCostDocumentVendorProfile = authenticatedMutation
  .input({
    ...activeBuildScopeFields,
    allowDuplicate: v.optional(v.boolean()),
    city: v.optional(v.string()),
    email: v.optional(v.string()),
    name: v.string(),
    partyType: costDocumentVendorPartyTypeValidator,
    phone: v.optional(v.string()),
  })
  .returns(costDocumentVendorCreationResultValidator)
  .handler(async (ctx, args) => {
    const accessAuthorization = await authorizeCostDocumentIntent(ctx, {
      ...args,
      intent: "submitted.read",
    });
    if (!canCreateCostDocumentVendor(accessAuthorization)) {
      throw new Error(
        "You do not have permission to create a party from Cost Document capture."
      );
    }
    const authorization = await authorizeCostDocumentIntent(ctx, {
      ...args,
      intent: "create",
    });

    const name = requiredText(args.name, "Party name", 160);
    const email = optionalText(args.email, "Email", 320);
    const normalizedEmail = normalizeContractorEmail(email);
    if (email && !normalizedEmail) {
      throw new Error("Enter a valid email address or leave it blank.");
    }
    const city = optionalText(args.city, "City", 120);
    const phone = optionalText(args.phone, "Phone", 80);
    const duplicateCandidates = await listCostDocumentVendorDuplicateCandidates(
      ctx,
      authorization
    );
    const existingEmailProfile = normalizedEmail
      ? ((await findCostDocumentVendorProfileByNormalizedEmail(
          ctx,
          authorization,
          normalizedEmail
        )) ??
        duplicateCandidates.find(
          (profile) =>
            normalizeContractorEmail(profile.email) === normalizedEmail
        ))
      : undefined;
    if (existingEmailProfile) {
      return {
        created: false,
        duplicateOptions: [],
        option: costDocumentVendorOptionForProfile(existingEmailProfile),
      };
    }
    const duplicateOptions = duplicateCandidates
      .filter((profile) =>
        isPotentialCostDocumentVendorDuplicate(profile.name, name)
      )
      .slice(0, 5)
      .map(costDocumentVendorOptionForProfile);
    if (duplicateOptions.length > 0 && !args.allowDuplicate) {
      return {
        created: false,
        duplicateOptions,
      };
    }

    const now = Date.now();
    const profileId = await createCanonicalContractorProfile(ctx, {
      brokerageId: authorization.brokerage._id,
      fields: {
        city,
        costDocumentPartyType: args.partyType,
        email,
        kind: "company",
        name,
        normalizedEmail: normalizedEmail || undefined,
        onboardingStatus: "profile_only",
        quoteRecipientCapabilities:
          args.partyType === "vendor" ? [] : [args.partyType],
        source:
          authorization.effectiveRole.role === "admin" ||
          authorization.effectiveRole.role === "principle-broker"
            ? "backoffice_created"
            : "builder_created",
        status: "active",
        phone,
        trades: [],
      },
      now,
      organizationId: authorization.organizationId,
    });
    const profile = await ctx.db.get(profileId);
    if (!profile) {
      throw new Error("The new Cost Document party could not be loaded.");
    }
    return {
      created: true,
      duplicateOptions: [],
      option: costDocumentVendorOptionForProfile(profile),
    };
  })
  .public();

export const listCostDocumentsByVendor = backofficeQuery
  .input({
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
    vendorProfileId: v.id("contractorProfiles"),
  })
  .returns(paginationResultValidator(costDocumentVendorHistorySummaryValidator))
  .handler(async (ctx, args) => {
    const scope = await resolveCostDocumentVendorHistoryScope(
      ctx,
      args.organizationId
    );
    const profile = await ctx.db.get(args.vendorProfileId);
    if (
      !profile ||
      profile.organizationId !== args.organizationId.trim() ||
      profile.brokerageId !== scope.brokerage._id
    ) {
      throw new Error("Cost Document vendor history is unavailable.");
    }
    const page = await ctx.db
      .query("costDocuments")
      .withIndex(
        "by_organizationId_and_vendorProfileId_and_submittedAt",
        (query) =>
          query
            .eq("organizationId", args.organizationId.trim())
            .eq("vendorProfileId", args.vendorProfileId)
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const projected = [] as Array<{
      _id: Id<"costDocuments">;
      buildId: Id<"activeBuilds">;
      buildName: string;
      category: "labour" | "materials";
      currency: "CAD";
      documentDate: string;
      grossTotalCents: number;
      kind: "invoice" | "receipt";
      state: "submitted";
      submittedAt: number;
      title: string;
      vendor: Awaited<ReturnType<typeof projectCostDocumentVendor>>;
      vendorName: string;
    }>;
    for (const document of page.page) {
      if (
        document.organizationId !== args.organizationId.trim() ||
        document.brokerageId !== scope.brokerage._id ||
        document.vendorProfileId !== args.vendorProfileId ||
        document.state !== "submitted"
      ) {
        throw new Error("Cost Document vendor history is unavailable.");
      }
      const build = await ctx.db.get(document.buildId);
      if (
        !build ||
        build.organizationId !== args.organizationId.trim() ||
        build.brokerageId !== scope.brokerage._id
      ) {
        throw new Error("Cost Document vendor history is unavailable.");
      }
      projected.push({
        _id: document._id,
        buildId: document.buildId,
        buildName: build.buildName,
        category: document.category,
        currency: document.currency,
        documentDate: document.documentDate,
        grossTotalCents: document.grossTotalCents,
        kind: document.kind,
        state: document.state,
        submittedAt: document.submittedAt,
        title: document.title,
        vendor: await projectCostDocumentVendor(ctx, document),
        vendorName: document.vendorName,
      });
    }
    return { ...page, page: projected };
  })
  .public();

async function listCostDocumentVendorProfiles(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  return await ctx.db
    .query("contractorProfiles")
    .withIndex(
      "by_organizationId_and_brokerageId_and_status_and_name",
      (query) =>
        query
          .eq("organizationId", authorization.organizationId)
          .eq("brokerageId", authorization.brokerage._id)
          .eq("status", "active")
    )
    .take(MAX_VENDOR_OPTIONS * 3);
}

async function listCostDocumentVendorDuplicateCandidates(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  // Name matches are advisory; exact-email matches use the normalized-email
  // index below. Keep this mutation read bounded so a large organization
  // cannot turn inline party creation into an oversized transaction.
  return await ctx.db
    .query("contractorProfiles")
    .withIndex(
      "by_organizationId_and_brokerageId_and_status_and_name",
      (query) =>
        query
          .eq("organizationId", authorization.organizationId)
          .eq("brokerageId", authorization.brokerage._id)
          .eq("status", "active")
    )
    .take(MAX_VENDOR_DUPLICATE_CANDIDATES);
}

async function findCostDocumentVendorProfileByNormalizedEmail(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  normalizedEmail: string
) {
  return await ctx.db
    .query("contractorProfiles")
    .withIndex("by_brokerage_normalized_email", (query) =>
      query
        .eq("brokerageId", authorization.brokerage._id)
        .eq("normalizedEmail", normalizedEmail)
    )
    .filter((query) =>
      query.and(
        query.eq(query.field("organizationId"), authorization.organizationId),
        query.eq(query.field("status"), "active")
      )
    )
    .first();
}

function costDocumentVendorOptionForProfile(
  profile: Doc<"contractorProfiles">
) {
  return {
    ...(profile.city ? { city: profile.city } : {}),
    ...(profile.email ? { email: profile.email } : {}),
    name: profile.name,
    partyType: costDocumentVendorPartyTypeForProfile(profile),
    profileId: profile._id,
  };
}

function costDocumentVendorPartyTypeForProfile(
  profile: Doc<"contractorProfiles">
) {
  if (profile.costDocumentPartyType) {
    return profile.costDocumentPartyType;
  }
  const capabilities = profile.quoteRecipientCapabilities;
  if (
    capabilities?.includes("supplier") &&
    !capabilities.includes("contractor")
  ) {
    return "supplier" as const;
  }
  if (!capabilities || capabilities.includes("contractor")) {
    return "contractor" as const;
  }
  return "vendor" as const;
}

function isPotentialCostDocumentVendorDuplicate(left: string, right: string) {
  const leftKey = normalizeCostDocumentVendorNameForMatch(left);
  const rightKey = normalizeCostDocumentVendorNameForMatch(right);
  if (!(leftKey && rightKey)) {
    return false;
  }
  if (
    leftKey === rightKey ||
    leftKey.includes(rightKey) ||
    rightKey.includes(leftKey)
  ) {
    return true;
  }
  const leftTokens = new Set(leftKey.split(" "));
  const rightTokens = new Set(rightKey.split(" "));
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token));
  return (
    overlap.length >= 2 &&
    overlap.length / Math.min(leftTokens.size, rightTokens.size) >= 0.5
  );
}

function normalizeCostDocumentVendorNameForMatch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("en-CA")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export async function projectCostDocumentVendor(
  ctx: QueryCtx,
  document: Doc<"costDocuments">
) {
  if (document.vendorProfileId) {
    const profile = await ctx.db.get(document.vendorProfileId);
    if (
      profile &&
      profile.organizationId === document.organizationId &&
      profile.brokerageId === document.brokerageId
    ) {
      return {
        displayName: profile.name,
        partyType: costDocumentVendorPartyTypeForProfile(profile),
        profileId: profile._id,
        resolution: "linked" as const,
      };
    }
  }
  return {
    displayName: document.vendorName,
    partyType: "vendor" as const,
    resolution: "unresolved_legacy" as const,
  };
}

export async function requireActiveCostDocumentVendorProfile(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  profileId: Id<"contractorProfiles">
) {
  const profile = await ctx.db.get(profileId);
  if (
    !profile ||
    profile.organizationId !== authorization.organizationId ||
    profile.brokerageId !== authorization.brokerage._id ||
    profile.status !== "active"
  ) {
    throw new Error(
      "Select an active organization vendor, supplier, or contractor."
    );
  }
  return profile;
}

async function resolveCostDocumentVendorHistoryScope(
  ctx: QueryCtx & { viewer: AuthorizedViewer },
  organizationId: string
) {
  const normalizedOrganizationId = organizationId.trim();
  if (!normalizedOrganizationId) {
    throw new Error("Cost Document vendor history is unavailable.");
  }
  const membership = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (query) =>
      query.eq("workosUserId", ctx.viewer.subject)
    )
    .filter((query) =>
      query.eq(query.field("workosOrganizationId"), normalizedOrganizationId)
    )
    .first();
  if (!membership || membership.status !== "active") {
    throw new Error("Cost Document vendor history is unavailable.");
  }
  const brokerage = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (query) =>
      query.eq("workosOrganizationId", normalizedOrganizationId)
    )
    .unique();
  if (!brokerage || brokerage.status !== "active") {
    throw new Error("Cost Document vendor history is unavailable.");
  }
  return { brokerage };
}
