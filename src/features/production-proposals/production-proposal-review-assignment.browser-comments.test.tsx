// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ProposalLenderAssignmentSection } from "./ProposalLenderAssignmentSection";
import { BuilderAssignmentSection } from "./production-proposal-review-assignment";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

afterEach(() => cleanup());

describe("BuilderAssignmentSection lender placement", () => {
  test("places the canonical lender flow below Broker and Brokerage", () => {
    render(
      <BuilderAssignmentSection
        assignableBrokerages={[]}
        assignment={{
          broker: { name: "River Han", workosUserId: "user_broker" },
          brokerage: { displayName: "FairLend Brokerage" },
          builder: null,
          builderAssigned: false,
        }}
        brokerOptionsPending={false}
        builders={[]}
        lenderAssignmentSurface={
          <ProposalLenderAssignmentSection
            assignment={null}
            lenderOrganizations={[
              {
                lenderOrganizationId: "lender_northstar",
                lenderOrganizationName: "Northstar Lending",
              },
            ]}
            onAssign={vi.fn()}
            proposal={{
              buildName: "Hamilton Infill Build",
              location: "123 Hamilton Street",
              status: "approved",
            }}
          />
        }
        proposal={
          {
            _id: "proposal_1",
            buildName: "Hamilton Infill Build",
            status: "approved",
          } as never
        }
      />,
    );

    const partiesCard = screen
      .getByText("Parties & assignment")
      .closest('[data-slot="card"]');
    expect(partiesCard).toBeTruthy();
    const parties = within(partiesCard as HTMLElement);
    expect(parties.getByText("Broker")).toBeTruthy();
    expect(parties.getByText("Brokerage")).toBeTruthy();
    expect(parties.getByText("Lender assignment")).toBeTruthy();
    expect(
      parties.getByRole("button", { name: "Assign lender" }),
    ).toBeTruthy();
    expect(
      parties.getByTestId("proposal-parties-lender-assignment"),
    ).toBeTruthy();
  });

  test("does not render redacted assignment fields for a builder projection", () => {
    render(
      <BuilderAssignmentSection
        assignableBrokerages={[]}
        assignment={{
          builder: {
            _id: "builder_1",
            displayName: "Hamilton Build Co.",
            status: "active",
          },
          builderAssigned: true,
        }}
        brokerOptionsPending={false}
        builders={[]}
        proposal={
          {
            _id: "proposal_1",
            buildName: "Hamilton Infill Build",
            status: "draft",
          } as never
        }
      />,
    );

    expect(screen.getByText("Hamilton Build Co.")).toBeTruthy();
    expect(screen.queryByText("Owner and staff")).toBeNull();
    expect(screen.queryByText("Broker")).toBeNull();
    expect(screen.queryByText("Brokerage")).toBeNull();
    expect(screen.queryByText("Unassigned")).toBeNull();
    expect(screen.queryByText("Unknown brokerage")).toBeNull();
  });
});
