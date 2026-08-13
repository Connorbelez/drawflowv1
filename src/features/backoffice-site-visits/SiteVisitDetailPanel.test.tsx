// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { BrokerageSiteVisitRow } from "./site-visit-types.ts";
import {
  SiteVisitCancellationDialog,
  SiteVisitDetailPanel,
  SiteVisitDetailSheet,
} from "./SiteVisitDetailPanel.tsx";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a href="/" {...props}>
      {children}
    </a>
  ),
}));

const visit = {
  buildDisplayId: "B-001",
  buildId: "build-01",
  buildName: "Maple House",
  builderName: "Maple Builder",
  geofenceFlagged: true,
  location: "Toronto, ON",
  milestoneKey: "foundation",
  milestoneName: "Foundation",
  note: "Confirm footing depth.",
  operationalStatus: "expired",
  recordNote: "Footings verified in the field.",
  recordNoteFormat: "text",
  recommendedOutcome: "approve",
  scheduledDateLabel: "Aug 13, 2026",
  tokenExpiresAt: Date.now() - 1_000,
  tokenState: "expired",
  url: "/site-visits/token",
  visitId: "VISIT-01",
} as unknown as BrokerageSiteVisitRow;

describe("SiteVisitDetailPanel", () => {
  afterEach(cleanup);

  test("presents the shared Visit status, field record, and management actions", () => {
    const onCancel = vi.fn();
    const onCopyLink = vi.fn().mockResolvedValue(undefined);

    render(
      <SiteVisitDetailPanel
        now={Date.now()}
        onCancel={onCancel}
        onCopyLink={onCopyLink}
        showBuildLink={false}
        visit={visit}
      />,
    );

    expect(screen.getByText("Expired")).toBeTruthy();
    expect(screen.getByText("Token expired")).toBeTruthy();
    expect(screen.getByText("Location unverified evidence")).toBeTruthy();
    expect(screen.getByText("Confirm footing depth.")).toBeTruthy();
    expect(screen.getByText("Footings verified in the field.")).toBeTruthy();
    expect(screen.getByText("approve")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Copy field link" }));
    expect(onCopyLink).toHaveBeenCalledWith(visit);
    fireEvent.click(screen.getByRole("button", { name: "Cancel visit" }));
    expect(onCancel).toHaveBeenCalledWith(visit);
  });

  test("wraps the complete Visit and field report in the reusable detail sheet", () => {
    render(
      <SiteVisitDetailSheet
        now={Date.now()}
        onClose={vi.fn()}
        onCopyLink={vi.fn().mockResolvedValue(undefined)}
        open
        showBuildLink={false}
        visit={visit}
      />,
    );

    const dialog = screen.getByRole("dialog", {
      name: "Site Visit · Foundation",
    });
    expect(dialog).toBeTruthy();
    expect(screen.getByText("Footings verified in the field.")).toBeTruthy();
  });

  test("states when the field report has not been submitted", () => {
    render(
      <SiteVisitDetailPanel
        now={Date.now()}
        onCopyLink={vi.fn().mockResolvedValue(undefined)}
        showBuildLink={false}
        visit={{ ...visit, recordNote: undefined }}
      />,
    );

    expect(screen.getByText("No field report has been submitted.")).toBeTruthy();
  });

  test("requires and submits an audited cancellation reason", async () => {
    const onCancelVisit = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <SiteVisitCancellationDialog
        onCancelVisit={onCancelVisit}
        onOpenChange={onOpenChange}
        visit={visit}
      />,
    );

    const cancel = screen.getByRole("button", { name: "Cancel visit" });
    expect(cancel.getAttribute("disabled")).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Inspector assignment changed." },
    });
    fireEvent.click(cancel);

    await waitFor(() => expect(onCancelVisit).toHaveBeenCalledTimes(1));
    expect(onCancelVisit).toHaveBeenCalledWith({
      buildId: "build-01",
      reason: "Inspector assignment changed.",
      visitId: "VISIT-01",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
