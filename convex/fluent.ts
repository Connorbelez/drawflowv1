import type { Auth, UserIdentity } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { createBuilder } from "fluent-convex";
import { WithZod } from "fluent-convex/zod";
import { z } from "zod/v4";

import type { DataModel, Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./types";

export const fluent = createBuilder<DataModel>();

/**
 * The shared Proposal -> active Build lineage key used by canonical
 * Sub-milestone domains.  Domain helpers add their own owner-row lookup, but
 * the identity and tenant checks must remain identical across those domains.
 */
export interface ExactBuildLineageInput {
  brokerageId: Id<"brokerages">;
  organizationId: string;
  proposalId: Id<"buildProposals">;
  proposalSubmilestoneId: Id<"proposalSubmilestones">;
}

export interface ExactBuildLineageAttachmentInput
  extends ExactBuildLineageInput {
  buildId?: Id<"activeBuilds">;
  buildSubmilestoneId?: Id<"buildSubmilestones">;
}

export interface ExactBuildLineage {
  build: Doc<"activeBuilds">;
  buildSubmilestone: Doc<"buildSubmilestones">;
}

type BuildLineageOwner =
  | (Doc<"submilestoneScopeContracts"> & ExactBuildLineageAttachmentInput)
  | (Doc<"submilestoneFieldGuidance"> & ExactBuildLineageAttachmentInput);

export type ExactBuildLineageOwnerLookup = (
  ctx: MutationCtx,
  proposalSubmilestoneId: Id<"proposalSubmilestones">
) => Promise<BuildLineageOwner | null>;

type BuildLineageConflictReason =
  | "missing_build_proposal"
  | "missing_proposal_submilestone"
  | "cross_tenant_owner"
  | "missing_build"
  | "missing_build_milestone"
  | "conflicting_refs"
  | "duplicate_owner"
  | "fanout_limit_exceeded";

const BUILD_LINEAGE_CONFLICT_CODE = "SUBMILESTONE_BUILD_LINEAGE_CONFLICT";

function throwBuildLineageConflict(
  conflictMessage: string,
  reason: BuildLineageConflictReason
): never {
  throw new ConvexError({
    code: BUILD_LINEAGE_CONFLICT_CODE,
    message: conflictMessage,
    reason,
  });
}

async function requireBuildLineageProposalSubmilestone(
  ctx: MutationCtx,
  input: ExactBuildLineageInput,
  conflictMessage: string
): Promise<Doc<"proposalSubmilestones">> {
  const proposalSubmilestone = await ctx.db.get(input.proposalSubmilestoneId);
  if (!proposalSubmilestone) {
    throwBuildLineageConflict(conflictMessage, "missing_proposal_submilestone");
  }
  if (
    proposalSubmilestone.brokerageId !== input.brokerageId ||
    proposalSubmilestone.organizationId !== input.organizationId
  ) {
    throwBuildLineageConflict(conflictMessage, "cross_tenant_owner");
  }
  if (proposalSubmilestone.proposalId !== input.proposalId) {
    throwBuildLineageConflict(conflictMessage, "conflicting_refs");
  }
  return proposalSubmilestone;
}

async function requireBuildLineageProposal(
  ctx: MutationCtx,
  input: ExactBuildLineageInput,
  conflictMessage: string
): Promise<Doc<"buildProposals">> {
  const proposal = await ctx.db.get(input.proposalId);
  if (!proposal) {
    throwBuildLineageConflict(conflictMessage, "missing_build_proposal");
  }
  if (
    proposal.brokerageId !== input.brokerageId ||
    proposal.organizationId !== input.organizationId
  ) {
    throwBuildLineageConflict(conflictMessage, "cross_tenant_owner");
  }
  return proposal;
}

async function resolveBuildLineageOwner(
  ctx: MutationCtx,
  row: Doc<"buildSubmilestones">,
  proposalSubmilestone: Doc<"proposalSubmilestones">,
  input: ExactBuildLineageInput,
  conflictMessage: string
): Promise<ExactBuildLineage> {
  if (
    row.brokerageId !== input.brokerageId ||
    row.organizationId !== input.organizationId
  ) {
    throwBuildLineageConflict(conflictMessage, "cross_tenant_owner");
  }
  if (row.proposalSubmilestoneId !== input.proposalSubmilestoneId) {
    throwBuildLineageConflict(conflictMessage, "conflicting_refs");
  }

  const build = await ctx.db.get(row.buildId);
  if (!build) {
    throwBuildLineageConflict(conflictMessage, "missing_build");
  }
  if (
    build.brokerageId !== input.brokerageId ||
    build.organizationId !== input.organizationId
  ) {
    throwBuildLineageConflict(conflictMessage, "cross_tenant_owner");
  }
  if (build.proposalId !== input.proposalId) {
    throwBuildLineageConflict(conflictMessage, "conflicting_refs");
  }

  const buildMilestone = await ctx.db.get(row.buildMilestoneId);
  if (!buildMilestone) {
    throwBuildLineageConflict(conflictMessage, "missing_build_milestone");
  }
  if (
    buildMilestone.brokerageId !== input.brokerageId ||
    buildMilestone.organizationId !== input.organizationId
  ) {
    throwBuildLineageConflict(conflictMessage, "cross_tenant_owner");
  }
  if (
    buildMilestone.buildId !== build._id ||
    buildMilestone.proposalMilestoneId !==
      proposalSubmilestone.proposalMilestoneId
  ) {
    throwBuildLineageConflict(conflictMessage, "conflicting_refs");
  }

  return { build, buildSubmilestone: row };
}

/**
 * Resolve the single active-Build Sub-milestone for a Proposal
 * Sub-milestone.  This helper is deliberately fail-closed: a missing owner
 * is allowed before Build close, while a cross-tenant row, missing parent, or
 * duplicate owner is a lineage conflict.  Keep the indexed read bounded so a
 * corrupt or unexpectedly large lineage cannot turn an authoring mutation
 * into an unbounded read.
 */
export async function resolveExactBuildLineage(
  ctx: MutationCtx,
  input: ExactBuildLineageInput,
  conflictMessage: string
): Promise<ExactBuildLineage | null> {
  const proposalSubmilestone = await requireBuildLineageProposalSubmilestone(
    ctx,
    input,
    conflictMessage
  );
  await requireBuildLineageProposal(ctx, input, conflictMessage);

  const rows = await ctx.db
    .query("buildSubmilestones")
    .withIndex("by_proposalSubmilestoneId", (query) =>
      query.eq("proposalSubmilestoneId", input.proposalSubmilestoneId)
    )
    .take(501);
  if (rows.length > 500) {
    throwBuildLineageConflict(conflictMessage, "fanout_limit_exceeded");
  }

  const owners: ExactBuildLineage[] = [];
  for (const row of rows) {
    owners.push(
      await resolveBuildLineageOwner(
        ctx,
        row,
        proposalSubmilestone,
        input,
        conflictMessage
      )
    );
  }

  if (owners.length > 1) {
    throwBuildLineageConflict(conflictMessage, "duplicate_owner");
  }
  return owners[0] ?? null;
}

/**
 * Attach an existing canonical owner row to the exact active-Build owner.
 * Domain-specific content and audit fields remain untouched; only missing
 * Build references are patched.  The owner-row lookup is supplied by the
 * domain so Scope and Field Guidance cannot accidentally share a data row.
 */
export async function attachExactBuildLineage(
  ctx: MutationCtx,
  input: ExactBuildLineageAttachmentInput,
  options: {
    conflictMessage: string;
    findOwner: ExactBuildLineageOwnerLookup;
  }
): Promise<"missing" | "attached" | "already_attached"> {
  const owner = await resolveExactBuildLineage(
    ctx,
    input,
    options.conflictMessage
  );
  if (!owner) {
    return "missing";
  }

  if (
    (input.buildId !== undefined && input.buildId !== owner.build._id) ||
    (input.buildSubmilestoneId !== undefined &&
      input.buildSubmilestoneId !== owner.buildSubmilestone._id)
  ) {
    throwBuildLineageConflict(options.conflictMessage, "conflicting_refs");
  }

  const ownerRow = await options.findOwner(ctx, input.proposalSubmilestoneId);
  if (!ownerRow) {
    return "missing";
  }

  if (
    ownerRow.brokerageId !== input.brokerageId ||
    ownerRow.organizationId !== input.organizationId
  ) {
    throwBuildLineageConflict(options.conflictMessage, "cross_tenant_owner");
  }
  if (
    ownerRow.proposalId !== input.proposalId ||
    ownerRow.proposalSubmilestoneId !== input.proposalSubmilestoneId
  ) {
    throwBuildLineageConflict(options.conflictMessage, "conflicting_refs");
  }
  if (
    (ownerRow.buildId !== undefined && ownerRow.buildId !== owner.build._id) ||
    (ownerRow.buildSubmilestoneId !== undefined &&
      ownerRow.buildSubmilestoneId !== owner.buildSubmilestone._id)
  ) {
    throwBuildLineageConflict(options.conflictMessage, "conflicting_refs");
  }

  const patch: {
    buildId?: Id<"activeBuilds">;
    buildSubmilestoneId?: Id<"buildSubmilestones">;
  } = {};
  if (ownerRow.buildId === undefined) {
    patch.buildId = owner.build._id;
  }
  if (ownerRow.buildSubmilestoneId === undefined) {
    patch.buildSubmilestoneId = owner.buildSubmilestone._id;
  }
  if (Object.keys(patch).length > 0) {
    await ctx.db.patch(ownerRow._id, patch);
    return "attached";
  }
  return "already_attached";
}

export const todoValidator = v.object({
  _id: v.id("todos"),
  _creationTime: v.number(),
  text: v.string(),
  completed: v.boolean(),
});

const viewerValidator = v.object({
  tokenIdentifier: v.string(),
  issuer: v.string(),
  name: v.optional(v.string()),
  email: v.optional(v.string()),
});

interface Viewer {
  email?: string;
  issuer: string;
  name?: string;
  tokenIdentifier: string;
}

function toViewer(identity: UserIdentity): Viewer {
  const viewer: Viewer = {
    tokenIdentifier: identity.tokenIdentifier,
    issuer: identity.issuer,
  };

  if (identity.name) {
    viewer.name = identity.name;
  }
  if (identity.email) {
    viewer.email = identity.email;
  }

  return viewer;
}

export const requireIdentity = fluent
  .$context<{ auth: Auth }>()
  .createMiddleware(async (ctx, next) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    return next({
      ...ctx,
      viewer: toViewer(identity),
    });
  });

