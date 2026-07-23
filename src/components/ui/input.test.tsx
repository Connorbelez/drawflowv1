// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { Input } from "./input.tsx";

describe("Input contrast states", () => {
  afterEach(cleanup);

  test("renders placeholder text at the full accessible muted color", () => {
    render(<Input aria-label="Decision reason" placeholder="Required reason" />);

    const input = screen.getByRole("textbox", { name: "Decision reason" });
    expect(input.className).toContain("placeholder:text-muted-foreground");
    expect(input.className).not.toContain(
      "placeholder:text-muted-foreground/72"
    );
  });
});
