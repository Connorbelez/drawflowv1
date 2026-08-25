import type { Doc, QueryCtx } from "../types";
import type { AssistantAuth } from "./contracts";
import {
  daysSinceIsoDate,
  formatCents,
  normalizePlannerRecord,
  toIsoDate,
} from "./shared";
import type { AssistantContextPack } from "./shared";
import { isBackoffice, isBuilder, optionalId } from "./inputs";
import { collectByIndex } from "../assistant";

export async function assistantOperationalBriefing(
  ctx: QueryCtx,
  auth: AssistantAuth
) {
  const sections = [
    { id: "today", items: [] as AssistantBriefingItem[], title: "Today" },
    {
      id: "reviews",
      items: [] as AssistantBriefingItem[],
      title: "Review queue",
    },
    {
      id: "draws",
      items: [] as AssistantBriefingItem[],
      title: "Draws and releases",
    },
    {
      id: "schedule",
      items: [] as AssistantBriefingItem[],
      title: "Schedule and risk",
    },
    {
      id: "contractors",
      items: [] as AssistantBriefingItem[],
      title: "Contractors",
    },
  ];
  const push = (sectionId: string, item: AssistantBriefingItem) => {
    const section = sections.find((candidate) => candidate.id === sectionId);
    section?.items.push(item);
  };

  const today = toIsoDate(new Date());
  const reminders = await ctx.db
    .query("calendarReminderEvents")
    .withIndex("by_created_by", (q) =>
      q
        .eq("organizationId", auth.organizationId)
        .eq("createdByWorkosUserId", auth.subject)
    )
    .take(100);
  for (const reminder of reminders) {
    if (reminder.status === "active" && reminder.startsAt <= today) {
      push("today", {
        href: reminder.buildId
          ? `/backoffice/builds/${String(reminder.buildId)}`
          : `/backoffice/proposals/${String(reminder.proposalId)}`,
        id: `reminder:${String(reminder._id)}`,
        kind: "reminder",
        priority: "medium",
        source: "calendarReminderEvents",
        title: reminder.title,
      });
    }
  }

  if (isBackoffice(auth.roles)) {
    await appendBackofficeBriefingItems(ctx, auth, push);
  } else if (isBuilder(auth.roles)) {
    await appendBuilderBriefingItems(ctx, auth, push);
  }

  const priorityWeight = { critical: 0, high: 1, medium: 2, low: 3 };
  for (const section of sections) {
    section.items = section.items
      .sort(
        (a, b) =>
          priorityWeight[a.priority] - priorityWeight[b.priority] ||
          a.title.localeCompare(b.title)
      )
      .slice(0, 12);
  }
  return {
    sections: sections.filter((section) => section.items.length > 0),
    summary: {
      critical: sections
        .flatMap((section) => section.items)
        .filter((item) => item.priority === "critical").length,
      generatedFor: auth.subject,
      high: sections
        .flatMap((section) => section.items)
        .filter((item) => item.priority === "high").length,
      total: sections.reduce(
        (total, section) => total + section.items.length,
        0
      ),
    },
  };
}

export type AssistantBriefingItem = {
  actions?: Array<{
    kind?: string;
    label: string;
    reason?: string;
    to?: string;
  }>;
  detail?: string;
  href?: string;
  id: string;
  kind: string;
  priority: "critical" | "high" | "medium" | "low";
  source: string;
  title: string;
};

