// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
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
    expect(screen.queryByText("Builder onboarding")).toBeNull();
    expect(screen.queryByText("Broker intake")).toBeNull();
  });
});
