import { describe, expect, test } from "vitest";

import {
  externalDeliveryPlan,
  nextBuildCollaborationDigestAt,
  nextBuildCollaborationRetryAt,
} from "./build_collaboration_delivery_model";

describe("Build collaboration external delivery model", () => {
  test("delivers direct and critical email immediately while keeping push opt-in", () => {
    expect(
      externalDeliveryPlan({
        channels: undefined,
        digestCadence: undefined,
        digestEnabled: undefined,
        kind: "direct_mention",
        ordinaryMuted: undefined,
      })
    ).toEqual([{ cadence: "immediate", channel: "email" }]);
    expect(
      externalDeliveryPlan({
        channels: ["in_app", "email", "push"],
        digestCadence: "weekly",
        digestEnabled: true,
        kind: "required_approval",
        ordinaryMuted: false,
      })
    ).toEqual([
      { cadence: "immediate", channel: "email" },
      { cadence: "immediate", channel: "push" },
    ]);
    expect(
      externalDeliveryPlan({
        channels: ["in_app", "email"],
        digestCadence: "daily",
        digestEnabled: true,
        kind: "ordinary_activity",
        ordinaryMuted: false,
      })
    ).toEqual([{ cadence: "daily", channel: "email" }]);
  });

  test("honours ordinary mute and digest preferences without suppressing mandatory work", () => {
    expect(
      externalDeliveryPlan({
        channels: ["email", "push"],
        digestCadence: "weekly",
        digestEnabled: true,
        kind: "ordinary_activity",
        ordinaryMuted: true,
      })
    ).toEqual([]);
    expect(
      externalDeliveryPlan({
        channels: ["email"],
        digestCadence: "never",
        digestEnabled: false,
        kind: "followed_reply",
        ordinaryMuted: false,
      })
    ).toEqual([]);
    expect(
      externalDeliveryPlan({
        channels: ["email"],
        digestCadence: "never",
        digestEnabled: false,
        kind: "assignment",
        ordinaryMuted: true,
      })
    ).toEqual([{ cadence: "immediate", channel: "email" }]);
  });

  test("uses stable UTC digest boundaries and bounded exponential retry", () => {
    const friday = Date.parse("2026-07-31T14:30:00.000Z");
    expect(nextBuildCollaborationDigestAt(friday, "daily")).toBe(
      Date.parse("2026-08-01T13:00:00.000Z")
    );
    expect(nextBuildCollaborationDigestAt(friday, "weekly")).toBe(
      Date.parse("2026-08-03T13:00:00.000Z")
    );
    expect(nextBuildCollaborationRetryAt(friday, 1)).toBe(friday + 60_000);
    expect(nextBuildCollaborationRetryAt(friday, 12)).toBe(
      friday + 6 * 60 * 60 * 1000
    );
  });
});
