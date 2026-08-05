import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import type { AuthorizedViewer } from "./authz";
import { resolveCurrentCollaborationPostReaderIds } from "./build_collaboration_access";
import {
  type BuildCollaborationRole,
  collaborationRoleTier,
} from "./build_collaboration_model";
import {
  buildSearchIndexText,
  loadAuthorizedOwnerCandidatePage,
  type SearchCandidate,
  type SearchCandidateDiscoveryPhase,
} from "./build_collaboration_search";
import { resolveBuildCollaborationSearchReaders } from "./build_collaboration_search_readers";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_SEARCH_READERS_PER_POST = 1000;

export interface BuildCollaborationSearchOwner {
  id: string;
  kind: SearchCandidate["ownerKind"];
}

export async function materializeBuildCollaborationSearchReaderRecords(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    candidateCursor: string | null;
    candidatePhase: SearchCandidateDiscoveryPhase;
    jobId: Id<"buildCollaborationSearchJobs">;
    owner: BuildCollaborationSearchOwner;
    postId: Id<"buildCollaborationPosts">;
    readerOffset: number;
  }
) {
  const post = await ctx.db.get(input.postId);
  if (!isActiveSearchPost(post, input.authorization)) {
    return {
      done: true,
      nextCandidateCursor: null,
      nextCandidatePhase: "base" as const,
      nextReaderOffset: input.readerOffset,
    };
  }
  const readers = await resolveSearchReaders(ctx, input.authorization, post);
  const reader = readers[input.readerOffset];
  if (!reader) {
    return {
      done: true,
      nextCandidateCursor: null,
      nextCandidatePhase: "base" as const,
      nextReaderOffset: input.readerOffset,
    };
  }
  const indexedAt = Date.now();
  const page = await loadAuthorizedOwnerCandidatePage(
    ctx as unknown as QueryCtx,
    {
      authorization: authorizationForSearchReader(input.authorization, reader),
      cursor: input.candidateCursor,
      owner: input.owner,
      phase: input.candidatePhase,
      post,
      snapshotAt: indexedAt,
    }
  );
  for (const candidate of page.candidates) {
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
  const nextReaderOffset = page.done
    ? input.readerOffset + 1
    : input.readerOffset;
  return {
    done: page.done && nextReaderOffset >= readers.length,
    nextCandidateCursor: page.done ? null : page.continueCursor,
    nextCandidatePhase: page.done ? ("base" as const) : page.nextPhase,
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

function userPartition(workosUserId: string) {
  return `user:${workosUserId}`;
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
