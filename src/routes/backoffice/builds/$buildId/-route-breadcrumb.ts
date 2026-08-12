export type BuildRouteAvailabilityCategory =
  | "accessDenied"
  | "available"
  | "invalidLink"
  | "notFound";

export interface BuildRouteAvailability {
  category: BuildRouteAvailabilityCategory;
  requestedBuildId: string;
}

export interface BuildBreadcrumbDetail {
  build?: {
    buildName?: string | null;
  } | null;
}

export function resolveBuildBreadcrumbLabel({
  availability,
  detail,
}: {
  availability?: BuildRouteAvailability;
  detail: BuildBreadcrumbDetail | null | undefined;
}): string {
  if (detail === undefined) {
    return "Loading build…";
  }

  const buildName = detail?.build?.buildName?.trim();
  if (buildName) {
    return buildName;
  }

  if (availability?.category === "invalidLink") {
    return "Invalid build link";
  }

  if (availability?.category === "accessDenied") {
    return "Build unavailable";
  }

  if (availability?.category === "notFound") {
    return "Build unavailable";
  }

  return "Checking build access…";
}
