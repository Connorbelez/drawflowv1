// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FunctionReturnType } from "convex/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "../../../convex/_generated/api";
import { BuilderProposalConfirmationStatus } from "./BuilderProposalConfirmationStatus";

type BuilderConfirmationState = FunctionReturnType<
  typeof api.production_proposals.getBuilderProposalConfirmationState
>;

afterEach(cleanup);

describe("BuilderProposalConfirmationStatus", () => {
  test("renders the Builder-safe update state without lender identity or private rationale", () => {
    const onLoadMoreHistory = vi.fn();
    const state = {
      currentProposalRevisionNumber: 3,
      history: {
        continueCursor: "",
        isDone: false,
        page: [
          {
            closedAt: 3,
            cycleNumber: 2,
            openedAt: 2,
            proposalRevisionNumber: 3,
            status: "declined",
            privateReason: "Do not expose this private rationale.",
            lenderOrganizationName: "Do not expose this lender.",
          },
        ],
      },
      lifecycle: {
        activation: "inactive",
        backOfficeApproval: "approved",
        capitalSource: "external",
        closing: "pending_closing",
        externalAssignment: "assigned",
        lenderConfirmation: "declined",
        proposalState: "approved",
      },
      updateRequired: true,
    } as unknown as BuilderConfirmationState;

    render(
      <BuilderProposalConfirmationStatus
        onLoadMoreHistory={onLoadMoreHistory}
        state={state}
      />
    );

    expect(screen.getByText("Back Office is preparing an updated revision")).toBeTruthy();
    expect(screen.getByText("Revision 3 · cycle 2")).toBeTruthy();
    expect(screen.queryByText("Do not expose this private rationale.")).toBeNull();
    expect(screen.queryByText("Do not expose this lender.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load older cycles" }));
    expect(onLoadMoreHistory).toHaveBeenCalledTimes(1);
  });
});
