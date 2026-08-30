import { defineTable } from "convex/server";
import { v } from "convex/values";

import { proposalReviewPolicySnapshotValidator } from "../lender_portal_phase3";

export const schemaTables = {
  lenderOrganizationReviewPolicyVersions: defineTable({
    brokerageId: v.id("brokerages"),
    configuredAt: v.number(),
    configuredByRole: v.string(),
    configuredByWorkosUserId: v.string(),
    idempotencyKey: v.string(),
    lenderOrganizationId: v.id("lenderOrganizations"),
    policy: proposalReviewPolicySnapshotValidator,
    previousVersionId: v.optional(
      v.id("lenderOrganizationReviewPolicyVersions")
    ),
    reason: v.string(),
    version: v.number(),
  })
    .index("by_lender_organization_and_version", [
      "lenderOrganizationId",
      "version",
    ])
    .index("by_lender_organization_and_idempotency_key", [
      "lenderOrganizationId",
      "idempotencyKey",
    ])
    .index("by_brokerage_and_lender_organization", [
      "brokerageId",
      "lenderOrganizationId",
    ]),
};
