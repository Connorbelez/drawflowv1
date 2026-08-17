import { describe, expect, test } from "vitest";

import { notificationSignInHref } from "./$intentId.tsx";

describe("notification link route", () => {
  test("preserves the opaque intent route through sign-in", () => {
    expect(notificationSignInHref("intent/with spaces")).toBe(
      "/api/auth/sign-in?returnPathname=%2Fnotifications%2Fintent%252Fwith%2520spaces",
    );
  });
});
