// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mockConvex = vi.hoisted(() => {
  const state = {
    liveVisitState: undefined as any,
    mutation: vi.fn(async (input: any) => {
      if (input?.reportNotes !== undefined) {
        state.liveVisitState = consumedVisitState();
      }
      return null;
    }),
  };
  return state;
});

vi.mock("convex/react", () => ({
  ConvexProvider: ({ children }: { children: React.ReactNode }) => children,
  ConvexReactClient: class ConvexReactClient {
    constructor(_url: string) {}
  },
  useMutation: vi.fn(() => mockConvex.mutation),
  useQuery: vi.fn(() => mockConvex.liveVisitState),
}));

import { SiteVisitTokenRoute } from "./SiteVisitTokenRoute";

describe("SiteVisitTokenRoute", () => {
  beforeEach(() => {
    mockConvex.liveVisitState = activeVisitState();
    mockConvex.mutation.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  test("keeps the submitted confirmation visible after realtime marks the token consumed", async () => {
    render(
      <SiteVisitTokenRoute
        buildId="k57activebuild"
        siteVisitToken="fresh-token"
        source="production"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /submit report/i }));

    await waitFor(() => {
      expect(screen.getByText("Site visit recorded")).toBeTruthy();
    });
    expect(screen.queryByText("Visit unavailable")).toBeNull();
  });

  test("opens the build permit tab from the site visit navigation", () => {
    render(
      <SiteVisitTokenRoute
        buildId="k57activebuild"
        siteVisitToken="fresh-token"
        source="production"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /permit/i }));

    expect(screen.getByText("Build Permit")).toBeTruthy();
    expect(
      screen.getAllByText("city-issued-build-permit.pdf").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByTestId("site-visit-permit-frame").length,
    ).toBeGreaterThan(0);
  });
});

function activeVisitState() {
  return {
    available: true,
    build: {
      key: "B-NX87JQW7",
      name: "Seed Scenario - Approved With Waiver",
      subtitle: "Toronto, ON",
    },
    files: [
      {
        _id: "file-1",
        fileName: "foundation-photo.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 120_000,
        targetMilestoneKey: "foundation",
        uploadedAt: Date.now(),
      },
    ],
    permit: {
      _id: "permit-1",
      fileName: "city-issued-build-permit.pdf",
      kind: "permit",
      mimeType: "application/pdf",
      sizeBytes: 420_000,
      storageUrl: "https://example.com/city-issued-build-permit.pdf",
    },
    targets: [
      {
        _id: "milestone-1",
        guidance: {
          cameraAngles: ["Wide shot of the requested scope."],
          whatToVerify: ["Foundation is complete enough for reimbursement review."],
        },
        milestoneKey: "foundation",
        milestoneName: "Foundation",
        milestoneOrder: 1,
        submilestones: ["Footings", "Foundation walls"],
      },
    ],
    visit: {
      createdAt: Date.now() - 60_000,
      milestoneKey: "foundation",
      requestReason: "Verify completion claim.",
      status: "requested",
      tokenExpiresAt: Date.now() + 58 * 60_000,
    },
  };
}

function consumedVisitState() {
  const active = activeVisitState();
  return {
    ...active,
    available: false,
    reason: "consumed",
    status: "completed",
    visit: {
      ...active.visit,
      status: "complete",
      tokenConsumedAt: Date.now(),
    },
  };
}
