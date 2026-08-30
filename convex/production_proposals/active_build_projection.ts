/**
 * Canonical active-Build read-side primitives.
 *
 * This module owns the shared row boundary and pure funding projection. Persona
 * handlers remain responsible for authorization, privacy, and response DTOs.
 */
import type { Doc, Id, QueryCtx } from "../types";
import { activeBuildDrawFundingSnapshotFromRows } from "./active_funding.js";

export const ACTIVE_BUILD_PROJECTION_ROW_LIMIT = 501;

export interface ActiveBuildProjectionRows {
  capitalEvents: Doc<"capitalEvents">[];
  drawAllocations: Doc<"activeBuildDrawRequestAllocations">[];
  drawRequests: Doc<"activeBuildDrawRequests">[];
  facilities: Doc<"loanFacilities">[];
  milestones: Doc<"buildMilestones">[];
  plannedDraws: Doc<"plannedDrawScheduleRows">[];
  submilestones: Doc<"buildSubmilestones">[];
}

export type ActiveBuildProjectionLimits = Partial<{
  capitalEvents: number;
  drawAllocations: number;
  drawRequests: number;
  facilities: number;
  milestones: number;
  plannedDraws: number;
  submilestones: number;
}>;

export type ActiveBuildDashboardProjectionRows = Pick<
  ActiveBuildProjectionRows,
  "drawRequests" | "milestones" | "plannedDraws" | "submilestones"
> & {
  evidenceAssets: Doc<"buildEvidenceAssets">[];
};

export type ActiveBuildDashboardProjectionLimits = Partial<
  Pick<
    ActiveBuildProjectionLimits,
    "drawRequests" | "milestones" | "plannedDraws" | "submilestones"
  >
> & {
  evidenceAssets?: number;
};

interface ActiveBuildProjectionOptions {
  includeCapitalEvents?: boolean;
  limits?: ActiveBuildProjectionLimits;
}

const limitFor = (
  limits: ActiveBuildProjectionLimits | undefined,
  row: keyof ActiveBuildProjectionRows
) => limits?.[row] ?? ACTIVE_BUILD_PROJECTION_ROW_LIMIT;

/**
 * Load the rows that define an active Build's financial and milestone read
 * model. Every collection is indexed and bounded so a realtime query cannot
 * accidentally turn into an unbounded table scan.
 */
export async function loadActiveBuildProjectionRows(
  ctx: QueryCtx,
  buildId: Id<"activeBuilds">,
  options?: ActiveBuildProjectionOptions
): Promise<ActiveBuildProjectionRows> {
  const includeCapitalEvents = options?.includeCapitalEvents ?? false;
  const limits = options?.limits;
  const [
    facilities,
    capitalEvents,
    milestones,
    submilestones,
    drawRequests,
    drawAllocations,
    plannedDraws,
  ] = await Promise.all([
    ctx.db
      .query("loanFacilities")
      .withIndex("by_build", (query) => query.eq("buildId", buildId))
      .take(limitFor(limits, "facilities")),
    includeCapitalEvents
      ? ctx.db
          .query("capitalEvents")
          .withIndex("by_build", (query) => query.eq("buildId", buildId))
          .take(limitFor(limits, "capitalEvents"))
      : Promise.resolve([] as Doc<"capitalEvents">[]),
    ctx.db
      .query("buildMilestones")
      .withIndex("by_build_order", (query) => query.eq("buildId", buildId))
      .take(limitFor(limits, "milestones")),
    ctx.db
      .query("buildSubmilestones")
      .withIndex("by_build", (query) => query.eq("buildId", buildId))
      .take(limitFor(limits, "submilestones")),
    ctx.db
      .query("activeBuildDrawRequests")
      .withIndex("by_build", (query) => query.eq("buildId", buildId))
      .take(limitFor(limits, "drawRequests")),
    ctx.db
      .query("activeBuildDrawRequestAllocations")
      .withIndex("by_build", (query) => query.eq("buildId", buildId))
      .take(limitFor(limits, "drawAllocations")),
    ctx.db
      .query("plannedDrawScheduleRows")
      .withIndex("by_build", (query) => query.eq("buildId", buildId))
      .take(limitFor(limits, "plannedDraws")),
  ]);

  return {
    capitalEvents,
    drawAllocations,
    drawRequests,
    facilities,
    milestones,
    plannedDraws,
    submilestones,
  };
}

/**
 * Dashboard adapter for the same active-Build read model. It intentionally
 * selects only the rows needed for a summary card, preserving the dashboard's
 * smaller per-build limits without creating a second projection owner.
 */
export async function loadActiveBuildDashboardProjectionRows(
  ctx: QueryCtx,
  buildId: Id<"activeBuilds">,
  limits?: ActiveBuildDashboardProjectionLimits
): Promise<ActiveBuildDashboardProjectionRows> {
  const limitForDashboard = (row: keyof ActiveBuildDashboardProjectionRows) =>
    limits?.[row] ?? ACTIVE_BUILD_PROJECTION_ROW_LIMIT;
  const [
    milestones,
    submilestones,
    plannedDraws,
    drawRequests,
    evidenceAssets,
  ] = await Promise.all([
    ctx.db
      .query("buildMilestones")
      .withIndex("by_build_order", (query) => query.eq("buildId", buildId))
      .take(limitForDashboard("milestones")),
    ctx.db
      .query("buildSubmilestones")
      .withIndex("by_build", (query) => query.eq("buildId", buildId))
      .take(limitForDashboard("submilestones")),
    ctx.db
      .query("plannedDrawScheduleRows")
      .withIndex("by_build_order", (query) => query.eq("buildId", buildId))
      .take(limitForDashboard("plannedDraws")),
    ctx.db
      .query("activeBuildDrawRequests")
      .withIndex("by_build", (query) => query.eq("buildId", buildId))
      .take(limitForDashboard("drawRequests")),
    ctx.db
      .query("buildEvidenceAssets")
      .withIndex("by_build", (query) => query.eq("buildId", buildId))
      .take(limitForDashboard("evidenceAssets")),
  ]);
  return {
    drawRequests,
    evidenceAssets,
    milestones,
    plannedDraws,
    submilestones,
  };
}

export function assertActiveBuildProjectionRows(
  rows: ActiveBuildProjectionRows,
  limits: ActiveBuildProjectionLimits,
  label: string
) {
  const exceeded = Object.entries(limits).find(([key, limit]) => {
    const row = rows[key as keyof ActiveBuildProjectionRows];
    return row.length > (limit ?? ACTIVE_BUILD_PROJECTION_ROW_LIMIT) - 1;
  });
  if (exceeded) {
    throw new Error(`${label} record limit exceeded`);
  }
}

export function projectActiveBuildFunding(rows: ActiveBuildProjectionRows) {
  return activeBuildDrawFundingSnapshotFromRows({
    allocations: rows.drawAllocations,
    allowLegacyUnattributedRequests: true,
    facilities: rows.facilities,
    milestones: rows.milestones,
    plannedDraws: rows.plannedDraws,
    requests: rows.drawRequests,
  });
}
