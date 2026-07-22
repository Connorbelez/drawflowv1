// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { TenantActivationRecovery } from "./protected-access";

describe("TenantActivationRecovery", () => {
  afterEach(cleanup);

  test("shows scoped invitation, role, projection, capability, owner, and safe reference data", () => {
    render(
      <TenantActivationRecovery
        activation={{
          actions: [
            "retry-projection",
            "switch-organization",
            "contact-platform-admin",
          ],
          affectedWorkWarning:
            "Workspace capabilities and assigned work may change when this access update takes effect.",
          capabilityDelta: {
            gained: ["Principle Broker"],
            lost: ["Broker"],
          },
          currentRoles: ["Broker"],
          effectiveAt: Date.UTC(2026, 6, 20),
          intendedDestination: "/backoffice",
          intendedRoles: ["Principle Broker"],
          invitationStatus: "active",
          invitedEmail: "principal@example.com",
          organization: { id: "org_fairlend", name: "FairLend" },
          projectionStatus: "pending",
          requiredRole: "Principle Broker",
          responsibleOwner: "Organization Admin",
          state: "role-change-pending",
          supportReference: "TEN-0ABC123",
        }}
      />,
    );

    expect(screen.getByText("Role change is still syncing")).toBeTruthy();
    expect(screen.getByText("FairLend")).toBeTruthy();
    expect(screen.getByText("principal@example.com")).toBeTruthy();
    expect(screen.getByText("Organization Admin")).toBeTruthy();
    expect(screen.getByText("TEN-0ABC123")).toBeTruthy();
    expect(screen.getByText(/Capability change:/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry projection check" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Switch organization" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Request help" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(
      /requestId|stack trace|validator|workosOrganizationMemberships|convex\//i,
    );
  });

  test("routes technical admin-only recovery to integrations", () => {
    render(
      <TenantActivationRecovery
        activation={{
          actions: ["open-integrations", "switch-organization"],
          capabilityDelta: { gained: [], lost: [] },
          currentRoles: ["Technical Admin"],
          intendedDestination: "/backoffice/integrations",
          intendedRoles: ["Technical Admin"],
          invitationStatus: "active",
          organization: { id: "org_fairlend", name: "FairLend" },
          projectionStatus: "ready",
          requiredRole: "Technical Admin",
          responsibleOwner: "Current organization",
          state: "integration-only",
          supportReference: "TEN-0XYZ789",
        }}
      />,
    );

    expect(screen.getByText("Integration access only")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open integrations" })).toBeTruthy();
    expect(screen.queryByText("Workspace access required")).toBeNull();
  });
});
