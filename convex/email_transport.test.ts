/// <reference types="vite/client" />

import type { EmailEvent, EmailId } from "@convex-dev/resend";
import resendTest from "@convex-dev/resend/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import {
  deriveCommunicationSecret,
  enqueueCommunicationIntent,
  type CommunicationIntentInput,
} from "./email_transport";
import { queueIdentityInvitationEmail } from "./workosManagement/invitationEmails";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_email_transport_test";

describe("Resend email transport", () => {
  beforeEach(() => {
    vi.stubEnv(
      "COMMUNICATION_TOKEN_SECRET",
      "email-transport-test-secret-32-bytes-minimum"
    );
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv(
      "RESEND_FROM_EMAIL",
      "DrawFlow <notifications@updates.fairlend.ca>"
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("enqueues once for a stable organization-scoped idempotency key", async () => {
    const t = setup();
    const brokerageId = await insertBrokerage(t);
    const buildId = await insertBuild(t, brokerageId);
    const input = emailInput(brokerageId, buildId);

    const firstId = await t.run((ctx) =>
      enqueueCommunicationIntent(ctx, input)
    );
    const replayId = await t.run((ctx) =>
      enqueueCommunicationIntent(ctx, input)
    );

    const intents = await t.run((ctx) =>
      ctx.db.query("communicationIntents").take(10)
    );
    expect(replayId).toBe(firstId);
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      buildId,
      idempotencyKey: input.idempotencyKey,
      kind: input.kind,
      organizationId: ORGANIZATION_ID,
      payloadSnapshot: input.payloadSnapshot,
      recipientEmailSnapshot: "new.contractor@example.com",
      status: "pending",
      templateKey: input.templateKey,
    });
  });

  test("queues a code-owned role invitation without storing the WorkOS bearer URL", async () => {
    const t = setup();
    const brokerageId = await insertBrokerage(t);

    const intentId = await t.run((ctx) =>
      queueIdentityInvitationEmail(ctx, {
        brokerageId,
        email: "new.builder@example.com",
        organizationId: ORGANIZATION_ID,
        recipientName: "New Builder",
        roleSlug: "builder",
        workosInvitationId: "inv_opaque_123",
      })
    );
    const intent = await t.run((ctx) => ctx.db.get(intentId));

    expect(intent).toMatchObject({
      idempotencyKey: "identity-invitation:inv_opaque_123",
      kind: "identity_invitation",
      recipientEmailSnapshot: "new.builder@example.com",
      recipientNameSnapshot: "New Builder",
      templateKey: "identity_invitation_builder_v1",
    });
    expect(intent?.payloadSnapshot).toBe(
      '{"roleSlug":"builder","workosInvitationId":"inv_opaque_123"}'
    );
    expect(intent?.payloadSnapshot).not.toContain("accept");
  });

  test("derives deterministic bearer tokens with a server-only HMAC key", async () => {
    const first = await deriveCommunicationSecret("intent_123");
    const replay = await deriveCommunicationSecret("intent_123");
    expect(replay).toBe(first);
    expect(first).toMatch(/^[a-f0-9]{64}$/);

    vi.stubEnv(
      "COMMUNICATION_TOKEN_SECRET",
      "rotated-email-transport-secret-32-bytes-minimum"
    );
    await expect(deriveCommunicationSecret("intent_123")).resolves.not.toBe(
      first
    );
  });

  test("fails closed when an idempotency key is reused for different content", async () => {
    const t = setup();
    const brokerageId = await insertBrokerage(t);
    const buildId = await insertBuild(t, brokerageId);
    const input = emailInput(brokerageId, buildId);
    await t.run((ctx) => enqueueCommunicationIntent(ctx, input));

    await expect(
      t.run((ctx) =>
        enqueueCommunicationIntent(ctx, {
          ...input,
          recipientEmailSnapshot: "different.contractor@example.com",
        })
      )
    ).rejects.toThrow(
      "Communication idempotency key was reused with different content."
    );
  });

  test("retains unique provider events and does not regress status for older callbacks", async () => {
    const t = setup();
    const brokerageId = await insertBrokerage(t);
    const provider = await insertProviderMessage(t, brokerageId);
    const { intentId, message, messageId } = provider;

    const delivered = providerEvent(
      "email.delivered",
      "2026-08-01T14:05:00.000Z"
    );
    await t.mutation(internal.email_transport.handleResendEmailEvent, {
      event: delivered,
      id: message.resendEmailId as EmailId,
    });
    await t.mutation(internal.email_transport.handleResendEmailEvent, {
      event: delivered,
      id: message.resendEmailId as EmailId,
    });
    await t.mutation(internal.email_transport.handleResendEmailEvent, {
      event: providerEvent("email.sent", "2026-08-01T14:00:00.000Z"),
      id: message.resendEmailId as EmailId,
    });

    const persisted = await t.run(async (ctx) => ({
      outcomes: await ctx.db
        .query("communicationOutcomes")
        .withIndex("by_communicationIntentId_and_providerCreatedAt", (query) =>
          query.eq("communicationIntentId", intentId)
        )
        .collect(),
      events: await ctx.db.query("emailDeliveryEvents").take(10),
      message: await ctx.db.get(messageId),
    }));
    expect(persisted.events).toHaveLength(2);
    expect(persisted.outcomes).toHaveLength(2);
    expect(persisted.message?.status).toBe("delivered");
    expect(persisted.message?.providerCreatedAt).toBe(
      Date.parse("2026-08-01T14:05:00.000Z")
    );
  });

  test("normalizes every provider outcome and keeps bounded failure details in history", async () => {
    const t = setup();
    const brokerageId = await insertBrokerage(t);
    const provider = await insertProviderMessage(t, brokerageId);
    const { intentId, message, messageId } = provider;

    const events = [
      providerStatusEvent("email.sent", "2026-08-01T14:00:00.000Z"),
      providerStatusEvent(
        "email.delivery_delayed",
        "2026-08-01T14:01:00.000Z"
      ),
      providerStatusEvent("email.delivered", "2026-08-01T14:02:00.000Z"),
      providerStatusEvent("email.opened", "2026-08-01T14:03:00.000Z"),
      providerStatusEvent("email.clicked", "2026-08-01T14:04:00.000Z"),
      providerStatusEvent(
        "email.bounced",
        "2026-08-01T14:05:00.000Z",
        "Mailbox rejected the message."
      ),
      providerStatusEvent(
        "email.failed",
        "2026-08-01T14:06:00.000Z",
        "Provider transport failed."
      ),
      providerStatusEvent("email.complained", "2026-08-01T14:07:00.000Z"),
    ] as const;
    for (const event of events) {
      await t.mutation(internal.email_transport.handleResendEmailEvent, {
        event,
        id: message.resendEmailId as EmailId,
      });
    }

    const persisted = await t.run(async (ctx) => ({
      outcomes: await ctx.db
        .query("communicationOutcomes")
        .withIndex("by_communicationIntentId_and_providerCreatedAt", (query) =>
          query.eq("communicationIntentId", intentId)
        )
        .collect(),
      events: await ctx.db
        .query("emailDeliveryEvents")
        .withIndex("by_emailMessageId_and_providerCreatedAt", (query) =>
          query.eq("emailMessageId", messageId)
        )
        .collect(),
      message: await ctx.db.get(messageId),
    }));
    expect(persisted.events).toHaveLength(events.length);
    expect(persisted.outcomes).toHaveLength(events.length);
    expect(persisted.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "email.bounced",
          safeDetail: "Mailbox rejected the message.",
        }),
        expect.objectContaining({
          eventType: "email.failed",
          safeDetail: "Provider transport failed.",
        }),
      ])
    );
    expect(persisted.message).toMatchObject({
      finalizedAt: Date.parse("2026-08-01T14:07:00.000Z"),
      providerCreatedAt: Date.parse("2026-08-01T14:07:00.000Z"),
      status: "complained",
    });
    expect(persisted.message?.lastError).toBeUndefined();
  });

  test("uses provider time and terminal-failure precedence for duplicate, out-of-order, and equal-time callbacks", async () => {
    const t = setup();
    const brokerageId = await insertBrokerage(t);
    const provider = await insertProviderMessage(t, brokerageId);
    const { intentId, message, messageId } = provider;

    const equalTime = "2026-08-01T14:05:00.000Z";
    const failed = providerStatusEvent("email.failed", equalTime, "Failed");
    await t.mutation(internal.email_transport.handleResendEmailEvent, {
      event: failed,
      id: message.resendEmailId as EmailId,
    });
    await t.mutation(internal.email_transport.handleResendEmailEvent, {
      event: providerStatusEvent("email.delivered", equalTime),
      id: message.resendEmailId as EmailId,
    });
    const equalTimeDelivered = await t.run((ctx) => ctx.db.get(messageId));
    expect(equalTimeDelivered?.status).toBe("failed");
    await t.mutation(internal.email_transport.handleResendEmailEvent, {
      event: providerStatusEvent("email.delivery_delayed", equalTime),
      id: message.resendEmailId as EmailId,
    });
    await t.mutation(internal.email_transport.handleResendEmailEvent, {
      event: failed,
      id: message.resendEmailId as EmailId,
    });

    const newerDelivered = providerStatusEvent(
      "email.delivered",
      "2026-08-01T14:06:00.000Z"
    );
    await t.mutation(internal.email_transport.handleResendEmailEvent, {
      event: newerDelivered,
      id: message.resendEmailId as EmailId,
    });
    const newerOutcome = await t.run((ctx) => ctx.db.get(messageId));
    expect(newerOutcome?.status).toBe("failed");
    await t.mutation(internal.email_transport.handleResendEmailEvent, {
      event: providerStatusEvent("email.failed", "2026-08-01T14:06:00.000Z", "Final failure"),
      id: message.resendEmailId as EmailId,
    });
    await t.mutation(internal.email_transport.handleResendEmailEvent, {
      event: providerStatusEvent("email.sent", "2026-08-01T14:04:00.000Z"),
      id: message.resendEmailId as EmailId,
    });

    const persisted = await t.run(async (ctx) => ({
      outcomes: await ctx.db
        .query("communicationOutcomes")
        .withIndex("by_communicationIntentId_and_providerCreatedAt", (query) =>
          query.eq("communicationIntentId", intentId)
        )
        .collect(),
      events: await ctx.db
        .query("emailDeliveryEvents")
        .withIndex("by_emailMessageId_and_providerCreatedAt", (query) =>
          query.eq("emailMessageId", messageId)
        )
        .collect(),
      message: await ctx.db.get(messageId),
    }));
    expect(persisted.events).toHaveLength(6);
    expect(persisted.outcomes).toHaveLength(6);
    expect(persisted.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outcomeType: "email.failed", precedence: 60 }),
        expect.objectContaining({ outcomeType: "email.delivered", precedence: 50 }),
      ])
    );
    expect(persisted.message).toMatchObject({
      lastError: "Final failure",
      providerCreatedAt: Date.parse("2026-08-01T14:06:00.000Z"),
      status: "failed",
    });
  });

  test("keeps a bounce terminal when a later click callback arrives", async () => {
    const t = setup();
    const brokerageId = await insertBrokerage(t);
    const { intentId, message, messageId } = await insertProviderMessage(
      t,
      brokerageId
    );
    await t.mutation(internal.email_transport.handleResendEmailEvent, {
      event: providerStatusEvent(
        "email.bounced",
        "2026-08-01T14:05:00.000Z",
        "Mailbox rejected the message."
      ),
      id: message.resendEmailId as EmailId,
    });
    await t.mutation(internal.email_transport.handleResendEmailEvent, {
      event: providerStatusEvent("email.clicked", "2026-08-01T14:06:00.000Z"),
      id: message.resendEmailId as EmailId,
    });

    const persisted = await t.run(async (ctx) => ({
      intent: await ctx.db.get(intentId),
      message: await ctx.db.get(messageId),
    }));
    expect(persisted.message).toMatchObject({
      lastError: "Mailbox rejected the message.",
      status: "bounced",
    });
    expect(persisted.intent).toMatchObject({
      actionRequiredReason: "Mailbox rejected the message.",
      lastError: "Mailbox rejected the message.",
      status: "action_required",
    });
  });

  test("fails closed for blank communication intent metadata", async () => {
    const t = setup();
    const brokerageId = await insertBrokerage(t);
    const buildId = await insertBuild(t, brokerageId);

    await expect(
      t.run((ctx) =>
        enqueueCommunicationIntent(ctx, {
          ...emailInput(brokerageId, buildId),
          payloadSnapshot: "",
        })
      )
    ).rejects.toThrow("Communication intent metadata must not be blank.");
  });

  test("claims an intent and creates the provider message only after dispatch acceptance", async () => {
    const t = setup();
    const brokerageId = await insertBrokerage(t);
    const buildId = await insertBuild(t, brokerageId);
    const intentId = await t.run((ctx) =>
      enqueueCommunicationIntent(ctx, emailInput(brokerageId, buildId))
    );
    const due = await t.run(async (ctx) => {
      const intent = await ctx.db.get(intentId);
      if (!intent) throw new Error("Expected communication intent.");
      return intent.nextAttemptAt;
    });
    const work = await t.mutation(
      internal.quote_notifications.claimCommunicationIntent,
      { intentId, now: due }
    );
    if (!work) {
      throw new Error("Expected a claimable communication intent.");
    }
    expect(work).toMatchObject({
      intentId,
      kind: "quote_invitation_initial",
      templateKey: "quote.invitation.initial",
    });

    const beforeDispatch = await t.run(async (ctx) => ({
      attempts: await ctx.db
        .query("communicationAttempts")
        .withIndex("by_communicationIntentId_and_attemptNumber", (query) =>
          query.eq("communicationIntentId", intentId)
        )
        .collect(),
      emailMessages: await ctx.db.query("emailMessages").collect(),
      intent: await ctx.db.get(intentId),
    }));
    expect(beforeDispatch.attempts).toEqual([
      expect.objectContaining({ attemptNumber: 1, state: "claimed" }),
    ]);
    expect(beforeDispatch.emailMessages).toEqual([]);
    expect(beforeDispatch.intent).toMatchObject({ status: "dispatching" });

    const emailMessageId = await t.mutation(
      internal.quote_notifications.recordCommunicationDispatchSuccess,
      {
        attemptId: work.attemptId,
        intentId,
        now: due + 1_000,
        providerResendEmailId: "provider-accepted-001",
        sender: "DrawFlow <notifications@updates.fairlend.ca>",
      }
    );
    const afterDispatch = await t.run(async (ctx) => ({
      emailMessage: await ctx.db.get(emailMessageId),
      intent: await ctx.db.get(intentId),
      outcomes: await ctx.db
        .query("communicationOutcomes")
        .withIndex("by_communicationIntentId_and_providerCreatedAt", (query) =>
          query.eq("communicationIntentId", intentId)
        )
        .collect(),
    }));
    expect(afterDispatch.emailMessage).toMatchObject({
      communicationAttemptId: work.attemptId,
      communicationIntentId: intentId,
      resendEmailId: "provider-accepted-001",
      status: "queued",
    });
    expect(afterDispatch.intent).toMatchObject({
      providerEmailMessageId: emailMessageId,
      status: "sent",
    });
    expect(afterDispatch.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outcomeType: "dispatch_queued",
          communicationAttemptId: work.attemptId,
        }),
      ])
    );
  });

  test("retries transient dispatch failures and escalates a permanent action-required outcome", async () => {
    const t = setup();
    const brokerageId = await insertBrokerage(t);
    const buildId = await insertBuild(t, brokerageId);
    const intentId = await t.run((ctx) =>
      enqueueCommunicationIntent(ctx, emailInput(brokerageId, buildId))
    );
    let now = await t.run(async (ctx) => {
      const intent = await ctx.db.get(intentId);
      if (!intent) throw new Error("Expected communication intent.");
      return intent.nextAttemptAt;
    });
    for (let attemptNumber = 1; attemptNumber <= 4; attemptNumber += 1) {
      const work = await t.mutation(
        internal.quote_notifications.claimCommunicationIntent,
        { intentId, now }
      );
      if (!work) {
        throw new Error(`Expected claim ${attemptNumber}.`);
      }
      await t.mutation(
        internal.quote_notifications.recordCommunicationDispatchFailure,
        {
          attemptId: work.attemptId,
          intentId,
          now: now + 1_000,
          retryable: true,
          safeError: `Transient provider failure on attempt ${attemptNumber}.`,
        }
      );
      await t.mutation(
        internal.quote_notifications.recordCommunicationDispatchFailure,
        {
          attemptId: work.attemptId,
          intentId,
          now: now + 2_000,
          retryable: true,
          safeError: "A replay must not replace the recorded failure.",
        }
      );
      const intent = await t.run((ctx) => ctx.db.get(intentId));
      if (!intent) throw new Error("Expected persisted communication intent.");
      expect(intent.attemptCount).toBe(attemptNumber);
      if (attemptNumber < 4) {
        expect(intent.status).toBe("retry_scheduled");
      } else {
        expect(intent.status).toBe("action_required");
        expect(intent.actionRequiredReason).toContain("attempt 4");
      }
      now = intent.nextAttemptAt;
    }
    const persisted = await t.run(async (ctx) => ({
      attempts: await ctx.db
        .query("communicationAttempts")
        .withIndex("by_communicationIntentId_and_attemptNumber", (query) =>
          query.eq("communicationIntentId", intentId)
        )
        .collect(),
      outcomes: await ctx.db
        .query("communicationOutcomes")
        .withIndex("by_communicationIntentId_and_providerCreatedAt", (query) =>
          query.eq("communicationIntentId", intentId)
        )
        .collect(),
      emailMessages: await ctx.db.query("emailMessages").collect(),
    }));
    expect(persisted.attempts).toHaveLength(4);
    expect(persisted.outcomes).toHaveLength(4);
    expect(persisted.attempts.every((attempt) => attempt.state === "failed")).toBe(
      true
    );
    expect(persisted.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outcomeType: "dispatch_failed" }),
        expect.objectContaining({ outcomeType: "action_required", precedence: 100 }),
      ])
    );
    expect(persisted.emailMessages).toEqual([]);
  });

  test("does not create a fifth attempt when the final dispatch lease expires", async () => {
    const t = setup();
    const brokerageId = await insertBrokerage(t);
    const buildId = await insertBuild(t, brokerageId);
    const intentId = await t.run((ctx) =>
      enqueueCommunicationIntent(ctx, emailInput(brokerageId, buildId))
    );
    const now = Date.now();
    const attemptId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("communicationAttempts", {
        attemptNumber: 4,
        brokerageId,
        buildId,
        communicationIntentId: intentId,
        createdAt: now - 11 * 60 * 1000,
        organizationId: ORGANIZATION_ID,
        startedAt: now - 11 * 60 * 1000,
        state: "claimed",
        updatedAt: now - 11 * 60 * 1000,
      });
      await ctx.db.patch(intentId, {
        attemptCount: 4,
        nextAttemptAt: now - 1,
        status: "dispatching",
        updatedAt: now - 11 * 60 * 1000,
      });
      return id;
    });

    await expect(
      t.mutation(internal.quote_notifications.claimCommunicationIntent, {
        intentId,
        now,
      })
    ).resolves.toBeNull();
    const persisted = await t.run(async (ctx) => ({
      attempt: await ctx.db.get(attemptId),
      attempts: await ctx.db
        .query("communicationAttempts")
        .withIndex("by_communicationIntentId_and_attemptNumber", (query) =>
          query.eq("communicationIntentId", intentId)
        )
        .collect(),
      intent: await ctx.db.get(intentId),
      outcomes: await ctx.db
        .query("communicationOutcomes")
        .withIndex("by_communicationIntentId_and_providerCreatedAt", (query) =>
          query.eq("communicationIntentId", intentId)
        )
        .collect(),
    }));
    expect(persisted.attempts).toHaveLength(1);
    expect(persisted.attempt).toMatchObject({
      safeError: "Dispatch lease expired before completion.",
      state: "abandoned",
    });
    expect(persisted.intent).toMatchObject({
      actionRequiredReason:
        "Dispatch lease expired after the final allowed attempt.",
      attemptCount: 4,
      status: "action_required",
    });
    expect(persisted.outcomes).toEqual([
      expect.objectContaining({
        communicationAttemptId: attemptId,
        outcomeType: "action_required",
      }),
    ]);
  });

  test("converts missing provider configuration into a durable action-required outcome", async () => {
    const t = setup();
    const brokerageId = await insertBrokerage(t);
    const buildId = await insertBuild(t, brokerageId);
    const intentId = await t.run((ctx) =>
      enqueueCommunicationIntent(ctx, emailInput(brokerageId, buildId))
    );
    vi.stubEnv("RESEND_FROM_EMAIL", "");

    await t.action(internal.quote_notifications.processDueCommunicationIntents, {});

    const persisted = await t.run(async (ctx) => ({
      attempts: await ctx.db
        .query("communicationAttempts")
        .withIndex("by_communicationIntentId_and_attemptNumber", (query) =>
          query.eq("communicationIntentId", intentId)
        )
        .collect(),
      emailMessages: await ctx.db.query("emailMessages").collect(),
      intent: await ctx.db.get(intentId),
      outcomes: await ctx.db
        .query("communicationOutcomes")
        .withIndex("by_communicationIntentId_and_providerCreatedAt", (query) =>
          query.eq("communicationIntentId", intentId)
        )
        .collect(),
    }));
    expect(persisted.intent).toMatchObject({
      actionRequiredReason: expect.stringContaining("not configured"),
      attemptCount: 1,
      status: "action_required",
    });
    expect(persisted.attempts).toEqual([
      expect.objectContaining({
        safeError: expect.stringContaining("not configured"),
        state: "failed",
      }),
    ]);
    expect(persisted.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outcomeType: "action_required",
          safeDetail: expect.stringContaining("not configured"),
        }),
      ])
    );
    expect(persisted.emailMessages).toEqual([]);
  });
});

