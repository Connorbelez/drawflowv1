import {
  defaultSiteVisitGuidance,
  guidanceItemsToGuidance,
} from "../demo_site_visit_guidance";
import { hashSiteVisitToken } from "../demo_site_visit_tokens";
import type { Doc } from "../types";
import {
  DEMO_TABLES,
  type AuditInput,
  type DemoBuildId,
  type DemoMutationCtx,
  type DemoReadCtx,
  type DemoSiteVisit,
  type DemoSiteVisitTarget,
  type Scenario,
} from "./data";

export async function cleanupAll(ctx: DemoMutationCtx) {
  for (const tableName of DEMO_TABLES) {
    const rows = await ctx.db.query(tableName).collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  }
}
export async function getBuild(ctx: DemoReadCtx, scenario: Scenario) {
  return await ctx.db
    .query("demo_builds")
    .withIndex("by_scenario", (q) => q.eq("scenario", scenario))
    .first();
}

export async function getBuildOrThrow(ctx: DemoReadCtx, scenario: Scenario) {
  const build = await getBuild(ctx, scenario);
  if (!build) {
    throw new Error(`DrawFlow ${scenario} scenario is not seeded`);
  }
  return build;
}

export async function getMilestones(ctx: DemoReadCtx, scenario: Scenario) {
  return (
    await ctx.db
      .query("demo_milestones")
      .withIndex("by_scenario", (q) => q.eq("scenario", scenario))
      .collect()
  ).sort((a, b) => a.order - b.order);
}

export async function getDrawGroups(ctx: DemoReadCtx, scenario: Scenario) {
  return (
    await ctx.db
      .query("demo_drawGroups")
      .withIndex("by_scenario", (q) => q.eq("scenario", scenario))
      .collect()
  ).sort((a, b) => a.order - b.order);
}

export async function getDependencies(ctx: DemoReadCtx, scenario: Scenario) {
  return await ctx.db
    .query("demo_milestoneDependencies")
    .withIndex("by_scenario", (q) => q.eq("scenario", scenario))
    .collect();
}

export async function findMilestone(
  ctx: DemoReadCtx,
  scenario: Scenario,
  key: string
) {
  return await ctx.db
    .query("demo_milestones")
    .withIndex("by_key", (q) => q.eq("scenario", scenario).eq("key", key))
    .first();
}

export async function activeEvidenceFiles(
  ctx: DemoReadCtx,
  scenario: Scenario,
  milestoneKey: string
) {
  const files = await ctx.db
    .query("demo_evidenceFiles")
    .withIndex("by_milestone", (q) =>
      q.eq("scenario", scenario).eq("milestoneKey", milestoneKey)
    )
    .collect();
  return files.filter((file) => !file.removedAt);
}

export async function latestEvidencePackage(
  ctx: DemoReadCtx,
  scenario: Scenario,
  milestoneKey: string
) {
  const packages = await ctx.db
    .query("demo_evidencePackages")
    .withIndex("by_milestone", (q) =>
      q.eq("scenario", scenario).eq("milestoneKey", milestoneKey)
    )
    .collect();
  return packages.sort((a, b) => b.createdAt - a.createdAt)[0];
}

export async function latestSiteVisit(
  ctx: DemoReadCtx,
  scenario: Scenario,
  milestoneKey: string
) {
  const visits = await ctx.db
    .query("demo_siteVisits")
    .withIndex("by_milestone", (q) =>
      q.eq("scenario", scenario).eq("milestoneKey", milestoneKey)
    )
    .collect();
  return visits.sort((a, b) => b.createdAt - a.createdAt)[0];
}

export async function getBuildByRouteId(ctx: DemoReadCtx, buildRouteId: string) {
  return await ctx.db
    .query("demo_builds")
    .withIndex("by_key", (q) => q.eq("key", buildRouteId))
    .first();
}

export async function getSiteVisitForToken(
  ctx: DemoReadCtx,
  buildRouteId: string,
  token: string
) {
  const tokenHash = await hashSiteVisitToken(token);
  const visit = await ctx.db
    .query("demo_siteVisits")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
    .first();
  const build = await getBuildByRouteId(ctx, buildRouteId);

  if (!(visit && build) || visit.buildId !== build._id) {
    return {
      build,
      reason: "not_found" as const,
      state: "invalid" as const,
      visit: null,
    };
  }

  const scopedTargets = await ctx.db
    .query("demo_siteVisitTargets")
    .withIndex("by_site_visit", (q) => q.eq("siteVisitId", visit._id))
    .collect();
  const selectedTarget = scopedTargets.find(
    (target) => target.milestoneKey === visit.milestoneKey
  );
  let expectedOrganizationScopeKey = `demo:${visit.scenario}`;
  let evidenceScopeId = String(build._id);
  if (visit.scenario.startsWith("timeline:")) {
    const planIdValue = visit.scenario.slice("timeline:".length);
    const planId = ctx.db.normalizeId("demo_timelinePlans", planIdValue);
    const plan = planId ? await ctx.db.get(planId) : null;
    expectedOrganizationScopeKey = plan?.orgKey ?? "";
    evidenceScopeId = planIdValue;
  }
  const expectedWorkOrderId = `DEMO-WO-${visit.milestoneKey}-${visit.scopeBoundAt}`;
  const expectedEvidencePackageId = `DEMO-EP-${evidenceScopeId}-${visit.milestoneKey}`;
  const scopeIsInvalid =
    !selectedTarget ||
    selectedTarget.buildId !== build._id ||
    selectedTarget.milestoneId !== visit.milestoneId ||
    scopedTargets.some((target) => target.buildId !== build._id) ||
    (visit.organizationScopeKey !== undefined &&
      visit.organizationScopeKey !== expectedOrganizationScopeKey) ||
    (visit.workOrderId !== undefined &&
      visit.workOrderId !== expectedWorkOrderId) ||
    (visit.evidencePackageId !== undefined &&
      visit.evidencePackageId !== expectedEvidencePackageId);
  if (scopeIsInvalid) {
    return {
      build,
      reason: "not_found" as const,
      state: "invalid" as const,
      visit: null,
    };
  }

  const now = Date.now();
  if (visit.tokenConsumedAt) {
    return {
      build,
      reason: "consumed" as const,
      state: "invalid" as const,
      visit,
    };
  }
  if ((visit.tokenExpiresAt ?? 0) <= now) {
    return {
      build,
      reason: "expired" as const,
      state: "invalid" as const,
      visit,
    };
  }

  return { build, reason: null, state: "active" as const, visit };
}

