// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { EventRailPanel } from "./EventRail.tsx";

describe("EventRailPanel", () => {
  afterEach(() => cleanup());

  test("separates delivery-first actions from immutable audit history", () => {
    render(
      <EventRailPanel
        auditEvents={[
          {
            _id: "audit-01",
            actorPersona: "Lender operations",
            afterSummary: "Requested",
            beforeSummary: "Draft",
            changes: [
              {
                after: "Requested",
                before: "Draft",
                field: "Status",
              },
              {
                after: "$125,000",
                before: "$100,000",
                field: "Requested amount",
              },
            ],
            createdAt: Date.now(),
            entityLabel: "Builder Active Build",
            entityType: "draw",
            eventType: "active_build.draw.requested",
            reason: "Foundation work and supporting evidence are complete.",
            warnings: ["location_unverified_requires_admin_review"],
          },
        ]}
        quickActionEvents={[
          {
            _id: "delivery-01",
            actionLabel: "Review draw",
            body: "Review eligibility, evidence, and the requested amount.",
            createdAt: Date.now(),
            entityLabel: "Builder Active Build · Foundation draw",
            entityType: "draw",
            href: "/backoffice/draws?buildId=build-01&drawId=draw-01",
            resolutionMode: "domain",
            sourceLabel: "Lender Operations",
            title: "Draw request awaiting review",
          },
        ]}
      />
    );

    expect(screen.getByText("Draw request awaiting review")).toBeTruthy();
    expect(screen.getByText("Builder Active Build · Foundation draw")).toBeTruthy();
    expect(screen.getByText(/Lender Operations/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Review draw" }).getAttribute("href")
    ).toBe("/backoffice/draws?buildId=build-01&drawId=draw-01");
    expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
    expect(screen.getByTestId("rail-event-log")).toBeTruthy();
    expect(screen.getByText("Draw requested")).toBeTruthy();
    expect(screen.getByText("Requested amount")).toBeTruthy();
    expect(screen.getByText("$100,000")).toBeTruthy();
    expect(screen.getByText("$125,000")).toBeTruthy();
    expect(
      screen.getByText("Foundation work and supporting evidence are complete.")
    ).toBeTruthy();
    expect(
      screen.getByText("Location unverified requires admin review")
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(
      /Previous state|Updated state/
    );
    expect(document.body.textContent).not.toMatch(
      /payloadPreview|requestId|stack|validator/i
    );
  });

  test("uses a useful empty state when there is no open work", () => {
    render(<EventRailPanel auditEvents={[]} quickActionEvents={[]} />);

    expect(
      screen.getByText("No decisions or reviews need attention.")
    ).toBeTruthy();
    expect(
      screen.getByText("No audit events have been recorded.")
    ).toBeTruthy();
  });
});