export function withQueryTiming(operation: string) {
  return fluent.query().createMiddleware(async (ctx, next) => {
    const startedAt = Date.now();
    try {
      return await next(ctx);
    } finally {
      console.info(
        `[convex] query ${operation} completed in ${Date.now() - startedAt}ms`
      );
    }
  });
}

export function withMutationTiming(operation: string) {
  return fluent.mutation().createMiddleware(async (ctx, next) => {
    const startedAt = Date.now();
    try {
      return await next(ctx);
    } finally {
      console.info(
        `[convex] mutation ${operation} completed in ${Date.now() - startedAt}ms`
      );
    }
  });
}

export function withActionTiming(operation: string) {
  return fluent.action().createMiddleware(async (ctx, next) => {
    const startedAt = Date.now();
    try {
      return await next(ctx);
    } finally {
      console.info(
        `[convex] action ${operation} completed in ${Date.now() - startedAt}ms`
      );
    }
  });
}

export const publicQuery = fluent.query();
export const publicMutation = fluent.mutation();
export const publicAction = fluent.action();
export const internalMutation = fluent.mutation();
export const internalQuery = fluent.query();
export const internalAction = fluent.action();

export const publicZodQuery = publicQuery.extend(WithZod);
export const publicZodMutation = publicMutation.extend(WithZod);
export const publicZodAction = publicAction.extend(WithZod);

