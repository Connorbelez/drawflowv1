/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("auditEvents schema", () => {
  test("accepts canonical actor, capacity, Build, and revision fields", async () => {
    const t = convexTest(schema, modules);
    const auditEvent = await t.run(async (ctx) => {
      const now = Date.now();
      const brokerageId = await ctx.db.insert("brokerages", {
        createdAt: now,
        displayName: "Schema Contract Brokerage",
        legalName: "Schema Contract Brokerage Inc.",
        status: "active",
        updatedAt: now,
        workosOrganizationId: "org_audit_schema_contract",
      });
      const builderProfileId = await ctx.db.insert("builderProfiles", {
        brokerageId,
        createdAt: now,
        displayName: "Schema Contract Builder",
        legalName: "Schema Contract Builder Inc.",
        organizationId: "org_audit_schema_contract",
        status: "active",
        updatedAt: now,
      });
      const workflowRuleId = await ctx.db.insert("workflowRules", {
        allowPermitWaiverByRoles: ["admin"],
        brokerageId,
        createdAt: now,
        organizationId: "org_audit_schema_contract",
        proposalStates: ["draft", "submitted", "approved", "closed"],
        requirePermitForApproval: false,
        ruleKey: "schema-contract",
        settings: {},
        status: "active",
        updatedAt: now,
        version: 1,
      });
      const proposalId = await ctx.db.insert("buildProposals", {
        borrowerCoPayBps: 0,
        borrowerWorkingCapitalLimitCents: 0,
        brokerageId,
        buildName: "Schema Contract Build",
        builderProfileId,
        createdAt: now,
        createdByWorkosUserId: "user_audit_schema_contract",
        lenderDrawPolicyLimitCents: 0,
        location: "Schema Contract Address",
        organizationId: "org_audit_schema_contract",
        reviewOutcome: "none",
        status: "draft",
        totalBudgetCents: 0,
        updatedAt: now,
        updatedByWorkosUserId: "user_audit_schema_contract",
      });
      const workflowRuleSnapshotId = await ctx.db.insert(
        "workflowRuleSnapshots",
        {
          allowPermitWaiverByRoles: ["admin"],
          brokerageId,
          createdAt: now,
          organizationId: "org_audit_schema_contract",
          proposalId,
          proposalStates: ["draft", "submitted", "approved", "closed"],
          requirePermitForApproval: false,
          ruleKey: "schema-contract",
          settings: {},
          version: 1,
          workflowRuleId,
        },
      );
      const buildId = await ctx.db.insert("activeBuilds", {
        brokerageId,
        buildName: "Schema Contract Build",
        builderProfileId,
        createdAt: now,
        location: "Schema Contract Address",
        organizationId: "org_audit_schema_contract",
        proposalId,
        startDate: "2026-08-04",
        status: "active",
        totalBudgetCents: 0,
        updatedAt: now,
        workflowRuleSnapshotId,
      });

      const auditEventId = await ctx.db.insert("auditEvents", {
        actorKind: "human",
        actorRole: "admin",
        actorRoles: ["admin"],
        actorWorkosUserId: "user_audit_schema_contract",
        brokerageId,
        buildId,
        command: "schemaContractProbe",
        createdAt: now,
        effectiveCapacity: "admin",
        entityId: "entity_audit_schema_contract",
        entityType: "activeBuild",
        eventType: "audit.schema_contract.probed",
        newState: JSON.stringify({ state: "accepted" }),
        organizationId: "org_audit_schema_contract",
        targetRevisions: [
          {
            entityId: "entity_audit_schema_contract",
            entityType: "activeBuild",
            revision: 1,
          },
        ],
        warnings: [],
      });

      return await ctx.db.get(auditEventId);
    });

    expect(auditEvent).toMatchObject({
      actorKind: "human",
      actorRole: "admin",
      buildId: expect.any(String),
      effectiveCapacity: "admin",
      targetRevisions: [
        {
          entityId: "entity_audit_schema_contract",
          entityType: "activeBuild",
          revision: 1,
        },
      ],
    });
  });
});
