import type { Id } from "../../../convex/_generated/dataModel";

import type { ProductionTimelineWorkspaceProps } from "./ProductionTimelineWorkspaceTypes";

export function collaborationCursorColor(index: number) {
  const colors = [
    "oklch(0.54 0.14 240)",
    "oklch(0.58 0.16 145)",
    "oklch(0.62 0.14 85)",
    "oklch(0.577 0.245 27.325)",
  ];
  return colors[index % colors.length];
}

export function buildCollaborationShareUrl(
  shareToken: string,
  options: { targetHref?: string } = {}
) {
  const href =
    options.targetHref ??
    (typeof window === "undefined" ? "" : window.location.href);

  if (!href) {
    return `?collab=${encodeURIComponent(shareToken)}`;
  }

  const isAbsolute = /^[a-z][a-z\d+\-.]*:/i.test(href);
  const base =
    typeof window === "undefined"
      ? "http://drawflow.local"
      : window.location.origin;
  const url = new URL(href, base);
  url.searchParams.set("collab", shareToken);

  if (typeof window === "undefined" && !isAbsolute) {
    return `${url.pathname}${url.search}${url.hash}`;
  }

  return url.toString();
}

export function buildCollaborationTargetHref(href: string) {
  const isAbsolute = /^[a-z][a-z\d+\-.]*:/i.test(href);
  const base =
    typeof window === "undefined"
      ? "http://drawflow.local"
      : window.location.origin;
  const url = new URL(href, base);
  url.searchParams.set("tab", "timeline");

  if (!isAbsolute) {
    return `${url.pathname}${url.search}${url.hash}`;
  }

  return url.toString();
}

export function productionTimelineStatus(
  proposal: ProductionTimelineWorkspaceProps["workspace"]["proposal"]
) {
  if (proposal.reviewOutcome === "rejected") {
    return "rejected";
  }
  if (proposal.reviewOutcome === "requested_changes") {
    return "requested_changes";
  }
  return proposal.status;
}

export function normalizeProductionMilestoneInput(input: any) {
  const dayStart = Math.max(0, Math.round(input.dayStart ?? input.x ?? 0));
  const durationDays = Math.max(1, Math.round(input.durationDays ?? 1));
  return {
    budgetCents: Math.max(0, Math.round(input.budgetCents ?? 0)),
    dayEnd: Math.max(
      dayStart,
      Math.round(input.dayEnd ?? dayStart + durationDays)
    ),
    dayStart,
    dependencyKeys: input.dependencyKeys ?? [],
    drawAvailabilityCents:
      input.drawAvailabilityCents === undefined
        ? undefined
        : Math.max(0, Math.round(input.drawAvailabilityCents)),
    durationDays,
    evidenceState: input.evidenceState ?? "Draft package",
    icon: input.icon,
    lane: input.lane,
    markerLabel: input.markerLabel,
    milestoneKey: input.milestoneKey,
    name: input.name ?? "Timeline milestone",
    order: Math.max(1, Math.round(input.order ?? 1)),
    policyState: input.policyState ?? "Draft proposal policy",
    status: input.status,
    submilestones: (input.submilestones ?? []).map(normalizeSubmilestoneInput),
    tone: input.tone,
    x: dayStart,
  };
}

export function normalizeProductionMilestonePatch(input: any) {
  const normalized = normalizeProductionMilestoneInput({
    ...input,
    dayStart: input.dayStart ?? input.x,
  });
  return {
    budgetCents: normalized.budgetCents,
    dayEnd: normalized.dayEnd,
    dayStart: normalized.dayStart,
    dependencyKeys: normalized.dependencyKeys,
    drawAvailabilityCents: normalized.drawAvailabilityCents,
    durationDays: normalized.durationDays,
    evidenceState: normalized.evidenceState,
    icon: normalized.icon,
    lane: normalized.lane,
    markerLabel: normalized.markerLabel,
    milestoneKey: normalized.milestoneKey,
    name: normalized.name,
    order: normalized.order,
    policyState: normalized.policyState,
    status: normalized.status,
    submilestones: normalized.submilestones,
    tone: normalized.tone,
  };
}

export function normalizeSubmilestoneInput(input: any, index: number) {
  return {
    ...(input.budgetCents === undefined
      ? {}
      : { budgetCents: Math.max(0, Math.round(input.budgetCents)) }),
    ...(input.durationDays === undefined
      ? {}
      : { durationDays: Math.max(1, Math.round(input.durationDays)) }),
    ...(input.fieldGuidance === undefined
      ? {}
      : {
          fieldGuidance: {
            cameraAnglesTiptapJson:
              input.fieldGuidance.cameraAnglesTiptapJson ?? "",
            whatToVerifyTiptapJson:
              input.fieldGuidance.whatToVerifyTiptapJson ?? "",
          },
        }),
    key: input.key ?? `sub-${index + 1}`,
    name: input.name ?? "Submilestone",
    order: Math.max(1, Math.round(input.order ?? index + 1)),
    ...(input.scopeOfWorkTiptapJson === undefined
      ? {}
      : { scopeOfWorkTiptapJson: input.scopeOfWorkTiptapJson }),
    ...(input.startDay === undefined
      ? {}
      : { startDay: Math.max(0, Math.round(input.startDay)) }),
  };
}

export function normalizeEvidenceAssetInput(input: any) {
  return {
    evidenceKey: input.evidenceKey,
    fileName: input.fileName,
    label: input.label,
    locationVerified: input.locationVerified,
    milestoneKey: input.milestoneKey,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    source: input.source,
    storageId: input.storageId as Id<"_storage"> | undefined,
    tag: input.tag,
  };
}
