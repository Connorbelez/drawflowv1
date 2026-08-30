import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

import {
  backofficeMutation,
  backofficeQuery,
  builderMutation,
  builderQuery,
  destructiveWriteMutation,
} from "./authz";
import {
  createScopeDraft,
  loadBackofficeScopeHistory,
  loadBackofficeScopeRevisionContent,
  loadBuilderScopeHistory,
  loadBuilderScopeRevisionContent,
  publishScopeRevision,
  saveScopeDraft,
} from "./submilestone_scope_contracts/revisions";
import {
  acknowledgeScopeRevision,
  approveScopeRevision,
  overrideScopeRevision,
  rejectScopeRevision,
} from "./submilestone_scope_contracts/decisions";
import {
  attachSubmilestoneScopeBuildLineage,
  resolveEffectiveScopeRevisionForBuildSubmilestone,
} from "./submilestone_scope_contracts/shared";
import {
  publishSavedV1ScopeDraftsForProposal,
  upsertSubmilestoneScopeV1Draft,
} from "./submilestone_scope_contracts/revisions";

const scopeRevisionStatusValidator = v.union(
  v.literal("draft"),
  v.literal("published")
);

const scopeRevisionProjectionValidator = v.object({
  _id: v.id("submilestoneScopeRevisions"),
  version: v.number(),
  status: scopeRevisionStatusValidator,
  basedOnRevisionId: v.optional(v.id("submilestoneScopeRevisions")),
  authoredByWorkosUserId: v.string(),
  createdAt: v.number(),
  savedAt: v.number(),
  publishedByWorkosUserId: v.optional(v.string()),
  publishedAt: v.optional(v.number()),
  changeReason: v.optional(v.string()),
  isActiveDraft: v.boolean(),
  isEffective: v.boolean(),
});

const scopeRevisionContentValidator = v.object({
  _id: v.id("submilestoneScopeRevisions"),
  version: v.number(),
  status: scopeRevisionStatusValidator,
  scopeOfWorkTiptapJson: v.string(),
});

const scopeHistoryValidator = v.union(
  v.null(),
  v.object({
    contractId: v.id("submilestoneScopeContracts"),
    activeDraftRevisionId: v.optional(v.id("submilestoneScopeRevisions")),
    effectiveRevisionId: v.optional(v.id("submilestoneScopeRevisions")),
    latestVersion: v.number(),
    revisions: v.array(scopeRevisionProjectionValidator),
  })
);

// Builder-facing Scope reads deliberately use a separate projection.  The
// backoffice history projection may include the active draft pointer and draft
// rows, but those fields are private authoring state and must never cross the
// builder/borrower boundary.  Keep this validator explicit so a future field
// added to the internal history result cannot leak by object spreading.
const publishedScopeRevisionProjectionValidator = v.object({
  _id: v.id("submilestoneScopeRevisions"),
  version: v.number(),
  status: v.literal("published"),
  authoredByWorkosUserId: v.string(),
  authoredByDisplayName: v.string(),
  createdAt: v.number(),
  savedAt: v.number(),
  publishedByWorkosUserId: v.optional(v.string()),
  publishedAt: v.optional(v.number()),
  changeReason: v.optional(v.string()),
  isEffective: v.boolean(),
});

interface PublishedScopeRevisionProjection {
  _id: Id<"submilestoneScopeRevisions">;
  authoredByDisplayName: string;
  authoredByWorkosUserId: string;
  changeReason?: string;
  createdAt: number;
  isEffective: boolean;
  publishedAt?: number;
  publishedByWorkosUserId?: string;
  savedAt: number;
  status: "published";
  version: number;
}

const publishedScopeHistoryValidator = v.union(
  v.null(),
  v.object({
    effectiveRevisionId: v.optional(v.id("submilestoneScopeRevisions")),
    revisions: v.array(publishedScopeRevisionProjectionValidator),
  })
);

const publishedScopeRevisionContentValidator = v.object({
  _id: v.id("submilestoneScopeRevisions"),
  version: v.number(),
  status: v.literal("published"),
  scopeOfWorkTiptapJson: v.string(),
});


const scopeDecisionKindValidator = v.union(
  v.literal("borrower_acknowledged"),
  v.literal("borrower_rejected"),
  v.literal("lender_admin_approved"),
  v.literal("admin_override")
);