function setup() {
  const t = convexTest(schema, modules);
  resendTest.register(t);
  return t;
}

async function insertBrokerage(t: ReturnType<typeof setup>) {
  return await t.run((ctx) =>
    ctx.db.insert("brokerages", {
      createdAt: 1,
      displayName: "Email Transport Test",
      legalName: "Email Transport Test Inc.",
      status: "active",
      updatedAt: 1,
      workosOrganizationId: ORGANIZATION_ID,
    })
  );
}

async function insertBuild(
  t: ReturnType<typeof setup>,
  brokerageId: Awaited<ReturnType<typeof insertBrokerage>>
) {
  return await t.run(async (ctx) => {
    const now = 1;
    const builderProfileId = await ctx.db.insert("builderProfiles", {
      brokerageId,
      createdAt: now,
      displayName: "Email Transport Builder",
      legalName: "Email Transport Builder Inc.",
      organizationId: ORGANIZATION_ID,
      status: "active",
      updatedAt: now,
    });
    const proposalId = await ctx.db.insert("buildProposals", {
      borrowerCoPayBps: 0,
      borrowerWorkingCapitalLimitCents: 1_000_000,
      brokerageId,
      buildName: "Email Transport Build",
      builderProfileId,
      createdAt: now,
      createdByWorkosUserId: "email-test",
      lenderDrawPolicyLimitCents: 1_000_000,
      location: "Email Transport Road",
      organizationId: ORGANIZATION_ID,
      reviewOutcome: "approved",
      status: "approved",
      totalBudgetCents: 1_000_000,
      updatedAt: now,
      updatedByWorkosUserId: "email-test",
    });
    const workflowRuleId = await ctx.db.insert("workflowRules", {
      allowPermitWaiverByRoles: [],
      brokerageId,
      createdAt: now,
      organizationId: ORGANIZATION_ID,
      proposalStates: ["approved"],
      requirePermitForApproval: false,
      ruleKey: "email-test",
      settings: {},
      status: "active",
      updatedAt: now,
      version: 1,
    });
    const workflowRuleSnapshotId = await ctx.db.insert(
      "workflowRuleSnapshots",
      {
        allowPermitWaiverByRoles: [],
        brokerageId,
        createdAt: now,
        organizationId: ORGANIZATION_ID,
        proposalId,
        proposalStates: ["approved"],
        requirePermitForApproval: false,
        ruleKey: "email-test",
        settings: {},
        version: 1,
        workflowRuleId,
      }
    );
    return await ctx.db.insert("activeBuilds", {
      brokerageId,
      buildName: "Email Transport Build",
      builderProfileId,
      createdAt: now,
      location: "Email Transport Road",
      organizationId: ORGANIZATION_ID,
      proposalId,
      startDate: "2026-08-01",
      status: "active",
      totalBudgetCents: 1_000_000,
      updatedAt: now,
      workflowRuleSnapshotId,
    });
  });
}

