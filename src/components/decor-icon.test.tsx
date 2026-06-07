// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { DecorIcon } from "./decor-icon.tsx";

describe("DecorIcon", () => {
  test("keeps corner marks absolute and pins the shell junction to the sidebar boundary", () => {
    render(
      <>
        <DecorIcon data-testid="corner-mark" position="top-left" />
        <DecorIcon data-testid="junction-mark" position="junction" />
      </>
    );

    const cornerClassName =
      screen.getByTestId("corner-mark").getAttribute("class") ?? "";
    const junctionClassName =
      screen.getByTestId("junction-mark").getAttribute("class") ?? "";

    expect(cornerClassName).toContain("absolute");
    expect(junctionClassName).toContain("fixed");
    expect(junctionClassName).toContain("left-(--sidebar-width)");
    expect(junctionClassName).toContain(
      "group-data-[state=collapsed]/sidebar-wrapper:left-(--sidebar-width-icon)"
    );
    expect(junctionClassName).not.toContain("absolute");
  });
});