export async function assistantOperationalQueues(
  ctx: QueryCtx,
  auth: AssistantAuth
) {
  if (!isBackoffice(auth.roles)) {
    return emptyOperationalQueues();
  }
  const [proposalDocs, buildDocs] = await Promise.all([
    ctx.db
      .query("buildProposals")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", auth.brokerage._id))
      .take(150),
    ctx.db
      .query("activeBuilds")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", auth.brokerage._id))
      .take(150),
  ]);
  const proposals = proposalDocs.filter(
    (proposal) => proposal.organizationId === auth.organizationId
  );
  const builds = buildDocs.filter(
    (build) => build.organizationId === auth.organizationId
  );
  const drawRows: Array<Record<string, unknown>> = [];
  const siteVisitRows: Array<Record<string, unknown>> = [];
  const riskRows: Array<Record<string, unknown>> = [];
  const now = Date.now();

  for (const build of builds.slice(0, 80)) {
    const [draws, visits, evidenceAssets, milestones] = await Promise.all([
      ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build", (q) => q.eq("buildId", build._id))
        .take(100),
      ctx.db
        .query("buildSiteVisits")
        .withIndex("by_build", (q) => q.eq("buildId", build._id))
        .take(100),
      ctx.db
        .query("buildEvidenceAssets")
        .withIndex("by_build", (q) => q.eq("buildId", build._id))
        .take(100),
      ctx.db
        .query("buildMilestones")
        .withIndex("by_build", (q) => q.eq("buildId", build._id))
        .take(100),
    ]);
    const href = `/backoffice/builds/${String(build._id)}`;
    const geofenceMilestones = new Set(
      evidenceAssets
        .filter((asset) => asset.locationVerified === false)
        .map((asset) => asset.milestoneKey)
    );
    for (const draw of draws) {
      drawRows.push({
        actionLabel:
          draw.status === "requested" ||
          draw.status === "in_review" ||
          draw.status === "ready_for_admin"
            ? "Review draw"
            : draw.status === "approved_for_release"
              ? "Open release controls"
              : "Open draw",
        amountCents: draw.amountCents,
        buildId: build._id,
        buildName: build.buildName,
        drawKey: draw.drawKey,
        href,
        id: String(draw._id),
        label: draw.label,
        milestoneKey: draw.milestoneKey,
        status: draw.status,
        timingDay: draw.timingDay,
      });
    }
    for (const visit of visits) {
      const expired =
        visit.status === "requested" && visit.tokenExpiresAt < now;
      const geofenceFlagged = geofenceMilestones.has(visit.milestoneKey);
      siteVisitRows.push({
        actionLabel: expired
          ? "Reschedule visit"
          : visit.status === "complete"
            ? "Review report"
            : "Open visit",
        buildId: build._id,
        buildName: build.buildName,
        expired,
        geofenceFlagged,
        href,
        id: String(visit._id),
        milestoneKey: visit.milestoneKey,
        requestedDay: visit.requestedDay,
        status: expired ? "expired" : visit.status,
        tokenExpiresAt: visit.tokenExpiresAt,
        visitId: visit.visitId,
      });
    }

    const currentDay =
      build.timelineCurrentDay ?? daysSinceIsoDate(build.startDate);
    const overdueMilestones = milestones.filter(
      (milestone) =>
        milestone.status !== "complete" && currentDay > milestone.dayEnd
    );
    const claimedMilestones = milestones.filter((milestone) => {
      const review = normalizePlannerRecord(milestone.completionReview);
      return milestone.completionClaim && review.status !== "approved";
    });
    const requestedDraws = draws.filter((draw) => draw.status === "requested");
    const expiredVisits = visits.filter(
      (visit) => visit.status === "requested" && visit.tokenExpiresAt < now
    );
    const geofenceCount = geofenceMilestones.size;
    const score =
      overdueMilestones.length * 3 +
      claimedMilestones.length * 4 +
      requestedDraws.length * 3 +
      expiredVisits.length * 2 +
      geofenceCount;
    if (score > 0) {
      riskRows.push({
        actionLabel: "Open build review",
        buildId: build._id,
        buildName: build.buildName,
        claimedMilestones: claimedMilestones.length,
        currentDay,
        expiredVisits: expiredVisits.length,
        geofenceFlags: geofenceCount,
        href,
        id: String(build._id),
        overdueMilestones: overdueMilestones.length,
        requestedDraws: requestedDraws.length,
        score,
      });
    }
  }

  const proposalReviewRows = proposals
    .filter((proposal) => proposal.status === "submitted")
    .sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0))
    .slice(0, 12)
    .map((proposal) => ({
      actionLabel: "Open review checklist",
      buildName: proposal.buildName,
      href: `/backoffice/proposals/${String(proposal._id)}`,
      id: String(proposal._id),
      location: proposal.location,
      proposedBudget: proposal.totalBudgetCents,
      submittedAt: proposal.submittedAt,
    }));

  const drawSummary = countByStatus(drawRows, [
    "planned",
    "requested",
    "approved",
    "rejected",
    "released",
  ]);
  const siteVisitSummary = {
    cancelled: siteVisitRows.filter((row) => row.status === "cancelled").length,
    complete: siteVisitRows.filter((row) => row.status === "complete").length,
    expired: siteVisitRows.filter((row) => row.status === "expired").length,
    geofenceFlagged: siteVisitRows.filter((row) => row.geofenceFlagged).length,
    requested: siteVisitRows.filter((row) => row.status === "requested").length,
    total: siteVisitRows.length,
  };

  return {
    drawQueue: {
      rows: drawRows.sort(sortDrawQueueRows).slice(0, 20),
      summary: { ...drawSummary, total: drawRows.length },
    },
    proposalReviewQueue: {
      rows: proposalReviewRows,
      summary: {
        submitted: proposalReviewRows.length,
        total: proposalReviewRows.length,
      },
    },
    riskBuildQueue: {
      rows: riskRows
        .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))
        .slice(0, 12),
      summary: {
        highRisk: riskRows.filter((row) => Number(row.score ?? 0) >= 6).length,
        total: riskRows.length,
      },
    },
    siteVisitQueue: {
      rows: siteVisitRows.sort(sortSiteVisitQueueRows).slice(0, 20),
      summary: siteVisitSummary,
    },
  };
}

