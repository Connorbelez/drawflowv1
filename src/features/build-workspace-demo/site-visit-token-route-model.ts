type UnavailableState = {
  reason?: "consumed" | "expired" | "not_found" | null;
  status: "completed" | "expired" | "invalid";
};

const OLD_BACKOFFICE_SITE_VISIT_ROUTE =
  /\/backoffice\/builds?\/([^/?#]+)\/newsitevisit\/([^/?#]+)/;
const NEW_SITE_VISIT_ROUTE = /\/newsitevisit\/([^/?#]+)\/([^/?#]+)/;

export type SiteVisitLocationAttempt = {
  accuracyMeters?: number;
  attempted: boolean;
  attemptedAt?: number;
  failureReason?: string;
  permissionOutcome: "denied" | "granted" | "not_requested" | "unavailable";
  verified: boolean;
};

export function locationAttemptFromPosition(
  coords: { accuracy: number },
  attemptedAt: number
): SiteVisitLocationAttempt {
  return {
    accuracyMeters: Math.max(0, Math.round(coords.accuracy)),
    attempted: true,
    attemptedAt,
    permissionOutcome: "granted",
    verified: true,
  };
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
  return value.toFixed(value >= 10 ? 0 : 1).replace(/\.0$/, "");
}
