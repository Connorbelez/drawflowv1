// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const convexMocks = vi.hoisted(() => ({
  provisionNewBuilder: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useAction: () => convexMocks.provisionNewBuilder,
}));

import { ProvisionBuilderWizard } from "./ProvisionBuilderWizard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProvisionBuilderWizard", () => {
  test("runs proposal attachment after provisioning and exposes the return action", async () => {
    const provisioned = {
      builderProfileId: "builder_northline",
      displayName: "Northline Homes",
      invite: {
        adapter: "fake",
        status: "accepted",
        sync: "waiting-for-webhook",
      },
      operation: "created" as const,
      ownerEmail: "owner@northline.example",
      ownerWorkosUserId: "user_northline_owner",
    };
    convexMocks.provisionNewBuilder.mockResolvedValue(provisioned);
    const onProvisioned = vi.fn().mockResolvedValue(undefined);
    const onReturnToProposal = vi.fn();

    render(
      <ProvisionBuilderWizard
        attachToProposal
        onProvisioned={onProvisioned}
        onReturnToProposal={onReturnToProposal}
      />,
    );

    fireEvent.change(screen.getByLabelText("Builder company name"), {
      target: { value: "Northline Homes" },
    });
    fireEvent.change(screen.getByLabelText("Owner email"), {
      target: { value: "owner@northline.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Create account & provision" }),
    );

    await waitFor(() =>
      expect(onProvisioned).toHaveBeenCalledWith(provisioned),
    );
    expect(
      await screen.findByText(/now attached to the Build Proposal/i),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Return to Build Proposal" }),
    );
    expect(onReturnToProposal).toHaveBeenCalledTimes(1);
  });

  test("does not report completion when automatic attachment fails", async () => {
    convexMocks.provisionNewBuilder.mockResolvedValue({
      builderProfileId: "builder_northline",
      displayName: "Northline Homes",
      invite: {
        adapter: "fake",
        status: "accepted",
        sync: "waiting-for-webhook",
      },
      operation: "created",
      ownerEmail: "owner@northline.example",
      ownerWorkosUserId: "user_northline_owner",
    });
    const onProvisioned = vi
      .fn()
      .mockRejectedValue(new Error("Proposal assignment failed."));

    render(
      <ProvisionBuilderWizard attachToProposal onProvisioned={onProvisioned} />,
    );

    fireEvent.change(screen.getByLabelText("Builder company name"), {
      target: { value: "Northline Homes" },
    });
    fireEvent.change(screen.getByLabelText("Owner email"), {
      target: { value: "owner@northline.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Create account & provision" }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Proposal assignment failed.",
    );
    expect(
      screen.queryByRole("button", { name: "Return to Build Proposal" }),
    ).toBeNull();
  });
});