export const authenticatedQuery = publicQuery.use(requireIdentity);
export const authenticatedMutation = publicMutation.use(requireIdentity);
export const authenticatedAction = publicAction.use(requireIdentity);

export const authenticatedZodQuery = authenticatedQuery.extend(WithZod);
export const authenticatedZodMutation = authenticatedMutation.extend(WithZod);
export const authenticatedZodAction = authenticatedAction.extend(WithZod);

const getViewer = authenticatedQuery
  .returns(viewerValidator)
  .handler(async (ctx) => ctx.viewer);

export const viewer = getViewer.use(withQueryTiming("fluent.viewer")).public();

const listRecentTodos = publicQuery
  .input({
    paginationOpts: paginationOptsValidator,
  })
  .returns(
    v.object({
      page: v.array(todoValidator),
      isDone: v.boolean(),
      continueCursor: v.string(),
    })
  )
  .handler(
    async (ctx, args) =>
      await ctx.db.query("todos").order("desc").paginate(args.paginationOpts)
  );

export const listTodosPage = listRecentTodos
  .use(withQueryTiming("fluent.listTodosPage"))
  .public();

export const listTodoTexts = publicZodQuery
  .use(withQueryTiming("fluent.listTodoTexts"))
  .input(
    z.object({
      limit: z.number().int().min(1).max(100),
    })
  )
  .returns(v.array(v.string()))
  .handler(async (ctx, args) => {
    const rows = await ctx.db.query("todos").order("desc").take(args.limit);

    return rows.map((todo) => todo.text);
  })
  .public();

export const addTodoForViewer = authenticatedZodMutation
  .use(withMutationTiming("fluent.addTodoForViewer"))
  .input(
    z.object({
      text: z.string().trim().min(1).max(280),
    })
  )
  .returns(v.id("todos"))
  .handler(async (ctx, args) => {
    console.info(
      `[convex] viewer ${ctx.viewer.tokenIdentifier} created a todo`
    );

    return await ctx.db.insert("todos", {
      text: args.text,
      completed: false,
    });
  })
  .public();

export const ping = publicZodAction
  .use(withActionTiming("fluent.ping"))
  .input(
    z.object({
      url: z.url(),
    })
  )
  .returns(
    v.object({
      ok: v.boolean(),
      status: v.number(),
    })
  )
  .handler(async (_ctx, args) => {
    const response = await fetch(args.url, { method: "HEAD" });

    return {
      ok: response.ok,
      status: response.status,
    };
  })
  .public();