export function emptyOperationalQueues() {
  return {
    drawQueue: { rows: [], summary: { total: 0 } },
    proposalReviewQueue: { rows: [], summary: { total: 0 } },
    riskBuildQueue: { rows: [], summary: { total: 0 } },
    siteVisitQueue: { rows: [], summary: { total: 0 } },
  };
}

export function countByStatus(
  rows: Array<Record<string, unknown>>,
  statuses: string[]
) {
  return Object.fromEntries(
    statuses.map((status) => [
      status,
      rows.filter((row) => row.status === status).length,
    ])
  );
}

export function sortDrawQueueRows(
  a: Record<string, unknown>,
  b: Record<string, unknown>
) {
  const weight = {
    requested: 0,
    approved: 1,
    planned: 2,
    rejected: 3,
    released: 4,
  };
  return (
    (weight[String(a.status) as keyof typeof weight] ?? 9) -
      (weight[String(b.status) as keyof typeof weight] ?? 9) ||
    Number(a.timingDay ?? 0) - Number(b.timingDay ?? 0)
  );
}

export function sortSiteVisitQueueRows(
  a: Record<string, unknown>,
  b: Record<string, unknown>
) {
  const score = (row: Record<string, unknown>) =>
    (row.status === "expired" ? 0 : row.status === "requested" ? 1 : 2) +
    (row.geofenceFlagged ? -0.5 : 0);
  return (
    score(a) - score(b) ||
    Number(a.tokenExpiresAt ?? 0) - Number(b.tokenExpiresAt ?? 0)
  );
}

export async function appendBackofficeBriefingItems(
  ctx: QueryCtx,
  auth: AssistantAuth,
  push: (sectionId: string, item: AssistantBriefingItem) => void
) {
  const [proposals, builds, contractorIssues] = await Promise.all([
    ctx.db
      .query("buildProposals")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", auth.brokerage._id))
      .take(150),
    ctx.db
      .query("activeBuilds")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", auth.brokerage._id))
      .take(150),
    ctx.db
      .query("contractorScopeIssues")
      .withIndex("by_brokerage_status", (q) =>
        q.eq("brokerageId", auth.brokerage._id).eq("status", "open" as any)
      )
      .take(50)
      .catch(() => []),
  ]);
  for (const proposal of proposals.filter(
    (proposal) => proposal.organizationId === auth.organizationId
  )) {
    if (proposal.status === "submitted") {
      push("reviews", {
        detail: proposal.location,
        href: `/backoffice/proposals/${String(proposal._id)}`,
        id: `proposal:${String(proposal._id)}:submitted`,
        kind: "proposalReview",
        priority: "high",
        source: "buildProposals.status",
        title: `Review submitted proposal: ${proposal.buildName}`,
      });
    }
    const [draws, modifications] = await Promise.all([
      collectByIndex(
        ctx,
        "proposalDrawScheduleRows",
        "by_proposal",
        proposal._id
      ),
      collectByIndex(
        ctx,
        "proposalTimelineModificationRequests",
        "by_proposal",
        proposal._id
      ),
    ]);
    for (const draw of draws as Doc<"proposalDrawScheduleRows">[]) {
      if (draw.requestStatus === "requested") {
        push("draws", {
          detail: `${formatCents(draw.amountCents)} requested`,
          href: `/backoffice/proposals/${String(proposal._id)}`,
          id: `proposal-draw:${String(draw._id)}`,
          kind: "drawRequest",
          priority: "high",
          source: "proposalDrawScheduleRows.requestStatus",
          title: `Draw request needs review: ${proposal.buildName} · ${draw.label}`,
        });
      }
    }
    for (const request of modifications as Doc<"proposalTimelineModificationRequests">[]) {
      if (request.status === "requested") {
        push("reviews", {
          href: `/backoffice/proposals/${String(proposal._id)}`,
          id: `proposal-modification:${String(request._id)}`,
          kind: "timelineModification",
          priority: "medium",
          source: "proposalTimelineModificationRequests.status",
          title: `Timeline change requested: ${proposal.buildName}`,
        });
      }
    }
  }
  for (const build of builds.filter(
    (build) => build.organizationId === auth.organizationId
  )) {
    await appendBuildBriefingItems(ctx, build, push);
  }
  for (const issue of contractorIssues as Array<{
    _id: unknown;
    buildId?: unknown;
    proposalId?: unknown;
    summary: string;
  }>) {
    push("contractors", {
      href: issue.buildId
        ? `/backoffice/builds/${String(issue.buildId)}`
        : issue.proposalId
          ? `/backoffice/proposals/${String(issue.proposalId)}`
          : "/backoffice/contractors",
      id: `contractor-issue:${String(issue._id)}`,
      kind: "contractorIssue",
      priority: "medium",
      source: "contractorScopeIssues.status",
      title: issue.summary,
    });
  }
}

