import { v } from "convex/values";

import { demoBuildAddress } from "./demo_build_address";
import {
  publicMutation,
  publicQuery,
  withMutationTiming,
  withQueryTiming,
} from "./fluent";
import type { Doc, Id } from "./types";

const DEMO_SCENARIO = "active";

const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

// -----------------------------------------------------------------------------
// View model
// -----------------------------------------------------------------------------

type DemoBuild = Doc<"demo_builds">;
type DemoMilestone = Doc<"demo_milestones">;
type DemoDrawGroup = Doc<"demo_drawGroups">;
type DemoEvidencePackage = Doc<"demo_evidencePackages">;
type DemoSiteVisit = Doc<"demo_siteVisits">;
type DemoContractor = Doc<"demo_contractors">;
type DemoMilestoneContractor = Doc<"demo_milestoneContractors">;
type DemoBuildNote = Doc<"demo_buildNotes">;
type DemoBuildDocument = Doc<"demo_buildDocuments">;
type DemoAuditEvent = Doc<"demo_auditEvents">;
type DemoEventOutboxEntry = Doc<"demo_eventOutbox">;

export type KanbanColumn =
  | "Backlog"
  | "InProgress"
  | "MarkedComplete"
  | "SiteVisit"
  | "NeedsApproval";

export function projectMilestoneToKanbanColumn(
  milestone: Pick<
    DemoMilestone,
    "status" | "requiresSiteVisit" | "evidenceReviewStatus"
  >,
  visit: Pick<DemoSiteVisit, "status"> | null,
  evidence: Pick<DemoEvidencePackage, "reviewStatus"> | null
): KanbanColumn {
  const evidenceStatus =
    evidence?.reviewStatus ?? milestone.evidenceReviewStatus ?? "not_started";
  if (
    milestone.status === "completion_approved" &&
    (evidenceStatus === "approved" || evidenceStatus === "accepted")
  ) {
    return "MarkedComplete";
  }
  if (
    milestone.requiresSiteVisit &&
    visit &&
    (visit.status === "in_progress" || visit.status === "unopened")
  ) {
    return "SiteVisit";
  }
  if (
    evidenceStatus === "submitted" ||
    milestone.status === "review" ||
    milestone.status === "completion_requested"
  ) {
    return "NeedsApproval";
  }
  if (
    milestone.status === "ready" ||
    milestone.status === "in_progress" ||
    milestone.status === "in_progress_on_schedule" ||
    milestone.status === "in_progress_behind_schedule"
  ) {
    return "InProgress";
  }
  return "Backlog";
}

const QUICK_ACTION_EVENT_TYPES = new Set<string>([
  "milestoneCompleted",
  "milestone.completion_submitted",
  "milestone.completion_requested",
  "siteVisitCompleted",
  "site_visit.completed",
  "drawRequested",
  "draw.requested",
]);

function isQuickActionEvent(eventType: string): boolean {
  return QUICK_ACTION_EVENT_TYPES.has(eventType);
}

function centsSum<T>(items: readonly T[], pick: (item: T) => number): number {
  let total = 0;
  for (const item of items) {
    total += pick(item);
  }
  return total;
}

function buildDisplayId(build: Pick<DemoBuild, "key">): string {
  return `BLD-${build.key.replace(/[^a-z0-9]/gi, "-").toUpperCase()}`;
}

async function loadBuildById(
  ctx: { db: { get: (id: Id<"demo_builds">) => Promise<DemoBuild | null> } },
  buildId: Id<"demo_builds">
): Promise<DemoBuild | null> {
  return await ctx.db.get(buildId);
}

