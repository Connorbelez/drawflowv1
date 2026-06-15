export type SiteVisitGuidanceKind = "cameraAngle" | "whatToVerify";

export type SiteVisitGuidanceField = string | string[];

export interface SiteVisitGuidance {
  cameraAngles: string;
  whatToVerify: string;
}

export interface SiteVisitGuidanceItemInput {
  kind: SiteVisitGuidanceKind;
  order?: number;
  text: string;
}

export const SITE_VISIT_GUIDANCE_HTML_MAX_LENGTH = 16_384;

export const EMPTY_SITE_VISIT_GUIDANCE: SiteVisitGuidance = {
  cameraAngles: "",
  whatToVerify: "",
};

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

export function guidanceLinesToHtml(lines: string[]) {
  const items = lines.map((line) => line.trim()).filter(Boolean);
  if (items.length === 0) {
    return "";
  }
  if (items.length === 1 && looksLikeHtml(items[0] ?? "")) {
    return items[0] ?? "";
  }
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

export function coerceGuidanceField(
  value: SiteVisitGuidanceField | undefined
): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return guidanceLinesToHtml(value);
}

export function coerceSiteVisitGuidanceInput(
  guidance:
    | Partial<{
        cameraAngles: SiteVisitGuidanceField;
        whatToVerify: SiteVisitGuidanceField;
      }>
    | undefined
): SiteVisitGuidance {
  return {
    cameraAngles: coerceGuidanceField(guidance?.cameraAngles),
    whatToVerify: coerceGuidanceField(guidance?.whatToVerify),
  };
}

export function normalizeSiteVisitGuidance(
  guidance:
    | Partial<{
        cameraAngles: SiteVisitGuidanceField;
        whatToVerify: SiteVisitGuidanceField;
      }>
    | undefined,
  fallback?: SiteVisitGuidance
): SiteVisitGuidance {
  const normalized = coerceSiteVisitGuidanceInput(guidance);

  if (!(normalized.cameraAngles || normalized.whatToVerify) && fallback) {
    return normalizeSiteVisitGuidance(fallback);
  }

  return normalized;
}

export function guidanceHtmlExceedsMaxLength(guidance: SiteVisitGuidance) {
  return (
    guidance.cameraAngles.length > SITE_VISIT_GUIDANCE_HTML_MAX_LENGTH ||
    guidance.whatToVerify.length > SITE_VISIT_GUIDANCE_HTML_MAX_LENGTH
  );
}

export function guidanceToItems(
  guidance:
    | Partial<{
        cameraAngles: SiteVisitGuidanceField;
        whatToVerify: SiteVisitGuidanceField;
      }>
    | undefined,
  fallback?: SiteVisitGuidance
): SiteVisitGuidanceItemInput[] {
  const normalized = normalizeSiteVisitGuidance(guidance, fallback);
  const items: SiteVisitGuidanceItemInput[] = [];
  if (normalized.whatToVerify) {
    items.push({
      kind: "whatToVerify",
      order: 0,
      text: normalized.whatToVerify,
    });
  }
  if (normalized.cameraAngles) {
    items.push({
      kind: "cameraAngle",
      order: 0,
      text: normalized.cameraAngles,
    });
  }
  return items;
}

export function guidanceItemsToGuidance(
  items: SiteVisitGuidanceItemInput[],
  fallback?: SiteVisitGuidance
): SiteVisitGuidance {
  const whatToVerifyItems = items
    .filter((item) => item.kind === "whatToVerify")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const cameraAngleItems = items
    .filter((item) => item.kind === "cameraAngle")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const guidance = {
    whatToVerify:
      whatToVerifyItems.length === 1
        ? (whatToVerifyItems[0]?.text ?? "")
        : guidanceLinesToHtml(whatToVerifyItems.map((item) => item.text)),
    cameraAngles:
      cameraAngleItems.length === 1
        ? (cameraAngleItems[0]?.text ?? "")
        : guidanceLinesToHtml(cameraAngleItems.map((item) => item.text)),
  };

  return normalizeSiteVisitGuidance(guidance, fallback);
}

function defaultGuidanceListHtml(items: string[]) {
  return guidanceLinesToHtml(items);
}

export function defaultSiteVisitGuidance(
  milestoneKey: string,
  milestoneName: string,
  submilestones: string[] = []
): SiteVisitGuidance {
  const normalizedKey = `${milestoneKey} ${milestoneName}`.toLowerCase();

  if (normalizedKey.includes("framing")) {
    return {
      cameraAngles: defaultGuidanceListHtml([
        "Wide shot per elevation showing full frame.",
        "Close-up of straps, hold-downs, or hardware called out on plan.",
        "Header or king-stud detail at large openings.",
        "Roof from interior showing truss bottom chords and bridging.",
      ]),
      whatToVerify: defaultGuidanceListHtml([
        "All exterior load-bearing walls erected, sheathed, and braced.",
        "Roof trusses set on bearing walls with hurricane strapping visible.",
        "Interior partition layout matches stamped plan revision.",
        "No daylight visible at sheathing seams or plate connections.",
      ]),
    };
  }

  if (normalizedKey.includes("rough")) {
    return {
      cameraAngles: defaultGuidanceListHtml([
        "Wide mechanical-room overview before close-in.",
        "Close-up of pressure gauge or test stub.",
        "Representative electrical box height and alignment photos.",
        "Chase intersections showing no mechanical conflicts.",
      ]),
      whatToVerify: defaultGuidanceListHtml([
        "Plumbing supply lines pressurized; gauge holding at test stub.",
        "DWV vent stack runs through to roof penetration.",
        "Electrical boxes set plumb at code-correct heights.",
        "No mechanical conflicts at chase intersections.",
      ]),
    };
  }

  const checkpoints =
    submilestones.length > 0 ? submilestones : [`${milestoneName} scope`];
  return {
    cameraAngles: defaultGuidanceListHtml([
      "Wide shot showing the full milestone work area.",
      "Close-up of the highest-risk connection, fixture, or finish.",
      "Context photo tying completed work back to the stamped plan.",
    ]),
    whatToVerify: defaultGuidanceListHtml(
      checkpoints
        .slice(0, 4)
        .map(
          (checkpoint) =>
            `${checkpoint} is complete, visible, and consistent with the approved scope.`
        )
    ),
  };
}
