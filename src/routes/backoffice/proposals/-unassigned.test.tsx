// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { UnassignedDraftsSurface } from "./unassigned";

afterEach(() => cleanup());

describe("UnassignedDraftsSurface", () => {
  test("renders broker-created unassigned drafts and opens a selected draft", () => {
    const openDraft = vi.fn();
    render(
      <UnassignedDraftsSurface
        drafts={[
          {
            address: "77 Workflow Way",
            builder: "Unassigned builder",
            createdAt: Date.parse("2026-05-29T12:00:00.000Z"),
            id: "proposal-1",
            loanAmount: "$1,250,000",
            name: "Broker setup workflow proposal",
            proposalId: "proposal-1",
            statusLabel: "Draft",
            totalBudgetCents: 125_000_000,
            updatedAt: Date.parse("2026-05-29T13:00:00.000Z"),
          },
        ]}
        onBack={vi.fn()}
        onNewBuild={vi.fn()}
        onOpenDraft={openDraft}
      />,
    );

    expect(screen.getByText("Unassigned Build Proposal drafts")).toBeTruthy();
    expect(screen.getByText("77 Workflow Way")).toBeTruthy();
    expect(screen.getByText("Unassigned")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open unassigned draft Broker setup workflow proposal",
      }),
    );

    expect(openDraft).toHaveBeenCalledWith(
      expect.objectContaining({ proposalId: "proposal-1" }),
    );
  });

  test("shows an accessible empty state with New Build entry point", () => {
    const newBuild = vi.fn();
    render(
      <UnassignedDraftsSurface
        drafts={[]}
        onBack={vi.fn()}
        onNewBuild={newBuild}
        onOpenDraft={vi.fn()}
      />,
    );

    expect(screen.getByText("No unassigned drafts")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start New Build" }));
    expect(newBuild).toHaveBeenCalledTimes(1);
  });
});
