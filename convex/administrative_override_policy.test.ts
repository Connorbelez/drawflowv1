/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import {
  appendGovernedAuditEvent,
  authorizeAdministrativeRecovery,
  maskRecipientEmailForAudit,
} from "./administrative_override_policy";
import type { ActorKind, RoleSlug } from "./authz";
import type { BuildCollaborationRole } from "./build_collaboration_model";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_administrative_override_policy";

function withIdentity(
  base: ReturnType<typeof convexTest>,
  roles: RoleSlug[],
  subject: string,
  organizationId = ORGANIZATION_ID,
  actorKind: ActorKind = "human"
) {
  return base.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
    "https://fairlend.ca/actor_kind": actorKind,
  } as never);
}

async function seedPolicyFixture() {
  const base = convexTest(schema, modules);
  const admin = withIdentity(base, ["admin", "principle-broker"], "policy-admin");
  const foundation = await admin.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORGANIZATION_ID }
  );
  const seeded = await base.run(async (ctx) => {
    const now = Date.now();
    const proposalId = await ctx.db.insert("buildProposals", {
      borrowerCoPayBps: 0,
      borrowerWorkingCapitalLimitCents: 25_000_000,
      brokerageId: foundation.brokerageId,
      buildName: "Administrative Recovery Fixture",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      createdByWorkosUserId: "policy-owner",
      lenderDrawPolicyLimitCents: 50_000_000,
      location: "147 Cedar Ridge Road, Toronto, ON",
      organizationId: ORGANIZATION_ID,
      reviewOutcome: "approved",
      status: "approved",
      totalBudgetCents: 125_000_000,
      updatedAt: now,
      updatedByWorkosUserId: "policy-owner",
    });
    const workflowRuleSnapshotId = await ctx.db.insert("workflowRuleSnapshots", {
      allowPermitWaiverByRoles: ["admin"],
      brokerageId: foundation.brokerageId,
      createdAt: now,
      organizationId: ORGANIZATION_ID,
      proposalId,
      proposalStates: ["approved"],
      requirePermitForApproval: false,
      ruleKey: "administrative-recovery-policy",
      settings: {},
      version: 1,
      workflowRuleId: foundation.workflowRuleId,
    });
    const buildId = await ctx.db.insert("activeBuilds", {
      brokerageId: foundation.brokerageId,
      buildName: "Administrative Recovery Fixture",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      location: "147 Cedar Ridge Road, Toronto, ON",
      organizationId: ORGANIZATION_ID,
      proposalId,
      startDate: "2026-08-03",
      status: "active",
      totalBudgetCents: 125_000_000,
      updatedAt: now,
      workflowRuleSnapshotId,
    });
    await ctx.db.patch(proposalId, { activeBuildId: buildId, workflowRuleSnapshotId });
    const quoteRoundId = await ctx.db.insert("quoteRounds", {
      brokerageId: foundation.brokerageId,
      buildId,
      closedAt: now,
      closedByWorkosUserId: "policy-owner",
      closeReason: "Ready for a governed revision.",
      createdAt: now,
      createdByWorkosUserId: "policy-owner",
      mode: "combined",
      organizationId: ORGANIZATION_ID,
      proposalId,
      revision: 4,
      state: "closed",
      title: "Governed quote recovery",
      updatedAt: now,
    });
    return {
      brokerageId: foundation.brokerageId,
      buildId,
      builderProfileId: foundation.builderProfileId,
      proposalId,
      quoteRoundId,
    };
  });
  return { admin, base, ...seeded };
}

