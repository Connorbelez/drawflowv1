export type DrawFlowAssistantRouteContext = {
  activeBuildId?: string;
  authDiagnostics: {
    hasOrganization: boolean;
    hasToken: boolean;
    hasUser: boolean;
    normalizedRoles: string[];
    roleCount: number;
  };
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
  selectedSubmilestoneKeys?: string[];
  selectedPanel?: string;
  userId?: string | null;
  workspace?: "backoffice" | "builder" | "builder-staff";
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
  token,
  userId,
}: {
  organizationId?: string | null;
  role?: string | null;
  roles?: string[];
  routerState: RouterStateLike;
  token?: string | null;
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
  // selectedSubmilestoneKeys is NOT URL-derived: it is conversational focus
  // merged from assistantPlanningFocus at turn-send time (see DrawFlowAssistant).
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
  const workspace = pathname.startsWith("/backoffice")
    ? "backoffice"
    : pathname.startsWith("/builder-staff")
      ? "builder-staff"
      : pathname.startsWith("/builder")
        ? "builder"
        : undefined;
  const normalizedRoles = [
    ...new Set(
      [role, ...(roles ?? [])]
        .map((item) =>
          typeof item === "string"
            ? item.trim().toLowerCase().replace(/\s+/g, "-")
            : null
        )
        .filter((item): item is string => Boolean(item))
    ),
  ];

  return {
    ...(activeBuildId ? { activeBuildId } : {}),
    authDiagnostics: {
      hasOrganization: Boolean(organizationId?.trim()),
      hasToken: Boolean(token),
      hasUser: Boolean(userId),
      normalizedRoles,
      roleCount: normalizedRoles.length,
    },
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
    ...(workspace ? { workspace } : {}),
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
