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
  const normalizedRoles = normalizeAssistantRoles(role, roles);

  return omitUndefined({
    activeBuildId,
    authDiagnostics: {
      hasOrganization: Boolean(organizationId?.trim()),
      hasToken: Boolean(token),
      hasUser: Boolean(userId),
      normalizedRoles,
      roleCount: normalizedRoles.length,
    },
    calendarSurface: resolveCalendarSurface(
      selectedPanel,
      activeBuildId,
      proposalId
    ),
    organizationId,
    pathname,
    proposalId,
    role,
    roles: roles ?? [],
    routeId: matches.at(-1)?.routeId ?? matches.at(-1)?.id,
    search,
    selectedCalendarEventId: stringValue(search.eventId),
    selectedDrawKey: stringValue(search.drawKey ?? search.activeDrawId),
    selectedMilestoneKey: stringValue(
      search.milestoneKey ?? search.activeMilestoneKey
    ),
    selectedPanel,
    userId,
    workspace: resolveAssistantWorkspace(pathname),
  });
}

function resolveAssistantWorkspace(pathname: string) {
  if (pathname.startsWith("/backoffice")) {
    return "backoffice" as const;
  }
  if (pathname.startsWith("/builder-staff")) {
    return "builder-staff" as const;
  }
  if (pathname.startsWith("/builder")) {
    return "builder" as const;
  }
  return;
}

function resolveCalendarSurface(
  selectedPanel: string | undefined,
  activeBuildId: string | undefined,
  proposalId: string | undefined
) {
  if (selectedPanel !== "calendar") {
    return;
  }
  if (activeBuildId) {
    return "activeBuild" as const;
  }
  return proposalId ? ("proposal" as const) : undefined;
}

function normalizeAssistantRoles(
  role?: string | null,
  roles?: string[]
): string[] {
  return [
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
}

function omitUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as T;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
