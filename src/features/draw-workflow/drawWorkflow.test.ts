import { describe, expect, test } from "vitest";

import {
  getDrawWorkflowActions,
  type DrawWorkflowCapabilities,
} from "./drawWorkflow.ts";

const lenderCapabilities: DrawWorkflowCapabilities = {
  canApprove: true,
  canOpenReview: true,
  canReject: true,
  canRelease: true,
  canStartReview: true,
  canSubmitForAdmin: true,
};

describe("getDrawWorkflowActions", () => {
  test.each([
    ["requested", "Review request", "Start review"],
    ["in_review", "Open review", "Send to admin"],
    ["ready_for_admin", "Open review", "Approve for release"],
    ["approved_for_release", "Open draw", "Release"],
  ] as const)(
    "returns one canonical action model for %s draws",
    (status, openLabel, primaryLabel) => {
      const actions = getDrawWorkflowActions({
        canonicalIdAvailable: true,
        capabilities: lenderCapabilities,
        status,
      });

      expect(actions.open).toMatchObject({
        kind: "navigation",
        label: openLabel,
      });
      expect(actions.primary).toMatchObject({
        kind: "mutation",
        label: primaryLabel,
      });
    },
  );

  test("keeps the final decision actions capability-gated", () => {
    const actions = getDrawWorkflowActions({
      canonicalIdAvailable: true,
      capabilities: {
        ...lenderCapabilities,
        canApprove: false,
        canReject: false,
        canRelease: false,
      },
      status: "ready_for_admin",
    });

    expect(actions.open?.label).toBe("Open review");
    expect(actions.primary).toBeUndefined();
    expect(actions.secondary).toBeUndefined();
  });

  test("keeps an admin in-review request as a canonical open-only entrypoint", () => {
    const actions = getDrawWorkflowActions({
      canonicalIdAvailable: true,
      capabilities: {
        ...lenderCapabilities,
        canApprove: false,
        canReject: false,
        canRelease: false,
        canSubmitForAdmin: false,
      },
      status: "in_review",
    });

    expect(actions.open).toMatchObject({
      kind: "navigation",
      label: "Open review",
      operation: "open_review",
    });
    expect(actions.primary).toBeUndefined();
    expect(actions.secondary).toBeUndefined();
  });

  test("does not expose a navigation action without a canonical Draw id", () => {
    const actions = getDrawWorkflowActions({
      canonicalIdAvailable: false,
      capabilities: lenderCapabilities,
      status: "requested",
    });

    expect(actions.open).toBeUndefined();
    expect(actions.primary?.label).toBe("Start review");
  });

  test("does not expose lender review actions to a builder capability set", () => {
    const actions = getDrawWorkflowActions({
      canonicalIdAvailable: true,
      capabilities: {
        canApprove: false,
        canOpenReview: false,
        canReject: false,
        canRelease: false,
        canStartReview: false,
        canSubmitForAdmin: false,
      },
      status: "requested",
    });

    expect(actions.open).toBeUndefined();
    expect(actions.primary).toBeUndefined();
    expect(actions.secondary).toBeUndefined();
  });
});
