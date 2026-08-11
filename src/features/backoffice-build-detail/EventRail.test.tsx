// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
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

  test("opens canonical child targets from quick work and audit entries", () => {
    const onOpenCanonicalTarget = vi.fn();
    const onView = vi.fn();
    const target = {
      kind: "submilestone" as const,
      submilestoneId: "submilestone-01",
    };

    render(
      <EventRailPanel
        auditEvents={[
          {
            _id: "audit-submilestone-01",
            actorPersona: "Builder",
            canonicalTarget: target,
            canonicalTargetContext: { selectedTab: "review" },
            createdAt: Date.now(),
            entityType: "submilestone",
            eventType: "active_build.submilestone.execution_updated",
          },
        ]}
        onOpenCanonicalTarget={onOpenCanonicalTarget}
        onView={onView}
        quickActionEvents={[
          {
            _id: "delivery-submilestone-01",
            actionLabel: "Review Sub-milestone",
            body: "Review the child work.",
            canonicalTarget: target,
            canonicalTargetContext: { selectedTab: "review" },
            createdAt: Date.now(),
            entityLabel: "Foundation · Footings",
            entityType: "submilestone",
            href: "/backoffice/builds/build-01?rail=open",
            resolutionMode: "domain",
            sourceLabel: "Lender Operations",
            title: "Sub-milestone review",
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByTestId("rail-quick-event-view-delivery-submilestone-01"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Open detail" }));

    expect(onView).not.toHaveBeenCalled();
    expect(onOpenCanonicalTarget).toHaveBeenCalledTimes(2);
    expect(onOpenCanonicalTarget).toHaveBeenNthCalledWith(
      1,
      target,
      { selectedTab: "review" },
    );
    expect(onOpenCanonicalTarget).toHaveBeenNthCalledWith(
      2,
      target,
      { selectedTab: "review" },
    );
  });
});
