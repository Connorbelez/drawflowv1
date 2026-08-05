export function normalizeOperationalIdempotencyKey(
  value: string,
  label: string,
  maxLength = 240
) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${label} must be 1 to ${maxLength} characters.`);
  }
  return normalized;
}

export async function operationalRequestFingerprint(value: unknown) {
  const serialized = JSON.stringify(canonicalJsonValue(value));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serialized)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function evidenceLocationMateriallyChanged(
  persisted: {
    locationAccuracyMeters?: number;
    locationAttemptedAt?: number;
    locationDistanceMeters?: number;
    locationFailureReason?: string;
    locationGeofenceRadiusMeters?: number;
    locationVerified: boolean;
  },
  resolved: {
    accuracyMeters?: number;
    attemptedAt?: number;
    distanceMeters?: number;
    failureReason?: string;
    geofenceRadiusMeters?: number;
    verified: boolean;
  }
) {
  return (
    persisted.locationVerified !== resolved.verified ||
    persisted.locationAccuracyMeters !== resolved.accuracyMeters ||
    persisted.locationAttemptedAt !== resolved.attemptedAt ||
    persisted.locationDistanceMeters !== resolved.distanceMeters ||
    persisted.locationFailureReason !== resolved.failureReason ||
    persisted.locationGeofenceRadiusMeters !== resolved.geofenceRadiusMeters
  );
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalJsonValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalJsonValue(entry)])
    );
  }
  return value;
}
