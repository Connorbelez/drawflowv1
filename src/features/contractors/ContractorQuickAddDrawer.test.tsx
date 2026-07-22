// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
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

  test("redacts backend internals when creating a contractor fails", async () => {
    const onCreate = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "ConvexError production_proposals.createAndAttachActiveBuildContractor requestId=req-secret payload={name:secret} /srv/convex/production_proposals.ts",
        ),
      );

    render(
      <ContractorQuickAddDrawer
        onCreate={onCreate}
        onOpenChange={vi.fn()}
        open
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Northstar Masonry"), {
      target: { value: "Northstar Masonry" },
    });
    fireEvent.change(screen.getByPlaceholderText("masonry, brick, envelope"), {
      target: { value: "masonry" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create contractor" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Unable to create this contractor. Review the profile details and try again.",
        ),
      ).toBeTruthy(),
    );
    expect(screen.queryByText(/ConvexError|requestId|payload=|\/srv\//i)).toBeNull();
  });

  test("uses one atomic attach-and-invite action for existing contractors", async () => {
    const onAttachExisting = vi.fn().mockResolvedValue(undefined);
    const onAttachAndInviteExisting = vi.fn().mockResolvedValue(undefined);

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
        onAttachAndInviteExisting={onAttachAndInviteExisting}
        onAttachExisting={onAttachExisting}
        onCreate={vi.fn()}
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
      expect(onAttachAndInviteExisting).toHaveBeenCalledWith({
        contractorId: "contractor_existing_1",
        role: "Foundation",
      }),
    );
    expect(onAttachExisting).not.toHaveBeenCalled();
  });

  test("redacts backend internals when attaching an existing contractor fails", async () => {
    const onAttachExisting = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "ConvexError production_proposals.attachActiveBuildContractor requestId=req-secret payload={contractorId:secret} /srv/convex/production_proposals.ts",
        ),
      );

    render(
      <ContractorQuickAddDrawer
        availableContractors={[
          {
            _id: "contractor_existing_1",
            email: "ops@seed.test",
            name: "Seed Scenario Contractor LLC",
            onboardingStatus: "profile_only",
            trades: ["foundation"],
          },
        ]}
        onAttachExisting={onAttachExisting}
        onCreate={vi.fn()}
        onOpenChange={vi.fn()}
        open
        requireRole
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Seed Scenario Contractor LLC/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Attach contractor" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Unable to attach this contractor. The current contractor state was preserved; try again.",
        ),
      ).toBeTruthy(),
    );
    expect(screen.queryByText(/ConvexError|requestId|payload=|\/srv\//i)).toBeNull();
  });

  test("redacts backend internals when attach and invite fails", async () => {
    const onAttachAndInviteExisting = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "ConvexError contractorOnboarding.attachAndInvite at /srv/convex/contractorOnboarding.ts requestId=req-secret payload={contractorId:secret}",
        ),
      );

    render(
      <ContractorQuickAddDrawer
        availableContractors={[
          {
            _id: "contractor_existing_1",
            email: "ops@seed.test",
            name: "Seed Scenario Contractor LLC",
            onboardingStatus: "profile_only",
            trades: ["foundation"],
          },
        ]}
        onAttachAndInviteExisting={onAttachAndInviteExisting}
        onAttachExisting={vi.fn()}
        onCreate={vi.fn()}
        onOpenChange={vi.fn()}
        open
        requireRole
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Seed Scenario Contractor LLC/i }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Invite Seed Scenario Contractor LLC",
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "Unable to attach and invite this contractor. The current contractor state was preserved; try again.",
        ),
      ).toBeTruthy(),
    );
    expect(screen.queryByText(/ConvexError|requestId|payload=|\/srv\//i)).toBeNull();
  });

  test("identifies an invalid email, explains the disabled action, and recovers in place", () => {
    render(
      <ContractorQuickAddDrawer
        onCreate={vi.fn()}
        onInviteCreatedContractor={vi.fn()}
        onOpenChange={vi.fn()}
        open
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Northstar Masonry"), {
      target: { value: "Northstar Masonry" },
    });
    fireEvent.change(screen.getByPlaceholderText("masonry, brick, envelope"), {
      target: { value: "masonry" },
    });
    const email = screen.getByPlaceholderText("ops@example.com");
    fireEvent.change(email, { target: { value: "not-an-email" } });
    fireEvent.blur(email);

    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(email.getAttribute("aria-describedby")).toContain(
      "contractor-email-error",
    );
    expect(
      screen.getByText("Enter an email address in the format name@example.com."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Create contractor is unavailable because Email needs a valid address such as name@example.com.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create contractor" }).hasAttribute(
        "disabled",
      ),
    ).toBe(true);

    fireEvent.change(email, { target: { value: "ops@northstar.test" } });

    expect(email.hasAttribute("aria-invalid")).toBe(false);
    expect(screen.queryByText(/Enter an email address in the format/i)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Create contractor" }).hasAttribute(
        "disabled",
      ),
    ).toBe(false);
  });

  test("keeps inactive mode controls out of the DOM and roster actions unnested", () => {
    render(
      <ContractorQuickAddDrawer
        availableContractors={[
          {
            _id: "contractor_existing_1",
            email: "ops@seed.test",
            name: "Seed Scenario Contractor LLC",
            onboardingStatus: "profile_only",
            trades: ["foundation"],
          },
        ]}
        onAttachAndInviteExisting={vi.fn()}
        onAttachExisting={vi.fn()}
        onCreate={vi.fn()}
        onOpenChange={vi.fn()}
        open
      />,
    );

    const existingMode = screen.getByRole("button", { name: "Existing" });
    const newMode = screen.getByRole("button", { name: "New" });
    expect(existingMode.getAttribute("aria-pressed")).toBe("true");
    expect(newMode.getAttribute("aria-pressed")).toBe("false");

    const rosterChoice = screen.getByRole("button", {
      name: /Seed Scenario Contractor LLC/i,
    });
    fireEvent.click(rosterChoice);
    const invite = screen.getByRole("button", {
      name: "Invite Seed Scenario Contractor LLC",
    });
    expect(rosterChoice.contains(invite)).toBe(false);
    expect(rosterChoice.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(newMode);
    expect(screen.queryByPlaceholderText("Search name, trade, or city")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Seed Scenario Contractor LLC/i }),
    ).toBeNull();
  });

  test("moves focus into one drawer and returns it to the invoking control", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)} type="button">
            Add contractor
          </button>
          <ContractorQuickAddDrawer
            onCreate={vi.fn()}
            onOpenChange={setOpen}
            open={open}
          />
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Add contractor" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
