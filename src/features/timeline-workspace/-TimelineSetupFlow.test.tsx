// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { TimelineSetupFlow } from "./-TimelineSetupFlow";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  restoreObjectUrlStatics();
});

const baseItems = [
  {
    data: {
      amount: 100_000,
      draw: "Draw 1",
      drawX: 12,
      durationDays: 10,
      evidence: "Not started",
      icon: "foundation" as const,
      name: "Foundation",
      policy: "Upcoming",
      status: "upcoming" as const,
      subMilestones: ["Permit mobilization"],
    },
    eyebrow: "Milestone 1",
    id: "foundation",
    label: "Foundation",
    lane: 0,
    markerLabel: "1",
    tone: "upcoming" as const,
    x: 0,
  },
];

describe("TimelineSetupFlow permit viewer", () => {
  test("shows permit viewer after leaving template selection when a permit is attached", () => {
    ensureObjectUrlStatics();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:permit");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const file = new File(["permit"], "setup-permit.pdf", {
      type: "application/pdf",
    });

    render(<TimelineSetupFlow baseItems={baseItems} onComplete={vi.fn()} />);

    fireEvent.change(screen.getByTestId("timeline-setup-permit-input"), {
      target: { files: [file] },
    });
    expect(screen.queryByTestId("build-permit-viewer-trigger")).toBeNull();

    fireEvent.click(screen.getByTestId("timeline-setup-continue-budget"));

    expect(screen.getByTestId("build-permit-viewer-trigger")).toBeTruthy();
  });

  test("does not show permit viewer after template selection without an attached permit", () => {
    render(<TimelineSetupFlow baseItems={baseItems} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByTestId("timeline-setup-continue-budget"));

    expect(screen.queryByTestId("build-permit-viewer-trigger")).toBeNull();
  });
});

function ensureObjectUrlStatics() {
  if (!URL.createObjectURL) {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: () => "",
    });
  }
  if (!URL.revokeObjectURL) {
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: () => undefined,
    });
  }
}

function restoreObjectUrlStatics() {
  if (originalCreateObjectURL) {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectURL,
    });
  } else {
    delete (URL as Partial<typeof URL>).createObjectURL;
  }
  if (originalRevokeObjectURL) {
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL,
    });
  } else {
    delete (URL as Partial<typeof URL>).revokeObjectURL;
  }
}
