// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const convexMock = vi.hoisted(() => ({
  mutation: vi.fn(),
  query: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: vi.fn(() => convexMock.mutation),
  useQuery: vi.fn((...args: unknown[]) => convexMock.query(...args)),
}));

import { QuoteRoundsSurface } from "./QuoteRoundsSurface.tsx";

const TEST_NOW = Date.now();

const lifecycleRows = [
  {
    _id: "round-open",
    access: { active: 1, expired: 0, revoked: 0, rotated: 0, total: 1 },
    attention: {
      detail: "Provider rejected one recipient delivery.",
      label: "Delivery failed",
      rank: 1,
      reason: "delivery_failure",
      tone: "critical",
    },
    delivery: {
      delivered: 0,
      failed: 1,
      pending: 0,
      status: "failed",
      total: 1,
      undispatched: 0,
    },
    invitationCount: 1,
    lastActivityAt: 1_000,
    mode: "combined",
    packageRevisionId: "package-open",
    packageRevisionNumber: 2,
    participation: { active: 1, revoked: 0, total: 1 },
    preferredQuote: null,
    recipients: { active: 1, revoked: 0, total: 1 },
    recipientDelivery: [
      {
        actionRequired: true,
        attemptCount: 3,
        cooldownUntil: TEST_NOW + 24 * 60 * 60 * 1000,
        history: [
          {
            createdAt: TEST_NOW - 60_000,
            kind: "quote_invitation_initial",
            lastOutcomeAt: TEST_NOW - 30_000,
            status: "action_required",
          },
          {
            createdAt: TEST_NOW - 120_000,
            kind: "quote_invitation_reminder_manual",
            status: "retry_scheduled",
          },
        ],
        invitationId: "invitation-open",
        latestOutcomeAt: TEST_NOW - 30_000,
        latestStatus: "action_required",
        recoveryIntentId: "communication-intent-open",
        recoveryState: "action_required",
        reminderEligible: true,
      },
    ],
    responseDeadline: TEST_NOW + 5 * 24 * 60 * 60 * 1000,
    responses: { drafting: 1, submitted: 0, total: 1 },
    revision: 3,
    scopeUpdateAvailable: true,
    scope: "Frame exterior walls · Framing lumber",
    state: "open",
    title: "Framing bid",
    updatedAt: 1_000,
  },
  {
    _id: "round-draft",
    access: { active: 0, expired: 0, revoked: 0, rotated: 0, total: 0 },
    attention: {
      detail: "Combined package still needs setup.",
      label: "Draft needs setup",
      rank: 5,
      reason: "scheduling_readiness",
      tone: "neutral",
    },
    delivery: {
      delivered: 0,
      failed: 0,
      pending: 0,
      status: "not_dispatched",
      total: 0,
      undispatched: 0,
    },
    invitationCount: 0,
    lastActivityAt: 900,
    mode: "combined",
    participation: { active: 0, revoked: 0, total: 0 },
    preferredQuote: null,
    recipients: { active: 0, revoked: 0, total: 0 },
    responses: { drafting: 0, submitted: 0, total: 0 },
    revision: 0,
    scope: "Labour scope · Materials",
    state: "draft",
    title: "Future procurement",
    updatedAt: 900,
  },
  {
    _id: "round-closed",
    access: { active: 0, expired: 1, revoked: 0, rotated: 0, total: 1 },
    attention: null,
    delivery: {
      delivered: 1,
      failed: 0,
      pending: 0,
      status: "delivered",
      total: 1,
      undispatched: 0,
    },
    invitationCount: 1,
    lastActivityAt: 800,
    mode: "labour",
    packageRevisionId: "package-closed",
    packageRevisionNumber: 1,
    participation: { active: 1, revoked: 0, total: 1 },
    preferredQuote: null,
    recipients: { active: 1, revoked: 0, total: 1 },
    recipientDelivery: [],
    responseDeadline: TEST_NOW - 5 * 24 * 60 * 60 * 1000,
    responses: { drafting: 0, submitted: 1, total: 1 },
    revision: 4,
    scopeUpdateAvailable: true,
    scope: "Install engineered wall system",
    state: "closed",
    title: "Closed framing review",
    updatedAt: 800,
  },
  {
    _id: "round-cancelled",
    access: { active: 0, expired: 0, revoked: 1, rotated: 0, total: 1 },
    attention: null,
    delivery: {
      delivered: 0,
      failed: 0,
      pending: 0,
      status: "failed",
      total: 1,
      undispatched: 1,
    },
    invitationCount: 0,
    lastActivityAt: 700,
    mode: "material",
    participation: { active: 0, revoked: 1, total: 1 },
    preferredQuote: null,
    recipients: { active: 0, revoked: 1, total: 1 },
    recipientDelivery: [],
    scopeUpdateAvailable: true,
    responses: { drafting: 0, submitted: 0, total: 0 },
    revision: 2,
    scope: "Framing lumber",
    state: "cancelled",
    title: "Cancelled materials request",
    updatedAt: 700,
  },
] as const;

