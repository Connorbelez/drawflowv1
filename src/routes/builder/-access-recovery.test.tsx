// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { BuilderAccessRecovery } from "./index";

describe("BuilderAccessRecovery", () => {
  afterEach(cleanup);

  test("renders typed activation context, safe recovery actions, and no backend internals", () => {
    const onRequestHelp = vi.fn();
    const onRetry = vi.fn();
    const onSwitchOrganization = vi.fn();
    render(
      <BuilderAccessRecovery
        onRequestHelp={onRequestHelp}
        onRetry={onRetry}
        onSwitchOrganization={onSwitchOrganization}
        recovery={{
          intendedDestination: "/builder",
          invitationStatus: "pending",
          invitedEmail: "builder@example.com",
          kind: "projection-pending",
          organization: { id: "org_fairlend", name: "FairLend" },
          projectionStatus: "pending",
          requiredRole: "Builder",
          responsibleOwner: "Organization Admin or invitation sender",
          supportReference: "BLDR-0ABC123",
        }}
      />,
    );

    expect(screen.getByText("Access activation is still syncing")).toBeTruthy();
    expect(screen.getByText("FairLend")).toBeTruthy();
    expect(screen.getByText("builder@example.com")).toBeTruthy();
    expect(screen.getByText("Organization Admin or invitation sender")).toBeTruthy();
    expect(screen.getByText("BLDR-0ABC123")).toBeTruthy();
    expect(screen.getByText("/builder")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(
      /requestId|stack trace|validator|convex\//i,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry status check" }));
    fireEvent.click(screen.getByRole("button", { name: "Switch organization" }));
    fireEvent.click(screen.getByRole("button", { name: "Request help" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onSwitchOrganization).toHaveBeenCalledOnce();
    expect(onRequestHelp).toHaveBeenCalledOnce();
  });
});
