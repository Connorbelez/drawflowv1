/// <reference types="vite/client" />

import type { EmailEvent, EmailId } from "@convex-dev/resend";
import resendTest from "@convex-dev/resend/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import {
  enqueueTransactionalEmail,
  type TransactionalEmailInput,
} from "./email_transport";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_email_transport_test";

describe("Resend email transport", () => {
  beforeEach(() => {
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
    const input = emailInput(brokerageId);

    const firstId = await t.run((ctx) =>
      enqueueTransactionalEmail(ctx, input)
    );
    const replayId = await t.run((ctx) =>
      enqueueTransactionalEmail(ctx, input)
    );

    const messages = await t.run((ctx) => ctx.db.query("emailMessages").take(10));
    expect(replayId).toBe(firstId);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      idempotencyKey: input.idempotencyKey,
      organizationId: ORGANIZATION_ID,
      recipientEmail: "new.contractor@example.com",
      status: "queued",
      subject: input.subject,
    });
  });

  test("fails closed when an idempotency key is reused for different content", async () => {
    const t = setup();
    const brokerageId = await insertBrokerage(t);
    const input = emailInput(brokerageId);
    await t.run((ctx) => enqueueTransactionalEmail(ctx, input));

    await expect(
      t.run((ctx) =>
        enqueueTransactionalEmail(ctx, {
          ...input,
          recipientEmail: "different.contractor@example.com",
        })
      )
    ).rejects.toThrow("Email idempotency key was reused with different content.");
  });

  test("retains unique provider events and does not regress status for older callbacks", async () => {
    const t = setup();
    const brokerageId = await insertBrokerage(t);
    const messageId = await t.run((ctx) =>
      enqueueTransactionalEmail(ctx, emailInput(brokerageId))
    );
    const message = await t.run((ctx) => ctx.db.get(messageId));
    expect(message).not.toBeNull();
    if (!message) {
      throw new Error("Expected queued email message.");
    }

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
      events: await ctx.db.query("emailDeliveryEvents").take(10),
      message: await ctx.db.get(messageId),
    }));
    expect(persisted.events).toHaveLength(2);
    expect(persisted.message?.status).toBe("delivered");
    expect(persisted.message?.providerCreatedAt).toBe(
      Date.parse("2026-08-01T14:05:00.000Z")
    );
  });

  test("requires an explicit verified sender identity", async () => {
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    const t = setup();
    const brokerageId = await insertBrokerage(t);

    await expect(
      t.run((ctx) =>
        enqueueTransactionalEmail(ctx, emailInput(brokerageId))
      )
    ).rejects.toThrow("RESEND_FROM_EMAIL is not configured.");
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

function emailInput(
  brokerageId: Awaited<ReturnType<typeof insertBrokerage>>
): TransactionalEmailInput {
  return {
    brokerageId,
    html: "<p>Please provide your quote.</p>",
    idempotencyKey: "quote-invitation:invitation_123:revision_1",
    organizationId: ORGANIZATION_ID,
    recipientEmail: " New.Contractor@Example.com ",
    relatedEntityId: "invitation_123",
    relatedEntityType: "quoteInvitation",
    subject: "Quote requested for Hamilton Infill Build",
    text: "Please provide your quote.",
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