export async function appendBuilderBriefingItems(
  ctx: QueryCtx,
  auth: AssistantAuth,
  push: (sectionId: string, item: AssistantBriefingItem) => void
) {
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_user", (q) => q.eq("workosUserId", auth.subject))
    .take(50);
  for (const link of links.filter((row) => row.status === "active")) {
    const proposals = await ctx.db
      .query("buildProposals")
      .withIndex("by_builder", (q) =>
        q.eq("builderProfileId", link.builderProfileId)
      )
      .take(50);
    for (const proposal of proposals.filter(
      (row) =>
        row.organizationId === auth.organizationId &&
        row.brokerageId === auth.brokerage._id
    )) {
      if (String(proposal.status) === "changes_requested") {
        push("reviews", {
          href: `/builder/proposals/${String(proposal._id)}`,
          id: `proposal:${String(proposal._id)}:changes`,
          kind: "proposalChanges",
          priority: "high",
          source: "buildProposals.status",
          title: `Proposal changes requested: ${proposal.buildName}`,
        });
      }
      if (proposal.activeBuildId) {
        const build = await ctx.db.get(proposal.activeBuildId);
        if (build) {
          await appendBuildBriefingItems(ctx, build, push, "builder");
        }
      }
    }
  }
}

export async function appendBuildBriefingItems(
  ctx: QueryCtx,
  build: Doc<"activeBuilds">,
  push: (sectionId: string, item: AssistantBriefingItem) => void,
  workspace: "backoffice" | "builder" = "backoffice"
) {
  const hrefBase =
    workspace === "builder"
      ? `/builder/builds/${String(build._id)}`
      : `/backoffice/builds/${String(build._id)}`;
  const [milestones, draws, visits, facilityChanges, documents] =
    await Promise.all([
      collectByIndex(ctx, "buildMilestones", "by_build", build._id),
      collectByIndex(ctx, "activeBuildDrawRequests", "by_build", build._id),
      collectByIndex(ctx, "buildSiteVisits", "by_build", build._id),
      collectByIndex(
        ctx,
        "activeBuildFacilityChangeRequests",
        "by_build",
        build._id
      ),
      collectByIndex(ctx, "buildDocuments", "by_build", build._id),
    ]);
  const currentDay =
    build.timelineCurrentDay ?? daysSinceIsoDate(build.startDate);
  for (const milestone of milestones as Doc<"buildMilestones">[]) {
    const reviewStatus = normalizePlannerRecord(
      milestone.completionReview
    ).status;
    if (milestone.completionClaim && reviewStatus !== "approved") {
      push("reviews", {
        href: hrefBase,
        id: `milestone-completion:${String(milestone._id)}`,
        kind: "milestoneCompletion",
        priority: "high",
        source: "buildMilestones.completionClaim",
        title: `Milestone completion needs review: ${build.buildName} · ${milestone.name}`,
      });
    }
    if (currentDay > milestone.dayEnd && milestone.status !== "complete") {
      push("schedule", {
        detail: `Current day ${currentDay}; planned end day ${milestone.dayEnd}`,
        href: hrefBase,
        id: `behind:${String(milestone._id)}`,
        kind: "behindSchedule",
        priority: currentDay - milestone.dayEnd > 7 ? "critical" : "high",
        source: "buildMilestones.dayEnd",
        title: `Build running behind: ${build.buildName} · ${milestone.name}`,
      });
    }
    if (
      milestone.policyState &&
      !["ok", "clear", "normal", "none"].includes(
        String(milestone.policyState).toLowerCase()
      )
    ) {
      push("schedule", {
        detail: String(milestone.policyState),
        href: hrefBase,
        id: `policy:${String(milestone._id)}`,
        kind: "policyWarning",
        priority: "medium",
        source: "buildMilestones.policyState",
        title: `Policy warning: ${build.buildName} · ${milestone.name}`,
      });
    }
  }
  for (const draw of draws as Doc<"activeBuildDrawRequests">[]) {
    if (
      draw.status === "requested" ||
      draw.status === "in_review" ||
      draw.status === "ready_for_admin" ||
      draw.status === "approved_for_release"
    ) {
      const approvedForRelease = draw.status === "approved_for_release";
      push("draws", {
        detail: `${formatCents(draw.amountCents)} · ${draw.status}`,
        href: hrefBase,
        id: `active-draw:${String(draw._id)}`,
        kind: approvedForRelease ? "drawRelease" : "drawRequest",
        priority: approvedForRelease ? "high" : "critical",
        source: "activeBuildDrawRequests.status",
        title: approvedForRelease
          ? `Approved draw needs release: ${build.buildName} · ${draw.label}`
          : `Draw request needs review: ${build.buildName} · ${draw.label}`,
      });
    }
  }
  for (const visit of visits as Doc<"buildSiteVisits">[]) {
    if (visit.status === "requested" || visit.status === "complete") {
      push(visit.status === "requested" ? "today" : "reviews", {
        detail: `Milestone ${visit.milestoneKey}, day ${visit.requestedDay}`,
        href: hrefBase,
        id: `site-visit:${String(visit._id)}`,
        kind: "siteVisit",
        priority: visit.status === "requested" ? "high" : "medium",
        source: "buildSiteVisits.status",
        title:
          visit.status === "requested"
            ? `Outstanding site visit: ${build.buildName}`
            : `Site visit report ready: ${build.buildName}`,
      });
    }
  }
  for (const request of facilityChanges as Doc<"activeBuildFacilityChangeRequests">[]) {
    if (request.status === "requested") {
      push("reviews", {
        href: hrefBase,
        id: `facility-change:${String(request._id)}`,
        kind: "facilityChange",
        priority: "high",
        source: "activeBuildFacilityChangeRequests.status",
        title: `Facility change requested: ${build.buildName}`,
      });
    }
  }
  if ((documents as Doc<"buildDocuments">[]).length === 0) {
    push("reviews", {
      href: hrefBase,
      id: `missing-documents:${String(build._id)}`,
      kind: "missingDocuments",
      priority: "low",
      source: "buildDocuments.by_build",
      title: `No build documents uploaded: ${build.buildName}`,
    });
  }
}

