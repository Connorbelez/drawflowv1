import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { stableContentHash } from "./build_collaboration_hash";
import type { BuildCollaborationRole } from "./build_collaboration_model";
import type { MutationCtx, QueryCtx } from "./types";

const MAX_ORGANIZATION_AUTHORITIES_PER_ROLE = 500;
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
  for (const authority of await resolveOrganizationSearchAuthorities(
    ctx,
    authorization.organizationId
  )) {
    readers.set(authority.workosUserId, authority);
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

export async function buildCollaborationOrganizationAuthorityFingerprint(
  ctx: QueryCtx | MutationCtx,
  organizationId: string
) {
  const authorities = await resolveOrganizationSearchAuthorities(
    ctx,
    organizationId
  );
  return stableContentHash(
    authorities
      .map((authority) => `${authority.workosUserId}:${authority.role}`)
      .join("|")
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

async function resolveOrganizationSearchAuthorities(
  ctx: QueryCtx | MutationCtx,
  organizationId: string
) {
  const [admins, principalBrokers] = await Promise.all([
    authorityMemberships(ctx, organizationId, "admin"),
    authorityMemberships(ctx, organizationId, "principal-broker"),
  ]);
  const authorities = new Map<string, BuildCollaborationSearchReader>();
  for (const authority of [...principalBrokers, ...admins]) {
    authorities.set(authority.workosUserId, {
      role: authority.role === "principal-broker" ? "principle-broker" : authority.role,
      workosUserId: authority.workosUserId,
    });
  }
  return [...authorities.values()].sort((left, right) =>
    left.workosUserId.localeCompare(right.workosUserId)
  );
}

async function authorityMemberships(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  roleSlug: "admin" | "principal-broker"
) {
  const authorities = await ctx.db
    .query("buildCollaborationSearchAuthorities")
    .withIndex("by_organizationId_and_role", (query) =>
      query.eq("organizationId", organizationId).eq("role", roleSlug)
    )
    .take(MAX_ORGANIZATION_AUTHORITIES_PER_ROLE + 1);
  if (authorities.length > MAX_ORGANIZATION_AUTHORITIES_PER_ROLE) {
    throw new Error(
      `Build collaboration search maintenance exceeded its bounded ${roleSlug} authority limit.`
    );
  }
  return authorities;
}