const bypassedScopeDecisionKindValidator = v.union(
  v.literal("borrower_acknowledged"),
  v.literal("borrower_rejected"),
  v.literal("lender_admin_approved")
);

const scopeDecisionResultValidator = v.object({
  decisionId: v.id("submilestoneScopeDecisions"),
  effectiveRevisionId: v.union(v.id("submilestoneScopeRevisions"), v.null()),
  kind: scopeDecisionKindValidator,
  replayed: v.boolean(),
});

const scopeOverrideResultValidator = v.object({
  bypassedDecisionKinds: v.array(bypassedScopeDecisionKindValidator),
  decisionId: v.id("submilestoneScopeDecisions"),
  effectiveRevisionId: v.union(v.id("submilestoneScopeRevisions"), v.null()),
  kind: v.literal("admin_override"),
  replayed: v.boolean(),
});


export {
  attachSubmilestoneScopeBuildLineage,
  publishSavedV1ScopeDraftsForProposal,
  resolveEffectiveScopeRevisionForBuildSubmilestone,
  upsertSubmilestoneScopeV1Draft,
};

export const getBuilderSubmilestoneScopeHistory = builderQuery
  .input({
    proposalSubmilestoneId: v.id("proposalSubmilestones"),
    workosOrganizationId: v.string(),
  })
  .returns(publishedScopeHistoryValidator)
  .handler(loadBuilderScopeHistory)
  .public();

export const getBuilderSubmilestoneScopeRevisionContent = builderQuery
  .input({
    revisionId: v.id("submilestoneScopeRevisions"),
    workosOrganizationId: v.string(),
  })
  .returns(publishedScopeRevisionContentValidator)
  .handler(loadBuilderScopeRevisionContent)
  .public();

export const getSubmilestoneScopeHistory = backofficeQuery
  .input({
    proposalSubmilestoneId: v.id("proposalSubmilestones"),
    workosOrganizationId: v.string(),
  })
  .returns(scopeHistoryValidator)
  .handler(loadBackofficeScopeHistory)
  .public();

export const getSubmilestoneScopeRevisionContent = backofficeQuery
  .input({
    revisionId: v.id("submilestoneScopeRevisions"),
    workosOrganizationId: v.string(),
  })
  .returns(scopeRevisionContentValidator)
  .handler(loadBackofficeScopeRevisionContent)
  .public();

export const createSubmilestoneScopeDraft = backofficeMutation
  .input({
    proposalSubmilestoneId: v.id("proposalSubmilestones"),
    basedOnRevisionId: v.optional(v.id("submilestoneScopeRevisions")),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("submilestoneScopeRevisions"))
  .handler(createScopeDraft)
  .public();

export const saveSubmilestoneScopeDraft = backofficeMutation
  .input({
    revisionId: v.id("submilestoneScopeRevisions"),
    scopeOfWorkTiptapJson: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(saveScopeDraft)
  .public();

export const publishSubmilestoneScopeRevision = backofficeMutation
  .input({
    revisionId: v.id("submilestoneScopeRevisions"),
    changeReason: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(publishScopeRevision)
  .public();

export const acknowledgeSubmilestoneScopeRevision = builderMutation
  .input({
    idempotencyKey: v.string(),
    revisionId: v.id("submilestoneScopeRevisions"),
    workosOrganizationId: v.string(),
  })
  .returns(scopeDecisionResultValidator)
  .handler(acknowledgeScopeRevision)
  .public();

export const rejectSubmilestoneScopeRevision = builderMutation
  .input({
    idempotencyKey: v.string(),
    reason: v.string(),
    revisionId: v.id("submilestoneScopeRevisions"),
    workosOrganizationId: v.string(),
  })
  .returns(scopeDecisionResultValidator)
  .handler(rejectScopeRevision)
  .public();

export const approveSubmilestoneScopeRevision = destructiveWriteMutation
  .input({
    idempotencyKey: v.string(),
    revisionId: v.id("submilestoneScopeRevisions"),
    workosOrganizationId: v.string(),
  })
  .returns(scopeDecisionResultValidator)
  .handler(approveScopeRevision)
  .public();

export const overrideSubmilestoneScopeRevision = destructiveWriteMutation
  .input({
    idempotencyKey: v.string(),
    reason: v.string(),
    revisionId: v.id("submilestoneScopeRevisions"),
    workosOrganizationId: v.string(),
  })
  .returns(scopeOverrideResultValidator)
  .handler(overrideScopeRevision)
  .public();
