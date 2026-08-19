// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const usePaginatedQueryMock = vi.hoisted(() => vi.fn());
const completeSiteVisitMock = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useMutation: () => completeSiteVisitMock,
  usePaginatedQuery: usePaginatedQueryMock,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { LenderMilestoneSiteVisitCompletion } from "./LenderMilestoneSiteVisitCompletion.tsx";

const readyCandidate = {
  canComplete: true,
  completionBlocker: null,
  locationUnverifiedPhotoCount: 1,
  photoCount: 2,
  requestedAt: "2026-08-15T13:00:00.000Z",
  siteVisitId: "visit_1",
  updatedAt: 123,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LenderMilestoneSiteVisitCompletion", () => {
  test("completes an authorized requested Site Visit through the canonical command", async () => {
    usePaginatedQueryMock.mockReturnValue({
      loadMore: vi.fn(),
      results: [readyCandidate],
      status: "Exhausted",
    });
    completeSiteVisitMock.mockResolvedValue({
      replayed: false,
      siteVisitId: "visit_1",
      status: "complete",
    });

    render(<LenderMilestoneSiteVisitCompletion milestoneId="milestone_1" />);

    expect(screen.getByText("Location unverified")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Field report"), {
      target: { value: "Foundation work matches the submitted scope." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Complete Site Visit" })
    );

    await waitFor(() => expect(completeSiteVisitMock).toHaveBeenCalledTimes(1));
    expect(completeSiteVisitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVisitUpdatedAt: 123,
        milestoneId: "milestone_1",
        report: "Foundation work matches the submitted scope.",
        visitId: "visit_1",
      })
    );
  });

  test("keeps a lender without Site Visit review permission read-only", () => {
    usePaginatedQueryMock.mockReturnValue({
      loadMore: vi.fn(),
      results: [
        {
          ...readyCandidate,
          canComplete: false,
          completionBlocker: "permission_required",
        },
      ],
      status: "Exhausted",
    });

    render(<LenderMilestoneSiteVisitCompletion milestoneId="milestone_1" />);

    expect(screen.getByText(/Site Visit is read-only/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Complete Site Visit" })
    ).toBeNull();
  });

  test("keeps a whitespace-only field report local and actionable", async () => {
    usePaginatedQueryMock.mockReturnValue({
      loadMore: vi.fn(),
      results: [readyCandidate],
      status: "Exhausted",
    });

    render(<LenderMilestoneSiteVisitCompletion milestoneId="milestone_1" />);

    fireEvent.change(screen.getByLabelText("Field report"), {
      target: { value: "   " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Complete Site Visit" })
    );

    expect(
      await screen.findByText(
        "Enter a field report before completing this Site Visit."
      )
    ).toBeTruthy();
    expect(completeSiteVisitMock).not.toHaveBeenCalled();
  });

  test("requires field photo evidence before exposing completion", () => {
    usePaginatedQueryMock.mockReturnValue({
      loadMore: vi.fn(),
      results: [
        {
          ...readyCandidate,
          canComplete: false,
          completionBlocker: "photo_required",
          locationUnverifiedPhotoCount: 0,
          photoCount: 0,
        },
      ],
      status: "Exhausted",
    });

    render(<LenderMilestoneSiteVisitCompletion milestoneId="milestone_1" />);

    expect(screen.getByText(/At least one field photo/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Complete Site Visit" })
    ).toBeNull();
  });
});
