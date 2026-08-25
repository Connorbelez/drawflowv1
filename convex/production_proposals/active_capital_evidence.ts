/**
 * Production proposals active capital evidence bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { getActiveBuildMilestoneOrThrow, findActiveBuildSubmilestoneByKey } from "./active_planning.js";
import { collectByIndex } from "./storage_helpers.js";

export function addDaysIso(startIso: string, days: number) {
  const startMs = Date.parse(`${startIso.slice(0, 10)}T00:00:00Z`);
  const safeStartMs = Number.isFinite(startMs) ? startMs : Date.now();
  return new Date(safeStartMs + Math.round(days) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export async function insertActiveBuildCapitalEvent(
  ctx: MutationCtx,
  auth: {
    brokerage: Doc<"brokerages">;
    build: Doc<"activeBuilds">;
  },
  input: {
    amountCents: number;
    capitalEventKey: string;
    eventKind: "cashInfusion" | "cost";
    label: string;
    x: number;
  },
) {
  const existing = (
    await collectByIndex(ctx, "capitalEvents", "by_build", auth.build._id)
  ).find((event: any) => event.capitalEventKey === input.capitalEventKey);
  if (existing) {
    throw new Error("Production active-build capital event already exists.");
  }
  await ctx.db.insert("capitalEvents", {
    amountCents: Math.max(0, Math.round(input.amountCents)),
    brokerageId: auth.brokerage._id,
    buildId: auth.build._id,
    capitalEventKey: input.capitalEventKey,
    createdAt: Date.now(),
    eventDate: addDaysIso(auth.build.startDate, input.x),
    eventType: input.eventKind === "cashInfusion" ? "borrower_copay" : "cost",
    label:
      input.label.trim() ||
      (input.eventKind === "cashInfusion" ? "Cash infusion" : "Capital spike"),
    organizationId: auth.build.organizationId,
  });
}

export async function getActiveBuildCapitalEventOrThrow(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  capitalEventKey: string,
) {
  const event = (
    await collectByIndex(ctx, "capitalEvents", "by_build", buildId)
  ).find(
    (row: any) =>
      row.capitalEventKey === capitalEventKey ||
      String(row._id) === capitalEventKey,
  );
  if (!event) {
    throw new Error("Production active-build capital event not found.");
  }
  return event as Doc<"capitalEvents">;
}

export async function getActiveBuildEvidenceAssetOrThrow(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  evidenceKey: string,
) {
  const asset = await ctx.db
    .query("buildEvidenceAssets")
    .withIndex("by_build_key", (q) =>
      q.eq("buildId", buildId).eq("evidenceKey", evidenceKey),
    )
    .unique();
  if (!asset) {
    throw new Error("Production active-build evidence asset not found.");
  }
  return asset;
}

export async function resolveEvidenceAssetSubmilestone(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  asset: Pick<Doc<"buildEvidenceAssets">, "milestoneKey" | "submilestoneKey">,
) {
  if (!asset.submilestoneKey) {
    return undefined;
  }
  const milestone = await getActiveBuildMilestoneOrThrow(
    ctx,
    buildId,
    asset.milestoneKey,
  );
  const rows = (await ctx.db
    .query("buildSubmilestones")
    .withIndex("by_milestone", (query) =>
      query.eq("buildMilestoneId", milestone._id),
    )
    .take(500)) as Doc<"buildSubmilestones">[];
  return findActiveBuildSubmilestoneByKey(rows, asset.submilestoneKey);
}
