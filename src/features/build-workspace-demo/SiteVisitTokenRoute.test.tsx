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
      if (input?.reason && input?.token) {
        return { reference: "SVR-RECOVER1", requested: true };
      }
      return null;
    }),
  };
  return state;
});

const mockToast = vi.hoisted(() => ({
  error: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("convex/react", () => ({
  ConvexProvider: ({ children }: { children: React.ReactNode }) => children,
  ConvexReactClient: class ConvexReactClient {
    constructor(_url: string) {}
  },
  useMutation: vi.fn(() => mockConvex.mutation),
  useQuery: vi.fn(() => mockConvex.liveVisitState),
}));

vi.mock("sonner", () => ({ toast: mockToast }));

import { SiteVisitTokenRoute } from "./SiteVisitTokenRoute";

const getUserMedia = vi.fn(
  () => new Promise<MediaStream>(() => undefined),
);

describe("SiteVisitTokenRoute", () => {
  beforeEach(() => {
    mockConvex.liveVisitState = activeVisitState();
    mockConvex.mutation.mockClear();
    mockToast.error.mockClear();
    mockToast.warning.mockClear();
    getUserMedia.mockClear();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
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

  test("keeps submission clickable and explains every incomplete requirement", () => {
    const active = activeVisitState();
    mockConvex.liveVisitState = {
      ...active,
      files: [],
      permit: null,
    };

    render(
      <SiteVisitTokenRoute
        buildId="k57activebuild"
        siteVisitToken="fresh-token"
        source="production"
      />,
    );

    const submitButton = screen.getByRole("button", {
      name: /submit report/i,
    }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(false);

    fireEvent.click(submitButton);

    expect(mockToast.warning).toHaveBeenCalledWith(
      "Report not ready",
      expect.objectContaining({
        description: expect.stringContaining(
          "Add at least one evidence photo or video.",
        ),
      }),
    );
    const description = mockToast.warning.mock.calls[0]?.[1]?.description;
    expect(description).toContain(
      "Acknowledge that the permit was unavailable.",
    );
    expect(description).toContain(
      "Add the alternate-verification reason for the missing permit.",
    );
    expect(
      mockConvex.mutation.mock.calls.some(
        ([input]) => input?.reportNotes !== undefined,
      ),
    ).toBe(false);
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

  test("opens the device camera instead of a file picker for photos", async () => {
    render(
      <SiteVisitTokenRoute
        buildId="k57activebuild"
        siteVisitToken="fresh-token"
        source="production"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Take Photo" }));

    await waitFor(() =>
      expect(getUserMedia).toHaveBeenCalledWith({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      }),
    );
  });

  test("opens the device camera and microphone instead of a file picker for video", async () => {
    render(
      <SiteVisitTokenRoute
        buildId="k57activebuild"
        siteVisitToken="fresh-token"
        source="production"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Record" }));

    await waitFor(() =>
      expect(getUserMedia).toHaveBeenCalledWith({
        audio: true,
        video: { facingMode: { ideal: "environment" } },
      }),
    );
  });

  test("keeps a consumed token read-only and requests a separate auditable link", async () => {
    mockConvex.liveVisitState = consumedVisitState();

    render(
      <SiteVisitTokenRoute
        buildId="k57activebuild"
        siteVisitToken="secret-consumed-token"
        source="production"
      />,
    );

    expect(screen.getByText("Site visit already complete")).toBeTruthy();
    expect(screen.getByText("Submitted · read only")).toBeTruthy();
    expect(screen.queryByText(/secret-consumed-token/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /submit report/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /request a new link/i }));

    await waitFor(() => {
      expect(mockConvex.mutation).toHaveBeenCalledWith({
        buildId: "k57activebuild",
        reason: "A new site visit is required for this Build.",
        token: "secret-consumed-token",
      });
      expect(screen.getByText(/reference SVR-RECOVER1/i)).toBeTruthy();
    });
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
