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
import { resolveBuildCollaborationSearchReaders } from "./build_collaboration_search_readers";
import { isDrawSystemPost } from "./build_collaboration_system_event_access";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_SEARCH_READERS_PER_POST = 1000;
const SEARCH_RECORD_BATCH_SIZE = 25;
const SEARCH_ROLE_TIERS = [1, 2, 3, 4, 5] as const;
const FIRST_LINE_PATTERN = /\r?\n/u;

export interface BuildCollaborationSearchOwner {
  id: string;
  kind: SearchCandidate["ownerKind"];
}

export async function materializeBuildCollaborationSearchTierRecords(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    jobId: Id<"buildCollaborationSearchJobs">;
    owner: BuildCollaborationSearchOwner;
    postId: Id<"buildCollaborationPosts">;
  }
) {
  const post = await ctx.db.get(input.postId);
  if (
    !isActiveSearchPost(post, input.authorization) ||
    isDrawSystemPost(post)
  ) {
    return 0;
  }
  const readers = await resolveSearchReaders(ctx, input.authorization, post);
  const representative = [...readers].sort(
    (left, right) =>
      collaborationRoleTier(right.role) - collaborationRoleTier(left.role)
  )[0];
  if (!representative) {
    return 0;
  }
  const indexedAt = Date.now();
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
  let count = 0;
  for (const partitionKey of readableTierPartitions(post)) {
    for (const candidate of tierCandidates) {
      await insertSearchRecord(ctx, {
        authorization: input.authorization,
        candidate,
        contentState: "retired",
        indexedAt,
        jobId: input.jobId,
        partitionKey,
        post,
      });
      count += 1;
    }
  }
  return count;
}

export async function materializeBuildCollaborationSearchReaderRecords(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    jobId: Id<"buildCollaborationSearchJobs">;
    owner: BuildCollaborationSearchOwner;
    postId: Id<"buildCollaborationPosts">;
    candidateOffset: number;
    readerOffset: number;
  }
) {
  const post = await ctx.db.get(input.postId);
  if (!isActiveSearchPost(post, input.authorization)) {
    return { done: true, nextReaderOffset: input.readerOffset };
  }
  const readers = await resolveSearchReaders(ctx, input.authorization, post);
  const reader = readers[input.readerOffset];
  if (!reader) {
    return {
      done: true,
      nextCandidateOffset: 0,
      nextReaderOffset: input.readerOffset,
    };
  }
  const indexedAt = Date.now();
  const candidates = await candidatesForReader(
    ctx,
    input,
    post,
    reader,
    indexedAt
  );
  const needsFullPartition =
    isDrawSystemPost(post) ||
    collaborationRoleTier(reader.role) < post.audienceFloorTier;
  const readerSpecificCandidates = needsFullPartition
    ? candidates
    : candidates.filter(
        (candidate) =>
          candidate.resultType === "asset" ||
          candidate.resultType === "reference" ||
          candidate.hasAttachments ||
          candidate.entityKinds.length > 0
      );
  const candidatePage = readerSpecificCandidates.slice(
    input.candidateOffset,
    input.candidateOffset + SEARCH_RECORD_BATCH_SIZE
  );
  for (const candidate of candidatePage) {
    await insertSearchRecord(ctx, {
      authorization: input.authorization,
      candidate,
      contentState: "retired",
      indexedAt,
      jobId: input.jobId,
      partitionKey: userPartition(reader.workosUserId),
      post,
    });
  }
  const readerDone =
    input.candidateOffset + candidatePage.length >=
    readerSpecificCandidates.length;
  const nextReaderOffset = readerDone
    ? input.readerOffset + 1
    : input.readerOffset;
  return {
    done: readerDone && nextReaderOffset >= readers.length,
    nextCandidateOffset: readerDone
      ? 0
      : input.candidateOffset + candidatePage.length,
    nextReaderOffset,
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

export async function resolveSearchReaders(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  post: Doc<"buildCollaborationPosts">
) {
  const readerIds = new Set(
    await resolveCurrentCollaborationPostReaderIds(ctx, authorization, post)
  );
  const buildReaders = await resolveBuildCollaborationSearchReaders(
    ctx,
    authorization
  );
  const readers = new Map(
    buildReaders
      .filter((participant) => readerIds.has(participant.workosUserId))
      .map(
        (participant) =>
          [
            participant.workosUserId,
            {
              role: participant.role,
              workosUserId: participant.workosUserId,
            },
          ] as const
      )
  );
  for (const reader of buildReaders) {
    if (reader.role === "admin" || reader.role === "principle-broker") {
      readers.set(reader.workosUserId, reader);
    }
  }
  if (readers.size > MAX_SEARCH_READERS_PER_POST) {
    throw new Error(
      "Build collaboration search maintenance exceeded its bounded reader limit."
    );
  }
  return [...readers.values()].sort((left, right) =>
    left.workosUserId.localeCompare(right.workosUserId)
  );
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
    contentState?: "active" | "retired";
    indexedAt: number;
    jobId?: Id<"buildCollaborationSearchJobs">;
    partitionKey: string;
    post: Doc<"buildCollaborationPosts">;
  }
) {
  await ctx.db.insert("buildCollaborationSearchRecords", {
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    candidateJson: JSON.stringify(input.candidate),
    candidateKey: `${input.candidate.resultType}:${input.candidate.id}:${input.candidate.postId}`,
    contentState: input.contentState ?? "active",
    indexedAt: input.indexedAt,
    maintenanceJobId: input.jobId,
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
    participants: authorization.participants.some(
      (participant) => participant.workosUserId === reader.workosUserId
    )
      ? authorization.participants
      : [
          ...authorization.participants,
          {
            displayName: reader.workosUserId,
            participationPeriod: 1,
            role: reader.role,
            source: "derived" as const,
            workosUserId: reader.workosUserId,
          },
        ],
    roles: [reader.role],
    viewer,
  };
}
