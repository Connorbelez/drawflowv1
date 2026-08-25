import { ConvexError } from "convex/values";

import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import { hasQuoteAuthoringRole } from "../quote_authoring_access";
import {
  getPreferredState,
  preferredPointerFromState,
} from "../quote_preferred";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";
import {
  assertScoped,
  loadPackageComparison,
  unavailable,
} from "./access";
import {
  candidateForInvitation,
  currentPreferredSummary,
  loadComparisonInvitations,
} from "./candidates";
import {
  MAX_HISTORY,
  MAX_INVITATIONS,
  MAX_PACKAGE_REVISION_LINEAGE,
} from "./contract";

function assertComparisonPackageRevisionScope(
  revision: Doc<"quotePackageRevisions">,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">
) {
  try {
    assertScoped(revision, authorization, round._id);
  } catch {
    throw new ConvexError("Quote Package Revision history is unavailable.");
  }
}

async function loadPackageRevisionRows(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">
) {
  const rows = await ctx.db
    .query("quotePackageRevisions")
    .withIndex("by_quoteRoundId_and_revision", (query) =>
      query.eq("quoteRoundId", round._id)
    )
    .order("asc")
    .take(MAX_HISTORY + 1);
  if (rows.length > MAX_HISTORY) {
    throw new ConvexError(
      "Quote Package Revision history exceeds comparison limits."
    );
  }
  for (const revision of rows) {
    assertComparisonPackageRevisionScope(revision, authorization, round);
  }
  return rows;
}

async function hydratePackageRevisionGraph(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  rows: Doc<"quotePackageRevisions">[]
) {
  const graphNodes = new Map(rows.map((revision) => [revision._id, revision]));
  const pending = [...rows];
  while (pending.length > 0) {
    const revision = pending.pop();
    if (!(revision && graphNodes.has(revision._id))) {
      continue;
    }
    const previousId = revision.previousPackageRevisionId;
    if (!previousId || graphNodes.has(previousId)) {
      continue;
    }
    const previous = await ctx.db.get(previousId);
    if (!previous) {
      throw new ConvexError("Quote Package Revision history is unavailable.");
    }
    assertComparisonPackageRevisionScope(previous, authorization, round);
    if (graphNodes.size >= MAX_PACKAGE_REVISION_LINEAGE) {
      throw new ConvexError(
        "Quote Package Revision history exceeds comparison limits."
      );
    }
    graphNodes.set(previous._id, previous);
    pending.push(previous);
  }
  return graphNodes;
}

function assertPackageRevisionChainTerminates(
  revision: Doc<"quotePackageRevisions">,
  graphNodes: Map<Id<"quotePackageRevisions">, Doc<"quotePackageRevisions">>
) {
  const visited = new Set<Id<"quotePackageRevisions">>();
  let cursor: Doc<"quotePackageRevisions"> | undefined = revision;
  for (let depth = 0; cursor; depth += 1) {
    if (visited.has(cursor._id)) {
      throw new ConvexError("Quote Package Revision history is unavailable.");
    }
    visited.add(cursor._id);
    if (!cursor.previousPackageRevisionId) {
      return;
    }
    if (depth >= MAX_PACKAGE_REVISION_LINEAGE - 1) {
      throw new ConvexError(
        "Quote Package Revision history exceeds comparison limits."
      );
    }
    cursor = graphNodes.get(cursor.previousPackageRevisionId);
    if (!cursor) {
      throw new ConvexError("Quote Package Revision history is unavailable.");
    }
  }
}

function assertPackageRevisionGraphIsLinear(
  graphNodes: Map<Id<"quotePackageRevisions">, Doc<"quotePackageRevisions">>
) {
  const childrenByParent = new Map<
    Id<"quotePackageRevisions">,
    Id<"quotePackageRevisions">[]
  >();
  for (const revision of graphNodes.values()) {
    if (!revision.previousPackageRevisionId) {
      continue;
    }
    const children =
      childrenByParent.get(revision.previousPackageRevisionId) ?? [];
    children.push(revision._id);
    if (children.length > 1) {
      throw new ConvexError("Quote Package Revision history is unavailable.");
    }
    childrenByParent.set(revision.previousPackageRevisionId, children);
  }
  for (const revision of graphNodes.values()) {
    assertPackageRevisionChainTerminates(revision, graphNodes);
  }
}

