import { type Infer, v } from "convex/values";

export const lenderPortalPhase9MigrationCountsValidator = v.object({
  activeBuildCount: v.number(),
  approvalCount: v.number(),
  assignmentCount: v.number(),
  closingCount: v.number(),
  kanbanCardCount: v.number(),
  policyLockCount: v.number(),
  policyVersionCount: v.number(),
  projectionMismatchCount: v.number(),
  proposalCount: v.number(),
  proposalStatusCounts: v.object({
    approved: v.optional(v.number()),
    closed: v.optional(v.number()),
    draft: v.optional(v.number()),
    submitted: v.optional(v.number()),
  }),
  reconciliationCandidateCount: v.number(),
  reconciliationPendingCount: v.number(),
  reviewCycleCount: v.number(),
  revisionCount: v.number(),
});

export type LenderPortalPhase9MigrationCounts = Infer<
  typeof lenderPortalPhase9MigrationCountsValidator
>;
