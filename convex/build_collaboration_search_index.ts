import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import type { AuthorizedViewer } from "./authz";
import { resolveCurrentCollaborationPostReaderIds } from "./build_collaboration_access";
import {
  type BuildCollaborationRole,
  collaborationRoleTier,
} from "./build_collaboration_model";
import {
  buildSearchIndexText,
  loadAuthorizedPostCandidates,
  type SearchCandidate,
} from "./build_collaboration_search";
import { isDrawSystemPost } from "./build_collaboration_system_event_access";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_SEARCH_READERS_PER_POST = 500;
const MAX_SEARCH_RECORDS_PER_REBUILD = 10_000;
const SEARCH_ROLE_TIERS = [1, 2, 3, 4, 5] as const;
const FIRST_LINE_PATTERN = /\r?\n/u;

export interface BuildCollaborationSearchOwner {
  id: string;
  kind: SearchCandidate["ownerKind"];
}

export async function rebuildBuildCollaborationSearchRecordsForPost(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    postId: Id<"buildCollaborationPosts">;
  }
) {
  return await rebuildSearchRecords(ctx, input);
}

export async function rebuildBuildCollaborationSearchRecordsForOwner(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    owner: BuildCollaborationSearchOwner;
    postId: Id<"buildCollaborationPosts">;
  }
) {
  return await rebuildSearchRecords(ctx, input);
}

async function rebuildSearchRecords(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    owner?: BuildCollaborationSearchOwner;
    postId: Id<"buildCollaborationPosts">;
  }
) {
  const existing = input.owner
    ? await ctx.db
        .query("buildCollaborationSearchRecords")
        .withIndex("by_postId_and_ownerKind_and_ownerId", (query) =>
          query
            .eq("postId", input.postId)
            .eq("ownerKind", input.owner?.kind)
            .eq("ownerId", input.owner?.id)
        )
        .take(MAX_SEARCH_RECORDS_PER_REBUILD + 1)
    : await ctx.db
        .query("buildCollaborationSearchRecords")
        .withIndex("by_postId", (query) => query.eq("postId", input.postId))
        .take(MAX_SEARCH_RECORDS_PER_REBUILD + 1);
  if (existing.length > MAX_SEARCH_RECORDS_PER_REBUILD) {
    throw new Error(
      "Build collaboration search maintenance exceeded its bounded record limit."
    );
  }
  for (const record of existing) {
    await ctx.db.delete(record._id);
  }

  const post = await ctx.db.get(input.postId);
  if (!isActiveSearchPost(post, input.authorization)) {
    return { partitionCount: 0, recordCount: 0 };
  }
  const readers = await resolveSearchReaders(ctx, input.authorization, post);
  if (readers.length > MAX_SEARCH_READERS_PER_POST) {
    throw new Error(
      "Build collaboration search maintenance exceeded its bounded reader limit."
    );
  }
  const indexedAt = Date.now();
  let recordCount = 0;
  const insertCandidates = async (
    partitionKey: string,
    candidates: SearchCandidate[]
  ) => {
    for (const candidate of candidates) {
      recordCount += 1;
      if (recordCount > MAX_SEARCH_RECORDS_PER_REBUILD) {
        throw new Error(
          "Build collaboration search maintenance exceeded its bounded record limit."
        );
      }
      await insertSearchRecord(ctx, {
        authorization: input.authorization,
        candidate,
        indexedAt,
        partitionKey,
        post,
      });
    }
  };

  if (isDrawSystemPost(post)) {
    for (const reader of readers) {
      await insertCandidates(
        userPartition(reader.workosUserId),
        await candidatesForReader(ctx, input, post, reader, indexedAt)
      );
    }
    return { partitionCount: readers.length, recordCount };
  }

  const representative = [...readers].sort(
    (left, right) =>
      collaborationRoleTier(right.role) - collaborationRoleTier(left.role)
  )[0];
  if (!representative) {
    return { partitionCount: 0, recordCount: 0 };
  }
  const representativeCandidates = await candidatesForReader(
    ctx,
    input,
    post,
    representative,
    indexedAt
  );
  const tierCandidates = representativeCandidates
    .filter(
      (candidate) =>
        candidate.resultType !== "asset" && candidate.resultType !== "reference"
    )
    .map((candidate) =>
      redactReaderSpecificCandidate(candidate, representativeCandidates)
    );
  const tierPartitions = readableTierPartitions(post);
  for (const partitionKey of tierPartitions) {
    await insertCandidates(partitionKey, tierCandidates);
  }

  const explicitBelowFloorReaders = new Set(
    readers
      .filter(
        (reader) => collaborationRoleTier(reader.role) < post.audienceFloorTier
      )
      .map((reader) => reader.workosUserId)
  );
  let readerPartitionCount = 0;
  for (const reader of readers) {
    const candidates = await candidatesForReader(
      ctx,
      input,
      post,
      reader,
      indexedAt
    );
    const needsFullPartition = explicitBelowFloorReaders.has(
      reader.workosUserId
    );
    const readerSpecificCandidates = needsFullPartition
      ? candidates
      : candidates.filter(
          (candidate) =>
            candidate.resultType === "asset" ||
            candidate.resultType === "reference" ||
            candidate.hasAttachments ||
            candidate.entityKinds.length > 0
        );
    if (readerSpecificCandidates.length === 0) {
      continue;
    }
    readerPartitionCount += 1;
    await insertCandidates(
      userPartition(reader.workosUserId),
      readerSpecificCandidates
    );
  }
  return {
    partitionCount: tierPartitions.length + readerPartitionCount,
    recordCount,
  };
}

