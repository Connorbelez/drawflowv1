// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { BUILD_DETAIL_TABS, BuildDetailTabBar } from "./BuildDetailTabs";

afterEach(() => cleanup());

function useCompactViewport() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      addEventListener: vi.fn(),
      matches: true,
      media: "(max-width: 767px)",
      removeEventListener: vi.fn(),
    })),
  });
}

describe("BuildDetailTabBar", () => {
  test("exposes one discoverable workspace section picker on compact screens", () => {
    useCompactViewport();
    const onChangeTab = vi.fn();
    const { rerender } = render(
      <BuildDetailTabBar activeTab="details" onChangeTab={onChangeTab} />,
    );

    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();

    const sectionPicker = screen.getByRole("combobox", {
      name: "Build workspace section",
    });
    expect((sectionPicker as HTMLSelectElement).value).toBe("details");
    expect(screen.getAllByRole("option")).toHaveLength(BUILD_DETAIL_TABS.length);
    expect(screen.getAllByRole("option", { name: "Timeline" })).toHaveLength(1);

    fireEvent.change(sectionPicker, { target: { value: "timeline" } });
    expect(onChangeTab).toHaveBeenCalledWith("timeline");

    rerender(
      <BuildDetailTabBar activeTab="timeline" onChangeTab={onChangeTab} />,
    );
    expect(
      (
        screen.getByRole("combobox", {
          name: "Build workspace section",
        }) as HTMLSelectElement
      ).value,
    ).toBe("timeline");
  });
});
