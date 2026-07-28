interface UnavailableState {
  reason?: "consumed" | "expired" | "not_found" | null;
  status: "completed" | "expired" | "invalid";
}

const OLD_BACKOFFICE_SITE_VISIT_ROUTE =
  /\/backoffice\/builds?\/([^/?#]+)\/newsitevisit\/([^/?#]+)/;
const NEW_SITE_VISIT_ROUTE = /\/newsitevisit\/([^/?#]+)\/([^/?#]+)/;
const TRAILING_DECIMAL_ZERO = /\.0$/;

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

interface Coordinates {
  latitude: number;
  longitude: number;
}

export function locationAttemptFromPosition(
  coords: Coordinates & { accuracy: number },
  attemptedAt: number,
  siteCoordinates?: Coordinates | null
): SiteVisitLocationAttempt {
  const accuracyMeters = Math.max(0, Math.round(coords.accuracy));
  if (!siteCoordinates) {
    return {
      accuracyMeters,
      attempted: true,
      attemptedAt,
      failureReason:
        "The device location was recorded, but the Build has no site coordinates for geofence verification.",
      latitude: coords.latitude,
      longitude: coords.longitude,
      permissionOutcome: "granted",
      verified: false,
    };
  }
  const distanceMeters = Math.round(
    distanceBetweenCoordinatesMeters(coords, siteCoordinates)
  );
  const verified =
    distanceMeters + accuracyMeters <= SITE_VISIT_GEOFENCE_RADIUS_METERS;
  const confidentlyOutside =
    distanceMeters - accuracyMeters > SITE_VISIT_GEOFENCE_RADIUS_METERS;
  return {
    accuracyMeters,
    attempted: true,
    attemptedAt,
    distanceMeters,
    ...(verified
      ? {}
      : {
          failureReason: confidentlyOutside
            ? `Device location is ${distanceMeters} m from the Build site, outside the ${SITE_VISIT_GEOFENCE_RADIUS_METERS} m geofence.`
            : `Device location accuracy overlaps the ${SITE_VISIT_GEOFENCE_RADIUS_METERS} m geofence boundary and requires lender review.`,
        }),
    geofenceRadiusMeters: SITE_VISIT_GEOFENCE_RADIUS_METERS,
    latitude: coords.latitude,
    longitude: coords.longitude,
    permissionOutcome: "granted",
    verified,
  };
}

export function distanceBetweenCoordinatesMeters(
  first: Coordinates,
  second: Coordinates
): number {
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

export function locationAttemptFromError(
  error: { code: number },
  attemptedAt: number
): SiteVisitLocationAttempt {
  const denied = error.code === 1;
  return {
    attempted: true,
    attemptedAt,
    failureReason: denied
      ? "Browser location permission was denied."
      : "Browser location could not be verified.",
    permissionOutcome: denied ? "denied" : "unavailable",
    verified: false,
  };
}

export function buildSiteVisitTokenRoute({
  buildId,
  token,
}: {
  buildId: string;
  token: string;
}) {
  return `/newsitevisit/${encodeURIComponent(buildId)}/${encodeURIComponent(token)}`;
}

export function normalizeSiteVisitTokenRoute({
  buildId,
  token,
  url,
}: {
  buildId?: string;
  token?: string;
  url?: string;
}) {
  if (buildId && token) {
    return buildSiteVisitTokenRoute({ buildId, token });
  }

  const route = url?.match(NEW_SITE_VISIT_ROUTE);
  if (route?.[1] && route[2]) {
    return buildSiteVisitTokenRoute({
      buildId: decodeURIComponent(route[1]),
      token: decodeURIComponent(route[2]),
    });
  }

  const legacyRoute = url?.match(OLD_BACKOFFICE_SITE_VISIT_ROUTE);
  if (legacyRoute?.[1] && legacyRoute[2]) {
    return buildSiteVisitTokenRoute({
      buildId: decodeURIComponent(legacyRoute[1]),
      token: decodeURIComponent(legacyRoute[2]),
    });
  }

  return url;
}

export function formatSiteVisitBytes(value: number) {
  if (value >= 1_000_000_000) {
    return `${trimDecimal(value / 1_000_000_000)} GB`;
  }
  if (value >= 1_000_000) {
    return `${trimDecimal(value / 1_000_000)} MB`;
  }
  if (value >= 1000) {
    return `${trimDecimal(value / 1000)} KB`;
  }
  return `${value} B`;
}

export function resolveSiteVisitUnavailableCopy(state: UnavailableState) {
  if (state.reason === "expired" || state.status === "expired") {
    return {
      body: "This one-hour token expired before submission. Request a new link to preserve the Build and visit assignment.",
      canRequestReplacement: true,
      stamp: "TOKEN EXPIRED",
      title: "Visit window closed",
    };
  }
  if (state.reason === "consumed" || state.status === "completed") {
    return {
      body: "This site visit report was already submitted. The consumed token stays read-only; request a new link only if another visit is required.",
      canRequestReplacement: true,
      stamp: "TOKEN CONSUMED",
      title: "Site visit already complete",
    };
  }
  return {
    body: "This link does not match a site visit assigned to this Build. Return to the assignment or contact the requester for a valid link.",
    canRequestReplacement: false,
    stamp: "TOKEN INVALID",
    title: "Visit link unavailable",
  };
}

function trimDecimal(value: number) {
  return value.toFixed(value >= 10 ? 0 : 1).replace(TRAILING_DECIMAL_ZERO, "");
}