function authorization(
  documents: {
    brokerage: NonNullable<Awaited<ReturnType<any>>>;
    build: NonNullable<Awaited<ReturnType<any>>>;
    proposal: NonNullable<Awaited<ReturnType<any>>>;
  },
  input: {
    actorKind?: ActorKind;
    capacity: BuildCollaborationRole;
    roles?: RoleSlug[];
    subject: string;
  }
) {
  return {
    brokerage: documents.brokerage,
    build: documents.build,
    effectiveRole: { role: input.capacity, tier: 0 },
    organizationId: ORGANIZATION_ID,
    participants: [],
    proposal: documents.proposal,
    roles: [input.capacity],
    viewer: {
      actorKind: input.actorKind ?? "human",
      capability: "authenticated",
      organizationId: ORGANIZATION_ID,
      roles: input.roles ?? ["member"],
      subject: input.subject,
      tokenIdentifier: `policy:${input.subject}`,
    },
  } as ActiveBuildAuthorization;
}

async function policyDocuments(
  ctx: any,
  fixture: Awaited<ReturnType<typeof seedPolicyFixture>>
) {
  const [brokerage, build, proposal] = await Promise.all([
    ctx.db.get(fixture.brokerageId),
    ctx.db.get(fixture.buildId),
    ctx.db.get(fixture.proposalId),
  ]);
  if (!(brokerage && build && proposal)) {
    throw new Error("Expected the administrative policy fixture.");
  }
  return { brokerage, build, proposal };
}

async function protectedDomainCounts(
  ctx: any,
  buildId: Id<"activeBuilds">
) {
  return {
    budgetRevisions: (
      await ctx.db
        .query("activeBuildBudgetRevisionRequests")
        .withIndex("by_build", (query: any) => query.eq("buildId", buildId))
        .collect()
    ).length,
    buildDocuments: (
      await ctx.db.query("buildDocuments").collect()
    ).filter((document: any) => document.buildId === buildId).length,
    contractorAssignments: (
      await ctx.db.query("buildContractorAssignments").collect()
    ).filter((assignment: any) => assignment.buildId === buildId).length,
    costDocuments: (
      await ctx.db.query("costDocuments").collect()
    ).filter((document: any) => document.buildId === buildId).length,
    drawRequests: (
      await ctx.db
        .query("activeBuildDrawRequests")
        .withIndex("by_build", (query: any) => query.eq("buildId", buildId))
        .collect()
    ).length,
    milestones: (
      await ctx.db
        .query("buildMilestones")
        .withIndex("by_build", (query: any) => query.eq("buildId", buildId))
        .collect()
    ).length,
    packageRevisions: (
      await ctx.db.query("quotePackageRevisions").collect()
    ).filter((revision: any) => revision.buildId === buildId).length,
    plannedDraws: (
      await ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build", (query: any) => query.eq("buildId", buildId))
        .collect()
    ).length,
    responseRevisions: (
      await ctx.db
        .query("quoteInvitationResponseSubmissionRevisions")
        .collect()
    ).filter((revision: any) => revision.buildId === buildId).length,
  };
}

