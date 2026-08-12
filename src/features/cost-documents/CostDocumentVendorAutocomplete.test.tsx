// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const { createVendorProfile, useQuery } = vi.hoisted(() => ({
  createVendorProfile: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: () => createVendorProfile,
  useQuery: (...args: unknown[]) => useQuery(...args),
}));

import type { Id } from "../../../convex/_generated/dataModel";
import { CostDocumentVendorAutocomplete } from "./CostDocumentVendorAutocomplete";

describe("CostDocumentVendorAutocomplete", () => {
  afterEach(() => {
    cleanup();
    createVendorProfile.mockReset();
    useQuery.mockReset();
  });

  test("creates a new organization party and immediately selects it", async () => {
    const onValueChange = vi.fn();
    useQuery.mockImplementation((_reference, args: unknown) =>
      args && typeof args === "object" && "search" in args
        ? []
        : { canCreate: true }
    );
    createVendorProfile.mockResolvedValue({
      created: true,
      duplicateOptions: [],
      option: {
        city: "Toronto",
        email: "accounts@northstar.example",
        name: "Northstar Supply",
        partyType: "supplier",
        profileId: "vendor-profile-new",
      },
    });

    render(
      <CostDocumentVendorAutocomplete
        buildId={"build-1" as Id<"activeBuilds">}
        onValueChange={onValueChange}
        organizationId="org-1"
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Add a vendor, supplier, or contractor/i,
      })
    );
    fireEvent.change(screen.getByLabelText("Party type"), {
      target: { value: "supplier" },
    });
    fireEvent.change(screen.getByLabelText("Party name"), {
      target: { value: "Northstar Supply" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "accounts@northstar.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create party" }));

    await waitFor(() =>
      expect(onValueChange).toHaveBeenLastCalledWith({
        displayName: "Northstar Supply",
        profileId: "vendor-profile-new",
      })
    );
    expect(createVendorProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        buildId: "build-1",
        email: "accounts@northstar.example",
        name: "Northstar Supply",
        organizationId: "org-1",
        partyType: "supplier",
      })
    );
  });

  test("cancels inline creation without changing the draft value", () => {
    const onValueChange = vi.fn();
    useQuery.mockImplementation((_reference, args: unknown) =>
      args && typeof args === "object" && "search" in args
        ? []
        : { canCreate: true }
    );

    render(
      <CostDocumentVendorAutocomplete
        buildId={"build-1" as Id<"activeBuilds">}
        legacyVendorName="Unresolved vendor"
        onValueChange={onValueChange}
        organizationId="org-1"
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Add a vendor, supplier, or contractor/i,
      })
    );
    expect(screen.getByLabelText("Party name")).not.toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);

    expect(screen.queryByLabelText("Party name")).toBeNull();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  test("shows a near-match and lets the uploader select the existing party", async () => {
    const onValueChange = vi.fn();
    const existingOption = {
      city: "Toronto",
      email: "accounts@cedar.example",
      name: "Cedar Forming Ltd.",
      partyType: "contractor",
      profileId: "vendor-profile-1",
    };
    useQuery.mockImplementation((_reference, args: unknown) =>
      args && typeof args === "object" && "search" in args
        ? [existingOption]
        : { canCreate: true }
    );
    createVendorProfile.mockResolvedValue({
      created: false,
      duplicateOptions: [existingOption],
    });

    render(
      <CostDocumentVendorAutocomplete
        buildId={"build-1" as Id<"activeBuilds">}
        onValueChange={onValueChange}
        organizationId="org-1"
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Add a vendor, supplier, or contractor/i,
      })
    );
    fireEvent.change(screen.getByLabelText("Party name"), {
      target: { value: "Cedar Forming" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create party" }));

    expect(
      await screen.findByText("Possible existing party")
    ).not.toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Use Cedar Forming Ltd." })
    );

    expect(onValueChange).toHaveBeenLastCalledWith({
      displayName: "Cedar Forming Ltd.",
      profileId: "vendor-profile-1",
    });
    expect(createVendorProfile).toHaveBeenCalledWith(
      expect.objectContaining({ allowDuplicate: false })
    );
    expect(createVendorProfile).toHaveBeenCalledTimes(1);
  });

  test("shows a clear no-permission state when party creation is denied", () => {
    useQuery.mockImplementation((_reference, args: unknown) =>
      args && typeof args === "object" && "search" in args
        ? []
        : { canCreate: false }
    );

    render(
      <CostDocumentVendorAutocomplete
        buildId={"build-1" as Id<"activeBuilds">}
        onValueChange={vi.fn()}
        organizationId="org-1"
      />
    );

    expect(
      screen.getByText(
        "Your current role cannot create a new organization party from Cost Document capture."
      )
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", {
        name: /Add a vendor, supplier, or contractor/i,
      })
    ).toBeNull();
  });

  test("does not show party creation while access is still loading", () => {
    useQuery.mockImplementation((_reference, args: unknown) =>
      args && typeof args === "object" && "search" in args ? [] : undefined
    );

    render(
      <CostDocumentVendorAutocomplete
        buildId={"build-1" as Id<"activeBuilds">}
        onValueChange={vi.fn()}
        organizationId="org-1"
      />
    );

    expect(
      screen.queryByRole("button", {
        name: /Add a vendor, supplier, or contractor/i,
      })
    ).toBeNull();
  });

  test("clears contact fields when the inline party form is reopened", () => {
    useQuery.mockImplementation((_reference, args: unknown) =>
      args && typeof args === "object" && "search" in args
        ? []
        : { canCreate: true }
    );

    render(
      <CostDocumentVendorAutocomplete
        buildId={"build-1" as Id<"activeBuilds">}
        onValueChange={vi.fn()}
        organizationId="org-1"
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Add a vendor, supplier, or contractor/i,
      })
    );
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "contact@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Phone"), {
      target: { value: "416-555-0100" },
    });
    fireEvent.change(screen.getByLabelText("City"), {
      target: { value: "Toronto" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);
    fireEvent.click(
      screen.getByRole("button", {
        name: /Add a vendor, supplier, or contractor/i,
      })
    );

    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Phone") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("City") as HTMLInputElement).value).toBe("");
  });

  test("shows unresolved legacy text and links an existing organization party", async () => {
    const onValueChange = vi.fn();
    useQuery.mockReturnValue([
      {
        city: "Toronto",
        email: "accounts@cedar.example",
        name: "Cedar Forming Ltd.",
        partyType: "contractor",
        profileId: "vendor-profile-1",
      },
    ]);

    render(
      <CostDocumentVendorAutocomplete
        buildId={"build-1" as Id<"activeBuilds">}
        legacyVendorName="Cedar Forming Ltd. (legacy)"
        onValueChange={onValueChange}
        organizationId="org-1"
      />
    );

    expect(
      screen.getByText(/Unresolved legacy vendor text: Cedar Forming Ltd\./)
    ).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Vendor"), {
      target: { value: "Cedar Forming Ltd." },
    });
    fireEvent.click(
      await screen.findByRole("option", { name: /Cedar Forming Ltd\./ })
    );

    expect(onValueChange).toHaveBeenLastCalledWith({
      displayName: "Cedar Forming Ltd.",
      profileId: "vendor-profile-1",
    });
  });
});