async function insertProviderMessage(
  t: ReturnType<typeof setup>,
  brokerageId: Awaited<ReturnType<typeof insertBrokerage>>
) {
  const buildId = await insertBuild(t, brokerageId);
  const input = emailInput(brokerageId, buildId);
  const intentId = await t.run((ctx) =>
    enqueueCommunicationIntent(ctx, input)
  );
  const messageId = await t.run((ctx) =>
    ctx.db.insert("emailMessages", {
      brokerageId,
      communicationIntentId: intentId,
      createdAt: 1,
      idempotencyKey: input.idempotencyKey,
      organizationId: ORGANIZATION_ID,
      recipientEmail: "new.contractor@example.com",
      relatedEntityId: input.relatedEntityId,
      relatedEntityType: input.relatedEntityType,
      resendEmailId: "provider_email_123",
      sender: "DrawFlow <notifications@updates.fairlend.ca>",
      status: "queued",
      subject: "Quote requested for Hamilton Infill Build",
      updatedAt: 1,
    })
  );
  const message = await t.run((ctx) => ctx.db.get(messageId));
  if (!message) {
    throw new Error("Expected queued provider email message.");
  }
  return { buildId, input, intentId, message, messageId };
}

function emailInput(
  brokerageId: Awaited<ReturnType<typeof insertBrokerage>>,
  buildId: Awaited<ReturnType<typeof insertBuild>>
): CommunicationIntentInput {
  return {
    brokerageId,
    buildId,
    idempotencyKey: "quote-invitation:invitation_123:revision_1",
    kind: "quote_invitation_initial",
    organizationId: ORGANIZATION_ID,
    payloadSnapshot: JSON.stringify({
      invitationId: "invitation_123",
      subject: "Quote requested for Hamilton Infill Build",
    }),
    recipientEmailSnapshot: " New.Contractor@Example.com ",
    relatedEntityId: "invitation_123",
    relatedEntityType: "quoteInvitation",
    templateKey: "quote.invitation.initial",
  };
}

