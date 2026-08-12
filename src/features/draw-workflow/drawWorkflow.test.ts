import { describe, expect, test } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";
import {
  drawWorkflowReadCapabilitiesForRoles,
  drawWorkflowRouteContextForRoles,
  getDrawWorkflowActions,
  resolveDrawWorkflow,
  type DrawWorkflowCapabilities,
} from "./drawWorkflow.ts";

const lenderCapabilities: DrawWorkflowCapabilities = {
  canApprove: true,
  canOpenCanonical: true,
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
        canOpenCanonical: false,
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

  test("uses the lender admin decision context for ready Draws", () => {
    const resolution = resolveDrawWorkflow({
      capabilities: lenderCapabilities,
      drawId: "draw-request-1" as Id<"activeBuildDrawRequests">,
      routeContext: "lender_admin",
      status: "ready_for_admin",
      viewerRoles: ["admin"],
    });

    expect(resolution.target).toEqual({
      drawId: "draw-request-1",
      kind: "draw",
    });
    expect(resolution.actions.open).toMatchObject({
      context: "decision",
      kind: "navigation",
      label: "Open review",
    });
    expect(resolution.actions.primary?.kind).toBe("mutation");
  });

  test("gives recognized builders read-only access to Draw history", () => {
    const capabilities = drawWorkflowReadCapabilitiesForRoles(["builder"]);
    const resolution = resolveDrawWorkflow({
      capabilities,
      drawId: "draw-request-1" as Id<"activeBuildDrawRequests">,
      routeContext: drawWorkflowRouteContextForRoles(["builder"]),
      status: "released",
      viewerRoles: ["builder"],
    });

    expect(capabilities.canOpenCanonical).toBe(true);
    expect(resolution.actions.open).toMatchObject({
      context: "detail",
      label: "Open draw",
    });
    expect(resolution.actions.primary).toBeUndefined();
    expect(resolution.actions.secondary).toBeUndefined();
  });

  test("does not expose a Draw entrypoint to an unauthorized role", () => {
    const roles = ["contractor"];
    const resolution = resolveDrawWorkflow({
      capabilities: drawWorkflowReadCapabilitiesForRoles(roles),
      drawId: "draw-request-1" as Id<"activeBuildDrawRequests">,
      routeContext: drawWorkflowRouteContextForRoles(roles),
      status: "in_review",
      viewerRoles: roles,
    });

    expect(resolution.actions.open).toBeUndefined();
    expect(resolution.actions.primary).toBeUndefined();
  });

  test.each([
    "planned",
    "approved_for_release",
    "rejected",
    "withdrawn",
    "cancelled",
    "released",
  ] as const)("keeps %s Draws available as read-only history", (status) => {
    const actions = getDrawWorkflowActions({
      canonicalIdAvailable: true,
      capabilities: drawWorkflowReadCapabilitiesForRoles(["admin"]),
      routeContext: "lender_admin",
      status,
    });

    expect(actions.open).toMatchObject({
      context: "detail",
      label: "Open draw",
    });
    expect(actions.primary).toBeUndefined();
    expect(actions.secondary).toBeUndefined();
  });

  test.each([
    ["builder", "detail", "Open draw"],
    ["broker", "review", "Open review"],
    ["admin", "review", "Open review"],
  ] as const)(
    "resolves role-specific read context for %s viewers",
    (role, context, label) => {
      const roles = [role];
      const actions = getDrawWorkflowActions({
        canonicalIdAvailable: true,
        capabilities: drawWorkflowReadCapabilitiesForRoles(roles),
        routeContext: drawWorkflowRouteContextForRoles(roles),
        status: "in_review",
      });

      expect(actions.open).toMatchObject({ context, label });
      expect(actions.primary).toBeUndefined();
      expect(actions.secondary).toBeUndefined();
    },
  );
});