function isActiveSearchPost(
  post: Doc<"buildCollaborationPosts"> | null,
  authorization: ActiveBuildAuthorization
): post is Doc<"buildCollaborationPosts"> {
  return Boolean(
    post &&
      post.organizationId === authorization.organizationId &&
      post.brokerageId === authorization.brokerage._id &&
      post.buildId === authorization.build._id &&
      post.contentState === "active"
  );
}

async function resolveSearchReaders(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  post: Doc<"buildCollaborationPosts">
) {
  const readerIds = new Set(
    await resolveCurrentCollaborationPostReaderIds(ctx, authorization, post)
  );
  return authorization.participants
    .filter((participant) => readerIds.has(participant.workosUserId))
    .map((participant) => ({
      role: participant.role,
      workosUserId: participant.workosUserId,
    }))
    .sort((left, right) => left.workosUserId.localeCompare(right.workosUserId));
}

function readableTierPartitions(post: Doc<"buildCollaborationPosts">) {
  const minimumTier =
    post.audienceMode === "build_wide"
      ? 1
      : Math.max(1, post.audienceFloorTier);
  return SEARCH_ROLE_TIERS.filter((tier) => tier >= minimumTier).map(
    (tier) => `tier:${tier}`
  );
}

function userPartition(workosUserId: string) {
  return `user:${workosUserId}`;
}

async function candidatesForReader(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    owner?: BuildCollaborationSearchOwner;
  },
  post: Doc<"buildCollaborationPosts">,
  reader: { role: BuildCollaborationRole; workosUserId: string },
  indexedAt: number
) {
  return await loadAuthorizedPostCandidates(ctx as unknown as QueryCtx, {
    authorization: authorizationForSearchReader(input.authorization, reader),
    owner: input.owner,
    post,
    snapshotAt: indexedAt,
  });
}

function redactReaderSpecificCandidate(
  candidate: SearchCandidate,
  candidates: SearchCandidate[]
): SearchCandidate {
  let searchText = candidate.searchText;
  let title = candidate.title;
  for (const sensitive of candidates) {
    if (
      sensitive.ownerKind !== candidate.ownerKind ||
      sensitive.ownerId !== candidate.ownerId ||
      (sensitive.resultType !== "reference" && sensitive.resultType !== "asset")
    ) {
      continue;
    }
    searchText = removeSearchFragment(searchText, sensitive.title);
    searchText = removeSearchFragment(searchText, sensitive.searchText);
    title = removeSearchFragment(title, sensitive.title);
    title = removeSearchFragment(title, sensitive.searchText);
  }
  return {
    ...candidate,
    entityId: undefined,
    entityKind: undefined,
    entityKinds: [],
    hasAttachments: false,
    searchText,
    title:
      title.trim().split(FIRST_LINE_PATTERN)[0]?.slice(0, 120) ||
      `${candidate.resultType} update`,
  };
}

function removeSearchFragment(value: string, fragment: string) {
  const normalized = fragment.trim();
  if (!normalized) {
    return value;
  }
  return value.replaceAll(normalized, " ");
}

async function insertSearchRecord(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    candidate: SearchCandidate;
    indexedAt: number;
    partitionKey: string;
    post: Doc<"buildCollaborationPosts">;
  }
) {
  await ctx.db.insert("buildCollaborationSearchRecords", {
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    candidateJson: JSON.stringify(input.candidate),
    candidateKey: `${input.candidate.resultType}:${input.candidate.id}:${input.candidate.postId}`,
    contentState: "active",
    indexedAt: input.indexedAt,
    organizationId: input.authorization.organizationId,
    ownerId: input.candidate.ownerId,
    ownerKind: input.candidate.ownerKind,
    postId: input.post._id,
    readerPartitionKey: input.partitionKey,
    searchText: buildSearchIndexText(input.candidate.searchText),
    sourceUpdatedAt: input.candidate.updatedAt,
  });
}

function authorizationForSearchReader(
  authorization: ActiveBuildAuthorization,
  reader: { role: BuildCollaborationRole; workosUserId: string }
): ActiveBuildAuthorization {
  const viewer: AuthorizedViewer = {
    capability: "authenticated",
    email: authorization.participants.find(
      (participant) => participant.workosUserId === reader.workosUserId
    )?.displayName,
    organizationId: authorization.organizationId,
    roles: [reader.role === "homeowner" ? "member" : reader.role],
    subject: reader.workosUserId,
    tokenIdentifier: `build-collaboration-search:${reader.workosUserId}`,
  };
  return {
    ...authorization,
    effectiveRole: {
      role: reader.role,
      tier: collaborationRoleTier(reader.role),
    },
    roles: [reader.role],
    viewer,
  };
}