export async function assistantContractorContext(
  ctx: QueryCtx,
  auth: AssistantAuth
) {
  if (!(isBackoffice(auth.roles) || isBuilder(auth.roles))) {
    return [];
  }
  const contractors = await ctx.db
    .query("contractorProfiles")
    .withIndex("by_brokerage", (q) => q.eq("brokerageId", auth.brokerage._id))
    .take(60);
  return contractors
    .filter(
      (contractor) =>
        contractor.organizationId === auth.organizationId &&
        contractor.status === "active"
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 40)
    .map((contractor) => ({
      city: contractor.city,
      contractorId: contractor._id,
      defaultPayRateCents: contractor.defaultPayRateCents,
      defaultPayRateUnit: contractor.defaultPayRateUnit ?? "hour",
      name: contractor.name,
      onboardingStatus:
        contractor.onboardingStatus ??
        (contractor.accountWorkosUserId ? "account_linked" : "profile_only"),
      serviceAreaPrimaryCity: contractor.serviceAreaPrimaryCity,
      status: contractor.status,
      trades: contractor.trades,
    }));
}

export async function assistantCurrentTargetContext(
  ctx: QueryCtx,
  auth: AssistantAuth,
  routeContext: AssistantContextPack
) {
  const buildId = optionalId<"activeBuilds">(
    ctx,
    "activeBuilds",
    routeContext.activeBuildId
  );
  if (buildId) {
    const build = await ctx.db.get(buildId);
    if (
      build &&
      build.organizationId === auth.organizationId &&
      build.brokerageId === auth.brokerage._id
    ) {
      const [milestones, costItems, draws] = await Promise.all([
        collectByIndex(ctx, "buildMilestones", "by_build", build._id),
        collectByIndex(ctx, "buildCostItems", "by_build", build._id),
        collectByIndex(ctx, "plannedDrawScheduleRows", "by_build", build._id),
      ]);
      return {
        buildId: build._id,
        costItems: summarizeCostItems(costItems as Doc<"buildCostItems">[]),
        draws: summarizeDraws(draws as Doc<"plannedDrawScheduleRows">[]),
        kind: "activeBuild",
        label: build.buildName,
        milestones: summarizeMilestones(milestones as Doc<"buildMilestones">[]),
        proposalId: build.proposalId,
        status: build.status,
      };
    }
  }
  const proposalId = optionalId<"buildProposals">(
    ctx,
    "buildProposals",
    routeContext.proposalId
  );
  if (proposalId) {
    const proposal = await ctx.db.get(proposalId);
    if (
      proposal &&
      proposal.organizationId === auth.organizationId &&
      proposal.brokerageId === auth.brokerage._id
    ) {
      const [milestones, costItems, draws] = await Promise.all([
        collectByIndex(ctx, "proposalMilestones", "by_proposal", proposal._id),
        collectByIndex(ctx, "proposalCostItems", "by_proposal", proposal._id),
        collectByIndex(
          ctx,
          "proposalDrawScheduleRows",
          "by_proposal",
          proposal._id
        ),
      ]);
      return {
        costItems: summarizeCostItems(costItems as Doc<"proposalCostItems">[]),
        draws: summarizeDraws(draws as Doc<"proposalDrawScheduleRows">[]),
        kind: "proposal",
        label: proposal.buildName,
        milestones: summarizeMilestones(
          milestones as Doc<"proposalMilestones">[]
        ),
        proposalId: proposal._id,
        status: proposal.status,
      };
    }
  }
  return null;
}

