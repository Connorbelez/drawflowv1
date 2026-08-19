// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";

const { loadMore, usePaginatedQuery } = vi.hoisted(() => ({
  loadMore: vi.fn(),
  usePaginatedQuery: vi.fn(),
}));

vi.mock("convex/react", () => ({ usePaginatedQuery }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({
    children,
    params: _params,
    preload: _preload,
    search,
    to,
    viewTransition: _viewTransition,
    ...props
  }: {
    children: ReactNode;
    params?: unknown;
    preload?: unknown;
    search?: unknown;
    to: string;
    viewTransition?: unknown;
  }) => (
    <a data-search={JSON.stringify(search)} href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("#/components/lender-shell.tsx", () => ({
  LenderShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { api } from "../../../../convex/_generated/api";
import { LenderProposals } from "./index";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("renders the public lender Proposal list query through the production route", () => {
  usePaginatedQuery.mockImplementation(
    (_query: unknown, args: { view: string }) => ({
      loadMore,
      results:
        args.view === "withdrawn"
          ? [
              {
                assignedAt: Date.parse("2026-08-15T00:00:00.000Z"),
                assignmentId: "assignment_withdrawn",
                assignmentStatus: "withdrawn",
                buildName: "Frozen route Proposal",
                lenderConfirmation: "pending",
                location: "18 Frozen History Road",
                proposalId: "proposal_withdrawn",
                proposalStatus: "approved",
                readOnly: true,
                view: "withdrawn",
                withdrawnAt: Date.parse("2026-08-16T00:00:00.000Z"),
              },
            ]
          : args.view === "needs_action"
            ? [
                {
                  assignedAt: Date.parse("2026-08-17T00:00:00.000Z"),
                  assignmentId: "assignment_action",
                  assignmentStatus: "current",
                  buildName: "Action route Proposal",
                  lenderConfirmation: "pending",
                  location: "22 Review Street",
                  proposalId: "proposal_action",
                  proposalStatus: "approved",
                  readOnly: false,
                  view: "needs_action",
                },
              ]
            : [],
      status: args.view === "needs_action" ? "CanLoadMore" : "Exhausted",
    })
  );

  render(<LenderProposals />);

  expect(usePaginatedQuery).toHaveBeenCalledWith(
    api.lender_portal.listLenderAssignedProposalPage,
    { view: "needs_action" },
    { initialNumItems: 20 },
  );
  expect(screen.getByText("Action route Proposal")).toBeTruthy();
  expect(screen.getByText("Confirmation required")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Load more Proposals" }));
  expect(loadMore).toHaveBeenCalledWith(20);

  fireEvent.click(screen.getByRole("tab", { name: "Withdrawn" }));
  expect(screen.getByText("Frozen route Proposal")).toBeTruthy();
  expect(screen.getByText(/18 Frozen History Road/)).toBeTruthy();
  expect(screen.getAllByText("Withdrawn")).toHaveLength(2);
  expect(screen.getByText("Withdrawn record")).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Open Proposal Frozen route Proposal" })
      .getAttribute("data-search")
  ).toBe(JSON.stringify({ assignmentId: "assignment_withdrawn" }));

  fireEvent.click(screen.getByRole("tab", { name: "Approved" }));
  expect(usePaginatedQuery).toHaveBeenLastCalledWith(
    api.lender_portal.listLenderAssignedProposalPage,
    { view: "approved" },
    { initialNumItems: 20 },
  );
});
