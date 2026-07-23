import type { Auth } from "convex/server";

import { fluent } from "./fluent";
import type { Doc, Id, QueryCtx } from "./types";

/**
 * Contractor-specific authorization.
 *
 * Contractors are first-class participants in construction execution, but they
 * must never inherit builder/backoffice capabilities (PRD §5.1, §11.2). Full
 * Contractor Workspace access requires:
 *   1. an authenticated WorkOS identity,
 *   2. an active FairLendBrokerage membership,
 *   3. the WorkOS `contractor` role,
 *   4. a canonical contractor profile linked through
 *      `contractorProfiles.accountWorkosUserId === viewer.subject`.
 *
 * The role gate is provided by `requireContractor` in `authz.ts`. This module
 * layers the canonical-profile link on top, so contractor workspace functions
 * can rely on `ctx.contractorProfile` without re-resolving it, and callers
 * without a linked profile receive a deterministic forbidden error instead of
 * an empty workspace.
 */

export interface ContractorAuthContext {
  contractorProfile: Doc<"contractorProfiles">;
}

/**
 * Resolve the single active canonical contractor profile linked to a WorkOS
 * user inside FairLendBrokerage. Returns `null` when no profile is linked.
 *
 * Linking is performed by reviewed flows only (invite claim, self-service
 * approval, backoffice account link) — never by the contractor directly
 * (PRD §3.12, §6.1).
 */
export async function getContractorProfileByAccount(
  ctx: QueryCtx,
  workosUserId: string
): Promise<Doc<"contractorProfiles"> | null> {
  const profile = await ctx.db
    .query("contractorProfiles")
    .withIndex("by_account_user", (q) =>
      q.eq("accountWorkosUserId", workosUserId)
    )
    .first();
  return profile ?? null;
}

/**
 * Middleware that requires a linked canonical contractor profile and exposes
 * it as `ctx.contractorProfile`. Must run after a capability middleware that
 * sets `ctx.viewer` (e.g. `requireContractor`).
 *
 * Built with the same `.$context<{ auth: Auth }>()` pattern as the shared
 * capability middleware in `authz.ts`; the convex `db` reader is present on
 * every query/middleware chain at runtime, so it is threaded through to the
 * profile resolver. Throws `Forbidden: contractor profile not linked` when the
 * authenticated contractor role has no canonical profile linked to their
 * WorkOS user yet (PRD §11.2). The frontend surfaces this as the
 * onboarding/empty-resolution state rather than a partial workspace.
 */
export const requireContractorLinkedProfile = fluent
  .$context<{ auth: Auth }>()
  .createMiddleware(async (ctx, next) => {
    const viewer = (ctx as { viewer?: { subject?: string } }).viewer;
    const subject = viewer?.subject;
    if (!subject) {
      throw new Error("Unauthorized");
    }
    const contractorProfile = await getContractorProfileByAccount(
      ctx as unknown as QueryCtx,
      subject
    );
    if (!contractorProfile) {
      throw new Error("Forbidden: contractor profile not linked");
    }
    return next({ ...ctx, contractorProfile });
  });

export type { Id };
