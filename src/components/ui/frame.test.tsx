// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { Frame, FramePanel } from "./frame.tsx";

describe("Frame layout containment", () => {
  afterEach(cleanup);

  test("frame primitives can shrink around charts and wide content", () => {
    render(
      <Frame data-testid="frame">
        <FramePanel data-testid="panel">Content</FramePanel>
      </Frame>
    );

    expect(screen.getByTestId("frame").className).toContain("min-w-0");
    expect(screen.getByTestId("frame").className).toContain("max-w-full");
    expect(screen.getByTestId("panel").className).toContain("min-w-0");
    expect(screen.getByTestId("panel").className).toContain("max-w-full");
  });
});
