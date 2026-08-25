// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const markRead = vi.fn();
const dismiss = vi.fn();
const resolve = vi.fn();
const loadMore = vi.fn();
const useMutation = vi.fn();
const usePaginatedQuery = vi.fn();
const paginatedQueryArgs = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: (reference: unknown) => useMutation(reference),
  usePaginatedQuery: (
    reference: unknown,
    args: unknown,
    options: unknown
  ) => {
    paginatedQueryArgs(reference, args, options);
    return args === "skip"
      ? {
          isLoading: true,
          loadMore,
          results: [],
          status: "LoadingFirstPage",
        }
      : usePaginatedQuery(reference, args, options);
  },
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
    paginatedQueryArgs.mockClear();
    usePaginatedQuery.mockReturnValue({
      isLoading: false,
      loadMore,
      results: [recipientDelivery, domainDelivery],
      status: "Exhausted",
    });
  });

  afterEach(() => cleanup());

  test("skips the recipient query until AuthKit has a viewer", () => {
    render(
      <NotificationInbox
        authReady={false}
        workosOrganizationId="org_production_foundation"
      />
    );

    expect(paginatedQueryArgs).toHaveBeenCalledWith(
      expect.anything(),
      "skip",
      { initialNumItems: 100 }
    );
    expect(
      (screen.getByRole("button", { name: "Notifications" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  test("moves focus into the inbox and returns it to the trigger on close", async () => {
    render(
      <NotificationInbox workosOrganizationId="org_production_foundation" />
    );

    const trigger = screen.getByRole("button", {
      name: "Notifications, 2 unread",
    });
    expect(usePaginatedQuery).toHaveBeenCalledWith(
      expect.anything(),
      { workosOrganizationId: "org_production_foundation" },
      { initialNumItems: 100 }
    );
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  test("shows explicit loading, empty, and safe mutation error states", async () => {
    usePaginatedQuery.mockReturnValue({
      isLoading: true,
      loadMore,
      results: [],
      status: "LoadingFirstPage",
    });
    const loadingView = render(
      <NotificationInbox workosOrganizationId="org_production_foundation" />
    );
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("Loading notifications…")).toBeTruthy();
    loadingView.unmount();

    usePaginatedQuery.mockReturnValue({
      isLoading: false,
      loadMore,
      results: [],
      status: "Exhausted",
    });
    const emptyView = render(
      <NotificationInbox workosOrganizationId="org_production_foundation" />
    );
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("No notifications yet.")).toBeTruthy();
    emptyView.unmount();

    usePaginatedQuery.mockReturnValue({
      isLoading: false,
      loadMore,
      results: [recipientDelivery, domainDelivery],
      status: "Exhausted",
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
    expect(screen.getByText("2 actions required")).toBeTruthy();
    expect(screen.getByText("Milestone decision returned")).toBeTruthy();
    expect(screen.getByText("Builder Active Build · Foundation")).toBeTruthy();
    expect(screen.getAllByText("Lender Operations")).toHaveLength(2);
    expect(screen.getAllByText("Unread")).toHaveLength(2);

    expect(
      screen.getByTestId("recipient-delivery-resolve-delivery-recipient")
    ).toBeTruthy();
    expect(
      screen.queryByTestId("recipient-delivery-resolve-delivery-domain")
    ).toBeNull();

    const openLink = screen.getByTestId(
      "recipient-delivery-open-delivery-recipient"
    );
    expect(openLink.tagName).toBe("A");
    expect(openLink.textContent).toBe("Open build");
    expect(openLink.getAttribute("aria-label")).toBe(
      "Open build: Milestone decision returned"
    );
    expect(openLink.closest("article")?.dataset.slot).toBe("card");
    expect(
      screen.getByRole("button", {
        name: "Resolve Milestone decision returned",
      })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Dismiss Draw review required" })
    ).toBeTruthy();
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
    await waitFor(() => {
      expect(dismiss).toHaveBeenCalledWith({
        deliveryId: "delivery-domain",
        workosOrganizationId: "org_production_foundation",
      });
      expect(
        (
          screen.getByTestId(
            "recipient-delivery-resolve-delivery-recipient"
          ) as HTMLButtonElement
        ).disabled
      ).toBe(false);
    });

    fireEvent.click(
      screen.getByTestId("recipient-delivery-resolve-delivery-recipient")
    );
    await waitFor(() => {
      expect(resolve).toHaveBeenCalledWith({
        deliveryId: "delivery-recipient",
        workosOrganizationId: "org_production_foundation",
      });
    });

    expect(document.body.textContent).not.toMatch(
      /recipientWorkosUserId|payloadPreview|requestId|stack/i
    );
  });

  test("prevents duplicate delivery actions while a mutation is pending", async () => {
    let finishResolve: (() => void) | undefined;
    resolve.mockImplementationOnce(
      () =>
        new Promise<void>((complete) => {
          finishResolve = complete;
        })
    );
    render(
      <NotificationInbox workosOrganizationId="org_production_foundation" />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Notifications, 2 unread" })
    );

    const resolveButton = await screen.findByRole("button", {
      name: "Resolve Milestone decision returned",
    });
    fireEvent.click(resolveButton);
    fireEvent.click(resolveButton);

    await waitFor(() => {
      expect(resolve).toHaveBeenCalledTimes(1);
      expect((resolveButton as HTMLButtonElement).disabled).toBe(true);
      expect(
        (
          screen.getByRole("button", {
            name: "Dismiss Draw review required",
          }) as HTMLButtonElement
        ).disabled
      ).toBe(true);
    });

    finishResolve?.();
    await waitFor(() =>
      expect((resolveButton as HTMLButtonElement).disabled).toBe(false)
    );
  });

  test("uses singular action-count copy", async () => {
    usePaginatedQuery.mockReturnValue({
      isLoading: false,
      loadMore,
      results: [recipientDelivery],
      status: "Exhausted",
    });
    render(
      <NotificationInbox workosOrganizationId="org_production_foundation" />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Notifications, 1 unread" })
    );

    expect(await screen.findByText("1 action required")).toBeTruthy();
  });

  test("continues through raw pages until notification counts are complete", async () => {
    usePaginatedQuery.mockReturnValue({
      isLoading: false,
      loadMore,
      results: [],
      status: "CanLoadMore",
    });
    render(
      <NotificationInbox workosOrganizationId="org_production_foundation" />
    );
    expect(loadMore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    await waitFor(() => expect(loadMore).toHaveBeenCalledWith(100));
    expect(screen.getByText("Counting actions…")).toBeTruthy();
  });
});
