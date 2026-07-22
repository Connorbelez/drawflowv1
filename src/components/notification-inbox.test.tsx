// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const markRead = vi.fn();
const dismiss = vi.fn();
const resolve = vi.fn();
const useMutation = vi.fn();
const useQuery = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: (reference: unknown) => useMutation(reference),
  useQuery: (reference: unknown, args: unknown) => useQuery(reference, args),
}));

import { NotificationInbox } from "./notification-inbox.tsx";

const recipientDelivery = {
  _id: "delivery-recipient",
  actionLabel: "Open build",
  actionRequired: true,
  body: "Review the returned milestone decision and continue the build.",
  createdAt: Date.now() - 60_000,
  entityId: "build-01",
  entityLabel: "Builder Active Build · Foundation",
  entityType: "activeBuild",
  href: "/builder/builds/build-01?milestone=foundation",
  resolutionMode: "recipient" as const,
  sourceLabel: "Lender Operations",
  status: "unread" as const,
  title: "Milestone decision returned",
  updatedAt: Date.now() - 60_000,
};

const domainDelivery = {
  ...recipientDelivery,
  _id: "delivery-domain",
  actionLabel: "Review draw",
  entityLabel: "Builder Active Build · Draw 2",
  href: "/builder/builds/build-01?draw=draw-2",
  resolutionMode: "domain" as const,
  title: "Draw review required",
};

describe("NotificationInbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markRead.mockResolvedValue(null);
    dismiss.mockResolvedValue(null);
    resolve.mockResolvedValue(null);
    useMutation.mockImplementation(() => {
      const mutations = [markRead, dismiss, resolve];
      return mutations[(useMutation.mock.calls.length - 1) % mutations.length];
    });
    useQuery.mockReturnValue({
      actionRequiredCount: 2,
      deliveries: [recipientDelivery, domainDelivery],
      unreadCount: 2,
    });
  });

  afterEach(() => cleanup());

  test("moves focus into the inbox and returns it to the trigger on close", async () => {
    render(
      <NotificationInbox workosOrganizationId="org_production_foundation" />
    );

    const trigger = screen.getByRole("button", {
      name: "Notifications, 2 unread",
    });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  test("shows explicit loading, empty, and safe mutation error states", async () => {
    useQuery.mockReturnValue(undefined);
    const loadingView = render(
      <NotificationInbox workosOrganizationId="org_production_foundation" />
    );
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("Loading notifications…")).toBeTruthy();
    loadingView.unmount();

    useQuery.mockReturnValue({
      actionRequiredCount: 0,
      deliveries: [],
      unreadCount: 0,
    });
    const emptyView = render(
      <NotificationInbox workosOrganizationId="org_production_foundation" />
    );
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("No notifications yet.")).toBeTruthy();
    emptyView.unmount();

    useQuery.mockReturnValue({
      actionRequiredCount: 2,
      deliveries: [recipientDelivery, domainDelivery],
      unreadCount: 2,
    });
    dismiss.mockRejectedValueOnce(new Error("Request ID internal-123"));
    render(
      <NotificationInbox workosOrganizationId="org_production_foundation" />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Notifications, 2 unread" })
    );
    fireEvent.click(
      await screen.findByTestId("recipient-delivery-dismiss-delivery-domain")
    );
    expect(
      await screen.findByText("Unable to update this notification. Try again.")
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain("internal-123");
  });

  test("opens a named recipient inbox and exposes only legal delivery actions", async () => {
    render(
      <NotificationInbox workosOrganizationId="org_production_foundation" />
    );

    const trigger = screen.getByRole("button", {
      name: "Notifications, 2 unread",
    });
    fireEvent.click(trigger);

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Notifications" })).toBeTruthy();
    expect(screen.getByText("2 require action")).toBeTruthy();
    expect(screen.getByText("Milestone decision returned")).toBeTruthy();
    expect(screen.getByText("Builder Active Build · Foundation")).toBeTruthy();
    expect(screen.getAllByText("Lender Operations")).toHaveLength(2);

    expect(
      screen.getByTestId("recipient-delivery-resolve-delivery-recipient")
    ).toBeTruthy();
    expect(
      screen.queryByTestId("recipient-delivery-resolve-delivery-domain")
    ).toBeNull();

    const openLink = screen.getByTestId(
      "recipient-delivery-open-delivery-recipient"
    );
    openLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(openLink);
    await waitFor(() => {
      expect(markRead).toHaveBeenCalledWith({
        deliveryId: "delivery-recipient",
        workosOrganizationId: "org_production_foundation",
      });
    });

    fireEvent.click(
      screen.getByTestId("recipient-delivery-dismiss-delivery-domain")
    );
    fireEvent.click(
      screen.getByTestId("recipient-delivery-resolve-delivery-recipient")
    );

    await waitFor(() => {
      expect(dismiss).toHaveBeenCalledWith({
        deliveryId: "delivery-domain",
        workosOrganizationId: "org_production_foundation",
      });
      expect(resolve).toHaveBeenCalledWith({
        deliveryId: "delivery-recipient",
        workosOrganizationId: "org_production_foundation",
      });
    });

    expect(document.body.textContent).not.toMatch(
      /recipientWorkosUserId|payloadPreview|requestId|stack/i
    );
  });
});
