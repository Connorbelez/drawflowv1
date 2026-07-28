// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  ContractorQuickAddDrawer,
  type ContractorProfileDraft,
} from "./ContractorQuickAddDrawer";

afterEach(() => cleanup());

describe("ContractorQuickAddDrawer", () => {
  test("creates new contractor profiles without collecting a single availability slot", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);

    render(
      <ContractorQuickAddDrawer
        onCreate={onCreate}
        onOpenChange={vi.fn()}
        open
      />,
    );

    expect(screen.queryByText("Start")).toBeNull();
    expect(screen.queryByText("End")).toBeNull();
    expect(
      screen.queryByText("Schedule, rate, capabilities, equipment")
    ).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Northstar Masonry"), {
      target: { value: "Northstar Masonry" },
    });
    fireEvent.change(screen.getByPlaceholderText("masonry, brick, envelope"), {
      target: { value: "masonry, brick" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create contractor" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0]?.[0].contractor.availabilityWindows).toEqual(
      [],
    );
  });

  test("preserves existing availability windows when editing a contractor profile", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const availabilityWindows: ContractorProfileDraft["availabilityWindows"] = [
      {
        dayOfWeek: 1,
        endMinute: 960,
        startMinute: 420,
        timezone: "America/Toronto",
      },
    ];

    render(
      <ContractorQuickAddDrawer
        createLabel="Save profile"
        initialDraft={{
          availabilityWindows,
          defaultPayRateUnit: "hour",
          kind: "company",
          name: "Northstar Masonry",
          trades: ["masonry"],
        }}
        onCreate={onCreate}
        onOpenChange={vi.fn()}
        open
        title="Edit contractor profile"
      />,
    );

    expect(screen.queryByText("Start")).toBeNull();
    expect(screen.queryByText("End")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0]?.[0].contractor.availabilityWindows).toEqual(
      availabilityWindows,
    );
  });

  test("can invite a newly created contractor when the create flow returns the profile id", async () => {
    const onCreate = vi.fn().mockResolvedValue("contractor_profile_1");
    const onInviteCreatedContractor = vi.fn().mockResolvedValue(undefined);

    render(
      <ContractorQuickAddDrawer
        onCreate={onCreate}
        onInviteCreatedContractor={onInviteCreatedContractor}
        onOpenChange={vi.fn()}
        open
      />,
    );

    const inviteCheckbox = screen.getByRole("checkbox", {
      name: /invite contractor to the platform/i,
    });
    expect(inviteCheckbox.hasAttribute("data-disabled")).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("Northstar Masonry"), {
      target: { value: "Northstar Masonry" },
    });
    fireEvent.change(screen.getByPlaceholderText("masonry, brick, envelope"), {
      target: { value: "masonry, brick" },
    });
    fireEvent.change(screen.getByPlaceholderText("ops@example.com"), {
      target: { value: "ops@northstar.test" },
    });
    fireEvent.click(inviteCheckbox);
    fireEvent.click(screen.getByRole("button", { name: "Create contractor" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onInviteCreatedContractor).toHaveBeenCalledWith(
      "contractor_profile_1",
    );
  });

  test("surfaces attach and invite for not-yet-invited existing contractors", async () => {
    const onAttachExisting = vi.fn().mockResolvedValue(undefined);
    const onInviteCreatedContractor = vi.fn().mockResolvedValue(undefined);

    render(
      <ContractorQuickAddDrawer
        availableContractors={[
          {
            _id: "contractor_existing_1",
            email: "ops@seed.test",
            name: "Seed Scenario Contractor LLC",
            onboardingStatus: "profile_only",
            trades: ["foundation", "framing"],
          },
        ]}
        onAttachExisting={onAttachExisting}
        onCreate={vi.fn()}
        onInviteCreatedContractor={onInviteCreatedContractor}
        onOpenChange={vi.fn()}
        open
        requireRole
        title="Add contractor to proposal"
      />,
    );

    expect(screen.getByText("Not invited")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Seed Scenario Contractor LLC/i,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Invite Seed Scenario Contractor LLC",
      }),
    );

    await waitFor(() =>
      expect(onAttachExisting).toHaveBeenCalledWith({
        contractorId: "contractor_existing_1",
        role: "Foundation",
      }),
    );
    expect(onInviteCreatedContractor).toHaveBeenCalledWith(
      "contractor_existing_1",
    );
  });
});