function providerEvent<T extends "email.sent" | "email.delivered">(
  type: T,
  createdAt: string
): Extract<EmailEvent, { type: T }> {
  return {
    created_at: createdAt,
    data: {
      created_at: createdAt,
      email_id: "provider_email_123",
      from: "DrawFlow <notifications@updates.fairlend.ca>",
      subject: "Quote requested for Hamilton Infill Build",
      to: ["new.contractor@example.com"],
    },
    type,
  } as Extract<EmailEvent, { type: T }>;
}

function providerStatusEvent(
  type: EmailEvent["type"],
  createdAt: string,
  detail = "Provider reported a delivery outcome."
): EmailEvent {
  const common = {
    created_at: createdAt,
    data: {
      created_at: createdAt,
      email_id: "provider_email_123",
      from: "DrawFlow <notifications@updates.fairlend.ca>",
      subject: "Quote requested for Hamilton Infill Build",
      to: ["new.contractor@example.com"],
    },
    type,
  };
  if (type === "email.bounced") {
    return {
      ...common,
      data: {
        ...common.data,
        bounce: { message: detail, subType: "suppressed", type: "permanent" },
      },
    } as EmailEvent;
  }
  if (type === "email.failed") {
    return {
      ...common,
      data: { ...common.data, failed: { reason: detail } },
    } as EmailEvent;
  }
  if (type === "email.opened") {
    return {
      ...common,
      data: {
        ...common.data,
        open: {
          ipAddress: "192.0.2.1",
          timestamp: createdAt,
          userAgent: "DrawFlow test agent",
        },
      },
    } as EmailEvent;
  }
  if (type === "email.clicked") {
    return {
      ...common,
      data: {
        ...common.data,
        click: {
          ipAddress: "192.0.2.1",
          link: "https://drawflow.test/quote-invitation/token",
          timestamp: createdAt,
          userAgent: "DrawFlow test agent",
        },
      },
    } as EmailEvent;
  }
  return common as EmailEvent;
}
