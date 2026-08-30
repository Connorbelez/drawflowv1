import { v } from "convex/values";

import { demoBuildAddress } from "../demo_build_address";
import {
  publicMutation,
  publicQuery,
  withMutationTiming,
  withQueryTiming,
} from "../fluent";
import type { Doc, Id } from "../types";

export const DEMO_SCENARIO = "active";

export const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

// -----------------------------------------------------------------------------
// View model
// -----------------------------------------------------------------------------

export type DemoBuild = Doc<"demo_builds">;
export type DemoMilestone = Doc<"demo_milestones">;
export type DemoDrawGroup = Doc<"demo_drawGroups">;
export type DemoEvidencePackage = Doc<"demo_evidencePackages">;
export type DemoSiteVisit = Doc<"demo_siteVisits">;
export type DemoContractor = Doc<"demo_contractors">;
export type DemoMilestoneContractor = Doc<"demo_milestoneContractors">;
export type DemoBuildNote = Doc<"demo_buildNotes">;
export type DemoBuildDocument = Doc<"demo_buildDocuments">;
export type DemoAuditEvent = Doc<"demo_auditEvents">;
export type DemoEventOutboxEntry = Doc<"demo_eventOutbox">;

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

export const QUICK_ACTION_EVENT_TYPES = new Set<string>([
  "milestoneCompleted",
  "milestone.completion_submitted",
  "milestone.completion_requested",
  "siteVisitCompleted",
  "site_visit.completed",
  "drawRequested",
  "draw.requested",
]);

export function isQuickActionEvent(eventType: string): boolean {
  return QUICK_ACTION_EVENT_TYPES.has(eventType);
}

export function centsSum<T>(items: readonly T[], pick: (item: T) => number): number {
  let total = 0;
  for (const item of items) {
    total += pick(item);
  }
  return total;
}

export function buildDisplayId(build: Pick<DemoBuild, "key">): string {
  return `BLD-${build.key.replace(/[^a-z0-9]/gi, "-").toUpperCase()}`;
}

export async function loadBuildById(
  ctx: { db: { get: (id: Id<"demo_builds">) => Promise<DemoBuild | null> } },
  buildId: Id<"demo_builds">
): Promise<DemoBuild | null> {
  return await ctx.db.get(buildId);
}

export interface BuildDetailViewModel {
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

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function daysBetween(start: string, end: string): number {
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!(Number.isFinite(a) && Number.isFinite(b))) {
    return 0;
  }
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(field: string, value: string): string {
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

export function addDaysToIsoDate(isoDate: string, days: number): string {
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
