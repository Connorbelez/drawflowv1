// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
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
  info: vi.fn(),
  warning: vi.fn(),
}));

const mockDraftStorage = vi.hoisted(() => ({
  deleteDraft: vi.fn(async () => undefined),
  loadDraft: vi.fn(async () => null),
  saveDraft: vi.fn(async () => undefined),
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

vi.mock("./site-visit-draft-storage.ts", async () => {
  const actual = await vi.importActual<
    typeof import("./site-visit-draft-storage.ts")
  >("./site-visit-draft-storage.ts");
  return {
    ...actual,
    deleteSiteVisitDraft: mockDraftStorage.deleteDraft,
    loadSiteVisitDraft: mockDraftStorage.loadDraft,
    saveSiteVisitDraft: mockDraftStorage.saveDraft,
  };
});

import { SiteVisitTokenRoute } from "./SiteVisitTokenRoute";

const getUserMedia = vi.fn(
  () => new Promise<MediaStream>(() => undefined),
);
const getCurrentPosition = vi.fn();
const scrollIntoView = vi.fn();

function completeReportForm() {
  fireEvent.change(screen.getByLabelText("Recommendation"), {
    target: { value: "approve" },
  });
  fireEvent.change(screen.getByLabelText("Completion observation"), {
    target: { value: "observed" },
  });
  const editor = screen
    .getByTestId("site-visit-report-note")
    .querySelector('[contenteditable="true"]');
  if (!editor) {
    throw new Error("Field note editor was not rendered.");
  }
  editor.innerHTML = "<p>Inspector verified the assigned scope.</p>";
  fireEvent.input(editor);
}

describe("SiteVisitTokenRoute", () => {
  beforeEach(() => {
    mockConvex.liveVisitState = activeVisitState();
    mockConvex.mutation.mockClear();
    mockToast.error.mockClear();
    mockToast.info.mockClear();
    mockToast.warning.mockClear();
    mockDraftStorage.deleteDraft.mockClear();
    mockDraftStorage.loadDraft.mockReset();
    mockDraftStorage.loadDraft.mockResolvedValue(null);
    mockDraftStorage.saveDraft.mockClear();
    getUserMedia.mockClear();
    getCurrentPosition.mockReset();
    scrollIntoView.mockClear();
    getCurrentPosition.mockImplementation(
      (onSuccess: PositionCallback) => {
        onSuccess({
          coords: {
            accuracy: 8,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            latitude: 43.25571,
            longitude: -79.87109,
            speed: null,
          },
          timestamp: Date.now(),
        });
      },
    );
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("hydrates connectivity status from a deterministic server snapshot", async () => {
    const originalOnLine = Object.getOwnPropertyDescriptor(
      window.navigator,
      "onLine",
    );
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: undefined,
    });
    const markup = renderToString(
      <SiteVisitTokenRoute
        buildId="k57activebuild"
        siteVisitToken="fresh-token"
        source="production"
      />,
    );
    const container = document.createElement("div");
    container.innerHTML = markup;
    document.body.append(container);

    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let root: ReturnType<typeof hydrateRoot> | undefined;

    try {
      await act(async () => {
        root = hydrateRoot(
          container,
          <SiteVisitTokenRoute
            buildId="k57activebuild"
            siteVisitToken="fresh-token"
            source="production"
          />,
        );
        await Promise.resolve();
      });

      expect(
        consoleError.mock.calls.some(([message]) =>
          String(message).includes("Hydration failed"),
        ),
      ).toBe(false);
      expect(
        screen.queryByText("Offline, draft saved on this device"),
      ).toBeNull();
    } finally {
      await act(async () => root?.unmount());
      consoleError.mockRestore();
      if (originalOnLine) {
        Object.defineProperty(window.navigator, "onLine", originalOnLine);
      } else {
        Reflect.deleteProperty(window.navigator, "onLine");
      }
    }
  });

  test("keeps the submitted confirmation visible after realtime marks the token consumed", async () => {
    render(
      <SiteVisitTokenRoute
        buildId="k57activebuild"
        siteVisitToken="fresh-token"
        source="production"
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText("Location verified").length).toBeGreaterThan(0);
    });
    completeReportForm();
    await waitFor(() => {
      expect(screen.getByText("Ready to submit")).toBeTruthy();
    });
    fireEvent.click(
      screen.getByRole("button", { name: /submit recommendation/i }),
    );

    await waitFor(() => {
      expect(
        mockConvex.mutation.mock.calls.some(
          ([input]) => input?.reportNotes !== undefined,
        ),
      ).toBe(true);
      expect(mockToast.error).not.toHaveBeenCalled();
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
      name: /submit recommendation/i,
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

  test("does not let a late saved draft overwrite new field edits", async () => {
    let resolveDraft!: (
      draft: Awaited<
        ReturnType<
          typeof import("./site-visit-draft-storage.ts").loadSiteVisitDraft
        >
      >
    ) => void;
    mockDraftStorage.loadDraft.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDraft = resolve;
        }),
    );

    render(
      <SiteVisitTokenRoute
        buildId="k57activebuild"
        siteVisitToken="fresh-token"
        source="production"
      />,
    );

    fireEvent.change(screen.getByLabelText("Recommendation"), {
      target: { value: "approve" },
    });
    const editor = screen
      .getByTestId("site-visit-report-note")
      .querySelector('[contenteditable="true"]');
    if (!editor) {
      throw new Error("Field note editor was not rendered.");
    }
    editor.innerHTML = "<p>New field observation.</p>";
    fireEvent.input(editor);

    await act(async () => {
      resolveDraft({
        completionObserved: false,
        key: "production:k57activebuild:fresh-token",
        locationAttempt: {
          accuracyMeters: 12,
          attempted: true,
          capturedAt: Date.now() - 60_000,
          distanceMeters: 4,
          failureReason: "",
          latitude: 43.2557,
          longitude: -79.8711,
          verified: true,
        },
        prerequisiteAcknowledged: false,
        prerequisiteReason: "",
        qualityRating: "1",
        recommendedOutcome: "reject",
        reportNotes: "<p>Old saved observation.</p>",
        selectedTarget: "visit-wide",
        stagedItems: [],
        updatedAt: Date.now() - 60_000,
        version: 1,
      });
      await Promise.resolve();
    });

    expect(
      (screen.getByLabelText("Recommendation") as HTMLSelectElement).value,
    ).toBe("approve");
    expect(editor.innerHTML).toContain("New field observation.");
  });

  test("prevents staged evidence removal while its upload is active", async () => {
    let finishUpload!: (value: {
      json: () => Promise<{ storageId: string }>;
      ok: boolean;
    }) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            finishUpload = resolve;
          }),
      ),
    );
    render(
      <SiteVisitTokenRoute
        buildId="k57activebuild"
        siteVisitToken="fresh-token"
        source="production"
      />,
    );

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null;
    if (!fileInput) {
      throw new Error("Evidence file input was not rendered.");
    }
    fireEvent.change(fileInput, {
      target: {
        files: [
          new File(["evidence"], "foundation-review.jpg", {
            type: "image/jpeg",
          }),
        ],
      },
    });
    const removeButton = screen.getByRole("button", {
      name: "Remove foundation-review.jpg",
    }) as HTMLButtonElement;

    fireEvent.click(screen.getByRole("button", { name: "Upload evidence" }));

    await waitFor(() => expect(removeButton.disabled).toBe(true));

    finishUpload({
      json: async () => ({ storageId: "storage-1" }),
      ok: true,
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: "Remove foundation-review.jpg",
        }),
      ).toBeNull(),
    );
  });

  test("moves the mobile report shortcut to the report workflow", () => {
    render(
      <SiteVisitTokenRoute
        buildId="k57activebuild"
        siteVisitToken="fresh-token"
        source="production"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Report" }));

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(document.activeElement?.id).toBe("site-visit-report");
    expect(screen.getByRole("heading", { name: "Report" })).toBeTruthy();
  });

  test("opens the consolidated visit packet from the site visit navigation", () => {
    render(
      <SiteVisitTokenRoute
        buildId="k57activebuild"
        siteVisitToken="fresh-token"
        source="production"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /packet/i }));

    expect(screen.getByText("Visit packet")).toBeTruthy();
    expect(
      screen.getAllByText("city-issued-build-permit.pdf").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByTestId("site-visit-permit-frame").length,
    ).toBeGreaterThan(0);
  });

  test("renders ordered immutable per-submilestone guidance snapshots", async () => {
    const active = activeVisitState();
    mockConvex.liveVisitState = {
      ...active,
      targets: [
        {
          ...active.targets[0],
          submilestones: ["Current footings name", "Current walls name"],
          guidance: {
            cameraAngles: ["Canonical camera guidance must not appear."],
            whatToVerify: ["Canonical verification guidance must not appear."],
          },
          guidanceSections: [
            {
              proposalSubmilestoneId: "proposal-walls",
              buildSubmilestoneId: "build-walls",
              submilestoneKey: "foundation-walls",
              submilestoneName: "Foundation walls",
              order: 2,
              whatToVerifyTiptapJson: tiptapDocument(
                "Snapshot walls verification",
              ),
              cameraAnglesTiptapJson: tiptapDocument(
                "Snapshot walls camera angle",
              ),
              capturedAt: 1_721_234_567_890,
            },
            {
              proposalSubmilestoneId: "proposal-footings",
              buildSubmilestoneId: "build-footings",
              submilestoneKey: "footings",
              submilestoneName: "Footings",
              order: 1,
              whatToVerifyTiptapJson: tiptapDocument(
                "Snapshot footings verification",
              ),
              cameraAnglesTiptapJson: tiptapDocument(
                "Snapshot footings camera angle",
              ),
              capturedAt: 1_721_234_567_890,
            },
          ],
        },
      ],
    };

    render(
      <SiteVisitTokenRoute
        buildId="k57activebuild"
        siteVisitToken="fresh-token"
        source="production"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /packet/i }));

    await waitFor(() => {
      expect(screen.getByText("Snapshot footings verification")).toBeTruthy();
      expect(screen.getByText("Snapshot walls verification")).toBeTruthy();
      expect(screen.getByText("Snapshot footings camera angle")).toBeTruthy();
      expect(screen.getByText("Snapshot walls camera angle")).toBeTruthy();
    });

    const bodyText = document.body.textContent ?? "";
    expect(bodyText.indexOf("Snapshot footings verification")).toBeLessThan(
      bodyText.indexOf("Snapshot walls verification"),
    );
    expect(bodyText).not.toContain("Canonical camera guidance must not appear.");
    expect(bodyText).not.toContain(
      "Canonical verification guidance must not appear.",
    );
    expect(bodyText).not.toContain("Current footings name");
    expect(bodyText).not.toContain("Current walls name");
  });

  test("keeps snapshot guidance renderable when display titles repeat", async () => {
    const active = activeVisitState();
    mockConvex.liveVisitState = {
      ...active,
      targets: [
        {
          ...active.targets[0],
          guidanceSections: [
            {
              proposalSubmilestoneId: "proposal-duplicate-one",
              buildSubmilestoneId: "build-duplicate-one",
              submilestoneKey: "duplicate-one",
              submilestoneName: "Same display title",
              order: 1,
              whatToVerifyTiptapJson: tiptapDocument(
                "First duplicate-title verification",
              ),
              cameraAnglesTiptapJson: tiptapDocument(
                "First duplicate-title camera angle",
              ),
              capturedAt: 1_721_234_567_890,
            },
            {
              proposalSubmilestoneId: "proposal-duplicate-two",
              buildSubmilestoneId: "build-duplicate-two",
              submilestoneKey: "duplicate-two",
              submilestoneName: "Same display title",
              order: 2,
              whatToVerifyTiptapJson: tiptapDocument(
                "Second duplicate-title verification",
              ),
              cameraAnglesTiptapJson: tiptapDocument(
                "Second duplicate-title camera angle",
              ),
              capturedAt: 1_721_234_567_890,
            },
          ],
        },
      ],
    };
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      render(
        <SiteVisitTokenRoute
          buildId="k57activebuild"
          siteVisitToken="fresh-token"
          source="production"
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /packet/i }));

      await waitFor(() => {
        expect(
          screen.getAllByText("First duplicate-title verification").length,
        ).toBeGreaterThan(0);
        expect(
          screen.getAllByText("Second duplicate-title camera angle").length,
        ).toBeGreaterThan(0);
      });

      const duplicateKeyWarnings = consoleError.mock.calls.filter(([message]) =>
        String(message).toLowerCase().includes("same key")
      );
      expect(duplicateKeyWarnings).toHaveLength(0);
    } finally {
      consoleError.mockRestore();
    }
  });

  test("falls back to the pre-cutover milestone-wide guidance shape", async () => {
    const active = activeVisitState();
    mockConvex.liveVisitState = {
      ...active,
      targets: [
        {
          ...active.targets[0],
          guidance: {
            cameraAngles: ["Legacy visit-wide camera angle"],
            whatToVerify: ["Legacy visit-wide verification"],
          },
          guidanceSections: [],
        },
      ],
    };

    render(
      <SiteVisitTokenRoute
        buildId="k57activebuild"
        siteVisitToken="fresh-token"
        source="production"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /packet/i }));

    await waitFor(() => {
      expect(screen.getByText("Legacy visit-wide verification")).toBeTruthy();
      expect(screen.getByText("Legacy visit-wide camera angle")).toBeTruthy();
    });
  });

  test("renders an interactive site map and a working Open in Maps action", () => {
    render(
      <SiteVisitTokenRoute
        buildId="k57activebuild"
        siteVisitToken="fresh-token"
        source="production"
      />,
    );
    const mapButton = screen.getByRole("button", { name: "Map" });
    fireEvent.click(mapButton);
    expect(mapButton.getAttribute("aria-pressed")).toBe("true");

    const maps = screen.getAllByTitle(
      "Interactive map for 1420 Maple Ridge Dr, Hamilton, ON L8P 2X4",
    ) as HTMLIFrameElement[];
    expect(maps.length).toBeGreaterThan(0);
    expect(maps[0]?.src).toContain("google.com/maps");
    expect(maps[0]?.src).toContain("43.2557");

    const openInMaps = screen.getAllByRole("link", {
      name: /open in maps/i,
    }) as HTMLAnchorElement[];
    expect(openInMaps.length).toBeGreaterThan(0);
    expect(openInMaps[0]?.href).toContain(
      "google.com/maps/search/?api=1",
    );
    expect(openInMaps[0]?.target).toBe("_blank");
  });

  test("automatically evaluates the device position against the site geofence", async () => {
    getCurrentPosition.mockImplementationOnce(
      (
        onSuccess: PositionCallback,
        _onError: PositionErrorCallback,
      ) => {
        onSuccess({
          coords: {
            accuracy: 9,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            latitude: 43.2605,
            longitude: -79.871,
            speed: null,
          },
          timestamp: Date.now(),
        });
      },
    );

    render(
      <SiteVisitTokenRoute
        buildId="k57activebuild"
        siteVisitToken="fresh-token"
        source="production"
      />,
    );

    await waitFor(() => {
      expect(getCurrentPosition).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15_000,
        },
      );
      expect(screen.getAllByText("Outside site geofence").length).toBeGreaterThan(
        0,
      );
    });
  });

  test("opens the device camera instead of a file picker for photos", async () => {
    render(
      <SiteVisitTokenRoute
        buildId="k57activebuild"
        siteVisitToken="fresh-token"
        source="production"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /take photo/i }));

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
      locationLatitude: 43.2557,
      locationLongitude: -79.8711,
      name: "Seed Scenario - Approved With Waiver",
      subtitle: "1420 Maple Ridge Dr, Hamilton, ON L8P 2X4",
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

function tiptapDocument(text: string) {
  return JSON.stringify({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  });
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
