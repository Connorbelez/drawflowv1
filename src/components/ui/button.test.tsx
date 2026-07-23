// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { Button } from "./button.tsx";

describe("Button contrast states", () => {
  afterEach(cleanup);

  test("uses the semantic destructive text color on neutral surfaces", () => {
    render(<Button variant="destructive-outline">Remove assignment</Button>);

    const button = screen.getByRole("button", { name: "Remove assignment" });
    expect(button.className).toContain("text-destructive-text");
    expect(button.className).not.toContain("text-destructive-foreground");
  });
});
