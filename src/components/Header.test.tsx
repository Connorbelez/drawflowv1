// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    reloadDocument: _reloadDocument,
    search: _search,
    to,
    ...props
  }: {
    children?: ReactNode;
    reloadDocument?: boolean;
    search?: unknown;
    to: string;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  linkOptions: <T,>(items: T) => items,
  useLocation: () => ({ pathname: "/" }),
}));

vi.mock("@workos/authkit-tanstack-react-start/client", () => ({
  useAuth: () => ({
    loading: false,
    user: null,
  }),
}));

vi.mock("./ThemeToggle", () => ({
  default: () => <button type="button">Theme</button>,
}));

import Header from "./Header";

afterEach(() => {
  cleanup();
});

describe("Header", () => {
  test("defaults to production onboarding navigation on the landing page", () => {
    render(<Header />);

    expect(
      screen.getByRole("link", { name: "Backoffice" }).getAttribute("href"),
    ).toBe("/backoffice");
    expect(
      screen.getByRole("link", { name: "Builder dashboard" }).getAttribute(
        "href",
      ),
    ).toBe("/builder");
    expect(
      screen.getByRole("link", { name: "Builder onboarding" }).getAttribute(
        "href",
      ),
    ).toBe("/builder/proposals/new");
    expect(
      screen.getByRole("link", { name: "Broker intake" }).getAttribute("href"),
    ).toBe("/backoffice/onboard-builder");
    expect(screen.getByRole("link", { name: "Start" }).getAttribute("href"))
      .toBe("/builder/proposals/new");
    expect(screen.queryByText("Demos")).toBeNull();
    expect(screen.queryByText("Convex")).toBeNull();
    expect(screen.queryByText("TanStack Query")).toBeNull();
  });

  test("keeps the demo navigation only on demo routes", () => {
    render(<Header mode="demo" />);

    expect(screen.getAllByText("Demos")).toHaveLength(2);
    expect(screen.getByText("Convex")).toBeTruthy();
    expect(screen.getByText("TanStack Query")).toBeTruthy();
    expect(screen.queryByText("Backoffice")).toBeNull();
    expect(screen.queryByText("Builder dashboard")).toBeNull();
    expect(screen.queryByText("Builder onboarding")).toBeNull();
    expect(screen.queryByText("Broker intake")).toBeNull();
  });

  test("opens a landing-only mobile navigation menu", async () => {
    render(<Header enableLandingMobileMenu />);

    const trigger = screen.getByRole("button", {
      name: "Open site navigation",
    });

    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog");
    const mobileNav = within(dialog).getByRole("navigation", {
      name: "Mobile site navigation",
    });

    expect(
      within(mobileNav).getByRole("link", { name: /about/i }).getAttribute(
        "href",
      ),
    ).toBe("/about");
    expect(
      within(mobileNav)
        .getByRole("link", { name: /builder dashboard/i })
        .getAttribute("href"),
    ).toBe("/builder");
    expect(
      within(mobileNav).getByRole("link", { name: /broker intake/i }).getAttribute(
        "href",
      ),
    ).toBe("/backoffice/onboard-builder");
  });
});
