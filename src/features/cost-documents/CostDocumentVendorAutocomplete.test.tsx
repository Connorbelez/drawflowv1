// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const useQuery = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
}));

import type { Id } from "../../../convex/_generated/dataModel";
import { CostDocumentVendorAutocomplete } from "./CostDocumentVendorAutocomplete";

describe("CostDocumentVendorAutocomplete", () => {
  afterEach(() => cleanup());

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