interface BuildDetailViewModel {
  address: string;
  auditEvents: DemoAuditEvent[];
  availableContractors: DemoContractor[];
  build: DemoBuild;
  buildId: Id<"demo_builds">;
  contractors: (DemoContractor & { role: string })[];
  derived: {
    approvedPrincipalCents: number;
    drawAvailableCents: number;
    drawableTotalCents: number;
    drawnCents: number;
    daysToPayoff: number;
    percentComplete: number;
    openWarnings: number;
    siteVisitsOpen: number;
  };
  displayId: string;
  documents: DemoBuildDocument[];
  drawGroups: DemoDrawGroup[];
  draws: {
    drawGroupKey: string;
    label: string;
    order: number;
    approvedValueCents: number;
    requestedValueCents: number;
    plannedDate?: string;
    actualDate?: string;
    status: string;
    requestStatus:
      | "draft"
      | "requested"
      | "approved"
      | "rejected"
      | "release_approved";
  }[];
  eventOutbox: DemoEventOutboxEntry[];
  kanban: {
    column: KanbanColumn;
    milestoneKey: string;
    milestoneId: Id<"demo_milestones">;
    name: string;
    code: string;
    type: string;
    status: string;
    drawGroupKey: string;
    approvedValueCents: number;
    requestedAmountCents?: number;
    progressPercent: number;
    forecastStartDate?: string;
    forecastEndDate?: string;
    submittedAt?: number;
    requiresSiteVisit: boolean;
    evidenceReviewStatus?: string;
    contractors: { name: string; initials: string }[];
    submilestones: {
      key: string;
      name: string;
      status: "todo" | "in_progress" | "done";
      order: number;
      budgetCents?: number;
      durationDays?: number;
    }[];
  }[];
  milestoneContractors: (DemoMilestoneContractor & {
    contractor: DemoContractor | null;
  })[];
  milestones: DemoMilestone[];
  mock_satelliteImageUrl: string;
  mock_sitePhotos: { url: string; caption: string; takenAt: string }[];
  notes: { internal: DemoBuildNote[]; public: DemoBuildNote[] };
  quickActionEvents: DemoEventOutboxEntry[];
  timeline: {
    range: { min: number; max: number };
    projectStartDate: string;
    todayDate: string;
    payoffDate: string;
    todayX: number;
    items: {
      id: string;
      label: string;
      x: number;
      endX: number;
      tone: "active" | "blocked" | "complete" | "upcoming" | "warning";
      drawGroupKey: string;
      eyebrow: string;
      markerLabel: string;
      status: string;
      budgetCents: number;
    }[];
    drawMarkers: {
      id: string;
      label: string;
      sublabel?: string;
      x: number;
      tone: "accent" | "neutral" | "today" | "warning";
    }[];
  };
  timelinePlanId: Id<"demo_timelinePlans"> | null;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function daysBetween(start: string, end: string): number {
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!(Number.isFinite(a) && Number.isFinite(b))) {
    return 0;
  }
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(field: string, value: string): string {
  const trimmed = value.trim();
  if (!ISO_DATE_RE.test(trimmed)) {
    throw new Error(`${field} must use YYYY-MM-DD format.`);
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} is not a valid calendar date.`);
  }
  return trimmed;
}

function addDaysToIsoDate(isoDate: string, days: number): string {
  const parsed = Date.parse(isoDate);
  if (!Number.isFinite(parsed)) {
    throw new Error("Base date is not valid.");
  }
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
}

export const demo_getBuildDetailViewModel = publicQuery
  .use(withQueryTiming("demo_drawflow_backoffice.getBuildDetailViewModel"))
  .input({ buildId: v.id("demo_builds") })
  .returns(v.any())
  .handler(async (ctx, { buildId }) => {
    const build = await loadBuildById(ctx, buildId);
    if (!build) {
      return { needsSeed: true, buildId } as const;
    }
    const scenario = build.scenario;

    const [
      milestones,
      drawGroups,
      contractorRoles,
      milestoneContractorRows,
      notes,
      documents,
      submilestoneRows,
      timelinePlan,
    ] = await Promise.all([
      ctx.db
        .query("demo_milestones")
        .withIndex("by_build_order", (q) => q.eq("buildId", buildId))
        .collect(),
      ctx.db
        .query("demo_drawGroups")
        .withIndex("by_build_order", (q) => q.eq("buildId", buildId))
        .collect(),
      ctx.db
        .query("demo_buildContractors")
        .withIndex("by_build", (q) => q.eq("buildId", buildId))
        .collect(),
      ctx.db
        .query("demo_milestoneContractors")
        .withIndex("by_build", (q) => q.eq("buildId", buildId))
        .collect(),
      ctx.db
        .query("demo_buildNotes")
        .withIndex("by_build", (q) => q.eq("buildId", buildId))
        .collect(),
      ctx.db
        .query("demo_buildDocuments")
        .withIndex("by_build", (q) => q.eq("buildId", buildId))
        .collect(),
      ctx.db
        .query("demo_milestoneSubmilestones")
        .withIndex("by_build", (q) => q.eq("buildId", buildId))
        .collect(),
      ctx.db
        .query("demo_timelinePlans")
        .withIndex("by_build", (q) => q.eq("buildId", buildId))
        .first(),
    ]);

    // Group submilestones by milestone key.
    const submilestonesByMilestone = new Map<
      string,
      Array<{
        key: string;
        name: string;
        status: "todo" | "in_progress" | "done";
        order: number;
        budgetCents?: number;
        durationDays?: number;
      }>
    >();
    for (const row of submilestoneRows) {
      const arr = submilestonesByMilestone.get(row.milestoneKey) ?? [];
      arr.push({
        key: row.key,
        name: row.name,
        status: row.status,
        order: row.order,
        budgetCents: row.budgetCents,
        durationDays: row.durationDays,
      });
      submilestonesByMilestone.set(row.milestoneKey, arr);
    }
    for (const arr of submilestonesByMilestone.values()) {
      arr.sort((a, b) => a.order - b.order);
    }

    const contractorIds = new Set<Id<"demo_contractors">>();
    for (const row of contractorRoles) {
      contractorIds.add(row.contractorId);
    }
    for (const row of milestoneContractorRows) {
      contractorIds.add(row.contractorId);
    }
    const contractorList: DemoContractor[] = [];
    for (const id of contractorIds) {
      const contractor = await ctx.db.get(id);
      if (contractor) {
        contractorList.push(contractor);
      }
    }
    const contractorById = new Map<Id<"demo_contractors">, DemoContractor>();
    for (const c of contractorList) {
      contractorById.set(c._id, c);
    }

    // Build contractors with roles
    const buildContractors = contractorRoles.flatMap((row) => {
      const contractor = contractorById.get(row.contractorId);
      if (!contractor) {
        return [];
      }
      return [{ ...contractor, role: row.role }];
    });

    // Milestone contractors decorated with contractor records
    const milestoneContractors = milestoneContractorRows.map((row) => ({
      ...row,
      contractor: contractorById.get(row.contractorId) ?? null,
    }));

    // Catalog of all scenario-scoped contractors for this build, minus the
    // ones already attached. Powers the Contractors card autocomplete (REQ-01).
    const allOrgContractors = await ctx.db
      .query("demo_contractors")
      .withIndex("by_scenario", (q) => q.eq("scenario", scenario))
      .collect();
    const attachedIds = new Set(contractorRoles.map((r) => r.contractorId));
    const availableContractors = allOrgContractors.filter(
      (c) => !attachedIds.has(c._id)
    );

    // Evidence packages and site visits per milestone
    const evidenceByMilestone = new Map<string, DemoEvidencePackage>();
    const visitByMilestone = new Map<string, DemoSiteVisit>();
    for (const milestone of milestones) {
      const packages = await ctx.db
        .query("demo_evidencePackages")
        .withIndex("by_milestone", (q) =>
          q.eq("scenario", scenario).eq("milestoneKey", milestone.key)
        )
        .collect();
      const latestPackage = packages.sort(
        (a, b) => b.createdAt - a.createdAt
      )[0];
      if (latestPackage) {
        evidenceByMilestone.set(milestone.key, latestPackage);
      }

      const visits = await ctx.db
        .query("demo_siteVisits")
        .withIndex("by_milestone", (q) =>
          q.eq("scenario", scenario).eq("milestoneKey", milestone.key)
        )
        .collect();
      const latestVisit = visits.sort((a, b) => b.createdAt - a.createdAt)[0];
      if (latestVisit) {
        visitByMilestone.set(milestone.key, latestVisit);
      }
    }

    // Audit + outbox
    const [auditEvents, outboxEvents] = await Promise.all([
      ctx.db
        .query("demo_auditEvents")
        .withIndex("by_scenario", (q) => q.eq("scenario", scenario))
        .collect(),
      ctx.db
        .query("demo_eventOutbox")
        .withIndex("by_scenario", (q) => q.eq("scenario", scenario))
        .collect(),
    ]);
    const buildAuditEvents = auditEvents
      .filter((ev) => !ev.buildId || ev.buildId === buildId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);
    const buildOutbox = outboxEvents
      .filter((ev) => !ev.buildId || ev.buildId === buildId)
      .sort((a, b) => b.createdAt - a.createdAt);
    const quickActionEvents = buildOutbox
      .filter((ev) => isQuickActionEvent(ev.eventType))
      .slice(0, 5);

    // Draws projection from draw groups
    const milestonesByDrawGroup = new Map<string, DemoMilestone[]>();
    for (const milestone of milestones) {
      const arr = milestonesByDrawGroup.get(milestone.drawGroupKey) ?? [];
      arr.push(milestone);
      milestonesByDrawGroup.set(milestone.drawGroupKey, arr);
    }
    const draws = drawGroups
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((group) => {
        const groupMilestones = milestonesByDrawGroup.get(group.key) ?? [];
        const actualDate = groupMilestones.find(
          (m) => m.status === "completion_approved"
        )?.actualCompletedDate;
        const requestStatus: BuildDetailViewModel["draws"][number]["requestStatus"] =
          group.status === "release_approved"
            ? "release_approved"
            : group.status === "requested"
              ? "requested"
              : group.status === "rejected"
                ? "rejected"
                : group.status === "approved"
                  ? "approved"
                  : "draft";
        return {
          drawGroupKey: group.key,
          label: group.label,
          order: group.order,
          approvedValueCents: group.approvedValueCents,
          requestedValueCents: group.requestedValueCents,
          plannedDate: group.forecastStartDate,
          actualDate,
          status: group.status,
          requestStatus,
        };
      });

    // Kanban projection
    const kanban = milestones
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((milestone) => {
        const visit = visitByMilestone.get(milestone.key) ?? null;
        const evidence = evidenceByMilestone.get(milestone.key) ?? null;
        const column = projectMilestoneToKanbanColumn(
          milestone,
          visit,
          evidence
        );
        const contractorsForMilestone = milestoneContractors
          .filter((row) => row.milestoneKey === milestone.key)
          .map((row) => ({
            name: row.contractor?.name ?? "Unknown",
            initials: initialsFor(row.contractor?.name ?? "?"),
          }));
        return {
          column,
          milestoneKey: milestone.key,
          milestoneId: milestone._id,
          name: milestone.name,
          code: milestone.code,
          type: milestone.type,
          status: milestone.status,
          drawGroupKey: milestone.drawGroupKey,
          approvedValueCents: milestone.approvedValueCents,
          requestedAmountCents: milestone.requestedAmountCents,
          progressPercent: milestone.progressPercent,
          forecastStartDate: milestone.forecastStartDate,
          forecastEndDate: milestone.forecastEndDate,
          submittedAt: milestone.submittedAt,
          requiresSiteVisit: milestone.requiresSiteVisit,
          evidenceReviewStatus: milestone.evidenceReviewStatus,
          contractors: contractorsForMilestone,
          submilestones: submilestonesByMilestone.get(milestone.key) ?? [],
        };
      });

    // Derived values
    const approvedPrincipalCents = centsSum(
      drawGroups,
      (g) => g.approvedValueCents
    );
    const drawableTotalCents = approvedPrincipalCents;
    const drawnCents = centsSum(
      drawGroups.filter((g) => g.status === "release_approved"),
      (g) => g.approvedValueCents
    );
    const drawAvailableCents = Math.max(0, drawableTotalCents - drawnCents);
    const daysToPayoff = daysBetween(build.todayDate, build.payoffDate);

    const milestoneCount = milestones.length || 1;
    const calculatedPercentComplete = Math.round(
      centsSum(
        milestones,
        (m) => m.progressPercent * Math.max(1, m.approvedValueCents)
      ) /
        Math.max(
          1,
          centsSum(milestones, (m) => Math.max(1, m.approvedValueCents))
        )
    );
    const calculatedOpenWarnings = milestones.filter(
      (m) =>
        m.status === "review" ||
        m.evidenceReviewStatus === "submitted" ||
        m.evidenceReviewStatus === "rejected"
    ).length;
    const calculatedSiteVisitsOpen = Array.from(
      visitByMilestone.values()
    ).filter(
      (visit) => visit.status === "unopened" || visit.status === "in_progress"
    ).length;
    const percentComplete =
      build.detailOverrides?.percentComplete ?? calculatedPercentComplete;
    const openWarnings =
      build.detailOverrides?.openWarnings ?? calculatedOpenWarnings;
    const siteVisitsOpen =
      build.detailOverrides?.siteVisitsOpen ?? calculatedSiteVisitsOpen;

    // Notes split
    const noteSplit: BuildDetailViewModel["notes"] = {
      internal: notes.filter((n) => n.visibility === "internal"),
      public: notes.filter((n) => n.visibility === "public"),
    };

    void milestoneCount;

    // Timeline projection — derives a curved-timeline view of milestones +
    // draw markers for THIS build, so the Timeline tab does not need to mount
    // the full demo workspace setup flow.
    const projectStartMs = Date.parse(build.projectStartDate);
    const payoffMs = Date.parse(build.payoffDate);
    const todayMs = Date.parse(build.todayDate);
    const totalDays = Math.max(
      1,
      Math.round((payoffMs - projectStartMs) / 86_400_000)
    );
    const dayOffset = (iso?: string): number => {
      if (!iso) {
        return 0;
      }
      const ms = Date.parse(iso);
      return Math.max(0, Math.round((ms - projectStartMs) / 86_400_000));
    };
    const todayX = Math.max(
      0,
      Math.round((todayMs - projectStartMs) / 86_400_000)
    );
    const toneFor = (
      status: string
    ): "active" | "blocked" | "complete" | "upcoming" | "warning" => {
      if (status === "completion_approved") {
        return "complete";
      }
      if (status === "in_progress_behind_schedule") {
        return "warning";
      }
      if (status === "in_progress_on_schedule") {
        return "active";
      }
      if (status === "review") {
        return "active";
      }
      if (status === "blocked") {
        return "blocked";
      }
      return "upcoming";
    };
    const timelineItems = milestones
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((m) => ({
        id: m.key,
        label: m.name,
        x: dayOffset(m.forecastStartDate),
        endX: dayOffset(m.forecastEndDate),
        tone: toneFor(m.status),
        drawGroupKey: m.drawGroupKey,
        eyebrow: m.code,
        markerLabel: String(m.order),
        status: m.status,
        budgetCents: m.approvedValueCents,
      }));
    const drawMarkers = drawGroups
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((g) => ({
        id: g.key,
        label: g.label,
        sublabel:
          g.status === "release_approved"
            ? "Released"
            : g.status === "requested"
              ? "Requested"
              : g.status === "rejected"
                ? "Rejected"
                : g.status === "partially_eligible"
                  ? "Partially eligible"
                  : "Not yet eligible",
        x: dayOffset(g.forecastEndDate),
        tone: (g.status === "release_approved"
          ? "accent"
          : g.status === "rejected"
            ? "warning"
            : "neutral") as "accent" | "neutral" | "today" | "warning",
      }));
    drawMarkers.push({
      id: "today",
      label: "Today",
      sublabel: build.todayDate,
      x: todayX,
      tone: "today" as const,
    });

    // Mock site progress photos. Only mock_satelliteImageUrl and
    // mock_sitePhotos are allowed to carry the `mock_` prefix; the CI guard
    // in demo_getBuildDetailViewModel.test.ts enforces this allowlist.
    const photoCaptions: { caption: string; takenAt: string }[] = [
      { caption: "Aerial — satellite mock", takenAt: build.todayDate },
      { caption: "Foundation — slab poured", takenAt: "2026-03-21" },
      { caption: "Foundation — stem walls", takenAt: "2026-04-12" },
      { caption: "Sewer trench at lot east", takenAt: "2026-05-05" },
      { caption: "Stockpile delivery", takenAt: "2026-05-18" },
    ];
    const mockSitePhotos = photoCaptions.map((entry, idx) => ({
      url:
        idx === 0
          ? `mock://satellite/${build.key}.jpg`
          : `mock://site/${build.key}/${idx}.jpg`,
      caption: entry.caption,
      takenAt: entry.takenAt,
    }));
    void totalDays;
    const vm: BuildDetailViewModel = {
      buildId,
      displayId: buildDisplayId(build),
      address: demoBuildAddress(build),
      build,
      milestones,
      drawGroups,
      draws,
      kanban,
      contractors: buildContractors,
      availableContractors,
      milestoneContractors,
      notes: noteSplit,
      documents,
      eventOutbox: buildOutbox,
      quickActionEvents,
      auditEvents: buildAuditEvents,
      derived: {
        approvedPrincipalCents,
        drawAvailableCents,
        drawableTotalCents,
        drawnCents,
        daysToPayoff,
        percentComplete: Number.isFinite(percentComplete) ? percentComplete : 0,
        openWarnings,
        siteVisitsOpen,
      },
      mock_satelliteImageUrl: `mock://satellite/${build.key}.jpg`,
      timelinePlanId: timelinePlan?._id ?? null,
      mock_sitePhotos: mockSitePhotos,
      timeline: {
        range: { min: 0, max: totalDays },
        projectStartDate: build.projectStartDate,
        todayDate: build.todayDate,
        payoffDate: build.payoffDate,
        todayX,
        items: timelineItems,
        drawMarkers,
      },
    };
    return { needsSeed: false, ...vm };
  })
  .public();

