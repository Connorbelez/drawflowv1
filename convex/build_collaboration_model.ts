export const buildCollaborationRoles = [
  "admin",
  "principle-broker",
  "broker",
  "builder",
  "broker-staff",
  "builder-staff",
  "homeowner",
  "contractor",
] as const;

export type BuildCollaborationRole = (typeof buildCollaborationRoles)[number];

const ROLE_TIER: Record<BuildCollaborationRole, number> = {
  admin: 5,
  "principle-broker": 4,
  broker: 3,
  builder: 3,
  "broker-staff": 3,
  "builder-staff": 2,
  homeowner: 2,
  contractor: 1,
};

const ROLE_PRIORITY: Record<BuildCollaborationRole, number> = {
  admin: 8,
  "principle-broker": 7,
  broker: 6,
  builder: 5,
  "broker-staff": 4,
  "builder-staff": 3,
  homeowner: 2,
  contractor: 1,
};

const ROLE_ALIASES: Readonly<Record<string, BuildCollaborationRole>> = {
  admin: "admin",
  broker: "broker",
  "broker-staff": "broker-staff",
  broker_staff: "broker-staff",
  builder: "builder",
  "builder-staff": "builder-staff",
  builder_staff: "builder-staff",
  contractor: "contractor",
  homeowner: "homeowner",
  "principal-broker": "principle-broker",
  "principle-broker": "principle-broker",
};

export interface EffectiveCollaborationRole {
  role: BuildCollaborationRole;
  tier: number;
}

export interface CollaborationAudienceParticipant {
  active?: boolean;
  id: string;
  roles: readonly unknown[];
}

export type CollaborationAudienceResolution =
  | {
      conflictingMandatoryReaderIds: string[];
      status: "blocked";
    }
  | {
      excludedParticipantIds: string[];
      mandatoryReaderIds: string[];
      readerIds: string[];
      status: "allowed";
    };

export function normalizeBuildCollaborationRole(
  value: unknown
): BuildCollaborationRole | null {
  if (typeof value !== "string") {
    return null;
  }
  return ROLE_ALIASES[value.trim().toLowerCase().replace(/\s+/g, "-")] ?? null;
}

export function collaborationRoleTier(role: BuildCollaborationRole): number {
  return ROLE_TIER[role];
}

export function resolveEffectiveCollaborationRole(
  roles: readonly unknown[]
): EffectiveCollaborationRole | null {
  const normalized = [
    ...new Set(
      roles
        .map(normalizeBuildCollaborationRole)
        .filter((role): role is BuildCollaborationRole => role !== null)
    ),
  ];
  const role = normalized.sort(
    (left, right) =>
      ROLE_TIER[right] - ROLE_TIER[left] ||
      ROLE_PRIORITY[right] - ROLE_PRIORITY[left]
  )[0];
  return role ? { role, tier: ROLE_TIER[role] } : null;
}

/** Prefer Builder execution identity when dual-role (admin+builder) accounts act. */
export function preferredBuilderExecutionRole(
  roles: readonly unknown[]
): "builder" | "builder-staff" | "contractor" | null {
  const normalized = new Set(
    roles
      .map(normalizeBuildCollaborationRole)
      .filter((role): role is BuildCollaborationRole => role !== null)
  );
  if (normalized.has("builder")) {
    return "builder";
  }
  if (normalized.has("builder-staff")) {
    return "builder-staff";
  }
  if (normalized.has("contractor")) {
    return "contractor";
  }
  return null;
}

export function canExcludeCollaborationRole(
  authorRoles: readonly unknown[],
  targetRole: BuildCollaborationRole
): boolean {
  const author = resolveEffectiveCollaborationRole(authorRoles);
  return Boolean(author && collaborationRoleTier(targetRole) < author.tier);
}

export function canCreateCustomCollaborationAudience(
  roles: readonly unknown[]
): boolean {
  const role = resolveEffectiveCollaborationRole(roles)?.role;
  return Boolean(role && role !== "homeowner" && role !== "contractor");
}

export function resolveCollaborationAudience(input: {
  authorId: string;
  authorRoles: readonly unknown[];
  entityAllowedParticipantIds?: readonly string[];
  participants: readonly CollaborationAudienceParticipant[];
  requestedReaderIds: readonly string[];
}): CollaborationAudienceResolution {
  const author = resolveEffectiveCollaborationRole(input.authorRoles);
  if (!author) {
    return {
      conflictingMandatoryReaderIds: [input.authorId],
      status: "blocked",
    };
  }

  const activeParticipants = input.participants.filter(
    (participant) => participant.active !== false
  );
  const mandatoryReaderIds = activeParticipants
    .filter((participant) => {
      if (participant.id === input.authorId) {
        return true;
      }
      const role = resolveEffectiveCollaborationRole(participant.roles);
      return Boolean(role && role.tier >= author.tier);
    })
    .map((participant) => participant.id)
    .sort();
  if (!mandatoryReaderIds.includes(input.authorId)) {
    mandatoryReaderIds.push(input.authorId);
    mandatoryReaderIds.sort();
  }

  const selectedIds = new Set([
    ...mandatoryReaderIds,
    ...input.requestedReaderIds,
  ]);
  const entityAllowedIds = input.entityAllowedParticipantIds
    ? new Set(input.entityAllowedParticipantIds)
    : null;
  const conflictingMandatoryReaderIds = entityAllowedIds
    ? mandatoryReaderIds.filter(
        (participantId) => !entityAllowedIds.has(participantId)
      )
    : [];
  if (conflictingMandatoryReaderIds.length > 0) {
    return {
      conflictingMandatoryReaderIds,
      status: "blocked",
    };
  }

  const readerIds = [...selectedIds]
    .filter(
      (participantId) =>
        !entityAllowedIds || entityAllowedIds.has(participantId)
    )
    .sort();
  const excludedParticipantIds = [...selectedIds]
    .filter(
      (participantId) =>
        entityAllowedIds && !entityAllowedIds.has(participantId)
    )
    .sort();

  return {
    excludedParticipantIds,
    mandatoryReaderIds,
    readerIds,
    status: "allowed",
  };
}
