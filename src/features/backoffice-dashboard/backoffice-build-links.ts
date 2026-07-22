export const BACKOFFICE_BUILD_WORKSPACE_SEARCH = {
  rail: "closed",
  tab: "details",
} as const;

const BACKOFFICE_BUILD_HREF_PATTERN = /^\/backoffice\/builds\/([^/?#]+)/;

export function backofficeBuildWorkspaceHref(buildKey: string) {
  const params = new URLSearchParams({
    rail: BACKOFFICE_BUILD_WORKSPACE_SEARCH.rail,
    tab: BACKOFFICE_BUILD_WORKSPACE_SEARCH.tab,
  });
  return `/backoffice/builds/${encodeURIComponent(buildKey)}?${params.toString()}`;
}

export function parseBackofficeBuildKeyFromHref(href: string) {
  const match = href.match(BACKOFFICE_BUILD_HREF_PATTERN);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
