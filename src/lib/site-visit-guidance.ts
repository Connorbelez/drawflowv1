export type SiteVisitGuidanceHtml = {
  cameraAngles: string;
  whatToVerify: string;
};

export const EMPTY_SITE_VISIT_GUIDANCE_HTML: SiteVisitGuidanceHtml = {
  cameraAngles: "",
  whatToVerify: "",
};

export const SITE_VISIT_GUIDANCE_HTML_MAX_LENGTH = 16_384;

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
  value: string | string[] | undefined
): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return guidanceLinesToHtml(value);
}

export function coerceSiteVisitGuidance(
  guidance:
    | Partial<{
        cameraAngles: string | string[];
        whatToVerify: string | string[];
      }>
    | undefined,
  fallback?: SiteVisitGuidanceHtml
): SiteVisitGuidanceHtml {
  const normalized = {
    cameraAngles: coerceGuidanceField(guidance?.cameraAngles),
    whatToVerify: coerceGuidanceField(guidance?.whatToVerify),
  };

  if (
    !normalized.cameraAngles &&
    !normalized.whatToVerify &&
    fallback
  ) {
    return coerceSiteVisitGuidance(fallback);
  }

  return normalized;
}

export function isSiteVisitGuidanceHtmlEmpty(guidance: SiteVisitGuidanceHtml) {
  return !guidance.cameraAngles.trim() && !guidance.whatToVerify.trim();
}

export function guidanceHtmlExceedsMaxLength(guidance: SiteVisitGuidanceHtml) {
  return (
    guidance.cameraAngles.length > SITE_VISIT_GUIDANCE_HTML_MAX_LENGTH ||
    guidance.whatToVerify.length > SITE_VISIT_GUIDANCE_HTML_MAX_LENGTH
  );
}