// -----------------------------------------------------------------------------
// Helper for buildId resolution by route key (e.g. "active-maple-ridge")
// -----------------------------------------------------------------------------

// Simpler implementation: re-export buildId resolver and let frontend call the
// main query directly.
export const demo_resolveBuildIdByKey = publicQuery
  .use(withQueryTiming("demo_drawflow_backoffice.resolveBuildIdByKey"))
  .input({ buildKey: v.string() })
  .returns(v.union(v.id("demo_builds"), v.null()))
  .handler(async (ctx, { buildKey }) => {
    const build = await ctx.db
      .query("demo_builds")
      .withIndex("by_key", (q) => q.eq("key", buildKey))
      .first();
    return build?._id ?? null;
  })
  .public();

// -----------------------------------------------------------------------------
// Mutations
// -----------------------------------------------------------------------------

export const demo_updateBuildDetails = publicMutation
  .use(withMutationTiming("demo_drawflow_backoffice.updateBuildDetails"))
  .input({
    buildId: v.id("demo_builds"),
    address: v.optional(v.string()),
    projectStartDate: v.optional(v.string()),
    payoffDate: v.optional(v.string()),
    todayDate: v.optional(v.string()),
    daysToPayoff: v.optional(v.number()),
    percentComplete: v.optional(v.number()),
    openWarnings: v.optional(v.number()),
    siteVisitsOpen: v.optional(v.number()),
  })
  .returns(
    v.object({
      address: v.string(),
      projectStartDate: v.string(),
      payoffDate: v.string(),
      todayDate: v.string(),
      daysToPayoff: v.number(),
      percentComplete: v.number(),
      openWarnings: v.number(),
      siteVisitsOpen: v.number(),
    })
  )
  .handler(async (ctx, args) => {
    const build = await ctx.db.get(args.buildId);
    if (!build) {
      throw new Error(`Build ${args.buildId} not found`);
    }

    const patch: Partial<DemoBuild> & { updatedAt: number } = {
      updatedAt: Date.now(),
    };

    if (args.address !== undefined) {
      const trimmed = args.address.trim();
      if (!trimmed) {
        throw new Error("Address cannot be empty.");
      }
      patch.address = trimmed;
    }
    if (args.projectStartDate !== undefined) {
      patch.projectStartDate = assertIsoDate(
        "Project start",
        args.projectStartDate
      );
    }
    if (args.todayDate !== undefined) {
      patch.todayDate = assertIsoDate("Today", args.todayDate);
    }
    if (args.payoffDate !== undefined) {
      patch.payoffDate = assertIsoDate("Payoff", args.payoffDate);
    }
    if (args.daysToPayoff !== undefined) {
      const todayDate = patch.todayDate ?? build.todayDate;
      const boundedDays = Math.max(0, Math.round(args.daysToPayoff));
      patch.payoffDate = addDaysToIsoDate(todayDate, boundedDays);
    }

    const detailOverrides = { ...(build.detailOverrides ?? {}) };
    let detailOverridesTouched = false;
    if (args.percentComplete !== undefined) {
      detailOverrides.percentComplete = Math.min(
        100,
        Math.max(0, Math.round(args.percentComplete))
      );
      detailOverridesTouched = true;
    }
    if (args.openWarnings !== undefined) {
      detailOverrides.openWarnings = Math.max(0, Math.round(args.openWarnings));
      detailOverridesTouched = true;
    }
    if (args.siteVisitsOpen !== undefined) {
      detailOverrides.siteVisitsOpen = Math.max(
        0,
        Math.round(args.siteVisitsOpen)
      );
      detailOverridesTouched = true;
    }
    if (detailOverridesTouched) {
      patch.detailOverrides = detailOverrides;
    }

    await ctx.db.patch(args.buildId, patch);
    const updated = await ctx.db.get(args.buildId);
    if (!updated) {
      throw new Error(`Build ${args.buildId} not found after update`);
    }

    const refreshedMilestones = await ctx.db
      .query("demo_milestones")
      .withIndex("by_build_order", (q) => q.eq("buildId", args.buildId))
      .collect();
    const refreshedVisits = (
      await ctx.db
        .query("demo_siteVisits")
        .withIndex("by_scenario", (q) => q.eq("scenario", updated.scenario))
        .collect()
    ).filter((visit) => visit.buildId === args.buildId);

    const calculatedPercentComplete = Math.round(
      centsSum(
        refreshedMilestones,
        (m) => m.progressPercent * Math.max(1, m.approvedValueCents)
      ) /
        Math.max(
          1,
          centsSum(refreshedMilestones, (m) =>
            Math.max(1, m.approvedValueCents)
          )
        )
    );
    const calculatedOpenWarnings = refreshedMilestones.filter(
      (m) =>
        m.status === "review" ||
        m.evidenceReviewStatus === "submitted" ||
        m.evidenceReviewStatus === "rejected"
    ).length;
    const calculatedSiteVisitsOpen = refreshedVisits.filter(
      (visit) => visit.status === "unopened" || visit.status === "in_progress"
    ).length;

    return {
      address: demoBuildAddress(updated),
      projectStartDate: updated.projectStartDate,
      payoffDate: updated.payoffDate,
      todayDate: updated.todayDate,
      daysToPayoff: daysBetween(updated.todayDate, updated.payoffDate),
      percentComplete:
        updated.detailOverrides?.percentComplete ?? calculatedPercentComplete,
      openWarnings:
        updated.detailOverrides?.openWarnings ?? calculatedOpenWarnings,
      siteVisitsOpen:
        updated.detailOverrides?.siteVisitsOpen ?? calculatedSiteVisitsOpen,
    };
  })
  .public();