const listResult = { rounds: lifecycleRows };

function renderSurface(
  props: Partial<{
    buildId: string;
    onCreate: () => void;
    onOpen: (roundId: string) => void;
    organizationId: string;
    readOnly: boolean;
  }> = {}
) {
  const Surface = QuoteRoundsSurface as unknown as ComponentType<{
    buildId: string;
    onCreate?: () => void;
    onOpen?: (roundId: string) => void;
    organizationId: string;
    readOnly?: boolean;
  }>;
  return render(
    <Surface
      buildId={props.buildId ?? "build-1"}
      onCreate={props.onCreate}
      onOpen={props.onOpen}
      organizationId={props.organizationId ?? "org-1"}
      readOnly={props.readOnly}
    />
  );
}

afterEach(() => cleanup());

  beforeEach(() => {
    convexMock.mutation.mockReset();
    convexMock.mutation.mockResolvedValue({
      communicationIntentId: "communication-intent-retry",
      replayed: false,
      status: "pending",
    });
    convexMock.query.mockReset();
  convexMock.query.mockReturnValue(listResult);
});

describe("QuoteRoundsSurface", () => {
  test("renders the lifecycle register with independent dimensions, deadline facts, attention priority, and a nullable Preferred Quote", () => {
    renderSurface();

    expect(screen.getAllByText("Update available")).toHaveLength(2);

    expect(screen.getByText("Quote requests")).toBeTruthy();
    for (const title of lifecycleRows.map((row) => row.title)) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
    expect(document.body.textContent).toContain(
      "Frame exterior walls · Framing lumber"
    );
    expect(screen.getAllByText("Delivery failed").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Provider rejected one recipient delivery.").length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Not selected").length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain("1 delivered");
    expect(document.body.textContent).toContain("1 drafting");
  });

  test("keeps lifecycle states and actions keyboard-accessible while respecting read-only mode", () => {
    const onCreate = vi.fn();
    const onOpen = vi.fn();
    renderSurface({ onCreate, onOpen });

    fireEvent.click(screen.getAllByRole("button", { name: "Review responses" })[0]!);
    expect(onOpen).toHaveBeenCalledWith("round-open");
    fireEvent.click(screen.getByRole("button", { name: /New quote request/i }));
    expect(onCreate).toHaveBeenCalledOnce();

    cleanup();
    renderSurface({ onOpen, readOnly: true });
    expect(
      screen.queryByRole("button", { name: /New quote request|Create first/i })
    ).toBeNull();
    expect(screen.getAllByRole("button", { name: "View" }).length).toBeGreaterThan(0);

    cleanup();
    renderSurface({ readOnly: true });
    const unavailableActions = screen.getAllByRole("button", {
      name: "View (quote detail unavailable)",
    });
    expect(unavailableActions.length).toBeGreaterThan(0);
    expect(
      unavailableActions.every((button) => button.hasAttribute("disabled"))
    ).toBe(true);
    expect(unavailableActions[0]?.getAttribute("title")).toContain(
      "unavailable"
    );
  });

  test("confirms and deletes only draft Quote Requests from writable workspaces", async () => {
    const onOpen = vi.fn();
    renderSurface({ onOpen });

    const deleteButtons = screen.getAllByRole("button", {
      name: "Delete draft Future procurement",
    });
    expect(deleteButtons.length).toBeGreaterThan(0);
    fireEvent.click(deleteButtons[0]!);
    expect(
      await screen.findByRole("alertdialog", {
        name: "Delete draft Quote Request",
      })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));

    await waitFor(() =>
      expect(convexMock.mutation).toHaveBeenCalledWith({
        buildId: "build-1",
        expectedRevision: 0,
        quoteRoundId: "round-draft",
        workosOrganizationId: "org-1",
      })
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("alertdialog", {
          name: "Delete draft Quote Request",
        })
      ).toBeNull()
    );

    cleanup();
    renderSurface({ onOpen, readOnly: true });
    expect(
      screen.queryByRole("button", {
        name: "Delete draft Future procurement",
      })
    ).toBeNull();
  });

  test("renders loading and empty states, then refreshes a cached register", () => {
    let value: unknown = undefined;
    convexMock.query.mockImplementation(() => value);
    const { rerender } = renderSurface();
    expect(screen.getByTestId("quote-rounds-loading")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Refresh/i })).toBeTruthy();

    value = { rounds: [] };
    fireEvent.click(screen.getByRole("button", { name: /Refresh/i }));
    expect(screen.getByText(/No quote requests yet/i)).toBeTruthy();

    value = listResult;
    rerender(
      <QuoteRoundsSurface
        buildId="build-1"
        onCreate={vi.fn()}
        onOpen={vi.fn()}
        organizationId="org-1"
      />
    );
    expect(screen.getAllByText("Framing bid").length).toBeGreaterThan(0);
  });

  test("keeps the register vertical and exposes an accessible lifecycle reading order", () => {
    renderSurface();
    const surface = screen.getByTestId("build-quote-rounds-surface");
    expect(surface.className).toMatch(/grid|pb-24/);
    const titleButton = screen
      .getAllByText("Framing bid")
      .map((element) => element.closest("button"))
      .find((button) => button?.hasAttribute("aria-controls"));
    if (!titleButton) {
      throw new Error("Expected the mobile lifecycle disclosure button.");
    }
    fireEvent.click(titleButton);
    const lifecycle = screen.getByRole("list", { name: /Quote Round lifecycle/i });
    expect(lifecycle).toBeTruthy();
    for (const label of ["Draft", "Open", "Closed", "Cancelled"]) {
      expect(lifecycle.textContent).toContain(label);
    }
  });

  test("renders cancelled as a terminal branch without completed normal phases", () => {
    renderSurface();
    const titleButton = screen
      .getAllByText("Cancelled materials request")
      .map((element) => element.closest("button"))
      .find((button) => button?.hasAttribute("aria-controls"));
    if (!titleButton) {
      throw new Error("Expected the mobile cancelled lifecycle disclosure button.");
    }
    fireEvent.click(titleButton);
    const lifecycle = screen.getByRole("list", {
      name: /Quote Round lifecycle/i,
    });
    expect(lifecycle.textContent).toContain("Cancelled");
    expect(lifecycle.querySelectorAll("svg")).toHaveLength(0);
  });

  test("links desktop expansion controls to the recipient activity region", () => {
    renderSurface({ onOpen: vi.fn() });
    const desktopTitleButton = screen
      .getAllByText("Framing bid")
      .map((element) => element.closest("button"))
      .find((button) =>
        button?.getAttribute("aria-controls")?.startsWith("quote-round-desktop")
      );
    if (!desktopTitleButton) {
      throw new Error("Expected the desktop lifecycle disclosure button.");
    }
    expect(desktopTitleButton.getAttribute("aria-controls")).toBe(
      "quote-round-desktop-details-round-open"
    );
    fireEvent.click(desktopTitleButton);
    expect(
      screen.getByRole("region", { name: "Framing bid recipient activity" })
    ).toBeTruthy();
  });

  test("surfaces per-recipient delivery recovery and reminder eligibility without recipient identity", () => {
    renderSurface({ onOpen: vi.fn() });
    const desktopTitleButton = screen
      .getAllByText("Framing bid")
      .map((element) => element.closest("button"))
      .find((button) =>
        button?.getAttribute("aria-controls")?.startsWith("quote-round-desktop")
      );
    if (!desktopTitleButton) {
      throw new Error("Expected the desktop lifecycle disclosure button.");
    }
    fireEvent.click(desktopTitleButton);
    const activity = screen.getByRole("region", {
      name: "Framing bid recipient activity",
    });
    expect(activity.textContent).toContain("1 tracked · 1 action required · 1 reminder eligible");
    expect(activity.textContent).toContain(
      "Recipient 1: action_required · action required · reminder eligible"
    );
    expect(activity.textContent).not.toContain("quote-recipient@example.com");
    expect(activity.textContent).not.toContain("notifications@updates.fairlend.ca");

    const history = screen.getAllByTestId(
      "quote-recipient-communication-history"
    )[0];
    if (!history) {
      throw new Error("Expected a recipient communication history disclosure.");
    }
    const summary = history.querySelector("summary");
    if (!summary) {
      throw new Error("Expected a communication history summary.");
    }
    fireEvent.click(summary);
    expect(history.textContent).toContain("Latest: action_required");
    expect(history.textContent).toContain("Recovery: action_required · action required · reminder eligible");
    expect(history.textContent).toContain("3 attempts");
    expect(history.textContent).toContain("quote_invitation_initial");
    expect(history.textContent).not.toContain("quote-recipient@example.com");
  });

  test("collects a mandatory reason and reuses the retry idempotency key after a failed request", async () => {
    convexMock.mutation
      .mockRejectedValueOnce(new Error("Transient retry request failure."))
      .mockResolvedValueOnce({
        communicationIntentId: "communication-intent-retry",
        replayed: false,
        status: "pending",
      });
    renderSurface({ onOpen: vi.fn() });
    const desktopTitleButton = screen
      .getAllByText("Framing bid")
      .map((element) => element.closest("button"))
      .find((button) =>
        button?.getAttribute("aria-controls")?.startsWith("quote-round-desktop")
      );
    if (!desktopTitleButton) {
      throw new Error("Expected the desktop lifecycle disclosure button.");
    }
    fireEvent.click(desktopTitleButton);
    const activityRegionId = desktopTitleButton.getAttribute("aria-controls");
    const activityRegion = activityRegionId
      ? document.getElementById(activityRegionId)
      : null;
    if (!activityRegion) {
      throw new Error("Expected the desktop recipient activity region.");
    }
    const reason = activityRegion.querySelector<HTMLInputElement>(
      'input[aria-label="Retry reason for recipient 1"]'
    );
    const retry = [...activityRegion.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Retry delivery")
    );
    if (!(reason && retry)) {
      throw new Error("Expected the governed delivery retry controls.");
    }
    expect(retry.hasAttribute("disabled")).toBe(true);
    fireEvent.change(reason, {
      target: { value: "Retry after confirming the corrected provider route." },
    });
    fireEvent.click(retry);
    await waitFor(() => expect(convexMock.mutation).toHaveBeenCalledOnce());
    expect(convexMock.mutation).toHaveBeenCalledWith(
      expect.objectContaining({
        buildId: "build-1",
        communicationIntentId: "communication-intent-open",
        reason: "Retry after confirming the corrected provider route.",
        workosOrganizationId: "org-1",
      })
    );
    await waitFor(() => expect(retry.hasAttribute("disabled")).toBe(false));
    fireEvent.click(retry);
    await waitFor(() => expect(convexMock.mutation).toHaveBeenCalledTimes(2));
    const firstIdempotencyKey = convexMock.mutation.mock.calls[0]?.[0]
      ?.idempotencyKey as string;
    const secondIdempotencyKey = convexMock.mutation.mock.calls[1]?.[0]
      ?.idempotencyKey as string;
    expect(firstIdempotencyKey).toBeTruthy();
    expect(secondIdempotencyKey).toBe(firstIdempotencyKey);
  });

  test("keeps recipient recovery read-only when the register is opened in read-only mode", () => {
    renderSurface({ onOpen: vi.fn(), readOnly: true });
    const desktopTitleButton = screen
      .getAllByText("Framing bid")
      .map((element) => element.closest("button"))
      .find((button) =>
        button?.getAttribute("aria-controls")?.startsWith("quote-round-desktop")
      );
    if (!desktopTitleButton) {
      throw new Error("Expected the desktop lifecycle disclosure button.");
    }
    fireEvent.click(desktopTitleButton);
    expect(screen.getByRole("region", { name: "Framing bid recipient activity" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Remind|Retry|Send/i })).toBeNull();
    expect(screen.getAllByRole("button", { name: "View" }).length).toBeGreaterThan(0);
  });

  test("filters by scope and mode, and sorts the visible register deterministically", () => {
    renderSurface();
    const search = screen.getByRole("textbox", {
      name: "Search quote requests",
    });
    fireEvent.change(search, { target: { value: "materials" } });
    expect(screen.queryAllByText("Framing bid")).toHaveLength(0);
    expect(screen.getAllByText("Cancelled materials request").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.click(screen.getByRole("button", { name: "Materials" }));
    expect(
      screen.getByRole("button", { name: "Materials" }).getAttribute(
        "aria-pressed"
      )
    ).toBe("true");
    expect(screen.getAllByText("Cancelled materials request").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole("combobox", { name: "Sort quote requests" }), {
      target: { value: "title" },
    });
    const mobileRows = screen
      .getByTestId("build-quote-rounds-surface")
      .querySelectorAll("section");
    expect(mobileRows[0]?.textContent).toContain("Cancelled materials request");
  });

  test("keeps the last successful register visible when a refresh hard-fails", () => {
    let hardError = false;
    convexMock.query.mockImplementation(() => {
      if (hardError) {
        throw new Error("Quote register unavailable");
      }
      return listResult;
    });
    const { rerender } = renderSurface();
    hardError = true;
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      rerender(
        <QuoteRoundsSurface
          buildId="build-1"
          onCreate={vi.fn()}
          onOpen={vi.fn()}
          organizationId="org-1"
        />
      );
    } finally {
      consoleError.mockRestore();
    }
    expect(screen.getByText("Refresh failed")).toBeTruthy();
    expect(
      screen.getByText(/Showing the last successful register snapshot/i)
    ).toBeTruthy();
    expect(screen.getAllByText("Framing bid").length).toBeGreaterThan(0);
  });

  test("preserves read-only action context in a cached hard-error fallback", () => {
    let hardError = false;
    convexMock.query.mockImplementation(() => {
      if (hardError) {
        throw new Error("Quote register unavailable");
      }
      return listResult;
    });
    const { rerender } = renderSurface({ readOnly: true });
    hardError = true;
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      rerender(
        <QuoteRoundsSurface
          buildId="build-1"
          organizationId="org-1"
          readOnly
        />
      );
    } finally {
      consoleError.mockRestore();
    }
    const unavailableActions = screen.getAllByRole("button", {
      name: "View (quote detail unavailable)",
    });
    expect(unavailableActions.length).toBeGreaterThan(0);
    expect(unavailableActions.every((button) => button.hasAttribute("disabled"))).toBe(
      true
    );
  });

  test("does not reuse a cached register across Build or organization identity changes", () => {
    let hardError = false;
    convexMock.query.mockImplementation(() => {
      if (hardError) {
        throw new Error("Quote register unavailable");
      }
      return listResult;
    });
    const { rerender } = renderSurface();
    hardError = true;
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      rerender(
        <QuoteRoundsSurface
          buildId="build-2"
          organizationId="org-2"
        />
      );
    } finally {
      consoleError.mockRestore();
    }
    expect(screen.getByTestId("quote-rounds-error")).toBeTruthy();
    expect(screen.queryByText("Framing bid")).toBeNull();
  });

  test("renders a hard-error state when no cached register exists", () => {
    convexMock.query.mockImplementation(() => {
      throw new Error("Quote register unavailable");
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      renderSurface();
    } finally {
      consoleError.mockRestore();
    }
    expect(screen.getByTestId("quote-rounds-error")).toBeTruthy();
    expect(screen.getByText("Quote register unavailable")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Retry/i })).toBeTruthy();
  });
});
