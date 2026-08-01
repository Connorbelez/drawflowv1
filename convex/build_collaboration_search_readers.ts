import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { normalizeRoleSlugs } from "./authz";
import { stableContentHash } from "./build_collaboration_hash";
import type { BuildCollaborationRole } from "./build_collaboration_model";
import type { MutationCtx, QueryCtx } from "./types";

const MAX_ORGANIZATION_MEMBERSHIPS = 500;
const MAX_SEARCH_READERS_PER_BUILD = 1000;

export interface BuildCollaborationSearchReader {
  role: BuildCollaborationRole;
  workosUserId: string;
}

export async function resolveBuildCollaborationSearchReaders(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  const readers = new Map<string, BuildCollaborationSearchReader>(
    authorization.participants
      .filter(
        (participant) =>
          !(
            authorization.viewer.actorKind === "system" &&
            participant.workosUserId === authorization.viewer.subject
          )
      )
      .map((participant) => [
        participant.workosUserId,
        {
          role: participant.role,
          workosUserId: participant.workosUserId,
        },
      ])
  );
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_organization", (query) =>
      query.eq("workosOrganizationId", authorization.organizationId)
    )
    .take(MAX_ORGANIZATION_MEMBERSHIPS + 1);
  if (memberships.length > MAX_ORGANIZATION_MEMBERSHIPS) {
    throw new Error(
      "Build collaboration search maintenance exceeded its bounded organization membership limit."
    );
  }
  for (const membership of memberships) {
    if (membership.status !== "active") {
      continue;
    }
    const roles = normalizeRoleSlugs([
      membership.roleSlug,
      ...(membership.roleSlugs ?? []),
    ]);
    const role = roles.includes("admin")
      ? "admin"
      : roles.includes("principle-broker")
        ? "principle-broker"
        : undefined;
    if (role) {
      readers.set(membership.workosUserId, {
        role,
        workosUserId: membership.workosUserId,
      });
    }
  }
  if (readers.size > MAX_SEARCH_READERS_PER_BUILD) {
    throw new Error(
      "Build collaboration search maintenance exceeded its bounded reader limit."
    );
  }
  return [...readers.values()].sort((left, right) =>
    left.workosUserId.localeCompare(right.workosUserId)
  );
}

export async function buildCollaborationSearchReaderFingerprint(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  const readers = await resolveBuildCollaborationSearchReaders(
    ctx,
    authorization
  );
  return stableContentHash(
    readers.map((reader) => `${reader.workosUserId}:${reader.role}`).join("|")
  );
}
