// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { Textarea } from "./textarea.tsx";

describe("Textarea", () => {
  afterEach(cleanup);

  test("can shrink inside narrow grid and flex layouts", () => {
    render(<Textarea aria-label="Decision reason" />);

    const textarea = screen.getByRole("textbox", { name: "Decision reason" });
    expect(textarea.className).toContain("min-w-0");
    expect(textarea.parentElement?.className).toContain("min-w-0");
  });
});