interface ApproveDrawAuditMeta {
  actorPersona: string;
  buildId: Id<"demo_builds">;
  drawGroupKey: string;
  priorStatus: string;
  reason?: string;
  scenario: string;
}

async function recordApproveDrawAudit(
  ctx: {
    db: { insert: (table: "demo_auditEvents", row: any) => Promise<any> };
  },
  meta: ApproveDrawAuditMeta
): Promise<void> {
  const createdAt = Date.now();
  await ctx.db.insert("demo_auditEvents", {
    actorPersona: meta.actorPersona,
    afterSummary: "release_approved",
    beforeSummary: meta.priorStatus,
    buildId: meta.buildId,
    command: "demo_approveDraw",
    correlationId: `demo_approveDraw:${meta.drawGroupKey}:${createdAt}`,
    createdAt,
    drawGroupKey: meta.drawGroupKey,
    entityKey: meta.drawGroupKey,
    entityLabel: `Draw ${meta.drawGroupKey}`,
    entityType: "drawGroup",
    eventType: "drawApproved",
    milestoneKey: undefined,
    reason: meta.reason,
    scenario: meta.scenario,
    validation: "accepted",
  });
}

async function recordApproveDrawOutbox(
  ctx: {
    db: { insert: (table: "demo_eventOutbox", row: any) => Promise<any> };
  },
  meta: ApproveDrawAuditMeta
): Promise<void> {
  await ctx.db.insert("demo_eventOutbox", {
    buildId: meta.buildId,
    createdAt: Date.now(),
    drawGroupKey: meta.drawGroupKey,
    eventType: "drawApproved",
    milestoneKey: undefined,
    payloadPreview: `Draw ${meta.drawGroupKey} release approved`,
    relatedEntity: "drawGroup",
    scenario: meta.scenario,
    status: "mock_delivered",
  });
}