async function loadCurrentPackageRevisionChain(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  currentPackageRevision: Doc<"quotePackageRevisions">
) {
  const rows = await loadPackageRevisionRows(ctx, authorization, round);
  const graphNodes = await hydratePackageRevisionGraph(
    ctx,
    authorization,
    round,
    rows
  );
  assertPackageRevisionGraphIsLinear(graphNodes);
  const chain: Doc<"quotePackageRevisions">[] = [];
  const chainIds = new Set<Id<"quotePackageRevisions">>();
  let cursor: Doc<"quotePackageRevisions"> | undefined = graphNodes.get(
    currentPackageRevision._id
  );
  while (cursor) {
    if (chainIds.has(cursor._id)) {
      throw new ConvexError("Quote Package Revision history is unavailable.");
    }
    chainIds.add(cursor._id);
    chain.push(cursor);
    if (!cursor.previousPackageRevisionId) {
      break;
    }
    cursor = graphNodes.get(cursor.previousPackageRevisionId);
  }
  if (
    chain.length === 0 ||
    chain.length > MAX_PACKAGE_REVISION_LINEAGE ||
    chain.at(-1)?.previousPackageRevisionId
  ) {
    throw new ConvexError("Quote Package Revision history is unavailable.");
  }
  return { chain, rows };
}

export async function loadComparison(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  now: number,
  selectedPackageRevisionId?: Id<"quotePackageRevisions">
) {
  if (
    round.state === "draft" ||
    round.state === "cancelled" ||
    !round.currentPackageRevisionId
  ) {
    return unavailable(
      "Comparison is available only for an open or closed Quote Round with a package revision."
    );
  }
  const currentPackageRevision = await ctx.db.get(
    round.currentPackageRevisionId
  );
  if (!currentPackageRevision) {
    return unavailable("Current Quote Package Revision is unavailable.");
  }
  assertScoped(currentPackageRevision, authorization, round._id);
  const { chain: currentChain } = await loadCurrentPackageRevisionChain(
    ctx,
    authorization,
    round,
    currentPackageRevision
  );
  const currentChainIds = new Set(currentChain.map((revision) => revision._id));
  const packageRevision = selectedPackageRevisionId
    ? currentChain.find(
        (revision) => revision._id === selectedPackageRevisionId
      )
    : currentChain[0];
  if (!packageRevision) {
    return unavailable("Selected Quote Package Revision is unavailable.");
  }
  const packageRevisionHistory = [...currentChain].reverse();
  if (
    !currentChainIds.has(packageRevision._id) ||
    packageRevision._id !==
      (selectedPackageRevisionId ?? currentPackageRevision._id)
  ) {
    return unavailable("Selected Quote Package Revision is unavailable.");
  }
  const historical = packageRevision._id !== currentPackageRevision._id;
  const packageComparison = await loadPackageComparison(
    ctx,
    authorization,
    round,
    packageRevision
  );
  const invitations = await loadComparisonInvitations(
    ctx,
    authorization,
    round,
    packageRevision,
    now
  );
  const [activeInvitations, revokedInvitations] = await Promise.all([
    ctx.db
      .query("quoteRoundInvitations")
      .withIndex("by_quoteRoundId_and_participationState", (query) =>
        query.eq("quoteRoundId", round._id).eq("participationState", "active")
      )
      .take(MAX_INVITATIONS + 1),
    historical
      ? ctx.db
          .query("quoteRoundInvitations")
          .withIndex("by_quoteRoundId_and_participationState", (query) =>
            query
              .eq("quoteRoundId", round._id)
              .eq("participationState", "revoked")
          )
          .take(MAX_INVITATIONS + 1)
      : Promise.resolve([]),
  ]);
  const candidateInvitations = [...activeInvitations, ...revokedInvitations];
  if (candidateInvitations.length > MAX_INVITATIONS) {
    throw new ConvexError(
      "Quote Round has too many invitations for comparison."
    );
  }
  const candidates = (
    await Promise.all(
      candidateInvitations.map((invitation) =>
        candidateForInvitation(
          ctx,
          authorization,
          round,
          packageRevision,
          invitation,
          packageComparison,
          historical
        )
      )
    )
  ).filter(
    (candidate): candidate is NonNullable<typeof candidate> =>
      candidate !== null
  );
  const preferred = historical
    ? null
    : await currentPreferredSummary(ctx, round, packageRevision, authorization);
  const state = await getPreferredState(ctx, round._id);
  const canManagePreferred = hasQuoteAuthoringRole(authorization.roles);
  return {
    candidates,
    canClearPreferred:
      canManagePreferred &&
      Boolean(state && preferredPointerFromState(state)) &&
      !historical &&
      (round.state === "open" || round.state === "closed"),
    canSetPreferred:
      canManagePreferred &&
      !historical &&
      (round.state === "open" || round.state === "closed"),
    invitations,
    isHistoricalPackageRevision: historical,
    package: packageComparison,
    packageRevisionHistory: packageRevisionHistory.map((revision) => ({
      _id: revision._id,
      publishedAt: revision.publishedAt,
      responseDeadline: revision.responseDeadline,
      revision: revision.revision,
    })),
    preferred,
    round: {
      _id: round._id,
      mode: round.mode,
      revision: round.revision,
      state: round.state,
      title: round.title,
      updatedAt: round.updatedAt,
    },
    stateVersion: state?.stateVersion ?? 0,
    status: "available" as const,
  };
}
