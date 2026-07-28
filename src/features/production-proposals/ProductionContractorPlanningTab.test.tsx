// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useMutation } from "convex/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ProductionContractorPlanningTab } from "./ProductionContractorPlanningTab";

vi.mock("convex/react", () => ({ useMutation: vi.fn() }));

const mutations = {
  assign: vi.fn(),
  attach: vi.fn(),
  attachAndInvite: vi.fn(),
  createAndAttach: vi.fn(),
  invite: vi.fn(),
};

beforeEach(() => {
  Object.values(mutations).forEach((mutation) => mutation.mockReset());
  vi.mocked(useMutation)
    .mockReturnValueOnce(mutations.attach)
    .mockReturnValueOnce(mutations.attachAndInvite)
    .mockReturnValueOnce(mutations.createAndAttach)
    .mockReturnValueOnce(mutations.invite)
    .mockReturnValueOnce(mutations.assign);
});

afterEach(() => cleanup());

describe("ProductionContractorPlanningTab", () => {
  test("routes existing-contractor invites through one atomic proposal mutation", async () => {
    mutations.attachAndInvite.mockResolvedValue(undefined);
    render(
      <ProductionContractorPlanningTab
        proposalId={"proposal_1" as any}
        workosOrganizationId="org_1"
        workspace={
          {
            contractorPlanning: {
              availableContractors: [
                {
                  _id: "contractor_1",
                  email: "crew@example.com",
                  name: "Lifecycle Foundation Crew",
                  onboardingStatus: "profile_only",
                  trades: ["foundation"],
                },
              ],
              conflicts: [],
              milestoneAssignments: [],
              proposalContractors: [],
            },
            milestones: [
              {
                key: "foundation",
                name: "Foundation",
                submilestoneSnapshot: [],
              },
            ],
          } as any
        }
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add contractor" }));
    fireEvent.click(
      screen.getByRole("button", { name: /Lifecycle Foundation Crew/i }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Invite Lifecycle Foundation Crew",
      }),
    );

    await waitFor(() =>
      expect(mutations.attachAndInvite).toHaveBeenCalledWith({
        contractorId: "contractor_1",
        proposalId: "proposal_1",
        role: "Foundation",
        workosOrganizationId: "org_1",
      }),
    );
    expect(mutations.attach).not.toHaveBeenCalled();
    expect(mutations.invite).not.toHaveBeenCalled();
  });
});
