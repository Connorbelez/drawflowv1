import { describe, expect, test } from "vitest";

import {
  isRecipientDeliveryVisible,
  projectRecipientDelivery,
  summarizeRecipientDeliveries,
} from "./recipient_delivery_projection";
import type { Doc } from "./types";

function delivery(
  id: string,
  status: Doc<"recipientDeliveries">["status"],
  overrides: Partial<Doc<"recipientDeliveries">> = {}
) {
  return {
    _creationTime: 1,
    _id: id,
    actionLabel: "Open",
    actionRequired: true,
    body: "Body",
    brokerageId: "brokerage",
    createdAt: 1,
    entityId: "entity",
    entityLabel: "Entity",
    entityType: "build",
    href: "/build",
    organizationId: "org",
    recipientWorkosUserId: "user",
    resolutionMode: "recipient",
    sourceLabel: "DrawFlow",
    status,
    title: "Title",
    updatedAt: 1,
    ...overrides,
  } as unknown as Doc<"recipientDeliveries">;
}

describe("recipient delivery projection", () => {
  test("projects canonical overrides without changing delivery lifecycle state", () => {
    const record = delivery("delivery-1", "unread");
    expect(
      projectRecipientDelivery(record, {
        actionLabel: "Open Action Item",
        body: "Canonical body",
        href: "/build/action-item",
      })
    ).toMatchObject({
      _id: record._id,
      actionLabel: "Open Action Item",
      body: "Canonical body",
      href: "/build/action-item",
      status: "unread",
      title: "Title",
    });
  });

  test("keeps route visibility policy separate from shared status policy", () => {
    const hidden = delivery("delivery-2", "unread", { inAppVisible: false });
    expect(
      isRecipientDeliveryVisible(hidden, {
        includeResolved: false,
        requireInAppVisible: false,
      })
    ).toBe(true);
    expect(
      isRecipientDeliveryVisible(hidden, {
        includeResolved: false,
        requireInAppVisible: true,
      })
    ).toBe(false);
  });

  test("summarizes the bounded Operations inbox with resolved rows excluded", () => {
    const summary = summarizeRecipientDeliveries([
      delivery("delivery-1", "unread"),
      delivery("delivery-2", "read", { actionRequired: false }),
      delivery("delivery-3", "resolved"),
    ]);
    expect(summary).toMatchObject({
      actionRequiredCount: 1,
      unreadCount: 1,
    });
    expect(summary.deliveries).toHaveLength(2);
  });
});
