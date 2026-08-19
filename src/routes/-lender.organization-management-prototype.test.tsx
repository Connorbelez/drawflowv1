// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (path: string) =>
    (options: Record<string, unknown>) => ({
      ...options,
      fullPath: path,
      useSearch: () => ({ variant: "E" }),
    }),
  useNavigate: () => vi.fn(),
}));

import { Route } from "./lender.organization-management-prototype.tsx";

beforeAll(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => undefined,
    },
  });
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => false,
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    }),
  });
  class ResizeObserverStub {
    disconnect() {}
    observe() {}
    unobserve() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => cleanup());

describe("locked lender organization management Variant E route", () => {
  test("preserves the rendered locked member summary in prototype mode", () => {
    const Component = (Route as unknown as {
      component: () => React.ReactElement;
    }).component;
    render(<Component />);

    const summaryLabel = screen.getByText("Verified active members");
    expect(within(summaryLabel.parentElement!).getByText("1")).toBeTruthy();
    expect(screen.queryByText("Assigned members")).toBeNull();
    expect(screen.queryByText(/active · \d+ pending/)).toBeNull();
  });
});
