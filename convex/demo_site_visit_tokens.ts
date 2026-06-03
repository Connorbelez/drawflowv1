const TOKEN_BYTE_LENGTH = 32;
export const SITE_VISIT_COMPRESSED_PACKAGE_CAP_BYTES = 1_000_000_000;
export const SITE_VISIT_REPORT_NOTES_HTML_MAX_LENGTH = 16_384;

function toBase64Url(bytes: Uint8Array) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const chunk = (first << 16) | (second << 8) | third;

    output += alphabet[(chunk >> 18) & 63];
    output += alphabet[(chunk >> 12) & 63];
    if (index + 1 < bytes.length) {
      output += alphabet[(chunk >> 6) & 63];
    }
    if (index + 2 < bytes.length) {
      output += alphabet[chunk & 63];
    }
  }
  return output;
}

function toHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function generateSiteVisitToken() {
  const bytes = new Uint8Array(TOKEN_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function hashSiteVisitToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(new Uint8Array(digest));
}

export function siteVisitReportNotesPlainText(reportNotes: string) {
  return reportNotes
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export function normalizeSiteVisitReportNotes(reportNotes: string) {
  const normalized = reportNotes.trim();
  if (normalized.length > SITE_VISIT_REPORT_NOTES_HTML_MAX_LENGTH) {
    throw new Error("Site visit report notes exceed the rich-text limit.");
  }
  if (!siteVisitReportNotesPlainText(normalized)) {
    throw new Error("Site visit report notes are required.");
  }
  return normalized;
}

export function validateIncludedSiteVisitMilestones({
  includedMilestoneKeys,
  milestoneOrder,
  selectedMilestoneKey,
}: {
  includedMilestoneKeys: string[];
  milestoneOrder: string[];
  selectedMilestoneKey: string;
}) {
  const selectedIndex = milestoneOrder.indexOf(selectedMilestoneKey);
  if (selectedIndex === -1) {
    throw new Error("Selected milestone not found");
  }

  const uniqueKeys = [...new Set(includedMilestoneKeys)];
  if (!uniqueKeys.includes(selectedMilestoneKey)) {
    throw new Error("Selected milestone must be included");
  }

  for (const key of uniqueKeys) {
    const index = milestoneOrder.indexOf(key);
    if (index === -1) {
      throw new Error(`Included milestone not found: ${key}`);
    }
    if (index > selectedIndex) {
      throw new Error(
        "Site visit can only include current and previous milestones",
      );
    }
  }

  return uniqueKeys.sort(
    (left, right) =>
      milestoneOrder.indexOf(left) - milestoneOrder.indexOf(right),
  );
}

export function validateSiteVisitReportSubmission({
  compressedPackageBytes,
  reportNotes,
  uploadedEvidenceCount,
}: {
  compressedPackageBytes: number;
  reportNotes: string;
  uploadedEvidenceCount: number;
}) {
  if (compressedPackageBytes > SITE_VISIT_COMPRESSED_PACKAGE_CAP_BYTES) {
    throw new Error("Compressed site visit package exceeds the 1 GB cap.");
  }
  if (uploadedEvidenceCount < 1) {
    throw new Error("At least one uploaded evidence file is required.");
  }
  const normalizedReportNotes = normalizeSiteVisitReportNotes(reportNotes);
  return {
    compressedPackageBytes,
    reportNotes: normalizedReportNotes,
    reportNotesText: siteVisitReportNotesPlainText(normalizedReportNotes),
    uploadedEvidenceCount,
  };
}
