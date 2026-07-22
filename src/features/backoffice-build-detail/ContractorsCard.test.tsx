// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
}));

import { ContractorsCard } from "./ContractorsCard";

describe("ContractorsCard relationship lifecycle", () => {
  afterEach(() => cleanup());

  test("omits add controls for a production roster without contractor write actions", () => {
    render(
      <ContractorsCard
        actions={{ sourceLabel: "production_contractors" }}
        availableContractors={[]}
        buildId="build-01"
        contractors={[]}
      />
    );

    expect(
      screen.queryByRole("button", { name: "Add contractor" })
    ).toBeNull();
  });

  test("names attached, invited, and acknowledgement-pending states", () => {
    render(
      <ContractorsCard
        availableContractors={[]}
        buildId="build-01"
        contractors={[
          {
            _id: "attachment-01",
            contractorId: "contractor-01",
            lifecycleState: "attached",
            name: "Attached Crew",
            role: "Masonry",
          },
          {
            _id: "attachment-02",
            contractorId: "contractor-02",
            lifecycleState: "invited",
            name: "Invited Crew",
            role: "Electrical",
          },
          {
            _id: "attachment-03",
            contractorId: "contractor-03",
            lifecycleState: "acknowledgement_pending",
            name: "Assigned Crew",
            role: "Plumbing",
          },
        ]}
      />
    );

    expect(screen.getByText("Attached · Not invited")).toBeTruthy();
    expect(screen.getByText("Invited · Claim pending")).toBeTruthy();
    expect(screen.getByText("Assigned · Acknowledgement pending")).toBeTruthy();
  });
});