export async function requireActiveSiteVisitForToken(
  ctx: DemoReadCtx,
  buildRouteId: string,
  token: string
) {
  const state = await getSiteVisitForToken(ctx, buildRouteId, token);
  if (state.state !== "active" || !(state.build && state.visit)) {
    if (state.reason === "expired") {
      throw new Error("Site visit token has expired.");
    }
    if (state.reason === "consumed") {
      throw new Error("Site visit token has already been used.");
    }
    throw new Error("Site visit token is invalid.");
  }

  return { build: state.build, visit: state.visit };
}

export async function getSiteVisitTargets(
  ctx: DemoReadCtx,
  siteVisitId: DemoSiteVisit["_id"]
) {
  return await ctx.db
    .query("demo_siteVisitTargets")
    .withIndex("by_site_visit", (q) => q.eq("siteVisitId", siteVisitId))
    .collect();
}

export async function getSiteVisitTargetGuidanceItems(
  ctx: DemoReadCtx,
  siteVisitId: DemoSiteVisit["_id"]
) {
  return await ctx.db
    .query("demo_siteVisitTargetGuidanceItems")
    .withIndex("by_site_visit", (q) => q.eq("siteVisitId", siteVisitId))
    .take(500);
}

export async function decorateSiteVisitTargetsWithGuidance(
  ctx: DemoReadCtx,
  targets: DemoSiteVisitTarget[],
  siteVisitId: DemoSiteVisit["_id"]
) {
  const items = await getSiteVisitTargetGuidanceItems(ctx, siteVisitId);
  return targets.map((target) => ({
    ...target,
    guidance: guidanceItemsToGuidance(
      items.filter((item) => item.siteVisitTargetId === target._id),
      defaultSiteVisitGuidance(
        target.milestoneKey,
        target.milestoneName,
        target.submilestones
      )
    ),
  }));
}

export async function getMilestoneSubmilestoneNames(
  ctx: DemoReadCtx,
  buildId: DemoBuildId,
  milestoneKey: string
) {
  const rows = await ctx.db
    .query("demo_milestoneSubmilestones")
    .withIndex("by_build_milestone", (q) =>
      q.eq("buildId", buildId).eq("milestoneKey", milestoneKey)
    )
    .collect();
  return rows.sort((a, b) => a.order - b.order).map((row) => row.name);
}

export async function getSiteVisitFiles(
  ctx: DemoReadCtx,
  siteVisitId: DemoSiteVisit["_id"]
) {
  return await ctx.db
    .query("demo_siteVisitFiles")
    .withIndex("by_site_visit", (q) => q.eq("siteVisitId", siteVisitId))
    .take(100);
}

export async function getDemoSiteVisitPermit(
  ctx: DemoReadCtx,
  build: Doc<"demo_builds"> | null | undefined
) {
  if (!build) {
    return null;
  }
  const documents = await ctx.db
    .query("demo_buildDocuments")
    .withIndex("by_build", (q) => q.eq("buildId", build._id))
    .collect();
  const permit = documents
    .sort((a, b) => b.createdAt - a.createdAt)
    .find((document) => document.kind === "permit");
  if (!permit) {
    return null;
  }
  return {
    _id: String(permit._id),
    fileName: permit.name,
    kind: permit.kind,
    mimeType: permit.name.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : undefined,
    name: permit.name,
    sizeBytes: permit.sizeBytes,
    storageUrl: null,
    url: permit.url ?? null,
  };
}

export async function appendAudit(ctx: DemoMutationCtx, input: AuditInput) {
  const createdAt = Date.now();
  await ctx.db.insert("demo_auditEvents", {
    actorPersona: input.actorPersona ?? "system",
    afterSummary: input.afterSummary,
    beforeSummary: input.beforeSummary,
    buildId: input.buildId,
    command: input.command,
    correlationId: `${input.command}:${createdAt}:${input.entityKey ?? "demo"}`,
    createdAt,
    drawGroupKey: input.drawGroupKey,
    entityKey: input.entityKey,
    entityLabel: input.entityLabel,
    entityType: input.entityType ?? "demo",
    eventType: input.eventType,
    milestoneKey: input.milestoneKey,
    reason: input.reason,
    scenario: input.scenario,
    validation: input.validation ?? "accepted",
  });
}

export async function appendOutbox(
  ctx: DemoMutationCtx,
  input: {
    buildId?: DemoBuildId;
    drawGroupKey?: string;
    eventType: string;
    milestoneKey?: string;
    payloadPreview: string;
    relatedEntity: string;
    scenario: Scenario;
  }
) {
  await ctx.db.insert("demo_eventOutbox", {
    buildId: input.buildId,
    createdAt: Date.now(),
    drawGroupKey: input.drawGroupKey,
    eventType: input.eventType,
    milestoneKey: input.milestoneKey,
    payloadPreview: input.payloadPreview,
    relatedEntity: input.relatedEntity,
    scenario: input.scenario,
    status: "mock_delivered",
  });
}
