// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { DrawReviewSheet } from "./DrawReviewSheet.tsx";

afterEach(cleanup);

describe("DrawReviewSheet canonical history", () => {
  test("renders retained review-cycle decisions and keeps Action Items independent from Collaboration", () => {
    render(
      <DrawReviewSheet
        amountCents={1_000_000}
        buildLabel="Harbourline Residences"
        collaborationAction={<p>Participant-visible update</p>}
        details={[]}
        displayId="DRAW-01"
        drawLabel="Foundation reimbursement"
        history={[
          {
            actor: "Lender",
            createdAt: Date.parse("2026-08-16T12:00:00.000Z"),
            id: "decision-1",
            title: "Cycle 1 approved",
          },
        ]}
        onClose={vi.fn()}
        open
        status="approved_for_release"
        viewerRole="lender"
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Decision" }));
    expect(screen.getByText("Review history")).toBeTruthy();
    expect(screen.getByText("Cycle 1 approved")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Action Items" }));
    expect(
      screen.getByText("Linked Action Items are not available from this route.")
    ).toBeTruthy();
    expect(screen.queryByText("Participant-visible update")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Collaboration" }));
    expect(screen.getByText("Participant-visible update")).toBeTruthy();
  });
});
