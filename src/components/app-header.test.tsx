// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const notificationInboxProps = vi.hoisted(() => vi.fn());

vi.mock("@workos/authkit-tanstack-react-start/client", () => ({
  useAuth: () => ({
    loading: false,
    user: {
      email: "connor.belez@gmail.com",
      firstName: "Connor",
      lastName: "Beleznay",
      profilePictureUrl: "",
    },
  }),
}));

vi.mock("#/components/custom-sidebar-trigger.tsx", () => ({
  CustomSidebarTrigger: () => (
    <button aria-label="Toggle Sidebar" type="button" />
  ),
}));

vi.mock("#/components/nav-user.tsx", () => ({
  NavUser: ({ user }: { user: { email: string; name: string } }) => (
    <button type="button">{user.name || user.email}</button>
  ),
}));

vi.mock("#/components/notification-inbox.tsx", () => ({
  NotificationInbox: (props: {
    authReady?: boolean;
    workosOrganizationId?: string | null;
  }) => {
    notificationInboxProps(props);
    return <button aria-label="Notifications" type="button" />;
  },
}));

vi.mock("#/components/route-breadcrumbs.tsx", () => ({
  RouteBreadcrumbs: () => <nav aria-label="Breadcrumb">Backoffice</nav>,
}));

import { AppHeader } from "./app-header.tsx";

describe("AppHeader", () => {
  beforeEach(() => {
    notificationInboxProps.mockReset();
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => storage.clear(),
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => storage.delete(key),
        setItem: (key: string, value: string) => storage.set(key, value),
      },
      writable: true,
    });
    window.localStorage.clear();
    document.documentElement.classList.remove("light", "dark");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
      writable: true,
    });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.classList.remove("light", "dark");
  });

  test("renders touch-safe mobile header actions", async () => {
    render(<AppHeader workosOrganizationId="org_active" />);

    const themeSwitch = await screen.findByRole("button", {
      name: /theme mode: auto/i,
    });

    expect(themeSwitch.className).toContain("size-11");
    expect(themeSwitch.className).toContain("md:size-8");
    expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
    expect(notificationInboxProps).toHaveBeenCalledWith({
      authReady: true,
      workosOrganizationId: "org_active",
    });

    const header = screen.getByRole("banner");
    const [navigationGroup, accountGroup] = Array.from(header.children);
    expect(navigationGroup.className).toContain("min-w-0");
    expect(navigationGroup.className).toContain("flex-1");
    expect(navigationGroup.className).toContain("overflow-hidden");
    expect(accountGroup.className).toContain("shrink-0");

    fireEvent.click(themeSwitch);

    await waitFor(() => {
      expect(window.localStorage.getItem("theme")).toBe("light");
      expect(document.documentElement.classList.contains("light")).toBe(true);
    });
  });
});