export function summarizeMilestones(
  milestones: Array<
    Pick<
      Doc<"proposalMilestones"> | Doc<"buildMilestones">,
      "dayEnd" | "dayStart" | "key" | "name" | "order"
    >
  >
) {
  return milestones
    .sort((a, b) => a.order - b.order)
    .slice(0, 20)
    .map((milestone) => ({
      dayEnd: milestone.dayEnd,
      dayStart: milestone.dayStart,
      key: milestone.key,
      name: milestone.name,
    }));
}

export function summarizeCostItems(
  items: Array<
    Pick<
      Doc<"proposalCostItems"> | Doc<"buildCostItems">,
      | "costCents"
      | "itemType"
      | "milestoneKey"
      | "quantity"
      | "supplier"
      | "title"
    >
  >
) {
  return items.slice(0, 30).map((item) => ({
    costCents: item.costCents,
    itemType: item.itemType,
    milestoneKey: item.milestoneKey,
    quantity: item.quantity,
    supplier: item.supplier,
    title: item.title,
  }));
}

export function summarizeDraws(
  draws: Array<{
    amountCents: number;
    drawKey: string;
    label: string;
    milestoneKey?: string;
    requestStatus?: string;
    status?: string;
    timingDay: number;
  }>
) {
  return draws.slice(0, 20).map((draw) => ({
    amountCents: draw.amountCents,
    drawKey: draw.drawKey,
    label: draw.label,
    milestoneKey: draw.milestoneKey,
    status: draw.status ?? draw.requestStatus ?? "draft",
    timingDay: draw.timingDay,
  }));
}
