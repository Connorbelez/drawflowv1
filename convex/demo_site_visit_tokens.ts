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
        "Site visit can only include current and previous milestones"
      );
    }
  }

  return uniqueKeys.sort(
    (left, right) =>
      milestoneOrder.indexOf(left) - milestoneOrder.indexOf(right)
  );
}

export interface SiteVisitLocationAttempt {
  accuracyMeters?: number;
  attempted: boolean;
  attemptedAt?: number;
  distanceMeters?: number;
  failureReason?: string;
  geofenceRadiusMeters?: number;
  latitude?: number;
  longitude?: number;
  permissionOutcome: "denied" | "granted" | "not_requested" | "unavailable";
  verified: boolean;
}

export const SITE_VISIT_GEOFENCE_RADIUS_METERS = 250;

export function resolveSiteVisitGeofenceAttempt({
  locationAttempt,
  siteLatitude,
  siteLongitude,
}: {
  locationAttempt: SiteVisitLocationAttempt;
  siteLatitude?: number;
  siteLongitude?: number;
}): SiteVisitLocationAttempt {
  if (locationAttempt.permissionOutcome !== "granted") {
    return { ...locationAttempt, verified: false };
  }
  if (
    typeof locationAttempt.latitude !== "number" ||
    typeof locationAttempt.longitude !== "number"
  ) {
    return {
      ...locationAttempt,
      failureReason:
        "Browser location permission was granted, but device coordinates were unavailable.",
      verified: false,
    };
  }
  if (typeof siteLatitude !== "number" || typeof siteLongitude !== "number") {
    return {
      ...locationAttempt,
      distanceMeters: undefined,
      failureReason:
        "The device location was recorded, but the Build has no site coordinates for geofence verification.",
      geofenceRadiusMeters: undefined,
      verified: false,
    };
  }

  const distanceMeters = Math.round(
    distanceBetweenCoordinatesMeters(
      {
        latitude: locationAttempt.latitude,
        longitude: locationAttempt.longitude,
      },
      { latitude: siteLatitude, longitude: siteLongitude }
    )
  );
  const accuracyMeters = Math.max(
    0,
    Math.round(locationAttempt.accuracyMeters ?? 0)
  );
  const verified =
    distanceMeters + accuracyMeters <= SITE_VISIT_GEOFENCE_RADIUS_METERS;
  const confidentlyOutside =
    distanceMeters - accuracyMeters > SITE_VISIT_GEOFENCE_RADIUS_METERS;
  return {
    ...locationAttempt,
    distanceMeters,
    ...(verified
      ? { failureReason: undefined }
      : {
          failureReason: confidentlyOutside
            ? `Device location is ${distanceMeters} m from the Build site, outside the ${SITE_VISIT_GEOFENCE_RADIUS_METERS} m geofence.`
            : `Device location accuracy overlaps the ${SITE_VISIT_GEOFENCE_RADIUS_METERS} m geofence boundary and requires lender review.`,
        }),
    geofenceRadiusMeters: SITE_VISIT_GEOFENCE_RADIUS_METERS,
    verified,
  };
}

function distanceBetweenCoordinatesMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number }
) {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = degreesToRadians(second.latitude - first.latitude);
  const longitudeDelta = degreesToRadians(second.longitude - first.longitude);
  const firstLatitude = degreesToRadians(first.latitude);
  const secondLatitude = degreesToRadians(second.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    earthRadiusMeters *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

export interface SiteVisitPrerequisiteException {
  acknowledged: boolean;
  reason: string;
}

export function validateSiteVisitReplacementRequest({
  reason,
  tokenState,
}: {
  reason: string;
  tokenState: "active" | "consumed" | "expired";
}) {
  if (tokenState === "active") {
    throw new Error(
      "Only expired or consumed site visits can request a new link."
    );
  }
  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    throw new Error("A replacement-link request reason is required.");
  }
  return { reason: normalizedReason, tokenState };
}

export function createSiteVisitRecoveryReference(randomValue: string) {
  return `SVR-${randomValue.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function validateSiteVisitSubmissionContext({
  locationAttempt,
  missingPrerequisites,
  prerequisiteException,
}: {
  locationAttempt: SiteVisitLocationAttempt;
  missingPrerequisites: Array<"permit" | "site_plan">;
  prerequisiteException?: SiteVisitPrerequisiteException;
}) {
  if (!locationAttempt.attempted) {
    throw new Error("A site location attempt is required.");
  }
  if (locationAttempt.attempted && !locationAttempt.attemptedAt) {
    throw new Error("Location attempt time is required.");
  }
  if (
    locationAttempt.verified &&
    locationAttempt.permissionOutcome !== "granted"
  ) {
    throw new Error("Verified location requires granted permission.");
  }
  if (!locationAttempt.verified && !locationAttempt.failureReason?.trim()) {
    throw new Error("An unverified location reason is required.");
  }

  const normalizedMissingPrerequisites = [...new Set(missingPrerequisites)];
  if (normalizedMissingPrerequisites.length > 0) {
    if (!prerequisiteException?.acknowledged) {
      throw new Error("A prerequisite exception acknowledgement is required.");
    }
    if (!prerequisiteException.reason.trim()) {
      throw new Error("A prerequisite exception reason is required.");
    }
  }

  return {
    locationAttempt: {
      ...locationAttempt,
      ...(locationAttempt.failureReason
        ? { failureReason: locationAttempt.failureReason.trim() }
        : {}),
    },
    missingPrerequisites: normalizedMissingPrerequisites,
    ...(normalizedMissingPrerequisites.length > 0 && prerequisiteException
      ? {
          prerequisiteException: {
            acknowledged: true,
            reason: prerequisiteException.reason.trim(),
          },
        }
      : {}),
  };
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