describe("ENG-401 administrative audit and recovery policy", () => {
  test("allows only Builder Owner, explicitly Build-granted Builder Staff, and confirmed human Brokerage Admin break-glass", async () => {
    const fixture = await seedPolicyFixture();
    await fixture.base.run(async (ctx) => {
      const documents = await policyDocuments(ctx, fixture);
      const owner = authorization(documents, {
        capacity: "builder",
        roles: ["builder"],
        subject: "policy-owner",
      });
      await expect(
        authorizeAdministrativeRecovery(ctx as any, owner, {
          reason: "Correct a recipient without changing the submitted response.",
        })
      ).resolves.toMatchObject({ breakGlass: false });

      const staff = authorization(documents, {
        capacity: "builder-staff",
        roles: ["builder-staff"],
        subject: "policy-staff",
      });
      await expect(
        authorizeAdministrativeRecovery(ctx as any, staff, {
          reason: "Retry the failed delivery.",
        })
      ).rejects.toThrow(/explicit Build update grant/i);
      const staffLinkId = await ctx.db.insert("builderAccountLinks", {
        brokerageId: fixture.brokerageId,
        builderProfileId: fixture.builderProfileId,
        createdAt: Date.now(),
        role: "staff",
        status: "active",
        updatedAt: Date.now(),
        workosUserId: "policy-staff",
      });
      await ctx.db.insert("builderStaffPermissionGrants", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        builderAccountLinkId: staffLinkId,
        builderProfileId: fixture.builderProfileId,
        canCreate: false,
        canDelete: false,
        canUpdate: true,
        canView: true,
        createdAt: Date.now(),
        createdByWorkosUserId: "policy-owner",
        organizationId: ORGANIZATION_ID,
        resourceType: "draw",
        scope: "activeBuild",
        updatedAt: Date.now(),
        updatedByWorkosUserId: "policy-owner",
        workosUserId: "policy-staff",
      });
      await expect(
        authorizeAdministrativeRecovery(ctx as any, staff, {
          reason: "Retry the failed delivery.",
        })
      ).resolves.toMatchObject({ breakGlass: false });

      const admin = authorization(documents, {
        capacity: "admin",
        roles: ["admin"],
        subject: "policy-admin",
      });
      await expect(
        authorizeAdministrativeRecovery(ctx as any, admin, {
          reason: "Emergency correction.",
        })
      ).rejects.toThrow(/break-glass confirmation/i);
      await expect(
        authorizeAdministrativeRecovery(ctx as any, admin, {
          breakGlassConfirmed: true,
          reason: "   ",
        })
      ).rejects.toThrow(/reason/i);
      await expect(
        authorizeAdministrativeRecovery(ctx as any, admin, {
          breakGlassConfirmed: true,
          reason: "x".repeat(4001),
        })
      ).rejects.toThrow(/4000 characters or fewer/i);
      await expect(
        authorizeAdministrativeRecovery(ctx as any, admin, {
          breakGlassConfirmed: true,
          reason: "Recover an expired invitation after owner escalation.",
        })
      ).resolves.toMatchObject({ breakGlass: true });

      for (const forbidden of [
        authorization(documents, {
          capacity: "homeowner",
          subject: "policy-homeowner",
        }),
        authorization(documents, {
          capacity: "contractor",
          roles: ["contractor"],
          subject: "policy-contractor",
        }),
        authorization(documents, {
          capacity: "broker",
          roles: ["broker"],
          subject: "policy-lender",
        }),
        authorization(documents, {
          capacity: "broker-staff",
          roles: ["broker-staff"],
          subject: "policy-lender-staff",
        }),
        authorization(documents, {
          actorKind: "agent",
          capacity: "builder",
          roles: ["builder"],
          subject: "policy-agent",
        }),
      ]) {
        await expect(
          authorizeAdministrativeRecovery(ctx as any, forbidden, {
            reason: "Forbidden administrative override.",
          })
        ).rejects.toThrow(/Forbidden|human actor/i);
      }
    });
  });

  test("appends exact privacy-minimized immutable history and never mutates Budget, Cost, Milestone, Draw, or release state", async () => {
    const fixture = await seedPolicyFixture();
    await fixture.base.run(async (ctx) => {
      const documents = await policyDocuments(ctx, fixture);
      const owner = authorization(documents, {
        capacity: "builder",
        roles: ["builder"],
        subject: "policy-owner",
      });
      const before = await protectedDomainCounts(ctx, fixture.buildId);
      expect(maskRecipientEmailForAudit("Corrected.Recipient@Example.com")).toBe(
        "c******@example.com"
      );
      expect(maskRecipientEmailForAudit("x@example.com")).toBe(
        "***@example.com"
      );
      const firstAuditId = await appendGovernedAuditEvent(ctx, owner, {
        command: "replaceQuoteRoundInvitationEmail",
        drawFlowCorrelationId: "df-correlation-401",
        entityId: String(fixture.quoteRoundId),
        entityType: "quoteRound",
        eventType: "quote_round.invitation_recipient_replaced",
        newState: {
          canonicalTotalCents: 12_345_67,
          dedupeKey: "audit-dedupe-401",
          idempotencyKey: "audit-idempotency-401",
          recipientEmail: "Corrected.Recipient@Example.com",
          revision: 5,
          state: "open",
        },
        now: 1_786_000_000_000,
        overrideKind: "corrected_recipient_replacement",
        priorState: {
          canonicalTotalCents: 12_345_67,
          recipientEmail: "Original.Recipient@Example.com",
          revision: 4,
          state: "closed",
        },
        providerCorrelationId: "provider-correlation-401",
        reason: "Correct a mistyped recipient after Builder Owner verification.",
        targetRevisions: [
          {
            entityId: String(fixture.quoteRoundId),
            entityType: "quoteRound",
            revision: 4,
          },
          {
            entityId: "submission-revision-2",
            entityType: "quoteInvitationResponseSubmissionRevision",
            revision: 2,
          },
        ],
      });
      const firstSnapshot = await ctx.db.get(firstAuditId);
      await appendGovernedAuditEvent(ctx, owner, {
        command: "appendCorrectionHistory",
        entityId: String(fixture.quoteRoundId),
        entityType: "quoteRound",
        eventType: "quote_round.correction_appended",
        newState: { revision: 6, state: "open" },
        now: 1_786_000_000_001,
        priorState: { revision: 5, state: "open" },
        reason: "Append a correction without rewriting prior history.",
        targetRevisions: [
          {
            entityId: String(fixture.quoteRoundId),
            entityType: "quoteRound",
            revision: 5,
          },
        ],
      });

      const history = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query
            .eq("entityType", "quoteRound")
            .eq("entityId", String(fixture.quoteRoundId))
        )
        .collect();
      expect(history).toHaveLength(2);
      expect(await ctx.db.get(firstAuditId)).toEqual(firstSnapshot);
      expect(firstSnapshot).toMatchObject({
        actorKind: "human",
        actorRole: "builder",
        actorWorkosUserId: "policy-owner",
        buildId: fixture.buildId,
        createdAt: 1_786_000_000_000,
        drawFlowCorrelationId: "df-correlation-401",
        effectiveCapacity: "builder",
        organizationId: ORGANIZATION_ID,
        providerCorrelationId: "provider-correlation-401",
        overrideKind: "corrected_recipient_replacement",
        targetRevisions: [
          {
            entityId: String(fixture.quoteRoundId),
            entityType: "quoteRound",
            revision: 4,
          },
          {
            entityId: "submission-revision-2",
            entityType: "quoteInvitationResponseSubmissionRevision",
            revision: 2,
          },
        ],
      });
      expect(JSON.parse(firstSnapshot?.newState ?? "{}")).toEqual({
        canonicalTotalCents: 12_345_67,
        dedupeKey: "audit-dedupe-401",
        idempotencyKey: "audit-idempotency-401",
        recipientEmail: "c******@example.com",
        revision: 5,
        state: "open",
      });
      expect(JSON.stringify(firstSnapshot)).not.toContain(
        "Corrected.Recipient@Example.com"
      );
      expect(await protectedDomainCounts(ctx, fixture.buildId)).toEqual(before);

      for (const restrictedState of [
        { credential: "secret" },
        { verifier: "secret" },
        { apiKey: "secret" },
        { fileBytes: "raw bytes" },
        { renderedEmailBody: "rendered body" },
        { rawProviderPayload: { provider: "opaque" } },
      ]) {
        await expect(
          appendGovernedAuditEvent(ctx, owner, {
            command: "forbiddenAuditPayload",
            entityId: String(fixture.quoteRoundId),
            entityType: "quoteRound",
            eventType: "quote_round.forbidden_payload",
            newState: restrictedState,
            now: Date.now(),
            priorState: { revision: 5 },
            reason: "This row must not be appended.",
            targetRevisions: [],
          })
        ).rejects.toThrow(/restricted field/i);
      }
      await expect(
        appendGovernedAuditEvent(ctx, owner, {
          command: "forbiddenOverrideKind",
          entityId: String(fixture.quoteRoundId),
          entityType: "quoteRound",
          eventType: "quote_round.forbidden_override_kind",
          newState: { revision: 6 },
          now: Date.now(),
          overrideKind: "forge_timestamp" as never,
          priorState: { revision: 5 },
          reason: "Unsupported override kinds must fail closed.",
          targetRevisions: [],
        })
      ).rejects.toThrow(/override kind is not allowed/i);
      expect(
        await ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (query) =>
            query
              .eq("entityType", "quoteRound")
              .eq("entityId", String(fixture.quoteRoundId))
          )
          .collect()
      ).toHaveLength(2);
    });
  });

  test("marks Brokerage Admin break-glass conspicuously and emits a security-critical notification", async () => {
    const fixture = await seedPolicyFixture();
    await fixture.base.run(async (ctx) => {
      const documents = await policyDocuments(ctx, fixture);
      const admin = authorization(documents, {
        capacity: "admin",
        roles: ["admin"],
        subject: "policy-admin",
      });
      const governed = await authorizeAdministrativeRecovery(ctx as any, admin, {
        breakGlassConfirmed: true,
        reason: "Owner escalated an expired access recovery.",
      });
      const auditEventId = await appendGovernedAuditEvent(
        ctx,
        governed.authorization,
        {
          breakGlass: governed.breakGlass,
          command: "rotateQuoteInvitationAccess",
          entityId: String(fixture.quoteRoundId),
          entityType: "quoteRoundInvitation",
          eventType: "quote_round.invitation_access_rotated",
          newState: { accessGeneration: 2, revision: 4 },
          now: 1_786_000_100_000,
          priorState: { accessGeneration: 1, revision: 4 },
          reason: "Owner escalated an expired access recovery.",
          targetRevisions: [
            {
              entityId: String(fixture.quoteRoundId),
              entityType: "quoteRound",
              revision: 4,
            },
          ],
        }
      );
      expect(await ctx.db.get(auditEventId)).toMatchObject({
        actorKind: "human",
        breakGlass: true,
        effectiveCapacity: "admin",
        warnings: ["BREAK_GLASS_ADMINISTRATIVE_OVERRIDE"],
      });
      const notifications = await ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient", (query) =>
          query
            .eq("organizationId", ORGANIZATION_ID)
            .eq("recipientWorkosUserId", "policy-admin")
        )
        .collect();
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        actionRequired: true,
        collaborationBuildId: fixture.buildId,
        inAppVisible: true,
        sourceLabel: "Security",
        status: "unread",
        title: "Security-critical break-glass action",
      });
      expect(notifications[0]?.href).toContain(String(auditEventId));
    });
  });

  test("retries delivery by appending a fresh correlated intent without rewriting failed history", async () => {
    const fixture = await seedPolicyFixture();
    const source = await fixture.base.run(async (ctx) => {
      const now = 1_786_000_200_000;
      const intentId = await ctx.db.insert("communicationIntents", {
        actionRequiredReason: "Provider rejected the delivery.",
        attemptCount: 4,
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        channel: "email",
        createdAt: now,
        idempotencyKey: "failed-delivery-401",
        kind: "quote_invitation_initial",
        lastError: "Provider rejected the delivery.",
        lastOutcomeAt: now,
        nextAttemptAt: now + 86_400_000,
        organizationId: ORGANIZATION_ID,
        payloadSnapshot: JSON.stringify({ event: "invited" }),
        quoteRoundId: fixture.quoteRoundId,
        recipientEmailSnapshot: "recipient@example.com",
        relatedEntityId: String(fixture.quoteRoundId),
        relatedEntityType: "quoteRound",
        status: "action_required",
        templateKey: "quote_invitation_initial",
        updatedAt: now,
      });
      const attemptId = await ctx.db.insert("communicationAttempts", {
        attemptNumber: 4,
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        communicationIntentId: intentId,
        createdAt: now,
        finishedAt: now,
        organizationId: ORGANIZATION_ID,
        providerResendEmailId: "provider-email-401",
        safeError: "Provider rejected the delivery.",
        startedAt: now,
        state: "failed",
        updatedAt: now,
      });
      return { attemptId, intentId };
    });

    const result = await fixture.admin.mutation(
      (api as any).quote_notifications.retryCommunicationDelivery,
      {
        administrativeCapacity: "admin",
        breakGlassConfirmed: true,
        buildId: fixture.buildId,
        communicationIntentId: source.intentId,
        idempotencyKey: "operator-retry-401",
        reason: "Builder Owner escalated the failed invitation delivery.",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(result).toMatchObject({ replayed: false, status: "pending" });
    const records = await fixture.base.run(async (ctx) => ({
      audit: (
        await ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (query) =>
            query
              .eq("entityType", "communicationIntent")
              .eq("entityId", String(source.intentId))
          )
          .unique()
      ),
      retry: await ctx.db.get(result.communicationIntentId),
      sourceAttempt: await ctx.db.get(source.attemptId),
      sourceIntent: await ctx.db.get(source.intentId),
    }));
    expect(records.sourceIntent).toMatchObject({
      attemptCount: 4,
      status: "superseded",
      supersededByCommunicationIntentId: result.communicationIntentId,
    });
    expect(records.sourceAttempt).toMatchObject({
      attemptNumber: 4,
      providerResendEmailId: "provider-email-401",
      state: "failed",
    });
    expect(records.retry).toMatchObject({
      attemptCount: 0,
      status: "pending",
    });
    expect(records.audit).toMatchObject({
      breakGlass: true,
      drawFlowCorrelationId: String(result.communicationIntentId),
      overrideKind: "delivery_retry",
      providerCorrelationId: "provider-email-401",
    });
    const replay = await fixture.admin.mutation(
      (api as any).quote_notifications.retryCommunicationDelivery,
      {
        administrativeCapacity: "admin",
        breakGlassConfirmed: true,
        buildId: fixture.buildId,
        communicationIntentId: source.intentId,
        idempotencyKey: "operator-retry-401",
        reason: "Builder Owner escalated the failed invitation delivery.",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(replay).toEqual({
      communicationIntentId: result.communicationIntentId,
      replayed: true,
      status: "pending",
    });
    await expect(
      fixture.admin.mutation(
        (api as any).quote_notifications.retryCommunicationDelivery,
        {
          administrativeCapacity: "admin",
          breakGlassConfirmed: true,
          buildId: fixture.buildId,
          communicationIntentId: source.intentId,
          idempotencyKey: "second-operator-retry-401",
          reason: "A recovered delivery cannot be retried a second time.",
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/action-required communication delivery/i);
  });

  test("rejects a cross-tenant Quote Round administrative recovery before appending history", async () => {
    const fixture = await seedPolicyFixture();
    const foreignTenant = withIdentity(
      fixture.base,
      ["builder"],
      "foreign-policy-owner",
      "org_foreign_policy"
    );
    await expect(
      foreignTenant.mutation(
        (api as any).quote_round_lifecycle.reopenQuoteRoundWithRevision,
        {
          administrativeCapacity: "builder",
          buildId: fixture.buildId,
          changedFieldKeys: ["responseDeadline"],
          confirmed: true,
          expectedRevision: 4,
          quoteRoundId: fixture.quoteRoundId,
          reason: "A foreign tenant must never reopen this Quote Round.",
          responseDeadline: Date.now() + 14 * 24 * 60 * 60 * 1000,
          workosOrganizationId: "org_foreign_policy",
        }
      )
    ).rejects.toThrow(/Forbidden|brokerage|scope/i);
    const history = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query
            .eq("entityType", "quoteRound")
            .eq("entityId", String(fixture.quoteRoundId))
        )
        .collect()
    );
    expect(history).toHaveLength(0);
  });
});