export const demo_approveDraw = publicMutation
  .use(withMutationTiming("demo_drawflow_backoffice.approveDraw"))
  .input({
    buildId: v.id("demo_builds"),
    drawGroupKey: v.string(),
    actorPersona: v.optional(v.string()),
    overrideReason: v.optional(v.string()),
  })
  .returns(
    v.object({
      idempotent: v.boolean(),
      status: v.string(),
      drawGroupKey: v.string(),
    })
  )
  .handler(async (ctx, args) => {
    const actorPersona = args.actorPersona ?? "lender_admin";
    const build = await ctx.db.get(args.buildId);
    if (!build) {
      throw new Error(`Build ${args.buildId} not found`);
    }
    const drawGroup = await ctx.db
      .query("demo_drawGroups")
      .withIndex("by_scenario_key", (q) =>
        q.eq("scenario", build.scenario).eq("key", args.drawGroupKey)
      )
      .first();
    if (!drawGroup) {
      throw new Error(
        `Draw group ${args.drawGroupKey} not found for scenario ${build.scenario}`
      );
    }

    // Idempotency: if already approved and recent audit exists for same actor
    // within the window, return without writing.
    if (drawGroup.status === "release_approved") {
      const recentAudit = await ctx.db
        .query("demo_auditEvents")
        .withIndex("by_draw_group", (q) =>
          q.eq("scenario", build.scenario).eq("drawGroupKey", args.drawGroupKey)
        )
        .collect();
      const within = recentAudit.some(
        (event) =>
          event.command === "demo_approveDraw" &&
          event.actorPersona === actorPersona &&
          Date.now() - event.createdAt < IDEMPOTENCY_WINDOW_MS
      );
      if (within) {
        return {
          idempotent: true,
          status: "release_approved",
          drawGroupKey: drawGroup.key,
        };
      }
    }

    // Policy check: lender draw policy limit
    const drawGroups = await ctx.db
      .query("demo_drawGroups")
      .withIndex("by_build_order", (q) => q.eq("buildId", args.buildId))
      .collect();
    const alreadyApproved = drawGroups
      .filter((g) => g.status === "release_approved" && g._id !== drawGroup._id)
      .reduce((sum, g) => sum + g.approvedValueCents, 0);
    const projected = alreadyApproved + drawGroup.approvedValueCents;
    if (projected > build.lenderDrawPolicyLimitCents && !args.overrideReason) {
      throw new Error(
        "policy_limit: lender draw policy limit would be exceeded; provide overrideReason to override."
      );
    }

    const priorStatus = drawGroup.status;
    await ctx.db.patch(drawGroup._id, {
      status: "release_approved",
      releaseApprovedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await recordApproveDrawAudit(ctx, {
      buildId: args.buildId,
      drawGroupKey: drawGroup.key,
      scenario: build.scenario,
      actorPersona,
      priorStatus,
      reason: args.overrideReason,
    });
    await recordApproveDrawOutbox(ctx, {
      buildId: args.buildId,
      drawGroupKey: drawGroup.key,
      scenario: build.scenario,
      actorPersona,
      priorStatus,
    });
    return {
      idempotent: false,
      status: "release_approved",
      drawGroupKey: drawGroup.key,
    };
  })
  .public();

// -----------------------------------------------------------------------------
// Notes mutations
// -----------------------------------------------------------------------------

export const demo_addBuildNote = publicMutation
  .use(withMutationTiming("demo_drawflow_backoffice.addBuildNote"))
  .input({
    buildId: v.id("demo_builds"),
    visibility: v.union(v.literal("internal"), v.literal("public")),
    body: v.string(),
    authorPersona: v.optional(v.string()),
  })
  .returns(v.id("demo_buildNotes"))
  .handler(async (ctx, args) => {
    const body = args.body.trim();
    if (!body) {
      throw new Error("empty_body");
    }
    const build = await ctx.db.get(args.buildId);
    if (!build) {
      throw new Error(`Build ${args.buildId} not found`);
    }
    const now = Date.now();
    const id = await ctx.db.insert("demo_buildNotes", {
      buildId: args.buildId,
      scenario: build.scenario,
      visibility: args.visibility,
      body,
      authorPersona: args.authorPersona ?? "lender_admin",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("demo_auditEvents", {
      actorPersona: args.authorPersona ?? "lender_admin",
      buildId: args.buildId,
      command: "demo_addBuildNote",
      correlationId: `demo_addBuildNote:${id}:${now}`,
      createdAt: now,
      entityKey: id,
      entityType: "buildNote",
      eventType: `buildNote.${args.visibility}.added`,
      scenario: build.scenario,
      validation: "accepted",
    });
    return id;
  })
  .public();

// -----------------------------------------------------------------------------
// Borrower-safe public notes: NEVER returns internal notes.
// -----------------------------------------------------------------------------

export const demo_getBorrowerVisibleNotes = publicQuery
  .use(withQueryTiming("demo_drawflow_backoffice.getBorrowerVisibleNotes"))
  .input({ buildId: v.id("demo_builds") })
  .returns(v.array(v.any()))
  .handler(async (ctx, { buildId }) => {
    const rows = await ctx.db
      .query("demo_buildNotes")
      .withIndex("by_build_visibility", (q) =>
        q.eq("buildId", buildId).eq("visibility", "public")
      )
      .collect();
    return rows;
  })
  .public();

// -----------------------------------------------------------------------------
// Milestone approval from sheet (delegates to existing approveMilestoneCompletion
// in demo_drawflow.ts; this is a thin wrapper that mirrors the audit + outbox)
// -----------------------------------------------------------------------------

export const demo_approveMilestoneFromSheet = publicMutation
  .use(withMutationTiming("demo_drawflow_backoffice.approveMilestoneFromSheet"))
  .input({
    buildId: v.id("demo_builds"),
    milestoneKey: v.string(),
    actorPersona: v.optional(v.string()),
    note: v.optional(v.string()),
  })
  .returns(
    v.object({
      milestoneKey: v.string(),
      status: v.string(),
    })
  )
  .handler(async (ctx, args) => {
    const actorPersona = args.actorPersona ?? "lender_admin";
    const build = await ctx.db.get(args.buildId);
    if (!build) {
      throw new Error(`Build ${args.buildId} not found`);
    }
    const milestone = await ctx.db
      .query("demo_milestones")
      .withIndex("by_key", (q) =>
        q.eq("scenario", build.scenario).eq("key", args.milestoneKey)
      )
      .first();
    if (!milestone) {
      throw new Error(
        `Milestone ${args.milestoneKey} not found for scenario ${build.scenario}`
      );
    }
    const priorStatus = milestone.status;
    const now = Date.now();
    await ctx.db.patch(milestone._id, {
      status: "completion_approved",
      evidenceReviewStatus: "approved",
      approvedAt: now,
      approvedByPersona: actorPersona,
      progressPercent: 100,
      updatedAt: now,
    });
    await ctx.db.insert("demo_auditEvents", {
      actorPersona,
      afterSummary: "completion_approved",
      beforeSummary: priorStatus,
      buildId: args.buildId,
      command: "demo_approveMilestoneFromSheet",
      correlationId: `demo_approveMilestoneFromSheet:${args.milestoneKey}:${now}`,
      createdAt: now,
      entityKey: args.milestoneKey,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "milestoneCompleted",
      milestoneKey: args.milestoneKey,
      reason: args.note,
      scenario: build.scenario,
      validation: "accepted",
    });
    await ctx.db.insert("demo_eventOutbox", {
      buildId: args.buildId,
      createdAt: now,
      drawGroupKey: milestone.drawGroupKey,
      eventType: "milestoneCompleted",
      milestoneKey: args.milestoneKey,
      payloadPreview: `Milestone ${milestone.name} approved`,
      relatedEntity: "milestone",
      scenario: build.scenario,
      status: "mock_delivered",
    });
    return { milestoneKey: args.milestoneKey, status: "completion_approved" };
  })
  .public();

// -----------------------------------------------------------------------------
// Contractors + Documents add mutations
// -----------------------------------------------------------------------------

export const demo_attachContractorToBuild = publicMutation
  .use(withMutationTiming("demo_drawflow_backoffice.attachContractorToBuild"))
  .input({
    buildId: v.id("demo_builds"),
    contractorId: v.id("demo_contractors"),
    role: v.string(),
    actorPersona: v.optional(v.string()),
  })
  .returns(
    v.object({
      buildContractorId: v.union(v.id("demo_buildContractors"), v.null()),
      alreadyAttached: v.boolean(),
    })
  )
  .handler(async (ctx, args) => {
    const role = args.role.trim();
    if (!role) {
      throw new Error("empty_role");
    }
    const build = await ctx.db.get(args.buildId);
    if (!build) {
      throw new Error(`Build ${args.buildId} not found`);
    }
    const contractor = await ctx.db.get(args.contractorId);
    if (!contractor) {
      throw new Error(`Contractor ${args.contractorId} not found`);
    }
    if (contractor.scenario !== build.scenario) {
      throw new Error("scenario_mismatch");
    }
    const existing = await ctx.db
      .query("demo_buildContractors")
      .withIndex("by_build_contractor", (q) =>
        q.eq("buildId", args.buildId).eq("contractorId", args.contractorId)
      )
      .first();
    if (existing) {
      return { buildContractorId: null, alreadyAttached: true };
    }
    const now = Date.now();
    const buildContractorId = await ctx.db.insert("demo_buildContractors", {
      buildId: args.buildId,
      contractorId: args.contractorId,
      scenario: build.scenario,
      role,
      createdAt: now,
    });
    const actorPersona = args.actorPersona ?? "lender_admin";
    await ctx.db.insert("demo_auditEvents", {
      actorPersona,
      buildId: args.buildId,
      command: "demo_attachContractorToBuild",
      correlationId: `demo_attachContractorToBuild:${buildContractorId}:${now}`,
      createdAt: now,
      entityKey: buildContractorId,
      entityLabel: `${contractor.name} · ${role}`,
      entityType: "buildContractor",
      eventType: "contractor.attached",
      scenario: build.scenario,
      validation: "accepted",
    });
    return { buildContractorId, alreadyAttached: false };
  })
  .public();

export const demo_addBuildDocument = publicMutation
  .use(withMutationTiming("demo_drawflow_backoffice.addBuildDocument"))
  .input({
    buildId: v.id("demo_builds"),
    name: v.string(),
    kind: v.string(),
    sizeBytes: v.optional(v.number()),
    url: v.optional(v.string()),
    uploaderPersona: v.optional(v.string()),
  })
  .returns(v.id("demo_buildDocuments"))
  .handler(async (ctx, args) => {
    const name = args.name.trim();
    const kind = args.kind.trim();
    if (!name) {
      throw new Error("empty_name");
    }
    if (!kind) {
      throw new Error("empty_kind");
    }
    const build = await ctx.db.get(args.buildId);
    if (!build) {
      throw new Error(`Build ${args.buildId} not found`);
    }
    const now = Date.now();
    const uploaderPersona = args.uploaderPersona ?? "lender_admin";
    const id = await ctx.db.insert("demo_buildDocuments", {
      buildId: args.buildId,
      scenario: build.scenario,
      name,
      kind,
      sizeBytes: args.sizeBytes ?? 0,
      uploaderPersona,
      url: args.url,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("demo_auditEvents", {
      actorPersona: uploaderPersona,
      buildId: args.buildId,
      command: "demo_addBuildDocument",
      correlationId: `demo_addBuildDocument:${id}:${now}`,
      createdAt: now,
      entityKey: id,
      entityLabel: name,
      entityType: "buildDocument",
      eventType: `document.${kind}.added`,
      scenario: build.scenario,
      validation: "accepted",
    });
    return id;
  })
  .public();

export const demo_createAndAttachContractor = publicMutation
  .use(withMutationTiming("demo_drawflow_backoffice.createAndAttachContractor"))
  .input({
    buildId: v.id("demo_builds"),
    role: v.string(),
    contractor: v.object({
      name: v.string(),
      kind: v.union(v.literal("company"), v.literal("individual")),
      hourlyRateCents: v.number(),
      city: v.string(),
      skills: v.array(v.string()),
      trades: v.array(v.string()),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
    }),
    actorPersona: v.optional(v.string()),
  })
  .returns(
    v.object({
      contractorId: v.id("demo_contractors"),
      buildContractorId: v.id("demo_buildContractors"),
    })
  )
  .handler(async (ctx, args) => {
    const role = args.role.trim();
    if (!role) {
      throw new Error("empty_role");
    }
    const name = args.contractor.name.trim();
    if (!name) {
      throw new Error("empty_name");
    }
    const city = args.contractor.city.trim();
    if (!city) {
      throw new Error("empty_city");
    }
    if (
      !Number.isFinite(args.contractor.hourlyRateCents) ||
      args.contractor.hourlyRateCents < 0
    ) {
      throw new Error("invalid_hourly_rate");
    }
    const trades = args.contractor.trades
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (trades.length === 0) {
      throw new Error("empty_trades");
    }
    const skills = args.contractor.skills
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const build = await ctx.db.get(args.buildId);
    if (!build) {
      throw new Error(`Build ${args.buildId} not found`);
    }
    // Builds carry scenario but not orgKey; derive orgKey from any existing
    // contractor in the same scenario, falling back to "demo".
    const sibling = await ctx.db
      .query("demo_contractors")
      .withIndex("by_scenario", (q) => q.eq("scenario", build.scenario))
      .first();
    const orgKey = sibling?.orgKey ?? "demo";
    const now = Date.now();
    const phone = args.contractor.phone?.trim() || undefined;
    const email = args.contractor.email?.trim() || undefined;
    const contractorId = await ctx.db.insert("demo_contractors", {
      orgKey,
      scenario: build.scenario,
      name,
      kind: args.contractor.kind,
      hourlyRateCents: Math.round(args.contractor.hourlyRateCents),
      city,
      skills,
      trades,
      phone,
      email,
      createdAt: now,
      updatedAt: now,
    });
    const buildContractorId = await ctx.db.insert("demo_buildContractors", {
      buildId: args.buildId,
      contractorId,
      scenario: build.scenario,
      role,
      createdAt: now,
    });
    const actorPersona = args.actorPersona ?? "lender_admin";
    await ctx.db.insert("demo_auditEvents", {
      actorPersona,
      buildId: args.buildId,
      command: "demo_createAndAttachContractor",
      correlationId: `demo_createAndAttachContractor:${buildContractorId}:${now}`,
      createdAt: now,
      entityKey: buildContractorId,
      entityLabel: `${name} · ${role}`,
      entityType: "buildContractor",
      eventType: "contractor.created_attached",
      scenario: build.scenario,
      validation: "accepted",
    });
    return { contractorId, buildContractorId };
  })
  .public();

// -----------------------------------------------------------------------------
// Seed helpers (called from demo_drawflow.seedActive after build is created)
// -----------------------------------------------------------------------------

export interface SeedBuildDetailExtrasInput {
  buildId: Id<"demo_builds">;
  orgKey: string;
  scenario: string;
}

export async function seedBuildDetailExtras(
  ctx: { db: any },
  { buildId, scenario, orgKey }: SeedBuildDetailExtrasInput
): Promise<void> {
  const now = Date.now();
  const northpeakId = await ctx.db.insert("demo_contractors", {
    orgKey,
    scenario,
    name: "Northpeak Concrete",
    kind: "company",
    hourlyRateCents: 8500,
    city: "Boulder, CO",
    skills: ["forms", "rebar", "slab"],
    trades: ["concrete"],
    phone: "303-555-0118",
    email: "ops@northpeak.example",
    createdAt: now,
    updatedAt: now,
  });
  const silverlightId = await ctx.db.insert("demo_contractors", {
    orgKey,
    scenario,
    name: "Silverlight Electric",
    kind: "company",
    hourlyRateCents: 11_000,
    city: "Longmont, CO",
    skills: ["service", "rough-in", "trim"],
    trades: ["electrical"],
    phone: "303-555-0117",
    email: "ops@silverlight.example",
    createdAt: now,
    updatedAt: now,
  });
  const mendezId = await ctx.db.insert("demo_contractors", {
    orgKey,
    scenario,
    name: "K. Mendez",
    kind: "individual",
    hourlyRateCents: 9500,
    city: "Boulder, CO",
    skills: ["plumbing"],
    trades: ["plumbing"],
    phone: undefined,
    email: "k.mendez@example.com",
    createdAt: now,
    updatedAt: now,
  });

  for (const [contractorId, role] of [
    [northpeakId, "Concrete · Lead"],
    [silverlightId, "Electrical"],
    [mendezId, "Plumbing"],
  ] as const) {
    await ctx.db.insert("demo_buildContractors", {
      buildId,
      contractorId,
      scenario,
      role,
      createdAt: now,
    });
  }

  // Assign Northpeak + Mendez to a representative milestone key (foundation/excavation)
  for (const [milestoneKey, contractorId, role] of [
    ["foundation", northpeakId, "Lead · forms, rebar, slab"],
    ["foundation", mendezId, "Plumbing assist"],
    ["rough_ins", silverlightId, "Electrical rough-in"],
  ] as const) {
    await ctx.db.insert("demo_milestoneContractors", {
      buildId,
      milestoneKey,
      contractorId,
      scenario,
      role,
      createdAt: now,
    });
  }

  await ctx.db.insert("demo_buildNotes", {
    buildId,
    scenario,
    visibility: "internal",
    body: "Verified excavation depth against survey. Borrower copy on D-04 requested. Recommend approve once geofence override resolves.",
    authorPersona: "lender_admin",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("demo_buildNotes", {
    buildId,
    scenario,
    visibility: "public",
    body: "Draw 4 received; expect decision within 2 business days after site visit.",
    authorPersona: "lender_admin",
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("demo_buildDocuments", {
    buildId,
    scenario,
    name: "Permit_Boulder_2025-09.pdf",
    kind: "permit",
    sizeBytes: 184_320,
    uploaderPersona: "builder",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("demo_buildDocuments", {
    buildId,
    scenario,
    name: "Survey_MapleRidge.pdf",
    kind: "survey",
    sizeBytes: 612_400,
    uploaderPersona: "builder",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("demo_buildDocuments", {
    buildId,
    scenario,
    name: "Excavation_inspection_2026-05-23.jpg",
    kind: "evidence",
    sizeBytes: 2_456_320,
    uploaderPersona: "site_visitor",
    createdAt: now,
    updatedAt: now,
  });

  // Submilestones for the most visible kanban milestones. Each milestone
  // gets a checklist with mixed status to power the "3/5 done" UX on cards.
  const SUBMILESTONE_SEED: Array<{
    milestoneKey: string;
    items: Array<{
      key: string;
      name: string;
      status: "todo" | "in_progress" | "done";
      budgetCents?: number;
      durationDays?: number;
    }>;
  }> = [
    {
      milestoneKey: "foundation",
      items: [
        {
          key: "footings_formed",
          name: "Footings formed & inspected",
          status: "done",
          budgetCents: 1_800_000,
          durationDays: 4,
        },
        {
          key: "rebar_tied",
          name: "Rebar tied",
          status: "done",
          budgetCents: 900_000,
          durationDays: 3,
        },
        {
          key: "slab_poured",
          name: "Slab poured",
          status: "done",
          budgetCents: 2_400_000,
          durationDays: 2,
        },
        {
          key: "stem_walls",
          name: "Stem walls cured",
          status: "in_progress",
          budgetCents: 1_500_000,
          durationDays: 5,
        },
        {
          key: "waterproofing",
          name: "Waterproofing applied",
          status: "todo",
          budgetCents: 600_000,
          durationDays: 2,
        },
      ],
    },
    {
      milestoneKey: "underground_plumbing",
      items: [
        {
          key: "rough_layout",
          name: "Rough layout marked",
          status: "todo",
          budgetCents: 350_000,
          durationDays: 1,
        },
        {
          key: "trench_dug",
          name: "Trenches dug",
          status: "todo",
          budgetCents: 420_000,
          durationDays: 2,
        },
        {
          key: "pipes_laid",
          name: "Pipes laid & pressure-tested",
          status: "todo",
          budgetCents: 1_100_000,
          durationDays: 4,
        },
        {
          key: "inspection_pass",
          name: "City inspection passed",
          status: "todo",
          budgetCents: 130_000,
          durationDays: 1,
        },
      ],
    },
    {
      milestoneKey: "water_sewer",
      items: [
        {
          key: "tap_permit",
          name: "City tap permit",
          status: "done",
          budgetCents: 240_000,
          durationDays: 1,
        },
        {
          key: "main_run",
          name: "Water main run",
          status: "done",
          budgetCents: 1_650_000,
          durationDays: 6,
        },
        {
          key: "sewer_connection",
          name: "Sewer connection",
          status: "in_progress",
          budgetCents: 1_300_000,
          durationDays: 5,
        },
        {
          key: "backfill",
          name: "Backfill & compact",
          status: "todo",
          budgetCents: 410_000,
          durationDays: 2,
        },
        {
          key: "as_built",
          name: "As-built drawings filed",
          status: "todo",
          budgetCents: 90_000,
          durationDays: 1,
        },
      ],
    },
    {
      milestoneKey: "framing",
      items: [
        {
          key: "sill_plate",
          name: "Sill plate set",
          status: "todo",
          budgetCents: 480_000,
          durationDays: 1,
        },
        {
          key: "floor_joists",
          name: "Floor joists & subfloor",
          status: "todo",
          budgetCents: 2_100_000,
          durationDays: 5,
        },
        {
          key: "exterior_walls",
          name: "Exterior walls raised",
          status: "todo",
          budgetCents: 3_500_000,
          durationDays: 6,
        },
        {
          key: "interior_walls",
          name: "Interior walls raised",
          status: "todo",
          budgetCents: 2_200_000,
          durationDays: 5,
        },
        {
          key: "roof_deck",
          name: "Roof deck installed",
          status: "todo",
          budgetCents: 1_900_000,
          durationDays: 4,
        },
        {
          key: "framing_inspection",
          name: "Framing inspection",
          status: "todo",
          budgetCents: 120_000,
          durationDays: 1,
        },
      ],
    },
    {
      milestoneKey: "roof_flat_shingles",
      items: [
        {
          key: "underlayment",
          name: "Underlayment & flashings",
          status: "todo",
          budgetCents: 650_000,
          durationDays: 2,
        },
        {
          key: "shingles",
          name: "Shingles installed",
          status: "todo",
          budgetCents: 1_450_000,
          durationDays: 4,
        },
        {
          key: "ridge_caps",
          name: "Ridge caps & vents",
          status: "todo",
          budgetCents: 280_000,
          durationDays: 1,
        },
      ],
    },
    {
      milestoneKey: "aluminum_windows",
      items: [
        {
          key: "delivery",
          name: "Window delivery on-site",
          status: "todo",
          budgetCents: 4_200_000,
          durationDays: 1,
        },
        {
          key: "install_first_floor",
          name: "First-floor install",
          status: "todo",
          budgetCents: 1_400_000,
          durationDays: 3,
        },
        {
          key: "install_upper",
          name: "Upper-floor install",
          status: "todo",
          budgetCents: 1_500_000,
          durationDays: 3,
        },
        {
          key: "seal_inspection",
          name: "Seal & weatherization inspection",
          status: "todo",
          budgetCents: 180_000,
          durationDays: 1,
        },
      ],
    },
  ];
  for (const group of SUBMILESTONE_SEED) {
    for (const [order, item] of group.items.entries()) {
      await ctx.db.insert("demo_milestoneSubmilestones", {
        buildId,
        milestoneKey: group.milestoneKey,
        key: item.key,
        name: item.name,
        order,
        status: item.status,
        budgetCents: item.budgetCents,
        durationDays: item.durationDays,
        scenario,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

// Public seed entrypoint so tests + the demo route can populate the new tables
// without re-running the full demo seed.
export const demo_seedBuildDetailExtras = publicMutation
  .use(withMutationTiming("demo_drawflow_backoffice.seedBuildDetailExtras"))
  .input({ buildId: v.id("demo_builds"), orgKey: v.optional(v.string()) })
  .returns(v.object({ seeded: v.boolean() }))
  .handler(async (ctx, args) => {
    const build = await ctx.db.get(args.buildId);
    if (!build) {
      return { seeded: false };
    }
    // Idempotency: only seed once.
    const existing = await ctx.db
      .query("demo_buildContractors")
      .withIndex("by_build", (q) => q.eq("buildId", args.buildId))
      .first();
    if (existing) {
      return { seeded: false };
    }
    await seedBuildDetailExtras(ctx, {
      buildId: args.buildId,
      scenario: build.scenario,
      orgKey: args.orgKey ?? "demo",
    });
    return { seeded: true };
  })
  .public();

void DEMO_SCENARIO;
