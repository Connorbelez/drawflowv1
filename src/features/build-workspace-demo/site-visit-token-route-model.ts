type UnavailableState = {
  reason?: "consumed" | "expired" | "not_found" | null;
  status: "completed" | "expired" | "invalid";
};

const OLD_BACKOFFICE_SITE_VISIT_ROUTE =
  /\/backoffice\/builds?\/([^/?#]+)\/newsitevisit\/([^/?#]+)/;
const NEW_SITE_VISIT_ROUTE = /\/newsitevisit\/([^/?#]+)\/([^/?#]+)/;

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
  if (value >= 1_000) {
    return `${trimDecimal(value / 1_000)} KB`;
  }
  return `${value} B`;
}

export function resolveSiteVisitUnavailableCopy(state: UnavailableState) {
  if (state.reason === "expired" || state.status === "expired") {
    return {
      body: "This one-hour token expired before submission. Ask the lender admin to generate a new tokenized link.",
      stamp: "TOKEN EXPIRED",
      title: "Visit window closed",
    };
  }
  if (state.reason === "consumed" || state.status === "completed") {
    return {
      body: "The token doesn't match an active site visit for this build, or has already been consumed.",
      stamp: "TOKEN INVALID",
      title: "Visit unavailable",
    };
  }
  return {
    body: "The token doesn't match an active site visit for this build, or has already been consumed.",
    stamp: "TOKEN INVALID",
    title: "Visit unavailable",
  };
}

function trimDecimal(value: number) {
  return value.toFixed(value >= 10 ? 0 : 1).replace(/\.0$/, "");
}
