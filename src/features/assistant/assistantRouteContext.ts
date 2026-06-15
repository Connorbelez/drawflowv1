export type DrawFlowAssistantRouteContext = {
  activeBuildId?: string;
  calendarSurface?: "activeBuild" | "proposal";
  organizationId?: string | null;
  pathname: string;
  proposalId?: string;
  role?: string | null;
  roles: string[];
  routeId?: string;
  search: Record<string, unknown>;
  selectedCalendarEventId?: string;
  selectedDrawKey?: string;
  selectedMilestoneKey?: string;
  selectedPanel?: string;
  userId?: string | null;
};

type RouterStateLike = {
  location: {
    pathname: string;
    search?: Record<string, unknown>;
  };
  matches?: Array<{
    id?: string;
    params?: Record<string, string | undefined>;
    routeId?: string;
    search?: Record<string, unknown>;
  }>;
};

export function buildAssistantRouteContext({
  organizationId,
  role,
  roles,
  routerState,
  userId,
}: {
  organizationId?: string | null;
  role?: string | null;
  roles?: string[];
  routerState: RouterStateLike;
  userId?: string | null;
}): DrawFlowAssistantRouteContext {
  const matches = routerState.matches ?? [];
  const params = Object.assign(
    {},
    ...matches.map((match) => match.params ?? {})
  );
  const search = {
    ...(routerState.location.search ?? {}),
    ...Object.assign({}, ...matches.map((match) => match.search ?? {})),
  };
  const pathname = routerState.location.pathname;
  const proposalId = params.proposalId ?? params.planId;
  const activeBuildId = params.buildId;
  const selectedPanel = stringValue(search.tab ?? search.panel);
  const selectedCalendarEventId = stringValue(search.eventId);
  const selectedMilestoneKey = stringValue(
    search.milestoneKey ?? search.activeMilestoneKey
  );
  const selectedDrawKey = stringValue(search.drawKey ?? search.activeDrawId);
  const calendarSurface =
    selectedPanel === "calendar"
      ? activeBuildId
        ? "activeBuild"
        : proposalId
          ? "proposal"
          : undefined
      : undefined;

  return {
    ...(activeBuildId ? { activeBuildId } : {}),
    ...(calendarSurface ? { calendarSurface } : {}),
    organizationId,
    pathname,
    ...(proposalId ? { proposalId } : {}),
    role,
    roles: roles ?? [],
    routeId: matches.at(-1)?.routeId ?? matches.at(-1)?.id,
    search,
    ...(selectedCalendarEventId ? { selectedCalendarEventId } : {}),
    ...(selectedDrawKey ? { selectedDrawKey } : {}),
    ...(selectedMilestoneKey ? { selectedMilestoneKey } : {}),
    ...(selectedPanel ? { selectedPanel } : {}),
    userId,
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
