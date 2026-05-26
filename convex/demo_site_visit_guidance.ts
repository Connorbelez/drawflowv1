export type SiteVisitGuidanceKind = "cameraAngle" | "whatToVerify";

export interface SiteVisitGuidance {
  cameraAngles: string[];
  whatToVerify: string[];
}

export interface SiteVisitGuidanceItemInput {
  kind: SiteVisitGuidanceKind;
  order?: number;
  text: string;
}

export const EMPTY_SITE_VISIT_GUIDANCE: SiteVisitGuidance = {
  cameraAngles: [],
  whatToVerify: [],
};

export function normalizeSiteVisitGuidance(
  guidance: Partial<SiteVisitGuidance> | undefined,
  fallback?: SiteVisitGuidance
): SiteVisitGuidance {
  const normalized = {
    cameraAngles: normalizeTextList(guidance?.cameraAngles),
    whatToVerify: normalizeTextList(guidance?.whatToVerify),
  };

  if (
    normalized.cameraAngles.length === 0 &&
    normalized.whatToVerify.length === 0 &&
    fallback
  ) {
    return normalizeSiteVisitGuidance(fallback);
  }

  return normalized;
}

export function guidanceToItems(
  guidance: Partial<SiteVisitGuidance> | undefined,
  fallback?: SiteVisitGuidance
): SiteVisitGuidanceItemInput[] {
  const normalized = normalizeSiteVisitGuidance(guidance, fallback);
  return [
    ...normalized.whatToVerify.map((text, order) => ({
      kind: "whatToVerify" as const,
      order,
      text,
    })),
    ...normalized.cameraAngles.map((text, order) => ({
      kind: "cameraAngle" as const,
      order,
      text,
    })),
  ];
}

export function guidanceItemsToGuidance(
  items: SiteVisitGuidanceItemInput[],
  fallback?: SiteVisitGuidance
): SiteVisitGuidance {
  const guidance = {
    cameraAngles: items
      .filter((item) => item.kind === "cameraAngle")
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((item) => item.text),
    whatToVerify: items
      .filter((item) => item.kind === "whatToVerify")
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((item) => item.text),
  };
  return normalizeSiteVisitGuidance(guidance, fallback);
}

export function defaultSiteVisitGuidance(
  milestoneKey: string,
  milestoneName: string,
  submilestones: string[] = []
): SiteVisitGuidance {
  const normalizedKey = `${milestoneKey} ${milestoneName}`.toLowerCase();

  if (normalizedKey.includes("framing")) {
    return {
      cameraAngles: [
        "Wide shot per elevation showing full frame.",
        "Close-up of straps, hold-downs, or hardware called out on plan.",
        "Header or king-stud detail at large openings.",
        "Roof from interior showing truss bottom chords and bridging.",
      ],
      whatToVerify: [
        "All exterior load-bearing walls erected, sheathed, and braced.",
        "Roof trusses set on bearing walls with hurricane strapping visible.",
        "Interior partition layout matches stamped plan revision.",
        "No daylight visible at sheathing seams or plate connections.",
      ],
    };
  }

  if (normalizedKey.includes("rough")) {
    return {
      cameraAngles: [
        "Wide mechanical-room overview before close-in.",
        "Close-up of pressure gauge or test stub.",
        "Representative electrical box height and alignment photos.",
        "Chase intersections showing no mechanical conflicts.",
      ],
      whatToVerify: [
        "Plumbing supply lines pressurized; gauge holding at test stub.",
        "DWV vent stack runs through to roof penetration.",
        "Electrical boxes set plumb at code-correct heights.",
        "No mechanical conflicts at chase intersections.",
      ],
    };
  }

  const checkpoints =
    submilestones.length > 0 ? submilestones : [`${milestoneName} scope`];
  return {
    cameraAngles: [
      "Wide shot showing the full milestone work area.",
      "Close-up of the highest-risk connection, fixture, or finish.",
      "Context photo tying completed work back to the stamped plan.",
    ],
    whatToVerify: checkpoints.slice(0, 4).map((checkpoint) => {
      return `${checkpoint} is complete, visible, and consistent with the approved scope.`;
    }),
  };
}

function normalizeTextList(value: string[] | undefined) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value ?? []) {
    const text = item.trim();
    if (!text || seen.has(text.toLowerCase())) {
      continue;
    }
    seen.add(text.toLowerCase());
    result.push(text);
  }
  return result;
}
